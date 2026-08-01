// =============================================================
//  test_derivate.js — non si deriva un array interpolato
// =============================================================
//  L'accelerazione mostrata dal programma non era convergente: cambiava di 1,4
//  volte fra finestra di lisciatura 5 e 11 punti, e di 2,4 volte senza
//  lisciatura. Da lei dipendono "Acc. max", "Jerk max", la forza d'inerzia, il
//  "Margine" e il "Distacco valvola" — cioe' numeri gia' consegnati.
//
//  LA CAUSA NON SONO I DATI, e questo test lo dimostra invece di affermarlo:
//  su un lobo SINTETICO perfettamente liscio, senza rumore e senza
//  quantizzazione, la vecchia strada (mapCamToCrank + differenze centrali) da'
//  esattamente 2x il valore analitico sugli slot pari e ZERO sui dispari. E'
//  l'interpolazione lineare: curvatura nulla dentro i segmenti, tutta
//  concentrata nei nodi, e la mappatura campiona a mezzo grado camma.
//
//  Un filtro di derivazione migliore non lo toglierebbe: lo medierebbe.
//  Misurato sullo stesso lobo, picco non lisciato / analitico:
//      lineare (vecchia strada) 2,000  ·  cubica 1,125  ·  dominio camma 0,9999
//
//  Uso: node tools/test_derivate.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' DERIVATE: dove i campioni sono veri, non dove sono interpolati');
console.log('=============================================================');

// ---------- lobo cosinusoidale: derivate note in forma chiusa ----------
//   L(t)    = h/2 (1 + cos(pi t / W))          t = gradi CAMMA dal picco
//   L'(t)   = -(h/2)(pi/W) sin(pi t / W)
//   L''(t)  = -(h/2)(pi/W)^2 cos(pi t / W)
// In gradi MANOVELLA il passo e' meta': la derivata di ordine n si divide per 2^n.
var H = 10, W = 90, PICCO = 180;
var cam = new Array(361);
for (var d = 1; d <= 360; d++) {
    var t = d - PICCO;
    if (t > 180) t -= 360; if (t < -180) t += 360;
    cam[d] = (Math.abs(t) < W) ? H / 2 * (1 + Math.cos(Math.PI * t / W)) : 0;
}
function velVera(t)  { return -(H / 2) * (Math.PI / W) * Math.sin(Math.PI * t / W) / 2; }
function accVera(t)  { return -(H / 2) * Math.pow(Math.PI / W, 2) * Math.cos(Math.PI * t / W) / 4; }

console.log('--- le derivate coincidono con quelle analitiche ---');
var D = M.derivateDominioCamma(cam);
check('derivateDominioCamma esportata', typeof M.derivateDominioCamma === 'function');

var accPicco = Math.abs(D.acc[PICCO]);
var accAtteso = Math.abs(accVera(0));
check('accelerazione al picco entro lo 0,1% dell analitica',
    Math.abs(accPicco - accAtteso) < accAtteso * 0.001,
    accPicco.toExponential(4) + ' contro ' + accAtteso.toExponential(4) +
    ' (rapporto ' + (accPicco / accAtteso).toFixed(4) + ')');

// sul fianco, dove la velocita' e' massima
var tFianco = -W / 2;
var iFianco = PICCO + tFianco;
check('velocita sul fianco entro lo 0,5% dell analitica',
    Math.abs(Math.abs(D.vel[iFianco]) - Math.abs(velVera(tFianco))) < Math.abs(velVera(tFianco)) * 0.005,
    D.vel[iFianco].toExponential(4) + ' contro ' + velVera(tFianco).toExponential(4));

// ---------- la conversione di dominio: 2^n, non 2 ----------
//  Un errore qui e' invisibile: la curva ha la forma giusta e il valore
//  sbagliato di un fattore 2 o 4.
console.log('--- la conversione camma->manovella e 2^n per ordine n ---');
var rapVel = Math.abs(D.vel[iFianco]) / (Math.abs(velVera(tFianco)) * 2);
var rapAcc = accPicco / (accAtteso * 4);
check('la velocita e divisa per 2 (non per 1, non per 4)',
    Math.abs(rapVel - 0.5) < 0.01, 'fattore trovato ' + (1 / (rapVel * 2)).toFixed(2));
check('l accelerazione e divisa per 4 (non per 2)',
    Math.abs(rapAcc - 0.25) < 0.01, 'fattore trovato ' + (1 / (rapAcc * 4)).toFixed(2));

