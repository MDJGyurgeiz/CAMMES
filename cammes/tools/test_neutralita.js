// =============================================================
//  test_neutralita.js — il banco e' universale: nessun nome di auto o motore
// =============================================================
//  SEGNALATO DALL'OFFICINA (2026-11-14): la Scheda camma PDF, cioe' il
//  documento che si consegna al cliente, stampava nelle note di metodo il nome
//  di un'automobile ("...confrontata sul setup di riferimento (<modello> Ø33,
//  RMS 0.046 mm)...").
//
//  Un banco che misura qualunque albero a camme non puo' nominare un'auto nel
//  referto di un'altra. E non era l'unico punto: cinque fumetti di aiuto della
//  pagina Analisi e un esempio del manuale citavano marche, modelli o sigle
//  motore.
//
//  LA REGOLA, in due cerchi, resa permanente da questo test:
//
//   1. tutto cio' che l'operatore puo' LEGGERE o CONSEGNARE — testo delle
//      pagine, fumetti, notifiche, righe dei PDF, intestazioni di CSV e XLSX,
//      messaggi del server, manuale — non nomina marche, modelli o sigle
//      motore;
//
//   2. dal 2026-11-14, per decisione dell'officina, NEMMENO IL RESTO DEL
//      REPOSITORY: commenti del codice, test, nomi dei file, README, documenti
//      e cronaca. Le camme reali su cui sono state fatte le prove si chiamano
//      RIF-1, RIF-2, RIF-3 (vedi tools/fixtures/README.md): le misure restano
//      ripetibili perche' i file sono gli stessi byte per byte, solo rinominati.
//
//  Cosa resta fuori dal secondo cerchio, e perche':
//    - questo file: per vietare una parola bisogna scriverla;
//    - i file di terzi (librerie, avrdude e la sua configurazione);
//    - i nomi dei file in cammes/prove/: e' l'archivio dell'officina, i nomi li
//      sceglie chi misura (e i documenti li riportano tali e quali).
//  La storia di git fino alla v3.7.0 conserva i nomi: non si riscrive.
//
//  Come si decide cosa e' "visibile":
//    - pagine .html: tutto il markup fuori da <script>, <style> e dai commenti
//      (testo, fumetti data-tip, title, placeholder...), piu' le STRINGHE
//      dentro gli <script>;
//    - moduli .js: solo le STRINGHE (e' da li' che passano notifiche, PDF, CSV);
//      nomi di variabile e commenti non arrivano all'operatore;
//    - manuale .md: tutto.
//
//  Secondo controllo, stessa frase: la nota del PDF cita uno scarto in mm come
//  prova della conversione al bicchiere. Quel numero deve essere quello che la
//  suite MISURA oggi (validate_rif3_piattello.js), non uno rimasto da una
//  formula precedente: "0.046" era del 2026-07-11, calcolato con la
//  compensazione che poi si e' scoperta rovesciata.
//
//  Uso: node tools/test_neutralita.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' NEUTRALITA: nessun nome di auto o motore davanti all operatore');
console.log('=============================================================');

// ---------------------------------------------------------------
//  Cosa si cerca
// ---------------------------------------------------------------
// Solo nomi NON ambigui. Restano fuori di proposito le parole che in italiano
// o in questo progetto vogliono dire altro: "Uno" (Arduino Uno), "Punto",
// "Tipo", "Delta", "Panda", "Lancia" (verbo), "Seat" (sede), "Mini", "Polo",
// "Fire", "Boxer", e i numeri nudi (106, 205, 911: sono anche coordinate).
var MARCHE = ['renault', 'clio', 'volkswagen', 'vw', 'golf', 'peugeot', 'citroen', 'citroën', 'saxo', 'fiat',
    'abarth', 'alfa romeo', 'ferrari', 'maserati', 'lamborghini', 'ducati', 'aprilia', 'moto guzzi', 'bmw',
    'mercedes', 'audi', 'opel', 'porsche', 'skoda', 'ford', 'chevrolet', 'chevy', 'chrysler', 'dodge', 'jeep',
    'mopar', 'pontiac', 'honda', 'vtec', 'civic', 'yamaha', 'suzuki', 'kawasaki', 'toyota', 'nissan', 'mazda',
    'subaru', 'mitsubishi', 'hyundai', 'kia', 'volvo', 'saab', 'lotus', 'cosworth', 'triumph', 'harley', 'ktm',
    'panigale', 'cbr', 'gsxr', 'yzf',
    'gti', 'twin cam', 'twincam', 'mini cooper', '16v', '8v', '20v', 'k20', 'b16', 'b18', 'ej20', 'rb26', '2jz',
    'sr20', 'ls1', 'ls3', 'hemi'];
