// =============================================================
//  test_fasatura_eventi.js — regressione Lotto D (controrevisione)
//  MAT-03: eventi apertura/chiusura dai CROSSING reali, non centro±dur/2.
//  MAT-02: centro del naso PIATTO (plateau), non il primo massimo.
// =============================================================
//  Uso:  node cammes/tools/test_fasatura_eventi.js   (exit 0 = ok)

var path = require('path');
global.window = global;
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' FASATURA — crossing reali (MAT-03) + naso piatto (MAT-02)');
console.log('=============================================================');

// ---------- MAT-03: findEvents su lobo ASIMMETRICO ----------
console.log('\n--- MAT-03: findEvents (apertura/chiusura da crossing) ---');
check('findEvents esiste', typeof M.findEvents === 'function');
if (typeof M.findEvents === 'function') {
    // Curva crank 1..720: lobo asimmetrico centrato a 500, apertura ripida
    // (fianco 60°), chiusura dolce (fianco 140°). Soglia 0,05.
    var crank = new Array(721);
    for (var i = 1; i <= 720; i++) crank[i] = 0;
    var pk = 500, H = 8;
    for (var d = 1; d <= 720; d++) {
        var rel = d - pk;
        if (rel >= -60 && rel <= 0) crank[d] = H * (1 + rel / 60);       // apertura ripida
        else if (rel > 0 && rel <= 140) crank[d] = H * (1 - rel / 140);  // chiusura dolce
    }
    var ev = M.findEvents(crank, 0.05);
    // apertura attesa ~ 500-60 + piccolo = ~440 - (soglia bassa) → ~440.6; chiusura ~ 500+140*(1-0.05/8)=~639
    check('apertura (openIdx) sul fianco ripido, ~440', Math.abs(ev.openIdx - 440) < 3, 'openIdx=' + ev.openIdx.toFixed(1));
    check('chiusura (closeIdx) sul fianco dolce, ~639', Math.abs(ev.closeIdx - 639) < 3, 'closeIdx=' + ev.closeIdx.toFixed(1));
    // apertura e chiusura ASIMMETRICHE rispetto al picco (crossing veri)
    var preHalf = ev.peakIdx - ev.openIdx, postHalf = ev.closeIdx - ev.peakIdx;
    check('asimmetria catturata (post > pre, non centro±dur/2)', postHalf > preHalf * 1.5, 'pre=' + preHalf.toFixed(0) + ' post=' + postHalf.toFixed(0));
    check('durata = closeIdx-openIdx (~199°)', Math.abs(ev.durationDeg - (ev.closeIdx - ev.openIdx)) < 0.01 && Math.abs(ev.durationDeg - 199) < 4, 'dur=' + ev.durationDeg.toFixed(1));
    // controprova: centro±dur/2 darebbe apertura a peak-dur/2 = 500-99.5 = 400.5,
    // cioè ~40° DIVERSA dalla apertura reale ~440 → il vecchio metodo sbagliava
    var centerMinusHalf = ev.peakIdx - ev.durationDeg / 2;
    check('il vecchio centro-dur/2 sarebbe errato di >30°', Math.abs(centerMinusHalf - ev.openIdx) > 30, 'delta=' + Math.abs(centerMinusHalf - ev.openIdx).toFixed(0) + '°');
}

// ---------- MAT-02: naso piatto ----------
console.log('\n--- MAT-02: camPeakPos su naso PIATTO ---');
if (typeof M.camPeakPos === 'function') {
    // plateau 170..190 a lift 10 (camma 1..360)
    var cam = new Array(361);
    for (var c = 1; c <= 360; c++) cam[c] = (c >= 170 && c <= 190) ? 10 : 0;
    var pos = M.camPeakPos(cam);
    check('plateau 170..190 → centro ~180', Math.abs(pos - 180) < 1.0, 'pos=' + pos.toFixed(2));
    // picco singolo netto invariato
    var cam2 = new Array(361);
    for (var c2 = 1; c2 <= 360; c2++) { var dd = Math.abs(c2 - 200); cam2[c2] = dd < 40 ? 10 * (1 - dd / 40) : 0; }
    check('picco singolo 200 invariato', Math.abs(M.camPeakPos(cam2) - 200) < 0.6, 'pos=' + M.camPeakPos(cam2).toFixed(2));
}

console.log('');
if (fails > 0) { console.log('RISULTATO: ' + fails + ' check FALLITI'); process.exit(1); }
console.log('VALIDATO: eventi dai crossing reali (asimmetria catturata),');
console.log('centro del naso piatto corretto.');
