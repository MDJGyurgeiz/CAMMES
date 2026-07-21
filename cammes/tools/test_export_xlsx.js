// =============================================================
//  test_export_xlsx.js — export Excel (.xlsx) delle misure
// =============================================================
//  Windows tratta .scr come SCREENSAVER (eseguibile): l'export .xlsx dà un
//  formato apribile con doppio click. Verifiche:
//   - /api/export-xlsx/<nome>.scr risponde con un OOXML valido (zip PK,
//     [Content_Types].xml, workbook, 2 fogli);
//   - ONESTÀ (DATA-01): i gradi MANCANTI sono celle VUOTE, mai zeri —
//     il numero di celle-valore in colonna B = SOLO i gradi coperti;
//   - il foglio Info dichiara stato/validi/mancanti;
//   - nomi non validi → 400, file inesistente → 404.
//  Il file di test viene creato via API e CANCELLATO a fine test (nessun
//  inquinamento dell'archivio misure).
//
//  Uso: node tools/test_export_xlsx.js   (exit 0 = ok)
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
var HTTP_PORT = 0;
function req(method, pathStr, body) {
    return new Promise(function (resolve, reject) {
        var r = http.request({ host: '127.0.0.1', port: HTTP_PORT, path: pathStr, method: method,
            headers: { 'Content-Type': 'text/plain' } }, function (res) {
            var chunks = [];
            res.on('data', function (d) { chunks.push(d); });
            res.on('end', function () { resolve({ code: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); });
        });
        r.on('error', reject);
        if (body != null) r.write(body);
        r.end();
    });
}

var server = null;
function killServer() { try { if (server) server.kill(); } catch (e) {} }
process.on('exit', killServer);

console.log('=============================================================');
console.log(' EXPORT EXCEL (.xlsx) - archivio misure');
console.log('=============================================================');

Promise.all([freePort(), freePort()]).then(async function (ports) {
    HTTP_PORT = ports[0];
    server = spawn(process.execPath,
        [path.join(__dirname, '..', 'cammes_server.js'), '--no-browser', '--serial-mock',
         '--port', String(HTTP_PORT), '--ws-port', String(ports[1])],
        { stdio: 'ignore', cwd: path.join(__dirname, '..') });
    // attendi il server
    var up = false;
    for (var t = 0; t < 40 && !up; t++) { await sleep(200); try { up = (await req('GET', '/api/files')).code === 200; } catch (e) {} }
    check('server di test avviato', up);

    var NAME = '_xlsxtest_' + HTTP_PORT + '_alz.scr';

    // profilo INCOMPLETO 30/360 con un vero zero al grado 5
    var lines = ['_pline', '#stato=INCOMPLETO'];
    for (var d = 1; d <= 30; d++) lines.push(d + ',' + (d === 5 ? 0 : (0.5 + d * 0.1)).toFixed(3));
    var save = await req('POST', '/api/file/' + encodeURIComponent(NAME), lines.join('\r\n') + '\r\n');
    check('setup: file di test salvato via API', save.code === 200);

    // export
    var x = await req('GET', '/api/export-xlsx/' + encodeURIComponent(NAME));
    check('export: HTTP 200', x.code === 200, 'HTTP ' + x.code);
    check('export: Content-Type xlsx', /officedocument\.spreadsheetml\.sheet/.test(x.headers['content-type'] || ''));
    check('export: filename .xlsx', /filename=".*\.xlsx"/.test(x.headers['content-disposition'] || ''));
    var buf = x.body;
    check('export: firma ZIP (PK\\x03\\x04)', buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 3 && buf[3] === 4);
    var raw = buf.toString('latin1');
    check('export: struttura OOXML completa',
        raw.indexOf('[Content_Types].xml') >= 0 && raw.indexOf('xl/workbook.xml') >= 0 &&
        raw.indexOf('xl/worksheets/sheet1.xml') >= 0 && raw.indexOf('xl/worksheets/sheet2.xml') >= 0);

    // ONESTÀ: celle-valore in colonna B = SOLO i 30 gradi coperti (zip è
    // "stored", quindi l'XML è leggibile in chiaro nel buffer)
    var bCells = (raw.match(/<c r="B\d+"><v>/g) || []).length;
    check('onestà: 30 celle-valore in colonna B (i 330 mancanti sono VUOTI)', bCells === 30, bCells + ' celle');
    var aCells = (raw.match(/<c r="A\d+"><v>/g) || []).length;
    check('griglia: 360 righe di gradi in colonna A', aCells === 360, aCells + ' celle');
    check('vero zero (grado 5) esportato come valore', raw.indexOf('<c r="B6"><v>0</v></c>') >= 0);
    check('Info: stato INCOMPLETO dichiarato', raw.indexOf('INCOMPLETO') >= 0);
    check('Info: gradi mancanti dichiarati', raw.indexOf('Gradi mancanti') >= 0);

    // errori
    var e1 = await req('GET', '/api/export-xlsx/..%2F..%2Fsegreto.scr');
    check('nome con traversal → 400', e1.code === 400, 'HTTP ' + e1.code);
    var e2 = await req('GET', '/api/export-xlsx/non_esiste_alz.scr');
    check('file inesistente → 404', e2.code === 404, 'HTTP ' + e2.code);
    var e3 = await req('GET', '/api/export-xlsx/nome.txt');
    check('estensione non .scr → 400', e3.code === 400, 'HTTP ' + e3.code);

    // cleanup
    var del = await req('DELETE', '/api/file/' + encodeURIComponent(NAME));
    check('cleanup: file di test rimosso', del.code === 200);

    console.log('');
    killServer();
    if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI'); process.exit(1); }
    console.log('VALIDATO: export .xlsx OOXML valido, gradi mancanti onesti (celle vuote),');
    console.log('vero zero preservato, errori gestiti, archivio non inquinato.');
    process.exit(0);
}).catch(function (e) { check('setup', false, String(e)); killServer(); process.exit(1); });
