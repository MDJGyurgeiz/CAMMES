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
var https = require('https');
var os = require('os');
var fs = require('fs');
var path = require('path');
var WebSocket = require('ws');
var { exec, spawn } = require('child_process');

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

// Versione dell'app (unica fonte: package.json, incluso nello snapshot pkg)
var APP_VERSION = '0.0.0';
try { APP_VERSION = require(path.join(__dirname, 'package.json')).version; } catch (e) {}

// Repo GitHub pubblico per il controllo aggiornamenti
var UPDATE_REPO = 'MDJGyurgeiz/CAMMES';

// ============================================================
// Utility - Log strutturato con livelli + colori ANSI
// ============================================================

// I livelli di log emessi. Per silenziare un canale (es. CMD verboso),
// imposta in env LOG_LEVEL=info (default) o warn / error / debug.
var LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
var LOG_THRESHOLD = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.info;

// Colori ANSI (no-op se stdout non è TTY)
var ANSI = process.stdout.isTTY ? {
    reset: '\x1b[0m', dim: '\x1b[2m',
    blue:  '\x1b[34m', green: '\x1b[32m',
    yellow: '\x1b[33m', red:  '\x1b[31m',
    cyan:  '\x1b[36m'
} : { reset: '', dim: '', blue: '', green: '', yellow: '', red: '', cyan: '' };

function logAt(level, tag, msg) {
    if ((LOG_LEVELS[level] || 0) < LOG_THRESHOLD) return;
    var now = new Date().toLocaleTimeString('it-IT');
    var colorByTag = {
        HTTP: ANSI.blue, WS: ANSI.cyan, SERIAL: ANSI.green,
        CMD:  ANSI.dim,  FILE: ANSI.yellow, API:  ANSI.cyan
    };
    var colorByLevel = {
        debug: ANSI.dim, info: '', warn: ANSI.yellow, error: ANSI.red
    };
    var tagColor = colorByTag[tag] || '';
    var lvlColor = colorByLevel[level] || '';
    console.log(ANSI.dim + '[' + now + ']' + ANSI.reset +
                ' ' + tagColor + '[' + tag + ']' + ANSI.reset +
                ' ' + lvlColor + msg + ANSI.reset);
}

function log(tag, msg)      { logAt('info',  tag, msg); }
log.debug = function(t, m)  { logAt('debug', t, m); };
log.info  = function(t, m)  { logAt('info',  t, m); };
log.warn  = function(t, m)  { logAt('warn',  t, m); };
log.error = function(t, m)  { logAt('error', t, m); };

// ============================================================
// Utility - validazione nome file (whitelist sicura)
// ============================================================

// Usata sia da save WS che da API GET/DELETE. Whitelist conservativa:
// solo lettere/numeri/underscore/dash/punto, lunghezza max 120 char,
// niente '..' anche come substring.
function isSafeFilename(name) {
    return typeof name === 'string'
        && name.length > 0 && name.length <= 120
        && /^[A-Za-z0-9._-]+$/.test(name)
        && name.indexOf('..') === -1;
}

// ============================================================
// Utility - JSON response standard
// ============================================================

function sendJson(res, code, obj) {
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
}

// ============================================================
// Utility - lista dei file misurazione su disco (cartella prove/)
// Ritorna: [{ name, type:'alz'|'pol'|'other', size, mtime }, ...]
// Ordinato per mtime DESC.
// ============================================================

function listMisureFiles(cb) {
    fs.readdir(PROVE_DIR, function (err, files) {
        if (err) {
            // Cartella non esiste ancora → lista vuota, non errore
            if (err.code === 'ENOENT') return cb(null, []);
            return cb(err);
        }
        var results = [];
        var pending = files.length;
        if (pending === 0) return cb(null, []);
        files.forEach(function (f) {
            fs.stat(path.join(PROVE_DIR, f), function (e, st) {
                if (!e && st.isFile()) {
                    // Inferisci tipo dal suffisso _alz / _pol prima dell'estensione
                    var base = f.replace(/\.(scr|txt|csv)$/i, '');
                    var lower = base.toLowerCase();
                    var type = lower.endsWith('_alz') ? 'alz'
                             : lower.endsWith('_pol') ? 'pol'
                             : 'other';
                    results.push({
                        name:  f,
                        type:  type,
                        size:  st.size,
                        mtime: st.mtimeMs
                    });
                }
                if (--pending === 0) {
                    results.sort(function (a, b) { return b.mtime - a.mtime; });
                    cb(null, results);
                }
            });
        });
    });
}

