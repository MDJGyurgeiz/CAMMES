// =============================================================
//  test_3dof.js — regressione per simulateCompliance3DOF
// =============================================================
// Estrae i solver 2-DOF e 3-DOF direttamente da analisi.html (niente
// copia-incolla che possa divergere) e verifica:
//   1) LIMITE RIGIDO: con sede quasi-rigida (k_seat enorme, m3 piccola) il
//      3-DOF deve coincidere col 2-DOF nella fase di alta alzata, dove il
//      valve float è significativo. (La micro-oscillazione vicino alla sede
//      è il NUOVO comportamento atteso e non viene confrontata stretta.)
//   2) ROBUSTEZZA: con sede realistica ad alto regime, output finito (no
//      NaN/Infinity) e bounded.
//
// Uso:  node cammes/tools/test_3dof.js
// Exit code 0 = tutti i check passano, 1 = fallimento.

var fs   = require('fs');
var path = require('path');

var htmlPath = path.join(__dirname, '..', 'analisi.html');
var html = fs.readFileSync(htmlPath, 'utf8');

// Estrae lo slice che contiene 2-DOF + 3-DOF (entrambi self-contained, usano
// solo Math). Marker di inizio: la def del 2-DOF; di fine: la riga del
// detector di valve float che segue immediatamente il 3-DOF.
var startMark = 'function simulateCompliance2DOF';
var endMark   = '// Indicatore valve float:';
var s = html.indexOf(startMark);
var e = html.indexOf(endMark);
if (s < 0 || e < 0 || e <= s) {
    console.error('FAIL: non trovo i marker dei solver in analisi.html');
    process.exit(1);
}
var slice = html.slice(s, e);

var simulateCompliance2DOF, simulateCompliance3DOF;
// eslint-disable-next-line no-eval
eval(slice + '\nsimulateCompliance2DOF = simulateCompliance2DOF;'
           + '\nsimulateCompliance3DOF = simulateCompliance3DOF;');

if (typeof simulateCompliance3DOF !== 'function') {
    console.error('FAIL: simulateCompliance3DOF non definita dopo eval');
    process.exit(1);
}

// --- Cam sintetica: evento di alzata liscio, picco 10 mm, durata ~220° ---
function buildCam(peakMm, startDeg, durDeg) {
    var cam = new Array(722);
    for (var i = 0; i <= 721; i++) cam[i] = 0;
    for (var d = 1; d <= 720; d++) {
        if (d >= startDeg && d <= startDeg + durDeg) {
            var u = (d - startDeg) / durDeg;          // 0..1
            cam[d] = peakMm * Math.sin(Math.PI * u) * Math.sin(Math.PI * u);
        }
    }
    return cam;
}
var cam = buildCam(10, 250, 220);

function maxFinite(arr) {
    var m = 0, ok = true;
    for (var i = 1; i <= 720; i++) {
        var v = arr[i];
        if (!isFinite(v)) { ok = false; continue; }
        if (Math.abs(v) > m) m = Math.abs(v);
    }
    return { max: m, finite: ok };
}

var fails = 0;

// ---- CHECK 1: limite rigido (3-DOF ≈ 2-DOF in alta alzata) ----
// k_seat 300000 N/mm, m3 1 g → sede praticamente rigida; rpm 3000 tiene
// subSteps sotto il cap di 400 (nessuna perdita di accuratezza).
var rigidParams = {
    massEqG: 90, massEqIntermediateG: 50,
    kPushrodN_mm: 800, kTrainN_mm: 5000, kSpringN_mm: 30, F0N: 220,
    dampingRatio: 0.06,
    massSeatG: 1, kSeatN_mm: 300000
};
var rpm1 = 3000;
var v2 = simulateCompliance2DOF(cam, rpm1, rigidParams);
var v3 = simulateCompliance3DOF(cam, rpm1, rigidParams);

var maxDiffHigh = 0, maxDiffAll = 0;
for (var d = 1; d <= 720; d++) {
    var diff = Math.abs((v3[d] || 0) - (v2[d] || 0));
    if (diff > maxDiffAll) maxDiffAll = diff;
    if ((v2[d] || 0) > 1.0 && diff > maxDiffHigh) maxDiffHigh = diff; // zona alta alzata
}
console.log('CHECK 1 (limite rigido @' + rpm1 + ' rpm):');
console.log('   max|3DOF-2DOF| in alta alzata (lift>1mm) = ' + maxDiffHigh.toFixed(4) + ' mm  (atteso < 0.05)');
console.log('   max|3DOF-2DOF| intero ciclo              = ' + maxDiffAll.toFixed(4) + ' mm');
if (maxDiffHigh < 0.05) { console.log('   PASS'); } else { console.log('   FAIL'); fails++; }

// ---- CHECK 2: robustezza sede realistica ad alto regime ----
var realParams = {
    massEqG: 90, massEqIntermediateG: 50,
    kPushrodN_mm: 800, kTrainN_mm: 5000, kSpringN_mm: 30, F0N: 220,
    dampingRatio: 0.06,
    massSeatG: 15, kSeatN_mm: 80000
};
var rpm2 = 9000;
var vr = simulateCompliance3DOF(cam, rpm2, realParams);
var mr = maxFinite(vr);
console.log('CHECK 2 (sede realistica @' + rpm2 + ' rpm):');
console.log('   output finito = ' + mr.finite + ', picco valvola = ' + mr.max.toFixed(3) + ' mm  (cam picco 10)');
// Output deve essere finito e non esplodere oltre ~2x il picco cam.
if (mr.finite && mr.max > 1 && mr.max < 25) { console.log('   PASS'); } else { console.log('   FAIL'); fails++; }

// ---- CHECK 3: differenza a basso vs alto regime (sanity dinamica) ----
// A basso regime la valvola segue bene la cam; ad alto regime diverge di più.
var loRpm = simulateCompliance3DOF(cam, 2000, realParams);
var hiRpm = simulateCompliance3DOF(cam, 9000, realParams);
function maxGapVsCam(valve) {
    var g = 0;
    for (var d = 1; d <= 720; d++) {
        var gg = (cam[d] || 0) - (valve[d] || 0);
        if (gg > g) g = gg;
    }
    return g;
}
var gapLo = maxGapVsCam(loRpm), gapHi = maxGapVsCam(hiRpm);
console.log('CHECK 3 (float cresce col regime):');
console.log('   max gap cam-valvola @2000 = ' + gapLo.toFixed(4) + ' mm,  @9000 = ' + gapHi.toFixed(4) + ' mm');
if (gapHi >= gapLo) { console.log('   PASS'); } else { console.log('   FAIL'); fails++; }

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO (3/3)'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
