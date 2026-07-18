# CAMMES — Protocollo seriale (v3 attuale + design v4)

> **Stato: v3 = IMPLEMENTATO (fw 3.6); v4 = DESIGN.** Documento richiesto dalla
> controrevisione "prima di implementare" il protocollo versionato del Lotto B.
> Il passaggio a v4 è una migrazione COORDINATA firmware+server+UI e va
> **validata al banco** (bench disconnesso ora).

## Protocollo v3 (attuale, fw 3.6) — PC → Arduino

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
| `v` | `ver=3.6 scan=1 free=<0\|1>` |

Eventi/terminali fw 3.6: `*se *sm *sdone *sabort *mv *mabort *wdt *tend
*tabort *locked *sstat *cfg *free *lock *pos *boot *err`. Boot: `CAMMES Uno
ready` + `*boot ver=.. r=.. samp=.. settle=.. free=.. rst=0x..` (reset reason
MCUSR). Watchdog host: nessun byte per 5 s durante il moto → `*wdt`+abort.
Parser: `strtol` con range su S/`$`; overflow → flush; comando ignoto a fermo →
consumato.

**Limiti v3 (perché serve v4):** nessun runId/sequence per correlare
comando↔risposta; il watchdog è tenuto vivo da QUALSIASI byte (anche newline),
non da un heartbeat dedicato; durante il moto i comandi non-STOP sono scartati
senza `NACK BUSY`; nessuna `STATUS/HELLO` completa con device id; protocollo non
numerato.

## Protocollo v4 (design)

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

Arduino→PC:
  ACK 45 state=SCANNING run=17
  NACK 46 code=BUSY state=SCANNING
  EVT SAMPLE run=17 idx=1 enc=4 mm=0.01 q=OK
  EVT DONE run=17 state=IDLE_LOCKED
  EVT STOPPED run=17 reason=USER state=IDLE_LOCKED
  EVT FAULT run=17 code=ENCODER_JAM state=FAULT
  HELLO proto=4 fw=3.7 dev=<id> state=.. free=.. cfg=.. fault=.. rst=..
```

Requisiti parser v4: buffer fisso + flag `overflowed` (dopo overflow scartare
fino a EOL); `strtol` con inizio/fine/segno/range per ogni numero; niente
`atoi`; rifiuto trailing garbage/NUL; comando ignoto/malformato → **un solo**
`NACK`; durante busy servire solo STOP/HEARTBEAT/STATUS, gli altri → `NACK
BUSY`; mai scarto silenzioso; sequence id per dedup; runId su campioni/terminali.

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
timeout, encoder jam, sensore assente, TONE tardivo, reboot durante run). Fino
ad allora resta v3 (fw 3.6), con i limiti sopra tracciati in REMAINING_RISKS
(FW-04/05/08/09/11, MOT-02/03/04, SER-01).
