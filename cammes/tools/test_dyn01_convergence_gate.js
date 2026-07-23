// =============================================================
//  test_dyn01_convergence_gate.js — DYN-01 (controrevisione v3.4.1)
// =============================================================
//  I solver espongono converged=true/false ma il risultato non è
//  TIPIZZATO né correda tolleranza/residuo: il chiamante non può
//  distinguere "non converge" da "input invalido", e i consumatori
//  (sweep, optimizer, report) trattavano ogni punto come valido.
//
//  Richieste del handoff:
//   - risultato tipizzato CONVERGED / NON_CONVERGED / INVALID_INPUT;
//   - tolleranza e residuo esposti nel risultato (per lo snapshot);
//   - casi nominali/estremi REALI al posto dei check tautologici.
//
//  Questo test è stato scritto PRIMA del fix: sulla v3.4.1 fallisce
//  (status/tolleranze/residui assenti, input invalido non tipizzato).
//
//  Uso: node tools/test_dyn01_convergence_gate.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

// Profilo cam realistico: lobo 8 mm, flanchi cosinusoidali, su 720 gradi.
var crank = new Array(721);
for (var d = 1; d <= 720; d++) {
    var x = (d - 360) / 130;
    crank[d] = (x > -1 && x < 1) ? 8 * 0.5 * (1 + Math.cos(Math.PI * x)) : 0;
}

console.log('=============================================================');
console.log(' GATE DI CONVERGENZA TIPIZZATO - DYN-01');
console.log('=============================================================');

console.log('--- caso NOMINALE: converge entro tolleranza ---');
var nom = M.simulateCompliance(crank, 6000, { massEqG: 95, kTrainN_mm: 6000, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
check('status = CONVERGED', nom.status === 'CONVERGED', 'status=' + nom.status);
check('converged = true (compat v3)', nom.converged === true);
check('tolleranze esposte (tolX, tolV > 0)', nom.tolX > 0 && nom.tolV > 0,
    'tolX=' + nom.tolX + ' tolV=' + nom.tolV);
check('residuo esposto e DENTRO tolleranza', isFinite(nom.residualX) && isFinite(nom.residualV) &&
    nom.residualX <= nom.tolX && nom.residualV <= nom.tolV,
    'residX=' + nom.residualX + ' residV=' + nom.residualV);
check('cicli eseguiti dichiarati', nom.cyclesRun >= 3, 'cyclesRun=' + nom.cyclesRun);

// Oracle FISICO (non tautologico): al quasi-statico la valvola resta dietro
// la cam ESATTAMENTE della deflessione statica del treno (F0+k_molla*L)/k_train.
// NB: out[deg] e lo stato DOPO l'integrazione del grado -> confronto con
// cam[deg+1] per compensare lo shift di campionamento di 1 grado.
function devVsCam(sim) {
    var m = 0;
    for (var q = 1; q <= 720; q++) m = Math.max(m, Math.abs((sim[q] || 0) - crank[(q % 720) + 1]));
    return m;
}
var slow = M.simulateCompliance(crank, 500, { massEqG: 95, kTrainN_mm: 6000, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
var devMax = devVsCam(slow);
var devAnalytic = (320 + 45 * 8) / 6000;   // mm: deflessione statica a piena alzata
check('oracle quasi-statico (500 rpm): deviazione = deflessione statica +/-25%',
    slow.status === 'CONVERGED' && devMax > devAnalytic * 0.75 && devMax < devAnalytic * 1.25,
    'devMax=' + devMax.toFixed(4) + ' vs analitico=' + devAnalytic.toFixed(4) + ' mm');
var stiff = M.simulateCompliance(crank, 500, { massEqG: 95, kTrainN_mm: 60000, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
check('oracle rigidezza: treno 10x piu rigido -> deviazione almeno 5x minore',
    devVsCam(stiff) < devMax / 5, 'stiff=' + devVsCam(stiff).toFixed(4) + ' mm');
var fast = M.simulateCompliance(crank, 12000, { massEqG: 95, kTrainN_mm: 6000, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
check('oracle regime: 12000 rpm devia almeno 10x piu di 500 rpm (inerzia)',
    devVsCam(fast) > devMax * 10, 'fast=' + devVsCam(fast).toFixed(4) + ' mm');

console.log('--- caso ESTREMO: NON_CONVERGED dichiarato ---');
var ext = M.simulateCompliance(crank, 12000, { massEqG: 1000, kTrainN_mm: 5000, kSpringN_mm: 1, F0N: 20, dampingRatio: 0.001 });
check('status = NON_CONVERGED', ext.status === 'NON_CONVERGED', 'status=' + ext.status);
check('converged = false (compat v3)', ext.converged === false);
check('residuo FUORI tolleranza (spiega il perche)',
    isFinite(ext.residualX) && (ext.residualX > ext.tolX || ext.residualV > ext.tolV),
    'residX=' + ext.residualX + ' vs tolX=' + ext.tolX);

console.log('--- INPUT INVALIDO tipizzato (non mascherato da default) ---');
var bad1 = M.simulateCompliance(crank, 0, {});
check('rpm 0 -> INVALID_INPUT', bad1.status === 'INVALID_INPUT', 'status=' + bad1.status);
var bad2 = M.simulateCompliance(null, 6000, {});
check('profilo nullo -> INVALID_INPUT', bad2.status === 'INVALID_INPUT', 'status=' + bad2.status);
var bad3 = M.simulateCompliance(crank, 6000, { massEqG: 0 });
check('massa 0 esplicita -> INVALID_INPUT (non default 100 g)', bad3.status === 'INVALID_INPUT', 'status=' + bad3.status);
check('INVALID_INPUT: converged=false, nessun verdetto', bad1.converged === false && bad1.maxSeparation === 0);

console.log('--- 2-DOF e 3-DOF: stesso contratto tipizzato ---');
var nom2 = M.simulateCompliance2DOF(crank, 6000, { massEqG: 60, massEqIntermediateG: 50, kPushrodN_mm: 800, kTrainN_mm: 6000, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
check('2-DOF nominale: status CONVERGED + residuo entro tolleranza',
    nom2.status === 'CONVERGED' && nom2.residualX <= nom2.tolX, 'status=' + nom2.status + ' residX=' + nom2.residualX);
check('2-DOF: rpm 0 -> INVALID_INPUT', M.simulateCompliance2DOF(crank, 0, {}).status === 'INVALID_INPUT');
var nom3 = M.simulateCompliance3DOF(crank, 6000, { massEqG: 60, massEqIntermediateG: 50, massSeatG: 15, kPushrodN_mm: 800, kTrainN_mm: 6000, kSeatN_mm: 80000, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 });
check('3-DOF nominale: status CONVERGED + residuo entro tolleranza',
    nom3.status === 'CONVERGED' && nom3.residualX <= nom3.tolX, 'status=' + nom3.status + ' residX=' + nom3.residualX);
check('3-DOF: profilo nullo -> INVALID_INPUT', M.simulateCompliance3DOF(null, 6000, {}).status === 'INVALID_INPUT');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: i tre solver espongono un esito tipizzato');
console.log('(CONVERGED/NON_CONVERGED/INVALID_INPUT) con tolleranza, residuo');
console.log('e cicli; oracle fisico quasi-statico al posto dei check tautologici.\n');
