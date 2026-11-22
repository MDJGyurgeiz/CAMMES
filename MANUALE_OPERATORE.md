# CAMMES — Manuale operatore

Per chi deve misurare una camma, non programmare. La versione del programma è in basso a destra di ogni pagina.

In alto a destra, in ogni pagina: **Messaggi** (le notifiche già sparite: numero rosso = un errore non letto, giallo = un avviso), **Giro guidato** (i comandi della pagina, uno alla volta), **Guida** e **Manuale**. Le notifiche escono in basso a destra (in Analisi a sinistra), tre alla volta: le altre restano in Messaggi. Il **?** accanto a un campo lo spiega: passaci sopra col mouse, cliccalo o toccalo. Quando la risposta a una domanda è un'azione rossa (eliminare, sostituire, continuare senza salvare), Invio non la sceglie per sbaglio.

## 1. Avvio
1. Doppio clic su **`cammes.exe`** → si apre il browser sulla **Home** (se non si apre, vai tu su `http://localhost:3000`).
2. Collega l'**Arduino via USB**, prima o dopo l'avvio. La **riga di stato** in cima alla Home dice l'esito della **Verifica banco**, se l'**Arduino** è collegato e aggiornato (se non lo vede: controlla il cavo, poi **Ricontrolla**) e se c'è un programma più nuovo. **+ Nuova misura** apre Alzata.
3. In alto nella pagina **Alzata** le **4 spie** (Comparatore, Motore, Encoder, Server) devono essere verdi ✓. Giallo ! = da controllare (Comparatore spento o scollegato, Motore sbloccato), rosso ✕ = non risponde o guasto, blu ↻ = in movimento. Passaci sopra, o toccale, per la spiegazione.

## 2. Misurare una camma (Alzata)
1. Monta l'albero, porta il tastatore sul **cerchio base** e azzera il comparatore.
2. Sopra il grafico scegli la **Modalità**: **Veloce** per l'uso normale (un punto per grado), **Race** per fianchi molto ripidi (un punto ogni mezzo grado, pausa più lunga prima di ogni lettura). Al banco danno la stessa curva: Veloce basta quasi sempre. Accanto, il **Verso di scansione** (orario / antiorario): cambialo solo se la camma è montata al contrario.
3. Premi **START**. START, STOP, avanzamento, riga **Esito** e **Salva misura** stanno nella **barra dei comandi** in alto, sempre in vista; se START non può partire, la barra dice perché.
4. A fine giro leggi la riga **Esito**, che resta fino al prossimo START: **Misura completa** (verde), **Misura sospetta** (gialla: giro non chiuso, slittamento o punti non stabilizzati; meglio ripeterla), **Misura INCOMPLETA** (rossa: da ripetere).
5. Scrivi il **nome** (es. `albero12_asp`) e premi **Salva misura**, o Invio: la misura va nell'archivio (cartella `prove`), `_alz` si aggiunge da solo. Se è incompleta, col giro non chiuso o con uno slittamento, prima di salvarla il programma chiede e lo scrive nel file. Poi la riga Esito porta in **Analisi**, come aspirazione o come scarico.

Prima di perdere una misura non salvata (START, Zero virtuale, Ricomincia, Verifica banco, cambio di pagina) il programma chiede.

- **Zero virtuale** (nella barra, prima di START, facoltativo): trova il picco e lo porta a 180° dallo zero, così alberi montati in modo diverso restano confrontabili. Alla fine la pagina si ricarica e la riga Esito dice com'è andata.
- **STOP** ferma subito qualsiasi movimento: una misura fermata a metà è incompleta e va ripetuta. A banco fermo, STOP non tocca la misura sul grafico.
- **Ricomincia** svuota il grafico e riporta le scelte ai valori iniziali; non azzera l'encoder.
- **Rotazione manuale e zero**: **Ruota** porta l'albero all'angolo scritto, **−** e **+** di un grado; **Azzera angolo qui** fa della posizione attuale lo 0° (se ci sono posizioni memorizzate, chiede prima); **Memorizza posizione** le dà un nome per tornarci con un clic; **Sblocca motore** lascia girare l'albero a mano con le letture dal vivo (**Blocca motore** prima di misurare).
- **⚙ Avanzate → Ripetizioni**: N giri di fila (3 consigliati) e il verdetto di **ripetibilità** (eccellente / buona / sufficiente / scadente) con la σ massima: se è alta c'è qualcosa di lasco o che vibra. Si salva la MEDIA dei giri, e la σ finisce sulla Scheda camma.
- **⚙ Avanzate → 🧪 Verifica banco**: ogni tanto, o dopo un urto, monta un cilindro rettificato e lancia la verifica: entro 0,02 mm RMS il banco è sano. L'esito con la data compare in cima alla Home.

