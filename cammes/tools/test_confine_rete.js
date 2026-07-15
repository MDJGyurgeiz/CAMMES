// =============================================================
//  test_confine_rete.js — regressione Lotto 4 audit esterno
//  (SEC-02 allowlist statica, SEC-01 Host/Origin sul server)
// =============================================================
//  Avvia una SECONDA istanza del server su porte alternative e verifica:
//   - la UI è servita (200), i file privati NO (404 anche se esistono):
//     prima il fallback statico serviva cammes.log, settings.json, prove/,
//     il sorgente del server e node_modules a chiunque in LAN.
//   - Host esterni rifiutati (403, anti DNS-rebinding).
//   - WebSocket: Origin di altri siti rifiutata, pagine locali e client
//     non-browser accettati (prima QUALSIASI pagina web nel browser di un
//     dispositivo LAN poteva comandare il motore).
//
//  Uso:  node cammes/tools/test_confine_rete.js   (exit 0 = ok)

var path = require('path');
var http = require('http');
var os = require('os');
var spawn = require('child_process').spawn;
var WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

var HTTP_PORT = 3210, WS_PORT = 3211;
var fails = 0, done = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' CONFINE DI RETE — regressione audit SEC-01 / SEC-02');
console.log('=============================================================');

var server = spawn(process.execPath,
    [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--port', String(HTTP_PORT), '--ws-port', String(WS_PORT)],
    { stdio: 'ignore', cwd: path.join(__dirname, '..') });

function get(pathname, headers, cb) {
    var req = http.request({ host: '127.0.0.1', port: HTTP_PORT, path: pathname, headers: headers || {} }, function (res) {
        res.resume();
        res.on('end', function () { cb(null, res.statusCode); });
    });
    req.on('error', function (e) { cb(e); });
    req.end();
}

function wsTry(origin, cb) {
    var opts = origin ? { headers: { Origin: origin } } : {};
    var ws = new WebSocket('ws://127.0.0.1:' + WS_PORT, opts);
    var settled = false;
    ws.on('open', function () { if (!settled) { settled = true; ws.close(); cb(true); } });
    ws.on('error', function () { if (!settled) { settled = true; cb(false); } });
    setTimeout(function () { if (!settled) { settled = true; try { ws.terminate(); } catch (e) {} cb(false); } }, 3000);
}

function finish() {
    try { server.kill(); } catch (e) {}
    console.log('');
    if (fails > 0) { console.log('RISULTATO: ' + fails + ' check FALLITI'); process.exit(1); }
    console.log('VALIDATO: statico ad allowlist (file privati 404), Host esterni');
    console.log('rifiutati, WebSocket riservato alle pagine di questa macchina.');
    process.exit(0);
}

// attesa avvio server (poll)
var tries = 0;
(function waitUp() {
    get('/', null, function (err, code) {
        if (!err && code) return runTests();
        if (++tries > 50) { check('server di test avviato', false, String(err)); return finish(); }
        setTimeout(waitUp, 200);
    });
})();

function runTests() {
    var seq = [
        // [label, path, headers, expectedCode]
        ['UI: / (home)', '/', null, 200],
        ['UI: /alzata.html', '/alzata.html', null, 200],
        ['UI: /lib/cammes-math.js', '/lib/cammes-math.js', null, 200],
        ['UI: /style.css', '/style.css', null, 200],
        ['UI: /fonts/Rajdhani-Bold.woff2', '/fonts/Rajdhani-Bold.woff2', null, 200],
        ['privato: /cammes_server.js → 404', '/cammes_server.js', null, 404],
        ['privato: /settings.json → 404', '/settings.json', null, 404],
        ['privato: /cammes.log → 404', '/cammes.log', null, 404],
        ['privato: /package.json → 404', '/package.json', null, 404],
        ['privato: /node_modules/ws/package.json → 404', '/node_modules/ws/package.json', null, 404],
        ['privato: /fw/master.ino.hex → 404', '/fw/master.ino.hex', null, 404],
        ['privato: /prove/qualcosa.scr → 404', '/prove/clio1_8_alz.scr', null, 404],
        ['traversal: /lib/../cammes.log → 404', '/lib/../cammes.log', null, 404],
        ['DNS-rebinding: Host evil.com → 403', '/', { Host: 'evil.com' }, 403],
        ['DNS-rebinding: Host evil.com:3210 → 403', '/alzata.html', { Host: 'evil.com:3210' }, 403],
        ['Host localhost ok', '/', { Host: 'localhost:' + HTTP_PORT }, 200],
        ['Host IP LAN ok', '/', { Host: '192.168.1.50:' + HTTP_PORT }, 200],
        ['Host hostname macchina ok', '/', { Host: os.hostname().toLowerCase() + ':' + HTTP_PORT }, 200]
    ];
    var i = 0;
    (function next() {
        if (i >= seq.length) return wsTests();
        var t = seq[i++];
        get(t[1], t[2], function (err, code) {
            check(t[0], !err && code === t[3], 'HTTP ' + (err ? String(err) : code));
            next();
        });
    })();
}

function wsTests() {
    wsTry('http://evil.com', function (ok) {
        check('WS: Origin http://evil.com RIFIUTATA', !ok);
        wsTry('http://localhost:' + HTTP_PORT, function (ok2) {
            check('WS: Origin pagina locale accettata', ok2);
            wsTry(null, function (ok3) {
                check('WS: client non-browser (senza Origin) accettato', ok3);
                wsTry('http://192.168.1.50:' + HTTP_PORT, function (ok4) {
                    check('WS: Origin pagina servita via IP LAN accettata', ok4);
                    finish();
                });
            });
        });
    });
}
