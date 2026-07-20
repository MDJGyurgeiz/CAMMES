// =============================================================
//  CAMMES — Firmware unificato Arduino Uno
//  1 Uno + driver stepper esterno opto-isolato (PUL/DIR/ENA)
//  + encoder rotativo LDP3806 (360 PPR) sull'albero camme 1:1
//  + comparatore Neoteck via op-amp LM339N (sensore alzata)
//
//  Pinout:
//    D2 (INT0)  ← LM339N pin 2  : clock impulsi sensore (FALLING)
//    D4         ← LM339N pin 14 : DATA bit sensore
//    D3 (INT1)  ← encoder canale A (verde) — pull-up 4.7k a 5V
//    D8 (PCINT0)← encoder canale B (bianco) — pull-up 4.7k a 5V
//    D7         → driver stepper PUL−   (pin storico)
//    D6         → driver stepper DIR−   (pin storico)
//    D5         → driver stepper ENA−   (pin storico)
//    D0/D1      ↔ UART USB → server PC (9600 baud)
//
//  Protocollo seriale (PC → Arduino):
//    p          rotazione antioraria di 1 'unità di scansione' (default 1°)
//    q          rotazione oraria di 1 'unità di scansione' (default 1°)
//    $+NNN      rotazione multi-unità avanti (NNN unità)
//    $-NNN      rotazione multi-unità indietro
//    ?          query: stampa "encoder=NNN deg=XX.XX*pos\r\n"
//    !          reset zero encoder
//    m          measure only (lettura sensore senza muovere motore)
//    cN         configura N campioni per misura (1..9), media filtrata NaN
//                  cN=1 → 1 campione (default, veloce)
//                  cN=3 → media di 3 campioni (rumore -42%, +50% tempo)
//                  cN=5 → media di 5 campioni (rumore -55%, +100% tempo)
//    rN         configura risoluzione step: micropassi per unità di scansione
//                  r32 → 1° per p/q (default, 32 step/grado camma)
//                  r16 → 0.5° per p/q (doppia risoluzione angolare)
//                  r8  → 0.25° per p/q (massima risoluzione)
//    wN         configura settle time post-movimento (0..2000 ms)
//                  w0   → no delay (rapido, vibrazioni residue rilevabili)
//                  w50  → 50 ms (smorza vibrazioni leggere)
//                  w200 → 200 ms (smorza vibrazioni gravi, scansione lenta)
//    @          stampa configurazione corrente "samp=N step=NN settle=Mms*cfg"
//    f          FREE: disabilita corrente stepper (ENA LOW) → motore libero,
//               l'utente può ruotare l'albero a mano. Encoder + sensore
//               continuano a funzionare (per visualizzazione live). Risponde "*free"
//    l          LOCK: riabilita corrente stepper (ENA HIGH) → motore frenato.
//               Risponde "*lock". Necessario prima di p/q/$/ruota.
//    uN         pulse width base in microsecondi (50..400). Più alto = più
//               tempo per il driver di stabilizzare la corrente, meno scatto.
//                  u50  → veloce, scattoso (originale)
//                  u120 → consigliato
//                  u200 → morbido
//    aN         numero di step in rampa accelerazione/decelerazione (0..32).
//               0 = no rampa (cambio brusco velocità→0 = jolt che eccita
//               risonanze). 4-12 = rampa visibile e silenziosa.
//    gN         "gentleness": extra delay (μs) all'estremo della rampa,
//               linearmente decrescente verso il centro (0..500). Quanto è
//               larga la rampa: più alto = partenza/arrivo più lenti.
//    kS         preset profilo movimento (S=0..3, applica u/a/g insieme):
//                  k0 → scattoso         (u50  a0  g0)
//                  k1 → standard         (u80  a4  g50)
//                  k2 → morbido          (u120 a8  g120)
//                  k3 → extra-morbido    (u180 a16 g250)
//    tF:D:S[:V] TONE — fa cantare il motore come "musical stepper":
//               F = frequenza in Hz (60..2000)
//               D = durata in ms (10..5000)
//               S = direzione '+' o '-'
//               V = duty cycle % (10..90, default 50) — controlla il
//                   VOLUME: più alto = più tempo HIGH per ciclo = più
//                   energia trasferita al motore = più vibrazione
//                   meccanica = più suono. 50% = neutro, 80% = forte,
//                   90% = MASSIMO (rischio scaldata driver).
//               Il driver emette F impulsi/sec per D ms = D*F/1000
//               step totali. Risponde "*tend". Bypassa cfgPulseUs/cfgAccel.
//
//  Risposta Arduino dopo movimento:
//    XX.XX            (alzata in mm)
//    *se              (terminatore)
//
//  Risposta encoder query:
//    encoder=NNN deg=XX.XX
//    *pos
// =============================================================

// ---- Pin ----
const uint8_t PIN_PUL      = 7;
const uint8_t PIN_DIR      = 6;
const uint8_t PIN_ENA      = 5;
const uint8_t PIN_SENS_INT = 2;
const uint8_t PIN_SENS_DAT = 4;
const uint8_t PIN_ENC_A    = 3;
const uint8_t PIN_ENC_B    = 8;

// ---- Costanti meccaniche ----
const uint8_t  DEFAULT_STEPS_PER_UNIT = 32;        // 32 micropassi = 1° camma (riduzione inclusa)
const uint16_t STEP_PULSE_US        = 50;
const uint16_t SENSOR_SETTLE_MS     = 900;         // attesa per lettura stabile (come da firmware originale)
const uint16_t SENSOR_TIMEOUT_MS    = 50;          // se passa più di X ms tra impulsi → reset frame sensore
const uint8_t  SENSOR_BIT_FIRST     = 1;           // bit utili: dal 1° impulso al 16°
const uint8_t  SENSOR_BIT_LAST      = 16;
const float    SENSOR_DIVIDER       = 2000.0f;     // mm = raw / 2000
const uint16_t ENC_COUNTS_PER_REV   = 1440;        // 360 PPR × decoding x4
const uint8_t  ENC_COUNTS_PER_DEG   = 4;

// ---- Stato sensore Neoteck (in interrupt) ----
volatile uint8_t  sensorBitIdx   = 0;
volatile uint16_t sensorBuf      = 0;
volatile uint16_t sensorRaw      = 0;       // ultimo frame valido completato
volatile bool     sensorReady    = false;
volatile uint32_t sensorLastImpMs= 0;

// ---- Stato encoder (in interrupt) ----
// LUT decoding x4 — index = (oldA<<3)|(oldB<<2)|(newA<<1)|newB
const int8_t ENC_LUT[16] = {
   0, +1, -1,  0,
  -1,  0,  0, +1,
  +1,  0,  0, -1,
   0, -1, +1,  0
};
volatile int32_t encoderCount  = 0;
volatile uint8_t encoderState  = 0;   // (A<<1)|B

#include <EEPROM.h>

// ---- Comando seriale ----
// Buffer allargato a 48 per accogliere le righe del protocollo v4 (es.
// "45 SCAN run=17 dir=- units=360"). I comandi v3 restano cortissimi (max
// "t2000:5000:+:90" = 15 char): nessun impatto sul path v3.
char    cmdBuf[48];
uint8_t cmdLen = 0;

