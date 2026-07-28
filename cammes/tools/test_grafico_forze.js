// =============================================================
//  test_grafico_forze.js — il grafico non deve dire il contrario delle celle
// =============================================================
//  Rilievo (seconda meta' di P1-07): le celle "Margine minimo" e "Distacco
//  valvola" dicevano correttamente "non valutabile" quando k, F0 o la massa
//  equivalente erano ancora ai valori di esempio — ma il grafico accanto
//  disegnava comunque le quattro curve, incrocio compreso. Un incrocio fra
//  forza di molla e forza d'inerzia SI LEGGE COME UN VERDETTO: "qui la valvola
//  si stacca". Costruito su una molla che l'operatore non ha mai inserito.
//
//  Due verita' sulla stessa schermata, a 20 pixel di distanza: la cella che si
//  astiene e il disegno che si pronuncia.
//
//  La cura e' quella gia' usata per le celle (P1-07): non si emette il verdetto
//  e si dice perche'. Stessa fonte, `latoValutabile(side)`, per celle, grafico,
//  CSV e PDF — non una seconda regola che puo' divergere.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente (4 dataset sempre).
//
//  Uso: node tools/test_grafico_forze.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(HTML);
    if (!m) throw new Error('funzione non trovata in analisi.html: ' + nome);
    var fine = HTML.indexOf('\n}\n', m.index);
    if (fine < 0) throw new Error('fine funzione non trovata: ' + nome);
    return HTML.substring(m.index, fine + 3);
}

console.log('=============================================================');
console.log(' GRAFICO FORZE: nessun verdetto su valori di esempio');
console.log('=============================================================');

// ---------- DOM finto ----------
var elementi = {};
function elemento(id) {
    if (elementi[id]) return elementi[id];
    elementi[id] = {
        id: id, value: '', textContent: '', innerHTML: '', title: '',
        style: {}, dataset: {}, className: '',
        getContext: function () { return { finto: true }; },
        getAttribute: function () { return null; }
    };
    return elementi[id];
}

// ---------- Chart finto: registra cosa gli e' stato chiesto di disegnare ----
var disegnato = null;
function ChartFinto(ctx, cfg) {
    disegnato = cfg;
    this.destroy = function () {};
    this.data = cfg.data;
    this.update = function () {};
}

// ---------- quali campi l'operatore ha confermato ----------
var confermati = {};
var ctx = {
    console: console, Math: Math, Number: Number, String: String,
    Object: Object, Array: Array, JSON: JSON, isFinite: isFinite,
    document: { getElementById: elemento },
    Chart: ChartFinto,
    forceChart: null,
    campoEConfermato: function (id) { return !!confermati[id]; },
    kinChartOptions: function () { return {}; },
    fmtN: function (v) { return String(v); }
};
ctx.window = ctx;
vm.createContext(ctx);

// MOTIVO_ESEMPIO vive fuori dalle funzioni: lo prendo dalla pagina, non lo
// ricopio (una copia nel test smette di dire il vero al primo ritocco).
var iMot = HTML.indexOf('var MOTIVO_ESEMPIO =');
if (iMot < 0) throw new Error('MOTIVO_ESEMPIO non trovata in analisi.html');
vm.runInContext(HTML.substring(iMot, HTML.indexOf(';\n', iMot) + 2), ctx);
['latoValutabile', 'curveGraficoForze', 'scriviTestiGraficoForze', 'createForceChart'].forEach(function (n) {
    vm.runInContext(estrai(n), ctx, { filename: 'analisi.html:' + n });
});

// ---------- forze finte, con un incrocio ben visibile ----------
function forzeFinte(scala) {
    var fS = [], fI = [];
    for (var i = 0; i <= 720; i++) {
        fS[i] = 200;                                  // molla piatta
        fI[i] = (i > 300 && i < 420) ? 400 * scala : -50;  // inerzia che la supera
    }
    return { fSpring: fS, fInertia: fI, marginMin: -200, marginMinIdx: 360, rpmCrit: 5000,
             fInertiaMax: 400 * scala, fSpringFullLift: 300 };
}
function nDataset(etichettaContiene) {
    if (!disegnato) return 0;
    return disegnato.data.datasets.filter(function (d) {
        return d.label.indexOf(etichettaContiene) >= 0;
    }).length;
}
function disegna() {
    disegnato = null;
    // La nota parte NASCOSTA, come sta in pagina: cosi' un display '' significa
    // che e' stato il codice a mostrarla, non il valore di partenza del finto.
    elemento('forceChartNota').style.display = 'none';
    elemento('forceChartNota').textContent = '';
    vm.runInContext('createForceChart(__fIn, __fEx, 7000);', ctx);
}
ctx.__fIn = forzeFinte(1);
ctx.__fEx = forzeFinte(0.8);

