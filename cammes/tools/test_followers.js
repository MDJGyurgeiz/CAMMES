// =============================================================
//  test_followers.js — regressione per le conversioni follower virtuale
// =============================================================
// Importa stylusCompensate + convertPuntToBicchiere/Roller/Finger da
// lib/cammes-math.js (libreria condivisa col browser) e verifica
// invarianti DERIVATE dal codice reale, non assunte:
//
//   PUNTALINO→ INVERSA dell'offset normale: la sfera legge sempre IN PIÙ del
//              vero (d ≥ ρ + r), quindi la correzione SOTTRAE sui fianchi, è
//              nulla al naso e sul cerchio base. La prova quantitativa sta in
//              test_puntalino_ritorno.js (andata e ritorno contro un oracolo
//              esatto); qui restano gli invarianti qualitativi.
//              Storia: prima `raw − rPunt` (sottrazione piatta, abbassava anche
//              il naso), poi `raw + rPunt·(1−cosα)` che aveva la forma giusta e
//              il VERSO rovesciato — e raddoppiava l'errore invece di toglierlo.
//   ROLLER   → rRoll→0 ⇒ profilo puntalino compensato (≥raw, =raw al picco);
//              rRoll finito CAMBIA l'output e arrotonda il naso (Δ cresce col R)
//   FINGER   → con tilt=0 e rPunt=0 la cinematica esatta si riduce al
//              rapporto lineare: out[t] = raw[t] * (lValve / lArm)
//              (e con lValve==lArm → identità)
//   BICCHIERE→ piattello piatto: output finito e ≥0; picco ≈ picco grezzo;
//              rPunt>0 NON cambia il picco (naso) e ABBASSA i fianchi
//
// Uso:  node cammes/tools/test_followers.js     (exit 0 = tutto ok)

var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var stylusCompensate = M.stylusCompensate;
var convertPuntToBicchiere = M.convertPuntToBicchiere;
var convertPuntToRoller = M.convertPuntToRoller;
var convertPuntToFinger = M.convertPuntToFinger;

// --- camma sintetica: bump liscio, picco 8 mm su [90,270]° (cam-degree) ---
var PEAK = 8.0;
var cam = new Array(361);
cam[0] = 0;
for (var t = 1; t <= 360; t++) {
    if (t >= 90 && t <= 270) {
        var u = (t - 90) / 180;                  // 0..1
        cam[t] = PEAK * Math.sin(Math.PI * u) * Math.sin(Math.PI * u);
    } else cam[t] = 0;
}
function rawPeak(arr) { var m = 0; for (var i = 1; i <= 360; i++) if (arr[i] > m) m = arr[i]; return m; }
function peakOf(arr) { var m = 0; for (var i = 1; i <= 360; i++) if ((arr[i]||0) > m) m = arr[i]; return m; }
function allFinite(arr) { for (var i = 1; i <= 360; i++) { if (!isFinite(arr[i]||0)) return false; } return true; }
function allNonNeg(arr) { for (var i = 1; i <= 360; i++) { if ((arr[i]||0) < -1e-9) return false; } return true; }

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' REGRESSIONE CONVERSIONI FOLLOWER (camma sintetica picco ' + PEAK + ' mm)');
console.log('=============================================================');

// ---- PUNTALINO: compensazione offset normale (≥0, nulla al picco) ----
var rPunt = 1.5;
var comp = stylusCompensate(cam, 14, rPunt);
// IL VERSO DELLA CORREZIONE ERA ROVESCIATO, E QUESTI CHECK LO CONGELAVANO.
// Chiedevano "correzione >= 0 ovunque" e "> 0 sui fianchi", cioe' esattamente
// la proprieta' sbagliata: la sfera legge SEMPRE IN PIU' del vero (basta
// prendere Delta = 0 dentro il massimo dell'inviluppo per avere d >= rho + r),
// quindi la compensazione deve SOTTRARRE sui fianchi. Vedi
// test_puntalino_ritorno.js per la prova di andata e ritorno contro un oracolo
// esatto; qui restano gli invarianti qualitativi, col verso giusto.
// La soglia NON e' scelta per far passare il controllo. L'inversa esatta
// ricampiona su gradi interi una curva campionata a 1 grado, quindi dove la
// rampa stacca dal cerchio base l'interpolazione lascia un residuo di segno
// opposto. Misurato: 16 nanometri su questo lobo sintetico, fino a 2,8 micron
// sulle quattro camme reali in prove/ — contro sottrazioni di 0,29-0,62 mm.
// E' lo stesso ordine del rumore di misura del banco (2-4 micron), su uno
// strumento che risolve 10 micron: sotto quella soglia non si sta piu'
// affermando niente di fisico.
var RESIDUO_RICAMPIONAMENTO = 0.005;   // mm
var compAggiunta = 0, compTogli = 0, pkCamIdx = 1, pkCam = 0;
for (var c = 1; c <= 360; c++) { if (cam[c] > pkCam) { pkCam = cam[c]; pkCamIdx = c; } }
for (var ci = 1; ci <= 360; ci++) {
    var dcomp = (comp[ci]||0) - cam[ci];      // correzione = comp − raw
    if (dcomp > compAggiunta) compAggiunta = dcomp;
    if (-dcomp > compTogli) compTogli = -dcomp;  // massima sottrazione (sui fianchi)
}
var compAtPeak = Math.abs((comp[pkCamIdx]||0) - cam[pkCamIdx]);   // ~0 al naso
console.log('PUNTALINO (stylusCompensate, inversa dell offset normale):');
check('la correzione non AGGIUNGE alzata (la sfera legge in piu, si sottrae)',
    compAggiunta < RESIDUO_RICAMPIONAMENTO,
    'max +' + compAggiunta.toExponential(2) + ' mm contro −' + compTogli.toFixed(3) + ' tolti');
