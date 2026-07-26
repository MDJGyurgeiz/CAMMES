// =============================================================
//  test_p112_validazione.js — P1-12 (audit esterno v3.4.3)
// =============================================================
//  Rilievo: "validazione numerica centralizzata mancante".
//  Nella v3.4.3 ogni campo veniva letto con `Number(el.value) || default`,
//  che confonde tre casi diversi:
//    - campo VUOTO           -> deve usare il default (o bloccare)
//    - zero SCRITTO a mano   -> e' un valore, non un default
//    - valore NON AMMESSO    -> deve BLOCCARE, non scivolare nel default
//  Con quel pattern `rPunt = 0` (tastatore a coltello) diventava 1,5 e un
//  raggio base NEGATIVO passava indisturbato fino all'alzata convertita.
//
//  Questo test e' scritto PRIMA del fix: sulla v3.4.3 fallisce perche'
//  validaNumero() non esiste.
//
//  Uso: node tools/test_p112_validazione.js   (exit 0 = ok)
var path = require('path');
var M = require(path.join(__dirname, '..', 'lib', 'cammes-math.js'));
var fails = 0;
function check(label, cond, detail) {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  [' + detail + ']' : ''));
    if (!cond) fails++;
}
function esito(grezzo, regola) {
    return M.validaNumero ? M.validaNumero(grezzo, regola) : { ok: false, motivo: 'validaNumero assente' };
}

console.log('=============================================================');
console.log(' P1-12 - validazione numerica centralizzata');
console.log('=============================================================');

check('validaNumero esportato dalla libreria', typeof M.validaNumero === 'function');

// ---------------- vuoto / assente ----------------
console.log('--- campo vuoto: default se previsto, BLOCCO se obbligatorio ---');
var vuotoConDef = esito('', { min: 0, def: 1.5 });
check('vuoto + default -> usa il default, senza errore',
    vuotoConDef.ok === true && vuotoConDef.valore === 1.5 && vuotoConDef.usatoDefault === true,
    JSON.stringify(vuotoConDef));
var vuotoObbl = esito('   ', { min: 0, richiesto: true });
check('vuoto + richiesto -> NON ok, motivo "vuoto"',
    vuotoObbl.ok === false && vuotoObbl.motivo === 'vuoto', JSON.stringify(vuotoObbl));
check('null e undefined trattati come vuoto',
    esito(null, { def: 7 }).valore === 7 && esito(undefined, { def: 7 }).valore === 7);

// ---------------- zero scritto a mano ----------------
console.log('--- zero: e un valore, non un campo vuoto ---');
var zeroAmmesso = esito('0', { min: 0, def: 1.5 });
check('zero con min 0 -> vale ZERO, non il default 1,5',
    zeroAmmesso.ok === true && zeroAmmesso.valore === 0 && zeroAmmesso.usatoDefault !== true,
    'valore=' + zeroAmmesso.valore);
check('anche "0.0" e "0,0" valgono zero',
    esito('0.0', { min: 0, def: 9 }).valore === 0 && esito('0,0', { min: 0, def: 9 }).valore === 0);
var zeroVietato = esito('0', { min: 0, minEsclusivo: true, def: 25 });
check('zero dove serve strettamente positivo -> BLOCCA (non ripiega sul default)',
    zeroVietato.ok === false && zeroVietato.motivo === 'fuori-intervallo',
    JSON.stringify(zeroVietato));

// ---------------- negativi ----------------
console.log('--- negativi: bloccati dove la fisica non li ammette ---');
var negRaggio = esito('-17', { min: 0, minEsclusivo: true });
check('raggio base -17 -> BLOCCA (nella v3.4.3 arrivava fino alla curva)',
    negRaggio.ok === false && negRaggio.motivo === 'fuori-intervallo', JSON.stringify(negRaggio));
check('negativo AMMESSO dove ha senso (anticipo -4 gradi)',
    esito('-4', {}).ok === true && esito('-4', {}).valore === -4);
check('gioco valvole negativo -> BLOCCA', esito('-0.05', { min: 0 }).ok === false);

