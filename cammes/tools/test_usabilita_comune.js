// =============================================================
//  test_usabilita_comune.js — parti comuni a tutte le pagine
//  (cammes-ui.js e style.css) dopo l'analisi di usabilita' del 2026-11-21
// =============================================================
//  L'operatore lavora in piedi accanto al banco, a un metro da un portatile
//  1366x768, poche volte a settimana. L'analisi ha trovato, nelle parti
//  comuni:
//
//   1. NOTIFICHE: in alto a destra coprivano il pannello dei parametri di
//      Analisi e la barra dei comandi di Alzata; fino a 4 insieme, larghe fino
//      a 420 px, e oltre il tetto se ne andava la piu' vecchia anche se era un
//      errore; titolo a 11 px grigio; durata fissa (2,5-5 s anche per 150
//      caratteri). Ora: in basso a destra (in Analisi a sinistra, dove non ci
//      sono numeri), al massimo 3, larghe al massimo 360 px; la nuova si vede
//      sempre e lascia il posto la meno grave fra le precedenti, mai a favore
//      di una meno grave; un "+N messaggi" apre il registro e se ne va con
//      l'ultima notifica; titolo 15 px grassetto; durata mai sotto il tempo
//      di lettura (4 s + 1 s ogni 15 caratteri, fino a 12 s).
//   2. AIUTO: giro guidato dietro un'icona senza nome, "?" senza nome, manuale
//      raggiungibile solo dalla Home, campanella mai spiegata. Ora nella barra
//      in alto di ogni pagina: Messaggi (col numerino dei non letti, anche
//      arrivati da un'altra pagina), Giro guidato, Guida, Manuale, con la
//      parola accanto all'icona; la barra si compatta a gradini invece di
//      tagliare i pulsanti. Fumetti anche col Tab e col tocco.
//   3. LEGGIBILITA': scritte di servizio a 10-12 px, grigio a 3,3-4,3:1 sul
//      fondo scuro, "?" da 16 px, pulsanti da 28 px, scritta bianca di STOP
//      a 3,6:1, interruttore non raggiungibile col Tab; nel tema chiaro i
//      gradi dal vivo a 1,5:1 e il picco a 3,2:1.
//   4. TESTI COMUNI: benvenuto e giro guidato con parole da programmatore,
//      nomi dei comandi superati, inglese tecnico; il giro diceva che una
//      misura fermata "non si salva" (si salva, segnata incompleta).
//   5. FINESTRE DELLA PAGINA: il fuoco partiva dal pulsante rosso (un Invio
//      e la misura era sostituita), il Tab usciva sulla pagina sotto.
//
//  I controlli girano sul sorgente VIVO (senza commenti) e, per il
//  comportamento, eseguono cammes-ui.js in una macchina virtuale con una
//  pagina finta minima (nessun browser).
//
//  Uso: node tools/test_usabilita_comune.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' PARTI COMUNI: notifiche, aiuto, leggibilita, testi');
console.log('=============================================================');

var CAMMES = path.join(__dirname, '..');
var UI = fs.readFileSync(path.join(CAMMES, 'cammes-ui.js'), 'utf8').replace(/\r\n/g, '\n');
var CSS = fs.readFileSync(path.join(CAMMES, 'style.css'), 'utf8').replace(/\r\n/g, '\n');
var CSS_VIVO = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------
//  Strumenti: regole CSS e contrasto
// ---------------------------------------------------------------
// Tutte le regole (anche dentro @media) come { sel, corpo }.
function regole(css) {
    var out = [], re = /([^{}]+)\{([^{}]*)\}/g, m;
    while ((m = re.exec(css))) out.push({ sel: m[1].trim().replace(/\s+/g, ' '), corpo: m[2] });
    return out;
}
var REGOLE = regole(CSS_VIVO);
function regola(sel) {
    for (var i = 0; i < REGOLE.length; i++) if (REGOLE[i].sel === sel) return REGOLE[i].corpo;
    return null;
}
function prop(corpo, nome) {
    var m = new RegExp('(?:^|;|\\s)' + nome.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+)', 'i').exec(corpo || '');
    return m ? m[1].trim() : null;
}
function lum(hex) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.replace(/(.)/g, '$1$1');
    var v = [0, 2, 4].map(function (i) { return parseInt(c.substr(i, 2), 16) / 255; })
        .map(function (x) { return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrasto(a, b) { var A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); }
function token(blocco, nome) {
    var m = new RegExp(nome.replace(/[-]/g, '\\-') + '\\s*:\\s*(#[0-9a-fA-F]{3,6})').exec(blocco || '');
    return m ? m[1] : null;
}
var BLOCCO_SCURO = (/:root,\s*:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(CSS_VIVO) || [])[1];
var BLOCCO_CHIARO = (/:root\[data-theme="light"\]\s*\{([^}]*)\}/.exec(CSS_VIVO) || [])[1];
var BLOCCO_BASE = (/(?:^|\n):root\s*\{([^}]*)\}/.exec(CSS_VIVO) || [])[1];   // accenti e colori di stato
// Valore di un token come lo vede il browser: nel tema chiaro vale il blocco
// chiaro, poi quello di :root (scuro, sempre attivo), poi la base.
function valoreToken(blocco, nome) {
    var m = new RegExp('(?:^|[;\\s])' + nome.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+);').exec(blocco || '');
    return m ? m[1].trim() : null;
}
function risolvi(v, tema) {
    var blocchi = tema === 'chiaro' ? [BLOCCO_CHIARO, BLOCCO_SCURO, BLOCCO_BASE] : [BLOCCO_SCURO, BLOCCO_BASE];
    v = String(v || '').trim();
    for (var giro = 0; giro < 8; giro++) {
        if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) return v;
        var m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
        if (!m) return null;
        var t = null;
        for (var b = 0; b < blocchi.length && !t; b++) t = valoreToken(blocchi[b], m[1]);
        v = t || (m[2] ? m[2].trim() : '');
    }
    return null;
}

// ---------------------------------------------------------------
console.log('');
console.log('--- leggibilita a un metro (style.css) ---');
var piccoli = [];
REGOLE.forEach(function (r) {
    var re = /font-size\s*:\s*([0-9.]+)px/g, m;
    while ((m = re.exec(r.corpo))) if (Number(m[1]) > 0 && Number(m[1]) < 13) piccoli.push(r.sel + ' ' + m[1] + 'px');
});
check('nessuna scritta sotto i 13 px nel foglio comune', piccoli.length === 0, piccoli.slice(0, 6).join(' | '));

check('i due temi sono leggibili dal foglio', !!BLOCCO_SCURO && !!BLOCCO_CHIARO);
var FONDI_SCURI = ['--bg-base', '--bg-elev-1', '--bg-elev-2', '--bg-elev-3', '--bg-input', '--bg-stripe'];
var FONDI_CHIARI = ['--bg-base', '--bg-elev-1', '--bg-input', '--bg-stripe'];
['--text-muted', '--text-secondary'].forEach(function (t) {
    var cs = token(BLOCCO_SCURO, t), cc = token(BLOCCO_CHIARO, t);
    var minS = Math.min.apply(null, FONDI_SCURI.map(function (f) { return contrasto(cs, token(BLOCCO_SCURO, f)); }));
    var minC = Math.min.apply(null, FONDI_CHIARI.map(function (f) { return contrasto(cc, token(BLOCCO_CHIARO, f)); }));
    check(t + ' almeno 4,5:1 su ogni fondo del tema scuro', minS >= 4.5, cs + ' minimo ' + minS.toFixed(2));
    check(t + ' almeno 4,5:1 su ogni fondo del tema chiaro', minC >= 4.5, cc + ' minimo ' + minC.toFixed(2));
});

