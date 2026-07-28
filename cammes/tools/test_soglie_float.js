// =============================================================
//  test_soglie_float.js — una sola scala per il valve float
// =============================================================
//  Il valve float veniva colorato con DUE scale diverse:
//    schermo (tabella Sweep RPM):  rosso >0.5, giallo >0.1
//    PDF     (Race report):        rosso >0.5, giallo >0.3
//  Sulla stessa riga, con lo stesso numero, il verdetto cromatico cambiava
//  secondo il foglio che guardavi — e il PDF era il PERMISSIVO. Misurato su
//  fixture reale: 2 righe su 12 cambiavano colore.
//
//  In piu' le legende della Mappa molla e dello Sweep 3D descrivevano
//  `_floatToColor` come tre BANDE (verde <0.1, giallo 0.1-0.3, rosso >0.3),
//  mentre e' un gradiente a tre ANCORE: il rosso pieno arriva solo a 0.8. Una
//  cella a 0.45 mm — il 50% oltre il limite dichiarato — usciva ambra, e nella
//  heatmap il colore e' l'unico dato disponibile (il numero non c'e').
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_soglie_float.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' VALVE FLOAT: una sola scala, e legende che dicono il vero');
console.log('=============================================================');

// ---------------------------------------------------------------
// 1. La scala esiste come costante unica
// ---------------------------------------------------------------
console.log('--- la scala e dichiarata in un posto solo ---');
var iSoglie = HTML.indexOf('var SOGLIE_FLOAT');
check('esiste la costante SOGLIE_FLOAT', iSoglie > 0);
if (iSoglie < 0) { console.log('\nRISULTATO: scala non dichiarata\n'); process.exit(1); }
var ctx = { Math: Math, Number: Number, String: String, isFinite: isFinite };
vm.createContext(ctx);
vm.runInContext(HTML.substring(iSoglie, HTML.indexOf('};', iSoglie) + 2), ctx);
var S = ctx.SOGLIE_FLOAT;
check('dichiara attenzione e grave', typeof S.attenzione === 'number' && typeof S.grave === 'number',
    JSON.stringify(S));
check('attenzione viene prima di grave', S.attenzione < S.grave, S.attenzione + ' < ' + S.grave);

// ---------------------------------------------------------------
// 2. Nessun numero di soglia scritto a mano nei punti che colorano
// ---------------------------------------------------------------
//  E' la parte che impedisce alla due-verita' di riformarsi: se un secondo
//  punto riscrive 0.1 o 0.3 a mano, le due scale ripartono.
console.log('--- nessuna soglia ricopiata a mano dove si colora ---');
function corpoDi(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(HTML);
    if (!m) return null;
    return HTML.substring(m.index, HTML.indexOf('\n}\n', m.index) + 3);
}
// La colorazione della tabella a schermo e quella del PDF.
var pezzoSchermo = HTML.substring(HTML.indexOf('function runRpmSweep'), HTML.indexOf('function runSpringOptimizer'));
var iPdf = HTML.indexOf('function exportRaceReport');
var pezzoPdf = HTML.substring(iPdf, iPdf + 12000);
[['tabella a schermo', pezzoSchermo], ['tabella del PDF', pezzoPdf]].forEach(function (p) {
    var aMano = (p[1].match(/(?:float|maxGap)\s*>\s*0\.\d+/g) || []);
    check('la ' + p[0] + ' non confronta con numeri scritti a mano',
        aMano.length === 0, aMano.length ? aMano.join(', ') : 'nessuno');
    check('la ' + p[0] + ' usa la scala unica',
        p[1].indexOf('SOGLIE_FLOAT') >= 0 || p[1].indexOf('classeFloat') >= 0);
});

// ---------------------------------------------------------------
// 3. Lo stesso float da lo stesso verdetto nelle due uscite
// ---------------------------------------------------------------
console.log('--- lo stesso numero, lo stesso verdetto ---');
var cf = corpoDi('classeFloat');
check('esiste una funzione unica classeFloat()', !!cf);
if (cf) {
    vm.runInContext(cf, ctx);
    // i valori che nella versione precedente cambiavano verdetto fra le due uscite
    [0, 0.05, 0.12, 0.124, 0.29, 0.31, 0.45, 0.55, 1.52].forEach(function (f) {
        var v = ctx.classeFloat(f);
        check('float ' + f.toFixed(3) + ' -> un verdetto solo (' + v + ')',
            v === 'sicuro' || v === 'attenzione' || v === 'grave', String(v));
    });
    check('0.12 mm non e piu "sicuro" (era verde nel PDF e giallo a schermo)',
        ctx.classeFloat(0.12) === 'attenzione', ctx.classeFloat(0.12));
    check('0.45 mm, oltre il limite dichiarato, e grave',
        ctx.classeFloat(0.45) === 'grave', ctx.classeFloat(0.45));
}

// ---------------------------------------------------------------
// 4. Le legende non descrivono bande che il gradiente non ha
// ---------------------------------------------------------------
//  _floatToColor e' un gradiente: verde fino a `attenzione`, sfumatura fino a
//  `grave`, rosso pieno oltre. Le legende dicevano "rosso >0.3" quando il rosso
//  pieno arrivava a 0.8.
console.log('--- le legende descrivono il gradiente che c e ---');
var ftc = corpoDi('_floatToColor');
check('esiste _floatToColor', !!ftc);
if (ftc) {
    vm.runInContext(ftc, ctx);
    var rossoPieno = null;
    for (var f = 0; f <= 3; f += 0.01) {
        if (ctx._floatToColor(f) === ctx._floatToColor(3)) { rossoPieno = f; break; }
    }
    console.log('        il rosso pieno comincia a ' + (rossoPieno === null ? '?' : rossoPieno.toFixed(2)) + ' mm');
    check('il rosso pieno comincia alla soglia GRAVE dichiarata',
        rossoPieno !== null && Math.abs(rossoPieno - S.grave) < 0.02,
        'rosso a ' + (rossoPieno || 0).toFixed(2) + ', grave dichiarato ' + S.grave);
}
// Nessuna legenda deve contenere una soglia scritta a mano.
var legende = (HTML.match(/legend\.innerHTML =[\s\S]{0,700}?;/g) || []);
console.log('        legende trovate: ' + legende.length);
legende.forEach(function (l, i) {
    var numeri = (l.match(/&(?:lt|gt);\s*0\.\d+|\b0\.\d+\s*-\s*0\.\d+/g) || []);
    check('legenda ' + (i + 1) + ' senza soglie ricopiate a mano',
        numeri.length === 0, numeri.length ? numeri.join(', ') : 'nessuna');
});

// ---------------------------------------------------------------
// 5. La "zona sicura" del toast dice quale soglia usa
// ---------------------------------------------------------------
//  Il toast diceva "N/224 combinazioni nella zona sicura" contando a float<0.3,
//  mentre il tooltip del pulsante definisce sicuro <0.1: due vocabolari.
console.log('--- la zona sicura dichiara la sua soglia ---');
var iMap = HTML.indexOf('function runSpringMap');
var pezzoMap = HTML.substring(iMap, iMap + 4000);
check('il toast della mappa non dice "zona sicura" senza il numero',
    !/nella zona sicura/.test(pezzoMap) || /SOGLIE_FLOAT/.test(pezzoMap),
    'il testo deve nominare la soglia, non un aggettivo');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: una sola scala per il valve float, usata da schermo, PDF,');
console.log('heatmap e legende; il rosso pieno comincia dove la scala dice; e');
console.log('nessuna soglia e ricopiata a mano dove si colora o si spiega.\n');
