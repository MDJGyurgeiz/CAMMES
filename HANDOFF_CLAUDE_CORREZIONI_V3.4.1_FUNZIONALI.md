# CAMMES v3.4.1 — handoff funzionale per Claude

> Revisione Codex del 20 luglio 2026  
> Repository: `MDJGyurgeiz/CAMMES`  
> Commit verificato: `30708ba037430a495c60c152d49c5eb1bbe4bdd8`  
> Tag verificato: `v3.4.1`  
> Scopo: correggere i difetti funzionali, di integrità dei dati, protocollo,
> matematica, dinamica e release rimasti dopo la controrevisione della v3.4.1.

Questo documento è intenzionalmente focalizzato sulla correttezza del prodotto.
Non richiede un nuovo ciclo di cybersecurity né sistemi hardware di emergenza.

---

## Messaggio da incollare nella chat di Claude

~~~text
Ti allego la cartella del progetto CAMMES v3.4.1 e il file
HANDOFF_CLAUDE_CORREZIONI_V3.4.1_FUNZIONALI.md.

Lavora sul commit 30708ba037430a495c60c152d49c5eb1bbe4bdd8 o su un commit
successivo che contenga integralmente la v3.4.1. Prima di modificare il codice,
leggi tutto questo documento e verifica nel sorgente ciascuna causa indicata.

Questo ciclo riguarda correttezza funzionale, integrità delle misure, protocollo,
firmware, matematica, dinamica, coerenza dell'interfaccia e affidabilità della
release. Non dedicare lavoro a login, token, CSRF, CORS/Origin, CSP/XSS, firma
digitale, TLS, hardening contro utenti ostili o sistemi fisici di emergenza.
Non rimuovere né indebolire le protezioni già presenti: lasciale semplicemente
fuori dal perimetro di questo intervento.

Lease, STOP software, watchdog, FSM, runId e interlock del flash restano nel
perimetro: qui servono a evitare comandi accidentali, stati incoerenti, misure
corrotte e race anche con un solo operatore e due schede del browser. Non vanno
trattati come richieste di sicurezza fisica.

Procedi per lotti nell'ordine indicato. Per ogni rilievo:

1. conferma la causa nel percorso realmente eseguito;
2. aggiungi prima un test che riproduca il difetto;
3. implementa la correzione senza cambiare i dati storici;
4. esegui il test specifico, l'intera suite e il lint;
5. registra file modificati, test e risultato;
6. usa FIXED_SOFTWARE, PARTIAL o NEEDS_HARDWARE_VALIDATION in modo realistico;
7. non dichiarare VERIFIED un comportamento provato solo con ricerca di stringhe
   nel sorgente, mock o fixture generata dalla stessa pipeline.

Non creare una nuova release, non flashare hardware, non fare push e non
sovrascrivere profili di misura senza una richiesta esplicita del proprietario.
~~~

---

# 1. Verdetto e baseline verificata

La v3.4.1 contiene miglioramenti reali:

- crossing numerici effettivi per la fasatura;
- gestione migliore dei plateau semplici;
- parser SCR capace di riportare diverse anomalie;
- media che non trasforma in zero un grado mancante in tutti i run;
- solver di compliance con criterio di convergenza;
- protocollo firmware v4, HELLO, device ID, ACK/EVT e bridge dello scan;
- rilevamento encoder fermo durante lo scan;
- lease di base per comandi singoli;
- limiti WebSocket e allowlist statica;
- build firmware riproducibile;
- workflow di release e artefatti con checksum.

Baseline riprodotta da Codex su clone pulito:

- `npm ci`: completato;
- `npm test`: 19 suite / 185 check passanti;
- `npm run lint`: 0 errori;
- `npm audit --omit=dev`: 0 vulnerabilità runtime;
- workflow GitHub release v3.4.1: riuscito;
- workflow firmware `reproducible-hex`: riuscito;
- SHA-256 firmware:  
  `6968c1fe05985f6bebfd1e864e7557244c68d51cd4fcf813bc207ab935832fe4`;
- SHA-256 `cammes.exe` della release:  
  `1fbd9fa403715e31ad027e113657ddcec34396c4ab8131c75a33f0f8d7873435`.

La suite verde non copre però alcuni percorsi end-to-end. In particolare, tre
difetti P0 sono ancora riproducibili e impediscono di dichiarare `openP0: []`.

---

# 2. Perimetro concordato

## 2.1 Incluso

- correttezza del protocollo WebSocket e seriale;
- proprietà funzionale del controller e coerenza fra più schede/browser;
- stato autorevole server/firmware/UI;
- heartbeat e watchdog come requisiti di funzionamento dichiarati;
- mutua esclusione e ripristino della procedura flash;
- integrità dei profili e dei run ripetuti;
- parser, valid mask, metadati e provenienza;
- fasatura, encoder, dinamica e coerenza degli export;
- test, CI, versioni, manifest, SBOM e documentazione tecnica;
- terminologia coerente con il reale livello di validazione.

## 2.2 Escluso da questo ciclo

Non implementare, estendere o riesaminare in questo lotto:

- autenticazione, login, token, cookie, ruoli o permessi utente;
- CSRF, CORS, `Origin`, `Host`, TLS o restrizioni della LAN;
- XSS, CSP o hardening contro input deliberatamente ostili;
- limiti per IP/client pensati esclusivamente contro attacchi;
- firma Authenticode dell'EXE, firma GPG del tag o provenance crittografica;
- fungo di emergenza, relè di sicurezza, interlock hardware o arresti ridondanti;
- certificazione di sicurezza della macchina.

Le protezioni già presenti non devono essere eliminate o allentate. Il punto è
soltanto non investire tempo in nuovi interventi di security in questa revisione.

---

# 3. Priorità e ordine dei lotti

| Ordine | ID | Priorità | Obiettivo |
|---:|---|---|---|
| 1 | DATA-01 | P0 | Impedire incompleto → 360 zeri → completo |
| 2 | CTRL-01 | P0 | Rendere atomico e validato ogni frame WebSocket |
| 3 | FW-01 | P0 | Correggere il watchdog durante SCAN |
| 4 | CTRL-02 | P1 | Completare FSM, ACK, runId e stato UI |
| 5 | FLASH-01 | P1 | Rendere il flash mutuamente esclusivo e ripristinabile |
| 6 | DATA-02/03/04 | P1 | Parser rigoroso, run completi e gate valutabilità |
| 7 | FW-02/03 | P1 | Rendere reale la FSM v4 e la qualità di misura |
| 8 | APP-01 | P1 | Snapshot/export coerenti e stale guard completa |
| 9 | DYN-01/02 | P1 | Gate convergenza e corretta gestione dello zero |
| 10 | MAT-01/02 | P1 | Diagrammi basati sugli eventi reali ed encoder rigoroso |
| 11 | TEST-01 | P1 | Oracle indipendenti e copertura E2E |
| 12 | REL-01/02 | P2 | Allineare release, CI e documentazione |

Non cominciare dalla documentazione: prima correggere comportamento e test,
poi aggiornare dichiarazioni e artefatti.

---

# 4. Lotto A — Integrità dei profili e dei run

## DATA-01 — Un profilo incompleto può diventare falsamente completo [P0]

### Causa confermata

- `cammes/lib/cammes-math.js:953-1017`: `parseCamFile()` inizializza i 360
  valori a zero, separando la copertura solo nella proprietà `covered`.
- `cammes/analisi.html:2340-2355`: un file con almeno 30 punti viene caricato;
  l'incompletezza produce soltanto un avviso e `slice()` perde le proprietà
  `covered`, `missingCount`, anomalie e stato.
- `cammes/analisi.html:2458-2462`: “Salva profilo” scrive sempre 360 righe con
  `Number(curve[i] || 0)`.

Riproduzione già effettuata:

```text
prima del salvataggio: valid=3, missing=357, grado4 covered=false
dopo salvataggio+rilettura: valid=360, missing=0, grado4=0, covered=true
```

Il file risultante può rientrare in analisi, timing, cam card o conformità come
se i valori assenti fossero veri zeri fisici.

### Implementazione richiesta

Introdurre e usare in tutta la pipeline un oggetto strutturato, per esempio:

```js
{
  values: Array(361),       // numero finito oppure NaN/null per mancante
  validMask: Array(361),
  status: 'COMPLETE' | 'INCOMPLETE' | 'ABORTED' | 'FAILED',
  validCount: 0,
  missingCount: 360,
  anomalies: {
    duplicateDegrees: [],
    fractionalDegrees: [],
    invalidRows: [],
    outOfRangeRows: []
  },
  meta: {}
}
```

Requisiti:

1. Un grado mancante deve rimanere mancante in parsing, trasformazioni,
   follower virtuale, rotazione, confronto, salvataggio e nuova rilettura.
2. Non usare `|| 0` o `Number(value)` senza avere prima distinto assenza e zero.
3. `slice()` non deve essere usato per perdere la maschera: creare una funzione
   esplicita di clone/transform che porti con sé maschera, stato e metadati.
4. Il salvataggio diagnostico di un profilo incompleto deve scrivere soltanto i
   gradi validi oppure un formato esplicito per i missing, mantenendo almeno:
   `#stato=INCOMPLETO`, `#validCount`, `#missingCount` e provenienza.
5. Analisi ufficiale, timing, cam card, confronto nominale e report conclusivo
   sono ammessi solo per un profilo `COMPLETE` e sintatticamente pulito.
6. È consentita una visualizzazione diagnostica dell'incompleto, ma deve essere
   separata e marcata `NON VALUTABILE`, senza pulsanti di output conclusivo.

### Test obbligatori

Creare un test E2E, non soltanto del parser:

```text
file 30/360
→ import Analisi
→ eventuale visualizzazione diagnostica
→ Salva profilo
→ nuova importazione
→ conformità/report
```

Risultati richiesti:

- prima e dopo il round-trip restano 30 validi e 330 mancanti;
- nessun missing diventa zero;
- analisi ufficiale, cam card, confronto e report restano disabilitati;
- un file completo 360/360 continua a funzionare;
- un vero valore `0` resta valido e distinto da un missing.

## DATA-02 — Parser: stringa vuota e null diventano zero [P1]

### Causa confermata

- `parseCamFile("42,")` restituisce attualmente grado 42 coperto, valore 0,
  `ok=true` perché `Number('') === 0`.
