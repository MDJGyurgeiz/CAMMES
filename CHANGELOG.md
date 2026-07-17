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

---

## Sotto-sessione 6.16 — 2026-06-14 — Indicizzazione su encoder (bonifica acquisizione a)
### Tag: **v2.12.0**

Seconda bonifica. Oggi il profilo viene indicizzato sui **passi** del motore
(`deg = floor((i-1)/subStepsPerDeg)+1`, alzata.html); l'encoder reale (4 conteggi/°) è letto
ma usato solo per zero-virtuale e allarme slittamento. Se lo stepper slitta sotto carico
(molla del tastatore sui fianchi) i passi non corrispondono alla rotazione vera → profilo
deformato.

- **Selettore "Sorgente angolo: Passi (default) / Encoder"** in alzata.html. Default **Passi**
  (comportamento storico, noto-buono): l'encoder è opt-in finché non validato al banco.
- **`pdEncoder[]`**: durante la scansione si memorizza il conteggio encoder per grado
  (accanto a `pdata`), resettato a ogni run.
- **`reindexByEncoder(pd, pdEnc)`**: al salvataggio, se Sorgente=Encoder, re-indicizza il
  profilo sulla posizione reale — riferisce il conteggio al primo campione (offset libero),
  ricava la direzione dal segno dello span, aggrega per grado-encoder e interpola i buchi.
  **Fallback automatico ai passi** (ritorna null) se i dati encoder sono insufficienti
  (assenti / span < 360 cnt / troppi buchi). Riporta la divergenza max passi↔encoder.
- `sav()`: usa il profilo re-indicizzato quando disponibile, con toast esplicito (indicizzato
  su encoder + divergenza, oppure "encoder non disponibile → salvato sui passi").

- **`tools/test_encoder_reindex.js`** (nuovo): encoder lineare → identità (Δ 0.0000);
  offset costante → invariato; direzione invertita → identità; slittamento (scala 0.95) →
  output valido, picco preservato, divergenza 18°; nessun encoder → null (fallback passi).

### Verifica e limiti
- Node: test_encoder_reindex tutti verdi + regressioni invariate (baseline/followers/3dof/surge/clio/vw).
- Browser: selettore presente (default Passi), funzioni cablate, identità esatta in-pagina,
  fallback null, 0 errori console.
- **Limite onesto**: la *logica* di re-indicizzazione è testata, ma l'integrazione live
  (Arduino + encoder + camma che gira) **non è validabile senza il banco**. Per questo il
  default resta Passi: alla prima scansione reale con Sorgente=Encoder, confrontare il
  profilo coi passi prima di adottarlo stabilmente.

---

## Sotto-sessione 6.17 — 2026-07-04 — UI a moduli: schermata pulita di default
### Tag: **v2.13.0**

Richiesta utente: il programma è diventato complicato per chi deve solo analizzare i
profili asp/scarico e correlarli (gradi di apertura + grafico). Le funzioni extra ora
sono **moduli attivabili a spunta** — la schermata di default mostra solo l'essenziale.

### Pannello "⚙ Funzioni" (analisi.html)
- Bottone nell'header della card Parametri → pannello con 7 checkbox persistenti
  (`localStorage cammes-modules-v1`): **Follower simulato**, **Molla & forze**,
  **Cinematica**, **Dinamica valvole (compliance+surge)**, **Strumenti race**,
  **Animazione meccanismo**, **Confronto A/B**. Default: **tutte OFF**.
- Meccanismo: ogni blocco è taggato `data-module="a b c"` ed è visibile se ALMENO UNO
  dei moduli è attivo → "dinamica"/"race" portano con sé i parametri molla che gli
  servono. I campi disattivati restano nel DOM coi default → `analyze()` invariata.
- **Migrazione**: chi usava "Avanzato" ritrova tutti i moduli attivi (nessuna regressione
  percepita). Il toggle **Base/Avanzato resta** ma con scopo ridotto: parametri fini
  (anticipo, bilancieri, smoothing, baseline).
- Vista default (utente nuovo): Preset, Aspirazione, Scarico, Rif. durata, Analizza/
  Reset/CSV/PDF/Salva → risultati fasatura + grafico 720°. La sezione risultati
  "Forze molla e RPM critico", cinematica, animazione e confronto compaiono solo coi
  rispettivi moduli.
- Tour aggiornato (primo step = pannello Funzioni); gli step su elementi nascosti si
  saltano da soli (guard `offsetParent` già presente in cammes-ui.js).

### Verifica (browser, stato utente-nuovo con localStorage pulito)
- Default: core visibile, 7 blocchi nascosti (molla/compliance/follower/race/confronto/
  RPM/cinematica). Attiva "dinamica" → compare compliance E parametri molla; race resta
  nascosto. Reload → scelta ricordata, checkbox sincronizzate, bottone "(1 attive)".
- Analisi completa sui file VW a moduli spenti: risultati fasatura ok (durata 255°,
  overlap 47.5°), sezioni extra nascoste. Tutti i moduli ON → tutto ricompare e
  l'analisi popola anche forze/cinematica. 0 errori console.
