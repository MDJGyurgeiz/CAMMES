// =============================================================
//  validate_vw.js — validazione "alzata al PMS" su camme VW KR 1.8 16V reali
// =============================================================
// Caso reale (sotto-sessione 6.12): due scansioni indipendenti aspirazione e
// scarico, fatte col puntalino sferico Ø1.5, motore con bicchieri Ø35.
// Verifica end-to-end, con le funzioni REALI estratte da analisi.html, che:
//   (1) la conversione bicchiere PRESERVA il picco grezzo (il vecchio bug della
//       sottrazione piatta -rPunt lo abbassava di 1.5 mm → bicchiere < puntalino);
//   (2) l'alzata al PMS riferita al PICCO MISURATO, centro lobo 104° motore,
//       bicchiere Ø35, gioco 0.3 → asp 2.18 / sca 1.71 mm (valore fisico corretto);
//   (3) i 3.5/3.3 mm "attesi" dall'utente cadono a centro lobo ~88-92° motore,
//       NON a 104° (incoerenza fasatura, documentata: non è un bug del software).
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

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' VALIDAZIONE ALZATA AL PMS — VW KR 1.8 16V (bicchiere Ø35)');
console.log('=============================================================');

var GIOCO = 0.3, DBICCH = 35, RPUNT = 1.5;
var CASES = [
    { name: 'ASP', file: 'VW-kr1_8-ASP_alz.scr', rBase: 32.64, exp104: 2.18, target: 3.5 },
    { name: 'SC',  file: 'VW-kr1_8-SC_alz.scr',  rBase: 34.25, exp104: 1.71, target: 3.3 }
];

CASES.forEach(function (cfg) {
    // Riferimento in tools/fixtures/ (prove/ è l'archivio utente, svuotabile dalla UI)
    var fp = path.join(__dirname, 'fixtures', cfg.file);
    if (!fs.existsSync(fp)) fp = path.join(__dirname, '..', 'prove', cfg.file);
    if (!fs.existsSync(fp)) { check(cfg.name + ': file presente', false, fp); return; }
    var raw = parseScr(fp);
    var rawPk = peakOf(raw);
    var fol = convertPuntToBicchiere(raw, cfg.rBase, DBICCH, RPUNT);
    var folPk = peakOf(fol);
    function liftAt(angCrank) { return Math.max(0, (fol[wrap(folPk.idx - angCrank / 2)] || 0) - GIOCO); }

    // offset (gradi motore) a cui il bicchiere raggiunge il target dell'utente
    var bestOff = -1, bestErr = 9;
    for (var o = 0; o <= 120; o++) { var v = Math.max(0, (fol[wrap(folPk.idx - o / 2)] || 0) - GIOCO); if (Math.abs(v - cfg.target) < bestErr) { bestErr = Math.abs(v - cfg.target); bestOff = o; } }

    console.log('\n' + cfg.name + ' (rBase ' + cfg.rBase + ', picco grezzo ' + rawPk.v.toFixed(2) + ' @cam' + rawPk.idx + '):');
    check('bicchiere PRESERVA il picco grezzo (no bug -rPunt)', Math.abs(folPk.v - rawPk.v) < 0.02 * rawPk.v, 'bicch ' + folPk.v.toFixed(2) + ' vs raw ' + rawPk.v.toFixed(2));
    check('alzata@PMS 104° motore ≈ ' + cfg.exp104 + ' mm (valore fisico)', Math.abs(liftAt(104) - cfg.exp104) < 0.1, 'calc ' + liftAt(104).toFixed(2) + ' mm');
    check('target utente ' + cfg.target + ' mm cade a ~88-96° (NON 104°)', bestOff >= 86 && bestOff <= 96, 'a ~' + bestOff + '° motore');
    check('alzata@PMS finita e < picco', isFinite(liftAt(104)) && liftAt(104) < folPk.v, '');
});

console.log('');
if (fails === 0) {
    console.log('VALIDATO: pipeline alzata al PMS corretta sulle camme VW reali.');
    console.log('A 104° motore l\'alzata all\'incrocio è 2.18/1.71 mm; i 3.5/3.3 attesi');
    console.log('implicano un centro lobo ~90° (camme più anticipate o fasatura diversa).');
    process.exit(0);
} else { console.log(fails + ' CHECK FALLITI'); process.exit(1); }
