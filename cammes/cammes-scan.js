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

// Stato condiviso della connessione
var WS_URL = "ws://localhost:8080";
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

// Profilo movimento (anti-vibrazione): manda 'kN' al firmware che setta
// pulse width + step rampa + extra delay. Default = standard (k1).
function onMoveProfileChange() {
    var sel = document.getElementById('moveProfile');
    if (!sel) return;
    var v = parseInt(sel.value, 10);
    if (isNaN(v) || v < 0 || v > 3) v = 1;
    if (typeof sendSocket !== 'undefined' && sendSocket && sendSocket.readyState === 1) {
        try { sendSocket.send('k' + v + '\n'); } catch (e) {}
    }
}

function m1() {
    oldg = Number(oldg) - 1;
    if (rsign == 1) { sendSocket.send('$-001\n'); }
    if (rsign == -1) { sendSocket.send('$+001\n'); }
    document.getElementById("step").value = oldg;
}

function p1() {
    oldg = Number(oldg) + 1;
    if (rsign == 1) { sendSocket.send('$+001\n'); }
    if (rsign == -1) { sendSocket.send('$-001\n'); }
    document.getElementById("step").value = oldg;
}

function rlb() {
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
