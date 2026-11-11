// Motore di Giallo a Quadretti: valutazione degli indizi, risolutore e generatore di casi.
// Usato dal browser (valutazione indizi) e da Node (tools/build-cases.js per pre-generare i casi).
import { ITEMS, SCENARIOS, NAMES, COLORS } from './data.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, rng) => a[Math.floor(rng() * a.length)];

export function nbrs(c, n) {
  const r = (c / n) | 0, k = c % n, o = [];
  if (r > 0) o.push(c - n); if (r < n - 1) o.push(c + n);
  if (k > 0) o.push(c - 1); if (k < n - 1) o.push(c + 1);
  return o;
}

// Calcola i dati derivati della mappa: muri di ogni casella, mobili bloccanti, finestre.
// Bit dei lati: 1 = sopra, 2 = destra, 4 = sotto, 8 = sinistra.
export function derive(P) {
  const n = P.n, N2 = n * n;
  P.wall = new Uint8Array(N2);
  P.blocked = new Uint8Array(N2);
  P.winAt = new Uint8Array(N2);
  for (let c = 0; c < N2; c++) {
    const r = (c / n) | 0, k = c % n, rm = P.room[c];
    let w = 0;
    if (r === 0 || P.room[c - n] !== rm) w |= 1;
    if (k === n - 1 || P.room[c + 1] !== rm) w |= 2;
    if (r === n - 1 || P.room[c + n] !== rm) w |= 4;
    if (k === 0 || P.room[c - 1] !== rm) w |= 8;
    P.wall[c] = w;
    const it = P.items[c];
    P.blocked[c] = it && ITEMS[it].block ? 1 : 0;
  }
  for (const [c, m] of P.win || []) P.winAt[c] = m;
  P.R = P.roomDefs.length;
  return P;
}

export const isCorner = (P, c) => { const w = P.wall[c]; return !!(w & 5) && !!(w & 10); };
export const isCenter = (P, c) => P.wall[c] === 0;

export function predOK(P, c, pr) {
  switch (pr.k) {
    case 'room': return P.room[c] === pr.r;
    case 'notroom': return P.room[c] !== pr.r;
    case 'on': return P.items[c] === pr.it;
    case 'near': return nbrs(c, P.n).some(m => P.items[m] === pr.it);
    case 'corner': return isCorner(P, c);
    case 'center': return isCenter(P, c);
    case 'window': return P.winAt[c] !== 0;
  }
  return false;
}

