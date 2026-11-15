# CAMMES v3.4.3 — handoff operativo per Claude Code

Data audit: 25 luglio 2026  
Repository: `MDJGyurgeiz/CAMMES`  
Branch verificato: `main`  
Commit verificato: `5f03f79b38d43237c87e25f3db5f25eda4df03d6`  
Tag verificato: `v3.4.3`  
Versione firmware: `4.1`, da lasciare invariata

---

## 0. Incarico per Claude Code

Leggi **tutto questo file prima di modificare il progetto**.

Devi correggere i difetti qui descritti, aggiungere test automatici che li
riproducano e dimostrare che UI, numeri, grafici ed export restano coerenti.
Non basta far passare la suite esistente: diversi problemi sotto non sono
coperti dai test attuali.

### Vincoli richiesti dal proprietario

1. Non introdurre né proporre sistemi di emergenza hardware, E-stop, fungo o
   modifiche analoghe. Il banco usa un motorino molto piccolo; questo argomento
   è esplicitamente fuori perimetro.
2. Non modificare hardware, firmware 4.1, protocollo seriale o dati grezzi delle
   misure, salvo una necessità dimostrata e autorizzata separatamente.
3. Non spostare o riutilizzare il tag `v3.4.3`. Un’eventuale release corretta
   dovrà avere una nuova versione.
4. Non “correggere” un problema nascondendo l’output: sistemare formula, stato,
   grafico, export e test alla stessa fonte dati.
5. Non dichiarare `FIXED` un modello fisico solo perché produce valori finiti o
   perché converge numericamente.
6. Conservare le fixture reali delle camme RIF-2 e RIF-1 senza alterarle.
7. Lavorare per commit logici separati. Per ogni rilievo:
   - scrivere prima un test che fallisce sulla v3.4.3;
   - applicare la correzione;
   - eseguire test mirati, suite completa, lint ed E2E browser;
   - documentare la prova prima/dopo.

### Output richiesto a fine lavoro

Claude Code deve restituire:

- tabella `ID rilievo → file modificati → test aggiunto → esito`;
- misure prestazionali e di layout prima/dopo;
- risultati numerici delle fixture di riferimento;
- elenco onesto degli eventuali punti ancora aperti;
- nessuna affermazione di validazione fisica indipendente se non esiste.

---

## 1. Verdetto sintetico dell’audit

La v3.4.3 è migliorata e le correzioni recenti non sono da scartare, ma **non è
ancora corretto considerare chiusa la revisione**.

Sono stati verificati positivamente:

- repository locale, `origin/main`, tag `v3.4.3` e release allineati a
  `5f03f79`;
- `npm test`: PASS completo (28 programmi di test);
- `npm run lint`: PASS, zero errori;
- versione applicazione coerente a `3.4.3`;
- nessun errore JavaScript di pagina durante il collaudo;
- i toast non intercettano più i clic sui campi sottostanti;
- il registro messaggi conserva LSA e avvisi dopo la scomparsa dei toast;
- il valore vicino a 3.500 giri non è un limite imposto al campo RPM;
- analisi base, follower, 1/2/3-DOF, surge, strumenti race, A/B e animazione
  producono output finiti con i file provati;
- i sei grafici principali ricevono dataset completi e vengono disegnati.

Restano però errori di correttezza matematica, coerenza tra output e grafici,
ridimensionamento dei canvas, prestazioni durante i ricalcoli, gating dei dati
di esempio, export e release engineering.

---

## 2. Collaudo indipendente eseguito

### Dati utilizzati

- `cammes/tools/fixtures/rif2_asp_alz.scr`
- `cammes/tools/fixtures/rif2_sca_alz.scr`
- `cammes/tools/fixtures/rif1_alz.scr` per il confronto A/B

Parametri principali della prova RIF-2:

- centro aspirazione: `102° ATDC`;
- centro scarico: `103,5° BTDC`;
- gioco aspirazione: `0,30 mm`;
- gioco scarico: `0,40 mm`;
- riferimento durata: `1,0 mm`;
- regime: `6.000 rpm`;
- molla: `45 N/mm`, precarico `300 N`;
- masse equivalenti: `80 g` aspirazione, `85 g` scarico.

### Risultati base osservati

