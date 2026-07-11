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
// TESI FISICA DA VERIFICARE:
//   Un motore di serie è progettato perché il valve float resti trascurabile
//   FINO al fuorigiri (con margine). Quindi col modello topologicamente
//   CORRETTO per questo motore — l'1-DOF, perché la punteria è diretta —
//   il float a 7000 rpm deve essere ~0 (≪ 0.15 mm). Se così è, il modello
//   è validato nel regime che conta.
//
//   I modelli 2/3-DOF inseriscono un bilanciere+pushrod che QUI non esiste:
//   ci si aspetta che sovrastimino il float. Mostrato per completezza e come
//   monito: il modello va scelto in base all'architettura del treno valvole.
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

function sweep(fn) {
    var row = {};
    for (var rpm = 3000; rpm <= 12000; rpm += 250) {
        var v  = fn(crank, rpm, clio);
        var fl = detectValveFloat(crank, v);
        if (!row.onset && fl.maxGap > 0.3) row.onset = rpm;       // float significativo
        if (rpm === 7000)  row.f7000  = fl.maxGap;                 // al fuorigiri
        if (rpm === 8000)  row.f8000  = fl.maxGap;
        if (rpm === 10000) row.f10000 = fl.maxGap;
    }
    return row;
}
var s1 = sweep(simulateCompliance);
var s2 = sweep(simulateCompliance2DOF);
var s3 = sweep(simulateCompliance3DOF);

function mm(x){ return (x == null) ? '   —  ' : (x).toFixed(3) + ' mm'; }
function rp(x){ return (x == null) ? 'nessuno <12k' : (x + ' rpm'); }

console.log('=============================================================');
console.log(' VALIDAZIONE MODELLO — Clio 1.8 16V (F7P) — camma reale misurata');
console.log('=============================================================');
console.log('Camma caricata: picco ' + peak.toFixed(2) + ' mm @ ' + (peakIdx-360) +
            '°,  durata ' + durat + '°  (atteso ~8.6 mm / ~246°)');
console.log('');
console.log('Float massimo (gap cam-valvola) per modello e regime:');
console.log('  modello   | @7000(redline) | @8000   | @10000  | onset>0.3mm');
console.log('  ----------+----------------+---------+---------+-------------');
console.log('  1-DOF *   |   ' + mm(s1.f7000) + '   | ' + mm(s1.f8000) + ' | ' + mm(s1.f10000) + ' | ' + rp(s1.onset));
console.log('  2-DOF     |   ' + mm(s2.f7000) + '   | ' + mm(s2.f8000) + ' | ' + mm(s2.f10000) + ' | ' + rp(s2.onset));
console.log('  3-DOF     |   ' + mm(s3.f7000) + '   | ' + mm(s3.f8000) + ' | ' + mm(s3.f10000) + ' | ' + rp(s3.onset));
console.log('  (*) 1-DOF = modello topologicamente corretto per punteria diretta a bicchiere');
console.log('');

var fails = 0;
function check(label, cond, detail){
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
check('camma: picco 8.0–9.2 mm',   peak >= 8.0 && peak <= 9.2,  peak.toFixed(2) + ' mm');
check('camma: durata 230–260°',    durat >= 230 && durat <= 260, durat + '°');
check('1-DOF: float trascurabile al fuorigiri 7000 rpm (<0.15 mm)',
      s1.f7000 < 0.15, mm(s1.f7000));
check('1-DOF: float cresce monotono 7000→10000 (no instabilità numerica grossolana)',
      s1.f10000 >= s1.f7000 - 0.01, mm(s1.f7000) + ' → ' + mm(s1.f10000));
check('2/3-DOF sovrastimano (topologia pushrod assente sul motore reale)',
      s2.f7000 > s1.f7000 && s3.f7000 > s1.f7000,
      '2DOF ' + mm(s2.f7000) + ', 3DOF ' + mm(s3.f7000) + ' vs 1DOF ' + mm(s1.f7000));
check('3-DOF ≈ 2-DOF sul float (la sede agisce alla chiusura, non al naso)',
      Math.abs((s3.f7000||0) - (s2.f7000||0)) < 0.05,
      '|Δ| = ' + Math.abs((s3.f7000||0)-(s2.f7000||0)).toFixed(3) + ' mm');

console.log('');
if (fails === 0) {
    console.log('VALIDATO: la pipeline reale sulla camma Clio dà risultati fisicamente');
    console.log('coerenti. Il modello corretto (1-DOF) non prevede float al fuorigiri,');
    console.log('come deve essere per un motore di serie sano.');
    process.exit(0);
} else {
    console.log(fails + ' CHECK FALLITI — il modello NON è coerente, indagare.');
    process.exit(1);
}
