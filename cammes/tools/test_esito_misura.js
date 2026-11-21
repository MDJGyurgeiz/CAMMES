// =============================================================
//  test_esito_misura.js — l'esito della misura e dello Zero virtuale
//  resta scritto, invece di sparire in una notifica di pochi secondi
// =============================================================
//  DIFETTI trovati con l'analisi di usabilita' del 2026-11-15 (rilievi
//  alzata-1 e alzata-2, confermati da un secondo controllo indipendente):
//
//   1. A fine giro il programma giudica la misura (gradi mancanti, giro non
//      chiuso, slittamento, punti non stabilizzati) ma lo diceva solo con
//      notifiche di 8-12 secondi, mentre l'operatore e' al banco. Subito dopo
//      usciva comunque il verde "Scansione completata"; la misura si salvava
//      senza domande e il giro non chiuso non lasciava traccia nel file: una
//      misura che il manuale dice di non usare diventava un file identico a
//      uno buono. E la scritta "file salvato" restava accanto a SALVA anche
//      dopo una misura nuova, non ancora salvata.
//   2. Lo Zero virtuale finisce ricaricando la pagina. Il ricaricamento era
//      muto in tutti i casi — fatto, gia' in posizione, spostamento interrotto,
//      mai confermato, encoder mancante — e dopo i cinque casi erano identici.
//      In piu' riportava Modalita', Ripetizioni e senso ai valori iniziali
//      senza dirlo: chi aveva scelto l'antiorario misurava poi nell'altro verso.
//
//  Uso: node tools/test_esito_misura.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' ESITO DELLA MISURA E DELLO ZERO VIRTUALE: resta scritto');
console.log('=============================================================');

var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
var VIVO = ALZATA.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');

function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    return fine < 0 ? null : ALZATA.substring(m.index, fine + 3);
}
var NOMI = ['riassuntoFineGiro', 'metadatiAvvisi', 'domandaMisuraSospetta',
            '_ricaricaDopoZeroVirtuale', 'testoEsitoZeroVirtuale', '_ripristinaDopoZeroVirtuale'];
var src = {}, mancanti = [];
NOMI.forEach(function (n) { src[n] = estrai(n); if (!src[n]) mancanti.push(n); });
check('la pagina ha le funzioni dell esito', mancanti.length === 0, mancanti.length ? 'mancano: ' + mancanti.join(', ') : '');

function nuovaPagina() {
    var p = { toasts: [], ricaricata: 0, cambiModo: 0, rlb: 0, memoria: {} };
    var el = {
        scanMode: { value: 'fast' }, scanRepeat: { value: '1' }
    };
    var casella = { checked: false };
    var ctx = {
        Math: Math, Number: Number, JSON: JSON, String: String, parseInt: parseInt, console: console,
        Date: Date,
        window: { cammesToast: function (o) { p.toasts.push(o); } },
        document: {
            getElementById: function (id) { return el[id] || null; },
            querySelector: function () { return casella; }
        },
        sessionStorage: {
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(p.memoria, k) ? p.memoria[k] : null; },
            setItem: function (k, v) { p.memoria[k] = String(v); },
            removeItem: function (k) { delete p.memoria[k]; }
        },
        location: { reload: function () { p.ricaricata++; } },
        SCAN_MODES: { fast: { label: 'Veloce' }, race: { label: 'Race' } },
        onScanModeChange: function () { p.cambiModo++; },
        rlb: function () { p.rlb++; ctx.rsign = -ctx.rsign; }
    };
    ctx.rsign = 1;
    vm.createContext(ctx);
    ['SOGLIA_GIRO_NON_CHIUSO', 'CHIAVE_ZERO_VIRTUALE'].forEach(function (k) {
        var m = new RegExp('^var ' + k + '\\s*=\\s*[^;]+;', 'm').exec(ALZATA);
        if (m) vm.runInContext(m[0], ctx);
    });
    NOMI.forEach(function (n) { if (src[n]) vm.runInContext(src[n], ctx); });
    p.ctx = ctx; p.el = el; p.casella = casella;
    p.val = function (e) { return vm.runInContext(e, ctx); };
    return p;
}

