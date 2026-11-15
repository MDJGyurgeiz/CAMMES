// =============================================================
//  test_collaudo_nominale.js — il verdetto del collaudo dice cio' che e' stato
//  chiesto, sulla misura vera, e non boccia una camma per mezzo grado di fase
// =============================================================
//  Tre difetti del "Collaudo su profilo nominale" (pagina Confronto), trovati
//  nell'analisi di usabilita' del 2026-11-14/15 e riprodotti. E' l'unica parte
//  della pagina che emette un GIUDIZIO: tutti e tre lo falsavano.
//
//  1) LA TOLLERANZA CON LA VIRGOLA ERA IGNORATA IN SILENZIO. Il campo veniva
//     letto con Number(...) || 0.10: "0,05" — come lo scrive chi sta al banco,
//     e come lo scrive il manuale — non e' un numero per Number(), quindi il
//     verdetto usciva con ±0,10 senza dirlo. Chi chiedeva ±0,05 poteva leggere
//     CONFORME su un pezzo fuori di 0,08. Lo stesso con campo vuoto, "0", testo.
//
//  2) UNA CAMMA IDENTICA AL NOMINALE POTEVA RISULTARE NON CONFORME. Prima di
//     giudicare il programma allinea la misura al nominale, ma lo faceva solo a
//     gradi INTERI. Due scansioni della stessa camma non partono mai dallo
//     stesso mezzo grado: quel residuo, sui fianchi, vale 0,12-0,17 mm — piu'
//     della tolleranza. Lo scarto era fase, non profilo, e niente lo diceva.
//     Ora l'allineamento si rifinisce a passi di 0,05° (il nominale si legge fra
//     due gradi per interpolazione lineare; la MISURA non viene toccata) e lo
//     spostamento usato e' scritto nel verdetto.
//
//  3) IL VERDETTO SI CALCOLAVA SUI DATI DISEGNATI. In vista "Differenza" il
//     grafico contiene le differenze, non le misure: premendo Rivaluta ogni
//     curva diventava NON CONFORME con scarti di millimetri, e restava cosi'
//     tornando a "Sovrapposto". Ora il collaudo legge le misure originali.
//
//  Cio' che la rifinitura NON deve fare: nascondere un difetto vero. Un bozzo
//  di 0,2 mm sul fianco deve restare 0,2 mm.
//
//  Uso: node tools/test_collaudo_nominale.js   (exit 0 = ok)

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
console.log(' COLLAUDO SU NOMINALE: il verdetto e quello chiesto');
console.log('=============================================================');

// ---------- profili di prova ----------
// lobo sintetico anonimo, picco fuori dai gradi interi
function lobo(th) {
    var x = ((th - 181.3 + 540) % 360) - 180;
    if (x <= -70 || x >= 78) return 0;
    var u = x < 0 ? x / 70 : x / 78, c = 0.5 * (1 + Math.cos(Math.PI * u));
    return 10.4 * c * c;
}
function profilo(f) { var a = [0]; for (var d = 1; d <= 360; d++) a[d] = f(d); return a; }
// una misura REALE del banco (file di riferimento), e la stessa spostata di una frazione di grado
var reale = M.parseCamFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'rif2_asp_alz.scr'), 'utf8'));
function spostata(cam, gradi) {          // la stessa curva letta "gradi" piu' avanti (interpolazione lineare, giro chiuso)
    var a = [0];
    for (var d = 1; d <= 360; d++) {
        var x = d + gradi, i0 = Math.floor(x), t = x - i0;
        var k0 = ((i0 - 1) % 360 + 360) % 360 + 1, k1 = (k0 % 360) + 1;
        a[d] = (1 - t) * Number(cam[k0]) + t * Number(cam[k1]);
    }
    return a;
}
// la regola di prima: aggancio al picco + ricerca a gradi interi
function scartoVecchio(mis, nom) {
    var pkM = 0, pkMi = 1, pkN = 0, pkNi = 1, d;
    for (d = 1; d <= 360; d++) { if (mis[d] > pkM) { pkM = mis[d]; pkMi = d; } if (nom[d] > pkN) { pkN = nom[d]; pkNi = d; } }
    function at(s, q) { return nom[((q - 1 + s) % 360 + 360) % 360 + 1]; }
    var base = pkNi - pkMi, best = base, bestE = Infinity;
    for (var s = base - 8; s <= base + 8; s++) { var e = 0; for (d = 1; d <= 360; d += 2) { var df = mis[d] - at(s, d); e += df * df; } if (e < bestE) { bestE = e; best = s; } }
    var mx = 0; for (d = 1; d <= 360; d++) mx = Math.max(mx, Math.abs(mis[d] - at(best, d)));
    return mx;
}

