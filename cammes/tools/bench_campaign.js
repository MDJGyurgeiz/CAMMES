// CAMPAGNA DI BANCO riutilizzabile: 5 scansioni con reset a 180° dal picco.
// (nata per il test Clio puntalino-vs-piattello del 2026-07-11)
//   uso:  node bench_campaign.js punt      (fase 1: puntalino montato)
//         node bench_campaign.js bicch33   (fase 2: piattello Ø33 montato)
// Esegue: sanity → scan di localizzazione → reset picco@+180° → 5 scansioni
// (fast ×2, autonoma ×2, mediata c3 ×1) con reset verificato prima di ognuna.
// Salva prove/cliobench_<fase>_<nome>_alz.scr + JSON completo in scratchpad.
var fs = require('fs'), path = require('path');
var { SerialPort } = require(path.join(__dirname, '..', 'node_modules', 'serialport'));

var PHASE = process.argv[2];
if (!PHASE || !/^[A-Za-z0-9_-]{1,24}$/.test(PHASE)) { console.log('uso: node bench_campaign.js <etichetta>  (es. punt, bicch33, vw-asp)'); process.exit(1); }
var OUT_JSON = 'C:/jvmtmp/claude/H--Il-mio-Drive-Public-Progetti-IoT-cammes/60e1258e-4763-45dd-baf8-21a107d47e37/scratchpad/clio_' + PHASE + '.json';

var port = null, buf = '', lines = [], kick = null;
async function openPort() {
    // rileva la porta (FTDI o prima COM) invece di fissare COM8
    var found = null;
    for (var att = 1; att <= 5 && !found; att++) {
        var ports = await SerialPort.list();
        var ftdi = ports.filter(function (p) { return /ftdi|arduino|wch/i.test(p.manufacturer || ''); });
        found = (ftdi[0] || ports[0] || {}).path || null;
        if (!found) { console.log('   nessuna porta (tentativo ' + att + '/5), riprovo tra 3s'); await new Promise(function (r) { setTimeout(r, 3000); }); }
    }
    if (!found) throw new Error('nessuna porta COM trovata');
    for (var o = 1; o <= 3; o++) {
        try {
            port = await new Promise(function (res, rej) {
                var p = new SerialPort({ path: found, baudRate: 9600 }, function (err) { if (err) rej(err); else res(p); });
            });
            console.log('porta aperta: ' + found);
            break;
        } catch (e) {
            console.log('   apertura ' + found + ' fallita (' + e.message + '), tentativo ' + o + '/3');
            if (o === 3) throw e;
            await new Promise(function (r) { setTimeout(r, 3000); });
        }
    }
    port.on('data', function (d) {
        buf += d.toString();
        var parts = buf.split(/\r?\n/); buf = parts.pop();
        parts.forEach(function (l) { l = l.trim(); if (l) lines.push({ t: Date.now(), s: l }); });
    });
    port.on('error', function (e) { console.log('SERIAL ERR: ' + e.message); process.exit(1); });
    // keep-alive FTDI (starvation RX nota su questo PC)
    kick = setInterval(function () { try { port.write('\n'); } catch (e) {} }, 100);
}