if (!mancanti.length) {
    // ---------------------------------------------------------------
    console.log('');
    console.log('--- fine giro: verde solo se non ci sono avvisi ---');
    var p = nuovaPagina();
    var buono = p.val('riassuntoFineGiro({ mancanti: 0, giroNonChiuso: 0, slittamento: false, instabili: 0, picco: 9.61, gradoPicco: 160 })');
    check('giro senza avvisi: "Scansione completata", verde', buono.kind === 'success' && buono.title === 'Scansione completata', JSON.stringify(buono));
    var sosp = p.val('riassuntoFineGiro({ mancanti: 0, giroNonChiuso: 0.045, slittamento: false, instabili: 3, picco: 9.61, gradoPicco: 160 })');
    check('giro non chiuso: NON verde, e lo dice nel titolo', sosp.kind !== 'success' && /CON AVVISI/.test(sosp.title), JSON.stringify(sosp.title));
    check('...elenca la chiusura in mm, con la virgola', /giro non chiuso \(0,045 mm\)/.test(sosp.body), sosp.body);
    check('...e i punti non stabilizzati', /3 punti non stabilizzati/.test(sosp.body));
    check('...e resta finche non la si chiude (durata 0)', sosp.duration === 0, String(sosp.duration));
    var buchi = p.val('riassuntoFineGiro({ mancanti: 12, giroNonChiuso: 0, slittamento: true, instabili: 0, picco: 9.61, gradoPicco: 160 })');
    check('gradi mancanti e slittamento compaiono anche loro', /12 gradi senza lettura/.test(buchi.body) && /slittamento/.test(buchi.body), buchi.body);

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- il file porta l avviso, e salvarlo lo chiede ---');
    check('metadati: giro non chiuso e slittamento',
        p.val('metadatiAvvisi({ giroNonChiuso: 0.045, slittamento: true })') === '#giroNonChiuso=0.045\r\n#slittamento=1\r\n',
        JSON.stringify(p.val('metadatiAvvisi({ giroNonChiuso: 0.045, slittamento: true })')));
    check('metadati: niente se la misura e pulita', p.val('metadatiAvvisi({ giroNonChiuso: 0, slittamento: false })') === '');
    var dom = p.val('domandaMisuraSospetta({ giroNonChiuso: 0.045, slittamento: false })');
    check('salvare una misura col giro non chiuso chiede conferma, dicendo perche',
        /SOSPETTA/.test(dom || '') && /0,045 mm/.test(dom || '') && /Salvare comunque\?/.test(dom || ''), String(dom).slice(0, 90));
    check('...e anche con lo slittamento', /slittamento/.test(p.val('domandaMisuraSospetta({ giroNonChiuso: 0, slittamento: true })') || ''));
    check('una misura pulita si salva senza domande', p.val('domandaMisuraSospetta({ giroNonChiuso: 0, slittamento: false })') === null);

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- Zero virtuale: esito e scelte attraversano il ricaricamento ---');
    p = nuovaPagina();
    p.el.scanMode.value = 'race'; p.el.scanRepeat.value = '3'; p.ctx.rsign = -1;
    p.val("_ricaricaDopoZeroVirtuale('fatto')");
    check('prima di ricaricare scrive esito e scelte', p.ricaricata === 1 && Object.keys(p.memoria).length === 1, JSON.stringify(p.memoria));
    // la pagina nuova: tutto ai valori iniziali, poi il ripristino
    var q = nuovaPagina();
    q.memoria = p.memoria;
    q.val('_ripristinaDopoZeroVirtuale()');
    check('dopo il ricaricamento la modalita torna quella scelta (e la configurazione la segue)',
        q.el.scanMode.value === 'race' && q.cambiModo === 1, q.el.scanMode.value + ' cambi=' + q.cambiModo);
    check('...le ripetizioni anche', q.el.scanRepeat.value === '3', q.el.scanRepeat.value);
    check('...e il senso antiorario, con la casella spuntata', q.ctx.rsign === -1 && q.casella.checked === true && q.rlb === 1,
        'rsign=' + q.ctx.rsign + ' casella=' + q.casella.checked);
    var t = q.toasts[0] || {};
    check('l esito e scritto e resta finche non lo si chiude', t.title === 'Zero virtuale fatto' && t.duration === 0, JSON.stringify(t.title));
    check('...e dice con quali scelte si riparte', /Race/.test(t.body || '') && /3 giri/.test(t.body || '') && /antiorario/.test(t.body || ''), t.body);
    check('letto una volta sola: la prossima apertura riparte dai valori iniziali',
        q.val('_ripristinaDopoZeroVirtuale()') === null && Object.keys(q.memoria).length === 0);

    var r = nuovaPagina();
    r.memoria[r.val('CHIAVE_ZERO_VIRTUALE')] = JSON.stringify({ esito: 'fatto', ts: Date.now() - 5 * 60000, modo: 'race', ripetizioni: '3', verso: -1 });
    check('un residuo vecchio (5 minuti) non viene applicato', r.val('_ripristinaDopoZeroVirtuale()') === null && r.el.scanMode.value === 'fast' && r.toasts.length === 0);

    var titoli = {};
    ['fatto', 'gia', 'interrotto', 'non-confermato', 'senza-encoder'].forEach(function (e) {
        var x = p.val('testoEsitoZeroVirtuale(' + JSON.stringify({ esito: e, dettagli: { scarto: '0,25' } }) + ')') || {};
        titoli[e] = x;
    });
    var nomi = Object.keys(titoli).map(function (k) { return titoli[k].title; });
    check('cinque esiti, cinque titoli diversi (prima dopo il ricaricamento erano identici)',
        nomi.filter(Boolean).length === 5 && nomi.filter(function (x, i) { return nomi.indexOf(x) === i; }).length === 5, JSON.stringify(nomi));
    check('interrotto, non confermato e senza encoder sono errori, e dicono di ripetere',
        ['interrotto', 'non-confermato', 'senza-encoder'].every(function (k) { return titoli[k].kind === 'err' && /ripet/i.test(titoli[k].body); }));
    check('"gia in posizione" riporta lo scarto', /0,25/.test(titoli.gia.body || ''), titoli.gia.body);
}

