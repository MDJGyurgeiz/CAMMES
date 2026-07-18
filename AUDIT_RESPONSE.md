# CAMMES — Risposta all'audit esterno

> **Stato onesto (agg. 2026-07-18).** Una controrevisione indipendente
> (`HANDOFF_CLAUDE_CORREZIONI_V3.3.0.md`) ha mostrato che la dicitura "audit
> chiuso / 15-15 P0 validati" usata sotto è **troppo forte**: molti P0 sono
> *corretti a livello software* ma non *validati fisicamente*, alcuni sono
> ancora **PARTIAL/OPEN** (in particolare MOT-04 lease, MAT-03 eventi
> asimmetrici, APP-09, e una **regressione MET-01** nei run ripetuti). La
> denominazione corretta del progetto è **beta tecnica migliorata**:
> regressioni software superate sui dataset disponibili, validazione al banco e
> metrologica ancora in corso. Lo stato reale per ID è in
> [`REMAINING_RISKS.md`](REMAINING_RISKS.md). Le sezioni sotto restano come
> registro storico del primo giro di interventi.

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

**Lotto 12 — SEC-05 / SEC-06 (robustezza server).** SEC-05: dispatch in
try/catch (handler che lancia → 500, non socket appeso), `decodeURIComponent`
protetto (→ 400), `readBody` con 413 esplicito. SEC-06: `writeFileAtomic`
(temp+fsync+rename) e coda di scrittura settings serializzata (niente più
TOCTOU né file troncato). Test `test_server_robustezza.js` (6 check).

**Lotto 13 — APP-08 / APP-09 (loader Confronto).** grafici.html ora usa
`parseCamFile` (niente più split posizionale, limite 361→360, coda metadati
gestita); ogni slot ha il proprio array (no contaminazione tra file); guardia
`validCount<30` e avviso su misure incomplete. Validato dal vivo con .scr reali.

**Lotto 14 — APP-01 / APP-02 (analisi).** APP-02: dispatcher unico
`runComplianceModel` — i tool race rispettano il modello 1/2/3-DOF scelto
(prima sempre 1-DOF). APP-01: guardia di stale-ness — un cambio di parametro
che modifica la curva marca l'analisi non aggiornata (banner) e blocca le
export finché non si ri-analizza (niente più mix input nuovi / array vecchi).
Verificato dal vivo.

**Lotto 15 — APP-03..07 (strumenti Analisi).** APP-03: ottimizzatore molla
riformulato come esplorazione (solo valve float) con caveat e margine soglia.
APP-04: doughnut di fasatura posiziona gli eventi agli angoli reali (anelli
concentrici, origine al PMS di scoppio), overlap reale. APP-05: durata @ gioco
con soglia fissa dichiarata (0,05 mm) al posto di max(0,05, 1% picco), esposta
in results/cam card/CSV. APP-06: A/B passa dalla pipeline principale
(baseline+follower+anticipo per lobo). APP-07: provenienza raw/convertito
per-lato, niente doppia conversione. Verificato live sulla Clio.

**Lotto 16 — MET-05 (posizioni encoder).** Le posizioni salvate sono legate a
un'"epoca" dello zero encoder: reset `!` o reboot Arduino la incrementano e
"Vai a" una posizione di epoca diversa viene rifiutata (chip barrato) invece
di muovere a un riferimento sbagliato. Verificato live.

**Lotto 17 — FW-01/06/11/12 (firmware 3.6).** FREE persistente (`*locked`),
p/q con assestamento reale, handshake di boot con reset reason, ordine pin
sicuro. Compila; **flash e bench 3.6 PENDENTI** (COM8 bloccata da un processo
wedged, serve un replug USB — poi harness `bench_fw34_test.js`).