// =============================================================
//  AUDIT FW-08/11 · MOT-02 — PROTOCOLLO v4 (additivo, negoziato)
// =============================================================
// v4 convive con v3 senza romperlo: una riga che INIZIA CON UNA CIFRA è v4
// ("<seq> VERBO args"); v3 non ha comandi che iniziano per cifra. La FSM
// g_state è l'UNICA fonte di stato, aggiornata sia dai comandi v3 che v4.
// g_runId governa il FORMATO di emissione delle primitive di moto condivise:
//   g_runId < 0  → emissioni v3 (*mabort/*wdt/#i:enc:mm/*sdone…) — INVARIATE
//   g_runId >= 0 → emissioni v4 (EVT SAMPLE/DONE/STOPPED/FAULT, ACK/NACK)
enum FsmState { ST_BOOT, ST_FREE, ST_IDLE_LOCKED, ST_MOVING, ST_SCANNING, ST_TONE, ST_STOPPING, ST_FAULT };
uint8_t g_state = ST_BOOT;
// Fault LATCHED: una volta entrati in FAULT ci si resta (movimenti rifiutati)
// finché non arriva RESET_FAULT da fermo. 0 = nessun fault.
enum FaultCode { FAULT_NONE, FAULT_ENCODER_JAM, FAULT_HOST_TIMEOUT, FAULT_SENSOR };
uint8_t g_fault = FAULT_NONE;
int16_t g_runId = -1;              // run corrente (v4); -1 = nessun run / modo v3
// Motivo dell'ultimo stop di una primitiva di moto (per EVT STOPPED v4).
enum StopReason { STOPR_NONE, STOPR_USER, STOPR_WDT, STOPR_LOCKED, STOPR_FAULT };
uint8_t g_stopReason = STOPR_NONE;
// AUDIT: heartbeat DEDICATO v4. In v3 il watchdog è tenuto vivo da QUALSIASI
// byte (il server manda '\n'); in v4 solo "<seq> HEARTBEAT" lo rinfresca, così
// un byte spurio/echo non maschera la perdita reale dell'host.
uint32_t g_lastHeartbeatMs = 0;
// Device id stabile in EEPROM (con CRC) — non il solo nome COM (audit).
uint32_t g_deviceId = 0;
// AUDIT FW-04: dopo un overflow di riga (comando più lungo del buffer) il resto
// della riga va SCARTATO fino al newline. Prima si azzerava solo cmdLen e i
// caratteri residui formavano un comando spurio ("cccccccccccccccc32" → "32").
bool    g_discardLine = false;
// AUDIT FW-09: NACK BUSY. Un comando arrivato MENTRE il motore è in moto veniva
// scartato in silenzio; ora si risponde "*busy" (una volta per operazione) così
// host/UI hanno un riscontro esplicito invece del vuoto.
bool    g_busyNacked = false;

// AUDIT FW-03: watchdog dell'host. Il server invia un keep-alive '\n' ogni
// secondo; se durante un MOVIMENTO non arriva alcun byte per WDT_TIMEOUT_MS
// (cavo USB staccato, PC/server morto) il moto viene abortito ("*wdt").
// A motore fermo il watchdog non agisce. Nota per l'uso con terminale
// seriale manuale: durante un movimento lungo va inviato un carattere
// qualsiasi entro 5 s, altrimenti il firmware ferma per sicurezza.
uint32_t lastRxMs = 0;
const uint32_t WDT_TIMEOUT_MS = 5000;

// AUDIT FW-01: stato motore PERSISTENTE. Prima 'f' (FREE) metteva ENA=LOW ma
// il primo p/q/$/S rimetteva ENA=HIGH e muoveva: la mano dell'operatore era
// ancora sull'albero. Ora FREE è uno stato: finché è attivo i movimenti sono
// RIFIUTATI ('*locked'), va prima un 'l' (LOCK) esplicito.
bool g_motorFree = false;

// AUDIT FW-11: motivo dell'ultimo reset (MCUSR), letto nel setup. Il boot lo
// annuncia così l'host sa PERCHÉ la scheda è (ri)partita.
uint8_t g_resetFlags = 0;

// ---- Config runtime ----
uint8_t  cfgSamples       = 1;   // campioni per misura (1..9)
uint8_t  cfgStepsPerUnit  = DEFAULT_STEPS_PER_UNIT;  // micropassi per p/q
uint16_t cfgSettleMs      = 0;   // delay dopo stepperMove() prima di leggere sensore (0..2000)
                                 // smorza vibrazioni meccaniche residue del motore stepper

// Anti-vibrazione: pulse width, rampa accelerazione, extra-delay rampa.
// Default = comportamento originale (no rampa, pulse 50 μs).
// Modificabili runtime via comandi 'u', 'a', 'g' o preset 'k0..k3'.
uint16_t cfgPulseUs        = STEP_PULSE_US;  // 50 default; 50..400
uint8_t  cfgAccelSteps     = 0;              // 0 = no rampa; 0..32
uint16_t cfgRampExtraUs    = 0;              // extra delay agli estremi rampa; 0..500

// =============================================================
//  ISR: sensore Neoteck — fronte FALLING su D2
// =============================================================
void sensorISR() {
  uint32_t now = millis();
  // Nuovo frame se troppa pausa dall'ultimo impulso
  if (now - sensorLastImpMs > SENSOR_TIMEOUT_MS) {
    sensorBitIdx = 0;
    sensorBuf    = 0;
  }
  sensorLastImpMs = now;
  sensorBitIdx++;

  if (sensorBitIdx >= SENSOR_BIT_FIRST && sensorBitIdx <= SENSOR_BIT_LAST) {
    // bit n° 2..17 → posizioni 0..15 (LSB-first, come firmware originale)
    if (PIND & (1 << PIN_SENS_DAT)) {                // pin 4 = PD4
      sensorBuf |= (1 << (sensorBitIdx - SENSOR_BIT_FIRST));
    }
  }
  if (sensorBitIdx == SENSOR_BIT_LAST) {
    sensorRaw   = sensorBuf;
    sensorReady = true;
  }
}

// =============================================================
//  ISR: encoder — INT1 su D3 (canale A) + PCINT0 su D8 (canale B)
//  Decoding x4 standard
// =============================================================
inline void encoderUpdate() {
  uint8_t a = (PIND & (1 << PIN_ENC_A)) ? 1 : 0;     // pin 3 = PD3
  uint8_t b = (PINB & (1 << 0))         ? 1 : 0;     // pin 8 = PB0
  uint8_t newState = (a << 1) | b;
  uint8_t idx      = (encoderState << 2) | newState;
  encoderCount    += ENC_LUT[idx & 0x0F];
  encoderState     = newState;
}

void encoderAISR() { encoderUpdate(); }              // INT1 (D3 CHANGE)
ISR(PCINT0_vect)   { encoderUpdate(); }              // PCINT0 (D8 CHANGE)

// =============================================================
//  Parsing intero RIGOROSO — comandi di configurazione (AUDIT FW-04)
// =============================================================
// atoi() accettava spazzatura in coda ("c3xyz" → 3) e overflowava senza alcun
// segnale. Qui strtol + verifica che TUTTA la stringa sia consumata e che il
// valore stia nel range [lo,hi]. Scrive *out e ritorna true solo se valido;
// altrimenti ritorna false SENZA modificare *out (il chiamante emette "*err").
bool parseIntStrict(const char *s, long lo, long hi, long *out) {
  if (s == NULL || *s == '\0') return false;
  char *end = NULL;
  long v = strtol(s, &end, 10);
  if (end == s || *end != '\0') return false;   // vuoto o caratteri estranei in coda
  if (v < lo || v > hi) return false;            // fuori range
  *out = v;
  return true;
}

// AUDIT FW-09: segnala UNA volta per operazione che è arrivato un comando "vero"
// mentre il motore era in moto. I keep-alive ('\n'/' ') e il polling ('?') e lo
// STOP ('x', gestito a parte dal chiamante) NON contano: solo un comando che
// avrebbe avviato un'azione. Prima venivano tutti scartati in silenzio.
inline void nackBusyIfCmd(char cc) {
  if (!g_busyNacked && cc != 'x' && cc != '?' && cc != '~' && cc > ' ') {
    // Rispetta l'invariante di formato: in un run v4 (g_runId>=0) NON deve
    // trapelare il token v3 "*busy"; si emette l'evento v4 "EVT BUSY run=N".
    if (g_runId >= 0) { Serial.print(F("EVT BUSY run=")); Serial.println(g_runId); }
    else              Serial.println(F("*busy"));
    g_busyNacked = true;
  }
}

// =============================================================
//  PROTOCOLLO v4 — helper stato / device id / eventi
// =============================================================
// Nome dello stato FSM per STATUS/HELLO/EVT.
const __FlashStringHelper *stateName(uint8_t s) {
  switch (s) {
    case ST_BOOT:        return F("BOOT");
    case ST_FREE:        return F("FREE");
    case ST_IDLE_LOCKED: return F("IDLE_LOCKED");
    case ST_MOVING:      return F("MOVING");
    case ST_SCANNING:    return F("SCANNING");
    case ST_TONE:        return F("TONE");
    case ST_STOPPING:    return F("STOPPING");
    default:             return F("FAULT");
  }
}
const __FlashStringHelper *faultName(uint8_t f) {
  switch (f) {
    case FAULT_ENCODER_JAM:  return F("ENCODER_JAM");
    case FAULT_HOST_TIMEOUT: return F("HOST_TIMEOUT");
    case FAULT_SENSOR:       return F("SENSOR");
    default:                 return F("NONE");
  }
}

