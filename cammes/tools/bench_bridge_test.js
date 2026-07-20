// =============================================================
//  bench_bridge_test.js — validazione HIL del BRIDGE server↔v4 (Fase 2)
// =============================================================
//  Simula la UI (client WebSocket) contro il SERVER REALE collegato a un
//  Arduino con fw >= 4.0. Verifica che, con proto=4, il server:
//   - traduca lo scan-start "S±N" della UI in un comando v4 "SCAN run=..."
//   - ritraduca gli EVT v4 nel formato v3 che la UI capisce ("#i:enc:mm",
//     "*sstat", "*sdone") — stream IDENTICO al v3, UI invariata
//   - gestisca lo STOP a metà scan (EVT STOPPED → "*sabort")
//
//  RICHIEDE: server CAMMES in ascolto (ws://host:8080) collegato al banco.
//  NON è in `npm test` (serve hardware). Uso:
//    node cammes/tools/bench_bridge_test.js [ws://127.0.0.1:8080] [units]
// =============================================================
var path = require('path');
var WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));
var URL = process.argv[2] || 'ws://127.0.0.1:8080';
var UNITS = parseInt(process.argv[3] || '60', 10);
var fails = 0;
function check(l, c, d) { console.log((c ? '  PASS  ' : '  FAIL  ') + l + (d ? '  [' + d + ']' : '')); if (!c) fails++; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function wsc() {
    return new Promise(function (res, rej) {
        var w = new WebSocket(URL); w._m = [];
        w.on('message', function (d) { w._m.push(String(d).trim()); });
        w.on('open', function () { res(w); }); w.on('error', rej);
    });
}
function count(w, pred) { return w._m.filter(pred).length; }
function has(w, s) { return w._m.some(function (l) { return l === s || l.indexOf(s) === 0; }); }

(async function () {
    console.log('=== VALIDAZIONE BRIDGE server↔v4 — ' + URL + ' ===');

    // 1) SCAN completo: stream v3 identico (ma internamente v4)
    var a = await wsc();
    a.send('S-' + UNITS + '\n');
    var waited = 0;
    while (!has(a, '*sdone') && !has(a, '*sabort') && waited < 120000) { await sleep(300); waited += 300; }
    var samples = count(a, function (l) { return l.charAt(0) === '#'; });
    check('scan: lease concesso (#ctl:granted)', has(a, '#ctl:granted'));
    check('scan: ' + UNITS + ' campioni #i:enc:mm', samples === UNITS, samples + '/' + UNITS);
    check('scan: *sstat u= ricevuto', has(a, '*sstat'));
    check('scan: *sdone (completo, nessun *sabort)', has(a, '*sdone') && !has(a, '*sabort'));
    check('scan: formato campione #idx:enc:mm', a._m.some(function (l) { return /^#\d+:-?\d+:(-?\d+(\.\d+)?|NaN)$/.test(l); }));
    a.close(); await sleep(500);

    // 2) STOP a metà scan → *sabort
    var b = await wsc();
    b.send('S-360\n');
    var stopped = false;
    for (var i = 0; i < 200; i++) {
        await sleep(150);
        var s = count(b, function (l) { return l.charAt(0) === '#'; });
        if (s >= 12 && !stopped) { b.send('x'); stopped = true; }
        if (has(b, '*sabort')) break;
    }
    check('stop: *sabort dopo STOP a metà (EVT STOPPED tradotto)', has(b, '*sabort') && !has(b, '*sdone'));
    check('stop: scan troncato (< 360 campioni)', count(b, function (l) { return l.charAt(0) === '#'; }) < 360);
    b.close();

    console.log('');
    console.log(fails ? ('RISULTATO: ' + fails + ' FALLITI') : 'VALIDATO: bridge server↔v4 — scan e STOP end-to-end, UI invariata.');
    setTimeout(function () { process.exit(fails ? 1 : 0); }, 500);
})().catch(function (e) { console.error(e); process.exit(1); });
