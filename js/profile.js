// Interfaccia dei detective: chi gioca, registrazione, accesso, recupero PIN, taccuino, squadre, distintivi.
import * as acc from './account.js';
import { BADGES, RANKS, rankOf } from './gamify.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const caseLabel = id => { const [n, i] = id.split('-'); return `${n}×${n} n° ${i}`; };
const PIN = (name, label, extra = '') => `<label class="fld"><span>${label}</span><input name="${name}" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required placeholder="••••" ${extra}></label>`;

export function initProfile(ctx) {
  const { openModal, closeModal, setStatus } = ctx;
  const modal = $('#modal');
  let afterSignIn = null; // cosa fare dopo l'accesso (es. entrare nella squadra dell'invito)

  /* ---------------- pulsante in alto ---------------- */
  function renderButton() {
    const a = acc.active(), b = $('#profileBtn');
    if (!b) return;
    b.innerHTML = a ? `<span class="av">${a.avatar}</span><span class="lbl">${esc(a.name)}</span>` : `<span class="av">👤</span><span class="lbl">Entra</span>`;
    b.setAttribute('aria-label', a ? `Taccuino di ${a.name}` : 'Scegli il tuo detective');
    b.classList.toggle('guest', !a);
  }

  /* ---------------- messaggini ---------------- */
  function toast(html, ms = 4200) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html;
    t.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }
  const err = (form, msg) => { const e = form.querySelector('.form-err'); if (e) { e.textContent = msg; e.hidden = !msg; } };
  async function busy(form, fn) {
    const btns = form.querySelectorAll('button'); btns.forEach(b => (b.disabled = true)); err(form, '');
    try { return await fn(); } catch (e) { err(form, e.message || 'Qualcosa è andato storto.'); return undefined; } finally { btns.forEach(b => (b.disabled = false)); }
  }

  /* ---------------- chi gioca? ---------------- */
  function who(msg) {
    const list = acc.profiles(), a = acc.active();
    openModal(`<h2>Chi indaga oggi?</h2>
      ${msg ? `<p class="note">${msg}</p>` : '<p>Scegli il tuo detective: i casi risolti, i punti e i distintivi restano tuoi, anche su un altro telefono o computer.</p>'}
      ${list.length ? `<div class="who">${list.map(p => `<button type="button" class="whob${a && a.id === p.id ? ' on' : ''}" data-pa="pick" data-id="${p.id}"><span class="av">${p.avatar}</span><b>${esc(p.name)}</b>${p.token ? '' : '<small>serve il PIN</small>'}</button>`).join('')}</div>` : ''}
      <div class="row">
        <button type="button" class="btn primary" data-pa="signup" data-focus>➕ Nuovo detective</button>
        <button type="button" class="btn" data-pa="login">Ho già un detective</button>
        ${a ? '' : '<button type="button" class="btn ghost" data-close>Gioca senza profilo</button>'}
        ${a ? '<button type="button" class="btn ghost" data-pa="guest">Gioca senza profilo</button>' : ''}
      </div>`);
  }
  function pick(id) {
    const p = acc.profiles().find(x => x.id === id);
    if (!p) return;
    if (!p.token) return loginForm(p.name, 'Per sicurezza serve di nuovo il PIN.');
    acc.setActive(id); renderButton(); ctx.reload(); closeModal();
    setStatus(`Ciao ${esc(p.name)}! Buona indagine.`);
    acc.refreshMe().then(me => { renderButton(); mustChangeCheck(me); }).catch(() => {});
    acc.flush();
    runAfterSignIn();
  }

  /* ---------------- nuovo detective ---------------- */
  function signupForm() {
    openModal(`<h2>Nuovo detective</h2>
      <form data-form="signup" autocomplete="off">
        <label class="fld"><span>Nome da detective</span><input name="name" required minlength="3" maxlength="16" placeholder="es. Volpe_Rossa" data-focus autocapitalize="off" spellcheck="false"></label>
        <p class="hint" id="nameHint">Senza spazi, da 3 a 16 caratteri. <b>Non usare nome e cognome veri</b>: inventa un soprannome!</p>
        <fieldset class="avs"><legend>Scegli il tuo avatar</legend>${acc.AVATARS.map((x, i) => `<label><input type="radio" name="avatar" value="${x}"${i === 0 ? ' checked' : ''}><span>${x}</span></label>`).join('')}</fieldset>
        <div class="fld2">${PIN('pin', 'PIN segreto (4 cifre)')}${PIN('pin2', 'Ripeti il PIN')}</div>
        <p class="form-err" hidden></p>
        <div class="row"><button class="btn primary">Crea il detective</button><button type="button" class="btn ghost" data-pa="who">Indietro</button></div>
      </form>
      <p class="hint">Non chiediamo email né dati personali: solo il soprannome e i casi risolti.</p>`);
    modal.querySelector('input[name=name]').focus();
  }
  let nameTimer = 0;
  function liveName(input) {
    clearTimeout(nameTimer);
    const h = $('#nameHint'), v = input.value.trim();
    if (/\s/.test(v)) { h.innerHTML = '⚠️ Niente spazi: usa _ o - al loro posto.'; return; }
    if (v.length < 3) { h.innerHTML = 'Senza spazi, da 3 a 16 caratteri. <b>Non usare nome e cognome veri</b>: inventa un soprannome!'; return; }
    nameTimer = setTimeout(() => acc.checkName(v).then(r => {
      if (input.value.trim() !== v) return;
      h.innerHTML = r.ok ? '✓ Nome libero!' : r.taken ? `⚠️ «${esc(r.similar)}» è già preso. Se sei tu, torna indietro e scegli «Ho già un detective».` : `⚠️ Esiste già «${esc(r.similar)}»: scegli un nome più diverso, così nessuno vi confonde.`;
    }).catch(e => { if (input.value.trim() === v) h.innerHTML = '⚠️ ' + esc(e.message); }), 450);
  }
  async function doSignup(form) {
    const f = new FormData(form);
    if (f.get('pin') !== f.get('pin2')) return err(form, 'I due PIN non sono uguali.');
    const r = await busy(form, () => acc.signup(String(f.get('name')).trim(), f.get('pin'), f.get('avatar')));
    if (!r) return;
    renderButton(); ctx.reload();
    showRecovery(r.recovery, () => offerImport(() => { closeModal(); celebrateWelcome(); runAfterSignIn(); }));
  }
  function showRecovery(code, next) {
    openModal(`<div class="big" aria-hidden="true">🗝️</div><h2>Il tuo codice segreto</h2>
      <p>Se un giorno dimentichi il PIN, con questo codice ne scegli uno nuovo. <b>Scrivilo sul diario o fagli una foto</b>: non te lo mostreremo più!</p>
      <p class="code">${esc(code)}</p>
      <label class="check"><input type="checkbox" id="codeOk"> L'ho scritto (o fotografato)</label>
      <div class="row"><button type="button" class="btn primary" id="codeNext" disabled>Avanti</button></div>`);
    $('#codeOk').addEventListener('change', e => { $('#codeNext').disabled = !e.target.checked; });
    $('#codeNext').addEventListener('click', next);
  }
  function offerImport(next) {
    const items = acc.guestSolved();
    if (!items.length || acc.guestImportOffered()) return next();
    openModal(`<h2>Casi già risolti</h2>
      <p>Su questo dispositivo sono stati risolti <b>${items.length}</b> ${items.length === 1 ? 'caso' : 'casi'} senza profilo. Li hai risolti tu? Se sì, li aggiungo al tuo taccuino con i loro punti.</p>
      <div class="row"><button type="button" class="btn primary" id="impYes">Sì, sono miei</button><button type="button" class="btn" id="impNo">No, non sono miei</button></div>`);
    $('#impYes').addEventListener('click', async () => { $('#impYes').disabled = true; const r = await acc.importGuest(); ctx.reload(); if (r) celebrate(r, null, true); next(); });
    $('#impNo').addEventListener('click', () => { acc.markImportOffered(); next(); });
  }
  function celebrateWelcome() {
    const a = acc.active();
    toast(`<b>${a.avatar} Ciao ${esc(a.name)}, il tuo taccuino è pronto!</b><br>Il tuo grado: 🔰 Recluta. Risolvi casi per fare carriera.`);
  }

  /* ---------------- accesso e recupero ---------------- */
  function loginForm(name = '', msg = '') {
    openModal(`<h2>Entra con il tuo detective</h2>
      ${msg ? `<p class="note">${esc(msg)}</p>` : ''}
      <form data-form="login" autocomplete="off">
        <label class="fld"><span>Nome da detective</span><input name="name" required value="${esc(name)}" autocapitalize="off" spellcheck="false" ${name ? '' : 'data-focus'}></label>
        ${PIN('pin', 'PIN', name ? 'data-focus' : '')}
        <p class="form-err" hidden></p>
        <div class="row"><button class="btn primary">Entra</button><button type="button" class="btn ghost" data-pa="who">Indietro</button></div>
      </form>
      <p class="hint"><a href="#" data-pa="recover">Ho dimenticato il PIN</a></p>`);
    (modal.querySelector('[data-focus]') || modal.querySelector('input')).focus();
  }
  async function doLogin(form) {
    const f = new FormData(form);
    const me = await busy(form, () => acc.login(String(f.get('name')).trim(), f.get('pin')));
    if (!me) return;
    renderButton(); ctx.reload(); acc.flush();
    if (mustChangeCheck(me)) return;
    closeModal(); setStatus(`Ciao di nuovo, ${esc(me.player.name)}! Buona indagine.`);
    runAfterSignIn();
  }
  function recoverForm() {
    const name = modal.querySelector('input[name=name]')?.value || '';
    openModal(`<h2>PIN dimenticato?</h2>
      <p>Nessun problema, hai due strade:</p>
      <ol><li>Usa il <b>codice segreto</b> che hai ricevuto quando hai creato il detective (es. LENTE-GUFO-73).</li>
      <li>Oppure chiedi al <b>capitano della tua squadra</b>: dal suo taccuino può darti un PIN temporaneo.</li></ol>
      <form data-form="recover" autocomplete="off">
        <label class="fld"><span>Nome da detective</span><input name="name" required value="${esc(name)}" autocapitalize="off" spellcheck="false"></label>
        <label class="fld"><span>Codice segreto</span><input name="code" required placeholder="PAROLA-PAROLA-00" autocapitalize="characters" spellcheck="false"></label>
        <div class="fld2">${PIN('pin', 'Nuovo PIN')}${PIN('pin2', 'Ripeti il nuovo PIN')}</div>
        <p class="form-err" hidden></p>
        <div class="row"><button class="btn primary">Scegli il nuovo PIN</button><button type="button" class="btn ghost" data-pa="login">Indietro</button></div>
      </form>`);
    modal.querySelector(name ? 'input[name=code]' : 'input[name=name]').focus();
  }
  async function doRecover(form) {
    const f = new FormData(form);
    if (f.get('pin') !== f.get('pin2')) return err(form, 'I due PIN non sono uguali.');
    const me = await busy(form, () => acc.recover(String(f.get('name')).trim(), f.get('code'), f.get('pin')));
    if (!me) return;
    renderButton(); ctx.reload(); closeModal();
    toast(`<b>✓ Nuovo PIN salvato.</b> Ciao ${esc(me.player.name)}!`);
    runAfterSignIn();
  }
  function mustChangeCheck(me) {
    if (!me || !me.player.mustChange) return false;
    openModal(`<h2>Scegli un nuovo PIN</h2>
      <p>Sei entrato con il PIN temporaneo del capitano. Ora scegline uno tuo, che sai solo tu.</p>
      <form data-form="newpin" autocomplete="off">
        <div class="fld2">${PIN('pin', 'Nuovo PIN', 'data-focus')}${PIN('pin2', 'Ripeti il PIN')}</div>
        <p class="form-err" hidden></p>
        <div class="row"><button class="btn primary">Salva</button></div>
      </form>`);
    modal.querySelector('input').focus();
    return true;
  }
  async function doNewPin(form) {
    const f = new FormData(form);
    if (f.get('pin') !== f.get('pin2')) return err(form, 'I due PIN non sono uguali.');
    const ok = await busy(form, () => acc.changePin(f.get('pin'), f.get('old') || undefined));
    if (!ok) return;
    await acc.refreshMe().catch(() => {});
    if (form.dataset.back) return notebook('✓ PIN cambiato.');
    closeModal(); toast('<b>✓ PIN salvato.</b> Buona indagine!'); runAfterSignIn();
  }

  /* ---------------- taccuino del detective ---------------- */
  async function notebook(msg) {
    const a = acc.active();
    if (!a) return who();
    if (!a.token) return loginForm(a.name, 'Per sicurezza serve di nuovo il PIN.');
    let me = acc.meCache();
    if (me) drawNotebook(me, msg);
    else openModal('<h2 id="nbLoading">Apro il taccuino…</h2>');
    const old = JSON.stringify(me);
    try {
      me = await acc.refreshMe(); renderButton();
      // ridisegno solo se è cambiato qualcosa e il taccuino è ancora aperto (senza interrompere chi sta scrivendo)
      const open = !$('#overlay').hidden && modal.querySelector('.nb, #nbLoading');
      const typing = document.activeElement && modal.contains(document.activeElement) && document.activeElement.matches('input');
      if (open && (modal.querySelector('#nbLoading') || (JSON.stringify(me) !== old && !typing))) drawNotebook(me, msg);
    }
    catch (e) { if (!me) openModal(`<h2>Taccuino</h2><p class="note">${esc(e.message)}</p><div class="row"><button class="btn" data-close>Chiudi</button></div>`); if (e.status === 401) loginForm(a.name, 'Per sicurezza serve di nuovo il PIN.'); }
  }
  function drawNotebook(me, msg) {
    const st = me.stats, r = rankOf(st.points), next = r.next;
    const pct = next ? Math.round(((st.points - r.min) / (next.min - r.min)) * 100) : 100;
    const total = ctx.cases().length || st.total;
    const daily = me.daily || acc.dailyToday();
    const dDone = daily && me.solved.some(([k]) => k === daily.key);
    const streak = st.streak.current;
    openModal(`<div class="nb">
      ${msg ? `<p class="note ok">${esc(msg)}</p>` : ''}
      <div class="nb-head">
        <button type="button" class="nb-av" data-pa="avatar" title="Cambia avatar">${me.player.avatar}</button>
        <div><h2>${esc(me.player.name)}</h2>
          <p class="rank">${r.icon} <b>${r.name}</b> · ${st.points} punti</p>
          <div class="bar-out" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="bar-in" style="width:${pct}%"></div></div>
          <p class="hint">${next ? `Ancora <b>${next.min - st.points}</b> punti per diventare ${next.icon} <b>${next.name}</b>. Ogni caso vale stelle × lato della mappa.` : 'Hai raggiunto il grado più alto!'}</p>
        </div>
      </div>
      <div id="avPick" hidden class="avs">${acc.AVATARS.map(x => `<button type="button" data-pa="setav" data-av="${x}">${x}</button>`).join('')}</div>
      <div class="nb-stats">
        <div><b>${st.solved}</b><small>casi risolti su ${total}</small></div>
        <div><b>${st.noHint}</b><small>senza aiuti</small></div>
        <div><b>${streak ? '🔥 ' + streak : '–'}</b><small>${streak ? (streak === 1 ? 'giorno di gioco' : 'giorni di fila') + (st.streak.playedToday ? '' : ': gioca oggi!') : 'serie di giorni'}</small></div>
        <div><b>${me.badges.length}/${BADGES.length}</b><small>distintivi</small></div>
      </div>
      ${daily ? `<div class="nb-daily"><span>📅 <b>Caso del giorno</b>: ${caseLabel(daily.id)}${dDone ? ' — risolto ✓' : ''}</span><button type="button" class="btn ${dDone ? '' : 'primary'}" data-open="${daily.id}">${dDone ? 'Rivedi' : 'Gioca'}</button></div>` : ''}
      <h3>Distintivi</h3>
      <div class="badges">${BADGES.map(b => { const on = me.badges.includes(b.id); return `<div class="badge${on ? ' on' : ''}" title="${esc(b.desc)}"><span>${on ? b.icon : '🔒'}</span><b>${b.name}</b><small>${b.desc}</small></div>`; }).join('')}</div>
      <h3>Squadra</h3>
      <div id="teamBox">${teamHTML(me)}</div>
      <h3>Gradi</h3>
      <p class="ranks">${RANKS.map(x => `<span class="${x.name === r.name ? 'on' : st.points >= x.min ? 'done' : ''}">${x.icon} ${x.name} <small>${x.min}</small></span>`).join('')}</p>
      <div class="row">
        <button type="button" class="btn primary" data-close>Torna al caso</button>
        <button type="button" class="btn" data-pa="who">Cambia detective</button>
        <button type="button" class="btn ghost" data-pa="pinform">Cambia PIN</button>
        <button type="button" class="btn ghost" data-pa="logout">Esci da questo dispositivo</button>
      </div></div>`, true);
  }

  /* ---------------- squadra ---------------- */
  const inviteUrl = code => `${location.origin}${location.pathname}#squadra-${code}`;
  function teamHTML(me) {
    const t = me.team;
    if (!t) return `<p>Non sei in nessuna squadra. Entra in quella dei tuoi amici o creane una nuova: la classifica di squadra è la media dei 5 detective più bravi.</p>${teamFindForm()}`;
    const daily = me.daily;
    return `<div class="team-head"><b class="tname">🛡️ ${esc(t.name)}</b><span>Punteggio di squadra: <b>${t.score}</b></span></div>
      <ol class="members">${t.members.map(m => `<li class="${m.me ? 'me' : ''}"><span class="av">${m.avatar}</span><span class="nm"><b>${esc(m.name)}</b>${m.captain ? ' <small class="cap">capitano</small>' : ''}<small>${m.rankIcon} ${m.rank} · ${m.solved} casi</small></span>
        <span class="pts">${m.points}<small>punti</small></span>
        ${daily ? `<span class="dly" title="Caso del giorno">${m.daily ? `📅 ${m.daily.secs ? fmt(m.daily.secs) : '✓'}` : '📅 –'}</span>` : ''}
        ${t.captain && !m.me ? `<button type="button" class="btn ghost sm" data-pa="resetpin" data-id="${m.id}" data-name="${esc(m.name)}" title="PIN temporaneo">🔑</button>` : ''}</li>`).join('')}</ol>
      <div class="invite"><span>Link per invitare amici nella squadra:</span><code>${esc(inviteUrl(t.invite))}</code>
        <div class="row"><button type="button" class="btn" data-pa="copyinv">📋 Copia link</button>${navigator.share ? '<button type="button" class="btn" data-pa="shareinv">📤 Condividi</button>' : ''}${t.captain ? '<button type="button" class="btn ghost" data-pa="newinv">Nuovo link</button>' : ''}</div>
        <p class="hint">Chi apre il link entra senza password.${t.captain ? ' Se il link è finito alla persona sbagliata, crea un nuovo link: il vecchio smette di funzionare.' : ''}</p></div>
      <div id="pinBox"></div>
      <div class="row"><button type="button" class="btn" data-pa="teams">🏆 Classifica delle squadre</button><button type="button" class="btn ghost" data-pa="changeteam">Cambia squadra</button><button type="button" class="btn ghost" data-pa="leave">Esci dalla squadra</button></div>
      <div id="teamsBoard"></div><div id="teamFind" hidden>${teamFindForm()}</div>`;
  }
  const teamFindForm = () => `<form data-form="teamfind" autocomplete="off" class="inline">
      <label class="fld"><span>Nome della squadra</span><input name="team" required minlength="3" maxlength="24" placeholder="es. I Gatti Neri"></label>
      <button class="btn primary">Cerca</button></form><p class="form-err" hidden></p><div id="teamRes"></div>`;
  async function doTeamFind(form) {
    const name = String(new FormData(form).get('team')).trim();
    const box = $('#teamRes'), e = form.nextElementSibling;
    e.hidden = true;
    let r;
    try { r = await acc.teamCheck(name); } catch (x) { e.textContent = x.message; e.hidden = false; return; }
    if (r.exists) box.innerHTML = joinForm(r.team, `La squadra «${esc(r.team)}» esiste. Scrivi la sua password per entrare (te la dice chi l'ha creata), oppure usa il link d'invito.`);
    else if (r.similar.length) box.innerHTML = `<p class="note">Esiste già ${r.similar.map(s => `«<b>${esc(s)}</b>»`).join(', ')}. È la tua squadra?</p>
        <div class="row">${r.similar.map(s => `<button type="button" class="btn" data-pa="pickteam" data-name="${esc(s)}">Sì, entra in «${esc(s)}»</button>`).join('')}</div>
        <p class="hint">Se è un'altra squadra, scegli un nome più diverso: questo si confonderebbe.</p>`;
    else box.innerHTML = `<p class="note">La squadra «<b>${esc(r.name)}</b>» non esiste ancora. Vuoi crearla? Diventerai il capitano.</p>
      <form data-form="teamcreate" autocomplete="off"><input type="hidden" name="name" value="${esc(r.name)}">
        <label class="fld"><span>Password della squadra</span><input name="password" type="text" required minlength="4" maxlength="40" placeholder="almeno 4 caratteri" autocapitalize="off" spellcheck="false"></label>
        <p class="hint">La dirai agli amici che vuoi in squadra. Oppure gli mandi il link d'invito, che trovi dopo.</p>
        <p class="form-err" hidden></p><button class="btn primary">Crea la squadra</button></form>`;
    box.querySelector('input:not([type=hidden])')?.focus();
  }
  const joinForm = (name, txt) => `<p class="note">${txt}</p><form data-form="teamjoin" autocomplete="off"><input type="hidden" name="name" value="${esc(name)}">
      <label class="fld"><span>Password della squadra</span><input name="password" type="text" required autocapitalize="off" spellcheck="false"></label>
      <p class="form-err" hidden></p><button class="btn primary">Entra in squadra</button></form>`;
  async function doTeam(form, kind) {
    const f = new FormData(form), before = acc.meCache();
    const me = await busy(form, () => (kind === 'create' ? acc.teamCreate(f.get('name'), f.get('password')) : acc.teamJoin(f.get('name'), f.get('password'))));
    if (!me) return;
    drawNotebook(me, kind === 'create' ? `Squadra «${me.team.name}» creata! Sei il capitano: manda il link d'invito ai tuoi amici.` : `Sei entrato nella squadra «${me.team.name}»!`);
    celebrate({ ...me, newBadges: me.badges.filter(b => !(before?.badges || []).includes(b)) }, null, true);
  }
  async function showTeams() {
    const box = $('#teamsBoard'); box.innerHTML = '<p class="hint">Carico la classifica…</p>';
    try {
      const { teams } = await acc.teamsBoard();
      box.innerHTML = teams.length ? `<ol class="board-teams">${teams.map(t => `<li class="${t.mine ? 'me' : ''}"><span class="pos">${t.pos}</span><b>${esc(t.name)}</b><small>${t.members} ${t.members === 1 ? 'detective' : 'detective'}</small><span class="pts">${t.score}</span></li>`).join('')}</ol>` : '<p class="hint">Nessuna squadra ancora.</p>';
    } catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
  }

  /* ---------------- inviti ---------------- */
  function runAfterSignIn() { const f = afterSignIn; afterSignIn = null; if (f) f(); else handleInvite(); }
  async function handleInvite() {
    const code = acc.pendingInvite();
    if (!code) return;
    const a = acc.active();
    if (!a || !a.token) {
      afterSignIn = handleInvite;
      return who('🛡️ <b>Sei stato invitato in una squadra!</b> Prima scegli o crea il tuo detective, poi entri in squadra.');
    }
    try {
      const before = acc.meCache();
      const me = await acc.teamJoinInvite(code);
      acc.setPendingInvite(null);
      drawNotebook(me, `Sei entrato nella squadra «${me.team.name}»!`);
      celebrate({ ...me, newBadges: me.badges.filter(b => !(before?.badges || []).includes(b)) }, null, true);
    } catch (e) {
      acc.setPendingInvite(null);
      if (e.status) toast(`<b>⚠️ ${esc(e.message)}</b>`, 6000);
    }
  }

  /* ---------------- festeggiamenti ---------------- */
  // res = risposta del server dopo un caso risolto; before = dati di prima (per capire se è salito di grado)
  function celebrate(res, before, quiet) {
    renderButton();
    const nb = res.newBadges || [];
    nb.forEach((id, i) => { const b = BADGES.find(x => x.id === id); if (b) setTimeout(() => toast(`<span class="tb">${b.icon}</span><b>Nuovo distintivo: ${b.name}!</b><br><small>${b.desc}</small>`), 600 + i * 900); });
    const r0 = before ? rankOf(before.stats.points) : null, r1 = rankOf(res.stats.points);
    if (r0 && r1.level > r0.level) setTimeout(() => toast(`<span class="tb">${r1.icon}</span><b>Promozione! Ora sei ${r1.name}!</b>`, 6000), 300);
    const x = $('#winExtra');
    if (x && !quiet) {
      const next = r1.next;
      x.innerHTML = `<p class="progress" style="margin:6px 0 0">${r1.icon} ${r1.name} · ${res.stats.points} punti${next ? ` · ne mancano ${next.min - res.stats.points} per ${next.icon} ${next.name}` : ''}${res.stats.streak.current > 1 ? ` · 🔥 ${res.stats.streak.current} giorni di fila` : ''}</p>`;
    }
  }

  /* ---------------- eventi ---------------- */
  modal.addEventListener('click', async e => {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    e.preventDefault();
    const act = b.dataset.pa;
    if (act === 'pick') return pick(+b.dataset.id);
    if (act === 'signup') return signupForm();
    if (act === 'login') return loginForm(modal.querySelector('input[name=name]')?.value || '');
    if (act === 'recover') return recoverForm();
    if (act === 'who') return who();
    if (act === 'guest') { acc.setActive(null); renderButton(); ctx.reload(); closeModal(); return setStatus('Giochi senza profilo: i progressi restano solo su questo dispositivo.'); }
    if (act === 'avatar') { $('#avPick').hidden = !$('#avPick').hidden; return; }
    if (act === 'setav') { try { const me = await acc.changeAvatar(b.dataset.av); renderButton(); drawNotebook(me); } catch (x) { toast(esc(x.message)); } return; }
    if (act === 'logout') {
      if (b.dataset.sure) { await acc.logout(); renderButton(); ctx.reload(); return who('Detective tolto da questo dispositivo. I suoi progressi restano salvati: per riaverlo basta «Ho già un detective».'); }
      b.dataset.sure = '1'; b.textContent = 'Sicuro? Tocca ancora'; return;
    }
    if (act === 'pinform') {
      openModal(`<h2>Cambia PIN</h2><form data-form="newpin" data-back="1" autocomplete="off">${PIN('old', 'PIN attuale', 'data-focus')}<div class="fld2">${PIN('pin', 'Nuovo PIN')}${PIN('pin2', 'Ripeti il nuovo PIN')}</div>
        <p class="form-err" hidden></p><div class="row"><button class="btn primary">Salva</button><button type="button" class="btn ghost" data-pa="notebook">Indietro</button></div></form>`);
      return modal.querySelector('input').focus();
    }
    if (act === 'notebook') return notebook();
    if (act === 'copyinv' || act === 'shareinv') {
      const url = modal.querySelector('.invite code').textContent;
      if (act === 'shareinv') return navigator.share({ title: 'Twindoku: Cold Case', text: 'Entra nella mia squadra di detective!', url }).catch(() => {});
      try { await navigator.clipboard.writeText(url); b.textContent = '✓ Copiato!'; } catch (x) { b.textContent = 'Selezionalo e copialo a mano'; }
      return;
    }
    if (act === 'newinv') { try { drawNotebook(await acc.teamNewInvite(), 'Nuovo link creato: quello vecchio non funziona più.'); } catch (x) { toast(esc(x.message)); } return; }
    if (act === 'leave') {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Sicuro? Tocca ancora'; return; }
      try { drawNotebook(await acc.teamLeave(), 'Sei uscito dalla squadra. I tuoi punti restano tuoi.'); } catch (x) { toast(esc(x.message)); } return;
    }
    if (act === 'changeteam') { const f = $('#teamFind'); f.hidden = false; f.querySelector('input').focus(); return; }
    if (act === 'teams') return showTeams();
    if (act === 'pickteam') { $('#teamRes').innerHTML = joinForm(b.dataset.name, `Scrivi la password della squadra «${esc(b.dataset.name)}».`); return $('#teamRes input[name=password]').focus(); }
    if (act === 'resetpin') {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Nuovo PIN?'; return; }
      try {
        const r = await acc.teamResetPin(+b.dataset.id);
        $('#pinBox').innerHTML = `<p class="note ok">Il PIN temporaneo di <b>${esc(r.name)}</b> è <b class="code sm">${r.pin}</b>. Diglielo a voce: al prossimo accesso dovrà sceglierne uno nuovo.</p>`;
      } catch (x) { toast(esc(x.message)); }
    }
  });
  modal.addEventListener('submit', e => {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    e.preventDefault();
    const k = form.dataset.form;
    if (k === 'signup') doSignup(form);
    else if (k === 'login') doLogin(form);
    else if (k === 'recover') doRecover(form);
    else if (k === 'newpin') doNewPin(form);
    else if (k === 'teamfind') doTeamFind(form);
    else if (k === 'teamcreate') doTeam(form, 'create');
    else if (k === 'teamjoin') doTeam(form, 'join');
  });
  modal.addEventListener('input', e => { if (e.target.matches('form[data-form=signup] input[name=name]')) liveName(e.target); });

  $('#profileBtn').addEventListener('click', () => (acc.active() ? notebook() : who()));

  /* ---------------- avvio ---------------- */
  function start() {
    renderButton();
    const a = acc.active();
    if (a && a.token) {
      acc.refreshMe().then(me => { renderButton(); mustChangeCheck(me); }).catch(() => {});
      acc.flush().then(r => r && celebrate(r, null, true));
    }
    if (acc.pendingInvite()) return handleInvite();
    // all'avvio, se su questo dispositivo ci sono più detective (o nessuno ancora), chiedo chi gioca, una volta per sessione
    let asked = false;
    try { asked = sessionStorage.getItem('tw:asked') === '1'; sessionStorage.setItem('tw:asked', '1'); } catch (x) { /* ok */ }
    const seenRules = (() => { try { return localStorage.getItem('gq2:seenRules') === 'true'; } catch (x) { return true; } })();
    if (!asked && seenRules && (acc.profiles().length > 1 || (!a && !acc.profiles().length && !localStorage.getItem('tw:askedOnce')))) {
      try { localStorage.setItem('tw:askedOnce', '1'); } catch (x) { /* ok */ }
      who();
    }
  }

  return { start, celebrate, handleInvite, notebook, toast, renderButton };
}
