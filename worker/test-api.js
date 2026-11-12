// Prova completa del server. Solo sul database locale!
//   cd worker && npx wrangler dev --port 8787   (in un altro terminale)
//   node test-api.js
import { CASES } from './src/cases.js';
import { execSync } from 'node:child_process';

const API = process.env.API || 'http://127.0.0.1:8787';
if (!/127\.0\.0\.1|localhost/.test(API)) { console.error('Il test crea detective finti: usalo solo in locale.'); process.exit(1); }
const H = { Origin: 'http://127.0.0.1:8799', 'Content-Type': 'application/json' };
let fails = 0;
async function call(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { ...H, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), ...(await r.json()) };
}
const ok = (cond, msg, extra) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) { fails++; if (extra) console.log('   ', JSON.stringify(extra).slice(0, 300)); } };
const tag = Date.now().toString(36).slice(-4);

const a = await call('POST', '/api/signup', { name: `Aurora_${tag}`, pin: '2580', avatar: '🦉' });
ok(a.token && /^[A-Z]+-[A-Z]+-\d\d$/.test(a.recovery), 'registrazione con codice segreto', a);
ok(a.cors === H.Origin, 'CORS per il sito');
ok((await call('POST', '/api/signup', { name: `aur0ra_${tag}`, pin: '2580' })).status === 409, 'nome quasi uguale rifiutato');
ok((await call('POST', '/api/signup', { name: 'con spazio', pin: '2580' })).status === 400, 'nome con spazi rifiutato');
ok((await call('POST', '/api/signup', { name: `Merdaccia${tag}`, pin: '2580' })).status === 400, 'parolaccia rifiutata');
ok((await call('POST', '/api/signup', { name: `Pin_${tag}`, pin: '1111' })).status === 400, 'PIN troppo facile rifiutato');
const nm = await call('GET', `/api/name?name=AURORA_${tag}`);
ok(nm.ok === false && nm.taken, 'controllo nome dal vivo', nm);

const b = await call('POST', '/api/signup', { name: `Alessandro_${tag}`, pin: '1357', avatar: '🦊' });
ok(b.token, 'secondo detective');

// progressi
const [c1, c2, c3] = [CASES[0], CASES[30], CASES[CASES.length - 1]];
const p = await call('POST', '/api/progress', { items: [{ key: c1[0], hints: 0, secs: 100 }, { key: c3[0], hints: 3, secs: 900 }, { key: 'falso', hints: 0 }] }, a.token);
ok(p.stats.solved === 2 && p.stats.points === c1[1] * 3 + c3[1] * 1, 'punti = stelle × lato', p.stats);
ok(p.newBadges.includes('primo') && p.newBadges.includes('gigante'), 'distintivi nuovi', p.newBadges);
const p2 = await call('POST', '/api/progress', { items: [{ key: c3[0], hints: 0, secs: 1200 }] }, a.token);
ok(p2.stats.points === c1[1] * 3 + c3[1] * 3, 'si tiene il risultato migliore', p2.stats);
ok((await call('GET', '/api/me')).status === 401, 'senza accesso niente dati');

// login e blocco
ok((await call('POST', '/api/login', { name: `aurora_${tag}`, pin: '2580' })).token, 'accesso (maiuscole indifferenti)');
for (let i = 0; i < 4; i++) await call('POST', '/api/login', { name: `Aurora_${tag}`, pin: '0000' });
const lk = await call('POST', '/api/login', { name: `Aurora_${tag}`, pin: '0000' });
ok(lk.status === 429 || /Troppi/.test(lk.error), 'blocco dopo 5 PIN sbagliati', lk);
ok((await call('POST', '/api/login', { name: `Aurora_${tag}`, pin: '2580' })).status === 429, 'bloccato anche col PIN giusto');

// recupero con codice segreto
const rc = await call('POST', '/api/recover', { name: `aurora_${tag}`, code: a.recovery.toLowerCase().replace(/-/g, ' '), pin: '9024' });
ok(rc.token, 'recupero con codice segreto (scritto in minuscolo con spazi)', rc);
ok((await call('GET', '/api/me', null, a.token)).status === 401, 'dopo il recupero le vecchie sessioni sono chiuse');
const A = rc.token;

