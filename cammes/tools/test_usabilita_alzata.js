// =============================================================
//  test_usabilita_alzata.js — la pagina Alzata al banco: comandi sempre a
//  portata, esito che resta scritto, nessuna misura persa con un clic
// =============================================================
//  Dall'analisi di usabilita' del 2026-11-21 (ANALISI_USABILITA_2026-11-21.md,
//  proposte 1, 2, 9, 10, 12 e glossario), per chi lavora in piedi a un metro
//  dallo schermo e apre il programma poche volte a settimana:
//
//   1. START era 1,35 schermate piu' in basso e durante la misura STOP non si
//      vedeva: ora START, STOP, avanzamento, esito e "Salva misura" stanno in
//      una barra (#barraComandi) che resta sotto la barra in alto.
//   2. L'esito della misura passava da notifiche di pochi secondi: ora resta
//      nella riga #esitoMisura fino al prossimo START (verde, gialla, rossa),
//      e dice se la misura e' salvata.
//   3. Nomi che si confondevano: RESET -> "Ricomincia", "Reset zero" ->
//      "Azzera angolo qui" (con domanda se ci sono posizioni memorizzate),
//      "SALVA" -> "Salva misura", "Salva pos" -> "Memorizza posizione"; il
//      verso di scansione accanto alla Modalita', scritto a parole, e rlb()
//      che segue lo STATO della casella invece di contare i clic.
//   4. Una misura non salvata si perdeva con un clic: ora START, Zero
//      virtuale, verifica banco, Ricomincia e l'uscita dalla pagina chiedono
//      prima (e senza niente da chiedere partono subito, come prima).
//   5. Le finestre "localhost dice..." diventano finestre della pagina.
//   6. Numeri con la virgola in display, campo del picco, notifiche ed esito;
//      "giri" e non "run"; fumetti entro i 300 caratteri.
//   7. Dalla revisione del 2026-11-22 (riprodotti sulla pagina intera, sez. 8):
//      STOP nella pausa fra due giri diceva "nessuna misura in corso" e la
//      riga restava "in corso"; un START rifiutato dal server lasciava la riga
//      su "in corso"; i punti non stabilizzati (che il banco conta DOPO
//      l'ultimo punto) non arrivavano alla riga; Invio nel nome a misura in
//      corso chiedeva di salvare un file parziale; uno Zero virtuale che non
//      partiva svuotava grafico e picco lasciando la misura "da salvare".
//      Inoltre: Zero virtuale nella barra prima di START, il motivo per cui
//      START non parte col comparatore spento, "misura" e non "scansione".
//
//  Uso: node tools/test_usabilita_alzata.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' ALZATA AL BANCO: comandi sempre visibili, esito che resta,');
console.log(' nessuna misura persa con un clic');
console.log('=============================================================');

