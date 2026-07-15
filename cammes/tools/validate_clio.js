// =============================================================
//  validate_clio.js — validazione del modello su camma REALE
// =============================================================
// Usa la PIPELINE DI PRODUZIONE (parseCamFile → mapCamToCrank → solver)
// estratta da analisi.html, applicata alla scansione reale della Clio 1.8
// 16V montata e misurata (prove/clio_test_1_alz.scr), e confronta le
// predizioni di valve float con ciò che la fisica impone per quel motore.
//
// MOTORE DI RIFERIMENTO — Renault Clio 1.8 16V (motore F7P, 1764 cc):
//   - DOHC 16V, punteria DIRETTA a bicchiere (NESSUN bilanciere/pushrod)
//   - potenza ~137 CV @ ~6500 rpm, fuorigiri ~7000-7250 rpm
//   - molla/massa valvola: valori TIPICI di classe (non dati di fabbrica
//     esatti) → questa è una validazione di PLAUSIBILITÀ, non di precisione
//     al giro.
//
// COSA VALIDA QUESTO TEST (rivisto dopo l'audit DYN-01, 2026-07):
//   Il valve float è la PERDITA DI CONTATTO cam-punteria: la punteria "vola"
//   oltre il profilo. La metrica corretta (detectValveFloat, che ora legge la
//   separazione tracciata dentro il solver) deve comportarsi FISICAMENTE:
//     (a) ~0 al quasi-statico/basso regime (la molla tiene il contatto);
//     (b) crescente col regime (più inerzia → più distacco);
//     (c) IN CALO se si irrigidisce la molla (risposta corretta al progetto).
//   Questa è la proprietà che il fix DYN-01 garantisce, e la validiamo qui
//   sulla camma REALE della Clio.
//
//   NB — il modello 1-DOF a massa concentrata è ESPLORATIVO per il regime
//   ASSOLUTO di float (audit DYN-02/DYN-05: un solo ciclo da fermo, params di
//   classe non di fabbrica). NON usiamo più il numero assoluto di float a
//   7000 rpm come criterio (la vecchia soglia <0.15 mm validava in realtà lo
//   SCHIACCIAMENTO ELASTICO, non il float — proprio il bug DYN-01). Il valore
//   assoluto resta a schermo come indicazione, non come verdetto.
//
// Uso:  node cammes/tools/validate_clio.js   (exit 0 = validato)

var fs   = require('fs');
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var mapCamToCrank = M.mapCamToCrank, parseCamFile = M.parseCamFile,
    simulateCompliance = M.simulateCompliance,
    simulateCompliance2DOF = M.simulateCompliance2DOF,
    simulateCompliance3DOF = M.simulateCompliance3DOF,
    detectValveFloat = M.detectValveFloat;

// --- carica la scansione reale (normalizza EOL a CRLF: parseCamFile usa \r\n) ---
// Riferimento in tools/fixtures/ (prove/ è l'archivio utente, svuotabile dalla UI)
var scrPath = path.join(__dirname, 'fixtures', 'clio_test_1_alz.scr');
if (!fs.existsSync(scrPath)) scrPath = path.join(__dirname, '..', 'prove', 'clio_test_1_alz.scr');
var raw  = fs.readFileSync(scrPath, 'utf8').replace(/\r?\n/g, '\r\n');
var camLift = parseCamFile(raw);
var crank   = mapCamToCrank(camLift, 0, 0, 'intake');   // fase 0, gioco 0 (curva grezza)

// metriche camma
var peak = 0, peakIdx = 0;
for (var d = 1; d <= 720; d++) if (crank[d] > peak) { peak = crank[d]; peakIdx = d; }
var thr = Math.max(0.05, peak * 0.01), durat = 0;
for (var e = 1; e <= 720; e++) if (crank[e] > thr) durat++;

// parametri Clio 1.8 16V (classe, punteria diretta)
var clio = { massEqG:95, kTrainN_mm:6000, kSpringN_mm:30, F0N:230, dampingRatio:0.06,
             massEqIntermediateG:25, kPushrodN_mm:1500, massSeatG:15, kSeatN_mm:80000 };

