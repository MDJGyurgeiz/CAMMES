# CAMMES — Registro dei rischi residui

Stato della verifica al **2026-07-19** dopo la controrevisione Codex del
documento `HANDOFF_CLAUDE_CORREZIONI_V3.3.0.md`. Questo registro sostituisce la
dicitura "audit chiuso": lo stato reale è **beta tecnica migliorata** — le
regressioni software note sono superate sui dataset disponibili, ma la
validazione funzionale al banco e quella metrologica sono **ancora in corso**.

> **Firmware 4.0 (Lotto B, 2026-07-19) — PROTOCOLLO v4**: additivo e negoziato
> (v3 resta byte-identico e pienamente funzionante; v4 discriminato dalla cifra
> iniziale). FSM esplicita, ACK/NACK correlati per seq, EVT SAMPLE/DONE/STOPPED/
> FAULT con run=, heartbeat dedicato `~`, fault latched + RESET_FAULT, HELLO/
> STATUS con device id da EEPROM (CRC); server negozia `proto=4`. **Flashato e
> VALIDATO al banco (COM5, 2026-07-19): regressione v3 `bench_fw34_test.js`
> 39/39 + `bench_v4_test.js` 25/25.** Prima del flash: review avversariale in
> parallelo → 5 difetti reali corretti (TONE ignorava FREE, scan v3 in FREE
> desincronizzava la FSM, CONFIG non atomico/accettava chiavi ignote, `*busy`
> trapelava nello stream v4). Storico: 3.8 fault encoder FW-03; 3.7 parser
> config FW-04 + NACK busy FW-09. **La UI usa ancora v3** (bridge server↔v4 +
> EVT nella UI = Fase 2).

Vocabolario stati: FIXED_SOFTWARE (patch + test software, non validato
fisicamente) · PARTIAL (migliorato, criterio non del tutto soddisfatto) ·
OPEN (non affrontato) · NEEDS_HARDWARE_VALIDATION (serve banco/strumenti) ·
VERIFIED (validato anche fisicamente/metrologicamente).

Nessun rilievo è **VERIFIED**: la validazione fisica non è stata eseguita in
questa fase (banco scollegato).

## P0 / correttezza — priorità massima

| ID | Stato | Evidenza | Rischio | Test necessario |
|---|---|---|---|---|
| MET-01 (run ripetuti) | OPEN → in lavorazione | `alzata.html` `_showRepeatedRunsStats`: grado mancante in tutti i run → media 0, nessuna maschera | Un profilo con buchi diventa "completo" pieno di zeri: confronto falsato | `test_missing_repeated.js` (grado 42 mancante in 2 run → valid[42]=false) |
| MAT-03 (eventi asimmetrici) | PARTIAL | eventi = centro ± durata/2; su lobo asimmetrico errore ~60° | Fasatura apertura/chiusura/overlap sbagliata su camme reali | crossing reali ~408/646° a soglia 0,05 mm |
| APP-09 (incompleto→CONFORME) | OPEN → in lavorazione | nominale con 30/360 punti → CONFORME | Verdetto di conformità su dati quasi vuoti | 30/360 → NON VALUTABILE |
| MAT-07 (parser duplicati/frazionari) | PARTIAL | `parseCamFile`: `180,999` sovrascrive in silenzio; `106.5`→arrotondato | Dati corrotti accettati senza avviso | duplicato → errore; frazionario → esplicito |
| MOT-04 (lease) | **FIXED_SOFTWARE + validato banco** | controllore unico lato server; observer read-only; STOP a chiunque | risolto: `test_controller_lease.js` (arbitraggio) + validazione al banco remoto (perdita controllore→STOP, moto troncato 415°/2000°) | — |
| MOT-03 (perdita controller) | **FIXED_SOFTWARE + validato banco** | ping/pong WS (robusto al throttling tab) + close → `releaseLease` scrive `x` sulla seriale | validato: motore fermo dopo disconnessione del controllore | — |
| MOT-02 (FSM autorevole) | FIXED_SOFTWARE + validato banco | FSM esplicita nel firmware (BOOT/FREE/IDLE_LOCKED/MOVING/SCANNING/TONE/STOPPING/FAULT) con ACK/EVT via v4; il **server è l'autorità del data-path di scan**: traduce `S±N`→`SCAN run=` v4, correla il runId (scarta campioni di run vecchi), ritraduce EVT→v3 per la UI; lease v4-aware; stato esposto in `/api/firmware-info`. **Validato al banco (bench_bridge_test.js): scan v4 end-to-end = stream v3 identico + STOP→*sabort.** Resta Fase 2b: EVT nativi nella UI + bridge di `$`/MOVE |

