# Twindoku: Cold Case

Gioco di logica investigativo per ragazzi, in italiano. Su ogni mappa c'è un delitto: bisogna piazzare ogni persona nella casella giusta seguendo gli indizi e scoprire chi era solo con la vittima.

**Gioca:** https://giovannilombi.github.io/twindoku/

## Regole

1. In ogni riga e in ogni colonna c'è una sola persona.
2. Nessuno può stare sui mobili pesanti (tavoli, armadi, piante…). Su sedie, poltrone, letti, tappeti e panche sì.
3. Il colpevole è l'unica persona che si trovava nella stessa stanza della vittima.

## Contenuto

- 410 casi, da 5×5 a 14×14, ordinati dal più semplice al più difficile in ogni dimensione.
- 6 ambientazioni con storie, personaggi e stanze proprie: Casa di famiglia, Il castello sul lago, Il museo a mezzanotte, Crociera da brivido, Campeggio al Lago Scuro, Delitto a cinque stelle.
- Ogni caso ha una sola soluzione (verificata dal risolutore).
- I progressi restano salvati nel browser.

## Struttura

| Percorso | Cosa contiene |
| --- | --- |
| `index.html`, `css/style.css` | Pagina e grafica |
| `js/app.js` | Interfaccia di gioco |
| `js/engine.js` | Generatore di mappe, indizi e risolutore |
| `js/data.js` | Ambientazioni, stanze, mobili, personaggi, icone |
| `cases/*.json` | Archivio dei casi pre-generati |
| `tools/build-cases.js` | Script che rigenera l'archivio |

## Sviluppo

Non serve nessuna installazione. Per provarlo in locale serve un server statico (i casi vengono caricati con `fetch`):

```sh
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Per rigenerare i casi dopo aver modificato storie, stanze o generatore (serve Node 18+):

```sh
node tools/build-cases.js
```
