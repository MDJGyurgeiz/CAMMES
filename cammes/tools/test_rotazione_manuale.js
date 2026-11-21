// =============================================================
//  test_rotazione_manuale.js — Ruota e i tasti -/+ portano l'albero
//  dove dice il campo, in qualunque modalita'
// =============================================================
//  DIFETTI trovati con l'analisi di usabilita' del 2026-11-15 e provati sul
//  banco emulato (server vero + firmware emulato):
//
//   1. Il campo e' in GRADI CAMMA, il comando '$±N' del firmware conta UNITA'
//      di motore: 1 grado in Veloce (r32), mezzo grado in Race (r16). Ruota, -
//      e + mandavano i gradi come se fossero unita': in Race "Ruota a 180"
//      partendo da 90 portava a 135, e i tasti -/+ muovevano mezzo grado.
//      Zero virtuale e posizioni salvate la conversione la facevano gia'.
//   2. Il campo non era controllato. Con "90,5" (virgola), "abc" o un decimale
//      che il banco non puo' eseguire il conto dava NaN, nessun ramo costruiva
//      il comando e partiva quello rimasto dalla rotazione PRECEDENTE: il banco
//      ripeteva l'ultimo movimento, annunciando a voce "rotazione a 90,5 gradi".
//      Con il campo vuoto, invece, l'albero tornava a 0 senza che nessuno lo
//      avesse scritto.
//
//  Uso: node tools/test_rotazione_manuale.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var lib = require('../lib/cammes-math.js');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('=============================================================');
console.log(' ROTAZIONE MANUALE: il campo e in gradi, in ogni modalita');
console.log('=============================================================');

var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
var SCAN = fs.readFileSync(path.join(__dirname, '..', 'cammes-scan.js'), 'utf8').replace(/\r\n/g, '\n');

function estrai(src, nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(src);
    if (!m) return null;
    var fine = src.indexOf('\n}\n', m.index);
    return fine < 0 ? null : src.substring(m.index, fine + 3);
}
check('la pagina ha ruota(), il modulo ha m1() e p1()', !!estrai(ALZATA, 'ruota') && !!estrai(SCAN, 'm1') && !!estrai(SCAN, 'p1'));

// Una pagina finta: il campo "step", il socket, la voce, l'avviso sul campo.
function nuovaPagina(passiPerGrado, verso) {
    var p = { inviati: [], errori: [], voce: 0 };
    var campo = { value: '' };
    var ctx = {
        Math: Math, Number: Number, Date: Date, String: String, console: console,
        document: { getElementById: function (id) { return id === 'step' ? campo : null; } },
        window: { cammesValidate: { error: function (el, msg) { p.errori.push(String(msg)); } } },
        sendSocket: { readyState: 1, send: function (s) { p.inviati.push(String(s).replace(/\n$/, '')); } },
        speakLocal: function () { p.voce++; },
        _scanBusy: function () { return false; },
        _assicuraConfigBanco: function () {},
        validaNumero: lib.validaNumero
    };
    vm.createContext(ctx);
    vm.runInContext('var oldg = 0, rsign = ' + verso + ', currentMode = { subStepsPerDeg: ' + passiPerGrado + ' };', ctx);
    var tetto = /^var MAX_UNITA_MOTO\s*=\s*\d+;/m.exec(ALZATA);
    if (tetto) vm.runInContext(tetto[0], ctx);
    ['angoloDaCampo', 'ruota'].forEach(function (n) { var s = estrai(ALZATA, n); if (s) vm.runInContext(s, ctx); });
    ['_comandoGrado', '_configPrimaDelMoto', 'm1', 'p1'].forEach(function (n) { var s = estrai(SCAN, n); if (s) vm.runInContext(s, ctx); });
    p.ruota = function (testo) {
        campo.value = testo; p.inviati.length = 0; p.errori.length = 0; p.voce = 0;
        vm.runInContext('ruota()', ctx);
        return p.inviati.slice();
    };
    p.tasto = function (nome) { p.inviati.length = 0; vm.runInContext(nome + '()', ctx); return p.inviati.slice(); };
    p.val = function (e) { return vm.runInContext(e, ctx); };
    return p;
}

// ---------------------------------------------------------------
console.log('');
console.log('--- Veloce: un grado = una unita ---');
var p = nuovaPagina(1, 1);
var o = p.ruota('90');
check('Ruota a 90 partendo da 0 manda 90 unita in avanti', eq(o, ['$+090']), JSON.stringify(o));
check('...e la pagina sa di essere a 90', p.val('oldg') == 90, String(p.val('oldg')));
o = p.ruota('60');
check('Ruota a 60 torna indietro di 30', eq(o, ['$-030']), JSON.stringify(o));
check('lo stesso angolo non muove niente', p.ruota('60').length === 0);
o = p.tasto('p1');
check('il tasto + muove di un grado', eq(o, ['$+001']) && p.val('oldg') == 61, JSON.stringify(o) + ' oldg=' + p.val('oldg'));
o = p.tasto('m1');
check('il tasto - muove di un grado', eq(o, ['$-001']) && p.val('oldg') == 60, JSON.stringify(o) + ' oldg=' + p.val('oldg'));

