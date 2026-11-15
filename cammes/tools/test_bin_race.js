// =============================================================
//  test_bin_race.js — in modalita' Race il grado N vale la quota AL grado N
// =============================================================
//  Rilievo dell'audit del 2026-08-09 rimasto "non verificato", confermato
//  nella verifica funzionale del 2026-11-14 (codice + banco emulato).
//
//  In Race il banco legge ogni mezzo grado (720 punti) e il file resta a 360:
//  due letture per grado. Ma la pagina le raggruppava cosi':
//
//        grado d  =  media delle letture a (d - 0,5)° e a d°
//
//  cioe' il valore scritto al grado d rappresentava la quota a d - 0,25°.
//  L'intera curva Race risultava spostata di un quarto di grado rispetto alla
//  stessa camma letta in Veloce (dove il grado d e' la lettura a d°). Sul
//  fianco, dove la quota cambia di 0,3 mm per grado, fanno 0,07 mm: piu'
//  della ripetibilita' del banco. Misurato sul banco emulato: Race contro
//  Veloce, scarto massimo 0,075 mm al punto di massima pendenza.
//
//  E lo Zero virtuale fatto in Race ereditava lo stesso difetto: il conteggio
//  encoder "del picco" era quello della lettura che per prima superava il
//  massimo, a d - 0,5° oppure a d°, a seconda dei casi.
//
//  La cura: il grado d e' una media CENTRATA su d, con pesi 1/4 - 1/2 - 1/4
//  sulle letture a d - 0,5°, d°, d + 0,5°. Su un tratto rettilineo restituisce
//  esattamente la quota a d°; sul resto media senza spostare. Il giro e'
//  chiuso: la lettura a 360,5° e' quella a 0,5°. L'encoder del picco e' quello
//  della lettura centrale. Le letture invalide si scartano a COPPIE
//  simmetriche, cosi' il baricentro resta sul grado.
//
//  COSA CAMBIA PER CHI HA GIA' FILE RACE: i profili Race acquisiti con le
//  versioni fino alla 3.7.0 sono in anticipo di 0,25° rispetto a quelli
//  Veloce. I nuovi no. Confrontare un Race vecchio con uno nuovo mostra
//  quello scarto: e' il difetto di prima, non una differenza fra le camme.
//
//  Uso: node tools/test_bin_race.js   (exit 0 = ok)

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
console.log(' MODALITA RACE: il grado N vale la quota al grado N');
console.log('=============================================================');

// Un lobo sintetico e ANONIMO: alzata 9,6 mm, fianchi diversi (68° e 82°),
// picco fuori dai gradi interi per non favorire nessuno.
var PICCO = 200.3, SAL = 68, DISC = 82, ALZ = 9.6;
function lobo(th) {
    var x = ((th - PICCO + 540) % 360) - 180;          // distanza dal picco, in (-180, 180]
    if (x <= -SAL || x >= DISC) return 0;
    var u = x < 0 ? x / SAL : x / DISC;                 // -1..1
    var c = 0.5 * (1 + Math.cos(Math.PI * u));          // 1 al picco, 0 ai piedi
    return ALZ * c * c;
}
function scansione(S, f) {                             // campioni[i] = f(i/S), i = 1..360*S
    var a = [NaN];
    for (var i = 1; i <= 360 * S; i++) a[i] = f(i / S);
    return a;
}
function binVecchio(camp, d) { return (camp[2 * d - 1] + camp[2 * d]) / 2; }   // la regola di prima

