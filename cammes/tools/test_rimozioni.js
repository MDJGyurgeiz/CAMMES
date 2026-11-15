// =============================================================
//  test_rimozioni.js — cio' che indovinava non deve rientrare
// =============================================================
//  Perche' questo test esiste. Una funzione che INDOVINA un dato di misura
//  e' peggio di una funzione assente: chi legge non ha modo di sapere che
//  quel numero non e' stato misurato. In questa serie di lavori ne sono
//  state togliete diverse, ognuna con una ragione precisa. Senza un gate,
//  una di queste rientra fra sei mesi perche' "mancava".
//
//  Non e' un test di stile: ognuna delle voci qui sotto ha prodotto un
//  numero sbagliato in output, misurato.
//
//  Uso: node tools/test_rimozioni.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var CAMMES = path.join(__dirname, '..');
var fails = 0;

function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
// Lezione imparata due volte (gate SBOM e test_p202_reset): su Windows il
// checkout puo' essere CRLF. Si normalizza a LF, sempre.
function leggi(rel) {
    try { return fs.readFileSync(path.join(CAMMES, rel), 'utf8').replace(/\r\n/g, '\n'); }
    catch (e) { return null; }
}
// Conta le occorrenze fuori dai commenti HTML e JS di una riga sola: un
// riferimento in un commento che spiega PERCHE' e' stato tolto va bene, un
// riferimento nel codice no. Confronto senza distinzione di maiuscole, cosi'
// non sfugge una `Surge` con l'iniziale grande.
function occorrenzeVive(testo, ago) {
    var n = 0;
    ago = ago.toLowerCase();
    testo.split('\n').forEach(function (riga) {
        var pulita = riga.replace(/^\s*(\/\/|\*|<!--).*$/, '').toLowerCase();
        var i = pulita.indexOf(ago);
        while (i >= 0) { n++; i = pulita.indexOf(ago, i + 1); }
    });
    return n;
}

console.log('=============================================================');
console.log(' RIMOZIONI: nessun dato di misura viene indovinato');
console.log('=============================================================');

var analisi = leggi('analisi.html');
var math    = leggi('lib/cammes-math.js');
var home    = leggi('home.html');
check('analisi.html leggibile', !!analisi);
check('lib/cammes-math.js leggibile', !!math);
check('home.html leggibile', !!home);
if (!analisi || !math || !home) { console.log('\nRISULTATO: file mancanti\n'); process.exit(1); }

// ---------------------------------------------------------------
// 1. Preset motore — indovinava l'alzata dal numero di cilindri
// ---------------------------------------------------------------
//  Misurato: cambiando la tendina l'alzata mostrata variava del +59%.
//  Il numero di cilindri non determina il profilo di una camma.
console.log('--- preset motore (indovinava +59% di alzata) ---');
['enginePreset', 'ENGINE_PRESETS', 'applyEnginePreset'].forEach(function (nome) {
    check('nessun ' + nome + ' in analisi.html', occorrenzeVive(analisi, nome) === 0);
});

// ---------------------------------------------------------------
// 2. k pivot bilanciere — campo inerte
// ---------------------------------------------------------------
//  Il valore veniva chiesto all'operatore, mostrato, salvato nel report e
//  poi ignorato dal solver: `var k_pivot = 0;`.
console.log('--- k pivot bilanciere (campo inerte) ---');
check('nessun campo row3DofKPivot', occorrenzeVive(analisi, 'row3DofKPivot') === 0);
check('nessun input kPivot', occorrenzeVive(analisi, 'id="kPivot"') === 0);

