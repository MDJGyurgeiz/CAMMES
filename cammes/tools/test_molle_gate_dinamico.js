// =============================================================
//  test_molle_gate_dinamico.js — il verdetto non deve scavalcare il cancello
// =============================================================
//  Segnalazione dall'officina: "comparto molle completamente inattendibile".
//
//  Il cancello c'e' ed e' giusto: latoValutabile(side) chiede che k, F0 e la
//  massa equivalente siano stati CONFERMATI dall'operatore, e finche' non lo
//  sono le sei celle statiche, il grafico forze, le righe di sintesi del CSV e
//  la tabella del PDF dicono "non valutabile" col motivo.
//
//  Ma i valori di esempio dell'HTML (k 30 N/mm, F0 200 N, massa 100 g) vengono
//  letti lo stesso e proseguono sul ramo DINAMICO, che quel cancello non lo
//  attraversa: il solver di cedevolezza li usa, e da li' escono
//    - le fasce rosse "distacco" del grafico compliance
//    - il toast di verdetto ("Compliance OK - Valvola segue la cam...")
//    - le righe valve float di CSV e PDF
//    - le colonne F_spring / F_inertia del dump per grado
//  tutte condizionate SOLO alla convergenza del solver, mai a latoValutabile.
//
//  Risultato sullo schermo: "Margine minimo asp.: non valutabile" e duecento
//  pixel piu' sotto un grafico con le zone rosse di distacco e un toast verde
//  che dichiara il treno valvole adeguato — su una molla che l'operatore non ha
//  mai inserito. E' lo stesso difetto che test_grafico_forze.js dichiara chiuso:
//  era chiuso sul ramo statico e rimasto aperto su quello dinamico.
//
//  Convergenza e valutabilita' sono due condizioni DIVERSE e servono entrambe:
//  un solver puo' convergere benissimo su dati inventati.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_molle_gate_dinamico.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
// il codice vivo, senza commenti: qui si parla di cio' che viene ESEGUITO
var vivo = HTML.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');
function blocco(daTesto, quanti) {
    var i = vivo.indexOf(daTesto);
    return i < 0 ? '' : vivo.substring(i, i + (quanti || 4000));
}
// Il CORPO di una funzione, delimitato dalla prima riga che e' esattamente '}'
// in colonna zero (lo stile di tutto il file). Una finestra a caratteri fissi
// sconfina nella funzione successiva e fa passare i controlli per il motivo
// sbagliato: qui accanto a createComplianceChart ci sono le funzioni del
// grafico forze, che latoValutabile lo chiamano gia'.
function corpo(firma) {
    var i = vivo.indexOf(firma);
    if (i < 0) return '';
    var fine = vivo.indexOf('\n}\n', i);
    return fine < 0 ? vivo.substring(i) : vivo.substring(i, fine + 3);
}

console.log('=============================================================');
console.log(' MOLLE: convergere non e valutare');
console.log('=============================================================');

// ---------- il cancello esiste ed e uno solo ----------
console.log('--- il cancello ---');
check('latoValutabile(side) chiede k, F0 e massa confermati',
    /function latoValutabile\(side\)[\s\S]{0,240}campoEConfermato\('springK'\)[\s\S]{0,240}campoEConfermato\('springPreload'\)/.test(vivo));

