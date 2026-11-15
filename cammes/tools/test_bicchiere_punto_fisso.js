// =============================================================
//  test_bicchiere_punto_fisso.js — il consiglio deve essere un punto fisso
// =============================================================
//  Segnalazione dall'officina: "comparto piattello inattendibile".
//
//  L'escursione del contatto e' il raggio minimo che deve avere la faccia del
//  piattello, e su un follower piatto vale max |ds/dpsi| con s alzata DEL
//  PIATTELLO. E' una proprieta' della CAMMA: non dipende dal bicchiere montato.
//
//  Ma convertPuntToBicchiere la calcolava sulla curva GIA' RITAGLIATA dal
//  bicchiere digitato: l'inviluppo scarta i punti di contatto oltre |x| > R
//  (il raggio digitato), e la derivata veniva presa su quella curva. Il cane si
//  morde la coda — il numero che deve dire "questo bicchiere e' troppo piccolo"
//  era calcolato sul comportamento di quel bicchiere troppo piccolo. E nel
//  regime vincolato, l'UNICO in cui l'avviso compare, la curva prende dei
//  ginocchi in ingresso e uscita dal vincolo e la pendenza letta non e' piu' una
//  proprieta' della camma.
//
//  Conseguenza pratica: il consiglio non era un punto fisso. Sulla camma RIF-3
//  aspirazione (cerchio base 32 mm, puntalino 1,5):
//      digitando 20  ->  "servirebbe almeno D 35,1"
//      digitando 29  ->  "servirebbe almeno D 30,2"
//      digitando 32  ->  "servirebbe almeno D 29,6"   <- il valore vero
//  Se l'operatore comprava il D 35 che gli era stato indicato e lo digitava, il
//  programma gli rispondeva che ne bastava 29,6. Due risposte diverse dalla
//  stessa scansione.
//
//  E' lo stesso tipo di errore gia' chiuso una volta ("un allarme gonfiato di
//  otto volte"): allora si derivava la curva del puntalino, poi una curva del
//  piattello che non era quella di riferimento. Il verso e' lo stesso: sempre
//  in eccesso.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_bicchiere_punto_fisso.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggiScr(nome) {
    var txt = fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8');
    var out = new Array(361);
    for (var i = 0; i <= 360; i++) out[i] = 0;
    txt.split(/\r?\n/).forEach(function (r) {
        if (!r || r.charAt(0) === '#') return;
        var p = r.split(/[;,\s]+/).filter(function (s) { return s !== ''; });
        if (p.length < 2) return;
        var g = parseInt(p[0], 10), v = parseFloat(String(p[1]).replace(',', '.'));
        if (!isNaN(g) && !isNaN(v) && g >= 1 && g <= 360) out[g] = v > 0 ? v : 0;
    });
    return out;
}
function esc(lift, rBase, D, rPunt) {
    var o = M.convertPuntToBicchiere(lift, rBase, D, rPunt);
    return (o && typeof o.escursioneContatto === 'number') ? o.escursioneContatto : null;
}

console.log('=============================================================');
console.log(' PIATTELLO: l escursione del contatto e una proprieta della CAMMA');
console.log('=============================================================');

var CAMME = [
    { nome: 'camma RIF-2 aspirazione', file: 'rif2_asp_alz.scr', rBase: 16.32 },
    { nome: 'camma RIF-1', file: 'rif1_alz.scr', rBase: 16.5 },
    { nome: 'prova_fw31', file: 'prova_fw31_alz.scr', rBase: 16.0 }
];
var DIAMETRI = [16, 20, 25, 28, 29, 30, 32, 35, 40, 60];

// ---------- 1. non deve dipendere dal diametro digitato ----------
console.log('--- lo stesso file, dieci diametri digitati ---');
CAMME.forEach(function (c) {
    var L = leggiScr(c.file);
    var valori = DIAMETRI.map(function (D) { return esc(L, c.rBase, D, 1.5); });
    var buoni = valori.filter(function (v) { return v !== null; });
    var min = Math.min.apply(null, buoni), max = Math.max.apply(null, buoni);
    var spread = max - min;
    check(c.nome + ': l escursione non cambia col diametro digitato',
        spread < 0.01,
        'da ' + min.toFixed(3) + ' a ' + max.toFixed(3) + ' mm (spread ' + spread.toFixed(3) + ')');
});

// ---------- 2. il consiglio deve essere un PUNTO FISSO ----------
// Se il programma dice "servirebbe almeno D X" e l'operatore digita X, deve
// confermare X. Altrimenti il consiglio manda a comprare il pezzo sbagliato.
console.log('');
console.log('--- il consiglio si conferma da solo ---');
CAMME.forEach(function (c) {
    var L = leggiScr(c.file);
    // parto da un bicchiere volutamente troppo piccolo, come farebbe l'operatore
    var e1 = esc(L, c.rBase, 20, 1.5);
    if (e1 === null) { check(c.nome + ': consiglio calcolabile', false, 'n.d.'); return; }
    var consigliato = 2 * e1;
    var e2 = esc(L, c.rBase, consigliato, 1.5);
    check(c.nome + ': digitando il diametro consigliato, il consiglio non cambia',
        e2 !== null && Math.abs(2 * e2 - consigliato) < 0.05,
        'consigliava D ' + consigliato.toFixed(1) + ', poi dice D ' + (e2 === null ? '?' : (2 * e2).toFixed(1)));
});

// ---------- 3. e resta un numero sensato ----------
console.log('');
console.log('--- controllo di plausibilita ---');
CAMME.forEach(function (c) {
    var L = leggiScr(c.file);
    var v = esc(L, c.rBase, 33, 1.5);
    // Un bicchiere reale sta fra Ø20 e Ø45: l'escursione (RAGGIO) fra 10 e 22,5.
    check(c.nome + ': l escursione resta nell ordine di grandezza di un bicchiere vero',
        v !== null && v > 5 && v < 25,
        v === null ? 'n.d.' : v.toFixed(3) + ' mm -> serve D ' + (2 * v).toFixed(1));
});

// ---------- 4. l alzata simulata NON deve cambiare ----------
// Il ritaglio dell'inviluppo e' fisicamente giusto per la CURVA: un bicchiere
// piccolo davvero non raggiunge quei punti. Si corregge solo il CRITERIO.
console.log('');
console.log('--- la curva simulata resta quella di prima ---');
var Lv = leggiScr('rif2_asp_alz.scr');
var stretto = M.convertPuntToBicchiere(Lv, 16.32, 20, 1.5);
var largo = M.convertPuntToBicchiere(Lv, 16.32, 40, 1.5);
var diverse = 0, maxDiff = 0;
for (var i = 1; i <= 360; i++) {
    var d = Math.abs((stretto[i] || 0) - (largo[i] || 0));
    if (d > 1e-9) diverse++;
    if (d > maxDiff) maxDiff = d;
}
check('un bicchiere stretto simula ancora una curva diversa da uno largo',
    diverse > 0, diverse + ' gradi diversi, scarto max ' + maxDiff.toFixed(3) + ' mm');
check('e il picco di un bicchiere largo non e piu basso di uno stretto',
    Math.max.apply(null, largo.slice(1, 361)) >= Math.max.apply(null, stretto.slice(1, 361)) - 1e-9,
    'larghezza maggiore = raggiunge piu punti, mai meno');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: il diametro minimo del piattello e una proprieta della camma, non della risposta cercata.');
process.exit(0);
