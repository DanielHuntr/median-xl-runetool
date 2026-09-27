import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { distinctTargets, mainTargets } from '../src/planner/target.js';
const { monsters } = JSON.parse(await readFile(new URL('../public/planner/data.json', import.meta.url), 'utf8'));
test('Afflicted records collapse in Hell but retain different levels in Normal and Nightmare', () => {
  const records = monsters.filter(m => m.name === 'Afflicted');
  assert.equal(records.length, 2);
  assert.equal(distinctTargets(records, 'Hell').length, 1);
  assert.equal(distinctTargets(records, 'Normal').length, 2);
  assert.equal(distinctTargets(records, 'Nightmare').length, 2);
  assert.equal(records.length, 2, 'underlying IDs remain available');
});
test('different resistance or monster type remains a separate target', () => {
  const m = monsters.find(m => m.name === 'Afflicted');
  const resistant = { ...m, id: 99990, res: { ...m.res, fire: [0, 0, 50] } };
  const boss = { ...m, id: 99991, boss: true };
  assert.equal(distinctTargets([m, { ...m, id: 99989 }, resistant, boss], 'Hell').length, 3);
});
test('the short list is bosses only, one row per name, and no recipe text', () => {
  assert.ok(monsters.every(m => !m.name.includes('Cube with') && !m.name.includes('Purify to')), 'no recipe tooltips as names');
  const main = mainTargets(monsters, 'Hell');
  assert.ok(main.length > 50 && main.length < distinctTargets(monsters, 'Hell').length / 4, `${main.length} bosses`);
  assert.ok(main.every(m => m.boss));
  assert.equal(new Set(main.map(m => m.name)).size, main.length);
  for (const name of ['Andariel', 'Duriel', 'Mephisto', 'Diablo', 'Baal']) assert.ok(main.some(m => m.name === name), name);
  const baal = main.find(m => m.name === 'Baal');
  const all = distinctTargets(monsters, 'Hell').filter(m => m.name === 'Baal' && m.boss);
  assert.equal(baal.levels[2], Math.max(...all.map(m => m.levels[2])), 'the highest-level version');
});
