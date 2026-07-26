// =============================================================
//  test_audit343_fisica.js — audit esterno v3.4.3, rilievi ad ALTA gravita'
// =============================================================
//  Copre i tre difetti di FISICA/MATEMATICA confermati dalla verifica
//  indipendente. Scritto PRIMA della correzione: sulla v3.4.3 fallisce.
//
//   P1-09a  fingerTilt e' matematicamente inerte (no-op dimostrato)
//   P1-09b  il convertitore finger restituisce gia' il moto lato VALVOLA:
//           chi lo usa non deve applicare un secondo rapporto di leva
//   P1-06   kPivot applica la molla del perno alla coordinata sbagliata e
//           INCHIODA il bilanciere invece di farlo cedere: alzando la
//           rigidezza la valvola si ferma, e il distacco risulta 0 (verde)
//   P1-04   i tre solver di compliance scrivono lo stato del grado deg+1
//           dentro out[deg]: la curva valvola risulta anticipata di 1 grado
//
//  Uso: node tools/test_audit343_fisica.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

// camma sintetica: lobo coseno rialzato, picco NOTO al grado indicato
function camma(picco, semiAmpiezza, altezza) {
    var a = new Array(361);
    for (var d = 1; d <= 360; d++) {
        var dd = ((d - picco + 180) % 360 + 360) % 360 - 180;
        var x = dd / semiAmpiezza;
        a[d] = (x > -1 && x < 1) ? altezza * 0.5 * (1 + Math.cos(Math.PI * x)) : 0;
    }
    a[0] = 0;
    return a;
}
function maxDi(arr, da, a) {
    var m = -Infinity;
    for (var i = (da || 1); i <= (a || 360); i++) if (arr[i] > m) m = arr[i];
    return m;
}

console.log('=============================================================');
console.log(' AUDIT v3.4.3 - rilievi di fisica ad alta gravita');
console.log('=============================================================');

// ---------------------------------------------------------------
// P1-09a — il tilt del finger deve avere un effetto, oppure non esistere
// ---------------------------------------------------------------
console.log('--- P1-09a: fingerTilt ---');
var cam = camma(180, 100, 7.0);
var t0  = M.convertPuntToFinger(cam, 17, 25, 30, 1.5, 0);
var t30 = M.convertPuntToFinger(cam, 17, 25, 30, 1.5, 30);
var diffTilt = 0;
for (var i = 1; i <= 360; i++) diffTilt = Math.max(diffTilt, Math.abs(t0[i] - t30[i]));
// Dopo il fix il parametro NON esiste piu': la firma accetta 5 argomenti e il
// 6to viene ignorato. Il test accetta UNA delle due situazioni oneste:
//  - il tilt ha un effetto fisico misurabile (> 1 micron), oppure
//  - il parametro e' stato rimosso e documentato come tale (flag esportato).
var tiltRimosso = M.convertPuntToFinger.length <= 5 || M.FINGER_TILT_RIMOSSO === true;
check('il tilt ha un effetto reale OPPURE e stato rimosso onestamente',
    diffTilt > 0.001 || tiltRimosso,
    'diff max tilt 0-30 gradi = ' + diffTilt.toExponential(2) + ' mm, rimosso=' + tiltRimosso);

// ---------------------------------------------------------------
// P1-09b — il convertitore finger restituisce moto lato VALVOLA
// ---------------------------------------------------------------
console.log('--- P1-09b: rapporto di leva applicato una volta sola ---');
var lArm = 25, lValve = 37.5;                 // rapporto leva = 1.5
var conv = M.convertPuntToFinger(cam, 17, lArm, lValve, 0, 0);
var attesoValvola = 7.0 * (lValve / lArm);    // 10.5 mm lato valvola
check('convertPuntToFinger amplifica gia di lValve/lArm (moto VALVOLA)',
    Math.abs(maxDi(conv) - attesoValvola) < 0.02,
    'picco convertito ' + maxDi(conv).toFixed(3) + ' mm, atteso ' + attesoValvola.toFixed(3));
// Il valore dichiarato dal convertitore E' gia' quello finale: se il chiamante
// applicasse ANCHE il campo Bilanciere (1.5) otterrebbe 15.75 mm, cioe' il 50%
// in piu' del vero. Questo test blocca la regressione a livello di libreria
// esponendo il dominio del risultato.
check('il convertitore dichiara il proprio dominio di uscita',
    M.FOLLOWER_OUTPUT_DOMAIN && M.FOLLOWER_OUTPUT_DOMAIN.finger === 'valve',
    'atteso FOLLOWER_OUTPUT_DOMAIN.finger === "valve", trovato ' +
    JSON.stringify(M.FOLLOWER_OUTPUT_DOMAIN));