// ---------- caso 1: niente confermato ----------
console.log('--- nessun campo confermato: nessuna curva, e il perche ---');
confermati = {};
disegna();
check('non traccia alcuna curva di forza',
    disegnato.data.datasets.length === 0, disegnato.data.datasets.length + ' dataset');
var titolo = elementi.forceChartTitle.textContent;
check('il titolo dichiara che non e valutabile', /non valutabile/i.test(titolo), titolo);
check('e dice quali lati', /aspirazione/i.test(titolo) && /scarico/i.test(titolo), titolo);
var nota = elementi.forceChartNota;
check('sotto il grafico compare il motivo', nota && nota.style.display === '');
check('ed e lo STESSO motivo delle celle (una sola fonte)',
    nota && nota.textContent.indexOf(ctx.MOTIVO_ESEMPIO) >= 0,
    (nota && nota.textContent || '').substring(0, 60));

// ---------- caso 2: solo aspirazione confermata ----------
console.log('--- solo aspirazione confermata: si traccia solo quella ---');
confermati = { springK: 1, springPreload: 1, massEqIntake: 1 };
disegna();
check('due curve per l aspirazione (molla + inerzia)', nDataset('asp.') === 2, nDataset('asp.') + '');
check('nessuna curva per lo scarico', nDataset('scar.') === 0, nDataset('scar.') + '');
titolo = elementi.forceChartTitle.textContent;
check('il titolo nomina lo scarico come non valutabile',
    /scarico/i.test(titolo) && /non valutabile/i.test(titolo), titolo);
check('e NON accusa l aspirazione', !/aspirazione/i.test(titolo), titolo);

// ---------- caso 3: tutto confermato ----------
console.log('--- tutto confermato: il grafico completo, senza avvisi ---');
confermati = { springK: 1, springPreload: 1, massEqIntake: 1, massEqExhaust: 1 };
disegna();
check('quattro curve', disegnato.data.datasets.length === 4, disegnato.data.datasets.length + '');
titolo = elementi.forceChartTitle.textContent;
check('il titolo torna quello normale', !/non valutabile/i.test(titolo), titolo);
// 7000 all'italiana e' "7.000": il titolo passa da toLocaleString, quindi
// accetto entrambe le forme.
check('il regime resta scritto nel titolo', /7[.\s]?000/.test(titolo), titolo);
check('la nota sparisce', elementi.forceChartNota.style.display === 'none');

// ---------- la regola e' UNA, e il titolo e' UNO ----------
console.log('--- una sola regola, e un solo titolo ---');
// Se il grafico si costruisse una seconda regola propria, questa cadrebbe.
var corpo = estrai('createForceChart');
check('createForceChart decide con latoValutabile, non con una regola sua',
    corpo.indexOf('latoValutabile') >= 0 || corpo.indexOf('curveGraficoForze') >= 0);
check('e non rilegge i campi per conto proprio',
    corpo.indexOf('campoEConfermato') < 0 && corpo.indexOf("getElementById('springK')") < 0);
// Il ricalcolo immediato scriveva un titolo tutto suo — senza il "non
// valutabile" e col regime in un altro formato — e riscriveva i dataset PER
// INDICE, che con un numero variabile di curve punta al dataset sbagliato o a
// nessuno.
var live = estrai('liveRetuneForces');
check('il ricalcolo immediato non ricompone il titolo per conto suo',
    live.indexOf('Forze treno valvole') < 0);
check('e delega la scrittura dei testi alla funzione unica',
    live.indexOf('scriviTestiGraficoForze') >= 0);
check('e non scrive piu i dataset per indice',
    !/datasets\[\d\]\s*\.data\s*=/.test(live));
check('e si ricostruisce se cambiano i lati valutabili',
    live.indexOf('curveGraficoForze') >= 0 && live.indexOf('createForceChart') >= 0);

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: il grafico delle forze si astiene dove si astengono le');
console.log('celle, dice quali lati e perche, e usa la loro stessa regola.\n');