- Regressioni node tutte verdi (baseline, encoder_reindex, followers 13/13, 3dof, surge,
  clio, vw — l'estrazione delle funzioni non è toccata).

---

## Sessione 7 — 2026-07-04 — Revisione architetturale (fine ultimo: prodotto da distribuire)

Assessment completo di fattura (2 referti: catena acquisizione + architettura web).
Verdetto: motore di calcolo solido, firmware ben fatto ma orchestrato dal browser,
web monolitico, consegna rotta. Piano in 4 fasi approvato dall'utente.

### Fase 2 — Matematica fuori dall'HTML → `lib/cammes-math.js`
- **16 funzioni di calcolo puro (~39 KB)** estratte con chirurgia scriptata (stesso
  brace-matching dei test → copia esatta, zero drift) da analisi.html (15: baseline
  _det3/_solve3/removeCamBaseline, follower stylusCompensate/convertPuntTo*, mapCamToCrank,
  parseCamFile, compliance 1/2/3-DOF + detectValveFloat, surge freq+sim) e alzata.html
  (reindexByEncoder).
- **`lib/cammes-math.js` UMD**: nel browser aggancia le funzioni a `window` con gli stessi
  nomi globali (pagine invariate); in node `module.exports`. Alias interno `window=root`
  per lo stato diagnostico (`_lastBaselineAmp`, `_fingerSaturated`, ...).
- Pagine: `<script src="lib/cammes-math.js">` prima dello script inline; definizioni
  inline rimosse (verifica automatica: zero residui). `pkg.assets` copre già `lib/**`.
- **Tutti e 7 i test migrati da eval-extraction a `require()`**: la classe di fragilità
  (rinomina/marker → test rotti) sparisce per costruzione.
- Verifica: suite 7/7 verde; browser: valori IDENTICI al check storico (alzata al PMS
  2.175/1.706 su VW, bicchiere Ø35), alzata.html ok (reindex dalla lib), 0 errori console.

### Fase 3 — Livello acquisizione condiviso `cammes-scan.js`
- Le 7 funzioni IDENTICHE tra alzata e polare (verifica automatica con confronto
  normalizzato) escono in `cammes-scan.js`: connessione WS + auto-reconnect
  (`_wsReady`/`connectEngine`/`_engineScheduleReconnect`), `onMoveProfileChange`,
  jog `m1`/`p1`, inversione `rlb`, più lo stato condiviso. Contratto: la pagina
  definisce `_engineOnOpen`/`_engineOnMessage` e chiama `connectEngine()`.
  Script top-level → stessi nomi globali, zero modifiche al codice chiamante.
- package.json: cammes-scan.js in pkg.assets e lint; `npm test` ora esegue TUTTE
  e 7 le suite; `pkg` pinnato in devDependencies; version → 3.0.0.
- Verifica browser: alzata e polare connesse via modulo condiviso, 0 errori console.

### Fase 1 — Scan autonomo nel firmware (v3) + settle adattivo
- **master.ino v3**: comando **`S±NNNNN`** — il ciclo di scansione gira nell'Arduino:
  per ogni unità muove, legge con **settle ADATTIVO** (`readSensorStableMm`: frame
  consecutivi entro 5 µm = stabile; budget 1.5 s/punto — veloce sul cerchio base,
  paziente sul fianco ripido, mirato al problema del fianco sottostimato) e streama
  `#i:enc:mm` (i = sequenza → i buchi si rilevano). Fine `*sdone`, abort con `x` →
  `*sabort`. Query versione `v` → `ver=3.0 scan=1`. p/q invariati (jog/compatibilità).
  Compila pulito: 8584 B flash (26%), 261 B RAM (12%).
- **alzata.html**: selettore **"Motore scansione: Browser (classico, default) /
  Firmware (autonomo, beta)"**. Integrazione a rischio minimo: ogni riga `#i:enc:mm`
  viene riscritta nel formato classico "mm enc" e rientra nel flusso esistente →
  gauge, binning, max, run ripetuti e 0-virtuale INVARIATI. STOP invia `x`. Guardia
  firmware vecchio (nessun campione in 6 s → avviso "serve v3").
- Verifica: simulazione streaming nel browser via gestore reale (10 campioni finti →
  10/10 registrati, picco tracciato, pdEncoder riempito, completamento e chiusura ok),
  0 errori console. **Validazione live al banco richiesta prima di adottarlo** (per
  questo il default resta Browser).

### Fase 4 — Consegna da prodotto · Tag: **v3.0.0**
- **Hot-plug seriale** (cammes_server.js): se all'avvio non c'è l'Arduino, il server
  ricontrolla le porte ogni 5 s finché non compare — si può avviare l'exe PRIMA di
  collegare l'USB, senza riavvii. Retry anche su errori di apertura/list.
- **Badge versione** su ogni pagina (basso a destra, `CAMMES v3.0.0` via cammes-ui.js,
  `window.CAMMES_VERSION`): in assistenza si sa subito quale build gira.
- **README riscritto** (era fermo a marzo: citava serve.js/gauge.min.js/charts/ rimossi):
  architettura v3, struttura reale, protocollo aggiornato (S/x/v), pagine, quickstart,
  qualità/test, **Android marcato SPERIMENTALE** (fermo alla UI v1).
- **MANUALE_OPERATORE.md** (1 pagina): avvio, misura, analisi, problemi frequenti, backup.
- **Build exe riproducibile**: `pkg` pinnato in devDependencies; `cammes.exe` ricompilato
  dal sorgente v3 (38,5 MB, node18-win-x64) → `CAMMES_DIST/cammes.exe` (il vecchio exe di
  marzo salvato come `cammes_v1_backup.exe`). NOTA: su questo PC una policy di controllo
  applicazioni (WDAC) blocca l'esecuzione di exe nuovi non firmati → smoke test runtime
  da fare sul PC d'officina; il codice impacchettato è lo stesso verificato via node.
- **GitHub Release v3.0.0** con `cammes.exe` allegato (i binari non stanno nel repo:
  `.gitignore` esclude *.exe/*.apk).

---

## Sessione 8 — 2026-07-05 — VALIDAZIONE AL BANCO (sistema completo, camma installata)

Banco collegato (Arduino COM8 + stepper + encoder + Neoteck + albero montato).
Campagna eseguita in autonomia: flash v3 → sanity → calibrazione → doppio-scan →
analisi. Camma installata identificata per correlazione: **Renault Clio 1.8 16V**
(RMS 0.074 mm vs la scansione d'archivio di 2 mesi fa → ripetibilità eccellente).

### Risultati
1. **Firmware v3 VALIDATO al banco**: flash ok, `v` → `ver=3.0 scan=1`.
   **Scan autonomo `S-00360`**: 360/360 campioni, **0 buchi di sequenza, 0 NaN**,
   76.6 s (213 ms/punto). Profilo = scan classico: picco 8.52 vs 8.51 mm,
   shift 1°, RMS 0.079 mm, |Δ| medio 0.040 mm. **Settle adattivo attivo e
   misurabile**: 193 ms/punto sul cerchio base vs 264 ms sul fianco ripido.
2. **Calibrazione passi↔encoder (B1) CHIUSA**: nelle mosse di scansione (32 step)
   il rapporto è **0.9986 °/unità** (praticamente esatto); nelle rotazioni lunghe
   continue (`$+090` = 2880 step) c'è un overshoot di +0.83 % (90°→90.75°),
   ripetibile e simmetrico, ritorno a casa esatto (0 backlash, 0 slittamento).
   Divergenza passi↔encoder durante scan: **1°** su 360 → **slittamento ESCLUSO
   sperimentalmente** su questo banco/camma.
3. **Re-indicizzazione encoder VALIDATA su dati live**: `reindexByEncoder` sui
   due scan reali → profilo coerente, divergenza max 1°.
4. **BUG REALE SCOPERTO E CORRETTO — starvation RX FTDI**: su questo PC il
   latency timer del convertitore USB-seriale non scatta: i byte ricevuti
   restano nel chip finché il buffer non si riempie o finché l'host non
   TRASMETTE. Sintomo: handshake di scansione browser a 30–50 s/passo (probe:
   risposte consegnate SOLO all'istante di una TX; con kick TX ogni 100 ms:
   20–200 ms). Lo streaming autonomo invece fluiva (riempie i pacchetti da 62 B).
   **Fix in cammes_server.js**: keep-alive `'\n'` ogni 100 ms a porta aperta
   (il firmware ignora le righe vuote). Verifica end-to-end: scan classico da
   browser di nuovo completo in ~60–100 s (360/360, picco 8.510).
   Nota: senza questo fix, su PC con driver FTDI configurati male il prodotto
   sarebbe stato inutilizzabile in scansione — trovato solo grazie al banco.
5. Dati salvati in `prove/`: `bench_classic_alz.scr`, `bench_auto_alz.scr`.

### Cosa resta aperto
- Il mistero del **fianco sottostimato VW** non era chiudibile oggi (montata la
  Clio, non la VW). Però lo slittamento è ora ESCLUSO sperimentalmente: restano
  dinamica del tastatore sui fianchi ripidi della VW (test: rimontare la VW e
  scansionare in **autonomo** — il settle adattivo è il candidato-fix) o
  eccentricità di montaggio di allora.
- La posizione di riposo dell'albero è ~qualche grado diversa da inizio sessione
  (irrilevante: ogni scansione è un giro completo e lo zero si fa col comparatore).

---

## Sessione 9 — 2026-07-11 — VALIDAZIONE FISICA del metodo puntalino→bicchiere (Clio + piattello Ø33)

Esperimento decisivo proposto dall'utente: stessa camma (Clio 1.8) misurata prima col
**puntalino sferico** (+ conversione matematica a bicchiere Ø33), poi con un **piattello
Ø33 fisico** montato al posto del puntalino. Se coincidono, il metodo è validato.
Protocollo: **reset a 180° dal picco prima di OGNI scansione** (richiesto dall'utente;
implementato via encoder, errore sempre ≤0,75°), 5 scansioni per fase (classica ×2,
autonoma v3 ×2, mediata 3 campioni ×1).

### Risultato — METODO VALIDATO
- **Fase 1 (puntalino)**: 5 scan, picchi 8,52-8,53 (±0,01 mm), σ media/grado 0,025 mm;
  classico ≡ autonomo (RMS 0,055 mm). Previsione bicchiere Ø33 calcolata dalla mediana
  per raggio base 14-20 mm.
- **Fase 2 (piattello Ø33 fisico)**: 5 scan, picchi tutti 8,500, stessa ripetibilità.
- **CONFRONTO**: miglior accordo a **raggio base 19 mm** → **RMS 0,046 mm, max|Δ| 0,19 mm**
  su tutto il profilo; scarti ±0,13 mm sui fianchi senza pattern sistematico (residuo da
  quantizzazione 1° dell'allineamento). Controllo di fisica: il piattello legge
  **+2,5…+3,3 mm più del puntalino sui fianchi** e ~uguale al naso — esattamente come
  previsto dalla conversione (funzione di supporto). **Autocalibrazione: raggio base
  reale della camma Clio ≈ 19 mm.**
- Conseguenza per il caso VW: metodo/matematica/strumento ora validati fisicamente
  end-to-end → per il fianco VW −35% resta un solo indiziato: il **setup
  dell'acquisizione VW originale** (centraggio/eccentricità — coerente con l'ondulazione
  di base 0,21 mm di quel file). Test finale: ri-scansione della camma VW su questo banco.

### Note operative
- Driver di campagna promosso a strumento permanente: **`tools/bench_campaign.js`**
  (5 scansioni + reset 180° via encoder, etichetta libera, porta auto-rilevata,
  keep-alive FTDI, retry apertura). Analisi one-off rimossa.
- 10 file misura salvati: `prove/cliobench_punt_*` e `prove/cliobench_bicch33_*`.
- Incidente driver FTDI: un errore di scrittura (error 31) ha lasciato un processo
  zombie inchiodato sulla COM (non uccidibile senza admin); risolto con
  scollega/ricollega USB dell'utente + watcher automatico di ripartenza. Il driver
  ora rileva la porta dinamicamente e ritenta l'apertura.

### Export "Scheda camma" (cam card PDF) — richiesta utente su modello Cat Cams
- Nuovo bottone **📄 Scheda camma** in Analisi (abilitato dopo Analizza):
  `exportCamCard()` genera un **PDF A4 orizzontale in stile scheda rettificatore**:
  tabella asp/scarico (gioco, durata @gioco e @riferimento, **alzata valvola E alzata
  camma**, angolo lobo, apre/chiude, alzata al PMS, overlap, LSA), diagramma dei due
  lobi sui gradi motore (PMI–PMS–PMI, centri lobo annotati, livello alzata@PMS,
  fasatura testuale) disegnato su canvas ed embeddato, sezione REMARKS.
- **Dichiarazione esplicita del metodo**: "Rilevazione: puntalino sferico R x mm ·
  curva presentata come: bicchiere Ø / rullo / finger con leva / grezzo (+ bilanciere)"
  — esattamente il flusso chiesto dall'utente, forte della validazione fisica di oggi.
- `compress: true` → PDF da 2,9 MB a **62 KB**. Modalità test (`exportCamCard(true)`
  ritorna l'arraybuffer) per la verifica automatica.
- Verifica browser: caso VW completo (bicchiere Ø35, rBase per lato, centri 106/104,
  giochi 0,30/0,40) → PDF valido (%PDF, 62 KB), bottone gated correttamente,
  0 errori console.

### Home: bottone "🗑 Svuota archivio" (richiesta utente)
- Nella toolbar dell'archivio: `clearArchive()` elimina TUTTI i file di misura via
  l'API DELETE esistente, con **doppia conferma esplicita** (conteggio reale nel
  testo + avviso di scaricare prima ciò che si vuole conservare) e pulizia dei
  tag/preferiti dei file eliminati (le altre preferenze restano). Toast di esito
  con eventuali falliti.
- Verifica browser (senza toccare l'archivio reale): bottone presente e cablato,
  percorso ANNULLA → zero cancellazioni (19 file prima e dopo), testo conferma
  corretto, 0 errori console. Il loop di cancellazione riusa l'endpoint DELETE
  già collaudato nelle sessioni di banco.

### Fix da feedback utente (banco) + razionalizzazione controlli scansione
- **BUGFIX encoder live (alzata.html)**: `currentEncoderCount` veniva aggiornato SOLO
  dalle misure di scansione ("X.XX N"), mai dalle risposte `encoder=N deg=` del
  polling '?'. Fuori scansione restava `null` → tre sintomi riportati dall'utente
  con una sola radice: **meccanismo live fermo a "cam 0°"**, **traccia live vuota**
  in free-spin, **"Salva pos" impossibile** ("aspetta il prossimo polling" per
  sempre). Fix: parse di `encoder=(-?\d+)` nel ramo polling. Verificato AL BANCO:
  encoder popolato dal polling idle, comando +5° → angolo live aggiornato,
  Salva pos sbloccato.
- **Controlli scansione razionalizzati (alzata.html)**: dati i test (07-05/07-11:
  classico ≡ autonomo ≡ mediato entro 0,05-0,07 mm), per l'uso normale bastano
  Modalità + START. Ripetizioni / Profilo / Sorgente angolo / Motore scansione
  spostati in un pannello **"⚙ Avanzate"** richiudibile (chiuso di default,
  scelta ricordata). Nessuna funzione rimossa.
- **polare.html**: messaggio "mic out" → **"NO SENSORE"** (coerente con Alzata):
  significa lettura assente o fuori scala (>32 mm / NaN).

## Sessione 11d — 2026-07-13: "e se l'elettronica ripete lo stesso dato mentre l'ago si muove?" (domanda utente)

Esperimento di falsificazione diretta: 90 punti consecutivi da 1° (fianco
incluso, escursione 0→2,42 mm); dopo ogni passo letti TUTTI i frame per
2,6 s. Confronto: valore che il criterio "2 frame concordi ≤5 µm"
AVREBBE accettato vs valore vero dopo 2,6 s.
- Periodo reale tra frame del Neoteck: 58-128 ms (mediana 95, ~10 Hz —
  più veloce di quanto stimato: la coppia concorde copre ~0,2 s reali).
- |accettato − verità|: mediana 0,000 · p90 0,000 · MAX 0,010 mm.
  Un ritardo di assestamento da ~1 s è ESCLUSO: aspettare 13× di più
  cambia il valore al massimo di 1 tacca.
- Il fenomeno temuto ESISTE ma alla scala della RISOLUZIONE dello
  strumento: su 10/90 punti un frame successivo alla coppia concorde
  flicka di esattamente ±0,010 mm (1 tacca del comparatore centesimale,
  ago al confine di quantizzazione); solo 2/90 punti finiscono a 1 tacca
  dal valore accettato. Non riducibile senza uno strumento più risoluto;
  già dentro l'accuratezza dichiarata (±0,05 mm) e filtrato da
  Ripetizioni/smoothing. Nessuna modifica necessaria: limite documentato.

## Sessione 11c — 2026-07-13: "il comparatore ha tempo di assestarsi?" (domanda utente)

Risposta con i numeri. Premessa di design: NESSUNA lettura avviene in
movimento — ogni grado il motore si ferma e la lettura è accettata solo
quando DUE frame consecutivi del comparatore coincidono entro 5 µm.
- **Misura al banco** (scan autonomo completo, 360 punti, timestamp per
  campione): assestamento min 161 ms · mediana 202 · p90 297 · p99 314 ·
  **max 328 ms** contro un budget di 1500 → margine 4,6× anche sul punto
  peggiore, zero punti oltre 1 s.
- **Chiuso il buco residuo**: a budget scaduto il punto veniva accettato
  IN SILENZIO. **Firmware 3.3**: audit `*sstat u=N` a fine scansione =
  numero di punti accettati senza stabilizzazione; UI: toast warn se N>0
  ("controlla vibrazioni/fissaggio") e `#puntiInstabili=N` nei metadati
  del file. Flashato e verificato: scansione reale → `*sstat u=0`
  (ogni punto certificato stabile).

## Sessione 11b — 2026-07-13: profili a bassa velocità (domanda utente) + BUG overflow firmware

Domanda utente: "hai provato lo stesso test a velocità inferiore?" — giusto:
il primo test copriva solo la scansione (scatti da 1°, rampa quasi inerte).
Test ROTAZIONI LUNGHE continue per k0..k3 (180° a/r, verifica encoder):
tutti percorrono lo STESSO angolo (5934-5936 cnt, coerenza 0,05%), ritorno
esatto al punto di partenza → **zero passi persi a qualunque velocità**
(k0 249°/s → k3 74°/s). Cambia solo il tempo (6,0/9,2/13,5/20,0 s per 180°...
misurati su corsa lunga). Conferma definitiva: profilo fisso Standard.

**BUG TROVATO DAL TEST**: il contatore passi di stepperMove era uint16 —
oltre ~2047° in un colpo solo andava in OVERFLOW (girati ~1484° su 5760
chiesti). Mai colpito dall'UI (max 360°), ma blindato: **firmware 3.2**
(steps uint32), flashato e VERIFICATO al banco: $+3000 → 2999,5° misurati
dall'encoder (err 0,017%), ritorno netto −1 cnt.
Nota per i futuri driver di test: $±N prende UNITÀ (gradi con r32), non µstep.

## Sessione 12 — 2026-07-15: audit esterno (94 rilievi) — 15/15 P0 verificati e corretti in 7 lotti

Audit esterno indipendente (`CLAUDE_HANDOFF_CAMMES.md`, snapshot `e15ac01`).
Verificati indipendentemente tutti i 15 P0 (riferimenti riga coincidenti,
riproduzioni funzionanti): **tutti confermati**, nessuno inventato. Corretti in
7 lotti, ciascuno con test di regressione che falliva prima e passa dopo.
Dettaglio in `AUDIT_RESPONSE.md`. Suite: 52 → **129 check verdi**; lint a 0;
`npm audit` pulito salvo `pkg` (devDep).

- **L1 `24473ad`** — MAT-01 (centri frazionari: `mapCamToCrank` inversa +
  interpolazione, 106,5° non azzera più la curva), MET-01 (invalidi non
  azzerati, run incompleti marcati `#stato=INCOMPLETO`), MET-02 (`benchVerdict`:
  buchi → NON VALUTABILE, mai falso PASS), MAT-07 (`validCount` = gradi unici).
  Nuovo `test_misura_affidabile.js`.
- **L2 `cd53e64`** — MAT-02 (fase dal picco misurato sub-grado, `camPeakPos`),
  MAT-03 (segni = etichette ATDC/BTDC), MAT-04 (anticipo applicato via
  `effectiveCenters`), MAT-05 (centri reali, LSA derivata). Nuovo
  `test_fase_segni.js`.
- **L3 `60a3b8b`** — firmware **3.4**: MOT-01 (timer scansione cancellati da
  STOP + generation token), FW-02 (Concerto interrompibile, `*tabort`), FW-03
  (watchdog host: moto fermo se il PC sparisce 5 s), fix `x` idle che
  avvelenava `cmdBuf`. Hex compilato (9402 byte); flash e prova moto al banco.
- **L4 `51108a4`** — SEC-02 (allowlist statica: log/settings/misure/sorgente →
  404), SEC-01 (Origin allowlist su WS + Host check, uso LAN invariato),
  `prove/**` fuori dagli asset pkg. Nuovo `test_confine_rete.js`.
- **L5 `445de9a`** — MOT-02 (interblocchi `_scanBusy`), MOT-03 (socket unico),
  MOT-04 (STOP Concerto reale), MOT-05 (RESET con STOP prima del reload).
- **L6 `4addf4f`** — SEC-09 (`ws` 8.21), MAT-08 (soglia relativa reindex),
  DOC-01 (README fw 3.4), REL-09 (`settings.local.json` fuori dal repo),
  APP-18/19 (residuo CSS, testo cestino), TEST-03 (ESLint installato, lint
  verde, `cammes-math.js` lintata), tag spurio eliminato.
- **L7 `4deb398`** — DYN-01 (valve float = perdita di contatto reale: 0 al
  quasi-statico, crescente coi giri, cala con molla rigida), DYN-03 (camma
  interpolata nei solver), DYN-04 (default nullish `_num`), DYN-05 (modello
  dichiarato esplorativo per il regime assoluto). `validate_clio` riscritto;
  nuovo `test_valve_float.js`.

Trappola d'ambiente registrata: `npm install` su Google Drive rompe con EBADF
(estrazione tar) → installato in una cartella locale C: e ricopiato con
robocopy. I test che avviano un server (`test_confine_rete`) vanno con il
preview server SPENTO (contesa su COM8/porte) e uccidono il figlio su ogni
uscita per non lasciare processi zombie che bloccano le porte.

### Lotto 14 — APP-01/APP-02: staleness analisi + dispatcher modello compliance
APP-02: i tool race (sweep RPM, suggerisci molla, mappa k×F₀, sweep 3D)
chiamavano sempre `simulateCompliance` (1-DOF) ignorando il modello scelto;
ora un dispatcher unico `runComplianceModel` rispetta 1/2/3-DOF (verificato:
a 12000 rpm float 5,60 / 12,20 / 12,18 mm) e arricchisce i parametri
bilancere/sede dal DOM. APP-01: cambiare un parametro che modifica la CURVA
(follower, raggio base, rocker, centro, anticipo, gioco, smoothing, modello/
parametri compliance) senza ri-premere Analizza ora marca l'analisi "stale"
(banner + export CSV/PDF/cam card/race report bloccati con avviso), così il
report non mescola più input nuovi e array vecchi; il live tuning con
compliance attiva marca stale (forze live ma float al vecchio regime). Netto
dopo Analizza. Suite 135.

### Lotto 13 — APP-08/APP-09: loader Confronto robusto
grafici.html non usava il parser di libreria: due parser fatti a mano con
split posizionale rigido (riga i = grado i), limite 361 che ora becca la coda
di metadati `#...`, crash su file corti, e array globale `valori`/`valori5`
condiviso tra i 4 slot (contaminazione: un file più corto ereditava le code
del precedente). Ora tutto passa da `parseCamFile` (incluso lib in grafici),
ogni slot ha il proprio array (`_cmpData`/`_polData`), limite 360, guardia
`validCount<30` → file rifiutato, avviso su misure incomplete. Ramo `_pol`
legacy preservato. Validato dal vivo: slot corto a 300° = 0 (non la coda del
file lungo caricato prima), file da 20 righe rifiutato, Clio reale via
`?files=` renderizzata (picco 8,52 mm, 360 punti).

### Lotto 12 — SEC-05/SEC-06: robustezza richieste + scritture atomiche (`2492dc5`)
SEC-05: ogni richiesta in try/catch (un handler che lancia → 500 pulito, non
socket appeso via uncaughtException); `decodeURIComponent` protetto (URL/nome
con % malformato → 400); `readBody()` con 413 esplicito su settings/save/
restore (prima `req.destroy()` muto). SEC-06: `writeFileAtomic` (temp+fsync+
rename) — un crash a metà non tronca più settings.json; coda `_settingsQueue`
che serializza i POST concorrenti (prima TOCTOU, l'ultimo vinceva); patch con
`null` cancella la chiave. Nuovo `test_server_robustezza.js` (6 check). Suite 135.

### Lotto 11 — SER-02/SER-03: robustezza flash firmware
SER-02: guardia once in `runAvrdude` — `spawn` emette `error` E POI `close`
su un fallimento di avvio, e `avrdudeDone` veniva chiamato due volte
(doppio `sendJson` = "headers already sent" e crash del processo, doppio
reset di `flashInProgress`). Ora solo il primo evento vince; il timeout 90 s
chiude anch'esso in modo pulito. SER-03: se la seriale non è aperta, prima
di lanciare avrdude si verifica che la porta (da `lastComPort`, che può
essere stale dopo un unplug/replug su un'altra COM) sia ancora presente
nell'elenco; altrimenti 409 con l'elenco delle porte disponibili invece di
flashare il dispositivo sbagliato. Validato al banco: flash via API →
singola risposta 200, ok, ~10 s, seriale riconnessa a 3.5.

### Lotto 10 — SEC-03: XSS da contenuti memorizzati (`8ee36ce`)
Tag, nomi file e posizioni salvate uscivano in innerHTML e onclick inline
con escape debole; dati arbitrari via localStorage o file piazzati a mano
bypassavano la sanificazione da UI. Chip/badge/righe ricostruiti via DOM
(textContent + listener delegati su data-act/data-name), `normalizeTag` con
whitelist, `window.cammesEscape` canonico. Verificato: payload ostili resi
come testo, 0 iniezioni, 0 onclick residui.

### Lotto 9 — FW-04/FW-05: parser robusto + stabilità sensore (firmware 3.5)
Parser `S`/`$` con `strtol` (32 bit) e grammatica/range espliciti: prima
`atoi` (int16 su AVR) wrappava — `S+70000` diventava 4464 unità ESEGUITE in
silenzio; ora fuori grammatica o oltre i tetti (`S`≤1500, `$`≤3600) →
`*err` e ZERO moto. `readSensorStableMm`: un frame NaN azzera il confronto
di stabilità (due letture concordi separate da un buco non valgono più) e
<2 frame validi nel budget → NaN vero (il browser lo scarta, MET-01). Fw
**3.5** compilato (10260 byte), flashato e validato: harness a **23/23 PASS**
(nuovo blocco G: 5 comandi malformati → *err, encoder immobile, comando
legittimo dopo funziona). Tre scansioni Clio consecutive fw3.4↔fw3.5:
ripetibilità **0,024 mm RMS**, 0 gradi mancanti — il parser più severo non
scarta punti buoni.

### Lotto 8 — MET-03/MET-04: provenienza misura (`ba83b61`)
Il .scr ora registra `#tastatore` (selettore in Avanzate, ricordato),
`#verso`, `#microstep`, `#fw` (versione reale dell'Arduino) e `#encoderSpan`
(~±1440 = giro pieno). Analisi avvisa se aspirazione e scarico dichiarano
verso o tastatore diversi. Validato al banco con scansione reale (metadati
completi nel file, ripetibilità 0,044 mm tra due scan consecutive).

### Validazione al banco (2026-07-17, albero Clio montato con piattello Ø33)
Firmware **3.4 flashato** (8,7 s via API, verified) e provato con il nuovo
harness hardware `tools/bench_fw34_test.js` (fuori da npm test, richiede
banco): **16/16 PASS** — watchdog host scattato a ~5,5 s di silenzio (moto
troncato a 1373°/4000°, motore fermo, firmware vivo), nessun *wdt con
keep-alive attivi, *tabort in 126 ms, cmdBuf pulito dopo 'x' a vuoto, STOP
classico 186 ms. Il harness incorpora la trappola FTDI (kick '\n' ogni 150 ms,
sospeso solo nella finestra muta del test watchdog, con verifica indiretta via
encoder). Scansione end-to-end Veloce sulla Clio: 360/360 gradi, 0 invalide,
0 instabili, picco 8,530 mm; **RMS 0,047 mm** contro la scansione storica
convertita puntalino→Ø33 (= ripetibilità storica; il confronto grezzo dava
1,26 mm perché il file storico è a puntalino — il .scr non registra il
tastatore: da aggiungere ai metadati, rilievo MET-03). STOP a metà scansione:
nessun riavvio spontaneo, nessun degrado a fallback, zero timer armati
(MOT-01/cmdBuf verificati dal vivo).

## Sessione 11 — 2026-07-13: profili movimento testati, motore scansione automatico, layout

### Test al banco dei 4 profili movimento (domanda utente: "che senso ha averne 4?")
Scansione Veloce completa per k0/k1/k2/k3 sulla stessa camma (Clio):
| profilo | tempo | picco | RMS vs Standard |
|---|---|---|---|
| k0 Scattoso | 46,4 s | 8,550 @223° | 0,076 mm |
| k1 Standard | 50,6 s | 8,550 @223° | — |
| k2 Morbido | 57,2 s | 8,560 @223° | 0,065 mm |
| k3 Extra-morbido | 56,9 s | 8,550 @223° | 0,060 mm |
Differenze = ripetibilità run-to-run (0,05-0,08 mm), tempi quasi uguali
(±5 s su ~50 s): il profilo NON cambia la misura. **Selettore ELIMINATO**,
profilo fisso Standard k1 (quello di tutte le validazioni), inviato
automaticamente all'apertura del socket.

### Motore scansione: selettore ELIMINATO, fallback automatico
L'utente (giustamente) non capiva il senso della scelta Firmware/Browser.
Ora: sempre scan autonomo del firmware; se il firmware è pre-v3 e non
risponde entro 6 s, il programma passa DA SOLO al metodo classico, riavvia
la scansione e suggerisce l'aggiornamento firmware (un click dalla Home).

### Layout (segnalazioni utente)
- Analisi: con 5 moduli attivi "⚙ Funzioni (5 attive)" spingeva Base/Avanzato
  fuori dalla card (381 px in 355) → etichetta compatta "(5)" + header con
  flex-wrap; tendina Preset motore non tocca più il bordo (era a −1 px).
- Alzata: il pannello ⚙ Avanzate si incastrava a destra della toolbar con i
  gruppi impilati e disallineati → ora blocco a TUTTA LARGHEZZA sotto i
  comandi (flex-basis:100%), righe .adv-row con etichetta a larghezza fissa,
  bordo tratteggiato. Restano Ripetizioni e Verifica banco.
- Tooltip Ripetizioni riscritto: è il misuratore di RIPETIBILITÀ (N scansioni
  → σ max + verdetto eccellente/buona/sufficiente/scadente; σ alta = qualcosa
  di lasco o che vibra); la taratura la copre la Verifica banco.

## Sessione 10d — 2026-07-12: barra di stato a 4 LED (richiesta utente)

LED collegati ESATTAMENTE ai componenti, nell'ordine chiesto:
**Comparatore · Motore · Encoder · Server**, ognuno con tooltip-legenda.
- **Comparatore** (ex "Sensore", rinominato ovunque): verde = misure valide;
  giallo = risponde ma letture assenti/fuori scala; rosso = firmware muto.
- **Motore** (NUOVO): verde = pronto (bloccato) · **blu lampeggiante = in
  movimento** (scansione, zero virtuale E rotazioni manuali "Ruota") ·
  giallo = sbloccato (girabile a mano) · rosso = Arduino non risponde
  (nuovo tracking lastFirmwareRx su qualsiasi riga). Il blu si spegne
  all'arrivo di *mv/*mabort, non a tempo.
- **Encoder**: ora alimentato anche dallo streaming di scansione (non
  ingiallisce più a metà misura) e rosso quando i conteggi sono fermi.
- CSS: nuova classe .led.run (blu, pulsazione veloce). Manuale aggiornato
  con la legenda dei 4 LED.
- VERIFICATO live: idle tutti verdi; sbloccato→giallo; scan→blu; Arduino
  muto→rosso; rotazione REALE di 45° → blu durante, verde al *mv.

## Sessione 10c — 2026-07-12: encoder scollegato in scansione (precisazione utente)

Il test dell'utente era con l'ENCODER staccato (non il comparatore): l'avviso
visto era il nuovo allarme slittamento (testo fuorviante per quel caso), che
scattava UNA volta e taceva; al ricollegamento nessun messaggio e LED encoder
giallo (il polling '?' che lo alimenta è in pausa durante le scansioni).
NB: proseguire senza encoder è CORRETTO (la misura viaggia sui passi motore,
l'encoder è il controllore) — ma va detto chiaramente.
- checkEncoderDivergence ora DISTINGUE: conteggi esattamente fermi →
  "Encoder scollegato o fermo" (err, spiega che la misura resta valida ma
  zero virtuale/allarme slittamento non sono disponibili); conteggi ridotti
  ma presenti → allarme slittamento come prima. Il caso "fermo" non è più
  latchato: al ricollegamento mid-scan → "Encoder di nuovo attivo".
- LED encoder: alimentato anche dai dati di scansione (prima ingialliva
  sempre a metà misura) e ROSSO quando i conteggi sono fermi in scansione.
- VERIFICATO live: 13 misure a conteggio fermo → toast err + LED rosso;
  conteggi di nuovo in moto → toast success + LED verdi.

## Sessione 10b — 2026-07-12: scansione senza comparatore (bug trovato dall'utente al banco)

Test utente: scansione avviata SENZA comparatore → "segnalato qualcosa ma è
andata avanti"; ricollegato mid-scan → nessun messaggio, LED resta giallo.
CAUSA: l'auto-stop contava solo i NaN consecutivi, ma con il connettore
staccato l'ingresso del LM339N flotta e produce NUMERI CASUALI (spesso fuori
scala) che azzeravano il contatore e rinfrescavano perfino il timestamp
"sensore ok". E non esisteva alcun pre-controllo alla partenza.
- **Pre-flight in start()**: senza una misura valida negli ultimi 2,5 s la
  scansione NON parte (toast esplicito). Copre anche 0-virtuale e verifica
  banco. VERIFICATO live.
- **"Valido" = numerico E in scala 0–32 mm**: i numeri-spazzatura del pin
  flottante ora contano come guasto (LED giallo, contatore invalide).
- **Auto-stop su 3 letture INVALIDE consecutive** (NaN o fuori scala) con
  toast err "misura NON valida" + stop del firmware. VERIFICATO sul ferro:
  scan reale avviato, 3 letture spazzatura iniettate → toast + *sabort.
- **Toast di transizione sensore**: "Comparatore non risponde" quando le
  letture spariscono, "Comparatore rilevato" quando tornano (prima cambiava
  solo il colore del LED, in silenzio). VERIFICATO simulando stacco/riattacco.
- Manuale: righe problemi frequenti aggiornate.

## Sessione 10 — 2026-07-12: piano "cosa manca" completo (15 punti) + firmware 3.1

### App Android ELIMINATA
cammes-android/ e CAMMES.apk rimossi dal repo (ferma alla UI v1, fuorviante).

### ⚠️ Critiche di prodotto risolte
- **Exe UNICO autosufficiente**: i driver seriali (serialport+prebuilds) viaggiano
  dentro l'exe (pkg assets); pkg estrae i .node da solo al require, con
  estrazione manuale di riserva accanto all'exe/%LOCALAPPDATA%. VERIFICATO:
  exe di prova eseguito in cartella vergine → seriale caricata, COM8 trovata.
  In più la CI allega anche cammes-completo.zip (exe+LEGGIMI+manuale) e la Home
  mostra un banner rosso se i driver mancano (modalità demo).
- **STOP di emergenza reale (firmware 3.1)**: stepperMove interrompibile —
  ogni 16 passi consuma il buffer RX cercando 'x' → *mabort (prima un Ruota
  300° sbagliato non era fermabile). Prima versione col peek si fermava al
  primo char non-x e il polling della pagina la accecava: scoperto e corretto
  AL BANCO (200° comandati → fermato a ~100°, *mabort a +362ms via server).
  p/q e scan autonomo coordinati (misura saltata / *sabort). stop() della UI
  invia 'x' sempre. NB: i test via Browser-pane fallivano per il timer
  throttling dei tab in background (x partiva a movimento finito), non per il
  sistema.
- **Allarme slittamento anche in scan autonomo**: il check passi↔encoder
  girava solo nel ramo '*se' (browser) mentre il default è Firmware →
  estratto in checkEncoderDivergence() chiamata per OGNI misura di scansione.
- **Cestino**: DELETE e Svuota archivio spostano in prove/.trash (ripristino
  1-click da Home, purge automatico 30 giorni). Prima: unlink irreversibile.

### Sanità metrologica
- **Controllo chiusura giro**: a fine scansione il minimo del cerchio base
  della 1ª metà giro deve coincidere con quello della 2ª (indipendente dal
  punto di partenza): oltre 0,03 mm → "misura sospetta, riazzerare".
- **Reset Arduino rilevato**: "CAMMES Uno ready" a pagina avviata → toast
  rosso "riferimento zero perso", stop scansione, encoder invalidato.
- **Verifica banco periodica**: ⚙ Avanzate → scansione di un cilindro
  rettificato, residuo post-eccentricità RMS/max vs soglie 0,02/0,05 →
  esito PASS/FAIL salvato in settings.json, badge con data in Home.

### Dati e referti
- **Metadati nel .scr (IN CODA, retro-compatibile)**: #data/#sw/#modalita/
  #motore/#picco (+#runs/#sigmaMax/#sigmaPicco per le ripetizioni): i vecchi
  parser leggono solo le righe 1..360 e li ignorano.
- **parseCamFile robusto**: \r?\n, colonna grado (non più riga i=grado i),
  righe #, CSV Excel italiano (';' e virgola decimale), validCount →
  import rifiuta i file irriconoscibili invece di caricare 360 zeri muti.
- **Ripetibilità sul referto**: la scheda camma dichiara "media di N scansioni,
  sigma max X mm" (dai metadati) o "misura singola". Footer con disclaimer.
- **Intestazione officina** sui referti (impostata in Home, salvata sul server).

### Collaudo PASS/FAIL (Confronto)
Profilo nominale (misura o CSV) + tolleranza ±mm → banda sul grafico,
scostamento max e verdetto CONFORME/NON CONFORME per ogni curva (allineamento
automatico al picco). Verificato: file identico → 0,000 CONFORME; nominale
alterato +0,3 sul naso → NON CONFORME 0,300 @109°.

### Prodotto
- LICENSE (tutti i diritti riservati + limitazione responsabilità).
- **Manuale servito dall'app**: /manuale (markdown→HTML, stampabile), link in
  Home; incluso nell'exe.
- **Anagrafica sul server**: tag e preferiti replicati in settings.json
  (debounce) con unione all'avvio: sopravvivono a cambio browser/PC.
- Layout: colonna parametri di Analisi allineata (label a larghezza fissa);
  riga Vista polare di Confronto su due righe (sbordava dalla card).
- Firmware 3.1 flashato via endpoint in-app (8,4 s) — deviceFirmware=3.1.

## Sessione 9 — 2026-07-11 (sera): semplificazione UI data-driven + update remoto

### Test al banco delle 6 modalità di scansione (decisione utente: "servono tutte?")
- Driver usa-e-getta: scan classico completo per fast/std/race/ultra/hyper sulla
  stessa camma (Clio + piattello Ø33), binning a 1°, confronto RMS dopo
  allineamento. Risultati:
  | modalità | tempo | picco | RMS vs fast |
  |---|---|---|---|
  | fast (1°, c1) | 44 s | 8.500 @116° | — |
  | std (1°, c3) | 135 s | 8.500 @116° | 0,049 mm |
  | race (0,5°, c3) | 276 s | 8.500 @117° | 0,049 mm |
  | ultra (0,5°, c5) | 426 s | 8.510 @117° | 0,048 mm |
  | hyper (0,125°) | 504 s | **@210°(!)** | 3,96 mm |
- **fast≡std≡race≡ultra entro 0,05 mm RMS** (= ripetibilità run-to-run): Ultra non
  aggiunge nulla e costa 10×.
- **Hyper/Atomic erano rotte by design**: chiedono `r4`/`r1`, ma il firmware
  accetta solo r∈{8,16,32,64} (master.ino:431) e ignora il comando → giravano col
  passo residuo precedente percorrendo PIÙ GIRI per scansione (il picco a 210°
  è la terza passata del lobo con r16 ereditata da ultra: 2880×0,5°=4 giri).
- **Decisione: 6 → 3 modalità** — Veloce (1°, default), Precisione (1°, media 3),
  Race (0,5°, media 3). Tempi dichiarati = misurati.

### Alzata: rimozione "Sorgente angolo" + Motore scansione default Firmware
- "Sorgente angolo" eliminata (UI): al banco passi≡encoder entro 1° su 360°,
  la re-indicizzazione non corregge nulla nell'uso normale. `sav()` torna al
  salvataggio semplice sui passi; `reindexByEncoder` resta in lib/cammes-math.js
  (testata) e l'encoder resta in uso per zero virtuale, reset 180° e allarme
  slittamento.
- "Motore scansione": tenuto con 2 opzioni — **Firmware (autonomo, consigliato,
  default)**, validato 07-05/07-11, e **Browser (compatibilità)** come riserva per
  firmware pre-v3 (guardia 6 s già presente).
- "Ripetizioni": tenuta in ⚙ Avanzate (default 1): è l'unico strumento che
  quantifica la ripetibilità (σ per grado), usato per le validazioni stesse.

### Pensionamento pagina Polare
- `polare.html` → `legacy/` (git mv); link nav e tile Home rimossi ovunque;
  tolta da pkg.assets; tour aggiornato ("Le 3 sezioni", step vista polare).
- **Vista polare in Confronto da file `_alz`**: il campo "Vista polare" accetta
  ora gli `_alz` (raggio = raggio base configurabile + alzata) e i vecchi `_pol`
  restano leggibili (legacy). Loader riscritto (via il doppio FileReader binario).

### Update software in-app (repo GitHub ora PUBBLICO) — punto 8
- Server: **GET /api/update-check** → GitHub Releases `releases/latest`
  (User-Agent, cache 1 h per il rate limit), confronto semver con package.json.
- cammes-ui.js: check silenzioso a ogni avvio pagina, toast una volta per
  sessione se c'è una versione più nuova, con link alla release.
- Home, card **"Sistema & aggiornamenti"**: versione installata, "Controlla
  aggiornamenti" manuale, link download quando disponibile.

### Update firmware Arduino dall'app
- `cammes/fw/`: `master.ino.hex` precompilato (arduino-cli, 8584 B) +
  `avrdude.exe`/`.conf` (8.0.0-arduino1) + `version.json`; inclusi in pkg.assets.
- Server: **GET /api/firmware-info** (versione inclusa, porta, stato seriale) e
  **POST /api/flash-firmware**: chiude la seriale, estrae hex+avrdude su disco
  reale (temp, per pkg), `avrdude -c arduino -P COMx -b 115200 -D -U flash:w:hex:i`
  con fallback all'avrdude di Arduino15, poi riapre la seriale. L'hot-plug è
  sospeso durante il flash (flag `flashInProgress`).
- Home: bottone "⚡ Aggiorna firmware Arduino" con conferma, stato live e toast.
- **TESTATO SUL FERRO**: flash reale via endpoint → 8584 byte scritti e
  verificati in 8,5 s su COM8, seriale riaperta da sola, `v` → `ver=3.0 scan=1`.

### Revisione QA su richiesta utente: tour, tooltip, scheda camma PDF
Audit multi-agente (4 revisori + verifica avversariale: 12 problemi confermati,
3 confutati, 19 minori) + verifica live nel browser e sul PDF renderizzato.
- **Scheda camma PDF (analisi.html)** — fix verificati rigenerando il PDF reale:
  - remarks: righe wrappate si SOVRAPPONEVANO (maxWidth con avanzamento fisso)
    → splitTextToSize con avanzamento per riga; carattere '→' corrompeva la
    spaziatura (non è WinAnsi) → '->'.
  - asse del diagramma lobi: off-by-one (PMS=indice 361 invece di 360, tick a
    -241…-1…239) → allineato alla convenzione dell'app (tick -240…0…240).
  - la dichiarazione follower/baseline veniva letta dal DOM all'export: se si
    cambiava follower dopo Analizza senza rianalizzare, il PDF dichiarava un
    metodo diverso dai numeri → snapshot in lastAnalysis.inputs (followerType,
    Ø/R/leve, rPunt, baselineOn) + picchi camma congelati in results.
  - nomi file lunghi sforavano il bordo pagina → troncamento a 80 char;
    etichette lobo con clamp per non uscire dal riquadro.
- **Tour guidato**: step nuovi per la card "Sistema & aggiornamenti" (Home) e
  "⚙ Avanzate" (Alzata); gli step Compliance/Surge di Analisi (INVISIBILI per
  chi ha i moduli off: venivano saltati in silenzio) accorpati nello step
  ⚙ Funzioni; startTour ora logga in console gli step con target nascosto.
- **Tooltip**: tip Concerto correggeva 4 brani → 7+custom (fuorviante);
  aggiunti tip su Confronto A/B (angolo/gioco/bottoni, era l'unica sezione
  senza help), Reset e Stop replay in Confronto, gauge live e Salva/Pulisci in
  Alzata, "Solo preferiti" e chip filtri in Home. Copertura verificata live:
  su tutte le pagine ogni controllo visibile ha spiegazione (hover o ?).

### Robustezza da officina + assistenza remota (suggerimenti 2-11 approvati)
Tutti testati live al banco (il n.1, bind 127.0.0.1, scartato dall'utente).
- **(2) Backup ZIP vero**: GET /api/backup-zip — ZIP "stored" costruito a mano
  (CRC32 + central directory, zero dipendenze) con tutti i .scr di prove/;
  bottone 📦 in Home. Verificato con unzip reale (CRC ok). Il MANUALE ora dice
  il vero.
- **(3) Salvataggio con ACK reale**: sav() di Alzata ora POSTa su /api/file e
  il toast "salvato" arriva SOLO dopo la conferma del server (prima l'invio WS
  era fire-and-forget: disco pieno = file perso in silenzio). In più guardia
  sovrascrittura con conferma. Testati: nuovo/annulla/sovrascrivi.
- **(4) Doppio avvio**: handler EADDRINUSE su HTTP e WS — banner "CAMMES è già
  in esecuzione", apertura del browser sull'istanza attiva, uscita dopo 8 s
  (prima: istanza zombie).
- **(5) Log su file + diagnostica**: ogni riga di log anche in cammes.log
  (rotazione 1 MB); GET /api/diagnostics scarica versioni+stato+coda log;
  bottone 🩺 in Home. cammes.log in .gitignore.
- **(6) Versione firmware REALE**: probe 'v' a ogni apertura seriale; la card
  Sistema mostra "sull'Arduino: v3.0" accanto a "incluso" (arancione se
  diversi), /api/firmware-info espone deviceFirmware. Retry lato pagina.
- **(7) Auto-detect con probe**: se nessuna porta ha manufacturer noto, si
  apre in sequenza e si TIENE solo quella che risponde a 'v' (prima: "ultima
  COM qualsiasi" + keep-alive sparato a dispositivi altrui).
- **(8) Download diretto**: update-check ritorna l'asset .exe della release
  (browser_download_url + dimensione); toast e card puntano all'exe, non alla
  pagina release. Verificato: cammes.exe v3.0.0, 36,8 MB.
- **(9) Release via GitHub Actions**: .github/workflows/release.yml — su tag
  v* runner Windows: npm test (gate) → pkg build → SHA256 → asset allegati;
  con check tag==package.json. Aggira anche il blocco WDAC del PC di sviluppo.
- **(10) Versione unica**: banner server usa package.json (diceva "v1.0.0");
  nuovo tools/test_version.js in npm test fallisce se cammes-ui.js diverge.
- **(11) Flash bloccato durante scansione**: il server traccia l'attività di
  scansione (#i:/*se) e /api/flash-firmware risponde 409 se attiva da <10 s.
  Testato sul ferro: scan avviato → flash → 409 → abort 'x' pulito.

### Fixtures di validazione fuori dall'archivio utente
- L'utente ha usato "Svuota archivio" → prove/ vuota, e `npm test` leggeva i file
  reali da lì. I 3 file di riferimento (Clio + VW asp/sc) ora vivono in
  `cammes/tools/fixtures/` (fallback a prove/); le 7 suite ripassano tutte.
- I file di misura eliminati restano recuperabili dalla history git.