- LSA: `102,75°`;
- durata a soglia di gioco: `251° / 251°`;
- durata a `1,0 mm`: `202° / 202°`;
- apertura/chiusura aspirazione: `26,6° BTDC / 44,7° ABDC`;
- apertura/chiusura scarico: `41,3° BBDC / 29,4° ATDC`;
- overlap: `56,0°`;
- alzata al PMS: `1,123 / 1,010 mm`;
- alzata massima: `10,840 / 10,064 mm`;
- nessuna cella vuota, `NaN` o `undefined`;
- tutti i dataset principali contenevano 720 campioni finiti.

Questi valori sono utili come baseline di regressione, non come certificazione
metrologica o validazione fisica dei modelli dinamici.

### Verifica delle segnalazioni dell’utente

#### Banner e campi

Con i toast visibili:

- `elementFromPoint()` al centro del campo `springK` restituisce il campo;
- `.toast` ha `pointer-events: none`;
- il campo prende il focus;
- `ArrowUp` cambia `45 → 46`;
- `scrollY` resta `874 → 874`.

Quindi la vecchia causa “toast che ruba il clic e freccia che scorre la pagina”
risulta corretta.

#### Registro LSA

Dopo 9 secondi:

- toast visibili: `0`;
- registro messaggi: `3` voci;
- la voce “Analisi completata” conserva `LSA 102,8°`;
- la campanella apre correttamente il pannello.

La funzione esiste e lavora, ma la sua reperibilità e il significato del colore
del toast vanno ancora migliorati.

#### Lentezza e salto pagina

Il problema residuo è stato riprodotto:

- dieci pressioni `ArrowUp` sul campo molla: media `346,5 ms`, massimo `412 ms`;
- focus e scroll restano corretti, ma la risposta è visibilmente lenta;
- dopo più aggiornamenti live i canvas sono cresciuti progressivamente:
  - velocità/accelerazione/jerk: oltre `1.848 px`, poi `2.034 px`;
  - forze: oltre `3.003 px`, poi `3.315 px`;
  - altezza pagina: circa `14.458 px`.

Questo spiega il comportamento percepito come pagina che “va da sola” verso
inizio/fine: il documento cambia continuamente altezza a causa dei canvas.
Non è un limite del PC e non è solo un problema di toast.

---

## 3. Ordine di lavoro obbligatorio

### Fase A — correttezza e coerenza

Correggere prima: `P1-01` … `P1-10`.

### Fase B — prestazioni, layout e comprensibilità

Correggere poi: `P1-11`, `P1-12`, `P2-01` … `P2-08`.

### Fase C — test e release

Chiudere infine: `P2-09` … `P2-13`.

Non iniziare una nuova release finché Fase A e gli E2E della Fase B non sono
verdi.

---

# 4. Rilievi P1 — da correggere prima di considerare affidabile Analisi

## P1-01 — Crescita incontrollata dei grafici, lag dei campi e salto pagina

File coinvolti:

- `cammes/analisi.html`, CSS inline circa righe `65-70`;
- `cammes/analisi.html`, `kinChartOptions()` circa righe `3810-3837`;
- `cammes/analisi.html`, `liveRetuneForces()` circa righe `2908-2977`.

### Problema

I canvas cinematici usano Chart.js responsive con
`maintainAspectRatio: false`, ma non hanno un contenitore dedicato con altezza
stabile. Il canvas influenza l’altezza del parent e il ResizeObserver usa il
parent per ridimensionare il canvas: gli aggiornamenti ripetuti creano un
feedback di crescita.

Il live retune richiama anche `forceChart.update('none')` a ogni modifica
debounced. La combinazione produce reflow, canvas sempre più alti e forte
latenza dei campi.

### Correzione richiesta

1. Avvolgere ogni canvas Chart.js in un contenitore dedicato, ad esempio:

   ```html
   <div class="kin-chart-canvas"><canvas id="velocityCanvas"></canvas></div>
   ```

2. Dare al contenitore un’altezza esplicita e responsiva, non dipendente dal
   canvas:

   ```css
   .kin-chart-canvas {
     position: relative;
     width: 100%;
     height: clamp(260px, 30vw, 420px);
     min-height: 260px;
     max-height: 420px;
   }
   .kin-chart-canvas > canvas {
     width: 100% !important;
     height: 100% !important;
     display: block;
   }
   ```

3. Prevedere un’altezza eventualmente diversa per forze e compliance, sempre
   con limite superiore.
4. Non usare come container Chart.js un elemento la cui altezza è prodotta dal
   canvas stesso.
5. Al cambio modulo, tema e breakpoint chiamare `resize()` solo dopo che il
   contenitore è visibile.
6. Separare l’aggiornamento immediato del testo dall’aggiornamento più pesante
   dei grafici.

