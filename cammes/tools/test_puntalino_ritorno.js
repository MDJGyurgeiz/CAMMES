// =============================================================
//  test_puntalino_ritorno.js — andata e ritorno del tastatore sferico
// =============================================================
//  Sospetto dell'officina: "la lettura col puntalino r 1.5 non mi convince,
//  probabili letture falsate dalla risultante". Fondato, e in due modi.
//
//  LA FISICA. Il banco misura con una sfera di raggio r il cui centro scorre su
//  una retta radiale: e' la cinematica di un follower a rullo radiale. Sui
//  fianchi la normale al profilo non e' radiale, la sfera tocca "piu' avanti" e
//  il comparatore legge IN PIU'. Vale la disuguaglianza, non l'opinione:
//      d(a) = max_th [ rho cos D + sqrt(r^2 - rho^2 sin^2 D) ]  >=  rho(a) + r
//  (basta prendere D = 0 dentro il massimo). Quindi l'alzata letta e' SEMPRE
//  maggiore o uguale a quella vera, e la compensazione deve SOTTRARRE.
//
//  IL CODICE SOMMAVA. stylusCompensate faceva lift + rPunt*(1 - cos alpha).
//  L'ordine di grandezza era giusto, il verso no: l'errore non veniva tolto,
//  veniva raddoppiato. Misurato contro un oracolo esatto: sempre 2 volte lo
//  scarto della curva non compensata.
//
//  PERCHE' IL RAGIONAMENTO DI PRIMA SBAGLIAVA. Calcolava bene la parte radiale
//  ma dimenticava che il punto di contatto NON sta all'angolo del tastatore: e'
//  spostato lateralmente di 1-2 gradi camma sui fianchi. Riassegnando quel
//  raggio all'angolo sbagliato si introduce un termine che vale circa il doppio
//  di quello radiale ed e' di segno opposto. Il commento diceva "la correzione
//  e' SEMPRE >= 0": affermava l'esatto contrario del vero.
//
//  L'INVERSA ESATTA. Il centro della sfera descrive la pitch curve
//  d(a) = rBase + r + s(a). Il punto di contatto sta a distanza r lungo la
//  normale ALLA PITCH:
//      phi   = atan2(d', d)
//      rho   = sqrt(d^2 - 2 d r cos phi + r^2)
//      theta = a + atan2(r sin phi, d - r cos phi)
//  e poi si ricampiona sui gradi interi, perche' theta non e' a. La
//  riassegnazione dell'angolo NON e' un raffinamento: e' il termine dominante.
//
//  Questo test costruisce l'oracolo da zero — profilo analitico noto, misura
//  della sfera per forza bruta a passo 0,01 gradi, indipendente dalla libreria —
//  e chiede che la compensazione riporti al profilo di partenza. E' la prova che
//  mancava: i controlli esistenti guardavano solo il SEGNO della correzione,
//  cioe' proprio la cosa sbagliata, e congelavano il difetto.
//
//  Scritto PRIMA del fix: sulla versione precedente fallisce con scarti
//  0,09-0,70 mm.
//
//  Uso: node tools/test_puntalino_ritorno.js   (exit 0 = ok)

var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var DEG = Math.PI / 180;
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

// ---------- profilo camma analitico, liscio e derivabile ----------
// (1+cos)^2/4: vale 1 al naso, si annulla ai bordi con derivata prima e seconda
// nulle, quindi non introduce spigoli che falserebbero il confronto.
function profilo(rBase, alzata, durataGradi) {
    var mezza = durataGradi / 2;
    return function (thDeg) {
        var dd = ((thDeg - 180) % 360 + 540) % 360 - 180;
        if (Math.abs(dd) >= mezza) return rBase;
        var f = 1 + Math.cos(Math.PI * dd / mezza);
        return rBase + alzata * f * f / 4;
    };
}

// ---------- l'oracolo: cosa legge davvero la sfera ----------
function misuraSfera(rho, rBase, r) {
    var s = new Array(361);
    s[0] = 0;
    for (var a = 1; a <= 360; a++) {
        var best = -Infinity;
        for (var off = -6; off <= 6; off += 0.01) {
            var ro = rho(a + off);
            var D = off * DEG;
            var lat = ro * Math.sin(D);
            if (lat * lat > r * r) continue;
            var d = ro * Math.cos(D) + Math.sqrt(r * r - lat * lat);
            if (d > best) best = d;
        }
        var lift = best - (rBase + r);
        s[a] = lift > 0 ? lift : 0;
    }
    return s;
}

function scarto(a, b) {
    var mx = 0, dove = 0, rms = 0;
    for (var i = 1; i <= 360; i++) {
        var e = Math.abs((a[i] || 0) - (b[i] || 0));
        if (e > mx) { mx = e; dove = i; }
        rms += e * e;
    }
    return { max: mx, dove: dove, rms: Math.sqrt(rms / 360) };
}

