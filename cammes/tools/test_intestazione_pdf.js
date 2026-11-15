// =============================================================
//  test_intestazione_pdf.js — il nome dell'officina in testa a TUTTI i PDF
// =============================================================
//  Verifica funzionale del 2026-11-14, decisione dell'officina.
//
//  In Home c'e' il campo "La mia officina — Ragione sociale (per i referti
//  PDF)". Ma il nome usciva su UN SOLO documento: la Scheda camma. Il report di
//  analisi, il race report e la scheda tecnica della singola misura — tre
//  referti su quattro — erano anonimi.
//
//  Ora lo scrive una funzione sola (cammes-ui.js: cammesIntestazionePdf), che
//  tutti e quattro i documenti chiamano. Qui si prova che:
//    - la funzione scrive il nome a destra, nel posto chiesto;
//    - un nome lungo viene rimpicciolito finche' entra (non deve finire sopra
//      il titolo);
//    - senza nome non scrive niente;
//    - ogni documento la chiama davvero, e la Home tiene il nome aggiornato
//      anche subito dopo averlo salvato.
//
//  Uso: node tools/test_intestazione_pdf.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggi(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n'); }

console.log('=============================================================');
console.log(' INTESTAZIONE OFFICINA: su tutti i PDF, non su uno');
console.log('=============================================================');

var UI = leggi('cammes-ui.js'), ANALISI = leggi('analisi.html'), HOME = leggi('home.html');
var MANUALE = leggi(path.join('..', 'MANUALE_OPERATORE.md'));

// ---------------------------------------------------------------
console.log('--- la funzione condivisa ---');
var m = /function intestazionePdf\(doc, nome, xDestra, y, larghezzaMax, corpoMax\) \{[\s\S]*?\n  \}/.exec(UI);
check('cammes-ui.js ha la funzione', !!m);
check('...e la espone alle pagine', /window\.cammesIntestazionePdf = intestazionePdf/.test(UI));
if (m) {
    var intestazionePdf = vm.runInNewContext('(' + m[0] + ')');
    // documento finto: la larghezza di un testo cresce col corpo, come in jsPDF
    function documento() {
        var d = { corpo: 10, scritti: [],
            setFontSize: function (c) { d.corpo = c; },
            getTextWidth: function (t) { return String(t).length * d.corpo * 0.18; },
            text: function (t, x, y) { d.scritti.push({ t: t, x: x, y: y, corpo: d.corpo, largo: d.getTextWidth(t) }); } };
        return d;
    }
    var d1 = documento();
    var r1 = intestazionePdf(d1, 'Officina di prova', 196, 28, 112, 13);
    check('con un nome lo scrive', r1 === true && d1.scritti.length === 1 && d1.scritti[0].t === 'Officina di prova', JSON.stringify(d1.scritti));
    check('...allineato a destra sul margine chiesto', d1.scritti.length === 1 && Math.abs(d1.scritti[0].x + d1.scritti[0].largo - 196) < 1e-9);
    check('...sulla riga chiesta e col corpo pieno (entra)', d1.scritti.length === 1 && d1.scritti[0].y === 28 && d1.scritti[0].corpo === 13);

    var lungo = 'Rettifiche e Preparazioni Motori Fratelli Esempio di Paese Snc';   // 62 caratteri
    var d2 = documento();
    intestazionePdf(d2, lungo, 196, 28, 112, 13);
    check('un nome lungo viene accorciato a 60 caratteri', d2.scritti[0].t.length === 60, d2.scritti[0].t.length + ' caratteri');
    check('...e rimpicciolito finche entra nello spazio', d2.scritti[0].largo <= 112 && d2.scritti[0].corpo < 13,
        'corpo ' + d2.scritti[0].corpo + ', largo ' + d2.scritti[0].largo.toFixed(1) + ' mm su 112');
    check('...senza uscire dal margine sinistro dello spazio', d2.scritti[0].x >= 196 - 112 - 1e-9, 'x=' + d2.scritti[0].x.toFixed(1));

    [undefined, null, '', '   '].forEach(function (vuoto) {
        var d3 = documento();
        var r3 = intestazionePdf(d3, vuoto, 196, 28, 112, 13);
        check('senza nome (' + JSON.stringify(vuoto) + ') non scrive niente', r3 === false && d3.scritti.length === 0);
    });
    var d4 = documento();
    intestazionePdf(d4, '  Officina   con   spazi  ', 196, 28, 112, 13);
    check('gli spazi in eccesso si puliscono', d4.scritti[0].t === 'Officina con spazi', JSON.stringify(d4.scritti[0].t));
}

// ---------------------------------------------------------------
console.log('');
console.log('--- i quattro documenti la portano ---');
function corpoFunzione(src, nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var mm = re.exec(src);
    if (!mm) return '';
    var fine = src.indexOf('\n}\n', mm.index);
    return fine < 0 ? '' : src.substring(mm.index, fine + 3);
}
var chiamata = /cammesIntestazionePdf\(doc, window\._officina,/;
check('report di analisi (PDF)', chiamata.test(corpoFunzione(ANALISI, 'exportPDF')));
check('race report', chiamata.test(corpoFunzione(ANALISI, 'exportRaceReport')));
check('scheda tecnica della singola misura (Home)', chiamata.test(corpoFunzione(HOME, 'exportSinglePDF')));
check('scheda camma', /window\._officina/.test(corpoFunzione(ANALISI, 'exportCamCard')));
check('la pagina Analisi carica il nome dalle impostazioni', /fetch\('\/api\/settings'\)[\s\S]{0,200}window\._officina = s\.officina\.nome/.test(ANALISI));
var initHome = corpoFunzione(HOME, 'initSettingsUI'), salvaHome = corpoFunzione(HOME, 'saveOfficina');
check('la Home pure', /window\._officina = /.test(initHome));
check('...e lo aggiorna appena salvato, senza ricaricare', /if \(d\.ok\) window\._officina = nome\.trim\(\)/.test(salvaHome));

// ---------------------------------------------------------------
console.log('');
console.log('--- e cio che si legge lo dice ---');
var fumetto = (/La mia officina <span class="help-icon" data-tip="([^"]*)"/.exec(HOME) || ['', ''])[1];
check('il fumetto in Home parla di tutti i PDF, non della sola scheda camma',
    /tutti i PDF/.test(fumetto) && /race report/.test(fumetto) && /singola misura/.test(fumetto), fumetto.replace(/<[^>]+>/g, '').slice(0, 120));
check('il manuale pure', /Tutti i PDF portano in testa la tua intestazione/.test(MANUALE) && /in testa a tutti i PDF/.test(MANUALE));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: una sola funzione scrive l intestazione dell officina, e la chiamano');
console.log('tutti e quattro i PDF.');
process.exit(0);