### Test di accettazione

- analisi a `1440×900`, `1366×768`, `1024×768` e `768×1024`;
- 100 alternanze di RPM e 100 pressioni freccia sui campi molla;
- altezza di ogni canvas stabile entro `±1 px`;
- altezza pagina stabile dopo l’assestamento;
- `scrollY` e `activeElement` invariati;
- latenza p95 input inferiore a `100 ms`;
- nessun overflow orizzontale.

---

## P1-02 — Cambio RPM: numeri nuovi, grafici velocità/accelerazione/jerk vecchi

File: `cammes/analisi.html`, circa righe `2908-2977`, `3575-3586`,
`3840-3983`.

### Prova riprodotta

Cambio live `6.000 → 9.000 rpm` con compliance e surge OFF:

- velocità scritta: rapporto `1,5` — corretto;
- grafico velocità: rapporto `1,0` — vecchio;
- grafico accelerazione: rapporto `1,0` — vecchio;
- grafico jerk: rapporto `1,0` — vecchio;
- grafico forza inerziale: rapporto `2,25` — corretto;
- `parameterHash` viene aggiornato;
- `_analysisStale === false`;
- `exportBlockedByStale() === false`.

Il PDF può quindi contenere valori al nuovo RPM e grafici al vecchio RPM.

### Correzione richiesta

Centralizzare un unico aggiornamento atomico di **tutti** gli output dipendenti
dal regime:

- KPI cinematici;
- dataset velocità con fattore `ω`;
- dataset accelerazione con fattore `ω²`;
- dataset jerk con fattore `ω³`;
- forze con fattore `ω²`;
- titoli;
- snapshot;
- hash.

Aggiornare l’hash solo dopo la sincronizzazione completa. In alternativa,
marcare sempre stale e richiedere un nuovo “Analizza”.

### Test

Confrontare `6.000 → 9.000 rpm`:

- velocità `×1,5`;
- accelerazione `×2,25`;
- jerk `×3,375`;
- forze inerziali `×2,25`;
- UI, Chart.js, CSV e PDF devono coincidere.

---

## P1-03 — Il grafico Compliance evidenzia come float la condizione opposta

File:

- `cammes/analisi.html`, circa righe `3998-4010`;
- `cammes/lib/cammes-math.js`, `detectValveFloat()`, circa righe `681-703`.

### Problema

Il grafico colora la zona rossa quando:

```js
camLift - valveLift > 0.02
```

`detectValveFloat()` definisce invece correttamente il distacco quando:

```js
valveLift - camLift > 0
```

Il grafico sta quindi marcando soprattutto la normale deformazione/ritardo
elastico come “float”, mentre il numero usa l’altra condizione.

### Correzione

- usare la stessa funzione/definizione di `detectValveFloat()`;
- evidenziare `valveLift - camLift > soglia`;
- riempire visivamente lo spazio tra le due curve;
- se il solver non converge, usare grafico neutro con watermark
  `DIAGNOSTICO — NON CONVERGENTE`, senza zone rosse autorevoli.

### Test

- regime quasi statico: nessuna zona float;
- regime alto: zona evidenziata e `maxGap` devono coincidere grado per grado;
- lato aspirazione e scarico verificati separatamente.

---

## P1-04 — Solver Compliance sfasati di un grado

File `cammes/lib/cammes-math.js`:

- 1-DOF circa righe `354-379`;
- 2-DOF circa righe `482-503`;
- 3-DOF circa righe `636-660`.

### Riproduzione

Con camma sintetica avente picco al grado `480`, a `100 rpm` la valvola ha il
picco al grado `479`.

Il ciclo integra da `deg` a `deg+1` e salva il nuovo stato in `out[deg]`.
Durante il sottopasso confronta inoltre lo stato finale con la camma
all’inizio del sottopasso.

### Correzione

Definire una convenzione unica per i tre solver:

- integrare lo stato fino al grado che verrà scritto;
- salvare lo stato al suo indice effettivo;
- valutare il contatto con la posizione camma allo stesso istante finale;
- documentare esplicitamente origine e indice temporale.

Una possibile struttura è integrare nel ciclo destinato a `out[deg]` da
`deg-1` fino a `deg`, usando la camma al termine di ogni sottopasso. Verificare
la formula con il test, non soltanto con un commento.

### Test

- sinusoide a bassissimo regime;
- picco camma e valvola allineati entro tolleranza numerica;
- nessun anticipo artificiale di `1°`;
- stesso test per 1/2/3-DOF.

---

