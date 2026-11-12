import { ITEMS, ICONS, SCENARIOS, TIERS, SIZES } from './data.js';
import { hydrate, evalClue } from './engine.js';
import { starsOf } from './gamify.js';
import { face } from './faces.js';
import * as acc from './account.js';
import { initProfile } from './profile.js';

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage non disponibile */ } },
};
const oa = g => (g === 'f' ? 'a' : 'o');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const NUM = ['zero', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei'];
const svg = (t, cls = '') => `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true">${ICONS[t]}</svg>`;
const phone = matchMedia('(max-width: 900px)'); // sotto questa larghezza: due schede (Mappa | Indizi)
const where = () => (phone.matches ? 'qui sotto' : 'a destra');
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ---------------- archivio ---------------- */
// cases/index.json: per ogni dimensione l'elenco [impronta, ambientazione] dei casi. Ogni caso è un file a sé
// (cases/<n>/<i>.json) e si scarica solo quando lo apri.
const cache = {};
async function loadCase(id) {
  if (!cache[id]) {
    const [n, i] = id.split('-').map(Number);
    const res = await fetch(`cases/${n}/${i}.json`);
    if (!res.ok) throw new Error('Caso non trovato');
    cache[id] = await res.json();
  }
  return cache[id];
}
let INDEX = SIZES.map(n => ({ n, count: 0, cases: [] }));
let CASES = []; // [impronta, dimensione, ambientazione, id] in ordine di archivio
async function loadIndex() {
  // no-cache: l'indice è piccolo e deve essere sempre quello attuale (dopo una rigenerazione cambia formato e contenuto)
  try { const r = await fetch('cases/index.json', { cache: 'no-cache' }); if (r.ok) { const x = await r.json(); if (x.every(y => Array.isArray(y.cases))) INDEX = x; } } catch (e) { /* uso il default */ }
  CASES = INDEX.flatMap(x => x.cases.map(([k, sc], i) => [k, x.n, sc, `${x.n}-${i + 1}`]));
}
// I progressi sono legati all'impronta del caso (key), non al numero: se l'archivio cambia, non si mescolano.
// Ogni detective ha i suoi salvataggi (acc.ns): l'ospite usa le chiavi storiche gq3:...
const solvedSet = () => new Set(store.get(acc.ns('solved'), []));
const metaOf = id => { const [n, i] = id.split('-').map(Number); const x = INDEX.find(y => y.n === n); return x && x.cases[i - 1] ? { key: x.cases[i - 1][0], sc: x.cases[i - 1][1] } : null; };
const keyOf = id => { const m = metaOf(id); return m ? m.key : null; };
function markSolved(key, hints, secs) {
  const solved = store.get(acc.ns('solved'), []);
  if (!solved.includes(key)) { solved.push(key); store.set(acc.ns('solved'), solved); }
  const stars = store.get(acc.ns('stars'), {});
  stars[key] = Math.max(stars[key] || 0, starsOf(hints));
  store.set(acc.ns('stars'), stars);
  if (acc.active()) { acc.queueSolve({ key, hints, secs }); return acc.flush(); }
  return Promise.resolve(null);
}
const allIds = () => INDEX.flatMap(x => Array.from({ length: x.count }, (_, i) => `${x.n}-${i + 1}`));
function nextUnsolved(fromId) {
  const all = allIds(), solved = solvedSet(), k = Math.max(0, all.indexOf(fromId));
  const todo = id => !solved.has(keyOf(id));
  return all.slice(k + 1).find(todo) || all.find(todo) || null;
}

/* ---------------- stato ---------------- */
let S = null;
const helpersOn = () => store.get('gq3:helpers', false);
const isOpen = k => store.get(`gq3:${k}`, true); // fascicolo e legenda aperti o richiusi
const saveKey = () => acc.ns(`case:${S.key}`);
function save() {
  store.set(saveKey(), { place: S.place, marks: [...S.marks], hints: S.hints, elapsed: S.elapsed, solved: S.solved, accused: S.accused, struck: [...S.struck] });
}

async function openCase(id) {
  const [n, i] = id.split('-').map(Number);
  if (!metaOf(id)) { if (id !== '5-1') openCase('5-1'); return; }
  let C;
  try { C = await loadCase(id); } catch (e) { setStatus("Non riesco a caricare il caso. Controlla la connessione e ricarica la pagina.", 'ko'); return; }
  const P = hydrate(C);
  S = { id, key: C.key, n, idx: i, P, place: new Array(P.n).fill(-1), marks: new Set(), sel: null, mode: 'place', hist: [], hints: 0, elapsed: 0, solved: false, struck: new Set(), hintCell: -1, resetArm: false, accused: false, focus: null, moved: -1 };
  const saved = store.get(saveKey(), null);
  if (saved && Array.isArray(saved.place) && saved.place.length === P.n) {
    Object.assign(S, { place: saved.place, marks: new Set(saved.marks || []), hints: saved.hints || 0, elapsed: saved.elapsed || 0, solved: !!saved.solved, accused: !!saved.accused, struck: new Set(saved.struck || []) });
  }
  // un caso risolto resta sempre con la soluzione sulla mappa
  if (solvedSet().has(C.key) || S.solved) {
    Object.assign(S, { place: [...P.sol], marks: new Set(), solved: true });
    if (solvedSet().has(C.key)) S.accused = true;
  }
  store.set('gq2:last', id);
  if (location.hash.slice(1) !== `caso-${id}`) { try { history.replaceState(null, '', `#caso-${id}`); } catch (e) { /* ok */ } }
  document.title = `${P.sc.title} · Twindoku: Cold Case`;
  renderAll();
  if (S.solved && S.accused) setStatus(solvedMsg(), 'ok');
  else if (S.solved) setStatus(ACCUSE_MSG, 'ok');
  else setStatus(`Scegli una persona ${where()}, poi tocca la casella dove si trovava.`);
}

/* ---------------- testi ---------------- */
function chip(i) {
  const p = S.P.persons[i];
  return `<b class="chip${p.victim ? ' vic' : ''}" style="--c:${p.color}">${p.name}</b>`;
}
const rchip = (r, field) => { const d = S.P.roomDefs[r]; return `<span class="rchip" style="--floor:${d.floor}">${d[field]}</span>`; };
// "a" + articolo: al biliardo, ai fornelli, allo sgabello...
const accanto = art => 'accanto ' + art.replace(/^il /, 'al ').replace(/^i /, 'ai ').replace(/^lo /, 'allo ').replace(/^la /, 'alla ').replace(/^l'/, "all'").replace(/^(un|una|uno|un') ?/, m => 'a ' + m);
const ichip = (it, txt) => `<span class="ichip">${svg(it)}${txt}</span>`;

function clueHTML(cl) {
  const P = S.P;
  const A = cl.a != null ? chip(cl.a) : '', B = cl.b != null ? chip(cl.b) : '';
  const g = cl.a != null ? P.persons[cl.a].g : 'm';
  if (cl.t === 'u') {
    const f = k => cl.p.find(x => x.k === k);
    const room = f('room'), not = f('notroom'), on = f('on'), near = f('near');
    const onTxt = on ? ichip(on.it, ITEMS[on.it].on(g)) : '';
    const nearTxt = near ? ichip(near.it, accanto(ITEMS[near.it].art)) : '';
    if (not) return `${A} non era ${rchip(not.r, 'in')}.`;
    if (room) {
      if (f('corner')) return `${A} era in un angolo ${rchip(room.r, 'di')}.`;
      if (f('center')) return `${A} era al centro ${rchip(room.r, 'di')}, lontano dai muri.`;
      if (f('window')) return `${A} era ${rchip(room.r, 'in')}, vicino a una finestra.`;
      if (on) return `${A} era ${rchip(room.r, 'in')}, ${onTxt}.`;
      if (near) return `${A} era ${rchip(room.r, 'in')}, ${nearTxt}.`;
      return `${A} era ${rchip(room.r, 'in')}.`;
    }
    if (on && near) return `${A} era ${onTxt}, ${nearTxt}.`;
    if (f('corner') && near) return `${A} se ne stava in un angolo, ${nearTxt}.`;
    if (on) return `${A} era ${onTxt}.`;
    if (near) return `${A} era ${nearTxt}.`;
    if (f('corner')) return `${A} se ne stava in un angolo di una stanza.`;
    if (f('window')) return `${A} guardava fuori da una finestra.`;
    if (f('center')) return `${A} era al centro di una stanza, lontano dai muri.`;
  }
  switch (cl.t) {
    case 'same': return [`${A} e ${B} erano nella stessa stanza.`, `${A} stava chiacchierando con ${B}.`, `${A} e ${B} stavano litigando nella stessa stanza.`][cl.v || 0];
    case 'diff': return [`${A} e ${B} erano in stanze diverse.`, `${A} e ${B} avevano litigato e stavano in stanze diverse.`][cl.v || 0];
    case 'diag': return `${A} e ${B} erano nella stessa stanza, vicinissim${P.persons[cl.a].g === 'f' && P.persons[cl.b].g === 'f' ? 'e' : 'i'} in diagonale.`;
    case 'north': return `${A} era più a nord di ${B}.`;
    case 'west': return `${A} era più a ovest di ${B}.`;
    case 'alone': return `${A} era da sol${oa(g)} nella sua stanza.`;
    case 'empty': return cl.v ? `Quella sera ${rchip(cl.r, 'in')} non c'era nessuno.` : `Nessuno è entrato ${rchip(cl.r, 'in')}.`;
    case 'count': { const d = P.roomDefs[cl.r]; return `<span class="rchip" style="--floor:${d.floor}">${cap(d.in)}</span> c'erano esattamente ${NUM[cl.k] || cl.k} persone.`; }
  }
  return '';
}
function fill(tpl, P) {
  const V = P.persons[P.n - 1], M = P.persons[P.murderer];
  return tpl
    .replaceAll('{V}', chip(P.n - 1)).replaceAll('{VR}', V.role).replaceAll('{o}', oa(V.g))
    .replaceAll('{M}', chip(P.murderer)).replaceAll('{MR}', M.role).replaceAll('{mo}', oa(M.g)).replaceAll('{lui}', M.g === 'f' ? 'lei' : 'lui');
}

/* ---------------- render ---------------- */
function renderAll() { renderStory(); renderBoard(); renderTray(); renderClues(); renderLegend(); renderTools(); renderMeta(); fitCast(); }
function renderMeta() {
  $('#timer').textContent = fmt(S.elapsed);
  $('#hintsUsed').textContent = S.hints;
  const all = allIds();
  const k = all.indexOf(S.id);
  $('#prevCase').disabled = k <= 0;
  $('#nextCase').disabled = k < 0 || k >= all.length - 1;
}
function renderStory() {
  const P = S.P, sc = P.sc, el = $('#story'), open = isOpen('storyOpen');
  el.style.setProperty('--sc', sc.color);
  el.classList.toggle('shut', !open);
  el.innerHTML = `<button type="button" class="acc" aria-expanded="${open}" aria-controls="storyBody"><span><span class="eyebrow"><b>Caso ${S.n}×${S.n} n° ${S.idx}</b><span>${TIERS[S.n]}</span><span>${sc.place}</span>${solvedSet().has(S.key) ? '<span class="solvedtag">✓ Risolto</span>' : ''}</span><h1>${sc.title}</h1></span><span class="chev" aria-hidden="true">▼</span></button>
    <div class="body" id="storyBody"><p class="intro">${fill(sc.intros[P.story.intro], P)}</p><p class="weapon">Accanto alla vittima: <b>${sc.weapons[P.story.weapon]}</b>.</p></div>`;
}
function conflicts() {
  const n = S.P.n, bad = new Set();
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
    const a = S.place[p], b = S.place[q];
    if (a < 0 || b < 0) continue;
    if (((a / n) | 0) === ((b / n) | 0) || a % n === b % n) { bad.add(p); bad.add(q); }
  }
  return bad;
}
function labelCells(P) {
  if (P._labels) return P._labels;
  const n = P.n, lab = {};
  for (let r = 0; r < P.R; r++) {
    let best = -1, bestSpan = 0;
    for (let c = 0; c < n * n; c++) {
      if (P.room[c] !== r) continue;
      let span = 0; while (c % n + span < n && P.room[c + span] === r) span++;
      const score = span * 10 - ((c / n) | 0) * 3 - (P.items[c] && ITEMS[P.items[c]].block ? 4 : 0);
      if (best < 0 || score > bestSpan) { best = c; bestSpan = score; }
      if (best >= 0 && ((c / n) | 0) > ((best / n) | 0) + 1) break;
    }
    let span = 0; while (best % n + span < n && P.room[best + span] === r) span++;
    lab[best] = { r, span };
  }
  return (P._labels = lab);
}
function renderBoard() {
  const P = S.P, n = P.n, b = $('#board'), help = helpersOn();
  b.style.setProperty('--n', n);
  b.classList.toggle('done', S.solved);
  // lente su un indizio: si accendono la stanza e gli oggetti di cui parla (non la casella giusta)
  const fc = S.focus != null && !S.solved ? P.clues[S.focus] : null;
  b.classList.toggle('focusing', !!fc);
  const f = k => fc && fc.p && fc.p.find(x => x.k === k);
  const fRoom = fc ? (f('room') ? f('room').r : fc.r != null ? fc.r : null) : null, fNot = f('notroom'), fIt = f('on') || f('near');
  const crimeRoom = S.solved && S.accused ? P.room[P.sol[P.n - 1]] : -1;
  const rowOcc = new Array(n).fill(false), colOcc = new Array(n).fill(false);
  S.place.forEach(c => { if (c >= 0) { rowOcc[(c / n) | 0] = true; colOcc[c % n] = true; } });
  const bad = conflicts(), labels = labelCells(P);
  let h = '';
  for (let c = 0; c < n * n; c++) {
    const r = (c / n) | 0, k = c % n, rm = P.room[c], D = P.roomDefs[rm], it = P.items[c], occ = S.place.indexOf(c), w = P.wall[c];
    const cls = ['cell'];
    if (w & 1) cls.push('wt'); if (w & 2) cls.push('wr'); if (w & 4) cls.push('wb'); if (w & 8) cls.push('wl');
    if (it) { cls.push(ITEMS[it].block ? 'blocked' : 'stand'); if (it === 'tappeto') cls.push('rug'); }
    if (labels[c]) cls.push('haslab');
    const shaded = help && !S.solved && occ < 0 && (rowOcc[r] || colOcc[k]);
    if (shaded) cls.push('shade');
    if (S.sel != null && !S.solved && S.mode === 'place' && occ < 0 && !P.blocked[c] && !shaded && !S.marks.has(c)) cls.push('free');
    if (occ >= 0) cls.push('occ');
    if (S.hintCell === c) cls.push('hint');
    if (rm === crimeRoom) cls.push('crime');
    if (S.sel != null && occ === S.sel) cls.push('focus');
    if (fc) {
      if (fRoom != null ? rm === fRoom : fNot ? rm !== fNot.r : true) cls.push('lit');
      if (fNot && rm === fNot.r && !P.blocked[c]) cls.push('ban');
      if (fIt && it === fIt.it && (fRoom == null || rm === fRoom)) cls.push('itlit', 'lit');
      if (occ >= 0 && (occ === fc.a || occ === fc.b)) cls.push('lit');
    }
    let inner = '';
    if (it) inner += svg(it, 'it');
    const wm = P.winAt[c];
    if (wm & 1) inner += '<i class="win t"></i>'; if (wm & 2) inner += '<i class="win r"></i>';
    if (wm & 4) inner += '<i class="win b"></i>'; if (wm & 8) inner += '<i class="win l"></i>';
    if (labels[c]) inner += `<span class="rlab" style="--span:${labels[c].span}"><span>${D.name}</span></span>`;
    if (occ >= 0) { const p = P.persons[occ]; inner += `<span class="tok${p.victim ? ' vic' : ''}${bad.has(occ) ? ' bad' : ''}" style="--c:${p.color}${S.moved === occ || bad.has(occ) ? '' : ';animation:none'}"><span class="ph">${face(p)}</span></span><span class="tn${p.victim ? ' vic' : ''}" style="--c:${p.color}">${p.name}</span>`; }
    else if (S.marks.has(c)) inner += '<span class="mark">✕</span>';
    const lbl = `${D.name}${it ? ', ' + ITEMS[it].label : ''}${occ >= 0 ? ', ' + P.persons[occ].name : ''}${occ < 0 && S.marks.has(c) ? ', segnata con una X' : ''}`;
    h += `<button type="button" class="${cls.join(' ')}" style="--floor:${D.floor}" data-c="${c}" data-r="${rm}" title="${lbl}" aria-label="Riga ${r + 1}, colonna ${k + 1}: ${lbl}">${inner}</button>`;
  }
  b.innerHTML = h; S.moved = -1;
}
function renderTray() {
  const P = S.P, fc = S.focus != null && !S.solved ? P.clues[S.focus] : null;
  $('#tray').innerHTML = P.persons.map((p, i) => `<button type="button" class="person${S.place[i] >= 0 ? ' placed' : ''}${p.victim ? ' vic' : ''}${fc && (fc.a === i || fc.b === i) ? ' cited' : ''}" data-p="${i}" aria-pressed="${S.sel === i}" style="--c:${p.color}" title="${p.name}, ${p.role}${p.victim ? ' (vittima)' : ''}">
    <span class="ph">${face(p)}</span><span class="nm"><b>${p.name}</b><small>${p.role}</small></span></button>`).join('');
  $('#pips').innerHTML = P.persons.map((p, i) => `<i class="${S.place[i] >= 0 ? 'on' : ''}" style="--c:${p.victim ? '#b5283c' : p.color}"></i>`).join('');
  $('#found').textContent = `${S.place.filter(c => c >= 0).length} su ${P.n} sistemati`;
}
// Sceglie colonne e misura delle foto perché le persone stiano tutte nello spazio che c'è:
// foto con ruolo → foto più piccole → foto mini con il nome accanto → solo nomi.
function fitCast() {
  if (!S) return;
  const el = $('#tray'), N = S.P.n, set = (cls, vars) => { el.className = 'tray ' + cls; for (const k in vars) el.style.setProperty(k, vars[k]); };
  if (phone.matches) return set('m-dock', { '--k': Math.ceil(N / (N > 7 ? 2 : 1)), '--gap': '4px' });
  const W = el.clientWidth - 6, H = el.clientHeight - 6, g = 8;
  if (W < 40 || H < 40) return;
  let best = null;
  for (let k = 1; k <= 6; k++) {
    const rows = Math.ceil(N / k), cw = (W - (k - 1) * g) / k, ch = (H - (rows - 1) * g) / rows;
    for (const role of [1, 0]) {
      const pw = Math.floor(Math.min(cw - 14, (ch - (role ? 41 : 27) - 9) * 1.25, 150));
      if (pw < (role ? 88 : 38)) continue;
      const score = pw + (role ? 30 : 0);
      if (!best || score > best.score) best = { k, pw, role, score };
    }
  }
  if (best) return set('m-photo' + (best.role ? ' role' : '') + (best.pw < 70 ? ' tiny' : ''), { '--k': best.k, '--gap': g + 'px', '--cw': best.pw + 10 + 'px', '--phh': Math.round(best.pw * .8) + 'px', '--nf': Math.max(12.5, Math.min(18, best.pw * .2)) + 'px', '--sf': Math.max(8, Math.min(12, best.pw * .11)) + 'px' });
  for (let k = 1; k <= 4; k++) { const rows = Math.ceil(N / k); if ((W - (k - 1) * 6) / k >= 84 && rows * 34 + (rows - 1) * 6 <= H) return set('m-mini', { '--k': k, '--gap': '6px' }); }
  for (let k = 2; k <= 5; k++) { const rows = Math.ceil(N / k); if ((W - (k - 1) * 5) / k >= 58 && rows * 25 + (rows - 1) * 5 <= H) return set('m-name', { '--k': k, '--gap': '5px' }); }
  set('m-name scroll', { '--k': Math.max(2, Math.floor(W / 70)), '--gap': '5px' });
}
// Indizi. Tocco = "messo da parte" (S.struck): scende in fondo ma resta leggibile. Con gli aiutini accesi
// scendono da soli anche quelli rispettati (verdi). Gli indizi della persona scelta si mettono in evidenza.
let lastSel = null;
function renderClues(force) {
  const P = S.P;
  $('#helpers').checked = helpersOn();
  // aiutini spenti: niente colori, tranne quando la mappa è piena e sbagliata
  const show = helpersOn() || force || (!S.solved && S.place.every(c => c >= 0));
  // ordina: prima per persona (come nella lista delle persone), poi gli indizi sulle stanze
  const rows = P.clues.map((cl, i) => ({ cl, i, key: cl.a != null ? cl.a : 99 })).sort((x, y) => x.key - y.key || x.i - y.i)
    .map(r => { const v = show ? evalClue(r.cl, S.place, P) : null, aside = S.struck.has(r.i); return { ...r, v, aside, done: aside || (helpersOn() && v === true), mine: S.sel != null && (r.cl.a === S.sel || r.cl.b === S.sel) }; });
  const sp = S.sel != null ? P.persons[S.sel] : null, pc = sp ? (sp.victim ? '#b5283c' : sp.color) : '';
  const li = ({ cl, i, v, aside, done, mine }) => `<li tabindex="0" data-i="${i}" class="clue${v === true ? ' yes' : v === false ? ' no' : ''}${aside ? ' aside' : ''}${done ? ' done' : ''}${S.focus === i ? ' focus' : ''}${mine ? ' mine' : sp ? ' dim' : ''}"${mine ? ` style="--pc:${pc}"` : ''}><span class="pin" aria-hidden="true"></span><span class="tx">${clueHTML(cl)}</span><button type="button" class="look" data-look="${i}" aria-pressed="${S.focus === i}" aria-label="Mostra sulla mappa di cosa parla" title="Mostra sulla mappa">🔍</button></li>`;
  const open = rows.filter(r => !r.done), done = rows.filter(r => r.done);
  $('#clues').innerHTML = open.map(li).join('') + (done.length ? `<li class="sep" aria-hidden="true"><span>Già a posto · ${done.length}</span></li>` + done.map(li).join('') : '');
  $('#clueCount').textContent = open.length ? `${open.length} da sistemare su ${P.clues.length}` : `tutti e ${P.clues.length} a posto`;
  $('#viewCount').textContent = sp ? `${rows.filter(r => r.mine).length} su ${sp.name}` : open.length ? `${open.length} da sistemare` : 'tutti a posto';
  if (S.sel !== lastSel) { lastSel = S.sel; const m = $('#clues .mine'); if (m && !phone.matches) m.scrollIntoView({ block: 'nearest' }); }
}
function focusClue(i) {
  if (S.solved) return;
  S.focus = S.focus === i ? null : i;
  renderBoard(); renderTray(); renderClues();
  setStatus(S.focus != null ? 'Sulla mappa è acceso quello di cui parla questo indizio. Scegli tu chi piazzare.' : `Scegli una persona ${where()}, poi tocca la casella dove si trovava.`);
  if (S.focus != null && phone.matches) setView('map');
}
function renderLegend() {
  const P = S.P, used = [...new Set(P.items.filter(Boolean))], open = isOpen('legendOpen'), el = $('#legend');
  const block = used.filter(t => ITEMS[t].block), stand = used.filter(t => !ITEMS[t].block);
  const li = t => `<li>${svg(t)}${ITEMS[t].label}</li>`;
  el.classList.toggle('shut', !open);
  el.innerHTML = `<button type="button" class="acc" aria-expanded="${open}" aria-controls="legendBody"><span>Legenda</span><span class="chev" aria-hidden="true">▼</span></button>
    <div class="body" id="legendBody"><h4>Qui ci si può stare</h4><ul>${stand.map(li).join('')}</ul><h4>Qui no: mobili e ostacoli</h4><ul>${block.map(li).join('')}</ul>
    <h4>Altro</h4><ul>${P.win.length ? '<li><span class="wsw"></span>Finestra</li>' : ''}<li>💫 Vittima</li><li><span class="nsw">↑ N</span>Nord è in alto</li></ul></div>`;
}
function renderTools() {
  $('#modePlace').setAttribute('aria-pressed', S.mode === 'place');
  $('#modeMark').setAttribute('aria-pressed', S.mode === 'mark');
  $('#undoBtn').disabled = !S.hist.length || S.solved;
  $('#hintBtn').disabled = S.solved;
  $('#resetBtn').innerHTML = S.resetArm ? 'Sicuro?<span class="lbl"> Tocca ancora</span>' : '⟲<span class="lbl"> Ricomincia</span>';
}
const ACCUSE_MSG = '<span>Tutti al posto giusto! Ora tocca a te.</span><button type="button" class="btn primary cta" data-act="accuse">🔎 Indica il colpevole</button>';
const solvedMsg = () => `<span>✓ Caso risolto! Il colpevole era ${S.P.persons[S.P.murderer].name}.</span><button type="button" class="btn cta" data-act="win">Rivedi il finale</button><button type="button" class="btn primary cta" data-act="nextu">Prossimo caso ›</button>`;
function setStatus(msg, kind) { const s = $('#status'); s.className = 'status' + (kind ? ' ' + kind : ''); s.innerHTML = msg; }
function refresh() { save(); renderBoard(); renderTray(); renderClues(); renderTools(); renderMeta(); }

/* ---------------- azioni ---------------- */
function pushHist() { S.hist.push({ place: [...S.place], marks: [...S.marks] }); if (S.hist.length > 300) S.hist.shift(); }
// mette una persona in una casella (tocco oppure trascinamento)
function place(who, c) {
  const P = S.P;
  if (P.blocked[c]) { setStatus(`Lì c'è ${ITEMS[P.items[c]].art}: nessuno può starci sopra!`, 'ko'); return; }
  pushHist();
  const occ = S.place.indexOf(c);
  if (occ >= 0 && occ !== who) S.place[occ] = -1;
  S.place[who] = c; S.marks.delete(c); S.sel = null; S.focus = null; S.moved = who; S.hintCell = -1;
  afterMove(`${P.persons[who].name} era ${P.roomDefs[P.room[c]].in}.`);
}
function onCell(c) {
  if (S.solved) { S.accused ? openWin() : openAccuse(); return; }
  const P = S.P; S.hintCell = -1;
  const occ = S.place.indexOf(c);
  if (S.mode === 'mark') {
    // la ✕ si può mettere ovunque, anche su mobili e ostacoli
    if (occ >= 0) { setStatus('Qui c\'è già una persona. Per spostarla usa “Metti persona”.'); return; }
    pushHist(); S.marks.has(c) ? S.marks.delete(c) : S.marks.add(c);
    save(); renderBoard(); renderTools(); return;
  }
  if (S.sel != null) { place(S.sel, c); return; }
  if (P.blocked[c]) { setStatus(`Lì c'è ${ITEMS[P.items[c]].art}: nessuno può starci sopra!`, 'ko'); return; }
  if (occ >= 0) {
    pushHist(); S.place[occ] = -1; S.sel = occ;
    afterMove(`Hai preso ${P.persons[occ].name}: tocca la nuova casella.`);
  } else {
    const bl = helpersOn() ? blockersOf(c) : [];
    if (bl.length) {
      bl.forEach(({ x }) => board.querySelector(`.cell[data-c="${x}"]`)?.classList.add('blocker'));
      setStatus(`Questa casella è bloccata da ${bl.map(({ p }) => chip(p)).join(' e ')}: sono già nella stessa riga o colonna.`);
    } else setStatus(`Prima scegli una persona ${where()}, poi tocca la casella. Oppure trascinala sulla mappa.`);
  }
}
function afterMove(msg) {
  refresh();
  const P = S.P;
  if (S.place.every(c => c >= 0)) {
    if (conflicts().size) { setStatus('Due persone sono nella stessa riga o colonna: ce ne può essere una sola!', 'ko'); return; }
    if (S.place.every((c, i) => c === P.sol[i])) {
      S.solved = true; S.marks = new Set(); S.focus = null; save(); renderTools(); renderBoard(); renderClues();
      setStatus(ACCUSE_MSG, 'ok');
      setTimeout(openAccuse, 350); return;
    }
    const wrong = P.clues.filter(cl => evalClue(cl, S.place, P) === false).length;
    const vr = P.room[S.place[P.n - 1]], inV = S.place.filter(c => P.room[c] === vr).length;
    if (inV !== 2) setStatus(`Nella stanza della vittima ${inV === 1 ? 'non c\'è nessun altro' : 'ci sono ' + (inV - 1) + ' persone'}: deve essercene esattamente una!`, 'ko');
    else setStatus(wrong ? `Qualcosa non torna: ${wrong === 1 ? 'un indizio non è rispettato' : wrong + ' indizi non sono rispettati'}. Li ho segnati in rosso.` : 'Qualcosa non torna… ricontrolla gli indizi!', 'ko');
    if (wrong) renderClues(true);
    return;
  }
  if (msg) setStatus(msg);
}
function undo() {
  if (!S.hist.length || S.solved) return;
  const h = S.hist.pop(); S.place = h.place; S.marks = new Set(h.marks); S.sel = null; S.focus = null; S.hintCell = -1;
  refresh(); setStatus('Mossa annullata.');
}
function hint() {
  if (S.solved) return;
  const P = S.P;
  let p = S.place.findIndex((c, i) => c >= 0 && c !== P.sol[i]), msg;
  pushHist();
  if (p >= 0) { S.place[p] = -1; msg = `${P.persons[p].name} era nel posto sbagliato: l'ho rimess${oa(P.persons[p].g)} nella lista.`; S.hintCell = -1; }
  else {
    const free = P.persons.map((_, i) => i).filter(i => S.place[i] < 0);
    if (!free.length) { S.hist.pop(); return; }
    const deg = i => P.clues.filter(c => c.a === i || c.b === i).length;
    free.sort((a, b) => deg(b) - deg(a));
    p = free[0]; const c = P.sol[p];
    const occ = S.place.indexOf(c); if (occ >= 0) S.place[occ] = -1;
    S.place[p] = c; S.marks.delete(c); S.hintCell = c; S.moved = p;
    msg = `Aiuto: ${P.persons[p].name} era qui, ${P.roomDefs[P.room[c]].in}.`;
  }
  S.hints++; S.sel = null; S.focus = null; afterMove(msg);
}
function reset() {
  if (!S.resetArm) { S.resetArm = true; renderTools(); setTimeout(() => { if (S) { S.resetArm = false; renderTools(); } }, 3000); return; }
  Object.assign(S, { resetArm: false, place: new Array(S.P.n).fill(-1), marks: new Set(), sel: null, hist: [], hints: 0, elapsed: 0, solved: false, accused: false, struck: new Set(), hintCell: -1, focus: null });
  save(); renderAll(); setStatus('Si ricomincia da capo. Buona indagine!');
}
function step(d) {
  const all = allIds();
  const k = all.indexOf(S.id);
  if (all[k + d]) openCase(all[k + d]);
}

/* ---------------- finestre ---------------- */
function openModal(html, wide) {
  const m = $('#modal'); m.className = 'modal' + (wide ? ' wide' : ''); m.innerHTML = html;
  $('#overlay').hidden = false;
  const f = m.querySelector('[data-focus]') || m.querySelector('button'); f && f.focus();
}
function closeModal() { $('#overlay').hidden = true; }
// L'indirizzo non compare mai intero nel sorgente: viene ricomposto solo quando qualcuno tocca il pulsante.
const MAIL = ['moc.liamg', 'ibmol.innavoig'];
function openCredits() {
  openModal(`<div class="credits">
    <p class="stamp">Fascicolo n. 001 · Riservato</p>
    <h2>Twindoku: Cold Case</h2>
    <dl>
      <dt>Ideato e scritto da</dt><dd>Giovanni Lombi</dd>
      <dt>Ispettori collaudatori</dt><dd>Aurora e Alessandro <span aria-label="con affetto">❤️</span><br><small>i primi detective ad aver risolto ogni caso</small></dd>
      <dt>Contatti</dt><dd id="mailSlot"><button type="button" class="btn" data-mail>✉️ Scrivi all'autore</button></dd>
      <dt>Codice</dt><dd><a href="https://github.com/giovannilombi/twindoku" target="_blank" rel="noopener">github.com/giovannilombi/twindoku</a></dd>
    </dl>
    <p class="lic">Puoi giocare, modificare e condividere Twindoku <b>senza scopo commerciale</b> e <b>citando sempre l'autore</b>.<br>
    Codice: <a href="https://polyformproject.org/licenses/noncommercial/1.0.0" target="_blank" rel="noopener">PolyForm Noncommercial License 1.0.0</a>.<br>
    Storie, personaggi, casi e icone: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.it" target="_blank" rel="noopener">Creative Commons Attribuzione - Non commerciale - Condividi allo stesso modo 4.0 Internazionale (CC BY-NC-SA 4.0)</a>.</p>
    <p class="lic">© 2026 Giovanni Lombi</p>
    <div class="row"><button type="button" class="btn primary" data-close data-focus>Chiudi il fascicolo</button></div>
  </div>`);
}
function revealMail() {
  const addr = MAIL.map(x => [...x].reverse().join('')).reverse().join('@');
  const slot = $('#mailSlot');
  slot.innerHTML = `<a href="mailto:${addr}?subject=Twindoku">${addr}</a>`;
  location.href = `mailto:${addr}?subject=Twindoku`;
}
function openRules() {
  openModal(`<h2>Come si gioca</h2>
  <p>È successo un delitto! Sulla mappa vedi le stanze, i mobili e le finestre. Devi scoprire <b>dove si trovava ogni persona</b>, vittima compresa, usando gli indizi.</p>
  <ol>
    <li>In ogni <b>riga</b> e in ogni <b>colonna</b> della mappa c'è <b>una sola persona</b>.</li>
    <li>Nessuno può stare su tavoli, armadi, piante e altri mobili pesanti. Su sedie, poltrone, divani, letti, tappeti e panche invece sì (la legenda ti dice cosa è cosa).</li>
    <li><b>Accanto</b> vuol dire nella casella vicina (sopra, sotto, a destra o a sinistra) <b>nella stessa stanza</b>: se c'è un muro in mezzo non vale. <b>In diagonale</b> vuol dire nella stessa stanza, in due caselle che si toccano con un angolo.</li>
    <li><b>In un angolo</b> della stanza vuol dire che la casella tocca due muri che formano un angolo. <b>Al centro</b> vuol dire che non tocca nessun muro.</li>
    <li><b>Vicino a una finestra</b>: la casella ha una finestra azzurra su un lato. <b>Nord</b> è in alto sulla mappa, <b>ovest</b> a sinistra.</li>
    <li>Il <b>colpevole</b> è l'unica persona che si trovava nella stessa stanza della vittima.</li>
  </ol>
  <p><b>Come muoverti:</b> tocca una persona, poi la casella; oppure trascinala sulla mappa. Per spostarla, toccala o trascinala di nuovo. Con <b>Segna ✕</b> segni le caselle dove sei sicuro che non c'è nessuno (anche sopra i mobili).</p>
  <p><b>Indizi:</b> quando scegli una persona, i suoi indizi si mettono in evidenza. Tocca un indizio per <b>metterlo da parte</b> quando l'hai usato (va in fondo, lo ritocchi e torna su). La lente 🔍 accende sulla mappa la stanza e gli oggetti di cui parla.</p>
  <p><b>Aiutini</b>: se li accendi, righe e colonne già occupate si riempiono di righine e gli indizi diventano verdi o rossi. Per una sfida vera, lasciali spenti!</p>
  <div class="row"><button type="button" class="btn primary" data-close data-focus>Inizia a indagare</button><button type="button" class="btn" data-archive>Scegli un caso</button></div>`);
  store.set('gq2:seenRules', true);
}
let archiveSize = null;
async function openArchive(n) {
  archiveSize = n || archiveSize || (S ? S.n : 5);
  const all = new Set(CASES.map(c => c[0]));
  const solved = new Set([...solvedSet()].filter(k => all.has(k)));
  const total = CASES.length;
  const list = (INDEX.find(x => x.n === archiveSize) || { cases: [] }).cases;
  const starMap = store.get(acc.ns('stars'), {});
  const nu = nextUnsolved(S ? S.id : null);
  const dd = acc.dailyToday() || await acc.fetchDaily();
  const daily = dd && metaOf(dd.id) && metaOf(dd.id).key === dd.key ? [dd.key, 0, 0, dd.id] : null;
  const tabs = INDEX.map(x => {
    const done = x.cases.filter(([k]) => solved.has(k)).length;
    return `<button type="button" data-size="${x.n}" aria-pressed="${x.n === archiveSize}">${x.n}×${x.n}<small>${TIERS[x.n]} · ${done}/${x.count}</small></button>`;
  }).join('');
  const cards = list.map(([key, scI], i) => {
    const id = `${archiveSize}-${i + 1}`, sc = SCENARIOS[scI];
    const st = store.get(acc.ns(`case:${key}`), null);
    const state = solved.has(key) ? 'solved' : st && st.place && st.place.some(c => c >= 0) ? 'started' : '';
    return `<button type="button" class="casebtn ${state}${S && S.id === id ? ' current' : ''}${daily && daily[0] === key ? ' daily' : ''}" data-open="${id}" style="--sc:${sc.color}">
      <span class="st">${state === 'solved' ? '✓' : state === 'started' ? '● in corso' : daily && daily[0] === key ? '📅 oggi' : ''}</span>
      <b>N° ${i + 1}</b><small>${sc.title}</small>${state === 'solved' ? `<span class="stars">${'★'.repeat(starMap[key] || 1)}${'☆'.repeat(3 - (starMap[key] || 1))}</span>` : ''}</button>`;
  }).join('');
  const dId = daily && daily[3], dDone = daily && solved.has(daily[0]);
  openModal(`<h2>Archivio dei casi</h2>
    <p class="progress">Hai risolto <b>${solved.size}</b> ${solved.size === 1 ? 'caso' : 'casi'} su <b>${total}</b>. Più è grande la mappa, più è difficile. In ogni gruppo i casi vanno dal più semplice al più tosto.</p>
    <div class="row" style="margin:0 0 4px">${nu ? `<button type="button" class="btn primary" data-open="${nu}">▶ Prossimo da risolvere (${nu.replace('-', '×' + nu.split('-')[0] + ' n° ')})</button>` : '<b>Hai risolto tutti i casi. Sei un vero Maestro del giallo!</b>'}
    ${dId ? `<button type="button" class="btn${dDone ? '' : ' daily-btn'}" data-open="${dId}">📅 Caso del giorno (${dId.replace('-', '×' + dId.split('-')[0] + ' n° ')})${dDone ? ' ✓' : ''}</button>` : ''}</div>
    <div class="tabs">${tabs}</div><div class="cases">${cards}</div>
    <div class="row"><button type="button" class="btn" data-close>Chiudi</button></div>`, true);
}
function openAccuse() {
  const P = S.P;
  openModal(`<h2>Chi è il colpevole?</h2>
  <p id="accuseMsg">Hai trovato dove si trovavano tutti. Guarda la mappa: chi era nella stessa stanza di ${chip(P.n - 1)}?</p>
  <div class="lineup">${P.persons.slice(0, -1).map((p, i) => `<button type="button" data-accuse="${i}"><span class="ph" style="--c:${p.color}">${face(p)}</span><b>${p.name}</b><small>${p.role}</small></button>`).join('')}</div>
  <div class="row"><button type="button" class="btn" data-close>Guarda ancora la mappa</button></div>`, true);
}
function accuse(i) {
  const P = S.P;
  if (i === P.murderer) {
    const before = acc.meCache();
    const sync = markSolved(S.key, S.hints, S.elapsed);
    S.accused = true; save(); renderBoard();
    setStatus(solvedMsg(), 'ok');
    renderStory(); openWin(); confetti();
    sync.then(res => { if (res) profile.celebrate(res, before); });
  } else {
    const m = $('#modal'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake');
    $('#accuseMsg').innerHTML = `No! ${chip(i)} era ${P.roomDefs[P.room[P.sol[i]]].in}, non con ${chip(P.n - 1)}. Guarda meglio la stanza della vittima.`;
  }
}
function openWin() {
  const P = S.P, sc = P.sc, M = P.murderer, V = P.n - 1, D = P.roomDefs[P.room[P.sol[V]]];
  const stars = S.hints === 0 ? '★★★' : S.hints <= 2 ? '★★☆' : '★☆☆';
  openModal(`<div class="verdict"><span class="ph" style="--c:${P.persons[M].color}">${face(P.persons[M])}</span><span class="bigstamp">Caso chiuso</span></div>
  <p>È stat${oa(P.persons[M].g)} ${chip(M)}, ${P.persons[M].role}! Era ${D.in}, da sol${oa(P.persons[M].g)} con ${chip(V)}.</p>
  <p>${fill(sc.epilogues[P.story.epi], P)}</p>
  <p class="stars-big">${stars}</p>
  <p class="progress" style="margin:0">Tempo ${fmt(S.elapsed)} · Aiuti usati: ${S.hints} · <b>+${S.n * starsOf(S.hints)} punti</b>${acc.active() ? '' : ' (crea un detective per tenerli!)'}</p>
  <div id="winExtra"></div>
  <div class="row"><button type="button" class="btn primary" data-nextu data-focus>Prossimo da risolvere ›</button><button type="button" class="btn" data-archive>Archivio</button><button type="button" class="btn ghost" data-close>Guarda la mappa</button></div>`);
}

/* ---------------- coriandoli ---------------- */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d'); cv.hidden = false;
  const dpr = devicePixelRatio || 1, W = (cv.width = innerWidth * dpr), H = (cv.height = innerHeight * dpr);
  const cols = ['#f6c453', '#e0457b', '#3a6fe0', '#62d69e', '#8b4fd6', '#ea7d12'];
  const ps = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 5, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, s: (6 + Math.random() * 8) * dpr, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  (function f(t) {
    ctx.clearRect(0, 0, W, H);
    ps.forEach(p => { p.x += p.vx; p.y += p.vy * dpr; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (t - t0 < 3200) requestAnimationFrame(f); else { ctx.clearRect(0, 0, W, H); cv.hidden = true; }
  })(t0);
}

/* ---------------- eventi ---------------- */
const board = $('#board');
board.addEventListener('click', e => { if (swallow) return; const c = e.target.closest('.cell'); if (c) onCell(+c.dataset.c); });
board.addEventListener('mouseover', e => {
  const c = e.target.closest('.cell'); if (!c) return;
  const r = c.dataset.r;
  if (board.dataset.hl === r) return;
  board.dataset.hl = r;
  board.querySelectorAll('.cell.hl').forEach(x => x.classList.remove('hl'));
  board.querySelectorAll(`.cell[data-r="${r}"]`).forEach(x => x.classList.add('hl'));
});
// passando su una casella rigata, si illumina chi blocca quella riga/colonna
const blockersOf = c => {
  const n = S.P.n, r = (c / n) | 0, k = c % n;
  return S.place.map((x, p) => ({ x, p })).filter(({ x }) => x >= 0 && x !== c && (((x / n) | 0) === r || x % n === k));
};
board.addEventListener('mouseover', e => {
  const cell = e.target.closest('.cell');
  board.querySelectorAll('.cell.blocker').forEach(x => x.classList.remove('blocker'));
  if (!cell || !cell.classList.contains('shade')) return;
  for (const { x } of blockersOf(+cell.dataset.c)) board.querySelector(`.cell[data-c="${x}"]`)?.classList.add('blocker');
});
board.addEventListener('mouseleave', () => { board.querySelectorAll('.cell.blocker').forEach(x => x.classList.remove('blocker')); board.dataset.hl = ''; board.querySelectorAll('.cell.hl').forEach(x => x.classList.remove('hl')); });
$('#tray').addEventListener('click', e => {
  const b = e.target.closest('.person'); if (!b || S.solved || swallow) return;
  const i = +b.dataset.p; S.mode = 'place'; S.hintCell = -1; S.focus = null;
  S.sel = S.sel === i ? null : i;
  renderTray(); renderTools(); renderBoard(); renderClues();
  const p = S.P.persons[i];
  if (S.sel != null) setStatus(`Dove si trovava ${p.name}? Tocca una casella.${S.place[i] >= 0 ? ` (È già sulla mappa: verrà spostat${oa(p.g)}.)` : ''}`);
  else setStatus(`Scegli una persona ${where()}, poi tocca la casella dove si trovava.`);
});
$('#clues').addEventListener('click', e => {
  const lk = e.target.closest('[data-look]'); if (lk) return focusClue(+lk.dataset.look);
  const li = e.target.closest('.clue'); if (!li) return;
  const i = +li.dataset.i;
  if (S.struck.has(i)) { S.struck.delete(i); setStatus('Indizio ripreso: è tornato tra quelli da sistemare.'); }
  else { S.struck.add(i); if (S.focus === i) S.focus = null; setStatus('Indizio messo da parte: lo trovi in fondo. Toccalo ancora per riprenderlo.'); }
  save(); renderClues(); renderBoard(); renderTray();
});
$('#clues').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.clue')) { e.preventDefault(); e.target.click(); } });
$('#helpers').addEventListener('change', e => {
  store.set('gq3:helpers', e.target.checked); renderBoard(); renderClues();
  if (!S.solved) setStatus(e.target.checked ? 'Aiutini accesi: righe e colonne occupate rigate, indizi verdi o rossi.' : 'Aiutini spenti: nessun colore sugli indizi, decidi tu quali mettere da parte.');
});
$('#modePlace').addEventListener('click', () => { S.mode = 'place'; renderTools(); renderBoard(); });
$('#modeMark').addEventListener('click', () => { S.mode = 'mark'; S.sel = null; S.focus = null; renderTools(); renderTray(); renderBoard(); renderClues(); setStatus('Modalità ✕: tocca le caselle dove sei sicuro che non ci sia nessuno. Puoi segnare anche mobili e ostacoli.'); });
$('#status').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'accuse') openAccuse();
  else if (b.dataset.act === 'win') openWin();
  else if (b.dataset.act === 'nextu') { const nu = nextUnsolved(S.id); nu ? openCase(nu) : openArchive(); }
});
$('#undoBtn').addEventListener('click', undo);
$('#hintBtn').addEventListener('click', hint);
$('#resetBtn').addEventListener('click', reset);
$('#rulesBtn').addEventListener('click', openRules);
$('#creditsBtn').addEventListener('click', openCredits);
$('#archiveBtn').addEventListener('click', () => openArchive(S ? S.n : 5));
$('#prevCase').addEventListener('click', () => step(-1));
$('#nextCase').addEventListener('click', () => step(1));
// fascicolo e legenda richiudibili: chiudendo la legenda le foto delle persone si allargano
$('#story').addEventListener('click', e => { if (!e.target.closest('.acc')) return; store.set('gq3:storyOpen', !isOpen('storyOpen')); renderStory(); });
$('#legend').addEventListener('click', e => { if (!e.target.closest('.acc')) return; store.set('gq3:legendOpen', !isOpen('legendOpen')); renderLegend(); fitCast(); });
new ResizeObserver(() => fitCast()).observe($('#tray'));
phone.addEventListener('change', fitCast);