// Device id stabile: 4 byte + CRC8 in EEPROM. Alla PRIMA accensione (CRC non
// valido) si semina da rumore ADC su un pin flottante — così ogni scheda ha un
// id proprio, indipendente dal nome COM (audit: "id in EEPROM con CRC").
uint8_t crc8(const uint8_t *p, uint8_t n) {
  uint8_t c = 0;
  for (uint8_t i = 0; i < n; i++) {
    c ^= p[i];
    for (uint8_t b = 0; b < 8; b++) c = (c & 0x80) ? (uint8_t)((c << 1) ^ 0x07) : (uint8_t)(c << 1);
  }
  return c;
}
void initDeviceId() {
  uint8_t buf[5];
  for (uint8_t i = 0; i < 5; i++) buf[i] = EEPROM.read(i);
  if (crc8(buf, 4) == buf[4]) {
    g_deviceId = ((uint32_t)buf[0] << 24) | ((uint32_t)buf[1] << 16) | ((uint32_t)buf[2] << 8) | buf[3];
    return;
  }
  // Semina da rumore analogico (pin sensore DATA, ad alta impedenza a riposo).
  uint32_t seed = 0x9E3779B9UL ^ micros();
  for (uint8_t i = 0; i < 32; i++) seed = (seed << 1) ^ (analogRead(A0) & 1) ^ (seed >> 31);
  g_deviceId = seed ? seed : 0xCA3350EEUL;
  buf[0] = g_deviceId >> 24; buf[1] = g_deviceId >> 16; buf[2] = g_deviceId >> 8; buf[3] = g_deviceId;
  buf[4] = crc8(buf, 4);
  for (uint8_t i = 0; i < 5; i++) EEPROM.update(i, buf[i]);
}

// HELLO: risposta completa a STATUS (e annuncio capacità). Un'unica riga con
// proto, fw, device id, stato, free, fault, reset reason.
void emitHello() {
  Serial.print(F("HELLO proto=4 fw=4.0 dev="));
  Serial.print(g_deviceId, HEX);
  Serial.print(F(" state=")); Serial.print(stateName(g_state));
  Serial.print(F(" free=")); Serial.print(g_motorFree ? 1 : 0);
  Serial.print(F(" fault=")); Serial.print(faultName(g_fault));
  Serial.print(F(" rst=0x")); Serial.println(g_resetFlags, HEX);
}
void emitAck(long seq) {
  Serial.print(F("ACK ")); Serial.print(seq);
  Serial.print(F(" state=")); Serial.println(stateName(g_state));
}
void emitNack(long seq, const __FlashStringHelper *code) {
  Serial.print(F("NACK ")); Serial.print(seq);
  Serial.print(F(" code=")); Serial.print(code);
  Serial.print(F(" state=")); Serial.println(stateName(g_state));
}

// =============================================================
//  Stepper — pulse singolo con rampa di accelerazione inline
// =============================================================
// stepperMove genera 'steps' impulsi PUL spaziati nel tempo secondo un
// profilo trapezoidale: accelera per cfgAccelSteps, plateau a velocità
// max (cfgPulseUs base), decelera per cfgAccelSteps. Se steps è troppo
// piccolo (< 2 * cfgAccelSteps) la rampa diventa triangolare.
//
// Effetto pratico: lo "step più lento" agli estremi del movimento ha un
// delay aggiuntivo di cfgRampExtraUs μs. Lo step centrale usa solo
// cfgPulseUs. Il jolt iniziale/finale (che eccita le risonanze) sparisce.
// INTERROMPIBILE: ogni 16 passi controlla la seriale — 'x' ferma il movimento
// (STOP di emergenza: prima un "Ruota 300°" sbagliato non era fermabile se non
// staccando la corrente). Ritorna false se interrotto; i '\n' del keep-alive
// vengono scartati per non intasare il buffer RX durante i movimenti lunghi.
bool stepperMove(int16_t units) {
  if (units == 0) return true;
  g_stopReason = STOPR_NONE;
  // FAULT latched (v4): nessun movimento finché non arriva RESET_FAULT.
  if (g_state == ST_FAULT) { g_stopReason = STOPR_FAULT; if (g_runId < 0) Serial.println(F("*fault")); return false; }
  // AUDIT FW-01: se il motore è in FREE non si muove finché non arriva 'l'.
  // Prima qualunque movimento rimetteva ENA=HIGH annullando il FREE in silenzio.
  if (g_motorFree) { g_stopReason = STOPR_LOCKED; if (g_runId < 0) Serial.println(F("*locked")); return false; }
  g_busyNacked = false;   // FW-09: un solo "*busy" per questo movimento
  // AUDIT FW-01 (controrevisione v3.4.1): NON rinnovare qui l'heartbeat. Lo
  // scan autonomo chiama stepperMove() a ogni unità: farlo qui teneva vivo da
  // solo il watchdog v4 e lo scan poteva arrivare a EVT DONE anche con l'host
  // muto. Il riferimento heartbeat va inizializzato UNA VOLTA all'accettazione
  // del run (autonomousScan e gestore MOVE) e rinnovato SOLO da '~'/HEARTBEAT.
  digitalWrite(PIN_ENA, HIGH);
  digitalWrite(PIN_DIR, units > 0 ? HIGH : LOW);
  // 32 bit: con r32 già 2048 unità (2048°) superano i 65535 µstep e un
  // contatore a 16 bit ANDAVA IN OVERFLOW (movimento imprevedibile —
  // scoperto al banco il 2026-07-13 con $+5760: girati ~1484° invece di 5760).
  uint32_t steps = (uint32_t)abs(units) * cfgStepsPerUnit;

  // Calcola rampa effettiva: max metà del movimento per lato
  uint32_t rampN = cfgAccelSteps;
  if (rampN > steps / 2) rampN = steps / 2;
  uint32_t rampExtra = cfgRampExtraUs;  // promosso a 32-bit per i prodotti

  for (uint32_t s = 0; s < steps; s++) {
    if ((s & 15) == 0) {
      // Consuma TUTTO il buffer cercando 'x': durante il movimento possono
      // accodarsi keep-alive e polling ('?') PRIMA dello stop — fermarsi al
      // primo char non-x renderebbe lo STOP cieco (visto al banco col
      // polling della pagina attivo). Gli altri comandi vengono scartati:
      // il gestore '$' li scartava comunque in blocco a fine movimento.
      while (Serial.available()) {
        char cc = (char)Serial.read();
        lastRxMs = millis();
        if (cc == '~') g_lastHeartbeatMs = millis();   // v4: heartbeat DEDICATO
        if (cc == 'x') {
          g_stopReason = STOPR_USER;
          if (g_runId < 0) Serial.println(F("*mabort"));   // v4: EVT STOPPED lo emette il chiamante
          if (cfgSettleMs) delay(cfgSettleMs);
          return false;
        }
        nackBusyIfCmd(cc);   // FW-09: comando durante il moto → "*busy" (una volta)
      }
      // AUDIT FW-03: host muto durante il moto (cavo/PC/server morti) → abort di
      // sicurezza. v3: riferimento = QUALSIASI byte (il server manda '\n'). v4:
      // riferimento = heartbeat DEDICATO '~' (un byte spurio non maschera la
      // perdita reale dell'host).
      uint32_t wdtRef = (g_runId >= 0) ? g_lastHeartbeatMs : lastRxMs;
      if ((uint32_t)(millis() - wdtRef) > WDT_TIMEOUT_MS) {
        g_stopReason = STOPR_WDT;
        if (g_runId < 0) { Serial.println(F("*wdt")); Serial.println(F("*mabort")); }
        return false;
      }
    }
    // Delay extra in funzione della posizione nella rampa
    uint16_t extraUs = 0;
    if (rampN > 0) {
      if (s < rampN) {
        // Accelerazione: extra da rampExtra (s=0) a 0 (s=rampN-1)
        extraUs = (uint16_t)((rampExtra * (rampN - s)) / rampN);
      } else if (s >= steps - rampN) {
        // Decelerazione: extra da 0 a rampExtra
        uint16_t inDec = s - (steps - rampN);
        extraUs = (uint16_t)((rampExtra * (inDec + 1)) / rampN);
      }
    }
    digitalWrite(PIN_PUL, HIGH);
    delayMicroseconds(cfgPulseUs);
    digitalWrite(PIN_PUL, LOW);
    // Tempo "basso" del pulso = base + extra rampa
    if (extraUs == 0) {
      delayMicroseconds(cfgPulseUs);
    } else {
      delayMicroseconds(cfgPulseUs);
      // extraUs può essere > 16383 (limite delayMicroseconds), spezzo
      uint16_t remaining = extraUs;
      while (remaining > 10000) { delayMicroseconds(10000); remaining -= 10000; }
      if (remaining) delayMicroseconds(remaining);
    }
  }
  // Settle time: smorza vibrazioni residue prima della lettura sensore.
  if (cfgSettleMs) delay(cfgSettleMs);
  return true;
}