// ============================================================
// Update check (GitHub Releases) + flash firmware Arduino
// ============================================================

// Confronto versioni "3.1.0" vs "3.0.0" → 1 / 0 / -1 (parti mancanti = 0)
function compareVersions(a, b) {
    var pa = String(a).replace(/^v/i, '').split('.');
    var pb = String(b).replace(/^v/i, '').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
        var na = parseInt(pa[i], 10) || 0, nb = parseInt(pb[i], 10) || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

// Cache 1h: il rate limit GitHub senza token è 60 richieste/ora per IP.
var _updateCache = null;
function apiUpdateCheck(res) {
    if (_updateCache && (Date.now() - _updateCache.ts) < 3600 * 1000) {
        return sendJson(res, 200, _updateCache.data);
    }
    var req = https.get({
        hostname: 'api.github.com',
        path: '/repos/' + UPDATE_REPO + '/releases/latest',
        headers: { 'User-Agent': 'CAMMES-updater', 'Accept': 'application/vnd.github+json' },
        timeout: 8000
    }, function (r) {
        var body = '';
        r.on('data', function (c) { body += c; if (body.length > 500000) r.destroy(); });
        r.on('end', function () {
            try {
                var rel = JSON.parse(body);
                if (r.statusCode !== 200 || !rel.tag_name) {
                    return sendJson(res, 502, { error: 'GitHub ha risposto ' + r.statusCode, current: APP_VERSION });
                }
                var latest = String(rel.tag_name).replace(/^v/i, '');
                var data = {
                    current: APP_VERSION,
                    latest: latest,
                    updateAvailable: compareVersions(latest, APP_VERSION) > 0,
                    name: rel.name || rel.tag_name,
                    url: rel.html_url,
                    publishedAt: rel.published_at,
                    notes: String(rel.body || '').substring(0, 2000)
                };
                _updateCache = { ts: Date.now(), data: data };
                log('API', 'update-check: installata ' + APP_VERSION + ', ultima ' + latest +
                    (data.updateAvailable ? ' → AGGIORNAMENTO DISPONIBILE' : ' (aggiornato)'));
                sendJson(res, 200, data);
            } catch (e) {
                sendJson(res, 502, { error: 'Risposta GitHub non valida: ' + e.message, current: APP_VERSION });
            }
        });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', function (e) {
        sendJson(res, 502, { error: 'GitHub non raggiungibile: ' + e.message, current: APP_VERSION });
    });
}

// --- Firmware Arduino: hex + avrdude inclusi in fw/ --------------------
// Sotto pkg i file dello snapshot non sono eseguibili/leggibili da avrdude:
// vengono estratti in una cartella temporanea reale al primo flash.

var FW_DIR = path.join(STATIC_DIR, 'fw');
var flashInProgress = false;

function readFwInfo() {
    try { return JSON.parse(fs.readFileSync(path.join(FW_DIR, 'version.json'), 'utf8')); }
    catch (e) { return null; }
}

// Materializza un file dello snapshot pkg (o della cartella dev) su disco
// reale. In dev il file è già reale: si riusa direttamente.
function materializeFwFile(name, destDir) {
    var src = path.join(FW_DIR, name);
    if (!process.pkg) return src;
    var dest = path.join(destDir, name);
    fs.writeFileSync(dest, fs.readFileSync(src));
    return dest;
}

// Trova avrdude: prima quello in fw/, poi l'installazione Arduino15 locale
// (fallback utile se un filtro tipo WDAC blocca la copia estratta).
function resolveAvrdude(tmpDir) {
    var candidates = [];
    try {
        var exe = materializeFwFile('avrdude.exe', tmpDir);
        var conf = materializeFwFile('avrdude.conf', tmpDir);
        if (fs.existsSync(exe) && fs.existsSync(conf)) candidates.push({ exe: exe, conf: conf, source: 'fw/' });
    } catch (e) {}
    try {
        var base = path.join(process.env.LOCALAPPDATA || '', 'Arduino15', 'packages', 'arduino', 'tools', 'avrdude');
        fs.readdirSync(base).forEach(function (v) {
            var exe2 = path.join(base, v, 'bin', 'avrdude.exe');
            var conf2 = path.join(base, v, 'etc', 'avrdude.conf');
            if (fs.existsSync(exe2) && fs.existsSync(conf2)) candidates.push({ exe: exe2, conf: conf2, source: 'Arduino15/' + v });
        });
    } catch (e) {}
    return candidates;
}

function currentSerialPath() {
    if (serialPort && serialPort.path) return serialPort.path;
    return lastComPort || SERIAL_COM || null;
}

function apiFlashFirmware(res) {
    if (flashInProgress) return sendJson(res, 409, { error: 'Flash già in corso' });
    var info = readFwInfo();
    if (!info || !fs.existsSync(path.join(FW_DIR, 'master.ino.hex'))) {
        return sendJson(res, 500, { error: 'Firmware non incluso in questa build (manca fw/master.ino.hex)' });
    }
    var port = currentSerialPath();
    if (!port) {
        return sendJson(res, 400, { error: 'Nessuna porta Arduino nota: collega l\'Arduino e riprova' });
    }

    flashInProgress = true;
    log('FLASH', 'Avvio flash firmware ' + (info.firmware || '?') + ' su ' + port);

    var tmpDir = path.join(os.tmpdir(), 'cammes-fw');
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) {}

    var hexPath, tools;
    try {
        hexPath = materializeFwFile('master.ino.hex', tmpDir);
        tools = resolveAvrdude(tmpDir);
    } catch (e) {
        flashInProgress = false;
        return sendJson(res, 500, { error: 'Estrazione firmware fallita: ' + e.message });
    }
    if (!tools.length) {
        flashInProgress = false;
        return sendJson(res, 500, { error: 'avrdude non trovato (né in fw/ né in Arduino15)' });
    }

    // Chiudi la seriale (il bootloader va parlato da avrdude, in esclusiva).
    // flashInProgress sospende l'auto-riconnessione hot-plug.
    var proceed = function () { runAvrdude(res, tools, 0, port, hexPath, Date.now()); };
    if (serialPort && serialPort.isOpen) {
        serialPort.close(function () { setTimeout(proceed, 500); });
    } else {
        proceed();
    }
}

