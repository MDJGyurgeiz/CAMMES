// =============================================================
//  test_tempi_scansione.js — una stima di durata, non cinque
// =============================================================
//  La durata stimata della scansione era ricopiata a mano in cinque punti, con
//  tre formattazioni diverse. Per la modalita' Veloce l'operatore leggeva:
//      tendina   ~45s      (stringa fissa nell'HTML)
//      barra     ~50s      (timeSec, formattato da cammes-ui)
//      toast     ~1m       (timeSec/60 arrotondato)
//      confirm   ~45 s     (stringa fissa in benchVerifyStart)
//      tour      ~45 s     (stringa fissa in cammes-ui)
//  Quattro numeri per la stessa attesa, e nessuno sbagliato di suo: era la
//  copia a moltiplicarli.
//
//  Scritto PRIMA del fix: fallisce sulla versione precedente.
//
//  Uso: node tools/test_tempi_scansione.js   (exit 0 = ok)
var fs = require('fs');
var path = require('path');

function leggi(rel) {
    return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
}
var ALZATA = leggi('alzata.html');
var UI = leggi('cammes-ui.js');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' DURATA DELLA SCANSIONE: un numero solo, un formato solo');
console.log('=============================================================');

// ---------- il formattatore e' uno ----------
console.log('--- un solo formattatore ---');
check('cammes-ui espone formattaDurata', /window\.cammesDurata = formattaDurata/.test(UI));
check('la barra di avanzamento lo usa',
    /eta\.textContent = formattaDurata\(/.test(UI), 'non deve formattare per conto suo');
// riproduco la funzione per confrontare i numeri
var m = /function formattaDurata\(sec\) \{[\s\S]*?\n  \}/.exec(UI);
check('la funzione e leggibile dal test', !!m);
var formatta = m ? new Function('sec', m[0].replace(/^function formattaDurata\(sec\) \{/, '').replace(/\}$/, '')) : null;

// ---------- niente durate scritte a mano ----------
console.log('--- niente durate ricopiate a mano ---');
function fuoriDaiCommenti(testo) {
    return testo.split('\n').filter(function (r) {
        return !/^\s*(\/\/|\*|<!--)/.test(r);
    }).join('\n');
}
var alzataViva = fuoriDaiCommenti(ALZATA);
var uiVivo = fuoriDaiCommenti(UI);
// Solo alzata.html: e' la pagina della scansione. In cammes-ui.js esistono
// altre stime legittime e slegate da questa (per esempio il flash del firmware,
// "~15 s"), che non vanno confuse con la durata di una scansione.
var copie = (alzataViva.match(/~\s*\d+\s*(?:s\b|m\d*s?\b)|\b\d+m\d+s\b/g) || []);
check('nessuna durata di scansione scritta a mano in alzata.html',
    copie.length === 0, copie.length ? copie.join(', ') : 'nessuna');
// Nel tour, la sola voce che parla della tendina di scansione.
var voceTour = /\{ sel: '#scanMode',[\s\S]*?\}/.exec(uiVivo);
check('la voce del tour sulla modalita esiste', !!voceTour);
check('e non contiene una durata',
    !voceTour || !/~\s*\d+\s*(?:s|m)/.test(voceTour[0]),
    voceTour ? (voceTour[0].match(/~\s*\d+\s*(?:s|m)/) || ['nessuna'])[0] : '');
check('le <option> della tendina non contengono una durata',
    !/<option value="(fast|std|race)"[^>]*>[^<]*~/.test(ALZATA),
    'le etichette le scrive popolaModalita()');
check('e vengono generate all avvio',
    /popolaModalita\(\)/.test(ALZATA) && /function popolaModalita/.test(ALZATA));

// ---------- ogni punto legge lo stesso timeSec ----------
console.log('--- ogni punto legge lo stesso numero ---');
check('il toast dopo START compone la durata da etaModalita',
    /'Modalit&agrave; ' \+ currentMode\.label \+ ' &middot; ' \+ etaModalita\(currentMode\)/.test(ALZATA),
    'prima faceva Math.round(timeSec/60) + "m"');
check('il confirm della verifica banco pure',
    /etaModalita\(SCAN_MODES\.fast\)/.test(ALZATA));
check('la barra riceve timeSec, non un testo',
    /cammesScanProgress\.set\(0, currentMode\.totalSteps, currentMode\.timeSec\)/.test(ALZATA));
check('il tour non tiene una copia del numero',
    !/Veloce<\/b> \(~/.test(UI), 'deve rimandare alla tendina');

// ---------- i numeri veri, come li legge l'operatore ----------
if (formatta) {
    console.log('--- cosa legge l operatore, per modalita ---');
    var modi = {};
    var blocco = /var SCAN_MODES = \{[\s\S]*?\n\};/.exec(ALZATA);
    if (blocco) {
        (blocco[0].match(/(\w+):\s*\{[^}]*timeSec:\s*(\d+)/g) || []).forEach(function (s) {
            var mm = /(\w+):\s*\{[^}]*timeSec:\s*(\d+)/.exec(s);
            modi[mm[1]] = Number(mm[2]);
        });
    }
    check('le tre modalita dichiarano un timeSec', Object.keys(modi).length === 3,
        JSON.stringify(modi));
    Object.keys(modi).forEach(function (k) {
        console.log('        ' + k.padEnd(6) + ' timeSec ' + String(modi[k]).padStart(3) + ' -> ' + formatta(modi[k]));
    });
    // il valore mostrato e' lo stesso ovunque perche' viene dallo stesso posto:
    // qui si verifica solo che il formato non produca stringhe diverse per lo
    // stesso numero (era il caso di ~50s / ~1m).
    check('lo stesso timeSec produce sempre la stessa stringa',
        formatta(50) === formatta(50) && formatta(50) !== formatta(140));
    check('sotto il minuto si scrive in secondi', /s$/.test(formatta(50)), formatta(50));
    check('sopra il minuto si scrive in minuti e secondi', /m/.test(formatta(140)), formatta(140));
}

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: la durata stimata esce da un solo numero (SCAN_MODES.timeSec)');
console.log('e da un solo formattatore, quindi tendina, barra, toast e confirm non');
console.log('possono piu dire tre cose diverse sulla stessa attesa.\n');
