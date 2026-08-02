// =============================================================
//  validate_106_piattello.js — la stessa camma, due tastatori
// =============================================================
//  VALIDAZIONE FISICA INDIPENDENTE, senza scheda del costruttore.
//
//  Sul banco la Peugeot 106 (aspirazione) e' stata misurata DUE volte, con due
//  tastatori diversi:
//      fixtures/106-ASP_puntalino-r1.5_alz.scr   puntalino SFERICO r 1,5
//      fixtures/106-ASP_piattello-d33_alz.scr    piattello PIATTO  D 33
//
//  Il programma deve saper PREVEDERE la seconda partendo dalla prima: e'
//  esattamente cio' che fa convertPuntToBicchiere quando l'operatore chiede
//  "come si comporterebbe questa camma sotto un bicchiere Ø33". Qui la risposta
//  non si confronta con una scheda, ma con una MISURA FISICA dello stesso lobo.
//
//  PERCHE' ESISTE QUESTO TEST. La compensazione del puntalino sferico ha avuto
//  il verso ROVESCIATO fino alla v3.6.0: sommava l'errore invece di toglierlo.
//  Il difetto era stato trovato contro un oracolo sintetico (profilo noto ->
//  misura simulata della sfera -> ritorno), ma per la conferma FISICA si
//  contava sulla camma VW e sulla scheda del rettificatore. Quella camma non
//  c'e' piu' e la ri-scansione non e' piu' possibile. Questa coppia la
//  sostituisce, ed e' una prova migliore: nessuna scheda di mezzo, nessun
//  dubbio sull'usura (stesso lobo, stessa sessione), due strumenti indipendenti.
//
//  Misurato: la formula precedente era PEGGIO del non compensare affatto.
//      formula v3.6.0 (sommava)     RMS 0,309 mm
//      nessuna compensazione        RMS 0,170 mm
//      inversa esatta (v3.7.0)      RMS 0,065 mm
//
//  Uso: node tools/validate_106_piattello.js   (exit 0 = ok)

var path = require('path');
var fs = require('fs');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggi(nome) {
    var t = fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8');
    var o = new Array(361);
    for (var i = 0; i <= 360; i++) o[i] = 0;
    t.split(/\r?\n/).forEach(function (r) {
        if (!r || r.charAt(0) === '#' || /^_/.test(r)) return;
        var p = r.split(/[;,\s]+/).filter(function (s) { return s !== ''; });
        if (p.length < 2) return;
        var g = parseInt(p[0], 10), v = parseFloat(String(p[1]).replace(',', '.'));
        if (!isNaN(g) && !isNaN(v) && g >= 1 && g <= 360) o[g] = v > 0 ? v : 0;
    });
    return o;
}
function picco(a) { var m = 0, i0 = 0; for (var i = 1; i <= 360; i++) if (a[i] > m) { m = a[i]; i0 = i; } return { v: m, i: i0 }; }
function ruota(a, k) {
    var o = new Array(361); o[0] = 0;
    for (var i = 1; i <= 360; i++) { var j = ((i - 1 + k) % 360 + 360) % 360 + 1; o[i] = a[j]; }
    return o;
}
// Si confronta solo dove la camma ALZA davvero: sul cerchio base si
// confronterebbe l'eccentricita' di due montaggi, non la forma del lobo.
var SOGLIA = 0.30;   // mm
function scarto(a, b) {
    var mx = 0, dove = 0, q = 0, n = 0;
    for (var i = 1; i <= 360; i++) {
        if (Math.max(a[i] || 0, b[i] || 0) < SOGLIA) continue;
        var d = Math.abs((a[i] || 0) - (b[i] || 0));
        if (d > mx) { mx = d; dove = i; }
        q += d * d; n++;
    }
    return { max: mx, dove: dove, rms: n ? Math.sqrt(q / n) : NaN, punti: n };
}
// Le due scansioni partono da posizioni d'albero diverse: si cerca lo
// scorrimento circolare che le sovrappone meglio, a passo di 1 grado (la
// risoluzione dei file). Non e' un aggiustamento di comodo: e' il montaggio.
function allinea(prev, mis) {
    var best = null;
    for (var k = -180; k <= 180; k++) {
        var e = scarto(ruota(prev, k), mis);
        if (!best || e.rms < best.e.rms) best = { k: k, e: e };
    }
    return best;
}
// la formula PRECEDENTE, riprodotta qui per il confronto: se un domani
// qualcuno rimette il segno sbagliato, questo test lo becca coi numeri
function compensaVecchia(lift, rBase, rPunt) {
    var DEG = Math.PI / 180;
    var out = new Array(361); out[0] = 0;
    for (var i = 1; i <= 360; i++) {
        var pr = lift[i === 1 ? 360 : i - 1] || 0, su = lift[i === 360 ? 1 : i + 1] || 0;
        var dL = (su - pr) / 2 / DEG;
        var r = rBase + (lift[i] || 0);
        out[i] = (lift[i] || 0) + rPunt * (1 - Math.cos(Math.atan2(dL, r)));
    }
    return out;
}

var R_BASE = 16;      // cerchio base 32 mm di DIAMETRO (dichiarato dall'officina)
var R_PUNT = 1.5;
var D_PIATT = 33;

