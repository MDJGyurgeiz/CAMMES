// =============================================================
//  test_moduli_spenti.js — spegnere un modulo deve spegnere il calcolo
// =============================================================
//  Rilievo: togliere la spunta a "Follower simulato" nascondeva i campi ma
//  LASCIAVA ATTIVA la conversione. L'operatore vede sparire i controlli e
//  conclude di aver disattivato la funzione, mentre continua a lavorare.
//
//  Misurato al browser sulla camma VW KR reale (bicchiere 35, cerchio base
//  32,6): con il modulo spento l'alzata al PMS restava 4,023 mm invece dei
//  1,033 mm del puntalino grezzo. 2,99 mm di scarto su un lobo da 10,64 — e
//  l'alzata al PMS finisce STAMPATA sulla scheda camma.
//
//  Lo stesso vale per "Dinamica valvole": nascondeva il selettore
//  Elasticita' del comando valvola lasciando girare la compliance.
//
//  Il test NON usa numeri di riga: estrae le funzioni reali da analisi.html
//  cercandole per firma e le esegue con un DOM finto.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_moduli_spenti.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var vm = require('vm');

// Fine riga normalizzata a LF: il file e' committato eol=lf ma su Windows git
// lo consegna CRLF, e un test ancorato al CRLF passa qui e fallisce sul runner.
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
console.log(' SPEGNERE UN MODULO SPEGNE IL CALCOLO, NON SOLO I CAMPI');
console.log('=============================================================');

// ---------- DOM finto ----------
var elementi = {};
function elemento(id) {
    if (elementi[id]) return elementi[id];
    var classi = {}, attributi = {};
    elementi[id] = {
        id: id, value: '', checked: false, style: {}, dataset: {},
        classList: {
            toggle: function (c, on) { if (on) classi[c] = true; else delete classi[c]; },
            contains: function (c) { return !!classi[c]; },
            add: function (c) { classi[c] = true; }, remove: function (c) { delete classi[c]; }
        },
        getAttribute: function (a) { return attributi[a] === undefined ? null : attributi[a]; },
        setAttribute: function (a, v) { attributi[a] = v; },
        _attr: attributi, innerHTML: '', textContent: ''
    };
    return elementi[id];
}
// I blocchi con data-module, come stanno in pagina.
function blocco(id, moduli) {
    var e = elemento(id); e.setAttribute('data-module', moduli); return e;
}
var blocchi = [
    blocco('bloccoFollower', 'follower'),
    blocco('bloccoDinamica', 'dinamica'),
    blocco('bloccoMisto', 'molla dinamica race cinematica')
];
// Le caselle del pannello "Funzioni".
function casella(mod) {
    var e = elemento('cb_' + mod); e.setAttribute('data-mod', mod); return e;
}
var caselle = [casella('follower'), casella('dinamica'), casella('molla')];

var registro = {};
var ctx = {
    console: console, Math: Math, Number: Number, String: String,
    Object: Object, Array: Array, JSON: JSON, isFinite: isFinite,
    localStorage: {
        getItem: function (k) { return registro[k] === undefined ? null : registro[k]; },
        setItem: function (k, v) { registro[k] = String(v); }
    },
    document: {
        getElementById: elemento,
        querySelectorAll: function (sel) {
            if (sel === '[data-module]') return blocchi;
            if (sel === '#modulesPanel input[data-mod]') return caselle;
            return [];
        }
    },
    // dipendenze esterne alle funzioni sotto esame
    risvegliaGrafici: function () {},
    onFollowerTypeChange: function () { ctx._conversioneRicalcolata = true; },
    markAnalysisStale: function () { ctx._staleSegnato = true; },
    cammesToast: function (o) { ctx._avvisi.push(o.title || ''); },
    _conversioneRicalcolata: false, _staleSegnato: false, _avvisi: []
};
ctx.window = ctx;
vm.createContext(ctx);

// MODULES_KEY e la tabella degli interruttori vivono fuori dalle funzioni: li
// porto dentro cosi' come stanno in pagina, senza riscriverli qui (una copia
// nel test smetterebbe di dire la verita' al primo modulo aggiunto).
var mk = /var MODULES_KEY = '([^']+)';/.exec(HTML);
if (!mk) throw new Error('MODULES_KEY non trovata in analisi.html');
vm.runInContext("var MODULES_KEY = '" + mk[1] + "';", ctx);
var iTab = HTML.indexOf('var INTERRUTTORI_MODULO = [');
if (iTab < 0) throw new Error('INTERRUTTORI_MODULO non trovata in analisi.html');
vm.runInContext(HTML.substring(iTab, HTML.indexOf('\n];', iTab) + 3), ctx,
    { filename: 'analisi.html:INTERRUTTORI_MODULO' });

