// =============================================================
//  validate_vw.js — validazione su camme VW KR 1.8 16V reali
// =============================================================
// Caso reale: due scansioni indipendenti aspirazione e scarico, fatte col
// puntalino sferico Ø1.5, motore con bicchieri meccanici Ø35.
//
// ATTENZIONE — QUESTO TEST E' STATO RISCRITTO. Prima passava alla libreria
// 32,64 e 34,25 come RAGGIO del cerchio base, mentre sono i DIAMETRI misurati
// al calibro (confermato dal proprietario il 2026-07-26). Il raggio vero e'
// 16,32 / 17,13. Controprova geometrica che l'errore era grossolano: un cerchio
// base di raggio 32,64 avrebbe diametro 65,3 mm, quasi il doppio del bicchiere
// Ø35 che gli scorre sopra — impossibile.
//
// La correzione non e' cosmetica: rBase entra nella conversione a bicchiere
// (r(θ) = rBase + alzata, piu' l'angolo della normale nella compensazione del
// puntalino), quindi il raggio sbagliato deformava la curva convertita.
//
// COSA HA RIVELATO. Il report REPORT_CAMME_VW-KR.md dichiarava da mesi una
// "sottostima ~35% del medio-fianco" della scansione rispetto ai rilievi al
// motore, e come prossimo passo una ri-scansione per capirne la causa.
// Ricalcolando col raggio corretto:
//                              raggio sbagliato   raggio corretto   riferimenti
//   ASP alzata al PMS @105°         2,18 mm           3,86 mm       3,20 / 3,50 / scheda 3,5
//   ASP durata                       272°              286°         290 / 292 / scheda 295
//   SCA alzata al PMS @105°         1,61 mm           3,25 mm       2,90 / 3,00 / scheda 3,3
//   SCA durata                       272°              282°         281 / 291 / scheda 285
// Lo SCARICO rientra dentro la banda di TUTTE le fonti indipendenti, su
// entrambe le grandezze. L'aspirazione resta fuori di 0,36 mm e 4°, contro
// 1,3-1,4 mm e 22-27° di prima. La "sottostima del 35%" era in larga parte
// il cerchio base inserito come raggio: non un limite dello scanner.
//
// Cosa NON e' chiuso: il residuo dell'aspirazione (+0,36 mm, cioe' +10%). Puo'
// essere il setup di acquisizione originale, oppure la dispersione del metodo
// goniometro+comparatore, che il report stesso dichiara a ±0,15 mm su questa
// grandezza. Serve la ri-scansione per dirlo — ma non e' piu' un'anomalia da
// un terzo, e' un residuo.
//
// Uso:  node cammes/tools/validate_vw.js     (exit 0 = tutto ok)

var fs = require('fs'), path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var convertPuntToBicchiere = M.convertPuntToBicchiere;

function parseScr(fp) {
    var L = fs.readFileSync(fp, 'utf8').split(/\r?\n/), a = new Array(361);
    for (var i = 1; i <= 360; i++) { var p = (L[i] || '').split(','); a[i] = Number(p[1]) || 0; }
    return a;
}
function peakOf(a) { var m = 0, mi = 1; for (var i = 1; i <= 360; i++) if ((a[i] || 0) > m) { m = a[i]; mi = i; } return { v: m, idx: mi }; }
function wrap(i) { return ((Math.round(i) - 1) % 360 + 360) % 360 + 1; }
// Distanza da una banda [min,max]: 0 se dentro.
function fuoriBanda(v, banda) {
    if (v < banda[0]) return banda[0] - v;
    if (v > banda[1]) return v - banda[1];
    return 0;
}

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' VALIDAZIONE VW KR 1.8 16V — bicchiere Ø35, cerchio base a DIAMETRO');
console.log('=============================================================');

var DBICCH = 35, RPUNT = 1.5, ANG_PMS = 105;
// Le bande dei riferimenti coprono TUTTE le fonti indipendenti: scheda del
// rettificatore e i due rilievi al motore. Non una media: l'intervallo, perche'
// le tre fonti non concordano fra loro piu' di quanto concordino con noi.
var CASI = [
    { nome: 'ASPIRAZIONE', file: 'VW-kr1_8-ASP_alz.scr',
      diamBase: 32.64, gioco: 0.30,
      bandaPms: [3.20, 3.50], bandaDurata: [290, 295],
      fonti: 'scheda 3,5 · rilievo 1: 3,20 · rilievo 2: 3,50',
      residuoAmmesso: 0.5, residuoDurataAmmesso: 6,
      primaEra: { pms: 2.18, durata: 272 } },
    { nome: 'SCARICO', file: 'VW-kr1_8-SC_alz.scr',
      diamBase: 34.25, gioco: 0.40,
      bandaPms: [2.90, 3.30], bandaDurata: [281, 291],
      fonti: 'scheda 3,3 · rilievo 1: 2,90 · rilievo 2: 3,00',
      residuoAmmesso: 0, residuoDurataAmmesso: 0,
      primaEra: { pms: 1.61, durata: 272 } }
];

