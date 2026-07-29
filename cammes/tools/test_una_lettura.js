// =============================================================
//  test_una_lettura.js — un campo, un valore: una sola strada di lettura
// =============================================================
//  Ogni campo con un default dichiarato aveva DUE letture:
//    - la validazione (validaCampi/numDi -> validaNumero) su campo vuoto
//      restituisce il default: numDi('intakeAngle') = 106
//    - il calcolo rileggeva .value grezzo: Number('') = 0
//  Lo stesso campo valeva 106 per il gate e 0 per il conto.
//
//  Riprodotto in pagina sulle camme VW reali:
//    angolo lobo VUOTO, anticipo 3
//      -> la cella LSA scrive "50.0°" e il suo stesso tooltip mostra il conto
//         "(-3.0 + 103.0) / 2": il centro aspirazione e' -3 (= 0 - anticipo)
//         invece di 103. Una somma sbagliata dentro l'elemento che la spiega.
//    regime VUOTO
//      -> dopo Analizza: "0 N @ 0 rpm" e distacco "OK infinito", tooltip
//         "Margine: sicuro (regime di prova 0)", nessun errore accanto al campo
//      -> poi basta toccare k perche' il ricalcolo immediato legga numDi = 6000
//         e riscriva LE STESSE CELLE: "1515.8 N @ 6000 rpm", distacco
//         "3805 rpm", "Margine: -37%". Il campo e' rimasto VUOTO tutto il tempo.
//    Un verdetto verde diventa rosso toccando un campo che non c'entra.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_una_lettura.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' UNA SOLA STRADA DI LETTURA PER OGNI CAMPO');
console.log('=============================================================');

// ---------- i campi che dichiarano un default ----------
var iCampi = HTML.indexOf('var CAMPI_NUM');
var blocco = HTML.substring(iCampi, HTML.indexOf('\n};', iCampi));
var conDefault = {};
blocco.split('\n').forEach(function (r) {
    var m = /^\s*(\w+):\s*\{(.*)\}/.exec(r);
    if (m && /\bdef:/.test(m[2])) conDefault[m[1]] = /def:\s*([\d.]+)/.exec(m[2])[1];
});
console.log('        campi con default dichiarato: ' + Object.keys(conDefault).length);
check('lo schema dei campi e leggibile', Object.keys(conDefault).length > 10);

// ---------- nessuna lettura grezza di un campo che ha un default ----------
//  E' il cuore del test: finche' esiste un `Number(getElementById('x').value)`
//  su un campo con default, quel campo ha due valori possibili.
console.log('--- nessuna lettura grezza dove esiste un default ---');
var grezze = {};
(HTML.match(/Number\(document\.getElementById\('(\w+)'\)\.value\)/g) || []).forEach(function (s) {
    var id = /'(\w+)'/.exec(s)[1];
    if (conDefault[id]) grezze[id] = (grezze[id] || 0) + 1;
});
var idsGrezzi = Object.keys(grezze).sort();
check('nessun campo con default viene letto in modo grezzo',
    idsGrezzi.length === 0,
    idsGrezzi.length ? idsGrezzi.map(function (i) { return i + '(' + grezze[i] + ')'; }).join(', ')
                     : 'tutti passano da numDi()');

// I campi SENZA default devono restare fuori: li' il vuoto non e' un numero, e
// il gate per lato deve poter dire "non valutabile".
console.log('--- i campi senza default restano senza default ---');
['springK', 'springPreload', 'massEqIntake', 'massEqExhaust'].forEach(function (id) {
    check('il campo ' + id + ' non ha un default inventato', !conDefault[id],
        conDefault[id] ? ('def=' + conDefault[id]) : 'nessuno');
});

// ---------- il default, se si applica, si VEDE ----------
//  Una casella vuota non deve poter significare un numero. Prima di calcolare,
//  i default dichiarati vengono scritti nel campo: cosi' l'operatore legge il
//  numero che il programma sta usando, invece di una casella vuota.
console.log('--- una casella vuota non puo significare un numero nascosto ---');
var iFn = HTML.indexOf('function applicaDefaultVisibili');
check('esiste applicaDefaultVisibili()', iFn > 0);
if (iFn > 0) {
    var corpo = HTML.substring(iFn, HTML.indexOf('\n}\n', iFn) + 3);
    // La guardia puo' essere scritta come uscita anticipata (`!== '' return`)
    // o come condizione positiva: quel che conta e' che il campo si tocchi solo
    // quando e' VUOTO, cioe' che ci sia un confronto con la stringa vuota.
    check('scrive nel campo solo se e vuoto',
        /trim\(\)\s*[!=]==\s*''/.test(corpo) || /!el\.value/.test(corpo),
        (corpo.match(/.*trim\(\).*/) || [''])[0].trim());
    check('scrive solo dove un default e DICHIARATO',
        /CAMPI_NUM/.test(corpo) && /\.def/.test(corpo));
}
var corpoAnalyze = (function () {
    var m = /^function analyze\s*\(\)\s*\{/m.exec(HTML);
    return HTML.substring(m.index, HTML.indexOf('\n}\n', m.index) + 3);
})();
check('analyze() la chiama prima di calcolare',
    corpoAnalyze.indexOf('applicaDefaultVisibili') >= 0);

// ---------- la prova numerica sulla libreria ----------
//  Il difetto nasce dal disaccordo fra validaNumero (che applica il default) e
//  Number('') (che fa 0). Qui si fissa quel comportamento, cosi' se un domani
//  validaNumero cambiasse idea sul campo vuoto il test lo dice.
console.log('--- il comportamento su campo vuoto e fissato ---');
var v = M.validaNumero('', { def: 106 });
check('validaNumero("") su un campo con default ritorna il default',
    v.ok === true && v.valore === 106 && v.usatoDefault === true, JSON.stringify(v));
check('e Number("") vale 0, che e la ragione del disaccordo', Number('') === 0);
var vSenza = M.validaNumero('', { min: 0, minEsclusivo: true });
check('validaNumero("") su un campo SENZA default non inventa un numero',
    vSenza.ok === false, JSON.stringify(vSenza));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: ogni campo ha una sola strada di lettura; i campi senza');
console.log('default restano non valutabili quando sono vuoti; e un default che');
console.log('si applica viene scritto nel campo, quindi si vede.\n');