// ---------------------------------------------------------------
console.log('--- la funzione di libreria ---');
check('la libreria espone binCentrato', typeof M.binCentrato === 'function');
if (typeof M.binCentrato === 'function') {
    var retta = scansione(2, function (th) { return 0.29 * th + 1; });
    var okRetta = true, peggio = 0;
    for (var d = 2; d <= 359; d++) {
        var e = Math.abs(M.binCentrato(retta, d, 2) - (0.29 * d + 1));
        if (e > 1e-9) okRetta = false;
        peggio = Math.max(peggio, Math.abs(binVecchio(retta, d) - (0.29 * d + 1)));
    }
    check('su un fianco rettilineo restituisce ESATTAMENTE la quota al grado', okRetta);
    check('...dove la regola di prima sbagliava di pendenza x 0,25°', Math.abs(peggio - 0.29 * 0.25) < 1e-9, peggio.toFixed(4) + ' mm');

    var camma = scansione(2, lobo), errNuovo = 0, errVecchio = 0, dPeggio = 0;
    for (d = 1; d <= 360; d++) {
        var en = Math.abs(M.binCentrato(camma, d, 2) - lobo(d));
        var ev = Math.abs(binVecchio(camma, d) - lobo(d));
        if (en > errNuovo) errNuovo = en;
        if (ev > errVecchio) { errVecchio = ev; dPeggio = d; }
    }
    console.log('        lobo sintetico: errore massimo  prima ' + errVecchio.toFixed(4) + ' mm (a ' + dPeggio + '°)   ora ' + errNuovo.toFixed(4) + ' mm');
    check('su un lobo intero l errore massimo scende sotto 5 µm', errNuovo < 0.005, errNuovo.toFixed(4) + ' mm');
    check('...contro i centesimi di prima', errVecchio > 0.05, errVecchio.toFixed(4) + ' mm');

    var costante = scansione(2, function () { return 3.21; });
    check('i pesi sommano a 1 (quota costante resta costante)', Math.abs(M.binCentrato(costante, 77, 2) - 3.21) < 1e-12);
    check('il giro e chiuso: il grado 360 usa la lettura a 0,5° come 360,5°',
        Math.abs(M.binCentrato(camma, 360, 2) - (camma[719] + 2 * camma[720] + camma[1]) / 4) < 1e-12);
    var uno = scansione(1, lobo);
    check('a un punto per grado (Veloce) e la lettura stessa', M.binCentrato(uno, 131, 1) === uno[131]);

    // letture invalide: il baricentro resta sul grado
    var buco = camma.slice(); buco[2 * 150 + 1] = NaN;                 // manca la lettura a 150,5°
    check('manca UNA laterale: si usa la centrale da sola, non una media sbilanciata',
        M.binCentrato(buco, 150, 2) === camma[300], M.binCentrato(buco, 150, 2) + ' / ' + camma[300]);
    buco = camma.slice(); buco[300] = NaN;                              // manca la lettura a 150°
    check('manca la centrale: media delle due laterali',
        Math.abs(M.binCentrato(buco, 150, 2) - (camma[299] + camma[301]) / 2) < 1e-12);
    buco = camma.slice(); buco[300] = NaN; buco[301] = NaN;
    check('manca la centrale e una laterale: il grado resta SENZA dato (niente valori inventati)',
        !isFinite(M.binCentrato(buco, 150, 2)));
}

