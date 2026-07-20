# CAMMES — Sistema di Misura Profili Alberi a Camme

Sistema completo per misurare e analizzare i profili degli alberi a camme: hardware (Arduino Uno + stepper + encoder + comparatore), server PC (Node.js, distribuito come `.exe` standalone offline) e interfaccia web.

**Versione corrente: v3.4.1** (firmware Arduino **4.0**, protocollo seriale v4) — la versione in esecuzione è mostrata in basso a destra in ogni pagina; il controllo aggiornamenti è automatico (GitHub Releases).

> Per l'uso quotidiano in officina vedi **[MANUALE_OPERATORE.md](MANUALE_OPERATORE.md)** (1 pagina).

---

## Architettura

```
      ┌───────────────────────────┐
      │    Browser (HTML+JS)      │   4 pagine: Home · Alzata ·
      │  Chart.js v4, no framework│   Confronto · Analisi
      └────────────┬──────────────┘
                   │ HTTP :3000  +  WebSocket :8080
      ┌────────────┴──────────────┐
      │  cammes_server.js (.exe)  │   statico + bridge WS↔seriale + archivio prove/
      │                           │   API: backup ZIP, cestino, update-check, flash
      │                           │   firmware, diagnostica, impostazioni, /manuale
      └────────────┬──────────────┘
                   │ USB seriale 9600 baud (hot-plug: riconnessione automatica)
      ┌────────────┴──────────────┐
      │     Arduino Uno (v3.6)    │   stepper via driver opto-isolato (TB6600/DM542)
      │                           │   encoder LDP3806 1:1 camme (1440 cnt/giro)
      │                           │   comparatore Neoteck via LM339N
      └───────────────────────────┘
```

---

## Struttura del progetto

```
CAMMES/
├── cammes/                       # App web + server
│   ├── cammes_server.js          #   server HTTP + WebSocket + seriale (hot-plug)
│   ├── home.html                 #   dashboard: archivio misure, tag, preferiti, backup
│   ├── alzata.html               #   acquisizione alzata (scan classico o autonomo v3)
│   ├── grafici.html              #   confronto fino a 4 profili + vista polare da _alz
│   ├── analisi.html              #   analisi camme: timing, follower virtuale, dinamica
│   ├── cammes-ui.js              #   modulo condiviso UI (tema, toast, gauge, tour, versione)
│   ├── cammes-scan.js            #   modulo condiviso acquisizione (WS, reconnect, jog)
│   ├── lib/cammes-math.js        #   LIBRERIA MATEMATICA (usata da browser E test node)
│   ├── lib/                      #   Chart.js v4, plugin zoom, hammer
│   ├── tools/                    #   test regressione + validazioni (npm test)
│   │   └── fixtures/             #   file di riferimento dei test (Clio, VW)
│   ├── fw/                       #   firmware precompilato (.hex) + avrdude per il flash in-app
│   ├── prove/                    #   archivio misure .scr (con cestino .trash/, 30 gg)
│   └── package.json              #   deps: ws, serialport · dev: eslint, pkg
├── master/master.ino             # firmware unificato v3.6 (1 Arduino Uno)
├── legacy/                       # vecchia architettura 2-Arduino + polare.html (dismessi)
├── .github/workflows/release.yml # CI: su tag v* → test → build exe → asset in release
├── LICENSE                       # tutti i diritti riservati + limitazione responsabilità
├── CHANGELOG.md                  # storia completa del progetto
├── salva.bat / aggiorna.bat      # push / pull GitHub
└── README.md

A runtime, accanto all'exe: settings.json (intestazione officina, verifica banco,
anagrafica tag/preferiti) e cammes.log (diagnostica).
```

---

## Pagine web

| Pagina | Descrizione | Arduino |
|--------|-------------|:-:|
| **Home** | Archivio misure con ricerca, tag e preferiti (replicati sul server), quick-view, **backup ZIP**, **cestino** (30 gg), card **Sistema & aggiornamenti** (update-check, flash firmware, intestazione officina, diagnostica, manuale) | No |
| **Alzata** | Acquisizione profilo 0–360° (scan autonomo firmware, fallback automatico su firmware pre-v3): gauge live, scelta modalità, zero virtuale, **STOP di emergenza**, controlli automatici (chiusura giro, slittamento, encoder fermo, reset Arduino, sensore muto); in ⚙ Avanzate: **Ripetizioni** (ripetibilità) e **verifica banco** con cilindro | Sì |
| **Confronto** | Fino a 4 profili sovrapposti o in differenza (max/media/RMSE), replay animato, vista polare dai file `_alz`, **collaudo su profilo nominale** con tolleranza ±mm e verdetto CONFORME/NON CONFORME | No |
| **Analisi** | Correlazione asp/scarico (durate, LSA, aperture/chiusure, alzata al PMS), follower virtuale (bicchiere Ø/rullo/finger), correzione baseline/eccentricità, cinematica, molla & forze, compliance 1/2/3-DOF, surge, strumenti race, export PDF/CSV, salva profilo (grezzo o convertito). Le funzioni extra si attivano dal pannello **⚙ Funzioni** | No |

---

## Hardware

- **Arduino Uno** — controller unico (firmware `master/master.ino` v3)
- **Driver stepper opto-isolato** (TB6600/DM542, common-anode: 5V su PUL+/DIR+/ENA+; GND 36V separato dal GND Arduino)
- **NEMA 17** — 32 micropassi = 1° camma (11.520 step/giro, riduzione inclusa)
- **Encoder LDP3806-360BM** — 360 PPR ×4 = 1440 cnt/giro, 1:1 sull'albero camme, pull-up 4.7 kΩ su A e B
- **Comparatore Neoteck** 0–25,4 mm via **LM339N**