// =============================================================
//  Lettura singolo frame: aspetta finestra di settle e restituisce mm
// =============================================================
float readSensorMmOnceT(uint16_t timeoutMs) {
  // AUDIT FW-10: attesa rollover-safe. `millis() < deadline` falliva subito se
  // millis() era prossimo a wrap (dopo ~49 giorni di uptime); la differenza
  // unsigned start→now confrontata col timeout è immune al rollover.
  uint32_t start = millis();
  noInterrupts();
  sensorReady = false;
  interrupts();
  while ((uint32_t)(millis() - start) < timeoutMs) {
    if (sensorReady) break;
  }
  noInterrupts();
  uint16_t raw = sensorRaw;
  bool ok      = sensorReady;
  interrupts();
  if (!ok) return NAN;
  return (float)raw / SENSOR_DIVIDER;
}
float readSensorMmOnce() { return readSensorMmOnceT(SENSOR_SETTLE_MS); }

// =============================================================
//  Lettura ADATTIVA (scan autonomo): legge frame finché due consecutivi
//  coincidono entro SCAN_EPS_MM, con budget massimo complessivo.
//  Sul cerchio base converge subito (veloce); sul fianco ripido insiste
//  finché il tastatore si è davvero assestato (preciso). Se il budget
//  scade, restituisce l'ultimo frame valido (NaN se mai visto un frame).
// =============================================================
const float    SCAN_EPS_MM         = 0.005f;   // due frame uguali entro 5 µm = stabile
const uint16_t SCAN_FRAME_MS       = 400;      // attesa max per singolo frame
const uint16_t SCAN_BUDGET_MS      = 1500;     // budget massimo per punto
bool g_lastReadStable = true;                  // esito stabilità dell'ultima lettura adattiva
float readSensorStableMm() {
  g_lastReadStable = true;
  uint32_t tEnd = millis() + SCAN_BUDGET_MS;
  float prev = readSensorMmOnceT(SCAN_FRAME_MS);
  float last = prev;
  uint8_t validFrames = isnan(prev) ? 0 : 1;
  while ((int32_t)(tEnd - millis()) > 0) {
    uint32_t remain = tEnd - millis();
    float v = readSensorMmOnceT(remain > SCAN_FRAME_MS ? SCAN_FRAME_MS : (uint16_t)remain);
    if (isnan(v)) {
      // AUDIT FW-05: un frame NaN AZZERA il confronto — prima veniva solo
      // saltato e due frame concordi SEPARATI da un buco del sensore
      // passavano per "stabili". Dopo un NaN servono due frame buoni freschi.
      prev = NAN;
      continue;
    }
    if (validFrames < 255) validFrames++;
    if (!isnan(prev) && fabs(v - prev) <= SCAN_EPS_MM) return (v + prev) * 0.5f;
    prev = v;
    last = v;
  }
  // Budget scaduto senza due frame CONSECUTIVI concordi entro 5 µm.
  // AUDIT FW-05: con meno di 2 frame validi in tutto il budget (1500 ms ≈
  // ~15 frame attesi) il sensore sta perdendo colpi: il punto è NaN vero,
  // non un numero — il browser lo scarta e lo conta (percorso MET-01).
  // Con ≥2 frame validi ma discordi: ultimo frame, dichiarato in *sstat.
  g_lastReadStable = false;
  if (validFrames < 2) return NAN;
  return last;
}

// =============================================================
//  Lettura con media filtrata di cfgSamples campioni (NaN scartati)
// =============================================================
float readSensorMm() {
  if (cfgSamples <= 1) return readSensorMmOnce();
  float sum = 0;
  uint8_t valid = 0;
  for (uint8_t i = 0; i < cfgSamples; i++) {
    float v = readSensorMmOnce();
    if (!isnan(v)) { sum += v; valid++; }
  }
  if (valid == 0) return NAN;
  return sum / valid;
}

// =============================================================
//  Helper output seriale
// =============================================================
// Terminatori distinti per separare misure di scansione da misure-only:
//   *se  → misura emessa dopo p/q (movimento + lettura) — il browser la
//          usa per AVANZARE il loop di scansione
//   *sm  → misura emessa per 'm' (solo lettura) — il browser la usa solo
//          per aggiornare display/gauge, NON avanza la scansione.
//
// La misura di scansione include anche il conteggio encoder ATTUALE (dopo
// il movimento), così il browser può associare ogni misura a una posizione
// angolare REALE della camma (non quella nominale derivata dal contatore
// di scansione). Formato: "X.XX N\n*se\n" dove N = encoder count cumulativo.
// Necessario per il "Zero virtuale": il browser usa encoder_at_max come
// riferimento per calcolare il movimento di sfasamento di +180°.
void emitMeasureScan(float mm) {
  if (isnan(mm)) Serial.print(F("NaN"));
  else           Serial.print(mm, 2);
  Serial.print(' ');
  noInterrupts();
  int32_t cnt = encoderCount;
  interrupts();
  Serial.println(cnt);
  Serial.println(F("*se"));
}
void emitMeasureOnly(float mm) {
  if (isnan(mm)) Serial.println(F("NaN"));
  else           Serial.println(mm, 2);
  Serial.println(F("*sm"));
}

void emitEncoderQuery() {
  noInterrupts();
  int32_t cnt = encoderCount;
  interrupts();
  float deg = (float)cnt / (float)ENC_COUNTS_PER_DEG;
  Serial.print(F("encoder=")); Serial.print(cnt);
  Serial.print(F(" deg="));    Serial.println(deg, 2);
  Serial.println(F("*pos"));
}

