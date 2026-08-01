// =============================================================
//  cammes-math.js — libreria matematica condivisa CAMMES
// =============================================================
//  Contiene le funzioni di CALCOLO PURO estratte da analisi.html e
//  alzata.html (conversioni follower, baseline, mappatura camma→albero,
//  compliance 1/2/3-DOF, re-indicizzazione encoder).
//
//  Doppio consumo:
//   - BROWSER: <script src="lib/cammes-math.js"> — le funzioni vengono
//     agganciate a window con gli STESSI nomi globali di prima, quindi il
//     codice delle pagine le usa senza modifiche.
//   - NODE (test in tools/): const M = require("../lib/cammes-math.js").
//     Fine dell'estrazione via brace-matching + eval: i test importano
//     direttamente questo modulo.
//
//  NB: alcune funzioni segnalano stato diagnostico su window._* (es.
//  _lastBaselineAmp, _fingerSaturated): qui "window" è il global reale
//  (window nel browser, globalThis in node) via alias interno.
// =============================================================
(function (root) {

var window = root;   // alias: i riferimenti window._* puntano al global reale

// ========== VIRTUAL FOLLOWER (bicchiere simulato) ==========
//
// L'utente misura la camma col puntalino sferico del comparatore. Per simulare
// quello che vedrebbe un bicchiere piatto di Ø D, calcoliamo l'inviluppo:
//
//  r(θ) = r_base + lift_punt[θ]               (approssimazione puntalino piccolo)
//  Per ogni angolo motore α e θ ∈ [0, 360):
//      x = r(θ) · cos((θ - α) · π/180)
//      y = r(θ) · sin((θ - α) · π/180)
//  Il bicchiere piatto orizzontale di larghezza 2·R_bicch tocca la camma sopra,
//  quindi vede il MAX di y tra i punti con |x| ≤ R_bicch:
//      lift_bicch(α) = max{ y : |x| ≤ R_bicch } − r_base
//
// Converte una scansione fatta col PUNTALINO sferico (raggio rPunt) nella
// curva che leggerebbe un BICCHIERE PIATTO di diametro dBicch.
//
// Step 1: sottrai rPunt dalla misura per ottenere il profilo geometrico
//         "vero" della cam (la sfera del puntalino offsetta la quota di
//         circa rPunt rispetto al contatto piano-cam).
// Step 2: ricostruisci r(θ) = R_base + lift_vero(θ) in coordinate polari.
// Step 3: per ogni angolo follower α, il bicchiere piatto trova il
//         punto (x,y) del profilo con |x| ≤ R_bicch e Y massima.
//         lift_bicch(α) = Y_max − R_base.
//
// Avvisa via toast se Ø bicchiere è troppo grande per il lobo (l'impronta
// del piattello copre quasi tutta la cam → alzata simulata distorta).
// Compensazione del raggio del PUNTALINO SFERICO usato in scansione.
// La sfera (raggio rPunt) tocca la cam e il suo CENTRO traccia un profilo
// offset di rPunt lungo la NORMALE alla superficie. Il comparatore è azzerato
// sul cerchio base, dove la normale È radiale: lì l'offset rPunt è già incluso
// nello zero. Quindi nell'ALZATA (differenza dallo zero) l'offset si CANCELLA
// al naso e sul base circle, e resta solo un contributo sui FIANCHI, dove la
// normale non è radiale:
//      lift_vero(θ) = lift_misurato(θ) + rPunt·(1 − cos α),
//      α = atan2( d(lift)/dθ , r ),   r = rBase + lift.
// Poiché cos α ≤ 1, la correzione è SEMPRE ≥ 0: il puntalino "smussa" i fianchi
// e il profilo cam vero è leggermente più pieno della misura grezza.
// NB: il vecchio modello faceva `ltrue = raw − rPunt` (sottrazione piatta) —
// ERRORE: abbassava tutta la curva di rPunt anche al naso (dove non c'è alcun
// offset radiale), facendo leggere al bicchiere MENO del puntalino. Bug reale.
// Ritorna l'array dell'alzata vera ltrue[1..360] (≥0) rispetto al cerchio base.
function stylusCompensate(camLiftRaw, rBase, rPunt) {
    rPunt = (typeof rPunt === 'number' && rPunt > 0) ? rPunt : 0;
    var lift = new Array(361);
    lift[0] = 0;
    var i;
    for (i = 1; i <= 360; i++) { var v = camLiftRaw[i] || 0; lift[i] = v > 0 ? v : 0; }
    if (rPunt === 0) return lift;          // nessun puntalino → nessuna correzione
    var DEG = Math.PI / 180;
    var out = new Array(361);
    out[0] = 0;
    for (i = 1; i <= 360; i++) {
        var prev = i === 1 ? 360 : i - 1;
        var next = i === 360 ? 1 : i + 1;
        var dLdTheta = (lift[next] - lift[prev]) / 2 / DEG;   // mm per radiante
        var r = rBase + lift[i];
        var alpha = Math.atan2(dLdTheta, r);                  // angolo normale↔radiale
        out[i] = lift[i] + rPunt * (1 - Math.cos(alpha));
    }
    return out;
}

function convertPuntToBicchiere(camLiftRaw, rBase, dBicch, rPunt) {
    var R = dBicch / 2;
    var DEG = Math.PI / 180;
    rPunt = (typeof rPunt === 'number' && rPunt > 0) ? rPunt : 0;

    // Profilo cam vero r(θ) in coordinate polari, con compensazione corretta
    // del puntalino sferico (offset normale, vedi stylusCompensate).
    var lt = stylusCompensate(camLiftRaw, rBase, rPunt);
    var r = new Array(361);
    var rMax = rBase;
    for (var t = 1; t <= 360; t++) {
        r[t] = rBase + lt[t];
        if (r[t] > rMax) rMax = r[t];
    }

    // Avviso: il piattello e' TROPPO PICCOLO per questo lobo.
    //
    // Prima la condizione era `dBicch > rBase * 0.95`, che confronta un
    // DIAMETRO con un RAGGIO: dimensionalmente sbagliata, e scattava sempre.
    // Con qualunque combinazione realistica (rBase 14/16/32, bicchiere 33) il
    // test e' vero, quindi l'avviso compariva a ogni analisi col bicchiere e
    // non segnalava piu' niente.
    //
    // Il vincolo geometrico vero di un follower piatto e' un altro, e non
    // dipende dal cerchio base: il punto di contatto si sposta lateralmente di
    // dL/dphi (mm per radiante), quindi il piattello deve avere RAGGIO almeno
    // pari all'offset massimo, altrimenti il contatto esce dal bordo e la
    // conversione non e' piu' valida.
    // Verificato sulla VW KR asp: offset massimo 17,19 mm -> serve Ø >= 34,4 mm,
    // e il bicchiere reale di quel motore e' Ø35. Combacia con 0,3 mm di
    // margine, che e' quanto ci si aspetta da un accoppiamento progettato.
    var offsetMax = 0;
    for (var q = 1; q <= 360; q++) {
        var pr = lt[q === 1 ? 360 : q - 1], su = lt[q === 360 ? 1 : q + 1];
        if (!isFinite(pr) || !isFinite(su)) continue;
        var off = Math.abs((su - pr) / (2 * DEG));   // mm per radiante
        if (off > offsetMax) offsetMax = off;
    }
    if (offsetMax > R && typeof window !== 'undefined' && window.cammesToast && !window._suppressBicchWarn) {
        window._suppressBicchWarn = true;  // una volta per sessione
        setTimeout(function () {
            window.cammesToast({
                kind: 'warn', title: 'Bicchiere troppo piccolo per questo lobo',
                body: 'Il contatto si sposta fino a <b>' + offsetMax.toFixed(2) + ' mm</b> dall\'asse, ' +
                      'ma il bicchiere &Oslash; ' + dBicch.toFixed(1) + ' mm ha raggio ' + R.toFixed(2) + ' mm: ' +
                      'il punto di contatto esce dal bordo e l\'alzata simulata non &egrave; valida. ' +
                      'Serve almeno &Oslash; ' + (2 * offsetMax).toFixed(1) + ' mm.',
                duration: 9000
            });
        }, 400);
    }

    var raw = new Array(361);
    raw[0] = 0;
    for (var a = 1; a <= 360; a++) {
        var bestY = -Infinity;
        for (var t2 = 1; t2 <= 360; t2++) {
            var ang = (t2 - a) * DEG;
            var x = r[t2] * Math.cos(ang);
            if (x < -R || x > R) continue;
            var y = r[t2] * Math.sin(ang);
            if (y > bestY) bestY = y;
        }
        var lift = bestY - rBase;
        raw[a] = lift > 0 ? lift : 0;
    }
    // Allineamento angolare: il raw del puntalino ha picco a θ_p,
    // l'algoritmo qui sopra produce picco a (θ_p - 90)°. Compenso di +90°.
    var out = new Array(361);
    out[0] = 0;
    for (var i = 1; i <= 360; i++) {
        var src = ((i - 90) % 360 + 360) % 360;
        if (src === 0) src = 360;
        out[i] = raw[src];
    }
    return out;
}

// Converte scansione PUNTALINO → curva valvola con ROLLER FOLLOWER (rullo
// radiale in linea, raggio rRoll, che rotola sulla cam).
// Cinematica esatta dell'inviluppo: il CENTRO del rullo traccia la "pitch
// curve" = profilo cam offset di rRoll lungo la normale. Per un follower
// radiale all'angolo α, il centro è sul raggio α a distanza d(α); il rullo
// (raggio rRoll) deve restare tangente al profilo senza penetrarlo:
//   per ogni punto cam P(θ)=ρ(θ)·(cosθ,sinθ),  |C−P| ≥ rRoll.
// Con C = d·(cosα,sinα) e Δ=α−θ:  d²−2ρcosΔ·d+(ρ²−rRoll²) ≥ 0.
// Il centro più basso che libera tutti i punti raggiungibili (|ρ sinΔ|≤rRoll):
//   d(α) = max_θ [ ρcosΔ + √(rRoll² − ρ²sin²Δ) ]
// Alzata follower = d(α) − (rBase + rRoll).  (a base circle ρ=rBase,Δ=0 → 0)
//
// Limiti: rRoll→0 ⇒ d=ρ(α) ⇒ alzata = profilo puntalino (ltrue). rRoll grande
// ⇒ il rullo non entra negli incavi e arrotonda naso/fianchi (lift modificato).
function convertPuntToRoller(camLiftRaw, rBase, rRoll, rPunt) {
    var DEG = Math.PI / 180;
    rPunt = (typeof rPunt === 'number' && rPunt > 0) ? rPunt : 0;
    rRoll = (typeof rRoll === 'number' && rRoll > 0) ? rRoll : 0;
    // Profilo cam vero (raggio polare) con compensazione corretta del puntalino.
    var lt = stylusCompensate(camLiftRaw, rBase, rPunt);
    var rho = new Array(361);
    for (var t = 1; t <= 360; t++) {
        rho[t] = rBase + lt[t];
    }
    if (rRoll <= 0) {   // rullo nullo = puntalino
        var p = new Array(361); p[0] = 0;
        for (var q = 1; q <= 360; q++) p[q] = rho[q] - rBase;
        return p;
    }
    var rRoll2 = rRoll * rRoll;
    var win = 75;   // finestra angolare: oltre, ρ·sinΔ supera rRoll (fuori portata)
    var out = new Array(361);
    out[0] = 0;
    for (var a = 1; a <= 360; a++) {
        var dMax = -Infinity;
        for (var off = -win; off <= win; off++) {
            var th = ((a + off - 1) % 360 + 360) % 360 + 1;
            var rhoT = rho[th];
            var dlt = off * DEG;
            var lateral = rhoT * Math.sin(dlt);
            if (lateral * lateral > rRoll2) continue;          // punto fuori dalla portata del rullo
            var d = rhoT * Math.cos(dlt) + Math.sqrt(rRoll2 - lateral * lateral);
            if (d > dMax) dMax = d;
        }
        var lift = dMax - (rBase + rRoll);
        out[a] = lift > 0 ? lift : 0;
    }
    return out;
}

// Converte scansione PUNTALINO → curva valvola con FINGER FOLLOWER (a dito).
// Modello geometrico esatto:
//   - La leva ruota attorno a un perno fisso P.
//   - Braccio camma L_arm con estremità che tocca la cam (in posizione P+L_arm·u_cam).
//   - Braccio valvola L_valve con estremità che spinge la valvola (P+L_valve·u_val).
//   - A riposo (lift cam = 0), i due bracci formano angoli rispetto all'orizzontale:
//     θ_cam_0 = atan2(y_cam, x_cam) e θ_val_0 = atan2(y_val, x_val).
//
// Cinematica: quando il lift cam aumenta di Δh, l'estremità del braccio camma
// si alza di Δh, quindi il finger ruota di un angolo Δφ tale che:
//     L_arm · sin(θ_cam_0 + Δφ) − L_arm · sin(θ_cam_0) = Δh
//   → Δφ = asin(sin(θ_cam_0) + Δh/L_arm) − θ_cam_0
// Poi l'estremità del braccio valvola si abbassa/alza di:
//     Δval = L_valve · sin(θ_val_0 + Δφ) − L_valve · sin(θ_val_0)
//
// Parametro tiltDeg = θ_cam_0 in gradi (angolo a riposo del braccio camma
// rispetto all'orizzontale). Convenzione: braccio "in linea" col pivot →
// orizzontale = tilt 0. Braccio camma verticale (cam sopra il pivot) →
// tilt 90°. Per VTEC e finger moderni: tilt ~ 0 a 30°.
//
// Se tiltDeg = 0 e θ_val_0 = 180° (braccio valvola dall'altra parte, opposto),
// la formula esatta si riduce al rapporto lineare L_valve/L_arm — backward
// compatibile col rocker semplificato.
// =============================================================
// COMPLIANCE TRENO VALVOLE — Simulazione dinamica
// =============================================================
// Modella il treno come sistema massa-molla-smorzatore 1-DOF.
// Input: profilo cinematico cam (alzata vs grado albero motore, in mm).
// Stato del sistema: x = posizione valvola (mm), v = velocità valvola (mm/s).
//
// Equazione di moto:
//   m·ẍ + c·ẋ + k_train·(x - x_cam(t)) + F_molla(x) = 0       (apertura, cam pusha)
//   m·ẍ + c·ẋ + k_spring·x + F_preload = -F_contact          (chiusura, follow-up)
//
// Semplificazione adottata:
//   F_eff(t) = k_train · (x_cam(t) - x_valve)   ← forza che cam esercita
//   F_spring(x) = F0 + k_spring · x             ← forza molla che si oppone
//   m · ẍ = F_eff(t) - F_spring(x) - c · ẋ
//
// Quando F_eff < 0 (cam scende sotto la valvola), la valvola "decolla" dalla
// cam → valve float. La molla la richiama: m·ẍ = -F_spring(x) - c·ẋ
//
// Solver: Runge-Kutta del 4° ordine, passo dt sufficientemente piccolo
// (1/(720·RPS·40) sec per stabilità a 16000 rpm). Stato (x, v) propagato
// punto per punto sul ciclo 0..720°.
//
// AUDIT DYN-04: default con nullish, NON con `||` — così 0 è un valore fisico
// valido (smorzamento nullo, molla senza precarico) e non viene silenziosamente
// sostituito dal default.
// AUDIT DYN-02: helper UNICO assenza/zero. Lo zero finito è un valore VALIDO
// (damping 0 = non smorzato): il default si applica SOLO a input assente,
// vuoto o non numerico. Accetta anche stringhe (campi input della UI).
// Il pattern `Number(x) || default` è vietato per i parametri che ammettono 0.
function finiteOr(v, d) {
    if (v === null || v === undefined) return d;
    if (typeof v === 'string' && v.trim() === '') return d;
    var n = Number(v);
    return isFinite(n) ? n : d;
}
function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

// -------------------------------------------------------------------------
// AUDIT v3.4.3 P1-12 — motore di validazione numerica unico.
//
// Il pattern `Number(el.value) || default` sparso per la UI confondeva tre
// situazioni che vanno tenute distinte:
//   - campo VUOTO         -> il default e' legittimo (l'utente non ha scelto);
//   - ZERO scritto a mano  -> e' una scelta (rPunt 0 = tastatore a coltello,
//                             damping 0, perno rigido) e non va sostituita;
//   - valore NON AMMESSO   -> va BLOCCATO, non fatto scivolare nel default:
//                             un raggio base -17 arrivava fino alla curva
//                             convertita e produceva un'alzata di 31 mm.
//
// Regola: { min, max, minEsclusivo, maxEsclusivo, richiesto, def, avvisoSopra,
//           avvisoSotto }. Nessun campo obbligatorio: una regola vuota accetta
//   qualunque numero finito (serve per anticipo, angoli, offset con segno).
//
// `avvisoSopra`/`avvisoSotto` NON limitano: segnalano soltanto. Il banco e'
// universale — un valore fuori dall'ordinario puo' essere quello giusto per
// una camma che non abbiamo mai visto, quindi si avvisa e si calcola.
//
// Esito: { ok, valore, usatoDefault, avviso, motivo, messaggio }.
// motivo ∈ 'vuoto' | 'non-numerico' | 'fuori-intervallo'.
// -------------------------------------------------------------------------
function validaNumero(grezzo, regola) {
    var r = regola || {};
    var vuoto = (grezzo === null || grezzo === undefined ||
                 (typeof grezzo === 'string' && grezzo.trim() === ''));
    if (vuoto) {
        if (r.def !== undefined && !r.richiesto) {
            return { ok: true, valore: r.def, usatoDefault: true, avviso: false };
        }
        return { ok: false, motivo: 'vuoto', messaggio: 'Campo obbligatorio: inserire un valore.' };
    }
    // Virgola decimale italiana: "0,25" e' quello che scrive chi sta al banco.
    var testo = (typeof grezzo === 'string') ? grezzo.trim().replace(',', '.') : grezzo;
    // Number('') e Number(' ') valgono 0: qui il vuoto e' gia' stato escluso,
    // ma Number('0x10') vale 16 e Number(true) vale 1 — non sono misure.
    if (typeof testo === 'boolean') {
        return { ok: false, motivo: 'non-numerico', messaggio: 'Valore non numerico.' };
    }
    if (typeof testo === 'string' && !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(testo)) {
        return { ok: false, motivo: 'non-numerico', messaggio: 'Valore non numerico: usare cifre e un solo separatore decimale.' };
    }
    var n = Number(testo);
    if (!isFinite(n)) {
        return { ok: false, motivo: 'non-numerico', messaggio: 'Valore non numerico o infinito.' };
    }
    if (r.min !== undefined) {
        if (r.minEsclusivo ? !(n > r.min) : !(n >= r.min)) {
            return { ok: false, motivo: 'fuori-intervallo', valore: n,
                     messaggio: 'Deve essere ' + (r.minEsclusivo ? 'maggiore di ' : 'almeno ') + r.min + '.' };
        }
    }
    if (r.max !== undefined) {
        if (r.maxEsclusivo ? !(n < r.max) : !(n <= r.max)) {
            return { ok: false, motivo: 'fuori-intervallo', valore: n,
                     messaggio: 'Deve essere ' + (r.maxEsclusivo ? 'minore di ' : 'al massimo ') + r.max + '.' };
        }
    }
    var avviso = (r.avvisoSopra !== undefined && n > r.avvisoSopra) ||
                 (r.avvisoSotto !== undefined && n < r.avvisoSotto);
    var out = { ok: true, valore: n, usatoDefault: false, avviso: avviso };
    if (avviso) {
        out.messaggio = 'Valore insolito (' + n + '): verificare che sia voluto. Il calcolo procede.';
    }
    return out;
}

// Lettura circolare di camLift720 a grado FRAZIONARIO, interpolazione lineare,
// mm → m. Condivisa dai tre solver. Audit DYN-03: prima ogni solver usava
// Math.round (nearest-neighbor a 1°), che introduceva gradini spuri sul fianco
// — e, scommesso col vecchio indicatore di float, un "distacco" fittizio.
function _camAtM(camLift720, degIdx) {
    var d = ((degIdx - 1) % 720 + 720) % 720 + 1;
    var i0 = Math.floor(d), fr = d - i0;
    if (fr < 1e-9) return (camLift720[i0] || 0) * 1e-3;
    var i1 = (i0 % 720) + 1;
    return ((camLift720[i0] || 0) * (1 - fr) + (camLift720[i1] || 0) * fr) * 1e-3;
}

// AUDIT DYN-01 (controrevisione): esito TIPIZZATO dei solver di compliance.
//   status: 'CONVERGED' | 'NON_CONVERGED' | 'INVALID_INPUT'
//   tolX/tolV: tolleranze di periodicita (m, m/s); residualX/residualV: lo
//   scarto misurato tra gli ultimi due cicli (null se mai confrontati).
// Il chiamante NON deve produrre regime critico, badge positivi,
// ottimizzazioni o report conclusivi se status !== 'CONVERGED'.
function _dynInvalid(tolX, tolV) {
    var out = new Array(722);
    for (var i = 0; i <= 721; i++) out[i] = 0;
    out.maxSeparation = 0; out.floatIdx = 0;
    out.converged = false; out.cyclesRun = 0;
    out.status = 'INVALID_INPUT';
    out.tolX = tolX; out.tolV = tolV;
    out.residualX = null; out.residualV = null;
    return out;
}

// Output: array crank[1..720] con la posizione valvola REALE (compliance).
// L'array porta anche .maxSeparation (mm) e .floatIdx (1..720): la massima
// perdita di contatto cam-punteria (follower sopra la camma) — audit DYN-01.
function simulateCompliance(camLift720, rpm, params) {
    var p = params || {};
    var m_kg     = _num(p.massEqG, 100) / 1000;   // kg
    var k_train  = _num(p.kTrainN_mm, 5000) * 1000; // N/m
    var k_spring = _num(p.kSpringN_mm, 30) * 1000; // N/m
    var F0       = _num(p.F0N, 200);              // N preload
    var damping  = _num(p.dampingRatio, 0.06);    // ζ critico

    // AUDIT DYN-01: input invalido TIPIZZATO (prima un profilo null crashava
    // e uno zero esplicito su massa/rigidezza passava dai default).
    if (!camLift720 || !(rpm > 0) || m_kg <= 0 || k_train <= 0 || k_spring < 0) {
        return _dynInvalid(5e-6, 5e-3);
    }

    // Pulsazione naturale e smorzamento equivalente
    var omega_n  = Math.sqrt(k_train / m_kg);     // rad/s
    var c_eff    = 2 * damping * Math.sqrt(k_train * m_kg);  // N·s/m

    // Velocità angolare albero motore in rad/s (1 ciclo = 720°)
    var rps      = rpm / 60;                      // giri/s
    var degPerSec = rps * 360;                    // deg/s (motore)
    if (degPerSec <= 0) degPerSec = 1;

    // Passo dt: minimo tra 1°/40 motore e 1/80 del periodo naturale
    var dtPerDeg  = 1 / degPerSec;                // sec per 1° motore
    var dtNatural = (2 * Math.PI / omega_n) / 80;
    var subSteps  = Math.max(4, Math.ceil(dtPerDeg / dtNatural));
    var dt        = dtPerDeg / subSteps;          // sec per sotto-step

    // Stato iniziale
    var x = 0;   // posizione valvola (m, convertita da mm)
    var v = 0;   // velocità valvola (m/s)

    function camAt(degIdx) { return _camAtM(camLift720, degIdx); }

    function accel(t, x_cur, v_cur, degAtT) {
        var x_cam = camAt(degAtT);
        // Forza di contatto cam-valvola: solo se cam è SOPRA la valvola
        // (no tensione)
        var contact = x_cam - x_cur;
        var F_cam = contact > 0 ? k_train * contact : 0;
        // Forza molla: sempre presente, proporzionale a x (valvola aperta)
        var F_spring = F0 + k_spring * Math.max(0, x_cur);
        // Forza viscosa: proporzionale alla velocità
        var F_visc = c_eff * v_cur;
        // Eq newton: F_net / m
        var F_net = F_cam - F_spring - F_visc;
        return F_net / m_kg;
    }

    var out = new Array(722);
    for (var ii = 0; ii <= 721; ii++) out[ii] = 0;
    var maxSep = 0, floatIdx = 0;   // audit DYN-01: perdita di contatto

    // AUDIT DYN-02: convergenza PERIODICA, non un numero fisso di cicli. Si
    // integrano più giri riusando lo stato finale come iniziale (transitorio
    // che si smorza) e si REGISTRA solo quando due cicli consecutivi finiscono
    // nello stesso stato (|Δx|,|Δv| entro tolleranza) → CONVERGED. Se non
    // converge entro maxCycles → out.converged=false e il chiamante NON deve
    // emettere verdetti (regime, float, ottimizzazione). Prima 3 cicli fissi:
    // un caso instabile (molla debolissima ad alto regime) sembrava assestato.
    var minCycles = _num(p.minCycles, 3);
    var maxCycles = _num(p.maxCycles, 30);
    var tolX = 5e-6, tolV = 5e-3;   // m, m/s: stato di fine ciclo a regime
    var prevX = null, prevV = null, converged = false, cyclesRun = 0;
    var residX = null, residV = null;   // AUDIT DYN-01: residuo esposto
    // Registriamo out[]/maxSep a OGNI giro (ognuno sovrascrive il precedente):
    // dopo il loop out[] è l'ULTIMO giro. Confronto lo stato di fine giro N con
    // quello di N-1: due giri consecutivi identici (entro tol) = orbita
    // periodica → CONVERGED. break al primo giro convergente (≥minCycles).
    for (var pass = 0; pass < maxCycles; pass++) {
        maxSep = 0; floatIdx = 0;
        for (var deg = 1; deg <= 720; deg++) {
            for (var sub = 0; sub < subSteps; sub++) {
                var degAt = deg + sub / subSteps;
                // RK4 standard
                var k1v = accel(0, x, v, degAt);
                var k1x = v;
                var k2v = accel(0, x + k1x * dt / 2, v + k1v * dt / 2, degAt + 0.5 / subSteps);
                var k2x = v + k1v * dt / 2;
                var k3v = accel(0, x + k2x * dt / 2, v + k2v * dt / 2, degAt + 0.5 / subSteps);
                var k3x = v + k2v * dt / 2;
                var k4v = accel(0, x + k3x * dt,     v + k3v * dt,     degAt + 1.0 / subSteps);
                var k4x = v + k3v * dt;
                x += (k1x + 2 * k2x + 2 * k3x + k4x) * dt / 6;
                v += (k1v + 2 * k2v + 2 * k3v + k4v) * dt / 6;
                // Vincolo: valvola non scende sotto zero (sede valvola)
                if (x < 0) { x = 0; if (v < 0) v = 0; }
                // Separazione = quanto la valvola supera la camma (contatto
                // perso). Quasi-statico: x < x_cam → sep 0; ad alto regime
                // l'inerzia porta x sopra x_cam → sep > 0, cresce coi giri.
                var sep = x - camAt(degAt);
                if (sep > maxSep) { maxSep = sep; floatIdx = deg; }
            }
            // AUDIT v3.4.3 P1-04: il sotto-ciclo integra da `deg` fino a
            // `deg+1`, quindi `x` e' lo stato all'angolo deg+1. Scriverlo in
            // out[deg] anticipava la curva valvola di 1 grado rispetto alla
            // camma, e faceva comparire un "distacco" fantasma di ~0,06 mm
            // anche a regime quasi statico. Si scrive all'indice reale.
            out[(deg % 720) + 1] = x * 1000;  // m → mm
        }
        cyclesRun = pass + 1;
        if (prevX !== null) { residX = Math.abs(x - prevX); residV = Math.abs(v - prevV); }
        if (residX !== null && residX <= tolX && residV <= tolV && cyclesRun >= minCycles) {
            converged = true;
            break;
        }
        prevX = x; prevV = v;
    }
    out.maxSeparation = maxSep * 1000;   // mm
    out.floatIdx = floatIdx;
    out.converged = converged;
    out.cyclesRun = cyclesRun;
    out.status = converged ? 'CONVERGED' : 'NON_CONVERGED';
    out.tolX = tolX; out.tolV = tolV;
    out.residualX = residX; out.residualV = residV;
    return out;
}

// =============================================================
// COMPLIANCE 2-DOF — modello catena (cam → bilancere → valvola)
// =============================================================
// Sistema a 2 gradi di libertà che separa la massa del bilancere/pushrod
// dalla massa della valvola, collegate da una rigidezza intermedia.
// Più realistico per:
//   - motori pushrod (V8 americani, vintage) dove asta + bilancere hanno
//     massa significativa e flessibilità
//   - finger follower con rocker pesante
//   - rocker shaft + bilancere multi-pezzo
//
// Stato: (x1, v1, x2, v2)
//   x1 = posizione bilancere/pushrod (estremità lato valvola)
//   x2 = posizione valvola
//
// Equazioni:
//   m1·ẍ1 = k_push·(x_cam - x1) - k_train·(x1 - x2) - c1·ẋ1
//   m2·ẍ2 = k_train·(x1 - x2) - k_spring·x2 - F0 - c2·ẋ2
//
// Quando contact cam-bilancere si perde (x_cam < x1): k_push → 0 (no tension)
// Quando contact bilancere-valvola si perde (x1 < x2): k_train → 0
//
// Solver: Runge-Kutta 4° ordine su stato (x1, v1, x2, v2).
function simulateCompliance2DOF(camLift720, rpm, params) {
    var p = params || {};
    var m1_kg = _num(p.massEqIntermediateG, 60) / 1000;  // massa bilancere
    var m2_kg = _num(p.massEqG, 100) / 1000;             // massa valvola
    var k_push  = _num(p.kPushrodN_mm, 800) * 1000;      // rigidezza pushrod/cam-bilancere
    var k_train = _num(p.kTrainN_mm, 5000) * 1000;       // rigidezza bilancere-valvola
    var k_spring = _num(p.kSpringN_mm, 30) * 1000;       // rigidezza molla valvola
    var F0       = _num(p.F0N, 200);
    var damping  = _num(p.dampingRatio, 0.06);

    // AUDIT DYN-01: input invalido TIPIZZATO
    if (!camLift720 || !(rpm > 0) || m1_kg <= 0 || m2_kg <= 0 || k_push <= 0 || k_train <= 0 || k_spring < 0) {
        return _dynInvalid(5e-6, 5e-3);
    }

    var omega_n1 = Math.sqrt(k_push / m1_kg);
    var omega_n2 = Math.sqrt(k_train / m2_kg);
    var c1 = 2 * damping * Math.sqrt(k_push * m1_kg);
    var c2 = 2 * damping * Math.sqrt(k_train * m2_kg);

    var rps = rpm / 60;
    var degPerSec = rps * 360;
    if (degPerSec <= 0) degPerSec = 1;
    var dtPerDeg  = 1 / degPerSec;
    var dtNatural = (2 * Math.PI / Math.max(omega_n1, omega_n2)) / 80;
    var subSteps  = Math.max(6, Math.ceil(dtPerDeg / dtNatural));
    var dt = dtPerDeg / subSteps;

    var x1 = 0, v1 = 0, x2 = 0, v2 = 0;

    function camAt(degIdx) { return _camAtM(camLift720, degIdx); }

    function deriv(x1c, v1c, x2c, v2c, degAtT) {
        var x_cam = camAt(degAtT);
        // F_cam→bilancere: solo se cam spinge il bilancere (no tensione)
        var contact1 = x_cam - x1c;
        var F_push = contact1 > 0 ? k_push * contact1 : 0;
        // F_bilancere→valvola: solo se bilancere spinge la valvola
        var contact2 = x1c - x2c;
        var F_train = contact2 > 0 ? k_train * contact2 : 0;
        // F_molla valvola
        var F_spring = F0 + k_spring * Math.max(0, x2c);
        // Viscose
        var F_visc1 = c1 * v1c;
        var F_visc2 = c2 * v2c;
        // Newton
        var a1 = (F_push - F_train - F_visc1) / m1_kg;
        var a2 = (F_train - F_spring - F_visc2) / m2_kg;
        return [v1c, a1, v2c, a2];
    }

    var out = new Array(722);
    for (var ii = 0; ii <= 721; ii++) out[ii] = 0;
    var maxSep = 0, floatIdx = 0;   // separazione cam-bilancere (audit DYN-01)

    // AUDIT DYN-02: convergenza periodica (vedi 1-DOF). Registra ogni giro,
    // confronta lo stato (x1,v1,x2,v2) di fine giro con il precedente.
    var minCycles = _num(p.minCycles, 3), maxCycles = _num(p.maxCycles, 30);
    var tolX = 5e-6, tolV = 5e-3;
    var pX1 = null, pV1 = null, pX2 = null, pV2 = null, converged = false, cyclesRun = 0;
    var residX = null, residV = null;   // AUDIT DYN-01: residuo esposto
    for (var pass = 0; pass < maxCycles; pass++) {
        maxSep = 0; floatIdx = 0;
        for (var deg = 1; deg <= 720; deg++) {
            for (var sub = 0; sub < subSteps; sub++) {
                var degAt = deg + sub / subSteps;
                // RK4 multi-dimensionale
                var k1 = deriv(x1, v1, x2, v2, degAt);
                var k2 = deriv(x1 + k1[0]*dt/2, v1 + k1[1]*dt/2, x2 + k1[2]*dt/2, v2 + k1[3]*dt/2, degAt + 0.5/subSteps);
                var k3 = deriv(x1 + k2[0]*dt/2, v1 + k2[1]*dt/2, x2 + k2[2]*dt/2, v2 + k2[3]*dt/2, degAt + 0.5/subSteps);
                var k4 = deriv(x1 + k3[0]*dt,   v1 + k3[1]*dt,   x2 + k3[2]*dt,   v2 + k3[3]*dt,   degAt + 1.0/subSteps);
                x1 += (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]) * dt / 6;
                v1 += (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]) * dt / 6;
                x2 += (k1[2] + 2*k2[2] + 2*k3[2] + k4[2]) * dt / 6;
                v2 += (k1[3] + 2*k2[3] + 2*k3[3] + k4[3]) * dt / 6;
                // Vincolo: né bilancere né valvola sotto zero
                if (x1 < 0) { x1 = 0; if (v1 < 0) v1 = 0; }
                if (x2 < 0) { x2 = 0; if (v2 < 0) v2 = 0; }
                var sep = x1 - camAt(degAt);   // contatto perso = bilancere sopra la camma
                if (sep > maxSep) { maxSep = sep; floatIdx = deg; }
            }
            // AUDIT v3.4.3 P1-04: stato all'angolo deg+1, scritto al suo indice
            out[(deg % 720) + 1] = x2 * 1000;   // lift VALVOLA osservato all'esterno
        }
        cyclesRun = pass + 1;
        if (pX1 !== null) {
            residX = Math.max(Math.abs(x1 - pX1), Math.abs(x2 - pX2));
            residV = Math.max(Math.abs(v1 - pV1), Math.abs(v2 - pV2));
        }
        if (residX !== null && residX <= tolX && residV <= tolV && cyclesRun >= minCycles) {
            converged = true; break;
        }
        pX1 = x1; pV1 = v1; pX2 = x2; pV2 = v2;
    }
    out.maxSeparation = maxSep * 1000;
    out.floatIdx = floatIdx;
    out.converged = converged;
    out.cyclesRun = cyclesRun;
    out.status = converged ? 'CONVERGED' : 'NON_CONVERGED';
    out.tolX = tolX; out.tolV = tolV;
    out.residualX = residX; out.residualV = residV;
    return out;
}

