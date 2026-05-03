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
//    p          rotazione 1° antiorario   (32 step)
//    q          rotazione 1° orario       (32 step)
//    $+NNN      rotazione multi-grado avanti (NNN gradi)
//    $-NNN      rotazione multi-grado indietro
//    ?          query: stampa "encoder=NNN deg=XX.XX*pos\r\n"
//    !          reset zero encoder
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
const uint8_t  STEPS_PER_DEGREE     = 32;          // 32 step/grado = 11520 step/giro
const uint16_t STEP_PULSE_US        = 50;
const uint16_t SENSOR_SETTLE_MS     = 900;         // attesa per lettura stabile (come da firmware originale)
const uint16_t SENSOR_TIMEOUT_MS    = 50;          // se passa più di X ms tra impulsi → reset frame sensore
const uint8_t  SENSOR_BIT_FIRST     = 2;           // bit utili: dal 2° impulso al 17°
const uint8_t  SENSOR_BIT_LAST      = 17;
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

void stepperMove(int16_t degrees) {
  if (degrees == 0) return;
  digitalWrite(PIN_ENA, HIGH);                       // attiva driver
  digitalWrite(PIN_DIR, degrees > 0 ? HIGH : LOW);
  uint16_t steps = (uint16_t)abs(degrees) * STEPS_PER_DEGREE;
  for (uint16_t s = 0; s < steps; s++) stepperPulse();
}

// =============================================================
//  Lettura misura: aspetta finestra di settle e restituisce mm
// =============================================================
float readSensorMm() {
  uint32_t deadline = millis() + SENSOR_SETTLE_MS;
  // svuota stato per accettare un frame nuovo nella finestra
  noInterrupts();
  sensorReady = false;
  interrupts();
  // attendi un frame (o timeout)
  while (millis() < deadline) {
    if (sensorReady) break;
  }
  // legge in modo atomico
  noInterrupts();
  uint16_t raw = sensorRaw;
  bool ok      = sensorReady;
  interrupts();
  if (!ok) return NAN;                               // frame non arrivato in finestra
  return (float)raw / SENSOR_DIVIDER;
}

// =============================================================
//  Helper output seriale
// =============================================================
void emitMeasure(float mm) {
  if (isnan(mm)) Serial.println(F("NaN"));
  else           Serial.println(mm, 2);
  Serial.println(F("*se"));
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
    if (c == 'p')      { stepperMove(-1); emitMeasure(readSensorMm()); }
    else if (c == 'q') { stepperMove(+1); emitMeasure(readSensorMm()); }
    else if (c == '?') { emitEncoderQuery(); }
    else if (c == '!') {
      noInterrupts();
      encoderCount = 0;
      interrupts();
      Serial.println(F("*zero"));
    }
  } else if (cmdLen >= 4 && cmdBuf[0] == '$') {
    // $+NNN o $-NNN
    int sign  = (cmdBuf[1] == '+') ? +1 : -1;
    int value = atoi(&cmdBuf[2]);
    if (value > 0) stepperMove(sign * value);
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
      if (cmdLen == 1 && (c == 'p' || c == 'q' || c == '?' || c == '!')) {
        executeCommand();
      }
    } else {
      // overflow → flush
      cmdLen = 0;
    }
  }
}
