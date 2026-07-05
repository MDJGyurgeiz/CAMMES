# REPORT TECNICO — Camme VW 1.8 16V "KR" (mod. 257a / 257s)

**Data:** 2026-07-05 · **Software:** CAMMES v3.0.0 · **File scansioni:** `prove/VW-kr1_8-ASP_alz.scr`, `prove/VW-kr1_8-SC_alz.scr`

---

## 1. Oggetto e fonti dei dati

Coppia di alberi a camme per VW 1.8 16V KR (rettifica Motor Rettifica, mod. **257a** aspirazione / **257s** scarico). Follower reale: **bicchiere meccanico Ø35 mm**. Raggio base: **32,64 mm** (asp) / **34,25 mm** (sca).

| # | Fonte | Metodo | Data |
|---|-------|--------|------|
| A | Scansione CAMMES | puntalino sferico + conversione bicchiere Ø35 + corr. baseline | 2026-06-13 |
| B | Scheda rettificatore | banco Motor Rettifica | (consegna camme) |
| C | Rilievo al motore n°1 | goniometro + comparatori sul motore montato | 2026-06-14 |
| D | Rilievo al motore n°2 | goniometro + comparatori sul motore montato | 2026-07-05 |

---

## 2. Riepilogo misure per fonte

### Aspirazione (257a) — gioco 0,30 mm

| Grandezza | A · Scansione | B · Scheda | C · Rilievo 1 | D · Rilievo 2 |
|---|---|---|---|---|
| Alzata max camma [mm] | 11,14 ⁽¹⁾ | 11,4 | — | 11,1 |
| Durata [° motore] | 268 ⁽²⁾ | 295 | 292 (42-70) | 290 (43-67) |
| Alzata al PMS [mm] | 2,08 @105° ⁽²⁾ | 3,5 | 3,20 | 3,50 |
| Centro lobo installato [° ATDC] | — | 105 (calettamento) | ~104 | ~102 |

### Scarico (257s) — gioco 0,40 mm (rilievo 2) / 0,25 (scheda)

| Grandezza | A · Scansione | B · Scheda | C · Rilievo 1 | D · Rilievo 2 |
|---|---|---|---|---|
| Alzata max camma [mm] | 10,46 ⁽¹⁾ | 10,6 | — | 10,2 |
| Durata [° motore] | 266 ⁽²⁾ | 285 | 281 (64-37) | 291 (69-42) |
| Alzata al PMS [mm] | 1,73 @105° ⁽²⁾ | 3,3 | 2,90 | 3,00 |
| Centro lobo installato [° BTDC] | — | 105 (calettamento) | ~103,5 | ~103,5 |

⁽¹⁾ Picchi scansione coerenti con tutte le fonti (scarto ≤ 0,3 mm).
⁽²⁾ **Limite noto dello scanner su queste camme**: il medio-fianco risulta sottostimato ~35% (vedi §5); durate e alzata@PMS da scansione NON sono il riferimento — fanno fede i rilievi al motore.

**Dispersione tra i rilievi al motore** (stesso operatore, sessioni diverse): durata scarico 281↔291° (±5°), alzata@PMS asp 3,20↔3,50 mm (±0,15). È la normale incertezza del metodo goniometro+comparatore ai livelli di rampa; da tenere presente quando si regola "a gradi".

---

## 3. Fasatura installata e scenari

Calcolo dai rilievi al motore (° motore; overlap misurato al gioco):

| Scenario | ASP (apre-chiude) | ICL | SCA (apre-chiude) | ECL | Overlap | LSA |
|---|---|---|---|---|---|---|
| Rilievo 1 (06-14) | 42,0 – 70,0 | 104 | 64,0 – 37,0 | 103,5 | 79,0° | 103,8° |
| **Rilievo 2 (oggi)** | 43,0 – 67,0 | **102** | 69,0 – 42,0 | **103,5** | **85,0°** | 102,8° |
| Scheda rettifica | 42,5 – 72,5 | 105 | 67,5 – 37,5 | 105 | 80,0° | 105,0° |
| **Proposta 106/108** | 39,0 – 71,0 | **106** | 73,5 – 37,5 | **108** | **76,5°** | **107,0°** |

Lettura: oggi il motore è fasato **più anticipato** di quanto prescriva la scheda (ICL 102-104 vs 105) e con **molto incrocio** (79-85°).

---

## 4. Valutazione della proposta "106 ASP / 108 SCA" per erogazione da 4000 rpm in su

**Verdetto sintetico: la direzione è corretta e i numeri sono ragionevoli**, con le cautele al punto 4.3.

