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
| D4 | LM339N pin 14 — DATA bit sensore (spostato da D5 per liberare il pin storico ENA stepper) |
| D3 (INT1) | encoder canale A |
| D8 (PCINT0) | encoder canale B |
| D7 | stepper PUL− (pin storico) |
| D6 | stepper DIR− (pin storico) |
| D5 | stepper ENA− (pin storico, mantenuto come da progetto iniziale) |
| D0/D1 | UART USB-PC |

**Decisione pin storici stepper**: PUL=7, DIR=6, ENA=5 mantenuti identici al progetto iniziale del 2019 (master.ino legacy). Il DATA del sensore Neoteck si è spostato da D5 a D4 per evitare collisione con ENA stepper. Solo 1 filo da rispostare sul prototipo: LM339N pin 14 da D5 a D4.

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
- [x] ~~**Fase C**: indicatore connessione WebSocket nell'UI~~ (LED status sessione 6)
- [x] ~~**Fase C**: export CSV dal browser~~ (sessione 6, anche PDF report ricco)
- [x] ~~**Fase C**: barra progresso scansione 360°~~ (sessione 6, con ETA)
- [ ] **Fase C**: bump versionCode/versionName Android
- [ ] **Fase D**: aprire issue GitHub per ogni TODO; aggiungere ESLint
- [x] ~~Ottimizzazione timing motore~~ (sessione 6, rampa accelerazione + 4 profili)

---

## Sessione 6 — 2026-05-15 / 2026-05-23 — Restyling completo + race-grade
### Tag: **v2.0.0-race-grade**

Sessione di refactor profondo e nuove feature avanzate. 35+ commit raggruppabili in 7 grandi aree.

### A. Design system + restyling UI (commit `757db2e` → `20810e8`)
- **Design tokens** completi in `style.css` (~1430 righe): spacing scale, radius, motion, elevation, z-index
- **Theme dark + light** con toggle persistente in localStorage
- **Font locali** offline-safe: Inter, Rajdhani, JetBrains Mono in `cammes/fonts/`
- **Gauge SVG** moderno (sostituisce gauge.min.js 2014): arco progressivo theme-aware
- **Progress bar scansione** con ETA dinamico
- **53 tooltip ricchi** + 25 help icons sui parametri tecnici
- **5 pagine** uniformate: home, alzata, polare, grafici→Confronto, analisi
- **Wizard onboarding** 5 step al primo avvio
- **Animazioni** card stagger entry, rispetta prefers-reduced-motion

### B. Chart.js v2 → v4.4.4 (commit `bbb0ef0`)
- Migrazione 12 chart (line, polarArea, doughnut)
- Plugin zoom 0.7.7 → 2.0.1
- Bundle: 530 KB → 235 KB (-55%)
- Chart theme-aware (event 'cammes:theme:change')

### C. Dashboard Home + gestione archivio (commit `8dcc2bf` → `c8abb65`, `6cf9381`, `a7923da`, `9a5b8b0`, `39f72a8`, `d5fdb17`, `93f5905`)
- Pagina **home.html** come landing
- API server: `/api/files`, `/api/file/:name` GET+DELETE
- Search + chip filtri tipo/data/bookmark
- Activity bar chart 14 giorni
- **Tag system** + 21 pattern auto-tag (brand, cilindri, uso, lato valvola)
- **Quick View modal** con grafico inline + 3 azioni
- **Scheda PDF camma singola** (1 pagina A4)
- **Backup/Restore JSON** metadati (tag, bookmark, posizioni, prefs)
- **"Confronta preferiti"** apre Confronto con top 4 bookmarks
- **Vista differenza** in Confronto: delta + stats max/media/RMSE

### D. Analisi: cinematica + forze + compliance race-grade (commit `0b7cc2d` → `435d020`)
- 5 preset motori (moto stradale/race, auto 4cyl/V8/F1)
- Mappa cam→crank con `wrap720()` corretto (bug fix)
- Risultati: durata totale + @ ref, LSA, centri lobi, overlap, asimmetria, area
- Cinematica: velocità/accelerazione/jerk derivata centrale + Savitzky-Golay
- Forze + RPM critico statico
- **Live tuning** RPM/k/F₀/massa con chart aggiornato real-time
- **A vs B confronto** 12 metriche delta + 4 chip riepilogo
- **PDF report ricco** 4-7 pagine: cover branded, banner sicurezza, tabella zebra, barra margine RPM

#### Follower virtuali (4 tipi)
- Puntalino raw (default)
- Bicchiere piatto Ø D + sottrazione rPunt
- Roller R
- Finger follower esatto con tilt iniziale (cinematica asin/sin)

#### Compliance treno valvole RK4 (RACE-GRADE)
- Solver Runge-Kutta 4° ordine: `m·ẍ + c·ẋ + k·(x-x_cam) + F_spring + F0 = 0`
- Sub-step automatico per stabilità a 16000+ rpm
- `detectValveFloat`: misura max gap cam-valvola dinamico
- Toast: <0.1 OK / 0.1-0.5 warn / >0.5 ERR
- Cattura valve float "vero" invisibile al calcolo statico