Controlli automatici: giro non chiuso (il cerchio base non torna alla stessa quota) o encoder che vede meno rotazione dei passi comandati → riga Esito gialla; Arduino che si riavvia o comparatore che tace a metà misura → misura fermata: **quella misura non va usata**. Con un firmware vecchio il programma passa da solo al metodo classico, più lento.

## 3. Confronto e collaudo (Confronto)
1. Scegli fino a 4 misure da **Scegli dall'archivio** (anche dal secondo PC in rete) o dal disco, oppure spuntale nella Home e premi **Confronta i selezionati**. La legenda porta il nome di ogni misura.
2. Per il collaudo scegli il **nominale** (la misura di una camma nuova o un CSV di progetto) e scrivi la **tolleranza** (es. 0,10 mm).
3. Il verdetto compare **in alto** e si aggiorna da solo: **CONFORME / NON CONFORME** per ogni misura, con lo scarto massimo, il grado e il riallineamento (si giudica la forma, non la fase). Una misura salvata come INCOMPLETA è **NON VALUTABILE**.
4. **Stampa collaudo** crea il PDF da consegnare.

Vista **Differenza dalla prima misura**: con **Allinea la fase** le curve combaciano prima di sottrarle. **Vista polare**: scrivi il **Ø cerchio base** (il diametro, come in Analisi) e scegli la misura.

## 4. Analizzare (Analisi)
In cima al pannello **Parametri** i **4 passi** dicono che cosa manca; un clic porta al comando.
1. **Aspirazione**: scegli la misura dalla tendina **Dall'archivio** (o da un file): si carica subito.
2. **Scarico**: lo stesso. Dalla Home le misure arrivano già caricate: due misure spuntate e **Analizza (aspirazione + scarico)**.
3. **Valori da confermare**, per lato: **Comando valvola** (dicitura del referto; **Bicchiere idraulico** porta il gioco a 0; con bilanciere o leva scrivi il **Rapporto bilanciere**), **Angolo lobo** (centro lobo in gradi MOTORE: dopo il PMS in aspirazione, prima del PMS allo scarico), **Gioco valvola** a freddo. **Bordo tratteggiato** = valore di partenza, non del tuo motore: scrivi il tuo, oppure clicca nel campo e premi Invio se è già giusto.
4. **▶ Analizza** (resta a vista mentre scorri il pannello) → alzata massima, **durata al gioco** e a 1 mm, **separazione dei lobi (LSA)**, aperture e chiusure a parole («10,6° prima del PMS»), **incrocio**, **alzata al PMS**, grafico sui 720° (0 = PMS di incrocio). Se poi cambi un valore, i numeri sbiadiscono finché non rifai Analizza.

Con **bicchieri/punterie**: **⚙ Funzioni** → **Punteria simulata** → **Bicchiere**; scrivi il **Ø Bicchiere** e il **diametro del cerchio base** misurato col calibro (il DIAMETRO: il programma lo dimezza da solo; aspirazione e scarico separati) e rifai Analizza: l'alzata al PMS è quella del bicchiere reale.

