// =============================================================
//  test_usabilita_documenti.js — il manuale usa le parole dello schermo
// =============================================================
//  Analisi di usabilita' del 2026-11-21 (ANALISI_USABILITA_2026-11-21.md),
//  applicata nella v3.8.0: le pagine hanno cambiato nomi e disposizione
//  (Ricomincia, Azzera angolo qui, Salva misura, Memorizza posizione, Verso
//  di scansione, barra dei comandi e riga Esito, selezione dall'archivio,
//  passi di Analisi, Stampa collaudo, Messaggi / Giro guidato / Guida /
//  Manuale in alto...). Il manuale operatore cita i comandi alla lettera: se
//  una pagina rinomina un comando e il manuale no, chi cerca nel manuale la
//  parola che legge sullo schermo non la trova. Prima di questo
//  aggiornamento il manuale diceva ancora "Corr. baseline", "Follower
//  simulato", "Sistema & aggiornamenti", "Backup ZIP", "Salva profilo".
//
//  Controlla:
//   1. ogni comando che il manuale nomina esiste con quel nome nella sua
//      pagina (fuori dai commenti);
//   2. i messaggi citati nella tabella dei problemi esistono nel codice;
//   3. nessun nome ritirato e nessuna parola che il glossario abbandona;
//   4. numeri con la virgola, e niente che /manuale (cammes_server.js,
//      mdToHtml: titoli, grassetto, code, elenchi, tabelle, una riga alla
//      volta) stamperebbe tale e quale: asterisco singolo, link, paragrafi
//      spezzati su piu' righe; il manuale resta di una pagina circa;
//   5. l'analisi di usabilita' dice, proposta per proposta, che cosa e'
//      stato fatto nella v3.8.0; README e CHANGELOG descrivono le pagine di
//      oggi.
//
//  Uso: node tools/test_usabilita_documenti.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');

var CAMMES = path.join(__dirname, '..');
var RADICE = path.join(CAMMES, '..');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggi(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

// Le parole si cercano come le legge l'operatore: entita' HTML risolte.
var ENTITA = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', agrave: 'à', egrave: 'è',
    eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Oslash: 'Ø', deg: '°', middot: '·',
    rarr: '→', hellip: '…', laquo: '«', raquo: '»', mdash: '—', ndash: '–', plusmn: '±',
    times: '×', minus: '−', sigma: 'σ'
};
function decodifica(s) {
    return s.replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); })
            .replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(Number(d)); })
            .replace(/&([a-z]+);/gi, function (m, n) { return Object.prototype.hasOwnProperty.call(ENTITA, n) ? ENTITA[n] : m; });
}
// Fuori dai commenti: una parola rimasta solo in un commento non e' sullo
// schermo. Si tolgono i commenti HTML e quelli che cominciano la riga (i
// commenti di coda e quelli dentro le stringhe non si toccano: meglio un
// commento in piu' che un pezzo di codice in meno).
function senzaCommenti(s) {
    return s.replace(/<!--[\s\S]*?-->/g, '')
            .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
            .replace(/^\s*\/\/.*$/gm, '');
}
function pagina(nome) { return decodifica(senzaCommenti(leggi(path.join(CAMMES, nome)))); }

var MANUALE = leggi(path.join(RADICE, 'MANUALE_OPERATORE.md'));
var PAGINE = {
    'home.html': pagina('home.html'),
    'alzata.html': pagina('alzata.html'),
    'grafici.html': pagina('grafici.html'),
    'analisi.html': pagina('analisi.html'),
    'cammes-ui.js': pagina('cammes-ui.js')
};

console.log('=============================================================');
console.log(' DOCUMENTI: il manuale usa le parole dello schermo (v3.8.0)');
console.log('=============================================================');

