// =============================================================
//  test_ws_frame_validation.js — CTRL-01 (controrevisione v3.4.1)
// =============================================================
//  Un frame WebSocket deve contenere UNA sola operazione. Prima della patch,
//  frame concatenati aggiravano il lease e/o arrivavano interi alla seriale:
//    "?\nS+360\n"   -> primo char '?' = read-only -> inoltrato INTERO
//    "xS+360\n"     -> ramo STOP inoltrava il TESTO RICEVUTO, non 'x'
//    "0 STATUS\n1 SCAN ..." -> primo verbo STATUS read-only -> inoltro intero
//  Il firmware esegue ogni riga del flusso -> moto non autorizzato.
//
//  Il server gira con --serial-mock: ogni write seriale e' loggata su stdout
//  come [MOCKSER] "<bytes>" e il test verifica ESATTAMENTE i byte scritti
//  (requisito del handoff: niente prova per ricerca di stringhe nel sorgente).
//
//  Uso: node tools/test_ws_frame_validation.js   (exit 0 = ok)
var path = require('path');
var net = require('net');
var spawn = require('child_process').spawn;
var WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));
var NUL = String.fromCharCode(0);

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

var server = null, stdoutBuf = '';
function killServer() { try { if (server) server.kill(); } catch (e) {} }
process.on('exit', killServer);

// write seriali viste finora (decodificate dal log [MOCKSER] "...")
function mockWrites() {
    var out = [];
    stdoutBuf.split(/\r?\n/).forEach(function (l) {
        var m = l.match(/\[MOCKSER\] (".*")$/);
        if (m) { try { out.push(JSON.parse(m[1])); } catch (e) {} }
    });
    return out;
}
function connect(wsPort) {
    return new Promise(function (resolve, reject) {
        var ws = new WebSocket('ws://127.0.0.1:' + wsPort);
        ws._msgs = [];
        ws.on('message', function (d) { ws._msgs.push(String(d)); });
        ws.on('open', function () { resolve(ws); });
        ws.on('error', reject);
    });
}

console.log('=============================================================');
console.log(' VALIDAZIONE FRAME WS - CTRL-01 (un frame = una operazione)');
console.log('=============================================================');

Promise.all([freePort(), freePort()]).then(async function (ports) {
    server = spawn(process.execPath,
        [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--serial-mock',
         '--port', String(ports[0]), '--ws-port', String(ports[1])],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
    server.stdout.on('data', function (d) { stdoutBuf += d; });
    server.stderr.on('data', function (d) { stdoutBuf += d; });
    // attende il banner del mock (fino a ~4s) invece di un controllo one-shot
    for (var _t = 0; _t < 40 && stdoutBuf.indexOf('Seriale MOCK attiva') < 0; _t++) await sleep(100);
    check('server avviato con seriale MOCK', stdoutBuf.indexOf('Seriale MOCK attiva') >= 0);
    await sleep(300);   // margine per l'apertura del WS server

    var A = await connect(ports[1]);   // diventera' controllore
    var B = await connect(ports[1]);   // observer
    await sleep(200);
    var base, w;

    // A acquisisce il lease con un comando di controllo legittimo
    base = mockWrites().length;
    A.send('c1\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('controller: "c1\\n" inoltrato tale e quale', w.length === 1 && w[0] === 'c1\n', JSON.stringify(w));

    // T01: frame concatenato da OBSERVER: "?\nS+360\n" -> ZERO byte
    base = mockWrites().length;
    B.send('?\nS+360\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('T01: "?\\nS+360\\n" da observer -> nessuna write seriale', w.length === 0, JSON.stringify(w));

    // T02: "xS+360\n" -> scritto ESATTAMENTE "x", nessun moto successivo
    base = mockWrites().length;
    B.send('xS+360\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('T02: "xS+360\\n" -> scritto esattamente "x" una volta', w.length === 1 && w[0] === 'x', JSON.stringify(w));

    // T03: v4 concatenato: "0 STATUS\n1 SCAN ..." -> ZERO byte
    base = mockWrites().length;
    B.send('0 STATUS\n1 SCAN run=1 dir=+ units=360\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('T03: v4 concatenato -> nessuna write seriale', w.length === 0, JSON.stringify(w));

    // T01b: concatenato anche dal CONTROLLORE -> rifiutato
    base = mockWrites().length;
    A.send('?\nS+360\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('T01b: concatenato dal controllore -> nessuna write', w.length === 0, JSON.stringify(w));

    // T04: suffisso spazzatura "S+360junk" -> rifiutato integralmente
    base = mockWrites().length;
    A.send('S+360junk\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('T04: "S+360junk" -> rifiutato (zero write)', w.length === 0, JSON.stringify(w));

    // T04b: spazio iniziale, NUL interno, newline interno -> rifiutati
    base = mockWrites().length;
    A.send(' S+360\n');
    A.send('S+360' + NUL + '\n');
    A.send('S\r\n+360\n');
    await sleep(250);
    w = mockWrites().slice(base);
    check('T04b: spazio iniziale / NUL / newline interno -> rifiutati', w.length === 0, JSON.stringify(w));

    // comandi legittimi passano in forma canonica
    base = mockWrites().length;
    A.send('S+360\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('controller: "S+360\\n" valido -> inoltrato', w.length === 1 && w[0] === 'S+360\n', JSON.stringify(w));

    base = mockWrites().length;
    A.send('$+010\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('controller: "$+010\\n" valido -> inoltrato', w.length === 1 && w[0] === '$+010\n', JSON.stringify(w));

    base = mockWrites().length;
    A.send('t440:500:+:75\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('controller: tono Concerto valido -> inoltrato', w.length === 1 && w[0] === 't440:500:+:75\n', JSON.stringify(w));

    // query read-only da observer: ammessa, byte esatto
    base = mockWrites().length;
    B.send('?'); await sleep(250);
    w = mockWrites().slice(base);
    check('observer: "?" -> inoltrato esattamente "?"', w.length === 1 && w[0] === '?', JSON.stringify(w));

    // v4 read-only da observer: ammesso
    base = mockWrites().length;
    B.send('5 STATUS\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('observer: "5 STATUS" -> inoltrato', w.length === 1 && w[0] === '5 STATUS\n', JSON.stringify(w));

    // comando di CONTROLLO singolo valido da observer -> respinto dal lease
    base = mockWrites().length;
    B.send('S+360\n'); await sleep(250);
    w = mockWrites().slice(base);
    check('observer: "S+360" valido ma senza lease -> respinto', w.length === 0, JSON.stringify(w));

    // STOP esatto da chiunque
    base = mockWrites().length;
    B.send('x'); await sleep(250);
    w = mockWrites().slice(base);
    check('observer: "x" esatto -> scritto "x"', w.length === 1 && w[0] === 'x', JSON.stringify(w));

    console.log('');
    killServer();
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: un frame WS = una operazione; byte seriali esatti;');
    console.log('concatenazioni, suffissi e caratteri di controllo rifiutati.');
    process.exit(0);
}).catch(function (e) { check('setup', false, String(e)); killServer(); process.exit(1); });
