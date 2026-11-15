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
// Il conteggio era scritto in DUE punti del README con due frasi diverse: uno
// veniva aggiornato e l'altro restava indietro (trovato a 33 quando le suite
// erano 35). Qualunque "N suite" deve dire il vero, non solo quella frase.
var conteggiSbagliati = [];
var reTutti = /(\d+)\s+suite/gi, mTutti;
while ((mTutti = reTutti.exec(readme)) !== null) {
    if (Number(mTutti[1]) !== nSuite) conteggiSbagliati.push(mTutti[0]);
}
check('nessun altro conteggio di suite nel README contraddice quello vero',
    conteggiSbagliati.length === 0,
    conteggiSbagliati.length ? (conteggiSbagliati.join(', ') + ' contro ' + nSuite + ' reali') : 'coerenti');
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
// 4-bis. La versione firmware nei documenti e' quella vera (audit 2026-08-09)
// ---------------------------------------------------------------
// README e PROTOCOL dichiaravano "fw 3.6" e "ver=3.6" in sei punti mentre il
// firmware reale rispondeva "ver=4.1 scan=1 proto=4": il token proto=4 e'
// proprio quello su cui il server decide di attivare il bridge v4, quindi la
// riga sbagliata era la piu' load-bearing del documento. Regola: ogni token
// "ver=X.Y" o "fw=X.Y" nei documenti utente deve essere la versione di
// fw/version.json — i numeri storici vivono nel CHANGELOG, non qui.
console.log('--- la versione firmware nei documenti e quella vera ---');
(function () {
    var fwv = JSON.parse(fs.readFileSync(path.join(CAMMES, 'fw', 'version.json'), 'utf8'));
    var vera = String(fwv.firmware);
    var DOC_FW = ['README.md', 'PROTOCOL.md', 'MATH_SPEC.md'];
    var stantii = [];
    DOC_FW.forEach(function (d) {
        var testo = leggi(d);
        if (testo === null) { stantii.push(d + ': FILE ASSENTE'); return; }
        testo.split('\n').forEach(function (riga, i) {
            var re = /\b(?:ver|fw)=(\d+\.\d+)\b/g, m;
            while ((m = re.exec(riga)) !== null) {
                if (m[1] !== vera) stantii.push(d + ':' + (i + 1) + ' "' + m[0] + '" (reale ' + vera + ')');
            }
        });
    });
    check('nessun documento dichiara una versione firmware diversa da ' + vera,
        stantii.length === 0, stantii.slice(0, 4).join(' | ') || 'tutte allineate');

    // MATH_SPEC non deve descrivere come PRESENTE una funzione rimossa dalla
    // libreria: reindexByEncoder e' stata ritirata il 2026-07-23 e la spec ha
    // continuato a prometterci lavori sopra per due settimane.
    var spec = leggi('MATH_SPEC.md') || '';
    var lib = fs.readFileSync(path.join(CAMMES, 'lib', 'cammes-math.js'), 'utf8');
    var fantasma = [];
    var mSpec = /`?(\w+)`?\s+(?:accetta|calcola|restituisce|converte)/g, mm;
    while ((mm = mSpec.exec(spec)) !== null) {
        var nome = mm[1];
        if (!/^[a-z_$][\w$]*$/i.test(nome) || nome.length < 6) continue;
        if (lib.indexOf('function ' + nome) < 0 && spec.indexOf(nome + ' RIMOSSA') < 0 &&
            !new RegExp(nome + '[^\\n]*RIMOSS', 'i').test(spec)) fantasma.push(nome);
    }
    check('MATH_SPEC non descrive come presenti funzioni assenti dalla libreria',
        fantasma.length === 0, fantasma.join(', ') || 'nessun fantasma');
})();

