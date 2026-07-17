# CAMMES — Risposta all'audit esterno

Documento di riferimento: `CLAUDE_HANDOFF_CAMMES.md` (audit esterno, 94 rilievi,
snapshot `v3.2.0-1-ge15ac01` = commit `e15ac01`).

Verifica indipendente e interventi eseguiti il **2026-07-14 / 2026-07-15** sul
checkout reale `H:\...\cammes`. Baseline test prima degli interventi: 52 check
verdi (autoreferenziali, come nota TEST-01). Dopo gli interventi: **129 check
verdi**, `npm run lint` a 0 errori, `npm audit` con la sola vulnerabilità di
`pkg` (devDependency, nessun fix a monte).

## Esito della verifica dei 15 P0

Tutti e 15 i P0 sono stati **verificati indipendentemente e confermati** sul
codice reale (riferimenti riga coincidenti, riproduzioni funzionanti). Nessun
rilievo P0 è risultato inventato o non riproducibile.

## Interventi per lotti (ogni lotto = 1 commit, con test di regressione)

| Lotto | Commit | Rilievi | Stato |
|---|---|---|---|
| L1 | `24473ad` | MAT-01, MET-01, MET-02, MAT-07 | **FIXED** |
| L2 | `cd53e64` | MAT-02, MAT-03, MAT-04, MAT-05 | **FIXED** |
| L3 | `60a3b8b` | MOT-01, FW-02, FW-03(sw), + cmdBuf | **FIXED** (sw); flash e prova moto **NEEDS_HARDWARE** |
| L4 | `51108a4` | SEC-01, SEC-02, + prove/ negli exe | **FIXED** |
| L5 | `445de9a` | MOT-02, MOT-03, MOT-04, MOT-05 | **FIXED** |
| L6 | `4addf4f` | SEC-09, MAT-08, DOC-01, REL-09, APP-18, APP-19, TEST-03 | **FIXED** |
| L7 | `4deb398` | DYN-01, DYN-03, DYN-04, DYN-05(nota) | **FIXED** |

### Dettaglio per rilievo

**MAT-01 — centri a mezzo grado azzeravano la curva.** `mapCamToCrank` riscritta
con mappatura inversa + interpolazione circolare: un centro a 106,5° ora
preserva il picco (11,239 vs 11,240 mm) invece di produrre 360 indici
frazionari e curva a zero. Test: `tools/test_misura_affidabile.js`.

**MET-01 — invalidi trasformati in zero, run incompleti salvabili.** Le letture
invalide non entrano più nel profilo (prima diventavano zero fisico); i gradi
mancanti sono contati a fine giro, dichiarati con `#stato=INCOMPLETO` /
`#gradiMancanti` nel `.scr`, e Analisi avvisa all'import. `parseCamFile` conta
i gradi UNICI coperti (`validCount`) e distingue coperto da riempito
(`covered`/`missingCount`).

**MET-02 — falso PASS nella verifica banco.** Verdetto spostato in
`benchVerdict` (libreria, testato): qualunque punto mancante o invalido →
`NON_VALUTABILE`, mai PASS con dati mancanti (riprodotto: difetto 0,12 mm
mascherato da campioni persi ora dà NON VALUTABILE invece di PASS). Il toast
"salvato" appare solo dopo risposta `ok` reale del server.

**MAT-02 — fase dipendente dallo zero di scansione.** La fase è ora agganciata
al **picco misurato** (`camPeakPos`, fit parabolico sub-grado): due scansioni
dello stesso lobo con zeri diversi danno la stessa curva mappata.

**MAT-03 — segni intake/exhaust invertiti vs etichette.** Convenzione allineata
alle etichette UI: aspirazione picco a `360+centro` (ATDC), scarico a
`360-centro` (BTDC). Prima erano scambiati (252/472 invece di 468/248) e la cam
card metteva le etichette sopra il lobo opposto.

**MAT-04 / MAT-05 — anticipo non applicato / centri sostituiti da LSA±adv.**
`effectiveCenters(int, exh, adv)` applica l'anticipo ai centri effettivi usati
nella mappatura; eventi/LSA derivano dai centri REALI per lobo (LSA solo
derivata). Test: `tools/test_fase_segni.js`.

