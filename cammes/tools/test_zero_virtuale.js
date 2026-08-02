// =============================================================
//  test_zero_virtuale.js — "a volte non completa auto zero"
// =============================================================
//  Segnalazione dall'officina. "A volte" ha una causa precisa: succede
//  quando lo 0 virtuale NON SERVE, cioe' quando l'albero e' gia' in posizione.
//
//  Il browser porta il picco a +180 gradi dallo zero calcolando lo sfasamento
//  in conteggi encoder e convertendolo in unita' motore. In modalita' Veloce e
//  Precisione (subStepsPerDeg = 1) quelle unita' valgono ZERO ogni volta che il
//  picco e' gia' entro mezzo grado dal bersaglio. Senza guardia il comando
//  costruito e' "$+000", e quello NON e' un movimento nullo: e' un comando NON
//  VALIDO. Il firmware lo rifiuta —
//        master.ino: if (... || valueM <= 0 || valueM > 3600) { "*err $"; return; }
//  — e la riga che emette "*mv" non viene mai raggiunta. Il browser intanto ha
//  armato window._waiting_mv, non ha nessun gestore per "*err", e resta 8
//  secondi ad aspettare un ack che non arrivera' mai (col LED Motore che
//  lampeggia "in movimento" a motore fermo). Poi scatta il fallback e ricarica
//  la pagina: grafico e dati della scansione spariscono, senza una spiegazione.
//
//  Perche' "a volte" e non sempre: dopo uno 0V riuscito il picco sta a +180, e
//  al giro dopo il conto da esattamente zero. Non capita ogni volta solo perche'
//  il campione che vince il massimo puo' spostarsi di un grado fra un giro e
//  l'altro; se si sposta, le unita' diventano +-1 e il comando passa.
//
//  La funzione gemella "Vai a posizione salvata" questa guardia ce l'ha
//  (alzata.html, `if (absUnits === 0)`): e' lo stesso calcolo, copiato, con il
//  controllo in un posto solo.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_zero_virtuale.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
var FW = fs.readFileSync(path.join(__dirname, '..', '..', 'master', 'master.ino'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' ZERO VIRTUALE: non si comanda un movimento di zero unita');
console.log('=============================================================');

// ---------- il firmware rifiuta davvero lo zero ----------
console.log('--- il contratto col firmware ---');
check('il firmware rifiuta $ con valore <= 0 (quindi "$+000")',
    /valueM\s*<=\s*0/.test(FW) && /\*err \$/.test(FW),
    'master.ino: valueM <= 0 -> "*err $", e "*mv" non viene mai emesso');
// La UI non ha (e non aveva) un gestore per "*err": un rifiuto del firmware
// cade nel vuoto e si finisce nell'attesa cieca. Finche' e' cosi', l'unica
// difesa e' non mandare comandi che verrebbero rifiutati — cioe' la guardia
// provata qui sotto. Il controllo guarda il CODICE, non i commenti: questo file
// il testo "*err" lo cita, e citarlo non e' gestirlo.
var vivoAlzata = ALZATA.split('\n').filter(function (r) {
    return !/^\s*(\/\/|\*|<!--)/.test(r);
}).join('\n');
check('la UI non ha un gestore per "*err": il rifiuto cadrebbe nel vuoto',
    !/['"]\*err/.test(vivoAlzata),
    'se un giorno lo si aggiunge, questo check va aggiornato');

// ---------- il calcolo sta in una funzione, e si puo provare ----------
console.log('');
console.log('--- il calcolo dello sfasamento ---');
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    return fine < 0 ? null : ALZATA.substring(m.index, fine + 3);
}
var fn = estrai('comandoZeroVirtuale');
check('esiste comandoZeroVirtuale() — il conto e separato dall handler', !!fn);
if (!fn) {
    console.log('');
    console.log('RISULTATO: ' + (fails + 1) + ' FALLITI');
    process.exit(1);
}
var ctx = { Math: Math };
vm.createContext(ctx);
vm.runInContext(fn, ctx);
function comando(maxgEnc, ora, sub) {
    return vm.runInContext('comandoZeroVirtuale(' + maxgEnc + ',' + ora + ',' + sub + ')', ctx);
}

// IL CASO CHE SI PIANTAVA: albero gia' azzerato.
// Il picco viene incrociato a e0-720 e a fine giro l'encoder e' a e0-1440,
// quindi lo sfasamento e' esattamente zero.
var e0 = 10000;
var r = comando(e0 - 720, e0 - 1440, 1);
check('albero gia in posizione: lo sfasamento e zero', r.units === 0, 'units=' + r.units);
check('e NON si costruisce nessun comando', r.cmd === null, String(r.cmd));

// e a passo fine, dove mezzo grado vale 8 unita, il comando invece c'e'
var rf = comando(e0 - 720 + 1, e0 - 1440, 8);
check('a passo fine uno scarto di un conteggio produce un comando vero',
    rf.cmd !== null && rf.units !== 0, rf.cmd + ' (units=' + rf.units + ')');

// ---------- nessuna posizione deve produrre "$+000" o "$-000" ----------
console.log('');
console.log('--- il giro completo: 1440 posizioni encoder, 3 modalita ---');
[1, 4, 8].forEach(function (sub) {
    var zeri = 0, comandiNulli = [], minAbs = 1e9;
    for (var c = 0; c < 1440; c++) {
        var res = comando(e0 - 720, e0 - 1440 + c, sub);
        if (res.cmd === null) { zeri++; continue; }
        if (/^\$[+-]0{3,}$/.test(res.cmd)) comandiNulli.push(res.cmd + ' @ c=' + c);
        var a = Math.abs(res.units);
        if (a < minAbs) minAbs = a;
    }
    check('subStepsPerDeg=' + sub + ': mai un comando di zero unita',
        comandiNulli.length === 0,
        comandiNulli.length ? comandiNulli.slice(0, 3).join(', ') : (zeri + ' posizioni gia allineate, minimo mosso ' + minAbs + ' unita'));
});

// ---------- il comando resta nel formato che il firmware accetta ----------
console.log('');
console.log('--- formato e limiti ---');
var fuori = [], malformati = [];
[1, 4, 8].forEach(function (sub) {
    for (var c = 0; c < 1440; c++) {
        var res = comando(e0 - 720, e0 - 1440 + c, sub);
        if (res.cmd === null) continue;
        if (!/^\$[+-]\d{3,4}$/.test(res.cmd)) malformati.push(res.cmd);
        var v = Math.abs(res.units);
        if (v <= 0 || v > 3600) fuori.push(res.cmd);
    }
});
check('tutti i comandi hanno la forma $±NNN accettata dal server', malformati.length === 0,
    malformati.slice(0, 3).join(', '));
check('tutti stanno nel range 1..3600 accettato dal firmware', fuori.length === 0,
    fuori.slice(0, 3).join(', '));

// ---------- e l handler usa la funzione, non un conto suo ----------
console.log('');
console.log('--- un solo conto, non due ---');
var vivo = ALZATA.split('\n').filter(function (x) { return !/^\s*(\/\/|\*|<!--)/.test(x); }).join('\n');
check('lo 0 virtuale chiama comandoZeroVirtuale()',
    /comandoZeroVirtuale\s*\(/.test(vivo.replace(/function comandoZeroVirtuale[\s\S]*?\n\}\n/, '')),
    'il conto non deve essere ricopiato nell handler');
check('e quando non c e niente da muovere lo dice invece di aspettare l ack',
    /cmd\s*===?\s*null|!\s*\w+\.cmd/.test(vivo),
    'senza questo si resta 8 s ad aspettare un "*mv" che non arriva');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: lo 0 virtuale non manda piu un comando che il firmware rifiuta.');
process.exit(0);