// ---------- 1. il grafico compliance ----------
console.log('');
console.log('--- il grafico di cedevolezza ---');
var gChart = corpo('function createComplianceChart(');
check('trovo createComplianceChart', gChart.length > 0);
check('le fasce di distacco chiedono anche che il lato sia VALUTABILE',
    /latoValutabile\s*\(/.test(gChart),
    'oggi guarda solo lo status CONVERGED del solver');
check('e lo fa PER LATO (asp e scar hanno molle e masse distinte)',
    /latoValutabile\s*\(\s*'intake'\s*\)/.test(gChart) && /latoValutabile\s*\(\s*'exhaust'\s*\)/.test(gChart),
    'un lato confermato non rende valutabile l altro');

// ---------- 2. il toast di verdetto ----------
console.log('');
console.log('--- il toast di verdetto dinamico ---');
// Ancorato alla CONDIZIONE, non al testo del messaggio: il titolo del toast
// cambia, la guardia no.
var mToast = /if \(([^)]*complianceOn[^)]*floatIn \|\| floatEx[^)]*)\)/.exec(vivo) ||
             /if \(([^{]*?floatIn \|\| floatEx[^{]*?)\)\s*\{/.exec(vivo);
check('trovo la guardia del toast di valve float dinamico', !!mToast);
check('la guardia chiede anche che molla e massa siano confermate',
    !!mToast && /_mollaOk|latoValutabile/.test(mToast[1]),
    mToast ? mToast[1].slice(0, 100) : '-');

// ---------- 3. CSV e PDF: le righe valve float ----------
console.log('');
console.log('--- righe valve float su CSV e PDF ---');
// La riga del CSV, non il titolo del toast che contiene le stesse parole.
// (dal 2026-11-22 la riga si chiama "Distacco dinamico": glossario unico,
//  "valve float" non si scrive piu' davanti all'operatore)
var iCsvVf = vivo.indexOf("'Distacco dinamico asp. [mm],'");
check('trovo la riga valve float del CSV', iCsvVf > 0);
var gVf = iCsvVf > 0 ? vivo.substring(Math.max(0, iCsvVf - 800), iCsvVf + 800) : '';
check('la riga CSV passa dallo stesso cancello delle celle',
    /valutabileIn|valutabileEx|latoValutabile|_mollaOk/.test(gVf),
    'oggi basta che il solver sia convergente');
// e il PDF, che e' il documento che esce dall'officina
var iPdfVf = vivo.indexOf("rows.push(['Distacco dinamico");
check('trovo la riga valve float del PDF', iPdfVf > 0);
var gPdf = iPdfVf > 0 ? vivo.substring(iPdfVf, iPdfVf + 500) : '';
check('anche il PDF passa dallo stesso cancello',
    /valutabileIn|valutabileEx|latoValutabile/.test(gPdf),
    'il PDF non deve portare piu verdetti dello schermo');

// ---------- 4. il dump per grado ----------
console.log('');
console.log('--- il dump per grado del CSV ---');
var gDump = blocco('# === Grado per grado (albero motore', 2600);
check('trovo il dump per grado', gDump.length > 0);
check('le colonne F_spring / F_inertia sono condizionate al lato valutabile',
    /valutabileIn|valutabileEx|latoValutabile/.test(gDump),
    'esportare 720 righe di forze mentre il riepilogo si astiene e la stessa incoerenza');
// (dal 2026-11-22 le intestazioni sono in italiano: "grado motore", "forza
//  molla asp. [N]"... Il controllo di prima cercava ancora "crank_deg" e
//  "F_spring_in_N": non trovandoli passava sempre, senza verificare niente.)
check('e l intestazione non promette colonne che non ci sono',
    /var intest = 'grado motore,/.test(gDump) && !/intest = 'grado motore[^']*forza (molla|inerzia)/.test(gDump) &&
    /if \(_forzeIn\) intest \+= ',forza molla asp\./.test(gDump) && /if \(_forzeEx\) intest \+= ',forza molla scar\./.test(gDump) &&
    /_forzeIn = !!R\.valutabileIn/.test(gDump),
    'intestazione fissa senza forze; le colonne di forza si aggiungono solo per il lato valutabile');

// ---------- 5. la regola generale ----------
console.log('');
console.log('--- convergere non e valutare ---');
// Ogni punto che decide su CONVERGED e produce un VERDETTO deve avere accanto
// il cancello. Non e' un vezzo: un solver converge benissimo su dati inventati.
var puntiConvergenza = (vivo.match(/status === 'CONVERGED'/g) || []).length;
check('i punti che guardano la convergenza esistono ancora', puntiConvergenza > 0,
    puntiConvergenza + ' punti');
check('nessuno di quelli che produce un verdetto e rimasto senza cancello',
    /distaccoAffidabile[\s\S]{0,400}latoValutabile/.test(vivo) ||
    /latoValutabile[\s\S]{0,400}distaccoAffidabile/.test(vivo),
    'il grafico e il caso piu visibile');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: il ramo dinamico passa dallo stesso cancello del ramo statico.');
process.exit(0);
