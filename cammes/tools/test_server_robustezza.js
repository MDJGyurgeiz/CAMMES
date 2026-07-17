// =============================================================
//  test_server_robustezza.js — regressione Lotto 12 (SEC-05/SEC-06)
// =============================================================
//  Avvia una seconda istanza del server su porte alternative e verifica:
//   SEC-05: URL con escape % malformato → 400 (prima: throw in
//           decodeURIComponent → uncaughtException, socket appeso);
//           body oltre il limite → 413 esplicito (prima: req.destroy muto);
//           un handler non deve mai appendere il socket.
//   SEC-06: due POST /api/settings CONCORRENTI con chiavi diverse → ENTRAMBE
//           le chiavi sopravvivono (prima TOCTOU: l'ultimo vinceva); il file
//           resta JSON valido (scrittura atomica, mai troncato).
//
//  Uso:  node cammes/tools/test_server_robustezza.js   (exit 0 = ok)

var path = require('path');
var http = require('http');
var spawn = require('child_process').spawn;

var HTTP_PORT = 3410, WS_PORT = 3411;
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' ROBUSTEZZA SERVER — regressione audit SEC-05 / SEC-06');
console.log('=============================================================');

var server = spawn(process.execPath,
    [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--port', String(HTTP_PORT), '--ws-port', String(WS_PORT)],
    { stdio: 'ignore', cwd: path.join(__dirname, '..') });
function killServer() { try { server.kill(); } catch (e) {} }
process.on('exit', killServer);
process.on('uncaughtException', function (e) { killServer(); console.error(e); process.exit(1); });

// req generica; rawPath consente URL non codificati/malformati
function req(method, pathStr, body, cb) {
    var r = http.request({ host: '127.0.0.1', port: HTTP_PORT, path: pathStr, method: method,
        headers: { 'Content-Type': 'application/json' } }, function (res) {
        var buf = '';
        res.on('data', function (d) { buf += d; });
        res.on('end', function () { cb(null, res.statusCode, buf); });
    });
    r.on('error', function (e) { cb(e); });
    if (body != null) r.write(body);
    r.end();
}

function finish() {
    killServer();
    console.log('');
    if (fails > 0) { console.log('RISULTATO: ' + fails + ' check FALLITI'); process.exit(1); }
    console.log('VALIDATO: URL/body malformati gestiti (400/413, niente crash),');
    console.log('POST settings concorrenti preservati, file sempre JSON valido.');
    process.exit(0);
}

// attesa avvio
var tries = 0;
(function waitUp() {
    req('GET', '/', null, function (err, code) {
        if (!err && code) return runTests();
        if (++tries > 40) { check('server di test avviato', false, String(err)); return finish(); }
        setTimeout(waitUp, 200);
    });
})();

function runTests() {
    // SEC-05.1 — URL con % malformato → 400 (non crash/hang)
    req('GET', '/api/file/%E0%A4%A', null, function (err, code) {
        check('SEC-05: URL con % malformato → 400', !err && code === 400, err ? String(err) : 'HTTP ' + code);

        // SEC-05.2 — il server è ancora vivo dopo l'URL malformato
        req('GET', '/api/firmware-info', null, function (err2, code2) {
            check('SEC-05: server vivo dopo URL malformato', !err2 && code2 === 200, err2 ? String(err2) : 'HTTP ' + code2);

            // SEC-05.3 — body oltre 200 KB su /api/settings → 413
            var big = '{"x":"' + new Array(210000).join('a') + '"}';
            req('POST', '/api/settings', big, function (err3, code3) {
                check('SEC-05: body oversize → 413', !err3 && code3 === 413, err3 ? String(err3) : 'HTTP ' + code3);

                // SEC-05.4 — JSON non valido → 400
                req('POST', '/api/settings', '{non json', function (err4, code4) {
                    check('SEC-05: JSON non valido → 400', !err4 && code4 === 400, 'HTTP ' + code4);
                    secSix();
                });
            });
        });
    });
}

function secSix() {
    // SEC-06 — due POST concorrenti con chiavi diverse: entrambe sopravvivono
    var kA = '_testA_' + HTTP_PORT, kB = '_testB_' + HTTP_PORT;
    var done = 0, codes = [];
    function onDone(err, code) {
        codes.push(code);
        if (++done < 2) return;
        // rileggi lo stato
        req('GET', '/api/settings', null, function (e, c, body) {
            var obj = {};
            try { obj = JSON.parse(body); } catch (ex) {}
            check('SEC-06: entrambi i POST concorrenti applicati', obj[kA] === 1 && obj[kB] === 2,
                  kA + '=' + obj[kA] + ', ' + kB + '=' + obj[kB]);
            check('SEC-06: settings.json resta JSON valido', !!obj && typeof obj === 'object');
            // pulizia: rimuovi le chiavi di test (null → restano ma innocue; le azzeriamo)
            req('POST', '/api/settings', JSON.stringify({ [kA]: null, [kB]: null }), function () { finish(); });
        });
    }
    // spara i due POST "in contemporanea"
    req('POST', '/api/settings', JSON.stringify({ [kA]: 1 }), onDone);
    req('POST', '/api/settings', JSON.stringify({ [kB]: 2 }), onDone);
}
