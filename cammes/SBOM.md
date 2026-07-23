# CAMMES — Software Bill of Materials (SBOM)

Generato da `tools/gen_sbom.js` a partire da `package-lock.json` (albero
reale). Formato macchina: [`SBOM.json`](SBOM.json) (CycloneDX 1.5).
Rigenerare dopo ogni cambio di dipendenze: `node tools/gen_sbom.js`.

- Applicazione: **cammes v3.4.2** (UNLICENSED)
- Componenti totali: **222** — runtime (spediti nell'exe): **26**, dev/build (non spediti): **196**

## Runtime — finiscono nell'eseguibile

| Componente | Versione | Licenza |
|---|---|---|
| @serialport/binding-mock | 10.2.2 | MIT |
| @serialport/bindings-cpp | 12.0.1 | MIT |
| @serialport/bindings-interface | 1.2.2 | MIT |
| @serialport/parser-byte-length | 12.0.0 | MIT |
| @serialport/parser-cctalk | 12.0.0 | MIT |
| @serialport/parser-delimiter | 11.0.0 | MIT |
| @serialport/parser-delimiter | 12.0.0 | MIT |
| @serialport/parser-inter-byte-timeout | 12.0.0 | MIT |
| @serialport/parser-packet-length | 12.0.0 | MIT |
| @serialport/parser-readline | 11.0.0 | MIT |
| @serialport/parser-readline | 12.0.0 | MIT |
| @serialport/parser-ready | 12.0.0 | MIT |
| @serialport/parser-regex | 12.0.0 | MIT |
| @serialport/parser-slip-encoder | 12.0.0 | MIT |
| @serialport/parser-spacepacket | 12.0.0 | MIT |
| @serialport/stream | 12.0.0 | MIT |
| cammes-firmware | 4.1 | ? |
| chart.js | vendored | MIT |
| debug | 4.3.4 | MIT |
| jspdf | vendored | MIT |
| ms | 2.1.2 | MIT |
| node-addon-api | 7.0.0 | MIT |
| node-gyp-build | 4.6.0 | MIT |
| responsivevoice | vendored | proprietary-free-tier |
| serialport | 12.0.0 | MIT |
| ws | 8.21.1 | MIT |

## Dev / build — NON spediti (eslint, pkg, babel, catena serialport di test…)

Elenco completo con versioni e hash di integrità in `SBOM.json` (scope `optional`).
Totale: 196 pacchetti.

## Note supply-chain

- `jspdf` (vendorizzato): advisory **GHSA-w532-jxjh-hjhj** da valutare (REL-01).
- `pkg@5.8.1` (dev, build exe): archiviato, advisory GHSA-22r3-9w55-cj54 (REL-02); migrazione a SEA aperta.
- Firmware Arduino: build **riproducibile** verificata in CI (`firmware.yml`, REL-07).
- Note di licenza discorsive: `THIRD_PARTY_NOTICES.md`.
