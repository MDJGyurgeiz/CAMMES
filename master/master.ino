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

// ---- Comando seriale ----
char    cmdBuf[16];
uint8_t cmdLen = 0;

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
  digitalWrite(PIN_ENA, HIGH);
  digitalWrite(PIN_DIR, units > 0 ? HIGH : LOW);
  uint16_t steps = (uint16_t)abs(units) * cfgStepsPerUnit;

  // Calcola rampa effettiva: max metà del movimento per lato
  uint16_t rampN = cfgAccelSteps;
  if (rampN > steps / 2) rampN = steps / 2;
  uint32_t rampExtra = cfgRampExtraUs;  // promosso a 32-bit per i prodotti

  for (uint16_t s = 0; s < steps; s++) {
    if ((s & 15) == 0) {
      // Consuma TUTTO il buffer cercando 'x': durante il movimento possono
      // accodarsi keep-alive e polling ('?') PRIMA dello stop — fermarsi al
      // primo char non-x renderebbe lo STOP cieco (visto al banco col
      // polling della pagina attivo). Gli altri comandi vengono scartati:
      // il gestore '$' li scartava comunque in blocco a fine movimento.
      while (Serial.available()) {
        char cc = (char)Serial.read();
        if (cc == 'x') {
          Serial.println(F("*mabort"));
          if (cfgSettleMs) delay(cfgSettleMs);
          return false;
        }
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
  uint32_t deadline = millis() + timeoutMs;
  noInterrupts();
  sensorReady = false;
  interrupts();
  while (millis() < deadline) {
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
float readSensorStableMm() {
  uint32_t tEnd = millis() + SCAN_BUDGET_MS;
  float prev = readSensorMmOnceT(SCAN_FRAME_MS);
  float last = prev;
  while (millis() < tEnd) {
    uint32_t remain = tEnd - millis();
    float v = readSensorMmOnceT(remain > SCAN_FRAME_MS ? SCAN_FRAME_MS : (uint16_t)remain);
    if (isnan(v)) continue;
    if (!isnan(prev) && fabs(v - prev) <= SCAN_EPS_MM) return (v + prev) * 0.5f;
    prev = v;
    last = v;
  }
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
void autonomousScan(int8_t dir, uint16_t totalUnits) {
  for (uint16_t i = 1; i <= totalUnits; i++) {
    // abort: qualunque 'x' arrivato dal PC ferma la scansione
    while (Serial.available() > 0) {
      if (Serial.read() == 'x') {
        Serial.println(F("*sabort"));
        cmdLen = 0;
        return;
      }
    }
    if (!stepperMove(dir)) {             // 'x' arrivato DURANTE il movimento
      Serial.println(F("*sabort"));
      cmdLen = 0;
      return;
    }
    float mm = readSensorStableMm();     // settle adattivo elettrico/meccanico
    noInterrupts();
    int32_t cnt = encoderCount;
    interrupts();
    Serial.print('#'); Serial.print(i);
    Serial.print(':'); Serial.print(cnt);
    Serial.print(':');
    if (isnan(mm)) Serial.println(F("NaN"));
    else           Serial.println(mm, 2);
  }
  while (Serial.available() > 0) Serial.read();   // drain comandi accodati
  Serial.println(F("*sdone"));
}

// =============================================================
//  Parser comandi seriali
// =============================================================
void executeCommand() {
  cmdBuf[cmdLen] = '\0';
  if (cmdLen == 1) {
    char c = cmdBuf[0];
    if (c == 'p')      { if (stepperMove(-1)) emitMeasureScan(readSensorMm()); }
    else if (c == 'q') { if (stepperMove(+1)) emitMeasureScan(readSensorMm()); }
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
      Serial.println(F("ver=3.1 scan=1"));
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
      // a mano; l'encoder continua a contare in tempo reale.
      digitalWrite(PIN_ENA, LOW);
      Serial.println(F("*free"));
    }
    else if (c == 'l') {
      // LOCK: riabilita corrente stepper (torna in tenuta).
      digitalWrite(PIN_ENA, HIGH);
      Serial.println(F("*lock"));
    }
  } else if (cmdLen >= 2 && cmdBuf[0] == 'c') {
    int v = atoi(&cmdBuf[1]);
    if (v >= 1 && v <= 9) cfgSamples = (uint8_t)v;
    Serial.print(F("samp=")); Serial.println(cfgSamples);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'r') {
    int v = atoi(&cmdBuf[1]);
    if (v == 8 || v == 16 || v == 32 || v == 64) cfgStepsPerUnit = (uint8_t)v;
    Serial.print(F("step=")); Serial.println(cfgStepsPerUnit);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'w') {
    int v = atoi(&cmdBuf[1]);
    if (v >= 0 && v <= 2000) cfgSettleMs = (uint16_t)v;
    Serial.print(F("settle=")); Serial.print(cfgSettleMs); Serial.println(F("ms"));
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'u') {
    // u<N>: pulse width base in μs (50..400)
    int v = atoi(&cmdBuf[1]);
    if (v >= 50 && v <= 400) cfgPulseUs = (uint16_t)v;
    Serial.print(F("pulse=")); Serial.print(cfgPulseUs); Serial.println(F("us"));
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'a') {
    // a<N>: step rampa accel/decel (0..32)
    int v = atoi(&cmdBuf[1]);
    if (v >= 0 && v <= 32) cfgAccelSteps = (uint8_t)v;
    Serial.print(F("accel=")); Serial.println(cfgAccelSteps);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'g') {
    // g<N>: extra delay rampa in μs (0..500)
    int v = atoi(&cmdBuf[1]);
    if (v >= 0 && v <= 500) cfgRampExtraUs = (uint16_t)v;
    Serial.print(F("gentle=")); Serial.print(cfgRampExtraUs); Serial.println(F("us"));
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 2 && cmdBuf[0] == 'k') {
    // k<S>: preset profilo movimento (0..3)
    int v = atoi(&cmdBuf[1]);
    if (v == 0)      { cfgPulseUs = 50;  cfgAccelSteps = 0;  cfgRampExtraUs = 0;   }
    else if (v == 1) { cfgPulseUs = 80;  cfgAccelSteps = 4;  cfgRampExtraUs = 50;  }
    else if (v == 2) { cfgPulseUs = 120; cfgAccelSteps = 8;  cfgRampExtraUs = 120; }
    else if (v == 3) { cfgPulseUs = 180; cfgAccelSteps = 16; cfgRampExtraUs = 250; }
    Serial.print(F("profile=")); Serial.print(v);
    Serial.print(F(" pulse=")); Serial.print(cfgPulseUs);
    Serial.print(F(" accel=")); Serial.print(cfgAccelSteps);
    Serial.print(F(" gentle=")); Serial.println(cfgRampExtraUs);
    Serial.println(F("*cfg"));
  } else if (cmdLen >= 5 && cmdBuf[0] == 't' && (cmdBuf[1] >= '0' && cmdBuf[1] <= '9')) {
    // tFFFF:DDDD:S[:VV] (es. "t440:500:+:75") = suona FFFF Hz per DDDD ms
    // in direzione S, con duty cycle VV% (default 50, controlla il volume)
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
        for (uint32_t s = 0; s < totalSteps; s++) {
          digitalWrite(PIN_PUL, HIGH);
          uint32_t h = highUs;
          while (h > 10000) { delayMicroseconds(10000); h -= 10000; }
          if (h) delayMicroseconds(h);
          digitalWrite(PIN_PUL, LOW);
          h = lowUs;
          while (h > 10000) { delayMicroseconds(10000); h -= 10000; }
          if (h) delayMicroseconds(h);
        }
      }
      while (Serial.available() > 0) Serial.read();
      Serial.println(F("*tend"));
    }
  } else if (cmdLen >= 2 && cmdBuf[0] == 'S') {
    // S±NNNNN — scan autonomo: segno = direzione (come p/q), NNNNN = unità
    int8_t dir = (cmdBuf[1] == '+') ? +1 : -1;
    int value = atoi(&cmdBuf[(cmdBuf[1] == '+' || cmdBuf[1] == '-') ? 2 : 1]);
    if (value > 0 && value <= 20000) {
      autonomousScan(dir, (uint16_t)value);
    }
  } else if (cmdLen >= 4 && cmdBuf[0] == '$') {
    // $+NNN o $-NNN
    int sign  = (cmdBuf[1] == '+') ? +1 : -1;
    int value = atoi(&cmdBuf[2]);
    if (value > 0) {
      bool completed = stepperMove(sign * value);
      // Drain del buffer seriale: durante il movimento il PC potrebbe aver
      // accodato altri comandi (polling encoder, ecc.) che ora sono accumulati.
      // Li scartiamo per non andare fuori sequenza nello stato del parser.
      while (Serial.available() > 0) Serial.read();
      if (completed) Serial.println(F("*mv"));   // fine movimento (se interrotto ha già emesso *mabort)
    }
  }
  cmdLen = 0;
}

// =============================================================
//  Setup
// =============================================================
void setup() {
  pinMode(PIN_PUL, OUTPUT);
  pinMode(PIN_DIR, OUTPUT);
  pinMode(PIN_ENA, OUTPUT);
  digitalWrite(PIN_ENA, LOW);                         // motore disabilitato a riposo

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

  Serial.begin(9600);
  Serial.println(F("CAMMES Uno ready"));
}

// =============================================================
//  Loop
// =============================================================
void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') {
      if (cmdLen > 0) executeCommand();
    } else if (cmdLen < sizeof(cmdBuf) - 1) {
      cmdBuf[cmdLen++] = c;
      // comandi a singolo carattere si eseguono immediatamente
      if (cmdLen == 1 && (c == 'p' || c == 'q' || c == 'm' || c == 'd' || c == '?' || c == '!' || c == '@' || c == 'f' || c == 'l' || c == 'v')) {
        executeCommand();
      }
    } else {
      // overflow → flush
      cmdLen = 0;
    }
  }
}