// =============================================================
//  SCAN AUTONOMO — comando 'S±NNNNN' (v3)
// =============================================================
//  Il ciclo di scansione gira QUI invece che nel browser: per ogni unità
//  muove, legge il sensore con settle ADATTIVO e trasmette in streaming
//    #i:enc:mm        (i = indice progressivo 1..N — funge da sequenza:
//                      il browser rileva i buchi; enc = conteggio encoder;
//                      mm = misura, "NaN" se il sensore non risponde)
//  Fine: "*sdone" (completo) o "*sabort" (ricevuto 'x' dal PC).
//  Vantaggi vs handshake p/q per punto: niente round-trip PC↔seriale per
//  ogni grado (timing deterministico), settle adattivo (veloce sul cerchio
//  base, paziente sul fianco ripido), abort pulito.
//  I comandi p/q restano invariati per jog manuale e compatibilità.
// runId < 0 → scan v3 (stream "#i:enc:mm" … "*sdone"/"*sabort"/"*fault enc");
// runId >= 0 → scan v4 (EVT SAMPLE/DONE/STOPPED/FAULT con run=runId).
void autonomousScan(int8_t dir, uint16_t totalUnits, int16_t runId) {
  bool v4 = (runId >= 0);
  g_runId = runId;
  g_state = ST_SCANNING;
  g_busyNacked = false;    // FW-09: un solo "*busy" per questa scansione
  g_lastHeartbeatMs = millis();
  uint16_t unstable = 0;   // punti accettati a budget scaduto (non stabilizzati)
  // AUDIT FW-03: fault locale encoder. Il motore gira in anello aperto; se il
  // cavo encoder è staccato/rotto o l'albero è bloccato, il browser userebbe
  // un riferimento di "zero virtuale" sbagliato senza accorgersene. Ogni
  // ENC_CHK_WINDOW unità verifichiamo che l'encoder sia davvero avanzato.
  // Caratterizzato al banco (2026-07-19, nuovo albero, r32): ~4 counts/unità =
  // cfgStepsPerUnit/8. Soglia a 1/4 dell'atteso (min 3 counts): margine 4× sul
  // sano (spread misurato 1,1%) → falsi allarmi praticamente impossibili;
  // scatta sul caso reale (encoder ~0 counts mentre il motore ha mosso).
  const uint16_t ENC_CHK_WINDOW = 30;
  noInterrupts();
  int32_t chkBaseCnt = encoderCount;
  interrupts();
  uint16_t chkBaseI = 0;
  for (uint16_t i = 1; i <= totalUnits; i++) {
    // abort: qualunque 'x' arrivato dal PC ferma la scansione
    while (Serial.available() > 0) {
      char sc = (char)Serial.read();
      lastRxMs = millis();
      if (sc == '~') g_lastHeartbeatMs = millis();   // v4: heartbeat dedicato
      if (sc == 'x') {
        g_state = g_motorFree ? ST_FREE : ST_IDLE_LOCKED; g_runId = -1;
        if (v4) { Serial.print(F("EVT STOPPED run=")); Serial.print(runId); Serial.println(F(" reason=USER state=IDLE_LOCKED")); }
        else    Serial.println(F("*sabort"));
        cmdLen = 0;
        return;
      }
      nackBusyIfCmd(sc);   // FW-09: comando durante lo scan → "*busy" (una volta)
    }
    if (!stepperMove(dir)) {             // 'x' o wdt arrivato DURANTE il movimento
      g_state = g_motorFree ? ST_FREE : ST_IDLE_LOCKED; g_runId = -1;
      if (v4) {
        Serial.print(F("EVT STOPPED run=")); Serial.print(runId);
        Serial.print(F(" reason=")); Serial.print(g_stopReason == STOPR_WDT ? F("HOST_TIMEOUT") : F("USER"));
        Serial.println(F(" state=IDLE_LOCKED"));
      } else Serial.println(F("*sabort"));
      cmdLen = 0;
      return;
    }
    float mm = readSensorStableMm();     // settle adattivo elettrico/meccanico
    if (!g_lastReadStable && !isnan(mm)) unstable++;
    noInterrupts();
    int32_t cnt = encoderCount;
    interrupts();
    if (v4) {
      Serial.print(F("EVT SAMPLE run=")); Serial.print(runId);
      Serial.print(F(" idx=")); Serial.print(i);
      Serial.print(F(" enc=")); Serial.print(cnt);
      Serial.print(F(" mm="));
      if (isnan(mm)) Serial.print(F("NaN")); else Serial.print(mm, 2);
      Serial.print(F(" q=")); Serial.println(isnan(mm) ? F("NAN") : (g_lastReadStable ? F("OK") : F("NOISY")));
    } else {
      Serial.print('#'); Serial.print(i);
      Serial.print(':'); Serial.print(cnt);
      Serial.print(':');
      if (isnan(mm)) Serial.println(F("NaN"));
      else           Serial.println(mm, 2);
    }

    // AUDIT FW-03: verifica avanzamento encoder ogni ENC_CHK_WINDOW unità.
    if ((uint16_t)(i - chkBaseI) >= ENC_CHK_WINDOW) {
      uint16_t span   = i - chkBaseI;                        // unità mosse nella finestra
      int32_t  d      = cnt - chkBaseCnt;
      uint32_t moved  = (uint32_t)(d < 0 ? -d : d);          // counts effettivi (valore assoluto)
      uint32_t expect = (uint32_t)span * cfgStepsPerUnit / 8; // ~counts attesi (r32→4/unità)
      uint32_t minMv  = expect / 4;                           // soglia = 1/4 dell'atteso...
      if (minMv < 3) minMv = 3;                               // ...ma almeno 3 counts
      if (moved < minMv) {
        if (v4) {
          // v4: fault LATCHED — resta in FAULT finché non arriva RESET_FAULT.
          g_fault = FAULT_ENCODER_JAM; g_state = ST_FAULT; g_runId = -1;
          Serial.print(F("EVT FAULT run=")); Serial.print(runId);
          Serial.print(F(" code=ENCODER_JAM moved=")); Serial.print(moved);
          Serial.print(F(" exp=")); Serial.print(expect);
          Serial.println(F(" state=FAULT"));
        } else {
          // v3: abort SENZA latch (fw 3.8) — il browser non ha RESET_FAULT.
          g_state = g_motorFree ? ST_FREE : ST_IDLE_LOCKED; g_runId = -1;
          Serial.print(F("*fault enc moved=")); Serial.print(moved);
          Serial.print(F(" exp=")); Serial.print(expect);
          Serial.print(F(" span=")); Serial.println(span);
          Serial.println(F("*sabort"));   // stop pulito: il browser gestisce già *sabort
        }
        cmdLen = 0;
        return;
      }
      chkBaseI   = i;
      chkBaseCnt = cnt;
    }
  }
  while (Serial.available() > 0) Serial.read();   // drain comandi accodati
  g_state = g_motorFree ? ST_FREE : ST_IDLE_LOCKED; g_runId = -1;
  if (v4) {
    Serial.print(F("EVT DONE run=")); Serial.print(runId);
    Serial.print(F(" samples=")); Serial.print(totalUnits);
    Serial.print(F(" unstable=")); Serial.print(unstable);
    Serial.println(F(" state=IDLE_LOCKED"));
  } else {
    // Audit di stabilità: quanti punti sono stati accettati SENZA i due frame
    // concordi entro 5 µm. 0 = ogni lettura era davvero assestata.
    Serial.print(F("*sstat u=")); Serial.println(unstable);
    Serial.println(F("*sdone"));
  }
}

// =============================================================
//  PROTOCOLLO v4 — parser key=value + dispatcher
// =============================================================
// Trova "key=" in s (all'inizio o dopo uno spazio) e ritorna il puntatore al
// valore, altrimenti NULL.
const char *kvFind(const char *s, const char *key) {
  uint8_t kl = strlen(key);
  for (const char *p = s; *p; p++) {
    if ((p == s || p[-1] == ' ') && strncmp(p, key, kl) == 0 && p[kl] == '=') return p + kl + 1;
  }
  return NULL;
}
// Parsing intero RIGOROSO di "key=N": true+*out solo se presente, ben formato
// (fine a spazio o fine stringa) e nel range. Niente atoi, niente trailing garbage.
bool kvInt(const char *s, const char *key, long lo, long hi, long *out) {
  const char *v = kvFind(s, key);
  if (!v) return false;
  char *end = NULL;
  long n = strtol(v, &end, 10);
  if (end == v || (*end != '\0' && *end != ' ')) return false;
  if (n < lo || n > hi) return false;
  *out = n;
  return true;
}
char kvDir(const char *s) { const char *v = kvFind(s, "dir"); return v ? *v : '?'; }
// Confronto verbo con controllo di confine di parola (spazio o fine).
bool verbIs(const char *s, const char *verb) {
  uint8_t n = strlen(verb);
  return strncmp(s, verb, n) == 0 && (s[n] == '\0' || s[n] == ' ');
}

