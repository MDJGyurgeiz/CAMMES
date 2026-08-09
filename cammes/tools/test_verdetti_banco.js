// =============================================================
//  test_verdetti_banco.js — i due "numeri sbagliati" dell'audit 2026-08-09
// =============================================================
//  AUDIT TOTALE, rilievi 3.1 e 3.2 (AUDIT_TOTALE_2026-08-09.md), entrambi
//  riprodotti numericamente da uno scettico indipendente prima del fix.
//
//  3.1 — benchVerdict certificava OK un banco con difetti NEGATIVI sul
//  cilindro. removeCamBaseline azzera i residui negativi (clamp pensato per
//  un'ALZATA, che non puo' essere negativa) e benchVerdict calcolava RMS/max
//  sull'array gia' clampato: un avvallamento di -0,10 mm su 20 gradi usciva
//  {OK, max 0,017}, lo stesso difetto a +0,10 usciva FAIL. In piu', anche a
//  banco SANO l'RMS archiviato era sottostimato di ~sqrt(2), perche' su rumore
//  a media zero il clamp azzera meta' dei campioni. Il commento della funzione
//  dichiara la regola opposta: "un campione invalido non puo' MAI migliorare
//  l'esito".
//
//  3.2 — "ripetibilita' eccellente" con UN solo run in media. Con 3 run di cui
//  2 bucati, averageCompleteRuns media 1 run, la sigma di un campione di 1 e'
//  0 PER COSTRUZIONE (non misurata: indefinita) e il toast diceva "eccellente
//  - sigma 0,000 - CV 0,00%". Il gate contava i run ESEGUITI, non quelli
//  ENTRATI in media.
//
//  Scritto PRIMA del fix: fallisce sulla v3.7.0.
//
//  Uso: node tools/test_verdetti_banco.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
// rumore deterministico a media zero (niente Math.random: dev'essere ripetibile)
function rumore(seme, amp) {
    var x = seme, out = new Array(361); out[0] = 0;
    for (var i = 1; i <= 360; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        out[i] = ((x / 0x7fffffff) * 2 - 1) * amp;
    }
    return out;
}

console.log('=============================================================');
console.log(' VERDETTI DEL BANCO: il segno conta, e sigma su 1 run non esiste');
console.log('=============================================================');

// =============================================================
//  PARTE 1 — benchVerdict non deve perdonare i difetti negativi
// =============================================================
console.log('--- 3.1: verifica banco col cilindro ---');

// cilindro sano: solo rumore ±10 µm attorno a una quota costante
var sano = rumore(42, 0.010);
var vSano = M.benchVerdict(sano);
check('banco sano: OK', vSano.status === 'OK', vSano.status + ' rms ' + vSano.rms.toFixed(4));

// l'RMS dichiarato deve essere quello VERO, non quello deflazionato dal clamp.
// Rumore uniforme ±10 µm -> rms teorico amp/sqrt(3) = 5,8 µm; col clamp dei
// negativi usciva ~4,1 µm (fattore ~sqrt(2) in meno).
var rmsVero = 0;
for (var i = 1; i <= 360; i++) rmsVero += sano[i] * sano[i];
rmsVero = Math.sqrt(rmsVero / 360);
check('l\'RMS dichiarato e quello vero, non deflazionato di sqrt(2)',
    Math.abs(vSano.rms - rmsVero) < 0.0015,
    'dichiarato ' + vSano.rms.toFixed(4) + ' vs vero ' + rmsVero.toFixed(4));

// IL CASO DEL FALSO PASS: avvallamento -0,10 mm su 20 gradi (doppio della
// soglia max 0,05). Prima usciva OK con max 0,017.
var negativo = rumore(42, 0.005);
for (i = 100; i < 120; i++) negativo[i] -= 0.10;
var vNeg = M.benchVerdict(negativo);
check('difetto NEGATIVO -0,10 mm su 20 gradi: FAIL', vNeg.status === 'FAIL',
    vNeg.status + ' rms ' + vNeg.rms.toFixed(4) + ' max ' + vNeg.max.toFixed(4));
check('e il max riportato vede il difetto', vNeg.max > 0.05,
    'max ' + vNeg.max.toFixed(4) + ' (prima: 0,017)');

// il difetto positivo deve restare FAIL come prima (regressione)
var positivo = rumore(42, 0.005);
for (i = 100; i < 120; i++) positivo[i] += 0.10;
var vPos = M.benchVerdict(positivo);
check('difetto POSITIVO +0,10 mm: FAIL come prima', vPos.status === 'FAIL', vPos.status);

// simmetria: il verdetto non deve dipendere dal segno del difetto
check('stesso difetto, due segni: stesso verdetto',
    vNeg.status === vPos.status && Math.abs(vNeg.max - vPos.max) < 0.02,
    'neg max ' + vNeg.max.toFixed(3) + ' vs pos max ' + vPos.max.toFixed(3));

// il caso gia' coperto resta: profilo tutto non-positivo -> mai OK
var tuttoNeg = new Array(361); tuttoNeg[0] = 0;
for (i = 1; i <= 360; i++) tuttoNeg[i] = -0.2;
var vTN = M.benchVerdict(tuttoNeg);
check('profilo tutto negativo: mai OK', vTN.status !== 'OK', vTN.status);