// true / false / null (non ancora deciso) per un indizio, dato pos[persona] = casella o -1.
export function evalClue(cl, pos, P) {
  const n = P.n;
  const a = cl.a != null ? pos[cl.a] : -1, b = cl.b != null ? pos[cl.b] : -1;
  switch (cl.t) {
    case 'u': return a < 0 ? null : cl.p.every(pr => predOK(P, a, pr));
    case 'same': return a < 0 || b < 0 ? null : P.room[a] === P.room[b];
    case 'diff': return a < 0 || b < 0 ? null : P.room[a] !== P.room[b];
    case 'diag': return a < 0 || b < 0 ? null : Math.abs(((a / n) | 0) - ((b / n) | 0)) === 1 && Math.abs((a % n) - (b % n)) === 1;
    case 'north': return a < 0 || b < 0 ? null : ((a / n) | 0) < ((b / n) | 0);
    case 'west': return a < 0 || b < 0 ? null : a % n < b % n;
    case 'alone': {
      if (a < 0) return null;
      if (pos.some((c, i) => i !== cl.a && c >= 0 && P.room[c] === P.room[a])) return false;
      return pos.every(c => c >= 0) ? true : null;
    }
    case 'empty': {
      if (pos.some(c => c >= 0 && P.room[c] === cl.r)) return false;
      return pos.every(c => c >= 0) ? true : null;
    }
    case 'count': {
      const inside = pos.filter(c => c >= 0 && P.room[c] === cl.r).length;
      const free = pos.filter(c => c < 0).length;
      if (inside > cl.k || inside + free < cl.k) return false;
      return free === 0 ? true : null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Risolutore: conta le soluzioni (fino a `limit`) con scelta della    */
/* persona più vincolata e controllo che ogni riga/colonna sia coperta. */
/* ------------------------------------------------------------------ */
export let lastNodes = 0;
export function countSolutions(P, clues, limit = 2, maxNodes = 4e6) {
  const n = P.n, N2 = n * n, V = n - 1, R = P.R;
  const maxIn = new Array(R).fill(n), exact = new Array(R).fill(-1);
  for (const cl of clues) {
    if (cl.t === 'empty') { maxIn[cl.r] = 0; exact[cl.r] = 0; }
    if (cl.t === 'count') { maxIn[cl.r] = Math.min(maxIn[cl.r], cl.k); exact[cl.r] = cl.k; }
  }
  const dom = [];
  for (let p = 0; p < n; p++) {
    const u = clues.filter(c => c.t === 'u' && c.a === p);
    const d = [];
    for (let c = 0; c < N2; c++) {
      if (P.blocked[c] || maxIn[P.room[c]] === 0) continue;
      if (u.every(cl => cl.p.every(pr => predOK(P, c, pr)))) d.push(c);
    }
    if (!d.length) return 0;
    dom.push(d);
  }
  const bin = Array.from({ length: n }, () => []);
  for (const cl of clues) {
    if (cl.t === 'same' || cl.t === 'diff' || cl.t === 'diag' || cl.t === 'north' || cl.t === 'west') {
      bin[cl.a].push(cl); bin[cl.b].push(cl);
    }
  }
  const alone = new Uint8Array(n);
  for (const cl of clues) if (cl.t === 'alone') alone[cl.a] = 1;

  const pos = new Int16Array(n).fill(-1);
  const roomCnt = new Int8Array(R), aloneIn = new Int8Array(R);
  let rowMask = 0, colMask = 0, placed = 0, count = 0, nodes = 0, aborted = false;
  const full = (1 << n) - 1;

  const ok = (p, c) => {
    const r = (c / n) | 0, k = c % n;
    if (rowMask & (1 << r) || colMask & (1 << k)) return false;
    const rm = P.room[c];
    if (roomCnt[rm] + 1 > maxIn[rm]) return false;
    if (aloneIn[rm]) return false;
    if (alone[p] && roomCnt[rm] > 0) return false;
    if (p === V) { if (roomCnt[rm] + 1 > 2) return false; }
    else if (pos[V] >= 0 && P.room[pos[V]] === rm && roomCnt[rm] + 1 > 2) return false;
    for (const cl of bin[p]) {
      const q = cl.a === p ? cl.b : cl.a, cq = pos[q];
      if (cq < 0) continue;
      const ca = cl.a === p ? c : cq, cb = cl.a === p ? cq : c;
      switch (cl.t) {
        case 'same': if (P.room[ca] !== P.room[cb]) return false; break;
        case 'diff': if (P.room[ca] === P.room[cb]) return false; break;
        case 'diag': if (Math.abs(((ca / n) | 0) - ((cb / n) | 0)) !== 1 || Math.abs((ca % n) - (cb % n)) !== 1) return false; break;
        case 'north': if (((ca / n) | 0) >= ((cb / n) | 0)) return false; break;
        case 'west': if (ca % n >= cb % n) return false; break;
      }
    }
    return true;
  };

  const rec = () => {
    if (++nodes > maxNodes) { aborted = true; return true; }
    if (placed === n) {
      for (let r = 0; r < R; r++) if (exact[r] >= 0 && roomCnt[r] !== exact[r]) return false;
      if (roomCnt[P.room[pos[V]]] !== 2) return false;
      count++;
      return count >= limit;
    }
    let best = -1, bestList = null, rowCov = 0, colCov = 0;
    for (let p = 0; p < n; p++) {
      if (pos[p] >= 0) continue;
      const list = [];
      for (const c of dom[p]) if (ok(p, c)) { list.push(c); rowCov |= 1 << ((c / n) | 0); colCov |= 1 << (c % n); }
      if (!list.length) return false;
      if (!bestList || list.length < bestList.length) { best = p; bestList = list; }
    }
    if ((rowCov | rowMask) !== full || (colCov | colMask) !== full) return false;
    const p = best;
    for (const c of bestList) {
      const r = (c / n) | 0, k = c % n, rm = P.room[c];
      pos[p] = c; rowMask |= 1 << r; colMask |= 1 << k; roomCnt[rm]++; if (alone[p]) aloneIn[rm] = 1; placed++;
      const stop = rec();
      pos[p] = -1; rowMask &= ~(1 << r); colMask &= ~(1 << k); roomCnt[rm]--; if (alone[p]) aloneIn[rm] = 0; placed--;
      if (stop) return true;
    }
    return false;
  };
  rec();
  lastNodes = nodes;
  return aborted ? -1 : count;
}

/* ------------------------------------------------------------------ */
/* Generatore                                                          */
/* ------------------------------------------------------------------ */
function makeRooms(n, rng) {
  const target = Math.min(16, Math.max(3, Math.round((n * n) / (5 + 0.6 * n))));
  const merges = n >= 7 ? Math.floor(rng() * Math.max(1, n / 4)) + 1 : rng() < 0.5 ? 1 : 0;
  let rects = [{ x: 0, y: 0, w: n, h: n }];
  let guard = 0;
  while (rects.length < target + merges && guard++ < 200) {
    const cands = rects.filter(r => r.w >= 4 || r.h >= 4);
    if (!cands.length) break;
    let tot = cands.reduce((s, r) => s + r.w * r.h * r.w * r.h, 0), x = rng() * tot, R = cands[0];
    for (const r of cands) { x -= r.w * r.h * r.w * r.h; if (x <= 0) { R = r; break; } }
    const vert = R.w >= 4 && (R.h < 4 || R.w > R.h || (R.w === R.h && rng() < 0.5));
    rects = rects.filter(r => r !== R);
    if (vert) { const s = 2 + Math.floor(rng() * (R.w - 3)); rects.push({ x: R.x, y: R.y, w: s, h: R.h }, { x: R.x + s, y: R.y, w: R.w - s, h: R.h }); }
    else { const s = 2 + Math.floor(rng() * (R.h - 3)); rects.push({ x: R.x, y: R.y, w: R.w, h: s }, { x: R.x, y: R.y + s, w: R.w, h: R.h - s }); }
  }
  const room = new Array(n * n).fill(-1);
  rects.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) room[y * n + x] = i; });
  // unisci qualche coppia di stanze vicine per avere forme a L e a T
  let ids = rects.map((_, i) => i);
  const size = id => room.filter(v => v === id).length;
  const avg = (n * n) / Math.max(1, target);
  for (let m = 0; m < merges; m++) {
    const pairs = [];
    for (let c = 0; c < n * n; c++) for (const d of nbrs(c, n)) if (room[d] !== room[c] && room[c] < room[d]) pairs.push([room[c], room[d]]);
    const ok = shuffle(pairs, rng).find(([a, b]) => size(a) + size(b) <= avg * 1.9);
    if (!ok) break;
    const [a, b] = ok;
    for (let c = 0; c < n * n; c++) if (room[c] === b) room[c] = a;
  }
  const uniq = [...new Set(room)];
  return { room: room.map(v => uniq.indexOf(v)), R: uniq.length };
}

