// =============================================================
//  test_zero_virtuale_interrotto.js — uno Zero virtuale che non arriva in
//  fondo non deve lasciare la pagina cieca
// =============================================================
//  DIFETTO trovato nella verifica funzionale del 2026-11-14, riprodotto sul
//  banco emulato (server vero + firmware emulato):
//
//      Zero virtuale  ->  STOP a meta'  ->  6 secondi dopo il comparatore non
//      viene piu' letto, il LED diventa rosso ("Comparatore non risponde") e
//      START rifiuta con "Comparatore non risponde: scansione NON avviata".
//      A comparatore perfettamente funzionante. Si usciva solo ricaricando la
//      pagina (o, per caso, sbloccando e ribloccando il motore).
//
//  E' con ogni probabilita' il "a volte non legge il comparatore, devo spegnere
//  e riaccendere" e il "a volte non completa l'auto zero" segnalati
//  dall'officina: i due sintomi sono lo stesso difetto visto da due lati.
//
//  La causa: lo Zero virtuale SPEGNEVA i due polling (comparatore ed encoder)
//  con clearInterval, per tenere libera la coda WebSocket al momento del
//  comando finale '$'. A riaccenderli era soltanto il ricaricamento della
//  pagina con cui lo Zero virtuale si conclude. Quindi ogni Zero virtuale che
//  NON si concludeva li lasciava spenti per sempre:
//    - STOP dell'operatore;
//    - avvio rifiutato dal controllo comparatore (comparatore in auto-spegnimento:
//      proprio il momento in cui serve che la pagina lo veda tornare);
//    - guasto o *sabort dal firmware;
//    - scansione chiusa incompleta.
//
//  Secondo difetto, stessa radice: "Zero virtuale in corso" (labms) restava
//  armato. La scansione NORMALE successiva, arrivata in fondo, eseguiva lo
//  spostamento di zero e ricaricava la pagina: motore che si muove senza che
//  nessuno l'abbia chiesto, e misura appena fatta persa.
//
//  La cura: i polling non si spengono piu', tacciono (pollAttivo) finche' c'e'
//  una scansione o lo spostamento finale in volo, e riprendono da soli; lo
//  stato "Zero virtuale in corso" lo arma solo ms() e lo disarma ogni altra
//  strada.
//
//  Uso: node tools/test_zero_virtuale_interrotto.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' ZERO VIRTUALE INTERROTTO: la pagina non resta cieca');
console.log('=============================================================');

var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
var VIVO = ALZATA.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');

function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    if (fine < 0) return null;
    return ALZATA.substring(m.index, fine + 3);
}

// (_chiediSensore/_sensoreHaRisposto: il freno sul polling, provato in
//  test_modalita_oneste.js; qui serve solo perché il polling vero lo chiama)
var NOMI = ['pollAttivo', '_chiediSensore', '_sensoreHaRisposto', '_avviaPollNormale', 'bancoInSolaLettura',
            'ms', 'start', 'stop', '_fermaScansioneLocale'];
var src = {}, mancanti = [];
NOMI.forEach(function (n) { src[n] = estrai(n); if (!src[n]) mancanti.push(n); });
check('la pagina ha le funzioni che servono', mancanti.length === 0, mancanti.length ? 'mancano: ' + mancanti.join(', ') : '');

function nuovaPagina(opz) {
    opz = opz || {};
    var p = { inviati: [], toasts: [], intervalli: [], ora: 5000000 };
    var elementi = {
        scanMode: { disabled: false, value: 'fast' },
        scanRepeat: { disabled: false, value: '1' }
    };
    var ctx = {
        Date: { now: function () { return p.ora; } },
        Math: Math, JSON: JSON, parseInt: parseInt, console: { log: function () {}, warn: function () {} },
        window: { cammesToast: function (o) { p.toasts.push(o); }, cammesScanProgress: { reset: function () {}, set: function () {} } },
        document: {
            getElementById: function (id) { return elementi[id] || null; },
            mas: { mas: { value: '' } }
        },
        setInterval: function (fn, ms) { p.intervalli.push({ fn: fn, ms: ms, vivo: true }); return p.intervalli.length; },
        clearInterval: function (id) { if (id && p.intervalli[id - 1]) p.intervalli[id - 1].vivo = false; },
        sendSocket: { readyState: 1, send: function (s) { p.inviati.push(s); } },
        scanEta: { stop: function () {} },
        _scanBusy: function () { return ctx.startflag === 1 || ctx.autoScanActive; },
        _wsReady: function () { return true; },
        _clearScanTimers: function () {},
        reset: function () {},
        // l'avvio vero: qui basta che la scansione risulti partita
        _startSingleRun: function () { ctx.startflag = 1; ctx.autoScanActive = true; }
    };
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    vm.runInContext('var ruoloBanco = "controller", _tickSensore = 0, pollEncoderId = null, pollSensorId = null;' +
                    'var _pollSensoreInVolo = 0, POLL_SENSORE_ATTESA_MS = 1500;' +
                    'var startflag = 0, autoScanActive = false, stepflag = 0, labms = 0, i = 0, max = 0, maxg = 0;' +
                    'var repeatRunsTarget = 1, repeatRunsDone = 0, repeatedRuns = [];' +
                    'var lastSensorRx = ' + (opz.comparatoreMuto ? 0 : p.ora) + ';', ctx);
    NOMI.forEach(function (n) { vm.runInContext(src[n], ctx); });
    vm.runInContext('_avviaPollNormale();', ctx);
    p.ctx = ctx; p.elementi = elementi;
    p.val = function (e) { return vm.runInContext(e, ctx); };
    // un "giro" di tutti i polling ancora accesi: cosa esce verso il banco?
    p.giroPolling = function () {
        p.inviati.length = 0;
        vm.runInContext('_sensoreHaRisposto();', ctx);   // la lettura del giro precedente è tornata
        p.intervalli.filter(function (t) { return t.vivo; }).forEach(function (t) { t.fn(); });
        return p.inviati.slice();
    };
    return p;
}

