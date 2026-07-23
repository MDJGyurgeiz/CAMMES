// =============================================================
//  test_flash_interlock.js — FLASH-01 (controrevisione v3.4.1)
// =============================================================
//  La race: flashInProgress era verificato all'ingresso ma impostato SOLO
//  dentro launchFlash(), DOPO la SerialPort.list() asincrona. Con la seriale
//  NON aperta (porta nota da --com ma non collegata), due richieste quasi
//  simultanee superavano entrambe il controllo → due avrdude sulla stessa
//  porta. Ora il flag si acquisisce in modo SINCRONO prima di ogni asincronia
//  e OGNI percorso d'uscita lo rilascia.
//
//  Il test usa --com COMFAKE99: porta "nota" ma inesistente → il flusso arriva
//  fino alla lista porte e fallisce in modo SICURO (nessun avrdude parte mai).
//  Discriminazione tramite il messaggio: la 2ª richiesta simultanea deve
//  ricevere "Flash già in corso" (flag preso subito), NON l'errore di porta
//  (che sul codice vecchio riceveva). La 3ª richiesta, a flag rilasciato,
//  NON deve ricevere "già in corso" (prova del rilascio in ogni percorso).
//
//  In più (guardia moto, su server mock): scan attivo → flash rifiutato.
//
//  Uso: node tools/test_flash_interlock.js   (exit 0 = ok)
var path = require('path');
var net = require('net');
var http = require('http');
var spawn = require('child_process').spawn;

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function freePort() {
    return new Promise(function (res, rej) {
        var s = net.createServer(); s.unref();
        s.on('error', rej);
        s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { res(p); }); });
    });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function post(port, pathStr, body) {
    return new Promise(function (resolve, reject) {
        var r = http.request({ host: '127.0.0.1', port: port, path: pathStr, method: 'POST',
            headers: { 'Content-Type': 'text/plain' } }, function (res) {
            var b = ''; res.on('data', function (d) { b += d; });
            res.on('end', function () { var j = {}; try { j = JSON.parse(b); } catch (e) {} resolve({ code: res.statusCode, body: j }); });
        });
        r.on('error', reject);
        if (body != null) r.write(body);
        r.end();
    });
}
var servers = [];
function killAll() { servers.forEach(function (s) { try { s.kill(); } catch (e) {} }); }
process.on('exit', killAll);

console.log('=============================================================');
console.log(' INTERLOCK FLASH - FLASH-01');
console.log('=============================================================');

Promise.all([freePort(), freePort(), freePort(), freePort()]).then(async function (ports) {
    // Server A: porta seriale "nota" (--com) ma NON collegata → ramo asincrono
    var A = spawn(process.execPath,
        [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--com', 'COMFAKE99',
         '--port', String(ports[0]), '--ws-port', String(ports[1])],
        { stdio: 'ignore', cwd: path.join(__dirname, '..') });
    servers.push(A);
    var up = false;
    for (var t = 0; t < 40 && !up; t++) { await sleep(200); try { up = (await post(ports[0], '/api/_nope')).code > 0; } catch (e) {} }
    check('server A (porta fake, seriale chiusa) avviato', up);

    // due richieste SIMULTANEE: una sola deve entrare
    var p1 = post(ports[0], '/api/flash-firmware');
    var p2 = post(ports[0], '/api/flash-firmware');
    var r12 = await Promise.all([p1, p2]);
    var busy = r12.filter(function (r) { return r.code === 409 && /già in corso/i.test(r.body.error || ''); });
    var other = r12.filter(function (r) { return !(r.code === 409 && /già in corso/i.test(r.body.error || '')); });
    check('richieste simultanee: ESATTAMENTE una respinta "Flash già in corso"', busy.length === 1, JSON.stringify(r12.map(function (r) { return r.code + ':' + String(r.body.error || '').slice(0, 28); })));
    check('l\'altra fallisce in modo sicuro sulla porta inesistente', other.length === 1 && other[0].code >= 400,
        other.length ? other[0].code + ':' + String(other[0].body.error || '').slice(0, 40) : '?');

    // il flag DEVE essere stato rilasciato: la 3ª richiesta non è "già in corso"
    await sleep(300);
    var r3 = await post(ports[0], '/api/flash-firmware');
    check('flag rilasciato dopo l\'errore (3ª richiesta non "già in corso")',
        !(/già in corso/i.test(r3.body.error || '')), r3.code + ':' + String(r3.body.error || '').slice(0, 40));

    // Server B (mock): guardia moto — scan attivo → flash rifiutato
    var B = spawn(process.execPath,
        [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--serial-mock',
         '--port', String(ports[2]), '--ws-port', String(ports[3])],
        { stdio: 'ignore', cwd: path.join(__dirname, '..') });
    servers.push(B);
    up = false;
    for (t = 0; t < 40 && !up; t++) { await sleep(200); try { up = (await post(ports[2], '/api/_nope')).code > 0; } catch (e) {} }
    check('server B (mock) avviato', up);
    await post(ports[2], '/api/_mock-rx', '#12:48:1.23\n');   // riga di scansione → lastScanActivity
    await sleep(150);
    var rb = await post(ports[2], '/api/flash-firmware');
    check('scan attivo → flash rifiutato (409)', rb.code === 409 && /scansione/i.test(rb.body.error || ''),
        rb.code + ':' + String(rb.body.error || '').slice(0, 40));

    console.log('');
    killAll();
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: un solo flash alla volta (flag sincrono), rilascio garantito');
    console.log('sugli errori, flash rifiutato con moto/scan in corso.');
    process.exit(0);
}).catch(function (e) { check('setup', false, String(e)); killAll(); process.exit(1); });