**Lotto 18 — SEC-04/07/08/10 (hardening server).** SEC-04 containment con
`path.relative` (no dir sorelle); SEC-08 logging asincrono a coda; SEC-07
backup con MANIFEST+SHA-256 e settings.json; SEC-10 SHA-256 atteso mostrato
nella notifica di aggiornamento (l'app non auto-scarica/esegue). Test esteso.

**Lotto 19-20 — DYN-02/06/07 + APP-10..17/20.** DYN-02 warm-up 3 giri nei
solver (via `_num(p.warmupCycles,3)`); DYN-06/07 dichiarati esplorativi +
dominio conversione qualificato; DYN-08/APP-16 già risolti. APP-10 diff solo
misure; APP-11 vista polare `radar` (contorno reale); APP-12 layout via classi
CSS; APP-13 ARIA modali/toast + focus; APP-14 cancelAnimationFrame; APP-17
speechSynthesis locale (rimossa responsiveVoice); APP-20 claim RMS condizionato.
APP-15 (web worker) rinviato: le simulazioni girano già in setTimeout e sul
banco monoutente non bloccano criticamente. Verificato live. Suite 137.

**Lotto 21 — MAT-06, SER-01, FW-08/10, DOC-02.** MAT-06 **già risolto** in L2
(alzata al PMS = curva fasata a indice 360). SER-01: autodetect seriale prova
la firma firmware `v` su OGNI porta (note per prime), tiene solo chi risponde
CAMMES (prima apriva il primo FTDI a caso). FW-10: attesa sensore rollover-safe
(diff unsigned). FW-08: tabella protocollo/README allineati a fw 3.6 e
protocollo completo versionato nel commento di `master.ino`. DOC-02: claim
qualificati (validazione di plausibilità, non certificazione; niente "banco a
motore").

## Stato finale e voci non chiudibili solo via software

Tutti i **15 P0** e la grande maggioranza dei P1/P2 sono chiusi (21 lotti,
commit `24473ad`→HEAD). Suite **137 check verdi**, lint 0, `npm audit` pulito
salvo `pkg` (devDep, nessun fix a monte). Restano fuori, con motivazione:

- **Richiede hardware / azione fisica**: **FW-03** (E-stop NC e rischio fisico
  residuo — validato il watchdog software, l'E-stop resta un fungo in serie
  all'alimentazione); **FW-07/FW-12** (schema/BOM e verifica LM339/impulso pin
  all'oscilloscopio); **flash+bench del fw 3.6** (COM8 bloccata da un processo
  wedged: serve un replug USB, poi `bench_fw34_test.js`); **REP-01..04**
  (rigenerazione report VW: serve la ri-scansione delle camme rimontate).
- **Firmware da fare col prossimo flash al banco**: **FW-09** (risposta `BUSY`
  ai comandi non-`x` durante il moto, oggi scartati in silenzio dal drain).
- **Rinviato per scelta di rapporto costo/beneficio sul banco monoutente**:
  **APP-15** (Web Worker per le simulazioni; già in `setTimeout`, non bloccano
  criticamente); **SEC-07 streaming** (backup in memoria, ok per il volume di
  `prove/`; aggiunti MANIFEST+SHA-256).
- **Release / toolchain (REL-01..08/10), decisioni utente**: aggiornamento
  `pkg`/runtime LTS, firma Authenticode dell'exe, CI con `npm ci`/SBOM, tag
  firmato — da concordare con la pubblicazione della release.
- **Legacy Excel (XLS-01..04)**: il foglio `camme-analisi_rev8.5.xlsm` è
  l'architettura PRECEDENTE, sostituita dall'app web. Da **archiviare** come
  legacy (non manutenere): #REF!/#VALUE! e le macro non impattano la UI attuale.
- **Qualità test (TEST-01/02)**: la suite è passata da 52 check autoreferenziali
  a 137, con dataset/fixture reali (Clio, VW) e riproduzioni dei bug dell'audit
  (MAT-01, MET-02, DYN-01, SEC-*). Restano da aggiungere in futuro fuzz/E2E e un
  harness firmware in CI (HIL) — coperti oggi da `bench_fw34_test.js` al banco.