function placeFurniture(n, room, R, defs, rng) {
  const items = new Array(n * n).fill(null);
  const tmp = { n, room, items, roomDefs: defs };
  derive(tmp);
  for (let r = 0; r < R; r++) {
    const cells = [];
    for (let c = 0; c < n * n; c++) if (room[c] === r) cells.push(c);
    const area = cells.length;
    const nb = Math.max(area >= 4 ? 1 : 0, Math.round(area * (0.14 + rng() * 0.1)));
    const ns = Math.max(1, Math.round(area * (0.12 + rng() * 0.1)));
    const wallCells = shuffle(cells.filter(c => tmp.wall[c]), rng);
    const inner = shuffle(cells.filter(c => !tmp.wall[c]), rng);
    const order = [...wallCells, ...inner];
    let b = 0;
    for (const c of order) { if (b >= nb) break; if (rng() < 0.85 || !tmp.wall[c]) { items[c] = pick(defs[r].block, rng); b++; } }
    let s = 0;
    for (const c of shuffle([...cells], rng)) { if (s >= ns) break; if (!items[c]) { items[c] = pick(defs[r].stand, rng); s++; } }
    const free = cells.filter(c => !(items[c] && ITEMS[items[c]].block)).length;
    if (free < Math.max(2, Math.ceil(area * 0.45))) return null;
  }
  return items;
}