// ---------------------------------------------------------------
// P1-06 — kPivot: un perno PIU' RIGIDO non puo' fermare la valvola
// ---------------------------------------------------------------
console.log('--- P1-06: cedevolezza del perno bilanciere ---');
var cam3 = camma(180, 90, 10.0);
var crank3 = new Array(721);
for (var c = 1; c <= 720; c++) crank3[c] = cam3[((c - 1) % 360) + 1];
var par3 = { massEqG: 90, massEqIntermediateG: 50, massSeatG: 15,
             kPushrodN_mm: 800, kTrainN_mm: 6000, kSeatN_mm: 80000,
             kSpringN_mm: 30, F0N: 200, dampingRatio: 0.06 };
function piccoConPivot(kp) {
    var p = Object.assign({}, par3, { kPivotN_mm: kp });
    var v = M.simulateCompliance3DOF(crank3, 3000, p);
    return maxDi(v, 1, 720);
}
var pv0    = piccoConPivot(0);
var pv20k  = piccoConPivot(20000);
var pv1M   = piccoConPivot(1000000);
console.log('        picco valvola: pivot 0 = ' + pv0.toFixed(3) +
            ' | 20.000 = ' + pv20k.toFixed(3) + ' | 1.000.000 = ' + pv1M.toFixed(3) + ' mm');
// Fisica: un perno infinitamente rigido = perno fermo = comportamento normale.
// Deve quindi CONVERGERE al caso kPivot=0, non azzerare l'alzata.
check('P1-06: perno rigidissimo -> alzata come perno fermo (non zero)',
    pv1M > pv0 * 0.9,
    'pivot 1e6 da ' + pv1M.toFixed(3) + ' mm contro ' + pv0.toFixed(3) + ' mm di riferimento');
check('P1-06: un perno piu rigido non riduce l alzata',
    pv20k > pv0 * 0.9,
    'pivot 20.000 da ' + pv20k.toFixed(3) + ' mm contro ' + pv0.toFixed(3) + ' mm');

// ---------------------------------------------------------------
// P1-04 — allineamento angolare dei solver
// ---------------------------------------------------------------
console.log('--- P1-04: allineamento angolare della curva valvola ---');
var PICCO = 480;
var crank4 = new Array(721);
for (var q = 1; q <= 720; q++) {
    var dd = ((q - PICCO + 360) % 720 + 720) % 720 - 360;
    var x4 = dd / 120;
    crank4[q] = (x4 > -1 && x4 < 1) ? 10 * 0.5 * (1 + Math.cos(Math.PI * x4)) : 0;
}
function idxPicco(arr) {
    var m = -Infinity, at = 0;
    for (var i = 1; i <= 720; i++) if (arr[i] > m) { m = arr[i]; at = i; }
    return at;
}
// A regime bassissimo con treno rigido la valvola deve seguire la camma:
// il picco deve cadere allo STESSO grado, non uno prima.
var rigido = { massEqG: 50, massEqIntermediateG: 40, massSeatG: 10,
               kPushrodN_mm: 50000, kTrainN_mm: 50000, kSeatN_mm: 200000,
               kSpringN_mm: 30, F0N: 200, dampingRatio: 0.3 };
var s1 = M.simulateCompliance(crank4, 60, rigido);
var s2 = M.simulateCompliance2DOF(crank4, 60, rigido);
var s3 = M.simulateCompliance3DOF(crank4, 60, rigido);
check('1-DOF: picco valvola allineato alla camma', Math.abs(idxPicco(s1) - PICCO) <= 0,
    'picco camma ' + PICCO + ', valvola ' + idxPicco(s1));
check('2-DOF: picco valvola allineato alla camma', Math.abs(idxPicco(s2) - PICCO) <= 0,
    'picco camma ' + PICCO + ', valvola ' + idxPicco(s2));
check('3-DOF: picco valvola allineato alla camma', Math.abs(idxPicco(s3) - PICCO) <= 0,
    'picco camma ' + PICCO + ', valvola ' + idxPicco(s3));

// Conseguenza diretta dello sfasamento: un distacco FANTASMA anche a regime
// quasi statico, dove fisicamente non ce n'e' nessuno.
var lento = M.simulateCompliance(crank4, 300, { massEqG: 100, kTrainN_mm: 5000,
                                                kSpringN_mm: 30, F0N: 200, dampingRatio: 0.06 });