var RE_MARCHE = new RegExp('(^|[^A-Za-z0-9])(' + MARCHE.join('|') + ')(?![A-Za-z0-9])', 'i');
// sigle che hanno senso solo in maiuscolo e seguite da una cilindrata/numero
var RE_SIGLE = /(^|[^A-Za-z0-9])(KR ?\d|R6(?![A-Za-z0-9])|TDI|TSI|JTD|HDI)/;
// marca abbreviata attaccata al numero del modello, come si scrive nel nome di
// un file ("duc" + cilindrata): e' sfuggita al setaccio fino al 2026-11-21,
// dentro l'esempio del fumetto "Nome file" della pagina Alzata
var RE_ABBREVIATE = /(^|[^A-Za-z0-9])(duc ?\d{3,4})(?![0-9])/i;
function nomeIn(testo) {
    var m = RE_MARCHE.exec(testo);
    if (m) return m[2];
    m = RE_SIGLE.exec(testo) || RE_ABBREVIATE.exec(testo);
    return m ? m[2] : null;
}

// ---------------------------------------------------------------
//  Cosa e' visibile
// ---------------------------------------------------------------
// Stringhe di un sorgente JS, con la riga in cui cominciano. Salta commenti e
// letterali regex (che possono contenere apici e doppie barre).
var PRIMA_DI_REGEX = { '': 1, '(': 1, ',': 1, '=': 1, ':': 1, '[': 1, '!': 1, '&': 1, '|': 1, '?': 1, '{': 1, '}': 1, ';': 1, '+': 1, '-': 1, '*': 1, '%': 1, '<': 1, '>': 1, '~': 1, '^': 1 };
var PAROLE_PRIMA_DI_REGEX = { 'return': 1, 'typeof': 1, 'case': 1, 'in': 1, 'of': 1, 'delete': 1, 'void': 1, 'do': 1, 'else': 1 };
function stringheJs(src, rigaBase) {
    var out = [], i = 0, n = src.length, riga = rigaBase || 1, prev = '', parola = '';
    function avanza(fino) { for (; i < fino && i < n; i++) if (src.charCodeAt(i) === 10) riga++; }
    while (i < n) {
        var c = src.charAt(i), d = src.charAt(i + 1);
        if (c === '/' && d === '/') { var fl = src.indexOf('\n', i); avanza(fl < 0 ? n : fl); continue; }
        if (c === '/' && d === '*') { var fb = src.indexOf('*/', i + 2); avanza(fb < 0 ? n : fb + 2); continue; }
        if (c === '"' || c === "'" || c === '`') {
            var j = i + 1, buf = '', r0 = riga;
            while (j < n && src.charAt(j) !== c) {
                if (src.charAt(j) === '\\') { buf += src.charAt(j + 1); j += 2; continue; }
                if (c !== '`' && src.charCodeAt(j) === 10) break;      // stringa non chiusa: ci si ferma
                buf += src.charAt(j); j++;
            }
            out.push({ riga: r0, testo: buf });
            avanza(j + 1);
            prev = c; parola = '';
            continue;
        }
        if (c === '/' && (PRIMA_DI_REGEX[prev] || PAROLE_PRIMA_DI_REGEX[parola])) {
            var k = i + 1, inClasse = false;
            while (k < n) {
                var ch = src.charAt(k);
                if (ch === '\\') { k += 2; continue; }
                if (ch === '\n') break;
                if (ch === '[') inClasse = true;
                else if (ch === ']') inClasse = false;
                else if (ch === '/' && !inClasse) break;
                k++;
            }
            avanza(k + 1);
            prev = '/'; parola = '';
            continue;
        }
        if (/[A-Za-z0-9_$]/.test(c)) { parola = (/[A-Za-z0-9_$]/.test(prev) ? parola : '') + c; prev = c; }
        else if (!/\s/.test(c)) { prev = c; parola = ''; }
        if (c === '\n') riga++;
        i++;
    }
    return out;
}
// Testo visibile di una pagina HTML: [{riga, testo}]
function visibileHtml(src) {
    var out = [];
    var re = /<script\b[^>]*>([\s\S]*?)<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi;
    var ultimo = 0, m;
    function rigaDi(pos) { return src.slice(0, pos).split('\n').length; }
    function markup(da, a) {
        var pezzo = src.slice(da, a), r = rigaDi(da);
        pezzo.split('\n').forEach(function (t, q) { if (t.trim()) out.push({ riga: r + q, testo: t }); });
    }
    while ((m = re.exec(src)) !== null) {
        markup(ultimo, m.index);
        if (m[1] !== undefined) {
            var inizioCorpo = m.index + m[0].indexOf('>') + 1;
            out = out.concat(stringheJs(m[1], rigaDi(inizioCorpo)));
        }
        ultimo = m.index + m[0].length;
    }
    markup(ultimo, src.length);
    return out;
}