// =============================================================
// COMPLIANCE 3-DOF — catena con CEDEVOLEZZA SEDE VALVOLA
// =============================================================
// Estende il 2-DOF aggiungendo una terza massa: la SEDE valvola (insert +
// porzione locale di testata). La sede non è infinitamente rigida: sotto
// l'impatto della valvola in chiusura si flette, immagazzina energia e la
// restituisce → può RIMBALZARE la valvola (valve bounce / seat bounce), un
// modo di guasto che né l'1-DOF né il 2-DOF catturano (entrambi clampano
// la valvola a 0 con un "pavimento" rigido).
//
// Catena: cam → bilancere(m1) → valvola(m2) → sede(m3) → massa motore
// Stato: (x1, v1, x2, v2, x3, v3), tutti + nel verso di APERTURA dalla
// posizione di valvola chiusa.
//   x1 = bilancere/pushrod (lato valvola)
//   x2 = valvola            (lift osservato)
//   x3 = sede valvola       (a riposo 0; si flette sotto impatto)
//
// Contatto valvola↔sede: unilaterale, attivo solo quando la valvola
// oltrepassa la sede. gap g = x2 − x3:
//   g ≥ 0 → valvola aperta sopra la sede, nessun contatto
//   g < 0 → valvola "affonda" nella sede → forza di penalità che la
//           respinge (e spinge la sede nel verso opposto)
//   N = −k_contact·g − c_contact·(v2−v3)   (≥0, solo spinta)
// La sede è richiamata a 0 da k_seat (rigidezza testata/insert) + c_seat.
//
// VERIFICA AL LIMITE: per k_seat→∞, k_contact→∞, m3→0 la sede diventa un
// pavimento rigido (x3≈0, la valvola non può scendere sotto 0) → il 3-DOF
// converge esattamente al 2-DOF. (test in tools/test_3dof.js)
//
// Solver: RK4 su stato a 6 componenti.
function simulateCompliance3DOF(camLift720, rpm, params) {
    var p = params || {};
    var m1_kg = _num(p.massEqIntermediateG, 60) / 1000;  // bilancere
    var m2_kg = _num(p.massEqG, 100) / 1000;             // valvola
    var m3_kg = _num(p.massSeatG, 15)  / 1000;           // sede valvola (effettiva)
    var k_push   = _num(p.kPushrodN_mm, 800)  * 1000;    // cam→bilancere
    var k_train  = _num(p.kTrainN_mm, 5000) * 1000;      // bilancere→valvola
    var k_spring = _num(p.kSpringN_mm, 30)   * 1000;     // molla valvola
    var k_seat   = _num(p.kSeatN_mm, 80000)* 1000;       // sede→testata (rigidezza)
    // Cedevolezza pivot bilanciere (lato perno): molla del perno verso terra.
    // 0 = perno libero → comportamento 3-DOF originale (bilanciere massa libera
    // tra k_push e k_train). Valori finiti = perno con rigidezza propria
    // (cede sotto carico). Più alto = perno più rigido/vincolato.
    // AUDIT v3.4.3 P1-06 — cedevolezza del perno bilanciere DISATTIVATA.
    // Il modello precedente applicava una molla a terra direttamente sulla
    // coordinata di lavoro del bilanciere (k_pivot * x1): irrigidire il perno
    // ne IMPEDIVA il movimento invece di lasciarlo cedere. Misurato: perno 0
    // -> valvola 9,69 mm; 20.000 -> 0,34; 1.000.000 -> 0,00, con distacco 0 e
    // semaforo verde su un risultato privo di senso. Il limite fisico corretto
    // (perno infinitamente rigido = perno fermo) deve dare il caso base.
    // Modellarlo davvero richiede una quarta coordinata (traslazione del perno)
    // piu' i bracci di leva, e una validazione che non e' stata fatta: finche'
    // non esiste, il parametro viene IGNORATO invece di produrre numeri falsi.
    var k_pivot  = 0;
    var kPivotIgnorato = !!(p.kPivotN_mm && p.kPivotN_mm > 0);
    var F0       = _num(p.F0N, 200);
    var damping  = _num(p.dampingRatio, 0.06);

    // AUDIT DYN-01: input invalido TIPIZZATO
    if (!camLift720 || !(rpm > 0) || m1_kg <= 0 || m2_kg <= 0 || m3_kg <= 0 ||
        k_push <= 0 || k_train <= 0 || k_seat <= 0 || k_spring < 0) {
        return _dynInvalid(5e-6, 5e-3);
    }

    // Rigidezza di contatto valvola-sede: stesso ordine della sede.
    var k_contact = k_seat;
    // Smorzamento di contatto più alto (seating anelastico, e_restituz<1).
    var zeta_c    = 0.30;

    var c_pivot = k_pivot > 0 ? 2 * damping * Math.sqrt(k_pivot * m1_kg) : 0;
    var c1 = 2 * damping * Math.sqrt(k_push  * m1_kg);
    var c2 = 2 * damping * Math.sqrt(k_train * m2_kg);
    var c3 = 2 * damping * Math.sqrt(k_seat  * m3_kg);
    var c_contact = 2 * zeta_c * Math.sqrt(k_contact * m2_kg);

    // Passo: risolve il modo più rigido (contatto/sede) a 1/80 di periodo.
    var omegaMax = Math.sqrt(Math.max(k_push/m1_kg, k_train/m2_kg,
                                      k_seat/m3_kg, k_contact/m2_kg, k_pivot/m1_kg));
    var rps = rpm / 60;
    var degPerSec = rps * 360;
    if (degPerSec <= 0) degPerSec = 1;
    var dtPerDeg  = 1 / degPerSec;
    var dtNatural = (2 * Math.PI / omegaMax) / 80;
    var subSteps  = Math.max(6, Math.ceil(dtPerDeg / dtNatural));
    if (subSteps > 400) subSteps = 400;   // cap anti-freeze per k_seat estremi
    var dt = dtPerDeg / subSteps;

    var x1 = 0, v1 = 0, x2 = 0, v2 = 0, x3 = 0, v3 = 0;

    function camAt(degIdx) { return _camAtM(camLift720, degIdx); }

    function deriv(x1c, v1c, x2c, v2c, x3c, v3c, degAtT) {
        var x_cam = camAt(degAtT);
        var contact1 = x_cam - x1c;
        var F_push  = contact1 > 0 ? k_push * contact1 : 0;
        var contact2 = x1c - x2c;
        var F_train = contact2 > 0 ? k_train * contact2 : 0;
        var F_spring = F0 + k_spring * Math.max(0, x2c);
        // Contatto valvola-sede (unilaterale): solo se g = x2 - x3 < 0
        var g = x2c - x3c;
        var N = 0;
        if (g < 0) {
            N = -k_contact * g - c_contact * (v2c - v3c);
            if (N < 0) N = 0;   // il contatto spinge soltanto, non tira
        }
        // Newton: N spinge la valvola in +x (la riapre = bounce), la sede in -x
        // Cedevolezza pivot: richiamo elastico del perno verso terra (se k_pivot>0)
        var F_pivot = k_pivot > 0 ? (k_pivot * x1c + c_pivot * v1c) : 0;
        var a1 = (F_push - F_train - c1 * v1c - F_pivot) / m1_kg;
        var a2 = (F_train - F_spring - c2 * v2c + N) / m2_kg;
        var a3 = (-N - k_seat * x3c - c3 * v3c) / m3_kg;
        return [v1c, a1, v2c, a2, v3c, a3];
    }

    var out = new Array(722);
    for (var ii = 0; ii <= 721; ii++) out[ii] = 0;
    var maxSep = 0, floatIdx = 0;   // separazione cam-bilancere (audit DYN-01)

    // AUDIT DYN-02: convergenza periodica (vedi 1-DOF).
    var minCycles = _num(p.minCycles, 3), maxCycles = _num(p.maxCycles, 30);
    var tolX = 5e-6, tolV = 5e-3;
    var pX1 = null, pV1 = null, pX2 = null, pV2 = null, pX3 = null, pV3 = null, converged = false, cyclesRun = 0;
    var residX = null, residV = null;   // AUDIT DYN-01: residuo esposto
    for (var pass = 0; pass < maxCycles; pass++) {
        maxSep = 0; floatIdx = 0;
        for (var deg = 1; deg <= 720; deg++) {
            for (var sub = 0; sub < subSteps; sub++) {
                var degAt = deg + sub / subSteps;
                var k1 = deriv(x1, v1, x2, v2, x3, v3, degAt);
                var k2 = deriv(x1 + k1[0]*dt/2, v1 + k1[1]*dt/2, x2 + k1[2]*dt/2, v2 + k1[3]*dt/2, x3 + k1[4]*dt/2, v3 + k1[5]*dt/2, degAt + 0.5/subSteps);
                var k3 = deriv(x1 + k2[0]*dt/2, v1 + k2[1]*dt/2, x2 + k2[2]*dt/2, v2 + k2[3]*dt/2, x3 + k2[4]*dt/2, v3 + k2[5]*dt/2, degAt + 0.5/subSteps);
                var k4 = deriv(x1 + k3[0]*dt,   v1 + k3[1]*dt,   x2 + k3[2]*dt,   v2 + k3[3]*dt,   x3 + k3[4]*dt,   v3 + k3[5]*dt,   degAt + 1.0/subSteps);
                x1 += (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]) * dt / 6;
                v1 += (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]) * dt / 6;
                x2 += (k1[2] + 2*k2[2] + 2*k3[2] + k4[2]) * dt / 6;
                v2 += (k1[3] + 2*k2[3] + 2*k3[3] + k4[3]) * dt / 6;
                x3 += (k1[4] + 2*k2[4] + 2*k3[4] + k4[4]) * dt / 6;
                v3 += (k1[5] + 2*k2[5] + 2*k3[5] + k4[5]) * dt / 6;
                // Il bilancere non scende sotto zero (contatto cam unilaterale).
                // La valvola NON è clampata: la sede compliante fa da pavimento.
                if (x1 < 0) { x1 = 0; if (v1 < 0) v1 = 0; }
                var sep = x1 - camAt(degAt);
                if (sep > maxSep) { maxSep = sep; floatIdx = deg; }
            }
            // Lift valvola osservato: mai negativo (la valvola non affonda nella
            // testata oltre la flessione sede).
            // AUDIT v3.4.3 P1-04: stato all'angolo deg+1, scritto al suo indice
            out[(deg % 720) + 1] = Math.max(0, x2) * 1000;
        }
        cyclesRun = pass + 1;
        if (pX1 !== null) {
            residX = Math.max(Math.abs(x1 - pX1), Math.abs(x2 - pX2), Math.abs(x3 - pX3));
            residV = Math.max(Math.abs(v1 - pV1), Math.abs(v2 - pV2), Math.abs(v3 - pV3));
        }
        if (residX !== null && residX <= tolX && residV <= tolV && cyclesRun >= minCycles) {
            converged = true; break;
        }
        pX1=x1;pV1=v1;pX2=x2;pV2=v2;pX3=x3;pV3=v3;
    }
    out.maxSeparation = maxSep * 1000;
    out.floatIdx = floatIdx;
    out.converged = converged;
    out.cyclesRun = cyclesRun;
    out.status = converged ? 'CONVERGED' : 'NON_CONVERGED';
    out.tolX = tolX; out.tolV = tolV;
    out.residualX = residX; out.residualV = residV;
    // AUDIT P1-06: se l'utente ha compilato "k perno bilanciere" deve sapere
    // che il valore NON e' stato usato (modello non validato, vedi sopra).
    out.kPivotIgnorato = kPivotIgnorato;
    return out;
}

