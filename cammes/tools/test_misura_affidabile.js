// =============================================================
//  test_misura_affidabile.js — regressione Lotto 1 audit esterno
//  (MAT-01 centri frazionari, MET-02 falso PASS verifica banco,
//   MET-01/MAT-07 copertura reale in parseCamFile)
// =============================================================
//  Ogni check qui è nato da un rilievo CONFERMATO dell'audit 2026-07:
//   MAT-01: mapCamToCrank con centro a mezzo grado scriveva su indici
//           frazionari → curva completamente azzerata in silenzio.
//   MET-02: la verifica banco faceva Number(x)||0 → un punto perso
//           contava come "perfetto" sul cilindro → falso PASS.
//   MET-01: parseCamFile inizializza a 0 e validCount contava le righe
//           (anche duplicate) → run incompleti indistinguibili da misure
//           complete alla rilettura.
//
//  Uso:  node cammes/tools/test_misura_affidabile.js   (exit 0 = ok)

var path = require('path');
var fs = require('fs');
global.window = global;   // la lib scrive flag diagnostici su window
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function maxOf(arr, from, to) {
    var m = -Infinity;
    for (var i = from; i <= to; i++) if (isFinite(arr[i]) && arr[i] > m) m = arr[i];
    return m;
}
function positives(arr) {
    var n = 0;
    for (var i = 1; i <= 720; i++) if (arr[i] > 0) n++;
    return n;
}

console.log('=============================================================');
console.log(' MISURA AFFIDABILE — regressione audit MAT-01 / MET-02 / MET-01');
console.log('=============================================================');

// ---------- MAT-01: centri a mezzo grado ----------
console.log('\n--- MAT-01: mapCamToCrank con centri frazionari ---');
var vwAsp = M.parseCamFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'VW-kr1_8-ASP_alz.scr'), 'utf8'));
var rawMax = maxOf(vwAsp, 1, 360);

var angles = [106, 106.5, 107, 108.5];
for (var a = 0; a < angles.length; a++) {
    var ang = angles[a];
    var crank = M.mapCamToCrank(vwAsp, ang, 0, 'intake');
    var fracKeys = Object.keys(crank).filter(function (k) {
        return isFinite(+k) && !Number.isInteger(+k);
    }).length;
    var allFinite = true;
    for (var q = 1; q <= 720; q++) if (!isFinite(crank[q])) { allFinite = false; break; }
    check('centro ' + ang + '° → picco preservato', Math.abs(maxOf(crank, 1, 720) - rawMax) < 0.02,
          'max crank ' + maxOf(crank, 1, 720).toFixed(3) + ' vs raw ' + rawMax.toFixed(3));
    check('centro ' + ang + '° → nessun indice frazionario', fracKeys === 0, fracKeys + ' chiavi frazionarie');
    check('centro ' + ang + '° → 720 slot tutti finiti', allFinite);
}
// La curva a 106.5° deve avere estensione simile a 106° (non collassare)
var c106  = M.mapCamToCrank(vwAsp, 106, 0, 'intake');
var c1065 = M.mapCamToCrank(vwAsp, 106.5, 0, 'intake');
check('106.5° → estensione lobo simile a 106° (±6 slot)', Math.abs(positives(c1065) - positives(c106)) <= 6,
      positives(c1065) + ' vs ' + positives(c106) + ' slot positivi');