// ---------------------------------------------------------------
console.log('');
console.log('--- Race: un grado = due unita (mezzo grado l una) ---');
p = nuovaPagina(2, 1);
o = p.ruota('90');
check('Ruota a 90 partendo da 0 manda 180 unita (90 gradi), non 90 (che sono 45 gradi)', eq(o, ['$+180']), JSON.stringify(o));
o = p.ruota('90,5');
check('il mezzo grado si puo chiedere, anche con la virgola', eq(o, ['$+001']) && p.val('oldg') == 90.5, JSON.stringify(o) + ' oldg=' + p.val('oldg'));
o = p.tasto('p1');
check('il tasto + muove di un grado intero (2 unita), non di mezzo', eq(o, ['$+002']) && p.val('oldg') == 91.5, JSON.stringify(o) + ' oldg=' + p.val('oldg'));
o = p.tasto('m1');
check('il tasto - lo stesso', eq(o, ['$-002']) && p.val('oldg') == 90.5, JSON.stringify(o) + ' oldg=' + p.val('oldg'));

// ---------------------------------------------------------------
console.log('');
console.log('--- senso antiorario: il comando si rovescia ---');
p = nuovaPagina(1, -1);
o = p.ruota('30');
check('Ruota a 30 partendo da 0', eq(o, ['$-030']), JSON.stringify(o));
o = p.tasto('p1');
check('tasto +', eq(o, ['$-001']), JSON.stringify(o));
p = nuovaPagina(2, -1);
o = p.ruota('30');
check('in Race: 60 unita, rovesciate', eq(o, ['$-060']), JSON.stringify(o));

// ---------------------------------------------------------------
console.log('');
console.log('--- un campo che non e un angolo eseguibile non muove niente ---');
p = nuovaPagina(1, 1);
p.ruota('90');   // una rotazione prima: il suo comando restava in memoria e ripartiva
['90,5', '12.3', 'abc', '', '  '].forEach(function (t) {
    var out = p.ruota(t);
    check('"' + t + '" in Veloce: nessun comando al banco', out.length === 0, JSON.stringify(out));
    check('...l operatore legge che cosa scrivere', p.errori.length === 1 && /grad/i.test(p.errori[0] || ''), JSON.stringify(p.errori));
    check('...nessun annuncio vocale di una rotazione che non avviene', p.voce === 0, 'voce=' + p.voce);
    check('...e la pagina resta dove era', p.val('oldg') == 90, String(p.val('oldg')));
});
o = p.tasto('p1');
check('dopo un rifiuto il tasto + riparte dal punto giusto', eq(o, ['$+001']) && p.val('oldg') == 91, JSON.stringify(o) + ' oldg=' + p.val('oldg'));
p = nuovaPagina(2, 1);
o = p.ruota('10,25');
check('in Race il quarto di grado non si puo fare: rifiutato, senza muovere', o.length === 0 && p.errori.length === 1, JSON.stringify(o) + ' ' + JSON.stringify(p.errori));
p = nuovaPagina(1, 1);
o = p.ruota('4000');
check('uno spostamento oltre il tetto del firmware (3600 unita) viene rifiutato PRIMA, non dal firmware',
    o.length === 0 && p.errori.length === 1, JSON.stringify(o) + ' ' + JSON.stringify(p.errori));
check('...mentre 3600 passa', eq(p.ruota('3600'), ['$+3600']));

// ---------------------------------------------------------------
console.log('');
console.log('--- niente piu comandi rimasti in memoria ---');
var vivo = function (src) { return src.split('\n').filter(function (r) { return !/^\s*(\/\/|\*)/.test(r); }).join('\n'); };
check('nessuna variabile globale "crot" che sopravvive da una rotazione all altra',
    !/\bcrot\b/.test(vivo(ALZATA)) && !/\bcrot\b/.test(vivo(SCAN)));
check('i tasti -/+ non mandano piu un "$±001" fisso (vale mezzo grado in Race)',
    !/'\$[-+]001\\n'/.test(vivo(SCAN)));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: Ruota, - e + muovono dei gradi scritti, in Veloce e in Race;');
console.log('un campo che non e un angolo eseguibile viene rifiutato senza muovere niente.');
process.exit(0);