## P1-05 — Il gioco valvola viene moltiplicato per il rocker ratio

File:

- `cammes/lib/cammes-math.js`, mapping circa righe `1036-1038`;
- `cammes/analisi.html`, pipeline circa righe `3311-3329`;
- confronto A/B e Cam Card.

### Problema

Il campo è chiamato “Gioco valvola”, ma la pipeline corrente realizza:

```text
(alzata_camma - gioco_valvola) × rocker
```

La relazione coerente col significato del campo è:

```text
max(0, alzata_camma × rocker - gioco_valvola)
```

Esempio: camma `7 mm`, rapporto `1,5`, gioco valvola `0,20 mm`:

- attuale: `10,20 mm`;
- coerente col campo: `10,30 mm`.

### Correzione

- mappare la camma senza sottrarre il gioco lato valvola;
- applicare il rapporto una volta sola;
- sottrarre il gioco dopo la trasformazione;
- allineare analisi principale, import preliminare, A/B, Cam Card, CSV e PDF.

### Test

Usare oracoli analitici con rocker `1,0`, `1,5`, `2,0`, più durate ed eventi ai
crossing.

---

## P1-06 — `kPivot` 3-DOF non modella la cedevolezza del pivot

File:

- `cammes/lib/cammes-math.js`, circa righe `567`, `620-623`;
- `cammes/analisi.html`, input circa righe `515-518`;
- `cammes/tools/test_3dof.js`, test circa righe `108-124`.

### Riproduzione numerica

- `kPivot = 0`: picco valvola `9,23 mm`;
- `20.000`: `0,31 mm`;
- `60.000`: `0,067 mm`;
- `1.000.000`: circa `0 mm`.

La molla è applicata a terra direttamente alla coordinata mobile: aumentando
la rigidezza si blocca il bilanciere. Il limite fisico di pivot rigido dovrebbe
convergere al normale modello con pivot fermo, non a valvola immobile.

### Correzione

Scelta minima e onesta:

- disabilitare/rimuovere temporaneamente `kPivot` e forzarlo a zero.

Scelta completa:

- introdurre coordinata di traslazione pivot e coordinata rotazionale rocker;
- applicare bracci di leva e trasformazione delle forze;
- verificare energia, equilibrio statico e limite `kPivot → ∞`.

Il test attuale “il parametro cambia qualcosa” è inadeguato e va sostituito da
un oracolo fisico.

---

## P1-07 — Gate “valori molla di esempio” incompleto e globale

File `cammes/analisi.html`, circa righe:

- `2812-2878`;
- `3512-3525`;
- `3654-3658`;
- `3755-3780`;
- `4578-4593`;
- `5029-5037`, `5132`, `5232`, `5305`.

### Riproduzione

Senza toccare i quattro valori di esempio:

- `mollaConfermata === false`;
- distacco valvola: `non valutabile`;
- ma UI mostra ancora:
  - forza inerziale aspirazione `1.443,6 N`;
  - forza molla aspirazione `525,2 N`;
  - margine aspirazione `-920,1 N`;
- CSV contiene ancora forze e margine numerici e solo dopo aggiunge
  l’avvertenza.

Il PDF conserva a sua volta dettagli, percentuali e barre calcolati sui default.
Il gate è inoltre globale: una massa scarico non confermata rende non
valutabile anche l’aspirazione.

### Correzione

Creare uno stato tipizzato per lato:

```text
aspirazione valutabile = k confermata + F0 confermato + massa asp. confermata
scarico valutabile     = k confermata + F0 confermato + massa scar. confermata
```

Applicarlo a:

- forza molla;
- forza inerziale dipendente dalla massa;
- margine;
- distacco;
- compliance;
- surge;
- sweep/optimizer/mappe;
- toast e registro;
- snapshot, CSV, PDF e Race Report.

Non nascondere le grandezze cinematiche che non dipendono dalla molla.
Nessun “OK”, rosso o verde deve essere emesso con input di esempio.

### Matrice di accettazione

1. Tutto default: nessun verdetto o margine numerico dipendente dalla molla.
2. Solo aspirazione confermata: aspirazione numerica, scarico non valutabile.
3. Entrambi confermati: risultati normali.
4. Un campo svuotato: il relativo lato torna non valutabile.
5. Preset: resta “valore tipico non confermato”.
6. Reset: torna allo stato di esempio.
7. UI, toast, registro, CSV e PDF riportano lo stesso stato.

---

## P1-08 — Surge usa anche una Compliance invalida e perde lo stato preliminare

