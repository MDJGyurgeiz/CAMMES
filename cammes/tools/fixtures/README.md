# File di riferimento dei test

Misure REALI del banco, usate dai test di regressione e di validazione (`npm test`).

**Il contenuto di questi file non si modifica mai**: sono dati grezzi di misura, e i test valgono
solo finché restano quelli. Le impronte qui sotto servono a provarlo.

Ogni impronta è calcolata sul contenuto con i fine riga LF, cioè sui byte che il repository conserva:
così non cambia se git, al checkout, converte i fine riga per il sistema operativo.

Le camme sono indicate con un'etichetta neutra (RIF-1, RIF-2, RIF-3): il banco è universale e il
repository non nomina marche, modelli o sigle motore (`tools/test_neutralita.js`). Fino alla v3.7.0
questi file portavano un altro nome; il 2026-11-14 sono stati solo rinominati, byte per byte identici.

| File | Camma | Cosa contiene | SHA-256 (fine riga LF) |
|---|---|---|---|
| `rif1_prova1_alz.scr` | RIF-1 | un lobo letto col puntalino sferico; la camma di riferimento dei test di dinamica (distacco valvola) | `dd80287d86390eed8d7c8a74e33c1ff810bfccd430f824282991fc46d746ec90` |
| `rif1_alz.scr` | RIF-1 | altra acquisizione della stessa camma, usata per posizione del picco e conversione al bicchiere | `e67fa2176a296f25016d231a6eaeed0eb5c69abddb2bf094d2abbba900c22419` |
| `rif2_asp_alz.scr` | RIF-2 | aspirazione di una coppia di alberi di cui esiste la scheda del rettificatore | `32e82588dfeea38fe40a0b61a80a582d261756e8907a16c2551e3759550f3966` |
| `rif2_sca_alz.scr` | RIF-2 | scarico della stessa coppia | `ec11b2a449b6b9c880eca4ac5a159b28ed77fbfc7759602ce546f32c9b8a3136` |
| `rif3_asp_puntalino-r1.5_alz.scr` | RIF-3 | aspirazione letta col puntalino sferico r 1,5 | `389a0d6012762f3a8560179b118ddcc4c8fb8133dfd9e55e25a32d734521732b` |
| `rif3_asp_piattello-d33_alz.scr` | RIF-3 | LA STESSA camma, stessa sessione, letta col piattello piatto Ø 33 | `d9d14f6a2276f297612b51e496b45db634b835ddfb969932b3a7880b77255f8b` |
| `prova_fw31_alz.scr` | — | scansione di prova fatta col firmware 3.1 | `c02f7d422eb2aab51f9e946a093546e44b7f7d48553af47c4f5197f7ccecd402` |

- **RIF-1** — albero bialbero a 4 valvole per cilindro, punteria diretta a bicchiere.
- **RIF-2** — coppia aspirazione/scarico per punterie a bicchiere meccanico Ø 35; il confronto con la
  scheda del rettificatore è in `REPORT_CAMMA_RIF-2.md` e in `tools/validate_rif2.js`.
- **RIF-3** — la prova fisica della conversione puntalino → bicchiere: stesso lobo, due tastatori
  (`tools/validate_rif3_piattello.js`).