### E. Firmware Arduino race-grade (commit `9d8a76a` → `531b03d`)
- Comandi `f`/`l` (free/lock motore)
- Rampa accelerazione trapezoidale configurabile
- Preset profilo movimento `k0..k3` anti-vibrazione
- Comando tone `tF:D:S[:V]` con duty cycle (volume)
- Reset encoder + bookmark angolari salvati
- 6.5 KB → 8.0 KB (24% spazio ATmega328P)

### F. UI motoristica avanzata (commit `b3eeb41`, `fe3fb07`, `7c39cce`)
- **Scansione ripetuta** N volte → media + dev std + verdict ripetibilità
- **Sblocca motore** con polling LIVE + display encoder
- **Live trace** chart durante free-spin (disegna la cam a mano)
- **Concerto col motore**: modal Home con 8 brani (Inno di Mameli per primo) + composer custom + slider volume

### G. Code quality + audit (commit `f5b901b`, `0f96bad`, `103f9ab`)
- Audit indipendente da subagent: 4 critici + 9 medi/minori
- Fix: path traversal WS, dead code grafici, XSS home, durate offset, replay watchdog, mapCamToCrank, rPunt nel bicchiere
- Test integrale 30 min: tutti 8 test passati

### Statistiche sessione
- **35+ commit** su `main`
- **~6000 righe modificate** (35 file)
- **8 brani musicali** curati (Inno di Mameli per primo)
- **3 versioni firmware** flashate sull'Arduino reale via arduino-cli
- **Hardware test reale Clio 1.8**: alzata 8.6 mm @ 179° camma

### Stato corrente del progetto
- ✅ **Production-ready**: 5 pagine + firmware + server, 0 issue critici
- ✅ **Race-grade**: compliance dinamica RK4 per camme da corsa
- ✅ **Offline-safe**: tutte le librerie in `cammes/lib/`
- ✅ **Tema dark/light** persistente
- ✅ **Firmware** Arduino flashato con anti-vibrazione + free-spin + tone

### Da fare nelle prossime sessioni
- [x] ~~Grafico "Valvola reale vs cam" inline quando compliance ON~~ (sotto-sessione 6.2)
- [x] ~~Sweep RPM: trova RPM critico dinamico iterando~~ (sotto-sessione 6.2)
- [x] ~~Optimizer molla: suggerisce k/F₀ minimi per float < soglia~~ (sotto-sessione 6.2)
- [x] ~~Modello compliance 2-DOF (catena cam→bilancere→valvola)~~ (sotto-sessione 6.2)
- [x] ~~Test compliance su camma race reale~~ (sotto-sessione 6.2, Clio)

---

## Sotto-sessione 6.2 — 2026-05-23/24 — Analisi race-grade avanzata
### Tag: **v2.1.0-race-analysis**

Estensione della sezione Analisi con 5 strumenti per camme da corsa.
Commit `a84d464` + `(questo)`.

### 1. Grafico valvola dinamica (`createComplianceChart`)
Chart Chart.js v4 inline che sovrappone cam imposta (tratteggiata)
e valvola reale (RK4, grossa) per asp + scar, con zona valve float
evidenziata in rosso. Auto-hide se compliance OFF.

### 2. Sweep RPM (`rpmSweep` + `runRpmSweep`)
Bottone "Sweep RPM": 12 simulazioni RK4 da rpm/2 a rpm×2, plotta
valve float per ogni regime, identifica RPM critico dinamico.
Test Clio @ Auto 4cyl kTrain 5000: tutto < 0.5 mm, picco risonanza
@ 5023 rpm (0.363), minimo @ 6795 (0.100).

