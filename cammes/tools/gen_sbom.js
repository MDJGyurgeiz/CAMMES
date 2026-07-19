// =============================================================
//  GENERATORE SBOM — CycloneDX 1.5 (AUDIT REL-10)
// =============================================================
// Produce cammes/SBOM.json (CycloneDX) e cammes/SBOM.md (riassunto leggibile)
// dall'albero REALE di package-lock.json. Distingue lo scope:
//   required = dipendenza runtime, FINISCE nell'exe (ws, serialport, …)
//   optional = solo dev/build, NON spedita (eslint, pkg, babel, …)
// Include anche le librerie browser VENDORIZZATE (non npm) e il firmware.
// Idempotente: rilanciare dopo ogni cambio di dipendenze.
//   node tools/gen_sbom.js
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..');
var pkg = require(path.join(ROOT, 'package.json'));
var lock = require(path.join(ROOT, 'package-lock.json'));

function sha256File(p) {
    try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
    catch (e) { return null; }
}

// --- Componenti dalle dipendenze npm ---
var pkgs = lock.packages || {};
var seen = {};
var components = [];
Object.keys(pkgs).forEach(function (k) {
    if (!k) return;                              // root
    var p = pkgs[k];
    var name = k.replace(/.*node_modules\//, '');
    var key = name + '@' + (p.version || '?');
    if (seen[key]) return;                       // stessa versione in più punti dell'albero
    seen[key] = true;
    var scope = p.dev ? 'optional' : 'required';
    var comp = {
        type: 'library',
        name: name,
        version: p.version || 'unknown',
        scope: scope,                            // required = spedita nell'exe; optional = dev/build
        purl: 'pkg:npm/' + name.replace('@', '%40') + '@' + (p.version || '')
    };
    if (p.license) comp.licenses = [{ license: { id: String(p.license) } }];
    if (p.resolved) comp.externalReferences = [{ type: 'distribution', url: p.resolved }];
    if (p.integrity) comp.hashes = [{ alg: 'SHA-512-base64', content: p.integrity.replace(/^sha512-/, '') }];
    components.push(comp);
});

// --- Librerie browser VENDORIZZATE (non da npm: file serviti alla UI) ---
[
    { name: 'jspdf', file: 'jspdf.umd.min.js', license: 'MIT', note: 'PDF lato client; advisory GHSA-w532-jxjh-hjhj da valutare (REL-01)' },
    { name: 'chart.js', file: 'lib/chart.umd.min.js', license: 'MIT', note: 'grafici alzata/analisi' },
    { name: 'responsivevoice', file: 'responsivevoice.js', license: 'proprietary-free-tier', note: 'sintesi vocale opzionale' }
].forEach(function (v) {
    var abs = path.join(ROOT, v.file);
    var h = sha256File(abs);
    var comp = {
        type: 'library',
        name: v.name,
        version: 'vendored',
        scope: 'required',
        'bom-ref': 'vendored/' + v.name,
        licenses: [{ license: { name: v.license } }],
        properties: [{ name: 'cammes:vendored-file', value: v.file }, { name: 'cammes:note', value: v.note }]
    };
    if (h) comp.hashes = [{ alg: 'SHA-256', content: h }];
    components.push(comp);
});

// --- Firmware Arduino (deliverable HW) ---
var vjson = null;
try { vjson = require(path.join(ROOT, 'fw', 'version.json')); } catch (e) { /* ignora */ }
if (vjson) {
    components.push({
        type: 'firmware',
        name: 'cammes-firmware',
        version: vjson.firmware,
        scope: 'required',
        'bom-ref': 'firmware/cammes',
        hashes: [{ alg: 'SHA-256', content: vjson.hexSha256 }],
        properties: [
            { name: 'cammes:fqbn', value: vjson.fqbn || 'arduino:avr:uno' },
            { name: 'cammes:sketch', value: vjson.sketch || 'master/master.ino' },
            { name: 'cammes:reproducible', value: 'REL-07: build deterministica verificata da .github/workflows/firmware.yml' }
        ]
    });
}

// --- Documento SBOM ---
// Nota: niente timestamp automatico (build riproducibile / niente Date.now qui):
// la data la porta builtAt del firmware o il commit git.
var bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
        component: {
            type: 'application',
            name: pkg.name,
            version: pkg.version,
            description: pkg.description || '',
            licenses: [{ license: { name: pkg.license || 'UNLICENSED' } }]
        },
        properties: [
            { name: 'cammes:generatedBy', value: 'tools/gen_sbom.js' },
            { name: 'cammes:source', value: 'package-lock.json' },
            { name: 'cammes:builtAt', value: (vjson && vjson.builtAt) || 'n/d' }
        ]
    },
    components: components
};

fs.writeFileSync(path.join(ROOT, 'SBOM.json'), JSON.stringify(bom, null, 2) + '\n');

// --- Riassunto leggibile ---
var runtime = components.filter(function (c) { return c.scope === 'required'; });
var dev = components.filter(function (c) { return c.scope === 'optional'; });
var lines = [];
lines.push('# CAMMES — Software Bill of Materials (SBOM)');
lines.push('');
lines.push('Generato da `tools/gen_sbom.js` a partire da `package-lock.json` (albero');
lines.push('reale). Formato macchina: [`SBOM.json`](SBOM.json) (CycloneDX 1.5).');
lines.push('Rigenerare dopo ogni cambio di dipendenze: `node tools/gen_sbom.js`.');
lines.push('');
lines.push('- Applicazione: **' + pkg.name + ' v' + pkg.version + '** (' + (pkg.license || 'UNLICENSED') + ')');
lines.push('- Componenti totali: **' + components.length + '** — runtime (spediti nell\'exe): **' +
    runtime.length + '**, dev/build (non spediti): **' + dev.length + '**');
lines.push('');
lines.push('## Runtime — finiscono nell\'eseguibile');
lines.push('');
lines.push('| Componente | Versione | Licenza |');
lines.push('|---|---|---|');
runtime.sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (c) {
    var lic = c.licenses && c.licenses[0] ? (c.licenses[0].license.id || c.licenses[0].license.name || '?') : '?';
    lines.push('| ' + c.name + ' | ' + c.version + ' | ' + lic + ' |');
});
lines.push('');
lines.push('## Dev / build — NON spediti (eslint, pkg, babel, catena serialport di test…)');
lines.push('');
lines.push('Elenco completo con versioni e hash di integrità in `SBOM.json` (scope `optional`).');
lines.push('Totale: ' + dev.length + ' pacchetti.');
lines.push('');
lines.push('## Note supply-chain');
lines.push('');
lines.push('- `jspdf` (vendorizzato): advisory **GHSA-w532-jxjh-hjhj** da valutare (REL-01).');
lines.push('- `pkg@5.8.1` (dev, build exe): archiviato, advisory GHSA-22r3-9w55-cj54 (REL-02); migrazione a SEA aperta.');
lines.push('- Firmware Arduino: build **riproducibile** verificata in CI (`firmware.yml`, REL-07).');
lines.push('- Note di licenza discorsive: `THIRD_PARTY_NOTICES.md`.');
lines.push('');
fs.writeFileSync(path.join(ROOT, 'SBOM.md'), lines.join('\n'));

console.log('SBOM generato: SBOM.json (' + components.length + ' componenti: ' +
    runtime.length + ' runtime + ' + dev.length + ' dev) + SBOM.md');
