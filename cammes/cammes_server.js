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

// Log persistente su file (per la diagnostica di assistenza): stesse righe
// della console, senza colori. Rotazione: sopra 1 MB si tiene la coda.
var LOG_FILE = path.join(REAL_DIR, 'cammes.log');
var _logFileBroken = false;
// AUDIT SEC-08: logging ASINCRONO. Prima ogni riga faceva appendFileSync nel
// percorso caldo (~98% delle righe sono DATA seriale): un I/O sincrono per ogni
// campione può bloccare l'event loop e far perdere frame durante la scansione.
// Ora le righe si accodano e si scrivono in batch con appendFile async.
var _logQueue = [];
var _logFlushing = false;
var _logSinceRotCheck = 0;
function _flushLog() {
    if (_logFlushing || _logFileBroken || _logQueue.length === 0) return;
    _logFlushing = true;
    var chunk = _logQueue.join('');
    _logQueue.length = 0;
    fs.appendFile(LOG_FILE, chunk, function (err) {
        _logFlushing = false;
        if (err) { _logFileBroken = true; return; }
        _logSinceRotCheck += chunk.length;
        if (_logSinceRotCheck > 256 * 1024) {   // controllo rotazione ogni ~256 KB scritti
            _logSinceRotCheck = 0;
            fs.stat(LOG_FILE, function (e, st) {
                if (!e && st.size > 1024 * 1024) {
                    fs.readFile(LOG_FILE, 'utf8', function (e2, data) {
                        if (!e2) { try { writeFileAtomic(LOG_FILE, data.slice(-512 * 1024)); } catch (e3) {} }
                    });
                }
            });
        }
        if (_logQueue.length) _flushLog();   // altre righe accodate nel frattempo
    });
}
function logToFile(line) {
    if (_logFileBroken) return;
    _logQueue.push(line + '\r\n');
    if (_logQueue.length === 1) setTimeout(_flushLog, 200);   // batch entro 200 ms
    else if (_logQueue.length > 2000) _flushLog();            // burst: flush subito
}

// AUDIT SEC-04: containment robusto. Il vecchio controllo
// resolved.indexOf(base) === 0 accettava le directory SORELLE (es. base
// "/x/prove" accettava "/x/prove-altro/f"). path.relative dà '' o un percorso
// che NON inizia con '..' e non è assoluto solo se target è DENTRO base.
function isInside(baseDir, target) {
    var rel = path.relative(path.resolve(baseDir), path.resolve(target));
    return rel === '' || (rel.indexOf('..') !== 0 && !path.isAbsolute(rel) && rel.charAt(0) !== '.');
}

