// =============================================================
//  test_dyn02_zero_default.js — DYN-02 (controrevisione v3.4.1)
// =============================================================
//  Lo zero ESPLICITO è un valore valido per i parametri che lo
//  ammettono (damping 0 = sistema non smorzato): il pattern
//  `Number(x) || default` lo sostituiva silenziosamente col default
//  (0 → 0.06 nei solver e nei punti di raccolta UI).
//
//  Questo test è stato scritto PRIMA del fix: sulla v3.4.1 fallisce
//  (finiteOr non esiste; damping 0 identico a damping 0.06).
//
//  Nota: la verifica end-to-end passava per `simulateSpringSurge`. Col
//  modello di surge rimosso, il punto di misura si è spostato sui solver di
//  cedevolezza, che prendono lo stesso parametro. La garanzia è la stessa.
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

// --- end-to-end sui solver di cedevolezza ---
//  Questa parte passava per `simulateSpringSurge`, rimosso col modello di
//  surge. La garanzia DYN-02 NON e' stata tolta: e' stata spostata sui solver
//  che restano, che prendono lo stesso `dampingRatio`. Cosi' il punto di
//  misura e' un solver che il programma usa davvero.
var cp = { massEqG: 90, kTrainN_mm: 5000, kSpringN_mm: 30, F0N: 200,
           massEqIntermediateG: 60, kPushrodN_mm: 800, massSeatG: 15, kSeatN_mm: 80000 };
function scartoMax(a, b) {
    var d = 0;
    for (var i = 1; i <= 720; i++) d = Math.max(d, Math.abs((a[i] || 0) - (b[i] || 0)));
    return d;
}
function alzataMax(a) {
    var m = 0;
    for (var i = 1; i <= 720; i++) if ((a[i] || 0) > m) m = a[i];
    return m;
}

[['1-DOF', M.simulateCompliance], ['3-DOF', M.simulateCompliance3DOF]].forEach(function (par) {
    var nome = par[0], solver = par[1];
    console.log('--- solver ' + nome + ': damping 0 resta 0 end-to-end ---');
    var v0     = solver(lift, 9000, Object.assign({ dampingRatio: 0 }, cp));
    var v06    = solver(lift, 9000, Object.assign({ dampingRatio: 0.06 }, cp));
    var vAssen = solver(lift, 9000, Object.assign({}, cp));
    var vTesto = solver(lift, 9000, Object.assign({ dampingRatio: 'abc' }, cp));
    check(nome + ': damping 0 NON produce lo stesso moto di 0.06',
        scartoMax(v0, v06) > 1e-6, 'scarto max ' + scartoMax(v0, v06).toFixed(6) + ' mm');
    check(nome + ': non smorzato oscilla ALMENO quanto smorzato',
        alzataMax(v0) >= alzataMax(v06) - 1e-9,
        'picco 0 = ' + alzataMax(v0).toFixed(4) + ' vs 0.06 = ' + alzataMax(v06).toFixed(4));
    check(nome + ': parametro ASSENTE -> default 0.06 (identico all esplicito)',
        scartoMax(vAssen, v06) === 0);
    check(nome + ': parametro INVALIDO (testo) -> default 0.06',
        scartoMax(vTesto, v06) === 0);
});

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: lo zero esplicito sopravvive end-to-end (helper unico');
console.log('finiteOr) su 1-DOF e 3-DOF, e il default vale solo per un');
console.log('parametro assente o invalido.\n');
