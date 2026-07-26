// =============================================================
//  test_doc_release.js — P2-13 (audit esterno v3.4.3)
// =============================================================
//  Rilievo: "documentazione di release non allineata". Verificato: su 22
//  valori dichiarati, 16 non corrispondevano al vero. Il caso peggiore era lo
//  SHA256 del firmware, scritto SBAGLIATO in due documenti su quattro — con
//  due valori diversi fra loro, e nessuno dei due uguale all'HEX distribuito.
//
//  Correggere i numeri a mano non basta: fra due release sono di nuovo
//  sbagliati. Questo test li ricalcola dalla realta' e fallisce se un
//  documento dichiara qualcosa che non e' vero.
//
//  Uso: node tools/test_doc_release.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var RADICE = path.join(__dirname, '..', '..');
var CAMMES = path.join(__dirname, '..');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggi(rel) {
    var p = path.join(RADICE, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

console.log('=============================================================');
console.log(' P2-13 - i documenti di release devono dire il vero');
console.log('=============================================================');

// ---------------------------------------------------------------
// 1. SHA256 del firmware: uno solo, quello dell'HEX che si distribuisce
// ---------------------------------------------------------------
console.log('--- SHA256 del firmware distribuito ---');
var hexPath = path.join(CAMMES, 'fw', 'master.ino.hex');
var shaVero = crypto.createHash('sha256').update(fs.readFileSync(hexPath)).digest('hex');
console.log('        HEX reale: ' + shaVero);

// Documenti che parlano del firmware all'utente o al cliente.
var DOCUMENTI = [
    'THIRD_PARTY_NOTICES.md', 'REMAINING_RISKS.md', 'RELEASE_MANIFEST.json',
    'README.md', 'AUDIT_RESPONSE.md', 'cammes/fw/version.json'
];
// Un hash puo' essere scritto per intero o abbreviato ("2ae84e28…"): in
// entrambi i casi deve essere un PREFISSO di quello vero.
var reHex = /\b([0-9a-f]{8,64})\b/gi;
var parlaDiFirmware = /hexsha256|master\.ino\.hex|hex distribuito|sha-?256/i;
var sbagliati = [];
DOCUMENTI.forEach(function (d) {
    var testo = leggi(d);
    if (testo === null) { sbagliati.push(d + ': FILE ASSENTE'); return; }
    var righe = testo.split('\n');
    righe.forEach(function (riga, i) {
        // il contesto puo' stare sulla riga precedente (elenchi su due righe)
        var contesto = riga + ' ' + (righe[i - 1] || '');
        if (!parlaDiFirmware.test(contesto)) return;
        var m;
        reHex.lastIndex = 0;
        while ((m = reHex.exec(riga))) {
            var h = m[1].toLowerCase();
            if (h.length < 8) continue;
            if (shaVero.indexOf(h) !== 0) {
                sbagliati.push(d + ':' + (i + 1) + ' -> ' + h.substring(0, 16) + (h.length > 16 ? '…' : ''));
            }
        }
    });
});
check('nessun documento dichiara un SHA256 firmware diverso da quello reale',
    sbagliati.length === 0, sbagliati.join(' | ') || 'tutti coerenti');

// ---------------------------------------------------------------
// 2. REL-07: o e' aperto ovunque, o e' chiuso ovunque
// ---------------------------------------------------------------
console.log('--- stato REL-07 dichiarato in modo coerente ---');
var aperti = [], chiusi = [];
DOCUMENTI.concat(['CHANGELOG.md']).forEach(function (d) {
    var testo = leggi(d);
    if (!testo) return;
    testo.split('\n').forEach(function (riga, i) {
        if (riga.indexOf('REL-07') < 0) return;
        // la frase puo' proseguire: guardo la riga intera attorno alla sigla
        if (/ancora aperto|\bOPEN\b|non chiuso|deliverable.{0,40}aperto/i.test(riga)) aperti.push(d + ':' + (i + 1));
        else if (/chiuso|FIXED|CHIUSO/i.test(riga)) chiusi.push(d + ':' + (i + 1));
    });
});
check('REL-07 non e dichiarato aperto e chiuso allo stesso tempo',
    !(aperti.length && chiusi.length),
    'aperto in [' + aperti.join(', ') + '] chiuso in [' + chiusi.join(', ') + ']');

// ---------------------------------------------------------------
// 3. Conteggio della suite: quello scritto deve essere quello vero
// ---------------------------------------------------------------
console.log('--- conteggio della suite dichiarato nel README ---');
var pkg = JSON.parse(fs.readFileSync(path.join(CAMMES, 'package.json'), 'utf8'));
var script = (pkg.scripts.test.match(/tools\/[a-z0-9_]+\.js/gi) || []);
var nSuite = script.length;
console.log('        script in "npm test": ' + nSuite);
var readme = leggi('README.md') || '';
var mSuite = /(\d+)\s+suite di regressione/i.exec(readme);
check('il README dichiara il numero giusto di suite',
    !!mSuite && Number(mSuite[1]) === nSuite,
    mSuite ? ('dichiarate ' + mSuite[1] + ', reali ' + nSuite) : 'nessun conteggio trovato nel README');
// Il numero di CHECK cambia a ogni test aggiunto: il README non deve
// congelarlo, altrimenti mente entro una settimana. Lo stampa la suite.
var mCheck = /\((\d+)\s+check\)/i.exec(readme);
check('il README non congela un totale di check destinato a invecchiare',
    !mCheck, mCheck ? ('dichiarati ' + mCheck[1] + ' check: toglierlo o renderlo generato') : 'nessun numero fisso');

// ---------------------------------------------------------------
// 4. Versione: manifest e package.json devono coincidere
// ---------------------------------------------------------------
console.log('--- versione coerente fra manifest e package.json ---');
var man = null;
try { man = JSON.parse(leggi('RELEASE_MANIFEST.json')); } catch (e) { /* gestito sotto */ }
check('RELEASE_MANIFEST.json e leggibile', !!man);
if (man) {
    check('versione app uguale a package.json',
        man.app && man.app.version === pkg.version,
        (man.app && man.app.version) + ' vs ' + pkg.version);
    var fwv = JSON.parse(fs.readFileSync(path.join(CAMMES, 'fw', 'version.json'), 'utf8'));
    check('versione firmware uguale a fw/version.json',
        man.firmware && String(man.firmware.version) === String(fwv.firmware),
        (man.firmware && man.firmware.version) + ' vs ' + fwv.firmware);
    check('hexSha256 di fw/version.json uguale all HEX reale',
        fwv.hexSha256 === shaVero, fwv.hexSha256);
    check('hexSha256 del manifest uguale all HEX reale',
        man.firmware && man.firmware.hexSha256 === shaVero);
    // "280+ check verdi" era vero ma sottostimato di 148: un numero che non
    // si aggiorna e' un numero che smette di dire qualcosa.
    var gate = (man.gates && man.gates.npmTest) || '';
    var mGate = /(\d+)\s*\+?\s*check/i.exec(gate);
    check('il manifest non dichiara un conteggio check inferiore alle suite reali',
        !mGate || Number(mGate[1]) >= nSuite,
        gate);
}

// ---------------------------------------------------------------
// 5. Ogni file di test citato deve esistere davvero
// ---------------------------------------------------------------
console.log('--- i test citati in "npm test" esistono ---');
var mancanti = script.filter(function (s) {
    return !fs.existsSync(path.join(CAMMES, s));
});
check('nessuno script di test dichiarato e assente', mancanti.length === 0, mancanti.join(', ') || 'tutti presenti');

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: SHA firmware unico e vero, REL-07 coerente, conteggi');
console.log('della suite ricalcolati dalla realta, versioni allineate.\n');
