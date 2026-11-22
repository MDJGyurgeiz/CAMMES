// =============================================================
//  test_usabilita_home.js — la Home come punto di partenza di ogni giorno
// =============================================================
//  Analisi di usabilita' del 2026-11-21 (ANALISI_USABILITA_2026-11-21.md),
//  proposte applicate alla Home:
//
//   3. in cima una riga di stato (verifica banco, Arduino, programma,
//      archivio) con un pulsante grande "Nuova misura"; subito sotto
//      l'archivio; manutenzione e attivita' in fondo, in pannelli chiusi
//      (aperto/chiuso ricordato); via il riquadro "Tag piu' usati" (doppione
//      della riga "Tag:"); "Polare"/"Altri" solo se esistono file di quel tipo;
//      l'ultima misura si apre con un clic;
//   4. dall'archivio a Confronto (?files=) e ad Analisi (?asp=&sca=) senza
//      ripescare i file dalla finestra di Windows: casella su ogni riga, barra
//      della selezione, e dalla vista rapida "come aspirazione / come scarico";
//   5. righe con i comandi a parole (Apri, Scarica, Excel, Elimina staccato),
//      ordine sempre per data (i preferiti non salgono in cima), "Mostra altre
//      50", ricerca anche nei tag, un clic su un tag filtra e non lo cancella;
//  12. finestre della pagina al posto di confirm()/prompt() del browser;
//  13. dove stanno le misure e come si aggiorna il programma, scritto in Home;
//   e il glossario, i numeri con la virgola e i fumetti corti, anche sulla
//   Scheda PDF della singola misura.
//
//  Le funzioni della pagina girano davvero (vm), con un DOM e un server finti.
//
//  Uso: node tools/test_usabilita_home.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var URLSearchParams = require('url').URLSearchParams;

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' HOME: stato in cima, archivio subito sotto, parole da officina');
console.log('=============================================================');

var HOME = fs.readFileSync(path.join(__dirname, '..', 'home.html'), 'utf8').replace(/\r\n/g, '\n');
// codice vivo: senza le righe di commento
var VIVO = HOME.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');
// markup senza script, stili e commenti
var MARKUP = HOME.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
                 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
                 .replace(/<!--[\s\S]*?-->/g, '');