- `averageRuns()` tratta `null` come zero valido.
- `benchVerdict()` può restituire `OK` su array di `null` o stringhe vuote.
- il parser gestisce soltanto la convenzione 1…360; un file coerente 0…359
  viene interpretato come 359/360.

### Implementazione richiesta

- controllare `null`, `undefined` e stringa vuota prima della conversione;
- accettare come valore solo un numero finito ottenuto da un token non vuoto;
- usare un helper unico `parseFiniteMeasurement()`;
- rilevare la convenzione 0…359 oppure 1…360 sull'intero insieme dei gradi,
  rifiutare convenzioni miste e normalizzare internamente a una sola;
- non preinizializzare il vettore dei valori con zeri;
- distinguere `syntaxOk` da `complete`: un file può essere sintatticamente
  pulito ma incompleto.

### Test obbligatori

- `42,` → riga invalida/mancante, mai zero;
- `42;` → riga invalida/mancante;
- `null`, `undefined`, `''`, whitespace e testo → invalidi;
- `42,0` → zero valido;
- profilo 0…359 coerente → normalizzato e completo;
- profilo misto 0…359/1…360 → rifiutato;
- duplicati, frazionari e fuori range impediscono un output conclusivo.

## DATA-03 — Media dei run ripetuti produce un profilo ibrido [P1]

### Causa confermata

`cammes/lib/cammes-math.js:1024-1047` media per ogni grado tutti i valori
disponibili, ma gli snapshot non classificano ogni acquisizione come completa o
incompleta. Esempio riprodotto:

```text
run A completo: tutti i gradi = 1
run B incompleto: tutti = 3, grado 42 mancante

media corrente:
grado 42 = 1 con count=1
grado 43 = 2 con count=2
missingCount globale = 0
```

Il risultato non rappresenta né il solo run completo né una media omogenea.

### Implementazione richiesta

- aggiungere a ogni snapshot `runId`, `runStatus`, `validMask`, contatori qualità
  e motivazione del terminale;
- includere nella media principale soltanto run `COMPLETE`;
- se utile, produrre separatamente una “media diagnostica parziale”, sempre
  `NON VALUTABILE` e mai usata da report/conformità;
- aggregare invalidi e instabili di tutti i run: oggi alcuni contatori vengono
  azzerati a ogni giro;
- mostrare in UI quali run sono stati inclusi/esclusi e perché.

### Test obbligatori

- completo + incompleto → media principale uguale al solo completo;
- solo run incompleti → nessuna media ufficiale;
- due completi → `count[d]` uniforme e statistiche corrette;
- run `ABORTED` o `FAILED` mai incluso;
- contatori qualità aggregati su tutti i run.

## DATA-04 — Gate di valutabilità non uniforme [P1]

### Causa confermata

- `grafici.html` ora rende non valutabile un normale file incompleto: fix reale.
- Un file con 360 righe zero-filled e `#stato=INCOMPLETO` ha però
  `missingCount=0` e può superare il gate, perché lo stato non viene controllato.
- duplicati, frazionari e altre anomalie possono rimanere soltanto warning.
- i percorsi Analisi e confronto A/B accettano ancora profili da almeno 30 punti.

### Implementazione richiesta

Centralizzare un'unica funzione, per esempio:

```js
canProduceOfficialResult(profile) ===
  profile.status === 'COMPLETE' &&
  profile.missingCount === 0 &&
  profile.syntaxOk === true &&
  profile.anomalies tutte vuote &&
  metadati coerenti;
```

La stessa funzione deve governare:

- Analizza;
- confronto A/B;
- conformità nominale;
- cam card;
- CSV/PDF conclusivi;
- verdetti e badge.

Il confronto nominale deve inoltre esporre sia errore grezzo sia errore dopo
allineamento, con lo shift applicato. L'allineamento automatico non deve poter
nascondere un errore di fase senza renderlo evidente.

---

# 5. Lotto B — Protocollo, controller, FSM e flash

## CTRL-01 — Frame WebSocket concatenati aggirano il lease [P0]

### Causa confermata

- `cammes/cammes_server.js:1143-1160`: `isControlCommand()` controlla soltanto
  il primo carattere o il primo verbo v4.
- `cammes/cammes_server.js:1239-1263`: dopo la classificazione viene inoltrato
  l'intero messaggio.
- `master/master.ino:1109-1126`: il firmware consuma più comandi presenti nello
  stesso flusso e alcuni comandi a carattere singolo sono eseguiti subito.

Payload già riprodotti come non-control o ammessi dal ramo STOP:

```text
?\nS+360\n
0 STATUS\n1 SCAN run=1 dir=+ units=360\n
xS+360\n
```

Questo è nel perimetro funzionale: può accadere per bug UI, doppia scheda o
frame malformato anche in una rete completamente fidata.

### Implementazione richiesta

1. Un frame WebSocket deve contenere una sola operazione.
2. Normalizzare al massimo un terminatore `\r\n` o `\n` finale.
3. Rifiutare newline interni, NUL, prefissi/suffissi e comandi concatenati.
4. Parsare l'intero frame in un oggetto strutturato prima di decidere lease,
   bridge e scrittura seriale.
5. Usare grammatiche ancorate a inizio e fine e range espliciti.
6. Per STOP scrivere sempre la costante `'x'`, mai il testo ricevuto.
7. Non inoltrare comandi sconosciuti o parzialmente validi.
8. Correggere anche `bridgeOutgoing()`: l'attuale regex `/^S([+-])(\d+)/`
   accetta suffissi come `S+360junk`.

