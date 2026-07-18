# CAMMES v3.3.0 — handoff operativo completo per Claude

> Revisione Codex del 18 luglio 2026  
> Progetto verificato: CAMMES v3.3.0  
> Commit/tag esaminato: 68eb14d / v3.3.0  
> Scopo: correggere i rilievi residui della revisione v3.3.0 con implementazioni verificabili, non soltanto con modifiche documentali.

## Messaggio da incollare nella chat di Claude

~~~text
Ti allego l'intera cartella del progetto CAMMES e il file
HANDOFF_CLAUDE_CORREZIONI_V3.3.0.md.

Leggi integralmente questo file e i file di prima parte pertinenti prima di
modificare il progetto. Il documento descrive sia ciò che non è ancora corretto,
sia l'architettura consigliata, i test da aggiungere e i criteri di accettazione.

Non limitarti a cambiare testi, badge o dichiarazioni. Correggi il comportamento
reale nei percorsi effettivamente usati da server, firmware e interfaccia.
Procedi per lotti coerenti nell'ordine indicato. Prima di ogni lotto mostra:

1. ID affrontati e causa confermata;
2. file che prevedi di modificare;
3. design scelto;
4. test che devono fallire prima e passare dopo;
5. eventuali verifiche hardware non eseguibili via software.

Non dichiarare un rilievo VERIFIED basandoti solo su test software o fixture
generate dalla stessa pipeline. Usa FIXED_SOFTWARE, PARTIAL,
NEEDS_HARDWARE_VALIDATION o VERIFIED con il significato definito nel documento.

Non ricostruire o distribuire una release finale finché i P0, i gate funzionali
e i test previsti non sono stati completati. Conserva in un registro finale
evidenza, comandi, risultati e rischi residui per ogni ID.
~~~

---

# 1. Verdetto della revisione

La versione 3.3.0 contiene miglioramenti reali e sostanziali. In particolare:

- confine statico pubblico/privato molto più robusto;
- ricampionamento frazionario, segni ASP/SC e anticipo migliorati;
- verdetto banco più severo sui dati mancanti;
- gestione dei timer dopo STOP corretta;
- comando tone reso interrompibile;
- watchdog e parser firmware migliorati;
- suite di test e lint funzionanti;
- aggiornamento di ws;
- diversi percorsi XSS e di robustezza server corretti;
- HEX firmware 3.6 formalmente valido.

Non è però sostenibile dichiarare tutti i 15 P0 chiusi, tutti i rilievi software
risolti o il sistema validato fisicamente/metrologicamente.

Consuntivo dei 15 P0 originari:

| ID | Stato riscontrato | Nota |
|---|---|---|
| SEC-01 | PARTIAL | Host/Origin presenti, ma nessuna autenticazione e allowlist troppo permissiva |
| SEC-02 | FIXED_SOFTWARE | Allowlist statica e containment corretti |
| MOT-01 | FIXED_SOFTWARE | Timer registrati e generation token presenti |
| MOT-02 | PARTIAL | Manca una FSM autorevole condivisa |
| MOT-03 | PARTIAL | Socket UI unificato, ma perdita controller non ferma il moto |
| MOT-04 | OPEN | Nessun controller esclusivo o lease |
| FW-02 | FIXED_SOFTWARE | Tone controlla STOP; latenza fisica peggiore non verificata |
| FW-03 | PARTIAL | Watchdog presente, ma fail-safe e fault locali incompleti |
| MET-01 | PARTIAL/P0 REGRESSION | I giri ripetuti possono ricreare zero da dati mancanti |
| MET-02 | FIXED_SOFTWARE | Dati mancanti rendono il banco non valutabile |
| MAT-01 | FIXED_SOFTWARE | Centri frazionari corretti |
| MAT-02 | FIXED_SOFTWARE CORE | Rotazione corretta; naso piatto ancora non robusto |
| MAT-03 | PARTIAL | Segni corretti; eventi asimmetrici ancora errati |
| MAT-04 | FIXED_SOFTWARE CORE | Anticipo sulle curve corretto; output eventi dipende da MAT-03 |
| DYN-01 | FIXED_SOFTWARE METRICA | Metrica migliorata; nessuna validazione fisica indipendente |

Totale: 8 P0 chiusi a livello software, 6 parziali, 1 aperto.

## 1.1 Baseline verificata

- npm test: 13 suite superate.
- npm run lint: superato.
- Applicazione: 3.3.0.
- Firmware sorgente/HEX: 3.6.
- SHA-256 HEX corrente:
  21031C77CF908FFEEB93A7B03E74B882175A5ACEB29D3CB07E25360B79124F8D.
- EXE DIST_v3.3.0 non firmato, metadata runtime Node 18.5.0.
- Tag v3.3.0 annotato, ma non firmato.
- npm audit applicazione: una vulnerabilità moderata diretta in pkg 5.8.1,
  senza patch disponibile.
- package-lock.json dell'app dichiara ancora versione 3.2.0.
- Esiste un package-lock.json v1 orfano nella radice.
- L'HEX è formalmente valido, ma la corrispondenza riproducibile
  sorgente → HEX non è stata dimostrata.
- Non sono disponibili prove indipendenti di STOP peggiore, ENA,
  boot/reset/flash, encoder bloccato, sensore guasto o taratura metrologica.

I test esistenti sono utili come regressioni software, ma non coprono le
principali condizioni di concorrenza, perdita controller, dati incompleti,
fasatura asimmetrica, browser E2E e validazione fisica.

---

# 2. Regole non negoziabili

1. Il server deve essere l'autorità unica del banco. I flag nel browser non
   possono essere considerati interblocchi affidabili.
2. Nessun dato mancante, NaN, infinito, fuori scala o instabile può essere
   trasformato in zero fisico.
3. STOP ha priorità assoluta, è idempotente e deve produrre un evento terminale.
4. La perdita del controller deve arrestare il moto; il keep-alive server non
   deve mascherarla.
5. FREE, LOCK, stato di moto e fault devono essere mostrati dalla UI soltanto
   dopo conferma server/firmware.
6. Un solo client può controllare il banco; gli altri sono osservatori.
7. Un firmware legacy o con protocollo incompatibile non deve provocare un
   fallback automatico a un altro motore di scansione.
8. Un profilo incompleto può essere conservato come diagnostica, ma non può
   produrre conformità, timing, cam card o risultato certificabile.
9. Test generati dalla stessa pipeline non costituiscono validazione fisica.
10. Non modificare o cancellare profili SCR, workbook, PDF, HEX, log storici o
    dati di misura senza autorizzazione esplicita.
11. Non includere automaticamente dati di misura in Git o nella release.
12. Ogni fix deve essere accompagnato da un test che falliva prima della patch.
13. Non nascondere un problema cambiando soltanto un testo o abbassando la severità.
14. Le soglie fisiche devono essere configurate e motivate; non introdurre
    numeri arbitrari per far passare i test.

> Perimetro concordato: non sono richiesti nuovi sistemi hardware di arresto.
> STOP, FREE e controllo unico restano requisiti funzionali del software.

## 2.1 Stati ammessi nel registro

| Stato | Significato |
|---|---|
| CONFIRMED | Problema riprodotto o dimostrato dal flusso reale |
| FIXED_SOFTWARE | Patch implementata e test software pertinenti passanti |
| PARTIAL | Miglioramento presente, criterio non completamente soddisfatto |
| NEEDS_HARDWARE_VALIDATION | Serve banco, cablaggio o strumentazione reale |
| VERIFIED | Verificato anche al livello fisico/metrologico richiesto |
| NOT_REPRODUCED | Tentativo documentato, problema non confermato |
| BLOCKED | Manca un requisito o dato indispensabile |

FIXED_SOFTWARE non equivale a VERIFIED per moto, encoder, sensore, driver,
temporizzazioni o accuratezza metrologica.

## 2.2 Definition of done per ogni rilievo

Un rilievo può essere chiuso soltanto se esistono:

1. causa confermata;
2. patch nel percorso realmente usato;
3. test positivo, negativo e caso limite;
4. prova che il test falliva sul comportamento precedente;
5. output atteso esplicito;
6. assenza di regressioni nella suite completa;
7. documentazione/protocollo aggiornati;
8. eventuale procedura hardware con dati grezzi;
9. stato e rischio residuo registrati;
10. nessuna dichiarazione più forte dell'evidenza disponibile.

