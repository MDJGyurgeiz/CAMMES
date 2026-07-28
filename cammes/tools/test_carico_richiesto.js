// =============================================================
//  test_carico_richiesto.js — carico molla RICHIESTO dalla camma
// =============================================================
//  Chiesto dal proprietario: invece di chiedere quale molla hai e dare un
//  verdetto, dire quale CARICO SERVE a ogni alzata, dati la camma, la massa
//  alterna e i giri massimi.
//
//  Perche' conta: usa solo dati che l'officina ha davvero. La camma si misura,
//  la massa si pesa, i giri si decidono. Nessuna molla da indovinare — che e'
//  il difetto che abbiamo passato tutta la sessione a togliere.
//
//  Fisica: dove la valvola DECELERA, la forza che la tiene a contatto con la
//  camma la deve dare la molla (la camma sa solo spingere).
//      carico richiesto(theta) = S * m * |a(theta)|   dove a(theta) < 0
//  A una stessa alzata corrispondono due punti del ciclo (fianco di apertura e
//  di chiusura) con accelerazioni diverse: si prende la peggiore.
//
//  Oracolo ANALITICO: su un lobo cosinusoidale
//      L(t) = h/2 * (1 + cos(pi t / W))        [t = gradi dal picco]
//      L''(t) = -(h/2)(pi/W)^2 cos(pi t / W)   [mm/grado^2]
//  la decelerazione massima e' al picco (t=0): L'' = -(h/2)(pi/W)^2.
//  Quindi al picco il carico richiesto e' esattamente
//      S * m[kg] * (h/2)(pi/W)^2 * (6 rpm)^2 * 1e-3   [N]
//
//  Uso: node tools/test_carico_richiesto.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' CARICO MOLLA RICHIESTO DALLA CAMMA');
console.log('=============================================================');

check('caricoMollaRichiesto esportata', typeof M.caricoMollaRichiesto === 'function');
if (typeof M.caricoMollaRichiesto !== 'function') { console.log('\nRISULTATO: 1 FALLITO\n'); process.exit(1); }

// ---------- lobo cosinusoidale, alzata valvola in gradi MANOVELLA ----------
var H = 10, W = 120;            // h = 10 mm, semiampiezza 120 gradi manovella
var PICCO = 360;                // picco al PMS, comodo per i conti
var lift = new Array(721), acc = new Array(721);
for (var d = 1; d <= 720; d++) {
    var t = d - PICCO;
    if (t > 360) t -= 720; if (t < -360) t += 720;
    if (Math.abs(t) < W) {
        lift[d] = H / 2 * (1 + Math.cos(Math.PI * t / W));
        acc[d] = -(H / 2) * Math.pow(Math.PI / W, 2) * Math.cos(Math.PI * t / W);
    } else { lift[d] = 0; acc[d] = 0; }
}

var MASSA_G = 95, RPM = 7000, S = 1.0;
var r = M.caricoMollaRichiesto(lift, acc, MASSA_G, RPM, { sicurezza: S });

// ---------- oracolo al picco ----------
var omega = 6 * RPM;                                     // gradi/s
var accPiccoDeg = (H / 2) * Math.pow(Math.PI / W, 2);    // mm/grado^2, modulo
var attesoPicco = S * (MASSA_G / 1000) * accPiccoDeg * omega * omega * 1e-3;
console.log('--- confronto con la derivata analitica al picco ---');
console.log('        atteso al picco: ' + attesoPicco.toFixed(2) + ' N');
var alPicco = r.punti[r.punti.length - 1];               // ultimo punto = alzata massima
check('il carico all alzata massima coincide con l analitico (+/-2%)',
    Math.abs(alPicco.forzaN - attesoPicco) < attesoPicco * 0.02,
    'ottenuto ' + alPicco.forzaN.toFixed(2) + ' N a ' + alPicco.alzataMm.toFixed(2) + ' mm');
