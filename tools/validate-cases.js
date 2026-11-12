// Controlla l'archivio dei casi: node tools/validate-cases.js
// Per ogni caso verifica: soluzione unica, ogni indizio vero, "accanto"/"in diagonale" mai attraverso un muro,
// regola del delitto (vittima + esattamente 1 altra persona nella stanza), una persona per riga/colonna,
// nessuno sopra un mobile bloccante, ogni personaggio citato in almeno un indizio, impronte (key) tutte diverse.
import { readFileSync } from 'node:fs';
import { hydrate, countSolutions, evalClue, nbrs } from '../js/engine.js';

const index = JSON.parse(readFileSync(new URL('../cases/index.json', import.meta.url)));
const keys = new Set();
let total = 0, errors = 0;
const fail = (C, msg) => { errors++; console.log(`✗ ${C.id}: ${msg}`); };

for (const { n } of index) {
  const list = JSON.parse(readFileSync(new URL(`../cases/${n}.json`, import.meta.url)));
  for (const C of list) {
    total++;
    const P = hydrate(C);
    if (keys.has(C.key)) fail(C, 'impronta duplicata'); keys.add(C.key);
    const rows = new Set(C.sol.map(c => (c / n) | 0)), cols = new Set(C.sol.map(c => c % n));
    if (rows.size !== n || cols.size !== n) fail(C, 'soluzione con due persone nella stessa riga/colonna');
    if (C.sol.some(c => P.blocked[c])) fail(C, 'qualcuno è sopra un mobile bloccante');
    const vr = P.room[C.sol[n - 1]];
    if (C.sol.filter(c => P.room[c] === vr).length !== 2 || P.room[C.sol[C.m]] !== vr) fail(C, 'regola del delitto violata');
    const u = countSolutions(P, C.clues, 2, 1e8);
    if (u !== 1) fail(C, u === -1 ? 'risolutore oltre il limite' : `soluzioni trovate: ${u}`);
    const mentioned = new Set();
    for (const cl of C.clues) {
      if (cl.a != null) mentioned.add(cl.a); if (cl.b != null) mentioned.add(cl.b);
      if (evalClue(cl, C.sol, P) !== true) fail(C, `indizio falso ${JSON.stringify(cl)}`);
      if (cl.t === 'u') for (const pr of cl.p) if (pr.k === 'near') {
        const c = C.sol[cl.a];
        if (!nbrs(c, n).some(m => P.items[m] === pr.it && P.room[m] === P.room[c])) fail(C, `"accanto" attraverso un muro ${JSON.stringify(cl)}`);
      }
      if (cl.t === 'diag' && P.room[C.sol[cl.a]] !== P.room[C.sol[cl.b]]) fail(C, '"in diagonale" attraverso un muro');
    }
    for (let p = 0; p < n; p++) if (!mentioned.has(p)) fail(C, `personaggio ${p} mai citato negli indizi`);
  }
  console.log(`${n}×${n}: ${list.length} casi controllati`);
}
console.log(errors ? `\n${errors} problemi su ${total} casi` : `\nTutto ok: ${total} casi validi`);
process.exit(errors ? 1 : 0);
