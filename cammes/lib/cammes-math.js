// =============================================================
//  cammes-math.js — libreria matematica condivisa CAMMES
// =============================================================
//  Contiene le funzioni di CALCOLO PURO estratte da analisi.html e
//  alzata.html (conversioni follower, baseline, mappatura camma→albero,
//  compliance 1/2/3-DOF, surge molla, re-indicizzazione encoder).
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

    // Warning runtime se bicchiere troppo grande rispetto al lobo
    // (l'impronta del piattello copre più di metà della cam).
    if (dBicch > rBase * 0.95 && window.cammesToast && !window._suppressBicchWarn) {
        window._suppressBicchWarn = true;  // mostra una volta per sessione
        setTimeout(function () {
            window.cammesToast({
                kind: 'warn', title: 'Bicchiere grande',
                body: '&Oslash; ' + dBicch.toFixed(1) + ' mm su cerchio base ' + rBase.toFixed(1) +
                      ' mm: l\'impronta &egrave; pi&ugrave; larga del lobo, alzata simulata pu&ograve; essere irrealistica.',
                duration: 6000
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
// Output: array crank[1..720] con la posizione valvola REALE (compliance).
function simulateCompliance(camLift720, rpm, params) {
    var p = params || {};
    var m_kg     = (p.massEqG  || 100) / 1000;   // kg
    var k_train  = (p.kTrainN_mm || 5000) * 1000; // N/m
    var k_spring = (p.kSpringN_mm || 30) * 1000; // N/m
    var F0       = p.F0N || 200;                 // N preload
    var damping  = (p.dampingRatio || 0.06);     // ζ critico

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

    function camAt(degIdx) {
        // Lookup camLift720 con indice 1..720; converto mm → m
        var i = ((Math.round(degIdx) - 1) % 720 + 720) % 720 + 1;
        return (camLift720[i] || 0) * 1e-3;
    }

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
        }
        out[deg] = x * 1000;  // m → mm
    }
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
    var m1_kg = (p.massEqIntermediateG || 60) / 1000;   // massa bilancere
    var m2_kg = (p.massEqG || 100) / 1000;              // massa valvola
    var k_push  = (p.kPushrodN_mm || 800) * 1000;       // rigidezza pushrod/cam-bilancere
    var k_train = (p.kTrainN_mm   || 5000) * 1000;      // rigidezza bilancere-valvola
    var k_spring = (p.kSpringN_mm || 30) * 1000;        // rigidezza molla valvola
    var F0       = p.F0N || 200;
    var damping  = p.dampingRatio || 0.06;

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

    function camAt(degIdx) {
        var i = ((Math.round(degIdx) - 1) % 720 + 720) % 720 + 1;
        return (camLift720[i] || 0) * 1e-3;
    }

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
        }
        // Posizione della VALVOLA (lift osservato all'esterno)
        out[deg] = x2 * 1000;
    }
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
    var m1_kg = (p.massEqIntermediateG || 60) / 1000;   // bilancere
    var m2_kg = (p.massEqG || 100) / 1000;              // valvola
    var m3_kg = (p.massSeatG || 15)  / 1000;            // sede valvola (effettiva)
    var k_push   = (p.kPushrodN_mm || 800)  * 1000;     // cam→bilancere
    var k_train  = (p.kTrainN_mm   || 5000) * 1000;     // bilancere→valvola
    var k_spring = (p.kSpringN_mm  || 30)   * 1000;     // molla valvola
    var k_seat   = (p.kSeatN_mm    || 80000)* 1000;     // sede→testata (rigidezza)
    // Cedevolezza pivot bilanciere (lato perno): molla del perno verso terra.
    // 0 = perno libero → comportamento 3-DOF originale (bilanciere massa libera
    // tra k_push e k_train). Valori finiti = perno con rigidezza propria
    // (cede sotto carico). Più alto = perno più rigido/vincolato.
    var k_pivot  = (p.kPivotN_mm && p.kPivotN_mm > 0) ? p.kPivotN_mm * 1000 : 0;
    var F0       = p.F0N || 200;
    var damping  = p.dampingRatio || 0.06;

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

    function camAt(degIdx) {
        var i = ((Math.round(degIdx) - 1) % 720 + 720) % 720 + 1;
        return (camLift720[i] || 0) * 1e-3;
    }

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
        }
        // Lift valvola osservato: mai negativo all'esterno (la valvola non
        // può fisicamente affondare nella testata oltre la flessione sede).
        out[deg] = Math.max(0, x2) * 1000;
    }
    return out;
}