// ---------------------------------------------------------------
console.log('--- 1. i comandi del manuale esistono con quel nome ---');
var COMANDI = [
    // Alzata
    ['START', 'alzata.html'], ['STOP', 'alzata.html'], ['Modalità', 'alzata.html'],
    ['Verso di scansione', 'alzata.html'], ['Ricomincia', 'alzata.html'], ['Salva misura', 'alzata.html'],
    ['Zero virtuale', 'alzata.html'], ['Azzera angolo qui', 'alzata.html'],
    ['Memorizza posizione', 'alzata.html'], ['Sblocca motore', 'alzata.html'],
    ['Blocca motore', 'alzata.html'], ['Ruota', 'alzata.html'], ['Rotazione manuale e zero', 'alzata.html'],
    ['Avanzate', 'alzata.html'], ['Ripetizioni', 'alzata.html'], ['Verifica banco', 'alzata.html'],
    ['Esito', 'alzata.html'], ['Misura completa', 'alzata.html'], ['Misura sospetta', 'alzata.html'],
    ['Misura INCOMPLETA', 'alzata.html'],
    // Home
    ['+ Nuova misura', 'home.html'], ['Ricontrolla', 'home.html'], ['Solo preferiti', 'home.html'],
    ['Apri in', 'home.html'], ['Scheda PDF', 'home.html'], ['Scarica', 'home.html'],
    ['Excel', 'home.html'], ['Elimina', 'home.html'], ['Confronta i selezionati (max 4)', 'home.html'],
    ['Analizza (aspirazione + scarico)', 'home.html'], ['Sistema e manutenzione', 'home.html'],
    ['Aggiorna firmware Arduino', 'home.html'], ['Intestazione dei PDF', 'home.html'],
    ['Backup completo (ZIP)', 'home.html'], ['Cestino', 'home.html'], ['Esporta etichette', 'home.html'],
    ['Diagnostica', 'home.html'],
    // Confronto
    ["Scegli dall'archivio", 'grafici.html'], ['Stampa collaudo', 'grafici.html'],
    ['Allinea la fase', 'grafici.html'], ['Differenza dalla prima misura', 'grafici.html'],
    ['NON CONFORME', 'grafici.html'], ['NON VALUTABILE', 'grafici.html'], ['Ø cerchio base', 'grafici.html'],
    // Analisi
    ['Parametri', 'analisi.html'], ["Dall'archivio", 'analisi.html'], ['Comando valvola', 'analisi.html'],
    ['Bicchiere idraulico', 'analisi.html'], ['Rapporto bilanciere', 'analisi.html'],
    ['Angolo lobo', 'analisi.html'], ['Gioco valvola', 'analisi.html'], ['Analizza', 'analisi.html'],
    ['Funzioni', 'analisi.html'], ['Punteria simulata', 'analisi.html'], ['Ø Bicchiere', 'analisi.html'],
    ['Referto PDF', 'analisi.html'], ['Scheda camma', 'analisi.html'], ['Salva in archivio', 'analisi.html'],
    ['Avanzato', 'analisi.html'], ['Correzione eccentricità', 'analisi.html'], ['accesa', 'analisi.html'],
    ['Azzera tutto', 'analisi.html'],
    // In alto, in ogni pagina
    ['Messaggi', 'cammes-ui.js'], ['Giro guidato', 'cammes-ui.js'], ['Guida', 'cammes-ui.js'],
    ['Manuale', 'cammes-ui.js']
];
COMANDI.forEach(function (c) {
    var nelManuale = MANUALE.indexOf(c[0]) >= 0, nellaPagina = PAGINE[c[1]].indexOf(c[0]) >= 0;
    check('«' + c[0] + '»: nel manuale e in ' + c[1], nelManuale && nellaPagina,
        nelManuale ? (nellaPagina ? '' : 'NON nella pagina: il manuale cita un nome che non c\'e\' piu\'')
                   : 'NON nel manuale');
});