### Test obbligatori

Usare una seriale mock e verificare esattamente i byte scritti:

- tutti i payload concatenati sopra → zero byte di movimento;
- observer con query singola valida → query ammessa;
- observer con comando di controllo singolo → rifiutato;
- controller con comando singolo valido → inoltrato una sola volta;
- STOP esatto → viene scritto esattamente `x` una sola volta;
- `S+360junk`, whitespace iniziale, NUL, doppio newline → rifiutati.

## CTRL-02 — FSM server e correlazione sono ancora parziali [P1]

### Causa confermata

- il server conserva principalmente `controller = ws`, non una FSM autorevole;
- `releaseLease()` libera subito il controllore dopo aver scritto `x`, senza
  attendere un terminale;
- gli ACK v4 vengono scartati in `bridgeIncoming()`;
- soltanto `SAMPLE` filtra il `runId`; `DONE`, `STOPPED` e `FAULT` vecchi possono
  terminare il run corrente;
- `deviceState` deriva principalmente dall'HELLO e può diventare stale;
- il keepalive firmware viene inviato anche senza un controller/run valido;
- FREE/LOCK e STOP sono mostrati ottimisticamente dalla UI prima della conferma;
- `safeReload()` usa ancora un timeout fisso invece di attendere lo stato.

### Implementazione richiesta

Creare una FSM server realmente usata, non soltanto dichiarata. Stato minimo:

```text
OFFLINE
IDLE_LOCKED
FREE
SCANNING
MANUAL_MOVE
TONE
STOPPING
FLASHING
FAULT
```

Requisiti:

- un solo comando mutante pendente per dispositivo;
- `seq`, `runId`, stato atteso, timeout e terminale associati al comando;
- ACK/NACK non devono essere inghiottiti: devono aggiornare lo stato/coda;
- filtrare per runId tutti gli eventi, inclusi `DONE`, `STOPPED` e `FAULT`;
- dopo perdita/rilascio del controller: STOP costante, stato `STOPPING`, nuovo
  takeover soltanto dopo terminale coerente oppure timeout esplicito;
- keepalive soltanto quando il server possiede un contesto valido che deve
  mantenere vivo; non deve mascherare l'assenza del controller;
- lease con scadenza applicativa rinnovata dalla UI viva, non soltanto dal
  ping/pong del trasporto;
- snapshot di stato inviato a ogni client al collegamento;
- FREE/LOCK, STOP e reload diventano `pending` fino ad ACK/evento terminale;
- stato fisico e dichiarato al boot devono coincidere: attualmente ENA è
  disabilitato mentre lo stato viene annunciato come `IDLE_LOCKED/free=0`.

### Test obbligatori

- controller chiuso durante scan → STOP e stato terminale;
- secondo client non può iniziare finché il primo STOP non è concluso;
- `DONE` tardivo del run precedente viene ignorato;
- ACK/NACK aggiorna la UI, non una previsione locale;
- FREE rifiutato/BUSY → UI non mostra FREE;
- reload avviene solo dopo terminale, non dopo 250 ms;
- dopo reboot lo snapshot sostituisce ogni stato browser precedente;
- due schede dello stesso PC rispettano la stessa proprietà del controller.

## FLASH-01 — Race nella procedura di flash [P1]

### Causa confermata

`cammes/cammes_server.js:585-627` verifica `flashInProgress`, ma imposta il flag
solo dentro `launchFlash()` dopo una `SerialPort.list()` asincrona. Due richieste
quasi simultanee possono superare entrambe il primo controllo.

La guardia considera inoltre soltanto l'attività recente dello scan, non lo
stato completo di MOVE/TONE/controller.

### Implementazione richiesta

- acquisire sincronicamente uno stato `PROBING/FLASHING` prima di ogni callback
  o operazione asincrona;
- racchiudere l'intera transazione in `try/finally` e liberare sempre il flag;
- consentire un solo flash alla volta;
- accettare il flash soltanto da uno stato autorevole fermo;
- bloccare nuovi comandi durante `PROBING/FLASHING`;
- verificare porta, device ID/protocollo atteso e hash del firmware scelto;
- dopo il flash riaprire la seriale, attendere HELLO e verificare versione e
  device; in caso contrario lasciare uno stato di errore esplicito;
- non chiudere la seriale in mezzo a un'operazione senza averne concluso lo
  stato applicativo.

### Test obbligatori

- due richieste simultanee → un solo processo di programmazione;
- errore durante lista porte/spawn → flag rilasciato;
- run attivo → flash rifiutato senza effetti collaterali;
- porta diversa/device diverso → rifiutato;
- successo → seriale riaperta e versione confermata;
- errore post-flash → stato esplicito, non falso “completato”.

---

# 6. Lotto C — Firmware v4 e qualità della misura

## FW-01 — Watchdog v4 inefficace durante SCAN [P0]

### Causa confermata

`master/master.ino:361` assegna `g_lastHeartbeatMs = millis()` entrando in
`stepperMove()`. `autonomousScan()` chiama `stepperMove()` a ogni unità, alla
riga 606. Lo scan rinnova quindi autonomamente il proprio heartbeat anche se
l'host non trasmette più `~`/HEARTBEAT e può arrivare a `EVT DONE`.