## Firmware (software fatto, fisica da validare)

| ID | Stato | Nota |
|---|---|---|
| FW-02 | FIXED_SOFTWARE / NEEDS_HARDWARE | TONE interrompibile; latenza STOP peggiore non misurata |
| FW-03 | **VERIFIED (fw 3.8+, banco: falso-positivo E vero-positivo)** | watchdog host + **fault locale encoder nello scan**: ogni 30 unità verifica l'avanzamento encoder (~cfgStepsPerUnit/8 counts/unità). Encoder caratterizzato (2026-07-19): ~4,00 counts/unità a r32, spread 1,1%. **No-falso-positivo** validato al banco (sez. K: scan sano → *sdone) e nel browser. **True-positive osservato su GUASTO REALE (2026-07-22/23)**: encoder fisicamente non funzionante al banco (fermo a 0 col motore in moto) → `*fault enc` durante lo scan, esattamente come da progetto; guasto poi riparato al banco e sezione K di nuovo verde |
| FW-01ctrl (watchdog v4 in SCAN, controrev. v3.4.1) | **VERIFIED (fw 4.1, banco 2026-07-23)** | lo scan v4 non si auto-rinfresca più (il refresh viveva in stepperMove, chiamato a ogni unità): heartbeat inizializzato all'accettazione del run, rinnovato solo da `~`/HEARTBEAT. **Bench: SCAN senza heartbeat → `EVT STOPPED HOST_TIMEOUT` a ~5,3 s, NESSUN `EVT DONE`, firmware IDLE dopo; con heartbeat completa. v3 39/39 + v4 28/28** |
| FW-04 | **VERIFIED (fw 3.7, banco)** | parser config c/r/w/u/a/g/k reso rigoroso (strtol + range, prima atoi accettava "c3xyz"→3 in silenzio); overflow di riga → scarto fino a fine riga + "*err ovf". Guardiano sorgente `test_fw_parser.js` in `npm test`; **flashato e validato al banco (COM5, 2026-07-19): `bench_fw34_test.js` sez. J verde — c99/c3xyz→*err c, r20→*err r, c3→*cfg, overflow→*err ovf senza moto spurio** |
| FW-05/06 | PARTIAL | settle adattivo + 2 frame concordi presenti; heartbeat dedicato e metrica di qualità campione ancora da rifinire |
| FW-07 | NEEDS_HARDWARE_VALIDATION | schema/BOM/pull-up/isteresi LM339 |
| FW-08/11 | **VERIFIED (fw 4.0, banco)** | protocollo v4 versionato IMPLEMENTATO in modo additivo/negoziato (proto=4): righe `<seq> VERBO`, FSM esplicita, ACK/NACK correlati, EVT SAMPLE/DONE/STOPPED/FAULT con run=, heartbeat dedicato `~`, HELLO/STATUS con device id da EEPROM. **Validato al banco 2026-07-19: `bench_v4_test.js` 25/25 + regressione v3 39/39.** UI ancora v3 (bridge = Fase 2) |
| FW-09 | **VERIFIED (fw 3.7, banco)** | comando arrivato durante un movimento/scan → NACK "*busy" (una volta per operazione), prima scartato in silenzio. **Validato al banco (COM5, 2026-07-19): comando durante `$` → `*busy` e il moto prosegue fino a `*mv`** |
| FW-12 | FIXED_SOFTWARE / NEEDS_HARDWARE | ordine pin a boot da verificare all'oscilloscopio |

