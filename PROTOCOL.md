# CAMMES — Protocollo seriale (v3 + v4)

> **Stato: v3 = IMPLEMENTATO; v4 = IMPLEMENTATO in modo ADDITIVO (fw 4.1,
> introdotto col 4.0), VALIDATO AL BANCO il 2026-07-19** (COM5: regressione v3 39/39 +
> `bench_v4_test.js` 25/25). v4 NON sostituisce v3: convive, discriminato dalla
> cifra iniziale della riga. Il firmware annuncia `proto=4`; il server negozia
> (keep-alive heartbeat `~`, STATUS, stato/deviceId esposti). **Bridge di scan
> server↔v4 FATTO e validato al banco (2026-07-19)**: il server traduce lo
> scan-start `S±N` della UI in `SCAN run=…` v4 e ritraduce gli `EVT SAMPLE/DONE/
> STOPPED/FAULT` nel formato v3 (`#i:enc:mm`/`*sstat`/`*sdone`/`*sabort`) — la UI
> resta INVARIATA ma il data-path di misura passa per v4 (runId, ACK, heartbeat
> dedicato). Resta Fase 2b: EVT nativi nella UI + bridge di `$`/MOVE. Storico
> design sotto: la maggior parte è ora realtà.

## Protocollo v3 (attivo, parlato dalla UI; fw attuale 4.1) — PC → Arduino

| Cmd | Significato |
|---|---|
| `p` / `q` | 1 unità (∓) + misura → `X.XX enc` + `*se` |
| `$±NNN` | rotazione manuale (unità), tetto 3600 → `*mv` / `*mabort` |
| `S±NNNNN` | scan autonomo, tetto 1500 → stream `#i:enc:mm` … `*sstat u=N` `*sdone` / `*sabort` |
| `x` | STOP: `*mabort`/`*sabort`/`*tabort`; a fermo è no-op consumato |
| `m` | misura sola → `*sm` |
| `?` | `encoder=N deg=X.XX` `*pos` |
| `!` | reset zero encoder |
| `f` / `l` | FREE (`*free`) / LOCK (`*lock`); in FREE i movimenti → `*locked` |
| `cN rN wN uN aN gN kS` | config (samples/step/settle/pulse/accel/gentle/preset) → `*cfg` |
| `tF:D:S[:V]` | TONE Concerto → `*tend` / `*tabort` |
| `d` | dump grezzo sensore (16 bit + indice) → `*dbg` |
| `~` | heartbeat dedicato (byte singolo, tiene vivo il watchdog; accettato anche fuori dal moto) |
| `v` | `ver=4.1 scan=1 proto=4 free=<0\|1>` + `*ver` — `proto=4` è il token su cui il server decide di attivare il bridge v4 |
| `!` | reset zero encoder → `*zero` |

Eventi/terminali v3 (fw 4.1): `*se *sm *sdone *sabort *mv *mabort *wdt *tend
*tabort *locked *sstat *cfg *free *lock *pos *boot *err *busy *fault *zero
*ver *dbg`. Boot: `CAMMES Uno ready` + `*boot ver=.. r=.. samp=.. settle=..
free=.. rst=0x..` (reset reason MCUSR). Watchdog host: nessun byte per 5 s
durante il moto → `*wdt`+abort. Parser: `strtol` con range su S/`$`;
overflow → flush; comando ignoto a fermo → consumato.

**Limiti v3 (perché serve v4):** nessun runId/sequence per correlare
comando↔risposta; il watchdog è tenuto vivo da QUALSIASI byte (anche newline),
oltre che dall'heartbeat `~`; durante il moto un comando non-STOP riceve
**un solo `*busy` per operazione** (FW-09) — dichiarato, ma senza seq di
correlazione; nessuna `STATUS/HELLO` completa con device id; protocollo non
numerato.

## Protocollo v4 (implementato, fw 4.1)

Formato con correlazione, stato e grammatica completa (i numeri sono esempi):

```
PC→Arduino:
  42 STATUS
  43 LOCK
  44 CONFIG step=32 samples=3 settle=50
  45 SCAN run=17 dir=- units=360
  46 MOVE run=18 dir=+ units=100
  47 TONE run=19 hz=440 ms=500 dir=+ duty=70
  48 FREE
  49 RESET_FAULT
  50 HEARTBEAT
  STOP            (fuori coda, priorità assoluta)

Arduino→PC (formati REALI del fw 4.1):
  ACK 45 state=SCANNING              (l'ACK NON porta run=)
  NACK 46 code=BUSY state=SCANNING
  EVT SAMPLE run=17 idx=1 enc=4 mm=0.01 q=OK
  EVT DONE run=17 state=IDLE_LOCKED
  EVT STOPPED run=17 reason=USER state=IDLE_LOCKED
  EVT FAULT run=17 code=ENCODER_JAM state=FAULT
  EVT BUSY run=17                    (comando arrivato durante un run v4;
                                      fuori da un run v4 esce il v3 "*busy")
  HELLO proto=4 fw=4.1 dev=<id> state=.. free=.. fault=.. rst=..
                                     (l'HELLO NON porta cfg=)
```

Requisiti parser v4: buffer fisso + flag `overflowed` (dopo overflow scartare
fino a EOL); `strtol` con inizio/fine/segno/range per ogni numero; niente
`atoi`; rifiuto trailing garbage/NUL; comando ignoto/malformato → **un solo**
`NACK`; durante il moto sono servite solo le forme a **byte singolo** `x` (STOP)
e `~` (heartbeat) — STATUS e le altre righe ricevono `EVT BUSY`/`*busy` (una
volta per operazione) e vengono scartate, mai in silenzio; sequence id per
dedup; runId su campioni/terminali.

Fault locali (latched): host timeout (solo HEARTBEAT tiene vivo il watchdog, non
byte casuali), encoder jam (avanzamento atteso vs reale con finestra/tolleranza),
sensore assente/invalido (preflight + limite invalidi consecutivi), limiti
passo/tempo per comando e per run. `RESET_FAULT` valido solo da fermo, causa
rimossa, azione esplicita. Nessuna partenza automatica dopo boot/reconnect/reset.

Device id stabile: seriale USB affidabile o id in EEPROM con CRC — non il solo
nome COM. Firmware legacy (proto<4) non può muovere con server v4 →
`UPDATE_REQUIRED`, mai fallback silenzioso.

FSM firmware v4: `BOOT FREE IDLE_LOCKED MOVING SCANNING TONE STOPPING FAULT`;
ingresso/uscita moto e livelli STEP/DIR/ENA centralizzati; nessun movimento
fuori da MOVING/SCANNING/TONE; TONE un solo terminale (DONE **oppure** ABORTED).

## Migrazione

v4 è breaking: firmware, server (coda/lease/FSM) e UI vanno aggiornati insieme e
provati al banco (overflow+suffisso, NACK BUSY, heartbeat vs byte casuali, host
timeout, encoder jam, sensore assente, TONE tardivo, reboot durante run).
Stato attuale (fw 4.1): la UI parla ancora v3 e il server fa da bridge per lo
scan; resta Fase 2b (EVT nativi in UI + bridge di `$`/MOVE). I limiti v3
restano tracciati in REMAINING_RISKS (FW-04/05/08/09/11, MOT-02/03/04, SER-01).