check('correzione ~0 al picco/naso (normale = radiale)', compAtPeak < 1e-3, 'Δ@picco ' + compAtPeak.toExponential(1));
check('correzione < 0 sui fianchi (si toglie l eccesso della sfera)', compTogli > 1e-3, 'max −' + compTogli.toFixed(3) + ' mm');

// ---- ROLLER: inviluppo radiale reale ----
//  (1) rRoll→0 ⇒ profilo puntalino compensato (≥ raw, = raw al picco)
//  (2) rRoll finito CAMBIA l'output (arrotonda il naso) e resta finito/≥0
//  (3) rRoll più grande arrotonda di più (Δ vs rRoll=0 cresce col raggio)
var roll0  = convertPuntToRoller(cam, 14, 0,  rPunt);
var roll8  = convertPuntToRoller(cam, 14, 8,  rPunt);
var roll12 = convertPuntToRoller(cam, 14, 12, rPunt);
var roll0Comp = true, diff8 = 0, diff12 = 0, roll8Finite = true;
for (var i = 1; i <= 360; i++) {
    if (Math.abs((roll0[i]||0) - (comp[i]||0)) > 1e-9) roll0Comp = false;   // = profilo compensato
    if (!isFinite(roll8[i]||0) || (roll8[i]||0) < -1e-9) roll8Finite = false;
    diff8  = Math.max(diff8,  Math.abs((roll8[i]||0)  - (roll0[i]||0)));
    diff12 = Math.max(diff12, Math.abs((roll12[i]||0) - (roll0[i]||0)));
}
console.log('ROLLER (inviluppo radiale):');
check('rRoll→0 ⇒ profilo puntalino compensato', roll0Comp, 'picco ' + peakOf(roll0).toFixed(3));
check('rRoll=8 cambia l\'output (arrotonda) e resta finito/≥0', roll8Finite && diff8 > 1e-3, 'maxΔ vs rRoll0 = ' + diff8.toFixed(3) + ' mm');
check('rRoll=12 arrotonda più di rRoll=8 (Δ cresce con il raggio)', diff12 > diff8, 'Δ12=' + diff12.toFixed(3) + ' > Δ8=' + diff8.toFixed(3));

// ---- FINGER: tilt=0,rPunt=0 → rapporto lineare lValve/lArm ----
var fRatio = convertPuntToFinger(cam, 14, 25, 30, 0, 0);   // 30/25 = 1.2
var fingerRatioOK = true, maxErr = 0;
for (var j = 1; j <= 360; j++) {
    var exp = cam[j] * (30 / 25);
    var err = Math.abs((fRatio[j]||0) - exp);
    if (err > maxErr) maxErr = err;
    if (err > 1e-6) fingerRatioOK = false;
}
var fIdentity = convertPuntToFinger(cam, 14, 25, 25, 0, 0); // ratio 1 → identità
var identOK = true;
for (var k = 1; k <= 360; k++) if (Math.abs((fIdentity[k]||0) - cam[k]) > 1e-6) identOK = false;
// con tilt la curva resta finita e il picco cambia (non-lineare)
var fTilt = convertPuntToFinger(cam, 14, 25, 30, 0, 30);
console.log('FINGER:');
check('tilt=0 → out = raw * (lValve/lArm) = raw*1.2', fingerRatioOK, 'errMax ' + maxErr.toExponential(1) + ', picco ' + peakOf(fRatio).toFixed(3));
check('tilt=0, lValve=lArm → identità', identOK);
check('tilt=30° → output finito e ≥0 (cinematica non-lineare)', allFinite(fTilt) && allNonNeg(fTilt), 'picco ' + peakOf(fTilt).toFixed(3));

// ---- BICCHIERE: finito, ≥0, picco ≈ picco grezzo; rPunt alza i fianchi ----
var bicc = convertPuntToBicchiere(cam, 14, 20, 0);
var pkRaw = rawPeak(cam), pkB = peakOf(bicc);
var biccFinite = allFinite(bicc) && allNonNeg(bicc);
var biccPeakOK = (pkB >= 0.7 * pkRaw && pkB <= 1.4 * pkRaw);
// rPunt>0: compensazione offset normale → picco INVARIATO (naso), fianchi più pieni
var biccR = convertPuntToBicchiere(cam, 14, 20, 1.5);
var pkR = peakOf(biccR);
var biccPeakSame = Math.abs(pkR - pkB) < 0.02 * pkB;
// Stesso verso corretto, propagato al bicchiere: dichiarare un puntalino
// sferico toglie l'eccesso di lettura sui fianchi e lascia il naso dov'e'.
var biccFlankDown = 0, biccNoRise = true;
for (var b = 1; b <= 360; b++) {
    var dd = (biccR[b]||0) - (bicc[b]||0);
    if (-dd > biccFlankDown) biccFlankDown = -dd;
    if (dd > RESIDUO_RICAMPIONAMENTO) biccNoRise = false;   // stessa soglia, stesso motivo
}
console.log('BICCHIERE (piattello Ø20):');
check('output finito e ≥0', biccFinite);
check('picco ≈ picco grezzo (0.7–1.4×)', biccPeakOK, 'bicch ' + pkB.toFixed(3) + ' vs raw ' + pkRaw.toFixed(3));
check('rPunt>0 NON sposta il picco (naso invariato)', biccPeakSame && biccNoRise, 'pkR ' + pkR.toFixed(3) + ' vs pk0 ' + pkB.toFixed(3));
check('rPunt>0 abbassa i fianchi (toglie l eccesso della sfera)', biccFlankDown > 1e-3, 'max −' + biccFlankDown.toFixed(3) + ' mm');

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO (13/13)'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
