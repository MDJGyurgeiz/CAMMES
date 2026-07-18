// =============================================================
//  test_integrita_misura.js — regressione Lotto C (controrevisione)
//  MET-01 (run ripetuti), parser SCR rigoroso (duplicati/frazionari),
//  averageRuns senza zero-fill.
// =============================================================
//  Ogni check nasce da un rilievo CONFERMATO sul codice v3.3.0:
//   - media dei run ripetuti: un grado mancante in TUTTI i run diventava 0
//     fisico (regressione MET-01);
//   - parser: un grado duplicato sovrascriveva in silenzio (validCount 360);
//     un grado frazionario veniva arrotondato senza avviso.
//
//  Uso:  node cammes/tools/test_integrita_misura.js   (exit 0 = ok)

var path = require('path');
global.window = global;
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' INTEGRITA MISURA — MET-01 run ripetuti + parser rigoroso');
console.log('=============================================================');

// ---------- averageRuns: niente zero-fill ----------
console.log('\n--- MET-01: averageRuns (grado mancante in tutti i run) ---');
check('averageRuns esiste in libreria', typeof M.averageRuns === 'function');
if (typeof M.averageRuns === 'function') {
    // 2 run: grado 42 mancante (NaN) in ENTRAMBI, gli altri validi a 1.0
    function mkRun(missingDeg) {
        var a = new Array(361);
        for (var d = 1; d <= 360; d++) a[d] = (d === missingDeg) ? NaN : 1.0;
        return a;
    }
    var res = M.averageRuns([mkRun(42), mkRun(42)]);
    check('grado 42 mancante in 2 run → valid[42] = false', res.valid[42] === false, 'valid[42]=' + res.valid[42]);
    check('grado 42 → NON è uno zero fisico', !(res.values[42] === 0 && res.valid[42]), 'value[42]=' + res.values[42]);
    check('grado 100 valido → media 1.0', res.valid[100] === true && Math.abs(res.values[100] - 1) < 1e-9);
    check('missingCount = 1', res.missingCount === 1, 'missingCount=' + res.missingCount);

    // grado mancante in UN solo run → resta valido (media sull\'altro)
    var res2 = M.averageRuns([mkRun(42), mkRun(999)]);
    check('grado 42 mancante in 1 run su 2 → valido (media dell\'altro)', res2.valid[42] === true && Math.abs(res2.values[42] - 1) < 1e-9);
}

// ---------- parser rigoroso ----------
console.log('\n--- MAT-07: parseCamFile rigoroso ---');
function full(extra) {
    var l = [];
    for (var d = 1; d <= 360; d++) l.push(d + ',0.5');
    if (extra) l.push(extra);
    return l.join('\n');
}
// (1) duplicato: NON sovrascrive in silenzio, lo segnala e ok=false
var pDup = M.parseCamFile(full('180,999'));
check('duplicato 180 → duplicateDegrees contiene 180', Array.isArray(pDup.duplicateDegrees) && pDup.duplicateDegrees.indexOf(180) >= 0, 'dup=' + JSON.stringify(pDup.duplicateDegrees));
check('duplicato 180 → NON sovrascrive il primo valore (0.5, non 999)', pDup[180] === 0.5, 'grado180=' + pDup[180]);
check('duplicato → ok=false', pDup.ok === false, 'ok=' + pDup.ok);
// (2) frazionario: non arrotondato in silenzio
var pFrac = M.parseCamFile('106.5,3\n107,4\n108,5');
check('frazionario 106.5 → fractionalDegrees lo segnala', Array.isArray(pFrac.fractionalDegrees) && pFrac.fractionalDegrees.length >= 1, 'frac=' + JSON.stringify(pFrac.fractionalDegrees));
check('frazionario 106.5 → NON popola il grado 107 per arrotondamento', !pFrac.covered[107] || pFrac[107] === 4, 'grado107=' + pFrac[107] + ' covered=' + pFrac.covered[107]);
check('frazionario presente → ok=false', pFrac.ok === false);
// (3) fuori range / non finito
var pBad = M.parseCamFile('1,0.5\n400,2\n3,NaN\n5,0.7');
check('fuori range 400 → outOfRangeRows>=1', pBad.outOfRangeRows >= 1, 'oor=' + pBad.outOfRangeRows);
check('valore NaN → invalidRows>=1', pBad.invalidRows >= 1, 'inv=' + pBad.invalidRows);
// (4) file completo pulito → ok=true, retrocompatibile
var pOk = M.parseCamFile(full());
check('file completo pulito → ok=true, validCount 360', pOk.ok === true && pOk.validCount === 360, 'ok=' + pOk.ok + ' valid=' + pOk.validCount);
check('retrocompat: array + meta + missingCount ancora presenti', typeof pOk.missingCount === 'number' && !!pOk.covered && pOk[180] === 0.5);

console.log('');
if (fails > 0) { console.log('RISULTATO: ' + fails + ' check FALLITI'); process.exit(1); }
console.log('VALIDATO: media run senza zero-fill, parser che segnala');
console.log('duplicati/frazionari/fuori-range senza sovrascrivere in silenzio.');
