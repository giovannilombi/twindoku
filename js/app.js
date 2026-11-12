import { ITEMS, ICONS, SCENARIOS, TIERS, SIZES } from './data.js';
import { hydrate, evalClue } from './engine.js';
import { starsOf, dailyCase, rankOf, BADGES } from './gamify.js';
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
const where = () => (matchMedia('(max-width: 1080px)').matches ? 'qui sotto' : 'a destra');
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
const helpersOn = () => store.get('gq2:helpers', true);
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
  S = { id, key: C.key, n, idx: i, P, place: new Array(P.n).fill(-1), marks: new Set(), sel: null, mode: 'place', hist: [], hints: 0, elapsed: 0, solved: false, struck: new Set(), hintCell: -1, resetArm: false, accused: false };
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
function renderAll() { renderStory(); renderBoard(); renderTray(); renderClues(); renderLegend(); renderTools(); renderMeta(); }
function renderMeta() {
  $('#timer').textContent = fmt(S.elapsed);
  $('#hintsUsed').textContent = S.hints;
  const all = allIds();
  const k = all.indexOf(S.id);
  $('#prevCase').disabled = k <= 0;
  $('#nextCase').disabled = k < 0 || k >= all.length - 1;
}
function renderStory() {
  const P = S.P, sc = P.sc;
  const el = $('#story');
  el.style.setProperty('--sc', sc.color);
  el.innerHTML = `<div class="eyebrow"><b>Caso ${S.n}×${S.n} n° ${S.idx}</b><span>${TIERS[S.n]}</span><span>${sc.place}</span>${solvedSet().has(S.key) ? '<span class="solvedtag">✓ Risolto</span>' : ''}</div>
    <h1>${sc.title}</h1>
    <p class="intro">${fill(sc.intros[P.story.intro], P)}</p><span class="more">Leggi tutta la storia ▾</span>
    <p class="weapon">Accanto alla vittima: <b>${sc.weapons[P.story.weapon]}</b>.</p>`;
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
  const crimeRoom = S.solved && S.accused ? P.room[P.sol[P.n - 1]] : -1;
  const rowOcc = new Array(n).fill(false), colOcc = new Array(n).fill(false);
  S.place.forEach(c => { if (c >= 0) { rowOcc[(c / n) | 0] = true; colOcc[c % n] = true; } });
  const bad = conflicts(), labels = labelCells(P);
  let h = '';
  for (let c = 0; c < n * n; c++) {
    const r = (c / n) | 0, k = c % n, rm = P.room[c], D = P.roomDefs[rm], it = P.items[c], occ = S.place.indexOf(c), w = P.wall[c];
    const cls = ['cell', 'p-' + D.pat];
    if (w & 1) cls.push('wt'); if (w & 2) cls.push('wr'); if (w & 4) cls.push('wb'); if (w & 8) cls.push('wl');
    if (it) { cls.push(ITEMS[it].block ? 'blocked' : 'stand'); if (it === 'tappeto') cls.push('rug'); }
    if (help && !S.solved && occ < 0 && (rowOcc[r] || colOcc[k])) cls.push('shade');
    if (S.hintCell === c) cls.push('hint');
    if (rm === crimeRoom) cls.push('crime');
    if (S.sel != null && occ === S.sel) cls.push('focus');
    let inner = '';
    if (it) inner += svg(it, 'it');
    const wm = P.winAt[c];
    if (wm & 1) inner += '<i class="win t"></i>'; if (wm & 2) inner += '<i class="win r"></i>';
    if (wm & 4) inner += '<i class="win b"></i>'; if (wm & 8) inner += '<i class="win l"></i>';
    if (labels[c]) inner += `<span class="rlab" style="--span:${labels[c].span}"><span>${D.name}</span></span>`;
    if (occ >= 0) { const p = P.persons[occ]; inner += `<span class="tok${p.victim ? ' vic' : ''}${bad.has(occ) ? ' bad' : ''}" style="--c:${p.color}">${p.init}</span>`; }
    else if (S.marks.has(c)) inner += '<span class="mark">✕</span>';
    const lbl = `${D.name}${it ? ', ' + ITEMS[it].label : ''}${occ >= 0 ? ', ' + P.persons[occ].name : ''}`;
    h += `<button type="button" class="${cls.join(' ')}" style="--floor:${D.floor}" data-c="${c}" data-r="${rm}" title="${lbl}" aria-label="Riga ${r + 1}, colonna ${k + 1}: ${lbl}"></button>`.replace('></button>', `>${inner}</button>`);
  }
  b.innerHTML = h;
}
function renderTray() {
  const P = S.P;
  $('#tray').innerHTML = P.persons.map((p, i) => `<button type="button" class="person${S.place[i] >= 0 ? ' placed' : ''}" data-p="${i}" aria-pressed="${S.sel === i}">
    <span class="mini${p.victim ? ' vic' : ''}" style="--c:${p.color}">${p.init}</span>
    <span class="nm"><b>${p.name}</b><small>${p.role}</small></span></button>`).join('');
}
function renderClues(force) {
  const P = S.P, help = helpersOn() || force;
  $('#helpers').checked = helpersOn();
  // ordina: prima per persona (come nella lista a destra), poi gli indizi sulle stanze
  const order = P.clues.map((cl, i) => ({ cl, i, key: cl.a != null ? cl.a : 99 })).sort((x, y) => x.key - y.key || x.i - y.i);
  $('#clues').innerHTML = order.map(({ cl, i }) => {
    const v = help ? evalClue(cl, S.place, P) : null;
    const st = v === true ? 'yes' : v === false ? 'no' : '';
    return `<li tabindex="0" data-i="${i}" class="${st}${S.struck.has(i) ? ' struck' : ''}"><span class="ic">${v === true ? '✓' : v === false ? '!' : '?'}</span><span class="tx">${clueHTML(cl)}</span></li>`;
  }).join('');
}
function renderLegend() {
  const P = S.P, used = [...new Set(P.items.filter(Boolean))];
  const block = used.filter(t => ITEMS[t].block), stand = used.filter(t => !ITEMS[t].block);
  const li = t => `<li>${svg(t)}${ITEMS[t].label}</li>`;
  $('#legend').innerHTML =
    `<h3>Qui ci si può stare</h3><ul>${stand.map(li).join('')}</ul>` +
    `<h3>Qui no: mobili e ostacoli</h3><ul>${block.map(li).join('')}</ul>` +
    `<h3>Altro</h3><ul>${P.win.length ? '<li><span class="wsw"></span>Finestra</li>' : ''}<li><span class="nsw">↑ N</span>Nord è in alto</li></ul>`;
}
function renderTools() {
  $('#modePlace').setAttribute('aria-pressed', S.mode === 'place');
  $('#modeMark').setAttribute('aria-pressed', S.mode === 'mark');
  $('#undoBtn').disabled = !S.hist.length || S.solved;
  $('#hintBtn').disabled = S.solved;
  $('#resetBtn').textContent = S.resetArm ? 'Sicuro? Tocca ancora' : 'Ricomincia';
}
const ACCUSE_MSG = '<span>Tutti al posto giusto! Ora tocca a te.</span><button type="button" class="btn primary cta" data-act="accuse">🔎 Indica il colpevole</button>';
const solvedMsg = () => `<span>✓ Caso risolto! Il colpevole era ${S.P.persons[S.P.murderer].name}.</span><button type="button" class="btn cta" data-act="win">Rivedi il finale</button><button type="button" class="btn primary cta" data-act="nextu">Prossimo caso ›</button>`;
function setStatus(msg, kind) { const s = $('#status'); s.className = 'status' + (kind ? ' ' + kind : ''); s.innerHTML = msg; }
function refresh() { save(); renderBoard(); renderTray(); renderClues(); renderTools(); renderMeta(); }

