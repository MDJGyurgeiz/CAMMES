// =============================================================
//  test_data02_parser.js — DATA-02 (controrevisione v3.4.1)
// =============================================================
//  Rigore del parser e dei consumatori sul confine assenza/zero:
//   - "42," e "42;" → riga INVALIDA (Number('')===0 la faceva diventare uno
//     zero misurato valido, ok=true);
//   - null / undefined / '' / whitespace / testo → invalidi, mai zero;
//   - "42,0" → vero zero, VALIDO;
//   - convenzione 0..359 coerente → riconosciuta e normalizzata a 1..360;
//   - convenzione mista (0 E 360 presenti) → segnalata, ok=false;
//   - averageRuns: null NON è uno zero valido;
//   - benchVerdict: array di null/'' NON dà mai un verdetto OK.
//
//  Uso: node tools/test_data02_parser.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' PARSER RIGOROSO (assenza vs zero) - DATA-02');
console.log('=============================================================');

// --- valore vuoto dopo la virgola: MAI zero ---
var p1 = M.parseCamFile('_pline\r\n42,\r\n43,1.5\r\n');
check('"42," -> riga invalida, grado 42 NON coperto', p1.covered[42] === false && p1.invalidRows >= 1,
    'covered=' + p1.covered[42] + ' invalidRows=' + p1.invalidRows);
check('"42," -> ok=false (anomalia segnalata)', p1.ok === false);
check('"43,1.5" nello stesso file resta valido', p1.covered[43] === true && Number(p1[43]) === 1.5);

// --- separatore ';' con valore vuoto ---
var p2 = M.parseCamFile('_pline\r\n42;\r\n');
check('"42;" -> riga invalida, non zero', p2.covered[42] === false && p2.invalidRows >= 1);

// --- whitespace e testo ---
var p3 = M.parseCamFile('_pline\r\n42,   \r\n50,abc\r\n51,1.0\r\n');
check('"42,   " (spazi) -> invalida', p3.covered[42] === false);
check('"50,abc" -> invalida', p3.covered[50] === false);
check('"51,1.0" -> valida', p3.covered[51] === true);

// --- vero zero: resta valido e distinto dall'assenza ---
var p4 = M.parseCamFile('_pline\r\n42,0\r\n');
check('"42,0" -> ZERO VERO valido (coperto)', p4.covered[42] === true && Number(p4[42]) === 0);

// --- convenzione 0..359 coerente -> normalizzata ---
var lines0 = ['_pline'];
for (var d = 0; d <= 359; d++) lines0.push(d + ',' + (1 + d * 0.001).toFixed(3));
var p5 = M.parseCamFile(lines0.join('\r\n') + '\r\n');
check('0..359 coerente -> 360/360 dopo normalizzazione', p5.validCount === 360 && p5.missingCount === 0,
    'valid=' + p5.validCount + ' missing=' + p5.missingCount);
check('0..359: il grado 0 finisce al grado 1 (shift +1)', Math.abs(Number(p5[1]) - 1.000) < 1e-9, 'p[1]=' + p5[1]);
check('0..359: il grado 359 finisce al grado 360', Math.abs(Number(p5[360]) - 1.359) < 1e-9, 'p[360]=' + p5[360]);
check('0..359: convenzione dichiarata nel risultato', p5.zeroBased === true);

// --- convenzione MISTA (sia 0 sia 360) -> rifiutata come anomalia ---
var pm = M.parseCamFile('_pline\r\n0,1.0\r\n5,1.1\r\n360,1.2\r\n');
check('mista 0..359/1..360 -> segnalata (ok=false)', pm.ok === false && pm.conventionMixed === true,
    'ok=' + pm.ok + ' mixed=' + pm.conventionMixed);

// --- file classico 1..360: NESSUNA regressione ---
var lines1 = ['_pline'];
for (var g = 1; g <= 360; g++) lines1.push(g + ',' + (2.0).toFixed(3));
var p6 = M.parseCamFile(lines1.join('\r\n') + '\r\n');
check('classico 1..360 invariato (completo, ok, non zeroBased)',
    p6.validCount === 360 && p6.ok === true && !p6.zeroBased);

// --- averageRuns: null NON è uno zero ---
var runA = new Array(361), runB = new Array(361);
for (var i = 1; i <= 360; i++) { runA[i] = 1; runB[i] = 3; }
runB[42] = null;                       // null: PRIMA diventava zero valido
var avg = M.averageRuns([runA, runB]);
check('averageRuns: null al grado 42 NON conta come campione', avg.count[42] === 1,
    'count=' + avg.count[42] + ' value=' + avg.values[42]);
check('averageRuns: media al 42 = solo il run valido (1, non 0.5)', avg.values[42] === 1);
runB[43] = '';                         // stringa vuota
var avg2 = M.averageRuns([runA, runB]);
check('averageRuns: stringa vuota NON conta come campione', avg2.count[43] === 1);

// --- benchVerdict: array di null/'' non è mai OK ---
var nulls = new Array(361);
for (var k = 1; k <= 360; k++) nulls[k] = null;
var bv = M.benchVerdict(nulls);
check('benchVerdict su 360 null -> NON_VALUTABILE (mai OK)', bv.status === 'NON_VALUTABILE', bv.status);
var empt = new Array(361);
for (var k2 = 1; k2 <= 360; k2++) empt[k2] = '';
var bv2 = M.benchVerdict(empt);
check('benchVerdict su 360 stringhe vuote -> NON_VALUTABILE', bv2.status === 'NON_VALUTABILE', bv2.status);

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: assenza e zero sono distinti in parser, media e verdetto banco;');
console.log('convenzione 0..359 riconosciuta, mista rifiutata, 1..360 invariato.\n');