Il bench v4 prova il timeout soltanto su MOVE, non su SCAN.

### Implementazione richiesta

- inizializzare il riferimento heartbeat una volta all'accettazione del run;
- aggiornarlo esclusivamente alla ricezione di `~` o HEARTBEAT v4 valido;
- non aggiornarlo in `stepperMove()`, nel loop dello scan o per byte casuali;
- controllare il timeout in ogni ciclo lungo;
- su timeout non emettere `DONE`;
- rendere lo stato coerente col protocollo dichiarato: se `HOST_TIMEOUT` è un
  fault latched, impostare davvero `FAULT_HOST_TIMEOUT` e richiedere reset;
  altrimenti cambiare specifica e test in modo esplicito. Non lasciare una FSM
  nominale che dichiara uno stato mai usato.

### Test obbligatori

- scan lungo con heartbeat regolare → completa;
- scan lungo senza heartbeat → termina entro la soglia;
- byte casuali senza heartbeat → timeout comunque;
- dopo timeout non compare `DONE`;
- il timestamp non cambia per effetto dei soli passi;
- regressione MOVE e scan v3;
- prova al banco solo se autorizzata; altrimenti stato `FIXED_SOFTWARE`.

## FW-02 — FSM e parser v4 sono in parte nominali [P1]

### Causa confermata

- `ST_STOPPING`, `ST_TONE`, `FAULT_HOST_TIMEOUT` e `FAULT_SENSOR` risultano
  dichiarati ma non realmente assegnati nei flussi previsti;
- TONE v4 non è implementato, mentre il protocollo descrive una FSM più ampia;
- il parser SCAN/MOVE accetta argomenti extra; `kvDir()` guarda solo il primo
  carattere, quindi `dir=++` può risultare `+`;
- non esiste deduplicazione per sequence ID: lo stesso MOVE/seq può essere
  eseguito due volte;
- durante BUSY il firmware drena caratteri, non frame correlati: STATUS/STOP/
  HEARTBEAT framed non ricevono una risposta coerente;
- TONE usa ancora parsing permissivo e può produrre terminali doppi in alcuni
  ordini temporali;
- con `proto<4` il server continua il fallback v3: se è una scelta voluta, va
  dichiarata come compatibilità, non come requisito v4 integralmente chiuso.

### Implementazione richiesta

- o implementare realmente ogni stato/verbo dichiarato, oppure ridurre la
  specifica agli stati realmente supportati;
- parser dell'intera riga con elenco esatto delle chiavi ammesse e controllo
  dei duplicati;
- `dir` deve essere esattamente `+` o `-`;
- cache limitata delle ultime sequence e della relativa risposta per evitare la
  riesecuzione di un comando ritrasmesso;
- un solo terminale per ogni run;
- NACK/BUSY correlato al comando quando possibile;
- centralizzare in funzioni `beginOperation`, `finishOperation`, `abortOperation`
  gli aggiornamenti di stato e l'emissione degli eventi;
- scegliere e documentare chiaramente il comportamento con firmware legacy.

### Test obbligatori

- `dir=++`, chiavi ignote, duplicate o trailing garbage → NACK;
- stesso `seq` MOVE inviato due volte → movimento eseguito una sola volta;
- un solo terminale per STOP tardivo durante TONE;
- STATUS e heartbeat durante BUSY hanno comportamento documentato;
- ogni stato dichiarato ha almeno una transizione reale e testata;
- testare il parser compilato/simulato, non soltanto cercare enum/stringhe nel
  sorgente con regex.

## FW-03 — “Precisione” e qualità sensore non governano lo scan [P1]

### Causa confermata

- `cfgSamples` è usato da `readSensorMm()`/comando `m`, ma scan autonomo e
  comandi p/q usano `readSensorStableMm()`; le modalità c1/c3 possono quindi
  eseguire lo stesso algoritmo effettivo;
- p/q applicano `cfgSettleMs` sia dentro `stepperMove()` sia prima della lettura;
- `FAULT_SENSOR` non viene impostato realmente;
- una scansione può terminare con NaN/instabili senza uno stato di run adeguato.

### Implementazione richiesta

- creare una sola pipeline di acquisizione parametrizzata da modalità, numero
  campioni, criterio di stabilità e timeout;
- applicare il settle una sola volta nel punto documentato;
- fare in modo che le modalità UI corrispondano a un comportamento misurabile;
- propagare per ogni campione `VALID`, `UNSTABLE`, `INVALID` o equivalente;
- impostare stato run/fault coerente dopo una soglia motivata di invalidi
  consecutivi o totali;
- riportare nei metadati configurazione e statistiche aggregate del run.

### Test obbligatori

- c1 e c3 producono il diverso numero previsto di letture/frame;
- settle contato una sola volta;
- timeout sensore → campione invalido, non ultimo numero apparentemente valido;
- troppi invalidi → run non COMPLETE;
- metadati riportano invalidi/instabili di tutto il run.

---

# 7. Lotto D — Applicazione, dinamica e matematica

## APP-01 — Snapshot ed export possono mescolare risultati vecchi e nuovi [P1]

### Causa confermata

