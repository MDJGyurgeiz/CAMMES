// =============================================================
//  test_mat01_events.js — MAT-01 (controrevisione v3.4.1)
// =============================================================
//  findEvents calcola i crossing reali ma:
//   - DUE LOBI distinti sopra soglia NON producevano AMBIGUOUS: la
//     funzione partiva dal picco globale e restituiva silenziosamente
//     la coppia attorno ad esso, ignorando l'altro lobo;
//   - nessun elenco di coppie candidate;
//   - il doughnut in UI ricostruiva comunque centro±durata/2
//     (verifica browser separata: gli archi ora escono da openIdx/closeIdx).
//
//  Questo test è stato scritto PRIMA del fix: sulla v3.4.1 fallisce
//  (due lobi -> ambiguous=false, candidates assente).
//
//  Uso: node tools/test_mat01_events.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function lobo(center, halfWidth, height) {
    // aggiunge su base zero un lobo coseno rialzato [center±halfWidth] (crank 1..720)
    return function (arr) {
        for (var d = 1; d <= 720; d++) {
            var dd = ((d - center + 360) % 720 + 720) % 720 - 360;   // distanza circolare firmata
            var x = dd / halfWidth;
            if (x > -1 && x < 1) arr[d] = Math.max(arr[d], height * 0.5 * (1 + Math.cos(Math.PI * x)));
        }
        return arr;
    };
}
function zeros() { var a = new Array(721); for (var i = 0; i <= 720; i++) a[i] = 0; return a; }

console.log('=============================================================');
console.log(' EVENTI DI FASATURA REALI - MAT-01');
console.log('=============================================================');

console.log('--- lobo singolo ASIMMETRICO: crossing esatti (regressione MAT-03) ---');
// fianco apertura ripido (40 gradi), chiusura dolce (120 gradi), picco a 360
var asym = zeros();
for (var d = 1; d <= 720; d++) {
    if (d >= 320 && d < 360) asym[d] = 8 * (d - 320) / 40;          // rampa ripida
    else if (d >= 360 && d <= 480) asym[d] = 8 * (480 - d) / 120;   // discesa dolce
}
var evA = M.findEvents(asym, 0.05);
check('non ambiguo', evA.ambiguous === false);
// crossing analitici a 0.05mm: apertura 320 + 40*0.05/8 = 320.25; chiusura 480 - 120*0.05/8 = 479.25
check('apertura dal crossing REALE (320.25)', Math.abs(evA.openIdx - 320.25) < 0.02, 'openIdx=' + evA.openIdx);
check('chiusura dal crossing REALE (479.25)', Math.abs(evA.closeIdx - 479.25) < 0.02, 'closeIdx=' + evA.closeIdx);
check('durata = close-open (asimmetrica, non 2*(pk-open))',
    Math.abs(evA.durationDeg - (479.25 - 320.25)) < 0.05, 'dur=' + evA.durationDeg);
check('candidates: la coppia scelta e dichiarata', Array.isArray(evA.candidates) && evA.candidates.length === 1,
    'candidates=' + JSON.stringify(evA.candidates ? evA.candidates.length : null));

console.log('--- attraversamento 360/1 (wrap) ---');
var wrap = zeros(); lobo(10, 60, 8)(wrap);   // lobo a cavallo di 720/1
var evW = M.findEvents(wrap, 0.05);
check('wrap: non ambiguo', evW.ambiguous === false);
check('wrap: open prima della cucitura (>650)', evW.openIdx > 650, 'openIdx=' + evW.openIdx);
check('wrap: close dopo la cucitura (<80)', evW.closeIdx < 80, 'closeIdx=' + evW.closeIdx);
// crossing analitici: cos(pi*x)=-0.9875 -> x=+/-0.94967 -> semi-larghezza 56.98
check('wrap: durata analitica 113.96 gradi', Math.abs(evW.durationDeg - 113.96) < 0.5, 'dur=' + evW.durationDeg);

console.log('--- DUE LOBI distinti -> AMBIGUOUS con coppie candidate ---');
var due = zeros(); lobo(200, 60, 8)(due); lobo(500, 60, 7.5)(due);
var evD = M.findEvents(due, 0.05);
check('due lobi -> ambiguous=true (NON la prima coppia silenziosa)', evD.ambiguous === true,
    'ambiguous=' + evD.ambiguous + ' open=' + evD.openIdx);
check('due lobi -> entrambe le coppie candidate', Array.isArray(evD.candidates) && evD.candidates.length === 2,
    'candidates=' + (evD.candidates ? evD.candidates.length : 'assente'));
if (evD.candidates && evD.candidates.length === 2) {
    var c1 = evD.candidates[0], c2 = evD.candidates[1];
    check('candidata 1 attorno a 200', Math.min(Math.abs(c1.openIdx - 145), Math.abs(c2.openIdx - 145)) < 5,
        'open1=' + c1.openIdx + ' open2=' + c2.openIdx);
}
check('due lobi -> niente openIdx "ufficiale"', isNaN(evD.openIdx));

console.log('--- DUE PLATEAU EQUIVALENTI -> ambiguita esplicita ---');
var pl = zeros();
for (var p1 = 150; p1 <= 200; p1++) pl[p1] = 5.0;   // plateau 1
for (var p2 = 450; p2 <= 500; p2++) pl[p2] = 5.0;   // plateau 2 identico
var evP = M.findEvents(pl, 0.05);
check('due plateau uguali -> ambiguous', evP.ambiguous === true);
check('due plateau -> 2 candidate', evP.candidates && evP.candidates.length === 2);

console.log('--- rumore di soglia NON crea ambiguita (regola documentata) ---');
var noise = zeros(); lobo(360, 100, 8)(noise);
noise[100] = 0.06;   // spuntone appena sopra soglia (rumore), picco 8 mm altrove
var evN = M.findEvents(noise, 0.05);
check('spuntone sotto il 20% del picco -> NON ambiguo', evN.ambiguous === false,
    'ambiguous=' + evN.ambiguous);

console.log('--- profilo sotto soglia -> ambiguo (regressione) ---');
var flat = zeros();
var evF = M.findEvents(flat, 0.05);
check('tutto sotto soglia -> ambiguous', evF.ambiguous === true);

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: eventi dai crossing reali con wrap, due lobi/plateau');
console.log('equivalenti dichiarati AMBIGUOUS con le coppie candidate,');
console.log('rumore di soglia filtrato con regola documentata.\n');