// ---------- il difetto che si sta correggendo, riprodotto ----------
//  Deriva l'array GIA' interpolato, come faceva computeDerivatives.
console.log('--- la vecchia strada, riprodotta sullo stesso lobo liscio ---');
var crank = M.mapCamToCrank(cam, 0, 0, 'intake');
function d2Crank(a) {
    var o = new Array(721);
    for (var i = 2; i <= 719; i++) o[i] = (a[i + 1] || 0) - 2 * (a[i] || 0) + (a[i - 1] || 0);
    return o;
}
var accVecchia = d2Crank(crank);
var pari = 0, disp = 0, nP = 0, nD = 0;
for (var q = 290; q <= 350; q++) {
    if (q % 2 === 0) { pari += Math.abs(accVecchia[q] || 0); nP++; }
    else { disp += Math.abs(accVecchia[q] || 0); nD++; }
}
var mediaPari = pari / nP, mediaDisp = disp / nD;
console.log('        slot pari: ' + mediaPari.toExponential(3) + '   slot dispari: ' + mediaDisp.toExponential(3));
check('la vecchia strada alterna: gli slot dispari sono praticamente nulli',
    mediaDisp < mediaPari * 1e-6,
    'rapporto ' + (mediaPari / Math.max(mediaDisp, 1e-300)).toExponential(1));
var piccoVecchio = 0;
for (var i2 = 2; i2 <= 719; i2++) if (Math.abs(accVecchia[i2]) > piccoVecchio) piccoVecchio = Math.abs(accVecchia[i2]);
check('e sovrastima di un fattore 2 su una curva SENZA rumore',
    Math.abs(piccoVecchio / accAtteso - 2) < 0.02,
    (piccoVecchio / accAtteso).toFixed(3) + ' volte l analitico');
check('mentre la strada nuova non sovrastima',
    Math.abs(accPicco / accAtteso - 1) < 0.01,
    (accPicco / accAtteso).toFixed(4) + ' volte l analitico');

// ---------- convergenza: il punto di tutto ----------
//  Il valore non deve dipendere da quanto si liscia.
console.log('--- il valore non dipende piu dalla finestra di lisciatura ---');
function liscia(a, n, w) {
    if (!w || w < 3) return a;
    var h = (w - 1) / 2, o = new Array(n + 1);
    for (var i = 1; i <= n; i++) {
        var s = 0, c = 0;
        for (var j = -h; j <= h; j++) {
            var k = ((i + j - 1) % n + n) % n + 1;
            s += (a[k] || 0); c++;
        }
        o[i] = s / c;
    }
    return o;
}
function piccoAcc(camCurva, w) {
    var dd = M.derivateDominioCamma(liscia(camCurva, 360, w));
    var m = 0;
    for (var i = 1; i <= 360; i++) if (Math.abs(dd.acc[i]) > m) m = Math.abs(dd.acc[i]);
    return m;
}
var f0 = piccoAcc(cam, 0), f5 = piccoAcc(cam, 5), f11 = piccoAcc(cam, 11);
console.log('        finestra 0: ' + (f0 / accAtteso).toFixed(3) +
            '   5: ' + (f5 / accAtteso).toFixed(3) +
            '   11: ' + (f11 / accAtteso).toFixed(3) + '  (volte l analitico)');
check('fra finestra 5 e 11 lo scarto sta sotto il 3%',
    Math.abs(f5 / f11 - 1) < 0.03, 'rapporto f5/f11 = ' + (f5 / f11).toFixed(4));
// per confronto, la vecchia strada sullo stesso lobo
function piccoVecchioCon(w) {
    var c = liscia(crank, 720, w);
    var A = d2Crank(c), m = 0;
    for (var i = 2; i <= 719; i++) if (Math.abs(A[i]) > m) m = Math.abs(A[i]);
    return m;
}
var v5 = piccoVecchioCon(5), v11 = piccoVecchioCon(11);
console.log('        la vecchia strada, stesso lobo: f5/f11 = ' + (v5 / v11).toFixed(4));
check('e la strada nuova e meno sensibile della vecchia',
    Math.abs(f5 / f11 - 1) < Math.abs(v5 / v11 - 1),
    'nuova ' + (f5 / f11).toFixed(4) + ' contro vecchia ' + (v5 / v11).toFixed(4));

// ---------- il ricampionamento non reintroduce il difetto ----------
console.log('--- ricampionare una derivata gia calcolata non crea il dente di sega ---');
var accCrank = M.mapDerivataCamToCrank(D.acc, cam, 0, 'intake');
var pari2 = 0, disp2 = 0, n2 = 0, n3 = 0;
for (var r = 290; r <= 350; r++) {
    if (r % 2 === 0) { pari2 += Math.abs(accCrank[r] || 0); n2++; }
    else { disp2 += Math.abs(accCrank[r] || 0); n3++; }
}
check('sull asse manovella pari e dispari si somigliano',
    Math.abs((pari2 / n2) / (disp2 / n3) - 1) < 0.05,
    'rapporto ' + ((pari2 / n2) / (disp2 / n3)).toFixed(4));
check('e il picco resta quello giusto',
    (function () {
        var m = 0;
        for (var i = 1; i <= 720; i++) if (Math.abs(accCrank[i]) > m) m = Math.abs(accCrank[i]);
        return Math.abs(m / accAtteso - 1) < 0.01;
    })());

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: le derivate si calcolano dove i campioni sono veri, la');
console.log('conversione di dominio e 2^n, il risultato coincide con l analitico');
console.log('e non dipende piu dalla finestra di lisciatura.\n');