var fantasma = 0;
for (var f = 1; f <= 720; f++) fantasma = Math.max(fantasma, (lento[f] || 0) - crank4[f]);
check('nessun distacco fantasma a regime quasi statico', fantasma < 0.01,
    'valvola sopra la camma di ' + fantasma.toFixed(4) + ' mm (atteso ~0)');

// ---------------------------------------------------------------
// P1-05 — il gioco valvola si registra DOPO la leva, non prima
// ---------------------------------------------------------------
console.log('--- P1-05: gioco valvola e rapporto di leva ---');
// Il campo si chiama "Gioco valvola" e nella realta' si misura fra bilanciere
// e stelo, cioe' a valle del rapporto. La relazione corretta e' quindi
//     alzata_valvola = max(0, alzata_camma * rocker - gioco)
// e NON  (alzata_camma - gioco) * rocker, che equivale a un gioco gonfiato
// del rapporto stesso (0,20 con leva 1,5 si comporta come 0,30).
var camP5 = camma(180, 100, 7.0);
var GIOCO = 0.20, ROCKER = 1.5;
// composizione reale della pipeline: mapCamToCrank(gioco lato camma) + rocker
// applyRockerRatio vive in analisi.html ed e' una semplice moltiplicazione:
// qui la si replica per poter provare la composizione dal solo Node.
function perRocker(arr, r) {
    var o = new Array(722);
    for (var i = 0; i <= 721; i++) o[i] = (arr[i] || 0) * r;
    return o;
}
var lashCam = M.lashLatoCamma ? M.lashLatoCamma(GIOCO, ROCKER) : GIOCO;
var crankP5 = M.mapCamToCrank(camP5, 100, lashCam, 'intake');
var valvolaP5 = perRocker(crankP5, ROCKER);
var piccoOttenuto = maxDi(valvolaP5, 1, 720);
var piccoCorretto = 7.0 * ROCKER - GIOCO;     // 10.30 mm
var piccoSbagliato = (7.0 - GIOCO) * ROCKER;  // 10.20 mm
check('helper lashLatoCamma esportato', typeof M.lashLatoCamma === 'function');
check('alzata valvola = camma*rocker - gioco (non (camma-gioco)*rocker)',
    Math.abs(piccoOttenuto - piccoCorretto) < 0.005,
    'ottenuto ' + piccoOttenuto.toFixed(3) + ', corretto ' + piccoCorretto.toFixed(3) +
    ', sbagliato ' + piccoSbagliato.toFixed(3));
// Con bicchiere (rapporto 1,00) le due formule coincidono: nessuna regressione
// sulle misure gia' fatte.
var crank1 = M.mapCamToCrank(camP5, 100, M.lashLatoCamma ? M.lashLatoCamma(GIOCO, 1.0) : GIOCO, 'intake');
check('con bicchiere (rapporto 1,00) nulla cambia',
    Math.abs(maxDi(crank1, 1, 720) - (7.0 - GIOCO)) < 1e-9,
    'picco ' + maxDi(crank1, 1, 720).toFixed(4) + ' atteso ' + (7.0 - GIOCO).toFixed(4));

// ---------------------------------------------------------------
// P1-12 — lo zero del raggio puntalino e' un dato, non un campo vuoto
// ---------------------------------------------------------------
console.log('--- P1-12: rPunt = 0 e un valore legittimo ---');
// "0" significa punta piatta, senza sferetta: la libreria lo gestisce
// esplicitamente (nessuna compensazione). Era la UI a scartarlo con
// Number(v) || 1.5, sostituendolo in silenzio con 1,5 mm.
check('finiteOr conserva lo zero scritto dall utente', M.finiteOr('0', 1.5) === 0);
check('finiteOr usa il default solo se il campo e vuoto', M.finiteOr('', 1.5) === 1.5);
var senzaPunta = M.stylusCompensate(camP5, 17, 0);
var conPunta   = M.stylusCompensate(camP5, 17, 1.5);
var scarto = 0;
for (var sp = 1; sp <= 360; sp++) scarto = Math.max(scarto, Math.abs(senzaPunta[sp] - conPunta[sp]));
check('rPunt 0 e rPunt 1,5 danno curve diverse (lo zero conta)', scarto > 0.01,
    'scarto massimo sul fianco ' + scarto.toFixed(4) + ' mm');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: finger con un solo rapporto di leva e tilt onesto;');
console.log('perno bilanciere che cede invece di inchiodare; curva valvola');
console.log('allineata alla camma senza distacchi fantasma.\n');
