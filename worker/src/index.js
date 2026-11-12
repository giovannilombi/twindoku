// Server di Twindoku (Cloudflare Worker + database D1).
// Gestisce detective (soprannome + PIN), squadre, progressi e classifiche. Nessun dato personale.
import { CASES } from './cases.js';
import { starsOf, pointsOf, statsOf, badgesOf, dailyCase, romeDay, rankOf } from '../../js/gamify.js';

const CASE = new Map(CASES.map(c => [c[0], c]));
const AVATARS = ['🕵️', '🦊', '🐱', '🦉', '🐶', '🐼', '🦁', '🐸', '🐙', '🦄', '🐧', '🐢', '🐺', '🐯', '🐨', '🦝'];
const now = () => Math.floor(Date.now() / 1000);

/* ---------------- risposte ---------------- */
class Oops extends Error { constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; } }
const ALLOWED = [/^https:\/\/giovannilombi\.github\.io$/, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/];
function cors(req) {
  const o = req.headers.get('Origin') || '';
  return ALLOWED.some(r => r.test(o))
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : {};
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req) } });

/* ---------------- nomi: normalizzazione, somiglianze, parolacce ---------------- */
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '€': 'e' };
const ARTICLES = new Set(['i', 'il', 'lo', 'la', 'le', 'gli', 'l', 'the', 'un', 'una', 'uno']);
// "I Gatti Neri!", "gatti neri", "GATI NERI" e "gattineri" diventano tutti "gatineri".
function norm(s, dropArticles) {
  let t = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = [...t].map(c => LEET[c] || c).join('').replace(/[^a-z0-9]+/g, ' ').trim();
  let w = t.split(' ').filter(Boolean);
  if (dropArticles && w.length > 1 && ARTICLES.has(w[0])) w = w.slice(1);
  return w.join('').replace(/(.)\1+/g, '$1');
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Due nomi si confondono se, normalizzati, sono uguali o differiscono per 1 lettera (2 se lunghi).
const tooSimilar = (a, b) => a === b || lev(a, b) <= (Math.max(a.length, b.length) <= 6 ? 1 : 2);
// Radici scelte per non bloccare nomi innocui (Penelope, Figaro, Nazionale, Negri...).
const BAD = ['caz', 'merd', 'stronz', 'putan', 'troia', 'vafa', 'fancul', 'coglion', 'minchi', 'bastard', 'porcod', 'porcam', 'diocan', 'zocol', 'mignot',
  'frocio', 'ricchion', 'nazist', 'hitler', 'mussolini', 'fuck', 'shit', 'bitch', 'tete', 'culo', 'sesso', 'sex', 'porn', 'puzzon'];
const rude = n => BAD.some(w => n.includes(w));

function checkPlayerName(name) {
  if (typeof name !== 'string') throw new Oops('Scrivi un nome.');
  name = name.trim();
  if (/\s/.test(name)) throw new Oops('Il nome non può avere spazi. Puoi usare _ o - al posto dello spazio.');
  if (name.length < 3 || name.length > 16) throw new Oops('Il nome deve avere da 3 a 16 caratteri.');
  if (!/^[\p{L}\p{N}_.-]+$/u.test(name)) throw new Oops('Nel nome puoi usare solo lettere, numeri, _ . e -');
  const n = norm(name, false);
  if (n.length < 2) throw new Oops('Il nome deve avere almeno qualche lettera.');
  if (rude(n)) throw new Oops('Questo nome non va bene: scegline un altro.');
  return { name, norm: n };
}
function checkTeamName(name) {
  if (typeof name !== 'string') throw new Oops('Scrivi il nome della squadra.');
  name = name.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 24) throw new Oops('Il nome della squadra deve avere da 3 a 24 caratteri.');
  if (!/^[\p{L}\p{N} _.'!-]+$/u.test(name)) throw new Oops('Nel nome della squadra puoi usare lettere, numeri, spazi e _ . \' ! -');
  const n = norm(name, true);
  if (n.length < 2) throw new Oops('Il nome della squadra deve avere almeno qualche lettera.');
  if (rude(n)) throw new Oops('Questo nome non va bene: scegline un altro.');
  return { name, norm: n };
}
const checkPin = pin => { if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new Oops('Il PIN deve essere di 4 cifre.'); if (/^(\d)\1{3}$|^1234$|^4321$/.test(pin)) throw new Oops('Questo PIN è troppo facile da indovinare: scegline un altro.'); return pin; };
const checkPass = p => { if (typeof p !== 'string' || p.length < 4 || p.length > 40) throw new Oops('La password della squadra deve avere da 4 a 40 caratteri.'); return p; };

/* ---------------- crittografia ---------------- */
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randBytes = n => crypto.getRandomValues(new Uint8Array(n));
const randFrom = (n, abc) => { let s = ''; while (s.length < n) for (const x of randBytes(n)) if (x < 256 - (256 % abc.length) && s.length < n) s += abc[x % abc.length]; return s; };
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
// PIN, codici e password: PBKDF2 con sale casuale + "pepe" segreto del server (env.PEPPER).
async function hashSecret(env, secret, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PEPPER + '\u0000' + secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 5000 }, key, 256));
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function newSecret(env, secret) { const salt = hex(randBytes(12)); return { salt, hash: await hashSecret(env, secret, salt) }; }