/* ---------------- trascinamento ---------------- */
// Una persona si può anche trascinare: dalla lista alla mappa, da una casella all'altra, o fuori dalla mappa per toglierla.
let dg = null, ghost = null, swallow = false;
const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest('#board .cell'); return c ? +c.dataset.c : null; };
function endDrag() { if (ghost) ghost.remove(); ghost = null; document.body.classList.remove('dragging'); board.querySelectorAll('.over').forEach(x => x.classList.remove('over')); }
$('#layout').addEventListener('pointerdown', e => {
  if (!S || S.solved || S.mode !== 'place' || (e.button != null && e.button > 0)) return;
  const pe = e.target.closest('#tray .person'), ce = e.target.closest('#board .cell'); let p = null;
  if (pe) p = +pe.dataset.p; else if (ce) { const o = S.place.indexOf(+ce.dataset.c); if (o >= 0) p = o; }
  if (p != null) dg = { p, x: e.clientX, y: e.clientY, on: false, id: e.pointerId };
});
addEventListener('pointermove', e => {
  if (!dg || e.pointerId !== dg.id) return;
  if (!dg.on) {
    if (Math.hypot(e.clientX - dg.x, e.clientY - dg.y) < 8) return;
    dg.on = true; document.body.classList.add('dragging');
    const p = S.P.persons[dg.p];
    ghost = document.createElement('span'); ghost.className = 'tok dragtok' + (p.victim ? ' vic' : ''); ghost.style.setProperty('--c', p.color); ghost.innerHTML = `<span class="ph">${face(p)}</span>`; document.body.appendChild(ghost);
  }
  ghost.style.transform = `translate(${e.clientX - 34}px, ${e.clientY - 34}px)`;
  const c = cellAt(e); board.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  if (c != null) board.querySelector(`.cell[data-c="${c}"]`).classList.add('over');
});
addEventListener('pointerup', e => {
  if (!dg || e.pointerId !== dg.id) return; const d = dg; dg = null; if (!d.on) return;
  endDrag(); swallow = true; setTimeout(() => (swallow = false), 0);
  const c = cellAt(e), P = S.P;
  if (c != null) { if (S.place[d.p] !== c) place(d.p, c); }
  else if (S.place[d.p] >= 0) { pushHist(); S.place[d.p] = -1; S.sel = null; afterMove(`${P.persons[d.p].name} è tornat${oa(P.persons[d.p].g)} nella lista.`); }
});
addEventListener('pointercancel', () => { dg = null; endDrag(); });

