# CAMMES — Sistema di Misura Profili Alberi a Camme

Sistema completo per misurare e analizzare i profili degli alberi a camme: hardware (Arduino Uno + stepper + encoder + comparatore), server PC (Node.js, distribuito come `.exe` standalone offline) e interfaccia web.

**Versione corrente: v3.0.0** — la versione in esecuzione è mostrata in basso a destra in ogni pagina.

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
      └────────────┬──────────────┘
                   │ USB seriale 9600 baud (hot-plug: riconnessione automatica)
      ┌────────────┴──────────────┐
      │      Arduino Uno (v3)     │   stepper via driver opto-isolato (TB6600/DM542)
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
│   ├── prove/                    #   archivio misure .scr (demo + reali)
│   └── package.json              #   deps: ws, serialport · dev: eslint, pkg
│   ├── fw/                       #   firmware precompilato (.hex) + avrdude per update in-app
├── master/master.ino             # firmware unificato v3 (1 Arduino Uno)
├── legacy/                       # vecchia architettura 2-Arduino + polare.html (dismessi)
├── CAMMES_DIST/cammes.exe        # eseguibile standalone (build locale)
├── CHANGELOG.md                  # storia completa del progetto
├── salva.bat / aggiorna.bat      # push / pull GitHub
└── README.md
```

---

## Pagine web

| Pagina | Descrizione | Arduino |
|--------|-------------|:-:|
| **Home** | Archivio misure con ricerca, tag, preferiti, quick-view, backup/restore ZIP | No |
| **Alzata** | Acquisizione profilo 0–360°: gauge live, scelta modalità, zero virtuale; in ⚙ Avanzate: run ripetuti con statistiche, profilo movimento, motore scansione Firmware/Browser | Sì |
| **Confronto** | Fino a 4 profili sovrapposti o in differenza (max/media/RMSE), replay animato, vista polare generata dai file `_alz` (raggio base + alzata) | No |
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
| `x` | PC→Uno | Abort scan autonomo → `*sabort` |
| `$±NNN` | PC→Uno | Rotazione manuale → `*mv` |
| `m` | PC→Uno | Solo misura → `*sm` |
| `?` / `!` | PC→Uno | Query encoder (`encoder=N deg=…` + `*pos`) / reset zero |
| `v` | PC→Uno | Versione/capacità → `ver=3.0 scan=1` + `*ver` |
| `cN rN wN uN aN gN kN` | PC→Uno | Config: campioni, µpassi, settle, pulse, rampa, preset |
| `f` / `l` | PC→Uno | Motore libero / bloccato |

---

## Installazione e utilizzo

### PC Windows (consigliato)
Scarica `cammes.exe` dall'ultima **GitHub Release** (o usa `CAMMES_DIST\cammes.exe`) e avvialo: si apre il browser su `http://localhost:3000`. Nessuna installazione. L'Arduino può essere collegato anche **dopo** l'avvio (hot-plug).

### Da sorgente
```batch
cd cammes
npm install
npm start          :: server su :3000 + WS :8080
npm test           :: 7 suite di regressione/validazione
npm run lint       :: eslint su server + moduli + tools
npm run build      :: genera cammes.exe (pkg, node18-win-x64)
```

### Firmware
Compilare/flashare `master/master.ino` su Arduino Uno (Arduino IDE o `arduino-cli compile --fqbn arduino:avr:uno master`). Lo **scan autonomo** richiede firmware **v3** (verifica col comando `v`).

---

## Qualità e test

- **`lib/cammes-math.js`**: tutta la matematica (conversioni follower, baseline/eccentricità, mappatura camma→albero, compliance 1/2/3-DOF, surge, re-indicizzazione encoder) vive in un'unica libreria usata sia dal browser sia dai test node.
- **`npm test`**: 7 suite — follower (13 check), 3-DOF, surge, baseline, encoder-reindex, validazione su **Renault Clio 1.8 16V** e **VW KR 1.8 16V** reali (quest'ultima confrontata con misure al banco motore).
- Correzioni metrologiche documentate nel CHANGELOG (compensazione puntalino sferico a offset normale, alzata al PMS riferita al picco misurato, raggio base per lato, baseline 1ª armonica).

## Sincronizzazione

`salva.bat` = commit+push · `aggiorna.bat` = pull · repo: `github.com/MDJGyurgeiz/CAMMES`

## Tecnologie

HTML5/CSS3/JS (no framework, offline-first) · Chart.js v4 · Node.js (ws, serialport) · pkg → exe · Arduino C/C++ (ISR encoder x4, bit-bang sensore)
