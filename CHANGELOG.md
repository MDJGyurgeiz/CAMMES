# CAMMES - Log Lavorazioni Progetto

## Panoramica Sistema
Sistema di misura profili alberi a camme per motori.
- **Arduino Uno** (`micrometro_SPI/`) - Lettura micrometro digitale via interrupt, invio SPI [legacy: in via di unificazione su singolo Uno]
- **Arduino Uno** (`master/`) - Controllo motore stepper (32 step/grado), coordinamento misure
- **Server** (`cammes/cammes_server.js`) - Server unificato HTTP + WebSocket + Seriale
- **Frontend** (`cammes/`) - UI browser con gauge, grafici Chart.js, controlli rotazione

---

## Sessione 1 - 2026-03-03

### Analisi iniziale
- Analizzato intero codebase: struttura progetto, dipendenze, architettura
- Identificato stack: HTML5/JS frontend, exe server nativo, WebSocket porta 8080
- Mappate 3 pagine UI: alzata.html, polare.html, grafici.html

### Configurazione dev server
- Creato `.claude/launch.json` con 2 configurazioni:
  - `cammes-server` (exe, porta 8080)
  - `frontend` (node serve.js, porta 3000)
- Creato `cammes/serve.js` - server HTTP statico Node.js per servire i file HTML

### Redesign UI - Dark Theme Moderno
- **Creato `cammes/style.css`** - Design system completo:
  - Variabili CSS custom (colori, spacing, tipografia)
  - Sfondo: #0f0f1a, Card: #1a1a2e, Accento: #00d4ff (cyan)
  - Layout CSS Grid/Flexbox (sostituisce position:absolute)
  - Pulsanti HTML stilizzati (sostituiscono immagini PNG)
  - Toggle switch, input, card con border-radius e shadow
  - Tabella dati, file input, utility classes

