# CAMMES — Registro dei rischi residui

Stato della verifica al **2026-07-19** dopo la controrevisione Codex del
documento `HANDOFF_CLAUDE_CORREZIONI_V3.3.0.md`. Questo registro sostituisce la
dicitura "audit chiuso": lo stato reale è **beta tecnica migliorata** — le
regressioni software note sono superate sui dataset disponibili, ma la
validazione funzionale al banco e quella metrologica sono **ancora in corso**.

> **Firmware 3.7 (Lotto B, 2026-07-19)**: parser di configurazione rigoroso
> (FW-04), NACK "*busy" durante il moto (FW-09), scarto-fino-a-fine-riga
> sull'overflow. **Compilato** (34% flash) e coperto dal guardiano sorgente
> `tools/test_fw_parser.js` (in `npm test`); il bench harness ha la sezione J
> pronta. **Non ancora flashato né validato al banco** (banco remoto offline
> al momento del commit): l'Arduino sul banco esegue ancora la 3.6 finché non
> si esegue il flash. Restano FIXED_SOFTWARE / NEEDS_HARDWARE.

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
| MOT-02 (FSM autorevole) | PARTIAL | interblocchi UI `_scanBusy` + lease server; manca la FSM di stato esplicita (SCANNING/MANUAL/FREE/FAULT) con ACK/eventi terminali (Lotto A completo + B) | il server non espone ancora uno stato autorevole per ACK | FSM server + protocollo v4 |

## Firmware (software fatto, fisica da validare)

| ID | Stato | Nota |
|---|---|---|
| FW-02 | FIXED_SOFTWARE / NEEDS_HARDWARE | TONE interrompibile; latenza STOP peggiore non misurata |
| FW-03 | PARTIAL / NEEDS_HARDWARE | watchdog host presente; fault locale encoder rinviato: serve caratterizzare i counts/unità del NUOVO albero al banco prima di poter distinguere un jam da una risoluzione sub-tacca (un rilevatore mal tarato aborta scansioni buone) |
| FW-04 | FIXED_SOFTWARE / NEEDS_HARDWARE (fw 3.7) | parser config c/r/w/u/a/g/k reso rigoroso (strtol + range, prima atoi accettava "c3xyz"→3 in silenzio); overflow di riga → scarto fino a fine riga + "*err ovf" (prima il frammento residuo formava un comando spurio). Guardiano sorgente `test_fw_parser.js` in `npm test`; compila (34% flash). Flash+bench harness sez. J: **da eseguire quando il banco è online** |
| FW-05/06 | PARTIAL | settle adattivo + 2 frame concordi presenti; heartbeat dedicato e metrica di qualità campione ancora da rifinire |
| FW-07 | NEEDS_HARDWARE_VALIDATION | schema/BOM/pull-up/isteresi LM339 |
| FW-08/11 | PARTIAL (fw 3.7) | risposta 'v' espone `proto=3` (capacità protocollo); protocollo NON ancora rinumerato v4 (runId/seq/ACK/NACK): è una migrazione breaking firmware+server+UI da progettare e validare al banco insieme |
| FW-09 | FIXED_SOFTWARE / NEEDS_HARDWARE (fw 3.7) | comando arrivato durante un movimento/scan → NACK "*busy" (una volta per operazione), prima scartato in silenzio. Verificato in `test_fw_parser.js`; bench harness sez. J pronta, flash **da eseguire** |
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