// Indicatore valve float = PERDITA DI CONTATTO cam-punteria (audit DYN-01).
// La separazione è tracciata DENTRO il solver (max di follower − camma, con
// camma interpolata): 0 al quasi-statico, crescente coi giri. Se il solver
// l'ha esposta (.maxSeparation) la usiamo; altrimenti fallback all'overshoot
// della valvola sopra la camma. maxGap mantiene il nome per compatibilità coi
// consumatori, ma ora significa "distacco" (mm), NON lo schiacciamento
// elastico che il vecchio max(camLift − valveLift) misurava per errore
// (~0,1 mm anche a 1 rpm, e DECRESCENTE coi giri).
function detectValveFloat(camLift720, valveLift720) {
    if (valveLift720 && typeof valveLift720.maxSeparation === 'number') {
        return {
            maxGap: valveLift720.maxSeparation,
            gapIdx: valveLift720.floatIdx || 0,
            separation: true
        };
    }
    var maxGap = 0, gapIdx = 0;
    for (var i = 1; i <= 720; i++) {
        var g = (valveLift720[i] || 0) - (camLift720[i] || 0);   // overshoot valvola > camma
        if (g > maxGap) { maxGap = g; gapIdx = i; }
    }
    return { maxGap: maxGap, gapIdx: gapIdx, separation: false };
}

