// =============================================================
//  test_usabilita_confronto.js — la pagina Confronto dopo l'analisi di
//  usabilita' del 2026-11-21 (proposte 11, 4 lato Confronto, 12, glossario)
// =============================================================
//  Che cosa non andava, e che cosa controlla questo test:
//
//   - legenda e tabella dicevano "grafico1..4" invece del nome della misura;
//     a pagina vuota quattro righe finte "0 0"; una curva non si toglieva;
//   - la seconda curva era blu scuro su fondo scuro (1,5:1), la quarta grigio
//     chiaro su bianco;
//   - il grafico non aveva l'asse dei gradi, e l'asse verticale si chiamava
//     "valore (mm)";
//   - il verdetto del collaudo usciva in fondo al pannello, in piccolo, e non
//     si aggiornava da solo (serviva "Rivaluta");
//   - il collaudo non si poteva stampare;
//   - la vista Differenza sottraeva senza allineare la fase, con "RMSE",
//     "|Delta|", "baseline" e colori a soglie fisse non scritte;
//   - un file valido veniva respinto per il nome ("tipologia file non
//     valida", finestra del browser); le misure si prendevano solo dal disco;
//   - "Reset" ricaricava la pagina senza chiedere (e, arrivati da Home,
//     ricaricava le stesse misure);
//   - la vista polare partiva da un raggio base di 16 mm gia' scritto (un
//     valore di una camma, contro il banco universale) e chiedeva il raggio
//     mentre Analisi chiede il diametro.
//
//  Dopo la revisione dello stesso lavoro:
//   - la vista polare cresceva senza fine: la tela divideva il contenitore
//     con nome e nota e, ad altezza libera, a ogni ridimensionamento ne
//     prendeva anche l'altezza (qui: simulazione col Chart.js del programma);
//   - il pannello era troppo alto: "Stampa collaudo" quasi una schermata sotto
//     il verdetto, righe di verdetto alte, barrette verticali come divisori,
//     "Ridisegna" (un'animazione) nel posto piu' in vista;
//   - una curva gia' convertita alla punteria si annunciava col pezzo grezzo
//     del file ("finger:40x35", "bicch:33.34"), anche nel PDF del cliente;
//   - un "Ridisegna" in corso rimetteva la banda vecchia sopra quella nuova;
//   - la Differenza colorava i numeri con soglie fisse, non la tolleranza;
//   - testi: "1 righe", "0 gradi mancanti", "#stato=INCOMPLETO", "(HTTP 404)".
//
//  Le funzioni della pagina girano qui tali e quali (vm), con un DOM finto;
//  il grafico vero si disegna con Chart.js su una tela finta, il PDF vero si
//  crea con la libreria jsPDF del programma.
//
//  Uso: node tools/test_usabilita_confronto.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' CONFRONTO: nomi, assi, verdetto in alto, stampa, archivio');
console.log('=============================================================');

var RADICE = path.join(__dirname, '..');
var PAG = fs.readFileSync(path.join(RADICE, 'grafici.html'), 'utf8').replace(/\r\n/g, '\n');
var vivo = PAG.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');

// "function nome(...) {" a inizio riga, fino alla prima "}" a inizio riga
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(PAG);
    if (!m) return null;
    var fine = PAG.indexOf('\n}\n', m.index);
    return fine < 0 ? null : PAG.substring(m.index, fine + 3);
}
function estraiVar(nome) {
    var m = new RegExp('^var ' + nome + '\\s*=[^\\n]*;', 'm').exec(PAG);
    return m ? m[0] : null;
}
function funzioni(nomi) {
    return nomi.map(function (n) {
        var f = estrai(n) || estraiVar(n);
        if (!f) throw new Error('nella pagina manca ' + n);
        return f;
    }).join('\n');
}
function posizione(re) { var m = re.exec(PAG); return m ? m.index : -1; }

// Oggetti nati nel recinto vm: Chart.js riconosce come "oggetto da completare
// coi valori di partenza" solo quelli del proprio ambiente (constructor ===
// Object). Si ricopiano qui, funzioni comprese, com'e' nel browser, dove
// pagina e libreria vivono nello stesso ambiente.
function clona(x) {
    if (Array.isArray(x)) return x.map(clona);
    if (x && typeof x === 'object') { var o = {}; Object.keys(x).forEach(function (k) { o[k] = clona(x[k]); }); return o; }
    return x;
}

// ---------- profili di prova (anonimi) ----------
var NOMINALE_TXT = fs.readFileSync(path.join(__dirname, 'fixtures', 'rif2_asp_alz.scr'), 'utf8');
var NOM_LF = NOMINALE_TXT.replace(/\r\n/g, '\n');
var NOM = M.parseCamFile(NOMINALE_TXT);
function spostata(cam, gradi) {          // la stessa curva letta "gradi" piu' avanti (giro chiuso)
    var a = [0];
    for (var d = 1; d <= 360; d++) {
        var x = d + gradi, i0 = Math.floor(x), t = x - i0;
        var k0 = ((i0 - 1) % 360 + 360) % 360 + 1, k1 = (k0 % 360) + 1;
        a[d] = (1 - t) * Number(cam[k0]) + t * Number(cam[k1]);
    }
    return a;
}
function testoScr(a) {
    var r = ['_pline'];
    for (var d = 1; d <= 360; d++) r.push(d + ',' + (+Number(a[d]).toFixed(4)));
    return r.join('\r\n') + '\r\n';
}
var MEZZO = testoScr(spostata(NOM, 0.5));                     // stessa camma, mezzo grado di fase
var bozzo = spostata(NOM, 0.5); for (var q = 148; q <= 152; q++) bozzo[q] += 0.20;
var BOZZO = testoScr(bozzo);                                   // difetto vero di 0,20 mm
var UN_GRADO = testoScr(spostata(NOM, 1));                     // stessa camma, un grado di fase
var CORTO = '_pline\r\n1,0\r\n2,0.1\r\n3,0.2\r\n';             // non e' una misura