`cammes/analisi.html:2729-2747` aggiorna parte di `lastAnalysis.results` e gli
input durante il live retuning, ma non tutti gli array per grado. Con compliance
OFF non sempre marca l'analisi stale. Il CSV può quindi esportare array calcolati
con parametri precedenti accanto a un riepilogo aggiornato.

I listener non coprono tutti i parametri influenti, inclusi alcuni parametri del
follower e del surge.

### Implementazione richiesta

- snapshot immutabile di tutti gli input e dei profili sorgente;
- `analysisId` e `parameterHash` associati a riepilogo, array, grafici ed export;
- qualsiasi input influente invalida l'intero risultato;
- includere almeno follower, geometria, RPM, masse, molla, compliance, damping,
  surge, massa molla e numero spire;
- live retuning ammesso solo se ricalcola atomicamente tutti i risultati
  dipendenti; altrimenti deve disabilitare gli export fino a “Analizza”;
- PDF, CSV e cam card devono verificare l'hash prima di generarsi.

### Test obbligatori

- cambiare ciascun input influente → export disabilitato;
- summary, array, grafico e PDF condividono lo stesso hash;
- con compliance OFF il cambio RPM/molla non lascia l'export attivo;
- nuova analisi riabilita l'export;
- nessun CSV contiene forze vecchie con intestazione nuova.

## DYN-01 — NON_CONVERGED non blocca verdetti ed export [P1]

### Causa confermata

I solver ora espongono `converged`, ma `analisi.html` mostra principalmente un
toast e continua con risultati, sweep, ottimizzatore e report. Il test corrente
di convergenza contiene controlli troppo deboli, incluso un controllo
tautologico.

### Implementazione richiesta

- risultato tipizzato `CONVERGED` / `NON_CONVERGED` / `INVALID_INPUT`;
- in caso non convergente conservare i dati diagnostici, ma non produrre regime
  critico, badge positivo, ottimizzazione o report conclusivo;
- salvare nello snapshot `converged`, cicli eseguiti, tolleranza e residuo;
- sweep e ottimizzatore devono propagare lo stato non valutabile;
- sostituire test tautologici con casi nominali ed estremi dai risultati attesi.

### Test obbligatori

- caso nominale → converge entro la tolleranza;
- caso estremo → `NON_CONVERGED`, nessun verdetto positivo/export;
- UI, CSV e PDF riportano lo stesso stato;
- sweep non usa un punto non convergente come soluzione valida.

## DYN-02 — Lo zero valido viene sostituito dal default [P1]

### Causa confermata

In diversi punti UI e in `simulateSpringSurge()` viene usato il pattern
`Number(x) || default`. Un damping esplicito `0` viene quindi sostituito con
`0.06`. Pattern analoghi possono colpire altri parametri per cui zero è valido.

### Implementazione richiesta

- helper unico che distingue valore assente/invalido da zero finito;
- usare default solo per input assente o invalido;
- applicare range espliciti separatamente;
- per il surge: aggiungere un criterio di convergenza oppure marcare chiaramente
  il risultato a cicli fissi come preliminare;
- mantenere i modelli 3DOF/surge/baseline dichiarati esplorativi finché non
  esiste validazione indipendente;
- la baseline euristica non dovrebbe essere attiva di default senza evidenza.

### Test obbligatori

- damping 0 resta 0 end-to-end;
- default applicato a campo vuoto/NaN, non a zero;
- stesso principio per ogni altro parametro che ammette zero;
- test 3DOF con invarianti fisici più stringenti del semplice limite `<25 mm`.

## MAT-01 — Numeri di fasatura corretti, diagramma ancora simmetrico [P1]

### Causa confermata

`findEvents()` calcola crossing reali e il caso asimmetrico numerico è migliorato.
Il doughnut continua però a ricevere centro e durata e ricostruisce gli estremi
come `centro ± durata/2`, quindi la visualizzazione può contraddire tabella e PDF.

Inoltre crossing multipli o due lobi distinti non producono sempre uno stato
ambiguo; plateau equivalenti possono essere risolti scegliendo il primo.

### Implementazione richiesta

- memorizzare nello snapshot l'oggetto eventi completo;
- diagramma, tabella, cam card e PDF usano direttamente `openIdx/closeIdx` o gli
  angoli interpolati, con gestione circolare del wrap;
- se esistono più coppie plausibili, restituire `AMBIGUOUS` con tutte le coppie
  candidate oppure applicare una regola documentata;
- stessa logica per picchi/plateau equivalenti;
- tolleranza del picco legata almeno alla risoluzione/configurazione di misura,
  non soltanto a una percentuale hardcoded.

### Test obbligatori

- profilo asimmetrico → grafico, tabella e PDF mostrano gli stessi eventi;
- attraversamento 360/1 corretto;
- due lobi → `AMBIGUOUS`, non prima coppia silenziosa;
- due plateau equivalenti → ambiguità esplicita;
- nessuna ricostruzione `centro ± durata/2` nel rendering.

## MAT-02 — Reindicizzazione encoder troppo permissiva [P1]

### Causa confermata

`cammes/lib/cammes-math.js:1170-1207` verifica principalmente che lo span superi
il 70% del giro e che esistano abbastanza bin. Accetta un giro al 90%, uno span
del 150% e sequenze con inversioni; il test esistente considera esplicitamente
accettabile il 90%.