var ALZATA = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8').replace(/\r\n/g, '\n');
var SCAN = fs.readFileSync(path.join(__dirname, '..', 'cammes-scan.js'), 'utf8').replace(/\r\n/g, '\n');
function senzaCommenti(t) { return t.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n'); }
var VIVO = senzaCommenti(ALZATA);
var CORPO = ALZATA.slice(ALZATA.indexOf('<body>'), ALZATA.indexOf('<script>', ALZATA.indexOf('<body>'))).replace(/<!--[\s\S]*?-->/g, '');
var STILE = (/<style>([\s\S]*?)<\/style>/.exec(ALZATA) || ['', ''])[1];

function estrai(src, nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(src);
    if (!m) return null;
    var fine = src.indexOf('\n}\n', m.index);
    return fine < 0 ? null : src.substring(m.index, fine + 3);
}
function carica(ctx, nomi, src) {
    var mancanti = [];
    nomi.forEach(function (n) { var s = estrai(src || ALZATA, n); if (s) vm.runInContext(s, ctx); else mancanti.push(n); });
    return mancanti;
}
// la parte di markup fra un id e il primo commento di chiusura che lo nomina
function blocco(id) {
    var i = CORPO.indexOf('id="' + id + '"');
    var j = ALZATA.indexOf('<!-- /' + id + ' -->');
    if (i < 0 || j < 0) return '';
    var a = ALZATA.indexOf('id="' + id + '"');
    return ALZATA.slice(a, j);
}
function regolaCss(selettore) {
    var i = STILE.indexOf(selettore + ' {');
    if (i < 0) return '';
    return STILE.slice(i, STILE.indexOf('}', i) + 1);
}
function attesa() { return new Promise(function (r) { setImmediate(r); }); }
async function sfoga() { for (var k = 0; k < 6; k++) await attesa(); }   // lascia girare le promise

// Finestre della pagina finte: registrano la domanda e rispondono quando si dice.
function finestre() {
    var f = { domande: [], risposte: [] };
    f.conferma = function (titolo, testo, testoSi, pericoloso) {
        var d = { tipo: 'conferma', titolo: titolo, testo: testo, testoSi: testoSi, pericoloso: pericoloso };
        f.domande.push(d);
        return new Promise(function (r) { d.rispondi = r; });
    };
    f.chiedi = function (titolo, testo, valore, testoSi) {
        var d = { tipo: 'chiedi', titolo: titolo, testo: testo, testoSi: testoSi };
        f.domande.push(d);
        return new Promise(function (r) { d.rispondi = r; });
    };
    f.dialog = function (o) {
        var d = { tipo: 'dialog', titolo: o.titolo, testo: o.testo, pulsanti: o.pulsanti };
        f.domande.push(d);
        return new Promise(function (r) { d.rispondi = function (v) { r({ scelta: v, testo: null }); }; });
    };
    f.ultima = function () { return f.domande[f.domande.length - 1]; };
    return f;
}

async function main() {
    // ===============================================================
    console.log('');
    console.log('--- 1. la barra dei comandi resta sempre visibile ---');
    var barra = blocco('barraComandi');
    check('esiste #barraComandi, chiusa dal suo commento', barra.length > 0);
    check('contiene START e STOP', /id="startBtn"[^>]*onclick="start\(\);"/.test(barra) && /id="stopBtn"[^>]*onclick="stop\(\);"/.test(barra));
    check('...l avanzamento (lo stesso elemento di prima)', /id="scan-progress-wrap"/.test(barra) && /id="scan-progress-pct"/.test(barra) && /id="scan-progress-eta"/.test(barra));
    check('...la riga #esitoMisura', /id="esitoMisura"/.test(barra));
    check('...il nome, "Salva misura" e lo stato del salvataggio (stessi nomi di prima)',
        /id="nome"/.test(barra) && /id="salvaBtn"[^>]*onclick="sav\(\);"[^>]*>[^<]*Salva misura/.test(barra) && /<form name="salva"[\s\S]*name="salva"/.test(barra));
    check('...e l avviso che dura (programma, Arduino, sola lettura): dentro la barra, non scorre via', /id="connBanner"/.test(barra));
    check('la barra viene prima del grafico', ALZATA.indexOf('id="barraComandi"') < ALZATA.indexOf('class="main-grid"'));
    var cssBarra = regolaCss('.barra-comandi');
    check('e resta agganciata sotto la barra in alto (position: sticky, top calcolato)',
        /position:\s*sticky/.test(cssBarra) && /top:\s*var\(--alt-intestazione\)/.test(cssBarra), cssBarra.replace(/\s+/g, ' ').slice(0, 120));
    var zBarra = /z-index:\s*(\d+)/.exec(cssBarra);
    check('...sotto l intestazione (z-index < 100) e sopra le schede', !!zBarra && Number(zBarra[1]) < 100 && Number(zBarra[1]) > 1, zBarra ? zBarra[1] : '-');
    check('la pagina misura le due altezze (intestazione e barra) e le aggiorna',
        !!estrai(ALZATA, '_misuraBarre') && /--alt-intestazione/.test(estrai(ALZATA, '_misuraBarre')) && /--alt-barra/.test(estrai(ALZATA, '_misuraBarre')) &&
        /addEventListener\('resize', _misuraBarre\)/.test(VIVO));
    // le notifiche le mette style.css in basso a destra, per tutte le pagine:
    // una regola locale con "top" le faceva diventare una colonna alta tutto lo schermo
    check('nessuna regola locale sposta le notifiche (style.css le mette in basso, lontano dalla barra)',
        !/\.toast-stack\s*\{/.test(STILE));
    check('accanto a START si legge con che cosa si parte', /id="riassuntoScelte"/.test(barra));
    var tagZero = barra.slice(barra.indexOf('id="msBtn"'), barra.indexOf('</button>', barra.indexOf('id="msBtn"')));
    check('Zero virtuale sta nella barra, PRIMA di START, con scritto "facoltativo · picco a 180°"',
        barra.indexOf('id="msBtn"') >= 0 && barra.indexOf('id="msBtn"') < barra.indexOf('id="startBtn"') &&
        /onclick="ms\(\);"/.test(tagZero) && /facoltativo &middot; picco a 180&deg;/.test(tagZero) && /facoltativo, prima di START/.test(tagZero),
        tagZero.slice(-90));
    check('...e non piu in fondo, nel riquadro della rotazione (che lo dice)',
        (CORPO.match(/id="msBtn"/g) || []).length === 1 && /Zero virtuale<\/b>[^<]*sta nella barra in alto/.test(CORPO.slice(CORPO.indexOf('id="rotazioneCard"'))));
    var gauge = CORPO.slice(CORPO.indexOf('class="card gauge-card"'), CORPO.indexOf('class="card chart-card"'));
    check('il riquadro "Misura in tempo reale" e compatto: il disegno del meccanismo sta nella rotazione manuale',
        gauge.indexOf('liveMechCanvas') < 0 && blocco('rotazioneCard') === '' && /id="rotazioneCard"[\s\S]*id="liveMechCanvas"/.test(CORPO));
    check('...i display hanno l etichetta e il quadrante e piu piccolo',
        /Alzata \(mm\)/.test(gauge) && /Angolo \(gradi camma\)/.test(gauge) && /Picco della misura/.test(gauge) && /#microm \.gauge-svg\s*\{\s*max-width:\s*1[0-9]{2}px/.test(STILE));
    check('il grafico ha un contenitore di altezza data (si vede l inizio sotto la barra)',
        /class="grafico-box"><canvas id="grafico"/.test(CORPO) && /\.grafico-box\s*\{[^}]*height:\s*clamp\(/.test(STILE));

    // ===============================================================
    console.log('');
    console.log('--- 2. nomi che dicono l effetto ---');
    var tagRic = CORPO.slice(CORPO.indexOf('id="ricominciaBtn"'), CORPO.indexOf('</button>', CORPO.indexOf('id="ricominciaBtn"')));
    check('"Ricomincia" al posto di RESET, con il fumetto vero',
        /&#8634; Ricomincia$/.test(tagRic) && /Ricomincia da capo/.test(tagRic) && /<b>Non<\/b> azzera l'encoder/.test(tagRic) && /se c&apos;&egrave; una misura non salvata te lo chiede|se c'&egrave; una misura non salvata te lo chiede/.test(tagRic),
        tagRic.slice(-60));
    check('...lontano da STOP (fuori dalla barra dei comandi)', barra.indexOf('ricominciaBtn') < 0);
    check('"Azzera angolo qui" al posto di "Reset zero"', /id="azzeraBtn"[\s\S]{0,700}Azzera angolo qui\s*<\/button>/.test(CORPO));
    check('"Memorizza posizione" al posto di "Salva pos"', /id="memorizzaBtn"[\s\S]{0,500}Memorizza posizione\s*<\/button>/.test(CORPO));
    check('i nomi vecchi non ci sono piu', !/>&#8634; RESET</.test(ALZATA) && !/Reset zero/.test(VIVO) && !/Salva pos\b/.test(VIVO) && !/value="Salva"/.test(ALZATA));
    var imp = CORPO.slice(CORPO.indexOf('id="impostazioniMisura"'), CORPO.indexOf('class="grafico-box"'));
    check('il verso di scansione sta accanto alla Modalita, scritto a parole',
        /id="scanMode"/.test(imp) && /Verso di scansione:/.test(imp) && /id="versoScansione"/.test(imp) && /id="rlabel">orario</.test(imp));
    check('...e non e piu nel riquadro della rotazione manuale', !/versoScansione/.test(CORPO.slice(CORPO.indexOf('id="rotazioneCard"'))));
    check('...in un colore solo per i due versi (il rosso sembrava un errore)',
        /\.verso-scansione input:checked \+ \.slider\s*\{[^}]*background:\s*var\(--bg-elev-3\)/.test(STILE));
    check('...e la casella si raggiunge con la tastiera (non piu display:none)',
        /\.verso-scansione \.switch input\s*\{[^}]*display:\s*block[^}]*opacity:\s*0/.test(STILE));

    // rlb(): conta lo STATO della casella, non i clic
    var casella = { checked: false }, etichetta = { textContent: '' }, riassunti = 0, occupato = false;
    var cS = {
        document: { getElementById: function (id) { return id === 'versoScansione' ? casella : id === 'rlabel' ? etichetta : null; },
                    querySelector: function () { return casella; } },
        window: { _scanBusy: function () { return occupato; } },
        aggiornaRiassuntoScelte: function () { riassunti++; }
    };
    vm.createContext(cS);
    vm.runInContext('var rot = 0, rsign = 1;', cS);
    check('rlb() c e in cammes-scan.js', carica(cS, ['rlb'], SCAN).length === 0);
    casella.checked = true; vm.runInContext('rlb()', cS);
    check('casella spuntata: antiorario', vm.runInContext('rsign', cS) === -1 && etichetta.textContent === 'antiorario', 'rsign=' + vm.runInContext('rsign', cS));
    vm.runInContext('rlb()', cS);
    check('chiamarla di nuovo con la stessa casella non inverte (stato, non conteggio)', vm.runInContext('rsign', cS) === -1);
    casella.checked = false; vm.runInContext('rlb()', cS);
    check('casella vuota: orario', vm.runInContext('rsign', cS) === 1 && etichetta.textContent === 'orario');
    check('...e il riassunto accanto a START si aggiorna', riassunti === 3, riassunti + ' aggiornamenti');
    occupato = true; casella.checked = true; vm.runInContext('rlb()', cS);
    check('durante la misura il cambio e rifiutato e la casella torna al verso vero',
        vm.runInContext('rsign', cS) === 1 && casella.checked === false);

    // ===============================================================
    console.log('');
    console.log('--- 3. l esito resta scritto ---');
    var cE = { window: {}, document: { getElementById: function () { return null; } } };
    vm.createContext(cE);
    check('le funzioni dell esito ci sono',
        carica(cE, ['esitoDellaMisura', '_interruzione', '_esitoInterruzione', 'esitoVerificaBanco', 'numero', 'virgolaDecimale', 'testoPicco', 'testoAngolo', 'descriviScelte']).length === 0);
    function esito(s) {
        var base = { mancanti: 0, giroNonChiuso: 0, slittamento: false, instabili: 0, picco: 9.61, gradoPicco: 160, ripetizioni: null, salvataCome: null, erroreSalvataggio: null };
        Object.keys(s || {}).forEach(function (k) { base[k] = s[k]; });
        cE._s = base;
        return vm.runInContext('esitoDellaMisura(_s)', cE);
    }
    var e1 = esito();
    check('misura pulita: verde, "Misura completa - picco 9,610 mm a 160° - NON ANCORA SALVATA"',
        e1.livello === 'ok' && /Misura completa/.test(e1.html) && /picco 9,610 mm a 160&deg;/.test(e1.html) && /NON ANCORA SALVATA/.test(e1.html), e1.html);
    var e2 = esito({ giroNonChiuso: 0.045 });
    check('giro non chiuso: gialla, con i mm e la virgola', e2.livello === 'avviso' && /sospetta/.test(e2.html) && /giro non chiuso, 0,045 mm/.test(e2.html), e2.html);
    check('slittamento e punti non stabilizzati: gialla anche loro',
        esito({ slittamento: true }).livello === 'avviso' && /3 punti non stabilizzati/.test(esito({ instabili: 3 }).html) && esito({ instabili: 3 }).livello === 'avviso');
    var e3 = esito({ mancanti: 12, giroNonChiuso: 0.045 });
    check('incompleta: rossa (prevale sul sospetto)', e3.livello === 'errore' && /INCOMPLETA/.test(e3.html) && /12 gradi senza lettura/.test(e3.html), e3.html);
    var e4 = esito({ ripetizioni: { runs: 3, runsTotal: 3, sigmaMax: 0.0123, sigmaPeak: 0.004, cvMax: 0.85, verdetto: 'eccellente' } });
    check('con le ripetizioni: giri in media, sigma massima, CV e verdetto, con la virgola',
        /3 giri su 3 in media/.test(e4.html) && /&sigma; max 0,012 mm/.test(e4.html) && /CV max 0,85 %/.test(e4.html) && /eccellente/.test(e4.html), e4.html);
    var e5 = esito({ ripetizioni: { runs: 1, runsTotal: 3, sigmaMax: NaN, sigmaPeak: NaN, cvMax: NaN } });
    check('...ripetibilita non valutabile se in media c e un giro solo', /1 giro su 3 in media: ripetibilit&agrave; non valutabile/.test(e5.html), e5.html);
    var e6 = esito({ salvataCome: 'albero12_asp_alz.scr' });
    check('dopo il salvataggio: "salvata come albero12_asp_alz.scr"', /salvata come <b>albero12_asp_alz\.scr<\/b>/.test(e6.html) && !/NON ANCORA SALVATA/.test(e6.html), e6.html);
    check('...e il passo seguente: Analisi come aspirazione o scarico (contratto ?asp= / ?sca=)',
        /href="analisi\.html\?asp=albero12_asp_alz\.scr"/.test(e6.html) && /href="analisi\.html\?sca=albero12_asp_alz\.scr"/.test(e6.html));
    // la riga sta nella barra che resta in alto: su quattro righe toglieva il grafico alla vista
    var eLunga = esito({ salvataCome: 'albero12_asp_alz.scr', ripetizioni: { runs: 3, runsTotal: 3, sigmaMax: 0.0123, sigmaPeak: 0.004, cvMax: 0.85, verdetto: 'eccellente' } });
    var lungaTesto = eLunga.html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, 'x');
    check('la riga piu lunga (ripetizioni e salvata) resta corta, senza perdere numeri',
        lungaTesto.length <= 205 && /0,012 mm/.test(lungaTesto) && /0,85 %/.test(lungaTesto) && /9,610 mm/.test(lungaTesto) && !/Prossimo passo/.test(lungaTesto),
        lungaTesto.length + ' caratteri');
    check('un salvataggio fallito lo dice nella riga', /salvataggio non riuscito: disco pieno/.test(esito({ erroreSalvataggio: 'disco pieno' }).html));
    var ints = ['misura', 'zero', 'verifica'].map(function (t) { return vm.runInContext('_esitoInterruzione(' + JSON.stringify(t) + ', "stop")', cE); });
    check('interruzioni: misura, Zero virtuale e verifica hanno parole loro',
        /Misura interrotta/.test(ints[0]) && /Zero virtuale interrotto/.test(ints[1]) && /Verifica banco interrotta/.test(ints[2]) && /STOP/.test(ints[0]), ints[0]);
    var xZ = vm.runInContext('_interruzione("zero", "stop")', cE);
    check('...e la notifica usa le stesse parole della riga (STOP nello Zero virtuale: non "Misura interrotta")',
        xZ.titolo === 'Zero virtuale interrotto' && /^Hai premuto STOP: l'albero non &egrave; allo zero/.test(xZ.notifica) && xZ.riga.indexOf(xZ.seguito) > 0, xZ.notifica);
    check('con le ripetizioni dice quanti giri erano arrivati in fondo',
        /Giri completati: 1 di 3\./.test(vm.runInContext('_esitoInterruzione("misura", "stop", { fatti: 1, totali: 3 })', cE)) &&
        !/Giri completati/.test(vm.runInContext('_esitoInterruzione("misura", "stop", null)', cE)));
    var xR = vm.runInContext('_esitoInterruzione("misura", "riavvio")', cE);
    check('Arduino riavviato durante la misura: "NON valida", con lo Zero virtuale da rifare',
        /l'Arduino si &egrave; riavviato/.test(xR) && /misura NON valida/.test(xR) && /rifatto lo Zero virtuale/.test(xR), xR);
    var xS = vm.runInContext('_interruzione("misura", "corto")', cE);
    check('...e la frase sta in piedi anche dopo "Il giro si e fermato a N punti" (ha il suo soggetto)',
        /^misura incompleta, da ripetere\./.test(xS.seguito) && /^Il giro si &egrave; fermato prima della fine: misura incompleta/.test(xS.notifica), xS.notifica);
    check('...e durante lo Zero virtuale dice "Zero virtuale interrotto" (prima: "Misura NON valida")',
        /^<b>Zero virtuale interrotto<\/b> \(l'Arduino si &egrave; riavviato\)/.test(vm.runInContext('_esitoInterruzione("zero", "riavvio")', cE)) &&
        !/<b>Misura NON valida<\/b>/.test(VIVO));
    var vb = vm.runInContext('esitoVerificaBanco({ status: "OK", rms: 0.0123, max: 0.0341 })', cE);
    check('verifica banco superata: verde, residuo con la virgola', vb.livello === 'ok' && /RMS 0,012 mm, max 0,034 mm/.test(vb.riga) && /SUPERATA/.test(vb.title), vb.riga);
    var vf = vm.runInContext('esitoVerificaBanco({ status: "FAIL", rms: 0.031, max: 0.08 })', cE);
    check('...non superata: rossa', vf.livello === 'errore' && /NON SUPERATA/.test(vf.riga));
    var vn = vm.runInContext('esitoVerificaBanco({ status: "NON_VALUTABILE", missing: 4 })', cE);
    check('...non valutabile: rossa, e dice "verifica", non "test di salute"', vn.livello === 'errore' && /NON VALUTABILE/.test(vn.riga) && !/test di salute/.test(vn.body));

    // _scriviEsito e _esitoFineMisura sul grafico vero
    var rigaEsito = { className: '', innerHTML: '' }, voce = [];
    var cF = {
        window: {}, document: { getElementById: function (id) { return id === 'esitoMisura' ? rigaEsito : null; } },
        speakLocal: function (t) { voce.push(t); }
    };
    vm.createContext(cF);
    vm.runInContext('var _esitoCorrente = null, pdata = [], max = 9.61, maxg = 160;', cF);
    carica(cF, ['esitoDellaMisura', '_scriviEsito', '_mostraEsitoMisura', '_esitoFineMisura']);
    vm.runInContext('for (var d = 1; d <= 360; d++) pdata[d] = 0.01;', cF);
    vm.runInContext('_esitoFineMisura()', cF);
    check('fine misura pulita: la riga diventa verde e la voce dice "misura terminata"',
        rigaEsito.className === 'esito-misura esito-ok' && /NON ANCORA SALVATA/.test(rigaEsito.innerHTML) && voce[0] === 'misura terminata', rigaEsito.className + ' / ' + voce[0]);
    vm.runInContext('pdata[42] = undefined; _esitoFineMisura()', cF);
    check('con un grado mancante: rossa, e la voce dice "misura incompleta"',
        rigaEsito.className === 'esito-misura esito-errore' && voce[1] === 'misura incompleta', rigaEsito.className + ' / ' + voce[1]);
    vm.runInContext('pdata[42] = 0.01; window._giroNonChiuso = 0.05; _esitoFineMisura()', cF);
    check('giro non chiuso: gialla, "misura terminata, con avvisi"', rigaEsito.className === 'esito-misura esito-avviso' && voce[2] === 'misura terminata, con avvisi');

    // dove la pagina scrive la riga
    var fineGiro = /if \(labms !== 1\) \{[\s\S]{0,300}window\._misuraNonSalvata = true;[\s\S]{0,120}_esitoFineMisura\(\)/.exec(VIVO);
    check('a fine misura: "non salvata" e riga Esito, solo per una misura vera (non Zero virtuale)', !!fineGiro);
    var run = estrai(ALZATA, '_startSingleRun') || '';
    check('allo START la riga dice "in corso" (misura, Zero virtuale, verifica)',
        /_scriviEsito\('corso'/.test(run) && /Misura in corso/.test(run) && /Zero virtuale in corso/.test(run) && /Verifica banco in corso/.test(run));
    check('...e l avanzamento dice che cosa sta girando', /scan-progress-label/.test(run));
    check('la verifica banco scrive notifica e riga dallo stesso verdetto',
        /var _ev = esitoVerificaBanco\(_bv\);[\s\S]{0,200}_scriviEsito\(_ev\.livello, _ev\.riga\)/.test(VIVO));
    // *sabort, giro chiuso prima, comparatore muto, Arduino riavviato, STOP
    var nInterr = (VIVO.match(/_scriviEsito\('errore', (_esitoInterruzione\(|x[AC]?\.riga\))/g) || []).length;
    check('le interruzioni (banco, giro corto, comparatore, riavvio, STOP) scrivono la riga', nInterr >= 5, nInterr + ' punti');
    check('...e notifica e riga del banco che chiude il giro escono dalle stesse parole (_interruzione)',
        /var xA = _interruzione\(window\._tipoScansione[\s\S]{0,300}title: xA\.titolo, body: xA\.notifica[\s\S]{0,80}_scriviEsito\('errore', xA\.riga\)/.test(VIVO) &&
        /var xC = _interruzione\(window\._tipoScansione, 'corto'[\s\S]{0,300}title: xC\.titolo/.test(VIVO));

    // ===============================================================
    console.log('');
    console.log('--- 4. una misura non salvata non si perde con un clic ---');
    var F = finestre(), fuochi = [];
    var cQ = { window: { cammesConferma: F.conferma }, document: { getElementById: function () { return null; } },
               _fuocoSulPulsante: function (t) { fuochi.push(t); } };
    vm.createContext(cQ);
    carica(cQ, ['_chiediPrimaDiPerdere']);
    var fatto = 0;
    cQ.window._misuraNonSalvata = false;
    check('niente da chiedere: risponde subito "prosegui" (START resta immediato)',
        vm.runInContext('_chiediPrimaDiPerdere("x", function () {})', cQ) === false && F.domande.length === 0);
    cQ.window._misuraNonSalvata = true;
    cQ.continua = function () { fatto++; };
    check('misura non salvata: apre la domanda della pagina', vm.runInContext('_chiediPrimaDiPerdere("Una nuova misura cancella quella sul grafico.", continua)', cQ) === true &&
        F.domande.length === 1 && /non è salvata/.test(F.ultima().titolo) && F.ultima().testoSi === 'Continua senza salvare' && F.ultima().pericoloso === true);
    check('...col fuoco su Annulla: un Invio distratto non butta la misura', fuochi.join() === 'Annulla', fuochi.join());
    F.ultima().rispondi(false); await sfoga();
    check('"Annulla": non succede niente', fatto === 0);
    vm.runInContext('_chiediPrimaDiPerdere("x", continua)', cQ);
    F.ultima().rispondi(true); await sfoga();
    check('"Continua senza salvare": prosegue', fatto === 1);

    // START, Zero virtuale, Ricomincia, verifica banco nella pagina finta
    function paginaComandi(opz) {
        opz = opz || {};
        var p = { inviati: [], toasts: [], ricariche: 0, F: finestre(), fuochi: [] };
        var el = { scanMode: { disabled: false, value: 'fast' }, scanRepeat: { disabled: false, value: '1' },
                   esitoMisura: { className: '', innerHTML: '' } };
        p.riga = el.esitoMisura;
        var ctx = {
            Date: { now: function () { return 5000000; } }, Math: Math, JSON: JSON, parseInt: parseInt,
            console: { log: function () {}, warn: function () {} },
            window: { cammesToast: function (o) { p.toasts.push(o); }, cammesConferma: p.F.conferma,
                      cammesScanProgress: { reset: function () {}, set: function () {} } },
            document: { getElementById: function (id) { return el[id] || null; }, mas: { mas: { value: '9,610 mm a 160°' } } },
            _fuocoSulPulsante: function (t) { p.fuochi.push(t); },
            setTimeout: function (fn) { fn(); return 1; },
            location: { reload: function () { p.ricariche++; } },
            sendSocket: { readyState: 1, send: function (s) { p.inviati.push(s); } },
            scanEta: { stop: function () {} },
            _wsReady: function () { return true; },
            _clearScanTimers: function () {},
            bancoInSolaLettura: function () { return !!opz.solaLettura; },
            SCAN_MODES: { fast: { label: 'Veloce', timeSec: 50 } },
            etaModalita: function () { return '~50s'; },
            onScanModeChange: function () {},
            // l'avvio vero (qui basta che risulti partito, e che cosa sta girando)
            _startSingleRun: function () {
                ctx.window._giroInAttesa = false;
                ctx.window._tipoScansione = ctx.labms === 1 ? 'zero' : (ctx.window._benchVerify ? 'verifica' : 'misura');
                ctx.startflag = 1; ctx.autoScanActive = true; p.partenze = (p.partenze || 0) + 1;
            }
        };
        ctx.window.window = ctx.window;
        vm.createContext(ctx);
        // sul grafico c'e' una misura (picco 9,610 mm a 160°)
        vm.runInContext('var startflag = 0, autoScanActive = false, stepflag = 0, labms = 0, i = 360, max = 9.61, maxg = 160;' +
                        'var repeatRunsTarget = 1, repeatRunsDone = 0, repeatedRuns = [];' +
                        'var lastSensorRx = ' + (opz.comparatoreMuto ? 0 : 5000000) + ';', ctx);
        p.mancanti = carica(ctx, ['_chiediPrimaDiPerdere', 'start', 'ms', 'stop', '_fermaScansioneLocale', 'safeReload', 'benchVerifyStart',
                                  '_scanBusy', '_scriviEsito', '_interruzione', '_esitoInterruzione', '_giriDellaSerie']);
        p.ctx = ctx; p.val = function (e) { return vm.runInContext(e, ctx); };
        return p;
    }
    var p = paginaComandi();
    check('le funzioni dei comandi ci sono', p.mancanti.length === 0, p.mancanti.join(', '));
    p.val('start()');
    check('START senza misura da perdere: parte subito, senza domande', p.val('startflag') === 1 && p.F.domande.length === 0);

    p = paginaComandi(); p.ctx.window._misuraNonSalvata = true;
    p.val('start()');
    check('START con una misura non salvata: chiede, e intanto non parte niente', p.val('startflag') === 0 && p.F.domande.length === 1 && !p.partenze);
    p.F.ultima().rispondi(true); await sfoga();
    check('..."Continua senza salvare": la misura nuova parte', p.val('startflag') === 1 && p.partenze === 1);

    p = paginaComandi(); p.ctx.window._misuraNonSalvata = true;
    p.val('ms()');
    check('Zero virtuale con una misura non salvata: chiede PRIMA di armarsi', p.val('labms') === 0 && p.val('startflag') === 0 && p.F.domande.length === 1);
    p.F.ultima().rispondi(true); await sfoga();
    check('...confermato: parte proprio lo Zero virtuale (labms=1), con una domanda sola',
        p.val('labms') === 1 && p.val('startflag') === 1 && p.F.domande.length === 1);
    p = paginaComandi(); p.ctx.window._misuraNonSalvata = false;
    p.val('ms()');
    check('Zero virtuale senza niente da perdere: parte subito', p.val('labms') === 1 && p.val('startflag') === 1 && p.F.domande.length === 0);

    p = paginaComandi(); p.ctx.window._misuraNonSalvata = true;
    p.val('safeReload()');
    check('Ricomincia con una misura non salvata: chiede, e non ricarica', p.ricariche === 0 && p.F.domande.length === 1 && p.inviati.length === 0);
    p.F.ultima().rispondi(true); await sfoga();
    check('...confermato: STOP al banco e ricarica, senza la domanda d uscita del browser',
        p.inviati.indexOf('x') >= 0 && p.ricariche === 1 && p.ctx.window._uscitaVoluta === true);
    p = paginaComandi({ solaLettura: true });
    p.val('safeReload()');
    check('in sola lettura Ricomincia ricarica soltanto: lo STOP fermerebbe la misura dell altra finestra',
        p.ricariche === 1 && p.inviati.indexOf('x') < 0);

    p = paginaComandi(); p.ctx.window._misuraNonSalvata = true;
    p.val('benchVerifyStart()');
    var dv = p.F.ultima() || {};
    check('verifica banco: finestra della pagina (non confirm) con le istruzioni, e la misura da perdere nella stessa domanda',
        dv.titolo === 'Verifica banco' && /cilindrico rettificato/.test(dv.testo || '') && /non &egrave; salvata/.test(dv.testo || '') && p.F.domande.length === 1);
    dv.rispondi(true); await sfoga();
    check('...confermata: parte la verifica (una domanda sola)', p.val('startflag') === 1 && p.ctx.window._benchVerify === true && p.F.domande.length === 1);
    p = paginaComandi({ comparatoreMuto: true });
    p.val('benchVerifyStart()'); p.F.ultima().rispondi(true); await sfoga();
    check('...se la misura non parte (comparatore muto) la verifica non resta armata per il prossimo START',
        p.val('startflag') === 0 && !p.ctx.window._benchVerify);

    // STOP: a misura in corso e a banco fermo
    p = paginaComandi();
    p.val('start(); window._tipoScansione = "misura"; stop()');
    check('STOP durante la misura: "Misura interrotta" (notifica) e la riga lo dice',
        p.toasts.some(function (t) { return t.title === 'Misura interrotta'; }) && p.inviati.indexOf('x') >= 0);
    p = paginaComandi(); p.ctx.window._misuraNonSalvata = true;
    p.val('stop()');
    var tStop = p.toasts[p.toasts.length - 1] || {};
    check('STOP a banco fermo: il comando parte lo stesso, ma non fa credere persa la misura sul grafico',
        p.inviati.indexOf('x') >= 0 && tStop.title === 'STOP inviato' && /si pu&ograve; salvare/.test(tStop.body || ''), tStop.title);

    // STOP nella pausa fra un giro e l'altro (ripetizioni): startflag e
    // autoScanActive dicono gia' "fermo", ma il giro dopo e' programmato
    p = paginaComandi();
    p.val('repeatRunsTarget = 3; repeatRunsDone = 1; window._giroInAttesa = true; window._tipoScansione = "misura";');
    check('nella pausa fra due giri la misura e in corso: Ruota, Salva misura, START sono bloccati',
        p.val('_scanBusy("Ruota")') === true && (p.toasts[p.toasts.length - 1] || {}).title === 'Misura in corso');
    p.val('benchVerifyStart()');
    check('...anche la verifica banco (senza nemmeno la domanda)', p.F.domande.length === 0 && (p.toasts[p.toasts.length - 1] || {}).title === 'Misura in corso');
    p.toasts.length = 0;
    p.val('stop()');
    var tGap = p.toasts[0] || {};
    check('STOP fra due giri: "Misura interrotta", non "Nessuna misura in corso", con i giri fatti',
        tGap.title === 'Misura interrotta' && /Giri completati: 1 di 3/.test(tGap.body || '') && p.toasts.length === 1, tGap.title + ' / ' + tGap.body);
    check('...la riga Esito lo dice (restava "Misura in corso: giro 1 di 3" per sempre)',
        p.riga.className === 'esito-misura esito-errore' && /Misura interrotta<\/b> \(hai premuto STOP\)/.test(p.riga.innerHTML) && /Giri completati: 1 di 3/.test(p.riga.innerHTML), p.riga.innerHTML);
    check('...e il giro programmato non parte piu', p.ctx.window._giroInAttesa === false && p.val('_scanBusy("x")') === false && p.inviati.indexOf('x') >= 0);

    // STOP durante lo Zero virtuale: le parole dello Zero virtuale, non "Misura interrotta"
    p = paginaComandi();
    p.val('ms()'); p.toasts.length = 0;
    p.val('stop()');
    check('STOP nello Zero virtuale: notifica e riga dicono "Zero virtuale interrotto"',
        (p.toasts[0] || {}).title === 'Zero virtuale interrotto' && /^<b>Zero virtuale interrotto<\/b>/.test(p.riga.innerHTML), (p.toasts[0] || {}).title);

    // Zero virtuale confermato ("Continua senza salvare") ma il comparatore e' muto
    p = paginaComandi({ comparatoreMuto: true }); p.ctx.window._misuraNonSalvata = true;
    p.val('ms()'); p.F.ultima().rispondi(true); await sfoga();
    check('Zero virtuale che non parte (comparatore muto): la misura sul grafico resta intera, picco compreso',
        !p.partenze && p.val('labms') === 0 && p.val('max') === 9.61 && p.val('maxg') === 160 &&
        p.ctx.document.mas.mas.value === '9,610 mm a 160°' && p.ctx.window._misuraNonSalvata === true,
        'max=' + p.val('max') + ' campo="' + p.ctx.document.mas.mas.value + '"');
    check('...lo svuotamento sta solo dove il giro parte davvero (_startSingleRun)',
        !/reset\(\)|max = 0|mas\.mas\.value = ''/.test(estrai(ALZATA, 'ms') || '') &&
        /max = 0; maxg = 0;[\s\S]{0,300}document\.mas\.mas\.value = ''/.test(estrai(ALZATA, '_startSingleRun') || ''));

    // verifica banco con una misura da perdere: il fuoco su Annulla
    p = paginaComandi(); p.ctx.window._misuraNonSalvata = true;
    p.val('benchVerifyStart()');
    check('verifica banco con una misura non salvata: il fuoco va su Annulla', p.fuochi.join() === 'Annulla', p.fuochi.join());
    p = paginaComandi();
    p.val('benchVerifyStart()');
    check('...senza niente da perdere resta sul pulsante della verifica', p.fuochi.length === 0);

    check('uscita dalla pagina: avviso del browser se la misura non e salvata (non dopo un ricaricamento del programma)',
        /addEventListener\('beforeunload', function \(e\) \{\s*if \(!window\._misuraNonSalvata \|\| window\._uscitaVoluta\) return undefined;/.test(VIVO));
    check('...e i collegamenti in alto fanno la domanda vera, con le parole della pagina',
        /closest\('\.header a\[href\]'\)[\s\S]{0,400}_chiediPrimaDiPerdere\('Uscendo dalla pagina/.test(VIVO));
    var ricarica = estrai(ALZATA, '_ricaricaDopoZeroVirtuale') || '';
    check('il ricaricamento dello Zero virtuale non fa comparire la domanda',
        /window\._uscitaVoluta = true;[^\n]*\n\s*location\.reload\(true\);/.test(ricarica));
    check('una misura nuova spegne lo stato (la domanda, se serviva, e gia stata fatta)',
        /if \(firstRun\)[\s\S]{0,700}window\._misuraNonSalvata = false;/.test(run));

    // ===============================================================
    console.log('');
    console.log('--- 5. finestre della pagina al posto di quelle del browser ---');
    check('nessun confirm(), prompt() o alert() rimasto nella pagina', !/\b(confirm|prompt|alert)\s*\(/.test(VIVO.replace(/cammesConferma|cammesChiedi/g, '')));

    function paginaSalvataggio(opz) {
        opz = opz || {};
        var p = { F: finestre(), toasts: [], richieste: [], errori: [], esito: null, fuochi: [] };
        var nome = { value: opz.nome === undefined ? 'albero12 asp' : opz.nome, focus: function () {}, select: function () {} };
        var stato = { value: '' };
        var ctx = {
            Math: Math, Number: Number, JSON: JSON, String: String, Date: Date, isFinite: isFinite, encodeURIComponent: encodeURIComponent,
            Promise: Promise, console: console,
            window: { cammesToast: function (o) { p.toasts.push(o); }, cammesConferma: p.F.conferma, cammesDialog: p.F.dialog,
                      cammesValidate: { error: function (el, msg) { p.errori.push(msg); } } },
            document: { getElementById: function (id) { return id === 'nome' ? nome : null; }, salva: { salva: stato },
                        querySelector: function () { return null; } },
            setTimeout: function (fn) { return 1; },
            fetch: function (url, o) {
                p.richieste.push({ url: url, metodo: (o && o.method) || 'GET', body: o && o.body });
                var dati = /\/api\/files$/.test(url) ? { files: (opz.esistenti || []).map(function (n) { return { name: n }; }) } : { ok: true };
                return Promise.resolve({ json: function () { return Promise.resolve(dati); } });
            },
            _scriviEsito: function (l, h) { p.esito = { livello: l, html: h }; return true; },
            _fuocoSulPulsante: function (t) { p.fuochi.push(t); }
        };
        ctx.window.window = ctx.window;
        vm.createContext(ctx);
        vm.runInContext('var pdata = [], pdindex = [], max = 9.61, maxg = 160, rsign = 1, currentMode = { microsteps: 32 }, _esitoCorrente = null, t;' +
                        'var startflag = 0, autoScanActive = false;', ctx);
        vm.runInContext('for (var d = 1; d <= 360; d++) { pdata[d] = 0.01; pdindex[d] = d; }', ctx);
        (opz.buchi || []).forEach(function (g) { vm.runInContext('pdata[' + g + '] = undefined;', ctx); });
        if (opz.giroNonChiuso) ctx.window._giroNonChiuso = opz.giroNonChiuso;
        p.mancanti = carica(ctx, ['sav', '_testoInHtml', '_domandaSalvataggio', '_salvaSeIlNomeELibero', '_scriviMisura',
                                  'domandaMisuraSospetta', 'metadatiAvvisi', 'esitoDellaMisura', '_mostraEsitoMisura', '_scanBusy']);
        if (opz.esito) vm.runInContext('_esitoCorrente = { mancanti: 0, giroNonChiuso: 0, slittamento: false, instabili: 0, picco: 9.61, gradoPicco: 160, ripetizioni: null, salvataCome: null, erroreSalvataggio: null };', ctx);
        p.ctx = ctx; p.stato = stato;
        p.post = function () { return p.richieste.filter(function (r) { return r.metodo === 'POST'; }); };
        return p;
    }
    var s = paginaSalvataggio({ nome: '' });
    check('le funzioni del salvataggio ci sono', s.mancanti.length === 0, s.mancanti.join(', '));
    vm.runInContext('sav()', s.ctx);
    check('senza nome: lo dice sul campo (niente "localhost dice")', s.errori.length === 1 && /nome della misura/.test(s.errori[0]) && s.F.domande.length === 0);

    s = paginaSalvataggio({ buchi: [10, 11, 12], esito: true });
    vm.runInContext('sav()', s.ctx); await sfoga();
    var dI = s.F.ultima() || {};
    check('misura incompleta: finestra della pagina con i gradi mancanti e "Salva comunque"',
        dI.tipo === 'conferma' && /INCOMPLETA/.test(dI.titolo) && /3 gradi su 360/.test(dI.testo) && dI.testoSi === 'Salva comunque');
    dI.rispondi(false); await sfoga();
    check('...Annulla: niente scritto, "annullato"', s.post().length === 0 && /annullato/.test(s.stato.value));

    s = paginaSalvataggio({ buchi: [10, 11, 12], esito: true });
    s.ctx.window._misuraNonSalvata = true;
    vm.runInContext('sav()', s.ctx); await sfoga();
    s.F.ultima().rispondi(true); await sfoga();
    var post = s.post()[0] || {};
    check('...Salva comunque: il file parte, marcato INCOMPLETO, col nome sistemato e _alz',
        /\/api\/file\/albero12_asp_alz\.scr$/.test(post.url || '') && /#stato=INCOMPLETO/.test(post.body || '') && /#gradiMancanti=3/.test(post.body || ''), post.url);
    check('salvata davvero: stato "salvata", misura non piu da proteggere, riga Esito "salvata come"',
        /salvata/.test(s.stato.value) && s.ctx.window._misuraNonSalvata === false && !!s.esito && /salvata come <b>albero12_asp_alz\.scr<\/b>/.test(s.esito.html));
    check('...e la notifica parla di misura, non di file', s.toasts.some(function (t) { return t.title === 'Misura salvata'; }));

    s = paginaSalvataggio({ giroNonChiuso: 0.045 });
    vm.runInContext('sav()', s.ctx); await sfoga();
    var dS = s.F.ultima() || {};
    check('misura sospetta: la stessa domanda di prima (domandaMisuraSospetta), in una finestra della pagina',
        dS.tipo === 'conferma' && /SOSPETTA/.test(dS.testo) && /0,045 mm/.test(dS.testo) && /<br>/.test(dS.testo));
    dS.rispondi(true); await sfoga();
    check('...confermata: nel file finisce l avviso', /#giroNonChiuso=0\.045/.test((s.post()[0] || {}).body || ''));

    s = paginaSalvataggio({ esistenti: ['albero12_asp_alz.scr'] });
    vm.runInContext('sav()', s.ctx); await sfoga();
    var dO = s.F.ultima() || {};
    var bottoni = (dO.pulsanti || []).map(function (b) { return b.testo; }).join(' / ');
    check('nome gia usato: finestra con "Cambia nome" / "Sostituisci" (dice che cosa fanno)',
        dO.tipo === 'dialog' && bottoni === 'Cambia nome / Sostituisci' && /albero12_asp_alz\.scr/.test(dO.testo), bottoni);
    check('...col fuoco su "Cambia nome"', s.fuochi.join() === 'Cambia nome', s.fuochi.join());
    dO.rispondi(false); await sfoga();
    check('...Cambia nome: niente sovrascritto', s.post().length === 0 && /annullato/.test(s.stato.value));
    s = paginaSalvataggio({ esistenti: ['albero12_asp_alz.scr'] });
    vm.runInContext('sav()', s.ctx); await sfoga();
    s.F.ultima().rispondi(true); await sfoga();
    check('...Sostituisci: scrive', s.post().length === 1);
    s = paginaSalvataggio({});
    vm.runInContext('sav(); sav();', s.ctx); await sfoga();
    check('un doppio clic su Salva misura (le domande non bloccano piu la pagina) scrive una volta sola',
        s.post().length === 1 && s.richieste.filter(function (r) { return /\/api\/files$/.test(r.url); }).length === 1, s.richieste.length + ' richieste');
    vm.runInContext('sav()', s.ctx); await sfoga();
    check('...e finito il primo, si puo salvare di nuovo', s.post().length === 2);

    // Salva misura (o Invio nel nome) mentre il banco gira
    s = paginaSalvataggio({ buchi: [200, 201] });
    vm.runInContext('startflag = 1; autoScanActive = true; sav();', s.ctx); await sfoga();
    var tBusy = s.toasts[s.toasts.length - 1] || {};
    check('Salva misura durante la misura: niente domanda "INCOMPLETA", niente file, e lo dice',
        s.F.domande.length === 0 && s.richieste.length === 0 && tBusy.title === 'Misura in corso' && /Salva misura &egrave; bloccato/.test(tBusy.body || ''), tBusy.title);
    vm.runInContext('startflag = 0; autoScanActive = false; window._giroInAttesa = true; sav();', s.ctx); await sfoga();
    check('...anche nella pausa fra due giri delle ripetizioni (salverebbe un giro solo della serie)', s.F.domande.length === 0 && s.richieste.length === 0);
    vm.runInContext('window._giroInAttesa = false; sav();', s.ctx); await sfoga();
    check('...dopo uno STOP si salva come sempre (la misura interrotta e INCOMPLETA)', s.F.domande.length === 1 && /INCOMPLETA/.test(s.F.ultima().titolo));

    // il fuoco va sull'ULTIMA finestra aperta: quella appena chiusa resta nella pagina un attimo
    var focati = [];
    function finestraFinta(nome, testi) {
        return { querySelectorAll: function (sel) {
            return sel === '.cammes-dialog-actions button' ? testi.map(function (t) { return { textContent: t, focus: function () { focati.push(nome + ':' + t); } }; }) : [];
        } };
    }
    var cFo = {
        setTimeout: function (fn) { fn(); return 1; },
        document: { querySelectorAll: function (sel) {
            return sel === '.cammes-dialog-backdrop' ? [finestraFinta('vecchia', ['Annulla', 'Salva comunque']), finestraFinta('nuova', ['Cambia nome', 'Sostituisci'])] : [];
        } }
    };
    vm.createContext(cFo);
    check('_fuocoSulPulsante c e', carica(cFo, ['_fuocoSulPulsante']).length === 0);
    vm.runInContext('_fuocoSulPulsante("Cambia nome")', cFo);
    check('...e mette il fuoco su "Cambia nome" della finestra nuova, non sul primo pulsante della vecchia',
        focati.join() === 'nuova:Cambia nome', focati.join());

    // Azzera angolo qui / Memorizza posizione
    function paginaPosizioni(posizioni) {
        var p = { F: finestre(), inviati: [], toasts: [], epoca: 3, salvate: posizioni || [] };
        var ctx = {
            window: { cammesToast: function (o) { p.toasts.push(o); }, cammesConferma: p.F.conferma, cammesChiedi: p.F.chiedi },
            sendSocket: { readyState: 1, send: function (s) { p.inviati.push(s); } },
            setTimeout: function () { return 1; },
            _scanBusy: function () { return false; },
            currentEncEpoch: function () { return p.epoca; },
            bumpEncEpoch: function () { p.epoca++; },
            loadSavedPositions: function () { return p.salvate.slice(); },
            saveSavedPositions: function (a) { p.salvate = a; },
            renderSavedPositions: function () {},
            numero: function (x, d) { return Number(x).toFixed(d).replace('.', ','); },
            Date: Date, Math: Math, Number: Number, String: String, parseFloat: parseFloat
        };
        ctx.window.window = ctx.window;
        vm.createContext(ctx);
        vm.runInContext('var currentEncoderCount = 480;', ctx);
        p.mancanti = carica(ctx, ['resetEncoder', 'savePositionMark', '_memorizzaPosizione']);
        p.ctx = ctx;
        return p;
    }
    var q = paginaPosizioni([{ label: 'pms1', epoch: 3 }, { label: 'vecchia', epoch: 1 }]);
    check('le funzioni delle posizioni ci sono', q.mancanti.length === 0, q.mancanti.join(', '));
    vm.runInContext('resetEncoder()', q.ctx);
    var dZ = q.F.ultima() || {};
    check('Azzera angolo qui con posizioni memorizzate valide: chiede, nominandole, e non manda niente',
        q.inviati.length === 0 && /pms1/.test(dZ.testo || '') && !/vecchia/.test(dZ.testo || '') && /inutilizzabile/.test(dZ.testo || '') && dZ.testoSi === 'Azzera angolo qui');
    dZ.rispondi(true); await sfoga();
    check('...confermato: azzera (!) e le posizioni di prima non valgono piu (epoca nuova)', q.inviati.indexOf('!') >= 0 && q.epoca === 4);
    check('..."Angolo azzerato" aspetta la risposta del banco (*zero), non l invio',
        !!q.ctx.window._attesaZero && !q.toasts.some(function (t) { return /azzerat/i.test(t.title || ''); }) &&
        /msg === '\*zero'\) \{\s*\n\s*currentEncoderCount = 0;[\s\S]{0,200}_attesaZero[\s\S]{0,200}Angolo azzerato/.test(VIVO));
    q = paginaPosizioni([]);
    vm.runInContext('resetEncoder()', q.ctx);
    check('senza posizioni memorizzate: azzera subito, senza domande', q.inviati.indexOf('!') >= 0 && q.F.domande.length === 0);

    q = paginaPosizioni([]);
    vm.runInContext('savePositionMark()', q.ctx);
    var dP = q.F.ultima() || {};
    check('Memorizza posizione: il nome si chiede in una finestra della pagina (niente prompt)', dP.tipo === 'chiedi' && /cerchio-base/.test(dP.testo) && !/base-circle/.test(dP.testo));
    vm.runInContext('currentEncoderCount = 900;', q.ctx);   // l'albero si muove mentre si scrive il nome
    dP.rispondi('pms 1'); await sfoga();
    var pos = q.salvate[0] || {};
    check('...si memorizza la posizione del CLIC, col nome sistemato', pos.label === 'pms1' && pos.encoderCount === 480 && pos.epoch === 3, JSON.stringify(pos));
    check('...e la notifica scrive i gradi con la virgola', q.toasts.some(function (t) { return /a 120,00&deg;/.test(t.body || ''); }));

    // ===============================================================
    console.log('');
    console.log('--- 6. comandi spenti, e perche ---');
    var spenti = {};
    var cU = {
        document: { getElementById: function (id) { spenti[id] = spenti[id] || { disabled: false }; return spenti[id]; } }
    };
    vm.createContext(cU);
    carica(cU, ['_setMotionUiDisabled']);
    vm.runInContext('_setMotionUiDisabled(true)', cU);
    check('motore sbloccato o sola lettura: START, verifica banco, Ruota, -/+ e Zero virtuale spenti (per id, non per testo)',
        ['startBtn', 'verificaBtn', 'cf', 'm1Btn', 'p1Btn', 'msBtn'].every(function (id) { return spenti[id] && spenti[id].disabled === true; }));
    var corpoUi = estrai(ALZATA, '_aggiornaUiMoto') || '';
    check('in sola lettura anche "Azzera angolo qui" (il server lo rifiuterebbe); a motore sbloccato no',
        /getElementById\('azzeraBtn'\)[\s\S]{0,80}az\.disabled = nonComandabile/.test(corpoUi));
    var leds = estrai(ALZATA, 'updateStatusLeds') || '';
    check('l avviso nella barra dice perche START e spento: sola lettura, arresto, motore sbloccato',
        /SOLA LETTURA/.test(leds) && /Banco in arresto/.test(leds) && /Motore sbloccato/.test(leds));
    check('...e una sola frase per il programma che non risponde: "avvia cammes.exe"',
        /avvia cammes\.exe/.test(leds) && !/ws:\/\/localhost/.test(leds) && !/cammes_server\.js/.test(VIVO));

    // ===============================================================
    console.log('');
    console.log('--- 7. numeri con la virgola, parole d officina ---');
    check('numero(): virgola decimale', vm.runInContext('numero(9.61, 3)', cE) === '9,610');
    check('picco: "9,610 mm a 160°" (e i giri della media)',
        vm.runInContext('testoPicco(9.61, 160)', cE) === '9,610 mm a 160°' && vm.runInContext('testoPicco(9.61, 160, 3)', cE) === '9,610 mm a 160° (3 giri)');
    check('angolo: "113,5°"', vm.runInContext('testoAngolo(113.5)', cE) === '113,5°');
    check('virgolaDecimale tocca solo i numeri', vm.runInContext('virgolaDecimale("Picco 9.610 mm &middot; CV 0.85% fw.ok")', cE) === 'Picco 9,610 mm &middot; CV 0,85% fw.ok');
    check('display: alzata, angolo e picco passano dalla virgola',
        /document\.cpot\.cpot\.value = msg2\.replace\('\.', ','\)/.test(VIVO) && !/"gradi " \+/.test(VIVO) && /document\.mas\.mas\.value = testoPicco\(max, maxg\)/.test(VIVO));
    check('il quadrante riscrive il suo numero con la virgola', /gaugemicrom\.setValue = function \(v\)[\s\S]{0,200}virgolaDecimale\(/.test(VIVO));
    check('grafici con la virgola (locale it-IT) e l asse dei gradi',
        (VIVO.match(/locale: 'it-IT'/g) || []).length === 2 && /text: 'gradi camma'/.test(VIVO));

    // ripetizioni: "giri", virgole, verdetto per la riga
    var avvisiRip = [];
    function giroFinto(seme) {
        var r = new Array(361), x = seme;
        for (var g = 1; g <= 360; g++) {
            x = (x * 1103515245 + 12345) & 0x7fffffff;
            r[g] = ((g >= 150 && g <= 210) ? 8 * Math.pow(Math.sin(Math.PI * (g - 150) / 60), 2) : 0.02) + ((x / 0x7fffffff) * 2 - 1) * 0.004;
        }
        return r;
    }
    var cR = {
        Math: Math, isFinite: isFinite, NaN: NaN,
        repeatedRuns: [giroFinto(7), giroFinto(8), giroFinto(9)],
        window: { averageCompleteRuns: M.averageCompleteRuns, cammesToast: function (o) { avvisiRip.push(o); }, _lastRepeatStats: null },
        document: { mas: { mas: { value: '' } } },
        pdata: new Array(361), pdindex: new Array(361), max: 0, maxg: 0, config: null
    };
    cR.window.window = cR.window;
    vm.createContext(cR);
    carica(cR, ['_showRepeatedRunsStats']);
    vm.runInContext('_showRepeatedRunsStats()', cR);
    var verd = avvisiRip.filter(function (t) { return /ripetibilit/.test(t.title || ''); })[0] || {};
    check('ripetizioni: "3 giri su 3 in media", non "3/3 run"', /^3 giri su 3 in media/.test(verd.title || '') && !/\brun\b/.test(verd.title || ''), verd.title);
    check('...numeri con la virgola nella notifica', /Picco medio <b>\d+,\d{3} mm/.test(verd.body || '') && /&sigma; max <b>0,\d{3} mm/.test(verd.body || '') && !/\d\.\d/.test(verd.body || ''), (verd.body || '').slice(0, 90));
    check('...il verdetto resta per la riga Esito', /eccellente|buona|sufficiente|scadente/.test(String(cR.window._lastRepeatStats && cR.window._lastRepeatStats.verdetto)));
    check('...e il campo del picco dice "(3 giri)", con la virgola', /^\d+,\d{3} mm a \d+° \(3 giri\)$/.test(cR.document.mas.mas.value), cR.document.mas.mas.value);

    var opzRip = (/<select id="scanRepeat"[\s\S]*?<\/select>/.exec(ALZATA) || [''])[0];
    check('tendina Ripetizioni: "2 giri", "3 giri (consigliato)", "5 giri"', />2 giri</.test(opzRip) && />3 giri \(consigliato\)</.test(opzRip) && />5 giri</.test(opzRip) && !/\brun\b/.test(opzRip));
    // (le righe di console.* sono diagnostica per chi sviluppa: l'operatore non le vede)
    var stringhe = (VIVO.split('\n').filter(function (r) { return !/console\.(log|warn)/.test(r); }).join('\n').match(/'[^'\n]*'/g) || []).join(' ');
    check('nessun messaggio dice "run", "units", "polling", "Stepper", "jog" o "WebSocket"',
        !/'Run |\brun (in|esclusi|completato|avviato)\b|Prossimo run| units| polling|Stepper in|WebSocket|jog manuale/.test(stringhe));
    // una parola per cosa: la notifica diceva "Scansione completata, CON AVVISI"
    // mentre la riga accanto diceva "Misura sospetta"
    var scansioni = stringhe.match(/'Scansione [^']*'|'[^']*[—-] scansione [^']*'|scan autonomo|Scansione fermata/g) || [];
    check('i messaggi dicono "misura", non "scansione" (completata, incompleta, FERMATA, in corso, non avviata)',
        scansioni.length === 0 && /title: 'Misura completata'/.test(VIVO) && /title: 'Misura in corso'/.test(VIVO) && /'Misura non avviata'/.test(VIVO) &&
        /'Misura FERMATA'/.test(VIVO) && /'Firmware senza misura automatica'/.test(VIVO), scansioni.join(' | '));

    // fumetti
    var tips = [], reTip = /data-tip="([^"]*)"/g, mt;
    while ((mt = reTip.exec(CORPO)) !== null) tips.push(mt[1]);
    function testoTip(h) { return h.replace(/<[^>]*>/g, '').replace(/&#\d+;|&[a-zA-Z]+;/g, 'x'); }
    var lunghi = tips.filter(function (t) { return testoTip(t).length > 300; });
    check('fumetti entro i 300 caratteri (la tendina Ripetizioni arrivava a 784)', tips.length >= 20 && lunghi.length === 0,
        lunghi.map(function (t) { return testoTip(t).slice(0, 30) + '… ' + testoTip(t).length; }).join(' | ') || tips.length + ' fumetti');
    var storia = tips.filter(function (t) { return /non c&apos;&egrave; pi&ugrave;|non c'&egrave; pi&ugrave;|Precisione|prima questo|una volta/.test(t); });
    check('nessun fumetto racconta la storia del programma', storia.length === 0, storia.map(function (t) { return testoTip(t).slice(0, 40); }).join(' | '));
    var inglese = tips.filter(function (t) { return /\b(live|LIVE|bookmark|base circle|base-circle|target|WebSocket|jog|stepper)\b/.test(t); });
    check('nessun fumetto in inglese tecnico (live, bookmark, base circle, target, stepper)', inglese.length === 0, inglese.map(function (t) { return testoTip(t).slice(0, 40); }).join(' | '));

    // spie e leggibilita'
    var spie = CORPO.match(/<span class="status-led" data-tip="<strong>(\w+)<\/strong>[^"]*"[^>]*><span id="\w+" class="led"><\/span><span class="led-nome">(\w+)<\/span><\/span>/g) || [];
    check('ogni spia ha il nome scritto accanto al pallino (Comparatore, Motore, Encoder, Server)', spie.length === 4, spie.length + ' spie');
    check('...con un segno dentro il pallino per ogni stato',
        ['ok', 'warn', 'err', 'run'].every(function (k) { return new RegExp('\\.header \\.status-led \\.led\\.' + k + '::after\\s*\\{\\s*content:').test(STILE); }));
    // nome (13 px, spaziatura 0) e pallino (14 px) li decide style.css per tutte
    // le pagine: Alzata li riportava a 12 px, e con la barra compattata la
    // spaziatura delle lettere lasciava fino a 9 px vuoti per spia
    check('...e nome e pallino come nelle altre pagine: nessuna regola locale su grandezza e spaziatura',
        !/\.header \.status-led \{/.test(STILE) && !/\.header \.status-led \.led \{/.test(STILE) && !/letter-spacing:\s*0\.8px/.test(STILE));
    check('...il segno ha un colore suo: l alone che pulsa resta del colore della spia',
        !/\.header \.status-led \.led \{[^}]*color:/.test(STILE) && /\.header \.status-led \.led\.ok::after\s*\{[^}]*color:/.test(STILE));
    check('pulsanti principali grandi (min-height 40/44 px) ed etichette a 13 px',
        /\.barra-comandi \.btn \{\s*min-height:\s*44px/.test(STILE) && /#rotazioneCard \.btn-sm \{[^}]*min-height:\s*40px/.test(STILE) &&
        /\.card-title \{\s*font-size:\s*13px/.test(STILE) && /\.toggle-label \{\s*font-size:\s*13px/.test(STILE));
    check('Invio nel nome salva, Invio nei gradi ruota', /conInvio\('nome', function \(\) \{ sav\(\); \}\)/.test(VIVO) && /conInvio\('step', function \(\) \{ ruota\(\); \}\)/.test(VIVO));

    // m1/p1: il campo gradi con la virgola
    var campo = { value: '' };
    var cJ = {
        Math: Math, Number: Number, String: String,
        document: { getElementById: function () { return campo; } },
        window: {}, sendSocket: { readyState: 1, send: function () {} }, _assicuraConfigBanco: function () {}
    };
    vm.createContext(cJ);
    vm.runInContext('var oldg = 90.5, rsign = 1, currentMode = { subStepsPerDeg: 2 };', cJ);
    carica(cJ, ['_comandoGrado', '_configPrimaDelMoto', 'm1', 'p1'], SCAN);
    vm.runInContext('p1()', cJ);
    check('tasto +: il campo gradi mostra la posizione con la virgola ("91,5")', campo.value === '91,5', campo.value);

    // riassunto delle scelte
    var cK = { document: { getElementById: function (id) { return id === 'riassuntoScelte' ? cK._r : id === 'scanRepeat' ? { value: '3' } : null; } }, _r: { innerHTML: '' } };
    vm.createContext(cK);
    vm.runInContext('var currentMode = { label: "Race" }, rsign = -1;', cK);
    carica(cK, ['descriviScelte', 'aggiornaRiassuntoScelte']);
    vm.runInContext('aggiornaRiassuntoScelte()', cK);
    check('accanto a START: "Race · 3 giri · verso antiorario"', cK._r.innerHTML === 'Race &middot; 3 giri &middot; verso antiorario', cK._r.innerHTML);
    check('...e si aggiorna a ogni cambio (modalita, ripetizioni, verso)',
        /function onScanModeChange[\s\S]{0,500}aggiornaRiassuntoScelte\(\)/.test(VIVO) && /id="scanRepeat"[^>]*onchange="aggiornaRiassuntoScelte\(\);"/.test(CORPO) &&
        /aggiornaRiassuntoScelte\(\)/.test(estrai(SCAN, 'rlb') || ''));

    await paginaInteraProve();
}

// ===============================================================
//  8. LA PAGINA INTERA, SENZA BROWSER
// ===============================================================
//  Tutti gli script di alzata.html in un DOM finto, con cammes-scan.js e
//  lib/cammes-math.js veri (cammes-ui.js e Chart.js finti), e un banco finto
//  che manda le righe del firmware: "#i:enc:mm" per ogni punto, poi
//  "*sstat u=N" e "*sdone". Qui si provano i casi che passano dal gestore dei
//  messaggi del banco, trovati dalla revisione del 2026-11-22.
function paginaIntera(memoriaSessione) {
    var P = { inviati: [], toasts: [], domande: [], timer: [], caricamento: [], fetches: [], ricariche: 0, voce: [], errori: [] };
    var elementi = {};
    function el(id) {
        if (!elementi[id]) {
            var e = {
                id: id, value: '', disabled: false, checked: false, textContent: '', innerHTML: '', className: '',
                style: { setProperty: function () {} }, offsetHeight: 120, offsetParent: {}, options: [],
                classList: { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} },
                addEventListener: function (t, fn) { (e._ev = e._ev || {})[t] = fn; },
                getContext: function () { return new Proxy({}, { get: function () { return function () { return { width: 0 }; }; } }); },
                querySelector: function () { return null; }, querySelectorAll: function () { return []; },
                focus: function () {}, select: function () {}, scrollIntoView: function () {}, setAttribute: function () {}, appendChild: function () {},
                width: 240, height: 260
            };
            elementi[id] = e;
        }
        return elementi[id];
    }
    el('scanMode').value = 'fast';
    el('scanMode').options = [{ value: 'fast', textContent: '' }, { value: 'race', textContent: '' }];
    el('scanRepeat').value = '1';
    var forms = { cpot: { cpot: el('f_cpot') }, imp2: { imp2: el('f_imp2') }, mas: { mas: el('f_mas') }, salva: { salva: el('f_salva') } };
    function memoria(m) {
        return { _m: m, getItem: function (k) { return this._m[k] === undefined ? null : this._m[k]; },
                 setItem: function (k, v) { this._m[k] = String(v); }, removeItem: function (k) { delete this._m[k]; } };
    }
    var ctx = {
        console: { log: function () {}, warn: function () {}, error: function (x) { P.errori.push(String(x)); } },
        Math: Math, JSON: JSON, Date: Date, Number: Number, String: String, Array: Array, Object: Object, Promise: Promise,
        isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent, Proxy: Proxy, Error: Error,
        navigator: { language: 'it-IT' },
        setTimeout: function (fn, ms) { P.timer.push({ fn: fn, ms: ms }); return P.timer.length; },
        clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
        requestAnimationFrame: function () {},
        getComputedStyle: function () { return { top: '12px', getPropertyValue: function () { return ''; } }; },
        localStorage: memoria({}), sessionStorage: memoria(memoriaSessione || {}),
        location: { hostname: 'localhost', reload: function () { P.ricariche++; }, href: '' },
        fetch: function (url, o) {
            P.fetches.push({ url: url, metodo: (o && o.method) || 'GET', body: o && o.body });
            var dati = /\/api\/files$/.test(url) ? { files: [] } : /firmware-info/.test(url) ? { deviceFirmware: '4.1' } : { ok: true };
            return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(dati); } });
        },
        WebSocket: function (url) { this.url = url; this.readyState = 1; this.send = function (s) { P.inviati.push(s); }; this.close = function () {}; P.socket = this; },
        SpeechSynthesisUtterance: function (t) { P.voce.push(t); },
        Chart: function (c, cfg) { this.data = cfg.data; this.options = cfg.options; this.update = function () {}; },
        ResizeObserver: function () { this.observe = function () {}; }
    };
    ctx.window = ctx;
    ctx.speechSynthesis = { cancel: function () {}, speak: function () {} };
    ctx.addEventListener = function (t, fn) { if (t === 'load') P.caricamento.push(fn); else (ctx._ev = ctx._ev || {})[t] = fn; };
    ctx.document = {
        readyState: 'complete', getElementById: el,
        querySelector: function (s) { return /\.header/.test(s) ? el('header') : /#barraComandi/.test(s) ? el('barraComandi') : null; },
        querySelectorAll: function () { return []; },
        addEventListener: function (t, fn) { (ctx.document._ev = ctx.document._ev || {})[t] = fn; },
        createElement: function () { return el('nuovo' + Math.random()); }, createTextNode: function () { return {}; },
        body: { appendChild: function () {} }, documentElement: { style: { setProperty: function () {} } },
        cpot: forms.cpot, imp2: forms.imp2, mas: forms.mas, salva: forms.salva
    };
    // cammes-ui.js finto: le funzioni comuni che la pagina usa
    ctx.cammesToast = function (o) { P.toasts.push(o); };
    ctx.cammesNum = function (x, d) { var v = Number(x); return isFinite(v) ? v.toFixed(d == null ? 2 : d).replace('.', ',') : 'n.d.'; };
    ctx.cammesEscape = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    ctx.cammesDurata = function (s) { return '~' + s + 's'; };
    ctx.cammesScanProgress = { set: function () {}, reset: function () {} };
    ctx.cammesEta = { create: function () { return { start: function () { return this; }, tick: function () { return 10; }, stop: function () {} }; } };
    ctx.cammesGauge = { create: function () { return { setValue: function () {}, destroy: function () {} }; } };
    ctx.cammesValidate = { error: function () {} };
    ctx.cammesConferma = function (t, testo, si) { var d = { titolo: t, testo: testo, si: si }; P.domande.push(d); return new Promise(function (r) { d.rispondi = r; }); };
    ctx.cammesChiedi = function (t, testo) { var d = { titolo: t, testo: testo }; P.domande.push(d); return new Promise(function (r) { d.rispondi = r; }); };
    ctx.cammesDialog = function (o) { var d = { titolo: o.titolo, testo: o.testo }; P.domande.push(d); return new Promise(function (r) { d.rispondi = function (v) { r({ scelta: v }); }; }); };
    vm.createContext(ctx);
    var re = /<script(?:\s+src="([^"]+)")?\s*>([\s\S]*?)<\/script>/g, m, n = 0;
    while ((m = re.exec(ALZATA)) !== null) {
        var codice;
        if (m[1]) {
            if (m[1] === 'cammes-ui.js' || /chart\.umd/.test(m[1])) continue;   // finti qui sopra
            codice = fs.readFileSync(path.join(__dirname, '..', m[1]), 'utf8');
        } else codice = m[2];
        try { vm.runInContext(codice, ctx, { filename: m[1] || ('inline#' + (++n)) }); }
        catch (e) { P.errori.push((m[1] || ('inline#' + n)) + ': ' + e.message); }
    }
    P.ctx = ctx; P.el = el;
    P.val = function (e) { return vm.runInContext(e, ctx); };
    P.carica = function () { P.caricamento.forEach(function (fn) { fn(); }); if (ctx.onload) ctx.onload(); };
    P.msg = function (d) { P.socket.onmessage({ data: d }); };
    P.scatta = function () { var t = P.timer.slice(); P.timer.length = 0; t.forEach(function (x) { x.fn(); }); };
    P.avvia = function () { P.carica(); P.socket.onopen(); P.msg('0.012'); return P; };   // pagina aperta, banco collegato, comparatore vivo
    P.riga = function () { return el('esitoMisura'); };
    return P;
}
// un giro intero del banco finto (lobo di 9,61 mm a 160°), poi la statistica e la fine
function giroFinto(P, instabili, finoA) {
    for (var k = 1; k <= (finoA || 360); k++) {
        var v = (k >= 130 && k <= 190) ? 9.61 * Math.pow(Math.sin(Math.PI * (k - 130) / 60), 2) : 0.01;
        P.msg('#' + k + ':' + (-4 * k) + ':' + v.toFixed(3));
    }
    if (finoA) return;
    P.msg('*sstat u=' + (instabili || 0));
    P.msg('*sdone');
}

async function paginaInteraProve() {
    console.log('');
    console.log('--- 8. la pagina intera (tutti i suoi script, senza browser) ---');
    var A = paginaIntera();
    check('tutti gli script della pagina si caricano', A.errori.length === 0, A.errori.join(' | '));
    A.avvia();
    A.val('start()');
    giroFinto(A, 0, 360);
    check('ultimo punto: la riga e verde', A.riga().className === 'esito-misura esito-ok', A.riga().className);
    A.voce.length = 0;
    A.msg('*sstat u=3'); A.msg('*sdone');
    check('"*sstat u=3" arriva DOPO l ultimo punto: la riga diventa gialla e dice i punti non stabilizzati',
        A.riga().className === 'esito-misura esito-avviso' && /Misura sospetta<\/b> \(3 punti non stabilizzati\)/.test(A.riga().innerHTML), A.riga().innerHTML.slice(0, 90));
    check('...e la voce lo ridice', A.voce.indexOf('misura terminata, con avvisi') >= 0, JSON.stringify(A.voce));
    A.el('nome').value = 'albero12_asp';
    A.val('sav()'); await sfoga();
    var postA = A.fetches.filter(function (f) { return f.metodo === 'POST'; })[0] || {};
    check('...e il file lo porta, come prima (#puntiInstabili=3)', /#puntiInstabili=3\r\n/.test(postA.body || ''));

    // ripetizioni: la statistica del primo giro non tocca la riga; STOP nella pausa
    var B = paginaIntera().avvia();
    B.el('scanRepeat').value = '3';
    B.val('start()');
    giroFinto(B, 2);
    check('serie di 3 giri: "*sstat" del primo giro non tocca la riga (resta "in corso")',
        B.riga().className === 'esito-misura esito-corso' && /giro 1 di 3/.test(B.riga().innerHTML) && B.val('window._giroInAttesa') === true, B.riga().innerHTML);
    B.el('nome').value = 'albero12_asp';
    B.el('nome')._ev.keydown({ key: 'Enter', preventDefault: function () {} });
    await sfoga();
    check('Invio nel nome nella pausa fra i giri: niente domanda, niente file, "Misura in corso"',
        B.domande.length === 0 && !B.fetches.some(function (f) { return /\/api\/file/.test(f.url); }) &&
        (B.toasts[B.toasts.length - 1] || {}).title === 'Misura in corso', (B.toasts[B.toasts.length - 1] || {}).title);
    B.toasts.length = 0; B.inviati.length = 0;
    B.val('stop()');
    check('STOP nella pausa: "Misura interrotta" (non "Nessuna misura in corso") e la riga lo dice, coi giri',
        (B.toasts[0] || {}).title === 'Misura interrotta' && B.riga().className === 'esito-misura esito-errore' && /Giri completati: 1 di 3/.test(B.riga().innerHTML),
        (B.toasts[0] || {}).title + ' / ' + B.riga().innerHTML.slice(0, 60));
    B.scatta();
    check('...e il giro programmato non riparte da solo', B.inviati.indexOf('x') >= 0 && !B.inviati.some(function (s) { return /^S/.test(s); }), JSON.stringify(B.inviati));

    // Invio nel nome mentre il banco gira
    var Q = paginaIntera().avvia();
    Q.val('start()');
    giroFinto(Q, 0, 120);
    Q.el('nome').value = 'albero12_asp';
    Q.el('nome')._ev.keydown({ key: 'Enter', preventDefault: function () {} });
    await sfoga();
    check('Invio nel nome a misura in corso: niente "Salvare comunque?" su un file parziale',
        Q.domande.length === 0 && !Q.fetches.some(function (f) { return /\/api\/file/.test(f.url); }) && Q.val('startflag') === 1);

    // START rifiutato dal server dopo il ricaricamento dello Zero virtuale
    var C = paginaIntera({ 'cammes-zero-virtuale': JSON.stringify({ esito: 'fatto', dettagli: {}, ts: Date.now(), modo: 'fast', ripetizioni: '1', verso: 1 }) }).avvia();
    check('dopo il ricaricamento la riga dice "Zero virtuale fatto"', /Zero virtuale fatto/.test(C.riga().innerHTML));
    C.val('start()');
    C.msg('#ctl:denied stop-in-corso');
    check('START rifiutato (banco ancora in arresto): la riga non resta su "Misura in corso"',
        C.riga().className === 'esito-misura esito-avviso' && /^<b>Misura non avviata<\/b>: il banco si sta ancora fermando, riprova fra qualche secondo/.test(C.riga().innerHTML),
        C.riga().className + ' ' + C.riga().innerHTML.slice(0, 80));
    check('...tiene com e andato lo Zero virtuale, e la notifica parla di misura', /&middot; <b>Zero virtuale fatto<\/b>$/.test(C.riga().innerHTML) &&
        (C.toasts[C.toasts.length - 1] || {}).title === 'Misura non avviata: banco in arresto');
    C.msg('#ctl:free'); C.msg('0.012');
    C.val('start()'); C.msg('#ctl:denied stop-in-corso');
    check('...anche al secondo rifiuto', /Zero virtuale fatto/.test(C.riga().innerHTML));
    C.msg('#ctl:free'); C.msg('0.012');
    C.val('start()'); giroFinto(C);
    check('...e lo lascia quando una misura arriva in fondo', /Misura completa/.test(C.riga().innerHTML) && !C.val('window._rigaZeroVirtuale'));
    var D = paginaIntera().avvia();
    D.val('start()'); D.msg('#ctl:denied occupato');
    check('START rifiutato perche comanda un altro PC: riga rossa, "sola lettura"',
        D.riga().className === 'esito-misura esito-errore' && /^<b>Misura non avviata<\/b>: sola lettura/.test(D.riga().innerHTML) && !/Zero virtuale/.test(D.riga().innerHTML), D.riga().innerHTML);

    // Zero virtuale confermato ma il comparatore e' muto: niente di svuotato
    var E = paginaIntera().avvia();
    E.val('start()'); giroFinto(E);
    var rigaE = E.riga().innerHTML, piccoE = E.el('f_mas').value;
    E.val('lastSensorRx = 0');
    E.val('ms()');
    (E.domande[E.domande.length - 1] || { rispondi: function () {} }).rispondi(true); await sfoga();
    check('Zero virtuale che non parte: grafico, picco e riga restano quelli della misura, ancora da salvare',
        E.val('startflag') === 0 && E.val('labms') === 0 && E.val('max') > 9.6 && E.el('f_mas').value === piccoE && piccoE !== '' &&
        E.riga().innerHTML === rigaE && E.val('window._misuraNonSalvata') === true, 'picco="' + E.el('f_mas').value + '"');
    E.el('nome').value = 'albero12_asp';
    E.val('sav()'); await sfoga();
    var postE = E.fetches.filter(function (f) { return f.metodo === 'POST'; })[0] || {};
    check('...e salvandola il file ha il picco vero (prima: #picco=0.000@0)', /#picco=9\.6\d\d@160\r\n/.test(postE.body || ''), (/#picco=[^\r]*/.exec(postE.body || '') || [''])[0]);

    // STOP e riavvio dell'Arduino durante Zero virtuale e verifica
    var G = paginaIntera().avvia();
    G.val('ms()'); giroFinto(G, 0, 40);
    G.val('_pageLoadTs = Date.now() - 20000');
    G.msg('CAMMES Uno ready');
    check('Arduino riavviato durante lo Zero virtuale: la riga dice "Zero virtuale interrotto", non "Misura NON valida"',
        /^<b>Zero virtuale interrotto<\/b> \(l'Arduino si &egrave; riavviato\)/.test(G.riga().innerHTML), G.riga().innerHTML.slice(0, 80));
    var W = paginaIntera().avvia();
    W.val('benchVerifyStart()'); W.domande[0].rispondi(true); await sfoga();
    giroFinto(W, 0, 30);
    W.toasts.length = 0;
    W.val('stop()');
    check('STOP nella verifica banco: notifica "Verifica banco interrotta" come la riga',
        (W.toasts[0] || {}).title === 'Verifica banco interrotta' && /^<b>Verifica banco interrotta<\/b>/.test(W.riga().innerHTML), (W.toasts[0] || {}).title);

    // l'avviso nella barra: comparatore spento o scollegato
    var H = paginaIntera().avvia();
    H.val('_pageLoadTs = Date.now() - 20000; lastSensorRx = Date.now() - 10000; lastSensorAnyRx = Date.now(); updateStatusLeds();');
    check('comparatore senza letture valide (spia gialla): la barra dice perche START non parte',
        /^Comparatore: nessuna lettura valida \(spento o scollegato\)\. START non parte/.test(H.el('connBanner').textContent) && H.el('connBanner').style.display === '',
        H.el('connBanner').textContent);
    H.val('lastSensorRx = Date.now(); updateStatusLeds();');
    check('...e sparisce quando il comparatore torna', H.el('connBanner').style.display === 'none');
    H.val('lastSensorRx = Date.now() - 10000; window._waiting_mv = true; updateStatusLeds();');
    check('...non durante lo spostamento finale dello Zero virtuale (le letture tacciono apposta)', H.el('connBanner').style.display === 'none');

    // motore sbloccato: l'angolo dell'encoder con i suoi due decimali
    H.val('window._waiting_mv = false; motorFree = true;');
    H.msg('encoder=49 deg=12.25');
    check('motore sbloccato: "12,25° enc.", come lo salva Memorizza posizione (prima "12,3°")', H.el('f_imp2').value === '12,25° enc.', H.el('f_imp2').value);

    // un clic sul riassunto: con le ripetizioni apre anche Avanzate
    var V = paginaIntera(); V.carica();
    V.el('scanAdvanced').style.display = 'none';
    V.val('vaiAlleScelte()');
    check('clic sul riassunto con 1 giro: Avanzate resta chiuso', V.el('scanAdvanced').style.display === 'none');
    V.el('scanRepeat').value = '3';
    V.val('vaiAlleScelte()');
    check('...con 3 giri apre Avanzate, dove si cambiano i giri', V.el('scanAdvanced').style.display === '');
}

main().catch(function (e) { check('esecuzione', false, String(e && e.stack || e)); }).then(function () {
    console.log('');
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: comandi e esito sempre visibili, nomi che dicono l effetto, nessuna');
    console.log('misura persa senza domanda, finestre della pagina, numeri con la virgola.');
    process.exit(0);
});
