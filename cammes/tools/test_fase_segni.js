// =============================================================
//  test_fase_segni.js — regressione Lotto 2 audit esterno
//  (MAT-02 fase indipendente dallo zero di scansione,
//   MAT-03 convenzione segni = etichette ATDC/BTDC,
//   MAT-04 anticipo applicato alla mappatura)
// =============================================================
//  Convenzione CAMMES (asse albero 1..720, PMS incrocio = indice 360):
//   - ASPIRAZIONE: centro lobo a N° DOPO il PMS  → picco a indice 360+N
//   - SCARICO:     centro lobo a N° PRIMA del PMS → picco a indice 360-N
//   - anticipo adv: la camma ruota in anticipo → centro asp = N-adv (ATDC),
//     centro sc = N+adv (BTDC). L'anticipo si applica al CENTRO EFFETTIVO
//     passato a mapCamToCrank (helper effectiveCenters).
//   - la fase è riferita al PICCO MISURATO (sub-grado), non al grado 180
//     dello zero arbitrario di scansione (audit MAT-02).
//
//  Uso:  node cammes/tools/test_fase_segni.js   (exit 0 = ok)

var path = require('path');
var fs = require('fs');
global.window = global;
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function peakIdx(arr, from, to) {
    var m = -Infinity, idx = 0;
    for (var i = from; i <= to; i++) if (isFinite(arr[i]) && arr[i] > m) { m = arr[i]; idx = i; }
    return idx;
}

// Lobo sintetico triangolare SIMMETRICO con picco al grado-camma pk
function triCam(pk, halfWidth, height) {
    var a = new Array(361); a[0] = 0;
    for (var d = 1; d <= 360; d++) {
        var dd = Math.abs(d - pk); if (dd > 180) dd = 360 - dd;
        a[d] = dd < halfWidth ? height * (1 - dd / halfWidth) : 0;
    }
    return a;
}
// Lobo ASIMMETRICO: fianco di apertura ripido (30°), chiusura dolce (90°).
// La scansione segue il senso di rotazione: gradi crescenti = tempo che avanza,
// quindi l'apertura è PRIMA del picco (indici minori).
function asymCam(pk) {
    var a = new Array(361); a[0] = 0;
    for (var d = 1; d <= 360; d++) {
        var rel = d - pk; if (rel > 180) rel -= 360; if (rel < -180) rel += 360;
        if (rel >= -30 && rel <= 0)      a[d] = 10 * (1 + rel / 30);   // apertura ripida
        else if (rel > 0 && rel <= 90)   a[d] = 10 * (1 - rel / 90);   // chiusura dolce
        else a[d] = 0;
    }
    return a;
}

console.log('=============================================================');
console.log(' FASE E SEGNI — regressione audit MAT-02 / MAT-03 / MAT-04');
console.log('=============================================================');

// ---------- MAT-03: convenzione segni = etichette ----------
console.log('\n--- MAT-03: aspirazione ATDC, scarico BTDC ---');
var tri = triCam(180, 60, 10);
var ci = M.mapCamToCrank(tri, 108, 0, 'intake');
var ce = M.mapCamToCrank(tri, 112, 0, 'exhaust');
check('intake centro 108 → picco a 360+108=468', Math.abs(peakIdx(ci, 1, 720) - 468) <= 1, 'picco a ' + peakIdx(ci, 1, 720));
check('exhaust centro 112 → picco a 360-112=248', Math.abs(peakIdx(ce, 1, 720) - 248) <= 1, 'picco a ' + peakIdx(ce, 1, 720));

// ---------- MAT-02: fase indipendente dallo zero di scansione ----------
console.log('\n--- MAT-02: stesso lobo, zeri di scansione diversi → stessa fase ---');
// stessa camma "fisica", scansionata con zero arbitrario: picco a 189 e a 77
var scan1 = triCam(189, 60, 10);
var scan2 = triCam(77, 60, 10);
var m1 = M.mapCamToCrank(scan1, 106, 0, 'intake');
var m2 = M.mapCamToCrank(scan2, 106, 0, 'intake');
check('zero A (picco@189) → picco crank 466', Math.abs(peakIdx(m1, 1, 720) - 466) <= 1, 'picco a ' + peakIdx(m1, 1, 720));
check('zero B (picco@77)  → picco crank 466', Math.abs(peakIdx(m2, 1, 720) - 466) <= 1, 'picco a ' + peakIdx(m2, 1, 720));
var maxDiff = 0;
for (var i = 1; i <= 720; i++) maxDiff = Math.max(maxDiff, Math.abs(m1[i] - m2[i]));
check('curve mappate identiche (Δmax < 0.02 mm)', maxDiff < 0.02, 'Δmax ' + maxDiff.toFixed(4));