### Implementazione richiesta

- usare counts/rev calibrati per dispositivo;
- limiti inferiore e superiore di closure con tolleranza dichiarata;
- controllo di monotonicità nella direzione attesa, jitter ammesso e limite ai
  backstep;
- controllare wrap, duplicati, copertura, gap massimo e bin multipli;
- interpolare soltanto gap piccoli;
- propagare valid mask e stato del profilo;
- se questa funzione non è più usata dalla UI, valutarne la rimozione esplicita
  invece di mantenerla come percorso apparentemente affidabile.

### Test obbligatori

- giro completo valido → accettato;
- 90% → incompleto/rifiutato per uso ufficiale;
- 150% → rifiutato;
- inversioni/backtracking oltre jitter → rifiutati;
- wrap valido in entrambe le direzioni → accettato;
- gap eccessivo → non valutabile.

---

# 8. Lotto E — Test e oracle

## TEST-01 — La suite verde non prova tutti i requisiti [P1]

### Problemi confermati

- `test_fw_parser.js` è soprattutto un guardiano sorgente basato sulla presenza
  di stringhe; non dimostra le transizioni reali del parser/FSM compilato.
- `test_controller_lease.js` non usa una seriale finta per frame concatenati,
  TTL e race STOP→takeover.
- `bench_v4_test.js` prova il watchdog su MOVE ma non su SCAN.
- `test_convergenza.js` contiene asserzioni troppo deboli.
- `test_3dof.js` accetta risultati non plausibili con un limite molto ampio.
- `validate_rif2.js` usa valori dichiarati corretti senza un oracle indipendente
  sufficientemente tracciato.
- mancano test E2E import incompleto → salvataggio → nuova importazione → report.

### Test da aggiungere

Creare o equivalenti:

```text
tools/test_profile_roundtrip_incomplete.js
tools/test_complete_run_average.js
tools/test_ws_frame_validation.js
tools/test_motion_fsm.js
tools/test_stop_generation.js
tools/test_flash_interlock.js
tools/test_protocol_v4_runtime.js
tools/test_watchdog_scan.js
tools/test_snapshot_coherence.js
tools/test_timing_events_e2e.js
tools/test_release_consistency.js
```

Regole:

- ogni test deve fallire sul comportamento v3.4.1 precedente alla patch;
- per server/seriale usare fake clock e seriale mock con byte verificati;
- per matematica usare calcolo manuale, fixture congelata esterna o seconda
  implementazione indipendente, non la stessa funzione sotto test;
- per HTML inline, estrarre dove possibile funzioni pure testabili;
- aggiungere i nuovi test a `npm test` e al workflow CI;
- distinguere sempre test software da test sul banco.

---

# 9. Lotto F — Release, metadati e documentazione

## REL-01 — Manifest, lockfile, SBOM e registro rischi sono disallineati [P2]

### Causa confermata

- `package.json` è 3.4.1, ma `package-lock.json` dichiara ancora 3.3.0;
- `cammes/SBOM.json` e `SBOM.md` dichiarano app 3.3.0 e firmware 3.7;
- `RELEASE_MANIFEST.json` contiene ancora “tag v3.4.0” nel campo commit;
- il manifest dichiara `openP0: []` nonostante DATA-01, CTRL-01 e FW-01;
- `REMAINING_RISKS.md` mescola sezioni aggiornate e storiche contraddittorie;
- `cammes/fw/version.json` termina ancora dicendo che la riproducibilità è
  aperta, mentre il workflow la dimostra chiusa;
- alcuni documenti conservano hash/versioni firmware precedenti.

### Implementazione richiesta

- aggiornare versione del lockfile con `npm install --package-lock-only` o
  equivalente coerente, senza aggiornare dipendenze incidentalmente;
- rigenerare SBOM dopo aver corretto i metadati;
- usare commit SHA reale nel manifest;
- generare automaticamente versione, tag, commit e hash firmware;
- `openP0` deve derivare dal registro corrente, non essere scritto a mano;
- riscrivere `REMAINING_RISKS.md` come stato attuale, spostando lo storico in
  changelog o documento separato;
- rimuovere affermazioni più forti dell'evidenza: “validato” deve indicare
  esattamente quale percorso/test è stato eseguito;
- allineare le descrizioni del firmware v4 a ciò che è realmente implementato.

### Test obbligatori

- nessun riferimento residuo a app 3.3.0, tag 3.4.0 o firmware 3.7 negli
  artefatti correnti, salvo sezioni esplicitamente storiche;
- package, lock, manifest e SBOM hanno la stessa versione;
- commit/tag/hash firmware coincidono con Git;
- validazione dello schema SBOM;
- script `test_release_consistency.js` fallisce su qualsiasi disallineamento.

## REL-02 — Workflow release non usa tutti i gate dichiarati [P2]

### Stato corrente

La release v3.4.1 è stata costruita con successo e gli hash sono coerenti. Il
workflow usa però `npm install`, esegue i test ma non il lint e non collega il
gate firmware all'esatto tag di release. Non esiste uno smoke test dell'EXE.

### Implementazione richiesta

- usare `npm ci` da lockfile coerente;
- eseguire lint, suite completa, coerenza versioni e validazione SBOM;
- verificare/ricompilare il firmware dell'esatto commit/tag della release;
- aggiungere smoke test senza hardware: avvio su porte alternative, endpoint
  stato/versione raggiungibile e chiusura pulita;