// squadre
const team = `I Gatti Neri ${tag}`;
const ck = await call('GET', `/api/team/check?name=${encodeURIComponent(team)}`);
ok(ck.exists === false && !ck.similar.length, 'squadra nuova', ck);
const tc = await call('POST', '/api/team/create', { name: team, password: 'micio' }, A);
ok(tc.team && tc.team.captain && /^[A-Z2-9]{6}$/.test(tc.team.invite), 'squadra creata, capitano e invito', tc);
ok(tc.badges.includes('squadra'), 'distintivo squadra');
const sim = await call('GET', `/api/team/check?name=${encodeURIComponent(`gati neri ${tag}`)}`);
ok(sim.exists === true && sim.team === team, 'nome normalizzato = stessa squadra', sim);
const sim2 = await call('GET', `/api/team/check?name=${encodeURIComponent(`Gatti Nere ${tag}`)}`);
ok(!sim2.exists && sim2.similar[0] === team, 'nome simile segnalato', sim2);
ok((await call('POST', '/api/team/create', { name: `Gatti Nere ${tag}`, password: 'xxxx' }, b.token)).status === 409, 'non si crea una squadra quasi uguale');
ok((await call('POST', '/api/team/join', { name: team, password: 'sbagliata' }, b.token)).status === 401, 'password sbagliata');
const j = await call('POST', '/api/team/join', { name: `i gatti neri ${tag}`, password: 'micio' }, b.token);
ok(j.team && j.team.members.length === 2 && !j.team.captain, 'entrato con password', j);
ok(!('invite' in j.team) || j.team.invite, 'invito visibile ai membri');

const c = await call('POST', '/api/signup', { name: `Carlo_${tag}`, pin: '4826' });
const ji = await call('POST', '/api/team/join', { invite: tc.team.invite.toLowerCase() }, c.token);
ok(ji.team && ji.team.members.length === 3, 'entrato con il link d\'invito', ji);
const ni = await call('POST', '/api/team/invite', null, A);
ok(ni.team.invite !== tc.team.invite, 'nuovo invito dal capitano');
ok((await call('POST', '/api/team/join', { invite: tc.team.invite }, b.token)).status === 404, 'il vecchio invito non vale più');
ok((await call('POST', '/api/team/invite', null, b.token)).status === 403, 'solo il capitano rigenera l\'invito');

// il capitano resetta il PIN
const bId = j.team.members.find(m => m.me).id;
const rp = await call('POST', '/api/team/reset-pin', { playerId: bId }, A);
ok(/^\d{4}$/.test(rp.pin), 'PIN temporaneo dal capitano', rp);
const bl = await call('POST', '/api/login', { name: `Alessandro_${tag}`, pin: rp.pin });
ok(bl.player && bl.player.mustChange, 'accesso col PIN temporaneo: deve cambiarlo', bl);
ok((await call('POST', '/api/pin', { pin: '6813' }, bl.token)).ok, 'nuovo PIN scelto');
ok((await call('POST', '/api/login', { name: `Alessandro_${tag}`, pin: '6813' })).token, 'accesso col nuovo PIN');

// classifiche e uscita
const tl = await call('GET', '/api/teams', null, A);
ok(tl.teams.some(t => t.name === team && t.mine && t.members === 3), 'classifica squadre', tl);
const lv = await call('POST', '/api/team/leave', null, A);
ok(lv.team === null, 'il capitano esce');
const me2 = await call('GET', '/api/me', null, c.token);
ok(me2.team && me2.team.members.length === 2 && me2.team.members.some(m => m.captain), 'nuovo capitano assegnato', me2.team);

// caso del giorno: chi non lo risolve lo ritrova più avanti (serve ALLOW_TEST_DAY=1 in .dev.vars)
execSync('npx wrangler d1 execute twindoku --local --command "DELETE FROM daily"', { stdio: 'ignore' });
const DH = d => ({ ...H, 'X-Test-Day': d });
const daily = async (d, token) => (await fetch(API + '/api/daily', { headers: DH(d) })).json();
const d1 = await daily('2030-01-01');
ok(d1.key && d1.id.startsWith('10-') && d1.day === '2030-01-01', 'caso del giorno 10×10', d1);
ok((await daily('2030-01-01')).key === d1.key, 'stesso caso per tutto il giorno');
// qualcuno lo risolve il primo giorno
await fetch(API + '/api/progress', { method: 'POST', headers: { ...DH('2030-01-01'), Authorization: 'Bearer ' + c.token }, body: JSON.stringify({ items: [{ key: d1.key, hints: 0, secs: 300 }] }) });
const d2 = await daily('2030-01-02');
ok(d2.key !== d1.key, 'giorno dopo: caso nuovo');
// nessuno risolve il caso del 2 gennaio
const d3 = await daily('2030-01-03');
ok(d3.key !== d2.key && d3.key !== d1.key, 'un caso non risolto non si ripete subito');
const d4 = await daily('2030-02-02');
ok(d4.key === d2.key, 'dopo 30 giorni torna il caso che nessuno aveva risolto', { d2, d4 });
const d5 = await daily('2030-03-15');
ok(d5.key !== d1.key, 'il caso risolto non torna', { d1, d5 });

console.log(fails ? `\n${fails} controlli falliti` : '\nTutto ok');
process.exit(fails ? 1 : 0);
