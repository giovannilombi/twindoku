# Roadmap e problemi noti

## Problemi noti

- **Progressi solo sul dispositivo**: sono nel `localStorage` del browser. Cambiando telefono o cancellando i dati del browser si perdono.
- **Difficoltà stimata, non misurata**: l'ordine dei casi usa lo sforzo del risolutore a forza bruta, non quanto è difficile
  ragionarci per una persona. Alcuni casi "facili" potrebbero richiedere tentativi.
- **14×14 su telefono**: caselle piccole (~25 px). Si gioca, ma con attenzione; si può ingrandire con due dita.
- **Indizio "stanza + angolo" nelle stanze a L**: l'angolo interno (concavo) non conta come angolo, perché la casella non tocca due muri. È coerente con le regole, ma un ragazzo potrebbe aspettarsi il contrario.
- **Vecchio indirizzo** `giovannilombi.github.io/murdoku/` dà 404 dal 2026-11-12 (rinomina del repo).

## Idee

- Progressi sincronizzati tra dispositivi e classifica tra i nipoti (servirebbe un piccolo backend, es. Supabase).
- Valutare la difficoltà con un risolutore "umano" (solo deduzioni semplici) e mostrarla con dei teschietti/lenti.
- Caso del giorno (stesso caso per tutti, scelto dalla data).
- Modalità "note" per persona (segnare dove una persona specifica NON può essere).
- Più ambientazioni (scuola, treno notturno, circo, stazione spaziale…), sempre con contenuti originali.
- Suoni leggeri (piazzamento, vittoria), con interruttore.
- Funzionamento offline (service worker) per giocare senza connessione.
