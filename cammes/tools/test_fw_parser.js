// =============================================================
//  REGRESSIONE FIRMWARE — robustezza parser (AUDIT FW-04 / FW-09)
// =============================================================
// Il firmware gira su AVR e non è eseguibile in Node, ma queste protezioni
// sono facili da erodere in un refactor. Questo test è un guardiano a livello
// di sorgente: fa fallire `npm test` se qualcuno reintroduce atoi nei comandi
// di configurazione, toglie lo scarto-fino-a-fine-riga sull'overflow, o rimuove
// il NACK "*busy". SAREBBE fallito prima della fix (i config usavano atoi).
// La validazione FUNZIONALE vera è al banco (tools/bench_fw34_test.js).
var fs = require('fs'), path = require('path');

var srcPath = path.join(__dirname, '..', '..', 'master', 'master.ino');
var src = fs.readFileSync(srcPath, 'utf8');
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' REGRESSIONE FIRMWARE — parser robusto (FW-04 / FW-09)');
console.log('=============================================================');

// Isola il blocco dei comandi di configurazione (dal primo handler 'c' fino
// all'handler 't' del tono) per cercarvi atoi SOLO lì.
var cfgStart = src.indexOf("cmdBuf[0] == 'c'");
var cfgEnd = src.indexOf("cmdBuf[0] == 't'");
check('blocco handler di configurazione individuato', cfgStart > 0 && cfgEnd > cfgStart,
    'c@' + cfgStart + ' t@' + cfgEnd);
var cfgBlock = (cfgStart > 0 && cfgEnd > cfgStart) ? src.slice(cfgStart, cfgEnd) : '';

// FW-04: nessuna CHIAMATA atoi( nei parser di configurazione (accettava
// spazzatura in coda e overflowava in silenzio). Deve usare parseIntStrict.
// NB: si cerca "atoi(" (la chiamata), non la parola nei commenti.
check('FW-04: nessuna chiamata atoi() nei comandi di configurazione', cfgBlock.indexOf('atoi(') === -1,
    cfgBlock.indexOf('atoi(') === -1 ? 'ok' : 'atoi() ancora presente');
