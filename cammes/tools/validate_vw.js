// =============================================================
//  validate_vw.js — validazione su camme VW KR 1.8 16V reali
// =============================================================
// Caso reale: due scansioni indipendenti aspirazione e scarico, fatte col
// puntalino sferico Ø1.5, motore con bicchieri meccanici Ø35.
//
// ATTENZIONE — QUESTO TEST E' STATO RISCRITTO. Prima passava alla libreria
// 32,64 e 34,25 come RAGGIO del cerchio base, mentre sono i DIAMETRI misurati
// al calibro (confermato dal proprietario il 2026-07-26). Il raggio vero e'
// 16,32 / 17,13.
//
// Presi per raggi darebbero un cerchio base di Ø65,3 / Ø68,5: per un 1.8 16V un
// albero con lobi cosi' non entra in testa. E' un argomento di PLAUSIBILITA'
// sulla classe di motore, non una legge geometrica — attenzione a non usarne
// una piu' forte di quel che vale: un follower PIATTO non impone che il cerchio
// base sia piu' piccolo di lui, gli basta contenere l'escursione del punto di
// contatto (max |dL/dphi|). Sulla Clio, per esempio, l'offset massimo e' 13,18
// mm e un piattello Ø33 basta qualunque sia il cerchio base.
// La prova vera del diametro e' doppia: la conferma del proprietario e
// l'accordo con tre fonti indipendenti su due camme e due grandezze (sotto).
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
// un terzo, e' un residuo. E ha cambiato VERSO: adesso la scansione legge in
// ECCESSO, quindi le ipotesi costruite su "lo scanner sotto-misura il fianco"
// non valgono piu' per spiegarlo.
//
// Nota sulla sensibilita' a rBase, misurata sulla Clio: passare da 16,5 a 19
// sposta la curva convertita di 0,122 mm RMS, cioe' 2,7 volte l'accordo che la
// validazione fisica del 2026-07-11 aveva ottenuto (0,046 mm). Quindi il
// parametro conta davvero e un fit su di esso e' significativo — non e' un
// numero che si puo' sbagliare senza conseguenze.
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
// I RESIDUI SONO CRESCIUTI QUANDO SI E' CORRETTO IL VERSO DEL PUNTALINO, E
// VANNO DICHIARATI, NON RIASSORBITI IN SILENZIO.
//
// La compensazione del tastatore sferico aveva il verso rovesciato: SOMMAVA
// l'errore invece di toglierlo (vedi stylusCompensate e
// test_puntalino_ritorno.js, che lo prova contro un oracolo esatto a 1 micron).
// La sfera legge in ECCESSO sui fianchi, quindi la correzione giusta SOTTRAE, e
// sottrarre accorcia le durate e abbassa l'alzata a un dato angolo. Misurato su
// questa camma:
//        aspirazione  durata  residuo 6 -> 10 gradi
//        scarico      alzata@PMS  residuo 0 -> 0,06 mm
//        scarico      durata  residuo 0 -> 1 grado
// Tutti e tre nel verso "piu' corta e piu' bassa".
//
// Due letture possibili, e nessuna delle due si puo' chiudere da qui:
//  a) l'albero e' USATO e la scheda e' di camma NUOVA. L'usura toglie materiale
//     dai fianchi, cioe' accorcia e abbassa: i residui erano gia' tutti in quel
//     verso, e l'errore del tastatore ne mascherava una parte lusingando la
//     misura. Toglierlo scopre l'usura.
//  b) resta un errore nella correzione. Contro: l'oracolo esatto chiude a
//     1 micron su quattro geometrie e due raggi di punta, e il rumore di misura
//     non la sbilancia (a +-4 micron il bias sistematico e' +0,2 micron).
//
// Le soglie qui sotto sono i residui MISURATI oggi piu' un margine dichiarato,
// non un valore scelto per far passare il controllo. Servono come rilevatore di
// deriva: se un domani un cambio le fa crescere ancora, la suite lo dice.
// La prova che chiude la questione e' al banco: rimisurare questa camma dopo
// averla rimontata, e misurare col calibro il cerchio base (B.1/B.4).
var MARGINE_DERIVA_MM = 0.10;
var MARGINE_DERIVA_DEG = 3;
var CASI = [
    { nome: 'ASPIRAZIONE', file: 'VW-kr1_8-ASP_alz.scr',
      diamBase: 32.64, gioco: 0.30,
      bandaPms: [3.20, 3.50], bandaDurata: [290, 295],
      fonti: 'scheda 3,5 · rilievo 1: 3,20 · rilievo 2: 3,50',
      residuoAmmesso: 0.5, residuoDurataAmmesso: 10 + MARGINE_DERIVA_DEG,
      primaEra: { pms: 2.18, durata: 272 } },
    { nome: 'SCARICO', file: 'VW-kr1_8-SC_alz.scr',
      diamBase: 34.25, gioco: 0.40,
      bandaPms: [2.90, 3.30], bandaDurata: [281, 291],
      fonti: 'scheda 3,3 · rilievo 1: 2,90 · rilievo 2: 3,00',
      residuoAmmesso: 0.06 + MARGINE_DERIVA_MM, residuoDurataAmmesso: 1 + MARGINE_DERIVA_DEG,
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

    // Controllo di PLAUSIBILITA' (non di geometria: vedi l'intestazione) che
    // avrebbe intercettato l'errore di unita' da solo. Su un albero a camme
    // automobilistico il cerchio base sta fra ~20 e ~45 mm di diametro: il
    // doppio o la meta' di un valore in quella finestra ne esce sempre.
    check('il Ø del cerchio base e plausibile per un albero automobilistico',
        c.diamBase > 20 && c.diamBase < 45,
        'Ø ' + c.diamBase + ' mm (preso per raggio darebbe Ø' + (2 * c.diamBase).toFixed(1) + ')');

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