File:

- `cammes/analisi.html`, circa righe `3503-3526`, `3672-3677`,
  `4614-4618`, `5252-5258`;
- `cammes/lib/cammes-math.js`, circa righe `845-849`.

### Problema

```js
simulateSpringSurge(valveLiftIn || anlIn, ...)
```

Un array `INVALID_INPUT` o `NON_CONVERGED` è truthy e viene quindi usato come
drive. È stato riprodotto un caso con compliance invalida e surge che restituisce
comunque frequenza e ratio apparentemente positivi.

Inoltre `simulateSpringSurge()` dichiara `preliminary: true` e `settleCycles: 3`,
ma snapshot/export perdono questa informazione; il PDF può scrivere “ok” e
“regime critico”.

### Correzione

- usare la traiettoria compliance solo se `status === CONVERGED`;
- altrimenti impostare `NON_VALUTABILE_DRIVE`;
- non fare fallback silenzioso alla camma;
- salvare stato, `preliminary`, `settleCycles`, `diverged`,
  `maxCoilAmpMm`;
- dichiarare sempre `STIMA PRELIMINARE — convergenza del surge non verificata`;
- specificare che il calcolo corrente riguarda solo aspirazione.

---

## P1-09 — Finger follower: tilt inerte e possibile doppio rocker ratio

File:

- `cammes/lib/cammes-math.js`, `convertPuntToFinger()`, circa righe `852-885`;
- `cammes/tools/test_followers.js`, circa righe `101-106`;
- pipeline follower/rocker in `cammes/analisi.html`.

### Problemi

1. `fingerTilt = 0°` e `30°` producono una differenza massima di circa
   `5,27e-15 mm`: il parametro è matematicamente un no-op.
2. Il converter Finger amplifica già tramite `LValve/LArm`; `analyze()` può poi
   applicare anche `rockerIntake/Exhaust`, ottenendo doppia amplificazione.

### Correzione

- scegliere una sola fonte del rapporto;
- oppure il converter restituisce moto lato cam e il rapporto centrale lo porta
  alla valvola, oppure restituisce già moto valvola e il rocker extra è bloccato
  a `1`;
- per il tilt:
  - eliminarlo e dichiarare il modello come puro rapporto, oppure
  - introdurre una geometria reale con angolo iniziale indipendente.

### Test

- test che fallisce se tilt non produce alcun effetto, se il parametro resta;
- oracolo analitico per il rapporto;
- test esplicito contro doppia applicazione.

---

## P1-10 — “Velocità di appoggio” non è la velocità alla sede

File `cammes/analisi.html`:

- `extractKinematicResults()`, circa righe `2729-2779`;
- etichette/tooltip circa righe `825` e `848`.

### Problema

Il valore di chiusura è il minimo globale della velocità sull’intero giro.
Non è la velocità interpolata nel crossing di chiusura e quindi non misura
l’appoggio sulla sede descritto dal tooltip.

### Correzione

Scelta minima:

- rinominare in `Velocità massima sul fianco di chiusura`.

Scelta fisica:

- interpolare la velocità in `findEvents(...).closeIdx`;
- con 3-DOF usare la velocità relativa valvola-sede al contatto.

Non usare l’espressione “martella la sede” se il dato non è calcolato al
contatto.

---

## P1-11 — Strumenti Race sincroni e utilizzabili su analisi stale

File `cammes/analisi.html`, funzioni circa righe:

- `1169`, `1239`, `1449`, `1568`, `1766`, `1826`;
- stato stale circa `2988-3062`.

### Problema prestazionale

Il `setTimeout()` iniziale consente solo un repaint, poi il calcolo gira
sincrono sul main thread. Nel test la sola mappa ha prodotto un gap del loop di
circa `361 ms`; su un PC più lento o con altri parametri può essere maggiore.
Durante il job frecce, input e scroll non possono rispondere.

### Problema di coerenza

Gli strumenti leggono una miscela di `lastAnalysis` e DOM corrente e non
invocano la guardia stale degli export.

### Correzione

- usare Web Worker o calcolo cooperativo a chunk;
- progress bar reale, pulsante Annulla, `_jobRunning` e protezione doppio clic;
- Reset deve cancellare il job;
- introdurre `requireFreshAnalysis()` comune a export e strumenti;
- usare esclusivamente uno snapshot immutabile con `analysisId/hash`.

### Test

- input latency p95 `<100 ms` durante caso peggiore;
- doppio clic = un solo job;
- annullamento e Reset lasciano zero timer/worker;
- dopo modifica follower/angolo/compliance nessuno strumento parte prima di
  una nuova analisi.

