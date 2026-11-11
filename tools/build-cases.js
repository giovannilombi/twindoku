// Pre-genera l'archivio dei casi: node tools/build-cases.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateCase } from '../js/engine.js';
import { SIZES } from '../js/data.js';

const PER_SIZE = { 5: 20, 6: 50, 7: 50, 8: 50, 9: 50, 10: 50, 11: 40, 12: 40, 13: 30, 14: 30 };
mkdirSync(new URL('../cases/', import.meta.url), { recursive: true });
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
  out.forEach((C, i) => { C.id = `${n}-${i + 1}`; delete C.effort; });
  writeFileSync(new URL(`../cases/${n}.json`, import.meta.url), JSON.stringify(out));
  index.push({ n, count: out.length });
  console.log(`${n}×${n}: ${out.length} casi in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
writeFileSync(new URL('../cases/index.json', import.meta.url), JSON.stringify(index));
