// =============================================================
//  test_complete_run_average.js — DATA-03 (controrevisione v3.4.1)
// =============================================================
//  La media dei run ripetuti non deve produrre un profilo IBRIDO: run A
//  completo (tutti=1) + run B incompleto (tutti=3, grado 42 mancante) dava
//  grado 42=1 (count=1) e grado 43=2 (count=2) — né il run completo né una
//  media omogenea. Ora la media UFFICIALE include SOLO i run COMPLETI; i run
//  incompleti sono esclusi e dichiarati.
//
//  Uso: node tools/test_complete_run_average.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function mkRun(val, missingDeg) {
    var r = new Array(361);
    for (var d = 1; d <= 360; d++) r[d] = (d === missingDeg) ? undefined : val;
    return r;
}

console.log('=============================================================');
console.log(' MEDIA SOLO RUN COMPLETI - DATA-03');
console.log('=============================================================');

// riproduzione del difetto: la media NAIVE (tutti i run) crea l'ibrido
var A = mkRun(1), B = mkRun(3, 42);
var naive = M.averageRuns([A, B]);
check('REGRESSIONE (naive): grado 42=1/count=1, grado 43=2/count=2 (ibrido)',
    naive.values[42] === 1 && naive.count[42] === 1 && naive.values[43] === 2 && naive.count[43] === 2,
    '42:' + naive.values[42] + '/' + naive.count[42] + ' 43:' + naive.values[43] + '/' + naive.count[43]);

// media UFFICIALE: solo il run completo
var r1 = M.averageCompleteRuns([A, B]);
check('completo+incompleto: media = SOLO il completo (grado 43 = 1, non 2)',
    r1.official && r1.avg.values[43] === 1 && r1.avg.count[43] === 1,
    'v=' + (r1.avg && r1.avg.values[43]) + ' n=' + (r1.avg && r1.avg.count[43]));
check('completo+incompleto: grado 42 = 1 dal run completo (niente ibrido)',
    r1.avg.values[42] === 1 && r1.avg.count[42] === 1);
check('run incompleto DICHIARATO escluso (run 2, 1 grado mancante)',
    r1.excluded.length === 1 && r1.excluded[0].run === 2 && r1.excluded[0].missing === 1,
    JSON.stringify(r1.excluded));
check('run incluso dichiarato (run 1)', r1.included.length === 1 && r1.included[0] === 1);

// solo run incompleti -> NESSUNA media ufficiale
var r2 = M.averageCompleteRuns([mkRun(1, 10), mkRun(2, 20)]);
check('solo incompleti: nessuna media ufficiale', r2.official === false && r2.avg === null,
    'official=' + r2.official);
check('solo incompleti: entrambi dichiarati esclusi', r2.excluded.length === 2);

// due completi -> count uniforme e media corretta
var r3 = M.averageCompleteRuns([mkRun(1), mkRun(3)]);
var uniform = true;
for (var d = 1; d <= 360; d++) if (r3.avg.count[d] !== 2 || r3.avg.values[d] !== 2) { uniform = false; break; }
check('due completi: count=2 e media=2 su TUTTI i gradi', r3.official && uniform);

// null/'' contano come assenza anche qui (DATA-02)
var C = mkRun(5); C[100] = null;
var r4 = M.averageCompleteRuns([mkRun(1), C]);
check('run con null al grado 100 = INCOMPLETO (escluso)',
    r4.excluded.length === 1 && r4.excluded[0].missing === 1, JSON.stringify(r4.excluded));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: media ufficiale solo sui run completi, esclusioni dichiarate,');
console.log('nessun profilo ibrido, null = assenza.\n');