// AUDIT v3.4.3 P1-09 — il parametro "inclinazione finger" e' stato RIMOSSO
// perche' matematicamente inerte, non per semplificazione. Dimostrazione:
// col modello speculare theta_val0 = -theta_cam0 si ha
//     dPhi      = asin(sin(t) + L/lArm) - t     =>  sin(t + dPhi) = sin(t) + L/lArm
//     deltaVal  = lValve*sin(-t - dPhi) + lValve*sin(t)
//               = -lValve*(sin(t) + L/lArm) + lValve*sin(t) = -lValve*L/lArm
// il termine in t si elide per QUALUNQUE inclinazione: restava solo rumore di
// virgola mobile (misurato 4,9e-15 mm fra 0 e 30 gradi). Il modello e' quindi
// un puro rapporto di leva, e ora lo dichiara apertamente.
//
// USCITA: moto lato VALVOLA, gia' amplificato di lValve/lArm. Chi lo usa NON
// deve applicare un secondo rapporto di leva (vedi FOLLOWER_OUTPUT_DOMAIN).
function convertPuntToFinger(camLiftRaw, rBase, lArm, lValve, rPunt) {
    rPunt = (typeof rPunt === 'number' && rPunt > 0) ? rPunt : 0;
    if (!lArm || lArm <= 0)     lArm = 25;
    if (!lValve || lValve <= 0) lValve = 30;
    var rapporto = lValve / lArm;

    var out = new Array(361);
    out[0] = 0;
    var saturated = false;
    var lt = stylusCompensate(camLiftRaw, rBase, rPunt);   // profilo cam vero
    for (var t = 1; t <= 360; t++) {
        var ltrue = lt[t];
        if (ltrue <= 0) { out[t] = 0; continue; }
        // Saturazione geometrica: alzata oltre la corsa del braccio camma.
        // Segnalata invece di essere clampata in silenzio.
        if (ltrue / lArm > 1) saturated = true;
        out[t] = ltrue * rapporto;
    }
    window._fingerSaturated = saturated;   // letto dal dispatcher per l'avviso
    return out;
}