// ---------------------------------------------------------------
console.log('--- la libreria: scarto dal nominale a forma allineata ---');
check('la libreria espone scartoDalNominale', typeof M.scartoDalNominale === 'function');
if (typeof M.scartoDalNominale === 'function') {
    var nomS = profilo(lobo);
    var r0 = M.scartoDalNominale(nomS, nomS);
    check('stessa curva: scarto zero, nessuno spostamento', r0.scartoMax < 1e-9 && Math.abs(r0.spostamento) < 1e-9, JSON.stringify(r0));
    var r3 = M.scartoDalNominale(profilo(function (d) { return lobo(d + 3); }), nomS);
    check('curva spostata di 3 gradi interi: riallineata esattamente', r3.scartoMax < 1e-9 && Math.abs(Math.abs(r3.spostamento) - 3) < 1e-9, JSON.stringify(r3));
    var misMezzo = profilo(function (d) { return lobo(d + 0.5); });
    var rm = M.scartoDalNominale(misMezzo, nomS), vecchio = scartoVecchio(misMezzo, nomS);
    console.log('        stessa camma, mezzo grado di fase: scarto  prima ' + vecchio.toFixed(3) + ' mm   ora ' + rm.scartoMax.toFixed(4) + ' mm  (riallineata di ' + rm.spostamento + '°)');
    check('stessa camma sfasata di mezzo grado: prima lo scarto superava 0,10 mm', vecchio > 0.10, vecchio.toFixed(3) + ' mm');
    check('...ora resta sotto il centesimo', rm.scartoMax < 0.01, rm.scartoMax.toFixed(4) + ' mm');
    check('...e lo spostamento trovato e mezzo grado', Math.abs(Math.abs(rm.spostamento) - 0.5) <= 0.051, rm.spostamento + '°');
    // misura reale
    var rr = M.scartoDalNominale(spostata(reale, 0.5), reale), vr = scartoVecchio(spostata(reale, 0.5), reale);
    console.log('        misura reale del banco, mezzo grado di fase: scarto  prima ' + vr.toFixed(3) + ' mm   ora ' + rr.scartoMax.toFixed(4) + ' mm');
    check('su una misura reale: prima NON CONFORME a ±0,10 per sola fase', vr > 0.10, vr.toFixed(3) + ' mm');
    check('...ora lo scarto e quello dell interpolazione (sotto 0,02 mm)', rr.scartoMax < 0.02, rr.scartoMax.toFixed(4) + ' mm');
    var rq = M.scartoDalNominale(spostata(reale, 0.25), reale);
    check('un quarto di grado: idem', rq.scartoMax < 0.02 && Math.abs(Math.abs(rq.spostamento) - 0.25) <= 0.051, rq.scartoMax.toFixed(4) + ' mm, ' + rq.spostamento + '°');

    // un difetto VERO non sparisce
    var bozzo = profilo(function (d) { return lobo(d + 0.5) + (d >= 148 && d <= 152 ? 0.20 : 0); });
    var rb = M.scartoDalNominale(bozzo, nomS);
    check('un bozzo di 0,20 mm sul fianco resta 0,20 mm (la rifinitura non lo assorbe)',
        rb.scartoMax > 0.18 && rb.scartoMax < 0.23 && rb.gradoScartoMax >= 148 && rb.gradoScartoMax <= 152,
        rb.scartoMax.toFixed(3) + ' mm a ' + rb.gradoScartoMax + '°');
    var basso = profilo(function (d) { return 0.97 * lobo(d + 0.5); });
    var rl = M.scartoDalNominale(basso, nomS);
    check('una camma piu bassa del 3% resta fuori di circa 0,3 mm', rl.scartoMax > 0.25 && rl.scartoMax < 0.36, rl.scartoMax.toFixed(3) + ' mm');
    // la misura non viene toccata
    var copia = misMezzo.slice(); M.scartoDalNominale(misMezzo, nomS);
    check('la misura passata non viene modificata', misMezzo.every(function (v, i) { return v === copia[i]; }));
    // buchi: si giudica solo dove c'e' il dato
    var buchi = misMezzo.slice(); buchi[40] = NaN; buchi[200] = undefined;
    var rh = M.scartoDalNominale(buchi, nomS);
    check('gradi senza lettura: esclusi dal conto, non letti come zero', rh.punti === 358 && rh.scartoMax < 0.01, rh.punti + ' punti, ' + rh.scartoMax.toFixed(4) + ' mm');
}

