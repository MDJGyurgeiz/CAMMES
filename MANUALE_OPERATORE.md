# CAMMES — Manuale Operatore (1 pagina)

*Per chi deve misurare una camma, non programmare. Versione software: in basso a destra di ogni pagina.*

## 1. Avvio
1. Doppio click su **`cammes.exe`** → si apre il browser sulla **Home**.
2. Collega l'**Arduino via USB** (prima o dopo l'avvio: il programma lo trova da solo entro pochi secondi).
3. In alto nella pagina Alzata i **4 LED di stato** (passaci sopra col mouse per la legenda):
   - **Comparatore** — verde: misure valide · giallo: scollegato/spento · rosso: nessun dato
   - **Motore** — verde: pronto · blu lampeggiante: in movimento · giallo: sbloccato (a mano) · rosso: Arduino muto
   - **Encoder** — verde: conteggi ok · rosso: fermo durante una scansione (scollegato)
   - **Server** — verde: programma connesso · rosso: avvia cammes.exe

**Se il browser non si apre da solo**: aprilo tu e vai su `http://localhost:3000`.

## 2. Misurare una camma (Alzata)
1. Monta l'albero, porta il tastatore sul **cerchio base** e azzera il comparatore.
2. Pagina **Alzata** → scegli la **Modalità** (Veloce ~45 s per l'uso normale — al banco dà la stessa curva delle altre —, Precisione media 3 letture per ambienti rumorosi, Race 0,5° per fianchi molto ripidi).
3. Premi **START** e aspetta il "giro" completo (barra di avanzamento + stima tempo).
4. Scrivi il **nome** (es. `golf-asp`) e premi **Salva** → il file finisce nell'archivio (`prove/`), suffisso `_alz` automatico.

Opzioni utili:
- **Zero virtuale**: porta automaticamente il picco a +180° per confrontare alberi montati diversamente.
- **STOP**: ferma qualsiasi movimento, anche a metà rotazione (firmware 3.1+).
- **⚙ Avanzate → Ripetizioni**: 3–5 run consecutivi; media e σ finiscono anche nel file e sul referto PDF.
- **⚙ Avanzate → Motore scansione**: di default **Firmware** (l'Arduino esegue il giro da solo, validato al banco); **Browser** è il metodo classico di riserva per firmware più vecchi.
- **⚙ Avanzate → 🧪 Verifica banco**: ogni tanto (o dopo un urto) monta un cilindro rettificato e lancia la verifica: entro 0,02 mm RMS il banco è sano. L'esito con data compare in Home.

Controlli automatici: se il cerchio base non torna alla stessa quota a fine giro, se l'encoder vede meno rotazione dei passi comandati o se l'Arduino si riavvia a metà misura, compare un avviso: **quella misura non va usata**.

## 2b. Collaudo su profilo nominale (Confronto)
1. Pagina **Confronto** → carica fino a 4 misure.
2. In **Collaudo su profilo nominale** carica il profilo di riferimento (una misura della camma nuova o un CSV di progetto) e imposta la tolleranza (es. 0,10 mm).
3. Ogni curva riceve il verdetto **CONFORME / NON CONFORME** con lo scostamento massimo e il grado dove capita; sul grafico compare la banda nominale ± tolleranza.

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
| "NO SENSORE" sul display | Il comparatore non trasmette: spegni/riaccendi il comparatore, controlla il cablaggio LM339N. Quando torna a rispondere compare il messaggio "Comparatore rilevato" e il LED torna verde. |
| La scansione non parte ("Comparatore non risponde") | Controllo pre-partenza: serve una misura valida recente. Collega/accendi il comparatore e aspetta il LED Sensore verde. |
| La scansione si ferma da sola | 3 letture invalide consecutive (assenti o fuori scala) → sensore scollegato o disturbato. La misura interrotta NON va usata. |
| Il motore non gira | Verifica alimentazione 36V del driver e il comando **Sblocca/Blocca motore**. |
| "Nessun campione dal firmware" (scan autonomo) | Il firmware sull'Arduino non è v3: ri-flasha `master.ino` o torna a Motore scansione = Browser. |
| Valori strani sul fianco / fondo che non torna a 0 | In Analisi lascia **Corr. baseline = ON**; verifica il centraggio dell'albero sul banco. |

## 5. Backup e assistenza
- Home → **📦 Backup ZIP** scarica tutto l'archivio misure (.scr). Conservalo prima di aggiornare il PC.
- Home → **♻ Cestino**: i file eliminati restano ripristinabili per 30 giorni.
- Home → **💾 Export** salva tag, preferiti e posizioni (file JSON, si ripristina con Import). Tag e preferiti sono comunque replicati sul server (settings.json accanto all'exe).
- Se qualcosa non va: Home → **🩺 Diagnostica** scarica un file di testo con versioni e log — è quello da mandare all'assistenza.
- Home → card **Sistema & aggiornamenti**: controlla nuove versioni su GitHub, aggiorna il **firmware Arduino** con un click (senza Arduino IDE), imposta **la tua intestazione** per i referti PDF.
- Questo manuale è sempre disponibile da Home → **📖 Manuale**.
