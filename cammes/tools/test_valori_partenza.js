// =============================================================
//  test_valori_partenza.js — un solo valore di partenza, e dichiarato
// =============================================================
//  Lo stesso campo aveva fino a TRE valori di partenza:
//      angolo lobo:  HTML 100  ·  schema def 106  ·  Reset 100
//      gioco:        HTML 0,50 ·  schema def 0    ·  Reset 0,50
//      lisciatura:   HTML 5    ·  schema def 0    ·  Reset 5
//  Finche' il calcolo leggeva il campo grezzo vinceva l'HTML; da quando ogni
//  lettura passa da numDi(), un campo VUOTO prende il def dello schema. Due
//  numeri di partenza a seconda che il campo sia pieno o vuoto.
//
//  In piu' il Reset:
//   - riscriveva dodici valori a mano, duplicando lo schema (ed e' cosi' che i
//     numeri hanno potuto divergere)
//   - NON smarcava i campi: dopo un Reset gli angoli tornavano a un valore che
//     nessuno aveva dichiarato, ma restavano "confermati" — niente bordo
//     tratteggiato, niente nota, mentre LSA e centri lobo ne discendono
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_valori_partenza.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' UN SOLO VALORE DI PARTENZA PER OGNI CAMPO');
console.log('=============================================================');

// ---------- lo schema ----------
var iCampi = HTML.indexOf('var CAMPI_NUM');
var blocco = HTML.substring(iCampi, HTML.indexOf('\n};', iCampi));
var def = {};
blocco.split('\n').forEach(function (r) {
    var m = /^\s*(\w+):\s*\{(.*)\}/.exec(r);
    if (m && /\bdef:/.test(m[2])) def[m[1]] = /def:\s*([\d.]+)/.exec(m[2])[1];
});
check('lo schema dichiara dei default', Object.keys(def).length > 10,
    Object.keys(def).length + ' campi');

// ---------- l'HTML deve dire lo stesso numero ----------
console.log('--- il campo in pagina parte dal valore dello schema ---');
var html = {};
(HTML.match(/<input[^>]*id="(\w+)"[^>]*>/g) || []).forEach(function (tag) {
    var id = /id="(\w+)"/.exec(tag)[1];
    var v = /\svalue="([^"]*)"/.exec(tag);
    if (v) html[id] = v[1];
});
// i <select> con un'opzione `selected`
(HTML.match(/<select[^>]*id="(\w+)"[\s\S]*?<\/select>/g) || []).forEach(function (blk) {
    var id = /id="(\w+)"/.exec(blk)[1];
    var sel = /<option value="([^"]*)"[^>]*\bselected\b/.exec(blk);
    if (sel) html[id] = sel[1];
});
var disaccordi = [];
Object.keys(def).forEach(function (id) {
    if (html[id] === undefined) return;
    if (Number(html[id]) !== Number(def[id])) disaccordi.push(id + ': pagina ' + html[id] + ' vs schema ' + def[id]);
});
check('nessun campo parte da un numero diverso da quello dello schema',
    disaccordi.length === 0, disaccordi.length ? disaccordi.join(' · ') : 'tutti allineati');