## Rete / API / browser

| ID | Stato | Nota |
|---|---|---|
| SEC-01 | PARTIAL | Host/Origin + header anti-clickjacking (CSP frame-ancestors/X-Frame-Options/nosniff) presenti; manca ancora **autenticazione a token** e CSP `default-src 'self'` (richiede spostare gli script inline in file). Decisione UX aperta col committente (token su dispositivi LAN) |
| SEC-03 | PARTIAL | XSS memorizzato bonificato nei percorsi noti; toast ancora via innerHTML |
| SEC-05/06 | FIXED_SOFTWARE | 400/413 per URL/body, scrittura atomica + coda settings, exception→safe (Lotto 12) |
| SEC-08 | FIXED_SOFTWARE | limiti WebSocket: `maxPayload` 1 MB (messaggio oversize → chiusura 1009) + rate limiter a finestra fissa 60 msg/s per connessione (STOP 'x' sempre ammesso). Regressione in `test_server_robustezza.js` |
| SEC-07/09/10 | PARTIAL | backup manifest+hash presente; logging strutturato/firma updater da completare |

## Dinamica

| ID | Stato | Nota |
|---|---|---|
| DYN-02 | PARTIAL | warm-up a 3 cicli fissi; manca il criterio di convergenza periodica |
| DYN-05 | OPEN | modello 3DOF senza validazione indipendente (equazioni/segni/unità) |
| DYN-06/07/08 | PARTIAL/DOCUMENTED | surge/rullo/dito/baseline dichiarati esplorativi, non validati |

## Release / supply chain

| ID | Stato | Nota |
|---|---|---|
| REL-01 | PARTIAL | jsPDF vendorizzato (`jspdf.umd.min.js`) da aggiornare per advisory GHSA-w532-jxjh-hjhj — richiede download build aggiornata (azione che va approvata dal committente) |
| REL-02/05 | OPEN | `pkg@5.8.1` archiviato (advisory GHSA-22r3-9w55-cj54); exe non firmato Authenticode (serve certificato) |
| REL-07 | **FIXED (riproducibilità dimostrata in CI)** | build firmware **bit-per-bit riproducibile** con core pinnato `arduino:avr@1.8.7`: due build locali + HEX committato + `version.json` tutti su SHA256 `2ae84e28…`, e **run CI verde su runner GitHub windows-latest** (`firmware.yml`, job `reproducible-hex`, 43s) che ha ricompilato e ottenuto lo stesso SHA. `tools/verify_firmware.js` confronta in `npm test` (livello 1) e ricompila+confronta in CI (livello 2, `--compile`). Scatta a ogni push su `master/**` / `fw/version.json` / `fw/master.ino.hex` |
| REL-10 | FIXED_SOFTWARE | SBOM CycloneDX 1.5 (`cammes/SBOM.json` + `SBOM.md`, 222 componenti: 26 runtime spediti + 196 dev) generato da `tools/gen_sbom.js` dal lockfile reale; `THIRD_PARTY_NOTICES.md` già presente |

## Metrologia / report (richiede hardware)

| ID | Stato | Nota |
|---|---|---|
| REP-01/02/03/04 | NEEDS_HARDWARE / NEEDS_INPUT | raw B/C/D mancanti, ri-scansione/taratura PMS, clearance non deducibile dal solo PMS |
| Metrologia banco | NEEDS_HARDWARE_VALIDATION | comparatore tracciabile, ripetibilità/linearità/isteresi, closure, backlash, counts/rev |

## Legacy

| ID | Stato | Nota |
|---|---|---|
| XLS-01..04 | OPEN/LEGACY | workbook Excel: archiviare come legacy o ricostruire separatamente |

---

Aggiornare questo file a ogni lotto: spostare gli ID a FIXED_SOFTWARE quando il
test relativo passa, e a VERIFIED solo con evidenza hardware tracciabile.
