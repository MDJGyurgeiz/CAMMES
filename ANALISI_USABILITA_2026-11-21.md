# CAMMES è semplice da usare e comprensibile? — analisi di usabilità

*Versione esaminata: v3.7.1. Analisi iniziata il 2026-11-15, chiusa il 2026-11-21.*

Domanda dell'officina: *«puoi analizzare il software per capire se sia semplice
da usare e intelligibile? e se può essere migliorato in questo aspetto?»*

## La risposta breve

**Per chi lo usa spesso, seduto, col mouse in mano, CAMMES è comprensibile e
soprattutto onesto**: i comandi essenziali sono pochi, gli errori di misura
dicono che cosa è successo e che cosa fare, e il programma distingue a parole
ciò che ha misurato da ciò che l'operatore ha dichiarato.

**Per il meccanico che lo apre poche volte a settimana, in piedi accanto al
banco, a un metro dallo schermo, non è ancora semplice.** I motivi sono quattro:

1. ciò che serve mentre si misura non sta in una schermata;
2. gli esiti passano da notifiche che spariscono in pochi secondi e coprono i
   dati;
3. il programma non parla una lingua sola: italiano e inglese tecnico, punto e
   virgola nei numeri, la stessa cosa con nomi diversi da una pagina all'altra;
4. l'aiuto c'è, ma vive in fumetti lunghi e piccoli che compaiono solo
   passando il mouse.

**Si può migliorare molto senza toccare banco, firmware, protocollo o calcoli.**
È lavoro di disposizione, di nomi e di messaggi che restano a schermo. Le
proposte sono in fondo, in ordine di convenienza. Nessuna è stata fatta:
**decide l'officina**.

Strada facendo l'analisi ha trovato anche **difetti veri**: il programma che fa
o dice una cosa sbagliata. Quelli sono già corretti nella v3.7.1 (vedi sotto).

## Come è stata fatta

- **Nove aspetti**, ognuno valutato separatamente: Home, Alzata, Confronto,
  Analisi dal lato ingresso dati, Analisi dal lato risultati e documenti,
  linguaggio, messaggi, primo avvio e leggibilità al banco, percorsi di lavoro.
- **Fatti misurati dal vivo** sul server vero pilotato da un firmware emulato,
  a 1366×768 (portatile tipico) e su tablet 768×1024, con 17 schermate.
- **Conteggi fatti sul sorgente**: comandi, campi, fumetti, notifiche, lunghezze.
- **Secondo esame** dei rilievi gravi di Home, Alzata e Confronto, da parte di
  chi non li aveva scritti. Per gli altri aspetti la valutazione è stata fatta
  **due volte, indipendentemente**: i rilievi gravi sono comparsi in entrambe
  le tornate.
- **Non coperto:** la ricognizione «percorsi di lavoro passo per passo» non si
  è conclusa. I percorsi sono comunque toccati dagli altri otto aspetti.

## Che cosa funziona, e va conservato

- **START non parte se il comparatore non risponde**, e dice che cosa
  controllare. Durante la misura i comandi pericolosi sono bloccati, con una
  frase che dice quale comando e perché.
- **Salvataggio onesto.** «File salvato» arriva solo dopo la conferma del
  server; prima di sovrascrivere chiede; una misura incompleta viene marcata
  nel file e la domanda lo dice.
- **Gli errori di misura sono completi:** causa, cosa fare e se la misura vale.
  Per esempio: «Comparatore non risponde: scansione NON avviata… il LED
  Comparatore deve essere verde».
- **Dichiarato e misurato non si confondono.** Bordo tratteggiato sui valori
  che il programma non può indovinare, «(da confermare)», «non valutabile» al
  posto di un numero finto. È la cosa più preziosa del programma.
- **I documenti non contraddicono lo schermo:** se un parametro cambia dopo
  l'analisi, l'esportazione si ferma e lo dice.
- **Le letture dal vivo sono grandi e nitide** (alzata a 42 px, gradi a 32 px):
  si leggono a un metro. Barra in alto fissa con le quattro spie.
- **Analisi parte in vista Base con 7 campi**, e ricorda le scelte. Partire dal
  minimo è l'idea giusta.
- **Il manuale è di una pagina**, ordinato per lavori, con una tabella sintomo →
  rimedio che cita i messaggi esatti dello schermo.
