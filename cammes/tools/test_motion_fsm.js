// =============================================================
//  test_motion_fsm.js — CTRL-02 (controrevisione v3.4.1, parziale)
// =============================================================
//  Verifica con seriale MOCK (write loggate + iniezione RX via /api/_mock-rx
//  nella pipeline REALE processSerialLine):
//   1. eventi DONE/STOPPED di un run VECCHIO non chiudono il run corrente
//      (prima SOLO i SAMPLE filtravano il runId — un DONE tardivo terminava
//      lo scan della UI);
//   2. a run inattivo un EVT STOPPED non produce un *sabort spurio;
//   3. lo stato del device e' VIVO: ACK/EVT aggiornano deviceState (prima solo
//      l'HELLO, che diventava stale);
//   4. finestra STOPPING: dopo la perdita del controllore con run attivo, il
//      lease NON si riassegna finche' non arriva il terminale;
//   5. snapshot '#ctl:info ...' inviato a ogni client al collegamento.
//
//  Uso: node tools/test_motion_fsm.js   (exit 0 = ok)
var path = require('path');
var net = require('net');
var http = require('http');
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
var HTTP_PORT = 0, WS_PORT = 0;
function inject(lines) {
    return new Promise(function (resolve, reject) {
        var r = http.request({ host: '127.0.0.1', port: HTTP_PORT, path: '/api/_mock-rx', method: 'POST',
            headers: { 'Content-Type': 'text/plain' } }, function (res) { res.resume(); res.on('end', resolve); });
        r.on('error', reject); r.write(lines.join('\n') + '\n'); r.end();
    });
}
function getInfo() {
    return new Promise(function (resolve, reject) {
        http.get({ host: '127.0.0.1', port: HTTP_PORT, path: '/api/firmware-info' }, function (res) {
            var b = ''; res.on('data', function (d) { b += d; });
            res.on('end', function () { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}
function connect() {
    return new Promise(function (resolve, reject) {
        var ws = new WebSocket('ws://127.0.0.1:' + WS_PORT);
        ws._msgs = [];
        ws.on('message', function (d) { ws._msgs.push(String(d)); });
        ws.on('open', function () { resolve(ws); });
        ws.on('error', reject);
    });
}
function lastCtl(ws) { for (var i = ws._msgs.length - 1; i >= 0; i--) if (ws._msgs[i].indexOf('#ctl:') === 0 && ws._msgs[i].indexOf('#ctl:info') !== 0) return ws._msgs[i]; return null; }
function has(ws, s) { return ws._msgs.some(function (m) { return m === s || m.indexOf(s) === 0; }); }

var server = null, stdoutBuf = '';
function killServer() { try { if (server) server.kill(); } catch (e) {} }
process.on('exit', killServer);
function mockWrites() {
    var out = [];
    stdoutBuf.split(/\r?\n/).forEach(function (l) {
        var m = l.match(/\[MOCKSER\] (".*")$/);
        if (m) { try { out.push(JSON.parse(m[1])); } catch (e) {} }
    });
    return out;
}

console.log('=============================================================');
console.log(' FSM MOTO / CORRELAZIONE - CTRL-02 (parziale)');
console.log('=============================================================');

Promise.all([freePort(), freePort()]).then(async function (ports) {
    HTTP_PORT = ports[0]; WS_PORT = ports[1];
    server = spawn(process.execPath,
        [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--serial-mock',
         '--port', String(HTTP_PORT), '--ws-port', String(WS_PORT)],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
    server.stdout.on('data', function (d) { stdoutBuf += d; });
    server.stderr.on('data', function (d) { stdoutBuf += d; });
    for (var t = 0; t < 40 && stdoutBuf.indexOf('Seriale MOCK attiva') < 0; t++) await sleep(100);
    await sleep(300);

    // firmware v4 "collegato" (via iniezione RX reale)
    await inject(['ver=4.1 scan=1 proto=4 free=0',
                  'HELLO proto=4 fw=4.1 dev=ABCD1234 state=IDLE_LOCKED free=0 fault=NONE rst=0x0']);
    await sleep(150);
    var info0 = await getInfo();
    check('setup: proto=4 negoziato via pipeline reale', info0.deviceProto === 4, 'proto=' + info0.deviceProto);

    // 5) snapshot al collegamento
    var A = await connect(); await sleep(200);
    check('snapshot #ctl:info al collegamento', has(A, '#ctl:info'),
        (A._msgs.filter(function (m) { return m.indexOf('#ctl:info') === 0; })[0] || 'assente'));

    // 3) stato VIVO da ACK/EVT (non solo HELLO)
    await inject(['ACK 7 state=SCANNING run=42']); await sleep(150);
    var info1 = await getInfo();
    check('ACK aggiorna deviceState (vivo, non stale)', info1.deviceState === 'SCANNING', 'state=' + info1.deviceState);
    await inject(['EVT DONE run=42 samples=1 unstable=0 state=IDLE_LOCKED']); await sleep(150);
    var info2 = await getInfo();
    check('EVT aggiorna deviceState', info2.deviceState === 'IDLE_LOCKED', 'state=' + info2.deviceState);

    // 1+2) filtro runId sui terminali: senza run bridge attivo, DONE/STOPPED
    //      NON devono produrre *sdone/*sabort spuri alla UI
    A._msgs = [];
    await inject(['EVT STOPPED run=999 reason=USER state=IDLE_LOCKED',
                  'EVT DONE run=998 samples=5 unstable=0 state=IDLE_LOCKED']);
    await sleep(250);
    check('a run inattivo: STOPPED/DONE vecchi NON generano *sabort/*sdone',
        !has(A, '*sabort') && !has(A, '*sdone'), JSON.stringify(A._msgs.slice(0, 4)));

    // avvia uno scan VERO via bridge (S+360 -> SCAN run=N)
    A.send('S+360\n'); await sleep(250);
    var w = mockWrites();
    var scanCmd = w.filter(function (x) { return /^\d+ SCAN run=/.test(x); }).pop();
    check('bridge: S+360 tradotto in SCAN v4', !!scanCmd, JSON.stringify(scanCmd));
    var runN = scanCmd ? parseInt(scanCmd.match(/run=(\d+)/)[1], 10) : -1;

    // eventi del run SBAGLIATO durante il run attivo: ignorati
    A._msgs = [];
    await inject(['EVT SAMPLE run=' + (runN + 7) + ' idx=1 enc=4 mm=0.10 q=OK',
                  'EVT DONE run=' + (runN + 7) + ' samples=1 unstable=0 state=IDLE_LOCKED']);
    await sleep(250);
    check('run attivo: SAMPLE/DONE di un ALTRO run ignorati', !has(A, '#1:') && !has(A, '*sdone'), JSON.stringify(A._msgs.slice(0, 4)));

    // eventi del run GIUSTO: passano tradotti
    await inject(['EVT SAMPLE run=' + runN + ' idx=1 enc=4 mm=0.10 q=OK']); await sleep(200);
    check('run attivo: SAMPLE del run corrente tradotto in #1:...', has(A, '#1:4:0.10'), JSON.stringify(A._msgs.slice(-2)));

    // 4) perdita controllore con run attivo -> STOP + finestra STOPPING
    var B = await connect(); await sleep(150);
    var baseW = mockWrites().length;
    A.close(); await sleep(400);
    var afterStop = mockWrites().slice(baseW);
    check('perdita controllore: STOP "x" inviato', afterStop.indexOf('x') >= 0, JSON.stringify(afterStop));
    B._msgs = [];
    B.send('#ctl:acquire'); await sleep(200);
    check('takeover NEGATO durante la finestra STOPPING', lastCtl(B) === '#ctl:denied', lastCtl(B));
    // arriva il terminale del run -> finestra chiusa -> takeover ok
    await inject(['EVT STOPPED run=' + runN + ' reason=USER state=IDLE_LOCKED']); await sleep(200);
    B._msgs = [];
    B.send('#ctl:acquire'); await sleep(200);
    check('takeover CONCESSO dopo il terminale', lastCtl(B) === '#ctl:granted', lastCtl(B));

    console.log('');
    killServer();
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: terminali filtrati per runId, stato device vivo,');
    console.log('finestra STOPPING sul takeover, snapshot al collegamento.');
    process.exit(0);
}).catch(function (e) { check('setup', false, String(e)); killServer(); process.exit(1); });