// ---------------------------------------------------------------
console.log('');
console.log('--- la pagina: i campioni entrano uno alla volta, come dal banco ---');
var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    return fine < 0 ? null : ALZATA.substring(m.index, fine + 3);
}
var fnReg = estrai('_registraCampione');
check('la pagina ha _registraCampione()', !!fnReg);
if (fnReg && typeof M.binCentrato === 'function') {
    var giro = function (modo, f, encDi) {
        var ctx = { Math: Math, isFinite: isFinite, binCentrato: M.binCentrato, window: { binCentrato: M.binCentrato },
                    currentMode: modo, pdata: [], pdindex: [], subVal: [], subEnc: [] };
        vm.createContext(ctx);
        vm.runInContext('var max = 0, maxg = 0, maxg_encoder = null;\n' + fnReg, ctx);
        var chiusiTot = [];
        for (var i = 1; i <= modo.totalSteps; i++) {
            ctx._i = i; ctx._v = f(i / modo.subStepsPerDeg); ctx._e = encDi ? encDi(i) : null;
            var ch = vm.runInContext('_registraCampione(_i, _v, _e)', ctx);
            for (var q = 0; q < ch.length; q++) chiusiTot.push(ch[q]);
        }
        return { pdata: ctx.pdata, chiusi: chiusiTot, max: vm.runInContext('max', ctx), maxg: vm.runInContext('maxg', ctx),
                 maxgEnc: vm.runInContext('maxg_encoder', ctx) };
    };
    var RACE = { subStepsPerDeg: 2, totalSteps: 720 }, VELOCE = { subStepsPerDeg: 1, totalSteps: 360 };
    // encoder: 4 conteggi per grado, quindi 2 per mezzo grado
    var r = giro(RACE, lobo, function (i) { return 2 * i; });
    var v = giro(VELOCE, lobo, function (i) { return 4 * i; });
    var mancanti = 0, scarto = 0, dScarto = 0;
    for (var g = 1; g <= 360; g++) {
        if (!isFinite(r.pdata[g])) { mancanti++; continue; }
        var s = Math.abs(r.pdata[g] - v.pdata[g]);
        if (s > scarto) { scarto = s; dScarto = g; }
    }
    check('Race: tutti i 360 gradi hanno un valore', mancanti === 0, mancanti + ' mancanti');
    check('...ognuno chiuso una volta sola, in ordine', r.chiusi.length === 360 && r.chiusi.every(function (x, k) { return x === k + 1; }),
        r.chiusi.length + ' chiusure');
    check('Race e Veloce sulla stessa camma coincidono entro 5 µm (erano 0,075 mm)', scarto < 0.005, scarto.toFixed(4) + ' mm a ' + dScarto + '°');
    check('il picco cade sullo stesso grado', r.maxg === v.maxg && Math.abs(r.max - v.max) < 0.005, 'Race ' + r.maxg + '° / Veloce ' + v.maxg + '°');
    check('l encoder del picco e quello della lettura CENTRALE del grado (serve allo Zero virtuale)',
        r.maxgEnc === 4 * r.maxg, 'encoder ' + r.maxgEnc + ' per il grado ' + r.maxg + ' (atteso ' + 4 * r.maxg + ')');
    check('Veloce non cambia: il grado e la lettura stessa', v.pdata[131] === lobo(131) && v.maxgEnc === 4 * v.maxg);

    // un campione PERSO (riga seriale mai arrivata: lo streaming dice "Campioni
    // persi"). Se manca proprio la lettura che doveva chiudere un grado, quel
    // grado non resta senza valore: a fine giro si recupera dalla sua centrale.
    var perso = (function () {
        var ctx = { Math: Math, isFinite: isFinite, binCentrato: M.binCentrato, window: { binCentrato: M.binCentrato },
                    currentMode: RACE, pdata: [], pdindex: [], subVal: [], subEnc: [] };
        vm.createContext(ctx);
        vm.runInContext('var max = 0, maxg = 0, maxg_encoder = null;\n' + fnReg, ctx);
        for (var i = 1; i <= 720; i++) {
            if (i === 301) continue;                       // la lettura a 150,5° non arriva mai
            ctx._i = i; ctx._v = lobo(i / 2); ctx._e = 2 * i;
            vm.runInContext('_registraCampione(_i, _v, _e)', ctx);
        }
        return ctx.pdata;
    })();
    var mancantiPerso = 0; for (var gp = 1; gp <= 360; gp++) if (!isFinite(perso[gp])) mancantiPerso++;
    check('una lettura persa non lascia un grado senza valore se la sua centrale c e', mancantiPerso === 0, mancantiPerso + ' gradi mancanti');
    check('...il grado recuperato vale la sua lettura centrale (nessun valore inventato)', perso[150] === lobo(150), perso[150] + ' / ' + lobo(150));

    // un buco nel flusso non sposta e non inventa
    var conBuco = giro(RACE, function (th) { return (th === 150 || th === 150.5) ? NaN : lobo(th); });
    check('letture invalide: il grado colpito resta senza dato, i vicini no',
        !isFinite(conBuco.pdata[150]) && isFinite(conBuco.pdata[149]) && isFinite(conBuco.pdata[151]),
        '149:' + conBuco.pdata[149] + ' 150:' + conBuco.pdata[150] + ' 151:' + conBuco.pdata[151]);
}
check('la pagina non usa piu il raggruppamento a coppie (d-0,5 con d)',
    !/Math\.floor\(\(i - 1\) \/ currentMode\.subStepsPerDeg\) \+ 1/.test(ALZATA.split('\n').filter(function (x) { return !/^\s*\/\//.test(x); }).join('\n')));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: in Race il valore di ogni grado e centrato sul grado, coincide con la');
console.log('Veloce sulla stessa camma, e lo Zero virtuale usa l encoder della lettura centrale.');
process.exit(0);