// Indicatore valve float: misura quanto la curva "valvola reale" si discosta
// dalla "cam geometrica" — gap = max(camLift - valveLift) durante decelerazione.
// Se gap > 0.1 mm → float manifesto (valvola perde contatto).
function detectValveFloat(camLift720, valveLift720) {
    var maxGap = 0, gapIdx = 0;
    for (var i = 1; i <= 720; i++) {
        var g = (camLift720[i] || 0) - (valveLift720[i] || 0);
        if (g > maxGap) { maxGap = g; gapIdx = i; }
    }
    return { maxGap: maxGap, gapIdx: gapIdx };
}

// =============================================================
// SPRING SURGE — molla valvola a MASSA DISTRIBUITA (modi delle spire)
// =============================================================
// I solver compliance trattano la molla come F = F0 + k·x (massa concentrata):
// non vedono il SURGE, cioè la risonanza longitudinale delle spire ad alto
// regime (le spire oscillano tra loro, possono sbattere o staccarsi → perdita
// di forza, rotture). Qui modelliamo la molla come catena di N masse
// (m_spring/N) collegate da N+1 segmenti in serie di rigidezza (N+1)·k (la
// serie ridà k), base fissa alla testata, capo superiore GUIDATO dal moto
// della valvola. Analisi disaccoppiata (standard): il surge è valutato DATO
// il moto valvola, non retroagisce sul valve float.
//
// Frequenza propria fondamentale (estremi fissi): f1 = ½·√(k/m_spring).
// surgeRatio = ampiezza di oscillazione interna / corsa valvola: >~1 = surge.
function springSurgeFreqHz(kSpringN_mm, springMassG) {
    var k = (kSpringN_mm || 30) * 1000;       // N/m
    var m = (springMassG || 50) / 1000;       // kg
    if (m <= 0 || k <= 0) return 0;
    return 0.5 * Math.sqrt(k / m);            // Hz (fondamentale estremi fissi)
}