// Dispatcher v4: la riga inizia con una cifra → "<seq> VERBO args".
void executeV4(char *line) {
  char *end = NULL;
  long seq = strtol(line, &end, 10);
  if (end == line || *end != ' ') { emitNack(seq, F("BADSEQ")); return; }
  char *r = end + 1;
  while (*r == ' ') r++;

  if (verbIs(r, "HEARTBEAT")) { g_lastHeartbeatMs = millis(); return; }   // silenzioso
  if (verbIs(r, "STATUS"))    { emitHello(); return; }
  // STOP immediato DURANTE il moto = il byte 'x' (priorità assoluta, letto nei
  // drain di stepperMove/scan). Il VERBO "<seq> STOP" è la forma da fermo (la
  // riga completa si processa solo a run terminato): qui è un ACK/no-op.
  if (verbIs(r, "STOP"))      { g_stopReason = STOPR_USER; emitAck(seq); return; }
  if (verbIs(r, "LOCK")) {
    if (g_state == ST_FAULT) { emitNack(seq, F("FAULT")); return; }
    g_motorFree = false; digitalWrite(PIN_ENA, HIGH); g_state = ST_IDLE_LOCKED; emitAck(seq); return;
  }
  if (verbIs(r, "FREE")) {
    if (g_state == ST_FAULT) { emitNack(seq, F("FAULT")); return; }
    g_motorFree = true; digitalWrite(PIN_ENA, LOW); g_state = ST_FREE; emitAck(seq); return;
  }
  if (verbIs(r, "RESET_FAULT")) {
    // Valido solo da FAULT (siamo per forza fermi: firmware single-thread).
    if (g_state != ST_FAULT) { emitNack(seq, F("NO_FAULT")); return; }
    g_fault = FAULT_NONE; g_state = g_motorFree ? ST_FREE : ST_IDLE_LOCKED; emitAck(seq); return;
  }
  if (verbIs(r, "CONFIG")) {
    // ATOMICO: si validano PRIMA tutte le chiavi in variabili di staging, poi
    // si applicano solo se TUTTE valide (niente stato modificato su NACK). Si
    // rifiutano chiavi ignote/malformate e il CONFIG vuoto (almeno 1 chiave nota).
    const char *a = r + 6;                 // dopo "CONFIG"
    long vstep = -1, vsamp = -1, vset = -1, v;
    bool bad = false; uint8_t known = 0;
    for (const char *p = a; *p && !bad; ) {
      while (*p == ' ') p++;
      if (!*p) break;
      if      (!strncmp(p, "step=", 5))    { if (kvInt(a, "step", 1, 255, &v) && (v == 8 || v == 16 || v == 32 || v == 64)) { vstep = v; known++; } else bad = true; }
      else if (!strncmp(p, "samples=", 8)) { if (kvInt(a, "samples", 1, 9, &v)) { vsamp = v; known++; } else bad = true; }
      else if (!strncmp(p, "settle=", 7))  { if (kvInt(a, "settle", 0, 2000, &v)) { vset = v; known++; } else bad = true; }
      else bad = true;                     // chiave ignota o token senza '='
      while (*p && *p != ' ') p++;         // salta al prossimo token
    }
    if (bad || known == 0) { emitNack(seq, F("BADARG")); return; }
    if (vstep >= 0) cfgStepsPerUnit = (uint8_t)vstep;
    if (vsamp >= 0) cfgSamples      = (uint8_t)vsamp;
    if (vset  >= 0) cfgSettleMs     = (uint16_t)vset;
    emitAck(seq); return;
  }
  if (verbIs(r, "SCAN")) {
    long run, units; char d = kvDir(r);
    if (!kvInt(r, "run", 0, 32767, &run) || (d != '+' && d != '-') || !kvInt(r, "units", 1, 1500, &units)) { emitNack(seq, F("BADARG")); return; }
    if (g_state == ST_FAULT) { emitNack(seq, F("FAULT")); return; }
    if (g_motorFree)         { emitNack(seq, F("LOCKED")); return; }
    Serial.print(F("ACK ")); Serial.print(seq); Serial.print(F(" state=SCANNING run=")); Serial.println(run);
    autonomousScan(d == '+' ? +1 : -1, (uint16_t)units, (int16_t)run);   // emette EVT SAMPLE/DONE/…
    return;
  }
  if (verbIs(r, "MOVE")) {
    long run, units; char d = kvDir(r);
    if (!kvInt(r, "run", 0, 32767, &run) || (d != '+' && d != '-') || !kvInt(r, "units", 1, 3600, &units)) { emitNack(seq, F("BADARG")); return; }
    if (g_state == ST_FAULT) { emitNack(seq, F("FAULT")); return; }
    if (g_motorFree)         { emitNack(seq, F("LOCKED")); return; }
    g_runId = (int16_t)run; g_state = ST_MOVING;
    g_lastHeartbeatMs = millis();   // FW-01: init una volta all'accettazione del run
    Serial.print(F("ACK ")); Serial.print(seq); Serial.print(F(" state=MOVING run=")); Serial.println(run);
    bool ok = stepperMove((d == '+' ? +1 : -1) * (int16_t)units);
    while (Serial.available() > 0) { char dc = (char)Serial.read(); lastRxMs = millis(); if (dc == '~') g_lastHeartbeatMs = millis(); }
    g_runId = -1; g_state = ST_IDLE_LOCKED;
    if (ok) { Serial.print(F("EVT DONE run=")); Serial.print(run); Serial.println(F(" state=IDLE_LOCKED")); }
    else {
      Serial.print(F("EVT STOPPED run=")); Serial.print(run);
      Serial.print(F(" reason=")); Serial.print(g_stopReason == STOPR_WDT ? F("HOST_TIMEOUT") : (g_stopReason == STOPR_LOCKED ? F("LOCKED") : F("USER")));
      Serial.println(F(" state=IDLE_LOCKED"));
    }
    return;
  }
  if (verbIs(r, "TONE")) { emitNack(seq, F("UNSUPPORTED")); return; }   // Concerto: usare 't' v3
  emitNack(seq, F("BADCMD"));
}

