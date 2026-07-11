# CAMMES — Manuale Operatore (1 pagina)

*Per chi deve misurare una camma, non programmare. Versione software: in basso a destra di ogni pagina.*

## 1. Avvio
1. Doppio click su **`cammes.exe`** → si apre il browser sulla **Home**.
2. Collega l'**Arduino via USB** (prima o dopo l'avvio: il programma lo trova da solo entro pochi secondi).
3. In alto nella pagina Alzata i **LED di stato** dicono: Server (verde = programma ok), Sensore (verde = comparatore risponde), Encoder.

**Se il browser non si apre da solo**: aprilo tu e vai su `http://localhost:3000`.

## 2. Misurare una camma (Alzata)
1. Monta l'albero, porta il tastatore sul **cerchio base** e azzera il comparatore.
2. Pagina **Alzata** → scegli la **Modalità** (Veloce ~45 s per l'uso normale — al banco dà la stessa curva delle altre —, Precisione media 3 letture per ambienti rumorosi, Race 0,5° per fianchi molto ripidi).
3. Premi **START** e aspetta il "giro" completo (barra di avanzamento + stima tempo).
4. Scrivi il **nome** (es. `golf-asp`) e premi **Salva** → il file finisce nell'archivio (`prove/`), suffisso `_alz` automatico.

Opzioni utili:
- **Zero virtuale**: porta automaticamente il picco a +180° per confrontare alberi montati diversamente.
- **⚙ Avanzate → Ripetizioni**: 3–5 run consecutivi con statistica di ripetibilità (σ, CV) — usala per verificare il banco.
- **⚙ Avanzate → Motore scansione**: di default **Firmware** (l'Arduino esegue il giro da solo, validato al banco); **Browser** è il metodo classico di riserva per firmware più vecchi.

## 3. Analizzare (Analisi)
1. Pagina **Analisi** → importa il file di **aspirazione** e quello di **scarico**.
2. Imposta per ciascun lato: **Angolo lobo** (centro lobo in gradi MOTORE), **Gioco valvola**.
3. Premi **▶ Analizza** → durate, LSA, aperture/chiusure, **alzata al PMS**, incrocio + grafico 720°.
4. Se il motore usa **bicchieri/punterie**: pannello **⚙ Funzioni** → attiva **Follower simulato**, scegli "Bicchiere piatto Ø" e inserisci diametro e **raggio base** (asp/scarico separati) → ri-Analizza. L'alzata al PMS ora è quella del bicchiere reale.
5. **Esporta**: CSV (Excel), PDF (referto), **Salva profilo** (rimette in archivio il grezzo o la curva già convertita al follower).

Tutto il resto (molla e forze, dinamica valvole, strumenti race, animazione, confronto A/B) si accende **solo se ti serve** dal pannello **⚙ Funzioni** — la scelta viene ricordata.

## 4. Problemi frequenti
| Sintomo | Rimedio |
|---|---|
| LED Server rosso | `cammes.exe` non è in esecuzione: avvialo. Se già avviato, chiudi e riapri. |
| LED Sensore spento/giallo | Controlla cavo USB e alimentazione del comparatore; il firmware deve essere caricato sull'Arduino. |
| "NO SENSORE" sul display | Il comparatore non trasmette: spegni/riaccendi il comparatore, controlla il cablaggio LM339N. |
| La scansione si ferma da sola | 3 letture NaN consecutive → sensore muto (vedi sopra). |
| Il motore non gira | Verifica alimentazione 36V del driver e il comando **Sblocca/Blocca motore**. |
| "Nessun campione dal firmware" (scan autonomo) | Il firmware sull'Arduino non è v3: ri-flasha `master.ino` o torna a Motore scansione = Browser. |
| Valori strani sul fianco / fondo che non torna a 0 | In Analisi lascia **Corr. baseline = ON**; verifica il centraggio dell'albero sul banco. |

## 5. Backup
Home → **Backup ZIP** scarica tutto l'archivio misure. Conservalo prima di aggiornare il PC.
