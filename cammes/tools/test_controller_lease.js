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
    // ignora lo snapshot informativo '#ctl:info ...' (CTRL-02): qui contano i
    // soli messaggi di RUOLO (free/observer/granted/denied/released)
    for (var i = ws._msgs.length - 1; i >= 0; i--) {
        if (ws._msgs[i].indexOf('#ctl:') === 0 && ws._msgs[i].indexOf('#ctl:info') !== 0) return ws._msgs[i];
    }
    return null;
}

var server;
var logServer = '';   // stdout/stderr del server, stampato SOLO se il test fallisce
function finish() {
    try { server.kill(); } catch (e) {}
    console.log('');
    if (fails) {
        if (logServer.trim()) { console.log('--- output del server (per la diagnosi) ---'); console.log(logServer.trim()); console.log(''); }
        console.log('RISULTATO: ' + fails + ' FALLITI');
        process.exit(1);
    }
    console.log('VALIDATO: controllore unico, observer read-only, STOP a chiunque, lease rilasciato alla chiusura.');
    process.exit(0);
}
process.on('exit', function () { try { server.kill(); } catch (e) {} });

// AUDIT v3.4.3 P2-11: il test decideva che il server era pronto con un
// `await sleep(1500)`. A macchina scarica bastano (avvio mediano ~770 ms), ma
// sotto carico l'avvio supera i 3 s — enumerazione delle porte seriali
// inclusa — e la connect successiva falliva con ECONNREFUSED. Misurato: 0
// fallimenti su 30 a riposo, 10% con CPU occupata.
//
// Non basta aspettare che la porta TCP accetti: `listen()` e' sincrona, quindi
// la porta risulta aperta mentre il main thread sta ancora caricando i moduli.
// Misurato: il poll TCP risolve ~920 ms prima che un handshake WS riesca
// davvero. L'unico segnale valido di prontezza e' un handshake che si apre.
var BUDGET_AVVIO_MS = 30000;
async function connettiQuandoPronto(porta, budgetMs) {
    var scaduto = Date.now() + (budgetMs || BUDGET_AVVIO_MS);
    var ultimo;
    while (Date.now() < scaduto) {
        try { return await connect(porta); }
        catch (e) { ultimo = e; await sleep(250); }
    }
    throw new Error('server non pronto su ' + porta + ' entro ' + (budgetMs || BUDGET_AVVIO_MS) +
                    ' ms: ' + (ultimo && ultimo.message));
}

// Stesso principio applicato al giro di andata e ritorno dei messaggi.
// Ogni verifica era preceduta da un `await sleep(200)`: a riposo bastano, ma
// sotto carico il messaggio di ruolo arriva dopo e l'asserzione legge null.
// Misurato: con la CPU sovraccarica (24 processi su 12 core) il test falliva
// 3 volte su 5 anche DOPO aver sistemato l'avvio, perche' il difetto residuo
// era qui. Ora si aspetta l'ARRIVO del messaggio, non un tempo.
// Il budget e' generoso perche' non deve mai essere il limite: se il ruolo
// atteso arriva, arriva in millisecondi; se non arriva, il test deve dirlo.
var BUDGET_MSG_MS = 5000;
async function attendiCtl(ws, atteso, budgetMs) {
    var scaduto = Date.now() + (budgetMs || BUDGET_MSG_MS);
    while (Date.now() < scaduto) {
        if (lastCtl(ws) === atteso) return lastCtl(ws);
        await sleep(20);
    }
    return lastCtl(ws);   // il chiamante fa fallire il check con il valore vero
}
// Per i casi in cui ci si aspetta che NON arrivi nulla: qui il tempo serve
// davvero (bisogna dare al messaggio indesiderato la possibilita' di arrivare),
// ma con un margine ampio invece dei 200 ms di prima.
async function attendiSilenzio(ws, ms) {
    var scaduto = Date.now() + (ms || 800);
    while (Date.now() < scaduto) {
        if (lastCtl(ws) !== null) return lastCtl(ws);   // rumore: esci subito e falliscilo
        await sleep(20);
    }
    return lastCtl(ws);
}

console.log('=============================================================');
console.log(' CONTROLLER LEASE — MOT-04 / MOT-03 (arbitraggio)');
console.log('=============================================================');

Promise.all([freePort(), freePort()]).then(async function (ports) {
    var httpPort = ports[0], wsPort = ports[1];
    // P2-11: stdio catturato invece di 'ignore'. Se il test fallisce si vede
    // PERCHE' (il server puo' essere morto all'avvio: porta occupata, modulo
    // mancante); prima si otteneva solo un ECONNREFUSED muto.
    server = spawn(process.execPath, [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--port', String(httpPort), '--ws-port', String(wsPort)], { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
    server.stdout.on('data', function (d) { logServer += d; });
    server.stderr.on('data', function (d) { logServer += d; });
    server.on('error', function (e) { check('avvio del processo server', false, String(e)); });
    server.on('exit', function (code, sig) {
        if (code !== null && code !== 0) logServer += '\n[il server e uscito con codice ' + code + (sig ? ' segnale ' + sig : '') + ']';
    });

    var a = await connettiQuandoPronto(wsPort);   // niente attesa fissa
    var b = await connect(wsPort);
    var r = await attendiCtl(a, '#ctl:free');
    check('A alla connessione riceve un ruolo (#ctl:free)', r === '#ctl:free', r);

    // A invia un comando di moto → acquisisce il lease
    a.send('$+010');
    r = await attendiCtl(a, '#ctl:granted');
    check('A diventa controllore (#ctl:granted)', r === '#ctl:granted', r);

    // B (observer) invia un comando di moto → RIFIUTATO
    b._msgs = []; b.send('$+010');
    r = await attendiCtl(b, '#ctl:denied');
    check('B observer: comando di moto RIFIUTATO (#ctl:denied)', r === '#ctl:denied', r);

    // B può comunque chiedere STOP (non riceve denied)
    b._msgs = []; b.send('x');
    r = await attendiSilenzio(b);
    check('B observer: STOP consentito (nessun denied)', r === null, r);

    // v4 (protocollo): un comando di controllo v4 da observer → RIFIUTATO.
    // Prima le righe v4 (che iniziano per cifra) NON erano riconosciute come
    // comandi di controllo e sarebbero finite sulla seriale SENZA lease.
    b._msgs = []; b.send('7 SCAN run=1 dir=+ units=360');
    r = await attendiCtl(b, '#ctl:denied');
    check('B observer: comando v4 SCAN RIFIUTATO (#ctl:denied)', r === '#ctl:denied', r);
    // v4 STATUS è read-only → NON gated (nessun denied)
    b._msgs = []; b.send('8 STATUS');
    r = await attendiSilenzio(b);
    check('B observer: v4 STATUS consentito (nessun denied)', r === null, r);

    // B prova ad acquisire mentre A controlla → negato
    b._msgs = []; b.send('#ctl:acquire');
    r = await attendiCtl(b, '#ctl:denied');
    check('B non può prendere il lease mentre A controlla', r === '#ctl:denied', r);

    // A chiude → lease liberato; B ora può acquisire
    a.close(); await sleep(400);
    b._msgs = []; b.send('#ctl:acquire');
    r = await attendiCtl(b, '#ctl:granted');
    check('dopo chiusura di A, B acquisisce il lease', r === '#ctl:granted', r);

    finish();
}).catch(function (e) { check('setup', false, String(e)); finish(); });
