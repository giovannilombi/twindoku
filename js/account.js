// Detective (profili), server e sincronizzazione dei progressi.
// Sul dispositivo possono esserci più detective: si sceglie chi gioca, come i profili di una TV.
// Senza profilo si gioca lo stesso ("ospite"): i progressi restano solo su questo dispositivo.

export const API = (() => {
  try { const o = localStorage.getItem('tw:api'); if (o) return o; } catch (e) { /* ok */ }
  return 'https://twindoku-api.giovanni-lombi.workers.dev';
})();
export const AVATARS = ['🕵️', '🦊', '🐱', '🦉', '🐶', '🐼', '🦁', '🐸', '🐙', '🦄', '🐧', '🐢', '🐺', '🐯', '🐨', '🦝'];

const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage pieno o bloccato */ } };
const del = k => { try { localStorage.removeItem(k); } catch (e) { /* ok */ } };

/* ---------------- profili sul dispositivo ---------------- */
// tw:profiles = [{ id, name, avatar, token }]   tw:active = id del detective che gioca (null = ospite)
export const profiles = () => get('tw:profiles', []);
export const active = () => { const id = get('tw:active', null); return profiles().find(p => p.id === id) || null; };
export function setActive(id) { set('tw:active', id); }
function upsertProfile(p) {
  const list = profiles().filter(x => x.id !== p.id);
  list.push(p); set('tw:profiles', list);
}
export function forget(id) {
  set('tw:profiles', profiles().filter(x => x.id !== id));
  if (get('tw:active', null) === id) set('tw:active', null);
  Object.keys(localStorage).filter(k => k.startsWith(`tw:p${id}:`)).forEach(del);
}

// Chiavi di salvataggio: l'ospite usa quelle storiche (gq3:...), ogni detective le sue.
export const ns = k => { const a = active(); return a ? `tw:p${a.id}:${k}` : `gq3:${k}`; };

/* ---------------- server ---------------- */
export class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data || {}; } }
export async function api(method, path, body, token) {
  let r;
  try {
    r = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw new ApiError('Non riesco a collegarmi al server. Controlla la connessione e riprova.', 0); }
  let data = {};
  try { data = await r.json(); } catch (e) { /* risposta vuota */ }
  if (!r.ok) throw new ApiError(data.error || 'Qualcosa è andato storto. Riprova tra poco.', r.status, data);
  return data;
}
const authed = (method, path, body) => {
  const a = active();
  if (!a || !a.token) return Promise.reject(new ApiError('Entra con il tuo detective.', 401));
  return api(method, path, body, a.token).catch(e => { if (e.status === 401) dropToken(a.id); throw e; });
};
// sessione non più valida (es. PIN recuperato da un altro dispositivo): il profilo resta, ma va riaperto con il PIN
function dropToken(id) { const p = profiles().find(x => x.id === id); if (p) { delete p.token; upsertProfile(p); } }

/* ---------------- dati del detective (copia locale di /api/me) ---------------- */
export const meCache = () => { const a = active(); return a ? get(`tw:p${a.id}:me`, null) : null; };
function applyMe(me) {
  const a = profiles().find(x => x.id === me.player.id);
  if (a) upsertProfile({ ...a, name: me.player.name, avatar: me.player.avatar });
  set(`tw:p${me.player.id}:me`, me);
  // casi risolti e stelle nello stesso formato dell'ospite, così il resto del gioco non cambia
  const solved = new Set(get(`tw:p${me.player.id}:solved`, [])), stars = get(`tw:p${me.player.id}:stars`, {});
  for (const [k, s] of me.solved) { solved.add(k); stars[k] = Math.max(stars[k] || 0, s); }
  set(`tw:p${me.player.id}:solved`, [...solved]);
  set(`tw:p${me.player.id}:stars`, stars);
  return me;
}
// login / registrazione / recupero riusciti
export function signedIn(res) {
  upsertProfile({ id: res.player.id, name: res.player.name, avatar: res.player.avatar, token: res.token });
  setActive(res.player.id);
  return applyMe(res);
}

export const signup = (name, pin, avatar) => api('POST', '/api/signup', { name, pin, avatar }).then(r => ({ recovery: r.recovery, me: signedIn(r) }));
export const login = (name, pin) => api('POST', '/api/login', { name, pin }).then(signedIn);
export const recover = (name, code, pin) => api('POST', '/api/recover', { name, code, pin }).then(signedIn);
export const checkName = name => api('GET', '/api/name?name=' + encodeURIComponent(name));
export const refreshMe = () => authed('GET', '/api/me').then(applyMe);
export async function logout() {
  const a = active(); if (!a) return;
  if (a.token) api('POST', '/api/logout', null, a.token).catch(() => {});
  forget(a.id);
}
export const changePin = (pin, old) => authed('POST', '/api/pin', { pin, old });
export const changeAvatar = avatar => authed('POST', '/api/avatar', { avatar }).then(refreshMe);
export const teamCheck = name => api('GET', '/api/team/check?name=' + encodeURIComponent(name));
export const teamCreate = (name, password) => authed('POST', '/api/team/create', { name, password }).then(applyMe);
export const teamJoin = (name, password) => authed('POST', '/api/team/join', { name, password }).then(applyMe);
export const teamJoinInvite = invite => authed('POST', '/api/team/join', { invite }).then(applyMe);
export const teamLeave = () => authed('POST', '/api/team/leave').then(applyMe);
export const teamNewInvite = () => authed('POST', '/api/team/invite').then(applyMe);
export const teamResetPin = playerId => authed('POST', '/api/team/reset-pin', { playerId });
export const teamsBoard = () => { const a = active(); return api('GET', '/api/teams', null, a && a.token); };

/* ---------------- casi risolti: coda per quando si è offline ---------------- */
export function queueSolve(item) {
  const a = active(); if (!a) return;
  const q = get(`tw:p${a.id}:queue`, []).filter(x => x.key !== item.key);
  q.push(item); set(`tw:p${a.id}:queue`, q);
}
// Invia la coda. Restituisce la risposta del server (con newBadges) oppure null se non c'era niente o si è offline.
export async function flush(imported) {
  const a = active(); if (!a || !a.token) return null;
  const qk = `tw:p${a.id}:queue`, q = get(qk, []);
  if (!q.length) return null;
  try {
    const res = applyMe(await authed('POST', '/api/progress', { items: q, imported: !!imported }));
    const left = get(qk, []).filter(x => !q.some(y => y.key === x.key && y.hints === x.hints)); // arrivati nel frattempo
    set(qk, left);
    return res;
  } catch (e) { return null; }
}

// Casi risolti da ospite su questo dispositivo, da aggiungere al detective appena creato.
export function guestSolved() {
  const keys = get('gq3:solved', []);
  return keys.map(key => { const st = get(`gq3:case:${key}`, {}) || {}; return { key, hints: st.hints | 0, secs: st.elapsed | 0 }; });
}
export async function importGuest() {
  const items = guestSolved();
  items.forEach(queueSolve);
  set('gq2:imported', true);
  return flush(true);
}
export const guestImportOffered = () => get('gq2:imported', false);
export const markImportOffered = () => set('gq2:imported', true);

/* ---------------- inviti ---------------- */
export const pendingInvite = () => get('tw:invite', null);
export const setPendingInvite = code => (code ? set('tw:invite', code) : del('tw:invite'));
