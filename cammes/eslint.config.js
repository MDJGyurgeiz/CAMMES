// =============================================================
//  ESLint flat config — CAMMES
// =============================================================
// Copre i file JS standalone del progetto:
//   - cammes_server.js   (Node: HTTP + WebSocket + seriale)
//   - cammes-ui.js       (browser: toast, wizard, tema)
//   - tools/*.js         (Node: test di regressione)
// Gli script inline dentro gli HTML NON sono coperti (richiederebbero
// eslint-plugin-html e genererebbero molto rumore sul codice ES5 esistente).
//
// Globals definiti inline per non dipendere dal pacchetto `globals`.
// Esegui:  npx eslint --config cammes/eslint.config.js <files>
//   oppure: npm run lint   (da dentro cammes/)

var NODE_GLOBALS = {
    require: 'readonly', module: 'writable', exports: 'writable',
    process: 'readonly', __dirname: 'readonly', __filename: 'readonly',
    Buffer: 'readonly', console: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly',
    setInterval: 'readonly', clearInterval: 'readonly',
    setImmediate: 'readonly', global: 'readonly'
};

var BROWSER_GLOBALS = {
    window: 'readonly', document: 'readonly', console: 'readonly',
    navigator: 'readonly', location: 'writable', history: 'readonly',
    localStorage: 'readonly', sessionStorage: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly',
    setInterval: 'readonly', clearInterval: 'readonly',
    requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
    WebSocket: 'readonly', fetch: 'readonly', XMLHttpRequest: 'readonly',
    Image: 'readonly', Blob: 'readonly', URL: 'readonly', FileReader: 'readonly',
    CustomEvent: 'readonly', Event: 'readonly', alert: 'readonly', confirm: 'readonly',
    HTMLElement: 'readonly', getComputedStyle: 'readonly',
    // librerie caricate via <script> e usate da cammes-ui.js
    Chart: 'readonly'
};

// Regole curate: privilegiano i bug reali (no-undef, no-dupe-keys, valid-typeof)
// senza inondare di stile su codice ES5 (var, try/catch vuoti ammessi).
var RULES = {
    'no-undef': 'error',
    'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    'no-eval': 'error',         // i tools usano eval() in modo intenzionale (con disable)
    'no-redeclare': 'warn',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-unreachable': 'warn',
    'no-cond-assign': 'error',
    'no-constant-condition': ['warn', { checkLoops: false }],
    'valid-typeof': 'error',
    'no-fallthrough': 'error',
    'use-isnan': 'error',
    'no-empty': 'off',          // molti try/catch {} intenzionali
    'no-extra-semi': 'warn',
    'no-func-assign': 'error',
    'no-self-assign': 'warn'
};

module.exports = [
    { ignores: ['node_modules/**', 'lib/**', '**/*.min.js'] },
    {
        files: ['**/cammes_server.js', '**/tools/**/*.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: NODE_GLOBALS },
        rules: RULES
    },
    {
        files: ['**/cammes-ui.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: BROWSER_GLOBALS },
        rules: RULES
    }
];