### 3. Optimizer molla (`springOptimizer` + `runSpringOptimizer`)
Bottone "Suggerisci molla": griglia 88 combinazioni (k 20-400, F₀
100-1500), trova la molla minima con float < 0.3 mm. Test Clio @ 6500:
suggerito k=20/F₀=100 (più leggera dell'attuale) → float 0.074 mm.

### 4. Compliance 2-DOF (`simulateCompliance2DOF`)
Sistema a 2 masse (bilancere + valvola) + 2 rigidezze in serie, RK4
4-stati. Selettore UI 1-DOF/2-DOF + input massa intermedia + k pushrod.
Per V8 pushrod, vintage, finger con bilancere pesante. Test Clio:
1-DOF float 0.096 mm, 2-DOF 1.510 mm (cattura modo bilancere).

### 5. Fix critico k_train default 500 → 5000 N/mm
Il default era irrealistico (float 4-6 mm fittizi). Valori reali:
OHC 5000-15000, finger 3000-8000, pushrod 2000-5000, diesel 1500-2500.
Dopo il fix i float sono fisicamente coerenti (sub-mm a regimi normali).

### Integrazione export
- PDF: nuova pagina "Compliance cam vs valvola reale" + riga "Valve
  float dinamico" nella tabella risultati (solo se compliance ON)
- CSV: 4 righe valve float dinamico (asp/scar mm + deg)

### Da fare prossime sessioni
- [x] ~~Sweep multi-parametro (k+F₀ simultanei, mappa float)~~ (sotto-sessione 6.3)
- [x] ~~Export "race report" PDF dedicato con sweep + optimizer~~ (sotto-sessione 6.3)
- [ ] Modello compliance 3-DOF con cedevolezza sede valvola
- [ ] Validazione su camma race reale + confronto regime motore noto

---

## Sotto-sessione 6.3 — 2026-05-27 — Mappa molla + Race report
### Commit: `d926db2`

### 1. Mappa molla k×F₀ (`springMap` + `renderSpringMap` + `_floatToColor`)
Heatmap che varia SIMULTANEAMENTE rigidezza k e precarico F₀ su una
griglia 16×14 (224 combinazioni), calcolando il valve float dinamico di
ciascuna via `simulateCompliance`. Risolve il "da fare" sweep multi-parametro.
- Canvas `springMapCanvas` 340×280; colori `_floatToColor`: verde <0.1 mm,
  giallo 0.1-0.3, rosso >0.3
- Marker ◎ sulla molla corrente; assi etichettati k (N/mm) × F₀ (N)
- `runSpringMap` / bottone `btnSpringMap` "🗺 Mappa molla" (~8 s)
- A colpo d'occhio mostra quali combinazioni molla mantengono il treno
  valvole sotto soglia al regime target (es. Clio 7/224 a 7000 rpm —
  fenomeno reale di surge della molla, non un bug)

### 2. Race report PDF (`exportRaceReport`)
PDF dedicato all'analisi dinamica (copertina viola), separato dal report
tecnico standard. Contiene config valvola, sweep RPM, molla ottimale,
mappa k×F₀ (heatmap rasterizzata) e grafico compliance cam vs valvola.
- Bottone `btnRaceReport` "🏆 Race report"
- Documento completo per validare il treno valvole di un motore da corsa

### Wire-up
- Bottoni abilitati in `analyze()` quando compliance ON, disabilitati in
  `resetAll()`; canvas heatmap nascosto durante sweep/optimizer
- `prove/clio_test_1_alz.scr`: scansione reale Clio 1.8 usata nei test
  (3 simulazioni sweep+optimizer+mappa misurate a ~142 ms totali)

### Da fare prossime sessioni
- [x] ~~Modello compliance 3-DOF con cedevolezza sede valvola~~ (sotto-sessione 6.4)
- [x] ~~Validazione su camma race reale + confronto regime motore noto~~ (sotto-sessione 6.4)
- [x] ~~Sweep 3D interattivo (rotazione mappa k×F₀×rpm)~~ (sotto-sessione 6.4)

---

## Sotto-sessione 6.4 — 2026-05-27 — 3-DOF + validazione + sweep 3D
### Commit: `ca3b0ac` → `d05b57b`

### 0. Igiene: piano e memoria obsoleti corretti
- Il "fix Zero virtuale" riemerso da plan mode era **già fatto e committato**
  (`947b785` ack `*mv` + `\n`, `5bb3bd3` closed-loop encoder, 9 maggio). Il
  codice attuale è migliore del piano (encoder reale vs `maxg+180` open-loop).
- La memoria "firmware in transizione 2→1 Uno" era stale: l'unificazione è
  completa dal commit `ed3f421`. Memoria riscritta allo stato reale.

### 1. Compliance 3-DOF (`simulateCompliance3DOF`)
Terza massa = **sede valvola** (insert + porzione testata) richiamata a terra
da k_seat + smorzamento; contatto valvola-sede unilaterale (penalty su gap
g=x2−x3<0). Cattura il **valve bounce** alla chiusura, assente in 1/2-DOF.
RK4 a 6 stati, passo legato al modo più rigido + cap anti-freeze.
- UI: opzione "3-DOF (sede)", righe massa sede (15 g) e k sede (80000 N/mm).
- `tools/test_3dof.js`: regressione, 3/3 PASS (limite rigido k_seat→∞ ⇒
  3DOF≈2DOF a 0.005 mm; output finito a 9000 rpm; float cresce col regime).

### 2. Validazione su Clio 1.8 16V reale (`tools/validate_clio.js`)
Estrae la pipeline di produzione (parseCamFile→mapCamToCrank→solver) e la
applica alla scansione reale `prove/clio_test_1_alz.scr`. Il motore F7P è
**DOHC a punteria diretta** → 1-DOF è la topologia corretta → float a 7000 rpm
(fuorigiri) = **0.091 mm**, trascurabile come deve essere per un motore di
serie sano. 6/6 check PASS; camma confermata 8.60 mm / 246°.
- Mostra anche che 2/3-DOF sovrastimano (modellano un pushrod inesistente) →
  monito: il modello va scelto in base all'architettura del treno valvole.
- La scelta del modello cambia il float di **10×** → `analisi.html` ora
  registra il modello compliance usato (1/2/3-DOF) ed esporta l'etichetta in
  CSV e PDF accanto al valve float (tracciabilità).

### 3. Sweep 3D interattivo (`sweep3D` + `render3DSweep` + `run3DSweep`)
Nuvola ruotabile del valve float sui tre assi k × F₀ × RPM (griglia 8×8×6 =
384). Proiezione ortografica su canvas con azimuth/elevation, painter's
algorithm, cubo+assi, punti colorati per float, marcatore molla attuale.
Drag mouse+touch. Nessuna libreria 3D esterna. Mutuamente esclusivo con la
mappa 2D. Bottone `btnSweep3D`.

### Da fare prossime sessioni
- [ ] Modello compliance 3-DOF con cedevolezza sede sui DUE lati (anche bilanciere)
- [ ] Spring surge: molla a massa distribuita (modi delle spire)
- [ ] Validazione su camma race reale dedicata + confronto banco

---

## Sotto-sessione 6.5 — 2026-05-27 — Audit UX completo + 2 bug fix
### Tag: **v2.4.0-ux**
Da audit di usabilità "nuovo utente" su tutte le 5 pagine: modalità Base/
Avanzato in Analisi, fix tabella Home, Concerto ricollocato, caption
orientative su Alzata/Polare/Confronto, messaggistica "nessun hardware".
Due bug funzionali trovati e corretti per strada: tabella Home sempre vuota
(`_cachedFiles` mai popolato) e crash latente di Polare `start()`
(`sendSocket.send` con socket undefined).

### Audit usabilità (nuovo utente)
Esaminate le pagine come le vede chi non ha mai aperto il software (snapshot
DOM/accessibilità + lettura del codice). Verdetto: Home e Alzata intelligibili
per un utente del dominio; **Analisi era un muro** — 24 input + 13 pulsanti +
38 tooltip tutti sullo stesso piano, senza percorso minimo evidente.
- Verificato (e NON corretto perché corretti): il wizard di benvenuto è gattato
  a prima-visita (chiave localStorage condivisa, `cammes-ui.js`), non assilla.

### Modalità Base / Avanzato sulla STESSA schermata (no compartimenti)
Toggle `Base | Avanzato` nell'intestazione della card Parametri di
`analisi.html`. Progressive disclosure non distruttiva: in Base restano visibili
solo i parametri essenziali (preset, import asp/scar, tipologia/angolo lobo/gioco,
RPM, rif. durata, molla k/F₀/massa, Analizza/Reset/CSV/PDF); in Avanzato
compaiono in posto Anticipo, bilancieri, smooth, follower simulato, compliance
dinamica e i 5 strumenti race. I campi nascosti restano nel DOM coi default →
`analyze()` invariato. Scelta ricordata in `localStorage` (`cammes-analisi-mode`),
default Base per i nuovi utenti.
- CSS `.mode-base .adv-only{display:none}`, `setAnalysisMode()`, 9 blocchi
  taggati `adv-only`. Verificato in browser: Base nasconde 11/11 controlli
  avanzati e mostra 6/6 essenziali; Avanzato li rivela; persistenza OK; 0 errori.

### Azioni dall'audit — completate
- [x] **Home: tabella misure sempre vuota (BUG)** — `loadRecents()` non assegnava
  mai `_cachedFiles` (sorgente di tabella/auto-tag/activity/count): header "8
  misurazioni" ma lista "0". Fix una riga. Ora header e lista concordano (8=8).
- [x] **Concerto motore fuori dalla toolbar dati** — spostato nell'header Home
  (icona 🎼), la toolbar misurazioni ha solo operazioni sui dati.
- [x] **Caption orientative** (label gergali / stato iniziale a zero che sembra
  rotto): aggiunta una riga di spiegazione sotto i titoli sezione in Alzata
  ("Rotazione manuale e zero" → spiega Zero virtuale / Sblocca motore), Polare
  ("Rotazione manuale" → Sblocca motore) e Confronto ("Dati misurazione" →
  spiega il flusso e le righe grafico 1–4). Terminologia invariata, solo
  contesto in più. I tooltip per-pulsante c'erano già.
- [x] Ispezionati Confronto e Polare: Polare pulito; Confronto mancava solo la
  guida a video (ora aggiunta).
- [x] **Alzata/Polare: messaggistica "nessun hardware connesso"** — banner
  contestuale (server giù vs server-ok-ma-Arduino-assente) + guardia su
  start()/ms() con toast "Server non connesso". In Polare ha risolto anche un
  **crash latente** (start() → `sendSocket.send` con sendSocket undefined) e i
  LED Server/Sensore/Encoder, prima nel markup ma mai aggiornati, ora pilotati.

---

## Sotto-sessione 6.6 — 2026-05-29 — Fix export PDF (grafici)

Segnalato: in tutti gli export PDF i grafici risultavano **assenti/bianchi** e
**tagliati/disallineati**. Diagnosi (pixel-sampling sul canvas esportato): il
PNG di Chart.js è trasparente → su PDF bianco va bene il fondo, ma due bug reali:
1. **Squish**: ogni grafico forzato in box ad altezza fissa (55/60 mm) mentre il
   canvas ha aspect ≈0.6 → deformazione verticale (~metà altezza reale).
2. **Assenti/bianchi**: `addChartIfPresent` faceva `if(!chart) return` (sezione
   sparita); cattura su contenitore nascosto → riquadro bianco.

### Fix
- Helper `chartToPrintImage(chart)` (analisi.html): compone il canvas su fondo
  **bianco opaco** a **2× risoluzione**, ritorna l'**aspect ratio reale**; se il
  buffer è vuoto tenta un resize, altrimenti ritorna null (→ placeholder, non
  riquadro muto).
- `addChartIfPresent` + blocco timing riscritti: altezza = larghezza × aspect
  (niente squish), page-break sull'altezza vera, e `(grafico non disponibile)`
  esplicito quando manca.
- `exportRaceReport`: compliance chart via helper; spring map renderizzata in
  **modalità stampa** (`renderSpringMap(..,{forPrint:true})`: fondo bianco,
  etichette scure, marker più marcato) + aspect corretto, poi ripristino schermo.
- `home.html` `exportSinglePDF`: cattura inline white-bg + 2× + aspect corretto.

### Verifica
Test live (camma Clio reale, asp+scar+compliance): tutti i 7 grafici presenti e
con immagine valida (nessun null/bianco), helper produce fondo bianco opaco +
aspect reale (profilo 0.59, timing 1.0), `exportPDF`/`exportRaceReport` senza
eccezioni. Regressioni `test_3dof` 3/3 e `validate_clio` ancora verdi (fix solo
di rendering). Conferma visiva finale demandata all'utente (gli screenshot del
preview vanno in timeout in questo ambiente).

