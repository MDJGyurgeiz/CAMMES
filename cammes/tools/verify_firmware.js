// =============================================================
//  VERIFICA FIRMWARE — riproducibilità sorgente → HEX (AUDIT REL-07)
// =============================================================
// Due livelli:
//   (default)   confronta l'HEX committato (cammes/fw/master.ino.hex) con lo
//               SHA256 dichiarato in fw/version.json. Non serve il toolchain:
//               gira in `npm test` e intercetta l'HEX aggiornato senza
//               aggiornare version.json (o viceversa).
//   --compile   in più RICOMPILA master.ino con arduino-cli (core pinnato) e
//               verifica che l'HEX prodotto abbia lo STESSO SHA256. È la prova
//               di riproducibilità: gira nel job CI `firmware` su windows-latest.
//
// Uso:
//   node tools/verify_firmware.js                (solo confronto HEX↔version.json)
//   node tools/verify_firmware.js --compile      (ricompila e confronta)
//     [--cli <path arduino-cli>]  [--fqbn arduino:avr:uno]
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var cp = require('child_process'), os = require('os');

var ROOT = path.join(__dirname, '..');
var vjson = require(path.join(ROOT, 'fw', 'version.json'));
var hexPath = path.join(ROOT, 'fw', 'master.ino.hex');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

console.log('=============================================================');
console.log(' VERIFICA FIRMWARE — riproducibilità sorgente → HEX (REL-07)');
console.log('=============================================================');

// --- Livello 1: HEX committato ↔ version.json ---
check('fw/version.json dichiara hexSha256', typeof vjson.hexSha256 === 'string' && vjson.hexSha256.length === 64,
    vjson.hexSha256);
var committedSha = null;
try {
    committedSha = sha256(fs.readFileSync(hexPath));
} catch (e) {
    check('fw/master.ino.hex leggibile', false, e.message);
}
if (committedSha) {
    check('SHA256 dell\'HEX committato = version.json.hexSha256',
        committedSha === vjson.hexSha256, committedSha);
}

// --- Livello 2 (opzionale): ricompila e confronta ---
if (process.argv.indexOf('--compile') !== -1) {
    var cliIdx = process.argv.indexOf('--cli');
    var cli = cliIdx !== -1 ? process.argv[cliIdx + 1] : 'arduino-cli';
    var fqbnIdx = process.argv.indexOf('--fqbn');
    var fqbn = fqbnIdx !== -1 ? process.argv[fqbnIdx + 1] : (vjson.fqbn || 'arduino:avr:uno');
    var sketch = path.join(ROOT, '..', vjson.sketch || 'master/master.ino');
    var outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cammes-fw-repro-'));
    console.log('  … ricompilo ' + path.basename(sketch) + ' con ' + fqbn + ' (' + cli + ')');
    var r = cp.spawnSync(cli, ['compile', '--fqbn', fqbn, '--output-dir', outDir, sketch],
        { encoding: 'utf8' });
    if (r.status !== 0) {
        check('ricompilazione con arduino-cli', false, (r.stderr || r.error && r.error.message || 'exit ' + r.status).slice(0, 200));
    } else {
        var freshHex = path.join(outDir, path.basename(sketch) + '.hex');
        var freshSha = null;
        try { freshSha = sha256(fs.readFileSync(freshHex)); } catch (e) { /* gestito sotto */ }
        check('HEX ricompilato riproduce lo stesso SHA256 (build deterministica)',
            freshSha === vjson.hexSha256, freshSha || 'HEX non trovato: ' + freshHex);
    }
}

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('  VERDE: HEX e version.json coerenti' +
    (process.argv.indexOf('--compile') !== -1 ? ' e build riproducibile.' : ' (usa --compile per provare la riproducibilità).') + '\n');
