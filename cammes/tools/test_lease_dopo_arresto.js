// =============================================================
//  test_lease_dopo_arresto.js — dopo l'arresto il banco TORNA, e lo dice
// =============================================================
//  REGRESSIONE DELLA v3.7.0, trovata nella verifica funzionale del 2026-11-14
//  pilotando il server vero con un firmware emulato.
//
//  Cosa vedeva l'officina: finito lo Zero virtuale la pagina si ricarica da
//  sola (e' il suo modo di ripartire pulita). Se lo spostamento finale era
//  breve, la pagina nuova restava in SOLA LETTURA — START spento — pur essendo
//  l'unica finestra aperta, e ci restava finche' non la si ricaricava a mano.
//
//  La catena, pezzo per pezzo:
//   1. il ricaricamento chiude il socket; il server ferma il moto ('x') e, se
//      ha visto attivita' di scansione negli ultimi 5 s, apre una finestra di
//      4 s in cui non riassegna il comando (CTRL-02: giusto, se qualcosa si
//      muove ancora);
//   2. la pagina nuova, appena collegata, manda la configurazione della
//      modalita' (c/r/w/k1): sono comandi di controllo, vengono rifiutati;
//   3. il server rispondeva DUE volte allo stesso comando: 'stop-in-corso'
//      (vero) e subito dopo 'occupato' (falso: non c'era nessun altro);
//   4. la pagina, letto 'occupato', si metteva in sola lettura;
//   5. finita la finestra nessuno avvisava nessuno. Fino alla 3.6.0 il comando
//      lo riprendeva per caso il polling del comparatore ('m' passava dal
//      lease, al prezzo della raffica di rifiuti). Dalla 3.7.0 'm' e' una
//      lettura e non passa piu' dal lease: giusto, ma cosi' il comando non
//      tornava MAI.
//  In piu' la configurazione rifiutata al punto 2 andava persa: la scansione
//  successiva girava con i micropassi lasciati dalla sessione precedente.
//
//  Tre cure, tutte provate qui:
//   A. la finestra si apre solo se un moto puo' essere DAVVERO in corso. Dopo
//      lo Zero virtuale il server ha gia' visto il terminale del movimento
//      (*mv) e nessun altro comando di moto e' partito: non c'e' niente da
//      aspettare. Se invece un comando di moto e' partito dopo l'ultimo
//      terminale, o arrivano campioni senza terminale, la protezione resta;
//   B. un comando, una risposta: il motivo del rifiuto e' uno solo ed e'
//      quello vero. Chi si collega durante la finestra lo sa subito
//      ('#ctl:wait'), e quando la finestra finisce il server lo ANNUNCIA
//      ('#ctl:free');
//   C. la pagina tratta l'arresto come un'attesa, non come sola lettura:
//      comandi spenti finche' dura, poi si riaccendono da soli e la
//      configurazione rifiutata viene rimandata. Un avvio rifiutato viene
//      annullato subito, invece di lasciare la pagina ad aspettare campioni
//      che non arriveranno (e a concludere, dopo 6 s, che il firmware e'
//      vecchio).
//
//  Uso: node tools/test_lease_dopo_arresto.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var net = require('net');
var http = require('http');
var vm = require('vm');
var spawn = require('child_process').spawn;
var WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' DOPO L ARRESTO IL BANCO TORNA, E LO DICE');
console.log('=============================================================');

// =============================================================
//  PARTE 1 — il server
// =============================================================
function freePort() {
    return new Promise(function (res, rej) {
        var s = net.createServer(); s.unref();
        s.on('error', rej);
        s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { res(p); }); });
    });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var HTTP_PORT = 0, WS_PORT = 0;