---

# 3. Ordine obbligatorio dei lavori

## Lotto A — Controllo affidabile del moto

Copre lease, autorità server, FSM, STOP/ACK, perdita controller, FREE/LOCK,
Concerto, flash e shutdown. Questo lotto precede qualsiasi nuova funzione.

## Lotto B — Firmware e protocollo

Copre protocollo versionato, parser rigoroso, heartbeat dedicato, fault locali,
stato interrogabile, device ID, boot sicuro e test del firmware reale.

## Lotto C — Integrità della misura

Copre missing data, run ripetuti, parser SCR, conformità, metadati, posizioni
persistenti ed encoder.

## Lotto D — Fasatura e matematica

Copre attraversamenti reali, profili asimmetrici, naso piatto, mapping encoder
e unificazione degli output.

## Lotto E — Dinamica e applicazione

Copre convergenza, input zero, validazione indipendente, snapshot immutabile,
stale/export e Web Worker.

## Lotto F — Protezione rete, API e browser

Copre autenticazione, CSRF, schema API, limiti WS, scritture atomiche,
backup/restore, XSS, CSP e logging.

## Lotto G — Release e documentazione

Copre runtime supportato, packager, dipendenze, firma, manifest, SBOM,
firmware riproducibile, CI e correzione delle dichiarazioni.

Non lavorare su più lotti contemporaneamente se ciò rende impossibile attribuire
una regressione. Chiudere e verificare ogni lotto prima del successivo.

---

# 4. Lotto A — Autorità unica, controller lease e FSM

## 4.1 Problemi correnti

Riferimenti principali:

- cammes/cammes_server.js:1064-1139 — ogni WebSocket può scrivere seriale;
- cammes/cammes_server.js:1424-1432 — keep-alive seriale continuo;
- cammes/cammes_server.js:1553-1564 — shutdown senza STOP+ACK;
- cammes/cammes-scan.js:43-50 — disconnect seguito solo da reconnect;
- cammes/home.html:2169-2177 — Concerto apre un socket indipendente;
- cammes/alzata.html:1262-1278 — busy state soltanto client-side;
- cammes/alzata.html:1231-1287 — STOP/reload senza ACK terminale.

Con il codice corrente:

- più client possono intercalare comandi;
- chiudere il browser non ferma una scansione autonoma;
- il keep-alive del server mantiene vivo il watchdog firmware;
- un callback UI obsoleto può tentare una ripartenza;
- il server non conosce in modo autorevole SCANNING, MANUAL o FREE;
- shutdown e flash si affidano a ipotesi temporali.

## 4.2 Design richiesto: controller lease

Il server deve essere l'unico componente che scrive sulla seriale.

UI → server deve usare messaggi versionati, ad esempio:

~~~json
{
  "v": 1,
  "type": "command",
  "requestId": "uuid",
  "leaseId": "uuid",
  "runId": 42,
  "operation": "START_SCAN",
  "args": {
    "direction": -1,
    "units": 360
  }
}
~~~

Requisiti:

- il primo client autorizzato acquisisce un lease casuale legato al socket;
- gli altri client sono observer read-only;
- heartbeat applicativo raccomandato ogni 500 ms;
- TTL raccomandato 2 s, misurato con clock monotono server;
- chiusura socket/ping fallito revoca subito il lease;
- lease scaduto non può essere riutilizzato;
- takeover solo con banco confermato IDLE e conferma esplicita;
- ogni client autenticato può chiedere STOP;
- soltanto il proprietario può configurare, muovere, usare FREE/LOCK,
  Concerto o flash;
- home.html deve usare lo stesso lease e la stessa API di Alzata;
- nessun testo WebSocket arbitrario deve raggiungere Arduino.

Alla perdita del lease:

1. invalidare immediatamente runId e callback pendenti;
2. portare lo stato server a STOPPING;
3. inviare STOP con priorità;
4. attendere evento terminale firmware;
5. interrompere il keep-alive se l'ACK non arriva;
6. entrare in FAULT se non è possibile confermare l'arresto;
7. bloccare qualsiasi nuovo moto fino a recovery esplicita.

## 4.3 FSM autorevole server

Stati minimi:

~~~text
OFFLINE
IDLE_LOCKED
CONFIGURING
SCANNING
MANUAL
TONE
STOPPING
FREE
FLASHING
FAULT
~~~

Regole:

- lo stato cambia su ACK/evento firmware, non sul click;
- IDLE_LOCKED → SCANNING/MANUAL/TONE solo con lease valido;
- qualunque stato di moto → STOPPING su STOP, perdita lease, perdita seriale
  o fault;
- STOPPING → IDLE_LOCKED soltanto con evento terminale;
- timeout STOP → FAULT;
- IDLE_LOCKED → FREE soltanto dopo ACK FREE;
- FREE → IDLE_LOCKED soltanto dopo ACK LOCK;
- reset/boot inatteso, firmware incompatibile o seriale persa → FAULT/OFFLINE;
- FLASHING deve essere acquisito prima delle operazioni asincrone;
- recovery da FAULT richiede causa risolta e azione esplicita;
- tra scansioni ripetute lo stato resta occupato;
- un evento con vecchio runId non può cambiare lo stato corrente.

La coda seriale deve essere unica. Al massimo un comando ordinario resta in
attesa di ACK. STOP invalida la generazione, svuota la coda ordinaria e
passa davanti a tutto.

## 4.4 STOP e ACK terminale

STOP deve essere idempotente anche a banco fermo.

Flusso richiesto:

1. server invalida runId e coda;
2. stato STOPPING;
3. STOP prioritario inviato;
4. firmware porta STEP al livello inattivo e termina ogni operazione;
5. firmware emette un solo evento terminale con stato e causa;
6. server passa a IDLE_LOCKED o FAULT;
7. UI aggiorna pulsanti e messaggi dallo stato server.

Esempi di risposta:

~~~text
EVT STOPPED run=42 reason=USER state=IDLE_LOCKED
EVT FAULT run=42 code=HOST_TIMEOUT state=FAULT
~~~

Valutare un byte fuori banda CAN 0x18 per STOP seriale prioritario. Se si
mantiene un comando lineare, deve comunque essere riconosciuto in qualunque
fase entro il limite misurato.

Tutte le attese firmware devono essere cooperative: movimento, tone, settle,
lettura sensore, scansione e rampa. safeReload deve attendere IDLE_LOCKED,
FREE o FAULT; non deve ricaricare dopo un timeout fisso.

Target funzionali iniziali da confermare con prove sul banco:

- STOP ricevuto dal server → ultimo fronte STEP: massimo 100 ms;
- perdita controller → ultimo STEP: massimo TTL lease + 100 ms;
- perdita Node/USB → arresto entro timeout firmware documentato,
  raccomandato non oltre 2 s;
- dopo ACK STOP, nessun STEP senza un nuovo START esplicito.

## 4.5 FREE/LOCK

Problemi correnti:

- master/master.ino:568-595 — TONE genera passi senza verificare g_motorFree;
- cammes/alzata.html:1566-1597 — la UI cambia stato prima dell'ACK;
- il firmware scarta FREE durante il moto senza risposta;
- boot annuncia free=0 mentre lo stato elettrico ENA non è riconciliato.

Correzione:

- tutti i percorsi di moto devono passare da una sola beginMotion;
- nessun ramo deve scrivere ENA direttamente;
- usare funzioni driverEnable/driverDisable con polarità documentata;
- in FREE, p/q/$/S/TONE producono NACK FREE e zero STEP;
- FREE richiesto durante moto deve restituire BUSY oppure eseguire prima STOP;
- la UI mostra FREE/LOCK solo dopo ACK server;
- al reconnect la UI interroga lo stato;
- boot preferibilmente con driver disabilitato e stato FREE, richiedendo LOCK
  esplicito prima del moto;
- politica ENA di STOP e FAULT documentata in MOTION_CONTROL_MODEL.md.

## 4.6 Flash sicuro

In cammes_server.js:

