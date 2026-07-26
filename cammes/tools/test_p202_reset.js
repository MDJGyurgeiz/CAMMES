// =============================================================
//  test_p202_reset.js — P2-02 (audit esterno v3.4.3)
// =============================================================
//  Rilievo: "Reset incompleto". Dopo Analizza -> modifica parametro -> Reset
//  restavano accesi lo stato stale (col suo banner giallo "Hai cambiato
//  parametri: premi Analizza", per un'analisi appena cancellata), il contesto
//  cacheato delle forze e il debounce del ricalcolo immediato gia' armato.
//  In piu' i tre toast ritardati dell'analisi (500/500/900 ms) comparivano
//  anche dopo il Reset.
//
//  Il test NON usa numeri di riga: estrae le funzioni reali da analisi.html
//  cercandole per firma e le esegue in un contesto con DOM finto. Il file si
//  sposta di continuo — ancorarsi alle righe renderebbe il test bugiardo.
//
//  Scritto PRIMA del fix: sulla v3.4.3 fallisce.
//
//  Uso: node tools/test_p202_reset.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var vm = require('vm');

// Fine riga NORMALIZZATO a LF prima di qualunque ricerca. Il file e' committato
// con eol=lf ma git lo consegna con CRLF su Windows: senza questa riga il test
// passa sulla macchina di sviluppo e fallisce sul runner, che e' esattamente il
// modo in cui il gate SBOM (REL-02) era gia' stato preso in giro una volta.
var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

// Estrae "function nome(...) { ... }" fino alla prima riga che e' esattamente '}'
// al livello di colonna zero: e' lo stile di tutto il file.
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(HTML);
    if (!m) throw new Error('funzione non trovata in analisi.html: ' + nome);
    var da = m.index;
    var fine = HTML.indexOf('\n}\n', da);
    if (fine < 0) throw new Error('fine funzione non trovata: ' + nome);
    return HTML.substring(da, fine + 3);
}

console.log('=============================================================');
console.log(' P2-02 - il Reset deve spegnere anche lo stato di contorno');
console.log('=============================================================');

// ---------- DOM finto: crea al volo qualunque elemento richiesto ----------
var elementi = {};
function elemento(id) {
    if (elementi[id]) return elementi[id];
    var classi = {};
    elementi[id] = {
        id: id, value: '', textContent: '', innerHTML: '', disabled: false,
        style: {}, dataset: {},
        classList: {
            add: function (c) { classi[c] = true; },
            remove: function (c) { delete classi[c]; },
            toggle: function (c, on) { if (on) classi[c] = true; else delete classi[c]; },
            contains: function (c) { return !!classi[c]; }
        },
        _classi: classi,
        removeAttribute: function () {}, setAttribute: function () {},
        addEventListener: function () {}, remove: function () {},
        appendChild: function () {}, closest: function () { return null; },
        querySelectorAll: function () { return []; },
        focus: function () {}, scrollIntoView: function () {}
    };
    return elementi[id];
}

// ---------- registro dei timer ancora armati ----------
var timerVivi = {};
var prossimoId = 1;
function fintoSetTimeout(fn, ms) {
    var id = prossimoId++;
    timerVivi[id] = { fn: fn, ms: ms };
    return id;
}
function fintoClearTimeout(id) { delete timerVivi[id]; }
function armati() { return Object.keys(timerVivi); }

var ctx = {
    console: console,
    setTimeout: fintoSetTimeout,
    clearTimeout: fintoClearTimeout,
    Math: Math, Number: Number, String: String, Object: Object, Array: Array,
    isFinite: isFinite, parseInt: parseInt, JSON: JSON, Date: Date,
    document: {
        getElementById: elemento,
        createElement: function (t) { return elemento('nuovo-' + t + '-' + (prossimoId++)); },
        querySelectorAll: function () { return []; },
        activeElement: null
    },
    // globali dell'app che le funzioni estratte toccano
    lastAnalysis: null, _analysisStale: false, _liveRetuneTimer: null,
    _toastTimers: [],
    intakeLoaded: false, exhaustLoaded: false,
    intakeMaxLift: 0, intakeMaxPos: 0, exhaustMaxLift: 0, exhaustMaxPos: 0,
    intakeMaxIdx: 0, exhaustMaxIdx: 0,
    velIntake: [], velExhaust: [], accIntake: [], accExhaust: [],
    jerkIntake: [], jerkExhaust: [],
    rawIntake: [], rawExhaust: [], folIntake: [], folExhaust: [],
    crankIntake: [], crankExhaust: [],
    timingChartInstance: null, velocityChart: null, accelerationChart: null,
    jerkChart: null, forceChart: null, complianceChart: null,
    abChart: { distrutto: false, destroy: function () { this.distrutto = true; } },
    _mechAnimator: null, _sweep3d: null, _job: null,
    initArrays: function () {}, updateChart: function () {},
    smarcaCampiMolla: function () {}, annullaJob: function () { return false; },
    mostraAvanzamento: function () {}, abilitaStrumentiRace: function () {},
    liveRetuneForces: function () {}
};
ctx.window = ctx;
vm.createContext(ctx);