check('il punto vincolante e all alzata massima (dove decelera piu forte)',
    Math.abs(r.vincolante.alzataMm - H) < 0.05,
    r.vincolante.alzataMm.toFixed(2) + ' mm, ' + r.vincolante.forzaN.toFixed(1) + ' N');

// ---------- scaling fisico ----------
console.log('--- lo scaling e quello della fisica ---');
var r2 = M.caricoMollaRichiesto(lift, acc, MASSA_G, RPM * 2, { sicurezza: S });
check('raddoppiando i giri il carico quadruplica (va con rpm^2)',
    Math.abs(r2.vincolante.forzaN / r.vincolante.forzaN - 4) < 0.02,
    'rapporto ' + (r2.vincolante.forzaN / r.vincolante.forzaN).toFixed(3));
var r3 = M.caricoMollaRichiesto(lift, acc, MASSA_G * 2, RPM, { sicurezza: S });
check('raddoppiando la massa il carico raddoppia (lineare in m)',
    Math.abs(r3.vincolante.forzaN / r.vincolante.forzaN - 2) < 0.02,
    'rapporto ' + (r3.vincolante.forzaN / r.vincolante.forzaN).toFixed(3));
var r4 = M.caricoMollaRichiesto(lift, acc, MASSA_G, RPM, { sicurezza: 1.3 });
check('il margine di sicurezza moltiplica, non altro',
    Math.abs(r4.vincolante.forzaN / r.vincolante.forzaN - 1.3) < 1e-9,
    'rapporto ' + (r4.vincolante.forzaN / r.vincolante.forzaN).toFixed(6));

// ---------- la tabella per alzate ----------
console.log('--- tabella alle alzate richieste ---');
var rT = M.caricoMollaRichiesto(lift, acc, MASSA_G, RPM, { sicurezza: 1.0, alzate: [0, 1, 3, 5] });
check('un punto per ogni alzata chiesta, piu l alzata massima',
    rT.punti.length === 5, rT.punti.length + ' punti: ' + rT.punti.map(function (p) { return p.alzataMm.toFixed(1); }).join(', '));
check('le alzate sono in ordine crescente',
    rT.punti.every(function (p, i) { return i === 0 || p.alzataMm >= rT.punti[i - 1].alzataMm; }));
check('ogni punto dice a quale grado si verifica',
    rT.punti.every(function (p) { return isFinite(p.gradi); }),
    rT.punti.map(function (p) { return p.alzataMm.toFixed(1) + 'mm@' + p.gradi + '°'; }).join(' '));
// su un lobo simmetrico la decelerazione cresce con l alzata: carico monotono
check('su lobo simmetrico il carico cresce con l alzata',
    rT.punti.every(function (p, i) { return i === 0 || p.forzaN >= rT.punti[i - 1].forzaN - 1e-9; }),
    rT.punti.map(function (p) { return p.forzaN.toFixed(0) + 'N'; }).join(' '));
// alzata oltre il massimo: non si inventa un punto
var rOltre = M.caricoMollaRichiesto(lift, acc, MASSA_G, RPM, { alzate: [0, 5, 50] });
check('un alzata oltre il massimo della camma viene scartata, non inventata',
    rOltre.punti.every(function (p) { return p.alzataMm <= H + 0.01; }),
    rOltre.punti.map(function (p) { return p.alzataMm.toFixed(1); }).join(', '));

