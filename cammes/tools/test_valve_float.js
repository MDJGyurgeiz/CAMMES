// =============================================================
//  test_valve_float.js — regressione Lotto 7 audit esterno (DYN-01)
// =============================================================
//  Il "valve float" è la PERDITA DI CONTATTO tra camma e punteria: avviene
//  quando la forza di contatto si annulla e la valvola, per inerzia, "vola"
//  oltre il profilo della camma. Fisica attesa:
//   - a regime quasi-statico (1 rpm) il float è ESATTAMENTE 0 (la molla
//     tiene la punteria sulla camma; c'è solo schiacciamento elastico)
//   - resta ~0 fino a un regime di soglia
//   - oltre soglia CRESCE con i giri (più inerzia → più distacco)
//
//  Il vecchio detectValveFloat = max(camLift - valveLift) misurava invece lo
//  schiacciamento elastico quasi-statico (~0,1 mm) e DIMINUIVA salendo di
//  giri (audit DYN-01: più "float" a 1 rpm che a 3000). Ora la separazione
//  è tracciata DENTRO il solver (camma interpolata) come max(follower-camma).
//
//  Uso:  node cammes/tools/test_valve_float.js   (exit 0 = ok)

var path = require('path');
var fs = require('fs');
global.window = global;
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));

var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}

console.log('=============================================================');
console.log(' VALVE FLOAT — regressione audit DYN-01 (perdita di contatto)');
console.log('=============================================================');

var vw = M.parseCamFile(fs.readFileSync(path.join(__dirname, 'fixtures', 'VW-kr1_8-ASP_alz.scr'), 'utf8'));
var crank = M.mapCamToCrank(vw, 106, 0.0, 'intake');

function floatAt(rpm, params) {
    var v = M.simulateCompliance(crank, rpm, params || {});
    return M.detectValveFloat(crank, v).maxGap;
}

// (1) quasi-statico → float ESATTAMENTE 0 (era ~0,24 mm, sopra la sua stessa
//     soglia di "float manifesto" 0,1 mm)
var f1 = floatAt(1);
check('1 rpm → float = 0 (quasi-statico, nessun distacco)', f1 < 1e-6, 'float ' + f1.toFixed(4) + ' mm');

// (2) regimi medi → ancora ~0 (la molla di serie tiene il contatto)
var f1000 = floatAt(1000), f3000 = floatAt(3000);
check('1000 rpm → float ~0', f1000 < 0.02, 'float ' + f1000.toFixed(4) + ' mm');
check('3000 rpm → float ~0', f3000 < 0.02, 'float ' + f3000.toFixed(4) + ' mm');

// (3) MONOTONIA sopra soglia: 6000 < 9000 < 12000 (più giri → più float)
var f6000 = floatAt(6000), f9000 = floatAt(9000), f12000 = floatAt(12000);
check('6000 rpm → float > 3000 rpm (cresce oltre soglia)', f6000 > f3000 && f6000 > 0.1, 'f6000 ' + f6000.toFixed(3));
check('9000 > 6000', f9000 > f6000, 'f9000 ' + f9000.toFixed(3) + ' vs f6000 ' + f6000.toFixed(3));
check('12000 > 9000', f12000 > f9000, 'f12000 ' + f12000.toFixed(3) + ' vs f9000 ' + f9000.toFixed(3));

// (4) direzione FISICA: NON deve calare da 1 a 3000 (il bug dell'audit)
check('float 3000 rpm NON maggiore di 1 rpm (no anomalia)', f3000 <= f1 + 0.02, 'f1 ' + f1.toFixed(4) + ', f3000 ' + f3000.toFixed(4));

// (5) molla più debole → float ANTICIPA (soglia più bassa)
var fWeak6000 = floatAt(6000, { kSpringN_mm: 15, F0N: 100 });
check('molla debole a 6000 → float >= molla standard', fWeak6000 >= f6000 - 1e-6, 'debole ' + fWeak6000.toFixed(3) + ' vs std ' + f6000.toFixed(3));

// (6) il solver espone la separazione tracciata internamente
var vHi = M.simulateCompliance(crank, 9000, {});
check('simulateCompliance espone maxSeparation', typeof vHi.maxSeparation === 'number', 'maxSep ' + (vHi.maxSeparation != null ? vHi.maxSeparation.toFixed(3) : 'n/d'));
check('detectValveFloat usa la separazione del solver', M.detectValveFloat(crank, vHi).separation === true);

// (7) DYN-04: damping 0 e preload 0 NON vengono sostituiti dai default con ||
//     (0 è un valore fisico valido: molla scarica / assenza smorzamento)
var vNoDamp = M.simulateCompliance(crank, 3000, { dampingRatio: 0 });
var vDefDamp = M.simulateCompliance(crank, 3000, {});
var diff = 0; for (var i = 1; i <= 720; i++) diff = Math.max(diff, Math.abs((vNoDamp[i]||0) - (vDefDamp[i]||0)));
check('dampingRatio:0 ≠ default (nullish, non ||)', diff > 1e-4, 'Δmax ' + diff.toFixed(4) + ' mm');

// (8) 2DOF e 3DOF espongono anch'essi la separazione cam-punteria
var v2 = M.simulateCompliance2DOF(crank, 9000, {});
var v3 = M.simulateCompliance3DOF(crank, 9000, {});
check('2DOF espone maxSeparation', typeof v2.maxSeparation === 'number', 'maxSep ' + (v2.maxSeparation != null ? v2.maxSeparation.toFixed(3) : 'n/d'));
check('3DOF espone maxSeparation', typeof v3.maxSeparation === 'number', 'maxSep ' + (v3.maxSeparation != null ? v3.maxSeparation.toFixed(3) : 'n/d'));

console.log('');
if (fails > 0) { console.log('RISULTATO: ' + fails + ' check FALLITI'); process.exit(1); }
console.log('VALIDATO: il valve float è la perdita di contatto reale — zero al');
console.log('quasi-statico, crescente col regime. Molla debole → float anticipato.');
