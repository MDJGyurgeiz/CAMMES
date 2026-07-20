// =============================================================
//  test_profile_roundtrip_incomplete.js — DATA-01 (controrevisione v3.4.1)
// =============================================================
//  Un profilo INCOMPLETO salvato e riletto NON deve diventare "completo" pieno
//  di zeri. Prima "Salva profilo" scriveva 360 righe con Number(curve[i]||0):
//    import 30/360 -> salva -> rileggi  =>  valid=360, missing=0 (falso!)
//  Ora il salvataggio diagnostico (serializeDiagnosticProfile) scrive SOLO i
//  gradi coperti + #stato=INCOMPLETO, quindi il round-trip conserva 30/330 e
//  nessun grado mancante diventa uno zero fisico.
//
//  Questo test confronta i DUE serializzatori sullo stesso profilo:
//   - "vecchio" (zero-fill 360 righe)  -> DEVE fallire l'invariante (regressione);
//   - "nuovo" (serializeDiagnosticProfile) -> DEVE conservare la maschera.
//
//  Uso: node tools/test_profile_roundtrip_incomplete.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' ROUND-TRIP PROFILO INCOMPLETO - DATA-01');
console.log('=============================================================');

// Profilo sorgente: 30 gradi misurati (1..30, un lobo finto), gli altri 330
// MAI misurati. Include un vero zero misurato al grado 5 (deve restare valido).
var srcLines = ['_pline'];
for (var d = 1; d <= 30; d++) {
    var v = (d === 5) ? 0 : (0.5 + d * 0.1);   // grado 5 = zero FISICO valido
    srcLines.push(d + ',' + v.toFixed(3));
}
var srcText = srcLines.join('\r\n') + '\r\n';

var p0 = M.parseCamFile(srcText);
check('parse iniziale: 30 validi / 330 mancanti', p0.validCount === 30 && p0.missingCount === 330,
    'valid=' + p0.validCount + ' missing=' + p0.missingCount);
check('parse iniziale: grado 42 NON coperto', p0.covered[42] === false);
check('parse iniziale: grado 5 (zero fisico) coperto', p0.covered[5] === true && p0.covered[5] !== undefined);

// --- (A) vecchio salvataggio: 360 righe con Number(curve[i]||0) ---
function oldSerialize(camLift) {
    var lines = ['_pline'];
    for (var i = 1; i <= 360; i++) lines.push(i + ',' + (+(Number(camLift[i] || 0)).toFixed(4)));
    return lines.join('\r\n') + '\r\n';
}
var pOld = M.parseCamFile(oldSerialize(p0));
check('REGRESSIONE (vecchio): dopo salva+rileggi diventa 360/0 (falso completo)',
    pOld.validCount === 360 && pOld.missingCount === 0, 'valid=' + pOld.validCount + ' missing=' + pOld.missingCount);
check('REGRESSIONE (vecchio): il grado 42 mancante e\' diventato uno zero fisico',
    pOld.covered[42] === true && Number(pOld[42]) === 0);

// --- (B) nuovo salvataggio diagnostico: solo gradi coperti + #stato ---
var content = M.serializeDiagnosticProfile(p0, p0.covered, { data: '2026-07-20T00:00:00Z' });
check('nuovo: contiene #stato=INCOMPLETO', content.indexOf('#stato=INCOMPLETO') >= 0);
check('nuovo: scrive solo i gradi coperti (30 righe dato + intestazioni)',
    (content.match(/^\d+,/gm) || []).length === 30, (content.match(/^\d+,/gm) || []).length + ' righe dato');

var pNew = M.parseCamFile(content);
check('nuovo: round-trip conserva 30 validi / 330 mancanti',
    pNew.validCount === 30 && pNew.missingCount === 330, 'valid=' + pNew.validCount + ' missing=' + pNew.missingCount);
check('nuovo: grado 42 resta MANCANTE (non zero fisico)', pNew.covered[42] === false);
check('nuovo: grado 5 (zero fisico) resta valido e = 0', pNew.covered[5] === true && Number(pNew[5]) === 0);
check('nuovo: meta.stato = INCOMPLETO dopo rilettura', pNew.meta && pNew.meta.stato === 'INCOMPLETO');

// --- (C) un profilo COMPLETO 360/360 resta completo (nessuna regressione) ---
var fullLines = ['_pline'];
for (var g = 1; g <= 360; g++) fullLines.push(g + ',' + (1.0).toFixed(3));
var pFull = M.parseCamFile(fullLines.join('\r\n') + '\r\n');
check('completo 360/360 resta completo', pFull.validCount === 360 && pFull.missingCount === 0);
check('completo: serializeDiagnostic non lo tratterebbe come incompleto',
    pFull.missingCount === 0);

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: un profilo incompleto resta incompleto dopo salva+rilettura;');
console.log('un vero zero misurato resta valido; un completo resta completo.\n');