function placeWindows(n, room, items, rng) {
  const win = [];
  const sides = [];
  for (let k = 0; k < n; k++) { sides.push([k, 1], [(n - 1) * n + k, 4], [k * n, 8], [k * n + n - 1, 2]); }
  for (const [c, m] of shuffle(sides, rng)) {
    if (rng() < 0.22) { const e = win.find(w => w[0] === c); if (e) e[1] |= m; else win.push([c, m]); }
  }
  return win;
}

function randomSolution(n, blocked, rng) {
  const cols = new Array(n).fill(-1), used = new Uint8Array(n);
  let steps = 0;
  const rec = r => {
    if (r === n) return true;
    if (++steps > 20000) return false;
    for (const k of shuffle([...Array(n).keys()], rng)) {
      if (used[k] || blocked[r * n + k]) continue;
      used[k] = 1; cols[r] = k;
      if (rec(r + 1)) return true;
      used[k] = 0;
    }
    return false;
  };
  return rec(0) ? cols.map((k, r) => r * n + k) : null;
}

function makeCast(sc, n, rng) {
  const used = new Set();
  const nameFor = g => {
    const opts = shuffle([...NAMES[g]], rng).filter(x => !used.has(x[0]));
    const nm = opts[0]; used.add(nm[0]); return nm;
  };
  const vRole = pick(sc.victims, rng).split(':');
  const roles = shuffle([...sc.roles], rng).slice(0, n - 1).map(s => s.split(':'));
  const colors = shuffle([...COLORS], rng);
  const victim = { g: vRole[0], role: vRole[1], victim: true, color: '#ffffff' };
  victim.name = nameFor(victim.g);
  const suspects = roles.map(([g, role], i) => ({ g, role, victim: false, color: colors[i], name: nameFor(g) }));
  suspects.sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return [...suspects, victim].map(p => ({ ...p, init: p.name[0] }));
}

const W = {
  room: 2.2, roomCorner: 3, roomCenter: 2, roomWindow: 2.6, roomOn: 3, roomNear: 3,
  on: 2.4, onNear: 3, near: 2.4, corner: 1.3, cornerNear: 2.6, window: 1.6, center: 1.3, notroom: 1.2,
  same: 2.2, diff: 1, diag: 2.2, north: 0.8, west: 0.8, alone: 2.2, empty: 2.2, count: 1.8,
};

