// Facce dei personaggi: disegni originali generati dal nome e dal ruolo (stessa persona = stessa faccia, sempre).
// Lo sfondo colorato lo mette chi le usa (il colore della persona, lo stesso del nome negli indizi).

const SKINS = ['#f6d3b8', '#f2c9a5', '#e9b98f', '#d9a074', '#b9774a', '#8e5a3a'];
const HAIRS = ['#1c1c28', '#2a2018', '#5a3418', '#7a3b1d', '#a8552a', '#e0a22e', '#c9c4bd', '#b8322a'];
const SHIRTS = ['#ffffff', '#2b2b33', '#ff8a2a', '#dff3ff', '#5a9a4f', '#ffd23f', '#7fb7ff', '#f3b6c8'];
const FST = ['long', 'bob', 'pony', 'bun', 'curly'], MST = ['short', 'curly', 'cap', 'bald', 'quiff'];
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const cache = {};

// p = { name, role, g }  →  stringa SVG (viewBox 48×48, sfondo trasparente)
export function face(p) {
  const id = p.name + '|' + p.role;
  if (cache[id]) return cache[id];
  const h0 = hash(id), pick = (a, s) => a[(h0 >>> s) % a.length];
  const skin = pick(SKINS, 0), h = pick(HAIRS, 5), shirt = pick(SHIRTS, 11), style = pick(p.g === 'f' ? FST : MST, 17);
  const glasses = (h0 >>> 23) % 4 === 0, beard = p.g === 'm' && (h0 >>> 26) % 4 === 0;
  let back = '', front = '', extra = '';
  if (style === 'long') {
    back = `<path d="M11.5 39c-1.5-8-1-12 .5-18C13 12 18 7.5 24 7.5S35 12 36 21c1.5 6 2 10 .5 18z" fill="${h}"/>`;
    front = `<path d="M14.4 21c.5-7 4.6-10.5 9.6-10.5s9.1 3.5 9.6 10.5c-4-.6-7-2.8-9-6-2.2 3.2-5.8 5.4-10.2 6z" fill="${h}"/>`;
  }
  if (style === 'short') front = `<path d="M14.2 21.5C13.2 12.5 18 7.5 24.5 8c6 .4 10.3 5 9.3 13.5-1.2-3.6-3-5.8-9.8-5.8s-8.6 2.2-9.8 5.8z" fill="${h}"/>`;
  if (style === 'quiff') front = `<path d="M14.2 21.5C13 13 16 9 21 8.5c1-3 7-4 10-1 3 2.6 3.6 8 2.8 14-1.4-4-3.4-6-9.8-6s-8.6 2-9.8 6z" fill="${h}"/>`;
  if (style === 'curly') {
    front = [[16, 14.5, 4.6], [21, 11, 5], [27, 11, 5], [32, 14.5, 4.6], [14.6, 19.5, 3.4], [33.4, 19.5, 3.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${h}"/>`).join('') + `<path d="M16 16h16v-4H16z" fill="${h}"/>`;
    if (p.g === 'f') back = `<circle cx="13" cy="26" r="4.5" fill="${h}"/><circle cx="35" cy="26" r="4.5" fill="${h}"/>`;
  }
  if (style === 'cap') {
    const y = shirt === '#ffd23f';
    front = `<path d="M14 18.5c0-7.2 4.4-10.8 10-10.8s10 3.6 10 10.8z" fill="${y ? '#d43d3d' : '#ffd23f'}"/><path d="M13 18h18c5 0 8 1.2 9 3.4H13z" fill="${y ? '#a3271f' : '#f2a900'}"/>`;
  }
  if (style === 'bald') front = `<path d="M14.4 21c-.3-2.5 0-4.6.8-6.2.4 2 .3 4-.8 6.2zM33.6 21c.3-2.5 0-4.6-.8-6.2-.4 2-.3 4 .8 6.2z" fill="${h}"/>`;
  if (style === 'bob') {
    back = `<rect x="12" y="7.5" width="24" height="26" rx="11" fill="${h}"/>`;
    front = `<path d="M14.4 19.5c0-6 4.2-9.6 9.6-9.6s9.6 3.6 9.6 9.6c-6.2 1.6-13 1.6-19.2 0z" fill="${h}"/>`;
  }
  if (style === 'pony') {
    back = `<circle cx="36.5" cy="25" r="4.6" fill="${h}"/>`;
    front = `<path d="M14.4 20c.6-6.5 4.6-9.5 9.6-9.5s9 3 9.6 9.5c-6-1.5-13-1.5-19.2 0z" fill="${h}"/>`;
  }
  if (style === 'bun') {
    back = `<circle cx="24" cy="7.5" r="4.8" fill="${h}"/>`;
    front = `<path d="M14.4 20.5c.2-6.8 4.4-10 9.6-10s9.4 3.2 9.6 10c-3.5-3-6-4-9.6-4s-6.1 1-9.6 4z" fill="${h}"/>`;
  }
  if (beard) extra += `<path d="M15.5 25.5c1 6 4.5 8 8.500 8s7.5-2 8.500-8c-2.500 2.200-5 3-8.500 3s-6-.8-8.500-3z" fill="${h}"/>`;
  if (glasses) extra += `<g fill="rgba(255,255,255,.4)" stroke="#2b2118" stroke-width="1.2"><circle cx="20" cy="22.8" r="3.3"/><circle cx="28" cy="22.8" r="3.3"/><path d="M23.3 22.8h1.4" fill="none"/></g>`;
  const mouth = beard
    ? '<path d="M21.2 28.200q2.800 1.800 5.600 0" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>'
    : '<path d="M20.8 27.2q3.2 2.600 6.400 0" fill="none" stroke="#2b2118" stroke-width="1.4" stroke-linecap="round"/>';
  return (cache[id] = `<svg class="face" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 50c0-11 7.5-15.500 18-15.500S42 39 42 50z" fill="${shirt}"/><rect x="20.5" y="29" width="7" height="8" rx="2.5" fill="${skin}"/>${back}<ellipse cx="24" cy="22" rx="9.6" ry="10.6" fill="${skin}"/>${front}<circle cx="20" cy="22.8" r="1.35" fill="#2b2118"/><circle cx="28" cy="22.8" r="1.35" fill="#2b2118"/>${extra}${mouth}</svg>`);
}
