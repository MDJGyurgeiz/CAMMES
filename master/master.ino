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
//    @          stampa configurazione corrente "samp=N step=NN*cfg\r\n"
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
uint8_t cfgSamples       = 1;   // campioni per misura (1..9)
uint8_t cfgStepsPerUnit  = DEFAULT_STEPS_PER_UNIT;  // micropassi per p/q

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
//  Stepper
// =============================================================
void stepperPulse() {
  digitalWrite(PIN_PUL, HIGH);
  delayMicroseconds(STEP_PULSE_US);
  digitalWrite(PIN_PUL, LOW);
  delayMicroseconds(STEP_PULSE_US);
}

void stepperMove(int16_t units) {
  // 'units' = unità di scansione (default 1 unità = 1°). Effettivi micropassi = units * cfgStepsPerUnit
  if (units == 0) return;
  digitalWrite(PIN_ENA, HIGH);
  digitalWrite(PIN_DIR, units > 0 ? HIGH : LOW);
  uint16_t steps = (uint16_t)abs(units) * cfgStepsPerUnit;
  for (uint16_t s = 0; s < steps; s++) stepperPulse();
}

// =============================================================
//  Lettura singolo frame: aspetta finestra di settle e restituisce mm
// =============================================================
float readSensorMmOnce() {
  uint32_t deadline = millis() + SENSOR_SETTLE_MS;
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
// Senza questa distinzione, il polling 'm' di un altro client (es. tab
// aperta in idle) saturava il flusso di *se e faceva scattare incrementi
// spuri nel loop di scansione.
void emitMeasureScan(float mm) {
  if (isnan(mm)) Serial.println(F("NaN"));
  else           Serial.println(mm, 2);
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
//  Parser comandi seriali
// =============================================================
void executeCommand() {
  cmdBuf[cmdLen] = '\0';
  if (cmdLen == 1) {
    char c = cmdBuf[0];
    if (c == 'p')      { stepperMove(-1); emitMeasureScan(readSensorMm()); }
    else if (c == 'q') { stepperMove(+1); emitMeasureScan(readSensorMm()); }
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
    else if (c == '!') {
      noInterrupts();
      encoderCount = 0;
      interrupts();
      Serial.println(F("*zero"));
    }
    else if (c == '@') {
      Serial.print(F("samp=")); Serial.print(cfgSamples);
      Serial.print(F(" step="));  Serial.println(cfgStepsPerUnit);
      Serial.println(F("*cfg"));
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
  } else if (cmdLen >= 4 && cmdBuf[0] == '$') {
    // $+NNN o $-NNN
    int sign  = (cmdBuf[1] == '+') ? +1 : -1;
    int value = atoi(&cmdBuf[2]);
    if (value > 0) {
      stepperMove(sign * value);
      // Drain del buffer seriale: durante il movimento il PC potrebbe aver
      // accodato altri comandi (polling encoder, ecc.) che ora sono accumulati.
      // Li scartiamo per non andare fuori sequenza nello stato del parser.
      while (Serial.available() > 0) Serial.read();
      Serial.println(F("*mv"));   // notifica fine movimento al PC
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
      if (cmdLen == 1 && (c == 'p' || c == 'q' || c == 'm' || c == 'd' || c == '?' || c == '!' || c == '@')) {
        executeCommand();
      }
    } else {
      // overflow → flush
      cmdLen = 0;
    }
  }
}
