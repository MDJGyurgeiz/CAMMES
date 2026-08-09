# AUDIT TOTALE — CAMMES v3.7.0

**Data:** 2026-08-09 · **Oggetto:** ogni blocco del software — matematica, firmware, server, catena di misura, coerenza dei documenti · **Metodo:** 14 investigatori indipendenti (uno per dominio), ognuno con verifica numerica in node contro oracoli analitici e confronto con letteratura e software professionali via web; poi **uno scettico per ogni sospetto**, col mandato di smontarlo rifacendo il conto; infine un critico della completezza. 39 agenti, ~3,3 M token, repository in sola lettura.

**Regola di ingaggio:** un falso positivo costa più di un buco — nel dubbio, non segnalare. Ogni difetto confermato ha file:riga e una riproduzione numerica eseguita sulla libreria di produzione.

---

## 1. Verdetto complessivo

**Il nucleo matematico è corretto, e ora è dimostrato — non dichiarato.** Le formule centrali (derivate, follower piatto, rullo, finger, compensazione del puntalino, eventi di fasatura, criterio del distacco, solver dinamici, correzione dell'eccentricità) sono state verificate contro oracoli analitici in forma chiusa e contro le fonti di settore, con errori residui da discretizzazione (µm o meno), mai da formula.

I difetti confermati sono **23 su 38 sospetti unici** (1 respinto, 14 non passati dallo scettico per il tetto di verifica — quasi tutti divergenze documento-codice, evidenti per confronto diretto). **Due soli toccano numeri di un verdetto**; nessuno tocca la misura del profilo o le curve esportate. La distanza dai software professionali non è nel calcolo ma nel **ferro**: risoluzione del comparatore e dell'asse angolare, ~10× sotto i cam doctor commerciali, con un budget d'incertezza ora quantificato voce per voce (§5).

---

## 2. I 14 domini: verdetti e contro cosa sono stati verificati

| dominio | verdetto | verificato contro |
|---|---|---|
| Cinematica e derivate | **corretto** | oracoli analitici (errori 10⁻⁵–10⁻⁸ = puro troncamento O(h²)); fattori 2ⁿ esatti al 6° decimale; S-G = tabelle Numerical Recipes §14.8; convenzione ×6×rpm identica a Performance Trends e Tilden |
| Follower piatto | **corretto** | support function (Norton eq. 8.39-8.46): cerchio eccentrico 0,96 µm, lobo asimmetrico cicloidale 2,1 µm; il +90° è algebra esatta, non pezza; escursione in mm/rad conforme a Norton ("the v diagram gives the minimum face width") |
| Rullo e finger | corretto con riserve | teorema di Carnot, forma chiusa dell'eccentrico (2-4 µm); finestra ±75° sufficiente salvo rRoll > 28×rBase (irraggiungibile); finger: tilt si elide esattamente (P1-09 confermato a 10⁻¹⁴) |
| Puntalino sferico | un caso limite | round-trip 0,8-1,6 µm; lobi concavi = opening morfologico (recupera l'83%, non inventa dettaglio — conforme alla letteratura profilometria); resta il difetto della cucitura (§3.9) |
| Eventi e fasatura | difetti minori | LSA/overlap/segni = definizioni standard di cam degreeing, verificati su crossing analitici (0,1° residuo); lashLatoCamma identità esatta |
| Molla e dinamica | corretto con riserve | F_inerzia coincide con l'oracolo SI a 2×10⁻⁴; criterio del distacco = follower jump classico (Norton cap. 10), più conservativo (entrambi i fianchi); rpm critico indipendente dal regime di prova a 10⁻¹⁶ |
| Solver 1/2/3-DOF | corretto con riserve | RK4 corretto, passo legato al tempo con ≥80 passi/periodo; stabile 200-9000 rpm; contatto unilaterale a penalità; c = 2ζ√(km) |
| Baseline e parser | difetti ai margini | fit 1ª armonica = rimozione 1 UPR della metrologia di rotondità (Taylor Hobson); ricostruisce un picco corrotto da 7,8405 a 8,0002 su 8,0000 veri; termine trascurato O(e²/r) ≈ 0,6 µm |
| Statistica e verdetti banco | **difetti trovati** | σ campionaria (n−1) e CV corretti; ma il verdetto banco ha un falso PASS (§3.1) e il CV-solo-sopra-0,3 mm resta la decisione aperta nota |
| Race tools ed export | difetti negli export PDF | "una fonte per numero" regge in tutti e 5 gli strumenti (snapshot + hash); i buchi sono nel Race report PDF (§3.4-3.6) |
| Firmware | corretto con riserve | LUT quadratura canonica verificata transizione per transizione; letture multi-byte tutte atomiche; nessuna perdita ISR ai ritmi reali; timing seriale coerente coi gap misurati 58-128 ms |
| Server | difetti ai margini | parseFrame senza bypass residui; path traversal: provati dotfile, URI malformati, device name Windows — respinti; compareVersions corretto sui numerici (3.10.0 > 3.9.0) |
| Catena di misura | quantificata | budget d'incertezza §5; rumore misurato 2-4 µm = pura quantizzazione GUM (q/√12 = 2,9 µm) |
| Spec vs codice | **9 divergenze** | il codice è coerente col CHANGELOG v3.7.0 (tutte e 7 le correzioni verificate presenti); sono MATH_SPEC, PROTOCOL e README a essere rimasti indietro (§4) |

---

## 3. I 23 difetti confermati (ognuno riprodotto numericamente da uno scettico indipendente)

### Numeri sbagliati — 2, stessa radice

**3.1 · Il verdetto "verifica banco" certifica OK un banco con difetti NEGATIVI sul cilindro.** `removeCamBaseline` azzera i residui negativi (`cammes-math.js:1711`, clamp pensato per un'alzata, che non può essere negativa) e `benchVerdict` (`:1628`) calcola RMS/max sull'array già clampato. Riprodotto: avvallamento −0,10 mm su 20° → **OK** (max 0,017); lo stesso difetto a +0,10 → FAIL (max 0,084). Aggravante: anche a banco sano l'RMS archiviato in Home è sottostimato di ~√2 (metà dei campioni di rumore azzerati). Il commento a `:1603` dichiara la regola opposta ("un campione invalido non può MAI migliorare l'esito"). *Cura: calcolare i residui del verdetto banco senza clamp.*

**3.2 · "Ripetibilità eccellente" con UN solo run in media.** Con 3 run di cui 2 bucati, `averageCompleteRuns` media 1 run, σ=0 per costruzione, e `alzata.html:1393` emette "ripetibilità eccellente — σ 0,000 — CV 0,00%". Il gate a `:1321` conta i run *eseguiti*, non quelli *entrati in media*. Attenuante: il toast "N run esclusi" esce prima, e il titolo dice "1/3 run in media" — ma il giudizio "eccellente" su un campione di 1 resta indifendibile.

### Incoerenze schermo/PDF — la malattia nota, residua negli export race

**3.3** · Sweep RPM nel PDF: i punti NON convergenti sono stampati e colorati come misure valide (`analisi.html:2130-2140` non testa `pt.converged`); a schermo gli stessi punti dicono "non conv." in grigio. Riprodotto: 97,276 mm di spazzatura di un solver divergente, in rosso su carta.
**3.4** · Race report PDF, mappa molla: le celle non convergenti escono grigio `#cccccc` senza legenda né conteggio (la legenda vive in un elemento DOM che non entra nel PDF): sul documento il colore è l'unico dato.
**3.5** · exportPDF con molla ai valori di esempio: banner di copertina e barra "Margine sul distacco" stampano il numero senza gate (`:6641`, `:6813-6843`), mentre KPI e titolo nella stessa pagina sono correttamente gated. Attenuante: esce in grigio neutro, non colorato.
**3.6** · Toast riassuntivo: con un lato a rpmCrit infinito dichiara "∞ (sicuro)" anche se l'altro lato è critico.
**3.7** · Al boot il firmware annuncia `IDLE_LOCKED / free=0` ma ENA è LOW: il motore è **fisicamente libero** finché il primo movimento non lo prende in carico (`master.ino:1067` vs `:1092`). L'enum ha già `ST_BOOT`, oggi dead code: basterebbe usarlo.
**3.8** · Tooltip dei centri: con anticipo negativo (lecito) il conto mostrato contraddice il risultato.

### Casi limite — reali ma stretti

**3.9** · `roAt` estrapola invece di interpolare quando un fianco ripido cavalca la cucitura 1/360 (`cammes-math.js:114`): 93 µm con punta r3 su camma aggressiva, **2,6 µm col puntalino reale r1,5** (sotto la ripetibilità).
**3.10** · Inviluppo del rullo su griglia intera senza raffinamento sub-grado: sottostima sui fianchi che cresce con rRoll (il round-trip sfera→rullo chiude a 17 µm invece dei 0,24 µm della sola compensazione).
**3.11** · `findEvents`: un campione isolato esattamente a soglia crea una regione degenere e forza l'esito "ambiguo".
**3.12** · Parser: il collasso anti-Excel può ingoiare una coppia legittima `d;d` (es. `0;0`).
**3.13** · Baseline: rampe sotto-soglia più lunghe del margine fisso di 12° entrano nel fit e vengono parzialmente assorbite.
**3.14** · Compliance: separazione campionata con camma a inizio sotto-passo ma stato a fine sotto-passo → distacco leggermente sottostimato (sistematico piccolo).
**3.15** · NACK su SCAN bridgiato inghiottito: `v4ActiveRun` resta bloccato e il flash firmware risponde 409 finché non scade il guard.

### Fastidi — 8 voci
Doppio settle su p/q (`master.ino:813`, contraddice il commento FW-06, allunga la scansione classica senza danneggiarla) · `sgCoeffs[3]` è una media mobile etichettata S-G (voce morta) · durata alla quota di riferimento contata a bin interi (metodo diverso dalla durata alla sede: fino a ±1°) · Sweep 3D con 0,3 hardcoded invece di `SOGLIE_FLOAT.grave` · TONE con parametri invalidi risponde comunque `*tend` · commento errato in `peggioreAllAlzata` · intestazione `Grado;Alzata` marca il file come anomalo · (vedi `audit_verifiche.json` per il dettaglio completo).

### Respinto dallo scettico — 1

*"L'ancora di fase non è la massima alzata dichiarata"* — i numeri si riproducono, ma il comportamento è **quello documentato e voluto** (centro del plateau con tolleranza all'1%, MAT-02): non è un difetto, è la specifica.

---

## 4. Documenti rimasti indietro (14 sospetti non passati dallo scettico — evidenti per confronto diretto)

Il codice è coerente col CHANGELOG v3.7.0 (verificate presenti tutte e 7 le correzioni recenti). Sono **i documenti di specifica** a non essere stati aggiornati:

- **MATH_SPEC.md**: descrive `reindexByEncoder` (rimossa), promette un "fallback al vecchio metodo" sugli eventi ambigui che il codice rifiuta di fare (scelta giusta: il codice dichiara, non indovina), non documenta né la pipeline delle derivate in dominio camma né la compensazione del puntalino attuale.
- **PROTOCOL.md**: dichiara fw 3.6/4.0 (reale: 4.1), elenco eventi v3 incompleto, grammatica v4 divergente in tre punti dall'implementato.
- **README.md**: firmware v3.6 in tre punti, riferimento a un commento di testa di master.ino che non esiste più, cita la re-indicizzazione encoder rimossa.
- **Server** (3 voci non verificate): doppio `#ctl:denied` con motivi diversi nella finestra STOPPING; un client v4 nativo può avviare uno SCAN che il bridge poi gli scarta; burst doppio al confine di finestra del rate limiter.
- **Modalità di scansione** (2 voci non verificate): il bin Race media a baricentro −0,25° (profilo sistematicamente in anticipo di un quarto di grado in quella modalità); "Precisione: media 3 letture" dichiarato in UI ma nessun percorso del fw 4.1 lo fa.

---

## 5. Catena di misura: budget d'incertezza e posizione rispetto ai professionali

Budget per punto (k=1), quantificato sui file di misura reali:

| voce | valore | nota |
|---|---|---|
| quantizzazione comparatore (10 µm/tacca) | σ = 2,9 µm (GUM q/√12), bound ±5 µm | il rumore misurato sui file reali (2,1-3,6 µm) È la sola quantizzazione: la meccanica sta sotto la tacca |
| criterio 2-frame | ±1 tacca residua nel caso peggiore | robusto per costruzione (EPS 5 µm < tacca) |
| asse angolare (passi motore) | ~±0,03-0,05° stimati → 10-17 µm sui fianchi | verificato al banco solo entro ±1°: **la voce meno vincolata** |
| **linearità/isteresi comparatore su corsa 0-11,6 mm** | **NON VERIFICATA** — spec tipica di classe: ±20-30 µm f.s. | **potenzialmente la voce dominante**; aperta in REMAINING_RISKS |
| binning Race (baricentro −0,25°) | 29 µm RMS / 85 µm max sui fianchi | sistematico, solo modalità Race (non verificato dallo scettico) |
| deriva termica | <5 µm in officina | allarme chiusura giro a 30 µm la intercetta |
| eccentricità di montaggio | 50-60 µm PV osservati | è geometria del montaggio, rimossa dal fit 1ª armonica |

**Totale:** casuale ~3-4 µm/punto; sistematico 15-35 µm sui fianchi (esclusa la linearità ignota), 5-15 µm sull'alzata massima. Coerente con le due evidenze indipendenti: 3 modalità identiche entro 0,05 mm RMS, doppio tastatore r1,5/Ø33 concorde a 0,065 mm RMS.

**Contro i professionali** (Performance Trends Cam Test Stand: 1 µm / 0,05°; Audie Cam Pro Plus: 1 µm / 0,1° con upgrade 0,025°): CAMMES è ~10× sotto su entrambi gli assi. Conseguenza pratica: eventi e durate affidabili a ±0,5-1° camma (i cam doctor: ±0,1-0,2°), derivate seconde più rumorose — il limite già dichiarato dell'accelerazione non convergente fra finestre. **Il software non è il collo di bottiglia: lo è il ferro**, e l'upgrade con più leva sarebbe il comparatore (da 10 µm a 1 µm).

---

## 6. Cosa l'audit NON copre (critico della completezza)

Aree scoperte, con verifica proposta: **(1)** CSV con `,` e decimale `.` su Excel italiano (si apre in una colonna sola; l'XLSX server-side lo aggira, il bottone CSV no); **(2)** leak browser su sessioni lunghe (16 `setInterval`/listener in analisi.html, zero clear — mai misurato un heap dopo 2 h di stream); **(3)** accessibilità dei verdetti (35 `aria-` su 4 pagine); **(4)** flash firmware: nessuna verifica SHA256 a runtime dell'hex prima del flash (e il repo vive su Google Drive, dove la corruzione è già successa) né confronto della versione annunciata dopo; **(5)** lo SHA dell'update-check viene dalle stesse note di release: anti-corruzione sì, anti-manomissione no; **(6)** import/restore dei metadati senza fuzzing; **(7)** `responsivevoice.js` morto ma ancora spedito (licenza non-commercial); **(8)** primo avvio su PC pulito (verificabile solo su macchina vergine); **(9)** UI remota da tablet con drop di rete.

**Le 3 prove al banco che nessun audit da codice sostituisce:**
1. **Artefatto calibrato** (cilindro rettificato/gauge pin certificato): oggi la validazione è coerenza interna, non accuratezza assoluta — solo un artefatto noto separa zero, scala e runout dall'errore della camma. *È anche il test della voce dominante del budget (linearità del comparatore).*
2. **Chiusura del giro sotto carico**: N giri CW+CCW con camma montata, encoder deve chiudere a 1440·N ±1 cnt — rileva microstep persi sotto coppia reale.
3. **Isteresi dello stelo**: stessa camma scansionata CW e CCW; una differenza sistematica sui fianchi in discesa è isteresi meccanica, non rumore.

---

## 7. Priorità suggerite

1. **3.1/3.2 (verdetti banco)** — gli unici "numeri sbagliati": pochi punti di codice, test già impostabili sui casi riprodotti.
2. **3.3-3.5 (PDF race)** — la "due verità" residua: il documento che esce dall'officina non deve dire più dello schermo.
3. **Allineare MATH_SPEC/PROTOCOL/README** — 9 divergenze note, lavoro meccanico; estendere `test_doc_release.js` dove possibile.
4. **Le 3 prove al banco** (§6) — decidono la voce dominante del budget d'incertezza.
5. Il resto dei casi limite in ordine sparso: nessuno urgente, tutti documentati qui con file:riga.

---

*Materiale di lavoro: `audit_domini.json` (valutazioni integrali dei 14 domini con fonti), `audit_verifiche.json` (i 24 verdetti degli scettici con riproduzioni), `audit_critico.txt` — nello scratchpad della sessione. Fonti principali consultate: Norton (Design of Machinery cap. 8, Cam Design Handbook cap. 10), Numerical Recipes §14.8, SAE cam degreeing practice, Taylor Hobson (roundness harmonics), Performance Trends, Audie Technology, Tilden Technologies, letteratura CMM su stylus tip correction.*