// ---------- carica le funzioni reali ----------
['markAnalysisStale', 'clearAnalysisStale', 'scheduleLiveRetune', 'resetAll'].forEach(function (n) {
    vm.runInContext(estrai(n), ctx, { filename: 'analisi.html:' + n });
});

// ---------- scenario: fine analisi, poi modifica, poi Reset ----------
ctx.lastAnalysis = { analysisId: 1, results: {}, inputs: {}, arrays: {} };
ctx.intakeLoaded = true; ctx.exhaustLoaded = true;
ctx.window.lastForceContext = { anlIn: [1, 2, 3], accIntake: [] };
vm.runInContext('clearAnalysisStale();', ctx);
vm.runInContext('scheduleLiveRetune();', ctx);   // arma il debounce da 80 ms
vm.runInContext('markAnalysisStale();', ctx);    // accende il banner

var banner = elemento('analysisStaleBanner');
var bottone = elemento('analyzeBtn');
console.log('--- prima del Reset (stato che il difetto deve lasciare acceso) ---');
check('lo stato stale e acceso', ctx._analysisStale === true);
check('il banner e visibile', banner.style.display === '');
check('il debounce e armato', armati().length === 1, armati().length + ' timer');

console.log('--- dopo il Reset ---');
vm.runInContext('resetAll();', ctx);

check('il Reset spegne lo stato stale', ctx._analysisStale === false, 'stale=' + ctx._analysisStale);
check('il banner "analisi non aggiornata" sparisce', banner.style.display === 'none',
    'display="' + banner.style.display + '"');
check('il pulsante Analizza non resta evidenziato', bottone.classList.contains('btn-attention') === false);
check('il contesto forze cacheato viene scartato', ctx.window.lastForceContext === null,
    String(ctx.window.lastForceContext));
check('nessun debounce sopravvive al Reset', armati().length === 0, armati().length + ' timer ancora armati');
check('lastAnalysis azzerato (non regressione)', ctx.lastAnalysis === null);

console.log('--- non regressione ---');
// L'audit suggeriva di azzerare "ogni riferimento chart globale": il grafico
// del Confronto A/B non appartiene all'analisi e non va distrutto qui.
check('il Reset dell analisi NON distrugge il grafico Confronto A/B',
    ctx.abChart && ctx.abChart.distrutto === false);
// markAnalysisStale deve continuare a uscire subito senza analisi: e' la
// guardia che impedisce ai settaggi programmatici del Reset di riaccendere
// il banner appena spento.
vm.runInContext('markAnalysisStale();', ctx);
check('markAnalysisStale senza analisi non riaccende il banner',
    ctx._analysisStale === false && banner.style.display === 'none');

console.log('--- toast ritardati dell analisi (controllo statico) ---');
var corpoAnalyze = estrai('analyze');
var conHandle = (corpoAnalyze.match(/_toastTimers\.push\(setTimeout\(/g) || []).length;
var nudi = (corpoAnalyze.match(/^\s{12}setTimeout\(function \(\) \{/gm) || []).length;
check('i toast ritardati memorizzano il proprio handle', conHandle >= 3,
    conHandle + ' con handle, ' + nudi + ' ancora nudi');
var corpoReset = estrai('resetAll');
check('il Reset annulla i toast ritardati in sospeso',
    /_toastTimers/.test(corpoReset), 'resetAll ' + (/_toastTimers/.test(corpoReset) ? 'li annulla' : 'NON li annulla'));
check('anche una nuova analisi annulla quelli della corsa precedente',
    /_toastTimers\s*\.forEach\(clearTimeout\)|_toastTimers\.forEach\(clearTimeout\)/.test(corpoAnalyze));

console.log('--- gia soddisfatto dal P1-11 (verifica di tenuta) ---');
check('il Reset annulla anche il job Race in corso', /annullaJob\(/.test(corpoReset));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: il Reset spegne banner, contesto forze, debounce e toast');
console.log('in sospeso, senza toccare il grafico del Confronto A/B.\n');