check('FW-04: helper parseIntStrict definito', /bool\s+parseIntStrict\s*\(/.test(src));

// Ogni comando di config deve avere il suo ramo d'errore esplicito.
['c', 'r', 'w', 'u', 'a', 'g', 'k'].forEach(function (cmd) {
    check("FW-04: comando '" + cmd + "' emette *err su input non valido",
        src.indexOf('*err ' + cmd) !== -1);
});

// FW-04: overflow di riga → scarto fino a fine riga + *err ovf (prima il
// frammento residuo diventava un comando spurio).
check('FW-04: overflow → flag g_discardLine', /g_discardLine/.test(src));
check('FW-04: overflow → *err ovf', src.indexOf('*err ovf') !== -1);

// FW-09: NACK *busy per comando durante il moto (prima scartato in silenzio).
check('FW-09: helper nackBusyIfCmd definito', /void\s+nackBusyIfCmd\s*\(/.test(src));
check('FW-09: evento *busy presente', src.indexOf('*busy') !== -1);
check('FW-09: nackBusyIfCmd chiamato in stepperMove e autonomousScan',
    (src.match(/nackBusyIfCmd\s*\(/g) || []).length >= 3);   // 1 def + >=2 chiamate

// FW-03: fault locale encoder nello scan autonomo (encoder fermo mentre il
// motore gira → *fault enc + *sabort). Guardia sulla presenza della logica.
check('FW-03: evento *fault enc presente', src.indexOf('*fault enc') !== -1);
check('FW-03: finestra di controllo encoder (ENC_CHK_WINDOW)', /ENC_CHK_WINDOW/.test(src));
check('FW-03: soglia basata su cfgStepsPerUnit (counts attesi)',
    /cfgStepsPerUnit\s*\/\s*8/.test(src));
// Il browser deve gestire *fault (mostrare il motivo, fermare, invalidare pos).
var alzata = fs.readFileSync(path.join(__dirname, '..', 'alzata.html'), 'utf8');
check('FW-03: alzata.html gestisce *fault', alzata.indexOf("indexOf('*fault')") !== -1);

// FW-01 (controrevisione v3.4.1): il watchdog v4 non deve auto-rinfrescarsi
// dentro stepperMove (chiamato a ogni unità dallo scan): sarebbe fallito PRIMA
// della patch, quando stepperMove conteneva "g_runId >= 0) g_lastHeartbeatMs".
check('FW-01: stepperMove NON rinfresca l\'heartbeat (no auto-refresh nello scan)',
    !/g_runId\s*>=\s*0\)\s*g_lastHeartbeatMs\s*=\s*millis/.test(src));
// il riferimento heartbeat va inizializzato all'accettazione del run: una volta
// in autonomousScan e una nel gestore MOVE (più i refresh da '~').
check('FW-01: heartbeat inizializzato all\'accettazione del run (>=2 init espliciti)',
    (src.match(/g_lastHeartbeatMs\s*=\s*millis\(\);\s*(?:\/\/[^\n]*)?(?:FW-01|un solo|init)/gi) || []).length >= 1
    && (src.match(/g_lastHeartbeatMs\s*=\s*millis\(\)/g) || []).length >= 4);

// PROTOCOLLO v4 (FW-08/11, MOT-02): additivo, discriminato dalla cifra iniziale.
check('v4: dispatcher executeV4 definito', /void\s+executeV4\s*\(/.test(src));
check('v4: riga che inizia per cifra → executeV4', /cmdBuf\[0\]\s*>=\s*'0'\s*&&\s*cmdBuf\[0\]\s*<=\s*'9'/.test(src));
check('v4: FSM esplicita (enum FsmState)', /enum\s+FsmState/.test(src));
check('v4: HELLO con proto=4', src.indexOf('HELLO proto=4') !== -1);
check('v4: eventi EVT SAMPLE/DONE/STOPPED', src.indexOf('EVT SAMPLE') !== -1 && src.indexOf('EVT DONE') !== -1 && src.indexOf('EVT STOPPED') !== -1);
check('v4: fault latched (EVT FAULT + RESET_FAULT)', src.indexOf('EVT FAULT') !== -1 && src.indexOf('RESET_FAULT') !== -1);
check('v4: heartbeat dedicato (g_lastHeartbeatMs)', /g_lastHeartbeatMs/.test(src));
check('v4: device id EEPROM con CRC', /initDeviceId/.test(src) && /crc8/.test(src) && /EEPROM/.test(src));
check('v4: risposta v annuncia proto=4', /ver=4\.\d+ scan=1 proto=4/.test(src));
// v3 resta byte-identico: le primitive scelgono il formato via g_runId.
check('v4: g_runId governa il formato di emissione', /g_runId\s*>=\s*0/.test(src) && /g_runId\s*<\s*0/.test(src));

// La versione annunciata deve essere allineata a fw/version.json.
var vjson = require(path.join(__dirname, '..', 'fw', 'version.json'));
var bootMatch = src.match(/\*boot ver=([\d.]+)/);
var vMatch = src.match(/ver=([\d.]+) scan=1/);
check('versione *boot allineata a version.json', bootMatch && bootMatch[1] === vjson.firmware,
    (bootMatch ? bootMatch[1] : '?') + ' vs ' + vjson.firmware);
check("versione risposta 'v' allineata a version.json", vMatch && vMatch[1] === vjson.firmware,
    (vMatch ? vMatch[1] : '?') + ' vs ' + vjson.firmware);
// il fw dichiarato in HELLO (v4) deve coincidere: una divergenza farebbe
// saltare il gate fw>=4.1 del bench harness e confonderebbe il server.
var helloFw = (src.match(/HELLO proto=4 fw=([\d.]+)/) || [])[1];
check("versione HELLO v4 allineata a version.json", helloFw === vjson.firmware,
    (helloFw || '?') + ' vs ' + vjson.firmware);

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('  TUTTI VERDI: parser firmware robusto (FW-04/FW-09) — validazione hardware al banco.\n');