function inject(lines) {
    return new Promise(function (resolve, reject) {
        var r = http.request({ host: '127.0.0.1', port: HTTP_PORT, path: '/api/_mock-rx', method: 'POST',
            headers: { 'Content-Type': 'text/plain' } }, function (res) { res.resume(); res.on('end', resolve); });
        r.on('error', reject); r.write(lines.join('\n') + '\n'); r.end();
    });
}
// NIENTE ATTESE A TEMPO FISSO NEI PUNTI CHE CONTANO. Questo test gira anche
// sulla macchina di compilazione delle release, che puo' essere lenta: ogni
// passo aspetta il FATTO che gli serve (il primo messaggio di ruolo, la
// scrittura sulla seriale, la chiusura vista dal server), non un numero di
// millisecondi scelto a occhio.
function connect() {
    return new Promise(function (resolve, reject) {
        var ws = new WebSocket('ws://127.0.0.1:' + WS_PORT);
        ws._msgs = []; ws._t = [];
        var pronto = false;
        function fatto() { if (!pronto) { pronto = true; resolve(ws); } }
        ws.on('message', function (d) {
            ws._msgs.push(String(d)); ws._t.push(Date.now());
            if (ruoli(ws).length) fatto();        // collegato = il server ha detto il ruolo
        });
        ws.on('open', function () { setTimeout(fatto, 5000); });   // paracadute: il test fallira' sul controllo, non qui
        ws.on('error', reject);
    });
}
// aspetta che il server abbia SCRITTO sulla seriale finta un comando (lo stampa su stdout)
async function attendiScritta(testo, budgetMs) {
    var cerca = '[MOCKSER] ' + JSON.stringify(testo), scaduto = Date.now() + (budgetMs || 5000);
    while (Date.now() < scaduto) { if (logServer.indexOf(cerca) >= 0) return true; await sleep(15); }
    return false;
}
// chiude un client e aspetta che il server se ne sia accorto (e abbia quindi rilasciato il comando)
async function chiudi(ws, budgetMs) {
    var prima = (logServer.match(/disconnesso/g) || []).length, scaduto = Date.now() + (budgetMs || 5000);
    ws.close();
    while (Date.now() < scaduto) { if ((logServer.match(/disconnesso/g) || []).length > prima) return true; await sleep(15); }
    return false;
}
async function attendiN(ws, verbo, quanti, budgetMs) {
    var scaduto = Date.now() + (budgetMs || 5000);
    while (Date.now() < scaduto) {
        if (ruoli(ws).filter(function (m) { return m.split(' ')[0] === verbo; }).length >= quanti) return true;
        await sleep(15);
    }
    return false;
}
// i soli messaggi di RUOLO ('#ctl:info' e' uno snapshot informativo)
function ruoli(ws) {
    return ws._msgs.filter(function (m) { return m.indexOf('#ctl:') === 0 && m.indexOf('#ctl:info') !== 0; });
}
async function attendi(ws, verbo, budgetMs) {
    var scaduto = Date.now() + (budgetMs || 2000);
    while (Date.now() < scaduto) {
        var r = ruoli(ws);
        for (var k = 0; k < r.length; k++) if (r[k].split(' ')[0] === verbo) return r[k];
        await sleep(15);
    }
    return null;
}
// La pagina, appena aperta, manda questo (alzata.html, _sincronizzaConfigBanco)
var CONFIG_APERTURA = ['c1\n', 'r32\n', 'w30\n', 'k1\n'];
function mandaConfig(ws) { CONFIG_APERTURA.forEach(function (c) { ws.send(c); }); }

var server = null, logServer = '';
function killServer() { try { if (server) server.kill(); } catch (e) {} server = null; }
process.on('exit', killServer);

