// =============================================================
//  test_escursione_contatto.js — quanto largo deve essere il bicchiere
// =============================================================
//  Su un follower PIATTO il punto di contatto non sta sull'asse: si sposta di
//  ds/dpsi, dove s e' l'alzata DEL PIATTELLO. Il piattello deve avere raggio
//  almeno pari a quello spostamento, altrimenti il contatto esce dal bordo e
//  l'alzata simulata non vale piu'.
//
//  L'avviso "Bicchiere troppo piccolo" derivava la curva SBAGLIATA: l'alzata
//  del PUNTALINO (follower radiale) invece di quella del piattello. Misurato
//  sulla camma RIF-3 col suo bicchiere reale (Ø29):
//      dalla curva puntalino  19,28 mm  ->  avrebbe detto "mancano 4,78 mm"
//      dalla curva piattello  15,08 mm  ->  ne mancano 0,58
//  Un allarme gonfiato di otto volte su un accoppiamento che e' solo al limite.
//
//  Uso: node tools/test_escursione_contatto.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var DEG = Math.PI / 180;
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function derivMax(a) {
    var m = 0;
    for (var d = 1; d <= 360; d++) {
        var pr = a[d === 1 ? 360 : d - 1] || 0, su = a[d === 360 ? 1 : d + 1] || 0;
        var o = Math.abs((su - pr) / (2 * DEG));
        if (o > m) m = o;
    }
    return m;
}
function leggi(rel) {
    var p = path.join(__dirname, 'fixtures', rel);
    return fs.existsSync(p) ? M.parseCamFile(fs.readFileSync(p, 'utf8')) : null;
}

console.log('=============================================================');
console.log(' ESCURSIONE DEL CONTATTO: si misura sulla curva del PIATTELLO');
console.log('=============================================================');

// ---------- lobo sintetico: la relazione si conosce ----------
//  Su un lobo cosinusoidale la curva del piattello e' ancora liscia, e
//  l'escursione e' la sua derivata prima. Qui si verifica che la funzione la
//  esponga e che coincida con la derivata calcolata a parte.
console.log('--- la funzione espone l escursione, e coincide col conto a parte ---');
var H = 8, W = 80, PICCO = 180;
var cam = new Array(361);
for (var d = 1; d <= 360; d++) {
    var t = d - PICCO;
    if (t > 180) t -= 360; if (t < -180) t += 360;
    cam[d] = (Math.abs(t) < W) ? H / 2 * (1 + Math.cos(Math.PI * t / W)) : 0;
}
var fol = M.convertPuntToBicchiere(cam, 16, 40, 0);
check('convertPuntToBicchiere espone escursioneContatto',
    typeof fol.escursioneContatto === 'number', String(fol.escursioneContatto));
check('e coincide con la derivata della curva che ha restituito',
    Math.abs(fol.escursioneContatto - derivMax(fol)) < 1e-9,
    fol.escursioneContatto.toFixed(4) + ' contro ' + derivMax(fol).toFixed(4));

// ---------- il criterio NON e' quello della curva puntalino ----------
console.log('--- non e la derivata della curva del puntalino ---');
var offPuntalino = derivMax(M.stylusCompensate(cam, 16, 0));
console.log('        dalla curva puntalino: ' + offPuntalino.toFixed(2) +
            '   dalla curva piattello: ' + fol.escursioneContatto.toFixed(2));
check('le due grandezze sono davvero diverse',
    Math.abs(offPuntalino - fol.escursioneContatto) > 0.1,
    'differenza ' + (offPuntalino - fol.escursioneContatto).toFixed(2) + ' mm');
check('e quella del puntalino e la MAGGIORE (l allarme si gonfiava)',
    offPuntalino > fol.escursioneContatto);

// ---------- controprova sui motori veri ----------
//  Un criterio giusto deve dare, su motori di serie, un margine POSITIVO e
//  ragionevole rispetto al bicchiere che quei motori montano davvero.
console.log('--- controprova sui motori veri ---');
var RIF2 = [['rif2_asp_alz.scr', 32.64, 'asp'], ['rif2_sca_alz.scr', 34.25, 'sca']];
RIF2.forEach(function (c) {
    var raw = leggi(c[0]);
    if (!raw) { console.log('        (fixture ' + c[0] + ' assente, salto)'); return; }
    var f2 = M.convertPuntToBicchiere(raw, c[1] / 2, 35, 1.5);   // bicchiere reale della camma RIF-2: 35
    var margine = 17.5 - f2.escursioneContatto;
    console.log('        RIF-2 ' + c[2] + ': escursione ' + f2.escursioneContatto.toFixed(2) +
                ' mm, bicchiere reale Ø35 (raggio 17,50) -> margine ' + margine.toFixed(2) + ' mm');
    check('RIF-2 ' + c[2] + ': il bicchiere reale del motore risulta SUFFICIENTE',
        margine > 0, 'margine ' + margine.toFixed(2) + ' mm');
    check('RIF-2 ' + c[2] + ': e il margine e ragionevole, non al pelo',
        margine > 1 && margine < 8, margine.toFixed(2) + ' mm');
});

// ---------- l'avviso non deve gridare dove il margine e piccolo ----------
//  Un accoppiamento al limite non e' un accoppiamento sbagliato: il testo lo
//  deve dire per quello che e'.
console.log('--- il testo dell avviso ---');
var sorgente = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cammes-math.js'), 'utf8');
check('l avviso non dice piu "troppo piccolo" in modo assoluto',
    sorgente.indexOf('Bicchiere troppo piccolo per questo lobo') < 0);
check('dice di quanto manca, invece di un giudizio secco',
    /mancano ' \+ \(escursioneContatto - R\)/.test(sorgente));
check('e non deriva piu la curva del puntalino per questo controllo',
    !/off = Math\.abs\(\(su - pr\) \/ \(2 \* DEG\)\);[\s\S]{0,200}offsetMax/.test(sorgente));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: l escursione del contatto si misura sulla curva del');
console.log('piattello, i motori di serie risultano accoppiati con margine, e');
console.log('l avviso dice di quanto manca invece di gridare.\n');