function simulateSpringSurge(valveLift720, rpm, params) {
    var p = params || {};
    var k_spring = (p.kSpringN_mm || 30) * 1000;        // N/m (totale)
    var m_spring = (p.springMassG || 50) / 1000;        // kg (massa molla)
    var N = Math.max(4, Math.min(24, Math.round(p.springCoils || 12)));
    var zeta = (p.dampingRatio || 0.06);
    if (m_spring <= 0 || k_spring <= 0 || rpm <= 0) {
        return { surgeFreqHz: 0, surgeRatio: 0, maxCoilAmpMm: 0, harmonicOrder: 0 };
    }

    var m_i   = m_spring / N;                  // massa per nodo interno
    var k_seg = (N + 1) * k_spring;            // serie di N+1 segmenti = k_spring
    var c_seg = 2 * zeta * Math.sqrt(k_seg * m_i);

    // Tempo: 720° albero motore = 1 ciclo cam = 2 giri = 120/rpm secondi.
    var T_cycle = 120 / rpm;                    // s per 720°
    var degPerSec = 720 / T_cycle;

    // Profilo lift in metri + pendenza (per la velocità del drive).
    var lift = new Array(721), slope = new Array(721);
    for (var d = 1; d <= 720; d++) lift[d] = (valveLift720[d] || 0) * 1e-3;
    lift[0] = lift[720];
    for (var d2 = 1; d2 <= 720; d2++) {
        var dn = d2 + 1 > 720 ? 1 : d2 + 1, dp = d2 - 1 < 1 ? 720 : d2 - 1;
        slope[d2] = (lift[dn] - lift[dp]) / 2;  // m per grado
    }
    var maxLift = 0; for (var dm = 1; dm <= 720; dm++) if (lift[dm] > maxLift) maxLift = lift[dm];
    if (maxLift <= 0) return { surgeFreqHz: springSurgeFreqHz(p.kSpringN_mm, p.springMassG), surgeRatio: 0, maxCoilAmpMm: 0, harmonicOrder: 0 };

    function driveAt(crankDeg) {
        var dd = ((crankDeg - 1) % 720 + 720) % 720 + 1;
        var i0 = Math.floor(dd), frac = dd - i0;
        var a = lift[i0] || 0, b = lift[(i0 % 720) + 1] || 0;
        var s = a + (b - a) * frac;
        var sdot = (slope[i0] || 0) * degPerSec;   // m/s
        return { s: s, sdot: sdot };
    }

    // Passo: risolve il modo più rapido della catena (ω_max ≈ 2√(k_seg/m_i)).
    var omegaMax = 2 * Math.sqrt(k_seg / m_i);
    var dtFast = (2 * Math.PI / omegaMax) / 12;
    var dtDeg  = 1 / degPerSec;
    var dt = Math.min(dtFast, dtDeg / 2);
    var nCycles = 3;                            // lascia assestare il transitorio
    var totalT = nCycles * T_cycle;
    var nSteps = Math.ceil(totalT / dt);
    if (nSteps > 80000) { nSteps = 80000; dt = totalT / nSteps; }

    // Stato: y[0..N-1] (posizioni nodi interni), v[0..N-1] (velocità).
    var y = new Array(N), v = new Array(N);
    for (var ii = 0; ii < N; ii++) { y[ii] = 0; v[ii] = 0; }

    function accel(yy, vv, drv, out) {
        for (var i = 0; i < N; i++) {
            var yl = (i === 0) ? 0      : yy[i - 1];
            var vl = (i === 0) ? 0      : vv[i - 1];
            var yr = (i === N - 1) ? drv.s    : yy[i + 1];
            var vr = (i === N - 1) ? drv.sdot : vv[i + 1];
            out[i] = (k_seg * (yl - yy[i]) + k_seg * (yr - yy[i])
                    + c_seg * (vl - vv[i]) + c_seg * (vr - vv[i])) / m_i;
        }
    }

    var a1 = new Array(N), a2 = new Array(N), a3 = new Array(N), a4 = new Array(N);
    var yt = new Array(N), vt = new Array(N);
    var t = 0, maxDev = 0;
    var lastCycleStart = (nCycles - 1) * T_cycle;   // misura il surge a regime

    for (var step = 0; step < nSteps; step++) {
        var crank = ((t / T_cycle) % 1) * 720;
        var d0 = driveAt(crank);
        var dHalf = driveAt(((t + dt / 2) / T_cycle % 1) * 720);
        var dFull = driveAt(((t + dt) / T_cycle % 1) * 720);

        accel(y, v, d0, a1);
        for (var b1 = 0; b1 < N; b1++) { yt[b1] = y[b1] + v[b1] * dt / 2; vt[b1] = v[b1] + a1[b1] * dt / 2; }
        accel(yt, vt, dHalf, a2);
        for (var b2 = 0; b2 < N; b2++) { yt[b2] = y[b2] + (v[b2] + a1[b2] * dt / 2) * dt / 2; vt[b2] = v[b2] + a2[b2] * dt / 2; }
        accel(yt, vt, dHalf, a3);
        for (var b3 = 0; b3 < N; b3++) { yt[b3] = y[b3] + (v[b3] + a2[b3] * dt / 2) * dt; vt[b3] = v[b3] + a3[b3] * dt; }
        accel(yt, vt, dFull, a4);
        for (var b4 = 0; b4 < N; b4++) {
            y[b4] += (v[b4] + 2 * (v[b4] + a1[b4] * dt / 2) + 2 * (v[b4] + a2[b4] * dt / 2) + (v[b4] + a3[b4] * dt)) * dt / 6;
            v[b4] += (a1[b4] + 2 * a2[b4] + 2 * a3[b4] + a4[b4]) * dt / 6;
        }
        t += dt;

        // Surge = scostamento dalla distribuzione quasi-statica lineare
        // y_i,statico = s·(i+1)/(N+1). Misurato solo nell'ultimo ciclo.
        if (t >= lastCycleStart) {
            var sNow = d0.s;
            for (var c = 0; c < N; c++) {
                var yStatic = sNow * (c + 1) / (N + 1);
                var dev = Math.abs(y[c] - yStatic);
                if (dev > maxDev) maxDev = dev;
                if (!isFinite(y[c])) return { surgeFreqHz: springSurgeFreqHz(p.kSpringN_mm, p.springMassG), surgeRatio: Infinity, maxCoilAmpMm: Infinity, harmonicOrder: 0, diverged: true };
            }
        }
    }

    var fSurge = springSurgeFreqHz(p.kSpringN_mm, p.springMassG);
    var fCam = rpm / 120;                        // Hz evento cam (1 ogni 720°)
    var nHarm = fCam > 0 ? Math.round(fSurge / fCam) : 0;
    return {
        surgeFreqHz: fSurge,
        surgeRatio: maxDev / maxLift,            // ampiezza interna / corsa valvola
        maxCoilAmpMm: maxDev * 1000,
        harmonicOrder: nHarm,                    // armonica cam ~ surge a questo rpm
        criticalRpm: nHarm > 0 ? Math.round(fSurge * 120 / nHarm) : null
    };
}