// ---------------------------------------------------------------
console.log('');
console.log('--- la pagina usa queste funzioni dove serve ---');
var nReload = (VIVO.match(/location\.reload\(/g) || []).length;
check('restano due soli ricaricamenti: quello dello Zero virtuale (che salva l esito) e RESET', nReload === 2, nReload + ' punti');
check('*mv a fine spostamento: esito "fatto"', /msg === '\*mv' && window\._waiting_mv\)[\s\S]{0,400}_ricaricaDopoZeroVirtuale\('fatto'\)/.test(VIVO));
check('STOP durante lo spostamento (*mabort): esito "interrotto", subito',
    /msg === '\*mabort' && window\._waiting_mv\)[\s\S]{0,300}_ricaricaDopoZeroVirtuale\('interrotto'\)/.test(VIVO));
check('nessuna conferma in 8 s: esito "non-confermato"', /_mv_fallback = setTimeout[\s\S]{0,400}_ricaricaDopoZeroVirtuale\('non-confermato'\)/.test(VIVO));
check('encoder mancante: esito "senza-encoder"', /_ricaricaDopoZeroVirtuale\('senza-encoder'\)/.test(VIVO));
check('gia in posizione: esito "gia", con lo scarto', /_ricaricaDopoZeroVirtuale\('gia', \{ scarto:/.test(VIVO));
check('il ripristino parte al caricamento della pagina', /addEventListener\('load', _ripristinaDopoZeroVirtuale\)/.test(VIVO));
var nVerde = (VIVO.match(/title: 'Scansione completata'/g) || []).length;
check('il verde "Scansione completata" esce solo da riassuntoFineGiro', nVerde === 1 && /function riassuntoFineGiro[\s\S]{0,900}title: 'Scansione completata'/.test(VIVO), nVerde + ' punti');
var corpoSav = estrai('sav') || '';
check('il salvataggio fa la domanda della misura sospetta e scrive i metadati',
    /domandaMisuraSospetta\(/.test(corpoSav) && /metadatiAvvisi\(/.test(corpoSav));
var corpoRun = estrai('_startSingleRun') || '';
check('una misura nuova cancella "file salvato" e gli avvisi della precedente',
    /if \(firstRun\)[\s\S]{0,400}_giroNonChiuso = 0[\s\S]{0,200}_slittamento = false[\s\S]{0,200}salva\.salva\.value = ''/.test(corpoRun));
check('durante lo Zero virtuale la notifica dice "Zero virtuale in corso", non "Scansione avviata"',
    /labms === 1 \?[\s\S]{0,80}Zero virtuale in corso/.test(corpoRun));
check('il giro non chiuso resta in memoria per il salvataggio', /window\._giroNonChiuso = Math\.max\(/.test(VIVO));
check('lo slittamento anche', /_encAlarmed = true;\s*\n\s*window\._slittamento = true;/.test(VIVO));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: fine giro verde solo se pulito, misura sospetta dichiarata nel file e al');
console.log('salvataggio, Zero virtuale che dice com e andato e non cambia le scelte.');
process.exit(0);