**MOT-01 — timer riavviavano il moto dopo STOP.** Registro `_scanTimers` +
generation token: `stop()` cancella riavvio-run (1,5 s) e fallback firmware
(6 s/800 ms) e azzera `autoScanActive`. Verificato live (browser pane): dopo
STOP nessun timer sopravvive; un timer nuovo post-STOP funziona.

**FW-02 — Concerto non interrompibile e STOP ingoiato.** Il loop tone controlla
`x` ogni 16 passi (`*tabort`); il drain di fine nota preserva un `x`
ritardatario invece di scartarlo.

**FW-03 — nessun fail-safe locale.** Watchdog host: durante ogni movimento, se
non arriva alcun byte per 5 s (cavo/PC morti) → `*wdt` + abort. Il keep-alive
`\n` del server (ogni 100 ms) copre l'esercizio normale con margine 50×.
Firmware **3.4** compilato (9402 byte), incluso, **flashato e VALIDATO AL
BANCO il 2026-07-17** (`tools/bench_fw34_test.js`, 16/16 PASS): watchdog
scattato a ~5,5 s di silenzio con moto troncato a 1373° dei 4000° comandati e
motore fermo (encoder congelato); nessun `*wdt` con keep-alive attivi; nota
Concerto interrotta in 126 ms; `x` a vuoto non avvelena più il comando
successivo; STOP classico in 186 ms. Scansione end-to-end sulla camma Clio:
360/360 gradi, 0 letture invalide, 0 punti instabili, RMS 0,047 mm contro la
scansione storica (convertita puntalino→piattello Ø33) = ripetibilità storica
del banco. STOP a metà scansione: nessun riavvio spontaneo in 11 s (MOT-01
verificato dal vivo).

**cmdBuf (extra non in audit).** `x` a motore fermo è ora comando immediato
consumato subito: prima restava in `cmdBuf`, avvelenava la riga successiva e
forzava il degrado permanente al motore di scansione classico.

**SEC-01 / SEC-02 — nessuna auth, statico espone tutto.** Allowlist statica
(solo pagine UI, css/js, lib/fonts/images) → log, settings, misure, sorgente e
node_modules ora 404. Anti DNS-rebinding: Host esterni 403 su HTTP e WS.
WebSocket `verifyClient`: Origin di siti terzi rifiutata, pagine locali e
client non-browser ammessi. **L'uso multi-dispositivo in LAN resta invariato**
(nessun bind su loopback — decisione utente rispettata). `prove/**` rimossa
dagli asset pkg: le misure non viaggiano più dentro gli exe pubblicati. Test:
`tools/test_confine_rete.js` (22 check, server su porte alternative).

**MOT-02 / MOT-03 / MOT-04 / MOT-05.** Guardia `_scanBusy` su START-doppio,
jog, Ruota, direzione, Zero virtuale, FREE, reset encoder, posizioni salvate.
Socket unico (`sendSocket = engineSocket`, lifecycle completo). `WS_URL` segue
`location.hostname`. STOP del Concerto invia `x` reale. RESET pagina →
`safeReload()` (STOP prima del reload).

**SEC-09 / DOC-01 / MAT-08 / REL-09 / APP-18 / APP-19 / TEST-03.** `ws` a 8.21
(advisory risolti); README a firmware 3.4; `reindexByEncoder` con soglia
relativa (mezzo giro rifiutato); `.claude/settings.local.json` fuori dal
versionamento; residuo `</content>` in style.css rimosso; testo eliminazione
allineato al cestino 30 giorni; ESLint installato, lint verde, `lib/cammes-math.js`
ora lintata; tag spurio `v3.2.0-1-ge15ac01` eliminato.