console.log('=============================================================');
console.log(' PEUGEOT 106 ASPIRAZIONE — puntalino r1,5 contro piattello Ø33');
console.log('=============================================================');

var conPunt = leggi('106-ASP_puntalino-r1.5_alz.scr');
var conPiatt = leggi('106-ASP_piattello-d33_alz.scr');
var pP = picco(conPunt), pB = picco(conPiatt);
console.log('  puntalino: picco ' + pP.v.toFixed(3) + ' mm @ ' + pP.i + '° camma');
console.log('  piattello: picco ' + pB.v.toFixed(3) + ' mm @ ' + pB.i + '° camma');
console.log('');

check('le due scansioni sono complete (360 punti, picco plausibile)',
    pP.v > 5 && pP.v < 20 && pB.v > 5 && pB.v < 20,
    pP.v.toFixed(2) + ' / ' + pB.v.toFixed(2) + ' mm');
check('e sono due misure DIVERSE, non lo stesso file salvato due volte',
    scarto(conPunt, conPiatt).rms > 0.001,
    'se fossero identiche il confronto non proverebbe niente');

// ---------- la previsione ----------
console.log('');
console.log('--- previsione del piattello Ø33 dalla scansione col puntalino ---');
function prevediPiattello(compensa) {
    var vero = compensa(conPunt);
    // stesso inviluppo di convertPuntToBicchiere, ma partendo da una curva gia'
    // compensata: cosi' si isola il VERSO della compensazione, che e' cio' che
    // questo test deve giudicare.
    var DEG = Math.PI / 180, R = D_PIATT / 2;
    var r = new Array(361);
    for (var t = 1; t <= 360; t++) r[t] = R_BASE + (vero[t] || 0);
    var raw = new Array(361); raw[0] = 0;
    for (var a = 1; a <= 360; a++) {
        var best = -Infinity;
        for (var t2 = 1; t2 <= 360; t2++) {
            var ang = (t2 - a) * DEG;
            var x = r[t2] * Math.cos(ang);
            if (x < -R || x > R) continue;
            var y = r[t2] * Math.sin(ang);
            if (y > best) best = y;
        }
        var l = best - R_BASE;
        raw[a] = l > 0 ? l : 0;
    }
    var o = new Array(361); o[0] = 0;
    for (var i = 1; i <= 360; i++) { var s = ((i - 90) % 360 + 360) % 360; if (s === 0) s = 360; o[i] = raw[s]; }
    return o;
}

var eOra = allinea(prevediPiattello(function (l) { return M.stylusCompensate(l, R_BASE, R_PUNT); }), conPiatt);
var eSenza = allinea(prevediPiattello(function (l) { return l.slice(); }), conPiatt);
var eVecchia = allinea(prevediPiattello(function (l) { return compensaVecchia(l, R_BASE, R_PUNT); }), conPiatt);

console.log('  compensazione ATTUALE  : RMS ' + eOra.e.rms.toFixed(4) + ' mm   max ' + eOra.e.max.toFixed(4) + '   (scorrimento ' + eOra.k + '°, ' + eOra.e.punti + ' punti)');
console.log('  senza compensare       : RMS ' + eSenza.e.rms.toFixed(4) + ' mm   max ' + eSenza.e.max.toFixed(4));
console.log('  formula precedente     : RMS ' + eVecchia.e.rms.toFixed(4) + ' mm   max ' + eVecchia.e.max.toFixed(4));
console.log('');

// Tolleranza: 0,12 mm di RMS. Non e' scelta per far passare il test — l'accordo
// misurato e' 0,065 mm, quindi c'e' quasi il doppio di margine. Serve come
// rilevatore di deriva: due scansioni fatte con montaggi diversi, a 1 grado di
// risoluzione, non possono accordarsi meglio di qualche centesimo.
var TOLL_RMS = 0.12;
check('la conversione a piattello PREVEDE la misura fisica',
    eOra.e.rms < TOLL_RMS,
    'RMS ' + eOra.e.rms.toFixed(4) + ' mm contro una tolleranza di ' + TOLL_RMS);

check('compensare e MEGLIO che non compensare',
    eOra.e.rms < eSenza.e.rms,
    eOra.e.rms.toFixed(4) + ' contro ' + eSenza.e.rms.toFixed(4));

// Il controllo che avrebbe fermato il difetto: la formula col verso rovesciato
// e' PEGGIO del non compensare affatto. Se un domani torna, qui si vede.
check('la formula col verso rovesciato sarebbe peggio del non compensare',
    eVecchia.e.rms > eSenza.e.rms,
    'vecchia ' + eVecchia.e.rms.toFixed(4) + ' contro ' + eSenza.e.rms.toFixed(4) + ' senza');

check('e la compensazione attuale la batte di almeno tre volte',
    eVecchia.e.rms / eOra.e.rms > 3,
    (eVecchia.e.rms / eOra.e.rms).toFixed(2) + 'x');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO su misura fisica: dalla scansione col puntalino si prevede');
console.log('la lettura di un piattello Ø33 entro ' + eOra.e.rms.toFixed(3) + ' mm RMS.');
console.log('Nessuna scheda del costruttore di mezzo, nessun dubbio sull usura:');
console.log('stesso lobo, due strumenti indipendenti.');
process.exit(0);