function decodifica(s) {
    var nomi = { agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À',
                 hellip: '…', middot: '·', rarr: '→', larr: '←', mdash: '—', ndash: '–', rsquo: '’', deg: '°',
                 times: '×', amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' };
    return String(s)
        .replace(/&#(\d+);/g, function (m, n) { return String.fromCodePoint(Number(n)); })
        .replace(/&([A-Za-z]+);/g, function (m, n) { return nomi[n] !== undefined ? nomi[n] : m; });
}
function testoDi(html) { return decodifica(String(html).replace(/<[^>]*>/g, '')); }

// ---------------------------------------------------------------
console.log('');
console.log('--- disposizione: stato in cima, archivio subito sotto, il resto in fondo ---');
var iStato = HOME.indexOf('id="statoBanco"');
var iBadge = HOME.indexOf('id="benchBadge"');
var iArchivio = HOME.indexOf('id="archivioCard"');
var iSistema = HOME.indexOf('id="updatesCard"');
var iAttivita = HOME.indexOf('id="activityCard"');
check('la riga di stato (#statoBanco) e il primo riquadro dopo la barra in alto',
    iStato > 0 && iStato < iArchivio && HOME.indexOf('class="card') === HOME.lastIndexOf('<div', iStato) + '<div '.length,
    'statoBanco@' + iStato + ' archivio@' + iArchivio);
check('l esito della verifica banco (#benchBadge) sta nella riga di stato, non nell intestazione dell officina',
    iBadge > iStato && iBadge < iArchivio);
check('nella riga di stato: Arduino, programma e archivio',
    ['statoArduino', 'statoProgramma', 'homeStats'].every(function (id) {
        var i = HOME.indexOf('id="' + id + '"'); return i > iStato && i < iArchivio;
    }));
// (il fumetto contiene <strong>: il tag si prende fino a </a>)
var iNuova = HOME.indexOf('id="nuovaMisuraBtn"');
var tagNuova = iNuova > 0 ? HOME.slice(HOME.lastIndexOf('<a ', iNuova), HOME.indexOf('</a>', iNuova) + 4) : '';
check('un pulsante grande "Nuova misura" (#nuovaMisuraBtn) porta ad Alzata',
    /^<a href="alzata\.html"/.test(tagNuova) && /class="btn btn-accent nuova-misura"/.test(tagNuova) && />\+ Nuova misura<\/a>$/.test(tagNuova) &&
    iNuova > iStato && iNuova < iArchivio, tagNuova.slice(0, 90) || 'assente');
check('subito sotto, l archivio "Misurazioni" con il conteggio nel titolo',
    iArchivio > iStato && /Misurazioni <span class="archivio-conteggio" id="archivioConteggio">/.test(HOME));
check('"Sistema e manutenzione" e "Attivita" in fondo, dopo l archivio', iSistema > iArchivio && iAttivita > iSistema);
var details = HOME.match(/<details\b[^>]*>/g) || [];
check('...in due pannelli <details>, chiusi all apertura della pagina',
    details.length === 2 && details.every(function (d) { return !/\bopen\b/.test(d); }), details.join(' | '));
check('...con i titoli giusti',
    /<summary>Sistema e manutenzione/.test(HOME) && /<summary>Attivit&agrave; degli ultimi 14 giorni<\/summary>/.test(HOME));
var iSist = HOME.indexOf('<details', iSistema - 60), fSist = HOME.indexOf('</details>', iSistema);
var SISTEMA = HOME.slice(iSist, fSist);
['updCheckBtn', 'updDownloadLink', 'fwFlashBtn', 'setOfficina', 'trashBtn', 'trashArea', 'importMetaInput', 'concert-toggle'].forEach(function (id) {
    check('in Sistema e manutenzione: #' + id, SISTEMA.indexOf('id="' + id + '"') >= 0);
});
check('...anche Backup completo, Svuota archivio, Diagnostica e Manuale',
    /href="\/api\/backup-zip"/.test(SISTEMA) && /onclick="clearArchive\(\);"/.test(SISTEMA) &&
    /href="\/api\/diagnostics"/.test(SISTEMA) && /href="\/manuale"/.test(SISTEMA));
var HEADER = HOME.slice(HOME.indexOf('<div class="header">'), iStato);
check('la barra in alto tiene il "?" e il tema (accanto li mette cammes-ui.js campanella, giro e Manuale)',
    /id="help-toggle"/.test(HEADER) && /id="theme-toggle"/.test(HEADER));
check('il "Concerto col motore" (passatempo che muove il motore) non sta piu nella barra in alto',
    !/concert/i.test(HEADER));
check('via il riquadro "Tag piu usati" (doppione della riga "Tag:" dell archivio)',
    !/tagStatsCard|Tag pi&ugrave; usati|renderTagStats/.test(VIVO));
check('le tre tessere "Funzionalita" sono una riga compatta (.home-tiles resta per il giro guidato)',
    /<nav class="home-tiles"/.test(HOME) && !/Funzionalit&agrave;<\/div>/.test(HOME) && !/home-tile-icon/.test(HOME));
check('i filtri "Polare" e "Altri" partono nascosti (compaiono solo se servono)',
    /id="typeFilters"[^>]*style="display:none;"/.test(HOME) &&
    /data-filter="pol"[^>]*style="display:none;"/.test(HOME) && /data-filter="other"[^>]*style="display:none;"/.test(HOME));
var mBarra = /<div class="barra-selezione" id="barraSelezione" hidden>[\s\S]*?<\/div>/.exec(HOME);
check('la barra della selezione (#barraSelezione) esiste e parte nascosta', !!mBarra);
check('...con "Confronta i selezionati (max 4)" e "Analizza (aspirazione + scarico)"',
    !!mBarra && /Confronta i selezionati \(max 4\)/.test(mBarra[0]) && /Analizza \(aspirazione \+ scarico\)/.test(mBarra[0]));

// ---------------------------------------------------------------
console.log('');
console.log('--- aggiornare il programma: dove sono le misure e i passi ---');
var proc = /<ol class="procedura"[^>]*>([\s\S]*?)<\/ol>/.exec(SISTEMA);
var passi = proc ? (proc[1].match(/<li>/g) || []).length : 0;
check('la procedura di aggiornamento sta in Sistema e manutenzione, in tre passi', passi === 3, passi + ' passi');
var tProc = proc ? testoDi(proc[1]) : '';
check('...scarica il nuovo cammes.exe, chiudi CAMMES, stessa cartella e riavvia',
    /Scarica il nuovo cammes\.exe/.test(tProc) && /Chiudi CAMMES/.test(tProc) && /STESSA cartella/.test(tProc) && /riavvia/.test(tProc), tProc.slice(0, 160));
check('...e se la riga Firmware e arancione: Aggiorna firmware Arduino',
    /la riga <b>Firmware<\/b>[^<]*arancione, premi <b>Aggiorna firmware Arduino<\/b>/.test(SISTEMA) && /Firmware sull'Arduino:/.test(SISTEMA));
check('scrive dove stanno le misure (cartella letta dalla Diagnostica)',
    /Le misure sono nella cartella <code id="cartellaArchivioPercorso">/.test(SISTEMA) && /fetch\('\/api\/diagnostics'/.test(VIVO));
check('la riga SHA-256 resta, ma in piccolo (riga per l assistenza)',
    /id="updSha"/.test(SISTEMA) && /class="sha-riga" id="updSha"/.test(SISTEMA) && /SHA-256/.test(VIVO));
check('il fumetto del Backup completo dice che cosa contiene e come si ripristina',
    /Backup completo<\/strong>[^"]*tutte le misure, l'intestazione, i tag, i preferiti[^"]*scompatta lo ZIP nella cartella di cammes\.exe/.test(SISTEMA));

// ---------------------------------------------------------------
console.log('');
console.log('--- parole: niente finestre del browser, niente gergo, fumetti corti ---');
check('nessun confirm(), prompt() o alert() del browser nel codice vivo',
    !/(^|[^A-Za-z_.$])(window\.)?(confirm|prompt|alert)\s*\(/m.test(VIVO),
    (/(^|[^A-Za-z_.$])(window\.)?(confirm|prompt|alert)\s*\(.*/m.exec(VIVO) || [''])[0].trim().slice(0, 80));
var tips = [], reTip = /data-tip="([^"]*)"/g, mt;
while ((mt = reTip.exec(HOME)) !== null) tips.push(testoDi(mt[1]));
var lunghi = tips.filter(function (t) { return t.length > 300; });
check('fumetti (data-tip) al massimo di 300 caratteri', tips.length > 10 && lunghi.length === 0,
    tips.length + ' fumetti, il piu lungo ' + Math.max.apply(null, tips.map(function (t) { return t.length; })) +
    (lunghi.length ? ': ' + lunghi[0].slice(0, 60) : ''));
// cio' che si legge nel markup: testo fra i tag e attributi mostrati
var visibili = [];
MARKUP.replace(/>([^<]+)</g, function (m, t) { if (t.trim()) visibili.push(decodifica(t)); return m; });
MARKUP.replace(/(?:data-tip|title|placeholder|aria-label)="([^"]*)"/g, function (m, t) { visibili.push(testoDi(t)); return m; });
var GERGO = ['bookmark', 'metadati', 'github', 'avrdude', 'arduino ide', 'export', 'import', 'cartesian[oi]', 'card', 'ui',
             'wizard', 'driver', 'seriale', 'server', 'click', 'stepper', 'build', 'release', 'screensaver', 'tot', 'deg',
             'lash', 'follower', 'overlap', 'float', 'rocker', 'finger', 'run', 'max alzata', 'test di salute'];
var reGergo = new RegExp('(^|[^A-Za-zàèéìòù])(' + GERGO.join('|') + ')(?![A-Za-zàèéìòù])', 'i');
var gergo = visibili.filter(function (t) { return reGergo.test(t); });
check('nel testo della pagina nessuna parola inglese tecnica o da programmatore', gergo.length === 0,
    gergo.length ? gergo.length + ': ' + gergo.slice(0, 3).map(function (t) { return '"' + t.trim().slice(0, 50) + '"'; }).join(', ') : visibili.length + ' testi');
['Flash fallito', 'avrdude exit', 'jspdf.umd.min.js non disponibile', 'cammes_server.js sia in esecuzione',
 'Profilo alzata cartesiano', "' deg'", 'Grado picco', "'N. punti'", 'Metadati ripristinati', 'Aggiornamento UI',
 'card Sistema', 'Click per', 'Errore di rete', 'Impossibile contattare il server', 'pre-v3', 'Server offline',
 'driver seriali', 'GitHub', " tot'", ' scansioni', 'Mostrati primi 50', 'Affina i filtri', 'Nessun file da mostrare',
 'lo trova da solo', 'Scheda tecnica camma'
].forEach(function (frase) {
    check('niente piu "' + frase + '" nei messaggi', VIVO.indexOf(frase) < 0);
});

// ---------------------------------------------------------------
console.log('');
console.log('--- leggibile a un metro, e niente che esca dalla scheda ---');
var STILE = (/<style>([\s\S]*?)<\/style>/.exec(HOME) || ['', ''])[1];
var piccoli = STILE.match(/font-size:\s*(?:\d|1[01])(?:\.\d+)?px/g) || [];
check('nessuna scritta sotto i 12 px (prima 10-11 px su tipo, conteggio dei tag, vista rapida, attivita)', STILE.length > 1000 && piccoli.length === 0, piccoli.join(', '));
check('il conteggio dei tag non e piu sbiadito', /\.tag-filter-count \{[^}]*\}/.test(STILE) && !/\.tag-filter-count \{[^}]*opacity/.test(STILE));
check('un nome lungo va a capo invece di allargare la tabella oltre la scheda',
    /\.home-recents-table \.fname \{[^}]*overflow-wrap: anywhere/.test(STILE) && /\.file-tags \{[^}]*overflow-wrap: anywhere/.test(STILE));
check('...e sotto i 1150 px (finestra stretta o zoom) i comandi della riga vanno a capo',
    /@media \(max-width: 1150px\) \{\s*\.home-recents-table \.col-azioni \{ white-space: normal; \}/.test(STILE));
check('nelle finestre della Home un nome di file lungo va a capo nel pulsante, non viene tagliato',
    /\.cammes-dialog-actions \.btn \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;[^}]*text-align: left;/.test(STILE));
check('"come aggiornare" porta a Sistema e manutenzione senza nasconderne il titolo sotto la barra in alto',
    /#updatesCard \{ scroll-margin-top: 96px; \}/.test(STILE));
check('il pulsante del firmware ha uno stile "in evidenza" per quando la scheda va aggiornata',
    /\.home-action-btn\.in-evidenza \{[^}]*background: var\(--accent\)/.test(STILE));

// ---------------------------------------------------------------
//  La pagina, con un DOM e un server finti
// ---------------------------------------------------------------
function classi() {
    var s = {};
    return {
        add: function (c) { s[c] = 1; },
        remove: function (c) { delete s[c]; },
        toggle: function (c, f) { var on = (f === undefined) ? !s[c] : !!f; if (on) s[c] = 1; else delete s[c]; return on; },
        contains: function (c) { return !!s[c]; }
    };
}
function elemento(tag, attr) {
    var html = '';
    var el = {
        tagName: String(tag || 'div').toUpperCase(), style: {}, children: [], _ev: {}, _attr: {},
        textContent: '', value: '', title: '', className: '', type: '', id: '',
        hidden: false, disabled: false, checked: false, open: false, classList: classi(), _qsa: [],
        setAttribute: function (k, v) { el._attr[k] = String(v); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(el._attr, k) ? el._attr[k] : null; },
        appendChild: function (c) { el.children.push(c); c.parentNode = el; return c; },
        removeChild: function (c) { el.children = el.children.filter(function (x) { return x !== c; }); },
        remove: function () { if (el.parentNode) el.parentNode.removeChild(el); },
        addEventListener: function (t, f) { (el._ev[t] = el._ev[t] || []).push(f); },
        removeEventListener: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return el._qsa; },
        closest: function () { return el._closest || null; },
        scrollIntoView: function () {}, focus: function () {}, click: function () {},
        getContext: function () { return {}; }
    };
    Object.defineProperty(el, 'innerHTML', {
        get: function () { return html; },
        set: function (v) { html = String(v); el.children = []; }
    });
    Object.keys(attr || {}).forEach(function (k) { el._attr[k] = attr[k]; });
    return el;
}
function testoFigli(el) {
    return el.innerHTML + el.children.map(function (c) { return c.textContent || (c.innerHTML || ''); }).join('');
}

var registro = {}, qsa = {};
function registra(id, tag) { var e = elemento(tag || 'div'); e.id = id; registro[id] = e; return e; }
// anche gli elementi creati dalla pagina e appesi a quelli noti (per esempio
// l'elenco del cestino #trashBox dentro #trashArea)
function cercaPerId(id) {
    if (registro[id]) return registro[id];
    var visti = [];
    function giu(el) {
        if (!el || typeof el !== 'object' || visti.indexOf(el) >= 0) return null;
        visti.push(el);
        if (el.id === id) return el;
        var figli = el.children || [];
        for (var i = 0; i < figli.length; i++) { var r = giu(figli[i]); if (r) return r; }
        return null;
    }
    var radici = Object.keys(registro).map(function (k) { return registro[k]; });
    for (var i = 0; i < radici.length; i++) {
        var figli = radici[i].children || [];
        for (var j = 0; j < figli.length; j++) { var r = giu(figli[j]); if (r) return r; }
    }
    return null;
}
['recentsWrap', 'recentsCount', 'tagFiltersRow', 'barraSelezione', 'selTesto', 'selConfrontaBtn', 'selAnalizzaBtn',
 'selNota', 'homeStats', 'archivioConteggio', 'activityChart', 'activityLabels', 'benchBadge', 'statoArduino',
 'statoProgramma', 'updSwStatus', 'updSwCurrent', 'updSha', 'fwBundled', 'fwPort', 'fwDevice', 'fwFlashBtn',
 'fwFlashStatus', 'setOfficina', 'trashBtn', 'trashArea', 'cartellaArchivioPercorso', 'quickviewBody',
 'qvTagsRow', 'qvPdfBtn', 'quickviewCanvas', 'recentsSearch', 'recentsSearchClear', 'filterBookmarkedLabel',
 'filterBookmarkedIcon'].forEach(function (id) { registra(id); });
registra('updDownloadLink', 'a');
registra('updatesCard', 'details');
registra('activityCard', 'details');
var chipTipo = ['all', 'alz', 'pol', 'other'].map(function (t) { return elemento('button', { 'data-filter': t }); });
registra('typeFilters')._qsa = chipTipo;
qsa['#typeFilters .chip-filter'] = chipTipo;
qsa['#dateFilters .chip-filter'] = ['all', 'today', 'week', 'month'].map(function (t) { return elemento('button', { 'data-date': t }); });

var memoria = {};
var localStorageFinto = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(memoria, k) ? memoria[k] : null; },
    setItem: function (k, v) { memoria[k] = String(v); },
    removeItem: function (k) { delete memoria[k]; }
};

