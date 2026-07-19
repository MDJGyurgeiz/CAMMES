// =============================================================
//  bench_encoder_char.js — caratterizzazione encoder (prereq. FW-03)
// =============================================================
// Solo MISURA: muove l'albero di quantità note e legge l'encoder, per ricavare
// i counts/unità reali del banco (dipendono da microstep, gearing, PPR encoder).
// È il dato che tara la soglia del fault locale encoder (FW-03) nel firmware:
// un moto di N unità deve dare ~(cfgStepsPerUnit/8)·N counts; se l'encoder è
// fermo/scollegato ne dà ~0. Rilanciare se l'albero o il rapporto cambiano.
//
// RICHIEDE: Arduino su COM (fw ≥ 3.7), albero libero di ruotare, SERVER SPENTO.
//   node cammes/tools/bench_encoder_char.js [COM5]
var path = require('path');
var SerialPort = require(path.join(__dirname, '..', 'node_modules', 'serialport')).SerialPort;
var ReadlineParser = require(path.join(__dirname, '..', 'node_modules', '@serialport/parser-readline')).ReadlineParser;

var PORT = process.argv[2] || 'COM5';
var port = new SerialPort({ path: PORT, baudRate: 9600 });
var parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
var waiters = [];
parser.on('data', function (raw) {
    var line = String(raw).trim(); if (!line) return;
    for (var i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].match(line)) { var w = waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.resolve({ line: line }); }
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
var kick = null;
function kickOn() { if (!kick) kick = setInterval(function () { try { send('\n'); } catch (e) {} }, 150); }
function kickOff() { if (kick) { clearInterval(kick); kick = null; } }
async function readEnc() {
    send('?\n'); var r = await waitFor('encoder=', 2500);
    if (!r) return null; var m = r.line.match(/encoder=(-?\d+)/); return m ? parseInt(m[1], 10) : null;
}
async function move(units) {
    var before = await readEnc();
    send('$' + (units >= 0 ? '+' : '-') + Math.abs(units) + '\n');
    var mv = await waitFor('*mv', 20000);
    await sleep(150);
    var after = await readEnc();
    return { ok: !!mv, before: before, after: after, delta: (before != null && after != null) ? after - before : null };
}

(async function () {
    console.log('=== CARATTERIZZAZIONE ENCODER — ' + PORT + ' ===');
    kickOn();
    await waitFor('CAMMES Uno ready', 6000);
    await sleep(400);
    send('v\n'); var v = await waitFor('ver=', 2000);
    console.log('firmware:', v ? v.line : '?');
    send('r32\n'); await waitFor('*cfg', 2000);
    send('!\n'); await waitFor('*zero', 2000);
    await sleep(200);
    console.log('encoder dopo zero:', await readEnc());
    console.log('ENC_COUNTS_PER_DEG (firmware) = 4  → deg albero = counts/4');
    console.log('');
    console.log('unità($) | delta counts | counts/unità | deg-encoder | deg/unità');
    var sizes = [45, 90, 180, 360];
    var perUnit = [];
    for (var i = 0; i < sizes.length; i++) {
        var r = await move(sizes[i]);
        if (r.delta == null) { console.log(sizes[i] + '  → LETTURA FALLITA (mv=' + r.ok + ')'); continue; }
        var cpu = r.delta / sizes[i], degEnc = r.delta / 4;
        perUnit.push(cpu);
        console.log(String(sizes[i]).padStart(8) + ' | ' + String(r.delta).padStart(12) + ' | ' +
            cpu.toFixed(3).padStart(12) + ' | ' + degEnc.toFixed(2).padStart(11) + ' | ' + (degEnc / sizes[i]).toFixed(4).padStart(9));
        await sleep(300);
    }
    console.log('');
    console.log('--- backlash / ritorno (+360 poi -360) ---');
    var start = await readEnc();
    await move(360); await move(-360);
    var end = await readEnc();
    console.log('start=' + start + '  dopo +360/-360=' + end + '  residuo=' +
        (end != null && start != null ? (end - start) + ' counts (' + ((end - start) / 4).toFixed(2) + '° enc)' : '?'));
    if (perUnit.length) {
        var mean = perUnit.reduce(function (a, b) { return a + b; }, 0) / perUnit.length;
        var max = Math.max.apply(null, perUnit), min = Math.min.apply(null, perUnit);
        console.log('');
        console.log('SINTESI counts/unità: media=' + mean.toFixed(3) + '  min=' + min.toFixed(3) +
            '  max=' + max.toFixed(3) + '  spread=' + ((max - min) / mean * 100).toFixed(1) + '%');
        console.log('→ FW-03 usa cfgStepsPerUnit/8 come atteso; conferma che ~= ' + mean.toFixed(2) + ' a r32.');
    }
    kickOff();
    port.close(function () { process.exit(0); });
    setTimeout(function () { process.exit(0); }, 1500);
})().catch(function (e) { console.error(e); kickOff(); try { port.close(); } catch (x) {} process.exit(1); });