- acquisire FLASHING in modo sincrono prima di SerialPort.list;
- richiedere autenticazione e lease;
- accettare flash solo da IDLE_LOCKED o FREE confermati;
- inviare STOP e attendere ACK anche se il server ritiene il banco fermo;
- verificare device ID, non soltanto il nome COM;
- bloccare tutti i comandi per la durata del flash;
- verificare hash dell'HEX prima di avrdude;
- dopo il flash verificare device ID, firmware e protocollo;
- qualsiasi errore lascia FAULT;
- due richieste simultanee devono generare un solo processo avrdude.

## 4.7 Test di accettazione del Lotto A

Creare almeno:

- tools/test_controller_lease.js;
- tools/test_motion_fsm.js;
- tools/test_stop_generation.js;
- tools/test_flash_interlock.js;
- E2E browser per due tab, reconnect e Concerto.

Scenari obbligatori:

1. tre WebSocket e due browser: un solo controller muove;
2. observer MOVE/SCAN/TONE/FREE → NACK e zero byte seriali;
3. STOP da observer → STOPPING;
4. scadenza lease durante scan → STOP, nessuna ripartenza;
5. chiusura controller → STOP entro TTL;
6. vecchio lease → sempre rifiutato;
7. callback di vecchio runId dopo STOP → nessuna scrittura;
8. START durante MANUAL/STOPPING/FREE/FLASHING/FAULT → rifiutato;
9. FREE durante moto → nessuna UI ottimistica;
10. TONE in FREE → zero STEP;
11. SIGINT server durante moto → STOP+ACK prima della chiusura;
12. due flash simultanei → un solo avrdude;
13. flash durante moto → 409 senza chiudere la seriale;
14. COM riutilizzata da altro device → rifiutata;
15. STOP ripetuto e STOP a IDLE → evento terminale coerente.

---

# 5. Lotto B — Firmware, fault e protocollo seriale

## 5.1 Problemi correnti

Riferimenti:

- master/master.ino:210-280 — movimento e FREE;
- master/master.ino:317-345 — lettura sensore stabile;
- master/master.ino:417-445 — scansione che continua su NaN;
- master/master.ino:523-567 — parser atoi ancora permissivo;
- master/master.ino:568-636 — TONE e terminali tabort/tend;
- master/master.ino:694-724 — stato boot/ENA;
- master/master.ino:730-747 — overflow del buffer.

Difetti residui:

- dopo overflow il parser azzera cmdLen e può eseguire il suffisso della stessa
  riga; una riga lunga seguita da $+1 può quindi muovere;
- c/r/w/u/a/g/k accettano trailing garbage tramite atoi;
- durante moto i comandi non STOP vengono scartati senza BUSY;
- qualunque byte ricevuto mantiene vivo il watchdog;
- encoder fermo e sensore assente non generano sempre fault locale;
- due campioni validi non consecutivi possono rendere numerico un punto instabile;
- cfgSettleMs viene applicato due volte in alcuni percorsi;
- un STOP tardivo in TONE può produrre sia tabort sia tend;
- non esiste query completa dello stato;
- boot e FREE/ENA non sono perfettamente coerenti.

## 5.2 FSM firmware

Stati minimi:

~~~text
BOOT
FREE
IDLE_LOCKED
MOVING
SCANNING
TONE
STOPPING
FAULT
~~~

Azioni:

- centralizzare ingresso e uscita dal moto;
- centralizzare livelli STEP/DIR/ENA;
- nessun movimento fuori da MOVING/SCANNING/TONE;
- fault latched per host timeout, encoder jam, sensore invalido, limit
  e driver fault;
- RESET_FAULT valido solo da fermo, causa rimossa e azione esplicita;
- nessuna partenza automatica dopo boot, reconnect o reset fault;
- firmware incompatibile → UPDATE_REQUIRED, non fallback;
- ogni operazione possiede runId/sequence ID;
- gli eventi tardivi di un run terminato vengono ignorati dal server.

## 5.3 Heartbeat e fail-safe

Il watchdog deve essere aggiornato esclusivamente da un comando heartbeat valido,
non da newline, byte casuali o righe malformate.

Flusso raccomandato:

- server con lease valido invia heartbeat circa ogni 250 ms;
- firmware usa un timeout definito dai requisiti funzionali del banco;
- su timeout: ultimo STEP, driver nello stato sicuro definito, evento
  FAULT HOST_TIMEOUT, fault latched;
- il server distingue perdita browser, perdita Node e perdita USB;
- nessuna di queste condizioni deve essere nascosta dal keep-alive.

Fault locali:

- encoder: confrontare avanzamento atteso/reale con finestra e tolleranza;
- sensore: preflight firmware e limite di invalidi consecutivi;
- limiti di passo/tempo per comando e per run;
- moltiplicazioni e conversioni controllate prima di produrre passi;
- eventuali input driver fault/limit nello stesso percorso latched.

Encoder bloccato e sensore scollegato devono fermare il banco anche se non esiste
più una pagina browser collegata.

## 5.4 Protocollo seriale v4

Scrivere PROTOCOL.md prima di implementare. Il formato può differire da quello
seguente, ma deve offrire correlazione, stato e grammatica completa:

~~~text
42 STATUS
43 LOCK
44 CONFIG step=32 samples=3 settle=50
45 SCAN run=17 dir=- units=360
46 MOVE run=18 dir=+ units=100
47 TONE run=19 hz=440 ms=500 dir=+ duty=70
48 FREE
49 RESET_FAULT
~~~

Risposte:

~~~text
ACK 45 state=SCANNING run=17
NACK 46 code=BUSY state=SCANNING
EVT SAMPLE run=17 idx=1 enc=4 mm=0.01 q=OK
EVT DONE run=17 state=IDLE_LOCKED
EVT STOPPED run=17 reason=USER state=IDLE_LOCKED
EVT FAULT run=17 code=ENCODER_JAM state=FAULT
~~~

Requisiti parser:

- buffer fisso;
- flag overflowed;
- dopo overflow scartare tutto fino a EOL;
- strtol con verifica di inizio, fine, segno e range per tutti i numeri;
- eliminare atoi;
- rifiutare trailing garbage, NUL e prodotti in overflow;
- comando sconosciuto/malformato → un solo NACK;
- durante busy servire STOP, HEARTBEAT e STATUS; gli altri → NACK BUSY;
- mai scartare silenziosamente un comando;
- sequence ID per correlazione e deduplicazione;
- runId per campioni e terminali;
- HELLO/STATUS riporta protocollo, firmware, device ID, stato, FREE/ENA,
  configurazione, fault e reset reason;
- v può restare come probe, ma deve includere proto e device;
- firmware legacy non può muovere con server v4.

Il device ID deve essere stabile: seriale USB affidabile oppure ID provisionato
in EEPROM con CRC. Non usare il solo nome COM come identità.

## 5.5 Lettura sensore e attese

Correggere readSensorStableMm:

- azzerare l'intero candidato di stabilità dopo un frame invalido;
- richiedere campioni validi consecutivi;
- restituire valore, stato qualità, numero campioni e dispersione;
- se il budget scade senza stabilità, restituire INVALID/UNSTABLE, non l'ultimo
  numero come misura normale;
- usare cfgSamples anche nel percorso autonomo, oppure eliminare il parametro
  se non ha effetto;
- applicare cfgSettleMs una sola volta;
- tutte le attese devono chiamare serviceMotionControl.

TONE deve emettere un solo terminale: DONE oppure ABORTED, mai entrambi.

## 5.6 Test firmware

Creare:

- tools/test_protocol_v4.js;
- test del parser realmente condiviso/compilato nel firmware;
- golden transcript di scan, STOP, fault e reconnect;
- build firmware in CI.

Scenari obbligatori:

1. overflow seguito da $+1 → nessun moto;
2. c3junk, segni doppi, numeri estremi e righe parziali → NACK;
3. comando durante MOVING → NACK BUSY;
4. STOP nel mezzo di una riga → parser azzerato e moto fermato;
5. heartbeat valido mantiene il run; byte casuali no;
6. host timeout → fault latched;
7. sensore assente → abort locale;
8. encoder bloccato → abort locale;
9. invalidi non consecutivi → nessuna falsa stabilità;
10. TONE tardivamente interrotto → un solo terminale;
11. STOP a IDLE → ACK coerente;
12. reboot durante run → nuovo bootId, server in FAULT/OFFLINE.