function convertPuntToFinger(camLiftRaw, rBase, lArm, lValve, rPunt, tiltDeg) {
    rPunt = (typeof rPunt === 'number' && rPunt > 0) ? rPunt : 0;
    if (!lArm || lArm <= 0)     lArm = 25;
    if (!lValve || lValve <= 0) lValve = 30;
    var tilt = (typeof tiltDeg === 'number') ? tiltDeg : 0;
    var thetaCam0 = tilt * Math.PI / 180;
    // Convenzione: braccio valvola è simmetrico opposto rispetto al pivot,
    // a riposo gira nello stesso verso del braccio camma per via della leva.
    // Quando braccio camma sale, braccio valvola scende → la valvola si apre.
    // Per simplicità tecnica: θ_val_0 = -θ_cam_0 (specularmente)
    var thetaVal0 = -thetaCam0;
    var sinCam0 = Math.sin(thetaCam0);
    var sinVal0 = Math.sin(thetaVal0);

    var out = new Array(361);
    out[0] = 0;
    var saturated = false;
    var lt = stylusCompensate(camLiftRaw, rBase, rPunt);   // profilo cam vero
    for (var t = 1; t <= 360; t++) {
        var ltrue = lt[t];
        if (ltrue <= 0) { out[t] = 0; continue; }
        // Calcolo rotazione finger
        var argAsin = sinCam0 + ltrue / lArm;
        // Saturazione: alzata > geometria leva (asin fuori da [-1,1]) → curva
        // troncata. Segnaliamo invece di clampare in silenzio.
        if (argAsin > 1)  { argAsin = 1;  saturated = true; }
        if (argAsin < -1) { argAsin = -1; saturated = true; }
        var dPhi = Math.asin(argAsin) - thetaCam0;
        // Movimento estremità lato valvola (positivo = apertura)
        // Il braccio valvola ruota di -dPhi (specularmente), quindi:
        var deltaVal = lValve * Math.sin(thetaVal0 - dPhi) - lValve * sinVal0;
        // Convenzione segno: voglio lift positivo = valvola aperta
        out[t] = Math.abs(deltaVal);
    }
    window._fingerSaturated = saturated;   // letto dal dispatcher per l'avviso
    return out;
}

// ========== HELPER: Map cam degrees to crankshaft degrees ==========

