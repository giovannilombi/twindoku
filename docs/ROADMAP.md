# Roadmap e problemi noti

## Problemi noti

- **Ospiti**: chi gioca senza detective ha i progressi solo nel `localStorage` del browser. Con un detective sono salvati sul server.
- **Tempi e aiuti dichiarati dal browser**: il server non può verificarli (un ragazzo smanettone potrebbe barare). Per un gioco tra amici va bene.
- **Casi in corso non sincronizzati**: sul server vanno solo i casi risolti; un caso a metà resta sul dispositivo dove l'hai iniziato.
- **Difficoltà stimata, non misurata**: l'ordine dei casi usa lo sforzo del risolutore a forza bruta, non quanto è difficile
  ragionarci per una persona. Alcuni casi "facili" potrebbero richiedere tentativi.
- **14×14 su telefono**: caselle piccole (~25 px). Si gioca, ma con attenzione; si può ingrandire con due dita.
- **Indizio "stanza + angolo" nelle stanze a L**: l'angolo interno (concavo) non conta come angolo, perché la casella non tocca due muri. È coerente con le regole, ma un ragazzo potrebbe aspettarsi il contrario.
- **Vecchio indirizzo** `giovannilombi.github.io/murdoku/` dà 404 dal 2026-11-12 (rinomina del repo).

## Idee

- Valutare la difficoltà con un risolutore "umano" (solo deduzioni semplici) e mostrarla con dei teschietti/lenti.
- Classifica settimanale (azzerata ogni lunedì), così anche chi arriva dopo può vincere qualcosa.
- Pannello per l'autore (rinominare o chiudere squadre, togliere detective con nomi inopportuni). Oggi si fa da
  `npx wrangler d1 execute twindoku --remote --command "..."`.
- Modalità "note" per persona (segnare dove una persona specifica NON può essere).
- Più ambientazioni (scuola, treno notturno, circo, stazione spaziale…), sempre con contenuti originali.
- Suoni leggeri (piazzamento, vittoria), con interruttore.
- Funzionamento offline (service worker) per giocare senza connessione.