function runAvrdude(res, tools, idx, port, hexPath, t0) {
    var tool = tools[idx];
    var args = ['-C', tool.conf, '-c', 'arduino', '-p', 'atmega328p',
                '-P', port, '-b', '115200', '-D', '-U', 'flash:w:' + hexPath + ':i'];
    log('FLASH', 'avrdude (' + tool.source + ') ' + args.join(' '));
    var out = '';
    var child;
    try {
        child = spawn(tool.exe, args, { windowsHide: true });
    } catch (e) {
        return avrdudeDone(res, tools, idx, port, hexPath, t0, -1, out + '\nspawn: ' + e.message);
    }
    var killer = setTimeout(function () { try { child.kill(); } catch (e) {} }, 90000);
    child.stdout.on('data', function (d) { out += d; if (out.length > 200000) out = out.slice(-100000); });
    child.stderr.on('data', function (d) { out += d; if (out.length > 200000) out = out.slice(-100000); });
    child.on('error', function (e) {
        clearTimeout(killer);
        avrdudeDone(res, tools, idx, port, hexPath, t0, -1, out + '\nerrore: ' + e.message);
    });
    child.on('close', function (code) {
        clearTimeout(killer);
        avrdudeDone(res, tools, idx, port, hexPath, t0, code, out);
    });
}

