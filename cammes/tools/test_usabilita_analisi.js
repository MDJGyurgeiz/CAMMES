// =============================================================
//  test_usabilita_analisi.js — la pagina Analisi si usa senza ricordarsi
//  i passaggi, parla una lingua sola e scrive i numeri come in officina
// =============================================================
//  Proposte dell'analisi di usabilita' (ANALISI_USABILITA_2026-11-21.md)
//  applicate alla pagina Analisi:
//    5  passi numerati in testa (#passiAnalisi), Analizza sempre a portata,
//       un comando valvola che dice con che cosa si fanno i conti;
//    4  la misura si sceglie anche dall'archivio (#sceltaArchivioIntake,
//       #sceltaArchivioExhaust) e arriva dalla Home con ?asp=...&sca=...;
//    6  glossario unico e virgola decimale su schermo, notifiche e PDF;
//    7  fumetti brevi, senza storia del programma e senza inglese tecnico;
//   12  nessuna finestra del browser (alert/confirm/prompt);
//   14  CSV per l'Excel italiano (punto e virgola, virgola decimale).
//  e i rilievi della revisione (2026-11-22):
//   - un nome nell'indirizzo (?asp=<img onerror=...>) non diventa codice;
//   - un file respinto non lascia il suo nome sui documenti;
//   - Invio che conferma un valore rende l'analisi da rifare;
//   - la legenda del bordo tratteggiato sta nel pannello;
//   - prima di esportare con valori di partenza, una domanda sola;
//   - grafico dei 720 gradi con 0 = PMS di incrocio e linee PMI-PMS-PMI.
//
//  Due livelli di prova:
//   - le funzioni della pagina estratte ed eseguite da sole;
//   - TUTTO lo script della pagina eseguito in un DOM finto: si carica una
//     misura vera (tools/fixtures), si analizza, si esportano CSV, scheda
//     camma e referto, e si guarda che cosa ne esce.
//  Nessun browser, nessun server.
//
//  Uso: node tools/test_usabilita_analisi.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var URLSearchParams = require('url').URLSearchParams;
var M = require('../lib/cammes-math.js');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggi(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n'); }
var HTML = leggi('analisi.html');
function vivo(src) { return src.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n'); }
var VIVO = vivo(HTML);

// Estrae "function nome(...) {...}" contando le graffe e saltando stringhe,
// commenti e letterali regex (le funzioni di una riga non finiscono in
// "\n}\n", e una regex come /[;"]/ non deve aprire una stringa).
function chiusura(src, da) {
    var prof = 0, i = da, n = src.length, prec = '', parola = '';
    var PAROLE_PRIMA_DI_REGEX = /^(return|typeof|case|in|of|delete|void|do|else)$/;
    for (; i < n; i++) {
        var c = src.charAt(i), d = src.charAt(i + 1);
        if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
        if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
        if (c === "'" || c === '"' || c === '`') {
            for (i++; i < n && src.charAt(i) !== c; i++) if (src.charAt(i) === '\\') i++;
            prec = c; parola = '';
            continue;
        }
        if (/[A-Za-z0-9_$]/.test(c)) { parola = (prec === 'x' ? parola : '') + c; prec = 'x'; continue; }
        if (c === '/' && (/[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prec) || (prec === 'x' && PAROLE_PRIMA_DI_REGEX.test(parola)))) {
            var inClasse = false;
            for (i++; i < n; i++) {
                var r = src.charAt(i);
                if (r === '\\') { i++; continue; }
                if (r === '[') inClasse = true;
                else if (r === ']') inClasse = false;
                else if (r === '/' && !inClasse) break;
            }
            prec = '/'; parola = '';
            continue;
        }
        if (c === '{') prof++;
        if (c === '}') { prof--; if (prof === 0) return i; }
        if (!/\s/.test(c)) { prec = /[)\]]/.test(c) ? 'x' : c; parola = ''; }
    }
    return -1;
}
function estrai(nome) {
    var m = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm').exec(HTML);
    if (!m) return null;
    var fine = chiusura(HTML, m.index + m[0].length - 1);
    return fine < 0 ? null : HTML.substring(m.index, fine + 1);
}
function contesto(extra) {
    var c = { Math: Math, Number: Number, String: String, isFinite: isFinite, Date: Date, JSON: JSON, Array: Array, Object: Object };
    Object.keys(extra || {}).forEach(function (k) { c[k] = extra[k]; });
    vm.createContext(c);
    return c;
}
function carica(c, nomi) {
    nomi.forEach(function (n) {
        var s = estrai(n);
        if (!s) throw new Error('funzione non trovata in analisi.html: ' + n);
        vm.runInContext(s, c, { filename: 'analisi.html:' + n });
    });
}
function corpo(nome) { return vivo(estrai(nome) || ''); }

console.log('=============================================================');
console.log(' ANALISI: passi, archivio, glossario, numeri con la virgola');
console.log('=============================================================');

