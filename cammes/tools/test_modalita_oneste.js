// =============================================================
//  test_modalita_oneste.js — le modalita' dicono cio' che fanno, e il
//  comparatore non viene interrogato piu' in fretta di quanto risponde
// =============================================================
//  Verifica funzionale del 2026-11-14. Due difetti con la stessa radice: il
//  parametro "letture per punto" (samples, comando 'c') e' rimasto nella
//  pagina dopo che il firmware ha smesso di usarlo in scansione.
//
//  1) LA DESCRIZIONE ERA FALSA. Tendina, fumetto, tour e manuale dicevano
//     "Precisione: media 3 letture per grado" (e lo stesso per Race). Nel
//     firmware 4.1 la scansione — autonoma (S) e classica (p/q) — legge con
//     readSensorStableMm(): due frame consecutivi concordi entro 5 µm, sempre,
//     in ogni modalita'. La media di cfgSamples campioni (readSensorMm) la usa
//     UN SOLO comando: 'm', la lettura a riposo. Sul banco emulato Veloce e
//     Precisione danno la stessa curva, differenza massima 0,000 mm. Cio' che
//     distingue davvero le modalita' e' il passo (1° o 0,5°) e la pausa di
//     assestamento dopo ogni movimento (30 / 50 / 80 ms).
//
//  2) E QUEL PARAMETRO FACEVA DANNO A RIPOSO. Con 'c3' ogni lettura a riposo
//     aspetta tre frame del comparatore (~0,3 s). La pagina ne chiedeva una
//     ogni 0,2 s, senza guardare se la precedente era tornata: le richieste si
//     accodavano nel buffer seriale dell'Arduino (64 byte) fino a riempirlo —
//     display in ritardo di molti secondi e comandi veri (START, Ruota) che
//     arrivano tardi o troncati. Lo stesso accade in OGNI modalita' quando il
//     comparatore e' spento o in auto-spegnimento: li' una lettura dura 0,9 s
//     (il timeout del firmware) e la pagina continuava a chiederne cinque al
//     secondo.
//
//  La cura: tutte le modalita' mandano 'c1' (in scansione non cambia nulla, a
//  riposo la lettura torna a un frame), e il polling aspetta la risposta prima
//  di chiedere ancora. La stima di durata della Race, che risaliva al motore
//  classico con media (276 s, luglio), e' ricalcolata dal tempo misurato della
//  Veloce piu' la differenza di pausa: resta una STIMA, da confermare al banco
//  con una cronometrata.
//
//  3) E "PRECISIONE" NON AVEVA PIU' RAGIONE DI ESISTERE (decisione dell'officina,
//     2026-11-14). Tolta la media che non faceva, restava identica alla Veloce
//     salvo 20 ms di pausa in piu' a punto: una scelta senza criterio per chi
//     sta al banco. Le modalita' sono due: Veloce e Race.
//
//  Uso: node tools/test_modalita_oneste.js   (exit 0 = ok)

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function leggi(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n'); }
function senzaCommenti(t) { return t.split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n'); }

console.log('=============================================================');
console.log(' MODALITA DI SCANSIONE: dicono cio che fanno');
console.log('=============================================================');

var ALZATA = leggi('alzata.html');
var UI = leggi('cammes-ui.js');
var MANUALE = leggi(path.join('..', 'MANUALE_OPERATORE.md'));
var FW = leggi(path.join('..', 'master', 'master.ino'));
var VIVO = senzaCommenti(ALZATA);

function estrai(nome) {
    var re = new RegExp('^function ' + nome + '\\s*\\([^)]*\\)\\s*\\{', 'm');
    var m = re.exec(ALZATA);
    if (!m) return null;
    var fine = ALZATA.indexOf('\n}\n', m.index);
    return fine < 0 ? null : ALZATA.substring(m.index, fine + 3);
}

// ---------------------------------------------------------------
console.log('--- la premessa, dal sorgente del firmware ---');
// Tolti i commenti '//' di riga e di coda (nel .ino non ci sono URL)
var fwVivo = FW.split('\n').map(function (r) { return r.replace(/\/\/.*$/, ''); }).join('\n');
var usiMedia = (fwVivo.match(/readSensorMm\s*\(\s*\)/g) || []).length;   // comprende la definizione
check('la media di N campioni (readSensorMm) ha un solo chiamante', usiMedia === 2, (usiMedia - 1) + ' chiamate');
check('...ed e la lettura a riposo "m"', /c == 'm'\)\s*\{\s*emitMeasureOnly\(readSensorMm\(\)\)/.test(fwVivo));
check('la scansione autonoma legge col criterio a due frame', /float mm = readSensorStableMm\(\);/.test(fwVivo));
check('...e anche il passo classico p/q',
    /c == 'p'\)[^\n]*readSensorStableMm\(\)/.test(fwVivo) && /c == 'q'\)[^\n]*readSensorStableMm\(\)/.test(fwVivo));