// ---------- DOM finto ----------
function elemento(tag, id) {
    var e = { tag: tag, id: id || '', value: '', checked: false, textContent: '', title: '', className: '', disabled: false,
              type: '', style: {}, children: [], attributi: {}, ascoltatori: {} };
    var html = '';
    Object.defineProperty(e, 'innerHTML', { get: function () { return html; }, set: function (v) { html = String(v); if (html === '') e.children = []; } });
    Object.defineProperty(e, 'options', { get: function () { return e.children.filter(function (c) { return c.tag === 'option'; }); } });
    e.appendChild = function (c) { e.children.push(c); return c; };
    e.addEventListener = function (ev, fn) { e.ascoltatori[ev] = fn; };
    e.setAttribute = function (k, v) { e.attributi[k] = String(v); };
    e.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(e.attributi, k) ? e.attributi[k] : null; };
    e.removeAttribute = function (k) { delete e.attributi[k]; };
    var classi = {};
    e.classList = { add: function (c) { classi[c] = 1; }, remove: function (c) { delete classi[c]; }, contains: function (c) { return !!classi[c]; } };
    e.focus = function () {};
    return e;
}
function testoDi(e) { return !e ? '' : ((e.textContent || '') + ' ' + e.children.map(testoDi).join(' ')).replace(/\s+/g, ' ').trim(); }
function trova(e, cond) {
    if (!e) return null;
    if (cond(e)) return e;
    for (var i = 0; i < (e.children || []).length; i++) { var t = trova(e.children[i], cond); if (t) return t; }
    return null;
}
function senzaTag(html) {
    return String(html).replace(/<[^>]+>/g, ' ').replace(/&#10003;|&#10007;|&#9888;/g, '').replace(/&plusmn;/g, '±')
        .replace(/&deg;/g, '°').replace(/&middot;/g, '·').replace(/&mdash;/g, '-').replace(/\s+/g, ' ').trim();
}

var ID = ['verdictBox', 'collaudoBox', 'collaudoAzioni', 'tolMm', 'viewMode', 'allineaFase', 'allineaFaseBox', 'diffStats', 'graficoVuoto', 'corpoMisure',
          'tabellaMisure', 'tabellaVuota', 'nominaleCaricato', 'polRBase', 'archivioMisure', 'archivioNominale', 'archivioPolare',
          'fileinput1', 'fileinput2', 'fileNominal', 'replayBtn', 'replayStopBtn', 'canvas'];

// la virgola come la scrive cammes-ui.js (se la trova), altrimenti la regola dichiarata
var UI = fs.readFileSync(path.join(RADICE, 'cammes-ui.js'), 'utf8').replace(/\r\n/g, '\n');
function estraiDaUi(nome) {
    var m = new RegExp('\\n  function ' + nome + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\}\\n').exec(UI);
    return m ? m[0] : null;
}
var NUM_UI = estraiDaUi('cammesNum');
var INTESTAZIONE_UI = estraiDaUi('intestazionePdf');

function contesto(extra) {
    var avvisi = [], timer = [], segnalati = [];
    var el = {};
    ID.forEach(function (i) { el[i] = elemento(i === 'viewMode' || /^archivio/.test(i) ? 'select' : 'div', i); });
    el.viewMode.value = 'overlay';
    el.allineaFase.checked = true;
    el.tolMm.value = '0,10';
    el.archivioMisure.setAttribute('data-vuoto', 'Scegli dall\'archivio…');
    el.archivioNominale.setAttribute('data-vuoto', 'Scegli il nominale dall\'archivio…');
    el.archivioPolare.setAttribute('data-vuoto', 'Scegli dall\'archivio…');
    var ds = []; for (var i = 0; i < 6; i++) ds.push({ label: '', data: [] });
    var grafico = { data: { datasets: ds, labels: [] }, options: { scales: { y: { title: { text: 'alzata (mm)' } } } },
                    aggiornamenti: 0, update: function () { this.aggiornamenti++; } };
    var win = { _cmpData: [], _cmpNomi: [], _cmpFile: [], _polData: [], myLine: grafico,
                cammesToast: function (o) { avvisi.push(o); },
                cammesEscape: function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
                cammesValidate: { error: function (e, msg) { segnalati.push(msg); } } };
    var ctx = {
        window: win,
        document: { getElementById: function (i) { return el[i] || null; }, createElement: function (t) { return elemento(t); },
                    createTextNode: function (t) { var n = elemento('#text'); n.textContent = String(t); return n; } },
        Math: Math, Number: Number, isFinite: isFinite, parseInt: parseInt, String: String, JSON: JSON, Array: Array, Object: Object, Promise: Promise, Date: Date,
        Error: Error, encodeURIComponent: encodeURIComponent,
        setTimeout: function (fn, ms) { timer.push({ fn: fn, ms: ms, vivo: true }); return timer.length; },
        clearTimeout: function (n) { if (timer[n - 1]) timer[n - 1].vivo = false; },
        cancelAnimationFrame: function () {},
        parseCamFile: M.parseCamFile, validaNumero: M.validaNumero, scartoDalNominale: M.scartoDalNominale,
        canProduceOfficialResult: M.canProduceOfficialResult, avvisoMisuraSospetta: M.avvisoMisuraSospetta,
        _nominal: null, _replayBackup: null, _replayRaf: null, _replayCancelled: false, _replaySafetyTimer: null,
        _timerCollaudo: null
    };
    win.window = win;
    Object.keys(extra || {}).forEach(function (k) { ctx[k] = extra[k]; });
    vm.createContext(ctx);
    if (NUM_UI) { vm.runInContext(NUM_UI, ctx); win.cammesNum = ctx.cammesNum; }
    else win.cammesNum = function (x, d) { var n = Number(x); return isFinite(n) ? n.toFixed(d).replace('.', ',') : 'n.d.'; };
    return { ctx: ctx, el: el, avvisi: avvisi, timer: timer, segnalati: segnalati, grafico: grafico,
             esegui: function (codice) { return vm.runInContext(codice, ctx); } };
}

var NUCLEO = ['COLORI_CURVE', 'TRATTI_CURVE', '_tickMm', '_mm', '_conta', '_bandaVuota', '_nomeDaFile', '_misureCaricate', '_postoLibero',
              '_nomeMisura', '_misuraIncompleta', '_picco', '_commitCmpCurve', 'rimuoviMisura', '_etichetta', '_curvaConvertita', '_fraseConvertita',
              '_aggiornaTabella', '_aggiornaTutto', '_aggiornaGrafico', '_valoriDaDisegnare', '_soloLetti', '_letturaA', '_differenza',
              '_testoSpostamento', '_disegnaCurve', '_altezzaGrafico', '_scriviDifferenza', '_tolleranzaCollaudo', '_testoTolleranza',
              '_dettaglioVerdetto', '_rigaVerdetto', '_motivoNominale', 'evalNominal', '_programmaCollaudo', '_collaudoSubito', '_caricaNominale',
              'rimuoviNominale', '_aggiornaNominaleUI', '_loadAlzFromText', 'stopReplay', '_restoreFromBackup'];
var codiceNucleo = '';
try { codiceNucleo = funzioni(NUCLEO); } catch (e) { check('la pagina ha tutte le funzioni del confronto', false, e.message); }

// =============================================================
console.log('');
console.log('--- 1. la pagina: il verdetto in alto, niente righe finte ---');
var pVerdetto = posizione(/id="verdictBox"/), pIstr = posizione(/class="cmp-istruzione"/),
    pFile1 = posizione(/id="fileinput1"/), pNom = posizione(/id="fileNominal"/), pTol = posizione(/id="tolMm"/);
check('il verdetto e la prima cosa del pannello, sopra misure, nominale e tolleranza',
    pVerdetto > 0 && pVerdetto < pIstr && pVerdetto < pFile1 && pVerdetto < pNom && pVerdetto < pTol);
['verdictBox', 'stampaCollaudoBtn', 'archivioMisure', 'archivioNominale', 'archivioPolare', 'allineaFase', 'corpoMisure'].forEach(function (i) {
    check('c e #' + i, PAG.indexOf('id="' + i + '"') > 0);
});
var perGiro = ['fileinput1', 'fileinput2', 'fileNominal', 'viewMode', 'replayBtn'].filter(function (i) { return PAG.indexOf('id="' + i + '"') < 0; });
check('gli elementi del giro guidato ci sono ancora', perGiro.length === 0, perGiro.join(', '));
check('la tabella delle misure nasce vuota (righe solo per le misure caricate)', /<tbody id="corpoMisure"><\/tbody>/.test(PAG));
check('nessun "grafico1..4" nella pagina', !/grafico ?\d/.test(vivo));
check('niente piu Rivaluta: il verdetto si ricalcola da solo', !/Rivaluta/.test(vivo));
check('la tolleranza ricalcola mentre si scrive', /id="tolMm"[^>]*oninput="_programmaCollaudo\(\);"/.test(PAG));
check('niente finestre del browser (alert, confirm, prompt)', !/\b(alert|confirm|prompt)\s*\(/.test(vivo));
check('un file non si respinge piu per il nome', !/tipologia file non valida/.test(vivo) && !/split\('_'\)/.test(vivo) && !/!=\s*["']alz["']/.test(vivo));
check('Svuota tutto chiede conferma con una finestra della pagina, senza ricaricare',
    /window\.cammesConferma\(/.test(estrai('svuotaTutto') || '') && !/location\.reload/.test(vivo));
check('la stampa ha la sua libreria PDF locale', /<script src="jspdf\.umd\.min\.js"><\/script>/.test(PAG));
check('...e il nome dell officina dalle impostazioni', /fetch\('\/api\/settings'\)[\s\S]{0,200}window\._officina = s\.officina\.nome/.test(PAG));
check('il pulsante Stampa collaudo stampa', /id="stampaCollaudoBtn"[^>]*onclick="stampaCollaudo\(\);"/.test(PAG));
var pBox = posizione(/id="collaudoBox"/), pStampa = posizione(/id="stampaCollaudoBtn"/);
check('Stampa collaudo sta nel riquadro del verdetto, subito sotto le righe (prima: quasi una schermata piu in basso)',
    pBox > 0 && pBox < pVerdetto && pVerdetto < pStampa && pStampa < pIstr && pStampa < pFile1);
check('Ridisegna (solo un animazione) sta fra i comandi secondari in fondo al pannello, non accanto alla Vista',
    posizione(/id="replayBtn"/) > pTol && posizione(/id="replayStopBtn"/) > pTol);
check('niente barrette verticali (.separator) usate come linee nel pannello: 42 px l una', !/class="separator"/.test(PAG));
var tele = PAG.match(/<div class="polar-tela"><canvas id="birdsChart\d?"[^>]*><\/canvas><\/div>/g) || [];
check('vista polare: ogni tela sta da sola nel suo contenitore, come chiede Chart.js', tele.length === 4, tele.length + ' su 4');
check('il cerchio base della vista polare nasce vuoto (banco universale: niente 16 gia scritto)',
    /id="polRBase"[^>]*value=""/.test(PAG) && !/value="16"/.test(PAG));
check('...e si chiede come diametro, come in Analisi', /&Oslash; cerchio base/.test(PAG) && /valore \/ 2/.test(estrai('_cerchioBase') || ''));

// =============================================================
console.log('');
console.log('--- 2. parole e fumetti ---');
// testi che l'operatore legge: fumetti, titoli, testo fra i tag, stringhe del codice
var testi = [];
(function () {
    var html = PAG.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '\n');
    html.replace(/\s(?:data-tip|title|placeholder|aria-label|data-vuoto)="([^"]*)"/g, function (t, v) { testi.push(v); return ''; });
    html.replace(/<[^>]*>/g, '\n').split('\n').forEach(function (t) { if (t.trim()) testi.push(t.trim()); });
    var js = (PAG.match(/<script>([\s\S]*?)<\/script>/g) || []).join('\n')
        .split('\n').filter(function (r) { return !/^\s*\/\//.test(r); }).join('\n');
    (js.match(/'(?:[^'\\\n]|\\.)*'/g) || []).forEach(function (s) { if (/\s/.test(s)) testi.push(s); });
})();
var vietate = ['RMSE', 'aseline', 'Replay', '|Delta|', 'PASS/FAIL', 'cartesiano', 'legacy', ' stats', 'valore (mm)', ' vs ', 'Reset', 'finger', 'Failed'];
vietate.forEach(function (p) {
    var dove = testi.filter(function (t) { return t.indexOf(p) >= 0; });
    check('nessun "' + p.trim() + '" davanti all operatore', dove.length === 0, dove.slice(0, 2).join(' | '));
});
var lunghi = [];
PAG.replace(/data-tip="([^"]*)"/g, function (t, v) {
    var s = v.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, 'x').replace(/\s+/g, ' ').trim();
    if (s.length > 300) lunghi.push(s.length + ': ' + s.slice(0, 40));
    return '';
});
check('fumetti brevi (al massimo 300 caratteri)', lunghi.length === 0, lunghi.join(' | '));
check('le parole del glossario: scarto massimo / medio / quadratico medio, gradi camma, alzata massima',
    /Scarto quadratico medio/.test(PAG) && /'gradi camma'/.test(PAG) && /alzata massima/i.test(vivo) && /'alzata \(mm\)'/.test(PAG));

// =============================================================
console.log('');
console.log('--- 3. nomi e colori ---');
var c0 = contesto();
c0.esegui(funzioni(['_nomeDaFile', 'COLORI_CURVE', '_tickMm', '_conta']));
check('il nome mostrato e quello del file, senza .scr e senza _alz', c0.esegui('_nomeDaFile("albero12_asp_alz.scr")') === 'albero12_asp');
check('un punto nel nome non lo tronca piu (prima "camma_bicch33.34" diventava "camma_bicch33")', c0.esegui('_nomeDaFile("camma_bicch33.34_alz.scr")') === 'camma_bicch33.34');
check('un CSV tiene il suo nome', c0.esegui('_nomeDaFile("profilo cliente.csv")') === 'profilo cliente');
check('numeri sugli assi con la virgola', c0.esegui('_tickMm(0.5)') === '0,5' && c0.esegui('_tickMm(2)') === '2' && c0.esegui('_tickMm(-0.0000001)') === '0');
check('singolare e plurale giusti: "1 grado", "3 gradi"', c0.esegui('_conta(1, "grado", "gradi")') === '1 grado' && c0.esegui('_conta(3, "grado", "gradi")') === '3 gradi');
function luminanza(hex) {
    var h = hex.replace('#', '');
    var c = [0, 2, 4].map(function (i) { var v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrasto(a, b) { var x = luminanza(a), y = luminanza(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function tinta(hex) {
    var h = hex.replace('#', ''), r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return -1;
    var t = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (t * 60 + 360) % 360;
}
var colori = JSON.parse(JSON.stringify(c0.ctx.COLORI_CURVE || []));
check('quattro colori, tutti diversi', colori.length === 4 && colori.filter(function (c, i) { return colori.indexOf(c) === i; }).length === 4, colori.join(' '));
['#0e131c', '#161c28', '#ffffff'].forEach(function (fondo) {
    var min = Math.min.apply(null, colori.map(function (c) { return contrasto(c, fondo); }));
    check('ogni curva si legge sul fondo ' + fondo + ' (almeno 3:1; la vecchia seconda curva sul fondo scuro: ' + contrasto('#0000c8', '#161c28').toFixed(2) + ':1)', min >= 3, min.toFixed(2) + ':1');
});
var vicini = colori.filter(function (c) { var t = tinta(c); var dRosso = Math.min(t, 360 - t), dVerde = Math.abs(t - 151); return dRosso < 15 || dVerde < 15; });
check('nessuna curva ha il rosso o il verde del verdetto', vicini.length === 0, vicini.join(' '));

// =============================================================
console.log('');
console.log('--- 4. il grafico vero: asse dei gradi, nomi in legenda ---');
var Chart = null;
try { Chart = require(path.join(RADICE, 'lib', 'chart.umd.min.js')); } catch (e) { Chart = null; }
check('Chart.js del programma si carica', typeof Chart === 'function');
function contesto2d(scritti, tela) {
    return new Proxy({}, {
        get: function (o, k) {
            if (k === 'fillText') return function (t) { if (scritti) scritti.push(String(t)); };
            if (k === 'measureText') return function (t) { return { width: String(t).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; };
            if (k === 'getLineDash') return function () { return []; };
            if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return function () { return { addColorStop: function () {} }; };
            if (k === 'canvas') return tela();
            if (k in o) return o[k];
            return function () {};
        },
        set: function (o, k, v) { o[k] = v; return true; }
    });
}
if (typeof Chart === 'function') {
    var cg = contesto();
    cg.esegui(funzioni(['grfColors', '_tickMm', '_mm', '_bandaVuota', '_opzioniGrafico']));
    var opz = clona(cg.esegui('_opzioniGrafico()'));
    opz.responsive = false;
    opz.animation = false;
    var scritti = [];
    var tela = { width: 900, height: 450, style: {} };
    tela.getContext = function () { return contesto2d(scritti, function () { return tela; }); };
    var etichette = []; for (var g = 1; g <= 360; g++) etichette.push(g);
    var piccola = function (d) { return 1.2 * Math.max(0, Math.cos((d - 180) / 40)); };
    var dsProva = [{ label: 'albero12_asp', data: etichette.map(piccola), borderColor: '#e8590c' },
                   { label: 'albero12_asp_dopo', data: etichette.map(function (d) { return piccola(d) * 0.98; }), borderColor: '#1c7ed6' },
                   { label: '', data: [] }, { label: '', data: [] }, { label: '', data: [] }, { label: '', data: [] }];
    var ch = null;
    try { ch = new Chart(tela, { type: 'line', data: { labels: etichette, datasets: dsProva }, options: opz }); } catch (e) { check('il grafico si disegna', false, e.message); }
    if (ch) {
        var tacche = scritti.filter(function (t) { return /^\d+°$/.test(t); });
        var attese = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360].map(function (x) { return x + '°'; });
        check('asse orizzontale acceso: una tacca ogni 30 gradi', attese.every(function (t) { return tacche.indexOf(t) >= 0; }) && tacche.every(function (t) { return attese.indexOf(t) >= 0; }),
            tacche.filter(function (t, i) { return tacche.indexOf(t) === i; }).join(' '));
        check('...col titolo "gradi camma"', scritti.indexOf('gradi camma') >= 0);
        check('asse verticale "alzata (mm)"', scritti.indexOf('alzata (mm)') >= 0);
        check('numeri dell asse con la virgola', scritti.some(function (t) { return /^\d,\d+$/.test(t); }) && !scritti.some(function (t) { return /^\d\.\d+$/.test(t); }),
            scritti.filter(function (t) { return /^\d[.,]\d+$/.test(t); }).slice(0, 4).join(' '));
        check('in legenda i nomi delle misure', scritti.indexOf('albero12_asp') >= 0 && scritti.indexOf('albero12_asp_dopo') >= 0);
        check('...e nessuna voce vuota o "grafico N"', !scritti.some(function (t) { return /grafico/.test(t); }));
        check('fumetto del grafico: "206°" e "nome: 9,612 mm"',
            opz.plugins.tooltip.callbacks.title([{ label: 206 }]) === '206°' &&
            opz.plugins.tooltip.callbacks.label({ dataset: { label: 'albero12_asp' }, parsed: { y: 9.6123 } }) === 'albero12_asp: 9,612 mm');
        ch.destroy();
    }
}

// =============================================================
console.log('');
console.log('--- 5. misure: dal contenuto, non dal nome; si tolgono una per una ---');
var c = contesto();
c.esegui(codiceNucleo);
var esito1 = c.esegui('_caricaNominale(' + JSON.stringify(NOMINALE_TXT) + ', "albero12_nominale_alz.scr")');
check('il nominale si carica', esito1 === true && !!c.ctx._nominal);
check('...e il pannello dice quale', /albero12_nominale/.test(testoDi(c.el.nominaleCaricato)) && /Rimuovi/.test(testoDi(c.el.nominaleCaricato)));
check('senza misure il verdetto chiede di caricarne una', /Carica almeno una misura/.test(senzaTag(c.el.verdictBox.innerHTML)) && /albero12_nominale/.test(c.el.verdictBox.innerHTML));
check('col solo nominale il riquadro del collaudo c e, la sua stampa ancora no (niente da stampare)',
    c.el.collaudoBox.style.display === '' && c.el.collaudoAzioni.style.display === 'none');
var ok1 = c.esegui('_loadAlzFromText(' + JSON.stringify(MEZZO) + ', "albero12_asp_alz.scr")');
var v1 = senzaTag(c.el.verdictBox.innerHTML);
check('una misura caricata: il verdetto compare SUBITO, senza Rivaluta', ok1 === true && /CONFORME/.test(v1) && !/NON CONFORME/.test(v1) && /albero12_asp/.test(v1), v1.slice(0, 160));
check('...dice la tolleranza (una volta, in testa), lo scarto massimo e il riallineamento', /tolleranza ±0,10 mm/.test(v1) && /scarto massimo \d+,\d{3} mm/.test(v1) && /riallineata di [+-]0,5°/.test(v1), v1.slice(0, 200));
var dettaglio1 = senzaTag((c.el.verdictBox.innerHTML.match(/<div class="verdetto-dettaglio">([\s\S]*?)<\/div>/) || [])[1] || '');
check('riga compatta: parola e nome sulla stessa riga, sotto lo scarto senza ripetere la tolleranza',
    /<div class="verdetto-testa"><span class="verdetto-parola">[^<]*CONFORME<\/span><span class="verdetto-nome">/.test(c.el.verdictBox.innerHTML) &&
    /^scarto massimo/.test(dettaglio1) && !/entro|fuori da/.test(dettaglio1), dettaglio1);
check('con un verdetto compare anche Stampa collaudo, nel riquadro', c.el.collaudoBox.style.display === '' && c.el.collaudoAzioni.style.display === '');
check('la riga della tabella porta il nome e "Rimuovi"', c.el.corpoMisure.children.length === 1 && /albero12_asp/.test(testoDi(c.el.corpoMisure)) && /Rimuovi/.test(testoDi(c.el.corpoMisure)), testoDi(c.el.corpoMisure));
var bRimuovi = trova(c.el.corpoMisure, function (e) { return e.tag === 'button'; });
check('...e "Rimuovi" dice che il file non viene toccato (vale anche per un file dal disco)', !!bRimuovi && /il file non viene toccato/.test(bRimuovi.title), bRimuovi && bRimuovi.title);
check('...con l alzata massima e il suo grado, con la virgola', /alzata massima \d+,\d\d mm a \d+°/.test(testoDi(c.el.corpoMisure)), testoDi(c.el.corpoMisure));
check('in legenda il nome della misura', c.grafico.data.datasets[0].label === 'albero12_asp');
check('...e la banda del nominale e disegnata, allineata alla prima misura', c.grafico.data.datasets[4].data.length === 360 && /Nominale ± 0,10 mm \(allineato a albero12_asp\)/.test(c.grafico.data.datasets[4].label), c.grafico.data.datasets[4].label);
var basso = c.grafico.data.datasets[5].data.filter(function (v) { return v !== null && v < 0; }).length;
check('...col bordo basso non tagliato a zero', basso > 0, basso + ' gradi sotto lo zero');
var ok2 = c.esegui('_loadAlzFromText(' + JSON.stringify(BOZZO) + ', "camma_bicch33.34_alz.scr")');
var v2 = senzaTag(c.el.verdictBox.innerHTML);
check('un nome col punto (prima "tipologia file non valida") ora entra', ok2 === true && c.ctx.window._cmpNomi[2] === 'camma_bicch33.34');
check('seconda misura: il verdetto si aggiorna da solo, una riga per misura', /CONFORME[^]*albero12_asp[^]*NON CONFORME[^]*camma_bicch33\.34/.test(v2), v2.slice(0, 260));
var ok3 = c.esegui('_loadAlzFromText(' + JSON.stringify(BOZZO) + ', "profilo cliente.csv")');
check('anche un file senza _alz nel nome entra, se il contenuto e una misura', ok3 === true);
c.avvisi.length = 0;
var ok4 = c.esegui('_loadAlzFromText(' + JSON.stringify(CORTO) + ', "appunti.txt")');
var a4 = c.avvisi[c.avvisi.length - 1] || {};
check('un file che non e una misura e respinto con un messaggio che spiega cosa fare',
    ok4 === false && /non è una misura/.test(a4.title || '') && /grado,alzata/.test(a4.body || '') && /Alzata/.test(a4.body || ''), (a4.title || '') + ' / ' + (a4.body || ''));
c.esegui('_loadAlzFromText(' + JSON.stringify(UN_GRADO) + ', "albero12_asp_bis_alz.scr")');
c.avvisi.length = 0;
var ok5 = c.esegui('_loadAlzFromText(' + JSON.stringify(MEZZO) + ', "quinta_alz.scr")');
var a5 = c.avvisi[c.avvisi.length - 1] || {};
check('la quinta misura no, e il messaggio dice come fare posto', ok5 === false && /Rimuovi/.test(a5.body || ''), a5.body);
c.avvisi.length = 0;
var dup = c.esegui('rimuoviMisura(4); _loadAlzFromText(' + JSON.stringify(MEZZO) + ', "albero12_asp_alz.scr")');
check('la stessa misura due volte no', dup === false && /già/.test((c.avvisi[c.avvisi.length - 1] || {}).title || ''));
// la tolleranza: si ricalcola mentre si scrive, dopo una breve pausa
c.el.tolMm.value = '0,25';
c.esegui('_programmaCollaudo(); _programmaCollaudo();');
var attivi = c.timer.filter(function (t) { return t.vivo; });
check('mentre si scrive: un solo ricalcolo in attesa, dopo una breve pausa', attivi.length === 1 && attivi[0].ms >= 200 && attivi[0].ms <= 1000, attivi.length + ' in attesa, ' + (attivi[0] || {}).ms + ' ms');
var prima = senzaTag(c.el.verdictBox.innerHTML);
attivi.forEach(function (t) { t.vivo = false; t.fn(); });
var dopo = senzaTag(c.el.verdictBox.innerHTML);
check('...e il verdetto segue la tolleranza nuova (0,20 mm di bozzo: dentro ±0,25)', /NON CONFORME/.test(prima) && !/NON CONFORME/.test(dopo) && /±0,25 mm/.test(dopo), dopo.slice(0, 200));
c.el.tolMm.value = '0,';
c.segnalati.length = 0;
c.esegui('_programmaCollaudo();');
c.timer.filter(function (t) { return t.vivo; }).forEach(function (t) { t.vivo = false; t.fn(); });
var mezzo = senzaTag(c.el.verdictBox.innerHTML);
check('a meta scrittura ("0,") niente verdetto e niente messaggi che interrompono: solo il bordo rosso',
    !/CONFORME/.test(mezzo) && /tolleranza non valida/i.test(mezzo) && c.segnalati.length === 0 && c.el.tolMm.classList.contains('input-error'), mezzo.slice(0, 120));
c.el.tolMm.value = '0,10';
c.esegui('_collaudoSubito();');
check('...e il bordo rosso se ne va appena il valore e buono', !c.el.tolMm.classList.contains('input-error'));
// togliere una misura
c.esegui('rimuoviMisura(1);');
var v6 = senzaTag(c.el.verdictBox.innerHTML);
check('Rimuovi toglie la misura: dal verdetto, dalla tabella, dal grafico',
    !/albero12_asp /.test(v6 + ' ') && c.el.corpoMisure.children.length === 2 && c.grafico.data.datasets[0].data.length === 0 && c.grafico.data.datasets[0].label === '', v6.slice(0, 160));
check('...e le altre misure tengono il loro colore', c.grafico.data.datasets[1].borderColor === c.ctx.COLORI_CURVE[1] && c.ctx.window._cmpNomi[2] === 'camma_bicch33.34');
check('...la banda ora segue la prima misura rimasta', /allineato a camma_bicch33\.34/.test(c.grafico.data.datasets[4].label), c.grafico.data.datasets[4].label);
var tuttiNumeri = c.el.verdictBox.innerHTML + ' ' + c.el.corpoMisure.children.map(testoDi).join(' ');
check('numeri con la virgola nel verdetto e in tabella', !/\d\.\d+ ?mm/.test(tuttiNumeri), (tuttiNumeri.match(/\d\.\d+ ?mm/) || [''])[0]);
// una misura segnata INCOMPLETA al salvataggio non riceve un verdetto
var segnata = MEZZO.replace('_pline\r\n', '_pline\r\n#stato=INCOMPLETO\r\n');
c.esegui('_loadAlzFromText(' + JSON.stringify(segnata) + ', "segnata_alz.scr")');
var v7 = senzaTag(c.el.verdictBox.innerHTML);
check('una misura salvata come INCOMPLETA: NON VALUTABILE, mai CONFORME', /NON VALUTABILE segnata/.test(v7), v7.slice(0, 260));
// una curva gia' convertita alla punteria da "Salva profilo" (Analisi) lo dice in tabella
var convertita = MEZZO.replace('_pline\r\n', '_pline_conv:bicch:33\r\n');
c.esegui('_loadAlzFromText(' + JSON.stringify(convertita) + ', "albero12_asp_bicch33_alz.scr")');
var righeTab = c.el.corpoMisure.children.map(testoDi);
var rigaConv = righeTab.filter(function (t) { return /albero12_asp_bicch33/.test(t); })[0] || '';
var altreConv = righeTab.filter(function (t) { return t !== rigaConv && /convertita/.test(t); });
check('una curva gia convertita alla punteria (Salva profilo) lo dice accanto al nome', /convertita/.test(rigaConv) && altreConv.length === 0, rigaConv + ' | altre: ' + altreConv.length);
var tagConv = trova(c.el.corpoMisure, function (e) { return /cmp-tag/.test(e.className) && e.textContent === 'convertita'; });
check('...e il fumetto dice quale punteria, in parole (prima il pezzo grezzo del file, "bicch:33")',
    !!tagConv && /punteria simulata \(bicchiere Ø 33 mm\)/.test(tagConv.title) && !/bicch:|_pline/.test(tagConv.title), tagConv && tagConv.title);
c.ctx.campioni = ['_pline_conv:bicch:33.34\r\n1,0', '_pline_conv:roll:12.5', '_pline_conv:finger:40x35', '_pline_conv', '_pline\r\n1,0'];
var conv = JSON.parse(JSON.stringify(c.esegui('campioni.map(function (t) { return _curvaConvertita(t); })')));
check('bicchiere, rullo, leva a dito: parole e virgola (prima "bicch:33.34", "roll:12.5", "finger:40x35")',
    conv[0] === 'bicchiere Ø 33,34 mm' && conv[1] === 'rullo di raggio 12,5 mm' && conv[2] === 'leva a dito 40 / 35 mm' && conv[3] === 'tipo non indicato' && conv[4] === '',
    conv.join(' | '));
// un "Ridisegna" in corso: la sua copia dei dati ha la banda di prima, e a
// ogni fotogramma la rimetteva al posto di quella nuova
c.esegui('_replayBackup = window.myLine.data.datasets.map(function (d) { return (d.data || []).slice(); });' +
         'window.myLine.data.datasets.forEach(function (d) { d.data = d.data.slice(0, 90); });');
c.el.replayBtn.style.display = 'none';
c.el.replayStopBtn.style.display = '';
c.el.tolMm.value = '0,30';
c.esegui('_collaudoSubito();');
var dsR = c.grafico.data.datasets;
check('un Ridisegna in corso si chiude prima del collaudo: banda nuova, curve intere, pulsanti a posto',
    c.ctx._replayBackup === null && /Nominale ± 0,30 mm/.test(dsR[4].label) && dsR[4].data.length === 360 && dsR[1].data.length === 360 &&
    c.el.replayBtn.style.display === '' && c.el.replayStopBtn.style.display === 'none', dsR[4].label + ', ' + dsR[1].data.length + ' gradi');
c.el.tolMm.value = '0,10';
c.esegui('_collaudoSubito();');
c.esegui('rimuoviNominale();');
check('Rimuovi sul nominale: verdetto, riquadro e banda spariscono',
    c.el.verdictBox.innerHTML === '' && c.el.collaudoBox.style.display === 'none' && c.el.collaudoAzioni.style.display === 'none' && c.grafico.data.datasets[4].data.length === 0);

// la stampa cattura le curve intere anche a meta' di un "Ridisegna"
var im = contesto();
im.esegui(codiceNucleo);
im.esegui(funzioni(['_immagineGrafico']));
im.grafico.canvas = { width: 8, height: 4 };
im.grafico.draw = function () {};
im.grafico.options = { plugins: { legend: { labels: { color: '#fff' } } },
                       scales: { x: { ticks: {}, grid: {}, title: {} }, y: { ticks: {}, grid: {}, title: { text: 'alzata (mm)' } } } };
im.esegui('_loadAlzFromText(' + JSON.stringify(MEZZO) + ', "albero12_asp_alz.scr")');
im.esegui('_replayBackup = window.myLine.data.datasets.map(function (d) { return (d.data || []).slice(); });' +
          'window.myLine.data.datasets.forEach(function (d) { d.data = d.data.slice(0, 40); });');
im.esegui('_immagineGrafico();');
check('...e Stampa collaudo durante un Ridisegna prende le curve intere, non a meta', im.ctx._replayBackup === null && im.grafico.data.datasets[0].data.length === 360,
    im.grafico.data.datasets[0].data.length + ' gradi');

// testi del nominale: plurali, file segnato incompleto, motivo in parole
var n = contesto();
n.esegui(codiceNucleo);
n.esegui('_caricaNominale(' + JSON.stringify(NOM_LF.replace('_pline\n', '_pline\n#stato=INCOMPLETO\n')) + ', "nom_segnato_alz.scr")');
var aN = n.avvisi.filter(function (a) { return /Nominale incompleto/.test(a.title || ''); })[0] || {};
check('nominale segnato INCOMPLETO senza buchi: "il file è segnato come incompleto" (prima "0 gradi mancanti")',
    /segnato come incompleto/.test(aN.body || '') && !/\b0 gradi/.test(aN.body || ''), aN.body);
n.esegui('_loadAlzFromText(' + JSON.stringify(MEZZO) + ', "albero12_asp_alz.scr")');
var vN = senzaTag(n.el.verdictBox.innerHTML);
var motivoN = String((n.ctx.window._esitoCollaudo || {}).motivoNominale || '');
check('...il verdetto lo dice in parole, senza "#stato=INCOMPLETO" (che finiva anche nel PDF del cliente)',
    /NON VALUTABILE/.test(vN) && /segnato come incompleto/.test(vN) && !/#stato/.test(vN) && /segnato come incompleto/.test(motivoN) && !/#stato/.test(motivoN), vN.slice(0, 200));
n.avvisi.length = 0;
n.esegui('_caricaNominale(' + JSON.stringify(NOM_LF.replace('_pline\n', '_pline\ngradi;alzata\n')) + ', "progetto.csv")');
var aT = n.avvisi.filter(function (a) { return /righe scartate/.test(a.title || ''); })[0] || {};
check('CSV con la riga dei titoli: "1 riga non letta" (prima "1 righe non lette") e il consiglio di toglierla',
    /1 riga non letta/.test(aT.body || '') && /toglila/.test(aT.body || ''), aT.body);
var vT = senzaTag(n.el.verdictBox.innerHTML);
check('...e nel verdetto "righe non valide nel file", non "anomalie (duplicati/frazionari)"', /righe non valide nel file/.test(vT) && !/anomalie|frazionari/.test(vT), vT.slice(0, 200));
n.avvisi.length = 0;
n.esegui('_caricaNominale(' + JSON.stringify(NOM_LF.replace(/\n100,[^\n]*/, '')) + ', "nom_buco_alz.scr")');
var aB = n.avvisi.filter(function (a) { return /Nominale incompleto/.test(a.title || ''); })[0] || {};
var vB = senzaTag(n.el.verdictBox.innerHTML);
check('un grado solo senza lettura: "1 grado mancante", "1 grado senza lettura" (singolare)',
    /1 grado mancante/.test(aB.body || '') && /1 grado senza lettura/.test(vB) && !/1 gradi/.test(vB + ' ' + (aB.body || '')), (aB.body || '') + ' | ' + vB.slice(0, 160));

// =============================================================
console.log('');
console.log('--- 6. vista Differenza: fase allineata, parole semplici, numeri senza soglie ---');
var d = contesto();
d.esegui(codiceNucleo);
d.esegui('_loadAlzFromText(' + JSON.stringify(testoScr(NOM)) + ', "albero12_asp_alz.scr")');
d.esegui('_loadAlzFromText(' + JSON.stringify(UN_GRADO) + ', "albero12_asp_dopo_alz.scr")');
d.el.viewMode.value = 'diff';
// Visto nel browser a 1366x768 (2026-11-22): la tela restava alta 480 px sotto
// i riquadri della Differenza e l asse dei gradi finiva sotto il bordo dello
// schermo (fondo del grafico a 795 px con 2 misure, a 882 con 4).
d.grafico.ridimensionamenti = 0;
d.grafico.resize = function () { d.grafico.ridimensionamenti++; };
d.el.diffStats.offsetHeight = 113;
d.esegui('_aggiornaGrafico(true);');
check('Differenza: la tela cede l altezza dei riquadri dei numeri (480 - 113 - 12 = 355 px)',
    d.el.canvas.style.maxHeight === '355px' && d.grafico.ridimensionamenti === 1, d.el.canvas.style.maxHeight + ', ' + d.grafico.ridimensionamenti + ' ridimensionamenti');
var diffAll =d.grafico.data.datasets[1].data.filter(function (v) { return v !== null; }).map(Math.abs);
var maxAll = Math.max.apply(null, diffAll);
var testoDiff = senzaTag(d.el.diffStats.innerHTML);
var testaDiff = senzaTag((d.el.diffStats.innerHTML.match(/<div class="diff-testa">([\s\S]*?)<\/div>/) || [])[1] || '');
check('"Allinea la fase" acceso: la stessa camma un grado piu in la non sembra consumata', maxAll < 0.02, maxAll.toFixed(4) + ' mm');
check('...e lo spostamento e dichiarato in testa, col nome della curva', /albero12_asp_dopo ?: riallineata di [+-]1°/.test(testaDiff), testaDiff);
check('...riferimento col nome della prima misura', /^Riferimento: albero12_asp ·/.test(testaDiff), testaDiff);
check('testata corta, su una riga (prima 2 righe di spiegazione)', testaDiff.length <= 75 && !/misura meno riferimento/.test(testaDiff), testaDiff.length + ' caratteri');
check('parole semplici: scarto massimo, medio, quadratico medio', /Scarto massimo/.test(testoDiff) && /Scarto medio/.test(testoDiff) && /Scarto quadratico medio/.test(testoDiff));
check('niente colori a soglie fisse (non erano la tolleranza del collaudo) e niente legenda dei colori',
    !/diff-stat-value (warn|bad)/.test(d.el.diffStats.innerHTML) && !/giallo|rosso|soglie/.test(testoDiff), testoDiff.slice(-120));
check('l asse verticale dice "differenza (mm)"', d.grafico.options.scales.y.title.text === 'differenza (mm)');
check('la casella "Allinea la fase" si vede solo in Differenza', d.el.allineaFaseBox.style.display === '');
d.el.allineaFase.checked = false;
d.esegui('_aggiornaGrafico(false);');
var grezza = Math.max.apply(null, d.grafico.data.datasets[1].data.filter(function (v) { return v !== null; }).map(Math.abs));
check('spenta: la differenza grezza di prima (un grado di fase = decimi di mm sul fianco)', grezza > 0.1 && /differenza grezza/.test(senzaTag(d.el.diffStats.innerHTML)), grezza.toFixed(3) + ' mm');
check('numeri della differenza con la virgola', !/\d\.\d+ ?mm/.test(d.el.diffStats.innerHTML));
d.el.allineaFase.checked = true;
d.el.diffStats.offsetHeight = 300;
d.esegui('_loadAlzFromText(' + JSON.stringify(BOZZO) + ', "terza_alz.scr")');
check('...con piu righe di numeri non scende sotto un minimo leggibile (260 px)', d.el.canvas.style.maxHeight === '260px', d.el.canvas.style.maxHeight);
check('una misura caricata in vista Differenza diventa subito una differenza (prima: valore assoluto)',
    Math.max.apply(null, d.grafico.data.datasets[2].data.filter(function (v) { return v !== null; })) < 1, 'max ' + Math.max.apply(null, d.grafico.data.datasets[2].data.filter(function (v) { return v !== null; })).toFixed(3));
check('con piu curve: una riga per curva, col suo riallineamento', (d.el.diffStats.innerHTML.match(/class="diff-riga"/g) || []).length === 2 &&
    /ogni curva riallineata al riferimento/.test(senzaTag(d.el.diffStats.innerHTML)));
d.avvisi.length = 0;
d.esegui('rimuoviMisura(2); rimuoviMisura(3);');
check('rimasta una misura sola: si torna alle curve sovrapposte e lo si dice',
    d.el.viewMode.value === 'overlay' && d.grafico.options.scales.y.title.text === 'alzata (mm)' && d.el.diffStats.style.display === 'none' && d.avvisi.length === 1);
check('...e la tela torna alta come prima (480 px, dal foglio di stile)', d.el.canvas.style.maxHeight === '', JSON.stringify(d.el.canvas.style.maxHeight));

// =============================================================
console.log('');
console.log('--- 7. archivio del programma ---');
var r = contesto();
r.esegui(funzioni(['_nomeDaFile', '_misureInArchivio', '_riempiArchivio', '_postoLibero', '_daArchivio']));
var elenco = [{ name: 'albero12_asp_alz.scr', mtime: Date.UTC(2026, 10, 20) }, { name: 'vecchio_pol.scr' }, { name: 'progetto.csv' },
              { name: 'albero12_sca_alz.SCR', mtime: Date.UTC(2026, 10, 19) }, { name: 'nota.txt' }];
r.ctx.files = elenco;
var scelte = JSON.parse(JSON.stringify(r.esegui('_misureInArchivio(files).map(function (f) { return f.name; })')));
check('solo le misure di Alzata (*_alz.scr)', scelte.join(',') === 'albero12_asp_alz.scr,albero12_sca_alz.SCR', scelte.join(','));
r.esegui('_riempiArchivio(files);');
var opz1 = r.el.archivioMisure.options;
check('ogni tendina: invito, poi le misure col nome e la data', ['archivioMisure', 'archivioNominale', 'archivioPolare'].every(function (i) { return r.el[i].options.length === 3 && !r.el[i].disabled; }) &&
    opz1[0].value === '' && /Scegli/.test(opz1[0].textContent) && opz1[1].value === 'albero12_asp_alz.scr' && /^albero12_asp\s+\(\d\d\/\d\d\/\d{4}\)$/.test(opz1[1].textContent), opz1.map(function (o) { return o.textContent; }).join(' | '));
r.esegui('_riempiArchivio(null);');
check('archivio non raggiungibile: lo dice e rimanda al disco', r.el.archivioNominale.disabled && /non raggiungibile/.test(r.el.archivioNominale.options[0].textContent));

// =============================================================
console.log('');
console.log('--- 8. vista polare ---');
var p = contesto();
p.esegui(funzioni(['COLORI_CURVE', '_tickMm', '_mm', '_conta', 'grfColors', 'polChartOptions', '_nomeDaFile', '_cerchioBase', '_raggiPolari', '_raggiDaPolareVecchio', '_caricaPolare']));
var po = p.esegui('polChartOptions()');
check('scala dal centro: la sagoma e in proporzione', po.scales.r.min === 0);
check('numeri e raggi ogni 30 gradi, non 360 etichette', po.scales.r.pointLabels.callback(30) === '30°' && po.scales.r.pointLabels.callback(31) === '' &&
    po.scales.r.angleLines.lineWidth({ index: 29 }) === 1 && po.scales.r.angleLines.lineWidth({ index: 30 }) === 0);
check('proporzioni fisse e quadrate: l altezza segue la larghezza, non il riquadro', po.maintainAspectRatio === true && po.aspectRatio === 1);

// Il ciclo di ridimensionamento di Chart.js, con la libreria vera e la sua
// piattaforma per il browser: la tela sta in un contenitore che ha anche
// "altri" px di contenuto (nome e nota). Impaginazione come style.css:
// .polar-grid canvas { width: 100%; height: auto } => altezza mostrata =
// larghezza * altezza / larghezza della bitmap. A ogni giro il contenitore
// segnala la sua misura, come fa il ResizeObserver del browser.
function simulaPolare(opzioni, altri) {
    var vecchi = {};
    ['window', 'document', 'ResizeObserver', 'MutationObserver'].forEach(function (k) { vecchi[k] = Object.getOwnPropertyDescriptor(global, k); });
    var osservatori = [];
    global.window = { devicePixelRatio: 1, addEventListener: function () {}, removeEventListener: function () {} };
    global.document = { addEventListener: function () {}, removeEventListener: function () {} };
    global.ResizeObserver = function (cb) { this.cb = cb; osservatori.push(this); };
    global.ResizeObserver.prototype.observe = function () {};
    global.ResizeObserver.prototype.disconnect = function () {};
    global.MutationObserver = function () {};
    global.MutationObserver.prototype.observe = function () {};
    global.MutationObserver.prototype.disconnect = function () {};
    var LARGO = 277, storia = [], grafico = null;
    var attr = { width: '300', height: '300' };
    var contenitore = { isConnected: true, toString: function () { return '[object HTMLDivElement]'; } };
    var telaP = { width: 300, height: 300, style: { display: '', height: '', width: '' }, parentNode: contenitore,
                  getAttribute: function (k) { return attr[k] || null; }, setAttribute: function (k, v) { attr[k] = String(v); },
                  removeAttribute: function (k) { delete attr[k]; }, addEventListener: function () {}, removeEventListener: function () {} };
    telaP.getContext = function () { return contesto2d(null, function () { return telaP; }); };
    function mostrata() { return telaP.width && telaP.height ? LARGO * telaP.height / telaP.width : 0; }
    telaP.getBoundingClientRect = function () { return { left: 0, top: 0, width: LARGO, height: mostrata() }; };
    contenitore.getBoundingClientRect = function () { return { left: 0, top: 0, width: LARGO, height: altri + mostrata() }; };
    var zero = { 'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
                 'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px',
                 'border-top-width': '0px', 'border-right-width': '0px', 'border-bottom-width': '0px', 'border-left-width': '0px',
                 maxWidth: 'none', maxHeight: 'none', boxSizing: 'border-box' };
    var vista = { getComputedStyle: function () { return zero; } };
    telaP.ownerDocument = { defaultView: vista };
    contenitore.ownerDocument = { defaultView: vista };
    try {
        var etich = [], dati = [];
        for (var gp = 1; gp <= 360; gp++) { etich.push(gp); dati.push(16 + (gp > 120 && gp < 240 ? 8 * Math.sin((gp - 120) / 120 * Math.PI) : 0)); }
        grafico = new Chart(telaP, { type: 'radar', data: { labels: etich, datasets: [{ data: dati }] }, options: opzioni });
        grafico.resize();
        storia.push(Math.round(mostrata()));
        for (var giro = 0; giro < 10; giro++) {
            osservatori.forEach(function (o) { o.cb([{ contentRect: { width: LARGO, height: altri + mostrata() } }]); });
            storia.push(Math.round(mostrata()));
        }
    } catch (e) {
        storia.push('errore: ' + e.message);
    } finally {
        try { if (grafico) grafico.destroy(); } catch (e) { /* solo pulizia */ }
        Object.keys(vecchi).forEach(function (k) { if (vecchi[k]) Object.defineProperty(global, k, vecchi[k]); else delete global[k]; });
    }
    return storia;
}
function ferma(storia) {
    var dopo = storia.slice(1);
    return dopo.length === 10 && dopo.every(function (h) { return typeof h === 'number' && Math.abs(h - dopo[0]) <= 1; });
}
if (typeof Chart === 'function') {
    var opzPol = clona(po);
    opzPol.animation = false;
    var conNota = simulaPolare(opzPol, 61);
    check('la tela polare non cresce piu: con nome e nota nello stesso contenitore resta ferma e quadrata',
        ferma(conNota) && Math.abs(conNota[conNota.length - 1] - 277) <= 1, conNota.join(' -> '));
    var sola = simulaPolare(clona(opzPol), 0);
    check('...e da sola nel suo contenitore, come nella pagina', ferma(sola) && Math.abs(sola[sola.length - 1] - 277) <= 1, sola.join(' -> '));
    var vecchia = clona(opzPol);
    vecchia.maintainAspectRatio = false;
    delete vecchia.aspectRatio;
    var cresce = simulaPolare(vecchia, 61);
    check('il controllo vede il difetto di prima (altezza libera: +61 px a ogni giro)',
        typeof cresce[cresce.length - 1] === 'number' && cresce[cresce.length - 1] > cresce[1] + 300, cresce.join(' -> '));
}

p.el.polRBase.value = '';
check('cerchio base vuoto: nessun disegno inventato', p.esegui('_cerchioBase(false).ok') === false);
p.el.polRBase.value = '34,5';
var cb = p.esegui('_cerchioBase(false)');
check('diametro "34,5" (con la virgola): raggio 17,25', cb.ok && Math.abs(cb.raggio - 17.25) < 1e-12);
p.ctx.cam = NOM;
var rr = p.esegui('_raggiPolari({ tipo: "alz", cam: cam }, _cerchioBase(false))');
check('raggio = meta del diametro + alzata', Math.abs(rr[100] - (17.25 + Number(NOM[100]))) < 1e-12 && Math.abs(rr[300] - (17.25 + Number(NOM[300]))) < 1e-12);
p.el.polRBase.value = 'abc';
p.esegui('_cerchioBase(true)');
check('diametro non valido: il campo viene segnalato', p.segnalati.length === 1 && /cerchio base/i.test(p.segnalati[0]));
p.ctx._disegnaPolari = function () {};
check('una misura con un nome qualunque entra nella vista polare', p.esegui('_caricaPolare(' + JSON.stringify(MEZZO) + ', "profilo cliente.csv")') === true && p.ctx.window._polData[1].tipo === 'alz');
check('un file che non e una misura no, con un messaggio', p.esegui('_caricaPolare(' + JSON.stringify(CORTO) + ', "x.scr")') === false && /non è una misura/.test((p.avvisi[p.avvisi.length - 1] || {}).title || ''));
p.avvisi.length = 0;
p.esegui('_caricaPolare(' + JSON.stringify(MEZZO.replace('_pline\r\n', '_pline\r\n#stato=INCOMPLETO\r\n')) + ', "segnata_alz.scr")');
var aP = p.avvisi.filter(function (a) { return /incompleta/i.test(a.title || ''); })[0] || {};
check('una misura segnata incompleta nella vista polare: lo dice, senza "0 gradi senza lettura"',
    /segnato come incompleto/.test(aP.body || '') && !/\b0 gradi/.test(aP.body || ''), aP.body);

// =============================================================
//  Parti asincrone: stampa del collaudo, archivio via rete, Svuota tutto
// =============================================================
// un'immagine PNG vera e minima (4x2 bianca), al posto della cattura del grafico
function pngBianco(w, h) {
    var zlib = require('zlib');
    function crc32(buf) {
        var crc = 0xffffffff;
        for (var n = 0; n < buf.length; n++) {
            var c = (crc ^ buf[n]) & 0xff;
            for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crc = (crc >>> 8) ^ c;
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
    function blocco(tipo, dati) {
        var len = Buffer.alloc(4); len.writeUInt32BE(dati.length);
        var td = Buffer.concat([Buffer.from(tipo, 'ascii'), dati]);
        var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    }
    var ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    var grezzo = Buffer.alloc((w * 3 + 1) * h, 255);
    for (var y = 0; y < h; y++) grezzo[y * (w * 3 + 1)] = 0;
    return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blocco('IHDR', ihdr),
        blocco('IDAT', zlib.deflateSync(grezzo)), blocco('IEND', Buffer.alloc(0))]).toString('base64');
}
var PNG_PROVA = pngBianco(4, 2);
function attesa() { return new Promise(function (ok) { setImmediate(ok); }); }
(async function () {
    console.log('');
    console.log('--- 9. stampa del collaudo (PDF vero, con la libreria del programma) ---');
    var J = null;
    try { J = require(path.join(RADICE, 'jspdf.umd.min.js')); } catch (e) { J = null; }
    var JsPDF = J && (J.jsPDF || (J.default && J.default.jsPDF));
    check('la libreria PDF del programma si carica', typeof JsPDF === 'function');
    if (typeof JsPDF === 'function') {
        var s = contesto();
        s.esegui(codiceNucleo);
        s.esegui(funzioni(['_quando', '_nomePerFile', 'stampaCollaudo']));
        if (INTESTAZIONE_UI) { s.esegui(INTESTAZIONE_UI); s.ctx.window.cammesIntestazionePdf = s.ctx.intestazionePdf; }
        else s.ctx.window.cammesIntestazionePdf = function (doc, nome, x, y) { if (!nome) return false; doc.text(String(nome), x - doc.getTextWidth(String(nome)), y); return true; };
        var salvati = [];
        s.ctx.window.jspdf = { jsPDF: function (o) { var doc = new JsPDF(o); doc.save = function (nome) { salvati.push({ nome: nome, pdf: doc.output() }); }; return doc; } };
        s.ctx.window._officina = 'Officina di prova';
        s.ctx.window.CAMMES_VERSION = 'v0.0.0-prova';
        s.ctx._immagineGrafico = function () { return { dati: PNG_PROVA, larghezza: 900, altezza: 450 }; };
        check('senza nominale non stampa, e dice cosa manca', s.esegui('stampaCollaudo()') === false && /nominale/.test((s.avvisi[s.avvisi.length - 1] || {}).title || ''));
        s.esegui('_caricaNominale(' + JSON.stringify(NOMINALE_TXT) + ', "albero12_nominale_alz.scr")');
        check('senza misure nemmeno', s.esegui('stampaCollaudo()') === false && /misura/i.test((s.avvisi[s.avvisi.length - 1] || {}).title || ''));
        s.esegui('_loadAlzFromText(' + JSON.stringify(MEZZO) + ', "albero12_asp_alz.scr")');
        s.esegui('_loadAlzFromText(' + JSON.stringify(BOZZO) + ', "albero12_sca_alz.scr")');
        s.esegui('_loadAlzFromText(' + JSON.stringify(MEZZO.replace('_pline\r\n', '_pline_conv:finger:40x35\r\n')) + ', "albero12_leva_alz.scr")');
        s.el.tolMm.value = 'abc';
        check('con la tolleranza non valida non stampa (sullo schermo non c e un verdetto)', s.esegui('stampaCollaudo()') === false && salvati.length === 0 &&
            /Tolleranza/.test((s.avvisi[s.avvisi.length - 1] || {}).title || ''));
        s.el.tolMm.value = '0,10';
        var fatto = false, errore = '';
        try { fatto = s.esegui('stampaCollaudo()'); } catch (e) { errore = e.message; }
        check('con nominale, misure e tolleranza: il PDF si crea', fatto === true && salvati.length === 1, errore);
        if (salvati.length) {
            var pdf = salvati[0];
            var righe = (pdf.pdf.match(/\((?:[^()\\]|\\.)*\)\s*Tj/g) || []).map(function (t) { return t.replace(/\)\s*Tj$/, '').slice(1).replace(/\\([()\\])/g, '$1'); });
            var tutto = righe.join(' ').replace(/\s+/g, ' ');
            check('nome del file: collaudo_<nominale>_<data>.pdf', /^collaudo_albero12_nominale_\d{4}-\d\d-\d\d\.pdf$/.test(pdf.nome), pdf.nome);
            check('in testa l intestazione dell officina', /Officina di prova/.test(tutto));
            check('titolo e data di stampa', /Collaudo su profilo nominale/.test(tutto) && /Stampato il \d/.test(tutto));
            check('il file del nominale', /albero12_nominale_alz\.scr/.test(tutto));
            check('la tolleranza, con la virgola', /± 0,10 mm/.test(tutto));
            check('il verdetto di ogni misura, come sullo schermo', /CONFORME albero12_asp/.test(tutto) && /NON CONFORME albero12_sca/.test(tutto));
            var esitoSchermo = s.ctx.window._esitoCollaudo;
            check('...le stesse parole del pannello', esitoSchermo && esitoSchermo.righe.every(function (r) { return tutto.indexOf(r.stato + ' ' + r.nome) >= 0; }));
            check('scarto massimo col suo grado, e il riallineamento', /scarto massimo 0,\d{3} mm a \d+°/.test(tutto) && /riallineata di [+-]0,5°/.test(tutto));
            check('...e sulla carta ogni misura dice anche entro o fuori da quale tolleranza', /entro ± 0,10 mm/.test(tutto) && /fuori da ± 0,10 mm/.test(tutto));
            check('il file di ogni misura', /file albero12_asp_alz\.scr/.test(tutto) && /file albero12_sca_alz\.scr/.test(tutto));
            check('una curva gia convertita lo dice in parole: "leva a dito 40 / 35 mm", mai "finger:40x35"',
                /punteria simulata \(leva a dito 40 \/ 35 mm\)/.test(tutto) && !/finger|_pline/.test(tutto), (tutto.match(/punteria[^)]*\)/) || [''])[0]);
            check('l avvertenza: misura a carattere indicativo', /Misura a carattere indicativo: non sostituisce un collaudo metrologico certificato\./.test(tutto));
            check('il grafico c e', /\/Subtype \/Image/.test(pdf.pdf));
            var senzaVersione = tutto.split('v0.0.0-prova').join('');
            check('nessun numero col punto decimale nel documento', !/\d\.\d/.test(senzaVersione), (senzaVersione.match(/.{0,20}\d\.\d.{0,10}/) || [''])[0]);
            check('nessun "grafico N" ne parole inglesi (PASS, FAIL)', !/grafico ?\d|\bPASS\b|\bFAIL\b/.test(tutto));
        }
    }

    console.log('');
    console.log('--- 10. dall archivio, anche dal secondo PC ---');
    var a = contesto();
    a.esegui(funzioni(['_postoLibero', '_chiediFile', '_motivoMancato', '_daArchivio']));
    var chiesti = [], arrivati = [];
    a.ctx.fetch = function (url) { chiesti.push(url); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve('CONTENUTO'); } }); };
    a.ctx._caricaNominale = function (t, n) { arrivati.push(['nominale', t, n]); };
    a.ctx._loadAlzFromText = function (t, n) { arrivati.push(['misura', t, n]); };
    a.ctx._caricaPolare = function (t, n) { arrivati.push(['polare', t, n]); };
    a.el.archivioNominale.value = 'albero 12_nominale_alz.scr';
    a.esegui('_daArchivio(document.getElementById("archivioNominale"), "nominale")');
    a.el.archivioMisure.value = 'albero12_asp_alz.scr';
    a.esegui('_daArchivio(document.getElementById("archivioMisure"), "misura")');
    a.el.archivioPolare.value = 'albero12_asp_alz.scr';
    a.esegui('_daArchivio(document.getElementById("archivioPolare"), "polare")');
    await attesa(); await attesa(); await attesa();
    check('la scelta chiede il file al programma (GET /api/file/<nome>)', chiesti[0] === '/api/file/albero%2012_nominale_alz.scr', chiesti.join(' '));
    check('...e lo porta dove serve: nominale, misure, vista polare',
        arrivati.length === 3 && arrivati[0][0] === 'nominale' && arrivati[0][2] === 'albero 12_nominale_alz.scr' && arrivati[1][0] === 'misura' && arrivati[2][0] === 'polare' && arrivati[0][1] === 'CONTENUTO',
        JSON.stringify(arrivati.map(function (x) { return x[0]; })));
    check('...e la tendina torna all invito', a.el.archivioNominale.value === '' && a.el.archivioMisure.value === '');
    var f = contesto();
    f.esegui(funzioni(['_postoLibero', '_chiediFile', '_motivoMancato', '_daArchivio']));
    f.ctx.fetch = function (url) {
        if (/nominale/.test(url)) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve('Not found'); } });
    };
    f.el.archivioNominale.value = 'albero12_nominale_alz.scr';
    f.esegui('_daArchivio(document.getElementById("archivioNominale"), "nominale")');
    f.el.archivioPolare.value = 'sparito_alz.scr';
    f.esegui('_daArchivio(document.getElementById("archivioPolare"), "polare")');
    await attesa(); await attesa(); await attesa();
    var aNom = f.avvisi.filter(function (x) { return /Nominale non caricato/.test(x.title || ''); })[0] || {};
    var aPol = f.avvisi.filter(function (x) { return /Vista polare non caricata/.test(x.title || ''); })[0] || {};
    check('il programma non risponde: il titolo dice che cosa non e arrivato (il nominale), senza "Failed to fetch"',
        /non ha risposto/.test(aNom.body || '') && !/Failed|fetch|HTTP/.test(aNom.body || ''), (aNom.title || '') + ' / ' + (aNom.body || ''));
    check('file sparito dall archivio (404): lo dice in parole, senza "HTTP 404"',
        /non c'è più nell'archivio/.test(aPol.body || '') && !/HTTP|404/.test(aPol.body || ''), (aPol.title || '') + ' / ' + (aPol.body || ''));

    console.log('');
    console.log('--- 11. Svuota tutto ---');
    var v = contesto({ location: { search: '?files=albero12_asp_alz.scr', pathname: '/grafici.html' } });
    var sostituito = [];
    v.ctx.history = { replaceState: function (a1, a2, url) { sostituito.push(url); } };
    v.ctx.window.history = v.ctx.history;
    v.esegui(codiceNucleo);
    v.esegui(funzioni(['svuotaTutto', '_svuota']));
    v.ctx._disegnaPolari = function () {};
    v.esegui('_caricaNominale(' + JSON.stringify(NOMINALE_TXT) + ', "albero12_nominale_alz.scr")');
    v.esegui('_loadAlzFromText(' + JSON.stringify(MEZZO) + ', "albero12_asp_alz.scr")');
    v.el.tolMm.value = '0,05';
    var risposta = false;
    v.ctx.window.cammesConferma = function (titolo, testo, si) { v.ctx.domanda = { titolo: titolo, testo: testo, si: si }; return Promise.resolve(risposta); };
    v.esegui('svuotaTutto()');
    await attesa();
    check('chiede prima, con una finestra della pagina che dice cosa resta', v.ctx.domanda && /Svuota tutto/.test(v.ctx.domanda.si) && /archivio non vengono toccati/.test(v.ctx.domanda.testo));
    check('"Annulla": non tocca niente', v.ctx.window._cmpData[1] && v.ctx._nominal);
    risposta = true;
    v.esegui('svuotaTutto()');
    await attesa();
    check('"Svuota tutto": misure e nominale via, senza ricaricare la pagina', !v.ctx.window._cmpData[1] && !v.ctx._nominal && v.el.verdictBox.innerHTML === '' && v.el.corpoMisure.children.length === 0);
    check('...la tolleranza resta', v.el.tolMm.value === '0,05');
    check('...e arrivati da Home le misure non tornano col ricaricamento', sostituito.length === 1 && sostituito[0] === '/grafici.html');

    console.log('');
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: la pagina Confronto mostra i nomi delle misure su assi in gradi, il verdetto in alto');
    console.log('compatto e sempre aggiornato con la sua stampa, allinea la fase nella differenza, prende le');
    console.log('misure dall archivio e la vista polare resta ferma.');
    process.exit(0);
})().catch(function (e) { console.log('  FAIL  errore inatteso: ' + (e && e.stack || e)); process.exit(1); });