/* ---------------- azioni ---------------- */
function pushHist() { S.hist.push({ place: [...S.place], marks: [...S.marks] }); if (S.hist.length > 300) S.hist.shift(); }
function onCell(c) {
  if (S.solved) { S.accused ? openWin() : openAccuse(); return; }
  const P = S.P; S.hintCell = -1;
  if (P.blocked[c]) { setStatus(`Lì c'è ${ITEMS[P.items[c]].art}: nessuno può starci sopra!`, 'ko'); return; }
  const occ = S.place.indexOf(c);
  if (S.mode === 'mark') {
    if (occ >= 0) { setStatus('Qui c\'è già una persona. Per spostarla usa “Metti persona”.'); return; }
    pushHist(); S.marks.has(c) ? S.marks.delete(c) : S.marks.add(c);
    save(); renderBoard(); renderTools(); return;
  }
  if (S.sel != null) {
    pushHist();
    if (occ >= 0 && occ !== S.sel) S.place[occ] = -1;
    S.place[S.sel] = c; S.marks.delete(c);
    const who = S.sel; S.sel = null;
    afterMove(`${P.persons[who].name} era ${P.roomDefs[P.room[c]].in}.`);
  } else if (occ >= 0) {
    pushHist(); S.place[occ] = -1; S.sel = occ;
    afterMove(`Hai preso ${P.persons[occ].name}: tocca la nuova casella.`);
  } else {
    const bl = helpersOn() ? blockersOf(c) : [];
    if (bl.length) {
      bl.forEach(({ x }) => board.querySelector(`.cell[data-c="${x}"]`)?.classList.add('blocker'));
      setStatus(`Questa casella è bloccata da ${bl.map(({ p }) => chip(p)).join(' e ')}: sono già nella stessa riga o colonna.`);
    } else setStatus(`Prima scegli una persona ${where()}, poi tocca la casella.`);
  }
}
function afterMove(msg) {
  refresh();
  const P = S.P;
  if (S.place.every(c => c >= 0)) {
    if (conflicts().size) { setStatus('Due persone sono nella stessa riga o colonna: ce ne può essere una sola!', 'ko'); return; }
    if (S.place.every((c, i) => c === P.sol[i])) {
      S.solved = true; S.marks = new Set(); save(); renderTools(); renderBoard();
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
  const h = S.hist.pop(); S.place = h.place; S.marks = new Set(h.marks); S.sel = null; S.hintCell = -1;
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
    S.place[p] = c; S.marks.delete(c); S.hintCell = c;
    msg = `Aiuto: ${P.persons[p].name} era qui, ${P.roomDefs[P.room[c]].in}.`;
  }
  S.hints++; S.sel = null; afterMove(msg);
}
function reset() {
  if (!S.resetArm) { S.resetArm = true; renderTools(); setTimeout(() => { if (S) { S.resetArm = false; renderTools(); } }, 3000); return; }
  Object.assign(S, { resetArm: false, place: new Array(S.P.n).fill(-1), marks: new Set(), sel: null, hist: [], hints: 0, elapsed: 0, solved: false, accused: false, struck: new Set(), hintCell: -1 });
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
    <li>Nessuno può stare su tavoli, armadi, piante e altri mobili pesanti. Su sedie, poltrone, divani, letti, tappeti e panche invece sì (la legenda a destra ti dice cosa è cosa).</li>
    <li><b>Accanto</b> vuol dire nella casella vicina (sopra, sotto, a destra o a sinistra) <b>nella stessa stanza</b>: se c'è un muro in mezzo non vale. <b>In diagonale</b> vuol dire nella stessa stanza, in due caselle che si toccano con un angolo.</li>
    <li><b>In un angolo</b> della stanza vuol dire che la casella tocca due muri che formano un angolo. <b>Al centro</b> vuol dire che non tocca nessun muro.</li>
    <li><b>Vicino a una finestra</b>: la casella ha una finestra azzurra su un lato. <b>Nord</b> è in alto sulla mappa, <b>ovest</b> a sinistra.</li>
    <li>Il <b>colpevole</b> è l'unica persona che si trovava nella stessa stanza della vittima.</li>
  </ol>
  <p><b>Come muoverti:</b> tocca una persona nella lista, poi la casella. Per spostarla, toccala sulla mappa. Con <b>Segna ✕</b> segni le caselle dove sei sicuro che non c'è nessuno.</p>
  <p><b>Aiutini</b> accesi: righe e colonne già occupate si riempiono di righine e gli indizi diventano verdi o rossi. Per una sfida vera, spegnili!</p>
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
  const daily = dailyCase(CASES);
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
  openModal(`<div class="big" aria-hidden="true">🔎</div><h2>Chi è il colpevole?</h2>
  <p id="accuseMsg">Hai trovato dove si trovavano tutti. Guarda la mappa: chi era nella stessa stanza di ${chip(P.n - 1)}?</p>
  <div class="accuse">${P.persons.slice(0, -1).map((p, i) => `<button type="button" class="person" data-accuse="${i}"><span class="mini" style="--c:${p.color}">${p.init}</span><span class="nm"><b>${p.name}</b><small>${p.role}</small></span></button>`).join('')}</div>`, true);
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
  openModal(`<div class="big" aria-hidden="true">🏆</div><h2>Caso risolto!</h2>
  <p>È stat${oa(P.persons[M].g)} ${chip(M)}, ${P.persons[M].role}! Era ${D.in}, da sol${oa(P.persons[M].g)} con ${chip(V)}.</p>
  <p>${fill(sc.epilogues[P.story.epi], P)}</p>
  <p style="font-size:28px;color:var(--accent);letter-spacing:4px;margin:4px 0">${stars}</p>
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
board.addEventListener('click', e => { const c = e.target.closest('.cell'); if (c) onCell(+c.dataset.c); });
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
  const b = e.target.closest('.person'); if (!b || S.solved) return;
  const i = +b.dataset.p; S.mode = 'place'; S.hintCell = -1;
  S.sel = S.sel === i ? null : i;
  renderTray(); renderTools(); renderBoard();
  const p = S.P.persons[i];
  if (S.sel != null) setStatus(`Dove si trovava ${p.name}? Tocca una casella.${S.place[i] >= 0 ? ` (È già sulla mappa: verrà spostat${oa(p.g)}.)` : ''}`);
  else setStatus(`Scegli una persona ${where()}, poi tocca la casella dove si trovava.`);
});
$('#clues').addEventListener('click', e => { const li = e.target.closest('li'); if (!li) return; const i = +li.dataset.i; S.struck.has(i) ? S.struck.delete(i) : S.struck.add(i); save(); renderClues(); });
$('#clues').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.closest('li')?.click(); } });
$('#helpers').addEventListener('change', e => { store.set('gq2:helpers', e.target.checked); renderBoard(); renderClues(); });
$('#modePlace').addEventListener('click', () => { S.mode = 'place'; renderTools(); });
$('#modeMark').addEventListener('click', () => { S.mode = 'mark'; S.sel = null; renderTools(); renderTray(); setStatus('Modalità ✕: tocca le caselle dove sei sicuro che non ci sia nessuno.'); });
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
$('#story').addEventListener('click', () => $('#story').classList.toggle('open'));
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
  if (!store.get('gq2:seenRules', false) && !inv) openRules();
})();
