// =============================================================
//  REGRESSIONE VERSIONE UNICA
//  package.json è la fonte di verità (la legge il server per
//  l'update-check); cammes-ui.js la hardcoda per il badge e il
//  toast. Se divergono, l'update-check confronta la versione
//  sbagliata: questo test fa fallire `npm test` in quel caso.
// =============================================================
var fs = require('fs'), path = require('path');

var pkg = require(path.join(__dirname, '..', 'package.json'));
var ui = fs.readFileSync(path.join(__dirname, '..', 'cammes-ui.js'), 'utf8');
var m = ui.match(/CAMMES_VERSION = 'v([\d.]+)'/);

console.log('=============================================================');
console.log(' REGRESSIONE VERSIONE UNICA (package.json vs cammes-ui.js)');
console.log('=============================================================');
if (!m) {
    console.log('  FAIL  CAMMES_VERSION non trovata in cammes-ui.js');
    process.exit(1);
}
if (m[1] !== pkg.version) {
    console.log('  FAIL  cammes-ui.js dichiara v' + m[1] + ' ma package.json dice ' + pkg.version);
    console.log('        Allineale prima di rilasciare (badge/toast vs update-check).');
    process.exit(1);
}
console.log('  PASS  versione unica: v' + pkg.version + '\n');