function logAt(level, tag, msg) {
    if ((LOG_LEVELS[level] || 0) < LOG_THRESHOLD) return;
    var now = new Date().toLocaleTimeString('it-IT');
    logToFile('[' + now + '] [' + tag + '] ' + (level !== 'info' ? level.toUpperCase() + ': ' : '') + msg);
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

// AUDIT SEC-05: raccolta del body con LIMITE che risponde 413 (prima
// req.destroy() uccideva il socket in silenzio: il client vedeva solo una
// connessione interrotta). cb(err, body); err.tooLarge = true se sforato.
function readBody(req, res, maxBytes, cb) {
    var body = '', over = false;
    req.on('data', function (chunk) {
        if (over) return;
        body += chunk;
        if (body.length > maxBytes) {
            over = true;
            sendJson(res, 413, { error: 'Corpo troppo grande (max ' + Math.round(maxBytes / 1024) + ' KB)' });
            req.destroy();
        }
    });
    req.on('end', function () { if (!over) cb(null, body); });
    req.on('error', function (e) { if (!over) cb(e); });
}

// AUDIT SEC-06: scrittura ATOMICA (temp nella stessa dir + fsync + rename).
// Prima writeFileSync diretto: un crash a metà lasciava settings.json
// troncato/corrotto (poi readSettings ritornava {} perdendo TUTTO). rename
// è atomico sullo stesso filesystem: il file di destinazione o è la vecchia
// versione o la nuova, mai a metà.
function writeFileAtomic(destPath, data) {
    var tmp = destPath + '.tmp-' + process.pid;
    var fd = fs.openSync(tmp, 'w');
    try {
        fs.writeSync(fd, data);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(tmp, destPath);
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
                // Asset .exe della release: link di download DIRETTO (per un
                // non tecnico la pagina release con zip/tarball è un labirinto)
                var exeAsset = null;
                (rel.assets || []).forEach(function (a) {
                    if (!exeAsset && /\.exe$/i.test(a.name || '')) exeAsset = a;
                });
                // AUDIT SEC-10: l'app NON scarica né esegue l'exe da sola (il
                // download è manuale dal link), ma senza un checksum l'utente non
                // può verificare ciò che scarica. La CI mette lo SHA-256 nelle
                // note della release: lo estraiamo (64 hex vicino al nome exe, o
                // il primo 64-hex delle note) così la UI lo mostra da confrontare.
                var notes = String(rel.body || '');
                var sha = null;
                if (exeAsset) {
                    var reNear = new RegExp('([a-f0-9]{64})[^a-f0-9]{0,80}' + exeAsset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|' + exeAsset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^a-f0-9]{0,80}([a-f0-9]{64})', 'i');
                    var m = notes.match(reNear);
                    if (m) sha = (m[1] || m[2] || '').toLowerCase();
                }
                if (!sha) { var m2 = notes.match(/\b[a-f0-9]{64}\b/i); if (m2) sha = m2[0].toLowerCase(); }
                var data = {
                    current: APP_VERSION,
                    latest: latest,
                    updateAvailable: compareVersions(latest, APP_VERSION) > 0,
                    name: rel.name || rel.tag_name,
                    url: rel.html_url,
                    downloadUrl: exeAsset ? exeAsset.browser_download_url : null,
                    downloadName: exeAsset ? exeAsset.name : null,
                    downloadSizeMB: exeAsset ? Math.round(exeAsset.size / 1048576 * 10) / 10 : null,
                    downloadSha256: sha,
                    publishedAt: rel.published_at,
                    notes: notes.substring(0, 2000)
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

// --- Backup ZIP dell'archivio misure ------------------------------------
// ZIP "stored" (senza compressione: i .scr sono file di pochi KB) costruito a
// mano — niente dipendenze. Formato: local headers + central directory + EOCD.

var _crcTable = null;
function crc32(buf) {
    if (!_crcTable) {
        _crcTable = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            _crcTable[n] = c >>> 0;
        }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) crc = _crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {   // entries: [{ name, data(Buffer), mtime(Date) }]
    var locals = [], centrals = [], offset = 0;
    entries.forEach(function (e) {
        var nameB = Buffer.from(e.name, 'utf8');
        var crc = crc32(e.data);
        var d = e.mtime || new Date();
        var dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
        var dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
        var lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
        lh.writeUInt16LE(0, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22);
        lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
        locals.push(lh, nameB, e.data);
        var ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(e.data.length, 24);
        ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
        centrals.push(Buffer.concat([ch, nameB]));
        offset += 30 + nameB.length + e.data.length;
    });
    var centralBuf = Buffer.concat(centrals);
    var eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(offset, 16);
    return Buffer.concat(locals.concat([centralBuf, eocd]));
}

function apiBackupZip(res) {
    listMisureFiles(function (err, files) {
        if (err) return sendJson(res, 500, { error: err.message });
        var entries = [];
        // AUDIT SEC-07: MANIFEST con SHA-256 per file (verificabilità del
        // backup) + inclusione di settings.json (officina/anagrafica/verifiche
        // banco). Prima il backup era solo le misure, senza modo di accorgersi
        // di un file corrotto/mancante al ripristino.
        var manifest = ['# CAMMES backup manifest', '# generato: ' + new Date().toISOString(), '# file<TAB>bytes<TAB>sha256'];
        var skipped = [];
        files.forEach(function (f) {
            try {
                var buf = fs.readFileSync(path.join(PROVE_DIR, f.name));
                var sha = require('crypto').createHash('sha256').update(buf).digest('hex');
                entries.push({ name: 'prove/' + f.name, data: buf, mtime: new Date(f.mtime) });
                manifest.push('prove/' + f.name + '\t' + buf.length + '\t' + sha);
            } catch (e) { skipped.push(f.name); log.warn('API', 'backup-zip: salto ' + f.name + ' (' + e.message + ')'); }
        });
        // settings.json accanto all'exe (se presente)
        try {
            var sBuf = fs.readFileSync(SETTINGS_FILE);
            var sSha = require('crypto').createHash('sha256').update(sBuf).digest('hex');
            entries.push({ name: 'settings.json', data: sBuf, mtime: new Date() });
            manifest.push('settings.json\t' + sBuf.length + '\t' + sSha);
        } catch (e) {}
        if (skipped.length) manifest.push('# NON inclusi (illeggibili): ' + skipped.join(', '));
        entries.push({ name: 'MANIFEST.txt', data: Buffer.from(manifest.join('\r\n') + '\r\n', 'utf8'), mtime: new Date() });
        var zip = buildZip(entries);
        var fname = 'cammes_backup_' + new Date().toISOString().substring(0, 10) + '.zip';
        log('API', 'backup-zip: ' + entries.length + ' file, ' + zip.length + ' B');
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="' + fname + '"',
            'Cache-Control': 'no-store'
        });
        res.end(zip);
    });
}

// --- Impostazioni persistenti lato server (officina, verifiche banco) ----
// Vivono in settings.json ACCANTO all'exe: sopravvivono a cambio browser/PC
// (a differenza del localStorage) e finiscono nei backup della cartella.
var SETTINGS_FILE = path.join(REAL_DIR, 'settings.json');
function readSettings() {
    try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { return {}; }
}
// AUDIT SEC-06: coda di scrittura settings. Ogni POST fa read→merge→write;
// due POST concorrenti (es. sync metadati + verifica banco) si sovrapponevano
// (TOCTOU) e l'ultimo vinceva sovrascrivendo il merge dell'altro. Serializzo:
// una scrittura alla volta, ognuna legge lo stato aggiornato dalla precedente.
var _settingsQueue = Promise.resolve();
function apiSettings(req, res) {
    if (req.method === 'GET') return sendJson(res, 200, readSettings());
    if (req.method === 'POST') {
        readBody(req, res, 200000, function (err, body) {
            if (err) return;   // 413 già inviato da readBody, o socket morto
            var patch;
            try { patch = JSON.parse(body); } catch (e) { return sendJson(res, 400, { error: 'JSON non valido' }); }
            if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
                return sendJson(res, 400, { error: 'Atteso un oggetto JSON' });
            }
            // accoda: read→merge→write atomico serializzato
            _settingsQueue = _settingsQueue.then(function () {
                var cur = readSettings();
                // merge shallow; un valore null CANCELLA la chiave (permette
                // di rimuovere impostazioni senza un endpoint dedicato)
                Object.keys(patch).forEach(function (k) {
                    if (patch[k] === null) delete cur[k];
                    else cur[k] = patch[k];
                });
                writeFileAtomic(SETTINGS_FILE, JSON.stringify(cur, null, 2));
                sendJson(res, 200, { ok: true });
            }).catch(function (e) {
                sendJson(res, 500, { error: 'Scrittura fallita: ' + e.message });
            });
        });
        return;
    }
    sendJson(res, 405, { error: 'Metodo non supportato' });
}

// --- Manuale operatore servito dal server ---------------------------------
// Render markdown MINIMO (titoli, grassetto, code, liste, tabelle): abbastanza
// per MANUALE_OPERATORE.md senza dipendenze.
function mdToHtml(md) {
    var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var out = [], inList = false, inTable = false;
    md.split(/\r?\n/).forEach(function (line) {
        var t = line.trim();
        var inline = function (s) {
            return s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
        };
        if (inList && !/^[-*] /.test(t)) { out.push('</ul>'); inList = false; }
        if (inTable && t.charAt(0) !== '|') { out.push('</table>'); inTable = false; }
        if (/^### /.test(t)) out.push('<h3>' + inline(esc(t.substring(4))) + '</h3>');
        else if (/^## /.test(t)) out.push('<h2>' + inline(esc(t.substring(3))) + '</h2>');
        else if (/^# /.test(t)) out.push('<h1>' + inline(esc(t.substring(2))) + '</h1>');
        else if (/^---/.test(t)) out.push('<hr>');
        else if (/^[-*] /.test(t)) {
            if (!inList) { out.push('<ul>'); inList = true; }
            out.push('<li>' + inline(esc(t.substring(2))) + '</li>');
        } else if (t.charAt(0) === '|') {
            if (/^\|[\s:-|]+\|$/.test(t)) return;   // riga separatore
            if (!inTable) { out.push('<table border="1" cellpadding="6" style="border-collapse:collapse;">'); inTable = true; }
            var cells = t.split('|').slice(1, -1).map(function (c) { return '<td>' + inline(esc(c.trim())) + '</td>'; });
            out.push('<tr>' + cells.join('') + '</tr>');
        } else if (t) out.push('<p>' + inline(esc(t)) + '</p>');
    });
    if (inList) out.push('</ul>');
    if (inTable) out.push('</table>');
    return out.join('\n');
}
function apiManuale(res) {
    var candidates = [
        path.join(__dirname, '..', 'MANUALE_OPERATORE.md'),   // dev (repo) e snapshot pkg
        path.join(EXE_DIR, 'MANUALE_OPERATORE.md')            // accanto all'exe (dallo zip)
    ];
    var md = null;
    for (var i = 0; i < candidates.length && md === null; i++) {
        try { md = fs.readFileSync(candidates[i], 'utf8'); } catch (e) {}
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (md === null) {
        res.end('<h1>Manuale non incluso in questa build</h1><p>Lo trovi nel pacchetto zip della release su GitHub.</p>');
        return;
    }
    res.end('<!doctype html><html lang="it"><head><meta charset="utf-8"><title>CAMMES — Manuale operatore</title>' +
        '<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;line-height:1.55;}' +
        'code{background:#eee;padding:1px 5px;border-radius:3px;} h1,h2{border-bottom:1px solid #ccc;padding-bottom:4px;}' +
        '@media print{a{display:none}}</style></head><body>' +
        '<p><a href="home.html">&larr; Torna a CAMMES</a> · <a href="javascript:print()">Stampa</a></p>' +
        mdToHtml(md) + '</body></html>');
}

// --- Diagnostica per l'assistenza: stato + coda del log ------------------
function apiDiagnostics(res) {
    var head = [
        'CAMMES — diagnostica ' + new Date().toISOString(),
        'versione software: ' + APP_VERSION,
        'firmware Arduino (probe v): ' + (deviceFw || 'nessuna risposta / non collegato'),
        'firmware incluso nella build: ' + JSON.stringify(readFwInfo()),
        'porta seriale: ' + (currentSerialPath() || 'nessuna') + ' · connessa: ' + !!(serialPort && serialPort.isOpen),
        'piattaforma: ' + process.platform + ' · node ' + process.version + ' · pkg: ' + !!process.pkg,
        'cartella archivio: ' + PROVE_DIR,
        '',
        '================ CODA DEL LOG (max ~200 KB) ================'
    ].join('\r\n');
    var tail = '';
    try { tail = fs.readFileSync(LOG_FILE, 'utf8').slice(-200 * 1024); } catch (e) { tail = '(log non disponibile: ' + e.message + ')'; }
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="cammes_diagnostica_' + new Date().toISOString().substring(0, 10) + '.txt"',
        'Cache-Control': 'no-store'
    });
    res.end(head + '\r\n' + tail);
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
    // Guardia: mai riflashare con una scansione attiva (la ucciderebbe a metà
    // e riavvierebbe l'Arduino con l'albero in movimento)
    if (Date.now() - lastScanActivity < 10000) {
        return sendJson(res, 409, { error: 'Scansione in corso: attendi la fine del giro (o annullala) e riprova' });
    }
    var info = readFwInfo();
    if (!info || !fs.existsSync(path.join(FW_DIR, 'master.ino.hex'))) {
        return sendJson(res, 500, { error: 'Firmware non incluso in questa build (manca fw/master.ino.hex)' });
    }
    var port = currentSerialPath();
    if (!port) {
        return sendJson(res, 400, { error: 'Nessuna porta Arduino nota: collega l\'Arduino e riprova' });
    }

    // AUDIT SER-03: se la seriale è APERTA, port = serialPort.path è
    // autorevole → procedi. Se NON è aperta, `port` viene da lastComPort,
    // che può essere STALE (Arduino ricollegato su un'altra COM dopo un
    // unplug): verifica che quella porta esista ancora prima di lanciare
    // avrdude, altrimenti si flasherebbe un dispositivo sbagliato o si
    // fallirebbe in modo oscuro.
    var launchFlash = function () {
        flashInProgress = true;
        log('FLASH', 'Avvio flash firmware ' + (info.firmware || '?') + ' su ' + port);
        _doFlash(res, info, port);
    };
    if (serialPort && serialPort.isOpen) {
        return launchFlash();
    }
    if (!SerialPort || !SerialPort.list) return launchFlash();   // no modulo list: best-effort
    SerialPort.list().then(function (ports) {
        var present = ports.some(function (p) { return (p.path || p.comName) === port; });
        if (!present) {
            var avail = ports.map(function (p) { return p.path || p.comName; });
            return sendJson(res, 409, {
                error: 'La porta ' + port + ' non è più presente (Arduino scollegato o su un\'altra COM). '
                     + (avail.length ? 'Porte disponibili: ' + avail.join(', ') + '. ' : '')
                     + 'Ricollega e attendi che il LED Motore torni verde, poi riprova.'
            });
        }
        launchFlash();
    }).catch(function () { launchFlash(); });
}

function _doFlash(res, info, port) {

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
    // AUDIT SER-02: guardia once. spawn emette 'error' E POI 'close' su un
    // fallimento di avvio; senza questo flag avrdudeDone veniva chiamato due
    // volte → doppio sendJson ("headers already sent", crash del processo) e
    // doppio reset di flashInProgress. Solo il PRIMO evento vince.
    var settled = false;
    function finish(code, extra) {
        if (settled) return;
        settled = true;
        clearTimeout(killer);
        avrdudeDone(res, tools, idx, port, hexPath, t0, code, out + (extra || ''));
    }
    try {
        child = spawn(tool.exe, args, { windowsHide: true });
    } catch (e) {
        return avrdudeDone(res, tools, idx, port, hexPath, t0, -1, out + '\nspawn: ' + e.message);
    }
    var killer = setTimeout(function () {
        try { child.kill(); } catch (e) {}
        finish(-1, '\ntimeout: avrdude ucciso dopo 90 s');
    }, 90000);
    child.stdout.on('data', function (d) { out += d; if (out.length > 200000) out = out.slice(-100000); });
    child.stderr.on('data', function (d) { out += d; if (out.length > 200000) out = out.slice(-100000); });
    child.on('error', function (e) { finish(-1, '\nerrore: ' + e.message); });
    child.on('close', function (code) { finish(code, ''); });
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

// ============================================================
// Confine di rete (audit SEC-01 / SEC-02)
// ============================================================
// Il banco resta raggiungibile da tutta la LAN (requisito d'uso: la UI si
// apre anche da tablet/telefono), ma:
//  - HTTP: si servono SOLO i file della UI (allowlist esplicita) e si
//    rifiutano Host esterni (anti DNS-rebinding). Prima il fallback statico
//    serviva QUALSIASI file sotto la directory (log da 600 KB, misure,
//    sorgente del server, node_modules...).
//  - WS: si accettano solo pagine servite da questa macchina (allowlist
//    Origin). Prima QUALUNQUE pagina web aperta nel browser di un
//    dispositivo della LAN poteva comandare il motore (i WebSocket non
//    hanno same-origin policy).

var OS_HOSTNAME = String(os.hostname() || '').toLowerCase();

// Hostname/IP con cui è legittimo raggiungere questo server
function isTrustedHostname(h) {
    if (!h) return false;
    h = String(h).toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
    if (h === OS_HOSTNAME || h === OS_HOSTNAME + '.local') return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;   // IP letterale (accesso LAN tipico)
    return false;
}

// Header Host "hostname[:porta]" → true se punta davvero a questa macchina.
// Un attacco DNS-rebinding arriva con Host=dominio-dell-attaccante.
function isTrustedHost(hostHeader) {
    if (!hostHeader) return true;                          // client non-browser (curl, tool)
    var h = String(hostHeader).trim();
    var host = h.charAt(0) === '['
        ? h.slice(0, h.indexOf(']') + 1)                   // [IPv6] con o senza :porta
        : h.replace(/:\d+$/, '');
    return isTrustedHostname(host.replace(/^\[|\]$/g, '') === '::1' ? '::1' : host);
}

// Origin di una pagina → può usare il WebSocket? Sì se la pagina è stata
// servita da questa macchina (qualunque nome/IP legittimo); no per pagine
// di altri siti. Assenza di Origin = client non-browser (tool da banco): ok.
function isAllowedWsOrigin(origin) {
    if (!origin) return true;
    try {
        var oh = String(origin).split('//')[1] || '';
        oh = (oh.charAt(0) === '[' ? oh.slice(0, oh.indexOf(']') + 1) : oh.split(':')[0]).split('/')[0];
        return isTrustedHostname(oh.replace(/^\[|\]$/g, ''));
    } catch (e) { return false; }
}

// Allowlist dei file statici: SOLO la UI. Tutto il resto → 404 (anche se
// il file esiste): settings/log/misure passano dalle API, non dal filesystem.
var STATIC_ALLOW = {
    '/': 1, '/home.html': 1, '/alzata.html': 1, '/grafici.html': 1, '/analisi.html': 1,
    '/style.css': 1, '/cammes-ui.js': 1, '/cammes-scan.js': 1,
    '/jspdf.umd.min.js': 1, '/responsivevoice.js': 1, '/favicon.ico': 1
};
function isAllowedStatic(u) {
    if (STATIC_ALLOW[u]) return true;
    if (/^\/lib\/[A-Za-z0-9._-]+\.js$/.test(u)) return true;
    if (/^\/fonts\/[A-Za-z0-9._-]+\.woff2?$/.test(u)) return true;
    if (/^\/images\/[A-Za-z0-9._-]+\.(png|jpe?g|svg|ico|webp)$/.test(u)) return true;
    return false;
}

var httpServer = http.createServer(function (req, res) {
    // AUDIT SEC-05: ogni richiesta in un try/catch. Prima un'eccezione in un
    // handler (es. decodeURIComponent su '%' malformato) risaliva a
    // uncaughtException: il processo restava vivo ma il socket pendeva senza
    // risposta (il browser aspettava all'infinito). Ora → 500 pulito.
    try {
        handleRequest(req, res);
    } catch (e) {
        log.error('HTTP', 'Handler crash su ' + req.url + ': ' + (e && e.stack || e));
        try { if (!res.headersSent) sendJson(res, 500, { error: 'Errore interno' }); else res.end(); } catch (e2) {}
    }
});

function handleRequest(req, res) {
    var urlPath = req.url.split('?')[0]; // Rimuovi query string (grezzo, come le route)

    // AUDIT Lotto F: header di sicurezza su OGNI risposta.
    // - frame-ancestors 'none' + X-Frame-Options DENY: no clickjacking (l'app
    //   non può essere caricata in un iframe di un altro sito);
    // - nosniff: il browser non indovina il Content-Type;
    // - no-referrer: non trapela l'URL locale a risorse esterne;
    // - Permissions-Policy: nega API sensibili non usate.
    // NB: una CSP con default-src 'self' richiede prima di spostare gli script
    // inline in file (unsafe-inline), lavoro tracciato come PARTIAL in
    // REMAINING_RISKS; qui applichiamo la parte anti-clickjacking senza rompere
    // le pagine attuali.
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), usb=()');

    // Anti DNS-rebinding (audit SEC-01): Host che non punta a questa macchina
    if (!isTrustedHost(req.headers.host)) {
        log.warn('HTTP', 'Rifiutato Host non locale: "' + req.headers.host + '" per ' + urlPath);
        res.writeHead(403);
        res.end('Forbidden (Host)');
        return;
    }

    // API: controllo aggiornamenti software (GitHub Releases, cache 1h)
    if (urlPath === '/api/update-check') {
        apiUpdateCheck(res);
        return;
    }

    // API: info firmware incluso nella build + stato collegamento
    if (urlPath === '/api/firmware-info') {
        var fwInfo = readFwInfo();
        var devVer = deviceFw ? (deviceFw.match(/ver=([\d.]+)/) || [])[1] || null : null;
        sendJson(res, 200, {
            bundled: fwInfo,
            appVersion: APP_VERSION,
            serialModule: !!SerialPort,      // false = modalità demo (driver mancanti)
            deviceFirmware: devVer,          // versione REALE sull'Arduino (probe 'v'), null se muto
            deviceFirmwareRaw: deviceFw,
            port: currentSerialPath(),
            serialConnected: !!(serialPort && serialPort.isOpen),
            flashInProgress: flashInProgress,
            avrdudeSources: resolveAvrdude(path.join(os.tmpdir(), 'cammes-fw-probe')).map(function (t) { return t.source; })
        });
        return;
    }

    // API: backup ZIP dell'intero archivio misure
    if (urlPath === '/api/backup-zip') {
        apiBackupZip(res);
        return;
    }

    // API: contenuto del cestino
    if (urlPath === '/api/trash') {
        var trashDir2 = path.join(PROVE_DIR, '.trash');
        fs.readdir(trashDir2, function (err, files) {
            if (err) return sendJson(res, 200, { files: [] });   // niente cestino = vuoto
            var items = [];
            files.forEach(function (f) {
                var m = f.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})__(.+)$/);
                try {
                    var st = fs.statSync(path.join(trashDir2, f));
                    items.push({ trashName: f, original: m ? m[2] : f, deletedAt: m ? m[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, ' $1:$2:$3') : '', size: st.size });
                } catch (e) {}
            });
            items.sort(function (a, b) { return b.trashName.localeCompare(a.trashName); });
            sendJson(res, 200, { files: items });
        });
        return;
    }

    // API: ripristina un file dal cestino
    if (urlPath === '/api/trash/restore' && req.method === 'POST') {
        readBody(req, res, 10000, function (rerr, rbody) {
            if (rerr) return;
            var tname;
            try { tname = JSON.parse(rbody).name; } catch (e) { return sendJson(res, 400, { error: 'Body non valido' }); }
            if (!isSafeFilename(tname)) return sendJson(res, 400, { error: 'Nome non valido' });
            var m = tname.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}__(.+)$/);
            var orig = m ? m[1] : tname;
            if (!isSafeFilename(orig)) return sendJson(res, 400, { error: 'Nome originale non valido' });
            var src = path.join(PROVE_DIR, '.trash', tname);
            var dest = path.join(PROVE_DIR, orig);
            if (fs.existsSync(dest)) dest = path.join(PROVE_DIR, orig.replace(/(\.scr)?$/i, '_ripristinato$1'));
            fs.rename(src, dest, function (err) {
                if (err) return sendJson(res, 500, { error: 'Ripristino fallito: ' + err.message });
                log('API', 'Cestino → ripristinato: ' + path.basename(dest));
                sendJson(res, 200, { ok: true, restored: path.basename(dest) });
            });
        });
        return;
    }

    // API: diagnostica testuale per l'assistenza (stato + coda log)
    if (urlPath === '/api/diagnostics') {
        apiDiagnostics(res);
        return;
    }

    // API: impostazioni persistenti (officina, verifiche banco, anagrafica)
    if (urlPath === '/api/settings') {
        apiSettings(req, res);
        return;
    }

    // Manuale operatore in HTML
    if (urlPath === '/manuale' || urlPath === '/manuale.html') {
        apiManuale(res);
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
        var fname;
        // AUDIT SEC-05: nome con escape % malformato → 400, non crash
        try { fname = decodeURIComponent(urlPath.substring('/api/file/'.length)); }
        catch (e) { return sendJson(res, 400, { error: 'Nome file non valido (URI)' }); }
        if (!isSafeFilename(fname)) {
            return sendJson(res, 400, { error: 'Nome file non valido', name: fname });
        }
        var fpath = path.join(PROVE_DIR, fname);
        var resolved = path.resolve(fpath);
        if (!isInside(PROVE_DIR, resolved)) {   // AUDIT SEC-04: no dir sorelle
            return sendJson(res, 403, { error: 'Path traversal rifiutato' });
        }

        // POST/PUT: salva un file misura (.scr) in prove/. Usato dall'export
        // "Salva profilo" dell'analisi (grezzo o curva follower già convertita).
        if (req.method === 'POST' || req.method === 'PUT') {
            if (!/\.scr$/i.test(fname)) {
                return sendJson(res, 400, { error: 'Salvataggio consentito solo per file .scr' });
            }
            // AUDIT SEC-05: cap 2 MB con 413 esplicito (prima req.destroy muto)
            readBody(req, res, 2000000, function (err, body) {
                if (err) return;
                fs.mkdir(PROVE_DIR, { recursive: true }, function () {
                    fs.writeFile(fpath, body, function (werr) {
                        if (werr) {
                            log('API', 'POST save errore: ' + werr.message);
                            return sendJson(res, 500, { error: 'Errore salvataggio', detail: werr.message });
                        }
                        log('API', 'POST save ok: ' + fname + ' (' + body.length + ' B)');
                        sendJson(res, 200, { ok: true, saved: fname });
                    });
                });
            });
            return;
        }

        if (req.method === 'DELETE') {
            // CESTINO invece di cancellazione definitiva: il file va in
            // prove/.trash/ con timestamp e si può ripristinare da Home.
            // Svuotamento automatico dopo 30 giorni (purgeTrash all'avvio).
            var trashDir = path.join(PROVE_DIR, '.trash');
            try { fs.mkdirSync(trashDir, { recursive: true }); } catch (eMk) {}
            var stamp = new Date().toISOString().substring(0, 19).replace(/[:]/g, '-');
            fs.rename(fpath, path.join(trashDir, stamp + '__' + fname), function (err) {
                if (err) {
                    if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'File non trovato', name: fname });
                    log('API', 'DELETE errore: ' + err.message);
                    return sendJson(res, 500, { error: 'Errore eliminazione', detail: err.message });
                }
                log('API', 'DELETE → cestino: ' + fname);
                sendJson(res, 200, { ok: true, deleted: fname, trashed: true });
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
    // AUDIT SEC-02: allowlist esplicita — prima QUALSIASI file esistente
    // sotto STATIC_DIR veniva servito con 200 (cammes.log, settings.json,
    // prove/*.scr, cammes_server.js, node_modules, fw/...).
    if (!isAllowedStatic(urlPath)) {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
        return;
    }
    var filePath = path.join(STATIC_DIR, urlPath === '/' ? 'home.html' : urlPath);

    // Sicurezza: impedisci path traversal (cintura oltre all'allowlist)
    var resolvedStatic = path.resolve(filePath);
    if (!isInside(STATIC_DIR, resolvedStatic)) {   // AUDIT SEC-04
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
}

// Doppio avvio (scenario tipico: secondo doppio click sull'exe): messaggio
// chiaro invece di un'istanza zombie, e apertura del browser su quella attiva.
httpServer.on('error', function (err) {
    if (err.code === 'EADDRINUSE') {
        log.error('SERVER', '==========================================================');
        log.error('SERVER', ' CAMMES E\' GIA\' IN ESECUZIONE (porta ' + HTTP_PORT + ' occupata).');
        log.error('SERVER', ' Usa la finestra del browser gia\' aperta: http://localhost:' + HTTP_PORT);
        log.error('SERVER', ' Questa finestra si chiude da sola tra 8 secondi.');
        log.error('SERVER', '==========================================================');
        if (OPEN_BROWSER) {
            var url = 'http://localhost:' + HTTP_PORT;
            var cmd = process.platform === 'win32' ? 'start ' + url
                    : process.platform === 'darwin' ? 'open ' + url : 'xdg-open ' + url;
            try { exec(cmd); } catch (e) {}
        }
        setTimeout(function () { process.exit(1); }, 8000);
    } else {
        log.error('HTTP', 'Errore server HTTP: ' + err.message);
    }
});

httpServer.listen(HTTP_PORT, function () {
    log('HTTP', 'Server statico avviato su http://localhost:' + HTTP_PORT);
    log('HTTP', 'Directory: ' + STATIC_DIR);
});

// ============================================================
// 2. WebSocket Server (porta 8080)
// ============================================================

var wsServer = new WebSocket.Server({
    port: WS_PORT,
    // AUDIT SEC-01: solo pagine servite da questa macchina (o client
    // non-browser come i tool da banco). Una pagina web qualsiasi aperta su
    // un dispositivo della LAN prima poteva comandare il motore o avviare
    // un flash: i WebSocket non hanno same-origin policy.
    verifyClient: function (info) {
        if (!isTrustedHost(info.req && info.req.headers.host)) {
            log.warn('WS', 'Rifiutato Host non locale: "' + (info.req && info.req.headers.host) + '"');
            return false;
        }
        var origin = info.origin || (info.req && info.req.headers.origin);
        if (!isAllowedWsOrigin(origin)) {
            log.warn('WS', 'Rifiutata Origin non locale: "' + origin + '"');
            return false;
        }
        return true;
    }
}, function () {
    log('WS', 'WebSocket server avviato su ws://localhost:' + WS_PORT);
});
wsServer.on('error', function (err) {
    if (err.code === 'EADDRINUSE') log.error('WS', 'Porta ' + WS_PORT + ' occupata (istanza gia\' attiva).');
    else log.error('WS', 'Errore server WS: ' + err.message);
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
    if (!isInside(PROVE_DIR, resolved)) {   // AUDIT SEC-04: no dir sorelle
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
var deviceFw = null;           // risposta 'v' del firmware collegato (es. "ver=3.0 scan=1")
var lastScanActivity = 0;      // timestamp ultima riga di scansione vista (guardia flash)
var serialApiVersion = 'none'; // 'legacy' (v7-v8), 'v9' (v9), 'modern' (v10+), 'none'

// Tenta di caricare il modulo serialport da vari percorsi
// Quando compilato con pkg, __dirname punta al filesystem virtuale (snapshot)
// ma i moduli nativi (.node) devono essere nella cartella reale dell'exe
var EXE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

// EXE SINGOLO AUTOSUFFICIENTE: i pacchetti serialport viaggiano DENTRO l'exe
// (pkg assets), ma i moduli nativi .node devono stare su disco reale per
// essere caricati. Al primo avvio si estraggono accanto all'exe (o in
// %LOCALAPPDATA%\CAMMES se la cartella non è scrivibile) e da lì in poi
// loadSerialPort li trova come un normale node_modules.
function copyTreeFromSnapshot(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(function (name) {
        var s = path.join(src, name), d = path.join(dest, name);
        if (fs.statSync(s).isDirectory()) copyTreeFromSnapshot(s, d);
        else fs.writeFileSync(d, fs.readFileSync(s));
    });
}
function extractSerialFromSnapshot() {
    var PKGS = ['serialport', '@serialport', 'node-gyp-build', 'debug', 'ms'];
    var snapNM = path.join(__dirname, 'node_modules');
    if (!fs.existsSync(path.join(snapNM, 'serialport'))) return null;   // build senza asset
    var candidates = [
        path.join(EXE_DIR, 'node_modules'),
        path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CAMMES', 'node_modules')
    ];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var destNM = candidates[i];
            if (!fs.existsSync(path.join(destNM, 'serialport', 'package.json'))) {
                PKGS.forEach(function (p) { copyTreeFromSnapshot(path.join(snapNM, p), path.join(destNM, p)); });
                log('SERIAL', 'Driver seriale estratto dall\'exe in: ' + destNM);
            }
            return destNM;
        } catch (e) { /* destinazione non scrivibile: prova la prossima */ }
    }
    return null;
}

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

    // Ultima risorsa (solo exe pkg): estrai i driver imbarcati nell'exe
    if (process.pkg) {
        try {
            var extractedNM = extractSerialFromSnapshot();
            if (extractedNM) {
                var mod2 = require(path.join(extractedNM, 'serialport'));
                if (mod2.SerialPort) {
                    SerialPort = mod2.SerialPort;
                    serialApiVersion = 'modern';
                    log('SERIAL', 'Modulo serialport caricato dai driver estratti: ' + extractedNM);
                    return;
                }
            }
        } catch (e) {
            log.warn('SERIAL', 'Estrazione driver dall\'exe fallita: ' + e.message);
        }
    }

    log.error('SERIAL', 'Modulo serialport non trovato - MODALITA\' DEMO (senza Arduino)');
    if (process.pkg) {
        log.error('SERIAL', 'Per abilitare: copiare node_modules/ accanto a cammes.exe');
    } else {
        log.error('SERIAL', 'Per abilitare: npm install serialport');
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
    if (_probing) return;          // probe in corso: non sovrapporsi

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

        // AUDIT SER-01: PROBE della firma firmware su OGNI porta, non "apri la
        // prima con manufacturer Arduino/WCH/FTDI e fidati". Prima, se il primo
        // FTDI era un ALTRO dispositivo (o l'Arduino era su una seconda porta),
        // ci si attaccava a quello sbagliato senza riprovare. Ora si ordinano
        // le porte mettendo davanti quelle col manufacturer noto e si prova 'v'
        // in sequenza, tenendo la PRIMA che risponde davvero come CAMMES.
        var known = [], others = [];
        ports.forEach(function (p) {
            var name = p.path || p.comName;
            var mfg = (p.manufacturer || '').toLowerCase();
            if (mfg.indexOf('arduino') !== -1 || mfg.indexOf('wch') !== -1 || mfg.indexOf('ftdi') !== -1) known.push(name);
            else others.push(name);
        });
        var ordered = known.concat(others);
        if (ordered.length > 0) {
            probePorts(ordered, 0);   // apre, manda 'v', tiene solo chi risponde CAMMES
        } else {
            scheduleSerialRetry();
        }
    }).catch(function (err) {
        log.error('SERIAL', 'Errore elencando porte: ' + err.message);
        scheduleSerialRetry();
    });
}

// Probe sequenziale delle porte NON identificate: tiene la prima che risponde
// a 'v' (il write parte dall'handler 'open', la verifica avviene qui a 4,5 s).
var _probing = false;
function probePorts(candidates, idx) {
    if (idx >= candidates.length) {
        log('SERIAL', 'Nessuna porta ha risposto al probe CAMMES: ricontrollo tra 5s (hot-plug)');
        scheduleSerialRetry();
        return;
    }
    var portName = candidates[idx];
    log('SERIAL', 'Porta non identificata: probe di ' + portName + ' (comando v, attesa 4,5s)...');
    _probing = true;
    openSerialPort(portName);
    setTimeout(function () {
        if (deviceFw) {
            _probing = false;
            log('SERIAL', portName + ' ha risposto al probe: ' + deviceFw);
            return;
        }
        log('SERIAL', portName + ' non risponde al probe: la lascio libera');
        var sp = serialPort;
        serialPort = null;   // il close che segue non è una disconnessione da ricollegare
        var next = function () { _probing = false; probePorts(candidates, idx + 1); };
        try { if (sp && sp.isOpen) sp.close(next); else next(); } catch (e) { next(); }
    }, 4500);
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
            // Probe versione firmware: 'v' dopo il boot (v3 risponde "ver=3.0 scan=1").
            // Serve alla card Sistema (versione REALE sull'Arduino) e al probe
            // delle porte non identificate.
            deviceFw = null;
            setTimeout(function () {
                try { if (serialPort && serialPort.isOpen) serialPort.write('v\n'); } catch (e) {}
            }, 1800);
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
                    // Versione firmware (risposta al probe 'v')
                    if (line.indexOf('ver=') === 0) deviceFw = line;
                    // Attività di scansione: righe streaming '#i:...' (autonomo)
                    // o ack misura '*se' (classico) → guardia anti-flash
                    if (line.charAt(0) === '#' || line === '*se') lastScanActivity = Date.now();
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
            deviceFw = null;

            // Durante il flash è avrdude a possedere la porta: la riapertura
            // la programma avrdudeDone() a fine scrittura. Durante il probe è
            // probePorts() a decidere la prossima mossa.
            if (flashInProgress || _probing) return;

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

// Cestino: svuota le voci più vecchie di 30 giorni (all'avvio, best-effort)
(function purgeTrash() {
    var trashDir = path.join(PROVE_DIR, '.trash');
    fs.readdir(trashDir, function (err, files) {
        if (err) return;
        var cutoff = Date.now() - 30 * 24 * 3600 * 1000;
        var purged = 0;
        files.forEach(function (f) {
            try {
                var st = fs.statSync(path.join(trashDir, f));
                if (st.mtimeMs < cutoff) { fs.unlinkSync(path.join(trashDir, f)); purged++; }
            } catch (e) {}
        });
        if (purged) log('FILE', 'Cestino: eliminate ' + purged + ' voci più vecchie di 30 giorni');
    });
})();

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
log('SERVER', '  CAMMES Server Unificato v' + APP_VERSION);
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