- **Confronto è la pagina più leggera**: un grafico e un pannello. Il verdetto è
  una parola italiana (CONFORME / NON CONFORME) con simbolo e colore.
- **Eliminare un file lo manda nel cestino per 30 giorni**, e la finestra lo
  dice.

## Difetti veri trovati — già corretti nella v3.7.1

| Dove | Che cosa non andava | Adesso |
|---|---|---|
| Alzata, Ruota e tasti −/+ | in Race muovevano metà dei gradi scritti; un angolo con la virgola faceva ripetere il movimento precedente | gradi giusti in ogni modalità; un valore non eseguibile è rifiutato senza muovere |
| Alzata, fine misura | «Scansione completata» in verde anche col giro non chiuso; la misura sospetta si salvava senza domande né traccia | verde solo se il giro è pulito; conferma al salvataggio; l'avviso resta nel file |
| Alzata, Zero virtuale | finiva ricaricando la pagina senza dire com'era andato, e riportava modalità, ripetizioni e senso ai valori iniziali | dice l'esito e mantiene le scelte |
| Home, verifica banco | una verifica fallita si leggeva «banco verificato il …» | «Verifica banco NON SUPERATA», in rosso, con residuo |
| Home, Scheda PDF | data della stampa presentata come data della misura; misura incompleta non segnalata; preferiti sul foglio del cliente | data della misura dal file; INCOMPLETA/SOSPETTA in rosso; niente preferiti |
| Analisi, gioco valvola | il segnaposto 0,50 entrava in durate e fasatura senza alcun segno | «da confermare», come gli angoli lobo |
| Analisi, documenti | scheda camma, referto e CSV stampavano come misure valori dichiarati non confermati; «OK», «(sicuro)», «motore sicuro» | asterisco e nota; «calcolo statico» al posto di «sicuro» |
| Analisi, Race report | valeva per il solo lato aspirazione senza dirlo in copertina | lo dice in testa e in ogni pagina |
| Fumetti e conferme | «Tipologia» prometteva un rapporto di leva non applicato; Reset e RESET promettevano cose che non fanno; «Svuota archivio» diceva «per sempre» | testi veri |
| Confronto | tolleranza e raggio base scritti con la virgola sostituiti in silenzio; allineamento solo a gradi interi; verdetto sulla vista Differenza | corretti |
| Alzata, fumetto «Nome file» | l'esempio richiamava un modello di moto | esempio neutro; il controllo di neutralità ora riconosce anche le sigle abbreviate |

## Problemi di usabilità — proposte, in ordine di convenienza

Gravità: **alta** = rallenta o confonde spesso, o porta a sbagliare senza
accorgersene; **media** = fastidio frequente; **bassa** = cosmetico.
Sforzo: piccolo / medio / grande.

**1. Alzata: ciò che serve mentre si misura non sta in una schermata** — alta, medio.
A 1366×768 START è 1,35 schermate più in basso (1,58 su tablet), perché il
riquadro «Misura in tempo reale» è alto 836 px. Mentre si guarda il grafico,
STOP non si vede. Lo stesso valore di alzata compare tre volte.
*Proposta:* riquadro dal vivo più compatto e START, STOP, avanzamento e SALVA in
una barra sempre visibile, in alto o fissa in basso.

**2. Gli esiti passano da notifiche a tempo che coprono i dati** — alta, medio.
145 notifiche diverse, 27 durano 9 secondi o più. In Analisi coprono il
pannello dei parametri e alcuni risultati, e la pila tiene le ultime 4, non le
più gravi. Il registro a campanella c'è, ma nessuno lo spiega.
*Già fatto nella v3.7.1:* gli avvisi di fine misura restano finché non li si chiude.
*Proposta:* in Alzata una riga fissa «Esito della misura» sotto il grafico, fino
al prossimo START; notifiche spostate dove non coprono i valori; la campanella
spiegata nel manuale e nella guida.

**3. Home: l'archivio sta due schermate sotto** — alta, medio.
Prima vengono benvenuto, conteggi, tre tessere che ripetono la barra in alto,
manutenzione, grafico dell'attività e un secondo filtro per tag.
*Proposta:* in cima una riga di stato (verifica banco, Arduino, aggiornamenti)
con un pulsante grande «Nuova misura»; subito sotto l'archivio; manutenzione e
attività in fondo, chiuse finché non servono.

