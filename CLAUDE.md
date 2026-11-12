# Twindoku: Cold Case — note di progetto

Questo file è il passaggio di consegne tra una sessione e l'altra: Claude Code lo legge da solo a ogni avvio.
Aggiornalo (sezione **Storico decisioni** in fondo) ogni volta che cambia qualcosa di importante.

## Cos'è

Gioco di logica investigativo, in italiano, pensato per ragazzi di circa 11 anni (i nipoti del proprietario).
Su una mappa a griglia NxN (stanze, mobili, finestre) bisogna piazzare N personaggi seguendo gli indizi,
poi indicare il colpevole: l'unica persona che era nella stessa stanza della vittima.

- Gioco online: https://giovannilombi.github.io/twindoku/
- Repo: https://github.com/giovannilombi/twindoku (branch `main`, GitHub Pages pubblica la root di `main` a ogni push, ~1 minuto)
- Sito statico puro: niente build, niente dipendenze, niente backend.

## Vincoli da rispettare sempre

- **Mai usare il nome "Murdoku"**: è un marchio registrato. Il gioco si chiama **Twindoku: Cold Case**.
- **Contenuti originali**: storie, personaggi, mappe e casi sono inventati. Non copiare testi, personaggi o livelli di giochi esistenti.
- **Lingua**: tutto in italiano, tono da giallo divertente per ragazzi (niente violenza esplicita: la vittima è "trovata a terra", "messa fuori gioco").
- **Desktop**: tutto deve stare in una schermata (niente scroll della pagina) fino a 14×14. **Telefono**: deve essere giocabile (layout impilato, persone in barra fissa in basso).
- **Indizi coerenti con i muri**: "accanto" e "in diagonale" valgono solo dentro la stessa stanza. Dettagli in `docs/GENERAZIONE-CASI.md`.
- **Ogni caso ha una sola soluzione**. Dopo ogni modifica al generatore: `node tools/build-cases.js && node tools/validate-cases.js`.
- **Push su GitHub**: l'account blocca i push che espongono l'email privata. Nel repo locale deve esserci
  `git config user.email "11275618+giovannilombi@users.noreply.github.com"` (controlla con `git config user.email`).
- I commit terminano con la riga `Co-Authored-By:` di Claude.

## Struttura

