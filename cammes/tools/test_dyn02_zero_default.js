// =============================================================
//  test_dyn02_zero_default.js — DYN-02 (controrevisione v3.4.1)
// =============================================================
//  Lo zero ESPLICITO è un valore valido per i parametri che lo
//  ammettono (damping 0 = sistema non smorzato): il pattern
//  `Number(x) || default` lo sostituiva silenziosamente col default
//  (0 → 0.06 in simulateSpringSurge e nei punti di raccolta UI).
//
//  Questo test è stato scritto PRIMA del fix: sulla v3.4.1 fallisce
//  (finiteOr non esiste; surge con damping 0 identico a damping 0.06).
//
//  Uso: node tools/test_dyn02_zero_default.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' ZERO VALIDO vs DEFAULT - DYN-02');
console.log('=============================================================');

// --- helper unico: assente/invalido -> default, zero finito -> zero ---
console.log('--- finiteOr (helper unico) ---');
check('finiteOr esportato', typeof M.finiteOr === 'function');
if (typeof M.finiteOr === 'function') {
    check('finiteOr(0, 5) = 0 (zero numerico VALIDO)', M.finiteOr(0, 5) === 0);
    check("finiteOr('0', 5) = 0 (zero da campo testo VALIDO)", M.finiteOr('0', 5) === 0);
    check("finiteOr('', 5) = 5 (campo vuoto -> default)", M.finiteOr('', 5) === 5);
    check("finiteOr('  ', 5) = 5 (solo spazi -> default)", M.finiteOr('  ', 5) === 5);
    check('finiteOr(null, 5) = 5', M.finiteOr(null, 5) === 5);
    check('finiteOr(undefined, 5) = 5', M.finiteOr(undefined, 5) === 5);
    check('finiteOr(NaN, 5) = 5', M.finiteOr(NaN, 5) === 5);
    check("finiteOr('abc', 5) = 5", M.finiteOr('abc', 5) === 5);
    check('finiteOr(Infinity, 5) = 5 (non finito -> default)', M.finiteOr(Infinity, 5) === 5);
    check('finiteOr(1.25, 5) = 1.25', M.finiteOr(1.25, 5) === 1.25);
}

// --- profilo sintetico: lobo singolo 8 mm su 720 gradi motore ---
var lift = new Array(721);
for (var d = 1; d <= 720; d++) {
    var x = (d - 180) / 120;                       // lobo centrato a 180, semi-larghezza 120
    lift[d] = (x > -1 && x < 1) ? 8 * 0.5 * (1 + Math.cos(Math.PI * x)) : 0;
}

console.log('--- simulateSpringSurge: damping 0 resta 0 end-to-end ---');
var base = { kSpringN_mm: 30, springMassG: 55, springCoils: 12 };
var sDamped = M.simulateSpringSurge(lift, 7000, Object.assign({ dampingRatio: 0.06 }, base));
var sZero   = M.simulateSpringSurge(lift, 7000, Object.assign({ dampingRatio: 0 }, base));
var sAbsent = M.simulateSpringSurge(lift, 7000, Object.assign({}, base));
var sBad    = M.simulateSpringSurge(lift, 7000, Object.assign({ dampingRatio: 'abc' }, base));

check('damping 0 NON produce lo stesso risultato di 0.06',
    sZero.maxCoilAmpMm !== sDamped.maxCoilAmpMm,
    'zero=' + sZero.maxCoilAmpMm.toFixed(4) + ' vs 0.06=' + sDamped.maxCoilAmpMm.toFixed(4));
check('damping 0 (non smorzato) oscilla ALMENO quanto 0.06',
    sZero.maxCoilAmpMm >= sDamped.maxCoilAmpMm);
check('parametro ASSENTE -> default 0.06 (identico al caso esplicito)',
    sAbsent.maxCoilAmpMm === sDamped.maxCoilAmpMm);
check('parametro INVALIDO (testo) -> default 0.06',
    sBad.maxCoilAmpMm === sDamped.maxCoilAmpMm);

// --- risultato a cicli fissi dichiarato PRELIMINARE (no convergenza) ---
console.log('--- onesta del modello: cicli fissi = preliminare ---');
check('surge espone preliminary=true (nessuna verifica di convergenza)',
    sDamped.preliminary === true);
check('surge espone i cicli di assestamento usati', sDamped.settleCycles >= 1,
    'settleCycles=' + sDamped.settleCycles);

// --- solver compliance: _num gia corretto, guardia di regressione ---
console.log('--- solver 1-DOF: zero gia rispettato (regressione) ---');
var cp = { massEqG: 90, kTrainN_mm: 5000, kSpringN_mm: 30, F0N: 200 };
var v0  = M.simulateCompliance(lift, 9000, Object.assign({ dampingRatio: 0 }, cp));
var v06 = M.simulateCompliance(lift, 9000, Object.assign({ dampingRatio: 0.06 }, cp));
var diff = 0;
for (var i = 1; i <= 720; i++) diff = Math.max(diff, Math.abs((v0[i] || 0) - (v06[i] || 0)));
check('1-DOF: damping 0 e 0.06 producono alzate diverse', diff > 1e-6, 'maxDiff=' + diff.toFixed(6) + ' mm');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: lo zero esplicito sopravvive end-to-end (helper unico');
console.log('finiteOr), il default vale solo per assente/invalido e il surge');
console.log('a cicli fissi si dichiara preliminare.\n');