function buildPool(P, rng) {
  const n = P.n, pos = P.sol, V = n - 1, M = P.murderer, pool = [];
  const add = (kind, cl) => { cl.w = W[kind]; cl.kind = kind; pool.push(cl); };
  const roomCnt = new Array(P.R).fill(0); pos.forEach(c => roomCnt[P.room[c]]++);
  for (let p = 0; p < n; p++) {
    const c = pos[p], rm = { k: 'room', r: P.room[c] };
    const it = P.items[c];
    const near = [...new Set(nbrs(c, n).map(m => P.items[m]).filter(Boolean))];
    const nearP = near.length ? { k: 'near', it: pick(near, rng) } : null;
    add('room', { t: 'u', a: p, p: [rm] });
    if (isCorner(P, c)) { add('roomCorner', { t: 'u', a: p, p: [rm, { k: 'corner' }] }); add('corner', { t: 'u', a: p, p: [{ k: 'corner' }] }); if (nearP) add('cornerNear', { t: 'u', a: p, p: [{ k: 'corner' }, nearP] }); }
    if (isCenter(P, c)) { add('roomCenter', { t: 'u', a: p, p: [rm, { k: 'center' }] }); add('center', { t: 'u', a: p, p: [{ k: 'center' }] }); }
    if (P.winAt[c]) { add('roomWindow', { t: 'u', a: p, p: [rm, { k: 'window' }] }); add('window', { t: 'u', a: p, p: [{ k: 'window' }] }); }
    if (it) {
      add('roomOn', { t: 'u', a: p, p: [rm, { k: 'on', it }] });
      add('on', { t: 'u', a: p, p: [{ k: 'on', it }] });
      const nn = near.filter(x => x !== it);
      if (nn.length) add('onNear', { t: 'u', a: p, p: [{ k: 'on', it }, { k: 'near', it: pick(nn, rng) }] });
    }
    for (const nt of near) add('near', { t: 'u', a: p, p: [{ k: 'near', it: nt }] });
    if (nearP) add('roomNear', { t: 'u', a: p, p: [rm, nearP] });
    shuffle([...Array(P.R).keys()].filter(r => r !== P.room[c]), rng).slice(0, 2).forEach(r => add('notroom', { t: 'u', a: p, p: [{ k: 'notroom', r }] }));
    if (roomCnt[P.room[c]] === 1) add('alone', { t: 'alone', a: p });
  }
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
    const cp = pos[p], cq = pos[q], [a, b] = rng() < 0.5 ? [p, q] : [q, p];
    if (P.room[cp] === P.room[cq]) { if (!((p === V && q === M) || (p === M && q === V))) add('same', { t: 'same', a, b, v: Math.floor(rng() * 3) }); }
    else if (rng() < 0.35) add('diff', { t: 'diff', a, b, v: Math.floor(rng() * 2) });
    if (Math.abs(((cp / n) | 0) - ((cq / n) | 0)) === 1 && Math.abs((cp % n) - (cq % n)) === 1 && !((p === V && q === M) || (p === M && q === V))) add('diag', { t: 'diag', a, b });
    if (rng() < 0.25) { const [x, y] = ((cp / n) | 0) < ((cq / n) | 0) ? [p, q] : [q, p]; add('north', { t: 'north', a: x, b: y }); }
    if (rng() < 0.25) { const [x, y] = cp % n < cq % n ? [p, q] : [q, p]; add('west', { t: 'west', a: x, b: y }); }
  }
  for (let r = 0; r < P.R; r++) {
    if (!roomCnt[r]) add('empty', { t: 'empty', r, v: Math.floor(rng() * 2) });
    else if (roomCnt[r] >= 2 && rng() < 0.5 && r !== P.room[pos[V]]) add('count', { t: 'count', r, k: roomCnt[r] });
  }
  return pool;
}