function send(c) { port.write(c); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function clear() { lines.length = 0; }
function waitFor(pred, timeoutMs, label) {
    return new Promise(function (res, rej) {
        var t0 = Date.now();
        (function poll() {
            for (var k = 0; k < lines.length; k++) if (pred(lines[k].s)) return res(lines[k]);
            if (Date.now() - t0 > timeoutMs) return rej(new Error('timeout ' + (label || '')));
            setTimeout(poll, 15);
        })();
    });
}
function encFromLines() {
    for (var k = lines.length - 1; k >= 0; k--) {
        var m = lines[k].s.match(/^encoder=(-?\d+) deg=/);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}
async function queryEnc() {
    clear(); send('?\n');
    await waitFor(function (s) { return s === '*pos'; }, 5000, '*pos');
    return encFromLines();
}
async function setCfg(cmds) {
    for (var i = 0; i < cmds.length; i++) {
        clear(); send(cmds[i] + '\n');
        await waitFor(function (s) { return s === '*cfg'; }, 5000, '*cfg ' + cmds[i]);
    }
}
function peakOf(mm) { var m = -1, mi = 0; for (var i = 1; i <= 360; i++) { if (typeof mm[i] === 'number' && mm[i] > m) { m = mm[i]; mi = i; } } return { v: m, i: mi }; }
function toScr(mm) {
    var o = ['_pline'];
    for (var i = 1; i <= 360; i++) o.push(i + ',' + (typeof mm[i] === 'number' && isFinite(mm[i]) ? mm[i] : 0));
    return o.join('\r\n') + '\r\n';
}

// scan CLASSICO: handshake p → *se × 360
async function classicScan(label) {
    var mm = [], enc = [], dt = [];
    var t0 = Date.now(), last = t0;
    for (var k = 1; k <= 360; k++) {
        clear(); send('p');
        var se = await waitFor(function (s) { return s === '*se'; }, 10000, '*se@' + k);
        var meas = null;
        for (var j = 0; j < lines.length; j++) if (lines[j].s === '*se') { meas = lines[j - 1] ? lines[j - 1].s : ''; break; }
        var p2 = (meas || '').split(' ');
        mm[k] = parseFloat(p2[0]); enc[k] = parseInt(p2[1], 10);
        dt[k] = se.t - last; last = se.t;
        if (k % 120 === 0) console.log('   ' + label + ' ' + k + '/360 (' + Math.round((se.t - t0) / 1000) + 's)');
    }
    return { mm: mm, enc: enc, dt: dt, sec: (Date.now() - t0) / 1000 };
}
// scan AUTONOMO v3: S-00360 → streaming
async function autoScan(label) {
    var mm = [], enc = [], dt = [];
    clear();
    var t0 = Date.now(), last = t0, lastIdx = 0, gaps = 0, done = false;
    send('S-00360\n');
    while (!done) {
        await waitFor(function (s) { return s.charAt(0) === '#' || s === '*sdone' || s === '*sabort'; }, 25000, 'stream');
        for (var q = 0; q < lines.length; q++) {
            var s = lines[q].s;
            if (s.charAt(0) === '#') {
                var p3 = s.substring(1).split(':');
                var idx = parseInt(p3[0], 10);
                if (idx > lastIdx + 1) gaps++;
                if (idx > lastIdx) {
                    enc[idx] = parseInt(p3[1], 10); mm[idx] = parseFloat(p3[2]);
                    dt[idx] = lines[q].t - last; last = lines[q].t; lastIdx = idx;
                    if (idx % 120 === 0) console.log('   ' + label + ' ' + idx + '/360 (' + Math.round((lines[q].t - t0) / 1000) + 's)');
                }
            } else if (s === '*sdone' || s === '*sabort') done = true;
        }
        clear();
    }
    return { mm: mm, enc: enc, dt: dt, sec: (Date.now() - t0) / 1000, gaps: gaps };
}
// RESET: porta la camma a 180° di sfasamento dal picco (picco a +180° dallo zero
// di scansione). encPeak = conteggio encoder registrato al picco dell'ultimo scan.
async function resetTo180(encPeak) {
    var now = await queryEnc();
    var target = encPeak + 720;                      // +180° = 720 conteggi
    var delta = ((target - now) % 1440 + 1440) % 1440;
    if (delta > 720) delta -= 1440;                  // percorso più corto
    var deg = Math.round(delta / 4);
    if (Math.abs(deg) >= 1) {
        var cmd = '$' + (deg >= 0 ? '+' : '-') + String(Math.abs(deg)).padStart(3, '0');
        clear(); send(cmd + '\n');
        await waitFor(function (s) { return s === '*mv'; }, 90000, '*mv reset');
        await sleep(300);
    }
    var after = await queryEnc();
    var err = ((target - after) % 1440 + 1440) % 1440; if (err > 720) err -= 1440;
    console.log('   reset 180°: enc ' + now + ' → ' + after + ' (target ' + target + ', errore ' + (err / 4).toFixed(2) + '°)');
    return after;
}

(async function () {
    var R = { phase: PHASE, scans: {} };
    try {
        await openPort();
        await waitFor(function (s) { return s === 'CAMMES Uno ready'; }, 8000, 'boot').catch(function () { console.log('(banner non visto, proseguo)'); });
        await sleep(300);
        clear(); send('v\n');
        await waitFor(function (s) { return s === '*ver'; }, 5000, '*ver');
        console.log('firmware: ' + (lines[0] ? lines[0].s : '?'));
        await setCfg(['c1', 'r32', 'w30']);
        console.log('config fast ok');
        clear(); send('m\n');
        await waitFor(function (s) { return s === '*sm'; }, 5000, '*sm');
        console.log('sensore: ' + lines[0].s + ' mm');

        // scan di LOCALIZZAZIONE (autonomo, veloce e affidabile) → trova il picco
        console.log('--- localizzazione picco (scan autonomo) ---');
        var loc = await autoScan('loc');
        var pkLoc = peakOf(loc.mm);
        var encPeak = loc.enc[pkLoc.i];
        console.log('picco: ' + pkLoc.v.toFixed(2) + ' mm @' + pkLoc.i + '  (enc ' + encPeak + ')');
        R.scans['loc_auto'] = loc;

        // sequenza scansioni con reset prima di ognuna
        var SEQ = [
            { name: 'fast1', kind: 'classic', cfg: ['c1', 'r32', 'w30'] },
            { name: 'fast2', kind: 'classic', cfg: null },
            { name: 'auto1', kind: 'auto', cfg: null },
            { name: 'auto2', kind: 'auto', cfg: null },
            { name: 'med3', kind: 'classic', cfg: ['c3', 'w50'] }
        ];
        for (var s = 0; s < SEQ.length; s++) {
            var job = SEQ[s];
            console.log('--- [' + (s + 1) + '/5] ' + job.name + ' (' + job.kind + ') ---');
            await resetTo180(encPeak);
            if (job.cfg) await setCfg(job.cfg);
            var res = job.kind === 'classic' ? await classicScan(job.name) : await autoScan(job.name);
            var pk = peakOf(res.mm);
            console.log('   ' + job.name + ': ' + res.sec.toFixed(1) + 's  picco ' + pk.v.toFixed(3) + ' @' + pk.i + (res.gaps !== undefined ? '  gaps ' + res.gaps : ''));
            R.scans[job.name] = res;
            encPeak = res.enc[pk.i];   // aggiorna riferimento picco
            fs.writeFileSync(path.join(__dirname, '..', 'prove', 'bench_' + PHASE + '_' + job.name + '_alz.scr'), toScr(res.mm));
        }
        // ripristina config fast e lascia la camma a 180° dal picco
        await setCfg(['c1', 'w30']);
        await resetTo180(encPeak);
        fs.writeFileSync(OUT_JSON, JSON.stringify(R));
        console.log('\nFASE ' + PHASE + ' COMPLETATA. 5 scansioni salvate (cliobench_' + PHASE + '_*). Camma lasciata a 180° dal picco (cerchio base).');
        clearInterval(kick); port.close(function () { process.exit(0); });
    } catch (err) {
        console.log('ERRORE: ' + err.message);
        try { send('x'); } catch (e) {}
        fs.writeFileSync(OUT_JSON, JSON.stringify(R));
        clearInterval(kick); port.close(function () { process.exit(1); });
    }
})();