var btn = regola('.btn');
var hBtn = parseFloat(prop(btn, 'min-height') || '0');
check('pulsanti .btn alti almeno 36 px (anche i piccoli)', hBtn >= 36, 'min-height ' + hBtn + ' px');
var rosso = (/linear-gradient\([^)]*?(#[0-9a-fA-F]{6})[^)]*?(#[0-9a-fA-F]{6})/.exec(prop(regola('.btn-danger'), 'background') || '') || []);
var cRosso = rosso.length ? Math.min(contrasto('#ffffff', rosso[1]), contrasto('#ffffff', rosso[2])) : 0;
check('scritta bianca dei pulsanti rossi (STOP) almeno 4,5:1', cRosso >= 4.5, rosso.length ? rosso[1] + '/' + rosso[2] + ' ' + cRosso.toFixed(2) : 'gradiente non trovato');

var fuoco = prop(regola(':focus-visible'), 'outline') || '';
check('contorno di fuoco visibile da tastiera (almeno 2 px)', parseFloat(fuoco) >= 2, fuoco);
check('...nel colore leggibile del tema (non il celeste pieno sul bianco)', /var\(--accent-text\)/.test(fuoco), fuoco);
var sw = regola('.switch input');
check('interruttore raggiungibile col Tab (la casella non e display:none)', !!sw && !/display\s*:\s*none/.test(sw));
check('...e il fuoco si vede sul cursore', !!regola('.switch input:focus-visible + .slider'));
var hi = regola('.help-icon');
check('icone "?" piu grandi (almeno 20 px)', parseFloat(prop(hi, 'width')) >= 20 && parseFloat(prop(hi, 'height')) >= 20, prop(hi, 'width'));
check('...con un bersaglio piu largo dell icona', /inset\s*:\s*-\d/.test(regola('.help-icon::after') || ''));
var led = regola('.led');
check('pallini di stato piu grandi (almeno 12 px)', parseFloat(prop(led, 'width')) >= 12, prop(led, 'width'));
var sl = regola('.status-led');
check('nomi delle spie a 13 px, non in maiuscolo spaziato', parseFloat(prop(sl, 'font-size')) >= 13 && !/uppercase/.test(sl || ''));
check('fumetto: testo almeno 14 px', parseFloat(prop(regola('.cammes-tooltip'), 'font-size')) >= 14);

// Le pillole in alto (Messaggi, Giro guidato, Guida, Manuale) al passaggio del
// mouse: fondo celeste pieno di .help-toggle:hover, scritta della pillola.
var fondoHover = prop(regola('.help-toggle:hover'), 'background');
var scrittaHover = prop(regola('.help-toggle.help-pill:hover'), 'color') || prop(regola('.help-toggle.help-pill'), 'color');
['scuro', 'chiaro'].forEach(function (tema) {
    var a = risolvi(scrittaHover, tema), b = risolvi(fondoHover, tema);
    var c = a && b ? contrasto(a, b) : 0;
    check('pillole in alto al passaggio del mouse: scritta leggibile sul celeste (tema ' + tema + ')', c >= 4.5,
        scrittaHover + ' su ' + fondoHover + ' = ' + c.toFixed(2) + ':1');
});
// Letture dal vivo di Alzata (alzata, gradi, picco) su fondo campo, nei due temi
[['.gauge-value', 'alzata dal vivo'], ['.gauge-degrees', 'gradi dal vivo'], ['.max-display', 'picco']].forEach(function (l) {
    var r = regola(l[0]);
    ['scuro', 'chiaro'].forEach(function (tema) {
        var a = risolvi(prop(r, 'color'), tema), b = risolvi(prop(r, 'background'), tema);
        var c = a && b ? contrasto(a, b) : 0;
        check('lettura "' + l[1] + '" almeno 4,5:1 (tema ' + tema + ')', c >= 4.5, (a || prop(r, 'color')) + ' su ' + (b || prop(r, 'background')) + ' = ' + c.toFixed(2) + ':1');
    });
});
check('...e nel tema chiaro senza alone colorato attorno alle cifre',
    /text-shadow\s*:\s*none/.test(regola(':root[data-theme="light"] .gauge-value, :root[data-theme="light"] .gauge-degrees, :root[data-theme="light"] .max-display') || ''));
check('la guida (5 schede) scorre se lo schermo e basso, i pulsanti restano raggiungibili',
    /max-height\s*:/.test(regola('.cammes-wizard') || '') && /overflow-y\s*:\s*auto/.test(regola('.cammes-wizard') || ''));

// ---------------------------------------------------------------
console.log('');
console.log('--- notifiche: dove stanno e come si leggono (style.css) ---');
var pila = regola('.toast-stack');
check('la pila e in basso (bottom) e non piu in alto (top)', /bottom\s*:/.test(pila || '') && !/(^|;|\s)top\s*:/.test(pila || ''), pila ? pila.replace(/\s+/g, ' ').slice(0, 90) : 'regola assente');
check('...a destra', /right\s*:/.test(pila || ''));
var toastR = regola('.toast');
check('larghe al massimo 360 px', parseFloat(prop(toastR, 'max-width')) <= 360, prop(toastR, 'max-width'));
var tit = regola('.toast-body .toast-title');
check('titolo 15 px in grassetto', parseFloat(prop(tit, 'font-size')) >= 15 && Number(prop(tit, 'font-weight')) >= 700, prop(tit, 'font-size') + ' ' + prop(tit, 'font-weight'));
check('...non piu in maiuscolo grigio', !/uppercase/.test(tit || '') && !/text-muted/.test(tit || ''));
check('titolo nel colore della gravita (errore = testo rosso leggibile)', /var\(--danger-text\)/.test(regola('.toast.err .toast-title') || ''));
check('"+N messaggi" cliccabile anche se la pila non lo e', /pointer-events\s*:\s*auto/.test(regola('.toast-altri') || ''));
check('in stampa niente notifiche, fumetti, finestre, versione',
    /@media print[\s\S]*\.toast-stack[\s\S]*#cammes-version-badge\s*\{\s*display\s*:\s*none/.test(CSS_VIVO));
var pilaSx = regola('.toast-stack.pila-sinistra');
check('il lato della pila si sceglie per pagina (variabili del foglio)',
    /right\s*:\s*var\(--toast-destra/.test(pila || '') && /left\s*:\s*var\(--toast-sinistra/.test(pila || '') && /align-items\s*:\s*var\(--toast-allinea/.test(pila || ''));
check('...e la pila "a sinistra" sta davvero a sinistra',
    /left\s*:\s*var\(--toast-sinistra,\s*var\(--sp-5\)\)/.test(pilaSx || '') && /right\s*:\s*var\(--toast-destra,\s*auto\)/.test(pilaSx || ''),
    pilaSx ? pilaSx.replace(/\s+/g, ' ').trim() : 'regola assente');

// ---------------------------------------------------------------
//  Pagina finta minima per eseguire cammes-ui.js
// ---------------------------------------------------------------
var VUOTI = { br: 1, img: 1, input: 1, line: 1, polyline: 1, circle: 1, path: 1, polygon: 1, stop: 1, meta: 1, link: 1, hr: 1, feGaussianBlur: 1, feMergeNode: 1 };
function decodifica(t) {
    return t.replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è')
        .replace(/&ugrave;/g, 'ù').replace(/&ograve;/g, 'ò').replace(/&deg;/g, '°');
}
function Testo(t) { this.nodeType = 3; this.dato = t; this.parentNode = null; }
function El(tag, doc) {
    this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.figli = [];
    this.parentNode = null; this.ascolti = {}; this.style = {}; this.doc = doc;
    var me = this;
    this.classList = {
        add: function () { var c = me.classi(); for (var i = 0; i < arguments.length; i++) if (c.indexOf(arguments[i]) < 0) c.push(arguments[i]); me.attrs['class'] = c.join(' '); },
        remove: function () { var a = Array.prototype.slice.call(arguments); me.attrs['class'] = me.classi().filter(function (x) { return a.indexOf(x) < 0; }).join(' '); },
        contains: function (c) { return me.classi().indexOf(c) >= 0; },
        toggle: function (c) { if (me.classList.contains(c)) { me.classList.remove(c); return false; } me.classList.add(c); return true; }
    };
}
El.prototype.classi = function () { return (this.attrs['class'] || '').split(/\s+/).filter(Boolean); };
Object.defineProperty(El.prototype, 'className', { get: function () { return this.attrs['class'] || ''; }, set: function (v) { this.attrs['class'] = String(v); } });
Object.defineProperty(El.prototype, 'id', { get: function () { return this.attrs.id || ''; }, set: function (v) { this.attrs.id = String(v); } });
['type', 'href', 'target', 'rel', 'title', 'value', 'placeholder'].forEach(function (n) {
    Object.defineProperty(El.prototype, n, { get: function () { return this.attrs[n] == null ? '' : this.attrs[n]; }, set: function (v) { this.attrs[n] = String(v); } });
});
Object.defineProperty(El.prototype, 'children', { get: function () { return this.figli.filter(function (f) { return f.nodeType === 1; }); } });
Object.defineProperty(El.prototype, 'firstChild', { get: function () { return this.figli[0] || null; } });
Object.defineProperty(El.prototype, 'lastChild', { get: function () { return this.figli[this.figli.length - 1] || null; } });
Object.defineProperty(El.prototype, 'textContent', {
    get: function () { return this.figli.map(function (f) { return f.nodeType === 3 ? f.dato : f.textContent; }).join(''); },
    set: function (v) { this.figli.forEach(function (f) { f.parentNode = null; }); this.figli = []; this.appendChild(new Testo(String(v))); }
});
Object.defineProperty(El.prototype, 'innerHTML', {
    get: function () { return this.__html || ''; },
    set: function (v) { this.figli.forEach(function (f) { f.parentNode = null; }); this.figli = []; this.__html = String(v); analizza(String(v), this, this.doc); }
});
Object.defineProperty(El.prototype, 'scrollWidth', { get: function () { return this.__larghezza ? this.__larghezza(this) : 0; } });
Object.defineProperty(El.prototype, 'clientWidth', { get: function () { return this.__disponibile || 0; } });
Object.defineProperty(El.prototype, 'offsetParent', { get: function () { return this.nascostoInPagina() ? null : (this.parentNode || null); } });
El.prototype.nascostoInPagina = function () { for (var e = this; e; e = e.parentNode) if (e.__nascosto) return true; return false; };
El.prototype.getClientRects = function () { return this.nascostoInPagina() ? [] : [{}]; };
El.prototype.getBoundingClientRect = function () { return this.__rect || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
Object.defineProperty(El.prototype, 'parentElement', { get: function () { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; } });
El.prototype.setAttribute = function (n, v) { this.attrs[n] = String(v); };
El.prototype.getAttribute = function (n) { return this.attrs[n] == null ? null : this.attrs[n]; };
El.prototype.hasAttribute = function (n) { return this.attrs[n] != null; };
El.prototype.removeAttribute = function (n) { delete this.attrs[n]; };
El.prototype.appendChild = function (c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this; this.figli.push(c); return c;
};
El.prototype.insertBefore = function (c, rif) {
    if (!rif) return this.appendChild(c);
    if (c.parentNode) c.parentNode.removeChild(c);
    var i = this.figli.indexOf(rif);
    c.parentNode = this; this.figli.splice(i < 0 ? this.figli.length : i, 0, c); return c;
};
El.prototype.removeChild = function (c) { var i = this.figli.indexOf(c); if (i >= 0) this.figli.splice(i, 1); c.parentNode = null; return c; };
El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
El.prototype.contains = function (n) { for (var e = n; e; e = e.parentNode) if (e === this) return true; return false; };
El.prototype.addEventListener = function (t, f) { (this.ascolti[t] = this.ascolti[t] || []).push(f); };
El.prototype.removeEventListener = function (t, f) { var a = this.ascolti[t] || []; var i = a.indexOf(f); if (i >= 0) a.splice(i, 1); };
El.prototype.scrollIntoView = function () {};
// il fuoco: elemento attivo del documento ed evento focusin che risale
El.prototype.focus = function () { if (this.doc) this.doc.activeElement = this; scatena(this, 'focusin'); };
El.prototype.click = function () { scatena(this, 'click'); };
El.prototype.discendenti = function () {
    var out = [];
    (function giro(e) { e.figli.forEach(function (f) { if (f.nodeType === 1) { out.push(f); giro(f); } }); })(this);
    return out;
};
El.prototype.querySelectorAll = function (s) { var me = this; return this.discendenti().filter(function (e) { return combacia(e, s, me); }); };
El.prototype.querySelector = function (s) { return this.querySelectorAll(s)[0] || null; };
El.prototype.closest = function (s) { for (var e = this; e && e.nodeType === 1; e = e.parentNode) if (combacia(e, s, null)) return e; return null; };

// Selettori: elenchi con virgola, discendenti con spazio, tag, #id, .classe, [attr], [attr="v"], [attr^="v"]
function semplice(e, s) {
    var m = /^([a-zA-Z][\w-]*)?((?:[#.][\w-]+|\[[^\]]+\])*)$/.exec(s);
    if (!m) throw new Error('selettore non gestito: ' + s);
    if (m[1] && e.tagName !== m[1].toUpperCase()) return false;
    var parti = m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) || [];
    return parti.every(function (p) {
        if (p[0] === '#') return e.attrs.id === p.slice(1);
        if (p[0] === '.') return e.classi().indexOf(p.slice(1)) >= 0;
        var a = /^\[([\w-]+)(?:(\^?=)"([^"]*)")?\]$/.exec(p);
        if (!a) throw new Error('attributo non gestito: ' + p);
        var v = e.attrs[a[1]];
        if (v == null) return false;
        if (!a[2]) return true;
        return a[2] === '=' ? v === a[3] : v.indexOf(a[3]) === 0;
    });
}
function combacia(e, sel, radice) {
    return sel.split(',').some(function (alt) {
        var catena = alt.trim().split(/\s+/);
        if (!semplice(e, catena[catena.length - 1])) return false;
        var cur = e.parentNode;
        for (var i = catena.length - 2; i >= 0; i--) {
            while (cur && cur.nodeType === 1 && cur !== radice && !semplice(cur, catena[i])) cur = cur.parentNode;
            if (!cur || cur.nodeType !== 1 || cur === radice) return false;
            cur = cur.parentNode;
        }
        return true;
    });
}
// HTML minimo: tag, attributi tra virgolette (anche con < e > dentro), testo.
function analizza(html, radice, doc) {
    var re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>|([^<]+)/g;
    var pila = [radice], m;
    while ((m = re.exec(html))) {
        var cima = pila[pila.length - 1];
        if (m[0].slice(0, 4) === '<!--') continue;
        if (m[1]) { for (var k = pila.length - 1; k > 0; k--) if (pila[k].tagName === m[1].toUpperCase()) { pila.length = k; break; } continue; }
        if (m[2]) {
            var e = new El(m[2], doc);
            var ra = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g, a;
            while ((a = ra.exec(m[3] || ''))) e.attrs[a[1]] = decodifica(a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : '');
            cima.appendChild(e);
            if (!m[4] && !VUOTI[m[2]] && !VUOTI[m[2].toLowerCase()]) pila.push(e);
            continue;
        }
        if (m[5]) cima.appendChild(new Testo(decodifica(m[5])));
    }
}
function scatena(el, tipo, extra) {
    var ev = { type: tipo, target: el, key: extra && extra.key, relatedTarget: null, defaultPrevented: false,
        preventDefault: function () { this.defaultPrevented = true; }, stopPropagation: function () {} };
    for (var e = el; e; e = e.parentNode) (e.ascolti[tipo] || []).slice().forEach(function (f) { f.call(e, ev); });
    return ev;
}

function nuovaPagina(titolo, corpo, opz) {
    opz = opz || {};
    var doc = {
        readyState: 'complete', title: titolo, ascolti: {},
        addEventListener: function (t, f) { (this.ascolti[t] = this.ascolti[t] || []).push(f); },
        removeEventListener: function (t, f) { var a = this.ascolti[t] || []; var i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
    };
    doc.documentElement = new El('html', doc);
    doc.head = new El('head', doc); doc.body = new El('body', doc);
    doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
    // gli eventi che risalgono oltre <html> arrivano al documento
    doc.documentElement.ascolti = new Proxy({}, { get: function (t, k) { return doc.ascolti[k]; } });
    doc.createElement = function (t) { return new El(t, doc); };
    doc.getElementById = function (id) { return doc.documentElement.querySelector('#' + id); };
    doc.querySelector = function (s) { return doc.documentElement.querySelector(s); };
    doc.querySelectorAll = function (s) { return doc.documentElement.querySelectorAll(s); };
    doc.body.innerHTML = corpo;
    doc.activeElement = doc.body;
    if (opz.prepara) opz.prepara(doc);
    var timer = [], raf = [];
    // memorie del browser, eventualmente gia' scritte da un'altra pagina
    var memoria = function (pre) {
        var m = {};
        Object.keys(pre || {}).forEach(function (k) { m[k] = String(pre[k]); });
        return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } };
    };
    var win = {
        document: doc, console: console, localStorage: memoria(opz.locale), sessionStorage: memoria(opz.sessione),
        fetch: opz.fetch,
        setTimeout: function (f, ms) { timer.push({ f: f, ms: ms, vivo: true }); return timer.length; },
        clearTimeout: function (id) { if (timer[id - 1]) timer[id - 1].vivo = false; },
        requestAnimationFrame: function (f) { raf.push(f); return raf.length; },
        cancelAnimationFrame: function () {},
        getComputedStyle: function (el) { return { position: (el && el.__pos) || 'static', getPropertyValue: function () { return ''; } }; },
        CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
        Promise: Promise, Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON, RegExp: RegExp, Date: Date,
        isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt,
        innerWidth: 1366, innerHeight: 768, scrollX: 0, scrollY: 0,
        ascolti: {},
        addEventListener: function (t, f) { (this.ascolti[t] = this.ascolti[t] || []).push(f); },
        removeEventListener: function () {}
    };
    win.window = win;
    vm.createContext(win);
    vm.runInContext(UI, win, { filename: 'cammes-ui.js' });
    return { win: win, doc: doc, timer: timer, raf: raf };
}
// Fa scattare i timer programmati fino a "fino" ms (anche quelli che nascono
// mentre girano: la notifica che svanisce e poi si stacca).
function eseguiTimer(p, fino) {
    for (var k = 0; k < p.timer.length; k++) {
        var t = p.timer[k];
        if (t.vivo && !t.fatto && (fino == null || t.ms <= fino)) { t.fatto = true; t.f(); }
    }
}
// Un tasto premuto: arriva agli ascoltatori del documento (come in fase di cattura).
function premi(p, tasto, maiuscolo) {
    var ev = { key: tasto, shiftKey: !!maiuscolo, target: p.doc.activeElement || p.doc.body, defaultPrevented: false,
        preventDefault: function () { this.defaultPrevented = true; }, stopPropagation: function () {} };
    (p.doc.ascolti.keydown || []).slice().forEach(function (f) { f(ev); });
    return ev;
}
// Lascia finire le promesse in corso (finestre della pagina, fetch finti).
function attendi() { return new Promise(function (r) { setImmediate(r); }); }
var GIA_VISTO = { 'cammes-onboarded-v1': '1' };   // niente benvenuto automatico

var TESTA = '<div class="header"><img src="images/logo.jpg" alt="CAMMES"><h1>CAMMES</h1>' +
    '<div class="nav-links"><a href="home.html">Home</a><a href="alzata.html">Alzata</a></div>' +
    '<div class="header-spacer"></div>' +
    '<div class="status-leds"><span class="status-led" data-tip="<strong>Comparatore</strong>verde: misure valide"><span id="ledSensor" class="led"></span>Comparatore</span></div>' +
    '<button id="help-toggle" class="help-toggle" type="button" aria-label="Guida rapida" title="Apri la guida rapida">?</button>' +
    '<button id="theme-toggle" class="theme-toggle" type="button"></button></div>';

// ---------------------------------------------------------------
console.log('');
console.log('--- le funzioni comuni esportate ci sono ancora ---');
var P = nuovaPagina('CAMMES - Alzata', TESTA +
    '<select id="scanMode"></select><button class="btn" onclick="start();">START</button>' +
    '<div id="esitoMisura">esito</div><input id="nome"><button id="msBtn">Zero virtuale</button>' +
    '<button id="cf">Ruota</button><button id="freeBtn">Sblocca</button><button id="scanAdvBtn">Avanzate</button>' +
    '<span class="help-icon" data-tip="<strong>Angolo lobo</strong>Centro del lobo">?</span>',
    { prepara: function (doc) { doc.getElementById('esitoMisura').__nascosto = true; }, locale: GIA_VISTO });
var W = P.win;
['cammesToast', 'cammesEscape', 'cammesMsgLog', 'cammesDurata', 'cammesScanProgress', 'cammesIntestazionePdf',
 'cammesEta', 'cammesGauge', 'cammesTooltip', 'cammesWizard', 'cammesValidate', 'cammesNum', 'cammesDialog',
 'cammesConferma', 'cammesChiedi', 'cammesTour', 'cammesCamAnim', 'cammesGetCssVar'].forEach(function (n) {
    check('window.' + n, typeof W[n] === 'function' || (W[n] && typeof W[n] === 'object'));
});
check('window.CAMMES_VERSION', /^v\d+\.\d+\.\d+$/.test(W.CAMMES_VERSION || ''), W.CAMMES_VERSION);
check('cammesNum: virgola decimale, niente separatore delle migliaia, n.d.',
    W.cammesNum(1250.5, 1) === '1250,5' && W.cammesNum(-0.001, 2) === '0,00' && W.cammesNum('x', 2) === 'n.d.');
check('nessuna finestra del browser (alert/confirm/prompt) nel modulo comune',
    !/(^|[^.\w])(alert|confirm|prompt)\s*\(/.test(UI.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));

// ---------------------------------------------------------------
console.log('');
console.log('--- barra in alto: Messaggi, Giro guidato, Guida, Manuale ---');
var gruppo = P.doc.getElementById('headerAiuti');
check('il gruppo #headerAiuti sta nella barra in alto', !!gruppo && !!gruppo.parentNode && gruppo.parentNode.classList.contains('header'));
var ordine = gruppo ? gruppo.children.map(function (c) { return c.id; }) : [];
check('ordine: Messaggi, Giro guidato, Guida, Manuale', ordine.join(',') === 'msglog-toggle,tour-toggle,help-toggle,manuale-link', ordine.join(','));
function scritta(id) { var e = P.doc.getElementById(id); var t = e && e.querySelector('.aiuto-txt'); return t ? t.textContent : ''; }
check('ogni pulsante ha la parola accanto all icona',
    scritta('msglog-toggle') === 'Messaggi' && scritta('tour-toggle') === 'Giro guidato' &&
    scritta('help-toggle') === 'Guida' && scritta('manuale-link') === 'Manuale',
    [scritta('msglog-toggle'), scritta('tour-toggle'), scritta('help-toggle'), scritta('manuale-link')].join('|'));
var man = P.doc.getElementById('manuale-link');
check('Manuale apre /manuale in una nuova scheda', !!man && man.tagName === 'A' && man.getAttribute('href') === '/manuale' && man.getAttribute('target') === '_blank');
var msgBtn = P.doc.getElementById('msglog-toggle');
var tipMsg = msgBtn ? (msgBtn.getAttribute('data-tip') || '') : '';
check('il fumetto di Messaggi spiega che ci sono anche quelle gia sparite', /anche quelle gi&agrave; sparite/.test(tipMsg), tipMsg.slice(0, 60));
check('Guida: il "?" ha il suo nome e non piu il doppio fumetto del browser',
    !P.doc.getElementById('help-toggle').hasAttribute('title') && /Guida/.test(P.doc.getElementById('help-toggle').getAttribute('aria-label') || ''));
var lunghi = ['msglog-toggle', 'tour-toggle', 'help-toggle', 'manuale-link'].filter(function (id) {
    var t = (P.doc.getElementById(id).getAttribute('data-tip') || '').replace(/<[^>]*>/g, '').replace(/&[#a-z0-9]+;/gi, 'x');
    return t.length > 300;
});
check('fumetti dei quattro pulsanti entro 300 caratteri', lunghi.length === 0, lunghi.join(','));

// La barra non taglia i pulsanti: si compatta a gradini (cumulativi), prima
// cio' che non si legge, per ultime le parole.
var testa = P.doc.querySelector('.header');
testa.__disponibile = 1266;
testa.__larghezza = function (h) {
    var w = 1452;                                  // stima Alzata a 1366 px, tutto visibile
    if (h.classList.contains('barra-l1')) w -= 150; // via la scritta CAMMES
    if (h.classList.contains('barra-l2')) w -= 85;  // link delle pagine piu stretti
    if (h.classList.contains('barra-l3')) w -= 80;  // via le icone dalle pillole
    if (h.classList.contains('barra-l4')) w -= 180; // pillole a sola icona
    if (h.classList.contains('barra-l5')) w -= 200; // via i nomi delle spie
    return w;                                       // barra-l6: scorre, la larghezza resta
};
var liv = W.cammesBarraAlta.adatta();
check('barra stretta: si ferma al primo gradino che ci sta (link piu stretti, pillole con icona e parola)',
    liv === 2 && testa.classList.contains('barra-l2') && !testa.classList.contains('barra-l3'), 'gradino ' + liv);
testa.__disponibile = 1100;
liv = W.cammesBarraAlta.adatta();
check('piu stretta: pillole a sola icona, ma i nomi delle spie restano', liv === 4 && !testa.classList.contains('barra-l5'), 'gradino ' + liv);
testa.__disponibile = 720;
liv = W.cammesBarraAlta.adatta();
check('tablet: la barra scorre di lato invece di tagliare tema, Guida e Manuale', liv === 6 && testa.classList.contains('barra-l6'), 'gradino ' + liv);
check('...lo fa il foglio (scorrimento orizzontale, altezza invariata)',
    /overflow-x\s*:\s*auto/.test(regola('.header.barra-l6') || '') && /overflow-y\s*:\s*hidden/.test(regola('.header.barra-l6') || ''));
check('i gradini del foglio sono in quest ordine: link, icone, parole delle pillole, nomi delle spie',
    !!regola('.header.barra-l2 .nav-links a') && !!regola('.header.barra-l3 .help-pill .aiuto-ico') &&
    !!regola('.header.barra-l4 .help-pill .aiuto-txt') && !!regola('.header.barra-l5 .status-led'));
testa.__disponibile = 1800;
check('barra larga: nessun gradino', W.cammesBarraAlta.adatta() === 0 && !testa.classList.contains('barra-l1'));
check('l altezza delle pillole e quella dei vecchi cerchi (34 px)', parseFloat(prop(regola('.help-toggle.help-pill'), 'height')) === 34);

// Il numerino di Messaggi quando si apre una pagina: i non letti arrivati da
// un'altra pagina (AUDIT v3.4.3 P2-06) devono vedersi subito.
var REGISTRO = [
    { id: 1, kind: 'info', title: 'Misura avviata', body: 'x', ora: '10:00:00' },
    { id: 2, kind: 'err', title: 'Misura INCOMPLETA', body: 'y', ora: '10:01:00' },
    { id: 3, kind: 'warn', title: 'Avviso', body: 'z', ora: '10:02:00' }
];
var B = nuovaPagina('CAMMES - Home', TESTA, { locale: GIA_VISTO,
    sessione: { 'cammes-msglog-v1': JSON.stringify(REGISTRO), 'cammes-msglog-v1-read': '0' } });
var bB = B.doc.getElementById('msglog-badge');
check('aprendo una pagina il numerino dice subito i non letti arrivati da un altra pagina',
    !!bB && bB.textContent === '3' && bB.style.display === 'flex', bB ? bB.textContent + ' ' + (bB.style.display || '(nascosto)') : 'assente');
check('...rosso, perche fra questi c e un errore', !!bB && bB.classList.contains('grave-err'), bB ? bB.className : '');
var B2 = nuovaPagina('CAMMES - Analisi', TESTA, { locale: GIA_VISTO,
    sessione: { 'cammes-msglog-v1': JSON.stringify(REGISTRO), 'cammes-msglog-v1-read': '2' } });
var bB2 = B2.doc.getElementById('msglog-badge');
check('...giallo se resta da leggere solo un avviso', !!bB2 && bB2.textContent === '1' && bB2.classList.contains('grave-warn'), bB2 ? bB2.textContent + ' ' + bB2.className : '');

// ---------------------------------------------------------------
console.log('');
console.log('--- notifiche: durata, tetto, chi lascia il posto, "+N" ---');
var T = W.cammesToast;
check('durata non indicata: almeno 4 s', T.durata(null, 'Salvato', '') === 5000 || T.durata(null, 'Salvato', '') === 4000, String(T.durata(null, 'Salvato', '')));
var lungo = new Array(301).join('a');
check('durata non indicata: cresce col testo, al massimo 12 s', T.durata(null, 'Titolo', lungo) === 12000 && T.durata(null, '', new Array(61).join('b')) === 8000,
    T.durata(null, 'Titolo', lungo) + ' / ' + T.durata(null, '', new Array(61).join('b')));
check('le etichette HTML non contano come testo da leggere', T.durata(null, '', '<b>ok</b>') === T.durata(null, '', 'ok'));
// Le pagine indicano quasi sempre la durata: 2,5 s per 60 caratteri non bastano a leggerli.
check('una durata indicata non scende sotto il tempo di lettura (2,5 s per 60 caratteri -> 8 s)',
    T.durata(2500, '', new Array(61).join('c')) === 8000, String(T.durata(2500, '', new Array(61).join('c'))));
check('...una durata indicata piu lunga resta quella', T.durata(20000, 'x', lungo) === 20000 && T.durata(9000, 'Salvato', '') === 9000);
check('duration:0 resta "finche non la chiudi"', T.durata(0, 'x', lungo) === 0);
check('tetto di notifiche a vista: 3', T.massimo === 3);
// [gravita' in ordine di arrivo, l'ultima e' la nuova] -> indice che esce (-1 nessuna)
check('chi lascia il posto: la meno grave fra le precedenti, a pari gravita la piu vecchia (mai la nuova)',
    T.daTogliere([3, 0, 1, 0], 3) === 1 && T.daTogliere([2, 2, 2, 3], 3) === 0 && T.daTogliere([1, 2, 1, 1], 3) === 0,
    [T.daTogliere([3, 0, 1, 0], 3), T.daTogliere([2, 2, 2, 3], 3), T.daTogliere([1, 2, 1, 1], 3)].join(','));
check('...una conferma non scalza un errore o un avviso: si aggiunge come quarta',
    T.daTogliere([3, 3, 3, 0], 3) === -1 && T.daTogliere([3, 3, 2, 0], 3) === -1);
check('...ma non oltre la quarta', T.daTogliere([3, 3, 3, 1, 0], 3) === 3 && T.daTogliere([3, 3, 3, 0, 0], 3) === 3);
check('...e sotto il tetto non esce nessuna', T.daTogliere([0, 1, 2], 3) === -1);

function pilaOra() {
    var s = P.doc.getElementById('toast-stack');
    return s ? s.children.filter(function (c) { return c.classList.contains('toast'); }) : [];
}
function altri() { var b = P.doc.getElementById('toast-altri'); return b ? b.textContent : ''; }
var primaTimer = P.timer.length;
T({ kind: 'info', title: 'Uno', body: 'primo' });
var nuovi = P.timer.slice(primaTimer).map(function (t) { return t.ms; });
check('una notifica senza durata parte col tempo di lettura (4-12 s)', nuovi.length === 1 && nuovi[0] >= 4000 && nuovi[0] <= 12000, nuovi.join(','));
primaTimer = P.timer.length;
T({ kind: 'warn', title: 'Persistente', body: 'resta', duration: 0 });
check('duration:0 non programma la chiusura', P.timer.length === primaTimer);
T({ kind: 'info', title: 'Tre', body: 'terzo' });
T({ kind: 'info', title: 'Quattro', body: 'quarto' });
function titoliOra() { return pilaOra().map(function (t) { return t.querySelector('.toast-title').textContent; }); }
var titoli = titoliOra();
check('a vista restano 3 notifiche', titoli.length === 3, titoli.join(','));
check('l avviso resta, se ne va l informazione piu vecchia', titoli.join(',') === 'Persistente,Tre,Quattro', titoli.join(','));
check('"+N messaggi" dice quante non sono a vista', altri() === '+1 messaggio', altri());
check('il pulsante "+N" sta in cima alla pila', P.doc.getElementById('toast-stack').firstChild === P.doc.getElementById('toast-altri'));
T({ kind: 'success', title: 'Cinque', body: 'quinto' });
titoli = titoliOra();
check('la conferma nuova si vede sempre, senza scalzare avviso e informazioni (quarta, per il suo tempo)',
    titoli.join(',') === 'Persistente,Tre,Quattro,Cinque', titoli.join(','));
['E1', 'E2', 'E3'].forEach(function (t) { T({ kind: 'err', title: t, body: 'errore' }); });
titoli = titoliOra();
check('gli errori nuovi prendono il posto delle notifiche meno gravi', titoli.join(',') === 'E1,E2,E3', titoli.join(','));
check('...e "+N" le conta tutte', altri() === '+5 messaggi', altri());
T({ kind: 'success', title: 'Salvato', body: 'ok' });
titoli = titoliOra();
check('tre errori a vista: la conferma nuova si vede lo stesso e nessun errore se ne va',
    titoli.join(',') === 'E1,E2,E3,Salvato', titoli.join(','));
var badge = P.doc.getElementById('msglog-badge');
check('il numerino della campanella e rosso se fra i non letti c e un errore', badge.classList.contains('grave-err') && badge.style.display === 'flex', badge.className);
check('tutto e nel registro, anche cio che non e mai stato a vista',
    W.cammesMsgLog.entries().map(function (m) { return m.title; }).join(',') === 'Uno,Persistente,Tre,Quattro,Cinque,E1,E2,E3,Salvato');
P.doc.getElementById('toast-altri').click();
var pannello = P.doc.getElementById('msglog-panel');
check('"+N messaggi" apre il registro', !!pannello && pannello.classList.contains('visible'));
check('...e sparisce, coi non letti azzerati', !P.doc.getElementById('toast-altri') && badge.style.display === 'none');
check('il registro spiega che cosa contiene', /anche quelle gi&agrave; sparite/.test(pannello.innerHTML));
var primaDellaX = pilaOra().length;
var chiudi = pilaOra()[0].querySelector('.toast-close');
chiudi.click();
check('la X chiude la notifica', pilaOra().length === primaDellaX - 1, primaDellaX + ' -> ' + pilaOra().length);
// Una barra appiccicata al fondo sotto la pila (le misure spuntate in Home):
// la pila sale sopra di essa. Si guarda sotto la pila vera (qui a destra).
var pilaEl = P.doc.getElementById('toast-stack');
pilaEl.__rect = { top: 600, bottom: 740, left: 990, right: 1346, width: 356, height: 140 };
var barraFondo = P.doc.createElement('div');
barraFondo.__pos = 'sticky';
barraFondo.__rect = { top: 690, bottom: 756, left: 980, right: 1342, width: 362, height: 66 };
var dentroBarra = P.doc.createElement('button');
barraFondo.appendChild(dentroBarra);
P.doc.body.appendChild(barraFondo);
P.doc.elementsFromPoint = function () { return [dentroBarra, barraFondo, P.doc.body, P.doc.documentElement]; };
T({ kind: 'info', title: 'Sopra la barra', body: 'x', duration: 3000 });
check('con una barra appiccicata in basso la pila sale sopra di essa', pilaEl.style.bottom === (768 - 690 + 10) + 'px', pilaEl.style.bottom || '(posizione del foglio)');
pilaEl.__pos = 'fixed';
P.doc.elementsFromPoint = function () { return [pilaOra()[0].querySelector('.toast-close'), P.doc.body]; };
T({ kind: 'info', title: 'Senza barra', body: 'y', duration: 3000 });
check('...e torna giu senza barra (la pila non misura se stessa)', pilaEl.style.bottom === '', pilaEl.style.bottom);
check('col registro aperto, una notifica tolta dalla pila non accende "+N" (si legge gia li)',
    pilaOra().length === 3 && !P.doc.getElementById('toast-altri'), pilaOra().length + ' a vista, ' + (altri() || 'nessun +N'));
// col registro chiuso, un solo avviso: numerino giallo
pannello.classList.remove('visible');
T({ kind: 'warn', title: 'Avviso', body: 'attenzione' });
check('numerino giallo se il piu grave non letto e un avviso', badge.classList.contains('grave-warn') && !badge.classList.contains('grave-err'), badge.className);
T({ kind: 'success', title: 'Fatto', body: 'ok' });
check('...e resta giallo dopo una conferma', badge.classList.contains('grave-warn'), badge.className);
check('"+N" c e finche ci sono notifiche a vista', !!P.doc.getElementById('toast-altri'), altri() || 'nessun +N');
eseguiTimer(P);   // passa il tempo: le notifiche a tempo svaniscono e si staccano
check('...e se ne va con l ultima notifica (non resta sui valori della pagina)',
    pilaOra().length === 0 && !P.doc.getElementById('toast-altri'), pilaOra().length + ' a vista, ' + (altri() || 'nessun +N'));
check('...il conto dei non letti resta sul numerino di Messaggi', badge.style.display === 'flex' && badge.textContent === '2', badge.textContent);

// In Analisi la pila sta in basso a SINISTRA: a destra ci sono il pannello dei
// parametri e la tabella dei risultati coi numeri a filo destro.
var A = nuovaPagina('CAMMES - Analisi', TESTA, { locale: GIA_VISTO });
A.win.cammesToast({ kind: 'info', title: 'Analisi eseguita', body: 'x', duration: 3000 });
var pilaA = A.doc.getElementById('toast-stack');
check('in Analisi la pila sta a sinistra', pilaA.classList.contains('pila-sinistra'), pilaA.className);
check('...nelle altre pagine resta a destra', !pilaEl.classList.contains('pila-sinistra'), pilaEl.className);
pilaA.__rect = { top: 600, bottom: 740, left: 20, right: 380, width: 360, height: 140 };
var barraAnalizza = A.doc.createElement('div');
barraAnalizza.__pos = 'sticky';
barraAnalizza.__rect = { top: 690, bottom: 756, left: 990, right: 1346, width: 356, height: 66 };
A.doc.body.appendChild(barraAnalizza);
A.doc.elementsFromPoint = function (x) { return x > 900 ? [barraAnalizza, A.doc.body] : [A.doc.body]; };
A.win.cammesToast({ kind: 'info', title: 'Due', body: 'y', duration: 3000 });
check('la barra di Analizza, a destra, non sposta la pila di sinistra (si guarda sotto la pila vera)', pilaA.style.bottom === '', pilaA.style.bottom);
A.doc.elementsFromPoint = function () { return [barraAnalizza, A.doc.body]; };   // schermo stretto: barra larga quanto la pagina
A.win.cammesToast({ kind: 'info', title: 'Tre', body: 'z', duration: 3000 });
check('...una barra che le sta sotto invece si', pilaA.style.bottom === (768 - 690 + 10) + 'px', pilaA.style.bottom || '(posizione del foglio)');

// ---------------------------------------------------------------
console.log('');
console.log('--- fumetti: anche col Tab e col tocco ---');
var icona = P.doc.querySelector('.help-icon');
check('le icone "?" si raggiungono col Tab', icona.getAttribute('tabindex') === '0' && icona.getAttribute('role') === 'button');
check('...e dicono a che cosa servono', icona.getAttribute('aria-label') === 'Spiegazione: Angolo lobo', icona.getAttribute('aria-label'));
var spia = P.doc.querySelector('.status-led');
check('anche le spie di stato (legenda dei colori)', spia.getAttribute('tabindex') === '0');
var ev = scatena(icona, 'click');
var tt = P.doc.getElementById('cammes-tooltip');
check('un clic (o un tocco) sul "?" apre il fumetto', !!tt && tt.classList.contains('visible') && /Angolo lobo/.test(tt.innerHTML));
check('...senza attivare altro sotto', ev.defaultPrevented === true);
check('...e, aperto col clic, accetta il clic su un collegamento ("Altro nel manuale")',
    tt.classList.contains('fissato') && /pointer-events\s*:\s*auto/.test(regola('.cammes-tooltip.fissato') || ''));
scatena(P.doc.body, 'mouseover');
check('...e resta aperto spostando il mouse', tt.classList.contains('visible'));
P.doc.ascolti.keydown.forEach(function (f) { f({ key: 'Escape', target: P.doc.body, preventDefault: function () {} }); });
check('Esc lo chiude', !tt.classList.contains('visible') && !tt.classList.contains('fissato'));
scatena(spia, 'mouseover');
check('passando il mouse si apre come prima', tt.classList.contains('visible') && /Comparatore/.test(tt.innerHTML));
scatena(P.doc.body, 'mouseover');
check('...e si chiude uscendo', !tt.classList.contains('visible'));

// ---------------------------------------------------------------
console.log('');
console.log('--- giro guidato: salta cio che non c e, usa le alternative ---');
var passi = W.cammesTour.passi('alzata');
var nomi = passi.map(function (p) { return p.title; });
check('salta il passo il cui elemento e nascosto (#esitoMisura)', nomi.indexOf('Esito della misura') < 0, nomi.join(' | '));
check('senza #barraComandi usa START', nomi.indexOf('START e STOP') >= 0 && passi[nomi.indexOf('START e STOP')].el.getAttribute('onclick') === 'start();');
check('si apre sulle spie e chiude sulla barra di aiuto',
    nomi[0] === 'Prima di misurare' && nomi[nomi.length - 1] === 'Aiuto e messaggi', nomi[0] + ' ... ' + nomi[nomi.length - 1]);
var vuota = nuovaPagina('CAMMES - Confronto', '<p>niente</p>');
check('pagina senza comandi noti e senza barra: nessun passo (nessun errore)', vuota.win.cammesTour.passi('grafici').length === 0);

// Gli id nuovi decisi per le pagine sono nel giro, nell'ordine del lavoro.
function blocco(re) { var m = re.exec(UI); return m ? m[0] : ''; }
var TOUR_SRC = blocco(/var TOUR_STEPS = \{[\s\S]*?\n {2}\};/);
var PASSI = TOUR_SRC ? vm.runInNewContext('(' + TOUR_SRC.replace(/^var TOUR_STEPS = /, '').replace(/;$/, '') + ')') : null;
check('i passi del giro si leggono dal sorgente', !!PASSI && !!PASSI.home && !!PASSI.alzata && !!PASSI.grafici && !!PASSI.analisi);
function selDi(pagina) {
    return (PASSI && PASSI[pagina] || []).map(function (s) { return [].concat(s.sel).join(' '); }).join(' ');
}
[['home', '#statoBanco'], ['home', '#nuovaMisuraBtn'], ['home', '#barraSelezione'], ['alzata', '#barraComandi'],
 ['alzata', '#esitoMisura'], ['analisi', '#passiAnalisi'], ['analisi', '#sceltaArchivioIntake'],
 ['grafici', '#stampaCollaudoBtn'], ['grafici', '#verdictBox']].forEach(function (c) {
    check('giro di ' + c[0] + ': passo su ' + c[1], selDi(c[0]).indexOf(c[1]) >= 0);
});
check('il giro della Home non spende piu un passo sul concerto', selDi('home').indexOf('#concert-toggle') < 0);
var ordineAnalisi = PASSI ? PASSI.analisi.map(function (s) { return [].concat(s.sel)[0]; }) : [];
check('giro di Analisi: prima le misure e Analizza, Funzioni per ultimo',
    ordineAnalisi.indexOf('#analyzeBtn') > ordineAnalisi.indexOf('#intakeClearance') && ordineAnalisi[ordineAnalisi.length - 1] === '#btnModules',
    ordineAnalisi.join(' '));

// ---------------------------------------------------------------
console.log('');
console.log('--- testi comuni: glossario e nomi dei comandi ---');
var WIZ_SRC = blocco(/const WIZARD_STEPS = \[[\s\S]*?\n {2}\];/);
var SCHEDE = WIZ_SRC ? vm.runInNewContext('(' + WIZ_SRC.replace(/^const WIZARD_STEPS = /, '').replace(/;$/, '') + ')') : [];
check('benvenuto in 5 schede', SCHEDE.length === 5, String(SCHEDE.length));
var AIUTI_SRC = blocco(/var PASSO_AIUTI = \{[^\n]*\};/);
function solo(t) { return decodifica(String(t || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' '); }
var testiGiro = [];
if (PASSI) Object.keys(PASSI).forEach(function (k) { PASSI[k].forEach(function (s) { testiGiro.push(solo(s.title + '. ' + s.body)); }); });
if (AIUTI_SRC) { var pa = vm.runInNewContext('(' + AIUTI_SRC.replace(/^var PASSO_AIUTI = /, '').replace(/;$/, '') + ')'); testiGiro.push(solo(pa.title + '. ' + pa.body)); }
var testiSchede = SCHEDE.map(function (s) { return solo(s.title + '. ' + s.body); });
var TUTTO = testiGiro.concat(testiSchede).join('\n');
check('...e il giro e la barra di aiuto si leggono', testiGiro.length >= 30, String(testiGiro.length));
['Ricomincia', 'Azzera angolo qui', 'Salva misura', 'Memorizza posizione', 'Verso di scansione', 'Esito della misura'].forEach(function (n) {
    check('nome deciso usato: "' + n + '" (schede e giro)',
        testiSchede.join('\n').indexOf(n) >= 0 && testiGiro.join('\n').indexOf(n) >= 0);
});
// parole da abbandonare (glossario) e residui da programmatore
var VIETATE = [
    [/\blash\b/i, 'lash'], [/float/i, 'float'], [/overlap/i, 'overlap'], [/\b(BTC|ABC|BBC|ATC|BTDC|ABDC|BBDC|ATDC)\b/, 'sigle di fasatura'],
    [/follower/i, 'follower'], [/finger/i, 'finger'], [/rocker/i, 'rocker'], [/\brun\b/i, 'run'], [/max\s+(lift|alzata)/i, 'max lift'],
    [/test di salute/i, 'test di salute'], [/\bfile\b/i, 'file (si dice misura)'], [/\bRESET\b|Reset zero|Salva pos\b/, 'nomi vecchi dei comandi'],
    [/\bSALVA\b/, 'SALVA'], [/\bTour\b/i, 'tour'], [/localStorage|NaN|\bheader\b|stepper|hardware|software/i, 'parole da programmatore'],
    [/Precisione/, 'modalita tolta'], [/\bsmoothing\b|\bbaseline\b|compliance|\bDOF\b/i, 'inglese tecnico']
];
VIETATE.forEach(function (v) {
    var m = v[0].exec(TUTTO);
    check('schede e giro senza "' + v[1] + '"', !m, m ? '...' + TUTTO.slice(Math.max(0, m.index - 30), m.index + 30) + '...' : '');
});
check('la separazione dei lobi porta la sigla LSA tra parentesi', /separazione dei lobi \(LSA\)/.test(TUTTO));
check('le modalita: Veloce basta quasi sempre (come manuale e fumetto)', /Veloce[^.]*basta quasi sempre/.test(testiSchede.join(' ')));
check('il primo passo del lavoro c e: cerchio base e comparatore azzerato',
    /cerchio base[^.]*azzera il comparatore/.test(testiSchede.join(' ')) && /cerchio base[^.]*azzera il comparatore/.test(testiGiro.join(' ')));
check('esempio di nome neutro', /albero12_asp/.test(TUTTO));
// I testi d'aiuto dicono cio' che il programma fa: una misura fermata con STOP
// si puo' salvare (dopo una domanda) ed e' segnata INCOMPLETA.
check('il giro non dice che una misura fermata "non si salva"', !/non si salva/i.test(TUTTO));
check('...dice che resta incompleta e va ripetuta (come il fumetto di STOP)', /STOP[^.]*incompleta e va ripetuta/.test(testiGiro.join(' ')));
var passoSistema = PASSI ? PASSI.home.filter(function (s) { return [].concat(s.sel).indexOf('#updatesCard') >= 0; })[0] : null;
check('Home: il passo sul riquadro di sistema ha il suo nome ("Sistema e manutenzione")', !!passoSistema && passoSistema.title === 'Sistema e manutenzione', passoSistema ? passoSistema.title : 'assente');
check('...e nomina il Cestino, che sta li dentro chiuso (un passo suo verrebbe sempre saltato)',
    !!passoSistema && /Cestino/.test(passoSistema.body) && selDi('home').indexOf('#trashBtn') < 0);
check('benvenuto: Messaggi spiegato (rilegge le notifiche sparite, rosso = errore, giallo = avviso)',
    /rilegge le notifiche già sparite/.test(testiSchede[0] || '') && /rosso = un errore/.test(testiSchede[0] || '') && /giallo = un avviso/.test(testiSchede[0] || ''));
check('ultima scheda: il resto e nel Manuale', /Manuale/.test(testiSchede[SCHEDE.length - 1] || ''));
check('il backup ha il nome del pulsante della Home ("Backup completo")',
    /Backup completo/.test(testiSchede.join(' ')) && !/Backup ZIP/.test(testiSchede.join(' ')));

// ---------------------------------------------------------------
console.log('');
console.log('--- numeri con la virgola nelle letture comuni ---');
var cont = P.doc.createElement('div');
var g = W.cammesGauge.create(cont, { min: 0, max: 25, unit: 'mm', decimals: 2, majorTicks: 10 });
var etichette = cont.querySelectorAll('.gauge-svg-label').map(function (e) { return e.textContent; });
check('tacche del quadrante con la virgola', etichette.indexOf('2,5') >= 0 && etichette.join('').indexOf('.') < 0, etichette.slice(0, 4).join(' '));
g.setValue(9.614);
check('valore del quadrante con la virgola', cont.querySelector('.gauge-svg-value').textContent === '9,61', cont.querySelector('.gauge-svg-value').textContent);
var scritte = [];
W.cammesCamAnim.draw({
    clearRect: function () {}, fillRect: function () {}, beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    stroke: function () {}, closePath: function () {}, fill: function () {}, arc: function () {}, strokeRect: function () {},
    save: function () {}, restore: function () {}, translate: function () {},
    fillText: function (t) { scritte.push(t); }
}, { w: 240, h: 260, camAngleDeg: 30, camLift: null, followerLift: 1.5, rBase: 14, maxLift: 10, rocker: 1.5 });
check('disegno del meccanismo: alzata e valvola con la virgola, "camma" in italiano',
    scritte.indexOf('alzata 1,50 mm') >= 0 && scritte.indexOf('valvola 2,25 mm') >= 0 && /^camma /.test(scritte[0] || ''), scritte.join(' | '));

// ---------------------------------------------------------------
//  Finestre della pagina e avviso di aggiornamento (asincroni)
// ---------------------------------------------------------------
async function finestre() {
    console.log('');
    console.log('--- finestre della pagina: fuoco prudente, Tab dentro, fuoco che torna ---');
    var D = nuovaPagina('CAMMES - Home', TESTA +
        '<button id="svuota" data-tip="<strong>Svuota archivio</strong>Tutte le misure nel cestino.">Svuota archivio</button>',
        { locale: GIA_VISTO });
    var svuota = D.doc.getElementById('svuota');
    // l'operatore passa sul comando (fumetto) e lo preme: il clic chiude il fumetto
    scatena(svuota, 'mouseover');
    svuota.focus();
    scatena(svuota, 'click');
    var risposta = 'in attesa';
    D.win.cammesConferma('Svuotare l archivio?', 'Tutte le misure vanno nel cestino.', 'Sposta nel cestino', true)
        .then(function (v) { risposta = v; });
    eseguiTimer(D, 30);
    var bot = D.doc.querySelectorAll('.cammes-dialog-actions button');
    var att = D.doc.activeElement;
    check('azione pericolosa (pulsante rosso): il fuoco parte da Annulla, un Invio non sposta niente',
        bot.length === 2 && att === bot[0] && bot[0].textContent === 'Annulla', att && att.textContent);
    premi(D, 'Tab');
    check('Tab passa al pulsante dopo...', D.doc.activeElement === bot[1]);
    premi(D, 'Tab');
    check('...e non esce dalla finestra: torna al primo', D.doc.activeElement === bot[0]);
    premi(D, 'Tab', true);
    check('...anche all indietro (Maiusc+Tab)', D.doc.activeElement === bot[1]);
    premi(D, 'Escape');
    await attendi();
    check('Esc risponde Annulla', risposta === false, String(risposta));
    var ttD = D.doc.getElementById('cammes-tooltip');
    check('chiusa la finestra, il fuoco torna sul comando che l aveva aperta', D.doc.activeElement === svuota, D.doc.activeElement && D.doc.activeElement.id);
    check('...senza riaprirne il fumetto sopra la pagina', !!ttD && !ttD.classList.contains('visible'));

    // Sostituire una misura: Annulla, Sostituisci (rosso), Salva con un nome nuovo
    var scelta = 'in attesa';
    D.win.cammesDialog({ titolo: 'Questa misura esiste gia', tipo: 'warn', testo: 'x',
        pulsanti: [{ testo: 'Annulla', valore: 'annulla', stile: 'secondary', annulla: true },
                   { testo: 'Sostituisci', valore: 'sostituisci', stile: 'danger' },
                   { testo: 'Salva con un nome nuovo', valore: 'nuovo', stile: 'primary' }] })
        .then(function (r) { scelta = r.scelta; });
    eseguiTimer(D, 30);
    check('un pulsante rosso fra tre: il fuoco va su Annulla anche se la finestra non e "danger"',
        D.doc.activeElement && D.doc.activeElement.textContent === 'Annulla', D.doc.activeElement && D.doc.activeElement.textContent);
    premi(D, 'Tab', true);
    check('Maiusc+Tab dal primo va all ultimo', D.doc.activeElement && D.doc.activeElement.textContent === 'Salva con un nome nuovo');
    D.doc.activeElement.click();
    await attendi();
    check('il pulsante premuto risponde col suo valore', scelta === 'nuovo', String(scelta));

    D.win.cammesDialog({ titolo: 'Esiste gia', tipo: 'danger', testo: 'x',
        pulsanti: [{ testo: 'Cambia nome', valore: false, stile: 'secondary', annulla: true },
                   { testo: 'Sostituisci', valore: true, stile: 'danger' }] });
    eseguiTimer(D, 30);
    check('sostituire una misura: il fuoco parte da "Cambia nome"', D.doc.activeElement && D.doc.activeElement.textContent === 'Cambia nome',
        D.doc.activeElement && D.doc.activeElement.textContent);
    premi(D, 'Escape');
    await attendi();

    D.win.cammesDialog({ titolo: 'Avviare la verifica?', tipo: 'warn', testo: 'x', fuoco: 'no',
        pulsanti: [{ testo: 'Non ora', valore: 'no', stile: 'secondary', annulla: true },
                   { testo: 'Avvia', valore: 'si', stile: 'primary' }] });
    eseguiTimer(D, 30);
    check('chi chiama puo scegliere il pulsante di partenza (fuoco: valore)', D.doc.activeElement && D.doc.activeElement.textContent === 'Non ora',
        D.doc.activeElement && D.doc.activeElement.textContent);
    premi(D, 'Escape');
    await attendi();

    D.win.cammesConferma('Svuotare il confronto?', 'I file non vengono toccati.', 'Svuota tutto', false);
    eseguiTimer(D, 30);
    check('conferma senza pericolo: il fuoco resta sul pulsante dell azione', D.doc.activeElement && D.doc.activeElement.textContent === 'Svuota tutto',
        D.doc.activeElement && D.doc.activeElement.textContent);
    premi(D, 'Escape');
    await attendi();

    var testo = 'in attesa';
    D.win.cammesChiedi('Memorizza posizione', 'Nome della posizione', 'pms1', 'Memorizza').then(function (v) { testo = v; });
    eseguiTimer(D, 30);
    var campo = D.doc.querySelector('.cammes-dialog input');
    check('domanda con un campo: il fuoco va nel campo', !!campo && D.doc.activeElement === campo);
    premi(D, 'Enter');
    await attendi();
    check('...e Invio nel campo conferma', testo === 'pms1', String(testo));
}

async function avvisoAggiornamento() {
    console.log('');
    console.log('--- avviso di aggiornamento: che cosa fare, senza sigle ---');
    var chiesto = [];
    var U = nuovaPagina('CAMMES - Alzata', TESTA, { locale: GIA_VISTO, fetch: function (url) {
        chiesto.push(url);
        return Promise.resolve({ json: function () {
            return Promise.resolve({ updateAvailable: true, latest: '9.9.9', downloadUrl: '/scarica/cammes.exe',
                downloadName: 'cammes.exe', downloadSha256: 'ab'.repeat(32) });
        } });
    } });
    await attendi();
    var avviso = U.win.cammesMsgLog.entries().filter(function (m) { return /Aggiornamento disponibile/.test(m.title); })[0];
    check('l avviso arriva', chiesto.indexOf('/api/update-check') >= 0 && !!avviso);
    var corpo = avviso ? solo(avviso.body) : '';
    check('...senza impronta ne comandi davanti all operatore (SHA-256, certutil)', !!avviso && !/SHA-?256|certutil|[0-9a-f]{64}/i.test(avviso.body), corpo.slice(0, 80));
    check('...dice come si aggiorna: chiudi, sostituisci nella stessa cartella, riavvia',
        /chiudi la finestra di cammes\.exe/.test(corpo) && /stessa cartella/.test(corpo) && /riavvialo/.test(corpo), corpo.slice(0, 120));
    check('...e dove trovare l impronta per l assistenza (Home, Sistema e manutenzione)', /Home, Sistema e manutenzione/.test(corpo));
}

finestre().then(avvisoAggiornamento).then(function () {
    console.log('');
    console.log(fails === 0 ? 'OK: parti comuni a posto.' : 'FALLITI: ' + fails);
    process.exit(fails === 0 ? 0 : 1);
}, function (e) {
    console.log('  FAIL  errore nei controlli asincroni: ' + (e && e.stack || e));
    process.exit(1);
});
