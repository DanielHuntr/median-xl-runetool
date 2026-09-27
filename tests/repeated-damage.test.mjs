import test from 'node:test';
import assert from 'node:assert/strict';
import { damageCount, repeatedParts } from '../src/planner/damage.js';
import { againstTarget } from '../src/planner/target.js';
test('repeat wording supports fixed, ranged, multiline and upper-bound counts', () => {
  for (const text of ['Casts 25 times', 'Shoots 25 times', 'Fires 25 times', 'Releases 25 times', 'Strikes 25 times', 'Hits 25 times']) assert.equal(damageCount([{ text }]).n, 25);
  assert.deepEqual(damageCount([{ text: '7-8 hits per Attack' }]), { min: 7, n: 8, text: '7-8 hits per Attack' });
  assert.equal(damageCount([{ text: '7 hits per target\n4 targets' }]).n, 7, 'targets do not multiply damage to one enemy');
  assert.equal(damageCount([{ text: 'Up to 13 hits per cast' }]).min, 1);
  assert.equal(damageCount([{ text: 'Hits up to 8 times per Wraith' }]).n, 8);
  assert.equal(damageCount([{ text: '16 projectiles per nova' }]).n, 16);
});
test('unknown counts, proc chance, bonus projectiles and hit rates never become fixed repeat totals', () => {
  for (const text of ['Hits multiple times', '13 hits per second', 'Spark Trail hits 13 times per second', '15% Chance to Cast Black Wind on striking', '+1 Projectile per 5 Skill Levels', '(+3 projectiles while Vampiric Icon is present)']) assert.equal(damageCount([{ text }]), null, text);
  assert.equal(damageCount([{ text: 'Casts 25 times', status: 'unknown' }]), null);
});
test('repeat aggregation and resistance totals apply once, preserve hit ranges, and do not stack poison', () => {
  const parts = [{ element: 'fire', range: [100, 200] }, { element: 'poison', range: [50, 80] }];
  const count = { min: 7, n: 8, text: '7-8 hits per attack' };
  assert.deepEqual(repeatedParts(parts, count).map(p => p.range), [[700, 1600], [50, 80]]);
  const target = { res: { fire: [50, 50, 50], poison: [0, 0, 0] } };
  const result = againstTarget({ kind: 'attack', parts, count }, { s: () => 0 }, target, 'Hell');
  assert.deepEqual(result.total, [100, 180]);
  assert.deepEqual(result.all, [400, 880]);
});
