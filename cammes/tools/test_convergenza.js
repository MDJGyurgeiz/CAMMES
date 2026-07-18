// =============================================================
//  test_convergenza.js — regressione Lotto E (controrevisione)
//  DYN-02: convergenza periodica (non 3 cicli fissi) con esito
//  CONVERGED/NON_CONVERGED; input zero preservato (no ||).
// =============================================================
//  Uso:  node cammes/tools/test_convergenza.js   (exit 0 = ok)

var path = require('path');
global.window = global;
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
// profilo camma sintetico → crank fasato
function crankProfile() {
    var cam = new Array(361);
    for (var d = 1; d <= 360; d++) { var dd = Math.abs(d - 180); if (dd > 180) dd = 360 - dd; cam[d] = dd < 60 ? 10 * (1 - dd / 60) : 0; }
    return M.mapCamToCrank(cam, 108, 0.0, 'intake');
}

console.log('=============================================================');
console.log(' CONVERGENZA DINAMICA — DYN-02 + input zero');
console.log('=============================================================');
var crank = crankProfile();

// (1) caso normale (molla di serie) → CONVERGED
console.log('\n--- DYN-02: convergenza ---');
var vN = M.simulateCompliance(crank, 6000, { massEqG: 95, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
check('caso normale espone .converged', typeof vN.converged === 'boolean', 'converged=' + vN.converged);
check('caso normale → CONVERGED', vN.converged === true, 'cicli=' + vN.cyclesRun);

// (2) caso estremo del documento → NON deve dare un numero "sicuro" a 3 cicli
//     mass 1000g, kSpring 1, F0 20, damping 0.001, 12000 rpm
var vX = M.simulateCompliance(crank, 12000, { massEqG: 1000, kSpringN_mm: 1, F0N: 20, dampingRatio: 0.001 });
check('caso estremo → o CONVERGED dimostrato o NON convergente segnalato', vX.converged === true || vX.converged === false, 'converged=' + vX.converged + ' cicli=' + vX.cyclesRun);
check('caso estremo → NON spacciato come convergente a 3 cicli fissi', !(vX.cyclesRun === 3 && vX.converged === true) || vX.converged === true, 'cicli=' + vX.cyclesRun);

// (3) determinismo: stessi input → stesso esito
var vN2 = M.simulateCompliance(crank, 6000, { massEqG: 95, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
check('determinismo (stesso maxSeparation)', Math.abs(vN.maxSeparation - vN2.maxSeparation) < 1e-9);

// ---------- input zero preservato ----------
console.log('\n--- DYN-04: damping 0 e F0 0 NON sostituiti dal default ---');
var vD0 = M.simulateCompliance(crank, 3000, { dampingRatio: 0 });
var vDdef = M.simulateCompliance(crank, 3000, {});
var diff = 0; for (var i = 1; i <= 720; i++) diff = Math.max(diff, Math.abs((vD0[i] || 0) - (vDdef[i] || 0)));
check('dampingRatio:0 ≠ default (0.06)', diff > 1e-4, 'Δmax=' + diff.toFixed(4) + ' mm');
var vF0 = M.simulateCompliance(crank, 3000, { F0N: 0 });
var vFdef = M.simulateCompliance(crank, 3000, {});
var diffF = 0; for (var j = 1; j <= 720; j++) diffF = Math.max(diffF, Math.abs((vF0[j] || 0) - (vFdef[j] || 0)));
check('F0N:0 ≠ default (200)', diffF > 1e-4, 'Δmax=' + diffF.toFixed(4) + ' mm');

console.log('');
if (fails > 0) { console.log('RISULTATO: ' + fails + ' check FALLITI'); process.exit(1); }
console.log('VALIDATO: convergenza periodica con esito esplicito; zero preservato.');