// ---------- e la correzione per l'ALZATA non deve cambiare ----------
console.log('');
console.log('--- removeCamBaseline: il default per le alzate resta clampato ---');
// un'alzata non e' negativa: il default deve continuare a clampare (e' quello
// che vede l'operatore in analisi). Solo il verdetto banco chiede i segni.
var eccentrica = new Array(361); eccentrica[0] = 0;
var DEG = Math.PI / 180;
for (i = 1; i <= 360; i++) {
    var lobo = (i >= 150 && i <= 210) ? 8 * Math.pow(Math.sin(Math.PI * (i - 150) / 60), 2) : 0;
    eccentrica[i] = lobo + 0.2 * Math.cos(i * DEG + 0.6);
}
var pulita = M.removeCamBaseline(eccentrica);
var minimo = Infinity;
for (i = 1; i <= 360; i++) if (pulita[i] < minimo) minimo = pulita[i];
check('default: nessun valore negativo (per la curva mostrata)', minimo >= 0, 'min ' + minimo.toFixed(4));

// =============================================================
//  PARTE 2 — la ripetibilita' su 1 run non e' "eccellente": non esiste
// =============================================================
console.log('');
console.log('--- 3.2: verdetto di ripetibilita ---');

var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    return fine < 0 ? null : ALZATA.substring(m.index, fine + 3);
}
var fn = estrai('_showRepeatedRunsStats');
check('trovo _showRepeatedRunsStats', !!fn);
if (!fn) { console.log('\nRISULTATO: ' + (fails + 1) + ' FALLITI'); process.exit(1); }

function scenario(runs) {
    var toasts = [];
    var ctx = {
        Math: Math, isFinite: isFinite, NaN: NaN, undefined: undefined,
        repeatedRuns: runs,
        window: {
            averageCompleteRuns: M.averageCompleteRuns,
            cammesToast: function (o) { toasts.push(o); },
            _lastRepeatStats: null
        },
        document: { mas: { mas: { value: '' } } },
        pdata: new Array(361), pdindex: new Array(361),
        max: 0, maxg: 0,
        config: null
    };
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    vm.runInContext(fn, ctx);
    vm.runInContext('_showRepeatedRunsStats();', ctx);
    return { toasts: toasts, stats: ctx.window._lastRepeatStats };
}
function runCompleto(seme) {
    var r = new Array(361);
    var x = seme;
    for (var i = 1; i <= 360; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        var lobo = (i >= 150 && i <= 210) ? 8 * Math.pow(Math.sin(Math.PI * (i - 150) / 60), 2) : 0.02;
        r[i] = lobo + ((x / 0x7fffffff) * 2 - 1) * 0.004;
    }
    return r;
}
function runBucato(seme) {
    var r = runCompleto(seme);
    delete r[42]; delete r[43]; delete r[44];   // gradi mancanti
    return r;
}

// IL CASO DELL'AUDIT: 3 run eseguiti, 1 solo completo -> in media entra 1 run
var esito1 = scenario([runCompleto(7), runBucato(8), runBucato(9)]);
var verdetto1 = esito1.toasts.filter(function (t) { return /ripetibilit/i.test(t.title || ''); });
check('con 1 solo run in media NON esce "eccellente"',
    verdetto1.every(function (t) { return !/eccellente|buona/i.test(t.title); }),
    verdetto1.map(function (t) { return t.title; }).join(' | ') || 'nessun verdetto');
check('e il messaggio dice che la ripetibilita NON e valutabile',
    esito1.toasts.some(function (t) { return /non (e |è |&egrave; )?valutabile|non valutabile/i.test((t.title || '') + ' ' + (t.body || '')); }),
    'serve una dichiarazione esplicita');
check('sigma e CV archiviati NON sono 0 (sono NaN: non misurati)',
    esito1.stats && !isFinite(esito1.stats.sigmaMax) && !isFinite(esito1.stats.cvMax),
    esito1.stats ? ('sigmaMax ' + esito1.stats.sigmaMax + ' cvMax ' + esito1.stats.cvMax) : 'stats assenti');
check('ma la media del run buono resta usabile (runs=1 dichiarato)',
    esito1.stats && esito1.stats.runs === 1 && esito1.stats.runsTotal === 3,
    JSON.stringify(esito1.stats));

// CONTROPROVA: 3 run completi e concordi -> il verdetto deve restare
var esito3 = scenario([runCompleto(7), runCompleto(8), runCompleto(9)]);
var verdetto3 = esito3.toasts.filter(function (t) { return /ripetibilit/i.test(t.title || ''); });
check('con 3 run completi il verdetto esce come prima',
    verdetto3.length === 1 && /eccellente|buona/i.test(verdetto3[0].title),
    verdetto3.map(function (t) { return t.title; }).join(' | ') || 'nessun verdetto');
check('e sigma/CV sono numeri veri',
    esito3.stats && isFinite(esito3.stats.sigmaMax) && isFinite(esito3.stats.cvMax) && esito3.stats.runs === 3,
    esito3.stats ? ('sigmaMax ' + esito3.stats.sigmaMax.toFixed(4)) : '-');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: i difetti negativi bocciano il banco, e la ripetibilita');
console.log('si giudica solo quando esiste (almeno 2 run in media).');
process.exit(0);