**4. Dall'archivio non si va ad Analisi, né si sceglie che cosa confrontare** — alta, medio.
Analisi e Confronto prendono i file dalla finestra di Windows, uno per volta.
Dal secondo PC in rete la cartella dell'archivio non c'è. «Confronta
preferiti» apre i primi 4 senza farli scegliere.
*Proposta:* una casella su ogni riga dell'archivio e due pulsanti, «Confronta i
selezionati» e «Analizza: aspirazione = …, scarico = …». In Analisi la scelta
dei file anche dall'archivio, come già fa Confronto con i nomi nell'indirizzo.

**5. Analisi: da dove si comincia?** — alta, medio-grande.
L'unica istruzione è in corpo 11 e «Analizza» è fuori dalla prima schermata. Ci
sono due sistemi di mostra/nascondi (Base/Avanzato e 7 Funzioni). Con tutto
acceso: 24 campi, 42 icone «?», 8 schermate. Il comando valvola si descrive in
tre posti (Tipologia, Bilanciere in Avanzato, Tipo follower in Funzioni).
*Proposta:* passi numerati in testa (1 carica aspirazione, 2 carica scarico,
3 controlla i valori da confermare, 4 Analizza), «Analizza» sempre visibile, e
un solo comando «Comando valvola» per lato che fa comparire solo i campi che
servono (bicchiere: Ø; rullo: raggio; bilanciere: rapporto; leva: bracci),
vuoti, da inserire.

**6. Il programma non parla una lingua sola** — media, medio.
Inglese tecnico (follower, lash, overlap, float, sweep), sigle in tre versioni
per gli stessi quattro eventi (BTC/BTDC/«prima del PMS»). Numeri col punto e
con la virgola, con il punto che vale «decimale» in un risultato e «migliaia»
in quello accanto. La durata ha sei nomi, la misura salvata una dozzina, ci
sono tre «zero» e quattro «salva».
*Proposta:* il glossario qui sotto, applicato a schermo, PDF e manuale, e una
sola funzione per scrivere i numeri (virgola decimale, mai il punto come
separatore delle migliaia).

**7. L'aiuto vive in fumetti lunghi e piccoli** — media, medio.
148 fumetti: in Analisi la media è 213 caratteri, 20 superano i 300 e uno arriva
a 784. Compaiono solo col mouse, dietro un «?» da 16 px. Il giro guidato sta
dietro un'icona senza nome, il manuale si apre solo dalla Home, e alcuni fumetti
raccontano la storia del programma invece di spiegare il comando.
*Proposta:* fumetti di una o due righe con un rimando «Altro nel manuale», il
manuale raggiungibile da ogni pagina, il giro guidato con il suo nome.

**8. Leggibilità a un metro** — media, piccolo-medio.
Le scritte di servizio sono fra 10 e 13 px, il grigio sul fondo scuro ha un
contrasto di 3,7-4 a 1, e lo stato del banco è affidato a puntini colorati da
8 px. Su tablet 11 comandi su 25 sono più piccoli di 32 px.
*Proposta:* etichette più grandi, contrasto almeno 4,5 a 1, LED con una parola
accanto («Comparatore OK»), pulsanti principali più grandi.