// ---------------------------------------------------------------
console.log('');
console.log('--- 2. i messaggi della tabella dei problemi esistono ---');
var tabella = (MANUALE.split(/^## \d+\. Problemi frequenti/m)[1] || '').split(/^## /m)[0];
var citazioni = [];
tabella.replace(/«([^»]+)»/g, function (m, q) { citazioni.push(q); return m; });
check('la tabella dei problemi cita i messaggi dello schermo', citazioni.length >= 6, citazioni.length + ' citazioni');
var codice = PAGINE['alzata.html'] + PAGINE['home.html'] + PAGINE['cammes-ui.js'];
citazioni.forEach(function (q) {
    // intera, oppure composta dai suoi pezzi (titolo + ': ' + motivo)
    var intera = codice.indexOf(q) >= 0;
    var pezzi = q.split(': ');
    var composta = !intera && pezzi.length > 1 && pezzi.every(function (p) { return codice.indexOf(p) >= 0; });
    check('«' + q + '» esiste nel codice', intera || composta,
        intera ? 'com\'e\' scritta' : (composta ? 'composta: ' + pezzi.join(' + ') : 'NON trovata'));
});

// ---------------------------------------------------------------
console.log('');
console.log('--- 3. niente nomi ritirati, niente parole abbandonate dal glossario ---');
function contesto(re, t) {
    var m = re.exec(t);
    return m ? t.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25).replace(/\s+/g, ' ') : '';
}
var RITIRATI = [
    [/\bRESET\b/, 'RESET (ora Ricomincia)'],
    [/Reset zero/i, 'Reset zero (ora Azzera angolo qui)'],
    [/Salva pos\b/i, 'Salva pos (ora Memorizza posizione)'],
    [/\*\*Salva\*\*/, 'Salva (ora Salva misura)'],
    [/Sistema & aggiornamenti|card Sistema/i, 'Sistema & aggiornamenti (ora Sistema e manutenzione)'],
    [/Corr\. baseline/i, 'Corr. baseline (ora Correzione eccentricità)'],
    [/Follower simulato|Bicchiere piatto/i, 'Follower simulato, Bicchiere piatto (ora Punteria simulata, Bicchiere)'],
    [/Backup ZIP/, 'Backup ZIP (ora Backup completo (ZIP))'],
    [/\bExport\b|\bImport\b|\bImporta\b/, 'Export, Import, Importa (ora Esporta etichette, tendina Dall\'archivio)'],
    [/Salva profilo/i, 'Salva profilo (ora Salva in archivio)'],
    [/\bReplay\b|\bRivaluta\b/, 'Replay, Rivaluta (ora Ridisegna; il verdetto si aggiorna da solo)'],
    [/scostamento massimo/i, 'scostamento massimo (ora scarto massimo)'],
    [/scan autonomo/i, 'scan autonomo (ora misura automatica)'],
    [/GitHub|Arduino IDE/, 'GitHub, Arduino IDE (non servono a chi misura)']
];
RITIRATI.forEach(function (r) {
    check('il manuale non usa ' + r[1], !r[0].test(MANUALE), contesto(r[0], MANUALE));
});
var ABBANDONATE = [/\bfollower\b/i, /\blash\b/i, /\boverlap\b/i, /\bfloat\b/i, /\bsweep\b/i,
    /\brocker\b/i, /\bfinger\b/i, /\brun\b/i, /\b(BTC|ABC|BBC|ATC|BTDC|ABDC|BBDC|ATDC)\b/];
var trovate = ABBANDONATE.filter(function (re) { return re.test(MANUALE); });
check('nessuna parola che il glossario abbandona (follower, lash, overlap, float, sweep, rocker, finger, run, BTDC...)',
    trovate.length === 0, trovate.map(function (re) { return contesto(re, MANUALE); }).join(' | '));

// ---------------------------------------------------------------
console.log('');
console.log('--- 4. numeri con la virgola, e niente che /manuale stampa male ---');
var senzaCodice = MANUALE.replace(/`[^`]*`/g, '');
var punto = /\d\.\d/;
check('numeri con la virgola decimale', !punto.test(senzaCodice), contesto(punto, senzaCodice));
check('niente corsivo con l\'asterisco singolo (/manuale lo stamperebbe)',
    MANUALE.replace(/\*\*/g, '').indexOf('*') < 0, contesto(/\*/, MANUALE.replace(/\*\*/g, '')));
check('niente link markdown (/manuale li stamperebbe tali e quali)', !/\]\(/.test(MANUALE));
// Una riga di testo subito sotto un'altra riga di testo (non un titolo) e' il
// seguito di un paragrafo o di una voce: /manuale la stamperebbe staccata.
var righe = MANUALE.split('\n'), spezzate = [];
for (var i = 1; i < righe.length; i++) {
    if (!righe[i - 1].trim() || !righe[i].trim() || /^#/.test(righe[i - 1])) continue;
    if (!/^(\s*- |\||#|\d+\. )/.test(righe[i])) spezzate.push((i + 1) + ': ' + righe[i].slice(0, 40));
}
check('nessun paragrafo spezzato su piu righe (/manuale ne farebbe paragrafi separati)',
    spezzate.length === 0, spezzate.slice(0, 3).join(' | '));
check('il manuale resta di una pagina circa (al massimo 12000 caratteri)', MANUALE.length <= 12000,
    MANUALE.length + ' caratteri');

// ---------------------------------------------------------------
console.log('');
console.log('--- 5. analisi, README e CHANGELOG dicono lo stato di oggi ---');
var ANALISI = leggi(path.join(RADICE, 'ANALISI_USABILITA_2026-11-21.md'));
var iStato = ANALISI.indexOf('## Stato nella v3.8.0'), iRisposta = ANALISI.indexOf('## La risposta breve');
check('l analisi di usabilita ha in testa lo stato nella v3.8.0', iStato > 0 && iRisposta > iStato);
var sezione = iStato > 0 ? ANALISI.slice(iStato, iRisposta) : '';
var senzaRiga = [];
for (var n = 1; n <= 14; n++) if (!new RegExp('^\\| ' + n + ' \\|', 'm').test(sezione)) senzaRiga.push(n);
check('...con lo stato di ognuna delle 14 proposte', senzaRiga.length === 0,
    senzaRiga.length ? 'mancano: ' + senzaRiga.join(', ') : '14 righe');
check('...e degli interventi rapidi', /\*\*Interventi rapidi:\*\*/.test(sezione));
check('...e non dice piu che nessuna proposta e stata fatta', !/Nessuna è stata fatta/.test(ANALISI));

var README = leggi(path.join(RADICE, 'README.md'));
var pagineReadme = (README.split('## Pagine web')[1] || '').split('\n---')[0];
check('il README descrive la Home di oggi', /Riga di stato/.test(pagineReadme) && /Sistema e manutenzione/.test(pagineReadme));
check('...Alzata con la barra dei comandi', /Barra dei comandi/.test(pagineReadme));
check('...Confronto con la stampa del collaudo', /Stampa collaudo/.test(pagineReadme));
check('...Analisi a passi', /passi/.test(pagineReadme));
check('il README non rimanda piu a "Sistema & aggiornamenti"', !/Sistema & aggiornamenti/.test(README));

var CHANGELOG = leggi(path.join(RADICE, 'CHANGELOG.md'));
var voce = (CHANGELOG.split(/^## v3\.8\.0 /m)[1] || '').split(/^## v/m)[0];
check('il CHANGELOG ha la voce v3.8.0', voce.length > 0);
check('...che dice che cosa NON e verificato', /Cosa NON è verificato/.test(voce));

console.log('');
console.log('--- 6. /manuale stampa la tabella dei problemi come e scritta ---');
// cammes_server.js riconosceva la riga separatrice |---|---| con la classe
// [\s:-|], che e' l'INTERVALLO da ':' a '|': comprende le lettere e non il
// trattino. Cosi' /manuale stampava una riga "--- | ---" e saltava come
// separatrice ogni riga fatta di sole lettere e spazi (l'intestazione
// "Sintomo | Rimedio" spariva).
var SERVER = leggi(path.join(CAMMES, 'cammes_server.js'));
var mdToHtml = (function () {
    var i = SERVER.indexOf('function mdToHtml(md) {');
    if (i < 0) return null;
    for (var k = SERVER.indexOf('{', i), d = 0; k < SERVER.length; k++) {
        if (SERVER[k] === '{') d++;
        else if (SERVER[k] === '}' && --d === 0) return require('vm').runInNewContext('(' + SERVER.slice(i, k + 1) + ')');
    }
    return null;
})();
check('mdToHtml si legge dal server', typeof mdToHtml === 'function');
if (typeof mdToHtml === 'function') {
    var tab = mdToHtml('| Sintomo | Rimedio |\n|---|---|\n| LED rosso | riavvia |');
    check('la riga di trattini non diventa una riga della tabella', !/<td>-+<\/td>/.test(tab), tab.replace(/\n/g, ' ').slice(0, 160));
    check('un intestazione di sole lettere resta in tabella', /<td>Sintomo<\/td><td>Rimedio<\/td>/.test(tab));
    check('...e cosi le righe di sole lettere', /<td>LED rosso<\/td><td>riavvia<\/td>/.test(tab));
    var htmlManuale = mdToHtml(MANUALE);
    check('nel manuale vero nessuna riga di soli trattini', !/<td>-+<\/td>/.test(htmlManuale));
    check('...e la tabella dei problemi ha la sua intestazione', /<td>(<b>)?Sintomo(<\/b>)?<\/td>/.test(htmlManuale));
}

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: il manuale nomina i comandi come le pagine, cita messaggi che esistono,');
console.log('non usa nomi ritirati ne parole abbandonate, e /manuale lo stampa pulito.');
