// =============================================================
//  test_baseline.js — regressione per removeCamBaseline (correzione
//  baseline/eccentricità del cerchio base), estratta da analisi.html.
// =============================================================
//  Invarianti:
//   (1) camma PULITA (base = 0) → no-op (output ≈ input, picco preservato)
//   (2) camma + eccentricità e·cosθ → la base torna a ~0 e il profilo
//       recuperato ≈ camma pulita (la 1ª armonica viene rimossa esattamente)
//   (3) file VW scarico REALE → la base (fuori dal lobo) scende da ~0.2 a ~0,
//       picco preservato entro pochi %.
//
//  Uso:  node cammes/tools/test_baseline.js     (exit 0 = ok)

var fs = require('fs'), path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var removeCamBaseline = M.removeCamBaseline;
// la lib scrive lo stato diagnostico (_lastBaselineAmp) sul global reale
var window = global;

var DEG = Math.PI / 180, PEAK = 8.0;
function cleanCam() {
    var a = new Array(361); a[0] = 0;
    for (var t = 1; t <= 360; t++) {
        if (t >= 100 && t <= 260) { var u = (t - 100) / 160; a[t] = PEAK * Math.pow(Math.sin(Math.PI * u), 2); }
        else a[t] = 0;
    }
    return a;
}
function peakOf(a) { var m = 0; for (var i = 1; i <= 360; i++) if ((a[i] || 0) > m) m = a[i]; return m; }
function isLobe(t) { return t >= 95 && t <= 265; }   // regione lobo (per misurare la base)
function baseMaxAbs(a) { var m = 0; for (var i = 1; i <= 360; i++) if (!isLobe(i)) m = Math.max(m, Math.abs(a[i] || 0)); return m; }

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
console.log('=============================================================');
console.log(' REGRESSIONE removeCamBaseline (baseline / eccentricità)');
console.log('=============================================================');

// (1) camma pulita → no-op
var clean = cleanCam();
var c1 = removeCamBaseline(clean);
var dMax = 0; for (var i = 1; i <= 360; i++) dMax = Math.max(dMax, Math.abs((c1[i] || 0) - (clean[i] || 0)));
console.log('PULITA (base = 0):');
check('no-op: output ≈ input', dMax < 0.02, 'maxΔ ' + dMax.toFixed(4) + ' mm');
check('picco preservato', Math.abs(peakOf(c1) - PEAK) < 0.02, 'picco ' + peakOf(c1).toFixed(3));

// (2) camma + eccentricità e·cosθ
var ecc = 0.25, eccCam = new Array(361); eccCam[0] = 0;
for (i = 1; i <= 360; i++) eccCam[i] = (clean[i] || 0) + ecc * Math.cos(i * DEG);
var c2 = removeCamBaseline(eccCam);
var recMax = 0; for (i = 1; i <= 360; i++) recMax = Math.max(recMax, Math.abs((c2[i] || 0) - (clean[i] || 0)));
console.log('ECCENTRICA (+' + ecc + '·cosθ):');
check('base torna a ~0', baseMaxAbs(c2) < 0.03, 'base maxAbs ' + baseMaxAbs(c2).toFixed(4) + ' (era ' + baseMaxAbs(eccCam).toFixed(3) + ')');
check('profilo recuperato ≈ camma pulita', recMax < 0.03, 'maxΔ vs pulita ' + recMax.toFixed(4) + ' mm');
check('eccentricità stimata ≈ ' + ecc, Math.abs((window._lastBaselineAmp || 0) - ecc) < 0.03, 'stima ' + (window._lastBaselineAmp || 0).toFixed(3) + ' mm');

// (3) file VW scarico reale
var fp = path.join(__dirname, '..', 'prove', 'VW-kr1_8-SC_alz.scr');
if (fs.existsSync(fp)) {
    var L = fs.readFileSync(fp, 'utf8').split(/\r?\n/), raw = new Array(361);
    for (i = 1; i <= 360; i++) { var p = (L[i] || '').split(','); raw[i] = Number(p[1]) || 0; }
    // base reale dello scarico: fuori dal lobo (~deg 106..303)
    function isLobeVW(t) { return t >= 106 && t <= 303; }
    function baseMaxVW(a) { var m = 0; for (var k = 1; k <= 360; k++) if (!isLobeVW(k)) m = Math.max(m, Math.abs(a[k] || 0)); return m; }
    window._lastBaselineAmp = 0;
    var corr = removeCamBaseline(raw);
    console.log('VW SCARICO reale:');
    check('base scende verso 0', baseMaxVW(corr) < 0.06, 'base ' + baseMaxVW(raw).toFixed(3) + ' → ' + baseMaxVW(corr).toFixed(3) + ' mm');
    check('picco preservato (entro 0.2 mm)', Math.abs(peakOf(corr) - peakOf(raw)) < 0.2, 'picco ' + peakOf(raw).toFixed(2) + ' → ' + peakOf(corr).toFixed(2) + ' (ecc ~±' + (window._lastBaselineAmp || 0).toFixed(2) + ')');
} else {
    console.log('VW SCARICO reale: (file assente, skip)');
}

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
