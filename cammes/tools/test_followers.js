// =============================================================
//  test_followers.js — regressione per le conversioni follower virtuale
// =============================================================
// Estrae convertPuntToBicchiere / convertPuntToRoller / convertPuntToFinger
// direttamente da analisi.html (niente copia-incolla che possa divergere) e
// verifica invarianti DERIVATE dal codice reale, non assunte:
//
//   ROLLER   → out[t] = max(0, raw[t] - rPunt)   (rRoll non entra: è
//              l'approssimazione dichiarata nel commento del codice)
//   FINGER   → con tilt=0 e rPunt=0 la cinematica esatta si riduce al
//              rapporto lineare: out[t] = raw[t] * (lValve / lArm)
//              (e con lValve==lArm → identità)
//   BICCHIERE→ piattello piatto: output finito e ≥0; picco ≈ picco grezzo
//              (al naso il piattello legge ≈ l'alzata di picco); rPunt
//              sottratto (rPunt enorme → output ~0)
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

var names = ['convertPuntToBicchiere', 'convertPuntToRoller', 'convertPuntToFinger'];
var bundle = names.map(function (n) { return extractFn(html, n); }).join('\n\n');

// `window` stub: convertPuntToBicchiere referenzia window.cammesToast nel ramo
// di warning. Definendolo evitiamo ReferenceError a prescindere dai parametri.
// (usato dentro la stringa eval() qui sotto, invisibile al linter)
// eslint-disable-next-line no-unused-vars
var window = { cammesToast: null, _suppressBicchWarn: true };
var convertPuntToBicchiere, convertPuntToRoller, convertPuntToFinger;
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

// ---- ROLLER: out = max(0, raw - rPunt), rRoll ininfluente ----
var rPunt = 1.5;
var roll8  = convertPuntToRoller(cam, 14, 8,  rPunt);
var roll12 = convertPuntToRoller(cam, 14, 12, rPunt);
var rollerExact = true, rollerRRollIndep = true;
for (var i = 1; i <= 360; i++) {
    var expect = Math.max(0, cam[i] - rPunt);
    if (Math.abs((roll8[i]||0) - expect) > 1e-9) rollerExact = false;
    if (Math.abs((roll8[i]||0) - (roll12[i]||0)) > 1e-9) rollerRRollIndep = false;
}
console.log('ROLLER:');
check('out[t] = max(0, raw - rPunt)', rollerExact, 'picco ' + peakOf(roll8).toFixed(3) + ' = ' + (PEAK - rPunt).toFixed(3));
check('rRoll non cambia l\'output (approssimazione dichiarata)', rollerRRollIndep);

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

// ---- BICCHIERE: finito, ≥0, picco ≈ picco grezzo; rPunt sottratto ----
var bicc = convertPuntToBicchiere(cam, 14, 20, 0);
var pkRaw = rawPeak(cam), pkB = peakOf(bicc);
var biccFinite = allFinite(bicc) && allNonNeg(bicc);
var biccPeakOK = (pkB >= 0.7 * pkRaw && pkB <= 1.4 * pkRaw);
var biccBig = convertPuntToBicchiere(cam, 14, 20, /*rPunt*/ PEAK + 5); // rPunt > picco → tutto a 0
var biccZero = peakOf(biccBig) < 1e-6;
console.log('BICCHIERE (piattello Ø20):');
check('output finito e ≥0', biccFinite);
check('picco ≈ picco grezzo (0.7–1.4×)', biccPeakOK, 'bicch ' + pkB.toFixed(3) + ' vs raw ' + pkRaw.toFixed(3));
check('rPunt > picco → output ~0 (sottrazione puntalino)', biccZero, 'picco ' + peakOf(biccBig).toExponential(1));

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO (' + (8) + '/8)'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