- produrre manifest e SBOM nella CI e fallire se differiscono dai file attesi;
- allegare alla release manifest, SBOM e note correnti;
- non pubblicare se uno dei gate funzionali fallisce.

La migrazione del runtime/build tool può essere pianificata separatamente: non è
un P0 funzionale di questo handoff.

## REL-03 — Linguaggio e documentazione da rendere coerenti [P2]

Per decisione del proprietario non sono richiesti sistemi di emergenza fisica.
Pertanto:

- sostituire “STOP di emergenza”, “E-stop” e “fungo” con “STOP software” o
  “arresto movimento” dove si descrive il prodotto corrente;
- eliminare richieste di nuovo hardware di emergenza dal piano corrente;
- mantenere STOP, watchdog e controller unico come proprietà funzionali;
- nei risultati dinamici sostituire formule assolute come “motore sicuro” o
  “zona sicura” con “entro le soglie del modello”, “esito indicativo” o
  “non valutabile” secondo convergenza e qualità dati;
- non chiamare “documento completo per validare il treno valvole” un report
  prodotto da modelli dichiarati esplorativi;
- distinguere chiaramente `FIXED_SOFTWARE`, prova al banco e validazione
  metrologica indipendente.

---

# 10. Matrice minima di accettazione finale

| ID test | Scenario | Esito obbligatorio |
|---|---|---|
| T01 | Frame `?\nS+360\n` da observer | Nessun byte di moto |
| T02 | Frame `xS+360\n` | Esattamente `x`, nessun comando successivo |
| T03 | `S+360junk` | Rifiutato integralmente |
| T04 | Scan v4 lungo senza heartbeat | Timeout, nessun `DONE` |
| T05 | Scan v4 con heartbeat | Completa normalmente |
| T06 | Controller perso, secondo client attivo | Nuovo start solo dopo terminale |
| T07 | Evento DONE di run precedente | Ignorato |
| T08 | Due flash concorrenti | Un solo processo di flash |
| T09 | Flash fallisce | Flag/stato ripristinati |
| T10 | File 30/360 salva+rileggi | Resta 30/360 e NON VALUTABILE |
| T11 | Riga `42,` | Invalida, non zero |
| T12 | Vero `42,0` | Zero valido |
| T13 | Convenzione 0…359 coerente | Normalizzata correttamente |
| T14 | Completo + incompleto in media | Incompleto escluso dalla media ufficiale |
| T15 | Profilo `#stato=INCOMPLETO` con 360 righe | NON VALUTABILE |
| T16 | Cambio parametro dopo analisi | Export disabilitato |
| T17 | Damping `0` | Rimane zero |
| T18 | Solver non convergente | Nessun verdetto/report conclusivo |
| T19 | Profilo asimmetrico | Grafico = tabella = PDF |
| T20 | Encoder 90%, 150% o inversioni | Non valutabile/rifiutato |
| T21 | Versioni package/lock/SBOM/manifest | Tutte uguali a tag corrente |
| T22 | Build release da clone pulito | Tutti i gate funzionali passano |

---

# 11. Definition of done

La revisione può essere dichiarata chiusa soltanto quando:

1. DATA-01, CTRL-01 e FW-01 hanno test riproducibili che falliscono sulla
   v3.4.1 originale e passano dopo la patch;
2. nessun missing viene trasformato in zero in qualsiasi round-trip;
3. tutti gli output conclusivi usano solo profili completi e puliti;
4. un frame WebSocket rappresenta esattamente una operazione;
5. ACK, runId, stato server, firmware e UI sono coerenti;
6. watchdog SCAN e flash concorrente hanno test specifici;
7. mancata convergenza o snapshot stale bloccano il verdetto/export;
8. grafici, tabelle e PDF usano gli stessi eventi e lo stesso snapshot;
9. i nuovi test sono inclusi nella suite e nella CI;
10. `npm test` e `npm run lint` passano integralmente;
11. manifest, lockfile, SBOM e documentazione descrivono il commit reale;
12. `openP0: []` viene scritto soltanto dopo avere soddisfatto i punti 1–3;
13. eventuali prove non eseguite sul banco restano marcate
    `NEEDS_HARDWARE_VALIDATION`, senza dichiarazioni assolute;
14. non è stato aggiunto lavoro fuori perimetro su cybersecurity o sicurezza
    fisica e non sono state rimosse le protezioni già esistenti.

---

# 12. Consegna richiesta a Claude

Al termine Claude deve fornire:

- elenco dei commit o patch per lotto;
- tabella `ID → causa → file modificati → test → stato`;
- output completo di `npm test` e `npm run lint`;
- output dei nuovi test specifici;
- elenco dei test hardware non eseguiti;
- diff o riepilogo di manifest, SBOM e registro rischi;
- conferma esplicita di non avere modificato dati di misura storici;
- conferma esplicita di non avere pubblicato release o flashato firmware senza
  autorizzazione;
- elenco onesto degli eventuali rilievi ancora `PARTIAL`.

Il risultato atteso non è “far diventare verde il documento”, ma rendere verdi
i percorsi reali e poi allineare il documento a ciò che è stato dimostrato.
