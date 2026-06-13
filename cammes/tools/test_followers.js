// =============================================================
//  test_followers.js — regressione per le conversioni follower virtuale
// =============================================================
// Estrae stylusCompensate + convertPuntToBicchiere/Roller/Finger direttamente
// da analisi.html (niente copia-incolla che possa divergere) e verifica
// invarianti DERIVATE dal codice reale, non assunte:
//
//   PUNTALINO→ compensazione raggio sfera = offset NORMALE: ltrue = raw +
//              rPunt·(1−cosα). Correzione ≥0, NULLA al naso/base, cresce sui
//              fianchi (NON la vecchia sottrazione piatta raw−rPunt, che era
//              un bug: abbassava tutto e faceva leggere il bicchiere < puntalino)
//   ROLLER   → rRoll→0 ⇒ profilo puntalino compensato (≥raw, =raw al picco);
//              rRoll finito CAMBIA l'output e arrotonda il naso (Δ cresce col R)
//   FINGER   → con tilt=0 e rPunt=0 la cinematica esatta si riduce al
//              rapporto lineare: out[t] = raw[t] * (lValve / lArm)
//              (e con lValve==lArm → identità)
//   BICCHIERE→ piattello piatto: output finito e ≥0; picco ≈ picco grezzo;
//              rPunt>0 NON cambia il picco (naso) ma alza i fianchi
//
// Uso:  node cammes/tools/test_followers.js     (exit 0 = tutto ok)

var fs   = require('fs');
var path = require('path');
var html = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8');

// Estrattore con brace-matching che ignora stringhe e commenti.
function extractFn(src, name) {
    var sig = 'function ' + name + '(';
    var start = src.indexOf(sig);
    if (start < 0) throw new Error('non trovo function ' + name);
    var i = src.indexOf('{', start);
    var depth = 0, inS = null, inLine = false, inBlock = false;
    for (var j = i; j < src.length; j++) {
        var c = src[j], n = src[j+1];
        if (inLine) { if (c === '\n') inLine = false; continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; j++; } continue; }
        if (inS) { if (c === '\\') { j++; continue; } if (c === inS) inS = null; continue; }
        if (c === '/' && n === '/') { inLine = true; j++; continue; }
        if (c === '/' && n === '*') { inBlock = true; j++; continue; }
        if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j+1); }
    }
    throw new Error('brace non bilanciate in ' + name);
}

var names = ['stylusCompensate', 'convertPuntToBicchiere', 'convertPuntToRoller', 'convertPuntToFinger'];
var bundle = names.map(function (n) { return extractFn(html, n); }).join('\n\n');

// `window` stub: convertPuntToBicchiere referenzia window.cammesToast nel ramo
// di warning. Definendolo evitiamo ReferenceError a prescindere dai parametri.
// (usato dentro la stringa eval() qui sotto, invisibile al linter)
// eslint-disable-next-line no-unused-vars
var window = { cammesToast: null, _suppressBicchWarn: true };
var stylusCompensate, convertPuntToBicchiere, convertPuntToRoller, convertPuntToFinger;
// eslint-disable-next-line no-eval
eval(bundle + '\n' + names.map(function (n) { return n + '=' + n + ';'; }).join('\n'));

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
var compNonNeg = true, compAdds = 0, pkCamIdx = 1, pkCam = 0;
for (var c = 1; c <= 360; c++) { if (cam[c] > pkCam) { pkCam = cam[c]; pkCamIdx = c; } }
for (var ci = 1; ci <= 360; ci++) {
    var dcomp = (comp[ci]||0) - cam[ci];      // correzione = comp − raw
    if (dcomp < -1e-9) compNonNeg = false;    // mai negativa
    if (dcomp > compAdds) compAdds = dcomp;   // massima aggiunta (sui fianchi)
}
var compAtPeak = Math.abs((comp[pkCamIdx]||0) - cam[pkCamIdx]);   // ~0 al naso
console.log('PUNTALINO (stylusCompensate, offset normale):');
check('correzione ≥ 0 ovunque (mai sottrae, era il bug)', compNonNeg);
check('correzione ~0 al picco/naso (normale = radiale)', compAtPeak < 1e-3, 'Δ@picco ' + compAtPeak.toExponential(1));
check('correzione > 0 sui fianchi (smussatura sfera)', compAdds > 1e-3, 'max +' + compAdds.toFixed(3) + ' mm');

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
var biccFlankUp = 0, biccNoDrop = true;
for (var b = 1; b <= 360; b++) {
    var dd = (biccR[b]||0) - (bicc[b]||0);
    if (dd > biccFlankUp) biccFlankUp = dd;
    if (dd < -1e-6) biccNoDrop = false;       // rPunt non deve MAI abbassare (era il bug)
}
console.log('BICCHIERE (piattello Ø20):');
check('output finito e ≥0', biccFinite);
check('picco ≈ picco grezzo (0.7–1.4×)', biccPeakOK, 'bicch ' + pkB.toFixed(3) + ' vs raw ' + pkRaw.toFixed(3));
check('rPunt>0 NON abbassa il picco (naso invariato)', biccPeakSame && biccNoDrop, 'pkR ' + pkR.toFixed(3) + ' vs pk0 ' + pkB.toFixed(3));
check('rPunt>0 alza i fianchi (compensazione sfera, non più bug)', biccFlankUp > 1e-3, 'max +' + biccFlankUp.toFixed(3) + ' mm');

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO (13/13)'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