// ---------------- stringhe e non numeri ----------------
console.log('--- stringhe, NaN, infiniti: mai silenziosi ---');
['abc', '1,2,3', '--5', 'NaN', '1e', '0x10'].forEach(function (s) {
    var r = esito(s, { min: 0, def: 3 });
    check('"' + s + '" -> non numerico, BLOCCA (niente default silenzioso)',
        r.ok === false && r.motivo === 'non-numerico', JSON.stringify(r));
});
check('Infinity -> BLOCCA', esito('Infinity', { min: 0 }).ok === false);
check('-Infinity -> BLOCCA', esito(-Infinity, {}).ok === false);
check('NaN numerico -> BLOCCA', esito(NaN, {}).ok === false);
check('notazione esponenziale valida accettata', esito('1.5e2', {}).valore === 150);
check('virgola decimale italiana accettata', esito('0,25', {}).valore === 0.25);

// ---------------- intervalli ----------------
console.log('--- intervalli: damping, masse, rigidezze ---');
check('damping 0 e AMMESSO (zero fisico, non default)',
    esito('0', { min: 0, max: 1, maxEsclusivo: true, def: 0.06 }).valore === 0);
check('damping 0.99 ammesso', esito('0.99', { min: 0, max: 1, maxEsclusivo: true }).ok === true);
check('damping 1 -> BLOCCA (max esclusivo)',
    esito('1', { min: 0, max: 1, maxEsclusivo: true }).ok === false);
check('damping 1.5 -> BLOCCA', esito('1.5', { min: 0, max: 1, maxEsclusivo: true }).ok === false);
check('damping -0.1 -> BLOCCA', esito('-0.1', { min: 0, max: 1, maxEsclusivo: true }).ok === false);
check('massa equivalente 0 -> BLOCCA (nessuna massa = nessuna dinamica)',
    esito('0', { min: 0, minEsclusivo: true, def: 100 }).ok === false);
check('rigidezza treno 0 -> BLOCCA',
    esito('0', { min: 0, minEsclusivo: true, def: 5000 }).ok === false);
check('rigidezza perno 0 -> AMMESSA (0 = perno rigido, convenzione P1-06)',
    esito('0', { min: 0, def: 0 }).ok === true && esito('0', { min: 0, def: 0 }).valore === 0);

// ---------------- estremi: nessun tetto arbitrario ----------------
console.log('--- estremi: si avvisa, non si impone un tetto nascosto ---');
var rpmAlto = esito('30000', { min: 0, minEsclusivo: true, avvisoSopra: 12000 });
check('30.000 rpm PASSA (banco universale: nessun limite imposto)',
    rpmAlto.ok === true && rpmAlto.valore === 30000, JSON.stringify(rpmAlto));
check('30.000 rpm porta un AVVISO, non un errore',
    rpmAlto.avviso === true, 'avviso=' + rpmAlto.avviso);
check('6.000 rpm: nessun avviso',
    esito('6000', { min: 0, minEsclusivo: true, avvisoSopra: 12000 }).avviso !== true);
check('rpm 0 -> BLOCCA la dinamica (non "sicuro" per finta)',
    esito('0', { min: 0, minEsclusivo: true, def: 6000 }).ok === false);
check('valore enorme ma finito accettato se non c e regola',
    esito('1e15', {}).ok === true);

// ---------------- il motivo e sempre spiegabile ----------------
console.log('--- ogni rifiuto dice PERCHE (messaggio per la UI) ---');
var casi = [['', { richiesto: true }], ['abc', {}], ['-1', { min: 0 }], ['2', { max: 1 }]];
var tuttiSpiegati = casi.every(function (c) {
    var r = esito(c[0], c[1]);
    return r.ok === false && typeof r.messaggio === 'string' && r.messaggio.length > 3;
});
check('ogni esito negativo espone un messaggio leggibile', tuttiSpiegati,
    casi.map(function (c) { return esito(c[0], c[1]).messaggio; }).join(' | '));

console.log('');
if (fails) { console.log('RISULTATO: ' + fails + ' FALLITI\n'); process.exit(1); }
console.log('VALIDATO: un solo motore di validazione distingue vuoto, zero');
console.log('scritto e valore non ammesso; i negativi non passano piu dove la');
console.log('fisica non li ammette; nessun tetto arbitrario, solo avvisi.\n');
