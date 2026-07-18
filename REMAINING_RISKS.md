# CAMMES — Registro dei rischi residui

Stato della verifica al **2026-07-18** dopo la controrevisione Codex del
documento `HANDOFF_CLAUDE_CORREZIONI_V3.3.0.md`. Questo registro sostituisce la
dicitura "audit chiuso": lo stato reale è **beta tecnica migliorata** — le
regressioni software note sono superate sui dataset disponibili, ma la
validazione funzionale al banco e quella metrologica sono **ancora in corso**.

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
| MOT-04 (lease) | OPEN | nessun controller esclusivo; ogni WS scrive seriale | Due client/tab intercalano comandi al banco | `test_controller_lease.js` |
| MOT-02/03 (FSM/perdita controller) | PARTIAL | busy solo client-side; keep-alive server maschera la perdita | Il moto non si ferma se il controller sparisce | FSM server + STOP su lease perso |

## Firmware (software fatto, fisica da validare)

| ID | Stato | Nota |
|---|---|---|
| FW-02 | FIXED_SOFTWARE / NEEDS_HARDWARE | TONE interrompibile; latenza STOP peggiore non misurata |
| FW-03 | PARTIAL / NEEDS_HARDWARE | watchdog host presente; fault locali encoder/sensore incompleti |
| FW-04/05/06 | PARTIAL | parser strtol e settle migliorati; heartbeat dedicato e qualità campione ancora da rifinire (Lotto B) |
| FW-07 | NEEDS_HARDWARE_VALIDATION | schema/BOM/pull-up/isteresi LM339 |
| FW-08/11 | PARTIAL | protocollo non ancora versionato v4; HELLO/STATUS completo previsto Lotto B |
| FW-12 | FIXED_SOFTWARE / NEEDS_HARDWARE | ordine pin a boot da verificare all'oscilloscopio |

## Rete / API / browser

| ID | Stato | Nota |
|---|---|---|
| SEC-01 | PARTIAL | Host/Origin presenti ma nessuna autenticazione; allowlist IPv4 permissiva (Lotto F) |
| SEC-03 | PARTIAL | XSS memorizzato bonificato nei percorsi noti; toast ancora via innerHTML |
| SEC-05/06/07/08/09/10 | PARTIAL | robustezza, atomicità, backup verificato, logging, limiti WS, firma updater da completare |

## Dinamica

| ID | Stato | Nota |
|---|---|---|
| DYN-02 | PARTIAL | warm-up a 3 cicli fissi; manca il criterio di convergenza periodica |
| DYN-05 | OPEN | modello 3DOF senza validazione indipendente (equazioni/segni/unità) |
| DYN-06/07/08 | PARTIAL/DOCUMENTED | surge/rullo/dito/baseline dichiarati esplorativi, non validati |

## Release / supply chain

| ID | Stato | Nota |
|---|---|---|
| REL-01 | PARTIAL | jsPDF vendorizzato (`jspdf.umd.min.js`) da aggiornare per advisory GHSA-w532-jxjh-hjhj — richiede download build aggiornata |
| REL-02/05 | OPEN | `pkg@5.8.1` archiviato (advisory GHSA-22r3-9w55-cj54); exe non firmato Authenticode (serve certificato) |
| REL-07 | OPEN | corrispondenza riproducibile sorgente→HEX (build firmware in CI) non dimostrata |
| REL-10 | OPEN | SBOM e THIRD_PARTY_NOTICES da produrre |

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