// ---------------------------------------------------------------
console.log('');
console.log('--- la pagina dice da dove si comincia (proposta 5) ---');
var iPassi = HTML.indexOf('id="passiAnalisi"');
check('in testa al pannello ci sono i passi numerati (#passiAnalisi)', iPassi > 0 && iPassi < HTML.indexOf('class="section-intake"'));
['Carica l\'aspirazione', 'Carica lo scarico', 'Controlla i valori da confermare', 'Analizza'].forEach(function (t, k) {
    check('passo ' + (k + 1) + ': "' + t + '" col suo stato', new RegExp('id="passo' + (k + 1) + '"[\\s\\S]{0,260}' + t.replace(/'/g, "'") + '[\\s\\S]{0,120}id="passo' + (k + 1) + 'Stato"').test(HTML));
});
check('Analizza sta in un blocco che resta a vista (position: sticky)',
    /\.azioni-analizza\s*\{[^}]*position:\s*sticky/.test(HTML) && /class="azioni-analizza"[\s\S]{0,300}id="analyzeBtn"/.test(HTML));
check('...e l avviso "risultati vecchi" gli sta accanto', /id="azioniAnalizza"[\s\S]{0,900}id="analysisStaleBanner"/.test(HTML));
check('il pulsante Analizza evidenziato ha finalmente uno stile', /\.btn\.btn-attention\s*\{/.test(HTML));
check('il grafico vuoto dice che cosa fare (e dove: nel pannello Parametri, non "a destra")',
    /id="graficoVuoto"[^>]*>[^<]*Scegli nel pannello <b>Parametri<\/b>/.test(HTML) && !/id="graficoVuoto"[^>]*>[^<]*a destra/.test(HTML));
var testoBanner = ((/id="analysisStaleBanner"[^>]*>([\s\S]*?)<\/div>/.exec(HTML) || [])[1] || '').replace(/<[^>]+>|&#\d+;/g, '').trim();
check('l avviso dentro la barra di Analizza sta su una riga (il testo intero e in testa ai risultati)',
    testoBanner.length > 0 && testoBanner.length <= 40 && /id="risultatiScaduti"[^>]*>[\s\S]{0,200}Risultati non aggiornati/.test(HTML), testoBanner);
check('col Tab il campo non finisce sotto la barra di Analizza ne sotto l intestazione',
    /html \{ scroll-padding-top: \d+px; scroll-padding-bottom: \d+px; \}/.test(HTML));
check('la legenda del bordo tratteggiato sta nel pannello, sotto i passi, e dice come si conferma',
    /id="passiAnalisi"[\s\S]{0,1600}<\/ol>\s*<p class="legenda-tratteggio" id="legendaTratteggio"[^>]*>[\s\S]{0,120}Bordo tratteggiato[^<]*premi <b>Invio<\/b>/.test(HTML));
check('Azzera tutto sta lontano da Analizza e chiede prima (finestra della pagina)',
    !/id="analyzeBtn"[\s\S]{0,400}resetAll\(\)/.test(HTML) && /chiediAzzeraTutto\(\)/.test(HTML) &&
    /cammesConferma\(/.test(corpo('chiediAzzeraTutto')));
check('resetAll resta senza parametri (lo usano altri test)', /^function resetAll\(\)\s*\{/m.test(HTML));

// ---------------------------------------------------------------
console.log('');
console.log('--- la misura si sceglie anche dall archivio (proposta 4) ---');
check('tendina dall archivio per l aspirazione (#sceltaArchivioIntake)', /<select id="sceltaArchivioIntake"[^>]*onchange="caricaDaArchivio\('intake'/.test(HTML));
check('...e per lo scarico (#sceltaArchivioExhaust)', /<select id="sceltaArchivioExhaust"[^>]*onchange="caricaDaArchivio\('exhaust'/.test(HTML));
check('scegliere il file lo carica subito (niente secondo pulsante Importa)',
    /id="fileIntake"[^>]*onchange="fileScelto\('intake'/.test(HTML) && /id="fileExhaust"[^>]*onchange="fileScelto\('exhaust'/.test(HTML) &&
    !/>Importa Aspirazione</.test(HTML) && !/>Importa Scarico</.test(HTML));
check('lo scarico non ha piu un pulsante rosso pieno', !/class="btn btn-danger" onclick="importExhaust/.test(HTML));
var cRiempi = corpo('riempiSceltaArchivio');
check('l elenco viene da /api/files, solo misure _alz.scr', /fetch\('\/api\/files'/.test(cRiempi) && /type === 'alz'/.test(cRiempi) && /\\\.scr\$/.test(cRiempi));
check('la misura si legge da /api/file/<nome> (anche dal secondo PC)', /fetch\('\/api\/file\/' \+ encodeURIComponent\(nome\)/.test(corpo('caricaDaArchivio')));
var cInd = corpo('caricaDaIndirizzo');
check('dalla Home: analisi.html?asp=...&sca=... con la notifica', /get\('asp'\)/.test(cInd) && /get\('sca'\)/.test(cInd) && /annuncia: true/.test(cInd) &&
    /Caricata dall\\'archivio/.test(corpo('caricaDaArchivio')));
var cArch = corpo('caricaDaArchivio');
check('il nome che arriva dall indirizzo passa dalla regola dei nomi dell archivio e si scrive come testo',
    /if \(!nomeMisuraValido\(nome\)\)/.test(cArch) && !/'<b>' \+ nome\b/.test(cArch) && /escHtml\(/.test(cArch));
check('...e cosi il nome del file che non si apre', /escHtml\(file\.name\)/.test(corpo('leggiSorgente')));
check('"Ricarica" solo per le misure dell archivio (un file del disco cambiato il browser non lo rilegge)',
    /b\.style\.display = daArchivio \? '' : 'none'/.test(corpo('dopoCaricamento')));
['importIntake', 'importExhaust'].forEach(function (f) {
    var c = corpo(f);
    var iRif = c.indexOf('validCount < 30'), iNome = c.search(/(intake|exhaust)FileBase = nom\[0\]/), iConv = c.indexOf('detectConvertedFile(testo)');
    check(f + ': un file respinto non tocca ne il nome della misura ne la punteria',
        iRif > 0 && iNome > iRif && iConv > iRif, 'respinto@' + iRif + ' nome@' + iNome + ' punteria@' + iConv);
    check(f + ': dice a chi chiama se la misura e stata presa (esito)',
        /esito\(false\)/.test(c) && /esito\(true\)/.test(c));
});

// ---------------------------------------------------------------
console.log('');
console.log('--- il comando valvola dice con che cosa si fanno i conti ---');
check('l etichetta e "Comando valvola (dicitura sul referto)"',
    (HTML.match(/Comando valvola <span class="help-icon" data-tip="[^"]*">\?<\/span> <small>\(dicitura sul referto\)<\/small>/g) || []).length === 2);
check('i valori delle voci non cambiano (calcoli e test li usano)',
    /<select id="intakeType"[\s\S]*?value="bucket_mech"[\s\S]*?value="bucket_hyd"[\s\S]*?value="rocker_pushrod"[\s\S]*?value="finger"[\s\S]*?value="roller"[\s\S]*?<\/select>/.test(HTML));
check('nessun comando scelto in partenza (dichiarazione, non valore di comodo)', /<select id="intakeType"[^>]*>\s*<option value="" selected>/.test(HTML));
check('"Punteria simulata" con le voci in italiano e gli stessi value',
    /<option value="punt" selected>Nessuna: curva del puntalino<\/option>/.test(HTML) && /<option value="bicch">Bicchiere<\/option>/.test(HTML) &&
    /<option value="roller">Rullo<\/option>/.test(HTML) && /<option value="finger">Leva a dito<\/option>/.test(HTML));
check('il rapporto bilanciere sta sotto il comando del suo lato', /class="section-intake"[\s\S]*?id="contiIntake"[\s\S]*?id="rowRockerIntake"[\s\S]*?id="rockerIntake"[\s\S]*?class="section-exhaust"/.test(HTML));
check('...e resta visibile in vista Base quando serve', /\.mode-base \.adv-only\.mostra-in-base\s*\{\s*display:\s*flex !important/.test(HTML));

// Il pannello Parametri e' una colonna di circa 360 px: le tendine con voci
// lunghe hanno l'etichetta sopra, e l'unita' accanto alla casella e' corta
// (il resto della spiegazione va sotto l'etichetta, in piccolo).
['intakeType', 'exhaustType', 'followerType', 'complianceEnabled', 'complianceModel'].forEach(function (id) {
    check('tendina #' + id + ': etichetta sopra, tendina su tutta la riga',
        new RegExp('<div class="param-row etichetta-sopra">\\s*<span class="param-label">[\\s\\S]{0,900}?<select id="' + id + '"').test(HTML));
});
check('la regola etichetta-sopra esiste nello stile', /\.param-row\.etichetta-sopra \.param-label\s*\{[^}]*100%/.test(HTML) &&
    /\.param-row\.etichetta-sopra select\.input\s*\{[^}]*max-width:\s*none/.test(HTML));
var unitaLunghe = (HTML.match(/<span class="param-unit">[^<]*<\/span>/g) || []).map(function (s) {
    return s.replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, '_');
}).filter(function (t) { return t.length > 10; });
check('nessuna unita lunga accanto alle caselle (al massimo 10 caratteri)', unitaLunghe.length === 0, unitaLunghe.join(' | '));
// la spiegazione in piccolo va a capo da sola (display:block): deve stare
// DOPO il "?", altrimenti il "?" finisce su una terza riga
check('la spiegazione in piccolo sta dopo il "?" (mai prima)',
    /\.param-label small\s*\{[^}]*display:\s*block/.test(HTML) && !/<\/small> <span class="help-icon"/.test(HTML) &&
    (HTML.match(/<span class="help-icon" data-tip="[^"]*">\?<\/span> <small>/g) || []).length >= 9);

// ---------------------------------------------------------------
console.log('');
console.log('--- numeri con la virgola, parole al posto delle sigle (proposta 6) ---');
var cNum = contesto();
carica(cNum, ['numIt', 'giriIt', 'dataIt', 'fraseEvento', 'fraseApreAsp', 'fraseChiudeAsp', 'fraseApreSca', 'fraseChiudeSca', 'etichettaComando',
              'escHtml', 'nomeMisuraValido', 'descriviConversione', 'statoSimulazione']);
vm.runInContext(/^var TYPOLOGY = \{[\s\S]*?\n\};/m.exec(HTML)[0], cNum);
check('numIt: virgola decimale', cNum.numIt(0.544, 2) === '0,54' && cNum.numIt(100, 1) === '100,0', cNum.numIt(0.544, 2));
check('numIt: nessun punto delle migliaia', cNum.numIt(12500, 0) === '12500', cNum.numIt(12500, 0));
check('numIt: "n.d." al posto di un non-numero, niente "-0,00"', cNum.numIt(NaN, 1) === 'n.d.' && cNum.numIt(-0.001, 2) === '0,00');
cNum.window = { cammesNum: function () { return 'COMUNE'; } };
check('numIt usa la funzione comune di cammes-ui.js quando c e', cNum.numIt(1, 1) === 'COMUNE');
delete cNum.window;
check('regime senza punto delle migliaia', cNum.giriIt(7200.4) === '7200 giri/min', cNum.giriIt(7200.4));
check('data come in officina (gg/mm/aaaa, ore hh:mm)', /^\d\d\/\d\d\/\d{4}, ore \d\d:\d\d$/.test(cNum.dataIt('2026-11-14T15:42:07.512Z', true)), cNum.dataIt('2026-11-14T15:42:07.512Z', true));
check('apertura aspirazione in parole', cNum.fraseApreAsp(10.64) === '10,6° prima del PMS', cNum.fraseApreAsp(10.64));
check('chiusura aspirazione in parole', cNum.fraseChiudeAsp(40.2) === '40,2° dopo il PMI', cNum.fraseChiudeAsp(40.2));
check('apertura scarico in parole', cNum.fraseApreSca(45) === '45,0° prima del PMI', cNum.fraseApreSca(45));
check('valore negativo: si gira la frase invece di scrivere il meno', cNum.fraseChiudeSca(-8.3) === '8,3° prima del PMS', cNum.fraseChiudeSca(-8.3));
check('evento non determinabile: n.d.', cNum.fraseApreAsp(NaN) === 'n.d.');
check('esattamente sul punto morto: lo dice', cNum.fraseChiudeSca(0.02) === '0,0° (al PMS)', cNum.fraseChiudeSca(0.02));
var etichetteComando = Object.keys(cNum.TYPOLOGY).map(function (k) { return cNum.TYPOLOGY[k].label; });
check('comando valvola: "Leva a dito", mai "Finger"', cNum.etichettaComando('finger') === 'Leva a dito' &&
    !etichetteComando.some(function (t) { return /finger|bilancere/i.test(t); }), etichetteComando.join(', '));
check('comando non scelto: "non dichiarato" sui documenti', cNum.etichettaComando('') === 'non dichiarato');
check('curva gia convertita detta a parole, con la virgola (non "bicch:33.34")',
    cNum.descriviConversione('bicch:33.34') === 'bicchiere Ø 33,34 mm' && cNum.descriviConversione('roll:8') === 'rullo R 8,0 mm' &&
    cNum.descriviConversione('finger:25x30') === 'leva a dito 25,0 / 30,0 mm' && cNum.descriviConversione('follower') === 'punteria non indicata nel file',
    [cNum.descriviConversione('bicch:33.34'), cNum.descriviConversione('roll:8'), cNum.descriviConversione('finger:25x30')].join(' | '));
check('...e un codice sconosciuto letto da un file resta testo', cNum.descriviConversione('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;');
check('esito della simulazione a parole sui documenti', cNum.statoSimulazione('CONVERGED') === 'convergente' &&
    cNum.statoSimulazione('NON_CONVERGED') === 'NON convergente' && cNum.statoSimulazione('INVALID_INPUT') === 'valori non validi');
check('i nomi delle misure seguono la regola dell archivio', cNum.nomeMisuraValido('albero12_asp_alz.scr') &&
    !cNum.nomeMisuraValido('<img src=x>.scr') && !cNum.nomeMisuraValido('../segreto.scr') && !cNum.nomeMisuraValido(''));

console.log('');
console.log('--- tabella dei risultati ---');
var iNota = HTML.indexOf('id="notaValoriEsempio"'), iDurata = HTML.indexOf('<!-- Durata -->');
['resMaxLiftIn', 'resMaxLiftEx', 'resCamLiftIn', 'resCamLiftEx'].forEach(function (id) {
    var i = HTML.indexOf('id="' + id + '"');
    check('alzata massima a schermo: #' + id + ', prima della fasatura', i > iNota && i < iDurata);
});
check('etichette di fasatura senza sigle inglesi', !/(BTC|ABC|BBC|ATC) \((prima|dopo)/.test(HTML) && !/Angolo di incrocio \(overlap\)/.test(HTML));
var cAn = corpo('analyze');
check('la durata dice a quale alzata e presa', /al gioco \('/.test(cAn) && /mm di alzata'/.test(cAn));
check('la fasatura a schermo passa dalle frasi in parole', /_riserva\('resIntOpen', fraseApreAsp\(/.test(cAn) && /_riserva\('resExClose', fraseChiudeSca\(/.test(cAn));
check('le riserve "(da confermare)" restano anche sulle nuove righe', /_riserva\('resMaxLiftIn'/.test(cAn) && /_riserva\('resDurRefIn'/.test(cAn));
check('"Grafici non visibili" non e piu una notifica: e una riga che resta', !/title: 'Grafici non visibili'/.test(VIVO) && /aggiornaNotaGraficiNascosti\(\)/.test(cAn));
var iToast = cAn.indexOf("title: 'Analisi eseguita'");
check('"Analisi eseguita" non ripete i numeri della tabella', iToast > 0 && !/LSA\.toFixed|durIntake \+/.test(cAn.slice(iToast, iToast + 400)));
check('valori a destra anche quando vanno a capo, e su tablet la ruota va sopra la tabella',
    /\.result-value \{[^}]*text-align: right/.test(HTML) && /@media \(max-width: 1100px\) \{ \.result-grid \{ grid-template-columns: 1fr; \} \}/.test(HTML));
check('analisi da rifare: i numeri restano, attenuati (non tolti)',
    /\.risultati-vecchi \.result-value \{ opacity: 0\.\d+; \}/.test(HTML) &&
    /classList\.add\('risultati-vecchi'\)/.test(corpo('markAnalysisStale')) && /classList\.remove\('risultati-vecchi'\)/.test(corpo('clearAnalysisStale')));

// ---------------------------------------------------------------
console.log('');
console.log('--- niente finestre del browser (proposta 12) ---');
var finestre = (VIVO.match(/\b(alert|confirm|prompt)\(/g) || []);
check('nessun alert(), confirm() o prompt() nel codice della pagina', finestre.length === 0, finestre.join(', '));
var cSalva = corpo('saveProfileToArchive');
check('Salva in archivio chiede prima di sostituire una misura che esiste',
    /fetch\('\/api\/files'/.test(cSalva) && /cammesDialog\(/.test(cSalva) && /Sostituisci/.test(cSalva) && /Salva con un nome nuovo/.test(cSalva));
check('...e se l archivio non risponde chiede invece di sostituire alla cieca',
    /\.catch\(function \(\) \{[\s\S]{0,300}cammesConferma\(/.test(cSalva));
['exportPDF', 'exportCamCard', 'exportCSV', 'exportRaceReport'].forEach(function (f) {
    check(f + ': prima di scrivere con valori di partenza dice quali (una domanda per analisi)', /chiediPrimaDiEsportare\(/.test(corpo(f)));
});

// ---------------------------------------------------------------
console.log('');
console.log('--- fumetti brevi e in italiano (proposta 7) ---');
var tips = [], reTip = /data-tip="([^"]*)"/g, mt;
function testoTip(h) {
    return h.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&[a-zA-Z]+;|&#\d+;/g, 'x').replace(/\s+/g, ' ').trim();
}
while ((mt = reTip.exec(HTML)) !== null) tips.push(testoTip(mt[1]));
var lunghi = tips.filter(function (t) { return t.length > 320; });
check('nessun fumetto oltre i 300 caratteri circa', lunghi.length === 0, lunghi.map(function (t) { return t.slice(0, 40) + '... ' + t.length; }).join(' | '));
var storia = tips.filter(function (t) { return /Prima questo campo|no-op|utile per debug|come sempre/i.test(t); });
check('nessun fumetto racconta la storia del programma o parla da sviluppatore', storia.length === 0, storia.join(' | ').slice(0, 160));
var inglese = tips.filter(function (t) { return /\b(follower|lash|rocker|overlap|valve float|sweep|compliance|solver|RK4|default|heatmap|coil bind|cotters|pushrod|DOF)\b/i.test(t); });
check('nessun fumetto usa l inglese tecnico del glossario', inglese.length === 0, inglese.map(function (t) { return t.slice(0, 50); }).join(' | '));
check('...e nessun marchio di terzi nei fumetti (il comparatore si chiama comparatore)', !tips.some(function (t) { return /Neoteck/i.test(t); }));
// I "?" da 22 px raggiungibili col Tab li danno style.css e cammes-ui.js a
// tutte le pagine: la pagina non li ridefinisce (prima c'erano due fonti).
check('etichette almeno 14 px; i "?" vengono da una fonte sola (style.css e cammes-ui.js)',
    /\.param-label \{ font-size: 14px/.test(HTML) && !/^\s*\.help-icon \{/m.test(HTML) && !/\.help-icon:not\(\[tabindex\]\)/.test(VIVO));

// ---------------------------------------------------------------
console.log('');
console.log('--- CSV per l Excel italiano (proposta 14) ---');
var cCsv = contesto();
carica(cCsv, ['campiCsv', 'virgolaDecimaleCsv', 'rigaCsvItaliana']);
function riga(r) { return cCsv.rigaCsvItaliana(r); }
check('punto e virgola fra le colonne, virgola nei decimali', riga('1,0.1234,-0.5000,') === '1;0,1234;-0,5000;', riga('1,0.1234,-0.5000,'));
check('l etichetta resta intera, il numero cambia', riga('Durata a 1.27 mm di alzata asp. [°],250') === 'Durata a 1,27 mm di alzata asp. [°];250', riga('Durata a 1.27 mm di alzata asp. [°],250'));
check('testo con virgole fra apici: un campo solo', riga('# DA CONFERMARE,"gioco a 0,50: durate, aperture"') === '# DA CONFERMARE;gioco a 0,50: durate, aperture',
    riga('# DA CONFERMARE,"gioco a 0,50: durate, aperture"'));
check('numeri dentro un testo con l unita', riga('Velocita,0.123 mm/° a 45.0 °') === 'Velocita;0,123 mm/° a 45,0 °', riga('Velocita,0.123 mm/° a 45.0 °'));
check('nomi delle misure e data restano come sono', riga('# Misura asp.,albero_1.5_alz') === '# Misura asp.;albero_1.5_alz' &&
    riga('# Data e ora,2026-11-14T15:42:07.512Z') === '# Data e ora;2026-11-14T15:42:07.512Z');
check('il segno UTF-8 del CSV e scritto come \\uFEFF, non come carattere invisibile',
    HTML.indexOf('\uFEFF') < 0 && /new Blob\(\['\\uFEFF' \+ lines/.test(HTML));
check('niente codici della simulazione sui documenti (CONVERGED e simili)',
    !/lines\.push\([^;]*\+ (R\.complianceStatus|CI\.statusIn|CI\.statusEx)\b/.test(VIVO) && !/' — ' \+ R\.complianceStatus/.test(VIVO));
check('un campo col punto e virgola va fra doppi apici', riga('Nota,"a;b"') === 'Nota;"a;b"', riga('Nota,"a;b"'));
check('il fumetto del CSV lo dice', /id="btnExportCSV"[^>]*data-tip="[^"]*punto e virgola[^"]*virgola/.test(HTML));

// ---------------------------------------------------------------
// Visto nel browser a 1366x768 (2026-11-22): il pannello e' largo ~318 px e
// due pulsanti a meta' larghezza ("Salva in archivio", "Scheda camma"), in
// maiuscolo con 20 px di margine per lato, tagliavano la scritta (.btn ha
// white-space: nowrap e overflow: hidden). La riga dei documenti parte dalla
// larghezza del testo e, se non c'e' posto, va a capo invece di tagliare.
console.log('');
console.log('--- pulsanti dei documenti: la scritta non viene tagliata ---');
['btnExportCSV', 'btnExportPDF', 'btnSaveProfile', 'btnCamCard'].forEach(function (id) {
    // i data-tip contengono <strong>: niente regex sul tag intero, si cerca
    // il <button> per id e il <div class="..."> che lo contiene
    var iBtn = HTML.indexOf('id="' + id + '"');
    var iTag = HTML.lastIndexOf('<button', iBtn);
    var iDiv = HTML.lastIndexOf('<div class="', iTag);
    var classi = iDiv >= 0 ? HTML.slice(iDiv + 12, HTML.indexOf('"', iDiv + 12)) : '';
    var tag = HTML.slice(iTag, HTML.indexOf('data-tip', iTag));
    check(id + ': nella riga dei documenti, senza flex:1 scritto nel tag',
        iBtn > 0 && /\briga-documenti\b/.test(classi) && !/style="flex:1;?"/.test(tag), classi);
});
var cssRiga = (/\.riga-documenti\s*\{([^}]*)\}/.exec(HTML) || [])[1] || '';
var cssBtn = (/\.riga-documenti \.btn\s*\{([^}]*)\}/.exec(HTML) || [])[1] || '';
check('la riga va a capo quando non c e posto', /flex-wrap:\s*wrap/.test(cssRiga), cssRiga.trim());
check('...e ogni pulsante parte dalla larghezza del suo testo', /flex:\s*1 1 auto/.test(cssBtn) && /padding-left:\s*12px/.test(cssBtn), cssBtn.trim());

// ---------------------------------------------------------------
console.log('');
console.log('--- valori da confermare: Invio conferma, il programma non conferma da solo ---');
var cConf = contesto({ localStorage: { _r: {}, getItem: function (k) { return this._r[k] === undefined ? null : this._r[k]; } } });
var VARS = ['MODULES_KEY', 'CAMPI_MOLLA', 'MIN_CAMPO_MOLLA', 'CAMPI_GEOMETRIA', 'CAMPI_FASATURA', 'CAMPI_LEVA', 'CAMPI_TRENO', 'CAMPI_GIOCO', 'MIN_CAMPO_ALTRI'];
VARS.forEach(function (v) {
    var m = new RegExp('^var ' + v + '\\s*=\\s*[^;]*;', 'm').exec(HTML);
    if (m) vm.runInContext(m[0], cConf);
});
var campi = {};
function campo(id, v, conf) { campi[id] = { value: v, dataset: conf ? { confermato: '1' } : {}, disabled: false }; }
['intakeAngle', 'exhaustAngle', 'intakeClearance', 'exhaustClearance', 'springK', 'springPreload', 'massEqIntake', 'massEqExhaust', 'rRoll', 'diamBase', 'diamBaseExhaust', 'diamBicch'].forEach(function (id) { campo(id, '1', false); });
campi.followerType = { value: 'punt' }; campi.complianceEnabled = { value: '0' };
cConf.document = { getElementById: function (id) { return campi[id] || null; } };
carica(cConf, ['geometriaRilevante', 'giocoRilevante', 'campiDaConfermare', 'campoEConfermato', 'descriviCampiDaConfermare']);
var l0 = cConf.campiDaConfermare();
check('a moduli spenti molla e masse non si chiedono (nessun numero a schermo ne dipende)', l0.indexOf('springK') < 0 && l0.indexOf('intakeAngle') >= 0 && l0.indexOf('intakeClearance') >= 0, JSON.stringify(l0));
cConf.localStorage._r[vm.runInContext('MODULES_KEY', cConf)] = JSON.stringify({ molla: true });
check('...col modulo molla acceso si chiedono', cConf.campiDaConfermare().indexOf('springK') >= 0);
campi.followerType.value = 'roller';
check('col rullo anche il raggio del rullo e da confermare', cConf.campiDaConfermare().indexOf('rRoll') >= 0);
check('la nota dice come si conferma', /premi Invio/.test(cConf.descriviCampiDaConfermare(['intakeAngle'])));
check('...e per la domanda prima di esportare da solo i nomi', JSON.stringify(cConf.descriviCampiDaConfermare(['intakeAngle', 'exhaustClearance'], true)) ===
    JSON.stringify(['angolo lobo asp.', 'gioco valvola scar.']));
// Visto nel browser (2026-11-22): l elenco finiva con "scar.</b>." e a schermo
// si leggeva "gioco valvola scar.." con due punti.
var testoDomanda = '';
cConf.window = { cammesDialog: function (o) { testoDomanda = o.testo; return { then: function () {} }; } };
cConf.lastAnalysis = { analysisId: 'a1' };
vm.runInContext('var _esportaConValoriDiPartenza = null;', cConf);
cConf.campiAncoraDaConfermare = function () { return ['intakeAngle', 'exhaustClearance']; };
carica(cConf, ['chiediPrimaDiEsportare']);
cConf.chiediPrimaDiEsportare('Nella scheda camma', function () {});
check('la domanda prima di esportare non chiude l elenco con due punti ("scar..")',
    testoDomanda !== '' && !/\.(<\/b>)?\./.test(testoDomanda.replace(/<br>/g, ' ')), testoDomanda.slice(0, 160));
check('Invio nel campo conferma il valore gia scritto', /addEventListener\('keydown'[\s\S]{0,200}'Enter'[\s\S]{0,200}confermato = '1'/.test(VIVO));
check('...e conta come riscriverlo: analisi da rifare (molla e masse si ricalcolano da sole)',
    /'Enter'[\s\S]{0,500}if \(CAMPI_MOLLA\.indexOf\(id\) >= 0\) scheduleLiveRetune\(\);\s*else markAnalysisStale\(\);/.test(VIVO));
check('lo stato di conferma entra nell impronta dei valori (i documenti si fermano finche non si rifa Analizza)',
    /parts\.push\('conf=' \+ CAMPI_MOLLA\.concat\(/.test(corpo('collectInfluentialParams')));
var cDef = contesto();
vm.runInContext(/^var CAMPI_NUM = \{[\s\S]*?\n\};/m.exec(HTML)[0], cDef);
var fDef = { intakeAngle: { value: '', dataset: { confermato: '1' } } };
cDef.document = { getElementById: function (id) { return fDef[id] || null; } };
carica(cDef, ['applicaDefaultVisibili']);
cDef.applicaDefaultVisibili();
check('un campo svuotato e riempito col valore di partenza torna "da confermare"',
    fDef.intakeAngle.value === '100' && fDef.intakeAngle.dataset.confermato === undefined, JSON.stringify(fDef.intakeAngle));

// =================================================================
//  LA PAGINA INTERA IN UN DOM FINTO
// =================================================================
console.log('');
console.log('--- la pagina intera: carica, analizza, esporta ---');

var catture = { toast: [], fetch: [], blob: null, dialoghi: [], doc: null };
var registro = {};
var valoriIniziali = {};
(HTML.match(/<input[^>]*>/g) || []).forEach(function (tag) {
    var id = /\sid="([^"]+)"/.exec(tag); if (!id) return;
    var v = /\svalue="([^"]*)"/.exec(tag);
    valoriIniziali[id[1]] = v ? v[1] : '';
});
(HTML.match(/<select[^>]*id="[^"]+"[^>]*>[\s\S]*?<\/select>/g) || []).forEach(function (blk) {
    var id = /id="([^"]+)"/.exec(blk)[1];
    var sel = /<option value="([^"]*)"[^>]*\bselected\b/.exec(blk) || /<option value="([^"]*)"/.exec(blk);
    valoriIniziali[id] = sel ? sel[1] : '';
});
var testiCanvas = [];
function contesto2d() {
    var g = { fillText: function (t) { testiCanvas.push(String(t)); }, measureText: function (t) { return { width: String(t).length * 8 }; } };
    ['fillRect', 'strokeRect', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'setLineDash', 'save', 'restore',
     'translate', 'rotate', 'drawImage', 'closePath', 'rect'].forEach(function (k) { g[k] = function () {}; });
    return g;
}
var elementi = {};
function nuovoElemento(id, tag) {
    var classi = {}, attr = {}, ascolta = {};
    var el = {
        id: id, tagName: String(tag || 'div').toUpperCase(),
        value: (id && valoriIniziali[id] !== undefined) ? valoriIniziali[id] : '',
        textContent: '', style: {}, dataset: {}, disabled: false, checked: false, files: null, title: '',
        children: [], options: [],
        classList: {
            add: function (c) { classi[c] = true; }, remove: function (c) { delete classi[c]; },
            toggle: function (c, on) { if (on === undefined) on = !classi[c]; if (on) classi[c] = true; else delete classi[c]; return on; },
            contains: function (c) { return !!classi[c]; }
        },
        setAttribute: function (a, v) { attr[a] = String(v); },
        getAttribute: function (a) { return attr[a] === undefined ? null : attr[a]; },
        removeAttribute: function (a) { delete attr[a]; },
        addEventListener: function (t, fn) { (ascolta[t] = ascolta[t] || []).push(fn); },
        _ascolta: ascolta,
        appendChild: function (c) { el.children.push(c); if (el.tagName === 'SELECT') el.options.push(c); return c; },
        removeChild: function () {}, remove: function () {},
        closest: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        focus: function () { catture.fuoco = id; }, scrollIntoView: function () {}, click: function () {},
        getContext: function () { return contesto2d(); }, toDataURL: function () { return 'data:image/png;base64,'; },
        width: 700, height: 380, clientWidth: 700, clientHeight: 380
    };
    var html = '';
    Object.defineProperty(el, 'innerHTML', {
        get: function () { return html; },
        set: function (v) { html = String(v); if (html === '') { el.children = []; el.options = []; } }
    });
    return el;
}
function perId(id) {
    if (!elementi[id]) {
        var tag = (new RegExp('<(\\w+)[^>]*\\sid="' + id + '"').exec(HTML) || [])[1];
        elementi[id] = nuovoElemento(id, tag);
    }
    return elementi[id];
}
// i blocchi data-module e le caselle dei moduli, come stanno in pagina
var blocchiModulo = [], caselleModulo = [];
(HTML.match(/<[a-z]+[^>]*data-module="[^"]+"[^>]*>/g) || []).forEach(function (tag) {
    var id = /\sid="([^"]+)"/.exec(tag);
    var el = id ? perId(id[1]) : nuovoElemento(null, 'div');
    el.setAttribute('data-module', /data-module="([^"]+)"/.exec(tag)[1]);
    blocchiModulo.push(el);
});
(HTML.match(/<input type="checkbox" data-mod="[^"]+"/g) || []).forEach(function (tag) {
    var el = nuovoElemento(null, 'input');
    el.setAttribute('data-mod', /data-mod="([^"]+)"/.exec(tag)[1]);
    caselleModulo.push(el);
});
var alCaricamento = [];
var documento = {
    readyState: 'loading',
    getElementById: perId,
    createElement: function (t) { return nuovoElemento(null, t); },
    querySelectorAll: function (sel) {
        if (sel === '[data-module]') return blocchiModulo;
        if (sel === '#modulesPanel input[data-mod]') return caselleModulo;
        return [];
    },
    querySelector: function () { return null; },
    addEventListener: function (t, fn) { if (t === 'DOMContentLoaded') alCaricamento.push(fn); },
    body: { appendChild: function () {}, removeChild: function () {} },
    activeElement: null
};
function ChartFinto(ctx, cfg) {
    this.config = cfg; this.data = cfg.data; this.options = cfg.options || {};
    this.canvas = { width: 700, height: 380, parentNode: { clientWidth: 700, clientHeight: 380 } };
}
ChartFinto.prototype.update = function () {};
ChartFinto.prototype.destroy = function () {};
ChartFinto.prototype.resize = function () {};
ChartFinto.prototype.resetZoom = function () {};
ChartFinto.prototype.draw = function () {};
ChartFinto.register = function (p) { (catture.pluginRegistrati = catture.pluginRegistrati || []).push(p); };
// FileReader finto: legge il testo appoggiato sul "file" scelto
function FileReaderFinto() {}
FileReaderFinto.prototype.readAsText = function (file) {
    var fr = this;
    setImmediate(function () { fr.result = file._testo; fr.onload(); });
};
function DocFinto(opts) {
    var d = this, oriz = opts && opts.orientation === 'landscape';
    d.testi = []; d._pagine = 1; d._fs = 10;
    catture.doc = d;
    d.internal = { pageSize: { getWidth: function () { return oriz ? 297 : 210; }, getHeight: function () { return oriz ? 210 : 297; } },
                   getNumberOfPages: function () { return d._pagine; } };
    ['setFillColor', 'rect', 'setFont', 'setTextColor', 'roundedRect', 'setDrawColor', 'setLineWidth', 'line', 'addImage', 'setPage']
        .forEach(function (k) { d[k] = function () {}; });
    d.setFontSize = function (s) { d._fs = s; };
    d.text = function (t) { d.testi.push(Array.isArray(t) ? t.join(' ') : String(t)); };
    d.getTextWidth = function (t) { return String(t).length * d._fs * 0.18; };
    d.splitTextToSize = function (t) { return [String(t)]; };
    d.addPage = function () { d._pagine++; };
    d.save = function (n) { d.salvato = n; };
    d.output = function () { return new ArrayBuffer(8); };
}
var FIX = {
    'rif2_asp_alz.scr': fs.readFileSync(path.join(__dirname, 'fixtures', 'rif2_asp_alz.scr'), 'utf8'),
    'rif2_sca_alz.scr': fs.readFileSync(path.join(__dirname, 'fixtures', 'rif2_sca_alz.scr'), 'utf8'),
    // un _alz.scr che non e' una misura (3 righe valide), e uno che in piu'
    // si dichiara gia' convertito: respinti, non devono toccare niente
    'rotto_alz.scr': '1,0.1\n2,0.2\n3,0.3\n',
    'rotto_conv_alz.scr': '_pline_conv:bicch:33\n1,0.1\n2,0.2\n'
};
var elencoArchivio = [
    { name: 'rif2_sca_alz.scr', type: 'alz', size: 1, mtime: Date.parse('2026-11-20T10:00:00Z') },
    { name: 'rif2_asp_alz.scr', type: 'alz', size: 1, mtime: Date.parse('2026-11-19T10:00:00Z') },
    { name: 'vecchio_pol.scr', type: 'pol', size: 1, mtime: Date.parse('2026-11-18T10:00:00Z') },
    { name: 'note_alz.txt', type: 'alz', size: 1, mtime: Date.parse('2026-11-17T10:00:00Z') }
];
function rispostaFinta(corpoR, ok) {
    return Promise.resolve({ ok: ok !== false, status: ok === false ? 404 : 200,
        json: function () { return Promise.resolve(typeof corpoR === 'string' ? JSON.parse(corpoR) : corpoR); },
        text: function () { return Promise.resolve(typeof corpoR === 'string' ? corpoR : JSON.stringify(corpoR)); } });
}
function fetchFinto(url, opt) {
    catture.fetch.push({ url: url, metodo: (opt && opt.method) || 'GET' });
    if (url === '/api/files' && catture.archivioGuasto) return Promise.reject(new Error('rete assente'));
    if (url === '/api/files') return rispostaFinta({ files: elencoArchivio });
    if (url === '/api/settings') return rispostaFinta({});
    if (url.indexOf('/api/file/') === 0) {
        if (opt && opt.method === 'POST') return rispostaFinta({ ok: true });
        var nome = decodeURIComponent(url.slice('/api/file/'.length));
        return FIX[nome] ? rispostaFinta(FIX[nome]) : rispostaFinta('Not found', false);
    }
    return rispostaFinta({});
}
var ctx = {
    console: console, Math: Math, Number: Number, String: String, Object: Object, Array: Array, JSON: JSON,
    Date: Date, isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Promise: Promise,
    ArrayBuffer: ArrayBuffer, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    document: documento, Chart: ChartFinto, fetch: fetchFinto, FileReader: FileReaderFinto,
    localStorage: { getItem: function (k) { return registro[k] === undefined ? null : registro[k]; }, setItem: function (k, v) { registro[k] = String(v); } },
    Blob: function (parti) { catture.blob = parti.join(''); },
    URL: { createObjectURL: function () { return 'blob:finto'; }, revokeObjectURL: function () {} },
    URLSearchParams: URLSearchParams,
    location: { search: '' },
    performance: { now: function () { return Date.now(); } },
    matchMedia: function () { return { matches: false }; },
    addEventListener: function () {},
    jspdf: { jsPDF: DocFinto },
    CAMMES_VERSION: '3.8.0',
    cammesToast: function (o) { catture.toast.push({ titolo: o.title || '', testo: o.body || '' }); },
    cammesGetCssVar: function () { return ''; },
    cammesIntestazionePdf: function () {},
    cammesDialog: function (o) { catture.dialoghi.push(o); return Promise.resolve({ scelta: catture.sceltaDialogo, testo: null }); },
    cammesConferma: function (titolo, testo) {
        catture.dialoghi.push({ titolo: titolo, testo: testo });
        return Promise.resolve(catture.rispostaConferma !== false);
    }
};
Object.keys(M).forEach(function (k) { ctx[k] = M[k]; });
ctx.window = ctx;
vm.createContext(ctx);

function testoVisibile(id) { var e = elementi[id]; return e ? String(e.textContent || e.innerHTML || '') : ''; }
function aspetta() { return new Promise(function (r) { setImmediate(r); }); }

(async function () {
    var script = /<script>\n([\s\S]*?)<\/script>\s*\n\s*<\/body>/.exec(HTML);
    var errore = null;
    try {
        vm.runInContext(script[1], ctx, { filename: 'analisi.html' });
        documento.readyState = 'complete';
        alCaricamento.forEach(function (f) { f(); });
        ctx.onload();
        for (var q = 0; q < 6; q++) await aspetta();
    } catch (e) { errore = e; }
    check('lo script della pagina parte senza errori', !errore, errore ? String(errore.stack).split('\n').slice(0, 3).join(' | ') : '');
    if (errore) { finisci(); return; }

    // ---- passi all'apertura ----
    check('all apertura: passo 1 "da fare" e evidenziato', testoVisibile('passo1Stato') === 'da fare' &&
        elementi.passo1.classList.contains('corrente'));
    check('...passo 3 conta i valori da confermare (angoli lobo e gioco)', /^4 valori da confermare$/.test(testoVisibile('passo3Stato')), testoVisibile('passo3Stato'));
    check('...e sotto i passi la legenda del bordo tratteggiato e a vista', elementi.legendaTratteggio.style.display === '');
    var opz = elementi.sceltaArchivioIntake.options.map(function (o) { return o.value; });
    check('la tendina dell archivio ha solo le misure _alz.scr, le piu recenti in cima',
        JSON.stringify(opz) === JSON.stringify(['', 'rif2_sca_alz.scr', 'rif2_asp_alz.scr']), JSON.stringify(opz));
    check('il grafico vuoto mostra la frase', elementi.graficoVuoto.style.display !== 'none');

    // ---- carica dall'archivio ----
    catture.toast.length = 0;
    ctx.caricaDaArchivio('intake', 'rif2_asp_alz.scr');
    ctx.caricaDaArchivio('exhaust', 'rif2_sca_alz.scr');
    for (var q2 = 0; q2 < 6; q2++) await aspetta();
    check('scegliere dall archivio carica subito la misura (aspirazione e scarico)', vm.runInContext('intakeLoaded && exhaustLoaded', ctx));
    check('la riga di stato scrive il picco con la virgola', /picco grezzo \d+,\d\d mm a \d+° camma/.test(testoVisibile('intakeStatus')), testoVisibile('intakeStatus'));
    check('passi 1 e 2 fatti, "Ricarica" a vista', testoVisibile('passo1Stato') === 'fatto' && testoVisibile('passo2Stato') === 'fatto' &&
        elementi.ricaricaIntake.style.display === '');
    check('il grafico vuoto non copre piu le curve', elementi.graficoVuoto.style.display === 'none');

    // ---- il grafico dei 720 gradi: 0 = PMS di incrocio, tacche ogni 90, PMI-PMS-PMI ----
    var cfgLinea = ctx.analisiLine && ctx.analisiLine.config;
    var etich = cfgLinea ? cfgLinea.data.labels : [];
    check('asse dei gradi come la scheda camma: da -359 a 360, 0 = PMS di incrocio',
        etich.length === 720 && etich[0] === -359 && etich[359] === 0 && etich[719] === 360, etich.length + ' etichette, ' + etich[0] + '..' + etich[719]);
    var tacca = cfgLinea ? cfgLinea.options.scales.x.ticks.callback : null;
    var scalaIntera = { min: 0, max: 719, getLabelForValue: function (v) { return etich[v]; } };
    var scalaZoom = { min: 300, max: 420, getLabelForValue: function (v) { return etich[v]; } };
    check('tacche ogni 90 gradi a grafico intero (niente piu 1, 57, 113...)', !!tacca &&
        tacca.call(scalaIntera, 359) === '0' && tacca.call(scalaIntera, 179) === '-180' && tacca.call(scalaIntera, 539) === '180' &&
        tacca.call(scalaIntera, 100) === null && tacca.call(scalaIntera, 389) === null);
    check('...piu fitte quando si ingrandisce (qui ogni 10)', !!tacca && tacca.call(scalaZoom, 349) === '-10' && tacca.call(scalaZoom, 352) === null);
    var pm = (catture.pluginRegistrati || []).filter(function (p) { return p && p.id === 'puntiMorti'; })[0];
    var scritteLinee = [];
    if (pm) pm.afterDatasetsDraw({
        scales: { x: { getPixelForValue: function (v) { return v; } } },
        chartArea: { left: 0, right: 719, top: 0, bottom: 300 },
        options: { scales: { x: { ticks: { color: '#333333' } } } },
        ctx: { save: function () {}, restore: function () {}, beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
               stroke: function () {}, setLineDash: function () {}, fillText: function (t, x) { scritteLinee.push(t + '@' + x); } }
    });
    check('linee tratteggiate PMI - PMS - PMI sui grafici dei 720 gradi', scritteLinee.join(' ') === 'PMI@179 PMS@359 PMI@539', scritteLinee.join(' '));
    check('...e i grafici di velocita, accelerazione e forze usano lo stesso asse',
        vm.runInContext("kinChartOptions('mm').scales.x.ticks.callback === taccaGradiMotore", ctx));

    // ---- un nome cattivo nell'indirizzo non diventa codice ----
    catture.toast.length = 0; catture.fetch.length = 0;
    ctx.location.search = '?asp=' + encodeURIComponent('<img src=x onerror=alert(1)>.scr');
    ctx.caricaDaIndirizzo();
    for (var qx = 0; qx < 6; qx++) await aspetta();
    var tCattivo = catture.toast.filter(function (t) { return t.titolo === 'Misura non caricata'; })[0];
    check('?asp=<img onerror=...>: la notifica lo scrive come testo, non come HTML',
        !!tCattivo && tCattivo.testo.indexOf('<img') < 0 && tCattivo.testo.indexOf('&lt;img') >= 0, tCattivo ? tCattivo.testo.slice(0, 90) : 'notifica assente');
    check('...e non chiede niente all archivio', !catture.fetch.some(function (f) { return /api\/file\//.test(f.url); }));
    check('...e le misure caricate restano quelle', vm.runInContext("intakeFileBase === 'rif2_asp_alz' && intakeLoaded", ctx));
    ctx.location.search = '';

    // ---- un file respinto non cambia niente ----
    catture.toast.length = 0;
    ctx.caricaDaArchivio('exhaust', 'rotto_alz.scr', { annuncia: true });
    for (var qr = 0; qr < 6; qr++) await aspetta();
    check('file respinto: "File non riconosciuto", e la misura di prima resta in uso',
        catture.toast.some(function (t) { return t.titolo === 'File non riconosciuto' && /resta in uso la misura di prima/.test(t.testo); }));
    check('...senza il "Caricata dall archivio" subito dopo', !catture.toast.some(function (t) { return /Caricata dall'archivio/.test(t.titolo); }));
    check('...il nome sui documenti resta quello della misura in uso (non "rotto_alz")', vm.runInContext("exhaustFileBase", ctx) === 'rif2_sca_alz',
        vm.runInContext("exhaustFileBase", ctx));
    check('...e la tendina torna sulla misura in uso', elementi.sceltaArchivioExhaust.value === 'rif2_sca_alz.scr', elementi.sceltaArchivioExhaust.value);
    elementi.followerType.value = 'bicch';
    catture.toast.length = 0;
    ctx.caricaDaArchivio('intake', 'rotto_conv_alz.scr');
    for (var qr2 = 0; qr2 < 6; qr2++) await aspetta();
    check('un file respinto che si dichiara gia convertito non cambia la punteria simulata',
        elementi.followerType.value === 'bicch' && !catture.toast.some(function (t) { return /convertita/.test(t.titolo); }), elementi.followerType.value);
    elementi.followerType.value = 'punt';
    elementi.fileExhaust.value = 'C:\\fakepath\\rotto_alz.scr';
    elementi.fileExhaust.files = [{ name: 'rotto_alz.scr', _testo: FIX['rotto_alz.scr'] }];
    ctx.fileScelto('exhaust', elementi.fileExhaust);
    for (var qr3 = 0; qr3 < 6; qr3++) await aspetta();
    check('file del disco respinto: non resta scritto accanto a "Scegli file", la tendina torna sulla misura in uso',
        elementi.fileExhaust.value === '' && elementi.sceltaArchivioExhaust.value === 'rif2_sca_alz.scr' && vm.runInContext("exhaustFileBase", ctx) === 'rif2_sca_alz');
    elementi.fileIntake.files = [{ name: 'rif2_asp_alz.scr', _testo: FIX['rif2_asp_alz.scr'] }];
    ctx.fileScelto('intake', elementi.fileIntake);
    for (var qr4 = 0; qr4 < 6; qr4++) await aspetta();
    check('misura presa da un file del disco: niente "Ricarica" (il browser non rilegge un file cambiato)',
        vm.runInContext('intakeLoaded', ctx) && elementi.ricaricaIntake.style.display === 'none' && elementi.sceltaArchivioIntake.value === '');
    FIX['strano_alz.scr'] = FIX['rif2_asp_alz.scr'].replace(/^_pline/, '_pline_conv:<img src=x onerror=alert(1)>');
    catture.toast.length = 0;
    ctx.caricaDaArchivio('intake', 'strano_alz.scr');
    for (var qr5 = 0; qr5 < 6; qr5++) await aspetta();
    var tConv = catture.toast.filter(function (t) { return /convertita/.test(t.titolo); })[0];
    check('un codice di punteria strano letto da un file resta testo (notifica e riga "Conti fatti su")',
        !!tConv && tConv.testo.indexOf('<img') < 0 && elementi.contiIntake.innerHTML.indexOf('<img') < 0 && elementi.contiIntake.innerHTML.indexOf('&lt;img') >= 0,
        tConv ? tConv.testo.slice(0, 80) : 'notifica assente');
    ctx.caricaDaArchivio('intake', 'rif2_asp_alz.scr');
    for (var qr6 = 0; qr6 < 6; qr6++) await aspetta();
    check('di nuovo dall archivio: "Ricarica" torna a vista', elementi.ricaricaIntake.style.display === '' && vm.runInContext("intakeFileBase === 'rif2_asp_alz'", ctx));

    // ---- Confronto A vs B: il set A sono le misure gia' caricate nel pannello ----
    catture.toast.length = 0;
    ctx.usaMisurePannelloPerA();
    check('A vs B, "Usa le misure del pannello": il set A sono le due misure caricate, e lo dice',
        elementi.abOrigineA.style.display === '' &&
        /<b>rif2_asp_alz<\/b> \(aspirazione\) e <b>rif2_sca_alz<\/b> \(scarico\)/.test(elementi.abOrigineA.innerHTML), elementi.abOrigineA.innerHTML);
    perId('fileB_int').files = []; perId('fileB_exh').files = [];       // B non ancora scelto
    ctx.runABComparison();
    for (var qa = 0; qa < 4; qa++) await aspetta();
    var tMancaB = catture.toast.filter(function (t) { return /Mancano delle misure/.test(t.titolo); })[0];
    check('...senza i file di B dice che manca solo B',
        !!tMancaB && /B aspirazione/.test(tMancaB.testo) && !/A aspirazione|A scarico/.test(tMancaB.testo), tMancaB ? tMancaB.testo : 'notifica assente');
    elementi.fileB_int.files = [{ name: 'rif2_asp_alz.scr', _testo: FIX['rif2_asp_alz.scr'] }];
    elementi.fileB_exh.files = [{ name: 'rif2_sca_alz.scr', _testo: FIX['rif2_sca_alz.scr'] }];
    catture.toast.length = 0;
    ctx.runABComparison();
    for (var qa2 = 0; qa2 < 6; qa2++) await aspetta();
    check('...con i due file di B il confronto parte (stesse misure: differenza zero)',
        elementi.abResultsWrap.style.display === 'block' && catture.toast.some(function (t) { return t.titolo === 'Confronto A vs B'; }) &&
        /◆ 0,00<\/span>/.test(elementi.abMaxIn.innerHTML), elementi.abMaxIn.innerHTML.slice(0, 120));
    ctx.abFileSceltoA();
    check('...un file scelto per il set A: il set A torna ai file e la riga sparisce',
        elementi.abOrigineA.style.display === 'none' && vm.runInContext('_abA_dalPannello', ctx) === null);
    ctx.usaMisurePannelloPerA();
    ctx.resetAB();
    check('...e "Svuota" toglie anche le misure prese dal pannello', elementi.abOrigineA.style.display === 'none' && vm.runInContext('_abA_dalPannello', ctx) === null);
    elementi.fileB_int.files = []; elementi.fileB_exh.files = [];

    // ---- comando valvola ----
    elementi.intakeType.value = 'rocker_pushrod';
    ctx.onTypologyChange('intake');
    check('aste e bilanciere con rapporto 1,00: lo dice a chiare lettere',
        elementi.avvisoRapportoIntake.style.display === '' && /Rapporto bilanciere 1,00: alzata valvola = alzata camma/.test(elementi.avvisoRapportoIntake.innerHTML));
    check('...e il campo del rapporto resta visibile anche in vista Base', elementi.rowRockerIntake.classList.contains('mostra-in-base'));
    check('la riga "Conti fatti su" dice punteria e rapporto', /Conti fatti su: <b>nessuna punteria simulata \(curva del puntalino\)<\/b> &middot; rapporto bilanciere <b>1,00<\/b>/.test(elementi.contiIntake.innerHTML),
        elementi.contiIntake.innerHTML.slice(0, 120));
    elementi.rockerIntake.value = '1.5';
    ctx.aggiornaComandoValvola();
    check('scritto il rapporto, l avviso sparisce e la riga lo riporta con la virgola',
        elementi.avvisoRapportoIntake.style.display === 'none' && /rapporto bilanciere <b>1,50<\/b>/.test(elementi.contiIntake.innerHTML));
    elementi.rockerIntake.value = '1.00';
    elementi.intakeType.value = '';
    ctx.onTypologyChange('intake');
    check('tornando a "da scegliere" l avviso sparisce', elementi.avvisoRapportoIntake.style.display === 'none');

    // ---- analizza ----
    catture.toast.length = 0;
    ctx.analyze();
    check('l analisi produce i risultati', !!vm.runInContext('lastAnalysis', ctx));
    var RES = ['resMaxLiftIn', 'resMaxLiftEx', 'resCamLiftIn', 'resCamLiftEx', 'resDurIn', 'resDurEx', 'resDurRefIn', 'resDurRefEx', 'resLSA',
               'resIntCenter', 'resExCenter', 'resIntOpen', 'resIntClose', 'resExOpen', 'resExClose', 'resOverlap', 'resLiftInTDC',
               'resLiftExTDC', 'resAreaIn', 'resAreaEx', 'resAreaDelta', 'resAsymIn', 'resAsymEx'];
    var conPunto = RES.filter(function (id) { return /\d\.\d/.test(testoVisibile(id)); });
    check('nessun numero col punto decimale nella tabella dei risultati', conPunto.length === 0, conPunto.map(function (id) { return id + '=' + testoVisibile(id); }).join(' '));
    check('alzata massima valvola a schermo, con la riserva del gioco', /^\d+,\d\d mm \(da confermare\)$/.test(testoVisibile('resMaxLiftIn')), testoVisibile('resMaxLiftIn'));
    check('alzata massima camma a schermo', /^\d+,\d\d mm$/.test(testoVisibile('resCamLiftIn')), testoVisibile('resCamLiftIn'));
    check('apertura e chiusura in parole', /° (prima del|dopo il) PMS/.test(testoVisibile('resIntOpen')) && /° (prima del|dopo il) PMI/.test(testoVisibile('resExOpen')),
        testoVisibile('resIntOpen') + ' / ' + testoVisibile('resExOpen'));
    check('i nomi delle durate dicono la soglia', testoVisibile('resDurLabel') === 'Durata aspirazione al gioco (0,50 mm)' &&
        testoVisibile('resDurRefLabel') === 'Durata aspirazione a 1,00 mm di alzata', testoVisibile('resDurLabel') + ' / ' + testoVisibile('resDurRefLabel'));
    check('centro lobo con il verso a parole', /dopo il PMS/.test(testoVisibile('resIntCenter')) && /prima del PMS/.test(testoVisibile('resExCenter')));
    check('in testa ai risultati: a che cosa sono riferiti i conti', elementi.riferimentoConti.style.display === '' && /Valori riferiti a:/.test(elementi.riferimentoConti.innerHTML));
    check('grafici calcolati ma spenti: una riga che resta, non una notifica',
        elementi.notaGraficiNascosti.style.display === '' && !catture.toast.some(function (t) { return /Grafici non visibili/.test(t.titolo); }));
    var eseguita = catture.toast.filter(function (t) { return t.titolo === 'Analisi eseguita'; })[0];
    check('la notifica "Analisi eseguita" non ripete i numeri e rimanda alla nota', !!eseguita && !/\d+,\d°|separazione lobi/i.test(eseguita.testo) && /da confermare/.test(eseguita.testo),
        eseguita ? eseguita.testo : 'assente');
    check('passo 4 fatto dopo Analizza', testoVisibile('passo4Stato') === 'fatto');
    elementi.intakeAngle.value = '104';
    ctx.markAnalysisStale();
    check('cambiato un valore: passo 4 "da rifare" e avviso in testa ai risultati',
        testoVisibile('passo4Stato') === 'da rifare' && elementi.risultatiScaduti.style.display === '');
    check('...e i numeri vecchi restano, attenuati', elementi.resultsCard.classList.contains('risultati-vecchi') && testoVisibile('resDurIn') !== '');
    elementi.intakeAngle.value = '100';
    ctx.analyze();
    check('rifatta l analisi i numeri tornano pieni', !elementi.resultsCard.classList.contains('risultati-vecchi'));

    // ---- prima di esportare: quali valori sono ancora di partenza ----
    catture.dialoghi.length = 0; catture.blob = null; catture.fuoco = null; catture.toast.length = 0;
    catture.sceltaDialogo = 'controlla';
    ctx.exportCSV();
    for (var qe = 0; qe < 4; qe++) await aspetta();
    var dEsp = catture.dialoghi[0];
    check('esportare con valori di partenza: una finestra della pagina dice quali',
        !!dEsp && /angolo lobo asp\./.test(dEsp.testo) && /gioco valvola asp\./.test(dEsp.testo) &&
        dEsp.pulsanti.some(function (p) { return p.testo === 'Esporta lo stesso'; }), dEsp ? dEsp.testo.slice(0, 120) : 'nessuna finestra');
    check('..."Li controllo adesso": niente file, e il fuoco va al primo valore da confermare',
        catture.blob === null && catture.fuoco === 'intakeAngle', 'fuoco=' + catture.fuoco);
    catture.sceltaDialogo = 'esporta';

    // ---- CSV ----
    catture.toast.length = 0;
    ctx.exportCSV();
    for (var qe2 = 0; qe2 < 4; qe2++) await aspetta();
    var nDialoghiDopoCsv = catture.dialoghi.length;
    var csv = catture.blob || '';
    var righe = csv.replace(/^\uFEFF/, '').split('\r\n');
    check('il CSV comincia col segno UTF-8 per Excel', csv.charCodeAt(0) === 0xFEFF);
    var tCsv = catture.toast.filter(function (t) { return t.titolo === 'Tabella CSV salvata'; })[0];
    check('il nome del CSV porta la misura e l ora, come scheda e referto', !!tCsv && /^analisi_rif2_asp_\d{8}_\d{4}\.csv:/.test(tCsv.testo),
        tCsv ? tCsv.testo.slice(0, 60) : 'notifica assente');
    check('la seconda riga dice il formato', /^# Formato;colonne separate da punto e virgola, decimali con la virgola/.test(righe[1] || ''), righe[1]);
    check('le righe "# DA CONFERMARE" restano', righe.some(function (r) { return /^# DA CONFERMARE;gioco valvola/.test(r); }) &&
        righe.some(function (r) { return /^# DA CONFERMARE;angoli lobo/.test(r); }));
    var iInt = righe.indexOf(righe.filter(function (r) { return /^grado motore;alzata asp\. \[mm\]/.test(r); })[0]);
    check('intestazione delle colonne in italiano', iInt > 0, iInt > 0 ? righe[iInt].slice(0, 80) : 'assente');
    var dati = righe.slice(iInt + 1).filter(function (r) { return /^\d+;/.test(r); });
    check('720 righe grado per grado', dati.length === 720, dati.length + ' righe');
    check('...con la virgola decimale e il punto e virgola', dati.length > 0 && dati.every(function (r) { return !/\./.test(r) && r.split(';').length >= 9; }), dati[100]);
    var riepilogo = righe.slice(0, iInt).filter(function (r) { return r && !/^# (Misura|File|Data e ora|Impronta)/.test(r); });
    var colPunto = riepilogo.filter(function (r) { return /(^|[;\s(])-?\d+\.\d+/.test(r); });
    check('nessun decimale col punto nel riepilogo', colPunto.length === 0, colPunto.slice(0, 3).join(' | '));
    check('comando valvola scritto per esteso (non il codice interno)', righe.some(function (r) { return r === '# Comando valvola asp.;non dichiarato'; }));
    check('la misura si chiama misura anche nel CSV', righe.some(function (r) { return r === '# Misura asp.;rif2_asp_alz'; }) &&
        !righe.some(function (r) { return /^# File asp\./.test(r); }));

    // ---- scheda camma ----
    testiCanvas.length = 0;
    ctx.exportCamCard(true);
    var sc = catture.doc ? catture.doc.testi : [];
    var tSc = sc.join(' | ');
    check('scheda camma: titolo in italiano, note e non REMARKS', sc.indexOf('SCHEDA CAMMA') >= 0 && !/CAM CARD|REMARKS/.test(tSc) && sc.indexOf('NOTE') >= 0);
    check('scheda camma: niente sigle inglesi ne "deg"', !/BTDC|ATDC|BBDC|ABDC|\bdeg\b|overlap/i.test(tSc), (tSc.match(/.{0,20}(BTDC|ATDC|BBDC|ABDC|deg|overlap).{0,10}/i) || [''])[0]);
    var iSep = sc.indexOf('separazione dei lobi (LSA) *'), iPicco = sc.indexOf('picco sul banco (° camma)');
    check('scheda camma: separazione dei lobi detta per esteso (un nome solo), con l asterisco', iSep >= 0);
    check('scheda camma: il picco sul banco (gradi camma) sta in fondo, staccato da angolo lobo e fasatura',
        iPicco > iSep && sc.indexOf('apre *') > sc.indexOf('angolo lobo (dichiarato) *') && sc.indexOf('apre *') < iPicco, 'separazione@' + iSep + ' picco@' + iPicco);
    check('scheda camma: in testa, in chiaro, di quali misure e', sc.some(function (t) { return /^Misure: aspirazione rif2_asp_alz .* scarico rif2_sca_alz$/.test(t); }));
    check('scheda camma: le ripetizioni si chiamano giri (non passate)', sc.some(function (t) { return /ripetibilità: aspirazione (media di \d+ giri|un giro solo)/.test(t); }) &&
        !/passat/.test(tSc));
    check('scheda camma: numeri con la virgola', sc.some(function (t) { return /^\d+,\d\d mm$/.test(t); }) &&
        !sc.some(function (t) { return /^\d+\.\d+ mm$/.test(t); }));
    check('scheda camma: data in formato italiano', sc.some(function (t) { return /stampata il \d\d\/\d\d\/\d{4}/.test(t); }));
    check('scheda camma: sotto il diagramma la fasatura in parole', testiCanvas.some(function (t) { return /^ASPIRAZIONE  apre \d+° (prima del|dopo il) PMS/.test(t); }),
        testiCanvas.filter(function (t) { return /ASPIRAZIONE|SCARICO/.test(t); }).join(' | ').slice(0, 160));
    check('scheda camma: le riserve restano (asterischi e nota)', sc.some(function (t) { return /^# \* valori DICHIARATI/.test(t); }) &&
        sc.some(function (t) { return /^gioco valvola \*$/.test(t); }));

    // ---- referto ----
    catture.doc = null;
    ctx.exportPDF();
    check('una domanda sola per analisi: il referto non la ripete dopo il CSV', catture.dialoghi.length === nDialoghiDopoCsv && !!catture.doc);
    var pdf = catture.doc ? catture.doc.testi : [];
    var tPdf = pdf.join(' | ');
    check('referto: niente " deg", niente "Overlap", niente sigle', !/\bdeg\b|Overlap|\b(BTC|ABC|BBC|ATC|BTDC|ATDC)\b|METRICA|RPM target|Rocker/.test(tPdf),
        (tPdf.match(/.{0,20}(\bdeg\b|Overlap|BTC|ABC|BBC|ATC|BTDC|ATDC|METRICA|RPM target|Rocker).{0,10}/) || [''])[0]);
    check('referto: la data e quella dell officina, non la stringa di macchina', !/\d{4}-\d\d-\d\dT\d\d:/.test(tPdf) && /Analisi del \d\d\/\d\d\/\d{4}, ore/.test(tPdf));
    var iKpi = pdf.indexOf('ALZATA MASSIMA VALVOLA ASP. / SCAR.');
    check('referto: in copertina prima le misure, di aspirazione E scarico', iKpi >= 0 && iKpi < pdf.indexOf('SEPARAZIONE DEI LOBI (LSA)') &&
        pdf.indexOf('DURATA AL GIOCO ASP. / SCAR.') >= 0 && /^\d+,\d\d \/ \d+,\d\d mm$/.test(pdf[iKpi + 1] || ''), pdf[iKpi + 1]);
    check('referto: la riserva in copertina e del gioco, non del rapporto bilanciere',
        pdf.some(function (t) { return t === 'Rapporto bilanciere 1,00 / 1,00 · gioco DA CONFERMARE'; }) && !pdf.some(function (t) { return /^Rapporto bilanciere [\d,]+ - DA CONFERMARE$/.test(t); }));
    check('referto: "Misura asp./scar." e un nome solo per la separazione dei lobi',
        pdf.indexOf('Misura asp.') >= 0 && pdf.indexOf('File asp.') < 0 && pdf.indexOf('Separazione dei lobi (dichiarata) *') >= 0 && !/Separazione lobi/.test(tPdf));
    check('referto: molla e masse mai scritte sono segnate "(esempio)"', pdf.some(function (t) { return /^30 N\/mm \(esempio\)$/.test(t); }));
    check('referto: nessun ordine al cliente sulla molla', !/inserisci k|TUO motore/i.test(tPdf));
    check('referto: le riserve restano', pdf.some(function (t) { return /^\* discende da valori DICHIARATI/.test(t); }) &&
        pdf.some(function (t) { return t === 'Durata al gioco *'; }));

    // ---- salva in archivio: chiede prima di sostituire ----
    // In archivio c'e' gia' anche la copia "con nome nuovo" di questo minuto
    // (e del prossimo, se il minuto scatta durante il test): la nuova copia
    // non deve finirle sopra.
    function tsDi(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); }
    var copie = [tsDi(new Date()), tsDi(new Date(Date.now() + 60000))].map(function (t) {
        return { name: 'rif2_asp_' + t + '_alz.scr', type: 'alz', size: 1, mtime: Date.now() };
    });
    copie.forEach(function (c) { elencoArchivio.push(c); });
    catture.dialoghi.length = 0; catture.fetch.length = 0;
    catture.sceltaDialogo = 'nuovo';
    ctx.saveProfileToArchive();
    for (var q3 = 0; q3 < 8; q3++) await aspetta();
    var dlg = catture.dialoghi[0];
    check('la misura esiste gia: finestra della pagina con "Sostituisci" e "Salva con un nome nuovo"',
        !!dlg && dlg.pulsanti.some(function (p) { return p.testo === 'Sostituisci'; }) && dlg.pulsanti.some(function (p) { return p.testo === 'Salva con un nome nuovo'; }));
    var post = catture.fetch.filter(function (f) { return f.metodo === 'POST'; }).map(function (f) { return decodeURIComponent(f.url); });
    check('"nome nuovo": il file originale non viene toccato', post.length === 2 && post.every(function (u) { return /_\d{8}_\d{4}(_\d+)?_alz\.scr$/.test(u); }), post.join(', '));
    check('...e nemmeno una copia salvata nello stesso minuto (si aggiunge _2)',
        post.some(function (u) { return /rif2_asp_\d{8}_\d{4}_2_alz\.scr$/.test(u); }) &&
        !post.some(function (u) { return copie.some(function (c) { return u === '/api/file/' + c.name; }); }), post.join(', '));
    elencoArchivio.splice(elencoArchivio.length - copie.length, copie.length);
    // archivio che non risponde: si chiede, non si sostituisce alla cieca
    catture.archivioGuasto = true; catture.rispostaConferma = false;
    catture.dialoghi.length = 0; catture.fetch.length = 0;
    ctx.saveProfileToArchive();
    for (var q3b = 0; q3b < 8; q3b++) await aspetta();
    check('archivio che non risponde: chiede prima di salvare, e "no" non scrive niente',
        catture.dialoghi.some(function (d) { return /Non riesco a controllare/.test(d.titolo); }) &&
        !catture.fetch.some(function (f) { return f.metodo === 'POST'; }));
    catture.rispostaConferma = true; catture.dialoghi.length = 0; catture.fetch.length = 0;
    ctx.saveProfileToArchive();
    for (var q3c = 0; q3c < 8; q3c++) await aspetta();
    check('...e "Salva lo stesso" salva', catture.fetch.filter(function (f) { return f.metodo === 'POST'; }).length === 2);
    catture.archivioGuasto = false;
    await ctx.riempiSceltaArchivio();

    // ---- Invio conferma un valore: l'analisi va rifatta ----
    function premiInvio(id) { (elementi[id]._ascolta.keydown || []).forEach(function (f) { f({ key: 'Enter' }); }); }
    ctx.analyze();
    var h0 = vm.runInContext('paramsHash()', ctx);
    premiInvio('intakeClearance');
    check('Invio sul gioco: il valore e confermato e l analisi e da rifare',
        elementi.intakeClearance.dataset.confermato === '1' && vm.runInContext('_analysisStale', ctx) === true &&
        testoVisibile('passo4Stato') === 'da rifare' && elementi.resultsCard.classList.contains('risultati-vecchi'));
    check('...l impronta dei valori cambia: i documenti si fermano finche non si rifa Analizza',
        vm.runInContext('paramsHash()', ctx) !== h0 && vm.runInContext("requireFreshAnalysis('Il documento')", ctx) === null);
    ['intakeAngle', 'exhaustAngle', 'exhaustClearance'].forEach(premiInvio);
    check('tutti confermati: passo 3 fatto e la legenda del bordo tratteggiato sparisce',
        testoVisibile('passo3Stato') === 'fatto' && elementi.legendaTratteggio.style.display === 'none', testoVisibile('passo3Stato'));
    ctx.analyze();
    check('rifatta l analisi: niente piu "(da confermare)" su durate e alzata', !/da confermare/.test(testoVisibile('resDurIn')) &&
        !/da confermare/.test(testoVisibile('resMaxLiftIn')) && vm.runInContext('_analysisStale', ctx) === false, testoVisibile('resDurIn'));
    premiInvio('intakeAngle');
    check('Invio su un valore gia confermato non rende l analisi da rifare', vm.runInContext('_analysisStale', ctx) === false);
    catture.dialoghi.length = 0; catture.blob = null;
    ctx.exportCSV();
    for (var qe3 = 0; qe3 < 4; qe3++) await aspetta();
    check('niente da confermare: il CSV esce senza domande e senza "# DA CONFERMARE"',
        catture.dialoghi.length === 0 && !!catture.blob && catture.blob.indexOf('# DA CONFERMARE') < 0);

    // ---- dalla Home con l'indirizzo ----
    ctx.resetAll();
    check('Azzera tutto: misure tolte, comando valvola di nuovo da scegliere',
        !vm.runInContext('intakeLoaded', ctx) && elementi.intakeType.value === '' && testoVisibile('passo1Stato') === 'da fare');
    check('...i valori tornano da confermare e la legenda torna a vista',
        /^4 valori da confermare$/.test(testoVisibile('passo3Stato')) && elementi.legendaTratteggio.style.display === '');
    catture.toast.length = 0;
    ctx.usaMisurePannelloPerA();
    check('A vs B a pannello vuoto: "Usa le misure del pannello" dice di caricarle prima',
        catture.toast.some(function (t) { return t.titolo === 'Mancano le misure nel pannello'; }) && vm.runInContext('_abA_dalPannello', ctx) === null);
    catture.toast.length = 0;
    ctx.location.search = '?asp=rif2_asp_alz.scr&sca=rif2_sca_alz.scr';
    ctx.caricaDaIndirizzo();
    for (var q4 = 0; q4 < 8; q4++) await aspetta();
    check('analisi.html?asp=...&sca=... carica le due misure da sola', vm.runInContext('intakeLoaded && exhaustLoaded', ctx));
    check('...con la notifica "Caricata dall archivio"', catture.toast.filter(function (t) { return /Caricata dall'archivio/.test(t.titolo); }).length === 2);
    catture.toast.length = 0;
    ctx.caricaDaArchivio('exhaust', 'rif2_asp_alz.scr');
    for (var q5 = 0; q5 < 6; q5++) await aspetta();
    check('la stessa misura sui due lati viene segnalata', catture.toast.some(function (t) { return /Stessa misura sui due lati/.test(t.titolo); }) &&
        /stessa misura/.test(testoVisibile('passo2Stato')));

    finisci();
})().catch(function (e) {
    check('il giro completo della pagina non si interrompe', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
    finisci();
});

function finisci() {
    console.log('');
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: la pagina Analisi dice i passi, prende le misure dall archivio,');
    console.log('scrive i numeri con la virgola e le parole del glossario su schermo, CSV e PDF.');
    process.exit(0);
}