// Dominio del moto restituito da ciascun convertitore follower.
// 'cam'   = moto lato camma: il chiamante DEVE applicare il rapporto leva.
// 'valve' = moto gia' riportato alla valvola: applicare un secondo rapporto
//           gonfia l'alzata (il finger dava +50%: 15,75 invece di 10,5 mm).
var FOLLOWER_OUTPUT_DOMAIN = {
    punt:   'cam',
    bicch:  'cam',
    roller: 'cam',
    finger: 'valve'
};

// ========== HELPER: Map cam degrees to crankshaft degrees ==========

// Posizione del picco del lobo in gradi-camma, con risoluzione SUB-GRADO
// (fit parabolico sui tre punti attorno al massimo, circolare). È il
// riferimento fisico della fase: lo zero di scansione è arbitrario (dipende
// da dove l'operatore ha azzerato), il naso del lobo no (audit MAT-02).
function camPeakPos(camLift) {
    var m = 1, best = -Infinity, d;
    for (d = 1; d <= 360; d++) {
        var v = Number(camLift[d]);
        if (isFinite(v) && v > best) { best = v; m = d; }
    }
    if (!(best > 0)) return 180;                        // profilo piatto: neutro
    // AUDIT MAT-02: naso PIATTO. Non basta il primo massimo (su un plateau
    // 170..190 tornava 170.5): si cerca il componente circolare con lift entro
    // una tolleranza dal massimo che CONTIENE il massimo globale e se ne
    // restituisce il centro. Su un picco netto il plateau è largo 1 e si
    // ricade sul fit parabolico di prima.
    var tol = Math.max(0.02, 0.01 * best);   // risoluzione ~µm o 1% del picco
    function at(i) { return Number(camLift[((i - 1) % 360 + 360) % 360 + 1]) || 0; }
    var lo = m, hi = m, guard = 0;
    while (at(lo - 1) >= best - tol && guard++ < 360) lo--;
    guard = 0;
    while (at(hi + 1) >= best - tol && guard++ < 360) hi++;
    if (hi - lo >= 2) {                                  // plateau: centro del componente
        var center = (lo + hi) / 2;
        return ((Math.round(center * 1000) / 1000 - 1) % 360 + 360) % 360 + 1;
    }
    // picco netto: fit parabolico sui tre punti attorno al massimo (circolare)
    var prev = ((m - 2) % 360 + 360) % 360 + 1;
    var next = (m % 360) + 1;
    var y0 = Number(camLift[prev]) || 0, y1 = best, y2 = Number(camLift[next]) || 0;
    var den = y0 - 2 * y1 + y2;
    var delta = (den < -1e-12 || den > 1e-12) ? 0.5 * (y0 - y2) / den : 0;
    if (delta > 0.5) delta = 0.5;
    if (delta < -0.5) delta = -0.5;
    return m + delta;
}

// AUDIT MAT-03: eventi apertura/chiusura dai CROSSING REALI della curva fasata,
// non da centro±durata/2 (che assume un lobo simmetrico e su camme reali
// asimmetriche sbaglia anche di ~60°). Sulla curva crank 1..720 (già fasata,
// gioco sottratto) trova il picco, poi l'attraversamento CRESCENTE della soglia
// prima del picco (apertura) e quello DECRESCENTE dopo (chiusura), interpolati
// sub-grado. Gestisce il wrap 720→1. Ritorna indici crank frazionari.
// AUDIT MAT-01 (controrevisione): scansione a REGIONI di tutto il giro, non
// più la sola coppia attorno al picco globale (che ignorava silenziosamente
// un secondo lobo). Regole documentate:
//  - una regione sopra-soglia è un LOBO CANDIDATO se il suo picco supera
//    thr + max(20% dell'escursione del picco globale, risoluzione strumento):
//    gli spuntoni di rumore appena sopra soglia non contano;
//  - 1 candidato  -> eventi da openIdx/closeIdx interpolati (wrap gestito);
//  - >1 candidati (due lobi, due plateau equivalenti, ...) -> ambiguous=true,
//    openIdx/closeIdx NaN e TUTTE le coppie in .candidates: il chiamante non
//    deve scegliere in silenzio.
// resolution (mm) = risoluzione dello strumento di misura; default 0.01
// (una tacca del comparatore centesimale del banco).
function findEvents(crank, threshold, resolution) {
    var thr = (typeof threshold === 'number' && threshold > 0) ? threshold : 0.05;
    var res = (typeof resolution === 'number' && resolution > 0) ? resolution : 0.01;
    function at(i) { return Number(crank[((i - 1) % 720 + 720) % 720 + 1]) || 0; }
    function norm(x) { return ((x - 1) % 720 + 720) % 720 + 1; }
    // picco globale
    var pk = 1, best = -Infinity;
    for (var d = 1; d <= 720; d++) { var v = at(d); if (v > best) { best = v; pk = d; } }
    if (!(best > thr)) return { openIdx: NaN, closeIdx: NaN, durationDeg: 0, peakIdx: pk, ambiguous: true, reason: 'profilo sotto soglia', candidates: [] };
    // Tutti i crossing del giro, interpolati sub-grado.
    // rising tra i e i+1: at(i) < thr <= at(i+1); falling: at(i) >= thr > at(i+1)
    var rising = [], falling = [];
    for (var i = 1; i <= 720; i++) {
        var a = at(i), b = at(i + 1);
        if (a < thr && b >= thr) rising.push(i + (thr - a) / (b - a));
        if (a >= thr && b < thr) falling.push(i + (a - thr) / (a - b));
    }
    if (!rising.length || !falling.length) {
        // sopra soglia per l'intero giro: nessun evento definibile
        return { openIdx: NaN, closeIdx: NaN, durationDeg: 0, peakIdx: pk, ambiguous: true, reason: 'nessun attraversamento della soglia', candidates: [] };
    }
    // Regioni: ogni rising accoppiato col primo falling successivo (circolare)
    var regions = [];
    for (var r = 0; r < rising.length; r++) {
        var o = rising[r], c = null, gapBest = Infinity;
        for (var f = 0; f < falling.length; f++) {
            var gap = falling[f] - o; if (gap <= 0) gap += 720;
            if (gap < gapBest) { gapBest = gap; c = falling[f]; }
        }
        // picco della regione (scansione dall'apertura alla chiusura)
        var rp = -Infinity;
        for (var s = 0, lim = Math.ceil(gapBest); s <= lim; s++) {
            var vv = at(Math.ceil(o) + s); if (vv > rp) rp = vv;
        }
        regions.push({ openIdx: norm(o), closeIdx: norm(c), durationDeg: gapBest, peak: rp });
    }
    // Regola documentata: candidato = picco regione >= thr + max(20% escursione, risoluzione)
    var minPeak = thr + Math.max(0.2 * (best - thr), res);
    var candidates = regions.filter(function (g) { return g.peak >= minPeak; });
    if (!candidates.length) candidates = regions;   // difensivo: mai lista vuota qui
    if (candidates.length > 1) {
        return { openIdx: NaN, closeIdx: NaN, durationDeg: 0, peakIdx: pk,
                 ambiguous: true, reason: candidates.length + ' lobi/regioni equivalenti sopra soglia',
                 candidates: candidates };
    }
    var reg = candidates[0];
    return { openIdx: reg.openIdx, closeIdx: reg.closeIdx, durationDeg: reg.durationDeg,
             peakIdx: pk, ambiguous: false, candidates: [reg] };
}

// Centri lobo EFFETTIVI con anticipo applicato (audit MAT-04): montare la
// camma con adv gradi di anticipo sposta l'aspirazione più vicina al PMS
// (centro ATDC ridotto) e lo scarico più lontano (centro BTDC aumentato).
function effectiveCenters(intakeCenter, exhaustCenter, advance) {
    var adv = Number(advance) || 0;
    return { intake: Number(intakeCenter) - adv, exhaust: Number(exhaustCenter) + adv };
}

// Mappa 360 punti camma (1 grado/step) → 720 punti albero motore (0.5°/slot).
// CONVENZIONE (= etichette della UI, audit MAT-03): asse albero 1..720 con
// PMS incrocio all'indice 360; aspirazione = centro lobo centerDeg gradi DOPO
// il PMS (picco a 360+centerDeg), scarico = centerDeg gradi PRIMA (360-centerDeg).
// La fase è agganciata al PICCO MISURATO (camPeakPos, sub-grado): due scansioni
// dello stesso lobo con zeri diversi danno la stessa curva mappata (MAT-02).
// centerDeg è il centro EFFETTIVO (già comprensivo di anticipo — MAT-04:
// i chiamanti lo ottengono da effectiveCenters()).
//
// FIX audit MAT-01 (2026-07-14): mappatura INVERSA con interpolazione — la
// versione diretta scriveva crank[d*2±angle] e con centri frazionari (che la
// UI accetta a step 0.5) produceva indici frazionari → curva azzerata in
// silenzio. Ora per ogni slot intero p si legge camLift interpolato.
// AUDIT v3.4.3 P1-05 — il gioco si registra fra bilanciere e stelo, cioe' a
// VALLE del rapporto di leva, mentre mapCamToCrank lo sottrae dalla curva
// LATO CAMMA (a monte). Componendo con applyRockerRatio si otteneva
//     (alzata_camma - gioco) * rocker
// invece della relazione coerente col nome del campo ("Gioco valvola"):
//     max(0, alzata_camma * rocker - gioco)
// cioe' un gioco gonfiato del rapporto stesso (0,20 con leva 1,5 si comportava
// come 0,30: durata al sedile e fasatura piu' corte del vero).
// Riportando il gioco lato camma prima della mappatura le due espressioni
// coincidono, perche' max(0, L - g/r) * r === max(0, L*r - g) per r > 0.
// Con bicchiere (rapporto 1,00) non cambia nulla: le misure gia' fatte su
// Clio e VW restano identiche bit per bit.
function lashLatoCamma(clearanceValvola, rocker) {
    var g = Number(clearanceValvola);
    if (!isFinite(g) || g <= 0) return 0;
    var r = Number(rocker);
    if (!isFinite(r) || r <= 0) r = 1;
    return g / r;
}