Il parser testato non deve essere una riscrittura JavaScript della logica
firmware: estrarre una parte compilabile comune o eseguire test C++/simulatore
sullo stesso codice.

---

# 6. Lotto C — Integrità della misura e dei profili

## 6.1 Regressione nei giri ripetuti

Riferimenti:

- cammes/alzata.html:909-916 — snapshot anche incompleti;
- cammes/alzata.html:1079-1110 — media e zero quando count è zero;
- cammes/analisi.html:2319-2445 — caricamento di incompleti;
- cammes/grafici.html:283-305 e 496-558 — riempimento a zero e conformità.

Riproduzione:

~~~text
run 1: grado 42 mancante
run 2: grado 42 mancante

risultato attuale:
grado 42 = 0
missing = 0
~~~

Questo comportamento deve sparire da acquisizione, media, parser, conversione,
analisi, confronto, export e salvataggio.

## 6.2 Modello dati richiesto

Separare valore e validità:

~~~js
{
  values: Float64Array(360),
  valid: Uint8Array(360),
  quality: Uint16Array(360),
  runStatus: "COMPLETE",
  metadata: {}
}
~~~

Stati run:

~~~text
RUNNING
COMPLETE
ABORTED
FAILED
~~~

COMPLETE richiede almeno:

- 360 gradi unici;
- tutti i campioni richiesti validi e finiti;
- nessun gap;
- convenzione e direzione non ambigue;
- span/closure entro soglie configurate;
- nessun fault;
- controlli di qualità previsti superati.

Un profilo diagnostico parziale può essere salvato, ma:

- deve conservare la maschera dei missing;
- deve essere marcato incomplete;
- non può produrre conformità, timing o cam card;
- non può essere convertito in profilo completo;
- la UI deve mostrarlo come NON VALUTABILE.

## 6.3 Media delle scansioni

Usare soltanto run COMPLETE nella media principale.

~~~text
per ogni grado:
  campioni = valori validi dei run COMPLETE
  se campioni è vuoto:
      valid[grado] = false
  altrimenti:
      value[grado] = media(campioni)
      valid[grado] = true
~~~

Non inizializzare la media a zero. Conservare count, dispersione e provenienza
per grado. _invalidTotal e metadata devono descrivere tutti i run, non soltanto
l'ultimo.

## 6.4 Parser SCR rigoroso

lib/cammes-math.js:865-906 deve restituire un oggetto strutturato:

~~~js
{
  ok,
  values,
  validMask,
  convention,
  duplicateDegrees,
  missingDegrees,
  fractionalDegrees,
  invalidRows,
  outOfRangeRows,
  errors,
  warnings,
  metadata
}
~~~

Regole:

- accettare 0…359 oppure 1…360 solo se completi e coerenti;
- rifiutare convenzioni miste;
- non arrotondare gradi frazionari;
- ricampionare frazionari soltanto in una modalità esplicita;
- duplicati → errore, nessuna sovrascrittura;
- valori non finiti → errore;
- limiti fisici dichiarati dal tipo di sensore/configurazione;
- niente soglia generica di 30 punti per analisi/conformità;
- nessun array preinizializzato a zero per rappresentare missing.

Riproduzioni:

~~~text
Profilo completo + seconda riga 180,999:
attuale: valid=360, grado 180=999
richiesto: DUPLICATE_DEGREE
~~~

~~~text
Nominale e misura con 30 punti validi e 330 mancanti:
attuale: maxDev=0, CONFORME
richiesto: NON VALUTABILE — PROFILO INCOMPLETO
~~~

L'allineamento automatico del confronto deve essere disattivato per default o
richiesto esplicitamente. Riportare sia errore raw sia allineato e lo shift
applicato.

## 6.5 Metadati e provenienza

Ogni misura deve includere almeno:

- schemaVersion;
- runId e timestamp;
- deviceId, bootId, firmware version/hash e protocol version;
- porta e parametri seriali;
- zeroId/homingId;
- encoder calibration ID, counts/rev e direzione;
- modalità scan, velocità, step, samples e settle effettivi;
- sensore/stilo, unità, risoluzione, range e calibrazione;
- numero punti validi/mancanti/instabili;
- closure, drift, span e qualità per campione;
- hash dei dati raw;
- pipeline/versione delle trasformazioni.

## 6.6 Posizioni salvate

Problema: posizioni in localStorage ed epoch in sessionStorage. Dopo un riavvio
entrambi possono tornare a epoch zero e rendere valida una posizione vecchia.

Legare ogni posizione a:

~~~text
deviceId
firmware identity/hash
bootId
homingId/zeroId
encoder calibration ID
direction
timestamp
~~~

Invalidare dopo riavvio browser, reboot firmware, cambio dispositivo, homing,
azzeramento, cambio calibrazione o direzione. La posizione diventa utilizzabile
soltanto dopo riconciliazione esplicita col riferimento corrente.

## 6.7 Test del Lotto C

Creare:

- tools/test_missing_repeated.js;
- tools/test_parser_strict.js;
- test E2E di conformità e posizioni persistenti.

Casi:

1. due run senza grado 42 → valid[42] false;
2. un run completo e uno incompleto → media certificabile usa solo il completo;
3. nessun run completo → nessuna media certificabile;
4. round-trip incompleto → missing resta missing;
5. file 0…359 completo → valido;
6. file 1…360 completo → valido;
7. convenzioni miste → rifiuto;
8. duplicato → rifiuto;
9. grado frazionario non dichiarato → rifiuto;
10. NaN, infinito e fuori range → rifiuto;
11. 359 punti o 30 punti → NON VALUTABILE;
12. due profili quasi vuoti identici → mai CONFORME;
13. posizione epoch zero di una sessione precedente → rifiutata;
14. reboot/device/zero/calibrazione diversi → posizione invalidata.

---

# 7. Lotto D — Fasatura, picco ed encoder

## 7.1 Eventi reali per profili asimmetrici

Riferimenti:

- cammes/analisi.html:3048-3055;
- cammes/analisi.html:3163-3167;
- cammes/analisi.html:3264-3267;
- cammes/analisi.html:3679-3691;
- cammes/analisi.html:4105-4112.

Non usare più:

~~~text
apertura = centro - durata/2
chiusura = centro + durata/2
~~~

Algoritmo:

1. utilizzare la curva finale già normalizzata per direzione;
2. applicare una sola volta fasatura, anticipo, follower e lash;
3. lavorare nel dominio albero motore canonico 0…720;
4. individuare il componente circolare del lobo contenente il picco;
5. trovare attraversamento crescente prima del picco;
6. trovare attraversamento decrescente dopo il picco;
7. interpolare sub-grado:

~~~js
xCross = x0 + (T - y0) / (y1 - y0);
~~~

8. gestire 719→0;
9. se la coppia non è univoca, restituire AMBIGUOUS/NON_VALUTABILE;
10. durata, apertura, chiusura, overlap, timing chart, CSV e cam card devono
    usare lo stesso oggetto eventi.

Test obbligatorio sul profilo asimmetrico:

~~~text
soglia 0,05 mm
attraversamenti attesi circa 408° e 646°
~~~

Il vecchio codice produceva eventi con errori vicini a 60°. Il nuovo test deve
controllare direttamente i crossing, non ricostruirli dalla durata.

## 7.2 Picco e naso piatto

lib/cammes-math.js:795-810 deve trovare il centro del plateau, non il primo
campione massimo.

Definire:

~~~js
peakTolerance = Math.max(measurementResolution,
                         relativeTolerance * maxLift);
~~~

Trovare il componente circolare con lift >= maxLift - peakTolerance che
contiene il massimo globale. Restituire il centro circolare del componente.
Più plateau equivalenti separati → AMBIGUOUS_PEAK.

Test:

- plateau 170…190 → 180 ±0,5°;
- plateau 350…10 → vicino a 0°;
- picco singolo invariato;
- due massimi separati → ambiguo;
- rotazione del profilo → stessa rotazione del risultato.

## 7.3 Reindicizzazione encoder

lib/cammes-math.js:1029-1066 non deve accettare un giro basandosi soltanto sullo
span minimo del 70%.

