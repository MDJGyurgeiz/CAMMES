// =============================================================
//  cammes-scan.js — livello condiviso di ACQUISIZIONE (alzata + polare)
// =============================================================
//  Contiene ciò che le due pagine di scansione avevano in copia identica:
//  stato/connessione WebSocket con auto-reconnect, invio profilo movimento
//  al firmware, jog manuale (m1/p1) e inversione senso (rlb).
//
//  CONTRATTO: la pagina definisce PRIMA i propri gestori
//    _engineOnOpen(event)     — apertura socket (init display specifici)
//    _engineOnMessage(event)  — parsing messaggi (specifico per pagina)
//  e POI chiama connectEngine(). Le funzioni divergenti (toggleMotorFree,
//  _setMotionUiDisabled, ruota, updateStatus*) restano nelle pagine.
//  Script top-level (no IIFE): var e function sono globali, come prima.
// =============================================================

// Stato condiviso della connessione.
// AUDIT MOT-03/SEC-01: l'host segue la pagina (prima "localhost" fisso: da
// un tablet in LAN il WebSocket puntava al tablet stesso e non funzionava).
var WS_URL = "ws://" + (location.hostname || "localhost") + ":8080";
var engineSocket = null;
var _engineReconnectTimer = null;
var _everConnected = false;
var sendSocket = null;

// WebSocket pronti (server raggiungibile)? Usato da LED, banner e guardie START.
function _wsReady() {
    return (typeof engineSocket !== 'undefined' && engineSocket.readyState === 1) &&
           (typeof sendSocket !== 'undefined' && sendSocket && sendSocket.readyState === 1);
}

// (Ri)connessione del socket engine. onclose/onerror programmano un retry
// dopo 3s, salvo chiusura intenzionale (window._cammesClosing). Un solo
// timer di retry alla volta.
function _engineScheduleReconnect() {
    if (window._cammesClosing) return;
    if (_engineReconnectTimer) return;
    _engineReconnectTimer = setTimeout(function () {
        _engineReconnectTimer = null;
        connectEngine();
    }, 3000);
}

function connectEngine() {
    try {
        engineSocket = new WebSocket(WS_URL);
        engineSocket.onopen    = _engineOnOpen;
        engineSocket.onmessage = _engineOnMessage;
        engineSocket.onclose   = _engineScheduleReconnect;
        engineSocket.onerror   = function () { try { engineSocket.close(); } catch (e) {} };
    } catch (e) { _engineScheduleReconnect(); }
}

// Profilo movimento: FISSO a Standard (k1), inviato da alzata all'apertura
// del socket. Il selettore a 4 profili è stato rimosso dopo il test al banco
// del 2026-07-13: k0/k1/k2/k3 danno la stessa curva entro la ripetibilità
// (RMS 0,06-0,08 mm) e tempi quasi uguali (46-57 s) — una scelta senza
// criterio per l'utente.

function m1() {
    if (window._scanBusy && window._scanBusy('Il jog manuale')) return;   // audit MOT-02
    oldg = Number(oldg) - 1;
    if (rsign == 1) { sendSocket.send('$-001\n'); }
    if (rsign == -1) { sendSocket.send('$+001\n'); }
    document.getElementById("step").value = oldg;
}

function p1() {
    if (window._scanBusy && window._scanBusy('Il jog manuale')) return;   // audit MOT-02
    oldg = Number(oldg) + 1;
    if (rsign == 1) { sendSocket.send('$+001\n'); }
    if (rsign == -1) { sendSocket.send('$-001\n'); }
    document.getElementById("step").value = oldg;
}

function rlb() {
    if (window._scanBusy && window._scanBusy('Il cambio di direzione')) return;   // audit MOT-02
    rot = rot + 1;
    if (rot == 2) { rot = 0; }
    if (rot == 0) {
        document.getElementById("rlabel").innerHTML = "senso orario";
        rsign = 1;
    }
    if (rot == 1) {
        document.getElementById("rlabel").innerHTML = "senso antiorario";
        rsign = -1;
    }
}
