// =============================================================
//  bench_v4_test.js — test HARDWARE del protocollo v4 (fw 4.0)
// =============================================================
//  RICHIEDE: Arduino su COM con fw 4.0, albero libero di ruotare, SERVER SPENTO
//  (apre la seriale in esclusiva). Il protocollo v4 è ADDITIVO: v3 resta
//  validato da bench_fw34_test.js; qui si prova SOLO il layer v4.
//
//  Copre: HELLO/STATUS, ACK/NACK correlati per seq, SCAN/MOVE con EVT
//  SAMPLE/DONE/STOPPED, heartbeat DEDICATO ('~') vs byte casuali ('\n'),
//  fault reset, argomenti malformati, LOCK/FREE, CONFIG.
//
//  Uso:  node cammes/tools/bench_v4_test.js [COM5]
// =============================================================
var path = require('path');
var SerialPort = require(path.join(__dirname, '..', 'node_modules', 'serialport')).SerialPort;
var ReadlineParser = require(path.join(__dirname, '..', 'node_modules', '@serialport/parser-readline')).ReadlineParser;

var PORT = process.argv[2] || 'COM5';
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
var port = new SerialPort({ path: PORT, baudRate: 9600 });
var parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
var lines = [], waiters = [];
parser.on('data', function (raw) {
    var line = String(raw).trim(); if (!line) return;
    lines.push({ t: Date.now(), line: line });
    for (var i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].match(line)) { var w = waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.resolve({ line: line, t: Date.now() }); }
    }
});
function waitFor(sub, ms) {
    return new Promise(function (res) {
        var w = { match: function (l) { return l.indexOf(sub) >= 0; }, resolve: res,
            timer: setTimeout(function () { var k = waiters.indexOf(w); if (k >= 0) waiters.splice(k, 1); res(null); }, ms) };
        waiters.push(w);
    });
}
function send(s) { port.write(s); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function sawBetween(sub, t0, t1) { return lines.some(function (e) { return e.t >= t0 && e.t <= t1 && e.line.indexOf(sub) >= 0; }); }
function countBetween(sub, t0, t1) { return lines.filter(function (e) { return e.t >= t0 && e.t <= t1 && e.line.indexOf(sub) >= 0; }).length; }
// Heartbeat DEDICATO v4: '~' (byte singolo) ogni 150 ms.
var hbTimer = null;
function hbOn()  { if (!hbTimer) hbTimer = setInterval(function () { try { send('~'); } catch (e) {} }, 150); }
function hbOff() { if (hbTimer) { clearInterval(hbTimer); hbTimer = null; } }
// Keep-alive NON-heartbeat: '\n' (deve NON tenere vivo il watchdog v4).
var nlTimer = null;
function nlOn()  { if (!nlTimer) nlTimer = setInterval(function () { try { send('\n'); } catch (e) {} }, 150); }
function nlOff() { if (nlTimer) { clearInterval(nlTimer); nlTimer = null; } }
var _seq = 100;
function seq() { return _seq++; }

async function main() {
    console.log('=============================================================');
    console.log(' TEST HARDWARE PROTOCOLLO v4 — ' + PORT + ' (server SPENTO)');
    console.log('=============================================================');
    hbOn();
    var boot = await waitFor('CAMMES Uno ready', 6000);
    check('boot ("CAMMES Uno ready")', !!boot);
    await sleep(400);
    // HELLO annunciato al boot
    var bootHello = lines.filter(function (e) { return e.line.indexOf('HELLO ') === 0; })[0];
    check('boot: HELLO annunciato', !!bootHello && /proto=4/.test(bootHello.line), bootHello ? bootHello.line : 'assente');

    // --- STATUS → HELLO completo ---
    var s1 = seq();
    send(s1 + ' STATUS\n');
    var hello = await waitFor('HELLO ', 2500);
    check('STATUS → HELLO proto=4 fw=4.x', !!hello && /proto=4/.test(hello.line) && /fw=4\.\d+/.test(hello.line), hello ? hello.line : 'nessun HELLO');
    check('HELLO: device id presente e non zero', !!hello && /dev=[0-9a-fA-F]+/.test(hello.line) && !/dev=0 /.test(hello.line));
    check('HELLO: stato IDLE_LOCKED, fault NONE', !!hello && /state=IDLE_LOCKED/.test(hello.line) && /fault=NONE/.test(hello.line));

    // --- HEARTBEAT silenzioso (nessun ACK) ---
    var t0 = Date.now();
    send(seq() + ' HEARTBEAT\n');
    await sleep(400);
    check('HEARTBEAT non produce output', !sawBetween('ACK', t0, Date.now()) && !sawBetween('NACK', t0, Date.now()));

    // --- CONFIG → ACK correlato per seq ---
    var sc = seq();
    send(sc + ' CONFIG step=32 samples=1 settle=0\n');
    var ackC = await waitFor('ACK ' + sc, 2500);
    check('CONFIG → ACK con seq corretto', !!ackC, ackC ? ackC.line : 'nessun ACK ' + sc);

    // --- LOCK/FREE con stato ---
    var sl = seq(); send(sl + ' LOCK\n');
    var ackL = await waitFor('ACK ' + sl, 2000);
    check('LOCK → ACK state=IDLE_LOCKED', !!ackL && /state=IDLE_LOCKED/.test(ackL.line), ackL ? ackL.line : '—');

    // --- SCAN v4: ACK + EVT SAMPLE + EVT DONE (con heartbeat '~' attivo) ---
    var runS = 17, sS = seq();
    var tS = Date.now();
    send(sS + ' SCAN run=' + runS + ' dir=+ units=60\n');
    var ackS = await waitFor('ACK ' + sS, 2500);
    check('SCAN → ACK state=SCANNING run=17', !!ackS && /state=SCANNING/.test(ackS.line) && /run=17/.test(ackS.line), ackS ? ackS.line : '—');
    var doneS = await waitFor('EVT DONE run=17', 60000);
    check('SCAN → EVT DONE run=17', !!doneS);
    var nSamp = countBetween('EVT SAMPLE run=17', tS, Date.now());
    check('SCAN → 60 EVT SAMPLE run=17', nSamp === 60, nSamp + ' campioni');
    check('SCAN EVT SAMPLE: formato idx/enc/mm/q', sawBetween('EVT SAMPLE run=17 idx=1 enc=', tS, Date.now()));

    // --- MOVE v4: ACK + EVT DONE ---
    var runM = 18, sM = seq();
    send(sM + ' MOVE run=' + runM + ' dir=+ units=80\n');
    var ackM = await waitFor('ACK ' + sM, 2500);
    check('MOVE → ACK state=MOVING run=18', !!ackM && /state=MOVING/.test(ackM.line) && /run=18/.test(ackM.line), ackM ? ackM.line : '—');
    var doneM = await waitFor('EVT DONE run=18', 15000);
    check('MOVE → EVT DONE run=18', !!doneM);

    // --- NACK: argomenti malformati / comando ignoto ---
    var sB = seq(); send(sB + ' SCAN run=1 dir=+ units=99999\n');
    var nkB = await waitFor('NACK ' + sB, 2500);
    check('SCAN units fuori range → NACK BADARG', !!nkB && /BADARG/.test(nkB.line), nkB ? nkB.line : '—');
    var sU = seq(); send(sU + ' FOOBAR x=1\n');
    var nkU = await waitFor('NACK ' + sU, 2500);
    check('verbo ignoto → NACK BADCMD', !!nkU && /BADCMD/.test(nkU.line), nkU ? nkU.line : '—');

    // --- NACK LOCKED: MOVE in FREE ---
    var sf = seq(); send(sf + ' FREE\n'); await waitFor('ACK ' + sf, 2000);
    var sLk = seq(); send(sLk + ' MOVE run=9 dir=+ units=10\n');
    var nkLk = await waitFor('NACK ' + sLk, 2500);
    check('MOVE in FREE → NACK LOCKED', !!nkLk && /LOCKED/.test(nkLk.line), nkLk ? nkLk.line : '—');
    var sl2 = seq(); send(sl2 + ' LOCK\n'); await waitFor('ACK ' + sl2, 2000);

    // --- RESET_FAULT senza fault → NACK NO_FAULT ---
    var sr = seq(); send(sr + ' RESET_FAULT\n');
    var nkR = await waitFor('NACK ' + sr, 2500);
    check('RESET_FAULT senza fault → NACK NO_FAULT', !!nkR && /NO_FAULT/.test(nkR.line), nkR ? nkR.line : '—');

    // --- CONFIG robusto (review avversariale): atomico, no chiavi ignote/vuote ---
    // baseline noto
    var scfg = seq(); send(scfg + ' CONFIG step=32\n'); await waitFor('ACK ' + scfg, 2000);
    // atomicità: chiave valida seguita da invalida → NACK e NIENTE applicato
    var sAt = seq(); send(sAt + ' CONFIG step=8 samples=50\n');
    var nkAt = await waitFor('NACK ' + sAt, 2500);
    check('CONFIG step valido + samples invalido → NACK BADARG', !!nkAt && /BADARG/.test(nkAt.line), nkAt ? nkAt.line : '—');
    send('@\n');   // dump config v3: "samp=.. step=.. settle=.."
    var atDump = await waitFor('step=', 2000);
    check('CONFIG atomico: step NON cambiato dal NACK (resta 32)', !!atDump && /step=32\b/.test(atDump.line), atDump ? atDump.line : '—');
    // chiave ignota → NACK
    var sUk = seq(); send(sUk + ' CONFIG foo=1\n');
    var nkUk = await waitFor('NACK ' + sUk, 2500);
    check('CONFIG chiave ignota → NACK BADARG', !!nkUk && /BADARG/.test(nkUk.line), nkUk ? nkUk.line : '—');
    // CONFIG vuoto → NACK (niente da applicare)
    var sEm = seq(); send(sEm + ' CONFIG\n');
    var nkEm = await waitFor('NACK ' + sEm, 2500);
    check('CONFIG vuoto → NACK BADARG', !!nkEm && /BADARG/.test(nkEm.line), nkEm ? nkEm.line : '—');

    // --- TONE in FREE → rifiutato (*locked), chiude il gap FW-01 nel Concerto ---
    var sfr = seq(); send(sfr + ' FREE\n'); await waitFor('ACK ' + sfr, 2000);
    var tFreeT = Date.now();
    send('t440:300:+\n');   // jog musicale v3: in FREE deve essere RIFIUTATO
    var lockT = await waitFor('*locked', 2500);
    check('TONE in FREE → *locked (nessun moto con la mano sull\'albero)', !!lockT && !sawBetween('*tend', tFreeT, Date.now()), lockT ? '*locked' : 'NON rifiutato!');
    var slk3 = seq(); send(slk3 + ' LOCK\n'); await waitFor('ACK ' + slk3, 2000);

    // --- HEARTBEAT DEDICATO: '\n' NON tiene vivo il watchdog v4 ---
    // MOVE lungo; smetto i '~' e mando solo '\n': deve arrivare EVT STOPPED
    // reason=HOST_TIMEOUT (~5 s). Prova che il byte qualsiasi non maschera la
    // perdita dell'host in v4 (in v3 invece la terrebbe viva).
    hbOff();
    var runW = 20, sW = seq();
    var tW = Date.now();
    send(sW + ' MOVE run=' + runW + ' dir=+ units=2000\n');
    await waitFor('ACK ' + sW, 2500);
    nlOn();                       // solo '\n' (NON heartbeat) da ora
    var stopW = await waitFor('EVT STOPPED run=20', 9000);
    nlOff();
    check('heartbeat dedicato: \\n non tiene vivo → EVT STOPPED HOST_TIMEOUT',
          !!stopW && /HOST_TIMEOUT/.test(stopW.line), stopW ? ('dopo ' + (stopW.t - tW) + ' ms: ' + stopW.line) : 'nessuno stop (watchdog v4 NON scattato!)');
    hbOn();
    // STOP software universale ancora attivo (REL-03)
    await sleep(300);
    var sHb = seq(); send(sHb + ' STATUS\n');
    var h2 = await waitFor('HELLO ', 2500);
    check('firmware vivo e IDLE dopo il timeout', !!h2 && /state=IDLE_LOCKED/.test(h2.line), h2 ? h2.line : 'muto');

    // --- FW-01 (controrevisione v3.4.1): watchdog anche durante lo SCAN ---
    // Prima lo scan si auto-rinfrescava (stepperMove per unità) e senza host
    // arrivava a EVT DONE. Ora: SCAN lungo, si smette di mandare '~' → deve
    // arrivare EVT STOPPED reason=HOST_TIMEOUT e MAI EVT DONE. Richiede fw>=4.1.
    var v41 = false;
    { var vv = h2 || {}; v41 = /fw=4\.[1-9]/.test(vv.line || ''); }
    if (v41) {
        hbOff();
        var runSW = 30, sSW = seq(); var tSW = Date.now();
        send(sSW + ' SCAN run=' + runSW + ' dir=+ units=1200\n');
        await waitFor('ACK ' + sSW, 2500);
        nlOn();   // solo '\n' (non heartbeat): non deve tenere vivo lo scan
        var stopSW = await waitFor('EVT STOPPED run=' + runSW, 9000);
        var doneSW = sawBetween('EVT DONE run=' + runSW, tSW, Date.now());
        nlOff(); hbOn();
        check('FW-01: SCAN senza heartbeat → EVT STOPPED HOST_TIMEOUT',
              !!stopSW && /HOST_TIMEOUT/.test(stopSW.line), stopSW ? ('dopo ' + (stopSW.t - tSW) + ' ms') : 'NESSUNO STOP (watchdog scan NON scattato!)');
        check('FW-01: nessun EVT DONE sul run andato in timeout', !doneSW);
        // il firmware resta vivo e utilizzabile
        await sleep(300);
        var sHb2 = seq(); send(sHb2 + ' STATUS\n');
        var h3 = await waitFor('HELLO ', 2500);
        check('FW-01: firmware IDLE dopo il timeout scan', !!h3 && /state=IDLE_LOCKED/.test(h3.line), h3 ? h3.line : 'muto');
    } else {
        console.log('  (FW-01 watchdog SCAN: saltato — richiede fw >= 4.1)');
    }

    console.log('');
    hbOff();
    if (fails > 0) console.log('RISULTATO: ' + fails + ' check FALLITI');
    else console.log('VALIDATO AL BANCO: protocollo v4 (HELLO/STATUS, ACK/NACK, SCAN/MOVE EVT, heartbeat dedicato, fault, device id).');
    port.close(function () { process.exit(fails > 0 ? 1 : 0); });
    setTimeout(function () { process.exit(fails > 0 ? 1 : 0); }, 2000);
}
port.on('open', function () { main().catch(function (e) { console.error(e); hbOff(); nlOff(); try { port.close(); } catch (e2) {} process.exit(1); }); });
port.on('error', function (e) { console.error('Porta ' + PORT + ' non apribile: ' + e.message + ' (server acceso?)'); process.exit(1); });
