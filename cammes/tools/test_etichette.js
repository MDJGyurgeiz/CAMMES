// =============================================================
//  test_etichette.js — l'etichetta deve descrivere il calcolo che si fa
// =============================================================
//  Una classe di difetti a se': il numero e' giusto, il testo che lo spiega
//  descrive un altro calcolo. Non se ne accorge nessuno guardando i risultati,
//  perche' i risultati sono corretti — sbagliata e' la lettura che ne induce.
//
//  Dove si puo', il test NON confronta stringhe fra loro: ESEGUE la funzione
//  vera della pagina e verifica che il testo dica quel che la funzione fa.
//
//  Scritto PRIMA delle correzioni: fallisce sulla versione precedente.
//
//  Uso: node tools/test_etichette.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(HTML);
    if (!m) throw new Error('funzione non trovata in analisi.html: ' + nome);
    var fine = HTML.indexOf('\n}\n', m.index);
    if (fine < 0) throw new Error('fine funzione non trovata: ' + nome);
    return HTML.substring(m.index, fine + 3);
}
// Il testo del data-tip che segue una certa etichetta visibile.
function tooltipDopo(ancora) {
    var i = HTML.indexOf(ancora);
    if (i < 0) return null;
    var j = HTML.indexOf('data-tip="', i);
    if (j < 0) return null;
    var k = HTML.indexOf('">', j + 10);
    return HTML.substring(j + 10, k);
}

console.log('=============================================================');
console.log(' ETICHETTE: il testo descrive il calcolo che si fa davvero');
console.log('=============================================================');

// ---------------------------------------------------------------
// 1. Asimmetria lobo — il SEGNO, verificato eseguendo la funzione
// ---------------------------------------------------------------
//  openArea e' l'integrale start->picco: un fianco RIPIDO copre MENO gradi,
//  quindi MENO area, quindi (openArea - closeArea) e' NEGATIVO. Il tooltip
//  diceva l'opposto ("Positivo = apre piu' in fretta").
console.log('--- asimmetria lobo: il segno lo decide la funzione, non il testo ---');
var ctx = { Math: Math, isFinite: isFinite, Number: Number, Array: Array };
vm.createContext(ctx);
vm.runInContext(estrai('computeLobeAsymmetry'), ctx);
function lobo(salita, discesa) {
    var a = new Array(721);
    for (var d = 0; d <= 720; d++) a[d] = 0;
    var p = 360;
    for (var k = 1; k <= salita; k++) a[p - salita + k] = 10 * (k / salita);
    for (var k2 = 1; k2 <= discesa; k2++) a[p + k2] = 10 * (1 - k2 / discesa);
    a[p] = 10;
    return a;
}
var apreInFretta = ctx.computeLobeAsymmetry(lobo(100, 200), 360);
var chiudeInFretta = ctx.computeLobeAsymmetry(lobo(200, 100), 360);
var simmetrico = ctx.computeLobeAsymmetry(lobo(150, 150), 360);
console.log('        apre in fretta: ' + apreInFretta.toFixed(2) + ' %   chiude in fretta: ' +
            chiudeInFretta.toFixed(2) + ' %   simmetrico: ' + simmetrico.toFixed(2) + ' %');
check('un lobo che apre in fretta da un valore NEGATIVO', apreInFretta < -1, apreInFretta.toFixed(2) + ' %');
check('un lobo simmetrico da zero', Math.abs(simmetrico) < 0.01, simmetrico.toFixed(4) + ' %');

var tipAsym = tooltipDopo('Asimmetria lobo asp.');
check('il tooltip dell asimmetria esiste', !!tipAsym);
if (tipAsym) {
    // Il testo NON deve associare "positivo" all'apertura rapida: e' il caso
    // in cui la funzione restituisce un numero negativo.
    var diceApreInFrettaPositivo =
        /Positivo<\/b>\s*=\s*apre\s+pi&ugrave;\s+in\s+fretta/i.test(tipAsym) ||
        /Positivo\s*=\s*apre\s+pi&ugrave;\s+in\s+fretta/i.test(tipAsym);
    check('il tooltip NON dice che positivo = apre piu in fretta', !diceApreInFrettaPositivo,
        tipAsym.substring(0, 110));
    check('e nomina il caso negativo, che prima non compariva',
        /negativo/i.test(tipAsym), tipAsym.substring(0, 110));
}
// Anche lo scarico, che aveva la stessa frase
var tipAsymEx = tooltipDopo('Asimmetria lobo scar.');
check('anche il tooltip dello scarico e allineato',
    !!tipAsymEx && !/Positivo\s*=\s*apre\s+pi&ugrave;\s+in\s+fretta/i.test(tipAsymEx),
    (tipAsymEx || '').substring(0, 90));