async function parteServer() {
    var ports = await Promise.all([freePort(), freePort()]);
    HTTP_PORT = ports[0]; WS_PORT = ports[1];
    server = spawn(process.execPath,
        [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--serial-mock',
         '--port', String(HTTP_PORT), '--ws-port', String(WS_PORT)],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
    server.stdout.on('data', function (d) { logServer += d; });
    server.stderr.on('data', function (d) { logServer += d; });
    for (var t = 0; t < 100 && logServer.indexOf('Seriale MOCK attiva') < 0; t++) await sleep(100);
    await sleep(300);
    await inject(['ver=4.1 scan=1 proto=4 free=0',
                  'HELLO proto=4 fw=4.1 dev=ABCD1234 state=IDLE_LOCKED free=0 fault=NONE rst=0x0']);
    await sleep(150);

    // ---------------------------------------------------------------
    console.log('--- A. dopo lo Zero virtuale non c e niente da aspettare ---');
    // La sequenza vera: scansione (campioni) -> fine scansione -> spostamento
    // finale '$' -> '*mv' -> la pagina si ricarica.
    var A = await connect();
    mandaConfig(A);
    check('setup: la prima pagina prende il comando', (await attendi(A, '#ctl:granted')) === '#ctl:granted', JSON.stringify(ruoli(A)));
    await inject(['#358:1432:0.02', '#359:1436:0.01', '#360:1440:0.01', '*sstat u=0', '*sdone']);
    A.send('$+012\n');                       // lo spostamento finale dello Zero virtuale
    check('setup: il comando di moto arriva alla seriale', await attendiScritta('$+012\n'));
    await inject(['*mv']);                   // movimento concluso: il motore e' fermo
    await chiudi(A);                         // location.reload()
    var B = await connect();                 // la pagina ricaricata
    check('la pagina ricaricata trova il banco libero', ruoli(B)[0] === '#ctl:free', JSON.stringify(ruoli(B)));
    mandaConfig(B);
    var gB = await attendi(B, '#ctl:granted', 1500);
    check('la configurazione della pagina ricaricata viene ACCETTATA subito', gB === '#ctl:granted', JSON.stringify(ruoli(B)));
    var rifiutiB = ruoli(B).filter(function (m) { return m.indexOf('#ctl:denied') === 0; });
    check('nessun rifiuto dopo uno Zero virtuale concluso', rifiutiB.length === 0, JSON.stringify(rifiutiB));

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- B. ricaricare a META scansione: si aspetta, ma si sa perche e fino a quando ---');
    // campioni arrivati DOPO l'ultimo terminale: un moto e' plausibilmente in corso
    await inject(['#5:20:0.10', '#6:24:0.12']);
    var tChiusura = Date.now();
    await chiudi(B);
    var C = await connect();
    check('chi si collega durante l arresto lo sa subito (#ctl:wait stop-in-corso)',
        ruoli(C)[0] === '#ctl:wait stop-in-corso', JSON.stringify(ruoli(C)));
    mandaConfig(C);
    await attendiN(C, '#ctl:denied', 4, 3000);
    await sleep(300);                        // eventuali rifiuti IN PIU' (erano 8) hanno il tempo di arrivare
    var rifC = ruoli(C).filter(function (m) { return m.indexOf('#ctl:denied') === 0; });
    check('un comando, una risposta: 4 comandi rifiutati = 4 rifiuti (erano 8)', rifC.length === 4, rifC.length + ' rifiuti: ' + JSON.stringify(rifC));
    check('il motivo e quello vero: tutti stop-in-corso',
        rifC.length > 0 && rifC.every(function (m) { return m === '#ctl:denied stop-in-corso'; }), JSON.stringify(rifC));
    check('nessuno dice "occupato": non c e nessun altro client',
        !rifC.some(function (m) { return /occupato/.test(m); }), JSON.stringify(rifC));
    var liberoC = await attendi(C, '#ctl:free', 9000);
    var quando = Date.now() - tChiusura;
    check('finita la finestra il server lo ANNUNCIA (#ctl:free)', liberoC === '#ctl:free', JSON.stringify(ruoli(C)));
    // il limite basso e' il fatto da provare (non prima della guardia); quello alto e' largo apposta
    check('...e non prima dei 4 s di guardia (nessun terminale e arrivato)', liberoC === '#ctl:free' && quando >= 3500 && quando <= 8500, quando + ' ms dalla chiusura');
    C._msgs = [];
    mandaConfig(C);
    check('dopo l annuncio la configurazione passa', (await attendi(C, '#ctl:granted', 1500)) === '#ctl:granted', JSON.stringify(ruoli(C)));

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- il terminale del firmware chiude la finestra SUBITO ---');
    await inject(['#7:28:0.20']);            // di nuovo campioni senza terminale
    await chiudi(C);
    var D = await connect();
    D.send('c1\n');
    check('durante la finestra: rifiuto per arresto', (await attendi(D, '#ctl:denied', 3000)) === '#ctl:denied stop-in-corso', JSON.stringify(ruoli(D)));
    var t0 = Date.now();
    await inject(['*sabort']);               // il firmware conferma: fermo
    var liberoD = await attendi(D, '#ctl:free', 3000);
    // "immediato" = ben prima dei 4 s della guardia, che partivano dalla chiusura di C
    check('arrivato il terminale, l annuncio e immediato', liberoD === '#ctl:free' && (Date.now() - t0) < 2500, (Date.now() - t0) + ' ms');
    var nFree = ruoli(D).filter(function (m) { return m === '#ctl:free'; }).length;
    await sleep(4400);                       // oltre il vecchio timeout di guardia
    var nFreeDopo = ruoli(D).filter(function (m) { return m === '#ctl:free'; }).length;
    check('un annuncio solo: il timer di guardia non lo ripete', nFree === 1 && nFreeDopo === 1, nFree + ' poi ' + nFreeDopo);

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- la protezione resta dove serve: un moto partito dopo l ultimo terminale ---');
    D._msgs = [];
    D.send('c1\n');
    check('setup: D prende il comando', (await attendi(D, '#ctl:granted', 1500)) === '#ctl:granted', JSON.stringify(ruoli(D)));
    await inject(['#9:36:0.30', '*sstat u=0', '*sdone']);   // scansione finita (terminale visto)
    D.send('$+090\n');                       // ...e poi parte una rotazione
    check('setup: la rotazione arriva alla seriale', await attendiScritta('$+090\n'));
    await chiudi(D);                         // la finestra si chiude a META rotazione
    var E = await connect();
    check('rotazione in corso alla chiusura: la finestra di arresto si apre lo stesso',
        ruoli(E)[0] === '#ctl:wait stop-in-corso', JSON.stringify(ruoli(E)));
    E.send('#ctl:acquire');
    check('...e il comando non viene riassegnato', (await attendi(E, '#ctl:denied', 3000)) === '#ctl:denied stop-in-corso', JSON.stringify(ruoli(E)));
    await inject(['*mabort']);
    check('...finche il firmware non conferma lo stop', (await attendi(E, '#ctl:free', 3000)) === '#ctl:free', JSON.stringify(ruoli(E)));

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- chi stava guardando viene avvisato allo stesso modo ---');
    E._msgs = [];
    E.send('c1\n');
    check('setup: E prende il comando', (await attendi(E, '#ctl:granted', 1500)) === '#ctl:granted', JSON.stringify(ruoli(E)));
    var F = await connect();
    check('setup: F e osservatore', ruoli(F)[0] === '#ctl:observer', JSON.stringify(ruoli(F)));
    await inject(['#11:44:0.40']);           // E sta scansionando
    F._msgs = [];
    await chiudi(E);
    await attendi(F, '#ctl:wait', 3000);
    await sleep(200);                        // un eventuale "libero" di troppo ha il tempo di arrivare
    check('all osservatore non si dice "libero" mentre il banco si sta fermando',
        ruoli(F).length === 1 && ruoli(F)[0] === '#ctl:wait stop-in-corso', JSON.stringify(ruoli(F)));
    await inject(['*sabort']);
    check('...glielo si dice quando e vero', (await attendi(F, '#ctl:free', 3000)) === '#ctl:free', JSON.stringify(ruoli(F)));

    // compatibilita': a banco fermo di certo (l'ultima cosa vista e' il terminale
    // '*sabort', nessun comando di moto dopo) il rilascio resta quello di sempre
    F._msgs = [];
    F.send('c1\n');
    await attendi(F, '#ctl:granted', 3000);
    var G = await connect();
    G._msgs = [];
    await chiudi(F);
    await attendi(G, '#ctl:released', 3000);
    await sleep(200);
    check('rilascio a banco fermo: #ctl:released come prima, nessuna attesa',
        ruoli(G).length === 1 && ruoli(G)[0].indexOf('#ctl:released') === 0, JSON.stringify(ruoli(G)));
    try { G.close(); } catch (e) {}
    killServer();
}

// =============================================================
//  PARTE 2 — la pagina
// =============================================================
var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
var SCANJS = fs.readFileSync(path.join(__dirname, '..', 'cammes-scan.js'), 'utf8').replace(/\r\n/g, '\n');

function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    if (fine < 0) return null;
    return ALZATA.substring(m.index, fine + 3);
}