Servono:

- counts/rev calibrati;
- direzione attesa;
- tolleranza span;
- jitter massimo;
- salto massimo;
- zero/calibration ID;
- unwrapping;
- monotonicità entro jitter;
- rifiuto di inversioni sistematiche;
- copertura completa;
- residuo di interpolazione;
- metadati della trasformazione.

Test:

- giro pulito circa 1436 count → accettato;
- mezzo giro 718 → rifiutato;
- span 90% → rifiutato salvo calibrazione esplicita;
- span corretto con 81 passi all'indietro → rifiutato;
- direzione opposta dichiarata → normalizzata;
- reset/wrap non dichiarato → errore.

## 7.4 Unica pipeline matematica

Definire in MATH_SPEC.md ordine, convenzioni e unità:

~~~text
raw
→ validazione
→ normalizzazione direzione
→ reindicizzazione encoder
→ baseline
→ follower/rapporto
→ mapping camma-albero
→ fasatura/anticipo
→ lash/soglia
→ crossing/eventi
→ dinamica
→ output/export
~~~

Ogni trasformazione deve essere applicata una volta sola e registrata nei
metadati. Nessun grafico deve ricostruire indipendentemente gli eventi.

Test di invarianti:

- rotazione;
- inversione dichiarata;
- wrap;
- anticipo positivo/negativo;
- profilo simmetrico e asimmetrico;
- curva flat-top;
- A/B con follower differenti;
- conversione già applicata non ripetuta.

---

# 8. Lotto E — Dinamica, coerenza risultati e reattività

## 8.1 Problemi correnti

- lib/cammes-math.js usa tre cicli fissi di warm-up, senza convergenza;
- cammes/analisi.html sostituisce damping zero con 0,06 tramite OR logico;
- il modello surge sostituisce analogamente alcuni zeri;
- il test 3DOF accetta camma 10 mm → valvola 14,710 mm perché controlla
  soltanto un intervallo numerico ampio;
- retuning live aggiorna riepiloghi ma non sempre lastAnalysis.arrays;
- CSV può combinare parametri nuovi e curve vecchie;
- mancano invalidazioni per surgeEnabled, springMass e springCoils;
- sweep 3DOF estesi bloccano il thread UI per diversi secondi.

## 8.2 Parsing degli input

Non usare value OR default quando zero è ammesso.

~~~js
const parsed = Number(value);
if (!Number.isFinite(parsed)) {
  return validationError;
}
~~~

Definire range fisici motivati per masse, rigidezze, precarico, damping e rpm.
Valori fuori dominio bloccano il solver; non vengono clampati o sostituiti
silenziosamente.

## 8.3 Convergenza periodica

Sostituire tre cicli fissi con:

1. minimo numero di cicli;
2. confronto dello stato completo alla stessa fase tra cicli consecutivi;
3. tolleranze assolute e relative;
4. confronto di posizione, velocità, contatto, separazione ed energia;
5. almeno due cicli consecutivi convergenti;
6. massimo numero di cicli;
7. esito CONVERGED o NON_CONVERGED.

Se non converge:

- niente verdetto di valve float;
- niente regime massimo;
- niente ottimizzazione;
- export marcato non convergente;
- nessuna frase sicuro/validato.

Caso obbligatorio:

~~~text
mass = 1000 g
kTrain = 5000
kSpring = 1
F0 = 20
damping = 0,001
rpm = 12000

risultato corrente a 3 cicli: separazione circa 299,112 mm
risultato a 20 cicli: circa 145,366 mm
massima differenza curve: circa 272,629 mm
~~~

Il nuovo solver deve convergere secondo il criterio o restituire NON_CONVERGED.

## 8.4 Validazione indipendente dei modelli

Sostituire i soli test di plausibilità con:

- limite quasi-statico a bassi rpm;
- rigidezza di trasmissione molto alta → modello complesso tende al semplice;
- massa intermedia tendente a zero;
- forza normale di contatto mai attrattiva;
- bilancio energetico e dissipazione coerenti;
- invarianza alla rotazione;
- convergenza rispetto al passo temporale;
- confronto con soluzione analitica semplificata o dataset esterno;
- sensibilità e unità verificate dimensionalmente.

DYN-05 e il 3DOF restano OPEN finché un test indipendente non verifica equazioni,
segni, unità e risultati. Surge, rullo e dito devono restare dichiarati
esplorativi fino a validazione separata.

## 8.5 Snapshot immutabile e stale guard

Produrre un unico risultato:

~~~js
{
  analysisId,
  createdAt,
  sourceHash,
  parameterHash,
  pipelineVersion,
  parameters,
  arrays,
  summary,
  warnings,
  convergence,
  provenance
}
~~~

Ogni grafico, riepilogo, CSV e PDF legge lo stesso snapshot.

Ogni parametro influente:

- provoca ricalcolo completo; oppure
- marca DIRTY il risultato e disabilita export/verdetti.

Includere rpm, modello, follower, geometria, lash, anticipo, baseline,
surgeEnabled, springMass, springCoils, damping, masse e rigidezze.

Ogni slot A/B deve possedere stato e trasformazioni propri. Conservare
sourceHash, direzione, incomplete state, follower, baseline, anticipo, unità e
versione algoritmi. Non applicare due volte una conversione.

## 8.6 Web Worker

Spostare solver, sweep e race analysis in un Web Worker con:

- jobId;
- progress reale;
- annullamento;
- timeout;
- scarto di risultati appartenenti a job superati;
- stato NON_CONVERGED;
- serializzazione di input e output validata.

Durante un job non completato export e verdict restano disabilitati.

## 8.7 Test del Lotto E

1. damping 0 resta 0 in ogni percorso;
2. caso estremo → NON_CONVERGED o convergenza dimostrata;
3. limiti quasi-statici e di rigidezza;
4. dimezzamento timestep entro errore dichiarato;
5. cambio 3000→7000 rpm senza ricalcolo → export bloccato;
6. dopo ricalcolo CSV e summary hanno stesso analysisId/parameterHash;
7. cambiare coils/mass/surge → DIRTY o ricalcolo;
8. profilo raw + converted in A/B → nessuna doppia trasformazione;
9. job 3DOF lungo → UI responsiva;
10. Annulla ferma il worker;
11. risultato di job vecchio non sostituisce quello nuovo.

---

# 9. Lotto F — Protezione rete, API e browser

## 9.1 Autenticazione e confine di rete

Problemi:

- cammes_server.js:750-779 considera affidabile qualunque IPv4 letterale;
- Origin assente è accettata;
- HTTP API non verifica Origin/CSRF;
- server ascolta su tutte le interfacce;
- API dati, settings, diagnostica e flash non richiedono credenziali.

Design:

- default bind 127.0.0.1;
- modalità LAN solo con opzione esplicita;
- in LAN autenticazione obbligatoria con token casuale/pairing;
- session cookie HttpOnly + SameSite=Strict oppure Bearer per tool;
- Origin esatta: schema, host e porta dell'app;
- Host derivati da loopback e indirizzi reali configurati, non da regex IPv4;
- client senza Origin ammesso soltanto come tool non-browser con Bearer valido;
- tutte le API, comprese letture/backup/diagnostica, autenticate;
- API mutanti con controllo Origin e CSRF;
- Content-Type JSON richiesto per le operazioni mutanti;
- nessuna azione fisica da simple cross-site POST;
- frame-ancestors none e anti-clickjacking.

## 9.2 WebSocket

Configurare:

- maxPayload ridotto, per esempio 4 KiB per comandi;
- perMessageDeflate false;
- limite client;
- rate limit client/IP;
- ping/pong;
- bufferedAmount massimo;
- disconnessione consumer lento;
- schema JSON e allowlist operazioni;
- coda seriale unica;
- STOP fuori dalla coda ordinaria;
- correlazione requestId/ACK;
- observer read-only.

Rimuovere il salvataggio legacy via messaggi WS del tipo nome+dati. Usare API
HTTP validata con schema e scrittura atomica.

Test:

- payload grande → close 1009;
- flood/multi-client non fa crescere memoria senza limite;
- JSON malformato/comando ignoto/range errato → zero byte seriali;
- STOP funziona sotto saturazione;
- ACK non viene attribuito al client sbagliato;
- fuzz non causa crash.