// ---------------------------------------------------------------
// 2. Quanti file servono: lo dice la guardia, non il tooltip
// ---------------------------------------------------------------
console.log('--- quanti file servono: lo decide la guardia ---');
var corpoAnalyze = estrai('analyze');
var pretendeEntrambi = /!intakeLoaded\s*\|\|\s*!exhaustLoaded/.test(corpoAnalyze);
console.log('        analyze() pretende entrambi i file: ' + pretendeEntrambi);
var tipAnalizza = tooltipDopo('id="analyzeBtn"');
check('il tooltip di Analizza esiste', !!tipAnalizza);
if (pretendeEntrambi && tipAnalizza) {
    check('il tooltip NON promette che basta una sola camma',
        !/almeno una delle due/i.test(tipAnalizza), tipAnalizza.substring(0, 120));
    check('e dice che servono entrambe', /entrambi|entrambe/i.test(tipAnalizza));
}
var corpoAB = estrai('runABComparison');
var pretendeQuattro = /!fileAInt\s*\|\|\s*!fileAExh\s*\|\|\s*!fileBInt\s*\|\|\s*!fileBExh/.test(corpoAB);
console.log('        runABComparison() pretende tutti e 4 i file: ' + pretendeQuattro);
var tipAB = tooltipDopo('runABComparison();');
if (pretendeQuattro && tipAB) {
    check('il tooltip di A vs B NON dice "anche solo aspirazione"',
        !/anche solo aspirazione/i.test(tipAB), tipAB.substring(0, 120));
    check('e dichiara che servono tutti e quattro',
        /quattro|tutti e 4/i.test(tipAB), tipAB.substring(0, 120));
}

// ---------------------------------------------------------------
// 3. Unita di misura: una soglia in mm non si scrive in gradi
// ---------------------------------------------------------------
//  "Durata @ 0°" metteva il simbolo dei gradi su una soglia di ALZATA: la
//  durata e' l'intervallo in cui l'alzata supera 0 mm, non "a 0 gradi".
console.log('--- unita di misura nelle etichette ---');
check('nessuna etichetta "Durata @ 0 gradi"',
    HTML.indexOf('Durata @ 0&deg;') < 0 && HTML.indexOf('Durata @ 0°') < 0);
check('la durata a soglia nulla e etichettata su un ALZATA',
    (HTML.match(/Durata \(alzata &gt; 0\)/g) || []).length >= 2,
    (HTML.match(/Durata \(alzata &gt; 0\)/g) || []).length + ' occorrenze (asp. e scar.)');

// ---------------------------------------------------------------
// 4. Il cursore dell'animazione non e' un regime motore
// ---------------------------------------------------------------
//  Il valore del cursore non e' un numero di giri: a 180 la camma gira a ~18
//  giri/min e il ritmo dipende dal frame rate. Chiamarlo "giri/min" invita a
//  confonderlo col campo RPM, che invece entra in tutti i calcoli.
console.log('--- il cursore dell animazione non e il regime ---');
var tipVel = tooltipDopo('id="mechAnimSpeed"');
check('il tooltip del cursore esiste', !!tipVel);
if (tipVel) {
    check('non chiama "giri/min" il valore del cursore',
        !/giri\/min/i.test(tipVel), tipVel.substring(0, 110));
    check('e rimanda al campo RPM per il regime vero',
        /RPM/.test(tipVel), tipVel.substring(0, 110));
}