// ---------------------------------------------------------------
//  Il setaccio funziona? (altrimenti un "tutto pulito" non vale niente)
// ---------------------------------------------------------------
console.log('--- il setaccio distingue cio che si vede da cio che non si vede ---');
var provaJs = [
    '// commento: misurato sulla Clio',
    'var vw = window.innerWidth;            /* la Golf non c entra */',
    'var re = /[\'"]ford[\'"]/;',
    'toast("Confrontata sulla Peugeot");',
    "var ok = 'testo neutro // non e un commento';"
].join('\n');
var sJs = stringheJs(provaJs, 1);
check('una stringa con un nome viene vista', sJs.some(function (s) { return nomeIn(s.testo) === 'Peugeot'; }), JSON.stringify(sJs));
check('commenti, identificatori e regex NO', sJs.filter(function (s) { return nomeIn(s.testo); }).length === 1,
    JSON.stringify(sJs.filter(function (s) { return nomeIn(s.testo); })));
check('e riporta la riga giusta', (sJs.filter(function (s) { return nomeIn(s.testo); })[0] || {}).riga === 4);
check('una doppia barra dentro una stringa non la tronca', sJs.some(function (s) { return /non e un commento/.test(s.testo); }));
var provaHtml = '<!-- nota: prova sulla Clio -->\n<span data-tip="es. motore Honda">x</span>\n<script>\n// Yamaha nel commento\nvar t = "scheda Renault";\n</script>\n<p>testo</p>';
var sHtml = visibileHtml(provaHtml).filter(function (s) { return nomeIn(s.testo); });
check('in una pagina: fumetto e stringa si, commenti no',
    sHtml.length === 2 && nomeIn(sHtml[0].testo) === 'Honda' && nomeIn(sHtml[1].testo) === 'Renault', JSON.stringify(sHtml));
check('...con le righe giuste', sHtml.length === 2 && sHtml[0].riga === 2 && sHtml[1].riga === 5, JSON.stringify(sHtml.map(function (s) { return s.riga; })));
check('parole comuni non sono nomi (tipo, delta, lancia la verifica, Arduino Uno)',
    !nomeIn('Tipo follower') && !nomeIn('delta area') && !nomeIn('lancia la verifica') && !nomeIn('Arduino Uno') && !nomeIn('width:100vw'));
