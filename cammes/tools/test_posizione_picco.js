// =============================================================
//  test_posizione_picco.js — "non c'e piu a quanti gradi e l'alzata massima"
// =============================================================
//  Segnalazione dall'officina. Due fatti distinti, e vanno separati.
//
//  1) IL NUMERO CHE SI LEGGEVA NON MISURAVA LA CAMMA. La riga di stato
//     dell'import diceva "nomefile | Max: 16.21mm @ 100 gradi", quella stringa
//     finiva nello snapshot e da li' su scheda camma, PDF e CSV. Ma quel grado
//     usciva da findMax sulla curva GIA' FASATA (mapCamToCrank), che ancora il
//     picco misurato esattamente sul centro DICHIARATO:
//         dPk = camPeakPos(camLift);  pCenter = 360 +- centerDeg;
//         d = dPk + (p - pCenter)/2
//     quindi l'argmax cade per costruzione su pCenter e la posizione riportata
//     e' il campo "Angolo lobo" meno l'Anticipo. Misurato su tre camme diverse
//     (picchi veri a 189, 181 e 115 gradi camma): digitando 90/100/105/112 si
//     leggeva 90/100/105/112, 88/98/103/110 e 86/96/101/108.
//
//  2) IL NUMERO VERO NON C'E' PIU' SUI DOCUMENTI. Dal commit che ha messo nello
//     snapshot il solo NOME del file, la posizione del picco e' sparita da
//     scheda camma, PDF e intestazione CSV, e non e' stata rimessa altrove.
//
//  Decisione del proprietario: tenerli ENTRAMBI, etichettati. La posizione VERA
//  in gradi camma (una misura: dove il naso e' caduto in questa scansione, utile
//  per ritrovare il punto) e l'angolo lobo DICHIARATO, scritto come dichiarato.
//
//  Il banco non puo' misurare la posizione rispetto al PMS del motore: non ha
//  un riferimento al PMS, l'albero e' montato come capita. Non e' un difetto da
//  correggere, e' un limite da dichiarare.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_posizione_picco.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var HTML = fs.readFileSync(path.join(__dirname, '..', 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggiScr(nome) {
    var txt = fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8');
    var out = new Array(361);
    for (var i = 0; i <= 360; i++) out[i] = 0;
    txt.split(/\r?\n/).forEach(function (r) {
        if (!r || r.charAt(0) === '#') return;
        var p = r.split(/[;,\s]+/).filter(function (s) { return s !== ''; });
        if (p.length < 2) return;
        var g = parseInt(p[0], 10), v = parseFloat(String(p[1]).replace(',', '.'));
        if (!isNaN(g) && !isNaN(v) && g >= 1 && g <= 360) out[g] = v > 0 ? v : 0;
    });
    return out;
}

console.log('=============================================================');
console.log(' POSIZIONE DEL PICCO: una misura e una dichiarazione, distinte');
console.log('=============================================================');

// ---------- 1. la dimostrazione che il vecchio numero era un'eco ----------
console.log('--- il numero fasato ricopia il campo "Angolo lobo" ---');
function argmaxCrank(a) {
    var b = -1e9, i0 = 0;
    for (var i = 1; i <= 720; i++) if (a[i] > b) { b = a[i]; i0 = i; }
    return i0 - 360;
}
var CAMME = [
    { nome: 'camma RIF-2 asp', file: 'rif2_asp_alz.scr' },
    { nome: 'camma RIF-1', file: 'rif1_alz.scr' },
    { nome: 'prova_fw31', file: 'prova_fw31_alz.scr' }
];
CAMME.forEach(function (c) {
    var L = leggiScr(c.file);
    var vero = 0, vv = -1;
    for (var i = 1; i <= 360; i++) if (L[i] > vv) { vv = L[i]; vero = i; }
    var letti = [90, 100, 105, 112].map(function (ang) {
        return argmaxCrank(M.mapCamToCrank(L, ang, 0, 'intake'));
    });
    // segue l'angolo digitato, non il picco vero
    var segue = letti.every(function (v, k) { return Math.abs(v - [90, 100, 105, 112][k]) <= 4; });
    check(c.nome + ': il numero fasato segue l angolo digitato, non il picco (vero ' + vero + ' deg camma)',
        segue, 'digitando 90/100/105/112 si legge ' + letti.join('/'));
});

// ---------- 2. la posizione VERA e nello snapshot ----------
console.log('');
console.log('--- la misura vera arriva ai documenti ---');
var vivo = HTML.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n');

check('lo snapshot porta la posizione del picco in gradi camma',
    /camPkPosIn\s*:/.test(vivo) && /camPkPosEx\s*:/.test(vivo),
    'servono camPkPosIn / camPkPosEx');

check('e la calcola dalla curva GREZZA, con lo stesso metodo dello stato import',
    /camPkPosIn\s*:[\s\S]{0,160}?piccoConPlateau\s*\(\s*rawIntake/.test(vivo),
    'deve essere piccoConPlateau(rawIntake, 1, 360): stessa fonte, stesso numero');

// ---------- 3. CSV: due righe distinte, nomi che non si confondono ----------
console.log('');
console.log('--- il CSV distingue la misura dalla dichiarazione ---');
check('il CSV ha la posizione vera del picco in gradi camma',
    /camPkPosIn/.test(vivo) && /lines\.push\('[^']*picco[^']*camma[^']*',?/i.test(vivo),
    'riga con la posizione misurata');
check('la riga che ricopia l angolo lobo e etichettata come DICHIARATA',
    !/lines\.push\('Pos\. max alzata asp\. \[deg\],'/.test(vivo),
    'la vecchia etichetta faceva credere che fosse una misura');
check('e il CSV dice ancora l angolo lobo (dichiarato)',
    // (la riga del CSV si chiama "Alzata massima valvola" dal 2026-11-22)
    /dichiarat/i.test(vivo.slice(vivo.indexOf('Alzata massima valvola asp.'), vivo.indexOf('Alzata massima valvola asp.') + 1200)),
    'la dichiarazione resta, ma detta per quello che e');

// ---------- 4. la scheda camma e il PDF ----------
console.log('');
console.log('--- scheda camma e PDF ---');
check('la scheda camma dice che l angolo lobo e DICHIARATO',
    /row\('angolo lobo \(dichiarato\)'/.test(vivo),
    'l etichetta deve distinguerlo dalla misura che ora gli sta accanto');
check('la scheda camma mostra anche la posizione misurata del picco',
    /row\('[^']*picco[^']*'/i.test(vivo), 'serve una riga con i gradi camma veri');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: la posizione misurata del picco e sui documenti, distinta dall angolo dichiarato.');
process.exit(0);
