# CAMMES - Sistema di Misura Profili Alberi a Camme

Sistema completo per la misurazione e l'analisi dei profili degli alberi a camme per motori. Comprende hardware (Arduino), software PC (server Node.js + interfaccia web) e app Android.

---

## Architettura del Sistema

```
                                          ┌─────────────────────┐
                                          │   Browser / WebView  │
                                          │  (HTML + Chart.js)   │
                                          └─────────┬───────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              │                     │                     │
                     ┌────────┴────────┐   ┌────────┴────────┐   ┌───────┴────────┐
                     │   PC (Windows)   │   │  App Android     │   │  Analisi       │
                     │  cammes_server   │   │  USB OTG Serial  │   │  (standalone)  │
                     │  HTTP + WS + RS  │   │  WebView bridge  │   │  import .scr   │
                     └────────┬────────┘   └────────┬────────┘   └────────────────┘
                              │                     │
                         USB seriale           USB OTG
                              │                     │
                     ┌────────┴────────────────────┴────────┐
                     │          Arduino Uno (master)          │
                     │  Stepper 32 step/grado + lettura      │
                     │  comparatore Neoteck via LM339N       │
                     └───────────────────────────────────────┘
```

---

## Struttura del Progetto

```
CAMMES/
│
├── cammes/                          # App web (frontend + server)
│   ├── cammes_server.js             #   Server unificato HTTP + WebSocket + Seriale
│   ├── cammes.exe                   #   Server compilato (pkg, Node 18)
│   ├── alzata.html                  #   Pagina misura alzata (gauge + grafico live)
│   ├── polare.html                  #   Pagina diagramma polare
│   ├── grafici.html                 #   Pagina grafici e tabella dati
│   ├── analisi.html                 #   Analisi cinematica (vel, acc, jerk, snap)
│   ├── style.css                    #   Design system dark theme
│   ├── serve.js                     #   Server HTTP statico per sviluppo
│   ├── gauge.min.js                 #   Libreria gauge circolare
│   ├── Chart.bundle.js              #   Chart.js (grafici)
│   ├── Chart.min.js                 #   Chart.js minificato
│   ├── responsivevoice.js           #   Sintesi vocale (annunci misura)
│   ├── charts/                      #   Chart.js sorgenti + jQuery
│   ├── images/                      #   Icone UI (start, stop, piu, meno, ecc.)
│   ├── prove/                       #   File demo profili camme (.scr)
│   │   ├── fiat_fca_asp_alz.scr     #     Fiat FCA aspirazione - alzata
│   │   ├── fiat_fca_sc_alz.scr      #     Fiat FCA scarico - alzata
│   │   ├── 305_asp_alz.scr          #     Peugeot 305 aspirazione - alzata
│   │   └── 305_asp_pol.scr          #     Peugeot 305 aspirazione - polare
│   └── package.json                 #   Dipendenze: ws, serialport
│
├── master/                          # Sketch Arduino - Controller principale
│   └── master.ino                   #   Stepper NEMA 17 (32 step/grado),
│                                    #   lettura comparatore, protocollo seriale
│
├── micrometro_SPI/                  # Sketch Arduino - Lettura micrometro (legacy)
│   └── micrometro_SPI.ino           #   Bit-banging 24-bit, interrupt FALLING,
│                                    #   trasmissione SPI verso master
│
├── cammes-android/                  # App Android (WebView + USB Serial)
│   ├── app/src/main/
│   │   ├── kotlin/com/cammes/app/
│   │   │   ├── MainActivity.kt      #     WebView + JavascriptInterface bridge
│   │   │   └── UsbSerialManager.kt  #     USB OTG serial (CH340/FTDI/CP2102)
│   │   ├── assets/                  #     Copia file web per uso offline
│   │   ├── res/                     #     Layout, icone, temi, filtri USB
│   │   └── AndroidManifest.xml      #     USB host, permessi
│   ├── build.gradle.kts             #   Config build (SDK 34, minSdk 21)
│   ├── settings.gradle.kts          #   Repositories (jitpack per usb-serial)
│   └── gradlew.bat                  #   Wrapper Gradle
│
├── CAMMES_DIST/                     # Distribuzione Windows
│   └── cammes.exe                   #   Eseguibile standalone (Node 18 + pkg)
│
├── CAMMES.apk                       # APK Android pronto da installare
├── CHANGELOG.md                     # Log dettagliato di tutte le sessioni
├── camme-analisi_rev8.5.xlsm        # Foglio Excel analisi (VBA, legacy)
├── package-lock.json                # Lock dipendenze Node.js
├── salva.bat                        # Doppio click = commit + push su GitHub
├── aggiorna.bat                     # Doppio click = pull da GitHub
└── README.md                        # Questo file
```

