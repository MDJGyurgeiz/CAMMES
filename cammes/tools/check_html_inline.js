// =============================================================
//  check_html_inline.js — parsing degli script inline delle pagine
// =============================================================
//  AUDIT v3.4.3 P2-10 / P2-12: quasi tutta la logica dell'applicazione vive
//  dentro i tag <script> degli HTML, e il lint gira solo sui file .js. Un
//  errore di sintassi lì non viene visto da nessun gate: si scopre aprendo la
//  pagina, cioe' in officina.
//
//  Questo controllo estrae ogni blocco <script> senza src e prova a
//  compilarlo. Non e' un lint (niente regole di stile): e' la garanzia minima
//  che le pagine si carichino. Il lint vero degli inline e' P2-12.
//
//  Uso: node tools/check_html_inline.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');

var CARTELLA = path.join(__dirname, '..');
var pagine = fs.readdirSync(CARTELLA).filter(function (f) { return /\.html$/i.test(f); }).sort();
var errori = 0, blocchi = 0, righe = 0;

console.log('=============================================================');
console.log(' Sintassi degli script inline delle pagine');
console.log('=============================================================');

pagine.forEach(function (pagina) {
    var html = fs.readFileSync(path.join(CARTELLA, pagina), 'utf8');
    var re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
    var m, n = 0, r = 0, err = [];
    while ((m = re.exec(html))) {
        // salta i blocchi che non sono JavaScript (es. type="application/json")
        var attr = m[1] || '';
        var tipo = /type\s*=\s*["']([^"']+)["']/i.exec(attr);
        if (tipo && !/javascript|module|^\s*$/i.test(tipo[1])) continue;
        n++;
        var codice = m[2];
        r += codice.split('\n').length;
        // riga di inizio del blocco, per un messaggio utile
        var rigaInizio = html.substring(0, m.index).split('\n').length;
        try {
            new Function(codice);
        } catch (e) {
            err.push('    riga ~' + rigaInizio + ': ' + e.message);
        }
    }
    blocchi += n; righe += r; errori += err.length;
    console.log('  ' + (err.length ? 'ERRORE' : '  ok  ') + '  ' + pagina.padEnd(16) +
                n + ' blocco/i, ' + r + ' righe');
    err.forEach(function (e) { console.log(e); });
});

console.log('');
console.log('Totale: ' + pagine.length + ' pagine, ' + blocchi + ' blocchi inline, ' + righe + ' righe.');
if (errori) { console.log('RISULTATO: ' + errori + ' blocchi non compilano\n'); process.exit(1); }
console.log('VALIDATO: tutti gli script inline compilano.\n');
