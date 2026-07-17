// =============================================================
//  bench_fw34_test.js — test HARDWARE del firmware 3.4 (audit L3)
// =============================================================
//  RICHIEDE: Arduino su COM8 con fw 3.4, banco montato, SERVER SPENTO
//  (questo script apre COM8 direttamente e controlla lui i keep-alive:
//  è l'unico modo di provare il watchdog host, che scatta proprio
//  quando i keep-alive mancano).
//
//  TRAPPOLA FTDI (vista al banco, sessione 10 e di nuovo qui): il chip
//  consegna l'RX all'host solo quando l'host TRASMETTE. Quindi un kick
//  '\n' ogni 150 ms gira SEMPRE — tranne nella finestra del test watchdog,
//  che è muta per definizione. Lì la prova è INDIRETTA: dopo 8 s di
//  silenzio si riapre il kick e si verifica che (a) *wdt e *mabort sono
//  in coda, (b) l'encoder dice che il moto si è fermato MOLTO prima del
//  target (abort a ~5 s, non fine corsa).
//
//  Prove (muovono il motore: albero libero di ruotare, tastatore ok):
//   A. versione 3.4 · B. 'x' idle non avvelena cmdBuf · C. nota Concerto
//   interrotta da 'x' (*tabort) · D. watchdog host a ~5 s di silenzio
//   · E. keep-alive attivi → nessun wdt, moto completo · F. STOP classico.
//
//  Uso:  node cammes/tools/bench_fw34_test.js [COM8]
// =============================================================

var path = require('path');
var SerialPort = require(path.join(__dirname, '..', 'node_modules', 'serialport')).SerialPort;
var ReadlineParser = require(path.join(__dirname, '..', 'node_modules', '@serialport/parser-readline')).ReadlineParser;

var PORT = process.argv[2] || 'COM8';
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

var port = new SerialPort({ path: PORT, baudRate: 9600 });
var parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

var lines = [];
var waiters = [];
parser.on('data', function (raw) {
    var line = String(raw).trim();
    if (!line) return;
    lines.push({ t: Date.now(), line: line });
    for (var i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].match(line)) {
            var w = waiters.splice(i, 1)[0];
            clearTimeout(w.timer);
            w.resolve({ line: line, t: Date.now() });
        }
    }
});