// =============================================================
//  Parser comandi seriali
// =============================================================
void executeCommand() {
  cmdBuf[cmdLen] = '\0';
  // PROTOCOLLO v4: una riga che inizia con una CIFRA è v4 ("<seq> VERBO …").
  // v3 non ha comandi che iniziano per cifra → discriminazione netta, zero
  // impatto sul path v3 sottostante.
  if (cmdBuf[0] >= '0' && cmdBuf[0] <= '9') { executeV4(cmdBuf); cmdLen = 0; return; }
  if (cmdLen == 1) {
    char c = cmdBuf[0];
    // AUDIT FW-06: p/q ora leggono con lo STESSO assestamento dello scan
    // autonomo — settle meccanico (cfgSettleMs) + lettura adattiva a 2 frame
    // concordi (readSensorStableMm). Prima leggevano UN frame subito dopo il
    // movimento, con le vibrazioni ancora in corso.
    if (c == 'p')      { if (stepperMove(-1)) { if (cfgSettleMs) delay(cfgSettleMs); emitMeasureScan(readSensorStableMm()); } }
    else if (c == 'q') { if (stepperMove(+1)) { if (cfgSettleMs) delay(cfgSettleMs); emitMeasureScan(readSensorStableMm()); } }
    else if (c == 'x') {
      // STOP ricevuto a motore FERMO: niente da fermare, ma va consumato.
      // Scoperto in verifica audit: prima 'x' non era un comando riconosciuto
      // e restava in cmdBuf AVVELENANDO la riga successiva ("xS-360" veniva
      // scartata) → il browser scambiava il silenzio per firmware vecchio e
      // degradava PER SEMPRE al motore di scansione classico.
    }
    else if (c == '~') { g_lastHeartbeatMs = millis(); }   // v4: heartbeat dedicato (byte singolo)
    else if (c == 'm') { emitMeasureOnly(readSensorMm()); }
    else if (c == 'd') {
      // debug: dump raw sensor value (16 bit utili)
      noInterrupts();
      uint16_t r = sensorRaw;
      uint8_t  bi = sensorBitIdx;
      interrupts();
      Serial.print(F("raw=")); Serial.print(r);
      Serial.print(F(" mm=")); Serial.print((float)r / SENSOR_DIVIDER, 3);
      Serial.print(F(" bin=0b"));
      for (int8_t b = 15; b >= 0; b--) Serial.print((r >> b) & 1);
      Serial.print(F(" bitIdx=")); Serial.println(bi);
      Serial.println(F("*dbg"));
    }
    else if (c == '?') { emitEncoderQuery(); }
    else if (c == 'v') {
      // Versione/capacità firmware: il browser la usa per abilitare le
      // funzioni disponibili (scan=1 → scan autonomo 'S' supportato).
      // proto=4 = protocollo v4 SUPPORTATO (oltre a v3, retrocompatibile). La
      // UI v3 legge solo ver=/scan=/free= e ignora proto= senza problemi; un
      // client v4 usa STATUS/HELLO per la negoziazione completa.
      Serial.print(F("ver=4.1 scan=1 proto=4 free=")); Serial.println(g_motorFree ? 1 : 0);
      Serial.println(F("*ver"));
    }
    else if (c == '!') {
      noInterrupts();
      encoderCount = 0;
      interrupts();
      Serial.println(F("*zero"));
    }
    else if (c == '@') {
      Serial.print(F("samp=")); Serial.print(cfgSamples);
      Serial.print(F(" step=")); Serial.print(cfgStepsPerUnit);
      Serial.print(F(" settle=")); Serial.print(cfgSettleMs); Serial.print(F("ms"));
      Serial.print(F(" pulse=")); Serial.print(cfgPulseUs); Serial.print(F("us"));
      Serial.print(F(" accel=")); Serial.print(cfgAccelSteps);
      Serial.print(F(" gentle=")); Serial.print(cfgRampExtraUs); Serial.println(F("us"));
      Serial.println(F("*cfg"));
    }
    else if (c == 'f') {
      // FREE: rilascia corrente stepper. L'utente può ruotare l'albero
      // a mano; l'encoder continua a contare in tempo reale. Stato
      // PERSISTENTE (audit FW-01): i movimenti restano rifiutati fino a 'l'.
      g_motorFree = true;
      digitalWrite(PIN_ENA, LOW);
      if (g_state != ST_FAULT) g_state = ST_FREE;   // il FAULT latched ha precedenza
      Serial.println(F("*free"));
    }
    else if (c == 'l') {
      // LOCK: riabilita corrente stepper (torna in tenuta).
      g_motorFree = false;
      digitalWrite(PIN_ENA, HIGH);
      if (g_state != ST_FAULT) g_state = ST_IDLE_LOCKED;
      Serial.println(F("*lock"));
    }
  } else if (cmdLen >= 2 && cmdBuf[0] == 'c') {
    // AUDIT FW-04: parsing rigoroso. Prima atoi accettava "c3xyz"→3 e non
    // segnalava overflow/spazzatura; ora fuori grammatica/range → "*err c".
    long v;
    if (!parseIntStrict(&cmdBuf[1], 1, 9, &v)) { Serial.println(F("*err c")); cmdLen = 0; return; }
    cfgSamples = (uint8_t)v;
    Serial.print(F("samp=")); Serial.println(cfgSamples);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'r') {
    long v;
    if (!parseIntStrict(&cmdBuf[1], 1, 255, &v) || !(v == 8 || v == 16 || v == 32 || v == 64)) {
      Serial.println(F("*err r")); cmdLen = 0; return;
    }
    cfgStepsPerUnit = (uint8_t)v;
    Serial.print(F("step=")); Serial.println(cfgStepsPerUnit);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'w') {
    long v;
    if (!parseIntStrict(&cmdBuf[1], 0, 2000, &v)) { Serial.println(F("*err w")); cmdLen = 0; return; }
    cfgSettleMs = (uint16_t)v;
    Serial.print(F("settle=")); Serial.print(cfgSettleMs); Serial.println(F("ms"));
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'u') {
    // u<N>: pulse width base in μs (50..400)
    long v;
    if (!parseIntStrict(&cmdBuf[1], 50, 400, &v)) { Serial.println(F("*err u")); cmdLen = 0; return; }
    cfgPulseUs = (uint16_t)v;
    Serial.print(F("pulse=")); Serial.print(cfgPulseUs); Serial.println(F("us"));
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'a') {
    // a<N>: step rampa accel/decel (0..32)
    long v;
    if (!parseIntStrict(&cmdBuf[1], 0, 32, &v)) { Serial.println(F("*err a")); cmdLen = 0; return; }
    cfgAccelSteps = (uint8_t)v;
    Serial.print(F("accel=")); Serial.println(cfgAccelSteps);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'g') {
    // g<N>: extra delay rampa in μs (0..500)
    long v;
    if (!parseIntStrict(&cmdBuf[1], 0, 500, &v)) { Serial.println(F("*err g")); cmdLen = 0; return; }
    cfgRampExtraUs = (uint16_t)v;
    Serial.print(F("gentle=")); Serial.print(cfgRampExtraUs); Serial.println(F("us"));
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'k') {
    // k<S>: preset profilo movimento (0..3)
    long v;
    if (!parseIntStrict(&cmdBuf[1], 0, 3, &v)) { Serial.println(F("*err k")); cmdLen = 0; return; }
    if (v == 0)      { cfgPulseUs = 50;  cfgAccelSteps = 0;  cfgRampExtraUs = 0;   }
    else if (v == 1) { cfgPulseUs = 80;  cfgAccelSteps = 4;  cfgRampExtraUs = 50;  }
    else if (v == 2) { cfgPulseUs = 120; cfgAccelSteps = 8;  cfgRampExtraUs = 120; }
    else if (v == 3) { cfgPulseUs = 180; cfgAccelSteps = 16; cfgRampExtraUs = 250; }
    Serial.print(F("profile=")); Serial.print((int)v);
    Serial.print(F(" pulse=")); Serial.print(cfgPulseUs);
    Serial.print(F(" accel=")); Serial.print(cfgAccelSteps);
    Serial.print(F(" gentle=")); Serial.println(cfgRampExtraUs);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 5 && cmdBuf[0] == 't' && (cmdBuf[1] >= '0' && cmdBuf[1] <= '9')) {
    // tFFFF:DDDD:S[:VV] (es. "t440:500:+:75") = suona FFFF Hz per DDDD ms
    // in direzione S, con duty cycle VV% (default 50, controlla il volume)
    if (g_state == ST_FAULT) { Serial.println(F("*fault")); cmdLen = 0; return; }   // fault latched (v4)
    // AUDIT FW-01 (chiuso anche qui): il TONE energizza/pulsa il motore, quindi
    // in FREE va RIFIUTATO come p/q/$/S — prima era l'unico percorso di moto che
    // ignorava g_motorFree (avrebbe mosso l'albero con la mano dell'operatore
    // sopra, e lasciato ENA=HIGH desincronizzando lo stato FREE).
    if (g_motorFree) { Serial.println(F("*locked")); cmdLen = 0; return; }
    char *p1 = strchr(&cmdBuf[1], ':');
    if (p1) {
      *p1 = '\0';
      char *p2 = strchr(p1 + 1, ':');
      char *p3 = NULL;
      if (p2) {
        *p2 = '\0';
        p3 = strchr(p2 + 1, ':');
        if (p3) *p3 = '\0';
      }
      int freq = atoi(&cmdBuf[1]);
      int dur  = atoi(p1 + 1);
      char sign = p2 ? *(p2 + 1) : '+';
      int duty = p3 ? atoi(p3 + 1) : 50;
      if (duty < 10) duty = 10;
      if (duty > 90) duty = 90;
      if (freq >= 60 && freq <= 2000 && dur >= 10 && dur <= 5000) {
        digitalWrite(PIN_ENA, HIGH);
        digitalWrite(PIN_DIR, (sign == '-') ? LOW : HIGH);
        // Periodo totale in μs e suddivisione HIGH/LOW secondo duty.
        // periodo = 1e6/freq; tHIGH = periodo * duty/100; tLOW = resto
        uint32_t periodUs = 1000000UL / (uint32_t)freq;
        uint32_t highUs   = (periodUs * (uint32_t)duty) / 100UL;
        if (highUs < 5) highUs = 5;  // min 5μs HIGH per il driver
        uint32_t lowUs    = periodUs > highUs ? periodUs - highUs : 5;
        // Step totali = freq * dur / 1000
        uint32_t totalSteps = ((uint32_t)freq * (uint32_t)dur) / 1000UL;
        // AUDIT FW-02: questo era l'UNICO percorso di moto non interrompibile
        // (fino a 10.000 passi ≈ 312° senza mai guardare la seriale) e il
        // drain di fine nota INGOIAVA in silenzio uno STOP arrivato durante
        // la nota. Ora: check di 'x' ogni 16 passi (come stepperMove) con
        // "*tabort", e il drain finale preserva un eventuale 'x' ritardatario.
        bool tAborted = false;
        for (uint32_t s = 0; s < totalSteps && !tAborted; s++) {
          if ((s & 15) == 0) {
            while (Serial.available()) {
              char tc = (char)Serial.read();
              lastRxMs = millis();
              if (tc == 'x') { tAborted = true; break; }
            }
            if (!tAborted && (uint32_t)(millis() - lastRxMs) > WDT_TIMEOUT_MS) tAborted = true;  // FW-03
            if (tAborted) break;
          }
          digitalWrite(PIN_PUL, HIGH);
          uint32_t h = highUs;
          while (h > 10000) { delayMicroseconds(10000); h -= 10000; }
          if (h) delayMicroseconds(h);
          digitalWrite(PIN_PUL, LOW);
          h = lowUs;
          while (h > 10000) { delayMicroseconds(10000); h -= 10000; }
          if (h) delayMicroseconds(h);
        }
        if (tAborted) {
          while (Serial.available() > 0) { Serial.read(); lastRxMs = millis(); }
          Serial.println(F("*tabort"));
          cmdLen = 0;
          return;
        }
      }
      // drain: scarta i comandi accodati durante la nota MA non lo STOP
      while (Serial.available() > 0) {
        char dc = (char)Serial.read();
        lastRxMs = millis();
        if (dc == 'x') { Serial.println(F("*tabort")); }
      }
      Serial.println(F("*tend"));
    }
  } else if (cmdLen >= 2 && cmdBuf[0] == 'S') {
    // S±NNNNN — scan autonomo: segno = direzione (come p/q), NNNNN = unità.
    // AUDIT FW-04: parsing con strtol (32 bit) + grammatica e range ESPLICITI.
    // Prima atoi (int16 su AVR) wrappava: "S+70000" diventava 4464 unità
    // ACCETTATE in silenzio. E il tetto era 20000 unità (~55 giri!): nessuna
    // scansione legittima supera 720 unità (Race: 360° a passi da 0,5°) —
    // tetto 1500 con margine. Fuori grammatica/range → "*err" e nessun moto.
    if (cmdBuf[1] != '+' && cmdBuf[1] != '-') { Serial.println(F("*err S")); cmdLen = 0; return; }
    if (g_state == ST_FAULT) { Serial.println(F("*fault")); cmdLen = 0; return; }   // fault latched (v4)
    char *endS = NULL;
    long valueS = strtol(&cmdBuf[2], &endS, 10);
    if (endS == &cmdBuf[2] || *endS != '\0' || valueS <= 0 || valueS > 1500) {
      Serial.println(F("*err S"));
      cmdLen = 0;
      return;
    }
    autonomousScan(cmdBuf[1] == '+' ? +1 : -1, (uint16_t)valueS, -1);   // -1 = scan v3
  } else if (cmdLen >= 2 && cmdBuf[0] == '$') {
    // $±NNN — rotazione manuale. AUDIT FW-04: come sopra (strtol + range);
    // prima "$+70000" wrappava a 4464° eseguiti davvero e non c'era tetto.
    // Tetto 3600 unità (10 giri): copre Ruota/0V/posizioni con largo margine.
    if (cmdLen < 3 || (cmdBuf[1] != '+' && cmdBuf[1] != '-')) { Serial.println(F("*err $")); cmdLen = 0; return; }
    char *endM = NULL;
    long valueM = strtol(&cmdBuf[2], &endM, 10);
    if (endM == &cmdBuf[2] || *endM != '\0' || valueM <= 0 || valueM > 3600) {
      Serial.println(F("*err $"));
      cmdLen = 0;
      return;
    }
    bool completed = stepperMove((cmdBuf[1] == '+' ? +1 : -1) * (int16_t)valueM);
    // Drain del buffer seriale: durante il movimento il PC potrebbe aver
    // accodato altri comandi (polling encoder, ecc.) che ora sono accumulati.
    // Li scartiamo per non andare fuori sequenza nello stato del parser.
    while (Serial.available() > 0) { Serial.read(); lastRxMs = millis(); }
    if (completed) Serial.println(F("*mv"));   // fine movimento (se interrotto ha già emesso *mabort)
  }
  cmdLen = 0;
}