// ---------------------------------------------------------------
// 5. Lo stato accanto a Importa non deve dare un secondo "Max"
// ---------------------------------------------------------------
//  Diceva "nomefile | Max: 10.74mm @ 100°" con un numero uscito da
//  findMax(crankIntake): dopo conversione follower e gioco, ma PRIMA della
//  correzione baseline e del rapporto bilanciere. La scheda risultati mostra
//  "Max alzata" con entrambi applicati: due numeri con lo stesso nome sulla
//  stessa pagina, diversi per la stessa camma. E la stringa viaggiava nello
//  snapshot fino a essere STAMPATA nell'intestazione della scheda camma,
//  accanto alla cifra buona.
console.log('--- lo stato dell import non da un secondo "Max alzata" ---');
var testoStato = estrai('testoStatoImport');
check('esiste una funzione unica per il testo dello stato', !!testoStato);
check('lo stato non usa piu l etichetta "Max:"',
    HTML.indexOf("' | Max: '") < 0, 'trovata la vecchia etichetta');
if (testoStato) {
    check('dichiara che il picco e GREZZO', /picco grezzo/i.test(testoStato));
    check('e che l angolo e in gradi CAMMA, non manovella',
        /camma/i.test(testoStato), 'il dominio va detto: la scheda risultati parla di gradi motore');
    // Deve leggere la curva che le viene passata, non variabili globali di
    // comodo: cosi' il numero non puo' dipendere da conversioni successive.
    check('calcola il picco dalla curva che riceve, non da un globale',
        /piccoConPlateau\(curvaGrezza/.test(testoStato) || /curvaGrezza\[/.test(testoStato),
        'il numero non deve dipendere da conversioni successive');
    // E deve cercarlo sul dominio GIUSTO. findMax() gira su 1..720 e ritorna
    // `idx - 360` perche' e' scritta per i gradi MANOVELLA con lo zero al PMS:
    // usata su una curva in gradi camma dava l'alzata giusta e un angolo
    // negativo senza senso (-171° "camma"), cioe' una seconda mislabel.
    // Solo il CODICE: il commento che spiega perche' findMax non va usata
    // contiene la parola, e non deve far fallire il controllo.
    var soloCodice = testoStato.split('\n').filter(function (r) {
        return !/^\s*\/\//.test(r);
    }).join('\n');
    check('cerca il picco sul dominio CAMMA 1..360, non con findMax (dominio manovella)',
        /piccoConPlateau\(curvaGrezza,\s*1,\s*360\)/.test(soloCodice) && !/findMax/.test(soloCodice),
        /findMax/.test(soloCodice) ? 'usa ancora findMax' : 'estremi dichiarati nella chiamata');
}
// Lo snapshot porta il nome del file, non il testo dello stato.
var corpoSnap = HTML.substring(HTML.indexOf('intakeFile:') - 400, HTML.indexOf('intakeFile:') + 300);
check('lo snapshot NON salva il testo dello stato',
    !/intakeFile:\s*document\.getElementById\('intakeStatus'\)/.test(HTML));
check('lo snapshot salva il nome file',
    /intakeFile:\s*intakeFileBase/.test(HTML), corpoSnap.substring(corpoSnap.indexOf('intakeFile:'), corpoSnap.indexOf('intakeFile:') + 60));

// ---------------------------------------------------------------
// 6. "Ripetizioni": il verdetto nasce da una grandezza che il testo taceva
// ---------------------------------------------------------------
//  Le soglie (<1% <3% <7%) sono sul coefficiente di variazione, ma il tooltip
//  le affiancava all'unica dispersione che nominava, la sigma, che e' in mm. E
//  il CV si calcola SOLO dove l'alzata supera 0,3 mm: cerchio base e rampe
//  basse restano fuori dal verdetto. Prova della ricognizione con la funzione
//  vera: 2 run col cerchio base che balla di 1 mm danno sigma 0,707 mm,
//  CV 0,00 % e verdetto "eccellente".
console.log('--- "Ripetizioni": il testo nomina la grandezza del verdetto ---');
var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
var iRip = ALZATA.indexOf('id="scanRepeat"');
check('il campo Ripetizioni esiste', iRip > 0);
if (iRip > 0) {
    var j = ALZATA.indexOf('data-tip="', iRip);
    var tipRip = ALZATA.substring(j + 10, ALZATA.indexOf('">', j + 10));
    check('il tooltip nomina il coefficiente di variazione',
        /coefficiente di variazione|\bCV\b/.test(tipRip));
    check('e dichiara che il CV guarda solo sopra 0,3 mm',
        /0,3 mm/.test(tipRip), 'cerchio base e rampe restano fuori dal verdetto');
    check('e dice che la sigma e in millimetri',
        /millimetri|in <b>mm<\/b>/.test(tipRip));
    // La soglia citata nel testo dev'essere quella vera del codice.
    var soglia = /avgLift\[d\] > ([\d.]+)/.exec(ALZATA);
    check('la soglia scritta nel testo e quella del codice',
        !!soglia && tipRip.indexOf(String(soglia[1]).replace('.', ',')) >= 0,
        soglia ? ('codice: ' + soglia[1]) : 'soglia non trovata nel codice');
}
check('le opzioni non promettono piu "statistiche" contro "medie"',
    !/run \+ medie|run \+ statistiche/.test(ALZATA),
    'il calcolo e lo stesso per 2, 3 e 5 run');

// ---------------------------------------------------------------
// 7. La posizione del picco su un naso piatto
// ---------------------------------------------------------------
//  findMax usava un confronto STRETTO: su un plateau restituiva il PRIMO slot.
//  Misurato su test_v31_fw_alz: sette slot in pareggio esatto (8,020000 mm da
//  96° a 102°), mentre la stessa curva corretta in baseline ha una pendenza
//  residua di sei NANOMETRI che sposta l'argmax sull'ultimo. Sei gradi di
//  scarto da una differenza mille volte piu' piccola della risoluzione.
console.log('--- il picco di un naso piatto e il suo centro ---');
check('esiste piccoConPlateau()', /function piccoConPlateau/.test(HTML));
check('la tolleranza e legata alla divisione dello strumento',
    /var TOLL_PICCO_MM = 0\.005/.test(HTML), 'mezza divisione del comparatore');
var corpoFindMax = estrai('findMax');
check('findMax non usa piu il confronto stretto sull argmax',
    !/if \(crankArr\[m\] > maxLift\)/.test(corpoFindMax));
check('e delega a piccoConPlateau', /piccoConPlateau/.test(corpoFindMax));
check('anche lo stato dell import usa la stessa regola',
    /piccoConPlateau\(curvaGrezza/.test(HTML));

// ---------------------------------------------------------------
// 8. Il diagramma di fasatura non deve sembrare bucato
// ---------------------------------------------------------------
//  Le fette "valvola chiusa" erano completamente trasparenti: su fondo scuro un
//  arco trasparente e' indistinguibile da un arco NON disegnato, e il grafico si
//  leggeva come rotto ("mancano 180 gradi"). Non mancavano: una valvola sta
//  aperta circa un terzo del ciclo, quindi ogni anello e' chiuso per ~230 gradi
//  di cerchio, e il settore in basso dove sono chiuse ENTRAMBE (134 gradi con
//  una fasatura tipica) e' compressione + espansione.
console.log('--- il diagramma di fasatura disegna anche il tratto chiuso ---');
var iCol = HTML.indexOf('function colors(sl, rgba, solid)');
check('la funzione dei colori del diagramma esiste', iCol > 0);
if (iCol > 0) {
    var corpoCol = HTML.substring(iCol, HTML.indexOf('\n    }\n', iCol) + 6);
    check('il tratto chiuso non e piu trasparente',
        !/rgba\(0,0,0,0\)/.test(corpoCol), 'un arco trasparente si legge come assente');
    check('e usa un colore neutro del tema',
        /--grid/.test(corpoCol), 'cosi vale sia in tema scuro sia in chiaro');
}
check('la legenda non promette piu un "vuoto"',
    HTML.indexOf('Vuoto = valvola chiusa') < 0);
check('e la sua pastiglia porta il colore vero, non il trasparente',
    !/text: 'Grigio = valvola chiusa'[\s\S]{0,120}rgba\(0,0,0,0\)/.test(HTML));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: le etichette verificate descrivono il calcolo che il');
console.log('programma esegue davvero, e il segno dell asimmetria e stato');
console.log('controllato eseguendo la funzione, non leggendola.\n');