**9. Nomi dei comandi che si confondono** — media, piccolo.
RESET (ricarica la pagina), Reset zero (azzera l'encoder, senza domanda) e Zero
virtuale; due SALVA. L'interruttore del senso sta in fondo alla pagina ma
decide il verso della scansione.
*Proposta:* «Ricomincia da capo», «Azzera angolo qui» (con domanda se esistono
posizioni salvate), «Salva misura» / «Memorizza posizione»; il senso accanto a
Modalità, scritto a parole.

**10. Una misura non salvata si perde con un clic** — media, piccolo.
RESET o il cambio pagina buttano una misura appena fatta senza chiedere.
*Proposta:* una domanda se c'è una misura non ancora salvata.

**11. Confronto** — media, piccolo-medio.
- La legenda dice «grafico1…4» invece del nome del file.
- La seconda curva è blu scuro su fondo scuro.
- Il grafico non ha l'asse dei gradi.
- Il verdetto esce in fondo, in piccolo, e non si aggiorna da solo.
- La vista Differenza non allinea le curve.
- File validi vengono respinti per il nome con un avviso che non spiega.
- Il collaudo non si può stampare.

*Proposta:* nomi dei file in legenda, asse in gradi, verdetto in alto e
aggiornato da solo, collaudo stampabile.

**12. Finestre del browser per azioni importanti** — media, medio.
Tag, conferme e verifica banco passano da finestre «localhost dice…».
*Proposta:* finestre della pagina, come quella già fatta per eliminare un file.

**13. Aggiornare il programma** — media, piccolo.
Archivio e impostazioni vivono accanto all'eseguibile. Il file nuovo, se
avviato dalla cartella Download, parte con archivio vuoto, intestazione vuota e
«banco mai verificato», e nessuno spiega dove metterlo.
*Proposta:* scrivere in Home dove sono le misure e dare la procedura in tre
passi (sostituisci il file nella stessa cartella).

**14. Il CSV su un PC italiano si apre in una colonna sola** — bassa, piccolo.
*Proposta:* indicare l'esportazione Excel (.xlsx) già disponibile dalla Home,
oppure un CSV col punto e virgola.

## Interventi rapidi (piccoli e sicuri)

- Nomi dei comandi del punto 9 e domanda prima di perdere una misura non
  salvata (punto 10).
- In Confronto: nomi dei file in legenda e asse in gradi.
- In Home: riga di stato in cima e archivio subito sotto (punto 3, la parte di
  ordinamento).
- Contrasto dei testi grigi e LED con una parola accanto.
- Fumetti più lunghi di 300 caratteri: accorciati, il resto nel manuale.
- Manuale raggiungibile da ogni pagina.
- Procedura di aggiornamento scritta in Home.

## Interventi strutturali (in ordine di convenienza)

1. Alzata: barra di comando sempre visibile e riga «Esito della misura» (punti
   1 e 2).
2. Archivio come punto di partenza: selezione e invio a Confronto e Analisi
   (punto 4).
3. Analisi a passi, con un solo «Comando valvola» per lato (punto 5).
4. Glossario e formato unico dei numeri su schermo, PDF e manuale (punto 6).
5. Finestre della pagina al posto di quelle del browser (punto 12).

## Che cosa NON fare

- **Non nascondere un numero per semplificare.** Un risultato calcolato e utile
  resta visibile; si dichiara da dove viene.
- **Non togliere «da confermare» e «non valutabile»** per rendere la pagina più
  pulita: sono ciò che rende onesti i documenti.
- **Non riempire i campi con valori tipici di un modello**: il banco è
  universale, i valori dichiarati restano vuoti o da confermare.
- **Niente mappe di cilindri o di bancate**: si lavora un cilindro per volta.
- **Niente pulsanti di emergenza fisici né modifiche a firmware e protocollo**
  per risolvere problemi di interfaccia.
- **Non accettare decimali che il banco non può eseguire** (Ruota a 90,3 in
  Veloce): meglio un rifiuto chiaro di una posizione diversa da quella scritta.
- **Non togliere il ricaricamento della pagina alla fine dello Zero virtuale**:
  è il cambiamento più rischioso; l'esito ora lo attraversa.

## Glossario proposto (una parola per cosa)

| Usare | Abbandonare |
|---|---|
| gioco valvola | lash, gioco (lash) |
| distacco della valvola | valve float, float, cam float |
| incrocio | overlap |
| separazione dei lobi (LSA tra parentesi, solo la prima volta) | LSA da sola |
| apre prima del PMS · chiude dopo il PMI · apre prima del PMI · chiude dopo il PMS | BTC, ABC, BBC, ATC, BTDC, ABDC, BBDC, ATDC |
| durata al gioco · durata a 1 mm di alzata | durata, durata totale, durata effettiva, durata @ gioco |
| punteria simulata | follower, tipo follower |
| leva a dito | finger, finger follower |
| rapporto del bilanciere | rocker, rocker ratio |
| misura (il file salvato) | file, profilo, scansione, prova, run, _alz |
| giro (di una ripetizione) | run |
| alzata massima | max alzata, picco, max lift |
| verifica del banco | test di salute del banco |
| numeri con la virgola decimale | punto decimale; punto come separatore delle migliaia |