// =============================================================
//  Setup
// =============================================================
void setup() {
  // AUDIT FW-11: motivo del reset (MCUSR) catturato PRIMA di qualsiasi cosa e
  // azzerato (buona prassi: evita loop di reset dopo un watchdog). Annunciato
  // al boot così l'host sa perché la scheda è (ri)partita.
  g_resetFlags = MCUSR;
  MCUSR = 0;

  // AUDIT FW-12: ordine PIN sicuro. Prima si faceva pinMode(OUTPUT) e POI
  // digitalWrite: nell'istante tra i due il pin driva LOW il livello di reset,
  // e con PUL reso output mentre ENA era ancora INPUT (high-Z, driver magari
  // abilitato) si poteva generare un impulso spurio = mezzo passo all'avvio.
  // Ora: ENA disabilitato PER PRIMO (nessun passo possibile), poi PUL/DIR;
  // digitalWrite-prima-di-pinMode pre-carica il latch così l'uscita nasce già
  // al livello giusto senza transitorio. (Verifica finale all'oscilloscopio
  // sul DM542E: NEEDS_HARDWARE.)
  digitalWrite(PIN_ENA, LOW);  pinMode(PIN_ENA, OUTPUT); digitalWrite(PIN_ENA, LOW);  // motore disabilitato a riposo
  digitalWrite(PIN_PUL, LOW);  pinMode(PIN_PUL, OUTPUT); digitalWrite(PIN_PUL, LOW);  // PUL idle basso (nessun fronte)
  digitalWrite(PIN_DIR, LOW);  pinMode(PIN_DIR, OUTPUT); digitalWrite(PIN_DIR, LOW);

  pinMode(PIN_SENS_INT, INPUT);
  pinMode(PIN_SENS_DAT, INPUT);
  pinMode(PIN_ENC_A,    INPUT_PULLUP);                // pull-up interno come fallback se manca esterno
  pinMode(PIN_ENC_B,    INPUT_PULLUP);

  // stato encoder iniziale
  uint8_t a = (PIND & (1 << PIN_ENC_A)) ? 1 : 0;
  uint8_t b = (PINB & (1 << 0))         ? 1 : 0;
  encoderState = (a << 1) | b;

  // interrupts
  attachInterrupt(digitalPinToInterrupt(PIN_SENS_INT), sensorISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_ENC_A),    encoderAISR, CHANGE);
  // PCINT0 per pin 8 (PB0)
  PCICR  |= (1 << PCIE0);
  PCMSK0 |= (1 << PCINT0);

  // Device id stabile (EEPROM, con CRC) prima di annunciare l'HELLO.
  initDeviceId();
  // Stato iniziale: motore in tenuta (ENA guidato), fermo. Nessuna partenza
  // automatica dopo boot/reset (audit v4). Il fault NON è latched al boot.
  g_state = ST_IDLE_LOCKED;
  g_fault = FAULT_NONE;

  Serial.begin(9600);
  // "CAMMES Uno ready": stringa storica che l'host usa per rilevare i reboot —
  // NON cambiarla. Subito dopo, l'handshake versionato con lo stato completo
  // e il reset reason (audit FW-11): l'host può loggare/diagnosticare.
  Serial.println(F("CAMMES Uno ready"));
  Serial.print(F("*boot ver=4.1 r=")); Serial.print(cfgStepsPerUnit);
  Serial.print(F(" samp="));   Serial.print(cfgSamples);
  Serial.print(F(" settle="));  Serial.print(cfgSettleMs);
  Serial.print(F(" free="));    Serial.print(g_motorFree ? 1 : 0);
  Serial.print(F(" rst=0x"));   Serial.println(g_resetFlags, HEX);
  // v4: annuncio HELLO completo al boot (proto/fw/dev/state/fault). La UI v3
  // lo ignora (riga non riconosciuta); un client v4 lo usa per la negoziazione.
  emitHello();
}

// =============================================================
//  Loop
// =============================================================
void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    lastRxMs = millis();                                // watchdog host (FW-03)
    if (c == '\r' || c == '\n') {
      // AUDIT FW-04: se la riga era andata in overflow, il newline chiude lo
      // scarto SENZA eseguire il frammento residuo.
      if (g_discardLine) { g_discardLine = false; cmdLen = 0; }
      else if (cmdLen > 0) executeCommand();
    } else if (g_discardLine) {
      // resto di una riga troppo lunga: scarta finché non arriva il newline
    } else if (cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = c;
      // comandi a singolo carattere si eseguono immediatamente
      // ('x' incluso: a motore fermo è un no-op consumato subito, così non
      // avvelena il buffer della riga successiva — fix audit)
      if (cmdLen == 1 && (c == 'p' || c == 'q' || c == 'm' || c == 'd' || c == '?' || c == '!' || c == '@' || c == 'f' || c == 'l' || c == 'v' || c == 'x' || c == '~')) {
        executeCommand();
      }
    } else {
      // AUDIT FW-04: overflow. Prima si azzerava solo cmdLen e i caratteri
      // successivi formavano un comando spurio; ora si scarta TUTTO il resto
      // della riga fino al newline e si segnala una volta con "*err ovf".
      Serial.println(F("*err ovf"));
      g_discardLine = true;
      cmdLen = 0;
    }
  }
}