### Pinout

| Pin | Dir | Collegato a | Funzione |
|-----|-----|-------------|----------|
| D2 (INT0) | IN | LM339N | clock impulsi sensore (FALLING) |
| D4 | IN | LM339N | bit DATA sensore |
| D3 (INT1) | IN | encoder A + pull-up | canale A |
| D8 (PCINT0) | IN | encoder B + pull-up | canale B |
| D7 / D6 / D5 | OUT | PUL− / DIR− / ENA− | stepper |
| D0/D1 | UART | USB → PC | seriale 9600 baud |

### Protocollo seriale (9600 baud) — principali

| Comando | Direzione | Descrizione |
|---------|-----------|-------------|
| `p` / `q` | PC→Uno | 1 unità di rotazione (∓) + misura → `X.XX N` + `*se` |
| `S±NNNNN` | PC→Uno | **Scan autonomo (v3)**: l'Uno esegue N unità da solo, settle adattivo, streaming `#i:enc:mm`, fine `*sdone` |
| `x` | PC→Uno | **STOP**: abort scan (`*sabort`), di QUALSIASI movimento (`*mabort`, dal fw 3.1) e della nota Concerto (`*tabort`, dal fw 3.4); a motore fermo è un no-op sicuro |
| `$±NNN` | PC→Uno | Rotazione manuale → `*mv` (o `*mabort` se interrotta) |
| `m` | PC→Uno | Solo misura → `*sm` |
| `?` / `!` | PC→Uno | Query encoder (`encoder=N deg=…` + `*pos`) / reset zero |
| `v` | PC→Uno | Versione/capacità → `ver=3.6 scan=1 free=N` |
| `cN rN wN uN aN gN kN` | PC→Uno | Config: campioni, µpassi, settle, pulse, rampa, preset |
| `f` / `l` | PC→Uno | Motore libero / bloccato |

---

## Installazione e utilizzo

### PC Windows (consigliato)
Scarica `cammes.exe` dall'ultima **GitHub Release** e avvialo: **un solo file, autosufficiente** — i driver seriali sono inclusi nell'exe (estratti da soli al primo avvio) e il browser si apre su `http://localhost:3000`. Nessuna installazione. L'Arduino può essere collegato anche **dopo** l'avvio (hot-plug). In release c'è anche `cammes-completo.zip` (exe + LEGGIMI + manuale).

### Da sorgente
```batch
cd cammes
npm install
npm start          :: server su :3000 + WS :8080
npm test           :: 13 suite di regressione/validazione (137 check)
npm run lint       :: eslint su server + moduli + tools
npm run build      :: genera cammes.exe (pkg, node18-win-x64)
```

### Firmware
Il modo più semplice: **Home → Sistema & aggiornamenti → ⚡ Aggiorna firmware Arduino** (usa l'hex e l'avrdude inclusi, ~15 s). In alternativa: `arduino-cli compile --fqbn arduino:avr:uno master` + upload. Lo **scan autonomo** e lo **STOP di emergenza** richiedono firmware **3.1+**; il **watchdog host** (il moto si ferma da solo se il PC sparisce per 5 s) e lo **STOP del Concerto** richiedono il **3.4**; il parser robusto (comandi fuori range rifiutati con `*err`) il **3.5**; il **FREE persistente** (movimenti rifiutati con `*locked` finché non si sblocca), le letture p/q assestate e l'**handshake di boot** (`*boot` con reset reason) il **3.6** (verifica col comando `v` o dalla card Sistema in Home). Il protocollo completo (comandi e risposte `*se/*sm/*sdone/*sabort/*mv/*mabort/*wdt/*tend/*tabort/*locked/*boot/*err`) è versionato nel commento di testa di `master/master.ino`.

### Release
`git tag vX.Y.Z && git push --tags` → la CI (runner Windows) esegue i test come gate, compila l'exe, calcola lo SHA256 e allega tutto alla release GitHub. L'update-check in-app punta all'asset `.exe` dell'ultima release.

---

## Qualità e test

- **`lib/cammes-math.js`**: tutta la matematica (conversioni follower, baseline/eccentricità, mappatura camma→albero, compliance 1/2/3-DOF, surge, re-indicizzazione encoder) vive in un'unica libreria usata sia dal browser sia dai test node.
- **`npm test`**: 13 suite (137 check) — versione, follower, 3-DOF, surge, baseline, encoder-reindex, misura affidabile (MAT-01/MET-01/02), fase&segni (MAT-02/03/04), confine di rete (SEC-01/02), robustezza server (SEC-05/06/07), valve float (DYN-01), validazione di PLAUSIBILITÀ su camme **Renault Clio 1.8 16V** e **VW KR 1.8 16V** reali (non un banco a motore trascinato: confronto con schede/misure di riferimento, non certificazione metrologica).
- Correzioni metrologiche documentate nel CHANGELOG (compensazione puntalino sferico a offset normale, alzata al PMS riferita al picco misurato, raggio base per lato, baseline 1ª armonica).

## Sincronizzazione

`salva.bat` = commit+push · `aggiorna.bat` = pull · repo: `github.com/MDJGyurgeiz/CAMMES`

## Tecnologie

HTML5/CSS3/JS (no framework, offline-first) · Chart.js v4 · Node.js (ws, serialport) · pkg → exe · Arduino C/C++ (ISR encoder x4, bit-bang sensore)
