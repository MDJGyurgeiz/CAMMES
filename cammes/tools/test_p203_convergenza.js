// =============================================================
//  test_p203_convergenza.js — P2-03 (audit esterno v3.4.3)
// =============================================================
//  Rilievo: lo stato di convergenza esportato era una spremitura con perdita.
//    residual: Math.max(compInfo.residualIn || 0, compInfo.residualEx || 0)
//  Tre difetti in una riga:
//   1. `|| 0` trasforma un residuo MAI MISURATO (null, caso INVALID_INPUT) in
//      "0.00e+0", cioe' in una convergenza perfetta;
//   2. Math.max schiaccia i due lati: non si sa piu' quale non converge;
//   3. si conservava il solo residuo di POSIZIONE, mentre il criterio guarda
//      anche la VELOCITA'.
//
//  Scritto PRIMA del fix: sulla v3.4.3 riassuntoConvergenza non esiste.
//
//  Uso: node tools/test_p203_convergenza.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' P2-03 - convergenza esportata senza perdita di informazione');
console.log('=============================================================');

check('riassuntoConvergenza esportata', typeof M.riassuntoConvergenza === 'function');
check('fmtResiduo esportata', typeof M.fmtResiduo === 'function');
if (typeof M.riassuntoConvergenza !== 'function') { console.log('\nRISULTATO: 2 FALLITI\n'); process.exit(1); }

// ---------------- il caso che il vecchio codice falsificava ----------------
console.log('--- residuo MAI misurato: "non calcolato", non zero ---');
var invalido = M.riassuntoConvergenza(
    { status: 'INVALID_INPUT', converged: false, residualX: null, residualV: null, cyclesRun: 0, tolX: null, tolV: null },
    { status: 'INVALID_INPUT', converged: false, residualX: null, residualV: null, cyclesRun: 0, tolX: null, tolV: null });
check('stato aggregato INVALID_INPUT', invalido.status === 'INVALID_INPUT', invalido.status);
check('il residuo resta null, NON diventa 0',
    invalido.residualXIn === null && invalido.residualXEx === null,
    'in=' + invalido.residualXIn + ' ex=' + invalido.residualXEx);
check('il vecchio Math.max(x || 0) avrebbe dato 0 (prova del difetto)',
    Math.max(invalido.residualXIn || 0, invalido.residualXEx || 0) === 0);
check('fmtResiduo dice "non calcolato"', M.fmtResiduo(null, 1e-6) === 'non calcolato', M.fmtResiduo(null, 1e-6));
check('criterio dichiarato "non calcolato"', invalido.criterioFallito === 'non calcolato', invalido.criterioFallito);

// ---------------- i due lati non si schiacciano ----------------
console.log('--- si sa QUALE lato non converge ---');
var soloScarico = M.riassuntoConvergenza(
    { status: 'CONVERGED', converged: true, residualX: 1e-9, residualV: 1e-7, cyclesRun: 3, tolX: 1e-6, tolV: 1e-4 },
    { status: 'NON_CONVERGED', converged: false, residualX: 5e-4, residualV: 2e-2, cyclesRun: 12, tolX: 1e-6, tolV: 1e-4 });
check('aggregato NON_CONVERGED', soloScarico.status === 'NON_CONVERGED', soloScarico.status);
check('lato fallito = scarico', soloScarico.latoFallito === 'scarico', soloScarico.latoFallito);
check('lo stato per lato e conservato',
    soloScarico.statusIn === 'CONVERGED' && soloScarico.statusEx === 'NON_CONVERGED');
check('i residui dei due lati restano distinti',
    soloScarico.residualXIn === 1e-9 && soloScarico.residualXEx === 5e-4,
    'in=' + soloScarico.residualXIn + ' ex=' + soloScarico.residualXEx);
check('cicli per lato conservati', soloScarico.cyclesIn === 3 && soloScarico.cyclesEx === 12);

var soloAsp = M.riassuntoConvergenza(
    { status: 'NON_CONVERGED', converged: false, residualX: 9e-5, residualV: 1e-7, cyclesRun: 12, tolX: 1e-6, tolV: 1e-4 },
    { status: 'CONVERGED', converged: true, residualX: 2e-9, residualV: 3e-8, cyclesRun: 4, tolX: 1e-6, tolV: 1e-4 });
check('lato fallito = aspirazione', soloAsp.latoFallito === 'aspirazione', soloAsp.latoFallito);
var entrambi = M.riassuntoConvergenza(
    { status: 'NON_CONVERGED', converged: false, residualX: 9e-5, residualV: 1e-7, cyclesRun: 12, tolX: 1e-6, tolV: 1e-4 },
    { status: 'NON_CONVERGED', converged: false, residualX: 8e-5, residualV: 1e-7, cyclesRun: 12, tolX: 1e-6, tolV: 1e-4 });
