# CAMMES — Specifica matematica (pipeline camma → eventi)

Documento richiesto dalla controrevisione (Lotto D). Definisce convenzioni,
ordine delle trasformazioni e unità. Ogni trasformazione è applicata **una
sola volta**; nessun grafico ricostruisce gli eventi per conto proprio.

## Convenzioni angolari

- **Dominio camma**: 1..360 gradi-camma (1 giro camma). La camma gira 1:1
  con l'albero a camme.
- **Dominio albero motore (crank)**: 1..720, ciclo completo a 4 tempi.
  1 grado-camma = 2 gradi-albero.
- **Riferimento**: indice 720/crank **360 = PMS incrocio** (TDC overlap).
  PMI/BDC a 180 e 540.
- Aspirazione: naso ATDC (picco a 360 + centro). Scarico: naso BTDC (picco a
  360 − centro).
- Direzione: la scansione segue il senso di rotazione; gradi crescenti = tempo
  che avanza. Il verso è registrato nei metadati (`#verso`, MET-04) e i
  confronti tra lobi con verso diverso sono segnalati.

## Ordine delle trasformazioni (una volta, registrato nei metadati)

```
raw (grado,alzata)
 → parseCamFile          (validazione: duplicati/frazionari/fuori-range/missing)
 → analysisRaw           (rimozione baseline/eccentricità di montaggio)
 → applyVirtualFollower  (puntalino → bicchiere/rullo/finger)  [una sola volta;
                          un file già-follower NON viene riconvertito, APP-07]
 → mapCamToCrank         (fasatura: picco misurato camPeakPos + centro effettivo
                          effectiveCenters(anticipo); gioco sottratto qui)
 → (rocker ratio)        (applyRockerRatio, se ≠ 1)
 → findEvents            (apertura/chiusura dai CROSSING reali, sub-grado)
 → cinematica/dinamica   (derivate, compliance)
 → output/export         (grafici, CSV, cam card, PDF: stesso oggetto eventi)
```

## Picco (camPeakPos) — MAT-02

Il picco è il riferimento fisico della fase (lo zero di scansione è arbitrario).
Su un **naso piatto** (plateau) si restituisce il **centro circolare del
componente** con lift ≥ max − tolleranza (tol = max(0,02 mm, 1% del picco)),
non il primo massimo. Su un picco netto: fit parabolico sui tre punti attorno
al massimo. Plateau separati equivalenti → `AMBIGUOUS` (non implementato come
errore duro: si usa il componente che contiene il massimo globale).

## Eventi (findEvents) — MAT-03

Apertura/chiusura vengono dai **crossing reali** della soglia sulla curva
fasata (crank 1..720, gioco già sottratto), **non** da centro ± durata/2 (che
assume simmetria e su lobi asimmetrici sbaglia fino a ~60°):

1. trova il picco;
2. attraversamento **crescente** della soglia prima del picco → apertura;
3. attraversamento **decrescente** dopo il picco → chiusura;
4. interpolazione sub-grado: `xCross = x0 + (T − y0)/(y1 − y0)`;
5. gestione wrap 720→1;
6. se la coppia non è univoca → `ambiguous` (fallback documentato al vecchio
   metodo, ma segnalato).

Mappatura agli eventi riportati (invariata su lobo simmetrico):

- intake: `openBTC = 360 − openIdx`, `closeABC = closeIdx − 540`;
- exhaust: `openBBC = 180 − openIdx`, `closeATC = closeIdx − 360`;
- `overlap = openBTC(intake) + closeATC(exhaust)`;
- `durata = closeIdx − openIdx` (con wrap).

Soglia eventi = `DUR_EPS` (0,05 mm, guardia anti-offset comparatore; il gioco è
già nella curva) — riportata in `results.durThresh` e ovunque compaia la durata
(APP-05).

## Gestione dati mancanti (MET-01)

Valore e validità sono separati. Un grado senza campione valido resta
**INVALIDO**, mai uno zero fisico: `parseCamFile` traccia `covered`/
`missingCount`/`duplicateDegrees`/`fractionalDegrees`/`ok`; `averageRuns`
lascia invalidi i gradi mancanti in tutti i run. Un profilo con
`missingCount > 0` è **NON VALUTABILE** per conformità/timing/cam card (APP-09).

## Reindicizzazione encoder (MAT-08)

`reindexByEncoder` accetta un giro solo se lo span è ≥ 70% del giro atteso
(counts/rev ≈ 1440); riporta la divergenza. **Limiti noti (PARTIAL,
REMAINING_RISKS)**: mancano ancora counts/rev calibrati per-dispositivo,
tolleranza di jitter e monotonicità stretta — da completare col device/boot-id
del firmware (Lotto B).

## Unità

Alzata in **mm**; angoli in **gradi**; encoder in **conteggi** (4 cnt/°camma).
I modelli dinamici lavorano in SI (m, N, kg, s) internamente.
