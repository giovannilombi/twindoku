// Gradi, distintivi, serie di giorni e caso del giorno.
// File condiviso: lo usa il gioco (browser) e lo usa il server (worker/), così i conti tornano sempre uguali.

export const starsOf = hints => (hints === 0 ? 3 : hints <= 2 ? 2 : 1);
// Punti di un caso: stelle × lato della mappa (un 5×5 da 3 stelle = 15, un 14×14 da 3 stelle = 42).
export const pointsOf = (n, stars) => n * stars;

export const RANKS = [
  { min: 0, name: 'Recluta', icon: '🔰' },
  { min: 60, name: 'Agente', icon: '👮' },
  { min: 200, name: 'Sergente', icon: '🎖️' },
  { min: 500, name: 'Ispettore', icon: '🔍' },
  { min: 1200, name: 'Commissario', icon: '🕵️' },
  { min: 2500, name: 'Questore', icon: '⭐' },
  { min: 5000, name: 'Leggenda del giallo', icon: '👑' },
];
export function rankOf(points) {
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].min) i++;
  return { ...RANKS[i], level: i, next: RANKS[i + 1] || null };
}

// Giorno di calendario in Italia, 'AAAA-MM-GG'.
export const romeDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;

// Serie di giorni con almeno un caso risolto. Saltare UN giorno non la azzera (la serie "va in pausa"),
// saltarne due di fila sì. Restituisce la serie attuale (ancora viva se l'ultimo giorno giocato è oggi,
// ieri o l'altro ieri) e la serie più lunga di sempre.
export function streaks(days, today = romeDay()) {
  const list = [...new Set(days)].map(dayNum).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of list) { run = prev != null && d - prev <= 2 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const current = prev != null && dayNum(today) - prev <= 2 ? run : 0;
  return { current, best, playedToday: prev === dayNum(today) };
}

// Caso del giorno: uguale per tutti, scelto fra i casi da 6×6 a 8×8.
const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// cases: elenco [impronta, dimensione, ambientazione, id] in ordine di archivio
export function dailyCase(cases, day = romeDay()) {
  const pool = cases.filter(c => c[1] >= 6 && c[1] <= 8);
  return pool.length ? pool[fnv('giorno:' + day) % pool.length] : null;
}

// rows: casi risolti { n, sc, hints, secs, day, daily }
export function statsOf(rows, extra = {}) {
  const sizes = new Set(rows.map(r => r.n)), scs = new Set(rows.map(r => r.sc));
  return {
    solved: rows.length,
    points: rows.reduce((s, r) => s + pointsOf(r.n, starsOf(r.hints)), 0),
    noHint: rows.filter(r => r.hints === 0).length,
    sizes: sizes.size,
    scenarios: scs.size,
    giant: rows.some(r => r.n === 14),
    lynx: rows.some(r => r.n >= 8 && r.hints === 0 && r.secs > 0 && r.secs < 180),
    daily: rows.filter(r => r.daily).length,
    streak: streaks(rows.map(r => r.day), extra.today),
    total: extra.total || 0,
    team: !!extra.team,
  };
}

export const BADGES = [
  { id: 'primo', icon: '🔎', name: 'Primo caso', desc: 'Risolvi il tuo primo caso.', ok: s => s.solved >= 1 },
  { id: 'dieci', icon: '📁', name: 'Dieci fascicoli', desc: 'Risolvi 10 casi.', ok: s => s.solved >= 10 },
  { id: 'cinquanta', icon: '🗄️', name: 'Archivista', desc: 'Risolvi 50 casi.', ok: s => s.solved >= 50 },
  { id: 'cento', icon: '🏛️', name: 'Cento casi', desc: 'Risolvi 100 casi.', ok: s => s.solved >= 100 },
  { id: 'fiuto', icon: '✨', name: 'Fiuto infallibile', desc: 'Risolvi 5 casi senza aiuti.', ok: s => s.noHint >= 5 },
  { id: 'mente', icon: '💎', name: 'Mente brillante', desc: 'Risolvi 25 casi senza aiuti.', ok: s => s.noHint >= 25 },
  { id: 'lince', icon: '⚡', name: 'Occhio di lince', desc: 'Risolvi un caso 8×8 o più grande in meno di 3 minuti, senza aiuti.', ok: s => s.lynx },
  { id: 'giramondo', icon: '🗺️', name: 'Giramondo', desc: 'Risolvi un caso in ognuna delle 6 ambientazioni.', ok: s => s.scenarios >= 6 },
  { id: 'misure', icon: '📐', name: 'Tutte le misure', desc: 'Risolvi un caso di ogni dimensione, dal 5×5 al 14×14.', ok: s => s.sizes >= 10 },
  { id: 'gigante', icon: '🏰', name: 'Gigante', desc: 'Risolvi un caso 14×14.', ok: s => s.giant },
  { id: 'serie3', icon: '🔥', name: 'Tre giorni di fila', desc: 'Gioca 3 giorni di fila (saltarne uno non conta).', ok: s => s.streak.best >= 3 },
  { id: 'serie7', icon: '🌟', name: 'Una settimana da detective', desc: 'Gioca 7 giorni di fila (saltarne uno non conta).', ok: s => s.streak.best >= 7 },
  { id: 'giorno', icon: '📅', name: 'Caso del giorno', desc: 'Risolvi un caso del giorno nel giorno giusto.', ok: s => s.daily >= 1 },
  { id: 'abitudine', icon: '🗓️', name: 'Abitudinario', desc: 'Risolvi 10 casi del giorno.', ok: s => s.daily >= 10 },
  { id: 'squadra', icon: '🤝', name: 'Gioco di squadra', desc: 'Entra in una squadra.', ok: s => s.team },
  { id: 'tutti', icon: '🏆', name: 'Caso chiuso', desc: 'Risolvi tutti i casi dell\'archivio.', ok: s => s.total > 0 && s.solved >= s.total },
];
export const badgesOf = stats => BADGES.filter(b => b.ok(stats)).map(b => b.id);