/* ---------------- telefono: due schede, si cambia con uno swipe ---------------- */
function setView(v) {
  const L = $('#layout'); if (L.dataset.view === v) return;
  L.dataset.view = v;
  document.querySelectorAll('.views button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
  const cls = v === 'clues' ? 'go-l' : 'go-r';
  L.classList.remove('go-l', 'go-r'); void L.offsetWidth; L.classList.add(cls);
  setTimeout(() => L.classList.remove(cls), 260);
  fitCast();
}
document.querySelector('.views').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
let sw = null;
$('#layout').addEventListener('touchstart', e => {
  sw = null;
  // lo swipe non parte da una persona o da una casella occupata: lì il dito serve a trascinare
  if (!phone.matches || e.touches.length !== 1 || e.target.closest('.person, .cell.occ')) return;
  sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
$('#layout').addEventListener('touchend', e => {
  if (!sw) return; const s = sw, p = e.changedTouches[0], dx = p.clientX - s.x, dy = p.clientY - s.y; sw = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - s.t < 700) setView(dx < 0 ? 'clues' : 'map');
}, { passive: true });
const fsBtn = $('#fsBtn');
if (document.fullscreenEnabled) {
  fsBtn.hidden = false;
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => setStatus('Il browser non permette lo schermo intero qui.', 'ko'));
  });
  document.addEventListener('fullscreenchange', () => { fsBtn.textContent = document.fullscreenElement ? '✕' : '⛶'; fsBtn.setAttribute('aria-label', document.fullscreenElement ? 'Esci da schermo intero' : 'Schermo intero'); });
}
$('#brand').addEventListener('click', e => { e.preventDefault(); openArchive(); });
$('#overlay').addEventListener('click', e => {
  const t = e.target;
  if (t.id === 'overlay' || t.closest('[data-close]')) return closeModal();
  if (t.closest('[data-mail]')) return revealMail();
  if (t.closest('[data-nextu]')) { closeModal(); const nu = nextUnsolved(S.id); return nu ? openCase(nu) : openArchive(); }
  if (t.closest('[data-archive]')) return openArchive();
  const sz = t.closest('[data-size]'); if (sz) return openArchive(+sz.dataset.size);
  const op = t.closest('[data-open]'); if (op) { closeModal(); return openCase(op.dataset.open); }
  const a = t.closest('[data-accuse]'); if (a) return accuse(+a.dataset.accuse);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#overlay').hidden) closeModal();
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
});
setInterval(() => {
  if (S && !S.solved && !document.hidden && $('#overlay').hidden) { S.elapsed++; $('#timer').textContent = fmt(S.elapsed); if (S.elapsed % 5 === 0) save(); }
}, 1000);
const fromHash = () => { const m = location.hash.match(/^#caso-(\d{1,2}-\d{1,3})$/); return m ? m[1] : null; };
// link d'invito: #squadra-K7P2QX
const inviteFromHash = () => { const m = location.hash.match(/^#squadra-([A-Za-z2-9]{6})$/); return m ? m[1].toUpperCase() : null; };
addEventListener('hashchange', () => {
  const inv = inviteFromHash(); if (inv) { acc.setPendingInvite(inv); if (S) history.replaceState(null, '', `#caso-${S.id}`); profile.handleInvite(); return; }
  const id = fromHash(); if (id && (!S || id !== S.id)) openCase(id);
});

const profile = initProfile({
  openModal, closeModal, setStatus,
  cases: () => CASES,
  // cambio di detective: si riapre il caso con i suoi salvataggi
  reload: () => { if (S) openCase(S.id); },
});

(async () => {
  setStatus('Apro il fascicolo del caso…');
  const inv = inviteFromHash();
  if (inv) acc.setPendingInvite(inv);
  await loadIndex();
  await openCase(fromHash() || store.get('gq2:last', null) || '5-1');
  profile.start(); // aggiorna il detective dal server, invia i casi risolti offline, gestisce gli inviti
  acc.fetchDaily();
  if (!store.get('gq2:seenRules', false) && !inv) openRules();
})();