## 9.3 API, schema e filesystem

Per ogni route:

- metodo esplicito e 405 sugli altri;
- Content-Type e byte reali del body;
- schema versionato;
- additionalProperties false;
- tipi, range, lunghezze e massimo numero elementi;
- request ID;
- niente stack al client.

Scritture settings e profili:

- coda per risorsa;
- temp univoco;
- write;
- fsync;
- rename atomico;
- revisione/ETag;
- If-Match;
- 409 su conflitto.

Il server deve validare il contenuto SCR con le stesse regole del parser
condiviso. Due client non devono sovrascrivere una misura silenziosamente.

Backup:

- ZIP streaming;
- limiti numero/dimensione file;
- manifest con hash;
- restore con anteprima;
- verifica di ogni hash;
- rifiuto corruzioni;
- sostituzione atomica;
- test backup→restore.

Su uncaughtException/unhandledRejection:

1. STOP sicuro;
2. shutdown ordinato;
3. exit non-zero.

Non continuare con un processo potenzialmente incoerente.

Logger:

- asincrono;
- timestamp UTC ISO con data;
- livelli separati;
- DATA seriale non a info di default;
- rotazione non concorrente con append.

## 9.4 XSS, import e security headers

Problemi residui:

- cammes-ui.js:84-98 usa innerHTML nei toast;
- label di posizioni importate può raggiungere il toast;
- metadata release e URL sono inseriti senza normalizzazione sufficiente.

Correzione:

- toast testuale con textContent per default;
- eventuale markup costruito con nodi DOM, non stringhe;
- validazione completa del backup prima di persisterlo;
- versioni schema supportate;
- label/tag con caratteri e lunghezza ammessi;
- numeri finiti e range;
- nomi file/errori/API/release sempre testo;
- URL update soltanto HTTPS e repository GitHub atteso;
- rimuovere handler inline e javascript URL;
- eliminare responsivevoice.js se inutilizzato.

Header:

~~~text
Content-Security-Policy con frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy restrittiva
~~~

Spostare progressivamente gli script inline in file JS per eliminare
unsafe-inline dalla CSP.

Test payload:

~~~html
<img src=x onerror=window.__xss=1>
~~~

Importarlo come label/tag/nome/metadata, visualizzarlo e verificare:

- appare come testo letterale;
- nessun elemento attivo creato;
- window.__xss non impostato;
- nessun attributo on*;
- app non caricabile in iframe;
- flussi normali senza violazioni CSP.

## 9.5 Test di protezione obbligatori

1. API e WS senza credenziali → 401/403;
2. token errato → 403;
3. evil.com, diverso IP LAN, IP numerico Internet e Origin assente → rifiuto;
4. CSRF settings/file/flash → nessuna azione;
5. clickjacking → bloccato;
6. JSON null/array/chiavi ignote/oversize/troncato → 400/413;
7. due POST concorrenti → revisione coerente o 409;
8. fault durante write → file vecchio o nuovo, mai parziale;
9. backup alterato di un byte → restore fallisce;
10. traversal, path assoluto, junction/symlink → rifiuto;
11. payload XSS di ogni origine dinamica → testo inerte;
12. burst seriale → event loop responsivo.

---

# 10. Lotto G — Dipendenze, build, release e supply chain

## 10.1 Dipendenze

Azioni:

- aggiornare jsPDF ad almeno una versione corretta dall'advisory
  GHSA-w532-jxjh-hjhj e ritestare tutti gli export;
- mantenere ws aggiornato e applicarne i limiti;
- sostituire pkg 5.8.1, deprecato/archiviato, con Node SEA o packager
  attivamente mantenuto;
- usare un Node LTS attivo e fissato;
- rimuovere responsivevoice.js e asset inutilizzati;
- produrre THIRD_PARTY_NOTICES e inventario licenze.

Riferimenti esterni:

- Node release status: https://nodejs.org/en/about/previous-releases
- pkg deprecato: https://github.com/vercel/pkg
- pkg advisory: https://github.com/advisories/GHSA-22r3-9w55-cj54
- jsPDF advisory: https://github.com/parallax/jsPDF/security/advisories/GHSA-w532-jxjh-hjhj

## 10.2 Lock e versioni

- un solo package-lock.json, dentro l'app;
- rimuovere il lockfile v1 orfano in root;
- lock version e package version coerenti;
- npm ci da clone pulito non modifica file;
- test versione confronta package, lock, UI, README, tag, firmware manifest,
  firmware sorgente ed EXE.

Correggere cammes/fw/version.json, che contiene ancora una risposta ver=3.4.

## 10.3 Artefatti e firma

- rimuovere EXE obsoleti e copie ambigue;
- metadata EXE: nome CAMMES, versione applicazione, copyright, commit/build ID;
- firma Authenticode con timestamp;
- tag annotato e firmato;
- manifest di release firmato;
- SHA-256 di EXE, ZIP, HEX, SBOM e asset;
- sidecar hash coerenti;
- nessun artefatto unsigned pubblicato come release finale.

fw/version.json deve includere:

- firmware version;
- protocol version;
- source commit;
- toolchain/core/compiler;
- flags;
- FQBN;
- HEX SHA-256;
- build timestamp riproducibile o dichiarato;
- device compatibility.

## 10.4 CI

Pipeline minima:

1. action fissate a commit SHA;
2. permessi minimi;
3. Node LTS fissato;
4. npm ci;
5. controllo versioni/lock/tag;
6. lint, inclusi script frontend estratti dagli HTML;
7. test unitari, property e fuzz;
8. test auth/lease/API/WS/CSRF;
9. E2E browser;
10. compilazione firmware con toolchain fissata;
11. validazione Intel HEX e confronto hash;
12. build EXE;
13. smoke test EXE su porte effimere;
14. audit dipendenze;
15. SBOM SPDX/CycloneDX;
16. notices;
17. firma, manifest e provenance;
18. pubblicazione soltanto con tutti i gate verdi.

Devono bloccare la release:

- tag non firmato;
- versione divergente;
- lock sporco;
- lint/test falliti;
- test security fallito;
- EXE non firmato;
- HEX non riproducibile;
- manifest/hash incoerente;
- rischio P0 ancora OPEN.

## 10.5 salva.bat

Non usare git add -A. Usare una lista esplicita di sorgenti o git add -u,
escludendo prove, profili, log, backup, dist e settings.

Correggere il controllo errorlevel dentro i blocchi: usare if errorlevel 1 subito
dopo ogni comando oppure delayed expansion. Un push fallito non deve essere
annunciato come riuscito.

## 10.6 Test release

- clone pulito → npm ci → test/lint/build senza diff;
- EXE avviato su macchina pulita e porta temporanea;
- API/WS smoke contro l'EXE;
- firma Authenticode valida;
- version metadata = tag/package;
- hash = manifest/sidecar;
- firmware ricompilato = HEX pubblicato;
- SBOM/notices inclusi;
- nessun EXE vecchio o asset inutilizzato nel pacchetto.

---

# 11. Campagna hardware obbligatoria

I test software non possono verificare questi punti.

Estendere il bench harness affinché salvi JSON/CSV e includa:

- commit applicazione;
- commit firmware;
- hash HEX;
- versioni e protocollo;
- device ID;
- configurazione completa;
- cablaggio/schema revisione;
- strumenti usati e relativa taratura;
- timestamp;
- soglie;
- risultato e dati grezzi.

## 11.1 Prove STOP

Misurare ultimo fronte STEP e stato ENA durante:

- MOVE manuale positivo/negativo;
- scansione autonoma;
- scansione browser se ancora supportata;
- TONE a 60 Hz e 2000 Hz;
- settle;
- sensore muto;
- lettura sensore instabile;
- perdita browser/controller;
- kill del processo Node;
- scollegamento USB;
- reset firmware;
- STOP ripetuto.

Browser perso, Node perso e USB persa sono tre fault differenti e devono essere
provati separatamente.

## 11.2 Fault fisici

- encoder bloccato;
- encoder che slitta;
- sensore aperto;
- sensore corto;
- sensore fuori scala;
- LM339 con fronte lento/rumore;
- driver fault, se disponibile;
- finecorsa/limit, se disponibile;
- recovery con causa ancora presente;
- recovery dopo rimozione della causa.