function waitFor(substr, timeoutMs) {
    return new Promise(function (resolve) {
        var w = {
            match: function (l) { return l.indexOf(substr) >= 0; },
            resolve: resolve,
            timer: setTimeout(function () {
                var k = waiters.indexOf(w); if (k >= 0) waiters.splice(k, 1);
                resolve(null);
            }, timeoutMs)
        };
        waiters.push(w);
    });
}
function send(s) { port.write(s); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function sawBetween(substr, t0, t1) {
    return lines.some(function (e) { return e.t >= t0 && e.t <= t1 && e.line.indexOf(substr) >= 0; });
}

// Kick RX-flush FTDI: '\n' ogni 150 ms (il firmware ignora le righe vuote)
var kickTimer = null;
function kickOn()  { if (!kickTimer) kickTimer = setInterval(function () { try { send('\n'); } catch (e) {} }, 150); }
function kickOff() { if (kickTimer) { clearInterval(kickTimer); kickTimer = null; } }

// Lettura encoder: '?' → "encoder=N deg=X.XX"
async function readEncoder() {
    var before = lines.length;
    send('?\n');
    var r = await waitFor('encoder=', 2500);
    if (!r) return null;
    var m = r.line.match(/encoder=(-?\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

async function main() {
    console.log('=============================================================');
    console.log(' TEST HARDWARE FIRMWARE 3.4 — ' + PORT + ' (server SPENTO)');
    console.log('=============================================================');

    kickOn();
    // L'apertura porta resetta l'Arduino (DTR): aspetta il boot
    var boot = await waitFor('CAMMES Uno ready', 6000);
    check('boot dopo apertura porta ("CAMMES Uno ready")', !!boot);
    await sleep(300);

    // --- A. versione ---
    send('v\n');
    var ver = await waitFor('ver=', 3000);
    check('A: versione = 3.4 con scan', !!ver && ver.line.indexOf('ver=3.4 scan=1') >= 0, ver ? ver.line : 'nessuna risposta');

    // --- B. fix cmdBuf: 'x' idle non avvelena il comando successivo ---
    send('x');                       // STOP a motore fermo, SENZA newline (come stop() della pagina)
    await sleep(300);
    send('S-005\n');                 // col fw 3.3 questa riga veniva scartata
    var first = await waitFor('#1:', 4000);
    check('B: scan parte subito dopo x idle (cmdBuf pulito)', !!first, first ? first.line : 'nessun campione in 4 s');
    var done = await waitFor('*sdone', 20000);
    check('B: scan 5 punti completa (*sdone)', !!done);
    await sleep(300);

    // --- C. FW-02: nota Concerto interrotta da x ---
    var t0 = Date.now();
    send('t440:3000:+:50\n');        // nota da 3 s
    await sleep(800);                // a metà nota...
    var tx = Date.now();
    send('x');
    var tab = await waitFor('*tabort', 2000);
    var lat = tab ? (tab.t - tx) : null;
    check('C: *tabort ricevuto (nota interrotta)', !!tab, tab ? 'latenza ' + lat + ' ms dallo STOP' : 'nessun *tabort in 2 s');
    check('C: latenza STOP < 600 ms (kick 150 ms compreso)', lat !== null && lat < 600, lat + ' ms');
    check('C: nessun *tend prima dell\'abort', !sawBetween('*tend', t0, tab ? tab.t : Date.now()));
    await sleep(500);

    // --- D. FW-03: watchdog host (SILENZIO durante $+4000) ---
    // Prova indiretta (il *wdt non può arrivare mentre siamo muti: il chip
    // FTDI consegna solo su TX): 8 s di silenzio, poi kick e verifica che
    // (a) *wdt+*mabort erano in coda, (b) l'encoder si è fermato molto
    // prima del target 4000°.
    var encStart = await readEncoder();
    check('D: lettura encoder pre-moto', encStart !== null, 'enc ' + encStart);
    kickOff();
    var d0 = Date.now();
    send('$+4000\n');                // ~16 s di moto a ~250°/s: il wdt DEVE troncarlo a ~5 s
    await sleep(8000);               // SILENZIO TOTALE (niente kick, niente keep-alive)
    kickOn();
    var wdt = await waitFor('*wdt', 2000);
    check('D: *wdt in coda dopo il silenzio', !!wdt);
    var mab = await waitFor('*mabort', 1500);
    check('D: *mabort dopo *wdt (moto abortito)', !!mab || sawBetween('*mabort', d0, Date.now()));
    await sleep(800);
    var encA = await readEncoder();
    await sleep(1000);
    var encB = await readEncoder();
    var stopped = encA !== null && encB !== null && Math.abs(encB - encA) <= 2;
    check('D: motore FERMO dopo il wdt (encoder stabile)', stopped, 'enc ' + encA + ' → ' + encB);
    var movedDeg = (encA !== null && encStart !== null) ? Math.abs(encA - encStart) / 4 : null;
    // abort a ~5 s su un moto da ~16 s → rotazione molto sotto il target
    check('D: moto troncato molto prima del target 4000°', movedDeg !== null && movedDeg > 200 && movedDeg < 2800,
          movedDeg !== null ? movedDeg.toFixed(0) + '° percorsi (target 4000°)' : 'n/a');
    send('v\n');
    var ver2 = await waitFor('ver=', 3000);
    check('D: firmware vivo e responsivo dopo il wdt', !!ver2 && ver2.line.indexOf('3.4') >= 0);

    // --- E. controprova: keep-alive attivi → nessun wdt, moto completo ---
    var e0 = Date.now();
    send('$+0500\n');
    var mv = await waitFor('*mv', 20000);
    check('E: $+0500 con keep-alive → *mv completo', !!mv, mv ? ((mv.t - e0) / 1000).toFixed(1) + ' s' : 'nessun *mv');
    check('E: nessun *wdt con keep-alive attivi', !sawBetween('*wdt', e0, Date.now()));
    await sleep(500);

    // --- F. regressione: STOP classico durante $ ---
    send('$+0500\n');
    await sleep(1000);
    var fx = Date.now();
    send('x');
    var mab2 = await waitFor('*mabort', 2000);
    check('F: x durante $ → *mabort (STOP classico)', !!mab2, mab2 ? 'latenza ' + (mab2.t - fx) + ' ms' : 'nessun *mabort');

    console.log('');
    if (fails > 0) console.log('RISULTATO: ' + fails + ' check FALLITI');
    else console.log('VALIDATO AL BANCO: watchdog host, Concerto interrompibile, cmdBuf pulito.');
    kickOff();
    port.close(function () { process.exit(fails > 0 ? 1 : 0); });
    setTimeout(function () { process.exit(fails > 0 ? 1 : 0); }, 2000);
}

port.on('open', function () { main().catch(function (e) { console.error(e); kickOff(); try { port.close(); } catch (e2) {} process.exit(1); }); });
port.on('error', function (e) { console.error('Porta ' + PORT + ' non apribile: ' + e.message + ' (server ancora acceso?)'); process.exit(1); });