function avrdudeDone(res, tools, idx, port, hexPath, t0, code, out) {
    var ok = code === 0 && /bytes of flash (written|verified)/i.test(out);
    if (!ok && idx + 1 < tools.length) {
        log.warn('FLASH', 'Tentativo con ' + tools[idx].source + ' fallito (exit ' + code + '), provo ' + tools[idx + 1].source);
        return runAvrdude(res, tools, idx + 1, port, hexPath, t0);
    }
    flashInProgress = false;
    var ms = Date.now() - t0;
    if (ok) log('FLASH', 'Firmware scritto e verificato in ' + (ms / 1000).toFixed(1) + 's');
    else log.error('FLASH', 'Flash fallito (exit ' + code + ')');
    // Riapri la seriale in ogni caso (il firmware v3 fa boot in ~2 s)
    setTimeout(function () { if (!serialPort) autoDetectSerial(); }, 2000);
    sendJson(res, ok ? 200 : 500, {
        ok: ok,
        exitCode: code,
        durationMs: ms,
        port: port,
        tool: tools[Math.min(idx, tools.length - 1)].source,
        output: String(out).slice(-3000)
    });
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
    var urlPath = req.url.split('?')[0]; // Rimuovi query string

    // API: controllo aggiornamenti software (GitHub Releases, cache 1h)
    if (urlPath === '/api/update-check') {
        apiUpdateCheck(res);
        return;
    }

    // API: info firmware incluso nella build + stato collegamento
    if (urlPath === '/api/firmware-info') {
        var fwInfo = readFwInfo();
        sendJson(res, 200, {
            bundled: fwInfo,
            appVersion: APP_VERSION,
            port: currentSerialPath(),
            serialConnected: !!(serialPort && serialPort.isOpen),
            flashInProgress: flashInProgress,
            avrdudeSources: resolveAvrdude(path.join(os.tmpdir(), 'cammes-fw-probe')).map(function (t) { return t.source; })
        });
        return;
    }

    // API: flash del firmware incluso sull'Arduino collegato
    if (urlPath === '/api/flash-firmware' && req.method === 'POST') {
        apiFlashFirmware(res);
        return;
    }

    // API: lista file misure (JSON)
    if (urlPath === '/api/files') {
        listMisureFiles(function (err, files) {
            res.setHeader('Cache-Control', 'no-store');
            res.writeHead(err ? 500 : 200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(err ? { error: err.message } : { files: files }));
        });
        return;
    }

    // API: download (GET) o delete (DELETE) di un file misura specifico
    if (urlPath.indexOf('/api/file/') === 0) {
        var fname = decodeURIComponent(urlPath.substring('/api/file/'.length));
        if (!isSafeFilename(fname)) {
            return sendJson(res, 400, { error: 'Nome file non valido', name: fname });
        }
        var fpath = path.join(PROVE_DIR, fname);
        var resolved = path.resolve(fpath);
        if (resolved.indexOf(path.resolve(PROVE_DIR)) !== 0) {
            return sendJson(res, 403, { error: 'Path traversal rifiutato' });
        }

        // POST/PUT: salva un file misura (.scr) in prove/. Usato dall'export
        // "Salva profilo" dell'analisi (grezzo o curva follower già convertita).
        if (req.method === 'POST' || req.method === 'PUT') {
            if (!/\.scr$/i.test(fname)) {
                return sendJson(res, 400, { error: 'Salvataggio consentito solo per file .scr' });
            }
            var body = '';
            req.on('data', function (chunk) {
                body += chunk;
                if (body.length > 2000000) { req.destroy(); }   // cap 2 MB di sicurezza
            });
            req.on('end', function () {
                fs.mkdir(PROVE_DIR, { recursive: true }, function () {
                    fs.writeFile(fpath, body, function (err) {
                        if (err) {
                            log('API', 'POST save errore: ' + err.message);
                            return sendJson(res, 500, { error: 'Errore salvataggio', detail: err.message });
                        }
                        log('API', 'POST save ok: ' + fname + ' (' + body.length + ' B)');
                        sendJson(res, 200, { ok: true, saved: fname });
                    });
                });
            });
            return;
        }

        if (req.method === 'DELETE') {
            fs.unlink(fpath, function (err) {
                if (err) {
                    if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'File non trovato', name: fname });
                    log('API', 'DELETE errore: ' + err.message);
                    return sendJson(res, 500, { error: 'Errore eliminazione', detail: err.message });
                }
                log('API', 'DELETE ok: ' + fname);
                sendJson(res, 200, { ok: true, deleted: fname });
            });
            return;
        }

        // Default: GET = download
        fs.readFile(fpath, function (err, data) {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    return res.end('Not found');
                }
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end('Server error');
            }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    // Route default: / -> home.html
    var filePath = path.join(STATIC_DIR, urlPath === '/' ? 'home.html' : urlPath);

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
                    log.error('SERIAL', 'Errore invio: ' + err.message);
                }
            });
            log.debug('CMD', 'Browser -> Arduino: "' + msg + '"');
        } else {
            log.debug('CMD', 'Comando ricevuto (no serial): "' + msg + '"');
        }
    });

    ws.on('close', function () {
        wsClients = wsClients.filter(function (c) { return c !== ws; });
        log('WS', 'Client disconnesso (' + wsClients.length + ' rimasti)');
    });

    ws.on('error', function (err) {
        log.warn('WS', 'Errore client: ' + err.message);
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

    if (!isSafeFilename(fileName)) {
        log.warn('FILE', 'Nome file rifiutato (security): "' + String(fileName).substring(0,40) + '"');
        return;
    }

    // Crea la cartella prove/ se non esiste
    if (!fs.existsSync(PROVE_DIR)) {
        fs.mkdirSync(PROVE_DIR, { recursive: true });
        log('FILE', 'Creata cartella: ' + PROVE_DIR);
    }

    // Salva il file (path.join + verifica resolved per safety extra)
    var filePath = path.join(PROVE_DIR, fileName + '.scr');
    var resolved = path.resolve(filePath);
    if (resolved.indexOf(path.resolve(PROVE_DIR)) !== 0) {
        log.warn('FILE', 'Path traversal tentato, rifiutato: ' + resolved);
        return;
    }
    fs.writeFile(filePath, fileData, function (err) {
        if (err) {
            log.error('FILE', 'Errore salvataggio: ' + err.message);
        } else {
            log('FILE', 'Salvato: ' + path.basename(filePath));
        }
    });
}

// ============================================================
// 4. Comunicazione seriale con Arduino
// ============================================================

var serialPort = null;
var SerialPort = null;
var lastComPort = null;        // ultima porta aperta con successo (per il flash firmware)
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

// HOT-PLUG: se all'avvio non c'è nessun Arduino (o l'apertura fallisce),
// riprova ogni 5 s finché non compare. Così si può avviare il programma
// PRIMA di collegare l'USB, senza dover riavviare.
var _serialRetryTimer = null;
var _serialRetryLogged = false;
function scheduleSerialRetry() {
    if (_serialRetryTimer) return;
    if (!_serialRetryLogged) {
        log('SERIAL', 'In attesa di un Arduino: ricontrollo le porte ogni 5s (hot-plug)');
        _serialRetryLogged = true;
    }
    _serialRetryTimer = setTimeout(function () {
        _serialRetryTimer = null;
        if (!serialPort) autoDetectSerial();
    }, 5000);
}

function autoDetectSerial() {
    if (!SerialPort) return;
    if (serialPort) return;   // già connessi
    if (flashInProgress) return;   // avrdude sta usando la porta: non toccarla

    // Usa il metodo list() per trovare le porte
    var listFn = SerialPort.list;
    if (!listFn) {
        log('SERIAL', 'Impossibile elencare porte COM');
        return;
    }

    listFn().then(function (ports) {
        if (ports.length === 0) {
            scheduleSerialRetry();
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
        } else {
            scheduleSerialRetry();
        }
    }).catch(function (err) {
        log.error('SERIAL', 'Errore elencando porte: ' + err.message);
        scheduleSerialRetry();
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

        // KEEP-ALIVE RX (workaround FTDI): su alcuni PC il latency timer del
        // convertitore USB-seriale non scatta e i byte RICEVUTI restano nel
        // chip finché il buffer non si riempie o finché l'host non TRASMETTE
        // qualcosa (verificato al banco: risposte consegnate solo al kick di
        // TX, ritardi di 30-50 s nel handshake di scansione). Un '\n' ogni
        // 100 ms scarica il buffer; il firmware ignora le righe vuote.
        var _kickTimer = setInterval(function () {
            try { if (serialPort && serialPort.isOpen) serialPort.write('\n'); } catch (e) {}
        }, 100);

        serialPort.on('open', function () {
            log('SERIAL', 'Connesso a ' + comPort + ' @ ' + SERIAL_BAUD + ' baud (keep-alive RX attivo)');
            lastComPort = comPort;        // memorizza per il flash firmware
            _serialRetryLogged = false;   // prossima attesa hot-plug loggata di nuovo
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
            log.error('SERIAL', 'Errore: ' + err.message);
        });

        serialPort.on('close', function () {
            log('SERIAL', 'Porta chiusa');
            clearInterval(_kickTimer);
            serialPort = null;

            // Durante il flash è avrdude a possedere la porta: la riapertura
            // la programma avrdudeDone() a fine scrittura.
            if (flashInProgress) return;

            // Tenta riconnessione dopo 3 secondi
            setTimeout(function () {
                log('SERIAL', 'Tentativo riconnessione...');
                autoDetectSerial();
            }, 3000);
        });

    } catch (err) {
        log.error('SERIAL', 'Errore apertura porta ' + comPort + ': ' + err.message);
        serialPort = null;
        scheduleSerialRetry();
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
log('SERVER', '  Log lvl: ' + (process.env.LOG_LEVEL || 'info'));
log('SERVER', '========================================');

// Global error guards: meglio un log strutturato che un crash silenzioso
process.on('uncaughtException', function (err) {
    log.error('CRASH', 'uncaughtException: ' + (err && err.stack || err));
});
process.on('unhandledRejection', function (reason) {
    log.error('CRASH', 'unhandledRejection: ' + (reason && reason.stack || reason));
});