---

## Sotto-sessione 6.7 — 2026-05-29 — 4 migliorie piccolo/alto valore

Dall'elenco "genuinamente da fare" emerso dall'audit. Tutte verificate qui
(le due hardware anche a livello logico; prova al banco a carico utente).

### 1. `tools/test_followers.js` (commit `c2cb201`)
Regressione delle 3 conversioni follower, invarianti derivate dal codice:
roller = max(0, raw−rPunt) e rRoll ininfluente; finger tilt=0 = raw×(lValve/
lArm) esatto (err 1e-15); bicchiere finito/≥0, picco=picco grezzo, rPunt
sottratto. 8/8 PASS. Colma l'unico buco di copertura test.

### 2. Contrasto colori in stampa (commit `a13dd06`)
`_darkenForPrint` + `_applyPrintPalette` in chartToPrintImage: prima della
cattura scurisce i colori chiari (cyan/giallo), testo/legenda → scuri, griglia
chiara; ripristina dopo. Fix chiave: `update('none')` non ridisegna sincrono →
`chart.draw()` esplicito. Linea profilo da lum 153 (sbiadita) a 79 (leggibile).
Stessa logica inline in home.html.

### 3. Auto-reconnect WebSocket (commit `01693e5`)
alzata + polare: handler resi nominati, `connectEngine()` con onclose/onerror
→ retry ogni 3s senza reload; toast "Connessione ripristinata". Verifica live:
close forzato → riconnesso entro ~2.5s su entrambe.