---

## Pagine Web

| Pagina | Descrizione | Arduino richiesto |
|--------|------------|:-:|
| **Alzata** | Misura alzata camme in tempo reale. Gauge circolare, grafico lineare 0-360 gradi, controllo stepper, rotazione manuale. | Si |
| **Polare** | Diagramma polare della camme. Visualizzazione radiale del profilo. | Si |
| **Grafici** | Grafici e tabella dati delle misure effettuate. | Si |
| **Analisi** | Analisi cinematica offline: importa file .scr e calcola velocita, accelerazione, jerk, snap. Filtro Savitzky-Golay configurabile. | No |

---

## Hardware

### Componenti
- **Arduino Uno** - Controller principale (stepper + lettura comparatore)
- **Stepper NEMA 17** - Rotazione albero a camme (32 step/grado = 11.520 step/giro)
- **Driver stepper** - Collegato ai pin 2(STEP), 3(DIR), 5(ENA)
- **Comparatore Neoteck** (0-25.4mm) - Misura alzata
- **Op-amp LM339N** - Interfaccia comparatore-Arduino
  - Pin 14 LM339N → pin 5 Arduino (DATA) tramite resistenze
  - Pin 2 LM339N → pin 2 Arduino (INT0 FALLING) tramite resistenze

### Protocollo Seriale (9600 baud)
| Comando | Direzione | Descrizione |
|---------|-----------|-------------|
| `p` | PC → Arduino | Avvia misurazione completa (360 gradi) |
| `q` | PC → Arduino | Stop misurazione |
| `$+NNN` | PC → Arduino | Rotazione manuale oraria (NNN step) |
| `$-NNN` | PC → Arduino | Rotazione manuale antioraria |
| `XX.XX*se` | Arduino → PC | Misura alzata in mm (terminatore `*se`) |

---

## Installazione e Utilizzo

### Prerequisiti PC
- **Node.js** v10+ (per `npm install` e sviluppo)
- Oppure usare direttamente `CAMMES_DIST/cammes.exe` (nessuna dipendenza)

### Avvio rapido (Windows)
```batch
:: Metodo 1: Eseguibile standalone
CAMMES_DIST\cammes.exe

:: Metodo 2: Da sorgente
cd cammes
npm install
npm start
```
Si apre automaticamente il browser su `http://localhost:8080`

### App Android
1. Copiare `CAMMES.apk` sul telefono
2. Installare (abilitare "Origini sconosciute" se richiesto)
3. Collegare Arduino via cavo USB OTG (USB-C → USB-A)
4. L'app riconosce automaticamente Arduino Uno

### Ricompilare app Android
```batch
:: Prerequisiti: JDK 17 + Android SDK 34
cd cammes-android
gradlew.bat assembleDebug
:: Output: app\build\outputs\apk\debug\app-debug.apk
```

### Arduino
Aprire gli sketch `.ino` con Arduino IDE e caricare su Arduino Uno.

---

## Sincronizzazione tra PC

Questo repo usa Git + GitHub per mantenere il progetto sincronizzato tra piu computer.

### Salvare le modifiche
Doppio click su **`salva.bat`** oppure:
```bash
git add -A && git commit -m "descrizione" && git push
```

### Aggiornare da un altro PC
Doppio click su **`aggiorna.bat`** oppure:
```bash
git pull
```

### Setup nuovo PC
```bash
git clone https://github.com/MDJGyurgeiz/CAMMES.git
cd CAMMES
cd cammes && npm install
```

---

## Analisi Cinematica

La pagina **Analisi** (`analisi.html`) calcola le derivate del profilo camme:

- **Alzata** h(θ) — profilo misurato (mm)
- **Velocita** h'(θ) — prima derivata (mm/grado)
- **Accelerazione** h''(θ) — seconda derivata (mm/grado²)
- **Jerk** h'''(θ) — terza derivata (mm/grado³)
- **Snap** h''''(θ) — quarta derivata (mm/grado⁴)

Filtro **Savitzky-Golay** configurabile (5, 7, 9, 11 punti) per ridurre il rumore nelle derivate.

Formattazione automatica con notazione ingegneristica (×10⁶, ×10⁹, ×10¹²).

---

## Tecnologie

| Area | Tecnologia |
|------|-----------|
| Frontend | HTML5, CSS3, JavaScript, Chart.js, Hammer.js |
| Server PC | Node.js, WebSocket (ws), SerialPort |
| Arduino | C/C++, stepper control, bit-banging, interrupt |
| App Android | Kotlin, WebView, usb-serial-for-android |
| Build PC | pkg (Node.js → exe standalone) |
| Build Android | Gradle 8.5, Android SDK 34, JDK 17 |