var risposte = {}, chiamate = [];
function fetchFinto(url, opts) {
    chiamate.push({ url: url, metodo: (opts && opts.method) || 'GET', corpo: opts && opts.body });
    var chiavi = Object.keys(risposte).filter(function (k) { return url.indexOf(k) === 0; })
        .sort(function (a, b) { return b.length - a.length; });
    if (!chiavi.length) return Promise.reject(new Error('rete'));
    var r = risposte[chiavi[0]](url, opts || {});
    var st = r.status || 200;
    return Promise.resolve({ ok: st < 400, status: st,
        json: function () { return Promise.resolve(r.body); },
        text: function () { return Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)); } });
}

var toasts = [], dialoghi = [], scelte = [], timers = [];
var navigato = { href: '' };
var sandbox = {
    // (la pagina scrive nella console del browser il dettaglio tecnico di un
    // aggiornamento firmware fallito: qui non serve)
    console: { log: console.log, error: console.error, warn: function () {} },
    URLSearchParams: URLSearchParams,
    localStorage: localStorageFinto, sessionStorage: localStorageFinto,
    fetch: fetchFinto,
    setTimeout: function (f, ms) { timers.push({ f: f, ms: ms }); return timers.length; },
    clearTimeout: function () {},
    requestAnimationFrame: function () { return 0; },
    location: { hostname: 'localhost', host: 'localhost:3000',
                get href() { return navigato.href; }, set href(v) { navigato.href = v; } },
    document: {
        getElementById: function (id) { return cercaPerId(id); },
        querySelector: function () { return null; },
        querySelectorAll: function (sel) { return qsa[sel] || []; },
        createElement: function (tag) { return elemento(tag); },
        createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
        addEventListener: function () {}, removeEventListener: function () {},
        body: elemento('body'), documentElement: elemento('html')
    },
    addEventListener: function () {},
    CAMMES_VERSION: 'v3.7.1',
    cammesToast: function (o) { toasts.push(o); },
    // stessa funzione di cammes-ui.js
    cammesNum: function (x, d) {
        var n = Number(x);
        if (x === null || x === undefined || x === '' || !isFinite(n)) return 'n.d.';
        var s = n.toFixed(d == null ? 2 : d);
        if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
        return s.replace('.', ',');
    },
    cammesConferma: function (titolo, testo, testoSi, pericoloso) {
        dialoghi.push({ tipo: 'conferma', titolo: titolo, testo: testo, testoSi: testoSi, pericoloso: pericoloso });
        return Promise.resolve(scelte.length ? scelte.shift() : false);
    },
    cammesChiedi: function (titolo, testo, valore, testoSi) {
        dialoghi.push({ tipo: 'chiedi', titolo: titolo, testo: testo, valore: valore, testoSi: testoSi });
        return Promise.resolve(scelte.length ? scelte.shift() : null);
    },
    cammesDialog: function (opts) {
        dialoghi.push({ tipo: 'dialog', opts: opts });
        return Promise.resolve({ scelta: scelte.length ? scelte.shift() : null, testo: null });
    },
    Chart: function (ctx, cfg) { sandbox._grafico = cfg; this.data = cfg.data; this.options = cfg.options; this.destroy = function () {}; }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
function esegui(codice) { return vm.runInContext(codice, sandbox); }

var codice = [], reScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, ms;
while ((ms = reScript.exec(HOME)) !== null) codice.push(ms[1]);
var caricata = true;
try { esegui(codice.join('\n;\n')); } catch (e) { caricata = false; console.log('          ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
check('gli script della pagina girano (con DOM e server finti)', caricata);
if (!caricata) { console.log('\nRISULTATO: pagina non caricabile'); process.exit(1); }

function attesa() { return new Promise(function (r) { setImmediate(r); }); }
async function pausa() { for (var i = 0; i < 6; i++) await attesa(); }

var ORA = Date.now();
function misura(nome, oreFa, tipo, peso) { return { name: nome, type: tipo || 'alz', size: peso || 8396, mtime: ORA - oreFa * 3600000 }; }

(async function () {
    // -----------------------------------------------------------
    console.log('');
    console.log('--- archivio: ordine, comandi a parole, righe in piu ---');
    var file3 = [misura('vecchia_alz.scr', 50), misura('nuova_alz.scr', 1), misura('media_alz.scr', 5)];
    check('ordine per data, la piu recente in cima',
        esegui('ordinaMisure(' + JSON.stringify(file3) + ')').map(function (f) { return f.name; }).join(',') === 'nuova_alz.scr,media_alz.scr,vecchia_alz.scr');
    memoria['cammes-bookmarks-v1'] = JSON.stringify(['vecchia_alz.scr']);
    memoria['cammes-tags-v1'] = JSON.stringify({ 'media_alz.scr': ['cliente-bianchi', 'prova-1'] });
    risposte['/api/files'] = function () { return { body: { files: file3 } }; };
    await esegui('loadRecents()');
    var tab = registro.recentsWrap.innerHTML;
    var ordine = (tab.match(/data-act="open" data-name="([^"]+)"/g) || []).filter(function (x, i) { return i % 2 === 0; })
        .map(function (x) { return /data-name="([^"]+)"/.exec(x)[1]; });
    check('...anche con un preferito vecchio: la stella non lo porta in cima', ordine.join(',') === 'nuova_alz.scr,media_alz.scr,vecchia_alz.scr', ordine.join(','));
    check('ogni riga ha la casella di selezione', (tab.match(/<input type="checkbox" class="sel-riga" data-act="sel"/g) || []).length === 3);
    check('...che si prende in tutta la cella (etichetta grande quanto la cella, non i soli 18 px della casella)',
        (tab.match(/<td class="col-sel"><label class="sel-area" title="Seleziona per Confronto o Analisi"><input type="checkbox" class="sel-riga"/g) || []).length === 3 &&
        /\.sel-area \{[^}]*min-width: 36px; min-height: 44px;/.test(HOME) && /td\.col-sel \{ padding: 0; \}/.test(HOME));
    check('comandi con la parola: Apri, Scarica, Excel, Elimina',
        (tab.match(/&#128065; Apri<\/button>/g) || []).length === 3 && (tab.match(/&darr; Scarica<\/a>/g) || []).length === 3 &&
        (tab.match(/&#128202; Excel<\/a>/g) || []).length === 3 && (tab.match(/&times; Elimina<\/button>/g) || []).length === 3);
    check('...Elimina e un pulsante a parte (staccato dagli altri)', /\.delete-btn \{[\s\S]*?margin-left: 22px;/.test(HOME) &&
        (tab.match(/class="delete-btn" data-act="del"/g) || []).length === 3);
    check('niente colonne "Tipo" (sempre ALZATA) e "Dim." (KB): la data completa e il peso stanno nel fumetto di "Quando"',
        !/<th>Tipo<\/th>|<th>Dim\.<\/th>/.test(tab) && /<th>Quando<\/th>/.test(tab) && /title="[^"]*file di 8,2 KB"/.test(tab));
    check('una misura di alzata non porta l etichetta del tipo', !/type-pill/.test(tab));
    check('un clic su un tag filtra (data-act="tag-filter"); la x lo toglie (data-act="tag-del")',
        /<span class="tag-badge" data-act="tag-filter" data-tag="cliente-bianchi"[^>]*>cliente-bianchi<button type="button" class="tag-x" data-act="tag-del"/.test(tab) &&
        !/class="tag-badge"[^>]*data-act="tag-del"/.test(tab));
    check('conteggio nel titolo e in barra, in parole', registro.archivioConteggio.textContent === '· 3' && registro.recentsCount.textContent === '3 misure',
        registro.archivioConteggio.textContent + ' / ' + registro.recentsCount.textContent);

    var hs = testoFigli(registro.homeStats);
    check('riga di stato: quante misure e l ultima, che si apre con un clic',
        /In archivio: <b>3<\/b> misure/.test(hs) && registro.homeStats.children[0] && registro.homeStats.children[0].textContent === 'nuova_alz.scr' &&
        (registro.homeStats.children[0]._ev.click || []).length === 1, hs.slice(0, 120));
    check('...senza parlare di polari quando non ce ne sono', !/polar/i.test(hs));
    check('filtri per tipo nascosti se ci sono solo misure di alzata', registro.typeFilters.style.display === 'none');

    var cento = [];
    for (var k = 0; k < 120; k++) cento.push(misura('albero' + k + '_alz.scr', k + 1));
    risposte['/api/files'] = function () { return { body: { files: cento } }; };
    await esegui('loadRecents()');
    var righe = function () { return (registro.recentsWrap.innerHTML.match(/<tr class=/g) || []).length; };
    check('oltre 50 righe: le 50 piu recenti e "Mostra altre 50"',
        righe() === 50 && /data-act="altre">Mostra altre 50</.test(registro.recentsWrap.innerHTML), righe() + ' righe');
    esegui('mostraAltreRighe()');
    check('...poi 100 e "Mostra altre 20"', righe() === 100 && /Mostra altre 20</.test(registro.recentsWrap.innerHTML), righe() + ' righe');
    esegui('mostraAltreRighe()');
    check('...poi tutte, senza pulsante', righe() === 120 && !/data-act="altre"/.test(registro.recentsWrap.innerHTML));
    esegui('setDateFilter("all")');
    check('un filtro cambiato riparte dalle prime 50', righe() === 50);

    file3.push(misura('vecchio_pol.scr', 80, 'pol'));
    risposte['/api/files'] = function () { return { body: { files: file3 } }; };
    await esegui('loadRecents()');
    check('con un vecchio file polare: compaiono il gruppo e il filtro "Polare", non "Altri"',
        registro.typeFilters.style.display === '' && chipTipo[2].style.display === '' && chipTipo[3].style.display === 'none');
    check('...la riga lo dice e la riga di stato lo conta',
        /type-pill pol">vecchio polare/.test(registro.recentsWrap.innerHTML) && /vecchi file polari: 1/.test(testoFigli(registro.homeStats)));
    var tabPol = registro.recentsWrap.innerHTML;
    check('...la sua riga non ha la casella: i vecchi file polari non vanno ne in Confronto ne in Analisi',
        righe() === 4 && (tabPol.match(/class="sel-riga"/g) || []).length === 3 && !/data-act="sel" data-name="vecchio_pol\.scr"/.test(tabPol));
    esegui('toggleSelezione("vecchio_pol.scr", true)');
    check('...e non si seleziona nemmeno per altre vie', esegui('_selezionate.indexOf("vecchio_pol.scr")') === -1);
    esegui('setTypeFilter("pol")');
    file3.pop();
    await esegui('loadRecents()');
    check('se i polari spariscono, il filtro "Polare" rimasto acceso si spegne (non nasconde tutto)',
        esegui('typeFilter') === 'all' && righe() === 3);

    // -----------------------------------------------------------
    console.log('');
    console.log('--- ricerca e filtri ---');
    check('la ricerca guarda il nome', esegui('corrispondeRicerca("albero12_asp_alz.scr", [], "asp")') === true);
    check('...e i tag', esegui('corrispondeRicerca("x_alz.scr", ["cliente-bianchi"], "bianchi")') === true &&
        esegui('corrispondeRicerca("x_alz.scr", ["prova-1"], "prova 1")') === true);
    check('...e non trova cio che non c e', esegui('corrispondeRicerca("x_alz.scr", ["prova-1"], "rossi")') === false);
    esegui('searchQuery = "bianchi"; renderRecentsTable()');
    check('cercando un tag compare la misura che lo porta', righe() === 1 && /data-name="media_alz\.scr"/.test(registro.recentsWrap.innerHTML));
    esegui('searchQuery = ""; selectedTagFilters = ["inesistente"]; renderRecentsTable()');
    check('con il solo filtro per tag e nessun risultato si puo azzerare (prima: "Nessun file da mostrare.")',
        /data-act="azzera">Azzera tutti i filtri/.test(registro.recentsWrap.innerHTML));
    esegui('resetAllFilters()');
    check('"Azzera tutti i filtri" spegne anche i filtri per tag', esegui('selectedTagFilters.length') === 0 && righe() === 3);
    var ascolta = registro.recentsWrap._ev.click[0];
    function clic(attr) {
        var bersaglio = elemento('span', attr);
        ascolta({ target: { closest: function () { return bersaglio; } }, preventDefault: function () {}, stopPropagation: function () {} });
    }
    clic({ 'data-act': 'tag-filter', 'data-tag': 'prova-1' });
    check('un clic sull etichetta di un tag filtra l elenco', esegui('selectedTagFilters.join()') === 'prova-1' && righe() === 1);
    esegui('clearTagFilters()');

    // -----------------------------------------------------------
    console.log('');
    console.log('--- tag: finestre della pagina, e togliere chiede ---');
    dialoghi.length = 0; scelte = [false];
    clic({ 'data-act': 'tag-del', 'data-name': 'media_alz.scr', 'data-tag': 'prova-1' });
    await pausa();
    var tagOra = function () { return JSON.parse(memoria['cammes-tags-v1'])['media_alz.scr'] || []; };
    check('la x di un tag chiede conferma; con Annulla il tag resta',
        dialoghi.length === 1 && dialoghi[0].tipo === 'conferma' && tagOra().indexOf('prova-1') >= 0);
    scelte = [true];
    await esegui('clickRemoveTag("media_alz.scr", "prova-1")');
    check('...confermato, il tag se ne va', tagOra().indexOf('prova-1') < 0 && tagOra().indexOf('cliente-bianchi') >= 0, tagOra().join());
    dialoghi.length = 0; scelte = ['Cliente Bianchi, prova.2, cliente bianchi'];
    await esegui('promptAddTags("nuova_alz.scr")');
    var tagNuova = JSON.parse(memoria['cammes-tags-v1'])['nuova_alz.scr'] || [];
    check('i tag si scrivono in una finestra della pagina (non prompt del browser)', dialoghi.length === 1 && dialoghi[0].tipo === 'chiedi');
    check('...che dice che i tag finiscono sulla Scheda PDF', /compaiono anche sulla Scheda PDF/.test(dialoghi[0].testo || ''));
    check('...e quali tag sono gia in uso', /Tag gi&agrave; usati: cliente-bianchi/.test(dialoghi[0].testo || ''), (dialoghi[0].testo || '').slice(-60));
    check('...salvati in minuscolo, col trattino, senza doppioni', tagNuova.join('|') === 'cliente-bianchi|prova2', tagNuova.join('|'));
    scelte = [null];
    await esegui('promptAddTags("nuova_alz.scr")');
    check('...Annulla non cambia niente', (JSON.parse(memoria['cammes-tags-v1'])['nuova_alz.scr'] || []).join('|') === 'cliente-bianchi|prova2');

    // -----------------------------------------------------------
    console.log('');
    console.log('--- dall archivio a Confronto e ad Analisi ---');
    var uC = esegui('urlConfronto(["a_alz.scr", "b c_alz.scr", "d_alz.scr", "e_alz.scr", "f_alz.scr"])');
    var lettiC = new URLSearchParams(uC.split('?')[1]).get('files').split(',');
    check('Confronto: grafici.html?files= con al massimo 4 nomi, che Confronto rilegge tali e quali',
        uC.indexOf('grafici.html?files=') === 0 && lettiC.length === 4 && lettiC[1] === 'b c_alz.scr', uC);
    var uA = esegui('urlAnalisi("albero12 asp&1_alz.scr", "albero12_sca_alz.scr")');
    var pA = new URLSearchParams(uA.split('?')[1]);
    check('Analisi: analisi.html?asp=...&sca=..., nomi intatti', uA.indexOf('analisi.html?asp=') === 0 &&
        pA.get('asp') === 'albero12 asp&1_alz.scr' && pA.get('sca') === 'albero12_sca_alz.scr', uA);
    check('...ciascuno facoltativo', esegui('urlAnalisi("x_alz.scr", null)') === 'analisi.html?asp=x_alz.scr' &&
        esegui('urlAnalisi(null, "y_alz.scr")') === 'analisi.html?sca=y_alz.scr');
    var s0 = esegui('statoSelezione(0)'), s1 = esegui('statoSelezione(1)'), s2 = esegui('statoSelezione(2)'), s5 = esegui('statoSelezione(5)');
    check('barra: nascosta senza selezione; 1-4 misure -> Confronta; esattamente 2 -> anche Analizza',
        !s0.visibile && s1.visibile && s1.confronta && !s1.analizza && s2.confronta && s2.analizza && !s5.confronta && !s5.analizza);
    check('...oltre 4 dice quante spunte togliere', /togli la spunta a 1/.test(s5.nota), s5.nota);

    var casella = elemento('input'); var riga = elemento('tr'); casella._closest = riga;
    esegui('deselezionaTutte()');
    clic({ 'data-act': 'sel', 'data-name': 'nuova_alz.scr' });   // casella non spuntata: nessun effetto
    sandbox._casella = casella;
    casella.checked = true;
    esegui('toggleSelezione("nuova_alz.scr", true, _casella)');
    check('spuntata una riga, compare la barra (Confronta si, Analizza no)',
        registro.barraSelezione.hidden === false && registro.selConfrontaBtn.disabled === false && registro.selAnalizzaBtn.disabled === true &&
        riga.classList.contains('selezionata'));
    esegui('toggleSelezione("media_alz.scr", true)');
    check('due righe: anche Analizza', registro.selAnalizzaBtn.disabled === false && /2 misure selezionate: nuova_alz\.scr, media_alz\.scr/.test(registro.selTesto.textContent));
    check('...e le caselle restano spuntate quando la tabella si ridisegna',
        (registro.recentsWrap.innerHTML.match(/data-act="sel" data-name="[^"]+" checked/g) || []).length === 2);
    navigato.href = '';
    esegui('confrontaSelezionate()');
    check('Confronta i selezionati -> Confronto con quelle misure', navigato.href === esegui('urlConfronto(["nuova_alz.scr", "media_alz.scr"])'), navigato.href);
    dialoghi.length = 0; scelte = ['b']; navigato.href = '';
    await esegui('analizzaSelezionate()');
    var dA = dialoghi[0] && dialoghi[0].opts;
    check('Analizza chiede quale delle due e l aspirazione (finestra della pagina)', !!dA && /aspirazione/.test(dA.titolo) &&
        dA.pulsanti.length === 3 && /nuova_alz\.scr/.test(dA.pulsanti[0].testo) && /media_alz\.scr/.test(dA.pulsanti[1].testo));
    check('...nessuna delle due e gia scelta: Invio cade su Annulla', dA && dA.pulsanti.every(function (p) { return p.stile === 'secondary'; }) && dA.pulsanti[2].annulla === true);
    check('...scelta la seconda: aspirazione = seconda, scarico = prima', navigato.href === esegui('urlAnalisi("media_alz.scr", "nuova_alz.scr")'), navigato.href);
    scelte = [null]; navigato.href = '';
    await esegui('analizzaSelezionate()');
    check('...Annulla resta in Home', navigato.href === '');
    ['a', 'b', 'c'].forEach(function (n) { esegui('toggleSelezione("' + n + '_alz.scr", true)'); });
    check('cinque selezionate: Confronta si spegne e la barra dice perche',
        registro.selConfrontaBtn.disabled === true && /al massimo 4/.test(registro.selNota.textContent));
    check('...e non si parte', esegui('confrontaSelezionate()') === null);
    await esegui('loadRecents()');
    check('ricaricato l archivio, le selezioni di misure che non ci sono piu cadono', esegui('_selezionate.join()') === 'nuova_alz.scr,media_alz.scr');
    esegui('deselezionaTutte()');
    check('"Togli la selezione" nasconde la barra', registro.barraSelezione.hidden === true);

    // preferiti: con piu' di 4 chiede invece di un avviso che spariva cambiando pagina
    var seiPreferite = [];
    for (var q = 0; q < 6; q++) seiPreferite.push(misura('pref' + q + '_alz.scr', q + 1));
    risposte['/api/files'] = function () { return { body: { files: seiPreferite } }; };
    await esegui('loadRecents()');
    memoria['cammes-bookmarks-v1'] = JSON.stringify(seiPreferite.map(function (f) { return f.name; }));
    dialoghi.length = 0; scelte = [true]; navigato.href = '';
    await esegui('openBookmarksInCompare()');
    check('Confronta preferiti con 6 preferiti: chiede, poi apre le 4 piu recenti',
        dialoghi.length === 1 && navigato.href === esegui('urlConfronto(["pref0_alz.scr", "pref1_alz.scr", "pref2_alz.scr", "pref3_alz.scr"])'), navigato.href);
    memoria['cammes-bookmarks-v1'] = JSON.stringify(['pref4_alz.scr', 'pref1_alz.scr']);
    dialoghi.length = 0; navigato.href = '';
    await esegui('openBookmarksInCompare()');
    check('...con 2 preferiti parte subito, senza domande', dialoghi.length === 0 && navigato.href === esegui('urlConfronto(["pref1_alz.scr", "pref4_alz.scr"])'));

    // -----------------------------------------------------------
    console.log('');
    console.log('--- vista rapida: parole e numeri da officina, invio ad Analisi ---');
    var testoFile = '_pline\n1,0.1\n160,9.61\n300,0.2\n#data=2026-11-14T10:30:00.000Z\n';
    esegui('_renderQuickView("albero12_asp_alz.scr", "alz", ' + JSON.stringify(testoFile) + ')');
    var qv = registro.quickviewBody.innerHTML;
    check('"Punti misurati", "Alzata massima", "Posizione del picco sul banco" (non e la fasatura)',
        /Punti misurati/.test(qv) && /Alzata massima/.test(qv) && /Posizione del picco sul banco/.test(qv) && /non &egrave; la fasatura/.test(qv));
    check('...con la virgola e il simbolo dei gradi', />9,610 mm</.test(qv) && />160&deg;</.test(qv));
    check('niente piu "N. punti", "Max alzata", "Grado picco"', !/N\. punti|Max alzata|Grado picco/.test(qv));
    check('"Apri in": Analisi come aspirazione o come scarico',
        /<span class="qv-apri">Apri in<\/span>/.test(qv) &&
        /href="analisi\.html\?asp=albero12_asp_alz\.scr"[^>]*>Analisi: aspirazione</.test(qv) &&
        /href="analisi\.html\?sca=albero12_asp_alz\.scr"[^>]*>Analisi: scarico</.test(qv));
    check('...e Confronto', /href="grafici\.html\?files=albero12_asp_alz\.scr"[^>]*>Confronto</.test(qv));
    var etichetteApri = (qv.match(/class="btn btn-accent" href="[^"]*" title="[^"]*">([^<]*)</g) || [])
        .map(function (x) { return />([^<]*)<$/.exec(x)[1]; });
    check('...etichette corte, per stare su una riga sola (prima la riga andava a capo)',
        etichetteApri.length === 3 && etichetteApri.every(function (t) { return t.length <= 20; }), etichetteApri.join(' | '));
    check('i comandi stanno in un piede che resta in fondo alla finestra: Scheda PDF e Chiudi sempre in vista',
        /<div class="quickview-piede">[\s\S]*id="qvPdfBtn"[\s\S]*onclick="closeQuickView\(\);">Chiudi<\/button><\/div><\/div>$/.test(qv) &&
        /\.quickview-piede \{[^}]*position: sticky;[^}]*bottom: calc\(-1 \* var\(--sp-5\)\);[^}]*background: var\(--bg-elev-2\)/.test(HOME));
    check('...e il grafico si accorcia sugli schermi bassi (prima 320 px fissi)',
        /\.quickview-chart-wrap \{[^}]*height: clamp\(200px, 34vh, 320px\)/.test(HOME));
    check('il grafico scrive i numeri all italiana', sandbox._grafico && sandbox._grafico.options.locale === 'it-IT');
    check('mezzi gradi (modalita Race) con un decimale, non arrotondati', esegui('testoGradi(160.5)') === '160,5&deg;' && esegui('testoGradi(160)') === '160&deg;');
    esegui('_renderQuickView("vecchio_pol.scr", "pol", "1,0\\n0,1\\n")');
    var qvPol = registro.quickviewBody.innerHTML;
    check('un vecchio file polare non si manda ne ad Analisi ne a Confronto (li leggerebbero come alzate)',
        !/analisi\.html|grafici\.html|qv-apri/.test(qvPol) && /id="qvPdfBtn"/.test(qvPol));
    // Esc: una finestra della pagina aperta sopra non chiude anche la vista rapida
    esegui('closeQuickView = function () { window.__chiusa = (window.__chiusa || 0) + 1; }');
    esegui('_qvEscClose({ key: "Escape", defaultPrevented: true })');
    check('un Esc gia usato dalla finestra dei tag non chiude la vista rapida', !sandbox.__chiusa);
    esegui('_qvEscClose({ key: "Escape", defaultPrevented: false })');
    check('...un Esc normale si', sandbox.__chiusa === 1);

    // -----------------------------------------------------------
    console.log('');
    console.log('--- Scheda PDF della singola misura ---');
    var testi = [];
    sandbox.jspdf = { jsPDF: function () {
        var d = { internal: { pageSize: { getWidth: function () { return 210; }, getHeight: function () { return 297; } } } };
        ['setFillColor', 'rect', 'setFont', 'setFontSize', 'setTextColor', 'roundedRect', 'setDrawColor',
         'setLineWidth', 'line', 'addImage'].forEach(function (k2) { d[k2] = function () {}; });
        d.text = function (t) { testi.push(Array.isArray(t) ? t.join(' ') : String(t)); };
        d.getTextWidth = function (t) { return String(t).length * 1.5; };
        d.save = function () {};
        return d;
    } };
    // la scheda stampa i dati della misura aperta nella vista rapida
    esegui('_renderQuickView("albero12_asp_alz.scr", "alz", ' + JSON.stringify(testoFile) + ')');
    esegui('_quickViewChart = { data: { datasets: [{ data: [0.1, 9.61, 0.2] }], labels: [1, 160, 300] }, options: {}, ' +
           'canvas: { width: 700, height: 400 }, update: function () {}, draw: function () {} }');
    esegui('exportSinglePDF("albero12_asp_alz.scr", "alz")');
    var foglio = testi.join(' | ');
    check('"Alzata massima" con la virgola (9,610 mm)', testi.indexOf('ALZATA MASSIMA') >= 0 && testi.indexOf('9,610 mm') >= 0, foglio.slice(0, 200));
    check('"Punti misurati"', testi.indexOf('PUNTI MISURATI') >= 0);
    check('"Posizione del picco sul banco (non e la fasatura)", in gradi col simbolo',
        testi.indexOf('POSIZIONE DEL PICCO SUL BANCO') >= 0 && testi.indexOf('(non è la fasatura)') >= 0 && testi.indexOf('160°') >= 0);
    check('il titolo del grafico in gradi, senza "deg" ne "cartesiano"',
        testi.indexOf('Profilo di alzata, 360°') >= 0 && !/\bdeg\b|cartesian/i.test(foglio));
    check('restano "Misura del" e "Stampata il"',
        testi.some(function (t) { return /^Misura del /.test(t); }) && testi.some(function (t) { return /^Stampata il /.test(t); }));
    check('testata e piede con lo stesso nome, "Scheda tecnica della singola misura" (non "Scheda tecnica camma", che e la Scheda camma di Analisi)',
        testi.indexOf('Scheda tecnica della singola misura') >= 0 && testi.indexOf('CAMMES - Scheda tecnica della singola misura') >= 0 &&
        !/Scheda tecnica camma/.test(foglio));

    // -----------------------------------------------------------
    console.log('');
    console.log('--- Svuota archivio: due finestre della pagina che dicono il vero ---');
    risposte['/api/files'] = function () { return { body: { files: [misura('uno_alz.scr', 1), misura('due_alz.scr', 2)] } }; };
    risposte['/api/file/'] = function () { return { body: { ok: true, trashed: true } }; };
    risposte['/api/trash'] = function () { return { body: { files: [] } }; };
    function cancellazioni() { return chiamate.filter(function (c) { return c.metodo === 'DELETE'; }).length; }
    chiamate.length = 0; dialoghi.length = 0; scelte = [false];
    await esegui('clearArchive()');
    check('alla prima finestra Annulla: nessuna misura toccata', dialoghi.length === 1 && cancellazioni() === 0);
    check('...la finestra dice CESTINO e 30 giorni, e che tag e preferiti si perdono',
        /CESTINO/.test(dialoghi[0].testo) && /30 giorni/.test(dialoghi[0].testo) && /tag e i preferiti/.test(dialoghi[0].testo) && dialoghi[0].pericoloso === true);
    chiamate.length = 0; dialoghi.length = 0; scelte = [true, false];
    await esegui('clearArchive()');
    check('alla seconda Annulla: nessuna misura toccata', dialoghi.length === 2 && cancellazioni() === 0);
    chiamate.length = 0; dialoghi.length = 0; scelte = [true, true]; toasts.length = 0;
    await esegui('clearArchive()');
    var ultimo = toasts[toasts.length - 1] || {};
    check('confermate entrambe: tutte nel cestino, e la notifica lo dice', cancellazioni() === 2 && /spostati nel cestino/.test(ultimo.body || ''), ultimo.body);

    // -----------------------------------------------------------
    console.log('');
    console.log('--- riga di stato: verifica banco, Arduino, programma ---');
    var mai = esegui('testoVerificaBanco(undefined, Date.now())');
    check('verifica banco mai fatta: in testo normale (e uno stato, non un guasto) e dice dove farla',
        /mai fatta/.test(mai.html) && /text-primary/.test(mai.colore) && /href="alzata\.html"/.test(mai.html) && /Avanzate/.test(mai.html));
    var no = esegui('testoVerificaBanco({ date: new Date().toISOString(), rms: 0.0321, max: 0.0957, pass: false }, Date.now())');
    check('verifica NON superata: rossa e con il posto dove rifarla', /NON SUPERATA/.test(no.html) && /danger/.test(no.colore) && /Avanzate/.test(no.html));
    var ard = function (d, att) { return esegui('testoStatoArduino(' + JSON.stringify(d) + ', ' + !!att + ')'); };
    var aDemo = ard({ serialModule: false }), aNo = ard({ serialModule: true, serialConnected: false });
    var aVecchio = ard({ serialModule: true, serialConnected: true, port: 'COM3', deviceFirmware: '4.0', bundled: { firmware: '4.1' } });
    var aOk = ard({ serialModule: true, serialConnected: true, port: 'COM3', deviceFirmware: '4.1', bundled: { firmware: '4.1' } });
    var aAttesa = ard({ serialModule: true, serialConnected: true, port: 'COM3' }, true);
    check('Arduino: modalita demo in rosso', /modalit&agrave; demo/.test(aDemo.html) && /danger/.test(aDemo.colore));
    check('Arduino non collegato: lo dice e dice che cosa fare', /non collegato/.test(aNo.html) && /cavo USB/.test(aNo.html));
    check('firmware diverso da quello incluso: "da aggiornare", in arancio', /da aggiornare alla v4\.1/.test(aVecchio.html) && /warning/.test(aVecchio.colore));
    check('firmware uguale: aggiornato, in verde', /firmware v4\.1 \(aggiornato\)/.test(aOk.html) && /success/.test(aOk.colore));
    check('appena collegato: "in attesa di risposta", non "non risponde"', /in attesa/.test(aAttesa.html) && !/non risponde/.test(aAttesa.html));
    check('non collegato: "Ricontrolla" rilegge con un clic (prima prometteva "il programma lo trova da solo" e la riga non cambiava piu)',
        /onclick="ricontrollaArduino\(\); return false;">Ricontrolla<\/a>/.test(aNo.html) && !/lo trova da solo/.test(aNo.html));
    var aMuto = ard({ serialModule: true, serialConnected: true, port: 'COM3', bundled: { firmware: '4.1' } });
    check('collegato ma il firmware non risponde: che cosa fare, "Ricontrolla" e la Diagnostica per l assistenza',
        /non risponde/.test(aMuto.html) && /Aggiorna firmware Arduino/.test(aMuto.html) && /ricontrollaArduino\(\)/.test(aMuto.html) &&
        /href="\/api\/diagnostics">Diagnostica<\/a>/.test(aMuto.html));
    check('modalita demo: anche li la Diagnostica', /href="\/api\/diagnostics">Diagnostica<\/a>/.test(aDemo.html));
    check('stato non disponibile (il programma non risponde): "Ricontrolla"', /ricontrollaArduino\(\)/.test(esegui('testoStatoArduino(null)').html));
    var aScrive = ard({ serialModule: true, serialConnected: false, port: 'COM3', flashInProgress: true });
    check('durante la scrittura del firmware lo dice e avverte di non scollegare il cavo (non "non collegato")',
        /Aggiornamento del firmware in corso/.test(aScrive.html) && /non scollegare il cavo USB/.test(aScrive.html) && !/non collegato/.test(aScrive.html));
    var aRiapre = ard({ serialModule: true, serialConnected: false, port: 'COM3' }, true);
    check('dopo la scrittura, mentre il programma riapre la porta: "in attesa che si ricolleghi"',
        /in attesa che si ricolleghi/.test(aRiapre.html) && !/non collegato/.test(aRiapre.html));
    var prog = function (d) { return esegui('testoStatoProgramma(' + JSON.stringify(d) + ', "v3.7.1")'); };
    var pNuova = prog({ current: '3.7.1', latest: '3.8.0', updateAvailable: true });
    check('programma: c e una versione nuova -> "come aggiornare" apre Sistema e manutenzione',
        /Nuova versione <b>v3\.8\.0<\/b>/.test(pNuova.html) && /onclick="apriSistema\(\); return false;">come aggiornare/.test(pNuova.html));
    check('...aggiornato in verde; senza internet lo dice', /aggiornato \(v3\.7\.1\)/.test(prog({ current: '3.7.1', latest: '3.7.1' }).html) &&
        /serve internet/.test(prog({ error: 'timeout', current: '3.7.1' }).html));
    var pMuto = prog({ nonRisponde: true });
    check('...se invece non risponde il programma lo dice (non "serve internet")',
        /controllo non riuscito: il programma non risponde/.test(pMuto.html) && !/serve internet/.test(pMuto.html) && /warning/.test(pMuto.colore), pMuto.html);

    risposte['/api/update-check'] = function () {
        return { body: { current: '3.7.1', latest: '3.8.0', updateAvailable: true, downloadUrl: 'https://example.invalid/cammes.exe',
                         downloadName: 'cammes.exe', downloadSizeMB: 45.3, downloadSha256: 'ab'.repeat(32) } };
    };
    toasts.length = 0;
    await esegui('checkUpdatesNow(true)');
    check('all apertura della pagina il controllo e silenzioso (niente notifica), ma la riga di stato lo dice',
        toasts.length === 0 && /Nuova versione/.test(registro.statoProgramma.innerHTML));
    check('il collegamento per scaricare ha il peso con la virgola', /\(45,3 MB\)/.test(registro.updDownloadLink.textContent), registro.updDownloadLink.textContent);
    check('l impronta SHA-256 resta, in piccolo', registro.updSha.style.display === '' && /SHA-256/.test(registro.updSha.innerHTML) && /certutil/.test(registro.updSha.innerHTML));
    await esegui('checkUpdatesNow()');
    check('premuto "Controlla aggiornamenti": anche la notifica', toasts.length === 1 && /tre passi/.test(toasts[0].body || ''));
    var rispostaAggiornamenti = risposte['/api/update-check'];
    delete risposte['/api/update-check'];   // il programma non risponde
    await esegui('checkUpdatesNow(true)');
    check('programma che non risponde: la riga in cima e la sezione Programma dicono la stessa causa',
        /il programma non risponde/.test(registro.statoProgramma.innerHTML) && !/serve internet/.test(registro.statoProgramma.innerHTML) &&
        /il programma non risponde/.test(registro.updSwStatus.innerHTML), registro.statoProgramma.innerHTML);
    risposte['/api/update-check'] = rispostaAggiornamenti;

    risposte['/api/firmware-info'] = function () {
        return { body: { serialModule: true, serialConnected: true, port: 'COM3', deviceFirmware: '4.0', bundled: { firmware: '4.1', builtAt: '2026-11-20' } } };
    };
    await esegui('initUpdatesCard(0)');
    check('riga Firmware: diversa da quella inclusa in arancio, pulsante attivo',
        /warning/.test(registro.fwDevice.style.color) && registro.fwFlashBtn.disabled === false && /da aggiornare/.test(registro.statoArduino.innerHTML));
    check('...e il pulsante porta le due versioni, in evidenza',
        /Aggiorna firmware Arduino: v4\.0 &rarr; v4\.1/.test(registro.fwFlashBtn.innerHTML) && registro.fwFlashBtn.classList.contains('in-evidenza'),
        registro.fwFlashBtn.innerHTML);
    risposte['/api/firmware-info'] = function () {
        return { body: { serialModule: true, serialConnected: true, port: 'COM3', deviceFirmware: '4.1', bundled: { firmware: '4.1', builtAt: '2026-11-20' } } };
    };
    await esegui('initUpdatesCard(0)');
    check('firmware gia alla versione inclusa: "v4.1 (aggiornato)" e un "Riscrivi" senza risalto, ancora attivo',
        registro.fwDevice.textContent === 'v4.1 (aggiornato)' && /Riscrivi il firmware/.test(registro.fwFlashBtn.innerHTML) &&
        !registro.fwFlashBtn.classList.contains('in-evidenza') && registro.fwFlashBtn.disabled === false, registro.fwDevice.textContent);
    dialoghi.length = 0; scelte = [false];
    await esegui('flashFirmware()');
    check('...e la domanda dice che riscriverlo serve solo se il banco non risponde come dovrebbe',
        dialoghi.length === 1 && /^Riscrivere/.test(dialoghi[0].titolo) && /gi&agrave; la versione inclusa/.test(dialoghi[0].testo) &&
        dialoghi[0].testoSi === 'Riscrivi il firmware');
    var pfMuto = esegui('pulsanteFirmware(' + JSON.stringify({ serialConnected: true, port: 'COM3', bundled: { firmware: '4.1' } }) + ', false)');
    check('scheda collegata che non risponde: pulsante attivo e in evidenza (serve proprio a riprogrammarla)',
        pfMuto.attivo === true && pfMuto.evidenza === true && /Aggiorna firmware Arduino/.test(pfMuto.testo));
    risposte['/api/firmware-info'] = function () { return { body: { serialModule: true, serialConnected: false, port: null, bundled: { firmware: '4.1' } } }; };
    timers.length = 0;
    await esegui('initUpdatesCard(0)');
    check('Arduino mai trovato (nessuna porta): pulsante spento; la riga non riprova da sola ma offre "Ricontrolla"',
        registro.fwFlashBtn.disabled === true && timers.length === 0 && /ricontrollaArduino\(\)/.test(registro.statoArduino.innerHTML));
    risposte['/api/firmware-info'] = function () {
        return { body: { serialModule: true, serialConnected: false, port: 'COM3', flashInProgress: true, bundled: { firmware: '4.1' } } };
    };
    await esegui('initUpdatesCard(0)');
    check('scrittura in corso (per esempio pagina riaperta): pulsante spento e la riga si rilegge da sola',
        registro.fwFlashBtn.disabled === true && timers.some(function (t) { return t.ms === 3000; }) &&
        /Aggiornamento del firmware in corso/.test(registro.statoArduino.innerHTML));
    timers.length = 0;
    risposte['/api/firmware-info'] = function () { return { body: { serialModule: true, serialConnected: true, port: 'COM3', bundled: { firmware: '4.1' } } }; };
    await esegui('initUpdatesCard(0)');
    check('collegato ma senza risposta: riprova fra qualche secondo (prima l evento di avvio lo impediva)',
        timers.some(function (t) { return t.ms === 4000; }));

    chiamate.length = 0; dialoghi.length = 0; scelte = [false];
    await esegui('flashFirmware()');
    check('Aggiorna firmware chiede in una finestra della pagina; con Annulla non scrive niente',
        dialoghi.length === 1 && /cavo USB/.test(dialoghi[0].testo) && !chiamate.some(function (c) { return /flash-firmware/.test(c.url); }));
    risposte['/api/flash-firmware'] = function () { return { body: { ok: true, exitCode: 0, durationMs: 15230, port: 'COM3', tool: 'fw' } }; };
    scelte = [true]; timers.length = 0;
    await esegui('flashFirmware()');
    check('...confermato scrive, e dice il tempo con la virgola', /in 15,2 s su COM3/.test(registro.fwFlashStatus.textContent), registro.fwFlashStatus.textContent);

    // dopo la scrittura il programma chiude la porta e la riapre circa 2 s
    // dopo la fine: la riga dell'Arduino deve arrivare da sola alla versione nuova
    var letture = function () { return chiamate.filter(function (c) { return c.url === '/api/firmware-info'; }).length; };
    var prossimo = timers.filter(function (t) { return t.ms === 3000; })[0];
    check('...poi rilegge la versione sulla scheda dopo 3 s', !!prossimo);
    risposte['/api/firmware-info'] = function () { return { body: { serialModule: true, serialConnected: false, port: 'COM3', bundled: { firmware: '4.1' } } }; };
    chiamate.length = 0;
    var giri = 0;
    while (prossimo && giri < 10) {
        timers.length = 0;
        prossimo.f(); await pausa();
        giri++;
        if (giri === 1) {
            check('...con la porta ancora chiusa la riga aspetta e riprova (prima diceva "non collegato" e si fermava)',
                /in attesa che si ricolleghi/.test(registro.statoArduino.innerHTML) && timers.some(function (t) { return t.ms === 3000; }),
                registro.statoArduino.innerHTML);
        }
        prossimo = timers.filter(function (t) { return t.ms === 3000; })[0];
    }
    check('...ma non di continuo: al massimo 6 letture, poi "non collegato" con "Ricontrolla"',
        letture() === 6 && /non collegato/.test(registro.statoArduino.innerHTML) && /ricontrollaArduino\(\)/.test(registro.statoArduino.innerHTML),
        letture() + ' letture');
    risposte['/api/firmware-info'] = function () {
        return { body: { serialModule: true, serialConnected: true, port: 'COM3', deviceFirmware: '4.1', bundled: { firmware: '4.1', builtAt: '2026-11-20' } } };
    };
    chiamate.length = 0; timers.length = 0;
    await esegui('ricontrollaArduino()');
    check('"Ricontrolla": una lettura sola, e la riga torna giusta (collegato, firmware aggiornato)',
        letture() === 1 && timers.length === 0 && /firmware v4\.1 \(aggiornato\)/.test(registro.statoArduino.innerHTML) &&
        /Riscrivi il firmware/.test(registro.fwFlashBtn.innerHTML), registro.statoArduino.innerHTML);
    risposte['/api/firmware-info'] = function () { return { body: { serialModule: true, serialConnected: false, port: 'COM3', bundled: { firmware: '4.1' } } }; };
    timers.length = 0;
    await esegui('initUpdatesCard(0, true)');
    var vecchioGiro = timers.filter(function (t) { return t.ms === 3000; })[0];
    await esegui('ricontrollaArduino()');
    chiamate.length = 0;
    if (vecchioGiro) { vecchioGiro.f(); await pausa(); }
    check('un controllo nuovo ("Ricontrolla") ferma le riprove di quello vecchio', !!vecchioGiro && letture() === 0);

    // scrittura partita e non riuscita (risposta vera del programma: exitCode, niente error)
    risposte['/api/flash-firmware'] = function () {
        return { status: 500, body: { ok: false, exitCode: 1, durationMs: 9000, port: 'COM3', tool: 'fw', output: 'programmer is not responding' } };
    };
    scelte = [true]; toasts.length = 0; timers.length = 0;
    await esegui('flashFirmware()');
    check('...se la scrittura non riesce: "controlla il cavo USB", col codice in piccolo per l assistenza',
        toasts.length === 1 && toasts[0].title === 'Aggiornamento della scheda non riuscito' && /cavo USB/.test(toasts[0].body) &&
        /<small>[^<]*codice 1/.test(toasts[0].body) && /cavo USB/.test(registro.fwFlashStatus.textContent) && registro.fwFlashStatus.title === 'codice 1',
        toasts[0] && toasts[0].body);
    check('...e poi rilegge porta e scheda', timers.some(function (t) { return t.ms === 3000; }));
    // rifiuti del programma: la scrittura non e' nemmeno partita
    function rifiuto(testo) { return function () { return { status: 409, body: { error: testo } }; }; }
    var rifiuti = [
        ['Run v4 in corso (scan via bridge): attendi il termine e riprova', /^C'è una misura in corso: attendi la fine e riprova/],
        ['Flash già in corso', /^C'è già un aggiornamento del firmware in corso/],
        ['Firmware non incluso in questa build (manca fw/master.ino.hex)', /^Il programma non riesce a preparare l'aggiornamento: scarica la Diagnostica/],
        ['avrdude non trovato (né in fw/ né in Arduino15)', /^Il programma non riesce a preparare/],
        ['Estrazione firmware fallita: EPERM', /^Il programma non riesce a preparare/],
        ['Scansione in corso: attendi la fine del giro (o annullala) e riprova', /^Scansione in corso: attendi la fine del giro/],
        ['Nessuna porta Arduino nota: collega l\'Arduino e riprova', /^Nessuna porta Arduino nota/],
        ['Qualcosa di nuovo', /^Aggiornamento non avviato: riprova/]
    ];
    for (var ri = 0; ri < rifiuti.length; ri++) {
        risposte['/api/flash-firmware'] = rifiuto(rifiuti[ri][0]);
        scelte = [true]; toasts.length = 0; timers.length = 0;
        await esegui('flashFirmware()');
        var rigaFw = registro.fwFlashStatus.textContent.replace(/^✗ /, '');
        var giaItaliano = /^(Scansione|Nessuna)/.test(rifiuti[ri][0]);
        check('rifiuto "' + rifiuti[ri][0].slice(0, 30) + '": il motivo e la frase principale, senza "cavo USB" ne gergo sulla riga',
            toasts.length === 1 && toasts[0].title === 'Aggiornamento della scheda non avviato' && rifiuti[ri][1].test(rigaFw) &&
            !/cavo USB/.test(toasts[0].body) && !/Run v4|bridge|build|avrdude|\.hex|Flash/.test(rigaFw) &&
            registro.fwFlashStatus.title === (giaItaliano ? '' : rifiuti[ri][0]) && !timers.some(function (t) { return t.ms === 3000; }), rigaFw);
    }

    var diag = 'CAMMES — diagnostica 2026-11-22T08:00:00Z\r\nversione software: 3.7.1\r\ncartella archivio: C:\\CAMMES\\prove\r\n\r\n=== CODA ===\r\n';
    check('la cartella delle misure si legge dalla Diagnostica', esegui('cartellaDaDiagnostica(' + JSON.stringify(diag) + ')') === 'C:\\CAMMES\\prove');
    risposte['/api/diagnostics'] = function () { return { body: diag }; };
    await esegui('caricaCartellaArchivio()');
    check('...e si scrive in Sistema e manutenzione', registro.cartellaArchivioPercorso.textContent === 'C:\\CAMMES\\prove');

    // -----------------------------------------------------------
    console.log('');
    console.log('--- pannelli chiusi, aperti a richiesta, ricordati ---');
    memoria['cammes-home-pannelli-v1'] = JSON.stringify({ updatesCard: true });
    registro.updatesCard._ev = {}; registro.activityCard._ev = {};
    esegui('initPannelli()');
    check('aperto l ultima volta: si riapre aperto', registro.updatesCard.open === true && registro.activityCard.open === false);
    registro.updatesCard.open = false;
    (registro.updatesCard._ev.toggle || []).forEach(function (f) { f({}); });
    check('chiuso a mano: lo ricorda', JSON.parse(memoria['cammes-home-pannelli-v1']).updatesCard === false);
    var vecchioGet = localStorageFinto.getItem;
    localStorageFinto.getItem = function () { throw new Error('bloccato'); };
    var ok = true;
    try { registro.updatesCard._ev = {}; registro.updatesCard.open = false; esegui('initPannelli()'); } catch (e) { ok = false; }
    localStorageFinto.getItem = vecchioGet;
    check('se il browser blocca la memoria la pagina va lo stesso (pannelli chiusi)', ok && registro.updatesCard.open === false);

    // -----------------------------------------------------------
    console.log('');
    console.log('--- etichette: ripristino con conferma, e anche sul programma ---');
    sandbox.FileReader = function () {};
    sandbox.FileReader.prototype.readAsText = function (f) { this.onload({ target: { result: f._testo } }); };
    esegui('scheduleMetaSync = function () { window.__sync = (window.__sync || 0) + 1; }');
    var etichette = { cammes_backup_version: 1, tags: { 'z_alz.scr': ['ripristinato'] }, bookmarks: ['z_alz.scr'], savedPositions: [] };
    sandbox._evFile = { target: { files: [{ _testo: JSON.stringify(etichette) }], value: 'c:/x.json' } };
    dialoghi.length = 0; scelte = [true];
    esegui('importMetadataFile(_evFile)');
    await pausa();
    check('Ripristina etichette chiede in una finestra della pagina', dialoghi.length === 1 && dialoghi[0].tipo === 'conferma' && /1<\/b> misure con tag/.test(dialoghi[0].testo));
    check('...e i tag ripristinati vanno anche sul programma (prima restavano in questo browser)',
        sandbox.__sync === 1 && /ripristinato/.test(memoria['cammes-tags-v1'] || ''));
    sandbox._evFile = { target: { files: [{ _testo: 'non json' }], value: 'c:/y.txt' } };
    toasts.length = 0;
    esegui('importMetadataFile(_evFile)');
    check('un file sbagliato: messaggio in italiano, niente errori del browser',
        toasts.length === 1 && toasts[0].title === 'File non valido' && !/Unexpected|JSON\.parse/.test(toasts[0].body));

    // -----------------------------------------------------------
    console.log('');
    console.log('--- numeri con la virgola ---');
    check('peso del file: 8,2 KB', esegui('fmtBytes(8396)') === '8,2 KB');
    check('date relative in parole', esegui('fmtDate(Date.now() - 3 * 3600000)') === '3 ore fa' && esegui('fmtDate(Date.now() - 86400000 - 60000)') === '1 giorno fa');

    // -----------------------------------------------------------
    console.log('');
    console.log('--- cestino: in Sistema e manutenzione, col numero, e "Apri il cestino" dopo un eliminazione ---');
    var cestino = [
        { trashName: '2026-11-14T09-32-00__uno_alz.scr', original: 'uno_alz.scr', deletedAt: '2026-11-14 09:32:00', size: 10 },
        { trashName: '2026-11-13T08-00-00__due_alz.scr', original: 'due_alz.scr', deletedAt: '2026-11-13 08:00:00', size: 10 }
    ];
    risposte['/api/trash'] = function () { return { body: { files: cestino } }; };
    check('la data di eliminazione (ora UTC del programma) si legge nell ora di questo PC',
        esegui('dataCestino("2026-11-14 09:32:00")') === new Date(Date.UTC(2026, 10, 14, 9, 32, 0)).toLocaleString('it-IT'),
        esegui('dataCestino("2026-11-14 09:32:00")'));
    registro.trashArea.children = [];
    await esegui('aggiornaConteggioCestino()');
    check('il numero sul pulsante: "Cestino (2)"', /Cestino \(2\)$/.test(registro.trashBtn.innerHTML), registro.trashBtn.innerHTML);
    await esegui('toggleTrash()');
    var scatola = cercaPerId('trashBox');
    check('l elenco si apre sotto il suo pulsante, dentro Sistema e manutenzione (#trashArea)',
        !!scatola && scatola.parentNode === registro.trashArea);
    var righeCestino = scatola ? scatola.children.filter(function (c) { return c.className === 'cestino-riga'; }) : [];
    check('...con le misure, quando sono state eliminate e "Ripristina tutte"',
        righeCestino.length === 2 && /^eliminata il /.test(righeCestino[0].children[1].textContent) &&
        scatola.children.some(function (c) { return /Ripristina tutte \(2\)/.test(c.innerHTML || ''); }));
    cestino.push({ trashName: '2026-11-15T10-00-00__tre_alz.scr', original: 'tre_alz.scr', deletedAt: '2026-11-15 10:00:00', size: 10 });
    await esegui('aggiornaConteggioCestino()');
    scatola = cercaPerId('trashBox');
    check('cestino aperto e una misura eliminata: elenco e pulsante dicono lo stesso numero (prima l elenco restava indietro)',
        !!scatola && /Cestino \(3\)/.test(scatola.innerHTML) && /Cestino \(3\)$/.test(registro.trashBtn.innerHTML) &&
        registro.trashArea.children.filter(function (c) { return c.id === 'trashBox'; }).length === 1);
    await esegui('toggleTrash()');
    check('...e premuto di nuovo il pulsante si chiude', !cercaPerId('trashBox'));
    var ripristini = function () { return chiamate.filter(function (c) { return /\/api\/trash\/restore/.test(c.url); }).length; };
    chiamate.length = 0; dialoghi.length = 0; scelte = [false];
    sandbox._cestino = cestino;
    await esegui('ripristinaTutte(_cestino)');
    check('"Ripristina tutte" chiede conferma; con Annulla non rimette niente', dialoghi.length === 1 && dialoghi[0].tipo === 'conferma' && ripristini() === 0);
    risposte['/api/trash/restore'] = function () { return { body: { ok: true, restored: 'x_alz.scr' } }; };
    scelte = [true]; toasts.length = 0;
    await esegui('ripristinaTutte(_cestino)');
    var tRip = toasts[toasts.length - 1] || {};
    check('...confermato le rimette tutte e lo dice', ripristini() === 3 && /^3 tornate nell'archivio/.test(tRip.body || ''), tRip.body);
    risposte['/api/file/'] = function () { return { body: { ok: true, trashed: true } }; };
    toasts.length = 0;
    esegui('doDelete("nuova_alz.scr")');
    await pausa();
    var tDel = toasts.filter(function (t) { return t.title === 'Misura spostata nel cestino'; })[0] || {};
    check('dopo un eliminazione la notifica dice "recuperabile per 30 giorni" e porta al cestino con un clic',
        /recuperabile per 30 giorni/.test(tDel.body || '') && /onclick="window\.apriCestino && apriCestino\(\);">Apri il cestino<\/a>/.test(tDel.body || ''), tDel.body);
    registro.updatesCard.open = false;
    await esegui('apriCestino()');
    check('"Apri il cestino" apre Sistema e manutenzione e l elenco', registro.updatesCard.open === true && !!cercaPerId('trashBox'));

    // -----------------------------------------------------------
    console.log('');
    console.log('--- finestre una sopra l altra: Esc, e il compositore del Concerto ---');
    esegui('closeConfirm = function () { window.__confChiusa = (window.__confChiusa || 0) + 1; };' +
           'closeHomeConcert = function () { window.__concChiuso = (window.__concChiuso || 0) + 1; };');
    esegui('escCloseConfirm({ key: "Escape", defaultPrevented: true }); _concertEsc({ key: "Escape", defaultPrevented: true });');
    check('un Esc gia usato da una finestra della pagina non chiude anche la finestra di eliminazione ne il Concerto',
        !sandbox.__confChiusa && !sandbox.__concChiuso);
    esegui('escCloseConfirm({ key: "Escape", defaultPrevented: false }); _concertEsc({ key: "Escape", defaultPrevented: false });');
    check('...un Esc normale si', sandbox.__confChiusa === 1 && sandbox.__concChiuso === 1);
    dialoghi.length = 0; scelte = [null]; toasts.length = 0;
    await esegui('playHomeSong("custom")');
    check('"Scrivi tu" chiede le note in una finestra della pagina; con Annulla non suona niente',
        dialoghi.length === 1 && dialoghi[0].tipo === 'chiedi' && toasts.length === 0 && !memoria['cammes-concert-custom']);
    scelte = ['C4 E4:2 G4'];
    await esegui('playHomeSong("custom")');
    check('...le note scritte si ricordano, e senza collegamento col banco lo dice',
        memoria['cammes-concert-custom'] === 'C4 E4:2 G4' && toasts.length === 1 && toasts[0].title === 'Banco non collegato');

    console.log('');
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: la Home parte dallo stato del banco e dall archivio; Confronto e Analisi');
    console.log('si aprono dalle misure scelte; finestre, parole e numeri da officina.');
    process.exit(0);
})().catch(function (e) {
    console.log('  FAIL  il test si e fermato: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    process.exit(1);
});
