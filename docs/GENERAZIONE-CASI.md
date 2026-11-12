# Generazione dei casi — regole complete

Tutto il codice è in `js/engine.js`. I contenuti (stanze, mobili, personaggi, storie) sono in `js/data.js`.
L'archivio si genera con `node tools/build-cases.js` e si verifica con `node tools/validate-cases.js`.
**Ogni modifica a queste regole va riflessa in tre posti:** il generatore (`buildPool`), il risolutore
(`predOK` / `evalClue` / `countSolutions`) e il testo degli indizi (`clueHTML` in `js/app.js`).
Se aggiorni solo uno dei tre, i casi diventano sbagliati o ambigui.

## 1. Regole del gioco (vincoli che ogni soluzione rispetta)

1. Griglia N×N con **N persone**: N−1 sospettati + 1 vittima (sempre l'ultimo indice, `n-1`).
2. **Una sola persona per riga e una per colonna.**
3. Nessuno sta su un mobile **bloccante** (`ITEMS[x].block === true`). Sui mobili non bloccanti (sedia, letto, tappeto…) sì.
4. **Regola del delitto:** nella stanza della vittima c'è esattamente **una** altra persona, il colpevole (`m`).
   Il risolutore la applica sempre, anche se non è scritta negli indizi (è la "regola d'oro" mostrata al giocatore).

## 2. Mappa

- **Stanze** (`makeRooms`): partizione ricorsiva in rettangoli (lato minimo 2). Numero di stanze
  `round(N² / (5 + 0.6·N))`, tra 3 e 16. Poi qualche fusione tra stanze vicine per avere forme a L/T
  (somma ≤ 1,9 × area media). Risultato tipico: 5×5 → 3 stanze, 8×8 → 7, 14×14 → 15.
- **Nomi delle stanze**: estratti senza ripetizioni dalle 16 stanze dell'ambientazione (per questo massimo 16 stanze).
- **Mobili** (`placeFurniture`), per ogni stanza:
  - bloccanti: 14–24% dell'area (almeno 1 se l'area è ≥ 4), preferibilmente lungo i muri;
  - non bloccanti: 12–22% dell'area (almeno 1);
  - i tipi vengono dalle liste `block` / `stand` della stanza (mobili a tema: fornelli in cucina, letti in camera…);
  - ogni stanza deve avere almeno max(2, 45% dell'area) caselle libere, altrimenti si riprova.
- **Finestre** (`placeWindows`): sui lati esterni della mappa, ogni lato di casella ha il 22% di probabilità.
- **Muri** (`derive` → `P.wall[c]`): bit 1 = sopra, 2 = destra, 4 = sotto, 8 = sinistra. Un lato è muro se
  confina con un'altra stanza o con il bordo.

## 3. Soluzione

1. Permutazione casuale riga→colonna che evita i mobili bloccanti (backtracking, max 20 000 passi).
2. Serve almeno una stanza con **esattamente 2** persone: lì vanno vittima e colpevole. Altrimenti si riprova (max 40 volte).
3. Il colpevole è un sospettato a caso. Gli altri sospettati vanno nelle caselle rimaste.
4. Il cast (`makeCast`): ruoli presi dall'ambientazione, nomi con **iniziali tutte diverse** (sono le lettere sui segnalini),
   sospettati in ordine alfabetico, vittima in fondo. Colori da `COLORS` (14, devono restare ben distinguibili su sfondo scuro).

## 4. Tipi di indizio e significato esatto

Gli indizi "su una persona" (`t: 'u'`) sono una lista di predicati sulla sua casella, tutti veri insieme.

| Predicato / tipo | Vero quando | Testo (es.) |
| --- | --- | --- |
| `room r` | la casella è nella stanza r | "era in cucina" |
| `notroom r` | non è nella stanza r | "non era in cantina" |
| `on it` | la casella contiene il mobile non bloccante `it` | "era seduta su una sedia" |
| `near it` | **una casella vicina (sopra/sotto/destra/sinistra) DELLA STESSA STANZA** contiene `it`. Un muro in mezzo non vale | "era accanto a una libreria" |
| `corner` | la casella tocca un muro orizzontale **e** uno verticale | "era in un angolo della taverna" |
| `center` | la casella non tocca nessun muro | "era al centro del salotto, lontano dai muri" |
| `window` | la casella ha una finestra su almeno un lato | "guardava fuori da una finestra" |
| `same a b` | stessa stanza | "X e Y erano nella stessa stanza" / "X stava chiacchierando con Y" |
| `diff a b` | stanze diverse | "X e Y erano in stanze diverse" |
| `diag a b` | **stessa stanza** e caselle che si toccano in diagonale | "X e Y erano nella stessa stanza, vicinissimi in diagonale" |
| `north a b` | a è in una riga più in alto di b | "X era più a nord di Y" |
| `west a b` | a è in una colonna più a sinistra di b | "X era più a ovest di Y" |
| `alone a` | nessun altro nella stanza di a | "X era da solo nella sua stanza" |
| `empty r` | nessuno nella stanza r | "Nessuno è entrato in cantina" |
| `count r k` | esattamente k persone nella stanza r | "In biblioteca c'erano esattamente due persone" |

Combinazioni usate per gli indizi `u`: stanza da sola; stanza+angolo; stanza+centro; stanza+finestra; stanza+sopra-mobile;
stanza+accanto; sopra-mobile; sopra-mobile+accanto; accanto; angolo; angolo+accanto; finestra; centro; non-stanza.

**Esclusioni:** niente `same` e niente `diag` tra vittima e colpevole (svelerebbero subito il caso). Niente `count` sulla stanza della vittima.
Niente indizi su righe o colonne numerate (scartati perché troppo banali).

## 5. Scelta degli indizi

1. `buildPool` crea tutti gli indizi veri possibili. Ognuno ha un peso (`W` in `engine.js`): i più "narrativi"
   (stanza+angolo, stanza+accanto, sopra+accanto…) pesano di più, quelli deboli (nord/ovest, non-stanza) di meno.
2. Ordine casuale pesato. Si aggiungono indizi finché il risolutore trova **una sola soluzione**
   (controllo solo dopo almeno max(3, N−2) indizi).
3. **Minimizzazione:** si prova a togliere ogni indizio, partendo dai più deboli; se resta unica, lo si toglie.
4. **Ogni personaggio deve comparire in almeno un indizio**: a chi manca si aggiunge un indizio "morbido"
   (accanto, sopra, finestra, angolo, non-stanza…). Rende il caso più leggibile senza svelarlo.
5. Controllo finale di unicità con limite alto (5 milioni di nodi). Se fallisce, si rigenera tutto.

## 6. Risolutore (`countSolutions`)

Backtracking che conta le soluzioni fino a `limit` (di solito 2: "unica" = 1). Ritorna `-1` se supera `maxNodes`.
- Dominio di ogni persona = caselle libere che rispettano i suoi indizi `u` e non sono in stanze `empty`.
- Ad ogni passo sceglie la persona con meno caselle possibili; scarta subito se una riga o colonna libera non è più copribile.
- Taglia subito: troppe persone in una stanza (`count`/`empty`), `alone`, vittima con più di un compagno, indizi a coppie.
- Alla fine controlla i `count` esatti e che nella stanza della vittima ci siano esattamente 2 persone.
- `lastNodes` = nodi visitati nell'ultima chiamata: serve come misura di difficoltà.

## 7. Archivio (`tools/build-cases.js`)

- Quantità per dimensione: `PER_SIZE` (oggi 5×5: 20, 6–10: 50, 11–12: 40, 13–14: 30 → 410 casi).
- Semi deterministici: seme = 1, 2, 3… per dimensione; i casi con mappa uguale a una già presa vengono saltati.
  **Cambiare qualsiasi regola o l'ordine delle chiamate a `rng()` cambia i casi generati.**
- Ordinamento dal più facile al più difficile: nodi del risolutore ÷ numero di indizi.
- `id` = `<n>-<posizione>` (cambia se l'ordine cambia); `key` = `<n>.<hash>` di mappa + soluzione + mobili (stabile: i salvataggi usano questo).

### Formato di un caso (JSON)

```json
{
  "n": 8,                       // lato della griglia
  "sc": 0,                      // indice in SCENARIOS
  "rooms": [3, 11, 0, ...],     // per ogni stanza della mappa, indice nella lista stanze dello scenario
  "room": "0001122...",         // N² caratteri base36: stanza di ogni casella (lettura riga per riga)
  "items": [[12, "tavolo"], ...],  // [casella, mobile]
  "win": [[0, 9], ...],         // [casella, bit dei lati con finestra]
  "persons": [{ "name": "Bice", "role": "la medica di bordo", "g": "f", "color": "#3a6fe0", "init": "B", "victim": false }, ...],
  "sol": [17, 42, ...],         // casella di ogni persona (ultima = vittima)
  "m": 3,                       // indice del colpevole
  "clues": [{ "t": "u", "a": 0, "p": [{ "k": "room", "r": 2 }, { "k": "corner" }] }, ...],
  "story": { "intro": 1, "weapon": 4, "epi": 0 },  // indici nei testi dello scenario
  "id": "8-3",
  "key": "8.1m1gewj"
}
```
Varianti di testo: `same.v` (0–2), `diff.v` (0–1), `empty.v` (0–1).

## 8. Aggiungere contenuti

- **Nuova ambientazione**: aggiungi un oggetto a `SCENARIOS` in `js/data.js` con `id`, `title`, `place`, `color`,
  3 `intros`, `weapons`, 3 `epilogues`, 4 `victims`, **almeno 14 `roles`** (servono 13 sospettati per il 14×14)
  e **16 `rooms`**. Formato stanza: `"Nome|in…|di…|pavimento|colore|bloccanti|non bloccanti"`, pavimento tra
  `wood tile carpet stone grass sand`. Segnaposto nei testi: `{V}` vittima, `{VR}` ruolo vittima, `{o}` o/a della vittima,
  `{M}` colpevole, `{MR}` ruolo colpevole, `{mo}` o/a del colpevole, `{lui}` lui/lei del colpevole.
  Attenzione: aggiungere uno scenario cambia `SCENARIOS.length` e quindi **tutti** i casi rigenerati.
- **Nuovo mobile**: voce in `ITEMS` (`block`, `label`, `art` con articolo, `on(g)` se ci si può stare sopra) + icona in `ICONS`.
  "accanto" + articolo viene trasformato in automatico (al, ai, allo, alla, all').
- **Nuovo tipo di indizio**: vedi l'avvertenza in cima (generatore + risolutore + testo + `validate-cases.js` + tabella sopra).

Dopo ogni modifica: `node tools/build-cases.js && node tools/validate-cases.js`, poi prova un caso nel browser.
