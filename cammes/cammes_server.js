#!/usr/bin/env node
/**
 * CAMMES Server Unificato
 *
 * Sostituisce cammes_server.exe + serve.js in un unico processo:
 *  1. HTTP Statico  (porta 3000) - Serve i file frontend
 *  2. WebSocket     (porta 8080) - Bridge browser <-> Arduino
 *  3. Seriale       (auto-detect COM, 9600 baud) - Comunicazione Arduino
 *  4. File saving   - Salva misure su disco (cartella prove/)
 *
 * Uso: node cammes_server.js [--port 3000] [--ws-port 8080] [--com COMx] [--no-browser]
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var WebSocket = require('ws');
var { exec } = require('child_process');

// ============================================================
// Configurazione
// ============================================================

var HTTP_PORT = 3000;
var WS_PORT = 8080;
var SERIAL_BAUD = 9600;
var SERIAL_COM = null;    // null = auto-detect
var OPEN_BROWSER = true;

// Parse argomenti command line
var args = process.argv.slice(2);
for (var a = 0; a < args.length; a++) {
    if (args[a] === '--port' && args[a + 1]) { HTTP_PORT = parseInt(args[a + 1]); a++; }
    if (args[a] === '--ws-port' && args[a + 1]) { WS_PORT = parseInt(args[a + 1]); a++; }
    if (args[a] === '--com' && args[a + 1]) { SERIAL_COM = args[a + 1]; a++; }
    if (args[a] === '--no-browser') { OPEN_BROWSER = false; }
}

// Directory dei file statici (dove si trova questo script)
// Quando compilato con pkg: __dirname e' nel filesystem virtuale (snapshot) dove sono embeddati i file
var STATIC_DIR = __dirname;

// Directory reale dell'exe (per salvare file su disco, non nel snapshot)
var REAL_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

// Directory per salvare i file di misura (sempre su disco reale)
var PROVE_DIR = path.join(REAL_DIR, 'prove');

// ============================================================
// Utility - Log con timestamp
// ============================================================

function log(tag, msg) {
    var now = new Date().toLocaleTimeString('it-IT');
    console.log('[' + now + '] [' + tag + '] ' + msg);
}

// ============================================================
// 1. HTTP Server Statico (porta 3000)
// ============================================================

var mimeTypes = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':  'font/ttf'
};

var httpServer = http.createServer(function (req, res) {
    // Route default: / -> alzata.html
    var urlPath = req.url.split('?')[0]; // Rimuovi query string
    var filePath = path.join(STATIC_DIR, urlPath === '/' ? 'alzata.html' : urlPath);

    // Sicurezza: impedisci path traversal
    var resolved = path.resolve(filePath);
    if (resolved.indexOf(path.resolve(STATIC_DIR)) !== 0) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    var ext = path.extname(filePath).toLowerCase();
    var contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, function (err, data) {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not found: ' + urlPath);
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

httpServer.listen(HTTP_PORT, function () {
    log('HTTP', 'Server statico avviato su http://localhost:' + HTTP_PORT);
    log('HTTP', 'Directory: ' + STATIC_DIR);
});

// ============================================================
// 2. WebSocket Server (porta 8080)
// ============================================================

var wsServer = new WebSocket.Server({ port: WS_PORT }, function () {
    log('WS', 'WebSocket server avviato su ws://localhost:' + WS_PORT);
});

// Tutti i client WebSocket connessi
var wsClients = [];

wsServer.on('connection', function (ws) {
    wsClients.push(ws);
    log('WS', 'Client connesso (' + wsClients.length + ' totali)');

    ws.on('message', function (data) {
        var msg = data.toString();

        // Controlla se e' un comando di salvataggio file
        if (msg.charAt(0) === '*') {
            handleFileSave(msg);
            return;
        }

        // Altrimenti e' un comando per Arduino - invia sulla seriale
        if (serialPort && serialPort.isOpen) {
            serialPort.write(msg, function (err) {
                if (err) {
                    log('SERIAL', 'Errore invio: ' + err.message);
                }
            });
            log('CMD', 'Browser -> Arduino: "' + msg + '"');
        } else {
            log('CMD', 'Comando ricevuto (no serial): "' + msg + '"');
        }
    });

    ws.on('close', function () {
        wsClients = wsClients.filter(function (c) { return c !== ws; });
        log('WS', 'Client disconnesso (' + wsClients.length + ' rimasti)');
    });

    ws.on('error', function (err) {
        log('WS', 'Errore client: ' + err.message);
    });
});

// Broadcast: invia a tutti i client WebSocket
function wsBroadcast(msg) {
    wsClients.forEach(function (client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// ============================================================
// 3. Salvataggio file misure
// ============================================================

function handleFileSave(msg) {
    // Formato: *filename*_pline\r\n<CSV data>
    // Estrai il nome file tra i due asterischi
    var firstStar = msg.indexOf('*');
    var secondStar = msg.indexOf('*', firstStar + 1);

    if (firstStar === -1 || secondStar === -1) {
        log('FILE', 'Formato non valido per salvataggio');
        return;
    }

    var fileName = msg.substring(firstStar + 1, secondStar);
    var fileData = msg.substring(secondStar + 1);

    // Crea la cartella prove/ se non esiste
    if (!fs.existsSync(PROVE_DIR)) {
        fs.mkdirSync(PROVE_DIR, { recursive: true });
        log('FILE', 'Creata cartella: ' + PROVE_DIR);
    }

    // Salva il file
    var filePath = path.join(PROVE_DIR, fileName + '.scr');
    fs.writeFile(filePath, fileData, function (err) {
        if (err) {
            log('FILE', 'Errore salvataggio: ' + err.message);
        } else {
            log('FILE', 'Salvato: ' + filePath);
        }
    });
}

// ============================================================
// 4. Comunicazione seriale con Arduino
// ============================================================

var serialPort = null;
var SerialPort = null;
var serialApiVersion = 'none'; // 'legacy' (v7-v8), 'v9' (v9), 'modern' (v10+), 'none'

// Tenta di caricare il modulo serialport da vari percorsi
// Quando compilato con pkg, __dirname punta al filesystem virtuale (snapshot)
// ma i moduli nativi (.node) devono essere nella cartella reale dell'exe
var EXE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

function loadSerialPort() {
    var paths = [
        'serialport',                                                    // node_modules locale (dev)
        path.join(EXE_DIR, 'node_modules', 'serialport'),              // node_modules accanto all'exe
        path.join(__dirname, '..', 'node_modules', 'serialport'),      // node_modules root progetto
    ];

    for (var i = 0; i < paths.length; i++) {
        try {
            var mod = require(paths[i]);
            // serialport v10+ esporta { SerialPort }
            if (mod.SerialPort) {
                SerialPort = mod.SerialPort;
                serialApiVersion = 'modern';
                log('SERIAL', 'Modulo serialport (v10+) caricato da: ' + paths[i]);
                return;
            }
            // serialport v7-v9: il modulo stesso e\' il costruttore
            if (typeof mod === 'function') {
                SerialPort = mod;
                serialApiVersion = 'legacy';
                log('SERIAL', 'Modulo serialport (legacy) caricato da: ' + paths[i]);
                return;
            }
        } catch (e) {
            // Prova il prossimo percorso
        }
    }

    log('SERIAL', 'Modulo serialport non trovato - modalita\' demo (senza Arduino)');
    if (process.pkg) {
        log('SERIAL', 'Per abilitare: copiare node_modules/ accanto a cammes.exe');
    } else {
        log('SERIAL', 'Per abilitare: npm install serialport');
    }
}

loadSerialPort();

function initSerial() {
    if (!SerialPort) return;

    if (SERIAL_COM) {
        // Porta COM specificata manualmente
        openSerialPort(SERIAL_COM);
    } else {
        // Auto-detect: cerca porte COM disponibili
        autoDetectSerial();
    }
}

function autoDetectSerial() {
    if (!SerialPort) return;

    // Usa il metodo list() per trovare le porte
    var listFn = SerialPort.list;
    if (!listFn) {
        log('SERIAL', 'Impossibile elencare porte COM');
        return;
    }

    listFn().then(function (ports) {
        if (ports.length === 0) {
            log('SERIAL', 'Nessuna porta COM trovata - modalita\' demo');
            return;
        }

        log('SERIAL', 'Porte COM trovate:');
        ports.forEach(function (p) {
            var portName = p.path || p.comName; // v7 usa comName, v9+ usa path
            log('SERIAL', '  ' + portName + ' - ' + (p.manufacturer || 'sconosciuto'));
        });

        // Cerca Arduino (manufacturer contiene "Arduino" o "wch" per cloni CH340)
        var arduinoPort = null;
        for (var i = 0; i < ports.length; i++) {
            var mfg = (ports[i].manufacturer || '').toLowerCase();
            if (mfg.indexOf('arduino') !== -1 || mfg.indexOf('wch') !== -1 || mfg.indexOf('ftdi') !== -1) {
                arduinoPort = ports[i].path || ports[i].comName;
                break;
            }
        }

        if (!arduinoPort && ports.length > 0) {
            // Se non trova Arduino specifico, prova l'ultima porta COM
            var lastPort = ports[ports.length - 1];
            arduinoPort = lastPort.path || lastPort.comName;
            log('SERIAL', 'Arduino non identificato, uso ultima porta: ' + arduinoPort);
        }

        if (arduinoPort) {
            openSerialPort(arduinoPort);
        }
    }).catch(function (err) {
        log('SERIAL', 'Errore elencando porte: ' + err.message);
    });
}

function openSerialPort(comPort) {
    try {
        // API varia in base alla versione di serialport
        if (serialApiVersion === 'modern') {
            // v10+: new SerialPort({ path, baudRate })
            serialPort = new SerialPort({
                path: comPort,
                baudRate: SERIAL_BAUD,
                dataBits: 8,
                parity: 'none',
                stopBits: 1
            });
        } else {
            // v7-v9 legacy: new SerialPort(path, { baudRate })
            serialPort = new SerialPort(comPort, {
                baudRate: SERIAL_BAUD,
                dataBits: 8,
                parity: 'none',
                stopBits: 1
            });
        }

        // Buffer per assemblare i messaggi ricevuti
        var serialBuffer = '';

        serialPort.on('open', function () {
            log('SERIAL', 'Connesso a ' + comPort + ' @ ' + SERIAL_BAUD + ' baud');
        });

        serialPort.on('data', function (data) {
            // I dati arrivano a pezzi, assembla i messaggi completi
            serialBuffer += data.toString();

            // Processa ogni riga completa (terminata da \n o \r\n)
            var lines = serialBuffer.split(/\r?\n/);

            // L'ultimo elemento potrebbe essere incompleto
            serialBuffer = lines.pop();

            lines.forEach(function (line) {
                line = line.trim();
                if (line.length > 0) {
                    // Invia al browser via WebSocket
                    wsBroadcast(line);
                    log('DATA', 'Arduino -> Browser: "' + line + '"');
                }
            });
        });

        serialPort.on('error', function (err) {
            log('SERIAL', 'Errore: ' + err.message);
        });

        serialPort.on('close', function () {
            log('SERIAL', 'Porta chiusa');
            serialPort = null;

            // Tenta riconnessione dopo 3 secondi
            setTimeout(function () {
                log('SERIAL', 'Tentativo riconnessione...');
                autoDetectSerial();
            }, 3000);
        });

    } catch (err) {
        log('SERIAL', 'Errore apertura porta ' + comPort + ': ' + err.message);
    }
}

// Avvia la seriale
initSerial();

// ============================================================
// 5. Apertura automatica del browser
// ============================================================

if (OPEN_BROWSER) {
    setTimeout(function () {
        var url = 'http://localhost:' + HTTP_PORT;
        var cmd;

        if (process.platform === 'win32') {
            cmd = 'start ' + url;
        } else if (process.platform === 'darwin') {
            cmd = 'open ' + url;
        } else {
            cmd = 'xdg-open ' + url;
        }

        exec(cmd, function (err) {
            if (err) {
                log('BROWSER', 'Impossibile aprire il browser: ' + err.message);
                log('BROWSER', 'Apri manualmente: ' + url);
            } else {
                log('BROWSER', 'Aperto ' + url);
            }
        });
    }, 500);
}

// ============================================================
// 6. Shutdown pulito
// ============================================================

process.on('SIGINT', function () {
    log('SERVER', 'Arresto in corso...');

    if (serialPort && serialPort.isOpen) {
        serialPort.close();
    }

    wsServer.close();
    httpServer.close();

    log('SERVER', 'Server arrestato.');
    process.exit(0);
});

// Banner di avvio
log('SERVER', '========================================');
log('SERVER', '  CAMMES Server Unificato v1.0.0');
log('SERVER', '  HTTP:   http://localhost:' + HTTP_PORT);
log('SERVER', '  WS:     ws://localhost:' + WS_PORT);
log('SERVER', '  Serial: ' + (SERIAL_COM || 'auto-detect'));
log('SERVER', '========================================');