const WORDS = ['LENTE', 'GUFO', 'PIPA', 'IMPRONTA', 'TACCUINO', 'CAPPELLO', 'BAULE', 'CHIAVE', 'LANTERNA', 'MAPPA', 'BUSSOLA', 'ENIGMA', 'INDIZIO', 'SEGRETO',
  'FARO', 'VOLPE', 'CORVO', 'TRENO', 'CASTELLO', 'NEBBIA', 'TORRE', 'OROLOGIO', 'SCALA', 'SPECCHIO', 'CANDELA', 'VALIGIA', 'BIGLIETTO', 'CODICE', 'FASCICOLO',
  'GATTO', 'LUPO', 'MUSEO', 'NAVE', 'TENDA', 'LAGO', 'PORTA', 'ARMADIO', 'PIUMA', 'TIMBRO', 'BOTOLA'];
const rnd = k => crypto.getRandomValues(new Uint32Array(1))[0] % k;
// es. LENTE-GUFO-73: facile da scrivere sul diario, circa 144.000 combinazioni (e i tentativi sono limitati)
const recoveryCode = () => `${WORDS[rnd(WORDS.length)]}-${WORDS[rnd(WORDS.length)]}-${rnd(90) + 10}`;
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const INVITE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ---------------- tentativi sbagliati ---------------- */
async function lockedUntil(db, keys) {
  if (!keys.length) return 0;
  const rows = (await db.prepare(`SELECT until FROM attempts WHERE k IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()).results;
  return Math.max(0, ...rows.map(r => r.until).filter(u => u > now()));
}
function lockMsg(until) { const m = Math.max(1, Math.ceil((until - now()) / 60)); return `Troppi tentativi sbagliati. Riprova tra ${m} ${m === 1 ? 'minuto' : 'minuti'}.`; }
// max errori in un'ora → blocco per lock secondi
async function failed(db, k, max, lock) {
  const t = now(), r = await db.prepare('SELECT fails, updated FROM attempts WHERE k = ?').bind(k).first();
  let fails = r && t - r.updated < 3600 ? r.fails + 1 : 1, until = 0;
  if (fails >= max) { until = t + lock; fails = 0; }
  await db.prepare('INSERT INTO attempts (k, fails, until, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(k) DO UPDATE SET fails = ?2, until = ?3, updated = ?4').bind(k, fails, until, t).run();
  return until;
}
const cleared = (db, k) => db.prepare('DELETE FROM attempts WHERE k = ?').bind(k).run();
async function guard(env, req, keyName, check, max = 5, lock = 900) {
  const ip = 'ip:' + (await sha256(env.PEPPER + (req.headers.get('CF-Connecting-IP') || '?'))).slice(0, 20);
  const until = await lockedUntil(env.DB, [keyName, ip]);
  if (until) throw new Oops(lockMsg(until), 429);
  if (await check()) { await cleared(env.DB, keyName); return true; }
  const u1 = await failed(env.DB, keyName, max, lock);
  await failed(env.DB, ip, 40, 3600); // da una stessa rete (es. una scuola) al massimo 40 errori l'ora
  return u1 ? lockMsg(u1) : false;
}

/* ---------------- sessioni ---------------- */
async function newSession(env, playerId) {
  const token = hex(randBytes(32));
  await env.DB.prepare('INSERT INTO sessions (token_hash, player_id, created) VALUES (?, ?, ?)').bind(await sha256(token), playerId, now()).run();
  return token;
}
async function auth(env, req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) throw new Oops('Devi entrare con il tuo detective.', 401);
  const p = await env.DB.prepare('SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?').bind(await sha256(m[1])).first();
  if (!p) throw new Oops('Sessione scaduta: rientra con nome e PIN.', 401);
  if (now() - p.last_seen > 3600) await env.DB.prepare('UPDATE players SET last_seen = ? WHERE id = ?').bind(now(), p.id).run();
  return p;
}

/* ---------------- progressi e statistiche ---------------- */
async function playerRows(env, id) {
  return (await env.DB.prepare('SELECT key, n, sc, stars, hints, secs, day, daily FROM progress WHERE player_id = ?').bind(id).all()).results;
}
const statsFor = (rows, p) => statsOf(rows, { total: CASES.length, team: !!p.team_id, today: romeDay() });

async function teamInfo(env, p) {
  if (!p.team_id) return null;
  const t = await env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(p.team_id).first();
  if (!t) return null;
  const members = (await env.DB.prepare('SELECT id, name, avatar, points, solved, last_seen FROM players WHERE team_id = ? ORDER BY points DESC, solved DESC, name').bind(t.id).all()).results;
  const daily = dailyCase(CASES);
  const dmap = new Map();
  if (daily && members.length) {
    const rows = (await env.DB.prepare(`SELECT player_id, stars, secs FROM progress WHERE key = ? AND player_id IN (${members.map(() => '?').join(',')})`).bind(daily[0], ...members.map(m => m.id)).all()).results;
    rows.forEach(r => dmap.set(r.player_id, { stars: r.stars, secs: r.secs }));
  }
  const captain = t.captain_id === p.id;
  return {
    name: t.name, captain, invite: t.invite, score: teamScore(members.map(m => m.points)),
    members: members.map(m => ({ id: m.id, name: m.name, avatar: m.avatar, points: m.points, solved: m.solved, rank: rankOf(m.points).name, rankIcon: rankOf(m.points).icon, captain: m.id === t.captain_id, me: m.id === p.id, daily: dmap.get(m.id) || null })),
  };
}
// Punteggio di squadra: media dei 5 detective migliori (le squadre piccole non sono svantaggiate).
const teamScore = pts => { const top = [...pts].sort((a, b) => b - a).slice(0, 5); return top.length ? Math.round(top.reduce((s, x) => s + x, 0) / top.length) : 0; };

async function me(env, p) {
  const rows = await playerRows(env, p.id), st = statsFor(rows, p), daily = dailyCase(CASES);
  return {
    player: { id: p.id, name: p.name, avatar: p.avatar, mustChange: !!p.must_change },
    solved: rows.map(r => [r.key, r.stars]),
    stats: { ...st, rank: rankOf(st.points) },
    badges: badgesOf(st),
    daily: daily ? { key: daily[0], id: daily[3] } : null,
    team: await teamInfo(env, p),
  };
}

async function saveProgress(env, p, items, imported) {
  if (!Array.isArray(items) || items.length > 500) throw new Oops('Dati non validi.');
  const before = badgesOf(statsFor(await playerRows(env, p.id), p));
  const today = romeDay(), daily = dailyCase(CASES), t = now();
  const stmts = [];
  for (const it of items) {
    const c = it && CASE.get(it.key);
    if (!c) continue; // caso che non esiste (o archivio vecchio): si ignora
    const hints = Math.max(0, Math.min(99, it.hints | 0)), secs = Math.max(0, Math.min(86400, it.secs | 0));
    const isDaily = !imported && daily && daily[0] === c[0] ? 1 : 0;
    stmts.push(env.DB.prepare(`INSERT INTO progress (player_id, key, n, sc, stars, hints, secs, day, daily, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(player_id, key) DO UPDATE SET hints = MIN(hints, ?6), stars = MAX(stars, ?5), secs = CASE WHEN secs = 0 THEN ?7 WHEN ?7 = 0 THEN secs ELSE MIN(secs, ?7) END`)
      .bind(p.id, c[0], c[1], c[2], starsOf(hints), hints, secs, today, isDaily, t));
  }
  if (stmts.length) {
    stmts.push(env.DB.prepare(`UPDATE players SET points = (SELECT COALESCE(SUM(n * stars), 0) FROM progress WHERE player_id = ?1),
      solved = (SELECT COUNT(*) FROM progress WHERE player_id = ?1), last_seen = ?2 WHERE id = ?1`).bind(p.id, t));
    await env.DB.batch(stmts);
  }
  const out = await me(env, p);
  out.newBadges = out.badges.filter(b => !before.includes(b));
  return out;
}

/* ---------------- squadre ---------------- */
async function findTeams(env, n) {
  const all = (await env.DB.prepare('SELECT id, name, norm FROM teams').all()).results;
  const exact = all.find(t => t.norm === n) || null;
  const similar = exact ? [] : all.filter(t => tooSimilar(t.norm, n)).map(t => t.name).slice(0, 3);
  return { exact, similar };
}
async function leaveTeam(env, p) {
  if (!p.team_id) return;
  const t = await env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(p.team_id).first();
  await env.DB.prepare('UPDATE players SET team_id = NULL WHERE id = ?').bind(p.id).run();
  p.team_id = null;
  if (!t) return;
  const left = await env.DB.prepare('SELECT id FROM players WHERE team_id = ? ORDER BY points DESC, created LIMIT 1').bind(t.id).first();
  if (!left) await env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(t.id).run(); // squadra vuota: si chiude
  else if (t.captain_id === p.id) await env.DB.prepare('UPDATE teams SET captain_id = ? WHERE id = ?').bind(left.id, t.id).run(); // nuovo capitano: il più bravo
}
async function joinTeam(env, p, t) {
  if (p.team_id === t.id) return;
  await leaveTeam(env, p);
  await env.DB.prepare('UPDATE players SET team_id = ? WHERE id = ?').bind(t.id, p.id).run();
  p.team_id = t.id;
}

/* ---------------- rotte ---------------- */
const routes = {
  'GET /api/ping': async () => ({ ok: true, day: romeDay() }),

  // controllo "dal vivo" mentre si scrive il nome
  'GET /api/name': async (env, req, url) => {
    const { norm: n } = checkPlayerName(url.searchParams.get('name') || '');
    const all = (await env.DB.prepare('SELECT name, norm FROM players').all()).results;
    const hit = all.find(x => tooSimilar(x.norm, n));
    return hit ? { ok: false, taken: hit.norm === n, similar: hit.name } : { ok: true };
  },

  'POST /api/signup': async (env, req, url, body) => {
    const { name, norm: n } = checkPlayerName(body.name);
    const pin = checkPin(body.pin);
    const avatar = AVATARS.includes(body.avatar) ? body.avatar : AVATARS[0];
    const all = (await env.DB.prepare('SELECT name, norm FROM players').all()).results;
    const hit = all.find(x => tooSimilar(x.norm, n));
    if (hit) throw new Oops(hit.norm === n ? `Il nome «${hit.name}» è già preso. Se sei tu, usa «Ho già un detective».` : `Esiste già un detective che si chiama «${hit.name}»: scegli un nome più diverso, così nessuno vi confonde.`, 409);
    const code = recoveryCode(), s1 = await newSecret(env, pin), s2 = await newSecret(env, normCode(code)), t = now();
    const r = await env.DB.prepare('INSERT INTO players (name, norm, avatar, pin_hash, pin_salt, rec_hash, rec_salt, created, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *')
      .bind(name, n, avatar, s1.hash, s1.salt, s2.hash, s2.salt, t, t).first();
    return { token: await newSession(env, r.id), recovery: code, ...(await me(env, r)) };
  },

  'POST /api/login': async (env, req, url, body) => {
    const name = String(body.name || '').trim(), n = norm(name, false);
    const pin = String(body.pin || '');
    const p = n ? await env.DB.prepare('SELECT * FROM players WHERE norm = ?').bind(n).first() : null;
    const ok = await guard(env, req, 'pin:' + n, async () => !!p && same(await hashSecret(env, pin, p.pin_salt), p.pin_hash));
    if (ok !== true) throw new Oops(typeof ok === 'string' ? ok : 'Nome o PIN sbagliati.', 401);
    return { token: await newSession(env, p.id), ...(await me(env, p)) };
  },

  'POST /api/recover': async (env, req, url, body) => {
    const n = norm(String(body.name || ''), false), code = normCode(body.code);
    const pin = checkPin(body.pin);
    const p = n ? await env.DB.prepare('SELECT * FROM players WHERE norm = ?').bind(n).first() : null;
    const ok = await guard(env, req, 'rec:' + n, async () => !!p && same(await hashSecret(env, code, p.rec_salt), p.rec_hash), 5, 3600);
    if (ok !== true) throw new Oops(typeof ok === 'string' ? ok : 'Nome o codice segreto sbagliati.', 401);
    const s = await newSecret(env, pin);
    await env.DB.batch([
      env.DB.prepare('UPDATE players SET pin_hash = ?, pin_salt = ?, must_change = 0 WHERE id = ?').bind(s.hash, s.salt, p.id),
      env.DB.prepare('DELETE FROM sessions WHERE player_id = ?').bind(p.id), // fuori da tutti gli altri dispositivi
    ]);
    return { token: await newSession(env, p.id), ...(await me(env, p)) };
  },

  'GET /api/me': async (env, req) => me(env, await auth(env, req)),

  'POST /api/logout': async (env, req) => {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
    if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
    return { ok: true };
  },

  'POST /api/pin': async (env, req, url, body) => {
    const p = await auth(env, req), pin = checkPin(body.pin);
    if (!p.must_change) {
      const ok = await guard(env, req, 'pin:' + p.norm, async () => same(await hashSecret(env, String(body.old || ''), p.pin_salt), p.pin_hash));
      if (ok !== true) throw new Oops(typeof ok === 'string' ? ok : 'Il PIN attuale è sbagliato.', 401);
    }
    const s = await newSecret(env, pin);
    await env.DB.prepare('UPDATE players SET pin_hash = ?, pin_salt = ?, must_change = 0 WHERE id = ?').bind(s.hash, s.salt, p.id).run();
    return { ok: true };
  },

  'POST /api/avatar': async (env, req, url, body) => {
    const p = await auth(env, req);
    if (!AVATARS.includes(body.avatar)) throw new Oops('Avatar non valido.');
    await env.DB.prepare('UPDATE players SET avatar = ? WHERE id = ?').bind(body.avatar, p.id).run();
    return { ok: true };
  },

  'POST /api/progress': async (env, req, url, body) => saveProgress(env, await auth(env, req), body.items, !!body.imported),

  // la squadra esiste? ce ne sono di simili?
  'GET /api/team/check': async (env, req, url) => {
    const { name, norm: n } = checkTeamName(url.searchParams.get('name') || '');
    const { exact, similar } = await findTeams(env, n);
    return { name, exists: !!exact, team: exact ? exact.name : null, similar };
  },

  'POST /api/team/create': async (env, req, url, body) => {
    const p = await auth(env, req);
    const { name, norm: n } = checkTeamName(body.name), pass = checkPass(body.password);
    const { exact, similar } = await findTeams(env, n);
    if (exact) throw new Oops(`La squadra «${exact.name}» esiste già: per entrarci serve la sua password.`, 409);
    if (similar.length) throw new Oops(`Esiste già la squadra «${similar[0]}». Se è la tua, entra in quella; altrimenti scegli un nome più diverso.`, 409, { similar });
    const s = await newSecret(env, pass);
    const t = await env.DB.prepare('INSERT INTO teams (name, norm, pass_hash, pass_salt, invite, captain_id, created) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
      .bind(name, n, s.hash, s.salt, randFrom(6, INVITE_ABC), p.id, now()).first();
    await joinTeam(env, p, t);
    return me(env, p);
  },

  'POST /api/team/join': async (env, req, url, body) => {
    const p = await auth(env, req);
    let t;
    if (body.invite) {
      t = await env.DB.prepare('SELECT * FROM teams WHERE invite = ?').bind(String(body.invite).toUpperCase()).first();
      if (!t) throw new Oops('Questo link d\'invito non vale più: chiedi al capitano quello nuovo.', 404);
    } else {
      const { norm: n } = checkTeamName(body.name);
      t = await env.DB.prepare('SELECT * FROM teams WHERE norm = ?').bind(n).first();
      if (!t) throw new Oops('Questa squadra non esiste.', 404);
      const ok = await guard(env, req, 'team:' + t.id + ':' + p.id, async () => same(await hashSecret(env, String(body.password || ''), t.pass_salt), t.pass_hash), 6, 900);
      if (ok !== true) throw new Oops(typeof ok === 'string' ? ok : 'Password della squadra sbagliata.', 401);
    }
    await joinTeam(env, p, t);
    return me(env, p);
  },

  'POST /api/team/leave': async (env, req) => { const p = await auth(env, req); await leaveTeam(env, p); return me(env, p); },

  // solo il capitano: nuovo link d'invito (quello vecchio smette di funzionare)
  'POST /api/team/invite': async (env, req) => {
    const p = await auth(env, req);
    const t = p.team_id && await env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(p.team_id).first();
    if (!t || t.captain_id !== p.id) throw new Oops('Solo il capitano può farlo.', 403);
    await env.DB.prepare('UPDATE teams SET invite = ? WHERE id = ?').bind(randFrom(6, INVITE_ABC), t.id).run();
    return me(env, p);
  },

  // solo il capitano: PIN temporaneo per un compagno che l'ha dimenticato
  'POST /api/team/reset-pin': async (env, req, url, body) => {
    const p = await auth(env, req);
    const t = p.team_id && await env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(p.team_id).first();
    if (!t || t.captain_id !== p.id) throw new Oops('Solo il capitano può farlo.', 403);
    const m = await env.DB.prepare('SELECT * FROM players WHERE id = ? AND team_id = ?').bind(body.playerId | 0, t.id).first();
    if (!m || m.id === p.id) throw new Oops('Questo detective non è nella tua squadra.', 404);
    let pin; do pin = randFrom(4, '0123456789'); while (/^(\d)\1{3}$/.test(pin));
    const s = await newSecret(env, pin);
    await env.DB.prepare('UPDATE players SET pin_hash = ?, pin_salt = ?, must_change = 1 WHERE id = ?').bind(s.hash, s.salt, m.id).run();
    await cleared(env.DB, 'pin:' + m.norm);
    return { pin, name: m.name };
  },

  // classifica delle squadre (solo nomi di squadra e punteggi, nessun nome di giocatore)
  'GET /api/teams': async (env, req) => {
    let mine = null;
    try { mine = (await auth(env, req)).team_id; } catch (e) { /* anche senza accesso */ }
    const rows = (await env.DB.prepare('SELECT t.id, t.name, p.points FROM teams t JOIN players p ON p.team_id = t.id').all()).results;
    const by = new Map();
    for (const r of rows) { if (!by.has(r.id)) by.set(r.id, { id: r.id, name: r.name, pts: [] }); by.get(r.id).pts.push(r.points); }
    const list = [...by.values()].map(t => ({ name: t.name, members: t.pts.length, score: teamScore(t.pts), mine: t.id === mine }))
      .sort((a, b) => b.score - a.score || b.members - a.members || a.name.localeCompare(b.name));
    list.forEach((t, i) => (t.pos = i + 1));
    return { teams: list.filter((t, i) => i < 30 || t.mine) };
  },
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url), fn = routes[`${req.method} ${url.pathname}`];
    if (!fn) return json(req, { error: 'Pagina non trovata.' }, 404);
    try {
      let body = {};
      if (req.method === 'POST') {
        const txt = await req.text();
        if (txt.length > 64 * 1024) throw new Oops('Richiesta troppo grande.', 413);
        try { body = txt ? JSON.parse(txt) : {}; } catch (e) { throw new Oops('Dati non validi.'); }
      }
      return json(req, await fn(env, req, url, body || {}));
    } catch (e) {
      if (e instanceof Oops) return json(req, { error: e.message, ...e.extra }, e.status);
      console.error(e);
      return json(req, { error: 'Qualcosa è andato storto sul server. Riprova tra poco.' }, 500);
    }
  },
};