**Documenti**: **↓ CSV** (per l'Excel in italiano), **↓ Referto PDF**, **Scheda camma** (una pagina per il cliente), **Salva in archivio** (la curva grezza o quella convertita alla punteria). Se restano valori da confermare, una finestra li elenca prima, e sul documento restano segnati. Tutti i PDF portano in testa la tua intestazione; nessuno nomina marche o modelli: portano i nomi delle misure che hai scelto tu.

La vista **Avanzato** aggiunge anticipo, filtro delle derivate e correzione dell'eccentricità. Molla e forze, cinematica, dinamica valvole, strumenti race, animazione e confronto A vs B si accendono **solo se ti servono** da **⚙ Funzioni**. **Azzera tutto** riporta i campi ai valori di partenza, dopo una domanda.

## 5. Archivio, backup e aggiornamenti (Home)
- **Archivio**: ricerca per nome o tag, filtri, **Solo preferiti**. Su ogni riga: **Apri** (vista rapida, con la **Scheda PDF** per il cliente e **Apri in** Analisi o Confronto), **Scarica** (.scr), **Excel** (.xlsx), **Elimina** (va nel cestino).
- **Selezione**: spunta le misure; in fondo compaiono **Confronta i selezionati (max 4)** e **Analizza (aspirazione + scarico)**, che chiede quale delle due è l'aspirazione.
- **Sistema e manutenzione**, in fondo alla Home (si apre con un clic):
   - **Programma**: per aggiornare scarica il nuovo `cammes.exe`, chiudi la finestra di cammes.exe, metti il file nuovo al posto del vecchio **nella stessa cartella** (quella che contiene `prove`) e riavvialo. Avviato da un'altra cartella, per esempio Download, parte con l'archivio vuoto. Qui è scritta anche la cartella delle misure.
   - **Firmware dell'Arduino**: se la riga è arancione premi **⚡ Aggiorna firmware Arduino** (circa 15 s, senza scollegare il cavo).
   - **Intestazione dei PDF**: il nome della tua officina, in testa a tutti i PDF (referto, race report, scheda camma, scheda della singola misura, collaudo).
   - **📦 Backup completo (ZIP)**: misure, intestazione, tag, preferiti ed esito della verifica banco; per ripristinarlo scompatta lo ZIP nella cartella di cammes.exe e riavvia. **♻ Cestino**: le misure eliminate si ripristinano per 30 giorni. **Esporta etichette**: tag, preferiti e posizioni memorizzate in un file.
   - **🩺 Diagnostica**: il file da mandare all'assistenza quando qualcosa non va.

## 6. Problemi frequenti
| **Sintomo** | **Rimedio** |
|---|---|
| LED Server rosso | `cammes.exe` non è in esecuzione: avvialo. Se è già avviato, chiudilo e riaprilo. |
| LED Comparatore giallo, «Comparatore: nessuna lettura valida» | Controlla cavo e alimentazione del comparatore; il firmware deve essere sull'Arduino. START non parte finché la spia non torna verde. |
| «NO SENSORE» sul display | Il comparatore non trasmette: spegnilo e riaccendilo, controlla il collegamento. Quando risponde compare «Comparatore rilevato». |
| «Comparatore non risponde: misura NON avviata» | Serve una lettura valida recente: collega o accendi il comparatore e aspetta il LED Comparatore verde. |
| «Misura FERMATA: comparatore non risponde» | 3 letture invalide consecutive (assenti o fuori scala): comparatore scollegato o disturbato. La misura interrotta NON va usata. |
| Il motore non gira | Verifica l'alimentazione 36 V del driver e **Sblocca / Blocca motore** (spia Motore gialla = sbloccato). |
| «Banco in arresto: attendi qualche secondo» | Hai ricaricato o chiuso la pagina col motore in movimento: il banco lo sta fermando. I comandi tornano da soli. |
| «Sola lettura» | Il banco è comandato da un'altra finestra o da un altro PC: qui le misure si vedono, i comandi no. |
| «Firmware senza misura automatica», riga Arduino arancione in Home | Firmware vecchio: aggiornalo da Home → **Sistema e manutenzione**. |
| Valori strani sul fianco, fondo che non torna a 0 | In Analisi, vista **Avanzato**, lascia **Correzione eccentricità** su **accesa**; verifica il centraggio dell'albero. |

Per l'assistenza: intestazione, tag, preferiti ed esito della verifica banco stanno in `settings.json` accanto a cammes.exe; quando c'è una versione nuova, l'impronta SHA-256 del file da scaricare è in Home → Sistema e manutenzione → Programma; il comparatore arriva all'Arduino attraverso l'LM339N.
