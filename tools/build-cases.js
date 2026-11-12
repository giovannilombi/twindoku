// Pre-genera l'archivio dei casi: node tools/build-cases.js
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { generateCase } from '../js/engine.js';
import { SIZES } from '../js/data.js';

const PER_SIZE = { 5: 20, 6: 50, 7: 50, 8: 50, 9: 50, 10: 50, 11: 40, 12: 40, 13: 30, 14: 30 };
// Un file per caso (cases/<n>/<i>.json): il gioco scarica solo il caso che apri.
// cases/index.json è l'indice leggero: per ogni caso impronta e ambientazione (servono all'archivio e al server).
rmSync(new URL('../cases/', import.meta.url), { recursive: true, force: true });
const index = [];
for (const n of SIZES) {
  const out = [], seen = new Set();
  let seed = 1;
  const t0 = Date.now();
  while (out.length < PER_SIZE[n]) {
    const C = generateCase(n, seed++);
    if (!C || seen.has(C.room)) continue;
    seen.add(C.room);
    out.push(C);
  }
  // dal più facile al più difficile (sforzo del risolutore, poi numero di indizi al contrario)
  out.sort((a, b) => a.effort / (a.clues.length) - b.effort / (b.clues.length));
  // impronta del caso: i progressi salvati restano validi anche se l'archivio viene rigenerato
  const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  out.forEach((C, i) => { C.id = `${n}-${i + 1}`; C.key = `${n}.${fnv(C.room + '|' + C.sol.join(',') + '|' + JSON.stringify(C.items))}`; delete C.effort; });
  mkdirSync(new URL(`../cases/${n}/`, import.meta.url), { recursive: true });
  out.forEach((C, i) => writeFileSync(new URL(`../cases/${n}/${i + 1}.json`, import.meta.url), JSON.stringify(C)));
  index.push({ n, count: out.length, cases: out.map(C => [C.key, C.sc]) });
  console.log(`${n}×${n}: ${out.length} casi in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
writeFileSync(new URL('../cases/index.json', import.meta.url), JSON.stringify(index));
// Elenco dei casi per il server (worker/): serve a validare i progressi, calcolare i punti e il caso del giorno.
const rows = index.flatMap(x => x.cases.map(([key, sc], i) => `  ['${key}', ${x.n}, ${sc}, '${x.n}-${i + 1}'],`));
writeFileSync(new URL('../worker/src/cases.js', import.meta.url),
  `// File generato da tools/build-cases.js: non modificarlo a mano.\n// [impronta, dimensione, ambientazione, id]\nexport const CASES = [\n${rows.join('\n')}\n];\n`);