check('lato fallito = entrambi', entrambi.latoFallito === 'entrambi', entrambi.latoFallito);

// ---------------- il criterio di velocita non sparisce ----------------
console.log('--- fallimento sulla sola VELOCITA: dichiarato ---');
var soloVel = M.riassuntoConvergenza(
    { status: 'NON_CONVERGED', converged: false, residualX: 1e-9, residualV: 5e-2, cyclesRun: 12, tolX: 1e-6, tolV: 1e-4 },
    { status: 'CONVERGED', converged: true, residualX: 1e-9, residualV: 1e-7, cyclesRun: 3, tolX: 1e-6, tolV: 1e-4 });
check('criterio fallito = velocita', soloVel.criterioFallito === 'velocita', soloVel.criterioFallito);
check('il residuo di posizione e DENTRO tolleranza (era la contraddizione apparente)',
    soloVel.residualXIn < soloVel.tolX, soloVel.residualXIn + ' < ' + soloVel.tolX);
check('il residuo di velocita e conservato ed e FUORI tolleranza',
    soloVel.residualVIn === 5e-2 && soloVel.residualVIn > soloVel.tolV,
    soloVel.residualVIn + ' > ' + soloVel.tolV);
var soloPos = M.riassuntoConvergenza(
    { status: 'NON_CONVERGED', converged: false, residualX: 5e-4, residualV: 1e-7, cyclesRun: 12, tolX: 1e-6, tolV: 1e-4 },
    { status: 'CONVERGED', converged: true, residualX: 1e-9, residualV: 1e-7, cyclesRun: 3, tolX: 1e-6, tolV: 1e-4 });
check('criterio fallito = posizione', soloPos.criterioFallito === 'posizione', soloPos.criterioFallito);
var duplice = M.riassuntoConvergenza(
    { status: 'NON_CONVERGED', converged: false, residualX: 5e-4, residualV: 5e-2, cyclesRun: 12, tolX: 1e-6, tolV: 1e-4 },
    { status: 'CONVERGED', converged: true, residualX: 1e-9, residualV: 1e-7, cyclesRun: 3, tolX: 1e-6, tolV: 1e-4 });
check('criterio fallito = entrambi', duplice.criterioFallito === 'entrambi', duplice.criterioFallito);

// ---------------- caso nominale ----------------
console.log('--- caso convergente: nessun allarme ---');
var ok2 = M.riassuntoConvergenza(
    { status: 'CONVERGED', converged: true, residualX: 1e-9, residualV: 1e-7, cyclesRun: 3, tolX: 1e-6, tolV: 1e-4 },
    { status: 'CONVERGED', converged: true, residualX: 2e-9, residualV: 2e-7, cyclesRun: 3, tolX: 1e-6, tolV: 1e-4 });
check('stato CONVERGED', ok2.status === 'CONVERGED');
check('nessun lato fallito', ok2.latoFallito === null, String(ok2.latoFallito));
check('nessun criterio fallito', ok2.criterioFallito === null, String(ok2.criterioFallito));
check('fmtResiduo formatta col riferimento alla tolleranza',
    /^1\.00e-9 \(tolleranza 1e-6\)$/.test(M.fmtResiduo(1e-9, 1e-6)), M.fmtResiduo(1e-9, 1e-6));

// ---------------- il solver vero, non solo oggetti finti ----------------
console.log('--- collegato ai solver reali ---');
var crank = new Array(721);
for (var d = 1; d <= 720; d++) { var x = (d - 460) / 200; crank[d] = (x > -1 && x < 1) ? 8 * 0.5 * (1 + Math.cos(Math.PI * x)) : 0; }
var base = { massEqG: 95, kTrainN_mm: 6000, kSpringN_mm: 45, F0N: 320, dampingRatio: 0.06 };
var vero = M.riassuntoConvergenza(
    M.simulateCompliance(crank, 6000, base),
    M.simulateCompliance(crank, 6000, base));
check('su un caso reale convergente: CONVERGED e residui finiti',
    vero.status === 'CONVERGED' && isFinite(vero.residualXIn) && isFinite(vero.residualVIn),
    'x=' + vero.residualXIn + ' v=' + vero.residualVIn);
var veroInvalido = M.riassuntoConvergenza(
    M.simulateCompliance(crank, 0, {}),
    M.simulateCompliance(crank, 6000, base));
check('rpm 0 su un lato: INVALID_INPUT aggregato',
    veroInvalido.status === 'INVALID_INPUT', veroInvalido.status);

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: residui per lato e per criterio, lato e criterio falliti');
console.log('dichiarati, un residuo mai misurato resta "non calcolato".\n');