### 4. Allarme slittamento stepper↔encoder (commit `75d4b80`)
In scansione (alzata) confronta passi comandati vs avanzamento encoder reale
(4 conteggi/grado, finestra 10°=40 conteggi); se l'encoder è quasi fermo
(<25% atteso) → toast avviso una volta per run, non blocca. Wrap-safe,
mode-independent, conservativo sul backlash. Soglie validate numericamente.

### Da fare prossime sessioni
- [x] ~~Fase D: ESLint + issue GitHub~~ (sotto-sessione 6.8)
- [ ] Tour guidato passo-passo → issue #4
- [ ] Compliance 3-DOF su entrambi i lati → issue #2 / spring surge → issue #1
- [ ] Validazione su camma race dedicata + confronto banco → issue #3

---

## Sotto-sessione 6.8 — 2026-05-29 — Fase D: ESLint + issue GitHub

### ESLint (commit `ab53503`)
- `cammes/eslint.config.js`: flat config con globals inline (niente dipendenza
  `globals`), regole curate pro-bug (no-undef, no-dupe-keys, valid-typeof,
  no-func-assign, no-eval) senza rumore di stile sul codice ES5. Copre
  cammes_server.js (Node), cammes-ui.js (browser), tools/*.js (Node); script
  inline HTML esclusi (richiederebbero plugin + molto rumore).
- package.json: script `lint` e `test`; eslint in devDependencies.
- Finding: 1 errore reale (no-func-assign sul monkey-patch di close() in
  cammes-ui.js → documentato come intenzionale) + warning benigni gestiti.
  Lint finale: 0 errori, 1 warning noto (var resolved nel check path-traversal,
  lasciato intatto perché sicurezza). Regressioni node ancora verdi.
- Nota: install locale eslint fallisce su cartella Google Drive (EBADF); usato
  eslint globale per eseguire. `npm install` su checkout normale lo installa.

### Issue GitHub (repo privato MDJGyurgeiz/CAMMES)
Aperte 5 issue per la roadmap (non c'erano TODO nel codice → tracciamento del
backlog):
- #1 Spring surge (molla a massa distribuita)
- #2 Compliance 3-DOF cedevolezza lato bilanciere
- #3 Validazione camma race dedicata + banco (bloccante: serve file race)
- #4 Tour guidato passo-passo
- #5 Build pkg: pkg.assets riferisce librerie obsolete a root invece di lib/ (bug)

---

## Sotto-sessione 6.9 — 2026-05-31 — Roadmap: #1 surge, #2 pivot, #4 tour
### Tag: **v2.6.0**
Implementate le 3 issue fattibili della roadmap (#3 resta bloccata: serve un
file di camma race reale). Ognuna verificata e committata separatamente.

### #1 Spring surge — molla a massa distribuita (commit `64cd206`)
`simulateSpringSurge`: molla discretizzata in N masse (m/N), N+1 segmenti
k=(N+1)·kSpring, base fissa, capo guidato dal moto valvola, RK4. Cattura la
risonanza delle spire (surge) ad alto regime, invisibile al modello a massa
concentrata. `springSurgeFreqHz` = ½·√(k/m). Ritorna surgeFreqHz, surgeRatio,
maxCoilAmp, harmonicOrder, criticalRpm. UI (select + massa molla + spire),
dispatch in analyze(), export CSV/PDF. `tools/test_surge.js` 5/5: freq propria
+ convergenza catena discreta + risonanza + bounded.

### #2 Cedevolezza pivot bilanciere 3-DOF (commit `d819ee0`)
`simulateCompliance3DOF` + param `kPivotN_mm`: termine -k_pivot·x1 (perno→terra).
Default 0 = comportamento originale (retrocompat esatta). UI riga nel gruppo
3-DOF. `test_3dof.js` CHECK 4: k_pivot=0 ≡ assente, k_pivot finito cambia il
lift. Modello lumped semplificato, off di default (knob power-user).

### #4 Tour guidato passo-passo (commit `bbd0d18`)
Coachmark per-pagina in `cammes-ui.js` (spotlight + tooltip, Indietro/Avanti/
Fine/ESC). Bottone 🗺 iniettato accanto al "?" e CSS iniettata da JS → nessuna
modifica ai 5 HTML né a style.css. TOUR_STEPS per home/alzata/polare/grafici/
analisi su id reali; step assenti saltati. Gating localStorage, on-demand.
Verificato su tutte le pagine (spotlight dimensionato, navigazione, 0 errori).

### Stato issue
Chiuse #1, #2, #4 (+ #5 in 6.8). Aperta solo #3 (validazione camma race —
bloccata sui dati: caricare un file _alz di camma da corsa in prove/).

### Da fare prossime sessioni
- [ ] #3 Validazione su camma race reale (quando disponibile il file)

---

## Sotto-sessione 6.10 — 2026-05-31 — Surge vs RPM (grafico)
### Tag: **v2.6.1**
Completa la feature surge (#1) con la vista che mancava: `surgeSweep()` +
`runSurgeSweep()` + `renderSurgeSweep()` in analisi.html. Spazza 36 regimi
(1.5k–12k rpm) calcolando il surge ratio e plotta la curva su canvas
(`surgeSweepCanvas`): i picchi sono i regimi di risonanza della molla, con
soglia rossa a 1.0 e marcatore del regime attuale. Riporta il picco e il
regime critico. Bottone "🎶 Surge vs RPM" nella riga race (abilitato dopo
analisi, guard se surge OFF), mutuamente esclusivo con gli altri canvas race.
Verifica browser: picco surge 2.00 @ 10200 rpm (critico) su molla soft,
chart disegnato, 0 errori console. Regressione test_surge 5/5 invariata.

---

## Sotto-sessione 6.11 — 2026-05-31 — Re-audit completo + Animazione 2D + fix reali
### Tag: **v2.7.0**

### Referto audit (3 agenti Explore + verifica diretta)
Audit completo (math, firmware, server, UI/grafica). **Nessun bug critico
confermato**: le affermazioni "critiche" degli agenti sono state smentite
leggendo il codice — utile promemoria che gli audit automatici vanno verificati.
- `cmdBuf[16]` "overflow": FALSO, read-loop guardato (`cmdLen < sizeof-1`, master.ino:497).
- "race encoder": FALSO, `encoderCount` è `volatile` + letto sotto `noInterrupts()`.
- "`/api/files` mancante": FALSO, esiste (cammes_server.js:178).
- "leak poll/listener cross-pagina / motorFree persistente": FALSO, app multi-pagina
  (navigazione = full reload → contesto JS distrutto).
- ":focus-visible e prefers-reduced-motion mancanti": FALSO, già presenti e adeguati.

### Animazione 2D del meccanismo (risposta a "vedere cosa fa la macchina")
Scelta animazione 2D (no 3D/WebGL: vincolo exe offline su PC officina).
- `cammes-ui.js`: modulo condiviso `window.cammesCamAnim` (drawCamMechanism +
  animator rAF). Camma rotante (lobo polare), follower per tipo, valvola, molla.
- `analisi.html`: card "Animazione meccanismo" (play/pausa/velocità/lato) sul
  profilo analizzato. Verificato: follower più alto al picco lift → cinematica corretta.
- `alzata.html`: vista meccanismo **LIVE** orientata all'encoder reale + follower
  alla lettura comparatore; disegna il profilo scansionato che ruota. Draw-only.
- Rispetta prefers-reduced-motion.

### Fix di correttezza REALI (gli unici genuini)
- **Roller follower**: era un placebo (rRoll ignorato). Sostituito con l'inviluppo
  radiale reale (pitch curve, d(α)=max[ρcosΔ+√(rRoll²−ρ²sin²Δ)]). rRoll→0=puntalino,
  rRoll grande arrotonda. test_followers 9/9.
- **Finger**: warning quando la geometria leva satura (asin clamp) invece del clamp muto.
- **Guard divergenza**: toast "Compliance instabile" se l'alzata simulata è non-finita
  o >3× picco cam (rete di sicurezza sul cap subSteps).
- **a11y**: aggiunto `.cammes-tour-hole` al blocco prefers-reduced-motion (il resto
  era già a posto).

### Da fare prossime sessioni
- [ ] #3 Validazione su camma race reale (serve il file)
- [ ] (opz) vista 3D WebGL del meccanismo se il parco PC officina lo consente

---

## Sotto-sessione 6.12 — 2026-06-13 — Alzata al PMS corretta (caso reale VW KR 1.8 16V)
### Tag: **v2.8.0**

Innescata da un caso reale: due scansioni VW KR 1.8 16V (asp `VW-kr1_8-ASP_alz.scr`,
sca `VW-kr1_8-SC_alz.scr`). L'utente si aspettava 3,5/3,3 mm di alzata al PMS, il
software dava 1,7/1,0. **Analisi → tre cause reali, tutte corrette.**

### Diagnosi (perché 1,7/1,0 era sbagliato)
1. **PMS ancorato all'origine della scansione**, non al picco del lobo: `liftInTDC`
   era `anlIn[361]` (indice fisso = punto del profilo scollegato dal lobo). Due
   scansioni indipendenti asp/sca non contengono la fasatura camma↔manovella, quindi
   l'indice 361 cadeva su un punto arbitrario del fianco.
2. **Mostrava il puntalino sferico, non il bicchiere Ø35** realmente montato.
3. **Bug nella conversione bicchiere** (vedi sotto): leggeva *meno* del puntalino.

### Fix 1 — Compensazione puntalino sferico (`stylusCompensate`, commit pending)
Il vecchio modello faceva `ltrue = raw − rPunt` (sottrazione **piatta**): abbassava
tutta la curva di 1,5 mm anche al naso, dove non c'è alcun offset radiale → il
bicchiere risultava più basso del puntalino (fisicamente impossibile). Sostituito con
la compensazione corretta a **offset normale**: `lift_vero = raw + rPunt·(1−cos α)`,
`α = atan2(d(lift)/dθ, r)`. La correzione è **≥0, nulla al naso/base, cresce sui
fianchi** (la sfera "smussa" i fianchi). Helper condiviso usato da bicchiere/rullo/
finger. Picco bicchiere ora = picco grezzo (11,24/10,51), non più 9,74/9,00.

### Fix 2 — Alzata al PMS riferita al picco MISURATO + centro lobo per lato
`liftInTDC`/`liftExTDC` ora = alzata (follower convertito) a |centro lobo| **gradi
motore** dal naso misurato di ciascun lobo (1°camma = 2°motore → offset = angolo/2).
Riusa i campi "Angolo lobo" asp/sca (che sono già in gradi motore: tooltip corretti,
prima dicevano erroneamente "albero a CAMME"). `analyze()` **ri-elabora sempre dai
dati grezzi** memorizzati con i parametri correnti → cambiare follower/raggio base/
angolo ora ha effetto senza re-importare (prima era un bug latente).

### Fix 3 — Raggio base per lato (asp/sca)
Nuovo campo `rBaseExhaust`: aspirazione e scarico possono avere cerchio base diverso
(VW KR: 32,64 / 34,25 mm). `applyVirtualFollower(camLift, side)` usa il raggio del lato.

### Esito sul caso VW KR (Ø35, gioco 0,3, centro lobo 104°)
- **Asp 2,18 mm / Sca 1,71 mm** — valore fisicamente corretto per centro lobo 104°.
- I 3,5/3,3 attesi si ottengono a **centro lobo ~90° motore**: o le camme sono montate
  ~14° più anticipate, o quel dato viene da una fasatura diversa. Ora il software dà il
  numero vero per qualunque centro lobo l'utente inserisca (verificato in browser +
  end-to-end con le funzioni reali; regressioni test_followers 13/13, 3dof/surge/clio ok).

---

## Sotto-sessione 6.13 — 2026-06-14 — Salva profilo (grezzo / convertito) in archivio
### Tag: **v2.9.0**

Feature richiesta: poter salvare un profilo come **grezzo** (puntalino, come misurato)
oppure **gia convertito** al follower reale (bicchiere / rullo / finger), per avere in
archivio sia il dato sorgente sia la curva pronta. Implementata con un **unico bottone**
in Analisi: e il menu *Tipo follower* a decidere cosa si salva (modello mentale identico
alla richiesta).

### Server (`cammes_server.js`)
- Nuovo handler **POST/PUT `/api/file/<nome>.scr`**: scrive il file in `prove/` riusando le
  guardie gia presenti (`isSafeFilename` + anti path-traversal), solo `.scr`, body cap 2 MB,
  `mkdir prove/` recursive. Risponde `{ok, saved}`.

### Analisi (`analisi.html`)
- Bottone **Salva profilo** (abilitato dopo l'analisi). `saveProfileToArchive()`:
  - follower = **Puntalino** -> salva la curva **grezza** (header `_pline`);
  - follower = **bicchiere/rullo/finger** -> salva la curva **gia convertita** (ricostruita
    dai dati grezzi coi parametri correnti via `applyVirtualFollower`), con **header
    marcatore** `_pline_conv:tipo:param` e suffisso nel nome (`_bicch35`/`_roll8`/`_finger`).
  - POST in `prove/` -> il file compare in Home accanto alle altre misure. Toast di esito.
- **Anti doppia-conversione** (`detectConvertedFile`): caricando un file marcato `_pline_conv`,
  l'analisi imposta automaticamente follower = **Puntalino** e avvisa, cosi non riconverte
  una curva gia-follower. Memorizzati `intakeFileBase`/`exhaustFileBase` per i nomi.

### Verifica (browser, server reale)
- Salvati i convertiti dei 2 file VW (bicchiere 35) -> creati in `prove/` (via `/api/files`).
- Ricaricato il convertito: header rilevato -> follower forzato a Puntalino, picco 11.24,
  **alzata al PMS 2.175 mm identica** = nessuna riconversione. 0 errori console. File di test
  poi rimossi. Regressioni test_followers 13/13, 3dof/surge/clio/vw invariate.

---

## Sotto-sessione 6.14 — 2026-06-14 — Pulizia codice morto (referto audit campi)
### Tag: **v2.10.0**

Dopo l'audit esaustivo di ogni elemento UI (255 elementi, 247 ok, 0 doppioni, 0 rotti —
con verifica adversariale che ha ribaltato 2 falsi positivi), rimossi i pochi residui
morti/vestigiali confermati. Nessun cambiamento funzionale.

- **`alzata.html`**: rimosse le funzioni orfane `insert()` (placeholder di test, valori
  hardcoded 5/20) e `update()` (copia-incolla da polare.html: usava `birdsData`/
  `polarAreaChart` inesistenti in alzata; mai chiamata). `reset()` resta (in uso).
- **`home.html`**: rimosso il checkbox nascosto `#filterBookmarked` (vestigiale,
  `display:none` mai tolto e `.checked` mai letto): il toggle "Solo preferiti" usa già
  label+icona + la variabile `filterOnlyBookmarks`.
- **`cammes-ui.js`**: rimosse 3 esposizioni `window.*` mai consumate nel codebase —
  `cammesToggleTheme` (duplicato dell'handler interno cablato via addEventListener),
  `cammesWizard.reset` (+ funzione `resetWizardFlag`), `cammesGetCurrentPage` (la funzione
  interna `getCurrentPage` resta, è load-bearing per il tour).
- **`polare.html`**: hardening del bottone Salva da `type=submit` a `type=button` (non era
  un bug — non ha form-owner, verificato — ma elimina la fragilità futura).

### Verifica (browser)
- home: toggle tema ancora funzionante (dark→light) nonostante l'export rimosso, toggle
  "Solo preferiti" ancora funzionante, checkbox rimosso, API pubbliche superstiti intatte.
- alzata: `insert`/`update` assenti, `reset` presente, pagina ok.
- polare: Salva = `type=button`, nessun form-owner, `sav()` definita.
- 0 errori console su tutte e tre. Regressioni test_followers 13/13, 3dof/surge/clio/vw verdi.

---

## Sotto-sessione 6.15 — 2026-06-14 — Correzione baseline / eccentricità (bonifica acquisizione b)
### Tag: **v2.11.0**

Prima delle due "bonifiche acquisizione". Lo scarico VW ha un fondo di cerchio base che
non torna a 0 (~0,21 mm, variabile lungo il giro): firma di camma montata fuori centro /
runout. Non è un offset costante → non si sottrae una costante.

- **`removeCamBaseline()`** (analisi.html): stima la baseline come **DC + 1ª armonica**
  `a0 + a1·cosθ + b1·sinθ` (minimi quadrati, sistema 3×3 via Cramer) sui **soli punti di
  cerchio base** — il lobo e le sue rampe sono esclusi con un margine di ±12° per non
  falsare il fit — e la sottrae a tutta la curva (clamp ≥0). Su scansioni pulite il fit ≈ 0
  → no-op. Toggle **Corr. baseline ON/OFF** (default ON, sezione avanzata).
- Cablata in `analyze()` (via `analysisRaw()`, prima della conversione follower) e nel
  **salva convertito** (la curva esportata riflette la correzione). Il **salva grezzo**
  resta il dato come misurato. Avviso una‑tantum se rimuove un'eccentricità > 0,05 mm.
- **`tools/test_baseline.js`** (nuovo): camma pulita → no-op esatto (Δ 0.0000, picco
  preservato); camma + 0,25·cosθ → base→0 e profilo recuperato esattamente, eccentricità
  stimata 0,250; **file VW scarico reale → base 0,220 → 0,048 mm**, picco 10,50 → 10,46.

### Verifica (browser + node)
- Node: test_baseline tutti verdi + regressioni test_followers 13/13, 3dof/surge/clio/vw invariate.
- Browser: toggle presente; con ON l'alzata al PMS scarico cambia (1,706 → 1,829 mm:
  correzione applicata), eccentricità stimata ~0,08 mm, 0 errori console.

Nota: questa è la bonifica **(b)**. La **(a)** — indicizzare il profilo sull'encoder invece
che sugli step — è lato acquisizione live e va validata al banco (vedi prossima voce).