- **Riscritto `cammes/alzata.html`**:
  - Header con navigazione tra pagine
  - Card gauge (280px, colori dark theme, lancetta cyan)
  - Card grafico lineare (grid lines #2a2a4a, label #8888aa)
  - Card controlli (START verde, PAUSA rosso, RESET grigio)
  - Card rotazione manuale (-, gradi, +, Ruota, Zero virtuale, toggle senso)
  - Aggiunto gaugemicrom.draw() per rendering iniziale
  - Logica JS completamente preservata

- **Riscritto `cammes/polare.html`**:
  - Stessa struttura di alzata.html
  - Polar chart con scale trasparenti e gridlines dark
  - Campo "diametro albero a riposo" nella card gauge
  - Logica polare (raggio + conversione cos/sin) preservata

- **Riscritto `cammes/grafici.html`**:
  - Grid layout: chart lineare (sinistra) + tabella dati (destra)
  - Tabella con color-dot per i 4 grafici (rosso, blu, verde, grigio)
  - 4 polar chart in griglia 4 colonne
  - File input per alzata (_alz) e polare (_pol)
  - Scale polari: backdropColor transparent, gridLines #2a2a4a
  - grafico4 cambiato da nero a grigio chiaro (visibile su dark)

### Integrazione file Arduino
- Copiati `master/master.ino` e `micrometro_SPI/micrometro_SPI.ino` nel progetto

### Analisi completa del sistema
- Documentato flusso dati end-to-end:
  Sensore -> Arduino Uno (SPI #XX.XX#) -> Arduino Mega (Serial misura + *se) -> Server (WebSocket) -> Browser
- Identificato protocollo comandi: p (1 grado), $+XXX/$-XXX (multi-grado)
- Motore: 32 micropassi/grado, 900ms attesa lettura sensore

### Problemi identificati (da implementare)
1. CRITICO: Comando 'q' (antiorario) non gestito in master.ino
2. CRITICO: Nessuna validazione misura SPI (dati corrotti passano)
3. CRITICO: Buffer SPI senza reset su overflow
4. MEDIO: Server exe non modificabile - proposto sostituzione Node.js
5. MEDIO: Nessun indicatore connessione WebSocket nel frontend
6. MEDIO: Manca export CSV diretto dal browser
7. BASSO: Barra progresso scansione 360 gradi
8. BASSO: Timing motore fisso 900ms ottimizzabile

---

## Sessione 2 - 2026-03-03

### Analisi file Excel `camme-analisi_rev8.5.xlsm`
- Estratto codice VBA completo (4 CommandButton + formule foglio)
- Analisi meccanica/matematica completa:
  - Conversione camma 360 gradi -> albero motore 720 gradi: CORRETTA
  - Sottrazione gioco valvola con clamp a 0: CORRETTA
  - Interpolazione lineare per risoluzione intermedia: CORRETTA
  - Calcolo durata (gradi sopra soglia gioco): STANDARD
  - Formula LSA = (angolo_intake + angolo_exhaust) / 2: CORRETTA
  - Formule timing (BTC, ABC, BBC, ATC): STANDARD SETTORE
  - Overlap = intake_open_BTC + exhaust_close_ATC: CORRETTO

### Nuova pagina `cammes/analisi.html`
- **Creata pagina completa** di analisi camme nel browser (sostituisce l'Excel)
- Grafico overlay 720 gradi: aspirazione (cyan) + scarico (rosso) sovrapposti
- Pannello parametri:
  - Sezione aspirazione (bordo cyan): file input, angolo lobo, gioco valvola
  - Sezione scarico (bordo rosso): file input, angolo lobo, gioco valvola
  - Parametro anticipo (advance)
- Tabella risultati con sezioni colorate:
  - Durate aspirazione/scarico
  - Angoli: LSA, centri aspirazione/scarico
  - Tempi apertura/chiusura (BTC, ABC, BBC, ATC)
  - Incrocio (overlap) e alzata al PMS
- Diagramma circolare di fasatura (doughnut Chart.js)
- Algoritmo cam-to-crank testato con file reale (305_asp_alz.scr):
  - Max: 8.04mm (8.54 - 0.50 gioco), Durata: 225 gradi

### Navigazione aggiornata
- Aggiunto link "Analisi" alla navigazione di alzata.html, polare.html, grafici.html
- Ora 4 pagine collegate: Alzata | Polare | Grafici | Analisi

### Fix permessi Claude
- Aggiunti permessi `Edit` e `Write` a `.claude/settings.local.json`
- Le modifiche ai file non richiedono piu conferma manuale

### Piano Fase 2 - Server unificato (prossima sessione)
- Creare `cammes_server.js` (Node.js) che unifica:
  - Server HTTP statico (porta 3000)
  - WebSocket bridge seriale (porta 8080)
  - Salvataggio file
- Compilare con `pkg` in singolo `.exe` (~50MB)
- Eliminare dipendenza da Node.js installato sul PC

---

## Sessione 3 - 2026-03-03

### Server Unificato `cammes_server.js`
- **Creato `cammes/cammes_server.js`** - Server Node.js unico che sostituisce `cammes_server.exe` + `serve.js`:
  1. **HTTP statico** (porta 3000) - Serve tutti i file frontend dalla cartella `cammes/`
  2. **WebSocket** (porta 8080) - Bridge bidirezionale browser ↔ Arduino
  3. **Comunicazione seriale** - Auto-detect porta COM, 9600 baud, compatibile Arduino Uno/Mega
  4. **Salvataggio file** - Intercetta messaggi `*filename*_pline`, salva in `prove/` come `.scr`
  5. **Apertura automatica browser** - Lancia Chrome su `http://localhost:3000` all'avvio
- Supporta argomenti CLI: `--port`, `--ws-port`, `--com COMx`, `--no-browser`
- Compatibile con serialport legacy (v7-v8) e moderno (v10+)
- Modalita' demo quando Arduino non collegato (server HTTP+WS funziona comunque)
- Log con timestamp per debug: `[HH:MM:SS] [TAG] messaggio`

### Package.json e dipendenze
- **Creato `cammes/package.json`**:
  - Dipendenze: `ws` (WebSocket), `serialport` (comunicazione Arduino)
  - Script: `start`, `start:no-browser`, `build` (compilazione pkg)
  - Configurazione `pkg` con assets (HTML, CSS, JS, immagini) per compilazione in .exe
- Installate dipendenze npm nella cartella `cammes/`

### Aggiornamento launch.json
- Sostituita configurazione a 2 server con configurazione singola:
  - Prima: `cammes-server` (exe:8080) + `frontend` (node:3000) — 2 processi
  - Ora: `cammes` (node cammes_server.js) — 1 solo processo che gestisce tutto

### Aggiornamento Node.js
- Node.js aggiornato da v10.15.1 a v24.14.0 via winget
- Reinstallate dipendenze: `ws` v8.19.0 + `serialport` v12.0.0 (moderno, con prebuilds)

### Compilazione `cammes.exe` standalone
- Compilato con `pkg` (v5.8.1) → `cammes.exe` 39MB (compresso GZip)
- Target: `node18-win-x64` (Node.js 18 runtime embeddato)
- Assets embeddati nel binario: tutte le pagine HTML, CSS, JS, immagini
- Moduli nativi (serialport) NON embeddabili → vanno in `node_modules/` accanto all'exe
- Fix `process.pkg` detection: il server cerca `node_modules` nella cartella reale dell'exe
- Fix `PROVE_DIR`: i file salvati vanno nella cartella reale, non nel snapshot virtuale

### Cartella distribuzione `CAMMES_DIST/`
Creata cartella pronta per la distribuzione:
```
CAMMES_DIST/
  cammes.exe          (39MB - server + frontend tutto incluso)
  node_modules/       (serialport native bindings per comunicazione Arduino)
```
- L'utente lancia solo `cammes.exe` → si apre Chrome su http://localhost:3000
- Non serve installare Node.js sul PC di destinazione
- Il `node_modules` e' necessario solo per la comunicazione seriale Arduino

### Test completati
- ✅ Server HTTP serve tutte e 4 le pagine dall'exe standalone
- ✅ WebSocket avviato correttamente
- ✅ Serialport v12 caricato da `node_modules/` accanto all'exe
- ✅ Auto-detect porte COM (nessun Arduino = modalita' demo)
- ✅ Nessun errore nella console browser
- ✅ Navigazione tra pagine funzionante
- ✅ Test con curl: tutti endpoint restituiscono HTTP 200

---

## Sessione 4 - 2026-05-02 - Pulizia e allineamento (Fase A)

### Audit progetto
- Riesame completo dopo ~2 mesi di pausa
- Confrontati README, CHANGELOG e sorgenti: rilevate incoerenze
- Verificati direttamente master.ino e micrometro_SPI.ino

### Correzioni documentazione
- **README.md**: pin stepper corretti (PUL=7, DIR=6, ENA=5; era errato "2/3/5")
- **README.md**: porta HTTP corretta (3000; era errato "8080" che è solo WS)
- **README.md**: aggiunta nota su transizione architettura 2-Uno → 1-Uno
- **CHANGELOG.md**: panoramica sistema allineata (entrambi gli sketch su Uno, non Mega)

### Decisione architetturale (concordata con utente)
- L'architettura attuale a 2 Arduino Uno verrà unificata su un singolo Uno
- Trigger: finalizzazione stepper esterno (in lavorazione 2026-05-02)
- I due sketch master.ino + micrometro_SPI.ino verranno fusi
- Cartella `micrometro_SPI/` diventerà legacy

### Pulizia repo
- Rimossi artefatti binari dal tree (cammes.exe, cammes_server.exe, CAMMES.apk, node-v10.15.1-x64.msi) → spostati in GitHub Release v1.0.0
- Rimossa cartella `cammes/charts/` (sorgenti Chart.js completi non necessari a runtime)
- Rimosso `cammes/serve.js` (legacy, sostituito da cammes_server.js in sessione 3)
- Aggiunto `.gitignore` per escludere binari, node_modules, file di build

### Verifiche post-Fase-A
- Comando 'q' (rotazione antioraria): VERIFICATO già implementato in master.ino:60-64 (non serve fix)
- Reset buffer SPI overflow: VERIFICATO già implementato in master.ino:131-134 (non serve fix)
- Validazione misura SPI: ANCORA DEBOLE (substring != "" non garantisce cifre); fix posticipato alla Fase B (unificazione firmware)

---

## Sessione 5 - 2026-05-03 - Unificazione firmware su 1 Arduino Uno + encoder LDP3806

### Hardware
- Architettura 2-Uno → **1-Uno** completata
- Aggiunto encoder rotativo **LDP3806-360BM-G5-24C** (360 PPR, NPN open-collector, 5-24V)
  - Montato 1:1 sull'albero camme
  - Pull-up 4.7 kΩ a 5V su canali A e B
  - Decoding x4 → 1440 conteggi/giro = 0.25°/conteggio
- Driver stepper esterno opto-isolato (6 morsetti) in configurazione common-anode
  - 5V Arduino su PUL+/DIR+/ENA+
  - GND alimentazione 36V NON in comune con GND Arduino (corretto, isolamento opto)

### Pinout finale Arduino Uno
| Pin | Funzione |
|-----|----------|
| D2 (INT0) | LM339N pin 2 — clock impulsi sensore Neoteck |
| D5 | LM339N pin 14 — DATA bit sensore |
| D3 (INT1) | encoder canale A |
| D8 (PCINT0) | encoder canale B |
| D7 | stepper PUL− |
| D6 | stepper DIR− |
| D4 | stepper ENA− (era D5 nel vecchio sketch, collideva col DATA sensore) |
| D0/D1 | UART USB-PC |

### Firmware (`master/master.ino`)
- Riscritto da zero, sostituisce vecchi master.ino + micrometro_SPI.ino
- Lettura sensore Neoteck integrata (interrupt FALLING su D2, bit-banging 16 bit utili)
- Reset frame sensore su timeout impulsi (50 ms) per robustezza
- Encoder x4 con LUT di transizione, INT1 su A + PCINT0 su B
- Stepper con stessa cinematica del firmware originale (32 step/grado, 50 µs pulse)
- Sostituito uso di `String` Arduino con `char[]` (riduce frammentazione heap)
- Comando UART terminato da `\r`/`\n` (no più rottura su comandi multi-byte)
- Validazione misura: timeout in lettura, ritorno NaN se frame non completo nella finestra
- **Nuovi comandi seriali**:
  - `?` → query encoder, risposta `encoder=NNN deg=XX.XX *pos`
  - `!` → reset zero encoder, risposta `*zero`
- Comandi storici invariati: `p`, `q`, `$+NNN`, `$-NNN`, output `XX.XX\n*se`

### Pulizia struttura progetto
- Spostato `micrometro_SPI/` in `legacy/micrometro_SPI/` (sketch non più in uso)
- Aggiunto `legacy/README.md` con note storiche
- README principale aggiornato:
  - Nota architettura ora dichiara "completata"
  - Diagramma architettura aggiornato (1 Uno)
  - Sezione Hardware con pinout completo + driver opto + encoder
  - Protocollo seriale esteso con `?`, `!`, `*pos`, `*zero`

### Da fare nelle prossime sessioni
- [ ] Test su hardware reale: caricare master.ino, verificare scansione 360°
- [ ] Eventuale tuning costanti (settle time, pulse width) in base a comportamento reale
- [ ] Sync UI: aggiungere nelle pagine alzata.html / polare.html un indicatore di posizione encoder (richiede comando `?` periodico via WebSocket)
- [ ] Sanity check stepper vs encoder (allarme se conteggi divergono)

---

## TODO - Prossime implementazioni
- [x] ~~Fix comando 'q' in master.ino~~ (verificato già implementato sessione 4)
- [ ] Validazione misura SPI: usare isDigit() invece di substring != "" (Fase B)
- [x] ~~Reset buffer SPI overflow in master.ino~~ (verificato già implementato sessione 4)
- [x] ~~Analisi file Excel camme-analisi~~ (completata sessione 2)
- [x] ~~Pagina analisi.html~~ (completata sessione 2)
- [x] ~~Server Node.js unificato (cammes_server.js)~~ (completata sessione 3)
- [x] ~~Compilazione cammes.exe con pkg~~ (completata sessione 3)
- [x] ~~**Fase B**: unificare master.ino + micrometro_SPI.ino su singolo Arduino Uno~~ (completato sessione 5)
- [x] ~~**Fase B**: terminatore comando UART (\n)~~ (completato sessione 5)
- [x] ~~**Fase B**: sostituire String Arduino con char[]~~ (completato sessione 5)
- [ ] **Fase C**: indicatore connessione WebSocket nell'UI
- [ ] **Fase C**: export CSV dal browser
- [ ] **Fase C**: barra progresso scansione 360°
- [ ] **Fase C**: bump versionCode/versionName Android
- [ ] **Fase D**: aprire issue GitHub per ogni TODO; aggiungere ESLint; tag v1.0.0
- [ ] Ottimizzazione timing motore (delay 900 ms → detection misura stabile)