if (!mancanti.length) {
    // ---------------------------------------------------------------
    console.log('');
    console.log('--- il caso riprodotto: Zero virtuale, poi STOP ---');
    var p = nuovaPagina();
    check('a riposo il comparatore viene interrogato', p.giroPolling().indexOf('m') >= 0, JSON.stringify(p.giroPolling()));
    p.val('ms()');
    check('lo Zero virtuale parte', p.val('startflag') === 1 && p.val('labms') === 1, 'startflag=' + p.val('startflag') + ' labms=' + p.val('labms'));
    check('durante la scansione i polling tacciono', p.giroPolling().length === 0, JSON.stringify(p.giroPolling()));
    p.val('stop()');
    var dopo = p.giroPolling();
    check('dopo lo STOP il comparatore TORNA a essere interrogato', dopo.indexOf('m') >= 0, JSON.stringify(dopo));
    check('...e anche l encoder', dopo.indexOf('?') >= 0, JSON.stringify(dopo));
    check('lo Zero virtuale non resta armato', p.val('labms') === 0, 'labms=' + p.val('labms'));

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- Zero virtuale chiesto a comparatore non pronto ---');
    p = nuovaPagina({ comparatoreMuto: true });
    p.val('ms()');
    check('la scansione non parte (controllo comparatore)', p.val('startflag') === 0, 'startflag=' + p.val('startflag'));
    check('...e l operatore lo legge', p.toasts.some(function (t) { return /Comparatore non risponde/.test(t.title || ''); }));
    check('i polling restano accesi: la pagina puo veder TORNARE il comparatore', p.giroPolling().indexOf('m') >= 0, JSON.stringify(p.giroPolling()));
    check('lo Zero virtuale non resta armato', p.val('labms') === 0, 'labms=' + p.val('labms'));
    check('il selettore della modalita torna usabile', p.elementi.scanMode.disabled === false);

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- uno stato armato rimasto in giro non contamina la scansione dopo ---');
    p = nuovaPagina();
    p.val('labms = 1;');                       // come lo lasciava un abort delle versioni precedenti
    p.val('start()');                          // START normale
    check('START disarma lo Zero virtuale prima di partire', p.val('labms') === 0 && p.val('startflag') === 1,
        'labms=' + p.val('labms') + ' startflag=' + p.val('startflag'));
    p = nuovaPagina();
    p.val('ms()');
    check('...mentre lo Zero virtuale vero resta armato per la SUA scansione', p.val('labms') === 1);
    p.val('start()');                          // secondo START a scansione in corso: rifiutato
    check('...e un START premuto durante quella scansione non lo disarma', p.val('labms') === 1, 'labms=' + p.val('labms'));

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- lo spostamento finale ha la coda libera senza spegnere niente ---');
    p = nuovaPagina();
    p.val('window._waiting_mv = true;');
    check('in attesa di *mv i polling tacciono', p.giroPolling().length === 0, JSON.stringify(p.giroPolling()));
    p.val('window._waiting_mv = false;');
    check('...e riprendono appena lo spostamento e concluso', p.giroPolling().indexOf('m') >= 0);
}

// ---------------------------------------------------------------
console.log('');
console.log('--- le altre strade che chiudono una scansione ---');
var corpoMs = src.ms || '';
check('ms() non spegne piu i polling con clearInterval',
    !/clearInterval\s*\(\s*poll(Sensor|Encoder)Id\s*\)/.test(corpoMs.split('\n').filter(function (r) { return !/^\s*\/\//.test(r); }).join('\n')));
var ramoAbort = /if \(wasAborted\) \{[\s\S]{0,1500}?\n {8}\} else if/.exec(VIVO);
check('*sabort dal firmware disarma lo Zero virtuale', !!ramoAbort && /labms\s*=\s*0/.test(ramoAbort[0]));
// (il ramo finisce dove scrive l'interruzione col motivo 'corto': v3.8.0, la
//  notifica non dice piu' "Scansione incompleta" ma usa le parole della riga Esito)
var ramoIncompleta = /else if \(startflag === 1 && i < currentMode\.totalSteps\) \{[\s\S]{0,900}?_interruzione\(window\._tipoScansione, 'corto'/.exec(VIVO);
check('scansione chiusa incompleta: disarma lo Zero virtuale', !!ramoIncompleta && /labms\s*=\s*0/.test(ramoIncompleta[0]));
check('...e riabilita i selettori (restavano spenti fino al ricaricamento)',
    !!ramoIncompleta && /scanMode[\s\S]{0,80}disabled = false/.test(ramoIncompleta[0]) && /scanRepeat[\s\S]{0,80}disabled = false/.test(ramoIncompleta[0]));
var nCreazioni = (VIVO.match(/pollSensorId\s*=\s*setInterval/g) || []).length;
check('i polling normali si accendono in UN posto solo', nCreazioni === 1, nCreazioni + ' punti');
check('il ribloccaggio del motore usa quello stesso posto',
    /BLOCCA[\s\S]{0,700}_avviaPollNormale\(\)/.test(ALZATA));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: uno Zero virtuale interrotto, rifiutato o fallito lascia la pagina');
console.log('com era prima: comparatore letto, selettori usabili, nessuno spostamento armato.');
process.exit(0);