**DYN-01 / DYN-03 / DYN-04 / DYN-05.** `detectValveFloat` ora misura la
**perdita di contatto** cam-punteria tracciata dentro il solver (follower sopra
la camma), non più lo schiacciamento elastico: il float è 0 al quasi-statico,
cresce coi giri, cala se la molla è più rigida (verificato su camma Clio
reale). `camAt` interpolato linearmente nei tre solver (DYN-03). Parametri con
nullish `_num` invece di `||` (DYN-04: damping 0 / preload 0 validi).
`validate_clio` riscritto per validare la FISICA della metrica; dichiarato
esplicitamente che il regime ASSOLUTO di float è esplorativo (DYN-05).
Test: `tools/test_valve_float.js`.

## Note e decisioni

- **SEC-01, bind di rete**: l'utente ha rifiutato il bind su `127.0.0.1` (usa la
  UI da più dispositivi in LAN). La mitigazione scelta (allowlist Origin + check
  Host + allowlist statica) chiude il vettore reale (pagine web ostili nel
  browser dell'utente) senza toccare l'uso LAN. Un token di sessione resta
  possibile come passo successivo se un domani servisse difendersi anche dal
  "vicino di LAN".
- **DYN-05 / claim assoluti**: i modelli di compliance restano ESPLORATIVI per
  il regime assoluto di float (un solo ciclo da fermo, parametri di classe). La
  correzione DYN-01 rende corretta la *fisica della metrica* e la sua risposta
  al progetto molla, non la calibrazione assoluta.

## Lotti aggiunti dopo la validazione al banco (2026-07-17)

**Lotto 8 — MET-03 / MET-04 (provenienza misura).** Il `.scr` registra ora
`#tastatore`, `#verso`, `#microstep`, `#fw` (versione reale dell'Arduino) e
`#encoderSpan` (corsa encoder del giro, ~±1440 = giro pieno). Analisi avvisa
se aspirazione e scarico hanno verso o tastatore diversi (fianchi specchiati /
rampe non confrontabili). Motivato dal banco: puntalino vs piattello Ø33 sullo
stesso lobo davano 1,26 mm RMS di "differenza" apparente, azzerata (0,047 mm)
convertendo il tastatore.

**Lotto 9 — FW-04 / FW-05 (firmware 3.5).** Parser `S`/`$` con `strtol` 32 bit +
range espliciti: `S+70000` (che con `atoi` int16 wrappava a 4464 unità eseguite)
ora → `*err`, zero moto; tetti `S`≤1500, `$`≤3600. Stabilità sensore: un NaN
azzera il confronto, <2 frame validi → NaN vero (scartato via MET-01).
**Validato al banco**: harness 23/23, tre scansioni Clio con ripetibilità
0,024 mm RMS e zero gradi persi.

**Lotto 10 — SEC-03 (XSS memorizzato).** Tag/nomi file/posizioni salvate
uscivano in `innerHTML` e `onclick` inline con escape debole (`&#39;`
ridecodificato). Ora chip, badge, righe tabella/cestino, quickview e
posizioni sono ricostruiti via DOM (`textContent` + listener delegati su
`data-act`/`data-name`), `normalizeTag` ha una whitelist e `cammes-ui.js`
esporta `window.cammesEscape`. Verificato: payload ostili (da localStorage e
da nomi file) resi come testo, zero elementi iniettati, zero handler inline,
`data-name` round-trip esatto.

**Lotto 11 — SER-02 / SER-03 (robustezza flash).** SER-02: guardia once in
`runAvrdude` (prima `error`+`close` chiamavano `avrdudeDone` due volte →
doppio `sendJson`, crash). SER-03: porta di flash verificata presente
nell'elenco quando la seriale non è aperta (prima si usava `lastComPort`
stale). Validato al banco: flash via API → risposta singola 200, ~10 s,
seriale riconnessa.

## Ancora aperti (P1/P2/P3 non in questi lotti)

Non affrontati in questa tornata, da valutare in seguito: SEC-03..08/10 (XSS,
path containment, lock settings, backup, logging sincrono, updater firmato),
SER-01..03, FW-01/04..12, MET-03..05, MAT-06, DYN-02/06..08, APP-01..17/20,
REL-01..08/10, DOC-02, XLS-01..04, REP-01..04, TEST-01/02. FW-03 richiede la
prova hardware al banco; REP-02 richiede la ri-scansione delle camme VW.
