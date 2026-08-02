// =============================================================
//  test_legenda_fasatura.js — la legenda e una didascalia, non un interruttore
// =============================================================
//  Segnalazione dall'officina: "grafico torta errato", ancora dopo ab085e6.
//
//  La matematica del diagramma e' giusta: le fette sommano 720 su tutti e tre
//  gli anelli. Il difetto e' che UN CLICK SULLA LEGENDA lo distrugge.
//
//  Il blocco plugins.legend di updateTimingDiagram definisce display, position
//  e labels.generateLabels, ma NON onClick. Per un grafico doughnut Chart.js
//  non lascia quel gancio vuoto: ci mette il proprio predefinito, che chiama
//  chart.toggleDataVisibility(index). E quello NON nasconde un dataset (un
//  anello): nasconde la FETTA di quell'indice IN TUTTI E TRE gli anelli, e poi
//  ogni anello riscala gli archi rimasti perche' riempiano comunque il giro.
//
//  Le voci di legenda sono costruite a mano e portano index 0/1/2, che sono
//  proprio gli indici delle fette (0 = chiuso iniziale, 1 = ARCO APERTO,
//  2 = chiuso finale). Quindi un click sulla seconda voce spegne l'arco aperto
//  di aspirazione, scarico E incrocio insieme: restano tre corone grigie.
//  E' esattamente il sintomo riferito.
//
//  Misurato nel browser sui dati VW KR (ASP 319,63/284,02/116,35):
//  dopo il click i totali degli anelli passano da 720 a 436,0 / 438,9 / 641,7.
//
//  Aggravante: generateLabels non imposta 'hidden', quindi la voce non viene
//  barrata e non c'e' modo di accorgersi che il grafico e' in uno stato
//  alterato. E lo stato finisce nel PDF, perche' l'export fotografa
//  l'istanza viva.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_legenda_fasatura.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' DIAGRAMMA DI FASATURA: la legenda non deve spegnere le fette');
console.log('=============================================================');

// ---------- il blocco della legenda del diagramma di fasatura ----------
// Ancorato al testo, non alle righe: il file si sposta di continuo.
var iDia = HTML.indexOf('timingChartInstance = new Chart');
check('trovo la creazione del diagramma di fasatura', iDia > 0);
var blocco = iDia > 0 ? HTML.substring(iDia, iDia + 12000) : '';

var iLeg = blocco.indexOf('legend:');
check('trovo il blocco legend del diagramma', iLeg > 0);
// La finestra finisce dove comincia il blocco tooltip. Se non lo si trova la
// finestra e' troppo corta: va detto, non silenziato — con indexOf a -1
// substring INVERTE gli estremi e il test finirebbe per esaminare il testo
// che sta PRIMA della legenda, passando o fallendo a caso.
var iTip = blocco.indexOf('tooltip:', iLeg);
check('la finestra di ricerca arriva fino al blocco tooltip', iTip > iLeg,
    iTip < 0 ? 'finestra troppo corta' : String(iTip));
var legenda = (iLeg > 0 && iTip > iLeg) ? blocco.substring(iLeg, iTip) : '';

check('la legenda disattiva il click (onClick presente)',
    /onClick\s*:/.test(legenda),
    'senza onClick vale il predefinito Chart.js: toggleDataVisibility(index)');

// e deve essere un no-op, non un gestore che fa qualcosa
var mOn = /onClick\s*:\s*function\s*\([^)]*\)\s*\{([\s\S]{0,120}?)\}/.exec(legenda);
check('e il gestore non fa niente (e una didascalia)',
    !!mOn && mOn[1].replace(/\/\/[^\n]*/g, '').trim() === '',
    mOn ? JSON.stringify(mOn[1].slice(0, 60)) : 'gestore non riconosciuto');

// ---------- la prova del meccanismo, senza browser ----------
// Riproduco quello che fa toggleDataVisibility di Chart.js: nasconde la fetta
// di INDICE i in tutti i dataset, e ogni anello riscala su cio' che resta.
console.log('');
console.log('--- perche era rotto: il conto del predefinito Chart.js ---');

// dati veri della VW KR: [chiuso, aperto, chiuso] per i tre anelli
var ANELLI = {
    aspirazione: [319.63, 284.02, 116.35],
    scarico:     [116.79, 281.10, 322.11],
    incrocio:    [319.63,  78.26, 322.11]
};
Object.keys(ANELLI).forEach(function (k) {
    var somma = ANELLI[k].reduce(function (a, b) { return a + b; }, 0);
    check('anello ' + k + ': le fette sommano 720 (la matematica e giusta)',
        Math.abs(somma - 720) < 0.01, somma.toFixed(2));
});

// click sulla seconda voce -> nascondi indice 1 ovunque
var superstiti = {};
Object.keys(ANELLI).forEach(function (k) {
    var tot = ANELLI[k][0] + ANELLI[k][2];       // l'indice 1 sparisce
    superstiti[k] = tot;
});
check('un click sull indice 1 lascia gli anelli senza il loro arco aperto',
    Math.abs(superstiti.aspirazione - 435.98) < 0.1 &&
    Math.abs(superstiti.scarico - 438.90) < 0.1 &&
    Math.abs(superstiti.incrocio - 641.74) < 0.1,
    [superstiti.aspirazione, superstiti.scarico, superstiti.incrocio].map(function (v) { return v.toFixed(1); }).join(' / '));

// click sull'indice 0: l'arco aperto resta ma viene RISCALATO su meno di 720,
// quindi si legge un numero di gradi che non e' quello vero
var aspTot0 = ANELLI.aspirazione[1] + ANELLI.aspirazione[2];
var lettoDopoClick0 = ANELLI.aspirazione[1] / aspTot0 * 720;
check('un click sull indice 0 fa LEGGERE 511 gradi di apertura invece di 284',
    Math.abs(lettoDopoClick0 - 510.8) < 1.5, lettoDopoClick0.toFixed(1) + ' gradi motore');

// ---------- le voci portano gli indici delle fette ----------
check('le voci di legenda portano index 0/1/2 (= gli indici delle fette)',
    /index:\s*0/.test(legenda) && /index:\s*1/.test(legenda) && /index:\s*2/.test(legenda),
    'sono proprio gli indici che toggleDataVisibility userebbe');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: la legenda del diagramma di fasatura non spegne piu le fette.');
process.exit(0);