// Fixture VW reale: il picco grezzo è a 189° (zero di scansione arbitrario);
// la fase mappata deve dipendere SOLO dal centro dichiarato.
var vw = M.parseCamFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'VW-kr1_8-ASP_alz.scr'), 'utf8'));
var vwMap = M.mapCamToCrank(vw, 106, 0, 'intake');
check('VW asp centro 106 → picco crank 466 (non 272)', Math.abs(peakIdx(vwMap, 1, 720) - 466) <= 1, 'picco a ' + peakIdx(vwMap, 1, 720));

// ---------- Fianchi: la mappatura preserva l'orientamento temporale ----------
console.log('\n--- MAT-03b: lobo asimmetrico, fianco apertura prima del picco ---');
var asym = M.mapCamToCrank(asymCam(200), 108, 0, 'intake');
var pkA = peakIdx(asym, 1, 720);
// semi-larghezza al 50%: lato apertura (indici < picco) stretta (~30 crank°),
// lato chiusura (indici > picco) larga (~90 crank°)
var wOpen = 0, wClose = 0;
for (i = pkA; i >= pkA - 200; i--) { if (asym[i] >= 5) wOpen = pkA - i; else break; }
for (i = pkA; i <= pkA + 200; i++) { if (asym[i] >= 5) wClose = i - pkA; else break; }
check('apertura ripida PRIMA del picco (w50 open < w50 close)', wOpen < wClose, 'open ' + wOpen + ' vs close ' + wClose + ' crank°');
check('larghezze ≈ 30/90 crank° (fattore 2 cam→crank: 30/90 cam° /2 *2)', Math.abs(wOpen - 30) <= 3 && Math.abs(wClose - 90) <= 3, wOpen + '/' + wClose);

// ---------- MAT-04: anticipo nel centro effettivo ----------
console.log('\n--- MAT-04: helper effectiveCenters ---');
check('effectiveCenters esiste', typeof M.effectiveCenters === 'function');
if (typeof M.effectiveCenters === 'function') {
    var ec = M.effectiveCenters(106, 112, 4);
    check('adv 4 → intake 106-4=102 ATDC', ec.intake === 102, 'intake ' + ec.intake);
    check('adv 4 → exhaust 112+4=116 BTDC', ec.exhaust === 116, 'exhaust ' + ec.exhaust);
    var mAdv = M.mapCamToCrank(tri, ec.intake, 0, 'intake');
    check('curva con adv 4 → picco a 462', Math.abs(peakIdx(mAdv, 1, 720) - 462) <= 1, 'picco a ' + peakIdx(mAdv, 1, 720));
    var ec0 = M.effectiveCenters(106, 112, 0);
    check('adv 0 → centri invariati', ec0.intake === 106 && ec0.exhaust === 112);
}

// ---------- Sanità: alzata al PMS coerente con la curva fasata ----------
console.log('\n--- Sanità: campionamento al PMS (indice 360) ---');
// triangolo simmetrico h=10, semiampiezza 60 cam° = 120 crank°, centro 104:
// al PMS (104 crank° = 52 cam° dal picco) alzata attesa = 10*(1-52/60) = 1.333
var cPms = M.mapCamToCrank(triCam(180, 60, 10), 104, 0, 'intake');
check('alzata@PMS teorica 1.333 mm', Math.abs(cPms[360] - 1.3333) < 0.02, 'PMS ' + cPms[360].toFixed(4));

console.log('');
if (fails > 0) { console.log('RISULTATO: ' + fails + ' check FALLITI'); process.exit(1); }
console.log('VALIDATO: fase riferita al picco misurato (zero di scansione');
console.log('irrilevante), aspirazione ATDC / scarico BTDC come le etichette,');
console.log('anticipo applicato ai centri effettivi.');