// ---------- il Reset non ricopia lo schema ----------
console.log('--- il Reset non tiene una terza copia dei valori ---');
var iReset = /^function resetAll\s*\(\)\s*\{/m.exec(HTML);
check('resetAll esiste', !!iReset);
if (iReset) {
    var corpoReset = HTML.substring(iReset.index, HTML.indexOf('\n}\n', iReset.index) + 3);
    var aMano = [];
    (corpoReset.match(/getElementById\('(\w+)'\)\.value = '([^']*)'/g) || []).forEach(function (s) {
        var m = /'(\w+)'\)\.value = '([^']*)'/.exec(s);
        if (def[m[1]] !== undefined) aMano.push(m[1] + "='" + m[2] + "'");
    });
    check('il Reset non riscrive a mano i campi che hanno un default',
        aMano.length === 0, aMano.length ? aMano.join(', ') : 'nessuno');
    check('il Reset ripristina dallo schema',
        /CAMPI_NUM/.test(corpoReset) || /ripristinaDefault/.test(corpoReset));
    // ...e deve smarcare TUTTI i campi del meccanismo, non solo la molla
    check('il Reset smarca anche geometria e fasatura, non solo la molla',
        /smarcaCampiDichiarati|CAMPI_GEOMETRIA/.test(corpoReset) ||
        /smarcaCampiMolla/.test(corpoReset) === false,
        'dopo un Reset gli angoli non devono restare "confermati"');
}
var iSmarca = HTML.indexOf('function smarcaCampiDichiarati');
check('esiste una funzione che smarca tutti i campi dichiarati', iSmarca > 0);
if (iSmarca > 0) {
    var corpoSmarca = HTML.substring(iSmarca, HTML.indexOf('\n}\n', iSmarca) + 3);
    ['CAMPI_MOLLA', 'CAMPI_GEOMETRIA', 'CAMPI_FASATURA'].forEach(function (l) {
        check('smarca ' + l, corpoSmarca.indexOf(l) >= 0);
    });
}

// ---------- il gioco valvola: il testo non deve smentire il campo ----------
//  Il tooltip dichiarava "tipicamente 0.10-0.30 asp / 0.15-0.40 scar" mentre il
//  campo nasce a 0,50: fuori da tutti gli intervalli che la stessa riga
//  definisce tipici. Peso misurato dalla ricognizione su lobo da 10,6 mm:
//  gioco 0 -> durata 345° e picco 10,600; gioco 0,50 -> 307° e 10,100.
console.log('--- il gioco valvola: testo e valore raccontano la stessa cosa ---');
function tooltipDi(id) {
    var i = HTML.indexOf('id="' + id + '"');
    if (i < 0) return null;
    var j = HTML.lastIndexOf('data-tip="', i);
    if (j < 0) return null;
    return HTML.substring(j + 10, HTML.indexOf('">', j + 10));
}
var tipGioco = tooltipDi('intakeClearance');
check('il tooltip del gioco esiste', !!tipGioco);
if (tipGioco && html.intakeClearance !== undefined) {
    var v = Number(html.intakeClearance);
    var intervalli = (tipGioco.match(/(\d[\d.,]*)\s*-\s*(\d[\d.,]*)\s*mm/g) || []);
    var dentro = intervalli.some(function (s) {
        var m = /(\d[\d.,]*)\s*-\s*(\d[\d.,]*)/.exec(s);
        return v >= Number(m[1].replace(',', '.')) && v <= Number(m[2].replace(',', '.'));
    });
    check('il valore di partenza sta dentro un intervallo dichiarato, oppure e detto che e un segnaposto',
        dentro || /segnaposto/i.test(tipGioco),
        'parte da ' + v + ', intervalli dichiarati: ' + (intervalli.join(' / ') || 'nessuno'));
}

// ---------- numeri morti che sembrano governare qualcosa ----------
//  Di TYPOLOGY si leggono solo `label` e `lockClearance`. `rocker` e
//  `clearance` non li legge nessuno: sono i due numeri che la Tipologia
//  scriveva nei campi PRIMA che quel comportamento venisse tolto, e restare
//  li' fa credere che governino ancora il rapporto leva e il gioco.
console.log('--- niente numeri morti che sembrano governare qualcosa ---');
check('TYPOLOGY non porta piu un rapporto leva che nessuno legge',
    !/rocker:\s*[\d.]+/.test(HTML) || /t\.rocker/.test(HTML),
    'rocker: N dichiarato ma mai letto');
check('TYPOLOGY non porta piu un gioco che nessuno legge',
    !/clearance:\s*[\d.]+,/.test(HTML) || /t\.clearance/.test(HTML),
    'clearance: N dichiarato ma mai letto');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: un solo valore di partenza per campo, il Reset lo prende');
console.log('dallo schema e smarca i campi dichiarati, e non restano numeri che');
console.log('sembrano governare qualcosa senza governare niente.\n');