check('sigle motore in maiuscolo si', nomeIn('es. KR 1.8') === 'KR 1' && nomeIn('motore 1.9 TDI') === 'TDI' && !nomeIn('coppia kr del modello'));
check('marca abbreviata col numero del modello si, anche dentro il nome di un file',
    nomeIn("Es: 'duc916_a'") === 'duc916' && !nomeIn("Es: 'albero12_asp'") && !nomeIn('conduce 1200 giri'));

// ---------------------------------------------------------------
//  I file che l'operatore ha davanti
// ---------------------------------------------------------------
console.log('');
console.log('--- pagine, moduli e manuale distribuiti ---');
var RADICE = path.join(__dirname, '..');
var FILES = [
    ['home.html', 'html'], ['alzata.html', 'html'], ['grafici.html', 'html'], ['analisi.html', 'html'],
    ['cammes-ui.js', 'js'], ['cammes-scan.js', 'js'], ['cammes_server.js', 'js'], [path.join('lib', 'cammes-math.js'), 'js'],
    [path.join('..', 'MANUALE_OPERATORE.md'), 'md']
];
var totale = 0;
FILES.forEach(function (f) {
    var src = fs.readFileSync(path.join(RADICE, f[0]), 'utf8').replace(/\r\n/g, '\n');
    var pezzi = f[1] === 'html' ? visibileHtml(src)
              : f[1] === 'js' ? stringheJs(src, 1)
              : src.split('\n').map(function (t, q) { return { riga: q + 1, testo: t }; });
    var trovati = [];
    pezzi.forEach(function (s) {
        var nome = nomeIn(s.testo);
        if (!nome) return;
        var pos = s.testo.toLowerCase().indexOf(nome.toLowerCase());
        trovati.push('riga ' + s.riga + ' "' + nome + '": ...' + s.testo.slice(Math.max(0, pos - 40), pos + 40).replace(/\s+/g, ' ') + '...');
    });
    totale += trovati.length;
    check(path.basename(f[0]) + ': nessun nome di auto o motore', trovati.length === 0,
        trovati.length ? trovati.length + ' punti' : pezzi.length + ' testi controllati');
    trovati.slice(0, 8).forEach(function (t) { console.log('          ' + t); });
});

// ---------------------------------------------------------------
//  La prova citata nel PDF e' quella vera, e non nomina nessuno
// ---------------------------------------------------------------
console.log('');
console.log('--- la nota di metodo della Scheda camma ---');
var ANALISI = fs.readFileSync(path.join(RADICE, 'analisi.html'), 'utf8').replace(/\r\n/g, '\n');
var noteMetodo = stringheJs(ANALISI, 1).map(function (s) { return s.testo; })
    .filter(function (t) { return /^# conversione /.test(t); });
check('le note di conversione ci sono (bicchiere e altri follower)', noteMetodo.length >= 2, noteMetodo.length + ' note');
var uscita = '';
try { uscita = String(execFileSync(process.execPath, [path.join(__dirname, 'validate_rif3_piattello.js')], { encoding: 'utf8' })); }
catch (e) { uscita = String((e && e.stdout) || ''); }
var mis = /compensazione ATTUALE\s*:\s*RMS\s+(\d+\.\d+)\s*mm/.exec(uscita);
check('la validazione fisica gira e dichiara il suo scarto', !!mis, mis ? 'RMS ' + mis[1] + ' mm' : 'riga non trovata');
if (mis) {
    var vero = Number(mis[1]).toFixed(3);                       // es. "0.065"
    var veroIt = vero.replace('.', ',');
    var citati = [];
    noteMetodo.forEach(function (t) { (t.match(/\d[.,]\d{3}(?= mm)/g) || []).forEach(function (x) { citati.push(x); }); });
    check('ogni nota cita uno scarto in mm', citati.length >= noteMetodo.length, JSON.stringify(citati));
    check('...ed e quello misurato OGGI dalla suite (' + vero + ' mm), non un numero rimasto da prima',
        citati.length > 0 && citati.every(function (x) { return x.replace(',', '.') === vero; }), JSON.stringify(citati));
    var fumetto = /id="btnCamCard"[^>]*data-tip="([^"]*)"/.exec(ANALISI);
    var numFumetto = fumetto ? (fumetto[1].match(/\d[.,]\d{3}(?= mm)/g) || []) : [];
    check('il fumetto del pulsante dice lo stesso numero', numFumetto.length === 1 && (numFumetto[0] === vero || numFumetto[0] === veroIt),
        JSON.stringify(numFumetto));
}
check('la nota dice COME e stata verificata la conversione, senza dire su quale auto',
    noteMetodo.some(function (t) { return /puntalino/.test(t) && /piattello/.test(t); }) && !noteMetodo.some(nomeIn),
    (noteMetodo[0] || '').slice(0, 120));
