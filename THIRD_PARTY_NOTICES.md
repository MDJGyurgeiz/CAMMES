# CAMMES — Componenti di terze parti

Inventario delle dipendenze e degli asset di terze parti inclusi nel progetto e
nell'eseguibile distribuito. (Deliverable Lotto G; da mantenere allineato a ogni
release.)

## Dipendenze npm — runtime (imbarcate nell'exe)

| Pacchetto | Versione | Licenza | Uso |
|---|---|---|---|
| ws | 8.21.1 | MIT | server WebSocket (comandi UI↔server) |
| serialport (+ @serialport/*) | 12.0.0 | MIT | comunicazione seriale con l'Arduino |

## Dipendenze npm — sviluppo (NON nell'exe)

| Pacchetto | Versione | Licenza | Uso | Nota |
|---|---|---|---|---|
| eslint | ^9 | MIT | lint | — |
| pkg | 5.8.1 | MIT | build exe | **archiviato/deprecato** (advisory GHSA-22r3-9w55-cj54, PLE moderata, no fix). Migrazione a Node SEA o packager mantenuto = REL-02 aperto |

## Asset vendorizzati (file nel repo, serviti/nell'exe)

| File | Libreria | Licenza | Nota |
|---|---|---|---|
| `cammes/jspdf.umd.min.js` | jsPDF | MIT | export PDF/cam card. **Da aggiornare** (advisory GHSA-w532-jxjh-hjhj) — REL-01 aperto: richiede scaricare una build corretta e ritestare gli export |
| `cammes/lib/chart.umd.min.js` | Chart.js | MIT | grafici |
| `cammes/lib/chartjs-plugin-zoom.min.js` | chartjs-plugin-zoom | MIT | zoom grafici |
| `cammes/lib/hammer.min.js` | Hammer.js | MIT | gesture (dipendenza dello zoom) |
| `cammes/responsivevoice.js` | ResponsiveVoice | proprietaria/freemium | **non più referenziato** (APP-17: annunci vocali ora via speechSynthesis locale). Da rimuovere dal pacchetto — REL-10 |
| `cammes/fonts/*.woff2` | Inter, Rajdhani, JetBrains Mono | OFL/Apache-2.0 | tipografia UI |
| `cammes/fw/avrdude.exe` + `avrdude.conf` | avrdude | GPL-2.0 | flash firmware |

## Toolchain firmware

- Arduino AVR core (`arduino:avr:uno`), compilato con arduino-cli 1.4.1.
- HEX distribuito: `cammes/fw/master.ino.hex`, SHA-256
  `21031c77cf908ffeeb93a7b03e74b882175a5aceb29d3cb07e25360b79124f8d`.
- Corrispondenza riproducibile sorgente→HEX (build in CI) = REL-07, ancora aperto.

## Note aperte (REMAINING_RISKS)

- pkg deprecato (REL-02) e exe non firmato Authenticode (REL-05, serve
  certificato) restano da affrontare;
- SBOM in formato SPDX/CycloneDX (REL-10) da generare in CI;
- revisione licenze completa da confermare prima di una distribuzione ampia.