function sweep(fn, params) {
    var row = {};
    for (var rpm = 2000; rpm <= 12000; rpm += 250) {
        var v  = fn(crank, rpm, params || clio);
        var fl = detectValveFloat(crank, v);
        if (!row.onset && fl.maxGap > 0.3) row.onset = rpm;       // float significativo
        if (rpm === 2500)  row.f2500  = fl.maxGap;                 // basso regime
        if (rpm === 5000)  row.f5000  = fl.maxGap;
        if (rpm === 7000)  row.f7000  = fl.maxGap;                 // al fuorigiri
        if (rpm === 8000)  row.f8000  = fl.maxGap;
        if (rpm === 9000)  row.f9000  = fl.maxGap;
        if (rpm === 10000) row.f10000 = fl.maxGap;
    }
    return row;
}
var s1 = sweep(simulateCompliance);
var s2 = sweep(simulateCompliance2DOF);
var s3 = sweep(simulateCompliance3DOF);
// Molla irrigidita (rate + precarico): il float DEVE calare (audit DYN-01 (c))
var clioStiff = Object.assign({}, clio, { kSpringN_mm: 55, F0N: 380 });
var s1s = sweep(simulateCompliance, clioStiff);

function mm(x){ return (x == null) ? '   —  ' : (x).toFixed(3) + ' mm'; }
function rp(x){ return (x == null) ? 'nessuno <12k' : (x + ' rpm'); }

console.log('=============================================================');
console.log(' VALIDAZIONE MODELLO — Clio 1.8 16V (F7P) — camma reale misurata');
console.log('=============================================================');
console.log('Camma caricata: picco ' + peak.toFixed(2) + ' mm @ ' + (peakIdx-360) +
            '°,  durata ' + durat + '°  (atteso ~8.6 mm / ~246°)');
console.log('');
console.log('Valve float = perdita di contatto cam-punteria (mm), modello 1-DOF:');
console.log('  molla        | @2500 | @5000  | @7000  | @10000 | onset>0.3mm');
console.log('  -------------+-------+--------+--------+--------+-------------');
console.log('  classe (30)  | ' + mm(s1.f2500) + '| ' + mm(s1.f5000) + ' | ' + mm(s1.f7000) + ' | ' + mm(s1.f10000) + ' | ' + rp(s1.onset));
console.log('  sport  (55)  | ' + mm(s1s.f2500) + '| ' + mm(s1s.f5000) + ' | ' + mm(s1s.f7000) + ' | ' + mm(s1s.f10000) + ' | ' + rp(s1s.onset));
console.log('  (modello esplorativo per il regime ASSOLUTO — validiamo l\'andamento)');
console.log('');

var fails = 0;
function check(label, cond, detail){
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
check('camma: picco 8.0–9.2 mm',   peak >= 8.0 && peak <= 9.2,  peak.toFixed(2) + ' mm');
check('camma: durata 230–260°',    durat >= 230 && durat <= 260, durat + '°');
// (a) float ~0 al basso regime: la molla tiene il contatto (era il vero bug
//     DYN-01 — la vecchia metrica dava ~0.24 mm qui, > della sua soglia)
check('float ~0 a 2500 rpm (contatto mantenuto)',
      s1.f2500 < 0.05, mm(s1.f2500));
// (b) monotonia col regime: più giri → più distacco
check('float cresce col regime (2500 < 5000 < 7000 < 10000)',
      s1.f2500 <= s1.f5000 && s1.f5000 < s1.f7000 && s1.f7000 < s1.f10000,
      mm(s1.f2500) + ' < ' + mm(s1.f5000) + ' < ' + mm(s1.f7000) + ' < ' + mm(s1.f10000));
// (c) risposta al progetto: molla più rigida → MENO float allo stesso regime
check('molla sport (55/380) riduce il float a 7000 vs classe (30/230)',
      s1s.f7000 < s1.f7000, 'sport ' + mm(s1s.f7000) + ' < classe ' + mm(s1.f7000));
// topologia: bilanciere+pushrod (2/3-DOF) aggiungono massa/cedevolezza →
// float ≥ 1-DOF (che è il modello corretto per la punteria diretta Clio)
check('2/3-DOF ≥ 1-DOF ad alto regime (massa/pushrod in più)',
      s2.f9000 >= s1.f9000 - 0.05 && s3.f9000 >= s1.f9000 - 0.05,
      '1D ' + mm(s1.f9000) + ', 2D ' + mm(s2.f9000) + ', 3D ' + mm(s3.f9000));

console.log('');
if (fails === 0) {
    console.log('VALIDATO: sulla camma Clio reale la metrica di float si comporta');
    console.log('fisicamente — nulla al basso regime, crescente coi giri, in calo se');
    console.log('la molla è più rigida. Il regime assoluto di float resta indicativo');
    console.log('(modello 1-DOF esplorativo, non calibrato su dati molla di fabbrica).');
    process.exit(0);
} else {
    console.log(fails + ' CHECK FALLITI — la metrica NON è coerente, indagare.');
    process.exit(1);
}
