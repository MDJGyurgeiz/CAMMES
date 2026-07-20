// =============================================================
//  test_controller_lease.js — regressione Lotto A (MOT-04/MOT-03)
//  Controllore unico: un solo client muove il banco, gli altri sono
//  osservatori read-only; STOP consentito a chiunque; alla chiusura del
//  controllore il lease si libera e un altro può acquisirlo.
// =============================================================
//  Non serve l'Arduino: si verifica l'ARBITRAGGIO del lease (lo STOP fisico
//  su perdita controllore si valida al banco). Uso: node tools/test_controller_lease.js

var path = require('path');
var net = require('net');
var spawn = require('child_process').spawn;
var WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function freePort() {
    return new Promise(function (res, rej) {
        var s = net.createServer(); s.unref();
        s.on('error', rej);
        s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { res(p); }); });
    });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function connect(wsPort) {
    return new Promise(function (resolve, reject) {
        var ws = new WebSocket('ws://127.0.0.1:' + wsPort);
        ws._msgs = [];
        ws.on('message', function (d) { ws._msgs.push(String(d)); });
        ws.on('open', function () { resolve(ws); });
        ws.on('error', reject);
    });
}
function lastCtl(ws) {
    for (var i = ws._msgs.length - 1; i >= 0; i--) if (ws._msgs[i].indexOf('#ctl:') === 0) return ws._msgs[i];
    return null;
}

var server;
function finish() { try { server.kill(); } catch (e) {} console.log(''); if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); } console.log('VALIDATO: controllore unico, observer read-only, STOP a chiunque, lease rilasciato alla chiusura.'); process.exit(0); }
process.on('exit', function () { try { server.kill(); } catch (e) {} });

console.log('=============================================================');
console.log(' CONTROLLER LEASE — MOT-04 / MOT-03 (arbitraggio)');
console.log('=============================================================');

Promise.all([freePort(), freePort()]).then(async function (ports) {
    var httpPort = ports[0], wsPort = ports[1];
    server = spawn(process.execPath, [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--port', String(httpPort), '--ws-port', String(wsPort)], { stdio: 'ignore', cwd: path.join(__dirname, '..') });
    await sleep(1500);

    var a = await connect(wsPort);
    var b = await connect(wsPort);
    await sleep(200);
    check('A alla connessione riceve un ruolo (#ctl:free)', lastCtl(a) === '#ctl:free', lastCtl(a));

    // A invia un comando di moto → acquisisce il lease
    a.send('$+010'); await sleep(200);
    check('A diventa controllore (#ctl:granted)', lastCtl(a) === '#ctl:granted', lastCtl(a));

    // B (observer) invia un comando di moto → RIFIUTATO
    b._msgs = []; b.send('$+010'); await sleep(200);
    check('B observer: comando di moto RIFIUTATO (#ctl:denied)', lastCtl(b) === '#ctl:denied', lastCtl(b));

    // B può comunque chiedere STOP (non riceve denied)
    b._msgs = []; b.send('x'); await sleep(200);
    check('B observer: STOP consentito (nessun denied)', lastCtl(b) === null, lastCtl(b));

    // v4 (protocollo): un comando di controllo v4 da observer → RIFIUTATO.
    // Prima le righe v4 (che iniziano per cifra) NON erano riconosciute come
    // comandi di controllo e sarebbero finite sulla seriale SENZA lease.
    b._msgs = []; b.send('7 SCAN run=1 dir=+ units=360'); await sleep(200);
    check('B observer: comando v4 SCAN RIFIUTATO (#ctl:denied)', lastCtl(b) === '#ctl:denied', lastCtl(b));
    // v4 STATUS è read-only → NON gated (nessun denied)
    b._msgs = []; b.send('8 STATUS'); await sleep(200);
    check('B observer: v4 STATUS consentito (nessun denied)', lastCtl(b) === null, lastCtl(b));

    // B prova ad acquisire mentre A controlla → negato
    b._msgs = []; b.send('#ctl:acquire'); await sleep(200);
    check('B non può prendere il lease mentre A controlla', lastCtl(b) === '#ctl:denied', lastCtl(b));

    // A chiude → lease liberato; B ora può acquisire
    a.close(); await sleep(400);
    b._msgs = []; b.send('#ctl:acquire'); await sleep(300);
    check('dopo chiusura di A, B acquisisce il lease', lastCtl(b) === '#ctl:granted', lastCtl(b));

    finish();
}).catch(function (e) { check('setup', false, String(e)); finish(); });