var corpoStabile = /float readSensorStableMm\(\) \{[\s\S]*?\n\}/.exec(fwVivo);
check('...che non guarda cfgSamples', !!corpoStabile && !/cfgSamples/.test(corpoStabile[0]));

// ---------------------------------------------------------------
console.log('');
console.log('--- quindi nessun testo promette una media in scansione ---');
var RE_MEDIA = /media\s+(di\s+)?\d+\s+letture|media\s+\d+\s+campioni/i;
function primaOccorrenza(t) { var m = RE_MEDIA.exec(t); return m ? t.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ') : ''; }
check('pagina Alzata (tendina, fumetti, notifiche)', !RE_MEDIA.test(VIVO), primaOccorrenza(VIVO));
check('tour guidato', !RE_MEDIA.test(senzaCommenti(UI)), primaOccorrenza(senzaCommenti(UI)));
check('manuale operatore', !RE_MEDIA.test(MANUALE), primaOccorrenza(MANUALE));

// le modalita' vere, lette dal sorgente
var blocco = /var SCAN_MODES = \{[\s\S]*?\n\};/.exec(ALZATA);
var MODI = blocco ? vm.runInNewContext(blocco[0].replace(/^var SCAN_MODES = /, '(').replace(/;$/, ')')) : null;
check('SCAN_MODES e leggibile', !!MODI && !!MODI.fast && !!MODI.race);
if (MODI) {
    check('le modalita sono DUE: Veloce e Race', Object.keys(MODI).sort().join(',') === 'fast,race', Object.keys(MODI).join(','));
    var opzioni = (/<select id="scanMode"[\s\S]*?<\/select>/.exec(ALZATA) || [''])[0].match(/<option value="[^"]+"/g) || [];
    check('...e la tendina offre quelle due e basta', opzioni.join(' ') === '<option value="fast" <option value="race"', opzioni.join(' '));
    check('nessun testo invita piu a scegliere "Precisione" (tour, manuale)',
        !/Precisione/.test(senzaCommenti(UI)) && !/Precisione/.test(MANUALE));
    check('tutte le modalita mandano c1: a riposo una lettura = un frame',
        Object.keys(MODI).every(function (k) { return MODI[k].samples === 1; }),
        Object.keys(MODI).map(function (k) { return k + ':c' + MODI[k].samples; }).join(' '));
    // la descrizione che l'operatore legge nella tendina, prodotta dalle funzioni vere
    var fnD = estrai('descriviModalita'), fnE = estrai('etaModalita');
    check('le funzioni che scrivono la tendina ci sono', !!fnD && !!fnE);
    if (fnD && fnE) {
        var ctx = { window: {}, String: String };
        vm.createContext(ctx);
        vm.runInContext(fnE + '\n' + fnD, ctx);
        var testi = {};
        Object.keys(MODI).forEach(function (k) { ctx._m = MODI[k]; testi[k] = vm.runInContext('descriviModalita(_m)', ctx); });
        console.log('        tendina: ' + Object.keys(testi).map(function (k) { return '"' + testi[k] + '"'; }).join('  '));
        check('la tendina dichiara il passo', /1°/.test(testi.fast) && /0,5°/.test(testi.race));
        // La pausa di assestamento e' l'altra differenza vera, ma NON sta nella
        // tendina: con "…, pausa 30 ms" l'etichetta superava la larghezza della
        // tendina e usciva troncata ("Veloce · ~50s · 1°, p"). La spiega il fumetto.
        var larga = Object.keys(testi).map(function (k) { return testi[k].length; }).reduce(function (a, b) { return Math.max(a, b); }, 0);
        check('le etichette stanno nella tendina (al piu 24 caratteri)', larga <= 24, 'la piu lunga: ' + larga + ' caratteri');
        var fumettoScelta = (/<strong>Quale scegliere\?<\/strong>([^"]*)"/.exec(ALZATA) || ['', ''])[1];
        check('la pausa di assestamento la spiega il fumetto accanto (con i valori veri)',
            fumettoScelta.indexOf(MODI.race.settleMs + ' ms') >= 0 && fumettoScelta.indexOf(String(MODI.fast.settleMs)) >= 0, fumettoScelta.replace(/<[^>]+>/g, '').slice(0, 150));
        check('le due modalita non si descrivono uguali', testi.fast.replace(/Veloce/, '') !== testi.race.replace(/Race/, ''));
    }

    // ---------------------------------------------------------------
    console.log('');
    console.log('--- la stima di durata e coerente con cio che la modalita fa ---');
    // Race: il doppio dei punti, ognuno al piu' lungo come un punto Veloce + la
    // pausa in piu' (il mezzo passo dura meno del passo intero: e' un tetto).
    // I 280 s di prima venivano dal motore classico con la media a 3 campioni,
    // che non esiste piu'.
    var tettoRace = MODI.race.totalSteps * (MODI.fast.timeSec / MODI.fast.totalSteps + (MODI.race.settleMs - MODI.fast.settleMs) / 1000);
    check('Race: piu della Veloce, non oltre il tetto calcolato da essa (' + tettoRace.toFixed(0) + ' s), con margine',
        MODI.race.timeSec > MODI.fast.timeSec && MODI.race.timeSec <= tettoRace + 10,
        'Veloce ' + MODI.fast.timeSec + ' s, Race ' + MODI.race.timeSec + ' s');
}

// ---------------------------------------------------------------
console.log('');
console.log('--- il polling aspetta la risposta prima di chiedere ancora ---');
var NOMI = ['pollAttivo', '_avviaPollNormale', 'bancoInSolaLettura', '_chiediSensore', '_sensoreHaRisposto'];
var src = {}, mancanti = [];
NOMI.forEach(function (n) { src[n] = estrai(n); if (!src[n]) mancanti.push(n); });
check('la pagina ha il freno sul polling', mancanti.length === 0, mancanti.length ? 'mancano: ' + mancanti.join(', ') : '');
if (!mancanti.length) {
    var p = { ora: 0, inviati: [], intervalli: [] };
    var c2 = {
        Date: { now: function () { return p.ora; } }, Math: Math,
        window: {}, console: { warn: function () {} },
        setInterval: function (fn, ms) { p.intervalli.push({ fn: fn, ms: ms, vivo: true, prossimo: ms }); return p.intervalli.length; },
        clearInterval: function (id) { if (id && p.intervalli[id - 1]) p.intervalli[id - 1].vivo = false; },
        sendSocket: { readyState: 1, send: function (s) { p.inviati.push({ t: p.ora, s: s }); } }
    };
    c2.window.window = c2.window;
    vm.createContext(c2);
    var dichiarazioni = (/var _pollSensoreInVolo[^\n]*\n(?:var [^\n]*\n)*/.exec(ALZATA) || [''])[0];
    check('lo stato del freno e dichiarato', /POLL_SENSORE_ATTESA_MS\s*=\s*\d+/.test(dichiarazioni), dichiarazioni.split('\n')[0].slice(0, 80));
    vm.runInContext('var ruoloBanco = "controller", _tickSensore = 0, pollEncoderId = null, pollSensorId = null, startflag = 0;\n' + dichiarazioni, c2);
    NOMI.forEach(function (n) { vm.runInContext(src[n], c2); });
    vm.runInContext('_avviaPollNormale();', c2);

    // Simulazione a tempo: un comparatore che risponde dopo `latenza` ms,
    // servito UNA richiesta alla volta come fa il firmware (bloccante).
    function simula(latenza, durataMs) {
        p.ora = 0; p.inviati.length = 0;
        p.intervalli.forEach(function (t) { t.prossimo = t.ms; });
        vm.runInContext('_pollSensoreInVolo = 0;', c2);
        var coda = [], liberoDa = 0, maxCoda = 0, risposte = 0;
        for (p.ora = 0; p.ora <= durataMs; p.ora += 10) {
            // il firmware finisce la lettura in corso
            if (coda.length && p.ora >= coda[0].pronta) { coda.shift(); risposte++; vm.runInContext('_sensoreHaRisposto();', c2); }
            var prima = p.inviati.length;
            p.intervalli.forEach(function (t) { if (t.vivo && p.ora >= t.prossimo) { t.prossimo += t.ms; t.fn(); } });
            for (var q = prima; q < p.inviati.length; q++) {
                if (p.inviati[q].s !== 'm') continue;
                var inizio = Math.max(p.ora, coda.length ? coda[coda.length - 1].pronta : liberoDa);
                coda.push({ pronta: inizio + latenza });
            }
            if (coda.length > maxCoda) maxCoda = coda.length;
        }
        var nM = p.inviati.filter(function (x) { return x.s === 'm'; }).length;
        return { richieste: nM, maxCoda: maxCoda, risposte: risposte };
    }
    var veloce = simula(100, 20000);     // comparatore sano: un frame ~100 ms
    check('comparatore sano: il display resta vivo (almeno 4 letture al secondo)', veloce.richieste >= 80, veloce.richieste + ' richieste in 20 s');
    check('...senza mai accodare', veloce.maxCoda <= 1, 'coda massima ' + veloce.maxCoda);
    var lento = simula(300, 20000);      // lettura da 3 frame (il vecchio c3)
    check('lettura lenta (0,3 s): nessuna coda nell Arduino', lento.maxCoda <= 1, 'coda massima ' + lento.maxCoda + ', ' + lento.richieste + ' richieste');
    var spento = simula(900, 20000);     // comparatore spento: timeout del firmware
    check('comparatore spento (0,9 s a lettura): nessuna coda', spento.maxCoda <= 1, 'coda massima ' + spento.maxCoda + ', ' + spento.richieste + ' richieste');
    check('...e si continua a chiedere, per vederlo tornare', spento.richieste >= 15, spento.richieste + ' richieste in 20 s');
    // una risposta persa non blocca per sempre
    var base = 500000;
    p.ora = base; p.inviati.length = 0;
    vm.runInContext('_pollSensoreInVolo = 0; _chiediSensore();', c2);
    var attesa = vm.runInContext('POLL_SENSORE_ATTESA_MS', c2);
    p.ora = base + attesa - 50;
    check('finche la risposta puo ancora arrivare non si richiede', vm.runInContext('_chiediSensore()', c2) === false);
    p.ora = base + attesa + 50;
    check('passata l attesa massima si richiede di nuovo (risposta persa)', vm.runInContext('_chiediSensore()', c2) === true);
}
check('anche il polling a motore sbloccato passa dal freno',
    /pollFreeSensorId = setInterval\(function \(\) \{[\s\S]{0,200}_chiediSensore\(\)/.test(VIVO));
check('la risposta del comparatore lo sblocca', /isNumericMeasure\) \{[\s\S]{0,200}_sensoreHaRisposto\(\)/.test(VIVO));
check('...e pure la fine di un movimento (durante il moto il firmware scarta le richieste)',
    /\*mv[\s\S]{0,400}_sensoreHaRisposto\(\)|_sensoreHaRisposto\(\)[\s\S]{0,200}\*mv/.test(VIVO));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
console.log('VALIDATO: le modalita si descrivono per passo e pausa (cio che cambia davvero),');
console.log('nessuna promette una media che il firmware non fa, e il comparatore viene');
console.log('interrogato al ritmo a cui risponde.');
process.exit(0);