// ---------- MET-02: verdetto verifica banco ----------
console.log('\n--- MET-02: benchVerdict (falso PASS impossibile) ---');
check('benchVerdict esiste in libreria', typeof M.benchVerdict === 'function');
if (typeof M.benchVerdict === 'function') {
    // (1) banco sano: rumore ±5 µm → OK
    var good = new Array(361);
    for (var i = 1; i <= 360; i++) good[i] = 0.005 * Math.sin(i * 7);
    var vGood = M.benchVerdict(good);
    check('cilindro sano → OK', vGood.status === 'OK', 'rms ' + vGood.rms.toFixed(4));

    // (2) difetto reale 0.12 mm su 40° → FAIL
    var bad = new Array(361);
    for (i = 1; i <= 360; i++) bad[i] = (i >= 100 && i < 140) ? 0.12 : 0.002;
    var vBad = M.benchVerdict(bad);
    check('difetto 0.12 mm su 40° → FAIL', vBad.status === 'FAIL', 'rms ' + vBad.rms.toFixed(4) + ', max ' + vBad.max.toFixed(3));

    // (3) STESSO difetto ma quei 40 campioni PERSI → NON deve diventare PASS
    var masked = new Array(361);
    for (i = 1; i <= 360; i++) masked[i] = (i >= 100 && i < 140) ? undefined : 0.002;
    var vMasked = M.benchVerdict(masked);
    check('40 campioni persi → NON VALUTABILE (mai PASS)', vMasked.status === 'NON_VALUTABILE',
          'status ' + vMasked.status + ', mancanti ' + vMasked.missing);

    // (4) anche UN solo punto invalido invalida il test di salute
    var oneNaN = new Array(361);
    for (i = 1; i <= 360; i++) oneNaN[i] = 0.002;
    oneNaN[200] = NaN;
    var vOne = M.benchVerdict(oneNaN);
    check('1 punto NaN → NON VALUTABILE', vOne.status === 'NON_VALUTABILE', 'mancanti ' + vOne.missing);

    // (5) array interamente vuoto (scan mai partita) → NON VALUTABILE
    var vEmpty = M.benchVerdict(new Array(361));
    check('profilo vuoto → NON VALUTABILE', vEmpty.status === 'NON_VALUTABILE');

    // (6) fuori scala (LM339N flottante → numeri casuali) → invalido
    var oor = new Array(361);
    for (i = 1; i <= 360; i++) oor[i] = 0.002;
    oor[50] = 133.7;
    var vOor = M.benchVerdict(oor);
    check('1 punto fuori scala (133.7) → NON VALUTABILE', vOor.status === 'NON_VALUTABILE');
}

// ---------- MET-01 / MAT-07: copertura reale in parseCamFile ----------
console.log('\n--- MET-01/MAT-07: parseCamFile distingue coperto da riempito ---');
// (1) 360 righe tutte sullo stesso grado: prima validCount=360 (falsa copertura)
var sameDeg = [];
for (var r = 0; r < 360; r++) sameDeg.push('1,' + (r + 1));
var pSame = M.parseCamFile(sameDeg.join('\n'));
check('360 righe stesso grado → validCount = 1 (gradi unici)', pSame.validCount === 1, 'validCount ' + pSame.validCount);
check('360 righe stesso grado → missingCount = 359', pSame.missingCount === 359, 'missingCount ' + pSame.missingCount);

// (2) file parziale da 10 righe
var ten = [];
for (r = 1; r <= 10; r++) ten.push(r + ',' + (r * 0.5));
var pTen = M.parseCamFile(ten.join('\n'));
check('10 righe → validCount 10, missingCount 350', pTen.validCount === 10 && pTen.missingCount === 350,
      'valid ' + pTen.validCount + ', missing ' + pTen.missingCount);

// (3) riga NaN → il grado NON conta come coperto
var withNaN = ['1,0.5', '2,NaN', '3,0.7'];
var pNaN = M.parseCamFile(withNaN.join('\n'));
check('riga "2,NaN" → grado 2 non coperto', pNaN.validCount === 2 && pNaN.covered && !pNaN.covered[2],
      'valid ' + pNaN.validCount);

// (4) file completo reale → copertura piena, nessuna regressione
var pFull = M.parseCamFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'VW-kr1_8-ASP_alz.scr'), 'utf8'));
check('fixture VW → validCount 360, missingCount 0', pFull.validCount === 360 && pFull.missingCount === 0,
      'valid ' + pFull.validCount + ', missing ' + pFull.missingCount);
check('fixture VW → valori intatti (picco 11.24)', Math.abs(maxOf(pFull, 1, 360) - 11.24) < 0.01);

console.log('');
if (fails > 0) {
    console.log('RISULTATO: ' + fails + ' check FALLITI');
    process.exit(1);
}
console.log('VALIDATO: centri frazionari mappati per interpolazione, la verifica');
console.log('banco non può dare PASS con dati mancanti, e un file incompleto è');
console.log('riconoscibile alla rilettura (copertura reale, non righe contate).');
