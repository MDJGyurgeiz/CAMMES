# Legacy

Materiale dell'architettura precedente, conservato come riferimento.

## micrometro_SPI/

Sketch del **secondo** Arduino Uno usato fino al 2026-05-03 nell'architettura a 2 microcontrollori
(un Uno "master" controllava lo stepper, un secondo Uno leggeva il sensore Neoteck e
trasmetteva il valore via SPI inter-Arduino).

Dal 2026-05-03 il sistema usa **un solo Arduino Uno** che gestisce tutto: stepper, sensore
Neoteck e nuovo encoder LDP3806. Vedi `master/master.ino` per il firmware corrente.

Lo sketch qui è non più in uso. Conservato per riferimento storico.
