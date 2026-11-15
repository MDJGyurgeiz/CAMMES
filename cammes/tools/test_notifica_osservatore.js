// =============================================================
//  test_notifica_osservatore.js — "account in uso da un altro utente" x99
// =============================================================
//  Segnalazione dall'officina: la notifica di sola lettura usciva "sempre",
//  arrivava a 99 nel registro messaggi e la pila di toast lampeggiava.
//
//  Causa misurata, in due pezzi indipendenti:
//
//  1) Il server classificava 'm' (leggi comparatore) e 'd' (dump grezzo del
//     sensore) come COMANDI DI CONTROLLO, quindi soggetti al lease. Ma nel
//     firmware 'm' e' emitMeasureOnly(readSensorMm()) e 'd' stampa il valore
//     grezzo: non muovono niente, sono letture. La pagina di scansione poll-a
//     'm' ogni 200 ms (ogni 100 ms a motore sbloccato): un client osservatore
//     riceveva quindi 5-10 rifiuti al secondo, e in piu' restava col
//     comparatore CIECO — che e' il secondo sintomo riferito ("a volte non
//     legge il comparatore, devo spegnere e riaccendere").
//
//  2) Ogni '#ctl:denied' faceva un toast, senza memoria. La pila ne tiene 4 e
//     scarta i piu' vecchi: a 5 al secondo la pila si ricicla in continuazione
//     (il "lampeggio") e il contatore della campanella satura a "99+".
//
//  In piu': window._cammesObserver veniva SCRITTO in tre punti e non letto da
//  nessuna parte. Il toast diceva "i comandi sono disattivati" mentre i
//  pulsanti restavano vivi — la solita malattia di questo progetto, una
//  schermata che dichiara una cosa e un codice che ne fa un'altra.
//
//  Scritto PRIMA del fix: sulla v3.6.0 fallisce.
//
//  Uso: node tools/test_notifica_osservatore.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var net = require('net');
var vm = require('vm');
var spawn = require('child_process').spawn;
var WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' SOLA LETTURA: una notifica, non novantanove');
console.log('=============================================================');

// =============================================================
//  PARTE 1 — il server non rifiuta una LETTURA
// =============================================================
// Non serve l'Arduino: si verifica l'arbitraggio, non il moto.

function freePort() {
    return new Promise(function (res, rej) {
        var s = net.createServer(); s.unref();
        s.on('error', rej);
        s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { res(p); }); });
    });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function connect(wsPort) {
    return new Promise(function (resolve, reject) {
        var ws = new WebSocket('ws://127.0.0.1:' + wsPort);
        ws._msgs = [];
        ws.on('message', function (d) { ws._msgs.push(String(d)); });
        ws.on('open', function () { resolve(ws); });
        ws.on('error', reject);
    });
}
// I messaggi di ruolo portano ora un MOTIVO opzionale dopo il verbo
// ("#ctl:denied occupato" contro "#ctl:denied stop-in-corso"): formato
// additivo, come "#ctl:released <motivo>" che c'era gia'. I confronti si
// fanno sul VERBO, non sulla riga intera, altrimenti ogni motivo nuovo
// rompe i test senza che sia cambiato niente di sostanziale.
function verbo(m) { return m ? String(m).split(" ")[0] : m; }
// solo i messaggi di RUOLO: '#ctl:info ...' e' informativo e non conta
function lastCtl(ws) {
    for (var i = ws._msgs.length - 1; i >= 0; i--) {
        if (ws._msgs[i].indexOf('#ctl:') === 0 && ws._msgs[i].indexOf('#ctl:info') !== 0) return ws._msgs[i];
    }
    return null;
}
async function attendiCtl(ws, atteso, budgetMs) {
    var scaduto = Date.now() + (budgetMs || 5000);
    while (Date.now() < scaduto) {
        if (verbo(lastCtl(ws)) === verbo(atteso)) return lastCtl(ws);   // confronto sul verbo: il motivo e additivo
        await sleep(20);
    }
    return lastCtl(ws);
}
// per i casi in cui NON deve arrivare niente: qui il tempo serve davvero
async function attendiSilenzio(ws, ms) {
    var scaduto = Date.now() + (ms || 800);
    while (Date.now() < scaduto) {
        if (lastCtl(ws) !== null) return lastCtl(ws);
        await sleep(20);
    }
    return lastCtl(ws);
}
// L'unico segnale valido di prontezza e' un handshake che si apre (P2-11).
async function connettiQuandoPronto(porta) {
    var scaduto = Date.now() + 30000, ultimo;
    while (Date.now() < scaduto) {
        try { return await connect(porta); }
        catch (e) { ultimo = e; await sleep(250); }
    }
    throw new Error('server non pronto su ' + porta + ': ' + (ultimo && ultimo.message));
}

