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
    send('?\n');
    var r = await waitFor('encoder=', 2500);
    if (!r) return null;
    var m = r.line.match(/encoder=(-?\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

async function main() {
    console.log('=============================================================');
    console.log(' TEST HARDWARE FIRMWARE 3.4+ — ' + PORT + ' (server SPENTO)');
    console.log('=============================================================');

    kickOn();
    // L'apertura porta resetta l'Arduino (DTR): aspetta il boot
    var boot = await waitFor('CAMMES Uno ready', 6000);
    check('boot dopo apertura porta ("CAMMES Uno ready")', !!boot);
    // FW-11 (fw 3.6): handshake di boot con stato e reset reason. La riga
    // arriva INSIEME a "CAMMES Uno ready" (stesso flush FTDI): va cercata
    // nelle righe già ricevute, non attesa come nuova.
    await sleep(500);
    var bootHs = lines.filter(function (e) { return e.line.indexOf('*boot') === 0; })[0];
    if (bootHs) {
        check('H: handshake *boot con ver/r/samp/free/rst', /ver=\d\.\d+ r=\d+ samp=\d+ settle=\d+ free=[01] rst=0x/.test(bootHs.line), bootHs.line);
    } else {
        console.log('  (H: *boot assente — firmware < 3.6)');
    }
    await sleep(300);

    // --- A. versione (3.4 o superiore) ---
    send('v\n');
    var ver = await waitFor('ver=', 3000);
    var verNum = ver ? parseFloat((ver.line.match(/ver=([\d.]+)/) || [])[1]) : 0;
    check('A: versione >= 3.4 con scan', verNum >= 3.4 && ver.line.indexOf('scan=1') >= 0, ver ? ver.line : 'nessuna risposta');
    var has35 = verNum >= 3.5;

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
    // prima del target 3000°.
    var encStart = await readEncoder();
    check('D: lettura encoder pre-moto', encStart !== null, 'enc ' + encStart);
    kickOff();
    var d0 = Date.now();
    send('$+3000\n');                // ~12 s di moto a ~250°/s (entro il tetto 3600 del fw 3.5): il wdt DEVE troncarlo a ~5 s
    await sleep(8000);               // SILENZIO TOTALE (niente kick, niente keep-alive)
    kickOn();
    // su alcuni FTDI/driver le righe arrivano DURANTE il silenzio (buffering
    // diverso): cerca *wdt sia nelle righe già ricevute sia in quelle nuove
    var wdt = sawBetween('*wdt', d0, Date.now()) ? { t: Date.now() } : await waitFor('*wdt', 2000);
    check('D: *wdt ricevuto (in coda o durante il silenzio)', !!wdt);
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
    check('D: moto troncato molto prima del target 3000°', movedDeg !== null && movedDeg > 200 && movedDeg < 2100,
          movedDeg !== null ? movedDeg.toFixed(0) + '° percorsi (target 3000°)' : 'n/a');
    send('v\n');
    var ver2 = await waitFor('ver=', 3000);
    check('D: firmware vivo e responsivo dopo il wdt', !!ver2 && ver2.line.indexOf('scan=1') >= 0, ver2 ? ver2.line : 'muto');

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
    await sleep(500);

    // --- G. (fw 3.5, audit FW-04) parser: wrap atoi e range → *err, ZERO moto ---
    if (has35) {
        var encG = await readEncoder();
        send('S+70000\n');           // col 3.4 wrappava a 4464 unità ESEGUITE
        var e1 = await waitFor('*err', 2500);
        check('G: S+70000 → *err (niente wrap atoi)', !!e1, e1 ? e1.line : 'nessun *err');
        send('$+70000\n');           // idem per la rotazione manuale
        var e2 = await waitFor('*err', 2500);
        check('G: $+70000 → *err', !!e2);
        send('$+9999\n');            // oltre il tetto 3600
        var e3 = await waitFor('*err', 2500);
        check('G: $+9999 (oltre tetto 10 giri) → *err', !!e3);
        send('S+2000\n');            // oltre il tetto scansione 1500
        var e4 = await waitFor('*err', 2500);
        check('G: S+2000 (oltre tetto scan) → *err', !!e4);
        send('$+abc\n');             // grammatica rotta
        var e5 = await waitFor('*err', 2500);
        check('G: $+abc (grammatica) → *err', !!e5);
        await sleep(800);
        var encG2 = await readEncoder();
        check('G: encoder IMMOBILE su tutti i comandi rifiutati', encG !== null && encG2 !== null && Math.abs(encG2 - encG) <= 2,
              'enc ' + encG + ' → ' + encG2);
        // e un comando LEGITTIMO subito dopo funziona ancora
        send('$+010\n');
        var mvG = await waitFor('*mv', 8000);
        check('G: $+010 legittimo dopo i rifiuti → *mv', !!mvG);
    } else {
        console.log('  (G: test parser saltati — richiedono fw 3.5)');
    }

    // --- I. (fw 3.6, audit FW-01) FREE persistente: movimenti RIFIUTATI ---
    var has36 = verNum >= 3.6;
    if (has36) {
        send('f\n');
        var fr = await waitFor('*free', 2500);
        check('I: FREE attivato (*free)', !!fr);
        var encI = await readEncoder();
        send('$+050\n');                 // col 3.5 avrebbe rimesso ENA e MOSSO
        var lk = await waitFor('*locked', 2500);
        check('I: movimento in FREE → *locked (rifiutato)', !!lk);
        await sleep(500);
        var encI2 = await readEncoder();
        // Tolleranza: a motore DISECCITATO (ENA=LOW in FREE) la molla del
        // tastatore spinge la camma e l'albero si assesta di qualche count fino
        // a un minimo locale (visto al banco col nuovo albero: ~0,75°). Il test
        // deve provare che FREE non fa PASSARE il motore (un $+050 = ~200 counts
        // a r32), non che l'albero sia rigido: soglia 10 counts (2,5°) « 200.
        check('I: motore non STEPPA in FREE (drift molla tastatore < 2,5°)', encI !== null && encI2 !== null && Math.abs(encI2 - encI) <= 10,
              'enc ' + encI + ' → ' + encI2 + ' (Δ ' + (encI2 - encI) + ' counts)');
        send('l\n');
        var lock = await waitFor('*lock', 2500);
        check('I: LOCK riattiva (*lock)', !!lock);
        send('$+010\n');
        var mvI = await waitFor('*mv', 8000);
        check('I: dopo LOCK il movimento funziona di nuovo', !!mvI);
    } else {
        console.log('  (I: test FREE persistente saltati — richiedono fw 3.6)');
    }

    // --- J. (fw 3.7, audit FW-04/FW-09) parser config rigoroso + NACK busy ---
    var has37 = verNum >= 3.7;
    if (has37) {
        // FW-04: comandi di configurazione con strtol + range → *err su input
        // non valido (prima atoi accettava spazzatura/overflow in silenzio).
        send('c99\n');                         // fuori range (1..9)
        var cErr = await waitFor('*err c', 2000);
        check('J: c99 (fuori range) → *err c', !!cErr, cErr ? cErr.line : 'nessun *err');
        send('c3xyz\n');                       // spazzatura in coda
        var cErr2 = await waitFor('*err c', 2000);
        check('J: c3xyz (spazzatura in coda) → *err c', !!cErr2);
        send('r20\n');                         // valore non nell'insieme {8,16,32,64}
        var rErr = await waitFor('*err r', 2000);
        check('J: r20 (fuori insieme) → *err r', !!rErr);
        send('c3\n');                          // valido: deve ancora funzionare
        var cOk = await waitFor('*cfg', 2000);
        check('J: c3 (valido) → *cfg (retrocompatibile)', !!cOk && sawBetween('samp=3', Date.now() - 1500, Date.now()));

        // FW-04: overflow di riga → *err ovf, resto scartato, nessun comando spurio.
        var encJ = await readEncoder();
        send(new Array(62).join('c') + '\n');   // 61 char > buffer 48 (fw 4.0) → overflow
        var ovf = await waitFor('*err ovf', 2000);
        check('J: riga troppo lunga → *err ovf', !!ovf, ovf ? ovf.line : 'nessun *err ovf');
        await sleep(400);
        var encJ2 = await readEncoder();
        check('J: nessun moto spurio dopo overflow', encJ !== null && encJ2 !== null && Math.abs(encJ2 - encJ) <= 2,
              'enc ' + encJ + ' → ' + encJ2);

        // FW-09: un comando durante il moto → *busy (una volta), il moto prosegue.
        send('$+150\n');                       // movimento abbastanza lungo
        await sleep(400);                      // ...siamo dentro il moto
        send('q\n');                           // comando "vero" durante il moto
        var busy = await waitFor('*busy', 3000);
        check('J: comando durante il moto → *busy (FW-09)', !!busy, busy ? busy.line : 'nessun *busy');
        var mvJ = await waitFor('*mv', 12000);
        check('J: il movimento prosegue e termina (*mv) nonostante il *busy', !!mvJ);
    } else {
        console.log('  (J: test parser config/overflow/busy saltati — richiedono fw 3.7)');
    }

    // --- K. (fw 3.8, audit FW-03) fault locale encoder: NO FALSO POSITIVO ---
    // Con encoder SANO uno scan completo NON deve mai emettere *fault. (Il
    // true-positive — encoder scollegato → *fault — richiede lo scollegamento
    // fisico del cavo encoder: NEEDS_HARDWARE, non automatizzabile da qui.)
    var has38 = verNum >= 3.8;
    if (has38) {
        var kStart = Date.now();
        send('S+60\n');                        // scan di 60 unità (>2 finestre da 30)
        var kDone = await waitFor('*sdone', 60000);
        var faulted = sawBetween('*fault', kStart, Date.now());
        check('K: scan reale (encoder sano) completa senza *fault', !!kDone && !faulted,
              (kDone ? '*sdone' : 'no *sdone') + (faulted ? ' + *fault SPURIO!' : ''));
    } else {
        console.log('  (K: test fault encoder saltato — richiede fw 3.8)');
    }

    console.log('');
    if (fails > 0) console.log('RISULTATO: ' + fails + ' check FALLITI');
    else console.log('VALIDATO AL BANCO: watchdog host, Concerto interrompibile, cmdBuf pulito, parser rigoroso, NACK busy, fault encoder senza falsi positivi.');
    kickOff();
    port.close(function () { process.exit(fails > 0 ? 1 : 0); });
    setTimeout(function () { process.exit(fails > 0 ? 1 : 0); }, 2000);
}

port.on('open', function () { main().catch(function (e) { console.error(e); kickOff(); try { port.close(); } catch (e2) {} process.exit(1); }); });
port.on('error', function (e) { console.error('Porta ' + PORT + ' non apribile: ' + e.message + ' (server ancora acceso?)'); process.exit(1); });
