// =============================================================
//  test_surge.js — regressione per il modello spring surge
// =============================================================
// Estrae springSurgeFreqHz + simulateSpringSurge da analisi.html (brace-matcher,
// niente copia-incolla) e verifica:
//   1) FREQUENZA: springSurgeFreqHz = ½·√(k/m_spring); e la fondamentale della
//      catena discreta a N masse converge a quel valore al crescere di N.
//   2) RISONANZA: pilotando la molla con un lift sinusoidale, surgeRatio è
//      molto maggiore quando la frequenza di pilotaggio = frequenza di surge
//      rispetto a un regime fuori risonanza.
//   3) ROBUSTEZZA: output finito e ≥0 a regime normale.
//
// Uso:  node cammes/tools/test_surge.js     (exit 0 = tutto ok)

var fs = require('fs');
var path = require('path');
var html = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8');

function extractFn(src, name) {
    var sig = 'function ' + name + '(';
    var start = src.indexOf(sig);
    if (start < 0) throw new Error('non trovo function ' + name);
    var i = src.indexOf('{', start);
    var depth = 0, inS = null, inLine = false, inBlock = false;
    for (var j = i; j < src.length; j++) {
        var c = src[j], n = src[j + 1];
        if (inLine) { if (c === '\n') inLine = false; continue; }
        if (inBlock) { if (c === '*' && n === '/') { inBlock = false; j++; } continue; }
        if (inS) { if (c === '\\') { j++; continue; } if (c === inS) inS = null; continue; }
        if (c === '/' && n === '/') { inLine = true; j++; continue; }
        if (c === '/' && n === '*') { inBlock = true; j++; continue; }
        if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
    }
    throw new Error('brace non bilanciate in ' + name);
}

var springSurgeFreqHz, simulateSpringSurge;
var bundle = extractFn(html, 'springSurgeFreqHz') + '\n' + extractFn(html, 'simulateSpringSurge');
// eslint-disable-next-line no-eval
eval(bundle + '\nspringSurgeFreqHz = springSurgeFreqHz;\nsimulateSpringSurge = simulateSpringSurge;');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' REGRESSIONE SPRING SURGE');
console.log('=============================================================');

// ---- CHECK 1: frequenza propria + convergenza catena discreta ----
var kNmm = 20, mG = 80;           // molla soft/pesante per regimi moderati
var fAnalytic = springSurgeFreqHz(kNmm, mG);   // ½·√(k/m)
var kSI = kNmm * 1000, mSI = mG / 1000;
var fExpected = 0.5 * Math.sqrt(kSI / mSI);
// fondamentale catena discreta: ω1 = 2√(k_seg/m_i)·sin(π/(2(N+1)))
function discreteF(N) {
    var m_i = mSI / N, k_seg = (N + 1) * kSI;
    var w1 = 2 * Math.sqrt(k_seg / m_i) * Math.sin(Math.PI / (2 * (N + 1)));
    return w1 / (2 * Math.PI);
}
var f4 = discreteF(4), f12 = discreteF(12), f48 = discreteF(48);
var err4 = Math.abs(f4 - fExpected) / fExpected, err48 = Math.abs(f48 - fExpected) / fExpected;
console.log('CHECK 1 (frequenza di surge):');
console.log('   ½·√(k/m) = ' + fExpected.toFixed(1) + ' Hz; springSurgeFreqHz = ' + fAnalytic.toFixed(1) + ' Hz');
console.log('   catena discreta f1: N=4 ' + f4.toFixed(1) + ', N=12 ' + f12.toFixed(1) + ', N=48 ' + f48.toFixed(1) + ' Hz');
check('springSurgeFreqHz = ½·√(k/m)', Math.abs(fAnalytic - fExpected) < 0.1, fAnalytic.toFixed(2));
check('catena discreta converge alla formula continua (err N=48 < err N=4)', err48 < err4 && err48 < 0.02,
      'err4=' + (err4 * 100).toFixed(1) + '% err48=' + (err48 * 100).toFixed(2) + '%');

// ---- CHECK 2: risonanza ----
// Lift sinusoidale a UN periodo su 720° → fondamentale = fCam = rpm/120.
// Risonanza quando fCam = fSurge → rpm = fSurge·120.
var lift = new Array(721);
for (var d = 1; d <= 720; d++) lift[d] = 5 * (1 - Math.cos(2 * Math.PI * d / 720)); // bump 0..10mm, fondam. fCam
var sp = { kSpringN_mm: kNmm, springMassG: mG, springCoils: 12, dampingRatio: 0.04 };
var rpmRes = Math.round(fAnalytic * 120);          // fCam = fSurge (n=1)
var rpmOff = Math.round(rpmRes * 0.62);            // fuori da ogni risonanza bassa
var resR = simulateSpringSurge(lift, rpmRes, sp);
var offR = simulateSpringSurge(lift, rpmOff, sp);
console.log('CHECK 2 (risonanza):');
console.log('   rpm risonante ' + rpmRes + ' → surgeRatio ' + resR.surgeRatio.toFixed(3) +
            '  |  rpm off ' + rpmOff + ' → surgeRatio ' + offR.surgeRatio.toFixed(3));
check('surgeRatio in risonanza >> fuori risonanza (>2×)', resR.surgeRatio > 2 * offR.surgeRatio + 0.05,
      resR.surgeRatio.toFixed(3) + ' vs ' + offR.surgeRatio.toFixed(3));
check('surgeRatio in risonanza significativo (>0.3)', resR.surgeRatio > 0.3, resR.surgeRatio.toFixed(3));

// ---- CHECK 3: robustezza ----
var norm = simulateSpringSurge(lift, 7000, { kSpringN_mm: 30, springMassG: 50, springCoils: 12, dampingRatio: 0.06 });
console.log('CHECK 3 (robustezza @7000 rpm):');
console.log('   surgeFreq ' + norm.surgeFreqHz.toFixed(0) + ' Hz, surgeRatio ' + norm.surgeRatio.toFixed(3) +
            ', maxCoilAmp ' + norm.maxCoilAmpMm.toFixed(3) + ' mm, armonica ' + norm.harmonicOrder);
check('output finito e ≥0', isFinite(norm.surgeRatio) && norm.surgeRatio >= 0 && isFinite(norm.surgeFreqHz), '');

console.log('');
if (fails === 0) { console.log('TUTTI I CHECK PASSANO (5/5)'); process.exit(0); }
else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