## 11.3 Boot, reset e flash

Con oscilloscopio:

- STEP/DIR/ENA a power-on;
- durante bootloader;
- reset;
- flash;
- perdita USB;
- riavvio Node;
- stato FREE;
- stato FAULT.

Criteri:

- zero fronti STEP involontari;
- polarità ENA documentata e coerente;
- nessun moto prima di LOCK/START;
- fault non cancellato dal solo reconnect;
- device ID e protocollo verificati dopo il flash.

## 11.4 Metrologia

Verificare:

- comparatore/stilo con riferimento tracciabile;
- risoluzione, ripetibilità, linearità e isteresi;
- zero e drift;
- closure del giro;
- backlash e direzione;
- encoder counts/rev;
- profilo campione con misura indipendente;
- alzata PMS e cam card esterna;
- propagazione dell'incertezza;
- raw B/C/D mancanti nel report VW.

Il confronto Clio/VW corrente resta regressione software, non calibrazione.

---

# 12. Documentazione e dichiarazioni da correggere

## 12.1 Contraddizioni correnti

- CHANGELOG dichiara tutti i 15 P0 corretti/validati;
- AUDIT_RESPONSE riporta sia 129 sia 137 controlli;
- AUDIT_RESPONSE descrive punti firmware ancora pendenti ma la release li
  presenta come validati;
- fw/version.json termina ancora con una risposta ver=3.4;
- REPORT_CAMME_VW-KR.md afferma che le alzate PMS misurate sono sottostimate
  circa del 35% e non sono riferimento;
- tools/validate_vw.js tratta circa 2,18/1,71 mm come valore fisico corretto;
- UI e documenti usano ancora espressioni come vero regime massimo,
  zone operative definitive o validata fisicamente;
- manuale cita un selettore modalità ormai rimosso;
- workbook e PDF legacy non sono stati rigenerati o archiviati.

## 12.2 Linguaggio ammesso fino alla validazione

Usare:

~~~text
Verificato come regressione software sul dataset disponibile.
Validazione metrologica/fisica indipendente ancora necessaria.
Modello esplorativo, non certificazione del regime operativo.
~~~

Non usare:

~~~text
validato fisicamente
regime massimo sicuro
race-grade
audit chiuso
15/15 P0 verificati
conforme
~~~

salvo evidenza indipendente e tracciabile adeguata al termine utilizzato.

## 12.3 Documenti da produrre

### MOTION_CONTROL_MODEL.md

- confine funzionale del sistema;
- stati server/firmware;
- lease e perdita autorità;
- STOP software e watchdog;
- politica ENA;
- fault e recovery;
- tempi massimi e prove;
- limiti funzionali residui.

### PROTOCOL.md

- versione e compatibilità;
- grammatica completa;
- stati;
- comandi/range;
- ACK/NACK/eventi;
- sequence ID/runId;
- heartbeat;
- timeout;
- STOP prioritario;
- esempi e golden transcript.

### MATH_SPEC.md

- convenzioni angolari;
- direzione;
- riferimento PMS;
- dominio camma/albero;
- ordine trasformazioni;
- follower e lash;
- soglia timing;
- attraversamenti;
- gestione missing;
- unità;
- modelli dinamici e limiti.

### REMAINING_RISKS.md

- ID;
- stato;
- evidenza;
- rischio;
- workaround;
- responsabile;
- test necessario;
- scadenza.

### RELEASE_MANIFEST.json

- versione;
- commit;
- toolchain;
- hash;
- firma;
- SBOM;
- firmware;
- data;
- risultati gate.

### THIRD_PARTY_NOTICES.md e SBOM

Includere dipendenze npm, asset vendorizzati, font, jsPDF e qualsiasi libreria
inclusa nell'EXE.

---

# 13. Registro consolidato dei rilievi residui

Questa tabella non sostituisce la verifica di Claude. Serve come baseline da
aggiornare dopo le patch.

## 13.1 Rete e server

| ID | Stato v3.3.0 | Azione |
|---|---|---|
| SEC-01 | PARTIAL/P0 | Auth, Origin esatta, CSRF, lease, loopback default |
| SEC-02 | FIXED_SOFTWARE | Preservare allowlist e test 403/404 |
| SEC-03 | PARTIAL | Eliminare innerHTML dinamico, validare import/update |
| SEC-04 | FIXED_SOFTWARE | Preservare containment path e aggiungere symlink test |
| SEC-05 | PARTIAL | Schema API, safe shutdown su eccezioni |
| SEC-06 | PARTIAL | Scritture atomiche/revisionate per profili |
| SEC-07 | PARTIAL | Backup streaming e restore verificato |
| SEC-08 | PARTIAL | ISO timestamp, livelli e rotazione robusta |
| SEC-09 | PARTIAL | Limiti WS, rate/client/backpressure/fuzz |
| SEC-10 | PARTIAL | Firma, manifest e verifica supply chain |

## 13.2 Movimento, firmware e seriale

| ID | Stato v3.3.0 | Azione |
|---|---|---|
| MOT-01 | FIXED_SOFTWARE | Preservare timer registry/generation; test dedicato |
| MOT-02 | PARTIAL/P0 | FSM server autorevole e guardie server/firmware |
| MOT-03 | PARTIAL/P0 | STOP su perdita controller e niente keep-alive mascherante |
| MOT-04 | OPEN/P0 | Lease esclusivo, observer read-only |
| MOT-05 | PARTIAL | RESET/reload solo dopo ACK terminale |
| FW-01 | PARTIAL | TONE rispetta FREE; UI solo su ACK |
| FW-02 | FIXED_SOFTWARE/NEEDS_HW | Un solo terminale e latenza peggiore misurata |
| FW-03 | PARTIAL/NEEDS_HW | Fault locali e watchdog dedicato |
| FW-04 | PARTIAL | Parser rigoroso, discard fino a EOL |
| FW-05 | PARTIAL | Validità consecutiva, qualità/dispersione |
| FW-06 | PARTIAL | Settle una volta e cfgSamples realmente usato |
| FW-07 | NEEDS_HARDWARE_VALIDATION | Schema, pull-up, isteresi, LM339 |
| FW-08 | PARTIAL | Header e PROTOCOL.md completi; version.json coerente |
| FW-09 | OPEN | NACK BUSY, niente scarto silenzioso |
| FW-10 | FIXED_SOFTWARE | Preservare confronti rollover-safe |
| FW-11 | PARTIAL | HELLO/STATUS completo e boot FREE/ENA coerente |
| FW-12 | FIXED_SW/NEEDS_HW | Verificare pin a boot/reset/flash |
| SER-01 | FIXED_SW/NEEDS_HW | Probe più device ID e test multi-device |
| SER-02 | FIXED_SOFTWARE | Preservare settled guard |
| SER-03 | PARTIAL | STOP+ACK, device ID e lock flash |

## 13.3 Misura e matematica

| ID | Stato v3.3.0 | Azione |
|---|---|---|
| MET-01 | PARTIAL/P0 REGRESSION | Missing mask e soli run COMPLETE |
| MET-02 | FIXED_SOFTWARE | Preservare NON VALUTABILE |
| MET-03 | PARTIAL | Provenienza/metadati per run e campione |
| MET-04 | PARTIAL | Normalizzare direzione e conservarla |
| MET-05 | OPEN | Posizioni legate a device/boot/zero/calibrazione |
| MAT-01 | FIXED_SOFTWARE | Preservare test frazionari |
| MAT-02 | PARTIAL | Centro plateau circolare |
| MAT-03 | PARTIAL/P0 | Crossing reali per lobi asimmetrici |
| MAT-04 | FIXED CORE | Tutti gli output devono usare la stessa curva/eventi |
| MAT-05 | FIXED_SOFTWARE | Preservare centri/LSA |
| MAT-06 | FIXED_SW/NEEDS_HW | PMS da curva, validazione fisica pendente |
| MAT-07 | PARTIAL | Duplicati e frazionari non silenziosi |
| MAT-08 | PARTIAL | Monotonicità, closure e counts/rev |

## 13.4 Dinamica e applicazione