---

## P1-12 — Validazione numerica centralizzata mancante

File `cammes/analisi.html`, letture input circa righe `2380`, `3290`,
`3434-3465`.

### Problemi

- `Number(value) || default` trasforma zeri validi nel default;
- `rPunt = 0`, ammesso dalla UI/libreria, diventa `1,5`;
- campi vuoti, negativi, `NaN` o fuori intervallo possono diventare zero o
  propagarsi;
- RPM zero lascia risultati precedenti o un infinito apparentemente sicuro.

### Correzione

- schema di validazione unico per modulo attivo;
- usare `finiteOr()` solo dove zero è ammesso;
- errori persistenti accanto al campo con `aria-invalid` e `aria-describedby`;
- bloccare analisi e strumenti dipendenti;
- non imporre un tetto RPM arbitrario: un valore implausibile può generare un
  warning, non un limite nascosto.

### Test

Vuoto, zero, negativo, stringa, `NaN`, damping fuori intervallo, massa/rigidezza
non positiva, e valori estremi. Nessun risultato vecchio o falso “sicuro” deve
restare visibile.

---

# 5. Rilievi P2 — usabilità, export, test e release

## P2-01 — Tema chiaro ancora poco leggibile

File:

- `cammes/style.css`, token circa righe `50-67`, tema light `159-202`,
  input `764-781`;
- colori hardcoded dei grafici in `cammes/analisi.html`.

Contrasti calcolati:

- testo input `#ffb820` su `#f0f3f9`: circa `1,56:1`;
- input in focus `#00d4ff` su `#f0f3f9`: circa `1,59:1`;
- linea cyan su bianco: circa `1,77:1`;
- bordo giallo “valore di esempio”: circa `1,40:1`.

I nuovi token hanno corretto le sole `.result-value`, non input, curve e
canvas custom.

### Correzione

- token separati `--input-value`, `--focus-ring`, `--chart-intake`,
  `--chart-exhaust`, `--state-border`;
- varianti scure nel tema chiaro;
- linee distinguibili anche con dash/marker, non solo colore;
- aggiornare tutti i chart, timing, compliance e canvas custom al cambio tema.

Acceptance: testo `≥4,5:1`, componenti/linee `≥3:1`.

---

## P2-02 — Reset incompleto

File: `cammes/analisi.html`, `resetAll()`, circa righe `5407-5473`.

Riproduzione dopo `Analizza → modifica parametro → Reset`:

- `_analysisStale === true`;
- banner stale ancora `display:block`;
- `window.lastForceContext` ancora presente;
- `_liveRetuneTimer` ancora presente;
- `lastAnalysis` correttamente nullo.

### Correzione

- `clearTimeout(_liveRetuneTimer)`;
- azzerare timer dei toast ritardati/generation token;
- `lastForceContext = null`;
- azzerare ogni riferimento chart globale;
- `clearAnalysisStale()`;
- annullare job race/worker;
- rimuovere risultati e messaggi appartenenti all’analisi cancellata.

---

## P2-03 — Stato di convergenza ed export incompleti

File `cammes/analisi.html`, snapshot circa righe `3664-3667`.

`Math.max(residual || 0, ...)` trasforma residui nulli in zero. Viene conservato
solo `residualX`, mentre la convergenza usa anche la velocità.

### Correzione

- conservare `statusIn/statusEx`;
- `residualXIn/Ex`, `residualVIn/Ex`, tolleranze per lato;
- non convertire `null/NaN` in zero;
- mostrare quale lato e criterio non converge;
- CSV deve includere `valveLiftIn/Ex` e gap dinamico;
- valori non finiti nel dump non devono diventare zeri fisici tramite `|| 0`.

---

## P2-04 — Ottimizzatore molla non fa il passaggio fine dichiarato

File: `cammes/analisi.html`, circa righe `1130-1165`.

Il commento promette coarse + fine, ma esiste solo la griglia `11×8`.
`kNorm + F0Norm` non equivale a “molla più leggera”. La ricerca valuta solo
l’aspirazione.

### Correzione

- seconda griglia locale attorno alla candidata coarse;
- rinominare il costo in modo onesto o mostrare fronte di Pareto;
- valutare il peggiore tra aspirazione e scarico;
- non usare termini “ottimale/sicuro” senza gli altri vincoli fisici;
- conservare le esclusioni: coil bind, stress, fatica e geometria.

---