// -------------------------------------------------------------------------
// CARICO MOLLA RICHIESTO DALLA CAMMA
//
// Il problema al contrario. Il resto del programma chiede "che molla hai?" e
// risponde con un verdetto: utile solo se la molla ce l'hai gia' e ne conosci
// k e F0. Qui si parte da cio' che l'officina possiede davvero — la camma
// misurata, la massa alterna pesata, il regime deciso — e si dice QUALE CARICO
// SERVE. Niente da indovinare.
//
// Fisica. Dove la valvola decelera, la camma non puo' tirarla: sa solo
// spingere. La forza che la tiene a contatto la deve dare la molla.
//     a_tempo(theta) = a_deg(theta) * (6*rpm)^2 * 1e-3        [m/s^2]
//     carico richiesto(theta) = S * m * |a_tempo|   dove a_tempo < 0   [N]
// A una stessa alzata corrispondono DUE punti del ciclo, il fianco di apertura
// e quello di chiusura, con accelerazioni diverse: si prende il peggiore. Su un
// lobo asimmetrico e' quasi sempre il fianco di chiusura.
//
// COSA QUESTO NUMERO NON E'. E' il requisito CINEMATICO su treno RIGIDO:
//  - ignora la cedevolezza del treno, che alza il requisito (per quello c'e' il
//    solver di compliance);
//  - non e' il carico a valvola chiusa necessario a tenere la tenuta contro la
//    pressione in camera, che e' un'altra verifica;
//  - non dice niente su coil bind, tensione del filo, fatica, risonanza delle
//    spire.
// Va letto come "sotto questo carico la valvola stacca", non come "la molla
// giusta e' questa".
//
// Il margine di sicurezza e' una SCELTA di chi progetta, non una misura: entra
// come moltiplicatore esplicito e va dichiarato accanto al risultato.
// -------------------------------------------------------------------------
function caricoMollaRichiesto(valveLift720, accValveDeg720, massEqG, rpm, opts) {
    var o = opts || {};
    var S = (typeof o.sicurezza === 'number' && isFinite(o.sicurezza) && o.sicurezza > 0) ? o.sicurezza : 1;
    var IPOTESI = 'Requisito cinematico su treno RIGIDO: non include la cedevolezza del ' +
                  'comando (che lo alza), il carico di tenuta a valvola chiusa, coil bind, ' +
                  'tensione del filo, fatica ne\' risonanza delle spire.';
    var vuoto = { valutabile: false, punti: [], vincolante: null, alzataMaxMm: 0,
                  sicurezza: S, rpm: rpm, massaG: massEqG, ipotesi: IPOTESI, motivo: null };

    var m = Number(massEqG);
    if (!isFinite(m) || m <= 0) { vuoto.motivo = 'massa equivalente non valida'; return vuoto; }
    var n = Number(rpm);
    if (!isFinite(n) || n <= 0) { vuoto.motivo = 'regime non valido'; return vuoto; }
    if (!valveLift720 || !accValveDeg720) { vuoto.motivo = 'curve assenti'; return vuoto; }

    var mKg = m / 1000;
    var omega = 6 * n;                 // gradi/s
    var fatt = mKg * omega * omega * 1e-3;   // da mm/grado^2 a newton

    // Requisito grado per grado, solo dove la valvola DECELERA.
    var req = new Array(721), alzMax = 0;
    for (var i = 1; i <= 720; i++) {
        var L = Number(valveLift720[i]);
        var a = Number(accValveDeg720[i]);
        if (!isFinite(L)) L = 0;
        if (L > alzMax) alzMax = L;
        req[i] = (isFinite(a) && a < 0) ? S * (-a) * fatt : 0;
    }
    if (!(alzMax > 0)) { vuoto.motivo = 'alzata nulla'; return vuoto; }

    // Per una data alzata: il punto peggiore fra tutti gli angoli che la
    // raggiungono. Si accetta una fascia di mezzo grado di alzata attorno al
    // valore chiesto, cosi' si trova sempre un campione su entrambi i fianchi.
    function peggioreAllAlzata(target) {
        var tol = Math.max(0.05, alzMax * 0.02);
        var best = null;
        for (var k = 1; k <= 720; k++) {
            var L = Number(valveLift720[k]);
            if (!isFinite(L) || Math.abs(L - target) > tol) continue;
            if (!best || req[k] > best.forzaN) best = { alzataMm: L, forzaN: req[k], gradi: k - 360 };
        }
        return best;
    }

    var alzate = Array.isArray(o.alzate) ? o.alzate.slice() : [0, 1, 2, 3, 5, 7, 9];
    var punti = [];
    alzate.forEach(function (t) {
        if (!isFinite(t) || t < 0 || t > alzMax + 1e-9) return;   // niente alzate inventate
        var p = peggioreAllAlzata(t);
        if (p) punti.push({ alzataMm: t, forzaN: p.forzaN, gradi: p.gradi, alzataTrovataMm: p.alzataMm });
    });
    // L'alzata massima e' sempre inclusa: e' quasi sempre il punto vincolante.
    var pMax = peggioreAllAlzata(alzMax);
    if (pMax) punti.push({ alzataMm: alzMax, forzaN: pMax.forzaN, gradi: pMax.gradi, alzataTrovataMm: pMax.alzataMm });
    punti.sort(function (x, y) { return x.alzataMm - y.alzataMm; });

    // Il punto vincolante vero: il massimo del requisito su tutto il ciclo,
    // che non e' necessariamente una delle alzate tabellate.
    var vinc = null;
    for (var j = 1; j <= 720; j++) {
        if (!vinc || req[j] > vinc.forzaN) {
            vinc = { forzaN: req[j], gradi: j - 360, alzataMm: Number(valveLift720[j]) || 0 };
        }
    }

    return {
        valutabile: true, motivo: null,
        punti: punti, vincolante: vinc, alzataMaxMm: alzMax,
        sicurezza: S, rpm: n, massaG: m, ipotesi: IPOTESI
    };
}

// -------------------------------------------------------------------------
// AUDIT v3.4.3 P2-03 — riepilogo di convergenza SENZA perdita di informazione.
//
// Prima lo snapshot conservava:
//     residual: Math.max(compInfo.residualIn || 0, compInfo.residualEx || 0)
// che perde tre cose. (1) `|| 0` trasforma un residuo MAI MISURATO (null, il
// caso INVALID_INPUT) in "0.00e+0", cioe' in una convergenza perfetta: il
// foglio esportato dichiarava zero errore proprio dove non c'era alcun
// calcolo. (2) Math.max schiaccia i due lati: non si sa piu' QUALE non
// converge. (3) si conservava il solo residuo di POSIZIONE, mentre il criterio
// di convergenza guarda anche la VELOCITA': un caso che fallisce sulla sola
// velocita' risultava con residuo dentro tolleranza e stato NON_CONVERGED,
// contraddizione apparente senza spiegazione.
//
// Qui si conserva tutto per lato e si dichiara chi ha fallito e su quale
// criterio. Nessun confronto fra grandezze di dimensione diversa: dove serve
// un ordinamento si usa il rapporto residuo/tolleranza, che e' adimensionale.
// -------------------------------------------------------------------------
function riassuntoConvergenza(vIn, vEx) {
    function stato(v) {
        if (!v) return null;
        return v.status || (v.converged !== false ? 'CONVERGED' : 'NON_CONVERGED');
    }
    function val(x) { return (typeof x === 'number' && isFinite(x)) ? x : null; }
    var sIn = stato(vIn), sEx = stato(vEx);
    var agg = (sIn === 'INVALID_INPUT' || sEx === 'INVALID_INPUT') ? 'INVALID_INPUT'
            : (sIn !== 'CONVERGED' || sEx !== 'CONVERGED') ? 'NON_CONVERGED'
            : 'CONVERGED';
    var rXIn = val(vIn && vIn.residualX), rVIn = val(vIn && vIn.residualV);
    var rXEx = val(vEx && vEx.residualX), rVEx = val(vEx && vEx.residualV);
    var tolX = val(vIn && vIn.tolX), tolV = val(vIn && vIn.tolV);

    // Quale lato non converge, e su quale criterio.
    var lato = null;
    if (sIn !== 'CONVERGED' && sEx !== 'CONVERGED') lato = 'entrambi';
    else if (sIn !== 'CONVERGED') lato = 'aspirazione';
    else if (sEx !== 'CONVERGED') lato = 'scarico';

    function criterio(rX, rV) {
        if (rX === null && rV === null) return 'non calcolato';
        var fuoriX = (tolX !== null && rX !== null && rX > tolX);
        var fuoriV = (tolV !== null && rV !== null && rV > tolV);
        if (fuoriX && fuoriV) return 'entrambi';
        if (fuoriX) return 'posizione';
        if (fuoriV) return 'velocita';
        return null;
    }
    var critIn = (sIn === 'CONVERGED') ? null : criterio(rXIn, rVIn);
    var critEx = (sEx === 'CONVERGED') ? null : criterio(rXEx, rVEx);
    var crit = null;
    if (lato === 'entrambi') crit = (critIn === critEx) ? critIn : 'entrambi';
    else if (lato === 'aspirazione') crit = critIn;
    else if (lato === 'scarico') crit = critEx;

    return {
        status: agg,
        statusIn: sIn, statusEx: sEx,
        cyclesIn: val(vIn && vIn.cyclesRun), cyclesEx: val(vEx && vEx.cyclesRun),
        residualXIn: rXIn, residualVIn: rVIn,
        residualXEx: rXEx, residualVEx: rVEx,
        tolX: tolX, tolV: tolV,
        latoFallito: lato,
        criterioFallito: crit,
        // compatibilita' con i consumatori esistenti (grafico, gate float):
        // il campo storico continua a esistere, ma senza `|| 0`.
        residualIn: rXIn, residualEx: rXEx
    };
}

// Formattazione unica di un residuo, per schermo, CSV e PDF: un residuo mai
// misurato si scrive "non calcolato", non "0.00e+0".
function fmtResiduo(v, tol) {
    if (v === null || v === undefined || !isFinite(v)) return 'non calcolato';
    var s = Number(v).toExponential(2);
    if (tol !== null && tol !== undefined && isFinite(tol)) s += ' (tolleranza ' + Number(tol).toExponential(0) + ')';
    return s;
}

// =============================================================
// DERIVATE NEL DOMINIO CAMMA — perche' non si deriva un interpolato
// =============================================================
// L'accelerazione mostrata dal programma non era convergente: cambiava di 1,4
// volte fra finestra di lisciatura 5 e 11 punti, e di 2,4 volte senza
// lisciatura. Da lei dipendono "Acc. max", "Jerk max", la forza d'inerzia, il
// "Margine" e il "Distacco valvola".
//
// LA CAUSA NON SONO I DATI. Prova: un lobo SINTETICO perfettamente liscio (una
// cosinusoide, di cui la derivata seconda si conosce in forma chiusa), senza
// rumore e senza quantizzazione, fatto passare dalla sola mapCamToCrank e poi
// derivato con differenze centrali da':
//     slot PARI    -> esattamente 2 volte il valore analitico
//     slot DISPARI -> esattamente ZERO
// Un dente di sega perfetto. E' l'INTERPOLAZIONE LINEARE: un interpolante
// lineare a tratti ha curvatura nulla dentro ogni segmento e tutta la curvatura
// concentrata nei nodi. Poiche' la mappatura campiona a mezzo grado camma, un
// campione su due cade su un nodo e uno su un punto medio.
//
// Non e' un problema che si risolve con un filtro di derivazione migliore (i
// coefficienti Savitzky-Golay di derivata mediano il dente di sega, non lo
// tolgono): misurato sullo stesso lobo, non lisciato, il picco resta 2,000
// volte l'analitico col lineare, 1,125 con un'interpolazione cubica
// Catmull-Rom, e 0,9999 derivando nel DOMINIO CAMMA.
//
// Quindi si deriva dove i campioni sono VERI — un grado camma — e si converte:
// un grado camma vale due gradi manovella, quindi la derivata di ordine n si
// divide per 2^n. Nessun interpolante viene mai derivato.
function derivateDominioCamma(camValve) {
    var vel = new Array(361), acc = new Array(361), jerk = new Array(361);
    function a(i) { return camValve[((i - 1) % 360 + 360) % 360 + 1] || 0; }
    for (var d = 1; d <= 360; d++) {
        // differenze centrali sul passo di 1 grado CAMMA, poi /2^n per passare
        // ai gradi MANOVELLA (2 gradi motore per grado camma)
        vel[d]  = (a(d + 1) - a(d - 1)) / 2 / 2;
        acc[d]  = (a(d + 1) - 2 * a(d) + a(d - 1)) / 4;
        jerk[d] = ((a(d + 2) - 2 * a(d + 1) + 2 * a(d - 1) - a(d - 2)) / 2) / 8;
    }
    return { vel: vel, acc: acc, jerk: jerk };
}