var server = null;
var logServer = '';
process.on('exit', function () { try { if (server) server.kill(); } catch (e) {} });

async function parteServer() {
    console.log('--- il server: una lettura non e un comando di moto ---');
    var ports = await Promise.all([freePort(), freePort()]);
    var httpPort = ports[0], wsPort = ports[1];
    server = spawn(process.execPath,
        [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--port', String(httpPort), '--ws-port', String(wsPort)],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
    server.stdout.on('data', function (d) { logServer += d; });
    server.stderr.on('data', function (d) { logServer += d; });

    var a = await connettiQuandoPronto(wsPort);
    var b = await connect(wsPort);
    await attendiCtl(a, '#ctl:free');

    a.send('$+010');
    var r = await attendiCtl(a, '#ctl:granted');
    check('A prende il controllo', r === '#ctl:granted', r);

    // IL PUNTO: il polling del comparatore da un osservatore
    b._msgs = []; b.send('m');
    r = await attendiSilenzio(b);
    check("l'osservatore puo LEGGERE il comparatore ('m' non rifiutato)", r === null, r);

    b._msgs = []; b.send('d');
    r = await attendiSilenzio(b);
    check("l'osservatore puo leggere il grezzo del sensore ('d' non rifiutato)", r === null, r);

    // ...e il gate NON si e' aperto su quello che muove o configura
    b._msgs = []; b.send('$+010');
    r = await attendiCtl(b, '#ctl:denied');
    check('il moto resta rifiutato', verbo(r) === '#ctl:denied', r);

    b._msgs = []; b.send('c360');
    r = await attendiCtl(b, '#ctl:denied');
    check('la configurazione di scansione resta rifiutata', verbo(r) === '#ctl:denied', r);

    b._msgs = []; b.send('p');
    r = await attendiCtl(b, '#ctl:denied');
    check('il passo di scansione resta rifiutato', verbo(r) === '#ctl:denied', r);

    b._msgs = []; b.send('f');
    r = await attendiCtl(b, '#ctl:denied');
    check('lo sblocco motore resta rifiutato', verbo(r) === '#ctl:denied', r);

    try { a.close(); } catch (e) {}
    try { b.close(); } catch (e) {}
    try { server.kill(); } catch (e) {} server = null;
}

// =============================================================
//  PARTE 2 — la pagina: una notifica per episodio, non per rifiuto
// =============================================================

var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');

// Estrae "function nome(...) { ... }" fino alla prima riga che e' esattamente
// '}' in colonna zero: e' lo stile di tutto il file. Niente numeri di riga —
// il file si sposta e un test ancorato alle righe diventa bugiardo.
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    if (fine < 0) return null;
    return ALZATA.substring(m.index, fine + 3);
}

function parteBanco() {
    console.log('');
    console.log('--- la pagina: il ruolo e uno stato, non una raffica ---');

    var fnRuolo = estrai('applicaRuoloBanco');
    var fnSolaLettura = estrai('bancoInSolaLettura');
    var fnUiMoto = estrai('_aggiornaUiMoto');
    check('esiste applicaRuoloBanco() — il ruolo si gestisce in un posto solo', !!fnRuolo);
    check('esiste bancoInSolaLettura() — lo stato si puo interrogare', !!fnSolaLettura);
    check('esiste _aggiornaUiMoto() — un solo punto che decide se i comandi sono attivi', !!fnUiMoto);
    if (!fnRuolo || !fnSolaLettura || !fnUiMoto) {
        console.log('  (senza le due funzioni il resto della parte 2 non e eseguibile)');
        fails++;
        return;
    }

    // il flag non deve piu' essere morto: qualcuno lo deve LEGGERE
    var vivo = ALZATA.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');
    var letture = (vivo.match(/bancoInSolaLettura\s*\(\s*\)/g) || []).length;
    check('lo stato di sola lettura viene letto, non solo scritto',
        letture >= 3, letture + ' usi (serve almeno: polling sensore, polling encoder, UI)');

    // ---------- contesto finto ----------
    // Lo stato si prende dal SORGENTE (le righe 'var' del blocco "Ruolo di
    // questo client"), non da una copia scritta qui: dalla 3.7.1 il gestore
    // conosce anche l'attesa per l'arresto (vedi test_lease_dopo_arresto.js) e
    // una copia a mano sarebbe rimasta indietro senza che nessuno se ne accorga.
    var bloccoStato = /\/\/ ===== Ruolo di questo client[\s\S]*?\nfunction bancoInSolaLettura/.exec(ALZATA);
    var dichiarazioni = bloccoStato
        ? bloccoStato[0].split('\n').filter(function (r) { return /^var /.test(r); }).join('\n') : '';
    check('lo stato del ruolo e dichiarato in un blocco solo', /var ruoloBanco\b/.test(dichiarazioni) && /var SILENZIO_RIFIUTO_MS\b/.test(dichiarazioni));
    // le funzioni di contorno che il gestore chiama (attesa per l'arresto,
    // configurazione da rimandare): quelle vere, estratte come le altre
    var CONTORNO = ['_sincronizzaConfigBanco', '_assicuraConfigBanco', '_entraInArresto', '_esciDaArresto', '_annullaAvvioRifiutato']
        .map(estrai).filter(Boolean);
    function carica(c) {
        vm.runInContext(dichiarazioni, c);
        vm.runInContext(fnSolaLettura, c);
        vm.runInContext(fnUiMoto, c);    // quello VERO: cosi si prova la composizione
        CONTORNO.forEach(function (f) { vm.runInContext(f, c); });
        vm.runInContext(fnRuolo, c);
    }
    var toasts = [];
    var ora = 1000000;                       // orologio finto, avanza a mano
    var ctx = {
        Date: { now: function () { return ora; } },
        Math: Math, JSON: JSON, console: { log: function () {}, warn: function () {} },
        window: {
            cammesToast: function (o) { toasts.push(o); }
        },
        document: { getElementById: function () { return null; }, querySelectorAll: function () { return []; } },
        setTimeout: function () { return 1; }, clearTimeout: function () {},   // i timer qui non scattano
        sendSocket: { readyState: 1, send: function () {} },
        currentMode: { samples: 1, microsteps: 32, settleMs: 30 },
        motorFree: false,
        _setMotionUiDisabled: function (v) { ctx._uiDisabilitata = v; },
        _uiDisabilitata: null
    };
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    carica(ctx);

    function ruolo(r, motivo) { vm.runInContext('applicaRuoloBanco(' + JSON.stringify(r) + ',' + JSON.stringify(motivo || '') + ');', ctx); }

    // 1) entrata in sola lettura: UNA notifica
    toasts = []; ruolo('observer');
    check('entrando in sola lettura avvisa una volta', toasts.length === 1, toasts.length + ' toast');
    var testoAvviso = toasts.length ? ((toasts[0].title || '') + ' ' + (toasts[0].body || '')) : '';

    // 2) il server lo ripete (riconnessione, snapshot): NON si ri-avvisa
    toasts = []; ruolo('observer'); ruolo('observer'); ruolo('observer');
    check('ripetere lo stesso ruolo non produce altre notifiche', toasts.length === 0, toasts.length + ' toast');

    // 2-bis) '#ctl:info ...' NON e un ruolo. Il server lo manda subito dopo
    //   '#ctl:observer' come snapshot di stato: interpretarlo come "libero"
    //   riabilitava i comandi e faceva uscire un "Banco disponibile" falso.
    //   Visto succedere nel browser, non ipotizzato.
    toasts = []; ruolo('info');
    check("'info' non e un ruolo: nessuna notifica", toasts.length === 0, toasts.length + ' toast');
    check("'info' non cambia lo stato di sola lettura",
        vm.runInContext('bancoInSolaLettura()', ctx) === true, 'lo stato e stato ribaltato');
    toasts = []; ruolo('boh-domani-un-altro-messaggio');
    check('un messaggio sconosciuto viene ignorato, non interpretato',
        toasts.length === 0 && vm.runInContext('bancoInSolaLettura()', ctx) === true, toasts.length + ' toast');

    // 3) IL CASO VERO: il polling del comparatore rifiutato a 5 Hz, per mezzo
    //    minuto di fila. Prima faceva 150 toast su una pila che ne tiene 4 —
    //    il "lampeggio" — e 150 righe nel registro della campanella.
    toasts = [];
    var partenza = ora;
    while (ora - partenza < 30000) { ora += 200; ruolo('denied'); }
    check('mezzo minuto di rifiuti a 5 Hz: poche notifiche, non 150',
        toasts.length <= 3, toasts.length + ' toast su 150 rifiuti');

    // 4) e quelle poche non mentono su quanti ne hanno taciuti
    var conNumero = toasts.filter(function (t) {
        return /ne sono stati ignorati altri (\d+)/.test(String(t.body || ''));
    });
    check('la notifica successiva dice quanti rifiuti ha taciuto',
        conNumero.length >= 1, toasts.length + ' toast, ' + conNumero.length + ' col conteggio');
    if (conNumero.length) {
        var n = parseInt(/ne sono stati ignorati altri (\d+)/.exec(String(conNumero[0].body))[1], 10);
        // 15 s di silenzio a 5 Hz = ~75 rifiuti taciuti
        check('il conteggio e quello vero (~75 in 15 s a 5 Hz)', n >= 60 && n <= 80, String(n));
    }

    // 4-bis) IL CASO VERO DEL BANCO, letto dal log del 2026-08-02.
    //   13:37:24  Controllore perso (socket chiuso) -> STOP inviato alla seriale
    //   13:37:24  Client #3 connesso (1 totali)        <- UN SOLO client
    //   13:37:24  Lease NEGATO: STOP del controllore precedente ancora in corso
    //             ... 24 volte, in 4 secondi ...
    //   13:37:28  Lease concesso al client #3
    // Massimo di client contemporanei in tutto il log: 1. Non c'era nessun
    // altro utente, e il messaggio diceva di chiudere una finestra inesistente.
    // Si parte dallo stato VERO di quel caso: un client solo, che comanda, a
    // cui cade il collegamento. Non da uno stato di osservatore lasciato dai
    // controlli precedenti — sarebbe un'altra situazione.
    ruolo('granted');
    toasts = [];
    ora += 60000;
    ruolo('denied', 'stop-in-corso');
    var corpoAttesa = toasts.length ? ((toasts[0].title || '') + ' ' + (toasts[0].body || '')) : '';
    check('rifiuto per STOP in corso: avvisa', toasts.length === 1, toasts.length + ' toast');
    check('e NON dice che c e un altro che comanda',
        !/altra finestra|altro PC|altro client|altro utente/i.test(corpoAttesa),
        corpoAttesa.slice(0, 110));
    check('dice invece che passa da solo',
        /da sol|attend|qualche secondo/i.test(corpoAttesa), corpoAttesa.slice(0, 110));
    check('e non mette la pagina in sola lettura (non e osservatore di nessuno)',
        vm.runInContext('bancoInSolaLettura()', ctx) === false,
        'un client solo non e osservatore');

    // e il rifiuto per banco OCCUPATO deve invece dirlo
    toasts = [];
    ora += 60000;
    ruolo('denied', 'occupato');
    var corpoOcc = toasts.length ? ((toasts[0].title || '') + ' ' + (toasts[0].body || '')) : '';
    check('rifiuto per banco occupato: dice che c e un altro che comanda',
        /altra finestra|altro PC/i.test(corpoOcc), corpoOcc.slice(0, 110));
    check('e quello si mette in sola lettura',
        vm.runInContext('bancoInSolaLettura()', ctx) === true);

    // 5) finita la raffica, il conteggio NON si trascina: un rifiuto isolato
    //    mezz'ora dopo non deve stampare il numero di stamattina
    toasts = [];
    ora += 1800000;
    ruolo('denied');
    check('passato il silenzio, un nuovo rifiuto avvisa di nuovo', toasts.length === 1, toasts.length + ' toast');
    check('e un rifiuto isolato non si porta dietro il conteggio vecchio',
        toasts.length === 1 && !/ignorati altri/.test(String(toasts[0].body || '')),
        toasts.length ? String(toasts[0].body).slice(0, 100) : '-');

    // 6) quando il banco si libera lo dice: senza questo l'operatore non ha
    //    modo di sapere che puo' tornare a comandare
    toasts = []; ruolo('released');
    check('quando il banco si libera avvisa', toasts.length === 1, toasts.length + ' toast');
    check('e non era gia libero prima (nessun avviso a vuoto)',
        (function () { toasts = []; ruolo('free'); return toasts.length === 0; })(), 'avviso ripetuto');

    // 7) lo stato guida davvero la UI
    ruolo('observer');
    check('in sola lettura i comandi di moto vengono disabilitati', ctx._uiDisabilitata === true, String(ctx._uiDisabilitata));
    ruolo('granted');
    check('ripreso il controllo, i comandi tornano attivi', ctx._uiDisabilitata === false, String(ctx._uiDisabilitata));

    // due motivi indipendenti spengono gli stessi pulsanti: il secondo a
    // finire non deve riaccendere quello che il primo aveva spento
    ctx.motorFree = true;
    ruolo('observer'); ruolo('granted');
    check('col motore sbloccato i comandi restano spenti anche riavuto il controllo',
        ctx._uiDisabilitata === true, String(ctx._uiDisabilitata));
    ctx.motorFree = false;

    // 8) il testo non deve piu' promettere quello che non puo' mantenere
    check("l'avviso non dice piu di chiudere \"l'altra finestra\" come unica via",
        !/chiudi l'altra finestra/i.test(testoAvviso), testoAvviso.slice(0, 90));

    // ---------- la corsa al caricamento ----------
    // Il ruolo arriva pochi ms dopo connectEngine(), che sta in un blocco
    // <script> PRIMA di quello dove sono dichiarati _setMotionUiDisabled e
    // motorFree. Fra i due blocchi il browser smaltisce gli eventi, quindi il
    // primo '#ctl:observer' puo' cadere in quella finestra. Visto succedere:
    // la chiamata falliva dentro l'handler WebSocket, il toast "Sola lettura"
    // non usciva e i pulsanti restavano vivi mentre il messaggio successivo
    // ("Comando ignorato") diceva che erano spenti.
    console.log('');
    console.log('--- il ruolo puo arrivare prima che la pagina sia finita ---');
    var presto = [];
    var ctx2 = {
        Date: { now: function () { return 1000; } }, Math: Math, JSON: JSON,
        console: { log: function () {}, warn: function () {} },
        window: { cammesToast: function (o) { presto.push(o); } },
        setTimeout: function () { return 1; }, clearTimeout: function () {}   // del browser: ci sono sempre
        // di proposito: niente _setMotionUiDisabled, niente motorFree, niente
        // sendSocket/currentMode (stanno nei blocchi <script> successivi)
    };
    ctx2.window.window = ctx2.window;
    vm.createContext(ctx2);
    carica(ctx2);
    var esploso = null;
    try { vm.runInContext('applicaRuoloBanco("observer");', ctx2); }
    catch (e) { esploso = String(e.message); }
    check('un ruolo che arriva presto non fa esplodere il gestore', esploso === null, esploso);
    check('e la notifica esce lo stesso', presto.length === 1, presto.length + ' toast');
    check('lo stato e comunque registrato', vm.runInContext('bancoInSolaLettura()', ctx2) === true);
    check("la pagina riapplica lo stato quando ha finito di caricarsi",
        /addEventListener\('load',\s*function\s*\(\)\s*\{\s*_aggiornaUiMoto\(\)/.test(ALZATA),
        'manca il riaggancio su load');

    // ---------- il polling rallenta in sola lettura ----------
    console.log('');
    console.log('--- il polling non insiste quando non e lui a comandare ---');
    check('il polling del comparatore consulta il ruolo',
        /bancoInSolaLettura\s*\(\s*\)/.test(vivo.slice(vivo.indexOf('pollSensorId'))),
        'il poll di 200 ms deve sapere se e osservatore');
}

// =============================================================

parteServer()
    .then(function () { parteBanco(); })
    .catch(function (e) { check('esecuzione', false, String(e && e.stack || e)); })
    .then(function () {
        console.log('');
        if (fails) {
            if (logServer.trim()) {
                console.log('--- output del server (per la diagnosi) ---');
                console.log(logServer.trim());
                console.log('');
            }
            console.log('RISULTATO: ' + fails + ' FALLITI');
            process.exit(1);
        }
        console.log('VALIDATO: la lettura non passa dal lease, e la sola lettura avvisa una volta.');
        process.exit(0);
    });