function partePagina() {
    console.log('');
    console.log('--- C. la pagina: l arresto e un attesa, non una sola lettura ---');
    var NOMI = ['applicaRuoloBanco', 'bancoInSolaLettura', '_aggiornaUiMoto', '_sincronizzaConfigBanco',
                '_assicuraConfigBanco', '_entraInArresto', '_esciDaArresto', '_annullaAvvioRifiutato',
                '_fermaScansioneLocale'];
    var src = {}, mancanti = [];
    NOMI.forEach(function (n) { src[n] = estrai(n); if (!src[n]) mancanti.push(n); });
    check('la pagina ha le funzioni che servono', mancanti.length === 0, mancanti.length ? 'mancano: ' + mancanti.join(', ') : '');
    if (mancanti.length) return;

    function nuovaPagina() {
        var p = { toasts: [], inviati: [], timer: [], uiSpenta: null, timerCancellati: 0 };
        var ctx = {
            Date: { now: function () { return p.ora; } },
            Math: Math, JSON: JSON, console: { log: function () {}, warn: function () {} },
            window: { cammesToast: function (o) { p.toasts.push(o); }, _engineFallback: false, cammesScanProgress: { reset: function () {} } },
            document: { getElementById: function () { return null; }, querySelectorAll: function () { return []; } },
            setTimeout: function (fn, ms) { p.timer.push({ fn: fn, ms: ms, vivo: true }); return p.timer.length; },
            clearTimeout: function (id) { if (id && p.timer[id - 1]) p.timer[id - 1].vivo = false; },
            sendSocket: { readyState: 1, send: function (s) { p.inviati.push(s); } },
            currentMode: { samples: 1, microsteps: 32, settleMs: 30 },
            motorFree: false,
            _setMotionUiDisabled: function (v) { p.uiSpenta = v; },
            _clearScanTimers: function () { p.timerCancellati++; },
            scanEta: { stop: function () {} }
        };
        p.ora = 1000000;
        ctx.window.window = ctx.window;
        vm.createContext(ctx);
        // stato della pagina: le dichiarazioni VERE, prese dal sorgente
        var stato = /\/\/ ===== Ruolo di questo client[\s\S]*?\nfunction bancoInSolaLettura/.exec(ALZATA);
        var dich = stato ? stato[0].split('\n').filter(function (r) { return /^var /.test(r); }).join('\n') : '';
        vm.runInContext(dich, ctx);
        vm.runInContext('var startflag = 0, autoScanActive = false, _autoLastIdx = 0, stepflag = 0, labms = 0;' +
                        'var repeatRunsTarget = 1, repeatRunsDone = 0, repeatedRuns = [];', ctx);
        NOMI.forEach(function (n) { vm.runInContext(src[n], ctx); });
        p.ctx = ctx;
        p.ruolo = function (r, motivo) { vm.runInContext('applicaRuoloBanco(' + JSON.stringify(r) + ',' + JSON.stringify(motivo || '') + ');', ctx); };
        p.val = function (espr) { return vm.runInContext(espr, ctx); };
        p.scatta = function () {            // fa scattare i timer ancora vivi
            var vivi = p.timer.filter(function (t) { return t.vivo; });
            vivi.forEach(function (t) { t.vivo = false; t.fn(); });
            return vivi.length;
        };
        return p;
    }
    function testo(o) { return ((o.title || '') + ' ' + (o.body || '')); }

    // --- 1: la sequenza della pagina ricaricata durante la finestra ---
    var p = nuovaPagina();
    p.ruolo('wait', 'stop-in-corso');
    check('annuncio di arresto: i comandi di moto si spengono', p.uiSpenta === true, 'uiSpenta=' + p.uiSpenta);
    check('...ma NON e sola lettura (le misure continuano al ritmo normale)', p.val('bancoInSolaLettura()') === false);
    check('...e lo dice una volta', p.toasts.length === 1 && /arresto/i.test(testo(p.toasts[0])), p.toasts.length + ' toast');
    ['c1\n', 'r32\n', 'w30\n', 'k1\n'].forEach(function () { p.ruolo('denied', 'stop-in-corso'); });
    check('i rifiuti della configurazione non aggiungono notifiche', p.toasts.length === 1, p.toasts.length + ' toast');
    check('...e non mettono la pagina in sola lettura', p.val('bancoInSolaLettura()') === false && p.uiSpenta === true);
    p.inviati.length = 0;
    p.ruolo('free');
    check('fine arresto: i comandi si riaccendono DA SOLI', p.uiSpenta === false, 'uiSpenta=' + p.uiSpenta);
    check('...e la configurazione rifiutata viene RIMANDATA',
        JSON.stringify(p.inviati) === JSON.stringify(['c1\n', 'r32\n', 'w30\n', 'k1\n']), JSON.stringify(p.inviati));
    check('...e la pagina lo dice', p.toasts.length === 2 && /pronto|disponibile/i.test(testo(p.toasts[1])), p.toasts.length + ' toast');
    p.ruolo('granted');
    check('la concessione che segue non ripete niente', p.toasts.length === 2 && p.inviati.length === 4, p.toasts.length + ' toast, ' + p.inviati.length + ' invii');

    // --- 2: chi guardava soltanto non si prende il banco ---
    p = nuovaPagina();
    p.ruolo('observer');
    p.toasts.length = 0; p.inviati.length = 0;
    p.ruolo('wait', 'stop-in-corso');
    check('osservatore durante l arresto: resta coi comandi spenti', p.uiSpenta === true);
    p.ruolo('free');
    check('...a fine arresto i comandi tornano', p.uiSpenta === false && p.val('bancoInSolaLettura()') === false);
    check('...ma una pagina che non ha chiesto niente NON manda comandi da sola', p.inviati.length === 0, JSON.stringify(p.inviati));

    // --- 3: se l'annuncio si perde, la pagina non resta bloccata ---
    p = nuovaPagina();
    p.ruolo('denied', 'stop-in-corso');
    check('rifiuto per arresto senza annuncio: comandi spenti lo stesso', p.uiSpenta === true);
    p.inviati.length = 0;
    var scattati = p.scatta();
    check('c e una rete di sicurezza a tempo', scattati >= 1, scattati + ' timer');
    check('...che riaccende i comandi e riprova la configurazione',
        p.uiSpenta === false && p.inviati.length === 4, 'uiSpenta=' + p.uiSpenta + ', invii=' + p.inviati.length);
    p.ruolo('denied', 'stop-in-corso');
    check('...e se il server rifiuta ancora, si rimette in attesa', p.uiSpenta === true && p.timer.some(function (t) { return t.vivo; }));

    // --- 4: un avvio rifiutato non resta appeso ---
    p = nuovaPagina();
    p.ruolo('free');
    p.val('startflag = 1; autoScanActive = true; _autoLastIdx = 0; labms = 1;');
    p.inviati.length = 0; p.toasts.length = 0;
    p.ruolo('denied', 'stop-in-corso');
    check('avvio rifiutato: la scansione locale viene annullata', p.val('startflag') === 0 && p.val('autoScanActive') === false,
        'startflag=' + p.val('startflag') + ' autoScanActive=' + p.val('autoScanActive'));
    check('...compreso lo Zero virtuale che l aveva chiesta', p.val('labms') === 0, 'labms=' + p.val('labms'));
    check('...e i suoi timer (il ripiego a 6 s sul motore lento non scatta)', p.timerCancellati >= 1, p.timerCancellati + ' chiamate');
    check('...senza mandare STOP: il moto in corso puo essere di un altro', p.inviati.indexOf('x') < 0, JSON.stringify(p.inviati));
    check('...e l operatore lo legge', p.toasts.length >= 1 && /non avviata/i.test(testo(p.toasts[0])), p.toasts.map(testo).join(' | ').slice(0, 140));

    p = nuovaPagina();
    p.ruolo('free');
    p.val('startflag = 1; autoScanActive = true; _autoLastIdx = 57;');
    p.ruolo('denied', 'occupato');
    check('una scansione che sta gia ricevendo campioni NON viene toccata da un rifiuto', p.val('startflag') === 1 && p.val('autoScanActive') === true);

    // --- 5: la configurazione persa si rimanda prima di muovere ---
    p = nuovaPagina();
    p.ruolo('observer');
    p.ruolo('denied', 'occupato');                 // la config d'apertura rifiutata: c'era un altro
    p.ruolo('released', 'socket');                 // l'altro se ne va
    p.inviati.length = 0;
    check('finche non si comanda, la pagina non manda niente', p.inviati.length === 0);
    p.val('_assicuraConfigBanco()');
    check('prima del primo comando di moto la configurazione viene rimandata',
        JSON.stringify(p.inviati) === JSON.stringify(['c1\n', 'r32\n', 'w30\n', 'k1\n']), JSON.stringify(p.inviati));
    p.val('_assicuraConfigBanco()');
    check('...una volta sola', p.inviati.length === 4, p.inviati.length + ' invii');

    // --- 6: chi muove passa di li ---
    console.log('');
    console.log('--- ogni comando di moto parte con la configurazione di QUESTA pagina ---');
    var run = estrai('_startSingleRun') || '';
    var iAss = run.indexOf('_assicuraConfigBanco('), iS = run.indexOf("sendSocket.send('S'");
    check('la scansione allinea la configurazione prima di partire', iAss >= 0 && iS >= 0 && iAss < iS, 'assicura@' + iAss + ' S@' + iS);
    var vivo = ALZATA.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');
    var rot = estrai('ruota') || '';
    var iAssR = rot.indexOf('_assicuraConfigBanco('), iSendR = rot.indexOf('sendSocket.send(');
    check('la rotazione (Ruota) allinea la configurazione',
        iAssR >= 0 && iSendR >= 0 && iAssR < iSendR, 'assicura@' + iAssR + ' send@' + iSendR);
    check('il jog +/- allinea la configurazione', /_assicuraConfigBanco/.test(SCANJS));
    var nBlocchi = (vivo.match(/sendSocket\.send\('r' \+ currentMode\.microsteps/g) || []).length;
    check('la configurazione si compone in UN posto solo', nBlocchi === 1, nBlocchi + ' copie');
    check('l apertura del socket usa quella funzione', /_engineOnOpen[\s\S]{0,2500}_sincronizzaConfigBanco\(\)/.test(vivo));
    check('il cambio modalita usa quella funzione', /function onScanModeChange[\s\S]{0,400}_sincronizzaConfigBanco\(\)/.test(vivo));
}

parteServer()
    .then(function () { partePagina(); })
    .catch(function (e) { check('esecuzione', false, String(e && e.stack || e)); })
    .then(function () {
        killServer();
        console.log('');
        if (fails) {
            if (logServer.trim()) {
                console.log('--- output del server (ultime righe, per la diagnosi) ---');
                console.log(logServer.trim().split('\n').slice(-25).join('\n'));
                console.log('');
            }
            console.log('RISULTATO: ' + fails + ' FALLITI');
            process.exit(1);
        }
        console.log('VALIDATO: nessuna attesa dopo uno Zero virtuale concluso; durante un arresto');
        console.log('un solo rifiuto col motivo vero, annuncio a fine finestra, pagina che si');
        console.log('riprende da sola e rimanda la configurazione.');
        process.exit(0);
    });
