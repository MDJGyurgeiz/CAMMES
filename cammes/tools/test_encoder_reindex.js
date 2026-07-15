// =============================================================
//  test_encoder_reindex.js — regressione per reindexByEncoder (bonifica a:
//  re-indicizzazione del profilo sulla posizione reale dell'encoder).
//  Estratta da alzata.html.
// =============================================================
//  Invarianti:
//   (1) encoder lineare (no slittamento) → output = profilo a passi (identità)
//   (2) offset costante dell'encoder → invariato (l'offset è riferito via E0)
//   (3) direzione invertita (span negativo) → identità (segno gestito)
//   (4) slittamento (encoder scala 0.95) → output DIVERSO, valido (360 finiti,
//       niente null), picco preservato, divergenza riportata > 5°
//   (5) nessun dato encoder → ritorna null (il chiamante tiene i passi)
//
//  Uso:  node cammes/tools/test_encoder_reindex.js   (exit 0 = ok)

var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var reindexByEncoder = M.reindexByEncoder;
// la lib scrive lo stato diagnostico (_encReindexDivergence) sul global reale
var window = global;

var PEAK = 8.0;
function bumpCam() {                       // bump liscio su step-gradi 150..210
    var a = new Array(361); a[0] = 0;
    for (var t = 1; t <= 360; t++) {
        if (t >= 150 && t <= 210) { var u = (t - 150) / 60; a[t] = PEAK * Math.pow(Math.sin(Math.PI * u), 2); }
        else a[t] = 0;
    }
    return a;
}
function peakOf(a) { var m = 0; for (var i = 1; i <= 360; i++) if ((a[i] || 0) > m) m = a[i]; return m; }
function maxDelta(a, b) { var m = 0; for (var i = 1; i <= 360; i++) m = Math.max(m, Math.abs((a[i] || 0) - (b[i] || 0))); return m; }
function allFinite(a) { for (var i = 1; i <= 360; i++) { if (a[i] === null || !isFinite(a[i])) return false; } return true; }

var pd = bumpCam();
var fails = 0;
function check(label, cond, detail) { console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : '')); if (!cond) fails++; }
function encFrom(fn) { var e = new Array(361); for (var d = 1; d <= 360; d++) e[d] = fn(d); return e; }

console.log('=============================================================');
console.log(' REGRESSIONE reindexByEncoder (indicizzazione su encoder)');
console.log('=============================================================');

// (1) lineare 4 cnt/° → identità
window._encReindexDivergence = -1;
var o1 = reindexByEncoder(pd, encFrom(function (d) { return (d - 1) * 4; }));
check('encoder lineare → identità', o1 && maxDelta(o1, pd) < 0.05, o1 ? 'maxΔ ' + maxDelta(o1, pd).toFixed(4) + ', div ' + window._encReindexDivergence.toFixed(1) + '°' : 'null');

// (2) offset costante → invariato
var o2 = reindexByEncoder(pd, encFrom(function (d) { return (d - 1) * 4 + 12345; }));
check('offset costante → invariato', o2 && maxDelta(o2, pd) < 0.05, o2 ? 'maxΔ ' + maxDelta(o2, pd).toFixed(4) : 'null');

// (3) direzione invertita → identità
var o3 = reindexByEncoder(pd, encFrom(function (d) { return -(d - 1) * 4; }));
check('direzione invertita → identità', o3 && maxDelta(o3, pd) < 0.05, o3 ? 'maxΔ ' + maxDelta(o3, pd).toFixed(4) : 'null');

// (4) slittamento (scala 0.95) → diverso, valido, picco preservato, divergenza>5
window._encReindexDivergence = 0;
var o4 = reindexByEncoder(pd, encFrom(function (d) { return Math.round((d - 1) * 4 * 0.95); }));
check('slittamento → output valido (360 finiti, no null)', o4 && allFinite(o4));
check('slittamento → output diverso dai passi', o4 && maxDelta(o4, pd) > 0.5, o4 ? 'maxΔ ' + maxDelta(o4, pd).toFixed(3) : 'null');
check('slittamento → picco preservato', o4 && Math.abs(peakOf(o4) - PEAK) < 0.3, o4 ? 'picco ' + peakOf(o4).toFixed(3) : 'null');
check('slittamento → divergenza riportata > 5°', window._encReindexDivergence > 5, 'div ' + window._encReindexDivergence.toFixed(1) + '°');

// (5) nessun encoder → null (fallback ai passi)
var o5 = reindexByEncoder(pd, new Array(361));
check('nessun dato encoder → null (fallback passi)', o5 === null);

// (6) AUDIT MAT-08: MEZZO giro encoder (2 cnt/° → span 718) NON è un giro:
// prima la soglia assoluta (>=360 cnt) lo accettava e ripiegava la camma
// su se stessa. Ora → null (il chiamante tiene i passi).
var o6 = reindexByEncoder(pd, encFrom(function (d) { return (d - 1) * 2; }));
check('mezzo giro (718 cnt) → RIFIUTATO (null)', o6 === null);

// (7) giro leggermente corto (90% = 1296 cnt, slittamento reale) → accettato
var o7 = reindexByEncoder(pd, encFrom(function (d) { return Math.round((d - 1) * 4 * 0.9); }));
check('giro al 90% (slittamento) → ancora accettato', o7 !== null);

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