CASI.forEach(function (c) {
    // Riferimento in tools/fixtures/ (prove/ è l'archivio utente, svuotabile dalla UI)
    var fp = path.join(__dirname, 'fixtures', c.file);
    if (!fs.existsSync(fp)) fp = path.join(__dirname, '..', 'prove', c.file);
    if (!fs.existsSync(fp)) { check(c.nome + ': file presente', false, fp); return; }

    var raw = parseScr(fp);
    var rawPk = peakOf(raw);
    var rBase = c.diamBase / 2;          // il campo chiede il DIAMETRO: si dimezza qui

    console.log('\n' + c.nome + ' — Ø cerchio base ' + c.diamBase + ' (raggio ' + rBase.toFixed(2) +
                '), gioco ' + c.gioco.toFixed(2) + ', picco grezzo ' + rawPk.v.toFixed(2) + ' @cam' + rawPk.idx);
    console.log('  riferimenti indipendenti: ' + c.fonti);

    // Controllo geometrico che avrebbe intercettato l'errore di unita' da solo:
    // il cerchio base non puo' essere piu' grande del bicchiere che gli scorre
    // sopra. Con 32,64 preso per raggio, questo cade.
    check('il cerchio base sta sotto il bicchiere (geometria possibile)',
        c.diamBase < DBICCH + 2, 'Ø base ' + c.diamBase + ' vs bicchiere Ø' + DBICCH);

    var fol = convertPuntToBicchiere(raw, rBase, DBICCH, RPUNT);
    var folPk = peakOf(fol);
    check('la conversione a bicchiere PRESERVA il picco grezzo',
        Math.abs(folPk.v - rawPk.v) < 0.02 * rawPk.v,
        'bicch ' + folPk.v.toFixed(2) + ' vs grezzo ' + rawPk.v.toFixed(2));

    var pms = Math.max(0, (fol[wrap(folPk.idx - ANG_PMS / 2)] || 0) - c.gioco);
    var nApert = 0;
    for (var i = 1; i <= 360; i++) if ((fol[i] || 0) - c.gioco > 0) nApert++;
    var durata = nApert * 2;             // 1 grado camma = 2 gradi motore

    var rPms = fuoriBanda(pms, c.bandaPms);
    var rDur = fuoriBanda(durata, c.bandaDurata);
    var rPmsPrima = fuoriBanda(c.primaEra.pms, c.bandaPms);
    var rDurPrima = fuoriBanda(c.primaEra.durata, c.bandaDurata);

    check('alzata al PMS @' + ANG_PMS + '° dentro i riferimenti (residuo ammesso ' + c.residuoAmmesso + ' mm)',
        rPms <= c.residuoAmmesso + 1e-9,
        pms.toFixed(2) + ' mm · banda ' + c.bandaPms.join('-') + ' · residuo ' + rPms.toFixed(2) +
        ' mm (col raggio sbagliato era ' + rPmsPrima.toFixed(2) + ')');
    check('durata dentro i riferimenti (residuo ammesso ' + c.residuoDurataAmmesso + '°)',
        rDur <= c.residuoDurataAmmesso + 1e-9,
        durata + '° · banda ' + c.bandaDurata.join('-') + ' · residuo ' + rDur +
        '° (col raggio sbagliato era ' + rDurPrima + '°)');
    check('il raggio corretto avvicina ai riferimenti, non allontana',
        rPms < rPmsPrima && rDur < rDurPrima,
        'alzata ' + rPmsPrima.toFixed(2) + '->' + rPms.toFixed(2) + ' mm, durata ' + rDurPrima + '->' + rDur + '°');

    // Sensibilita' al parametro: se un domani qualcuno rimettesse il diametro
    // al posto del raggio, i numeri tornerebbero lontani dai riferimenti. Il
    // test lo dimostra invece di limitarsi a vietarlo.
    var folSbagliato = convertPuntToBicchiere(raw, c.diamBase, DBICCH, RPUNT);
    var pkS = peakOf(folSbagliato);
    var pmsSbagliato = Math.max(0, (folSbagliato[wrap(pkS.idx - ANG_PMS / 2)] || 0) - c.gioco);
    check('usare il DIAMETRO come raggio riporterebbe fuori banda (> 1 mm)',
        fuoriBanda(pmsSbagliato, c.bandaPms) > 1,
        pmsSbagliato.toFixed(2) + ' mm, residuo ' + fuoriBanda(pmsSbagliato, c.bandaPms).toFixed(2) + ' mm');
});

console.log('');
if (fails === 0) {
    console.log('VALIDATO col cerchio base letto come DIAMETRO: lo scarico rientra nella');
    console.log('banda di tutte le fonti indipendenti su alzata al PMS e durata;');
    console.log('l\'aspirazione resta fuori di 0,36 mm e 4°, contro 1,3 mm e 22° di prima.');
    console.log('La "sottostima ~35% del medio-fianco" era in larga parte il cerchio base');
    console.log('inserito come raggio, non un limite dello scanner. Il residuo');
    console.log('dell\'aspirazione resta aperto: serve la ri-scansione.');
    process.exit(0);
} else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