// ---------------------------------------------------------------
// 3. Cerchio base: il campo chiede il DIAMETRO
// ---------------------------------------------------------------
//  Col calibro si misura un diametro. Chiedere un raggio obbliga a dividere
//  a mente, e l'errore e' gia' capitato nel nostro stesso report.
console.log('--- cerchio base come diametro, non raggio ---');
check('il campo aspirazione e diamBase', analisi.indexOf('id="diamBase"') > 0);
check('il campo scarico e diamBaseExhaust', analisi.indexOf('id="diamBaseExhaust"') > 0);
check('nessun vecchio input id="rBase"', analisi.indexOf('id="rBase"') < 0);
// La libreria resta in RAGGIO (r = rBase + alzata e' la fisica): la
// divisione per due sta al confine con la UI, in un punto solo.
check('la libreria lavora ancora in raggio (rBase)', /\brBase\b/.test(math));
check('la UI dimezza in un punto solo',
    (analisi.match(/diamBase \/ 2|diamBase'\) \/ 2|numDi\('diamBase'\) \/ 2/g) || []).length >= 1);

// ---------------------------------------------------------------
// 4. Surge (risonanza spire) — modello che non vale sulle molle vere
// ---------------------------------------------------------------
//  Il modello assume molla SINGOLA CILINDRICA A PASSO COSTANTE. Doppia,
//  conica, a passo variabile e materiale non ci entrano — e il passo
//  variabile si progetta PROPRIO per sopprimere il surge, quindi il
//  verdetto sarebbe sbagliato dove serve di piu'. La risonanza si verifica
//  comunque in laboratorio. Il codice stesso lo dichiarava "ESPLORATIVO".
//  Il controllo e' sulla PAROLA, non su un elenco di identificatori: la prima
//  passata di rimozione ne ha lasciato indietro uno (`CAMPI_SURGE`, rimasto in
//  un secondo punto) che un elenco non avrebbe intercettato. Quel riferimento
//  avrebbe dato ReferenceError a pagina aperta.
console.log('--- surge molla (modello non valido sulle molle reali) ---');
[['analisi.html', analisi], ['lib/cammes-math.js', math],
 ['cammes-ui.js', leggi('cammes-ui.js') || '']].forEach(function (p) {
    check('nessun riferimento vivo a "surge" in ' + p[0],
        occorrenzeVive(p[1], 'surge') === 0,
        occorrenzeVive(p[1], 'surge') + ' occorrenze fuori dai commenti');
});
// Il README descrive il prodotto di ADESSO: non deve promettere una funzione
// che non c'e' piu'. Il CHANGELOG invece deve poterne parlare — e' il suo
// mestiere raccontare che e' stata rimossa.
var readme = (function () {
    try { return fs.readFileSync(path.join(CAMMES, '..', 'README.md'), 'utf8'); } catch (e) { return null; }
})();
check('il README non promette piu il surge',
    !!readme && !/surge/i.test(readme),
    readme ? ((readme.match(/surge/gi) || []).length + ' menzioni') : 'README non leggibile');
['springMass', 'springCoils'].forEach(function (nome) {
    check('nessun campo ' + nome + ' in analisi.html', occorrenzeVive(analisi, nome) === 0);
});
check('simulateSpringSurge non esportata dalla libreria',
    require(path.join(CAMMES, 'lib', 'cammes-math.js')).simulateSpringSurge === undefined);
check('springSurgeFreqHz non esportata dalla libreria',
    require(path.join(CAMMES, 'lib', 'cammes-math.js')).springSurgeFreqHz === undefined);
check('test_surge.js rimosso con la funzione',
    !fs.existsSync(path.join(CAMMES, 'tools', 'test_surge.js')));
check('test_surge.js non e piu in npm test',
    JSON.parse(fs.readFileSync(path.join(CAMMES, 'package.json'), 'utf8'))
        .scripts.test.indexOf('test_surge') < 0);
// La garanzia DYN-02 ("smorzamento 0 resta 0") era verificata attraverso il
// surge: togliendo il surge NON si toglie la garanzia, si sposta il punto
// di misura sui solver di cedevolezza.
var dyn02 = leggi('tools/test_dyn02_zero_default.js');
check('la garanzia DYN-02 (smorzamento 0 resta 0) esiste ancora', !!dyn02);
check('e non passa piu dal surge',
    !!dyn02 && occorrenzeVive(dyn02, 'simulateSpringSurge') === 0);

// ---------------------------------------------------------------
// 5. Auto-tag — indovinava la marca dai numeri nel nome file
// ---------------------------------------------------------------
//  Misurato: un file con una sigla e dei numeri nel nome (un motore d'auto
//  comunissimo) veniva etichettato con una marca di moto, perche' il pattern
//  delle moto `\br[1-9]` pesca la "r" e la prima cifra di quella sigla. E i tag
//  vengono STAMPATI sul PDF della singola misura, quindi una marca indovinata
//  arriva al cliente.
//  Non si perde nulla: il tag veniva al 100% dal nome file, che e' gia'
//  ricercabile a testo libero. Il tagging manuale resta.
console.log('--- auto-tag (indovinava la marca dai numeri del nome) ---');
['AUTO_TAG_PATTERNS', 'autoTagFile', 'applyAutoTagAll'].forEach(function (nome) {
    check('nessun ' + nome + ' in home.html', occorrenzeVive(home, nome) === 0);
});
// Anche il comando in pagina, non solo il codice dietro: un pulsante che chiama
// una funzione inesistente non fa danni ai dati, ma promette una funzione che
// non c'e'.
check('nessun pulsante Auto-tag in pagina', home.indexOf('Auto-tag</button>') < 0);
// Il tagging MANUALE non e' stato toccato: si toglie l'indovino, non la funzione.
['getTagsForFile', 'addTagsToFile', 'promptAddTags'].forEach(function (nome) {
    check('il tagging manuale (' + nome + ') resta', occorrenzeVive(home, nome) > 0);
});

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: nessuna delle funzioni che indovinavano un dato di');
console.log('misura e rientrata, e le garanzie che ne dipendevano restano.\n');