| ID | Stato v3.3.0 | Azione |
|---|---|---|
| DYN-01 | FIXED METRICA/NEEDS VALIDATION | Benchmark indipendente e forza contatto |
| DYN-02 | PARTIAL | Convergenza periodica, non tre cicli fissi |
| DYN-03 | PARTIAL | Validare topologia/equazioni |
| DYN-04 | PARTIAL | Zero preservato in UI e surge |
| DYN-05 | OPEN | Test 3DOF fisicamente indipendente |
| DYN-06 | DOCUMENTED/NOT VALIDATED | Mantenere surge esplorativo |
| DYN-07 | PARTIAL | Validare rullo/dito e rimuovere saturazioni arbitrarie |
| DYN-08 | OPEN | Baseline euristica non predefinita senza evidenza |
| APP-01 | PARTIAL | Snapshot immutabile, stale/export coerenti |
| APP-02 | FIXED_SOFTWARE | Preservare dispatch modelli |
| APP-03 | PARTIAL | Griglia/costo motivati e worker |
| APP-04 | OPEN/P0 RESIDUO | Timing chart da crossing |
| APP-05 | FIXED_SOFTWARE | Preservare soglia esplicita |
| APP-06 | PARTIAL | Bloccare incompleti e stato follower per slot |
| APP-07 | PARTIAL | Provenienza conversioni e baseline |
| APP-08 | FIXED CORE | Parser rigoroso senza zero-fill |
| APP-09 | OPEN/HIGH | Profilo incompleto mai CONFORME |
| APP-10 | FIXED_SOFTWARE | Preservare |
| APP-11 | FIXED CORE | Qualità dipendente da input validi |
| APP-12 | FIXED STATICO | Aggiungere E2E viewport |
| APP-13 | PARTIAL | Focus trap/accessibilità E2E |
| APP-14 | FIXED CORE | Preservare cancel/reduced-motion |
| APP-15 | OPEN | Web Worker, cancel e progress |
| APP-16 | PARTIAL | Allineare stato con server/firmware |
| APP-17 | FIXED_SOFTWARE | Preservare voce locale |
| APP-18 | FIXED_SOFTWARE | Preservare |
| APP-19 | FIXED_SOFTWARE | Preservare |
| APP-20 | PARTIAL | Rimuovere claim fisici non dimostrati |

## 13.5 Release, documenti e validazione

| ID | Stato v3.3.0 | Azione |
|---|---|---|
| REL-01 | PARTIAL | Aggiornare jsPDF e notices |
| REL-02 | OPEN | Sostituire pkg/Node 18 |
| REL-03 | PARTIAL | Un solo lock coerente |
| REL-04 | OPEN | CI completa e action pin |
| REL-05 | OPEN | Firma EXE e rimozione copie obsolete |
| REL-06 | PARTIAL | Tag firmato e istruzioni corrette |
| REL-07 | OPEN | Manifest firmware e source→HEX |
| REL-08 | OPEN | salva.bat selettivo/error handling |
| REL-09 | FIXED_SOFTWARE | Preservare esclusione settings locali |
| REL-10 | OPEN | SBOM/notices e asset inutili |
| DOC-01 | PARTIAL | Versioni/manuale/manifest coerenti |
| DOC-02 | PARTIAL | UI coerente con modello esplorativo |
| TEST-01 | PARTIAL | Oracoli indipendenti |
| TEST-02 | PARTIAL | E2E, fuzz, multi-client, HIL, EXE smoke |
| TEST-03 | PARTIAL | Lint script frontend e gate CI |
| REP-01 | NEEDS_INPUT | Acquisire raw B/C/D |
| REP-02 | NEEDS_HARDWARE | Nuova scansione/taratura PMS |
| REP-03 | OPEN/HIGH RISK | Non dedurre clearance dal solo PMS |
| REP-04 | OPEN | Rigenerare PDF solo da dati validati |
| XLS-01…04 | OPEN/LEGACY | Archiviare come legacy o correggere separatamente |

---

# 14. Matrice minima dei test finali

| Codice | Scenario | Risultato obbligatorio |
|---|---|---|
| T01 | Due controller concorrenti | Uno muove, l'altro NACK |
| T02 | Controller perso durante scan | STOP automatico, nessuna ripartenza |
| T03 | Keep-alive senza lease | Non mantiene vivo il moto |
| T04 | TONE mentre FREE | Zero STEP |
| T05 | FREE durante moto | BUSY/STOP, UI non ottimistica |
| T06 | STOP durante settle/sensore muto | Latenza entro limite |
| T07 | Parser overflow + suffisso | Nessun comando eseguito |
| T08 | Comando malformato/trailing garbage | NACK, zero moto |
| T09 | Sensore assente senza browser | Fault e arresto locale |
| T10 | Encoder bloccato senza browser | Fault e arresto locale |
| T11 | Due run con stesso grado missing | Missing resta missing |
| T12 | Profilo 30/360 | NON VALUTABILE |
| T13 | Duplicato 180 | Errore duplicato |
| T14 | Lobo asimmetrico | Crossing reali circa 408/646 |
| T15 | Plateau 170…190 | Centro circa 180 |
| T16 | Encoder 90%/inversioni | Rifiuto |
| T17 | Cambio parametro dopo analisi | Export bloccato o ricalcolato |
| T18 | Damping zero | Zero preservato |
| T19 | Solver non convergente | NON_CONVERGED |
| T20 | Job lungo | UI responsiva e cancellabile |
| T21 | Origin/token/CSRF errati | 401/403, zero azioni |
| T22 | Payload WS grande/flood | Limite senza crash |
| T23 | Label XSS importata | Testo inerte |
| T24 | Scritture concorrenti | 409 o revisione coerente |
| T25 | Backup alterato | Restore rifiutato |
| T26 | Doppio flash | Un solo avrdude |
| T27 | Flash durante moto | 409 |
| T28 | EXE smoke | Avvio/API/WS funzionanti |
| T29 | Build firmware CI | HEX/hash conforme al manifest |
| T30 | Boot/reset/flash al banco | Zero STEP indesiderati |

I test server devono usare directory temporanee, fake serial e logger in memoria.
Non devono scrivere settings.json, cammes.log o prove reali.

---

# 15. Consegne richieste a Claude

Per ogni lotto consegnare:

1. ID affrontati;
2. causa confermata;
3. file modificati;
4. sintesi del design;
5. test aggiunti;
6. test prima/dopo;
7. suite completa;
8. incompatibilità/migrazioni;
9. verifiche hardware pendenti;
10. rischi residui.

Alla fine produrre o aggiornare:

- MOTION_CONTROL_MODEL.md;
- PROTOCOL.md;
- MATH_SPEC.md;
- REMAINING_RISKS.md;
- RELEASE_MANIFEST.json;
- THIRD_PARTY_NOTICES.md;
- SBOM;
- fw/version.json;
- AUDIT_RESPONSE.md con matrice completa e prove;
- manuale e README coerenti;
- log della campagna hardware.

Formato conclusivo richiesto:

~~~text
ID:
Stato:
Causa:
Patch:
Test:
Risultato:
Evidenza hardware:
Rischio residuo:
~~~

Non usare VERIFIED se manca la prova fisica/metrologica richiesta.

---

# 16. Condizione per dichiarare chiuso l'audit

L'audit può essere dichiarato chiuso soltanto quando:

- nessun P0 software è OPEN o PARTIAL;
- perdita controller e perdita server arrestano il moto nei limiti misurati;
- FREE/LOCK/STOP rappresentano lo stato fisico confermato;
- nessun profilo incompleto può produrre conformità o timing;
- timing asimmetrico deriva dai crossing;
- export e UI condividono lo stesso snapshot;
- solver non convergenti non producono verdetti;
- autenticazione, lease, CSRF e limiti WS sono attivi;
- firmware distribuito è ricostruibile e identificato;
- EXE e manifest sono firmati;
- CI blocca release incoerenti;
- evidenze software e hardware sono conservate;
- ogni rischio rimanente è esplicitamente accettato e documentato.

Fino ad allora la denominazione corretta è:

~~~text
Beta tecnica migliorata.
Regressioni software superate sui dataset disponibili.
Validazione funzionale sul banco e metrologica ancora in corso.
~~~