check('...e continua a non spacciarla per certificazione',
    noteMetodo.some(function (t) { return /validazione metrologica indipendente ancora necessaria/.test(t); }));

// ---------------------------------------------------------------
//  Secondo cerchio: tutto il repository
// ---------------------------------------------------------------
console.log('');
console.log('--- tutto il repository: codice, commenti, test, documenti, nomi dei file ---');
var REPO = path.join(__dirname, '..', '..');
// Oltre a marche e modelli: codici motore, il nome dell'azienda che ha
// rettificato una delle camme di prova coi suoi codici di profilo, e i VECCHI
// nomi dei file (se tornano, qualcuno ha ripreso una copia di prima).
var RE_TUTTO = new RegExp('(^|[^A-Za-z0-9])(' + MARCHE.concat(['f7p', 'motor rettifica', '257a', '257s']).join('|') + ')(?![A-Za-z0-9])', 'i');
var RE_SIGLE_TUTTO = /(^|[^A-Za-z0-9_])(VW|KR|R6|R19|TDI|TSI|JTD|HDI)(?![A-Za-z0-9])/;
var RE_VECCHI = /validate_clio|validate_vw|validate_106|REPORT_CAMME_VW|VW-kr|kr1_8|clio1_8|clio_test|cliobench|106-ASP|r19_16v/i;
var RE_NUMERO_MODELLO = /(^|[^A-Za-z0-9])(la|della|sulla|alla|dalla|nella|una)\s+106(?![0-9A-Za-z]|[.,][0-9])/i;
function nomeOvunque(testo) {
    var m = RE_TUTTO.exec(testo) || RE_SIGLE_TUTTO.exec(testo) || RE_ABBREVIATE.exec(testo);
    if (m) return m[2];
    m = RE_VECCHI.exec(testo) || RE_NUMERO_MODELLO.exec(testo);
    return m ? m[0].trim() : null;
}
var QUESTO_FILE = 'cammes/tools/test_neutralita.js';
function diTerzi(f) {
    return /(^|\/)node_modules\//.test(f) || /^cammes\/fw\//.test(f) ||
           (/^cammes\/lib\//.test(f) && f !== 'cammes/lib/cammes-math.js') ||
           /(^|\/)(jspdf\.umd\.min|responsivevoice)\.js$/.test(f) || /\.min\.(js|css)$/.test(f);
}
function binario(f) { return /\.(png|jpe?g|gif|ico|svg|woff2?|ttf|otf|hex|exe|apk|msi|zip|pdf|xlsx?|xlsm|docx?)$/i.test(f); }

check('il setaccio del secondo cerchio riconosce anche sigle e nomi vecchi',
    nomeOvunque('motore F7P') === 'F7P' && nomeOvunque('camme VW 1.8') === 'VW' && nomeOvunque('misurato sulla 106 asp.') !== null &&
    nomeOvunque('tools/validate_clio.js') !== null && nomeOvunque('riga 106 del file') === null && nomeOvunque('width:100vw') === null &&
    nomeOvunque('camma RIF-2, scarico') === null);

var tracciati = null;
try {
    tracciati = String(execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
        .split('\0').filter(Boolean);
} catch (e) { tracciati = null; }
if (!tracciati || !tracciati.length) {
    // Fuori da un clone git (per esempio da uno zip dei sorgenti) l'elenco dei
    // file pubblicati non c'e': si dichiara, non si finge di aver controllato.
    console.log('  ----  NON ESEGUITO: git non disponibile, impossibile elencare i file del repository');
} else {
    var nomiFile = tracciati.filter(function (f) {
        return f !== QUESTO_FILE && !diTerzi(f) && !/^cammes\/prove\//.test(f) && nomeOvunque(f.replace(/[\/_.-]/g, ' ')) ;
    });
    // (nei nomi di file i separatori contano come spazi; i vecchi nomi si cercano sul percorso intero)
    var nomiVecchi = tracciati.filter(function (f) { return !/^cammes\/prove\//.test(f) && RE_VECCHI.test(f); });
    nomiVecchi.forEach(function (f) { if (nomiFile.indexOf(f) < 0) nomiFile.push(f); });
    check('nessun NOME DI FILE nel repository porta una marca, un modello o una sigla', nomiFile.length === 0,
        nomiFile.length ? nomiFile.slice(0, 6).join(', ') : tracciati.length + ' file tracciati');

    var conNomi = [], letti = 0;
    tracciati.forEach(function (f) {
        if (f === QUESTO_FILE || diTerzi(f) || binario(f)) return;
        var testo;
        try { testo = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch (e2) { return; }
        letti++;
        var righe = testo.split(/\r?\n/), trovate = [];
        for (var q = 0; q < righe.length; q++) {
            var n = nomeOvunque(righe[q]);
            if (n) trovate.push((q + 1) + ' "' + n + '"');
        }
        if (trovate.length) conNomi.push({ file: f, n: trovate.length, dove: trovate.slice(0, 5).join(', ') });
    });
    var totRighe = conNomi.reduce(function (a, c) { return a + c.n; }, 0);
    check('nessun file di testo del repository nomina un auto, un motore o un azienda terza',
        conNomi.length === 0, conNomi.length ? totRighe + ' righe in ' + conNomi.length + ' file' : letti + ' file letti');
    conNomi.slice(0, 15).forEach(function (c) { console.log('          ' + c.file + ' (' + c.n + '): righe ' + c.dove); });
    totale += totRighe;

    // i file di riferimento: stessi byte di sempre (le impronte stanno nella legenda)
    var legenda = '';
    try { legenda = fs.readFileSync(path.join(__dirname, 'fixtures', 'README.md'), 'utf8'); } catch (e3) {}
    var crypto = require('crypto');
    var scr = fs.readdirSync(path.join(__dirname, 'fixtures')).filter(function (f) { return /\.scr$/.test(f); });
    // L'impronta si calcola sul contenuto coi fine riga LF, cioe' sui byte che il
    // repository conserva: su un checkout pulito git puo' convertire i fine riga
    // (core.autocrlf), e un'impronta presa sui byte del disco cambierebbe da una
    // macchina all'altra senza che la misura sia stata toccata. E' successo: la CI
    // ha rifiutato tre file che sul PC di sviluppo risultavano a posto.
    var cambiati = scr.filter(function (f) {
        var testo = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'latin1').replace(/\r\n/g, '\n');
        var h = crypto.createHash('sha256').update(testo, 'latin1').digest('hex');
        return legenda.indexOf('`' + f + '`') < 0 || legenda.indexOf(h) < 0;
    });
    check('i file di riferimento hanno ancora le impronte dichiarate nella legenda (rinominati, non modificati)',
        scr.length >= 7 && cambiati.length === 0, cambiati.length ? 'diversi o non elencati: ' + cambiati.join(', ') : scr.length + ' file');
}

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI' + (totale ? ' (' + totale + ' righe con nomi)' : '')); process.exit(1); }
console.log('VALIDATO: niente di cio che l operatore legge o consegna nomina un auto o un motore,');
console.log('la prova citata nella Scheda camma e quella che la suite misura oggi, e nel repository');
console.log('non resta un nome ne nei testi ne nei nomi dei file.');
process.exit(0);