// Riporta un array in gradi CAMMA sull'asse manovella 1..720, con la STESSA
// geometria di mapCamToCrank (stesso ancoraggio al picco, stesso centro).
// Serve per le derivate: si calcolano dove i campioni sono veri e si
// RICAMPIONANO qui. Ricampionare una derivata gia' calcolata non introduce il
// dente di sega — quello nasce solo se si DERIVA l'interpolato.
function mapDerivataCamToCrank(camArr, camLift, centerDeg, type) {
    var out = new Array(722);
    for (var j = 0; j <= 721; j++) out[j] = 0;
    var dPk = camPeakPos(camLift);
    var pCenter = (type === 'intake') ? 360 + Number(centerDeg) : 360 - Number(centerDeg);
    for (var p = 1; p <= 720; p++) {
        var d = dPk + (p - pCenter) / 2;
        d = ((d - 1) % 360 + 360) % 360 + 1;
        var d0 = Math.floor(d), fr = d - d0;
        var v0 = camArr[d0] || 0;
        if (fr < 1e-9) { out[p] = v0; continue; }
        var d1 = (d0 % 360) + 1;
        out[p] = v0 * (1 - fr) + (camArr[d1] || 0) * fr;
    }
    return out;
}

function mapCamToCrank(camLift, centerDeg, clearance, type) {
    var crank = new Array(722);
    for (var j = 0; j <= 721; j++) crank[j] = 0;

    // Lettura circolare di camLift a grado frazionario (interpolazione lineare)
    function camAt(d) {
        d = ((d - 1) % 360 + 360) % 360 + 1;      // wrap in [1..360]
        var d0 = Math.floor(d), frac = d - d0;
        if (frac < 1e-9) return camLift[d0] || 0;
        var d1 = (d0 % 360) + 1;
        return (camLift[d0] || 0) * (1 - frac) + (camLift[d1] || 0) * frac;
    }

    var dPk = camPeakPos(camLift);
    var pCenter = (type === 'intake') ? 360 + Number(centerDeg) : 360 - Number(centerDeg);
    for (var p = 1; p <= 720; p++) {
        // 1 grado camma = 2 gradi albero; ordine temporale preservato
        var d = dPk + (p - pCenter) / 2;
        var lift = camAt(d) - clearance;
        if (lift < 0) lift = 0;
        crank[p] = lift;
    }
    return crank;
}

// Parse .scr file text to 360-element cam lift array.
// ROBUSTO (v3.2): accetta \n e \r\n, ignora l'intestazione e le righe di
// metadati '#chiave=valore', usa la COLONNA GRADO invece di assumere che la
// riga i sia il grado i, accetta ';' come separatore e la virgola decimale
// (CSV di Excel italiano). Restituisce anche i metadati in camLift.meta e il
// numero di punti validi in camLift.validCount (0 = file non riconosciuto:
// prima riempiva di zeri IN SILENZIO).
function parseCamFile(text) {
    var righe = String(text).split(/\r?\n/);
    var camLift = new Array(361);
    var meta = {};
    var valid = 0;
    var covered = new Array(361);
    // AUDIT (controrevisione, Lotto C): il parser ora SEGNALA le anomalie invece
    // di ingoiarle. Prima un grado duplicato (es. "180,999" dopo un file
    // completo) sovrascriveva in silenzio, e un grado frazionario (106.5) veniva
    // arrotondato. Ora: primo valore vince, duplicati/frazionari/fuori-range/
    // invalidi sono raccolti e ok=false, senza rompere la retrocompatibilità
    // (array 1..360 + validCount/missingCount/covered/meta restano).
    var duplicateDegrees = [];
    var fractionalDegrees = [];
    var invalidRows = 0, outOfRangeRows = 0;
    for (var z = 1; z <= 360; z++) { camLift[z] = 0; covered[z] = false; }
    // PASSO 1 (AUDIT DATA-02): raccogli le righe con parsing RIGOROSO — un
    // token vuoto/whitespace/testo è una riga INVALIDA, mai uno zero (prima
    // "42," diventava un grado 42 = 0.000 valido perché Number('')===0) — e
    // rileva la convenzione dei gradi sull'INTERO insieme (0..359 vs 1..360).
    var rows = [];
    var has0 = false, has360 = false;
    for (var r = 0; r < righe.length; r++) {
        var line = righe[r].trim();
        if (!line) continue;
        // Excel duplica la colonna quando si salva un CSV da un foglio con piu'
        // colonne: le righe escono come "1,0;;;;;;1,0" e i metadati come
        // "#fw=4.1;;;;;;#fw=4.1". Con la vecchia lettura ogni riga finiva
        // invalida (grado "1.0", alzata "") e un file di 360 punti veniva
        // rifiutato per intero — capitato sul primo scarico della Peugeot 106.
        // Si collassa SOLO quando i campi non vuoti sono tutti IDENTICI: e' la
        // firma della duplicazione, e non tocca il CSV italiano "1;0,5", dove i
        // campi sono diversi ed e' il ';' a separare grado e alzata.
        if (line.indexOf(';') !== -1) {
            var campi = line.split(';').filter(function (s) { return s.trim() !== ''; });
            var collassa = false;
            if (campi.length > 1) {
                // stessa cosa ripetuta N volte = duplicazione di colonna
                collassa = true;
                for (var cu = 1; cu < campi.length; cu++) {
                    if (campi[cu].trim() !== campi[0].trim()) { collassa = false; break; }
                }
            } else if (campi.length === 1 && campi[0].indexOf(',') !== -1) {
                // un solo campo, e contiene gia' la coppia "grado,alzata": i ';'
                // sono riempimento. NON vale per "42;", dove il campo unico non
                // e' una coppia: quella riga deve restare INVALIDA (audit
                // DATA-02, un token vuoto non e' uno zero).
                collassa = true;
            }
            if (collassa) line = campi[0].trim();
        }
        if (line.charAt(0) === '#') {                       // metadato "#chiave=valore"
            var eq = line.indexOf('=');
            if (eq > 1) meta[line.substring(1, eq).trim()] = line.substring(eq + 1).trim();
            continue;
        }
        if (line.charAt(0) === '_' || line.charAt(0) === '*') continue;   // intestazione (_pline)
        // separatore: ',' classico oppure ';' (Excel IT, con ',' decimale)
        var parts;
        if (line.indexOf(';') !== -1) {
            parts = line.split(';');
            for (var p = 0; p < parts.length; p++) parts[p] = parts[p].replace(',', '.');
        } else {
            parts = line.split(',');
        }
        if (parts.length < 2) continue;
        var degRaw = parseFiniteMeasurement(parts[0]);
        var val = parseFiniteMeasurement(parts[1]);
        if (degRaw === null || val === null) { invalidRows++; continue; }
        // grado frazionario: NON arrotondare in silenzio — segnalalo e scarta
        if (Math.abs(degRaw - Math.round(degRaw)) > 1e-9) { fractionalDegrees.push(degRaw); continue; }
        var deg = Math.round(degRaw);
        if (deg === 0) has0 = true;
        if (deg === 360) has360 = true;
        rows.push([deg, val]);
    }
    // Convenzione: file coerente 0..359 (c'è il grado 0 e MAI il 360) →
    // normalizzato internamente a 1..360 (shift +1). Convenzione MISTA (sia 0
    // sia 360 presenti) → anomalia esplicita, non indovinabile: ok=false.
    var zeroBased = has0 && !has360;
    var conventionMixed = has0 && has360;
    // PASSO 2: riempi 1..360 (range e duplicati come prima)
    for (var q = 0; q < rows.length; q++) {
        var dg = rows[q][0] + (zeroBased ? 1 : 0);
        if (dg < 1 || dg > 360) { outOfRangeRows++; continue; }
        if (covered[dg]) {                                  // duplicato: il primo vince
            if (duplicateDegrees.indexOf(dg) < 0) duplicateDegrees.push(dg);
            continue;
        }
        camLift[dg] = rows[q][1];
        covered[dg] = true; valid++;                        // gradi UNICI (audit MAT-07)
    }
    camLift.meta = meta;
    camLift.zeroBased = zeroBased;
    camLift.conventionMixed = conventionMixed;
    // validCount = gradi 1..360 realmente coperti (non il numero di righe).
    // missingCount/covered rendono un run incompleto riconoscibile alla
    // rilettura: i gradi mancanti restano 0 nell'array per compatibilità, ma
    // il chiamante può distinguerli da uno zero misurato (audit MET-01).
    camLift.validCount = valid;
    camLift.missingCount = 360 - valid;
    camLift.covered = covered;
    camLift.duplicateDegrees = duplicateDegrees;
    camLift.fractionalDegrees = fractionalDegrees;
    camLift.invalidRows = invalidRows;
    camLift.outOfRangeRows = outOfRangeRows;
    // ok = file "pulito": nessuna anomalia. NON implica completezza (per quella
    // c'è missingCount): un file può essere ok=true ma incompleto.
    camLift.ok = (duplicateDegrees.length === 0 && fractionalDegrees.length === 0 &&
                  invalidRows === 0 && outOfRangeRows === 0 && !conventionMixed);
    return camLift;
}

// AUDIT DATA-02: parsing RIGOROSO di un valore di misura. Distinzione netta
// tra ASSENZA (null/undefined/stringa vuota/whitespace/testo → null) e ZERO
// misurato ('0' → 0). Prima Number('')===0 e Number(null)===0 trasformavano
// l'assenza in uno zero fisico in parser, medie e verdetto banco.
function parseFiniteMeasurement(tok) {
    if (tok === null || tok === undefined) return null;
    var s = String(tok).trim();
    if (s === '') return null;
    var v = Number(s);
    return isFinite(v) ? v : null;
}

// AUDIT DATA-01 (controrevisione v3.4.1): serializza un profilo INCOMPLETO come
// salvataggio DIAGNOSTICO onesto — scrive SOLO i gradi realmente misurati
// (covered) e marca lo stato nei metadati. Prima "Salva profilo" scriveva 360
// righe con Number(curve[i]||0): un incompleto salvato e riletto tornava
// "completo" pieno di zeri (i mancanti diventavano zeri fisici). Con questa
// funzione i gradi mancanti RESTANO mancanti anche dopo salva+rilettura.
//   values : array 1..360 (i valori misurati; gli indici non coperti ignorati)
//   covered: array 1..360 di boolean (quali gradi sono reali)
//   extra  : { data, provenienza... } → righe #k=v aggiuntive (opzionale)
function serializeDiagnosticProfile(values, covered, extra) {
    extra = extra || {};
    var validCount = 0;
    for (var c = 1; c <= 360; c++) if (covered && covered[c]) validCount++;
    var lines = ['_pline', '#stato=INCOMPLETO', '#validCount=' + validCount, '#missingCount=' + (360 - validCount)];
    if (extra.data) lines.push('#data=' + extra.data);
    if (extra.verso) lines.push('#verso=' + extra.verso);
    if (extra.tastatore) lines.push('#tastatore=' + extra.tastatore);
    for (var i = 1; i <= 360; i++) {
        if (covered && covered[i]) lines.push(i + ',' + (+Number(values[i]).toFixed(4)));
    }
    return lines.join('\r\n') + '\r\n';
}