// ---------------------------------------------------------------
// 4-ter. Manuale e PROTOCOL descrivono il programma di OGGI (verifica 2026-11-14)
// ---------------------------------------------------------------
// Il manuale operatore viaggia dentro l'exe (Home -> Manuale). Diceva ancora
// "inserisci diametro e RAGGIO base" quando il campo chiede il DIAMETRO dal
// 2026-07-28: e' esattamente l'errore di inserimento che aveva falsato il
// confronto con la scheda del rettificatore. Citava anche un "LED Sensore" e un
// selettore "Motore scansione" che non esistono piu'. E PROTOCOL.md affermava
// che l'ACK non porta run=, contro quello che il firmware stampa.
console.log('--- manuale e PROTOCOL descrivono il programma di oggi ---');
(function () {
    var manuale = leggi('MANUALE_OPERATORE.md') || '';
    var alzata = fs.readFileSync(path.join(CAMMES, 'alzata.html'), 'utf8');
    var analisi = fs.readFileSync(path.join(CAMMES, 'analisi.html'), 'utf8');
    var server = fs.readFileSync(path.join(CAMMES, 'cammes_server.js'), 'utf8');
    var fw = fs.readFileSync(path.join(CAMMES, '..', 'master', 'master.ino'), 'utf8');
    var proto = leggi('PROTOCOL.md') || '';
    var m;

    check('il campo del cerchio base, nella pagina, e un DIAMETRO',
        /id="diamBase"/.test(analisi) && !/id="rBase"/.test(analisi));
    check('...e il manuale chiede il diametro, non il raggio',
        /diametro del cerchio base/i.test(manuale) && !/\braggio base\b/i.test(manuale),
        (/[^.|]*raggio base[^.|]*/i.exec(manuale) || [''])[0].trim().slice(0, 90));

    var ledPagina = [], reLed = /class="status-led" data-tip="<strong>([^<]+)<\/strong>/g;
    while ((m = reLed.exec(alzata)) !== null) ledPagina.push(m[1]);
    var ledManuale = (manuale.match(/LED [A-Z][a-z]+/g) || []).map(function (s) { return s.slice(4); });
    var ledInesistenti = ledManuale.filter(function (n) { return ledPagina.indexOf(n) < 0; });
    check('la pagina ha i suoi LED di stato', ledPagina.length === 4, ledPagina.join(', '));
    check('ogni LED nominato nel manuale esiste con quel nome',
        ledManuale.length > 0 && ledInesistenti.length === 0, ledInesistenti.join(', ') || ledManuale.length + ' citazioni');

    check('il manuale non rimanda a comandi ritirati (selettore "Motore scansione")', !/Motore scansione/i.test(manuale));
    var nCodice = /var NAN_TO_AUTOSTOP\s*=\s*(\d+)/.exec(alzata), nManuale = /(\d+) letture invalide consecutive/.exec(manuale);
    check('le letture invalide che fermano la scansione sono quelle del codice',
        !!nCodice && !!nManuale && nCodice[1] === nManuale[1], (nCodice || [])[1] + ' nel codice, ' + (nManuale || [])[1] + ' nel manuale');

    check('il firmware stampa run= nell ACK che accetta uno SCAN',
        /F\("ACK "\)\);[^\n]*F\(" state=SCANNING run="\)/.test(fw));
    check('...e PROTOCOL lo riporta cosi',
        /ACK \d+ state=SCANNING run=\d+/.test(proto) && !/\(l'ACK NON porta run=\)/.test(proto));

    var mandati = {}, reCtl = /'#ctl:([a-z]+)/g;
    while ((m = reCtl.exec(server)) !== null) mandati[m[1]] = 1;
    var nonDocumentati = Object.keys(mandati).filter(function (k) { return proto.indexOf('#ctl:' + k) < 0; });
    check('ogni messaggio di ruolo che il server manda e documentato in PROTOCOL',
        Object.keys(mandati).length >= 6 && nonDocumentati.length === 0,
        nonDocumentati.join(', ') || Object.keys(mandati).sort().join(', '));
})();

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