### 4.1 Perché la direzione è giusta
- **Ritardare l'aspirazione** (ICL 102→106) sposta la **chiusura aspirazione** da 67° a **71° dopo il PMI**: a 4000+ rpm la colonna d'aria ha inerzia e continua a riempire il cilindro a pistone risalente → più riempimento in alto, al prezzo di un po' di coppia sotto i ~3000 (riflusso ai bassi). È la mossa classica per spostare in alto la potenza.
- **Anticipare lo scarico** (ECL 103,5→108) apre lo scarico prima (73,5° prima del PMI): miglior *blowdown* agli alti regimi (meno contropressione in risalita), a scapito di poca espansione utile ai bassi.
- **LSA che passa da ~103 a 107°** e **overlap da 85° a 76,5°**: meno diluizione dei gas ai medi, erogazione più piena e regolare nella fascia 4000-7000 — coerente con l'obiettivo "da 4000 in su" su motore aspirato stradale/sportivo. (Un incrocio da 85° a LSA 103 è da motore molto spinto in alto CON scarico accordato; se lo scarico non è da corsa, ai medi si paga.)

### 4.2 Target pratici di regolazione (metodo alzata-al-PMS, più preciso dei gradi)
Sensibilità empirica dai tuoi stessi rilievi: **≈0,13–0,15 mm per grado di calettamento**. Per realizzare 106/108 regola finché al PMS d'incrocio leggi:

| Camma | Gioco | Alzata al PMS target |
|---|---|---|
| Aspirazione (ICL 106) | 0,30 mm | **≈ 2,90 mm** |
| Scarico (ECL 108) | 0,40 mm | **≈ 2,40–2,45 mm** |

(Il metodo dell'alzata al PMS è più ripetibile del punto di massima alzata: il naso è piatto e "leggere il picco" col comparatore ha ±2-3° di incertezza — è probabilmente parte della dispersione tra i tuoi due rilievi.)

### 4.3 Cautele prima di adottarla
1. **Gioco valvola↔pistone**: 106/108 *aumenta* i margini al PMS rispetto a oggi (l'aspirazione apre più tardi, lo scarico chiude più presto), quindi è più sicura dell'attuale — ma dopo la regolazione verifica comunque col plastilina/comparatore se testa/pistoni non sono di serie.
2. **La scheda del rettificatore dice 105/105**: è la fasatura per cui i lobi sono stati disegnati (compromesso del costruttore). 106/108 è una variazione contenuta (+1/+3°) e sensata per l'obiettivo dichiarato; oltre (108/110) senza banco prova a rulli è azzardo.
3. **Regola a passi**: porta prima l'aspirazione a 106 (è quella che sposta di più il carattere), prova; poi lo scarico a 106→108. Un solo cambiamento per volta.
4. La stima di Gemini "guardando il punto di massima alzata" arriva alla stessa sostanza, ma il **riferimento operativo migliore resta l'alzata al PMS** (tabella sopra), non il picco.

---

## 5. Test CAMMES eseguiti su queste camme (storico e stato)

| Test | Esito |
|---|---|
| Scansione 360° asp+sca (06-13) | OK — picchi coerenti con tutte le fonti (≤0,3 mm) |
| Verifica matematica conversione bicchiere | ESATTA (≡ funzione di supporto, scarto 0,0000 mm) |
| Correzione baseline/eccentricità | Attiva: fondo scarico 0,22→0,05 mm (eccentricità di montaggio ~±0,08-0,21 mm nell'acquisizione originale) |
| Alzata al PMS scansione vs motore | **Sottostimata ~35% sul medio-fianco** (2,1 vs 3,2-3,5) — anomalia in indagine |
| Ipotesi slittamento stepper | **ESCLUSA sperimentalmente** (banco 07-05: divergenza passi↔encoder 1° su 360°, zero backlash) |
| Ripetibilità scanner | RMS 0,074 mm su ri-scansione a 2 mesi (camma Clio) |
| Prossimo passo | Ri-scansione camme VW con **scan autonomo v3 (settle adattivo)**: se il fianco risale verso i valori-motore, causa = assestamento tastatore sui fianchi ripidi; altrimenti setup/centraggio dell'acquisizione originale |

---

## 6. Conclusioni

1. **Le camme sono sane e coerenti** tra scheda e rilievi al motore (picchi, durate ~290°); l'unico dato anomalo è il medio-fianco della *scansione*, limite noto in corso d'indagine — per fasare fanno fede i rilievi al motore.
2. **Fasatura attuale**: ICL ~102-104 / ECL ~103,5, overlap 79-85° — più anticipata e "incrociata" della prescrizione (105/105).
3. **Per un'erogazione da 4000 rpm in su, la proposta 106/108 è tecnicamente fondata** (chiusura aspirazione ritardata + blowdown anticipato + LSA 107): adottala regolando per **alzata al PMS ≈ 2,90 mm (asp, gioco 0,30) e ≈ 2,40 mm (sca, gioco 0,40)**, un passo per volta, con verifica del gioco valvola-pistone.

---
*Report generato da CAMMES v3.0.0 — dati: scansioni in `prove/`, rilievi operatore, scheda Motor Rettifica. La sensibilità 0,13-0,15 mm/° e i target del §4.2 derivano dai rilievi al motore (non dalla scansione).*