// AUDIT MET-01 (controrevisione): media di N run SENZA zero-fill. Un grado con
// nessun campione valido in nessun run resta INVALIDO (valid[grado]=false), non
// diventa uno zero fisico. Ritorna { values[1..360], valid[1..360], count[],
// std[], missingCount }. runs = array di array [1..360] (NaN/non-finito=mancante).
function averageRuns(runs) {
    var values = new Array(361), valid = new Array(361), count = new Array(361), std = new Array(361);
    var missingCount = 0;
    for (var d = 1; d <= 360; d++) {
        var sum = 0, n = 0;
        for (var r = 0; r < runs.length; r++) {
            // AUDIT DATA-02: null/''/undefined = campione ASSENTE, non zero
            // (prima Number(null)===0 lo faceva entrare in media come 0 valido)
            var v = runs[r] ? parseFiniteMeasurement(runs[r][d]) : null;
            if (v !== null) { sum += v; n++; }
        }
        if (n === 0) {
            values[d] = NaN; valid[d] = false; count[d] = 0; std[d] = NaN;
            missingCount++;
        } else {
            var mean = sum / n;
            var sq = 0;
            for (var r2 = 0; r2 < runs.length; r2++) {
                var v2 = runs[r2] ? parseFiniteMeasurement(runs[r2][d]) : null;
                if (v2 !== null) sq += (v2 - mean) * (v2 - mean);
            }
            values[d] = mean; valid[d] = true; count[d] = n;
            std[d] = n > 1 ? Math.sqrt(sq / (n - 1)) : 0;
        }
    }
    return { values: values, valid: valid, count: count, std: std, missingCount: missingCount };
}

// AUDIT DATA-04 (controrevisione v3.4.1): gate UNICO di valutabilità. Un
// output CONCLUSIVO (analisi ufficiale, confronto A/B, conformità nominale,
// cam card, CSV/PDF) è ammesso solo per un profilo COMPLETO e pulito. Il gate
// va usato da TUTTI i percorsi, non ricostruito caso per caso — e controlla
// anche #stato=INCOMPLETO nei metadati: un file legacy zero-riempito con
// 360 righe ha missingCount=0 ma NON è una misura completa.
// Ritorna { ok, reason } (reason in italiano, mostrabile all'utente).
function canProduceOfficialResult(p) {
    if (!p) return { ok: false, reason: 'nessun profilo caricato' };
    if (p.meta && String(p.meta.stato || '').toUpperCase() === 'INCOMPLETO') {
        return { ok: false, reason: 'file marcato #stato=INCOMPLETO (misura interrotta o con buchi)' };
    }
    if (p.conventionMixed) return { ok: false, reason: 'convenzione dei gradi mista (0..359 e 1..360 nello stesso file)' };
    if ((p.missingCount || 0) > 0) return { ok: false, reason: p.missingCount + ' gradi senza misura' };
    if (p.ok === false) return { ok: false, reason: 'anomalie nel file (duplicati/frazionari/righe invalide)' };
    return { ok: true, reason: '' };
}

// AUDIT DATA-03 (controrevisione v3.4.1): media dei run ripetuti SOLO sui run
// COMPLETI. La media naive di tutti i run produceva un profilo IBRIDO: run A
// completo (tutti=1) + run B incompleto (grado 42 mancante, altri=3) dava
// grado 42=1/count=1 e grado 43=2/count=2 — né il run completo né una media
// omogenea. Qui: un run è COMPLETO se ogni grado 1..360 ha un valore finito
// (null/''/undefined = assenza, DATA-02); gli incompleti sono ESCLUSI dalla
// media ufficiale e dichiarati (run 1-based + gradi mancanti), così la UI può
// dire cosa è entrato e cosa no. official=false se nessun run è completo.
function averageCompleteRuns(runs) {
    var included = [], excluded = [];
    for (var r = 0; r < (runs ? runs.length : 0); r++) {
        var missing = 0;
        for (var d = 1; d <= 360; d++) {
            if (parseFiniteMeasurement(runs[r] ? runs[r][d] : null) === null) missing++;
        }
        if (missing === 0) included.push(r);
        else excluded.push({ run: r + 1, missing: missing });
    }
    var avg = included.length
        ? averageRuns(included.map(function (i) { return runs[i]; }))
        : null;
    return {
        included: included.map(function (i) { return i + 1; }),   // 1-based per la UI
        excluded: excluded,
        avg: avg,
        official: included.length >= 1
    };
}

// ---- VERIFICA BANCO (audit MET-02): verdetto di salute su pezzo cilindrico --
// pdata[1..360] = letture sul cilindro rettificato (alzata attesa 0 ovunque).
// REGOLA: un campione mancante o invalido non può MAI migliorare l'esito.
// Prima il chiamante faceva Number(x)||0: un punto perso diventava 0 =
// "perfetto" proprio dove il banco poteva essere difettoso → falso PASS.
// Qui: qualunque buco/NaN/fuori scala → 'NON_VALUTABILE' (né PASS né FAIL).
// L'eccentricità di montaggio viene tolta (removeCamBaseline): non è colpa
// del banco. Ritorna { status, rms, max, covered, missing }.
function benchVerdict(pdata, thresholds) {
    var thr = thresholds || {};
    var rmsMax = (typeof thr.rms === 'number') ? thr.rms : 0.02;
    var absMax = (typeof thr.max === 'number') ? thr.max : 0.05;
    var vals = new Array(361), covered = 0, missing = 0, i;
    vals[0] = 0;
    for (i = 1; i <= 360; i++) {
        // AUDIT DATA-02: null/''/undefined = campione ASSENTE (prima
        // Number(null)===0 rendeva "perfetto" un canale morto → falso PASS)
        var v = parseFiniteMeasurement(pdata[i]);
        // valido = numerico e fisicamente plausibile per un residuo su cilindro
        // (il LM339N con ingresso flottante produce numeri casuali fuori scala)
        if (v !== null && v > -1 && v < 32) { vals[i] = v; covered++; }
        else { vals[i] = null; missing++; }
    }
    if (missing > 0) {
        return { status: 'NON_VALUTABILE', rms: NaN, max: NaN, covered: covered, missing: missing };
    }
    var arr = vals;
    try { arr = removeCamBaseline(vals); } catch (e) {}
    var sq = 0, mx = 0;
    for (i = 1; i <= 360; i++) {
        var a = Math.abs(Number(arr[i]) || 0);
        sq += a * a;
        if (a > mx) mx = a;
    }
    var rms = Math.sqrt(sq / 360);
    return {
        status: (rms <= rmsMax && mx <= absMax) ? 'OK' : 'FAIL',
        rms: rms, max: mx, covered: covered, missing: 0
    };
}

// ========== FILE IMPORT ==========

// Dispatcher follower virtuale: prende la curva grezza (puntalino sferico)
// e applica la conversione geometrica appropriata in base al tipo selezionato.
// Tipi supportati:
//   - 'punt'  → nessuna conversione (curva grezza puntalino)
//   - 'bicch' → bicchiere piatto Ø (D)
//   - 'roller'→ rullo di raggio (rRoll)
//   - 'finger'→ leva con rapporto braccio camma/valvola
// ---- Correzione BASELINE / ECCENTRICITÀ del cerchio base --------------------
// Una camma montata leggermente fuori centro (o con runout del cerchio base)
// aggiunge alla lettura radiale un termine che varia UNA volta per giro:
// b(θ) = a0 + a1·cosθ + b1·sinθ (DC + 1ª armonica). Lo si stima coi minimi
// quadrati SUI SOLI punti di cerchio base (alzata sotto soglia, lobo escluso) e
// lo si sottrae a tutta la curva: il fondo torna a ~0 e il lobo è depurato.
// Su scansioni già pulite il fit ≈ 0 → no-op. (Es. scarico VW con fondo ~0.21mm.)
function _det3(m) {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
         - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
         + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

function _solve3(M, V) {
    var d = _det3(M);
    if (Math.abs(d) < 1e-9) return null;
    var r = [];
    for (var k = 0; k < 3; k++) {
        var Mk = [M[0].slice(), M[1].slice(), M[2].slice()];
        Mk[0][k] = V[0]; Mk[1][k] = V[1]; Mk[2][k] = V[2];
        r[k] = _det3(Mk) / d;
    }
    return r;
}

function removeCamBaseline(raw) {
    var DEG = Math.PI / 180, i;
    var out = new Array(361); out[0] = 0;
    var peak = 0;
    for (i = 1; i <= 360; i++) { var v = raw[i] || 0; if (v > peak) peak = v; }
    for (i = 1; i <= 360; i++) out[i] = raw[i] || 0;
    if (peak <= 0) return out;
    var thr = Math.max(0.15, 0.05 * peak);   // soglia lobo
    var MARGIN = 12;                          // gradi: escludi lobo + rampe dal fit
    var lobe = new Array(361);
    for (i = 1; i <= 360; i++) lobe[i] = (raw[i] || 0) >= thr;
    function _nearLobe(idx) {
        for (var o = -MARGIN; o <= MARGIN; o++) {
            var j = ((idx + o - 1) % 360 + 360) % 360 + 1;
            if (lobe[j]) return true;
        }
        return false;
    }
    var n = 0, Sc = 0, Ss = 0, Scc = 0, Sss = 0, Scs = 0, Sy = 0, Syc = 0, Sys = 0;
    for (i = 1; i <= 360; i++) {
        if (_nearLobe(i)) continue;           // salta lobo e rampe (evita bias del fit)
        var y = raw[i] || 0;
        var c = Math.cos(i * DEG), s = Math.sin(i * DEG);
        n++; Sc += c; Ss += s; Scc += c * c; Sss += s * s; Scs += c * s;
        Sy += y; Syc += y * c; Sys += y * s;
    }
    if (n < 30) return out;                   // troppi pochi punti base → non correggo
    var sol = _solve3([[n, Sc, Ss], [Sc, Scc, Scs], [Ss, Scs, Sss]], [Sy, Syc, Sys]);
    if (!sol) return out;
    var a0 = sol[0], a1 = sol[1], b1 = sol[2];
    var amp = Math.sqrt(a1 * a1 + b1 * b1);   // ampiezza eccentricità (mm)
    if (amp > (window._lastBaselineAmp || 0)) window._lastBaselineAmp = amp;
    for (i = 1; i <= 360; i++) {
        var base = a0 + a1 * Math.cos(i * DEG) + b1 * Math.sin(i * DEG);
        var cv = (raw[i] || 0) - base;
        out[i] = cv > 0 ? cv : 0;
    }
    return out;
}

// AUDIT MAT-02 (controrevisione): reindexByEncoder RIMOSSA (2026-07-23).
// La re-indicizzazione su encoder non è più usata dalla UI dal 2026-07-05
// (al banco passi ed encoder coincidono entro 1° sull'intero giro, opzione
// ritirata da alzata.html); la validazione era troppo permissiva (accettava
// un giro al 90%, span 150%, inversioni) e tenerla in lib la faceva sembrare
// un percorso affidabile. L'encoder resta in uso per zero virtuale, reset e
// allarme slittamento (alzata.html). Storia completa: git log lib/cammes-math.js
// e tools/test_encoder_reindex.js (rimosso insieme).

var api = {
    _det3: _det3,
    _solve3: _solve3,
    removeCamBaseline: removeCamBaseline,
    stylusCompensate: stylusCompensate,
    convertPuntToBicchiere: convertPuntToBicchiere,
    convertPuntToRoller: convertPuntToRoller,
    convertPuntToFinger: convertPuntToFinger,
    mapCamToCrank: mapCamToCrank,
    derivateDominioCamma: derivateDominioCamma,
    mapDerivataCamToCrank: mapDerivataCamToCrank,
    camPeakPos: camPeakPos,
    findEvents: findEvents,
    effectiveCenters: effectiveCenters,
    parseCamFile: parseCamFile,
    parseFiniteMeasurement: parseFiniteMeasurement,
    finiteOr: finiteOr,
    validaNumero: validaNumero,
    FOLLOWER_OUTPUT_DOMAIN: FOLLOWER_OUTPUT_DOMAIN,
    FINGER_TILT_RIMOSSO: true,   // AUDIT P1-09: parametro inerte, tolto
    lashLatoCamma: lashLatoCamma,
    caricoMollaRichiesto: caricoMollaRichiesto,
    riassuntoConvergenza: riassuntoConvergenza,
    fmtResiduo: fmtResiduo,
    serializeDiagnosticProfile: serializeDiagnosticProfile,
    averageRuns: averageRuns,
    averageCompleteRuns: averageCompleteRuns,
    canProduceOfficialResult: canProduceOfficialResult,
    benchVerdict: benchVerdict,
    simulateCompliance: simulateCompliance,
    simulateCompliance2DOF: simulateCompliance2DOF,
    simulateCompliance3DOF: simulateCompliance3DOF,
    detectValveFloat: detectValveFloat
};
for (var k in api) root[k] = api[k];   // browser: stessi nomi globali di prima
if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
