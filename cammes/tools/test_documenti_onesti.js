// =============================================================
//  test_documenti_onesti.js — schermo e documenti dicono quello che il
//  programma sa, e niente di piu'
// =============================================================
//  DIFETTI trovati con l'analisi di usabilita' del 2026-11-15, segnalati da
//  piu' valutatori indipendenti (e, dove indicato, confermati da un secondo
//  controllo):
//
//   Home
//    - una verifica banco NON superata si leggeva "banco verificato il ..."
//      (confermato, gravita' 4);
//    - la Scheda PDF della singola misura stampava in testa la data della
//      STAMPA senza dirlo, ignorava una misura salvata INCOMPLETA e metteva
//      sul foglio del cliente "File contrassegnato tra i preferiti"
//      (confermato, gravita' 4);
//    - "Svuota archivio" diceva "per sempre" e "NON e' reversibile", mentre i
//      file vanno nel cestino per 30 giorni.
//   Analisi
//    - il fumetto di "Tipologia" prometteva un rapporto di leva che il
//      programma non applica;
//    - il gioco valvola nasce a 0,50 mm, che il suo fumetto chiama
//      "segnaposto", ma non era fra i campi "da confermare";
//    - la riserva "da confermare" restava sullo schermo: scheda camma,
//      referto e CSV stampavano fasatura e durate come misure;
//    - referto e Race report dicevano "OK", "(sicuro)", "motore sicuro" per un
//      calcolo statico con molla e masse dichiarate, e il Race report (solo
//      aspirazione) non lo dichiarava;
//    - la nota "Da confermare" stava nel modulo molla: in vista Base non si
//      vedeva;
//    - il fumetto del Reset diceva che i parametri restano, invece tornano ai
//      valori di partenza.
//   Confronto
//    - il "Raggio base" scritto con la virgola diventava 16 in silenzio.
//
//  Uso: node tools/test_documenti_onesti.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var lib = require('../lib/cammes-math.js');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggi(nome) { return fs.readFileSync(nome, 'utf8').replace(/\r\n/g, '\n'); }
var HOME = leggi(path.join(__dirname, '..', 'home.html'));
var ANALISI = leggi(path.join(__dirname, '..', 'analisi.html'));
var GRAFICI = leggi(path.join(__dirname, '..', 'grafici.html'));
var ALZATA = leggi(path.join(__dirname, '..', 'alzata.html'));
function vivo(src) { return src.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n'); }

// Estrae "function nome(...) {...}" o "var nome = ...;" contando le graffe e
// saltando stringhe e commenti (le funzioni di una riga non finiscono in "\n}\n").
function chiusura(src, da) {
    var prof = 0, i = da, n = src.length;
    for (; i < n; i++) {
        var c = src.charAt(i), d = src.charAt(i + 1);
        if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
        if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
        if (c === "'" || c === '"' || c === '`') {
            for (i++; i < n && src.charAt(i) !== c; i++) if (src.charAt(i) === '\\') i++;
            continue;
        }
        if (c === '{' || c === '[') prof++;
        if (c === '}' || c === ']') { prof--; if (prof === 0) return i; }
    }
    return -1;
}
function estrai(src, nome) {
    var m = new RegExp('^(?:async )?function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm').exec(src);
    if (!m) return null;
    var fine = chiusura(src, m.index + m[0].length - 1);
    return fine < 0 ? null : src.substring(m.index, fine + 1);
}
function estraiVar(src, nome) {
    var m = new RegExp('^var ' + nome + '\\s*=\\s*', 'm').exec(src);
    if (!m) return null;
    var inizio = m.index + m[0].length, c = src.charAt(inizio);
    if (c === '[' || c === '{') { var f = chiusura(src, inizio); return f < 0 ? null : src.substring(m.index, f + 1) + ';'; }
    return src.substring(m.index, src.indexOf(';', inizio) + 1);
}

console.log('=============================================================');
console.log(' DOCUMENTI ONESTI: lo schermo e i PDF non dicono piu del vero');
console.log('=============================================================');

// ---------------------------------------------------------------
console.log('');
console.log('--- Home: l esito della verifica banco ---');
var fVB = estrai(HOME, 'testoVerificaBanco');
check('la Home ha una funzione che scrive l esito', !!fVB);
if (fVB) {
    var cVB = { Date: Date, Math: Math, Number: Number, isFinite: isFinite };
    vm.createContext(cVB); vm.runInContext(fVB, cVB);
    var ora = Date.parse('2026-11-15T10:00:00Z');
    var no = cVB.testoVerificaBanco({ date: '2026-11-14T10:00:00Z', rms: 0.0321, max: 0.0957, pass: false }, ora);
    check('verifica NON superata: lo dice per esteso', /NON SUPERATA/.test(no.html), no.html);
    check('...senza la parola "verificato" che la faceva leggere come buona', !/verificato il/.test(no.html));
    check('...in rosso, non nell arancio di una verifica solo vecchia', /danger/.test(no.colore), no.colore);
    check('...con residuo RMS e massimo, scritti con la virgola', /0,032/.test(no.html) && /0,096/.test(no.html), no.html);
    var noVecchia = cVB.testoVerificaBanco({ date: '2026-09-01T10:00:00Z', rms: 0.03, max: 0.09, pass: false }, ora);
    check('una verifica fallita resta "NON SUPERATA" anche quando e vecchia', /NON SUPERATA/.test(noVecchia.html));
    var si = cVB.testoVerificaBanco({ date: '2026-11-14T10:00:00Z', rms: 0.012, max: 0.031, pass: true }, ora);
    check('verifica superata e recente: superata, in verde', /superata/.test(si.html) && /success/.test(si.colore), si.html);
    var siVecchia = cVB.testoVerificaBanco({ date: '2026-09-01T10:00:00Z', rms: 0.012, max: 0.031, pass: true }, ora);
    check('superata ma oltre 30 giorni: dice di rifarla', /30 giorni/.test(siVecchia.html) && /rifalla/.test(siVecchia.html), siVecchia.html);
    var mai = cVB.testoVerificaBanco(undefined, ora);
    check('mai fatta: lo dice e dice dove farla', /mai fatta/.test(mai.html) && /Verifica banco/.test(mai.html), mai.html);
}
check('il vecchio testo "banco verificato il" non esiste piu', !/banco verificato il/.test(vivo(HOME)));

// ---------------------------------------------------------------
console.log('');
console.log('--- Home: la Scheda PDF della singola misura ---');
var NOMI_HOME = ['metaDaFile', 'dataDellaMisura', 'misuraIncompleta', 'misuraSospetta', 'exportSinglePDF'];
var srcHome = {}, mancaHome = [];
NOMI_HOME.forEach(function (n) { srcHome[n] = estrai(HOME, n); if (!srcHome[n]) mancaHome.push(n); });
check('la Home ha le funzioni dei metadati', mancaHome.length === 0, mancaHome.join(', '));
if (!mancaHome.length) {
    var testi = [];
    function docFinto() {
        var d = { internal: { pageSize: { getWidth: function () { return 210; }, getHeight: function () { return 297; } } } };
        ['setFillColor', 'rect', 'setFont', 'setFontSize', 'setTextColor', 'roundedRect', 'setDrawColor',
         'setLineWidth', 'line', 'addImage'].forEach(function (k) { d[k] = function () {}; });
        d.text = function (t) { testi.push(Array.isArray(t) ? t.join(' ') : String(t)); };
        d.getTextWidth = function (t) { return String(t).length * 1.5; };
        d.save = function () {};
        return d;
    }
    var cH = {
        Date: Date, Math: Math, Number: Number, String: String, parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite,
        window: { jspdf: { jsPDF: docFinto }, cammesToast: function () {}, cammesIntestazionePdf: function () {} },
        document: { createElement: function () { return { getContext: function () { return null; } }; } },
        _quickViewChart: { data: { datasets: [{ data: [0.1, 9.61, 0.2] }], labels: [1, 160, 300] }, options: {},
                           canvas: { width: 700, height: 400 }, update: function () {}, draw: function () {} },
        getTagsForFile: function () { return []; },
        isBookmarked: function () { return true; },
        _cachedFiles: [{ name: 'prova_alz.scr', mtime: Date.parse('2026-11-01T09:00:00Z') }]
    };
    vm.createContext(cH);
    NOMI_HOME.forEach(function (n) { vm.runInContext(srcHome[n], cH); });
    var file = '_pline\n1,0.1\n2,9.61\n#data=2026-11-14T10:30:00.000Z\n#stato=INCOMPLETO\n#gradiMancanti=12\n#giroNonChiuso=0.045\n';
    cH.window._qvMeta = { file: 'prova_alz.scr', meta: vm.runInContext('metaDaFile(' + JSON.stringify(file) + ')', cH) };
    vm.runInContext("exportSinglePDF('prova_alz.scr', 'alz')", cH);
    var tutto = testi.join(' | ');
    check('in testa la data della MISURA, presa dal file', testi.some(function (t) { return /^Misura del 14\/11\/2026/.test(t); }), tutto.slice(0, 200));
    check('la data della stampa c e, ma si chiama cosi', testi.some(function (t) { return /^Stampata il /.test(t); }));
    check('la misura salvata INCOMPLETA lo dice sul foglio', testi.some(function (t) { return /MISURA INCOMPLETA: 12 gradi su 360 senza lettura/.test(t); }));
    check('...e quella salvata nonostante il giro non chiuso anche', testi.some(function (t) { return /MISURA SOSPETTA: giro non chiuso \(0,045 mm\)/.test(t); }));
    check('i preferiti (segno di lavoro dell officina) non vanno sul foglio del cliente', !/preferiti/i.test(tutto));
    testi.length = 0;
    cH.window._qvMeta = { file: 'prova_alz.scr', meta: {} };
    vm.runInContext("exportSinglePDF('prova_alz.scr', 'alz')", cH);
    check('un file vecchio senza data: quella del file in archivio, dichiarandolo',
        testi.some(function (t) { return /^Misura del 01\/11\/2026.*\(data del file\)/.test(t); }), testi.slice(0, 6).join(' | '));
    ['', '#giroNonChiuso=0.045', '#slittamento=1', '#giroNonChiuso=0.045\n#slittamento=1', '#giroNonChiuso=0'].forEach(function (righe) {
        var meta = vm.runInContext('metaDaFile(' + JSON.stringify(righe) + ')', cH);
        var h = vm.runInContext('misuraSospetta(' + JSON.stringify(meta) + ')', cH);
        check('Home e libreria danno lo stesso avviso per "' + righe.replace(/\n/g, ' ') + '"', h === lib.avvisoMisuraSospetta(meta), String(h));
    });
}
check('la finestra dei tag dice che finiscono sulla Scheda PDF', /compaiono anche sulla Scheda PDF/.test(HOME));
var clear = vivo(estrai(HOME, 'clearArchive') || '');
check('Svuota archivio dice il vero: cestino, 30 giorni', /CESTINO/.test(clear) && /30 giorni/.test(clear) && !/per sempre/.test(clear) && !/NON è reversibile/.test(clear));
check('...anche nella notifica finale (spostati nel cestino, non "eliminati")', /spostati nel cestino/.test(clear) && !/file eliminati/.test(clear));
check('l eliminazione di un file indica il cestino dove sta davvero', !/Sistema &rarr; Cestino/.test(HOME));

// ---------------------------------------------------------------
console.log('');
console.log('--- Analisi: il gioco valvola e un valore da confermare ---');
var VAR_AN = ['MODULES_KEY', 'CAMPI_MOLLA', 'MIN_CAMPO_MOLLA', 'CAMPI_GEOMETRIA', 'CAMPI_FASATURA', 'CAMPI_LEVA', 'CAMPI_TRENO', 'CAMPI_GIOCO', 'MIN_CAMPO_ALTRI'];
var FUN_AN = ['geometriaRilevante', 'giocoRilevante', 'giocoConfermato', 'campiDaConfermare', 'campoEConfermato', 'fasaturaConfermata', 'descriviCampiDaConfermare'];
var mancaAn = [];
var pezzi = VAR_AN.map(function (v) { var s = estraiVar(ANALISI, v); if (!s) mancaAn.push(v); return s; })
    .concat(FUN_AN.map(function (f) { var s = estrai(ANALISI, f); if (!s) mancaAn.push(f); return s; }));
check('Analisi ha il gioco fra i campi da confermare', mancaAn.length === 0, mancaAn.join(', '));
if (!mancaAn.length) {
    var el = {};
    ['springK', 'springPreload', 'massEqIntake', 'massEqExhaust', 'intakeAngle', 'exhaustAngle'].forEach(function (id) {
        el[id] = { value: '1', dataset: { confermato: '1' } };   // tutto confermato, tranne il gioco
    });
    el.intakeClearance = { value: '0.50', dataset: {}, disabled: false };
    el.exhaustClearance = { value: '0.50', dataset: {}, disabled: false };
    el.followerType = { value: 'punt' };
    el.complianceEnabled = { value: '0' };
    var cA = { Number: Number, String: String, JSON: JSON, isFinite: isFinite,
               document: { getElementById: function (id) { return el[id] || null; } },
               localStorage: { getItem: function () { return null; } } };
    vm.createContext(cA);
    pezzi.forEach(function (s) { vm.runInContext(s, cA); });
    var lista = cA.campiDaConfermare();
    check('il gioco al valore di partenza e "da confermare"', !cA.giocoConfermato() && lista.indexOf('intakeClearance') >= 0 && lista.indexOf('exhaustClearance') >= 0, JSON.stringify(lista));
    el.intakeClearance.dataset.confermato = '1'; el.exhaustClearance.dataset.confermato = '1';
    check('scritto dall operatore, e confermato', cA.giocoConfermato());
    el.intakeClearance = { value: '0.00', dataset: {}, disabled: true };   // bicchiere idraulico: bloccato a 0
    check('bloccato a 0 dal bicchiere idraulico non va confermato', cA.giocoConfermato() && cA.campiDaConfermare().indexOf('intakeClearance') < 0);
    var nota = cA.descriviCampiDaConfermare(['exhaustClearance']);
    check('la nota nomina il gioco e dice che cosa comporta', /gioco valvola scar\./.test(nota) && /durate, aperture e chiusure/.test(nota), nota.slice(0, 160));
}
var VA = vivo(ANALISI);
check('...e il primo tocco del campo lo conferma (stesso ascoltatore degli altri)',
    /CAMPI_MOLLA\.concat\(CAMPI_GEOMETRIA, CAMPI_FASATURA, CAMPI_GIOCO, CAMPI_LEVA, CAMPI_TRENO\)\.forEach\(function \(id\) \{\s*var el = document\.getElementById\(id\);\s*if \(!el\) return;\s*el\.addEventListener\('input'/.test(VA));
check('cambiare Tipologia ridisegna i campi da confermare', /function onTypologyChange[\s\S]{0,1200}aggiornaMarcaturaEsempio\(\)/.test(VA));
var iNota = ANALISI.indexOf('id="notaValoriEsempio"'), iDurata = ANALISI.indexOf('<!-- Durata -->');
check('la nota "Da confermare" sta in testa ai risultati, fuori dai moduli (prima era nel modulo molla)', iNota > 0 && iDurata > iNota, 'nota@' + iNota + ' durata@' + iDurata);

// ---------------------------------------------------------------
console.log('');
console.log('--- Analisi: la riserva arriva sullo schermo e nei documenti ---');
check('a schermo durate, aperture, chiusure, incrocio e alzata al PMS portano la riserva',
    ['resDurIn', 'resDurEx', 'resIntOpen', 'resIntClose', 'resExOpen', 'resExClose', 'resOverlap', 'resLiftInTDC', 'resLiftExTDC']
        .every(function (id) { return new RegExp("_riserva\\('" + id + "'").test(VA); }));
check('l analisi fotografa lo stato di conferma (i documenti dichiarano quello di Analizza)',
    /fasaturaConfermata: fasaturaConfermata\(\),\s*giocoConfermato: giocoConfermato\(\)/.test(VA));
var card = estrai(ANALISI, 'exportCamCard') || '';
check('scheda camma: asterisco sulle righe che discendono da valori non confermati',
    /row\('gioco valvola' \+ nG/.test(card) && /row\('apre' \+ nGF/.test(card) && /row\('chiude' \+ nGF/.test(card) &&
    /row\('alzata al PMS' \+ nGF/.test(card) && /row\('separazione dei lobi \(LSA\)' \+ nF/.test(card) && /row\('angolo lobo \(dichiarato\)' \+ nF/.test(card));
check('...e una nota che spiega l asterisco', /# \* valori DICHIARATI e non confermati/.test(card));
var pdf = estrai(ANALISI, 'exportPDF') || '';
check('referto: le stesse righe segnate, LSA e centri detti "dichiarati"',
    /'Durata al gioco' \+ pG/.test(pdf) && /'Separazione dei lobi \(dichiarata\)' \+ pF/.test(pdf) && /'Apertura' \+ pGF/.test(pdf) && /\* discende da valori DICHIARATI/.test(pdf));
check('referto: in copertina LSA e durata dicono da dove vengono', /Dagli angoli lobo dichiarati/.test(pdf) && /'Al gioco di '/.test(pdf));
check('referto: il banner descrive il conto (calcolo statico) invece di promettere sicurezza',
    /Margine sul distacco valvola \(calcolo statico/.test(pdf) && !/'OK · Margine ampio'/.test(vivo(pdf)));
check('referto: avvertenza di misura indicativa su ogni pagina, come la scheda camma', /Misura a carattere indicativo/.test(pdf));
var csv = estrai(ANALISI, 'exportCSV') || '';
check('CSV: la stessa riserva in testa al file',
    /giocoConfermato === false\)\s*lines\.push\('# DA CONFERMARE/.test(csv) && /fasaturaConfermata === false\)\s*lines\.push\('# DA CONFERMARE/.test(csv));
['motore sicuro', "(sicuro)'", 'OK · Margine ampio', 'Treno valvole adeguato', 'Accettabile per uso saltuario',
 'Documento completo per validare'].forEach(function (frase) {
    check('nessun verdetto piu forte del calcolo: "' + frase + '"', VA.indexOf(frase) < 0);
});
var race = estrai(ANALISI, 'exportRaceReport') || '';
check('Race report: in testa dichiara che simula il solo lato aspirazione', /solo lato ASPIRAZIONE/.test(race));
check('...e lo ripete nell esito "tutto bene"', /nel range testato \(solo aspirazione\)/.test(race));
check('il fumetto di Tipologia dice il vero: non cambia i conti', !/Determina il rapporto di trasmissione/.test(ANALISI) && /non cambia i conti/.test(ANALISI));
check('il fumetto del Reset dice che i parametri tornano ai valori di partenza', !/I parametri di configurazione restano/.test(ANALISI));
check('una misura salvata SOSPETTA lo dice anche in Analisi (aspirazione e scarico)', (VA.match(/avvisoMisuraSospetta\(camLift\.meta\)/g) || []).length === 2);

// ---------------------------------------------------------------
console.log('');
console.log('--- Confronto e Alzata ---');
check('Confronto: il raggio base passa dal lettore di numeri (virgola compresa), mai piu 16 in silenzio',
    !/Number\(\(document\.getElementById\('polRBase'\)/.test(GRAFICI) && /validaNumero\(elRB \? elRB\.value/.test(GRAFICI));
check('Confronto: una misura salvata SOSPETTA lo dice al caricamento', (vivo(GRAFICI).match(/avvisoMisuraSospetta\(cam\.meta\)/g) || []).length === 2);
check('Alzata: il fumetto di RESET non promette di azzerare l encoder', !/posizione encoder\.">/.test(ALZATA) && /Ricomincia da capo/.test(ALZATA));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: esito della verifica banco scritto per esteso; schede e referti con la data');
console.log('della misura, la riserva sui valori dichiarati e senza verdetti piu forti del calcolo.');
process.exit(0);