## P2-05 — Terminologia poco chiara

Sostituzioni consigliate:

- `Compliance treno valvole` → `Elasticità del comando valvola (compliance)`;
- `Surge molla` → `Risonanza delle spire (surge)`;
- `Damping ζ` → `Smorzamento (ζ)`;
- `Valve float` → `Perdita di contatto camma–valvola (valve float)`;
- `1-DOF` → `1 massa — modello semplice`;
- `2-DOF` → `2 masse — asta/bilanciere separati`;
- `3-DOF` → `3 masse — include la sede`;
- `LSA` → `Separazione fra i centri lobo (LSA)`.

Il toast “Analisi completata” con LSA non deve essere verde se è soltanto un
riepilogo neutro. Verde/rosso vanno riservati a un giudizio esplicito e
qualificato.

Correggere anche la frase “l’incrocio individua il regime critico” nel grafico
forze: un grafico a RPM fissato mostra il margine a quel regime, non determina
da solo l’intero limite senza lo scaling dichiarato.

---

## P2-06 — Registro messaggi ancora parziale

File: `cammes/cammes-ui.js`, circa righe `84-220`.

Funzione base verificata. Restano:

- `msgUnread` si azzera a ogni caricamento, pur mantenendo il log;
- manca `analysisId`, pagina e timestamp ISO;
- callback ritardate di un’analisi possono apparire dopo una nuova analisi o
  Reset;
- la sola icona campanella può non essere riconosciuta dall’utente.

### Correzione

- salvare `analysisId`, pagina, timestamp e severity;
- persistente `lastReadIndex/lastReadId`;
- generation token per scartare toast vecchi;
- primo messaggio esplicito: `Puoi rileggere i risultati dalla campanella`;
- riepilogo persistente “Ultima analisi” vicino al pulsante Analizza.

---

## P2-07 — Label, help e accessibilità tastiera

Molti controlli usano `span.param-label` e non un vero `<label for>`.
Le icone `?` non sono più focusabili e il focus sul campo adiacente non apre
automaticamente il relativo aiuto.

### Correzione

- `<label for>` o `aria-labelledby` per ogni input;
- unità e spiegazione collegate con `aria-describedby`;
- se `?` resta interattivo, usarlo come vero `button` con Enter/Space/Escape e
  touch;
- `aria-expanded`, `aria-controls`, gestione focus per pannelli;
- test axe senza controlli senza nome.

---

## P2-08 — Moduli grafici attivati dopo l’analisi

L’analisi può creare Chart.js mentre il modulo è nascosto. La comparsa successiva
dipende dal ResizeObserver e non ha un E2E dedicato.

### Correzione

- creazione lazy oppure `resize()/update()` dopo la visibilità;
- CTA chiara: `Attiva Cinematica per vedere i grafici`;
- preset `Analisi completa`;
- test `modulo OFF → Analizza → modulo ON`, senza nuova analisi o resize manuale.

---

## P2-09 — SBOM CycloneDX non conforme e incompleto

File:

- `cammes/tools/gen_sbom.js`;
- `cammes/SBOM.json`;
- `cammes/SBOM.md`;
- `.gitattributes`, `pkg.assets`, `THIRD_PARTY_NOTICES.md`.

### Problemi verificati

- algoritmo scritto come `SHA-512-base64`, non ammesso da CycloneDX 1.5;
- contenuto SHA-512 lasciato Base64 invece che esadecimale;
- 218 hash npm su 222 componenti non conformi allo schema;
- mancano almeno plugin zoom, Hammer.js, font, avrdude e configurazione;
- hash dei browser asset normalizzato a LF, quindi non necessariamente uguale
  ai byte realmente distribuiti.

### Correzione

```js
{
  alg: 'SHA-512',
  content: Buffer.from(base64, 'base64').toString('hex')
}
```

- fissare gli asset a LF o trattarli come binari;
- hashare i byte effettivi distribuiti;
- inventario completo delle dipendenze incluse;
- validazione ufficiale CycloneDX nel CI;
- test di coerenza tra `pkg.assets`, notices e SBOM.

Non spostare il tag v3.4.3: correggere in una versione successiva.

---

## P2-10 — CI applicativa solo dopo il tag

La release esegue i gate solo sul tag; il workflow firmware non copre
l’applicazione. La prima esecuzione di v3.4.3 è fallita e il tag è stato
riutilizzato/spostato.

### Correzione

Creare `ci.yml` per push su `main` e pull request con:

- `npm ci`;
- lint;
- suite completa;
- parsing degli script inline HTML;
- E2E minimo;
- version check;
- generazione/idempotenza/validazione SBOM.

La release deve riusare lo stesso preflight. Non riutilizzare tag pubblicati.

---

## P2-11 — Test server intermittenti

Ripetizioni hanno mostrato failure intermittenti in:

- `test_ws_frame_validation.js`;
- `test_controller_lease.js` con `ECONNREFUSED`.

`test_controller_lease.js` usa attesa fissa di `1.500 ms`.

### Correzione

- polling HTTP/WS fino a readiness reale;
- ascoltare `error` ed `exit` del processo;
- cleanup con attesa della terminazione;
- helper condiviso per server test;
- porte dinamiche e diagnostica stdout/stderr.

Acceptance: 30 esecuzioni consecutive verdi e zero processi orfani.

---

## P2-12 — Copertura automatica mancante per le revisioni v3.4.3

Non risultano test committati per:

- click-through, chiusura e limite toast;
- registro e unread;
- `mollaConfermata`;
- coerenza valori di esempio UI/CSV/PDF;
- live retune;
- crescita canvas;
- cambio tema dopo la creazione dei grafici;
- Reset dopo retune;
- stale guard degli strumenti race;
- frecce/focus/scroll.

Gli script inline HTML non sono coperti dal lint normale.

### E2E minimo obbligatorio

Usare Playwright con fixture RIF-2:

1. import aspirazione/scarico;
2. analisi base;
3. toast visibile + click campo + frecce;
4. 100 retune con altezza canvas invariata;
5. RPM scaling di KPI e grafici;
6. default/preset/conferma per lato della molla;
7. 1/2/3-DOF convergente e non convergente;
8. surge valido/invalido;
9. tema dark/light dopo i grafici;
10. `768`, `1024`, `1366`, `1920 px`;
11. Reset e nuova analisi;
12. registro attraverso navigazione;
13. A/B, animazione, mappe e worker cancellabile;
14. CSV/PDF coerenti con lo snapshot.

---

## P2-13 — Documentazione di release non allineata

Aggiornare/generare automaticamente:

- conteggio suite/check nel README;
- `THIRD_PARTY_NOTICES.md`;
- stato REL-07 in `fw/version.json`;
- `RELEASE_MANIFEST.json` con SHA immutabile;
- vulnerabilità separate runtime/dev con data dell’audit;
- note release GitHub non vuote.

Il runtime risulta distinto dalla toolchain di sviluppo: non mescolare i due
conteggi.

---

# 6. Rilievi P3 e correzioni testuali puntuali

1. Tooltip `Analizza` dichiara “almeno una camma”, ma il codice richiede
   entrambi i file.
2. Tooltip `Reset` dichiara che i parametri restano, ma il codice ripristina
   angoli, giochi, RPM, molla e masse.
3. Con RPM zero il calcolo del regime di distacco restituisce infinito perché
   scala la forza già calcolata a zero. Calcolare direttamente il coefficiente
   per `rpm²` oppure dichiarare il dato non valutabile.
4. Il CSV maschera eventuali valori non finiti con `|| 0`; usare campo vuoto o
   `n.d.`.
5. Aggiungere nel CSV dinamico traiettoria valvola e gap compliance.

---

# 7. Comandi e gate finali

Eseguire dalla cartella `cammes/`:

```powershell
npm ci
npm run lint
npm test
```

Aggiungere ed eseguire:

```powershell
npm run test:e2e
npm run test:sbom
npm run test:html-inline
```

Gate aggiuntivi:

- 30 ripetizioni dei test server;
- validazione CycloneDX ufficiale;
- `git diff --exit-code` dopo rigenerazione SBOM;
- verifica che firmware 4.1 e relativo hash siano invariati;
- nessun file fixture modificato;
- nessun nuovo riferimento a sistemi di emergenza hardware.

---

# 8. Condizione di chiusura

Il lavoro è chiuso soltanto quando:

- tutti i P1 hanno test che falliscono sulla v3.4.3 e passano dopo il fix;
- valori scritti, grafici, snapshot, CSV e PDF usano la stessa analisi;
- la pagina non cambia altezza durante retune o job;
- input e frecce restano reattivi;
- compliance e surge dichiarano chiaramente stato e limiti del modello;
- nessun giudizio usa dati di esempio o solver non convergente;
- suite, lint, E2E, SBOM e CI risultano verdi;
- il rapporto finale di Claude Code elenca onestamente gli eventuali residui.

Fine handoff.
