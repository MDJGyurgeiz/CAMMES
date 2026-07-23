# CAMMES — Modello di controllo del moto (design Lotto A)

> **Stato: DESIGN.** Documento di progetto richiesto dalla controrevisione
> prima dell'implementazione del Lotto A (autorità server, lease, FSM, STOP).
> L'implementazione va fatta e **validata al banco** (latenze, ENA, fault):
> quelle prove sono NEEDS_HARDWARE_VALIDATION e non sono in questo documento.

## 1. Confine funzionale

- Il **server** è l'unica entità che scrive sulla seriale. Nessun testo
  WebSocket arbitrario raggiunge l'Arduino.
- Non si aggiunge hardware di arresto (perimetro concordato col committente:
  non sono richiesti sistemi di emergenza fisica — REL-03). STOP software,
  watchdog, FREE e controllo unico sono requisiti **software** del prodotto.

## 2. Controller lease

- Il primo client autorizzato acquisisce un **lease** (id casuale legato al
  socket). Gli altri client sono **observer read-only**.
- Heartbeat applicativo del proprietario ~ogni 500 ms; TTL 2 s (clock monotono
  server). Chiusura socket o ping fallito → lease revocato subito.
- Solo il proprietario può: configurare, muovere (p/q/$/S), FREE/LOCK, Concerto,
  flash. **Qualsiasi** client autenticato può chiedere STOP.
- Lease scaduto non riutilizzabile; takeover solo con banco IDLE confermato e
  conferma esplicita.
- Alla perdita del lease: invalidare runId e callback pendenti → STOPPING →
  STOP prioritario → attesa evento terminale → FAULT se l'arresto non è
  confermato → nessun nuovo moto fino a recovery esplicita.
- `home.html` (Concerto) e `alzata.html` usano lo **stesso** lease e la stessa
  API: niente più socket indipendenti.

## 3. FSM autorevole del server

```
OFFLINE  IDLE_LOCKED  CONFIGURING  SCANNING  MANUAL  TONE
STOPPING  FREE  FLASHING  FAULT
```

Regole: lo stato cambia su **ACK/evento firmware**, non sul click; da IDLE a
SCANNING/MANUAL/TONE solo con lease valido; qualunque stato di moto → STOPPING
su STOP / perdita lease / perdita seriale / fault; STOPPING → IDLE_LOCKED solo
con evento terminale; timeout STOP → FAULT; IDLE→FREE solo dopo ACK FREE,
FREE→IDLE solo dopo ACK LOCK; reset/boot inatteso o firmware incompatibile →
FAULT/OFFLINE; FLASHING acquisito **prima** delle operazioni asincrone; un
evento con vecchio runId non cambia lo stato. Coda seriale unica: al massimo un
comando ordinario in attesa di ACK; STOP invalida la generazione, svuota la coda
e passa davanti.

## 4. STOP e ACK terminale

STOP idempotente anche a banco fermo. Flusso: server invalida runId+coda →
STOPPING → STOP prioritario → firmware porta STEP a livello inattivo e chiude
ogni operazione → firmware emette **un solo** evento terminale
(`EVT STOPPED run=.. reason=.. state=IDLE_LOCKED` oppure
`EVT FAULT ... state=FAULT`) → server IDLE_LOCKED o FAULT → UI aggiornata dallo
stato server. `safeReload` attende IDLE_LOCKED/FREE/FAULT, non un timeout fisso.

Target funzionali (da MISURARE al banco, NEEDS_HARDWARE):
- STOP server → ultimo fronte STEP ≤ 100 ms;
- perdita controller → ultimo STEP ≤ TTL lease + 100 ms;
- perdita Node/USB → arresto entro il timeout firmware (≤ 2 s raccomandato);
- dopo ACK STOP nessuno STEP senza un nuovo START esplicito.

## 5. FREE / LOCK

Tutti i percorsi di moto passano da **una sola** `beginMotion`; nessun ramo
scrive ENA direttamente (solo `driverEnable`/`driverDisable` con polarità
documentata). In FREE, p/q/$/S/TONE → `NACK FREE` e zero STEP. FREE durante moto
→ `BUSY` o STOP prima. La UI mostra FREE/LOCK solo dopo ACK server; al reconnect
interroga lo stato. Boot preferibilmente con driver disabilitato (FREE),
richiedendo LOCK esplicito prima del moto. Politica ENA di STOP/FAULT
documentata qui e verificata all'oscilloscopio (NEEDS_HARDWARE).

## 6. Flash sicuro

Acquisire FLASHING **sincrono** prima di `SerialPort.list`; richiede
auth+lease; solo da IDLE_LOCKED/FREE confermati; STOP+ACK anche se il server
crede fermo; verifica **device id** (non solo COM); blocca tutti i comandi;
verifica hash HEX prima di avrdude; dopo il flash verifica device id/firmware/
protocollo; ogni errore → FAULT; due richieste simultanee → un solo avrdude.
(La guardia once su error+close e la verifica-porta-presente sono già presenti,
SER-02/03; il resto è Lotto A.)

## 7. Stato attuale vs target (onesto)

Già presenti: STOP `x` interrompibile in tutti i percorsi (fw 3.6, `*mabort`/
`*sabort`/`*tabort`), watchdog host 5 s (`*wdt`), timer browser cancellati da
STOP + generation token, socket UI unico, interblocchi UI `_scanBusy`, flash
once-guard + porta verificata. **Mancano** (Lotto A, da implementare + banco):
lease esclusivo, observer read-only, FSM server autorevole con eventi terminali
espliciti, ACK di FREE/LOCK, e la migrazione di Concerto sullo stesso lease.
Fino ad allora: MOT-02/03/04 restano PARTIAL/OPEN (REMAINING_RISKS).
