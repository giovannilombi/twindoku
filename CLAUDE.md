# Twindoku: Cold Case — note di progetto

Questo file è il passaggio di consegne tra una sessione e l'altra: Claude Code lo legge da solo a ogni avvio.
Aggiornalo (sezione **Storico decisioni** in fondo) ogni volta che cambia qualcosa di importante.

## Cos'è

Gioco di logica investigativo, in italiano, pensato per ragazzi di circa 11 anni (i nipoti del proprietario).
Su una mappa a griglia NxN (stanze, mobili, finestre) bisogna piazzare N personaggi seguendo gli indizi,
poi indicare il colpevole: l'unica persona che era nella stessa stanza della vittima.

- Gioco online: https://giovannilombi.github.io/twindoku/
- Repo: https://github.com/giovannilombi/twindoku (branch `main`, GitHub Pages pubblica la root di `main` a ogni push, ~1 minuto)
- Sito statico puro (niente build, niente dipendenze) + un piccolo server per detective e squadre:
  **Cloudflare Worker** `twindoku-api` → https://twindoku-api.giovanni-lombi.workers.dev, database **D1** `twindoku`
  (account Cloudflare personale di Giovanni; `wrangler` su questo Mac è già autenticato).

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
| `index.html` | Pagina unica (meta PWA, intestazione, tre colonne: fascicolo e indizi, mappa, persone e legenda) |
| `css/style.css` | Tutta la grafica, stile **Bacheca** (sughero, biglietti appuntati, foto segnaletiche). Token in `:root`. Media query: `≤900px` due schede (Mappa \| Indizi); `≤640px` intestazione compatta |
| `js/data.js` | Contenuti: `ITEMS` (mobili, bloccanti o no, frasi), `ICONS` (SVG vista dall'alto, viewBox 40), `SCENARIOS` (6 ambientazioni), `NAMES`, `COLORS`, `TIERS`, `SIZES` |
| `js/engine.js` | Motore condiviso browser/Node: `derive`, `predOK`, `evalClue`, `countSolutions` (risolutore), `generateCase`, `hydrate` |
| `js/app.js` | Interfaccia: caricamento casi, rendering mappa/indizi/persone, mosse, trascinamento, aiuti, accusa, archivio, salvataggi, schede del telefono |
| `js/faces.js` | Facce dei personaggi: SVG generati da nome + ruolo (stessa persona = stessa faccia) |
| `js/gamify.js` | Punti, gradi, distintivi, serie di giorni, caso del giorno. **Condiviso** con il server (il worker lo importa) |
| `js/account.js` | Profili sul dispositivo, chiamate al server, coda dei casi risolti offline, import dei casi da ospite |
| `js/profile.js` | Finestre: chi gioca, nuovo detective, accesso, PIN dimenticato, taccuino, squadre, festeggiamenti |
| `cases/<n>/<i>.json` | Archivio pre-generato, **un file per caso** (si scarica solo quello aperto) |
| `cases/index.json` | Indice: per ogni dimensione `[impronta, ambientazione]` di ogni caso |
| `tools/build-cases.js` | Rigenera l'archivio (deterministico: stessi semi → stessi casi) e `worker/src/cases.js` |
| `worker/` | Server: `src/index.js` (API), `src/cases.js` (generato), `schema.sql`, `wrangler.toml`, `test-api.js` |
| `tools/validate-cases.js` | Controlli di qualità su tutto l'archivio (esce con codice 1 se trova problemi) |
| `manifest.webmanifest`, `icons/` | Installazione come app (schermata Home, `display: fullscreen`) |
| `docs/GENERAZIONE-CASI.md` | **Regole complete** di mappe, indizi, unicità, difficoltà, formato JSON |
| `docs/ROADMAP.md` | Idee aperte e problemi noti |

## Comandi

```sh
python3 -m http.server 8765            # prova in locale: http://127.0.0.1:8765/ (serve un server: i casi si caricano con fetch)
node tools/build-cases.js              # rigenera cases/*.json (~40 s)
node tools/validate-cases.js           # verifica tutti i casi (~1-2 min)
cd worker && npx wrangler deploy       # pubblica il server (anche dopo ogni rigenerazione dei casi!)
cd worker && npx wrangler dev --port 8787 & node worker/test-api.js   # prova completa delle API in locale
npx wrangler d1 execute twindoku --remote --command "SELECT name, points FROM players"   # guardare il database
git push origin main                   # pubblica (GitHub Pages si aggiorna da solo)
gh api repos/giovannilombi/twindoku/pages/builds/latest --jq .status   # stato della pubblicazione
```

Per i test nel browser con Playwright: `file://` è bloccato, usa il server locale. Gli screenshot vanno salvati
dentro la cartella del progetto (`.playwright-mcp/`, ignorata da git).

## Come funziona il gioco (lato interfaccia)

- Indirizzo di un caso: `#caso-<n>-<numero>` (es. `#caso-8-3`). Frecce ‹ › = caso precedente/successivo in ordine di archivio.
- Avvio: carica `cases/index.json` (senza cache), apre il caso (hash → ultimo giocato → `5-1`) scaricando solo quel file.
- Link d'invito a una squadra: `#squadra-<CODICE>` (6 caratteri).
- Mossa: tocco persona → tocco casella, oppure **trascinamento** (dalla lista alla mappa, da una casella all'altra, fuori dalla mappa = la toglie).
  Tocco su una persona già piazzata = la riprende. Modalità "Segna ✕" per le note: la ✕ si può mettere **ovunque**, anche su mobili e ostacoli.
- **Indizi**: tocco sul biglietto = "messo da parte" (`S.struck`): scende in fondo sotto «Già a posto» ma resta leggibile (puntina blu), ritocco = torna su.
  La lente 🔍 accende sulla mappa la stanza e gli oggetti di cui parla (mai la casella giusta). Toccare un indizio **non seleziona mai una persona**.
  Scegliendo una persona, i suoi indizi si mettono in evidenza (bordo del suo colore) e gli altri si attenuano.
- **Aiutini** (interruttore, **default spento**, chiave `gq3:helpers`): righe/colonne occupate rigate (mobili compresi); passando sopra una casella
  rigata si illuminano le persone che la bloccano; puntine verdi/rosse in tempo reale e gli indizi verdi scendono in fondo da soli.
  Spenti: nessun colore (tornano solo a mappa piena e sbagliata).
- **Fascicolo** e **legenda** si richiudono a fisarmonica (`gq3:storyOpen`, `gq3:legendOpen`). Le foto delle persone si ridimensionano da sole
  per stare sempre tutte visibili (`fitCast`: foto con ruolo → foto piccole → foto mini + nome → solo nomi).
- La **vittima** ha sempre il segno 💫 (foto, pedina, nome negli indizi).
- **Telefono (≤900px)**: due schede a tutto schermo, «Mappa» (mappa sempre intera + comandi + persone sotto) e «Indizi» (fascicolo, indizi, legenda).
  Si cambia con uno swipe orizzontale o dalle linguette; lo swipe non parte da una persona o da una casella occupata (lì si trascina).
- Mappa completa e giusta → popup accusa. Se chiuso, la barra di stato verde mostra **"Indica il colpevole"**.
  Dopo l'accusa: "Rivedi il finale" e "Prossimo caso ›" (= prossimo non risolto).
- Aiuto 💡: se qualcuno è nel posto sbagliato lo toglie, altrimenti piazza la persona con più indizi. Stelle: 0 aiuti = 3, ≤2 = 2, altrimenti 1.
- Un caso risolto resta mostrato con la soluzione, la stanza del delitto bordata di rosso, e nell'archivio è verde con le stelle.

### Detective, squadre, gamification

- **Detective**: soprannome senza spazi (3–16) + PIN di 4 cifre + avatar emoji. Niente email né dati personali (minori di 14 anni).
  Alla creazione riceve un **codice segreto** (es. `LENTE-GUFO-73`) per scegliere un nuovo PIN se lo dimentica;
  in alternativa il **capitano** della squadra gli dà un PIN temporaneo (da cambiare al primo accesso).
- Nomi di detective e squadre: unici e **non troppo simili** (normalizzati: minuscole, niente accenti/spazi/punteggiatura,
  1→i 0→o, lettere doppie unite, articolo iniziale tolto per le squadre; poi distanza di Levenshtein ≤1, ≤2 se lunghi). Filtro parolacce.
- **Squadre**: nome + password. Chi la crea è capitano (rigenera il link d'invito, resetta PIN). Se il capitano esce, passa al più bravo;
  squadra vuota = cancellata. Punteggio di squadra = **media dei 5 migliori**. Si cambia squadra quando si vuole, i punti seguono il detective.
- **Punti** = stelle × lato della mappa. Gradi, distintivi e serie in `js/gamify.js` (la serie non si azzera se si salta un solo giorno).
- **Caso del giorno**: uguale per tutti, sempre un **10×10** (`DAILY_SIZE` in `js/gamify.js`). Lo decide il **server** alla prima
  richiesta del giorno (ora italiana) e lo scrive nella tabella `daily`: è il primo caso di `dailyOrder` (10×10 in ordine fisso
  mescolato dall'impronta) **mai risolto come caso del giorno** e non proposto negli ultimi 30 giorni (`DAILY_GAP`). Così i casi che
  nessuno fa tornano più avanti. Conta solo chi gioca con un detective. Il gioco lo legge da `GET /api/daily` (copia in `tw:daily`).
  Nei test locali `ALLOW_TEST_DAY=1` (in `.dev.vars`, mai in produzione) permette di simulare un giorno con l'intestazione `X-Test-Day`.
- Sicurezza: PIN/codici/password con PBKDF2 + sale + segreto `PEPPER` del server (**non cambiarlo**: tutti i PIN smetterebbero di funzionare;
  copia locale in `worker/.dev.vars`, ignorato da git). Dopo 5 errori blocco di 15 minuti; max 40 errori l'ora per rete.
- Piano gratuito Cloudflare: ~100.000 richieste/giorno, D1 5 milioni di letture/giorno. Non va in pausa.

### Salvataggi (localStorage, per dispositivo)

| Chiave | Contenuto |
| --- | --- |
| `gq3:case:<key>` | Stato del caso (piazzamenti, ✕, aiuti, tempo, risolto, accusato, indizi messi da parte) |
| `gq3:solved` | Elenco delle impronte (`key`) dei casi risolti |
| `gq3:stars` | `{ key: stelle }` |
| `gq3:helpers`, `gq3:storyOpen`, `gq3:legendOpen` | Aiutini (default spenti; la vecchia `gq2:helpers` non si legge più), fascicolo e legenda aperti/chiusi |
| `gq2:seenRules`, `gq2:last` | Regole già viste, ultimo caso aperto (per id) |
| `tw:profiles`, `tw:active` | Detective su questo dispositivo `[{id, name, avatar, token}]` e quello che sta giocando (`null` = ospite) |
| `tw:p<id>:case:<key>`, `tw:p<id>:solved`, `tw:p<id>:stars` | Come le `gq3:` ma per ogni detective (le `gq3:` restano dell'ospite) |
| `tw:p<id>:me`, `tw:p<id>:queue` | Copia dell'ultimo `/api/me`; casi risolti non ancora inviati al server |
| `tw:invite`, `gq2:imported`, `tw:api` | Invito in sospeso; import dei casi da ospite già proposto; indirizzo del server (solo per prove locali) |

I progressi sono legati all'**impronta** del caso (`key` = hash di mappa + soluzione + mobili), non al numero:
se l'archivio viene rigenerato e un caso cambia, non risulta risolto per errore. Non cambiare il formato di `key`
senza una migrazione, altrimenti tutti perdono i progressi. Il prefisso `gq` viene dal vecchio nome: lascialo così.

## Storico decisioni

- **2026-11-11** — Prima versione (file unico, 4×4–6×6, indizi riga/colonna). Bocciata: troppo banale per 11 anni.
- **2026-11-11** — Riscrittura: indizi descrittivi (stanza, angolo, accanto, seduto su, finestra…), 6 ambientazioni con storie,
  griglie fino a 14×14, archivio pre-generato (410 casi, poi 785), layout in una schermata su desktop.
- **2026-11-11** — Tutto schermo su desktop, layout telefono con barra persone fissa, PWA installabile, casi risolti persistenti.
- **2026-11-11** — Bug segnalato: "accanto a una libreria" con un muro in mezzo. Ora "accanto" e "diagonale" valgono solo nella stessa stanza.
  Aggiunto pulsante "Indica il colpevole" nella barra di stato. Progressi legati all'impronta del caso (`gq3:`), non al numero.
- **2026-11-11** — Righine degli aiutini anche sui mobili; evidenzia chi blocca una casella.
- **2026-11-12** — "Murdoku" è un marchio registrato: nome cambiato in **Twindoku: Cold Case**, repo rinominato `murdoku` → `twindoku`
  (il vecchio indirizzo Pages dà 404). La cartella locale va rinominata `~/Dev/murdoku` → `~/Dev/twindoku`.
- **2026-11-12** — Aggiunti questo file, `docs/GENERAZIONE-CASI.md`, `docs/ROADMAP.md`, `tools/validate-cases.js`.
- **2026-11-12** — Licenza: codice **PolyForm Noncommercial 1.0.0** (`LICENSE`, con riga `Required Notice`), contenuti **CC BY-NC-SA 4.0**
  (`LICENSE-CONTENUTI.md`). Titoli di coda dal pulsante ⓘ in alto. L'email dell'autore non deve mai comparire in chiaro
  nei sorgenti: è salvata al contrario in `MAIL` (`js/app.js`) e ricomposta solo al tocco su "Scrivi all'autore".
- **2026-11-12** — **Detective e squadre** con server Cloudflare Workers + D1 (scelto al posto di Supabase, che mette in pausa i progetti
  gratuiti dopo 7 giorni). Soprannome + PIN, codice segreto di recupero, squadre con password e link d'invito, controllo nomi simili,
  gradi, 16 distintivi, serie di giorni, caso del giorno, classifiche. Archivio diviso in un file per caso.
- **2026-11-12** — Caso del giorno sempre **10×10**. Archivio portato a 520 casi: 10×10 = 100, 11–14 = 50 ciascuno
  (i 410 casi precedenti ci sono tutti; dal 10×10 in su alcuni hanno cambiato numero, i progressi no perché usano l'impronta).
- **2026-11-12** — 10×10 portati a **365** (archivio 785 casi). Il caso del giorno ora è una rotazione senza ripetizioni per un anno.
- **2026-11-12** — Caso del giorno deciso dal server: un caso che nessuno risolve torna in rotazione dopo almeno 30 giorni.
- **2026-11-12** — Nuova grafica **Bacheca** (scelta fra tre proposte: bacheca, centrale operativa, fumetto). Facce al posto delle lettere,
  trascinamento, indizi "messi da parte" al posto della barratura (che li rendeva illeggibili), lente sugli indizi, indizi della persona
  scelta in evidenza, fascicolo e legenda richiudibili, foto che si adattano, ✕ ovunque, segno della vittima, telefono a due schede con swipe.
  **Aiutini spenti di default per tutti** (chiave nuova `gq3:helpers`): Giovanni vuole che i ragazzi ragionino da soli.
  Prototipo di riferimento: https://claude.ai/artifact/LhqYdzD84F4apD8TqMtCwR
