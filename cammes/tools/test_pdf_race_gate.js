// =============================================================
//  test_pdf_race_gate.js — il PDF non deve dire piu' dello schermo
// =============================================================
//  AUDIT TOTALE 2026-08-09, rilievi 3.3-3.6: la "due verita'" residua stava
//  negli export race. Lo schermo dichiarava il non-conclusivo, la carta no.
//
//  3.3 — Sweep RPM nel PDF: i punti NON convergenti erano stampati e colorati
//        come misure valide (97,276 mm di un solver divergente, in rosso).
//  3.4 — Mappa molla nel PDF: le celle non convergenti uscivano grigie senza
//        legenda ne' conteggio; la legenda a schermo vive in un DOM che non
//        entra nell'immagine. Sul documento il colore era l'unico dato.
//  3.5 — exportPDF con molla ai valori di esempio: il banner di copertina
//        stampava "Critico N rpm - Margine +X%" e la barra del margine usciva
//        riempita col suo rapporto, mentre titolo e KPI dicevano NON VALUTABILE.
//  3.6 — Toast riassuntivo: con un lato a rpmCrit infinito e l'altro FINITO,
//        l'AND sbagliato faceva dire "infinito (sicuro)" mentre l'allarme, 500
//        ms dopo, dichiarava il distacco al regime finito.
//
//  Il test e' statico sul sorgente (come test_soglie_float e simili): verifica
//  che ogni sito abbia il suo cancello, con ancore di testo che falliscono se
//  il cancello sparisce. Scritto PRIMA del fix: fallisce sulla v3.7.0.
//
//  Uso: node tools/test_pdf_race_gate.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
var vivo = HTML.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');
// il CORPO di una regione delimitata da due ancore di testo
function regione(da, a) {
    var i = vivo.indexOf(da);
    if (i < 0) return '';
    var j = vivo.indexOf(a, i);
    return j < 0 ? vivo.substring(i) : vivo.substring(i, j);
}

console.log('=============================================================');
console.log(' PDF RACE: quello che lo schermo rifiuta, la carta non lo stampa');
console.log('=============================================================');

// ---------- 3.3: la tabella dello sweep nel Race report ----------
console.log('--- 3.3: sweep RPM nel PDF ---');
var rSweep = regione('var half = Math.ceil(sweep.points.length / 2)', 'nonConvergedCount > 0');
check('trovo il loop della tabella sweep', rSweep.length > 0);
check('ogni punto passa dal gate di convergenza',
    /pt\.converged\s*===?\s*false/.test(rSweep),
    'senza, il PDF stampa il float di un solver divergente come misura');
check('e il punto non convergente dice "non conv.", non un numero',
    /non conv\./.test(rSweep), 'la stessa parola dello schermo');
// il numero colorato deve stare nel ramo ELSE del gate
var iGate = rSweep.indexOf('pt.converged');
var iNum = rSweep.indexOf('pt.float.toFixed(3)');
check('il numero colorato viene DOPO il gate', iGate > 0 && iNum > iGate,
    'ordine: prima si controlla, poi si stampa');

// ---------- 3.4: la mappa molla nel PDF ----------
console.log('');
console.log('--- 3.4: mappa molla nel PDF ---');
var rMappa = regione("sect('Mappa molla", '===== 5.');
check('trovo la sezione mappa molla del report', rMappa.length > 0);
check('il PDF ha una legenda dei colori (il DOM non entra nell immagine)',
    /Colore = float max/.test(rMappa) && /Grigio = solver NON convergente/.test(rMappa),
    'sul documento il colore non deve essere l unico dato');
check('la legenda usa le soglie condivise, non numeri ricopiati',
    /SOGLIE_FLOAT\.attenzione/.test(rMappa) && /SOGLIE_FLOAT\.grave/.test(rMappa),
    'stessa fonte di schermo e heatmap');
check('e le celle non convergenti hanno il loro conteggio dichiarato',
    /map\.nonConvergedCount\s*>\s*0/.test(rMappa) && /NON convergenti/.test(rMappa),
    'come gia fanno le sezioni 2 e 3 dello stesso report');

// ---------- 3.5: banner di copertina e barra del margine ----------
console.log('');
console.log('--- 3.5: exportPDF con molla ai valori di esempio ---');
// (il titolo del banner era "Sicurezza treno valvole": dal 2026-11-21 descrive
//  il conto invece di promettere sicurezza — vedi test_documenti_onesti.js)
var rBanner = regione("'Margine sul distacco valvola (calcolo statico", 'File analizzati');
check('trovo il banner di copertina', rBanner.length > 0);
check('la riga destra del banner passa dal cancello mollaOkPdf',
    /mollaOkPdf/.test(rBanner),
    'il titolo era gated, il dettaglio accanto no');
check('e senza molla confermata NON stampa "Critico N rpm"',
    /inserisci k, F0 e masse/i.test(rBanner),
    'al posto del numero, il motivo');

var rBarra = regione("sectionHeader('Margine sul distacco valvola')", 'GRAFICI (uno per riga');
check('trovo la barra del margine', rBarra.length > 0);
check('la barra passa dal cancello mollaOkPdf',
    /if\s*\(\s*!mollaOkPdf\s*\)/.test(rBarra),
    'usciva riempita col suo rapporto anche su molla di esempio');
check('e il ramo non valutabile dice il motivo',
    /Non valutabile.*valori di esempio/i.test(rBarra),
    'stessa dichiarazione delle celle');

// ---------- 3.6: il toast riassuntivo usa il minimo, non l AND ----------
console.log('');
console.log('--- 3.6: toast riassuntivo ---');
var rToast = regione('var minRpmCrit = Math.min(forcesIn.rpmCrit, forcesEx.rpmCrit)', 'window.cammesToast({');
check('trovo la costruzione di rpmCritStr', rToast.length > 0);
check('il criterio sta sul MINIMO (isFinite(minRpmCrit)), non sull AND dei lati',
    /isFinite\(minRpmCrit\)\s*\?/.test(rToast) &&
    !/isFinite\(forcesIn\.rpmCrit\)\s*&&\s*isFinite\(forcesEx\.rpmCrit\)\s*\?/.test(rToast),
    'con asp 5200 e scar infinito, l AND diceva "sicuro" mentre l allarme diceva 5200');

// il conto che dimostrava la contraddizione, rifatto qui
var rpmIn = 5200, rpmEx = Infinity;
var minC = Math.min(rpmIn, rpmEx);
var conVecchioAnd = (isFinite(rpmIn) && isFinite(rpmEx)) ? Math.round(minC) + ' rpm' : 'inf (sicuro)';
var conMinimo = isFinite(minC) ? Math.round(minC) + ' rpm' : 'inf (sicuro)';
check('il conto: AND dice "' + conVecchioAnd + '", il minimo dice "' + conMinimo + '"',
    conVecchioAnd === 'inf (sicuro)' && conMinimo === '5200 rpm',
    'e l allarme scattava comunque a 5200: due verdetti opposti nella stessa analisi');
check('e Math.min(Inf,Inf)=Inf: il caso tutto-sicuro resta coperto',
    !isFinite(Math.min(Infinity, Infinity)));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: sweep, mappa, banner, barra e toast passano tutti dal cancello.');
process.exit(0);
