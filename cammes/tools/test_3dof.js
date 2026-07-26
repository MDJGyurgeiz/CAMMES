// =============================================================
//  test_3dof.js — regressione per simulateCompliance3DOF
// =============================================================
// Importa i solver 2-DOF e 3-DOF da lib/cammes-math.js (la libreria
// condivisa usata anche dal browser) e verifica:
//   1) LIMITE RIGIDO: con sede quasi-rigida (k_seat enorme, m3 piccola) il
//      3-DOF deve coincidere col 2-DOF nella fase di alta alzata, dove il
//      valve float è significativo. (La micro-oscillazione vicino alla sede
//      è il NUOVO comportamento atteso e non viene confrontata stretta.)
//   2) ROBUSTEZZA: con sede realistica ad alto regime, output finito (no
//      NaN/Infinity) e bounded.
//
// Uso:  node cammes/tools/test_3dof.js
// Exit code 0 = tutti i check passano, 1 = fallimento.

var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var simulateCompliance2DOF = M.simulateCompliance2DOF;
var simulateCompliance3DOF = M.simulateCompliance3DOF;

if (typeof simulateCompliance3DOF !== 'function') {
    console.error('FAIL: simulateCompliance3DOF non esportata da lib/cammes-math.js');
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

// ---- CHECK 4: pivot bilanciere — ORACOLO FISICO (audit v3.4.3 P1-06) ----
// Il controllo precedente verificava solo che "il parametro cambiasse
// qualcosa", e per questo NON si accorgeva che cambiava nel verso sbagliato:
// la molla del perno era applicata alla coordinata di lavoro del bilanciere,
// quindi irrigidire il perno lo INCHIODAVA (perno 20.000 -> valvola 0,34 mm
// invece di 9,69) e il distacco risultava 0 con semaforo verde.
// Il modello corretto richiede una quarta coordinata non ancora validata:
// il parametro e' quindi IGNORATO, e questo oracolo lo verifica in positivo.
// Requisito fisico: un perno piu' rigido non puo' ridurre l'alzata, e il
// limite di perno infinitamente rigido deve coincidere col perno fermo.
var noPivot = simulateCompliance3DOF(cam, rpm2, realParams);
function piccoCon(kp) {
    var pp = Object.assign({}, realParams); pp.kPivotN_mm = kp;
    var v = simulateCompliance3DOF(cam, rpm2, pp);
    var m = 0; for (var i = 1; i <= 720; i++) if ((v[i]||0) > m) m = v[i];
    return m;
}
var piccoBase = 0;
for (var nb = 1; nb <= 720; nb++) if ((noPivot[nb]||0) > piccoBase) piccoBase = noPivot[nb];
var p20k = piccoCon(20000), p1M = piccoCon(1000000);
var dichiarato = simulateCompliance3DOF(cam, rpm2,
    Object.assign({}, realParams, { kPivotN_mm: 20000 })).kPivotIgnorato;
console.log('CHECK 4 (pivot bilanciere - oracolo fisico):');
console.log('   picco valvola: perno fermo = ' + piccoBase.toFixed(3) +
            ' | 20.000 = ' + p20k.toFixed(3) + ' | 1.000.000 = ' + p1M.toFixed(3) + ' mm');
console.log('   il solver dichiara di ignorare il parametro: ' + dichiarato);
if (p20k > piccoBase * 0.9 && p1M > piccoBase * 0.9 && dichiarato === true) {
    console.log('   PASS');
} else { console.log('   FAIL'); fails++; }

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO (4/4)'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