// Mappa 360 punti camma (1 grado/step) → 720 punti albero motore (0.5 deg/step).
// Per ogni grado camma d (1..360), p_crank = d*2 ± angle (intake: -, exhaust: +).
// Slot non popolati direttamente sono interpolati linearmente dai vicini.
//
// FIX bug rev. 2026-05-23: la versione precedente usava cascate di if con
// limiti arbitrari (es. "p > 0 && p < 3" wrap manuale) che producevano slot
// non popolati per certi valori dispari di 'angle'. Sostituito con
// modulo wrap720() esplicito che gestisce qualunque input in [-Inf, +Inf].
function mapCamToCrank(camLift, angle, clearance, type) {
    var crank = new Array(722);
    for (var j = 0; j <= 721; j++) crank[j] = 0;

    // Parity di 'angle' determina quali slot crank vengono popolati direttamente:
    //   angle pari → solo p = d*2 ± pari = pari → slot pari 2,4,..720 popolati
    //   angle dispari → slot dispari 1,3,..719 popolati
    // L'altra metà degli slot viene interpolata sotto.
    var s = 1;
    if (Math.floor(angle / 2) === angle / 2) s = 0;

    // Wrap di p in [1..720] qualunque sia il valore (gestisce negativi e > 720).
    function wrap720(p) {
        return ((p - 1) % 720 + 720) % 720 + 1;
    }

    for (var d = 1; d <= 360; d++) {
        var p;
        if (type === 'intake') {
            p = d * 2 - angle;
        } else {
            p = d * 2 + angle;
        }
        p = wrap720(p);

        var lift = camLift[d] - clearance;
        if (lift < 0) lift = 0;
        crank[p] = lift;
    }

    // Interpolazione lineare degli slot non popolati direttamente.
    // Se s=1 (angle dispari) gli slot popolati sono dispari 1,3,..719;
    // interpoliamo i pari 2,4,..720. Se s=0, viceversa.
    for (var z = 5 - s; z <= 720; z += 2) {
        var prev = z - 1, next = z + 1;
        if (prev < 1) prev = 720;
        if (next > 720) next = 1;
        var interp = (crank[prev] + crank[next]) / 2;
        if (interp < 0) interp = 0;
        crank[z] = interp;
    }
    if (s === 0) {
        crank[1] = (crank[720] + crank[2]) / 2;
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
    for (var z = 1; z <= 360; z++) camLift[z] = 0;
    for (var r = 0; r < righe.length; r++) {
        var line = righe[r].trim();
        if (!line) continue;
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
        var deg = Math.round(Number(parts[0]));
        var val = Number(parts[1]);
        if (!isFinite(deg) || !isFinite(val)) continue;
        if (deg < 1 || deg > 360) continue;
        camLift[deg] = val;
        valid++;
    }
    camLift.meta = meta;
    camLift.validCount = valid;
    return camLift;
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

// Re-indicizza il profilo (alzata per grado-passo) sulla posizione REALE letta
// dall'encoder (4 conteggi/° camma). Immune a slittamento dello stepper e a
// errori di passi/grado. Ritorna un nuovo array [1..360] oppure null (→ il
// chiamante tiene il profilo a passi) se i dati encoder sono insufficienti.
//   - riferisce il conteggio al primo campione valido (offset libero)
//   - ricava direzione dal segno dello span
//   - aggrega i campioni per grado-encoder e interpola eventuali buchi
function reindexByEncoder(pd, pdEnc) {
    var COUNTS_PER_DEG = 4, i;
    var first = -1, last = -1;
    for (i = 1; i <= 360; i++) { if (typeof pdEnc[i] === 'number' && !isNaN(pdEnc[i])) { if (first < 0) first = i; last = i; } }
    if (first < 0 || first === last) return null;
    var E0 = pdEnc[first], span = pdEnc[last] - E0;
    if (Math.abs(span) < 360) return null;            // atteso ~1440 cnt/giro; troppo piccolo → sospetto
    var sign = span >= 0 ? 1 : -1;
    var acc = new Array(361), cnt = new Array(361);
    for (i = 1; i <= 360; i++) { acc[i] = 0; cnt[i] = 0; }
    var maxDiv = 0;
    for (i = 1; i <= 360; i++) {
        if (typeof pdEnc[i] !== 'number' || isNaN(pdEnc[i])) continue;
        var v = pd[i]; if (typeof v !== 'number' || isNaN(v)) continue;
        var deg = ((Math.round((pdEnc[i] - E0) * sign / COUNTS_PER_DEG)) % 360 + 360) % 360 + 1;
        acc[deg] += v; cnt[deg]++;
        var dv = Math.abs(deg - i); if (dv > 180) dv = 360 - dv; if (dv > maxDiv) maxDiv = dv;
    }
    var out = new Array(361); out[0] = 0;
    var have = 0;
    for (i = 1; i <= 360; i++) { if (cnt[i] > 0) { out[i] = acc[i] / cnt[i]; have++; } else out[i] = null; }
    if (have < 180) return null;                      // troppi buchi → non affidabile
    for (i = 1; i <= 360; i++) {                       // interpola i buchi (lineare, circolare)
        if (out[i] !== null) continue;
        var pv = null, qv = null, pd2 = 0, qd = 0, s;
        for (s = 1; s <= 360; s++) { var pi = ((i - s - 1) % 360 + 360) % 360 + 1; if (out[pi] !== null) { pv = out[pi]; pd2 = s; break; } }
        for (s = 1; s <= 360; s++) { var qi = ((i + s - 1) % 360 + 360) % 360 + 1; if (out[qi] !== null) { qv = out[qi]; qd = s; break; } }
        if (pv === null && qv === null) out[i] = 0;
        else if (pv === null) out[i] = qv;
        else if (qv === null) out[i] = pv;
        else out[i] = pv + (qv - pv) * pd2 / (pd2 + qd);
    }
    window._encReindexDivergence = maxDiv;
    return out;
}

var api = {
    _det3: _det3,
    _solve3: _solve3,
    removeCamBaseline: removeCamBaseline,
    stylusCompensate: stylusCompensate,
    convertPuntToBicchiere: convertPuntToBicchiere,
    convertPuntToRoller: convertPuntToRoller,
    convertPuntToFinger: convertPuntToFinger,
    mapCamToCrank: mapCamToCrank,
    parseCamFile: parseCamFile,
    simulateCompliance: simulateCompliance,
    simulateCompliance2DOF: simulateCompliance2DOF,
    simulateCompliance3DOF: simulateCompliance3DOF,
    detectValveFloat: detectValveFloat,
    springSurgeFreqHz: springSurgeFreqHz,
    simulateSpringSurge: simulateSpringSurge,
    reindexByEncoder: reindexByEncoder
};
for (var k in api) root[k] = api[k];   // browser: stessi nomi globali di prima
if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