function chooseClues(P, rng) {
  const pool = buildPool(P, rng);
  pool.forEach(c => (c.key = Math.pow(rng(), 1 / c.w)));
  pool.sort((a, b) => b.key - a.key);
  // non più di 2 indizi per persona nella prima passata, per variare
  const chosen = [];
  let ok = false;
  for (const cl of pool) {
    chosen.push(cl);
    if (chosen.length >= Math.max(3, P.n - 2) && countSolutions(P, chosen, 2, 3e5) === 1) { ok = true; break; }
  }
  if (!ok) return null;
  // togli quelli superflui, prima i più deboli
  const order = shuffle([...chosen], rng).sort((a, b) => a.w - b.w);
  let cur = [...chosen];
  for (const cl of order) {
    const t = cur.filter(x => x !== cl);
    if (countSolutions(P, t, 2, 3e5) === 1) cur = t;
  }
  // ogni personaggio deve comparire in almeno un indizio
  const mentioned = new Set(cur.flatMap(c => [c.a, c.b]).filter(x => x != null));
  const soft = ['near', 'on', 'onNear', 'window', 'corner', 'notroom', 'cornerNear', 'center'];
  for (let p = 0; p < P.n; p++) {
    if (mentioned.has(p)) continue;
    const opts = pool.filter(c => c.t === 'u' && c.a === p && soft.includes(c.kind));
    const extra = opts.length ? pick(opts, rng) : pool.find(c => c.t === 'u' && c.a === p);
    if (extra) cur.push(extra);
  }
  if (countSolutions(P, cur, 2, 5e6) !== 1) return null;
  const effort = lastNodes;
  P.effort = effort;
  return cur.map(({ key, w, kind, ...c }) => c);
}

export function generateCase(n, seed) {
  const rng = mulberry32(seed * 7919 + n * 104729 + 17);
  for (let attempt = 0; attempt < 300; attempt++) {
    const scIdx = Math.floor(rng() * SCENARIOS.length);
    const sc = SCENARIOS[scIdx];
    const { room, R } = makeRooms(n, rng);
    if (R > sc.rooms.length) continue;
    const roomIdx = shuffle([...Array(sc.rooms.length).keys()], rng).slice(0, R);
    const defs = roomIdx.map(i => sc.rooms[i]);
    const items = placeFurniture(n, room, R, defs, rng);
    if (!items) continue;
    const win = placeWindows(n, room, items, rng);
    const P = derive({ n, room, items, win, roomDefs: defs });
    let sol = null, murderer = -1;
    for (let t = 0; t < 40 && !sol; t++) {
      const cells = randomSolution(n, P.blocked, rng);
      if (!cells) break;
      const byRoom = {};
      cells.forEach(c => (byRoom[room[c]] = byRoom[room[c]] || []).push(c));
      const pairs = Object.values(byRoom).filter(v => v.length === 2);
      if (!pairs.length) continue;
      const pair = shuffle([...pick(pairs, rng)], rng);
      const rest = shuffle(cells.filter(c => !pair.includes(c)), rng);
      murderer = Math.floor(rng() * (n - 1));
      sol = new Array(n); sol[n - 1] = pair[0]; sol[murderer] = pair[1];
      let j = 0; for (let p = 0; p < n - 1; p++) if (p !== murderer) sol[p] = rest[j++];
    }
    if (!sol) continue;
    P.sol = sol; P.murderer = murderer;
    const clues = chooseClues(P, rng);
    if (!clues) continue;
    const persons = makeCast(sc, n, rng);
    return {
      n, sc: scIdx, rooms: roomIdx,
      room: room.map(v => v.toString(36)).join(''),
      items: items.map((it, c) => (it ? [c, it] : null)).filter(Boolean),
      win, persons, sol, m: murderer, clues, effort: P.effort,
      story: { intro: Math.floor(rng() * sc.intros.length), weapon: Math.floor(rng() * sc.weapons.length), epi: Math.floor(rng() * sc.epilogues.length) },
    };
  }
  return null;
}

// Ricostruisce l'oggetto di gioco a partire da un caso salvato in JSON.
export function hydrate(C) {
  const sc = SCENARIOS[C.sc];
  const n = C.n;
  const items = new Array(n * n).fill(null);
  for (const [c, it] of C.items) items[c] = it;
  const P = {
    ...C, sc, items,
    room: [...C.room].map(ch => parseInt(ch, 36)),
    roomDefs: C.rooms.map(i => sc.rooms[i]),
    murderer: C.m,
  };
  return derive(P);
}