// ---------- il fianco peggiore ----------
console.log('--- a pari alzata si prende il fianco peggiore ---');
// lobo ASIMMETRICO: chiusura piu' brusca dell'apertura
var liftA = new Array(721), accA = new Array(721);
for (var q = 1; q <= 720; q++) {
    var u = q - PICCO;
    if (u > 360) u -= 720; if (u < -360) u += 720;
    var Wq = (u < 0) ? 160 : 90;            // apertura larga, chiusura stretta
    if (Math.abs(u) < Wq) {
        liftA[q] = H / 2 * (1 + Math.cos(Math.PI * u / Wq));
        accA[q] = -(H / 2) * Math.pow(Math.PI / Wq, 2) * Math.cos(Math.PI * u / Wq);
    } else { liftA[q] = 0; accA[q] = 0; }
}
// A 8 mm (sopra meta' alzata) la valvola decelera su entrambi i fianchi, ma il
// fianco stretto molto di piu': il rapporto e' (160/90)^2 = 3,16.
var rA = M.caricoMollaRichiesto(liftA, accA, MASSA_G, RPM, { sicurezza: 1.0, alzate: [8] });
var p8 = rA.punti[0];
// `gradi` e' riferito al PMS (indice - 360), non all'indice: il picco e' a 0.
check('il punto a 8 mm cade sul fianco STRETTO, dopo il picco',
    p8.gradi > 0, '8 mm a ' + p8.gradi + ' gradi dal PMS (picco a 0)');
// oracolo: L = 8 -> cos(pi u / W) = 0,6 -> acc = -(H/2)(pi/W)^2 * 0,6
var attesoStretto = (MASSA_G / 1000) * (H / 2) * Math.pow(Math.PI / 90, 2) * 0.6 * omega * omega * 1e-3;
check('e il valore e quello del fianco stretto (+/-8%)',
    Math.abs(p8.forzaN - attesoStretto) < attesoStretto * 0.08,
    'ottenuto ' + p8.forzaN.toFixed(1) + ' N, atteso ~' + attesoStretto.toFixed(1) + ' N');
var attesoLargo = (MASSA_G / 1000) * (H / 2) * Math.pow(Math.PI / 160, 2) * 0.6 * omega * omega * 1e-3;
check('e NON quello del fianco largo (che sarebbe 3,16 volte meno)',
    p8.forzaN > attesoLargo * 2, 'fianco largo darebbe ~' + attesoLargo.toFixed(1) + ' N');

// --- fatto fisico che il conto rivela, e che va detto a chi legge ---
console.log('--- sotto meta alzata la molla non e il vincolo ---');
var rBasso = M.caricoMollaRichiesto(lift, acc, MASSA_G, RPM, { sicurezza: 1.0, alzate: [1, 3, 4] });
check('su lobo cosinusoidale sotto meta alzata il requisito e nullo',
    rBasso.punti.filter(function (p) { return p.alzataMm < H / 2; })
           .every(function (p) { return p.forzaN < 1; }),
    rBasso.punti.map(function (p) { return p.alzataMm.toFixed(0) + 'mm:' + p.forzaN.toFixed(1) + 'N'; }).join(' '));
check('perche la camma ACCELERA la valvola: per questo una specifica' +
      ' vera aggiunge un requisito separato di carico a valvola chiusa',
    acc[360 - 98] > 0, 'acc a 1 mm = ' + acc[360 - 98].toExponential(2) + ' mm/grado^2');

// ---------- input non validi ----------
console.log('--- input non validi: niente numeri inventati ---');
check('massa 0 -> non valutabile', M.caricoMollaRichiesto(lift, acc, 0, RPM).valutabile === false);
check('rpm 0 -> non valutabile', M.caricoMollaRichiesto(lift, acc, MASSA_G, 0).valutabile === false);
check('curva nulla -> non valutabile', M.caricoMollaRichiesto(null, null, MASSA_G, RPM).valutabile === false);
check('caso valido -> valutabile', r.valutabile === true);
check('il risultato dichiara le proprie ipotesi',
    typeof r.ipotesi === 'string' && /rigid|cedevol/i.test(r.ipotesi), (r.ipotesi || '').substring(0, 70));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: il carico richiesto coincide con la derivata analitica,');
console.log('scala con rpm^2 e con la massa, prende il fianco peggiore a pari');
console.log('alzata e non produce numeri con input non validi.\n');
