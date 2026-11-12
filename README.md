# Twindoku: Cold Case

Gioco di logica investigativo per ragazzi, in italiano. Su ogni mappa c'è un delitto: bisogna piazzare ogni persona nella casella giusta seguendo gli indizi e scoprire chi era solo con la vittima.

**Gioca:** https://giovannilombi.github.io/twindoku/

## Regole

1. In ogni riga e in ogni colonna c'è una sola persona.
2. Nessuno può stare sui mobili pesanti (tavoli, armadi, piante…). Su sedie, poltrone, letti, tappeti e panche sì.
3. Il colpevole è l'unica persona che si trovava nella stessa stanza della vittima.

## Contenuto

- 520 casi, da 5×5 a 14×14 (100 da 10×10, la misura del caso del giorno), ordinati dal più semplice al più difficile in ogni dimensione.
- 6 ambientazioni con storie, personaggi e stanze proprie: Casa di famiglia, Il castello sul lago, Il museo a mezzanotte, Crociera da brivido, Campeggio al Lago Scuro, Delitto a cinque stelle.
- Ogni caso ha una sola soluzione (verificata dal risolutore).
- **Detective e squadre**: ognuno crea il suo detective (soprannome + PIN, niente email), i progressi si salvano sul server
  e seguono il giocatore su ogni dispositivo. Gradi, distintivi, serie di giorni, caso del giorno, squadre con classifica.
  Si può anche giocare senza profilo: in quel caso i progressi restano nel browser.

## Struttura

| Percorso | Cosa contiene |
| --- | --- |
| `index.html`, `css/style.css` | Pagina e grafica |
| `js/app.js` | Interfaccia di gioco |
| `js/engine.js` | Generatore di mappe, indizi e risolutore |
| `js/data.js` | Ambientazioni, stanze, mobili, personaggi, icone |
| `js/gamify.js` | Gradi, distintivi, serie, caso del giorno (condiviso con il server) |
| `js/account.js`, `js/profile.js` | Detective, squadre, sincronizzazione e relative finestre |
| `cases/<n>/<i>.json`, `cases/index.json` | Archivio dei casi pre-generati (un file per caso) e indice |
| `worker/` | Server (Cloudflare Workers + database D1): API, schema del database, test |
| `tools/build-cases.js` | Script che rigenera l'archivio |
| `tools/validate-cases.js` | Controlla che tutti i casi siano validi |
| `CLAUDE.md` | Note di progetto e storico delle decisioni (letto da Claude Code a ogni sessione) |
| `docs/GENERAZIONE-CASI.md` | Regole complete di mappe, indizi e generazione |
| `docs/ROADMAP.md` | Idee e problemi noti |

## Sviluppo

Non serve nessuna installazione. Per provarlo in locale serve un server statico (i casi vengono caricati con `fetch`):

```sh
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Per rigenerare i casi dopo aver modificato storie, stanze o generatore (serve Node 18+):

```sh
node tools/build-cases.js
node tools/validate-cases.js
cd worker && npx wrangler deploy   # il server deve conoscere i casi nuovi
```

### Server (detective, squadre, classifiche)

Cloudflare Workers + D1, piano gratuito, nessun dato personale (solo soprannome, avatar e casi risolti).

```sh
cd worker
npx wrangler dev --port 8787             # server locale (usa .dev.vars e un database locale)
node test-api.js                         # prova completa delle API sul server locale
npx wrangler deploy                      # pubblica
```

Per far usare al gioco il server locale: nella console del browser `localStorage.setItem('tw:api', 'http://127.0.0.1:8787')`
(per tornare a quello vero: `localStorage.removeItem('tw:api')`).

## Licenza

© 2026 Giovanni Lombi. Uso, modifica e condivisione liberi **solo senza scopo commerciale e citando sempre l'autore**.

- **Codice** (HTML, CSS, JavaScript, strumenti): [PolyForm Noncommercial License 1.0.0](LICENSE)
- **Contenuti** (storie, personaggi, casi, icone): [Creative Commons Attribuzione - Non commerciale - Condividi allo stesso modo 4.0 Internazionale (CC BY-NC-SA 4.0)](LICENSE-CONTENUTI.md)

Miglioramenti e segnalazioni sono benvenuti: apri una issue o una pull request su GitHub.