// ---------------------------------------------------------------
console.log('');
console.log('--- la pagina Confronto ---');
var PAG = fs.readFileSync(path.join(__dirname, '..', 'grafici.html'), 'utf8').replace(/\r\n/g, '\n');
function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(PAG);
    if (!m) return null;
    var fine = PAG.indexOf('\n}\n', m.index);
    return fine < 0 ? null : PAG.substring(m.index, fine + 3);
}
var fnTol = estrai('_tolleranzaCollaudo'), fnEval = estrai('evalNominal');
check('la pagina ha _tolleranzaCollaudo() ed evalNominal()', !!fnTol && !!fnEval);
if (fnTol && fnEval && typeof M.scartoDalNominale === 'function') {
    var nominale = M.parseCamFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'rif2_asp_alz.scr'), 'utf8'));
    function pagina(valoreTolleranza, opz) {
        opz = opz || {};
        var segnalati = [];
        var el = { verdictBox: { innerHTML: '' }, tolMm: { value: valoreTolleranza }, lb1: { textContent: 'misura-uno' }, lb2: { textContent: 'misura-due' },
                   viewMode: { value: opz.vista || 'overlay' } };
        // curve vere negli slot; nel grafico, se la vista e' "diff", ci sono le DIFFERENZE
        var mis1 = opz.mis1 || spostata(nominale, 0.5), mis2 = opz.mis2 || null;
        function disegno(cam) { var a = []; for (var d = 1; d <= 360; d++) a.push(Number(cam[d])); return a; }
        var ds = [{ label: 'grafico1', data: disegno(mis1) }, { label: 'grafico2', data: mis2 ? disegno(mis2) : [] }, { label: 'grafico3', data: [] }, { label: 'grafico4', data: [] }];
        if (opz.vista === 'diff') { ds[0].data = ds[0].data.map(function () { return 0; }); if (mis2) ds[1].data = disegno(mis2).map(function (v, i) { return v - Number(mis1[i + 1]); }); }
        var etichette = []; for (var L = 1; L <= 360; L++) etichette.push(L);
        mis1.missingCount = 0; if (mis2) mis2.missingCount = 0;
        var ctx = {
            Math: Math, Number: Number, isFinite: isFinite, JSON: JSON,
            document: { getElementById: function (id) { return el[id] || null; } },
            window: { myLine: { data: { datasets: ds, labels: etichette }, update: function () {} }, _cmpData: [undefined, mis1, mis2 || undefined],
                      cammesEscape: function (s) { return String(s); }, cammesValidate: { error: function (e, msg) { segnalati.push(msg); } } },
            validaNumero: M.validaNumero, canProduceOfficialResult: M.canProduceOfficialResult, scartoDalNominale: M.scartoDalNominale,
            _nominal: nominale
        };
        ctx.window.window = ctx.window;
        vm.createContext(ctx);
        var ausiliarie = ['_nomAt', '_alignShift'].map(estrai).filter(Boolean);
        ausiliarie.forEach(function (f) { vm.runInContext(f, ctx); });
        vm.runInContext(fnTol, ctx); vm.runInContext(fnEval, ctx);
        vm.runInContext('evalNominal();', ctx);
        return { html: el.verdictBox.innerHTML, testo: el.verdictBox.innerHTML.replace(/<[^>]+>/g, ' ').replace(/&#10003;|&#10007;|&#9888;/g, '').replace(/&plusmn;/g, '±').replace(/&deg;/g, '°').replace(/\s+/g, ' ').trim(),
                 segnalati: segnalati, ds: ds };
    }
    function tolleranza(v) { var c = { document: { getElementById: function () { return { value: v }; } }, window: {}, validaNumero: M.validaNumero }; vm.createContext(c); vm.runInContext(fnTol, c); return vm.runInContext('_tolleranzaCollaudo()', c); }

    // 1) la tolleranza
    check('"0,05" (con la virgola) vale 0,05', tolleranza('0,05').ok === true && Math.abs(tolleranza('0,05').valore - 0.05) < 1e-12, JSON.stringify(tolleranza('0,05')));
    check('"0.2" (col punto) vale 0,2', tolleranza('0.2').ok === true && Math.abs(tolleranza('0.2').valore - 0.2) < 1e-12);
    ['', '   ', 'abc', '0', '-0,1', '0,1,2'].forEach(function (v) {
        check('tolleranza ' + JSON.stringify(v) + ': NON valida (prima diventava 0,10 in silenzio)', tolleranza(v).ok === false, JSON.stringify(tolleranza(v)));
    });
    // stessa camma sfasata di mezzo grado (scarto vero ~0,01): con ±0,05 e CONFORME, e lo dice con la tolleranza chiesta
    var p = pagina('0,05');
    console.log('        verdetto: ' + p.testo.slice(0, 200));
    check('con ±0,05 scritto con la virgola il verdetto usa 0,05', /CONFORME/.test(p.testo) && !/NON CONFORME/.test(p.testo) && /0[.,]05/.test(p.testo), p.testo.slice(0, 160));
    check('...e dichiara di quanto ha riallineato la curva', /riallineat/i.test(p.testo) && /0[.,]5/.test(p.testo), p.testo.slice(0, 200));
    // un bozzo da 0,08: fuori con ±0,05, dentro con ±0,10 — il verdetto deve seguire la tolleranza scritta
    var conBozzo = spostata(nominale, 0.5); for (var q = 150; q <= 153; q++) conBozzo[q] += 0.08;
    var p5 = pagina('0,05', { mis1: conBozzo }), p10 = pagina('0,10', { mis1: conBozzo });
    check('pezzo fuori di 0,08 mm: NON CONFORME a ±0,05 (prima usciva CONFORME, giudicato a ±0,10)', /NON CONFORME/.test(p5.testo), p5.testo.slice(0, 160));
    check('...e CONFORME a ±0,10', /CONFORME/.test(p10.testo) && !/NON CONFORME/.test(p10.testo), p10.testo.slice(0, 160));
    // tolleranza non valida: nessun giudizio, ma lo scarto resta scritto
    var pv = pagina('abc');
    check('tolleranza non valida: nessun CONFORME / NON CONFORME', !/CONFORME/.test(pv.testo), pv.testo.slice(0, 160));
    check('...ma lo scarto massimo resta scritto (un numero utile non si nasconde)', /scarto max/i.test(pv.testo) && /mm/.test(pv.testo), pv.testo.slice(0, 160));
    check('...e il campo viene segnalato', pv.segnalati.length === 1 && /tolleranza/i.test(pv.segnalati[0] || ''), JSON.stringify(pv.segnalati));

    // 3) vista Differenza: il verdetto NON cambia
    var altra = spostata(nominale, 0.25);
    var sov = pagina('0,10', { mis2: altra }), dif = pagina('0,10', { mis2: altra, vista: 'diff' });
    check('in vista Differenza il verdetto e lo stesso della vista Sovrapposto (prima: NON CONFORME di millimetri)',
        sov.testo === dif.testo && !/NON CONFORME/.test(dif.testo), 'sovrapposto: ' + sov.testo.slice(0, 90) + ' | differenza: ' + dif.testo.slice(0, 90));
    var banda = dif.ds.slice(4).filter(function (d) { return d && d.data && d.data.length; });
    check('...e in vista Differenza la banda del nominale non viene disegnata sopra le differenze', banda.length === 0, banda.length + ' serie');
    var bandaSov = sov.ds.slice(4).filter(function (d) { return d && d.data && d.data.length; });
    check('...mentre in vista Sovrapposto la banda c e', bandaSov.length === 2, bandaSov.length + ' serie');
}
var vivo = PAG.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');
check('la tolleranza non si legge piu con Number(...) || 0.10', !/Number\(document\.getElementById\('tolMm'\)\.value\)\)\s*\|\|\s*0\.10/.test(vivo));
check('il manuale e il campo parlano la stessa lingua: il valore di partenza ha la virgola', /id="tolMm"[^>]*value="0,10"/.test(PAG));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: il collaudo usa la tolleranza scritta (anche con la virgola), giudica le misure');
console.log('vere e non la vista del grafico, e non boccia una camma per una frazione di grado di fase.');
process.exit(0);