| Percorso | Cosa contiene |
| --- | --- |
| `index.html` | Pagina unica (meta PWA, intestazione, tre colonne: fascicolo, mappa, persone) |
| `css/style.css` | Tutta la grafica. Token colore in `:root`, tema unico scuro. Media query: `≤1080px` impilato + barra persone fissa; `≤640px` telefono |
| `js/data.js` | Contenuti: `ITEMS` (mobili, bloccanti o no, frasi), `ICONS` (SVG vista dall'alto, viewBox 40), `SCENARIOS` (6 ambientazioni), `NAMES`, `COLORS`, `TIERS`, `SIZES` |
| `js/engine.js` | Motore condiviso browser/Node: `derive`, `predOK`, `evalClue`, `countSolutions` (risolutore), `generateCase`, `hydrate` |
| `js/app.js` | Interfaccia: caricamento archivio, rendering mappa/indizi/persone, mosse, aiuti, accusa, archivio, salvataggi |
| `cases/<n>.json` | Archivio pre-generato, un file per dimensione (5…14). `cases/index.json` = conteggi |
| `tools/build-cases.js` | Rigenera l'archivio (deterministico: stessi semi → stessi casi) |
| `tools/validate-cases.js` | Controlli di qualità su tutto l'archivio (esce con codice 1 se trova problemi) |
| `manifest.webmanifest`, `icons/` | Installazione come app (schermata Home, `display: fullscreen`) |
| `docs/GENERAZIONE-CASI.md` | **Regole complete** di mappe, indizi, unicità, difficoltà, formato JSON |
| `docs/ROADMAP.md` | Idee aperte e problemi noti |

## Comandi

```sh
python3 -m http.server 8765            # prova in locale: http://127.0.0.1:8765/ (serve un server: i casi si caricano con fetch)
node tools/build-cases.js              # rigenera cases/*.json (~40 s)
node tools/validate-cases.js           # verifica tutti i casi (~1-2 min)
git push origin main                   # pubblica (GitHub Pages si aggiorna da solo)
gh api repos/giovannilombi/twindoku/pages/builds/latest --jq .status   # stato della pubblicazione
```

Per i test nel browser con Playwright: `file://` è bloccato, usa il server locale. Gli screenshot vanno salvati
dentro la cartella del progetto (`.playwright-mcp/`, ignorata da git).

## Come funziona il gioco (lato interfaccia)

- Indirizzo di un caso: `#caso-<n>-<numero>` (es. `#caso-8-3`). Frecce ‹ › = caso precedente/successivo in ordine di archivio.
- Avvio: carica `cases/index.json`, apre il caso (hash → ultimo giocato → `5-1`), poi carica il resto dell'archivio in sottofondo.
- Mossa: tocco persona → tocco casella. Tocco su una persona già piazzata = la riprende. Modalità "Segna ✕" per le note.
- **Aiutini** (interruttore, default acceso): righe/colonne occupate rigate (mobili compresi); passando sopra una casella
  rigata si illuminano le persone che la bloccano; indizi verdi/rossi in tempo reale.
- Mappa completa e giusta → popup accusa. Se chiuso, la barra di stato verde mostra **"Indica il colpevole"**.
  Dopo l'accusa: "Rivedi il finale" e "Prossimo caso ›" (= prossimo non risolto).
- Aiuto 💡: se qualcuno è nel posto sbagliato lo toglie, altrimenti piazza la persona con più indizi. Stelle: 0 aiuti = 3, ≤2 = 2, altrimenti 1.
- Un caso risolto resta mostrato con la soluzione, la stanza del delitto bordata di rosso, e nell'archivio è verde con le stelle.

### Salvataggi (localStorage, per dispositivo)

| Chiave | Contenuto |
| --- | --- |
| `gq3:case:<key>` | Stato del caso (piazzamenti, ✕, aiuti, tempo, risolto, accusato, indizi spuntati) |
| `gq3:solved` | Elenco delle impronte (`key`) dei casi risolti |
| `gq3:stars` | `{ key: stelle }` |
| `gq2:helpers`, `gq2:seenRules`, `gq2:last` | Preferenze, regole già viste, ultimo caso aperto (per id) |

I progressi sono legati all'**impronta** del caso (`key` = hash di mappa + soluzione + mobili), non al numero:
se l'archivio viene rigenerato e un caso cambia, non risulta risolto per errore. Non cambiare il formato di `key`
senza una migrazione, altrimenti tutti perdono i progressi. Il prefisso `gq` viene dal vecchio nome: lascialo così.

## Storico decisioni

- **2026-11-11** — Prima versione (file unico, 4×4–6×6, indizi riga/colonna). Bocciata: troppo banale per 11 anni.
- **2026-11-11** — Riscrittura: indizi descrittivi (stanza, angolo, accanto, seduto su, finestra…), 6 ambientazioni con storie,
  griglie fino a 14×14, archivio pre-generato (410 casi), layout in una schermata su desktop.
- **2026-11-11** — Tutto schermo su desktop, layout telefono con barra persone fissa, PWA installabile, casi risolti persistenti.
- **2026-11-11** — Bug segnalato: "accanto a una libreria" con un muro in mezzo. Ora "accanto" e "diagonale" valgono solo nella stessa stanza.
  Aggiunto pulsante "Indica il colpevole" nella barra di stato. Progressi legati all'impronta del caso (`gq3:`), non al numero.
- **2026-11-11** — Righine degli aiutini anche sui mobili; evidenzia chi blocca una casella.
- **2026-11-12** — "Murdoku" è un marchio registrato: nome cambiato in **Twindoku: Cold Case**, repo rinominato `murdoku` → `twindoku`
  (il vecchio indirizzo Pages dà 404). La cartella locale va rinominata `~/Dev/murdoku` → `~/Dev/twindoku`.
- **2026-11-12** — Aggiunti questo file, `docs/GENERAZIONE-CASI.md`, `docs/ROADMAP.md`, `tools/validate-cases.js`.