['getModules', 'allineaInterruttoriModulo', 'applyModules', 'onModuleToggle'].forEach(function (n) {
    vm.runInContext(estrai(n), ctx, { filename: 'analisi.html:' + n });
});

var ft = elemento('followerType');
var ce = elemento('complianceEnabled');

// ---------- scenario 1: FOLLOWER ----------
console.log('--- "Follower simulato": spento = conversione spenta ---');
registro[mk[1]] = JSON.stringify({ follower: true, dinamica: true });
ft.value = 'bicch';
ce.value = '1';
vm.runInContext('applyModules();', ctx);
check('col modulo acceso il blocco e visibile',
    !elementi.bloccoFollower.classList.contains('mod-hidden'));
check('col modulo acceso la conversione resta quella scelta', ft.value === 'bicch', ft.value);

// L'operatore toglie la spunta.
var cbF = elementi.cb_follower;
cbF.checked = false;
ctx._staleSegnato = false;
vm.runInContext('onModuleToggle(document.getElementById("cb_follower"));', ctx);

check('il blocco si nasconde (comportamento gia esistente)',
    elementi.bloccoFollower.classList.contains('mod-hidden'));
check('la conversione torna al puntalino: NON resta attiva di nascosto',
    ft.value === 'punt', 'followerType="' + ft.value + '"');
check('la scelta precedente viene messa da parte, non buttata',
    ft.dataset.moduloSpento === 'bicch', 'parcheggiato="' + ft.dataset.moduloSpento + '"');
check('l analisi viene marcata da rifare (i numeri cambiano)', ctx._staleSegnato === true);
check('l operatore viene avvisato, non lasciato a indovinare',
    ctx._avvisi.length > 0, ctx._avvisi.join(' | '));

// ...e la riaccende: ritrova il suo bicchiere.
cbF.checked = true;
vm.runInContext('onModuleToggle(document.getElementById("cb_follower"));', ctx);
check('riaccendendo il modulo si ritrova la scelta di prima',
    ft.value === 'bicch', 'followerType="' + ft.value + '"');
check('e il parcheggio viene liberato', !ft.dataset.moduloSpento,
    'parcheggiato="' + ft.dataset.moduloSpento + '"');

// ---------- scenario 2: DINAMICA ----------
console.log('--- "Dinamica valvole": spenta = compliance spenta ---');
ce.value = '1';
var cbD = elementi.cb_dinamica;
cbD.checked = false;
vm.runInContext('onModuleToggle(document.getElementById("cb_dinamica"));', ctx);
check('la compliance non resta attiva a modulo spento', ce.value === '0',
    'complianceEnabled="' + ce.value + '"');
cbD.checked = true;
vm.runInContext('onModuleToggle(document.getElementById("cb_dinamica"));', ctx);
check('riaccendendo si ritrova la compliance attiva', ce.value === '1',
    'complianceEnabled="' + ce.value + '"');

// ---------- non regressione ----------
console.log('--- non regressione ---');
// Un blocco che appartiene a piu' moduli resta visibile se almeno uno e' acceso:
// il modulo "molla" e' ancora acceso, quindi il blocco misto non si nasconde.
registro[mk[1]] = JSON.stringify({ molla: true });
vm.runInContext('applyModules();', ctx);
check('un blocco di piu moduli resta visibile se almeno uno e acceso',
    !elementi.bloccoMisto.classList.contains('mod-hidden'));
check('e un blocco di un solo modulo spento si nasconde',
    elementi.bloccoFollower.classList.contains('mod-hidden'));
// Spegnere un modulo NON deve toccare un interruttore che non gli appartiene.
registro[mk[1]] = JSON.stringify({ follower: true, dinamica: true });
vm.runInContext('applyModules();', ctx);
ft.value = 'roller';
ce.value = '1';
elementi.cb_dinamica.checked = false;
vm.runInContext('onModuleToggle(document.getElementById("cb_dinamica"));', ctx);
check('spegnere Dinamica non tocca il tipo di follower', ft.value === 'roller', ft.value);

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: spegnere un modulo spegne il calcolo che quel modulo');
console.log('governa, mette da parte la scelta per ritrovarla alla riaccensione');
console.log('e marca l analisi da rifare.\n');