console.log('=============================================================');
console.log(' PUNTALINO SFERICO: si deve tornare al profilo di partenza');
console.log('=============================================================');

var CASI = [
    { n: 'auto tipica (base 34, alzata 9,0, dur 220)', rB: 34, h: 9.0, dur: 220 },
    { n: 'camma RIF-3 (base 16, alzata 10,6, dur 230)', rB: 16, h: 10.6, dur: 230 },
    { n: 'sportiva    (base 28, alzata 11,5, dur 200)', rB: 28, h: 11.5, dur: 200 },
    { n: 'stretta     (base 16, alzata 8,5, dur 180)', rB: 16, h: 8.5, dur: 180 }
];
// Tolleranza: 0,02 mm, cioe' un ordine di grandezza sotto la ripetibilita' del
// banco (2-4 micron di rumore, ma decine di micron di dispersione reale). Non e'
// scelta per far passare il test: l'inversa esatta chiude a ~1 micron.
var TOLL = 0.02;

[1.5, 3.0].forEach(function (r) {
    console.log('');
    console.log('--- puntalino R ' + r.toFixed(1) + ' mm ---');
    CASI.forEach(function (c) {
        var rho = profilo(c.rB, c.h, c.dur);
        var vero = new Array(361); vero[0] = 0;
        for (var i = 1; i <= 360; i++) vero[i] = rho(i) - c.rB;

        var mis = misuraSfera(rho, c.rB, r);

        // (a) la sfera legge SEMPRE in piu, mai in meno: e la ragione del segno
        var sotto = 0, eccessoMax = 0;
        for (i = 1; i <= 360; i++) {
            var d = mis[i] - vero[i];
            if (d < -1e-6) sotto++;
            if (d > eccessoMax) eccessoMax = d;
        }
        check(c.n + ': la sfera non legge mai in MENO del vero',
            sotto === 0, sotto + ' gradi sotto, eccesso max ' + eccessoMax.toFixed(4) + ' mm');

        // (b) e la compensazione deve riportare al profilo di partenza
        var ric = M.stylusCompensate(mis, c.rB, r);
        var eRic = scarto(ric, vero);
        var eGrezza = scarto(mis, vero);
        check(c.n + ': compensando si torna al profilo vero',
            eRic.max < TOLL,
            'scarto ' + eRic.max.toFixed(4) + ' mm (grezza ' + eGrezza.max.toFixed(4) + ')');

        // (c) e non deve MAI essere peggio che non compensare affatto
        check(c.n + ': compensare non peggiora',
            eRic.max <= eGrezza.max,
            'compensata ' + eRic.max.toFixed(4) + ' vs grezza ' + eGrezza.max.toFixed(4));
    });
});

// ---------- invarianti che devono restare ----------
console.log('');
console.log('--- quello che non deve cambiare ---');
var rho0 = profilo(16, 10.6, 230);
var vero0 = new Array(361); for (var k = 1; k <= 360; k++) vero0[k] = rho0(k) - 16;
var mis0 = misuraSfera(rho0, 16, 1.5);

var senza = M.stylusCompensate(mis0, 16, 0);
check('con rPunt = 0 (punta a coltello) la curva non viene toccata',
    scarto(senza, mis0).max < 1e-9, 'la compensazione deve essere un no-op');

var comp = M.stylusCompensate(mis0, 16, 1.5);
var piccoVero = Math.max.apply(null, vero0.slice(1, 361));
var piccoComp = Math.max.apply(null, comp.slice(1, 361));
check('il picco resta quello vero (al naso la normale e radiale: nessun errore)',
    Math.abs(piccoComp - piccoVero) < 0.005,
    'vero ' + piccoVero.toFixed(4) + ', compensato ' + piccoComp.toFixed(4));

var negativi = 0;
for (k = 1; k <= 360; k++) if (comp[k] < 0) negativi++;
check('nessuna alzata negativa', negativi === 0, negativi + ' gradi negativi');

// il verso della correzione, che il codice aveva rovesciato
var sopra = 0, sottoC = 0;
for (k = 1; k <= 360; k++) {
    var dd = comp[k] - mis0[k];
    if (dd > 1e-6) sopra++; else if (dd < -1e-6) sottoC++;
}
check('la correzione SOTTRAE sui fianchi (era il verso sbagliato)',
    sottoC > 0 && sopra === 0,
    sottoC + ' gradi abbassati, ' + sopra + ' alzati');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: dalla misura della sfera si torna al profilo vero entro ' + TOLL + ' mm.');
process.exit(0);
