import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEngine } from '../src/planner/engine.js';
import { probePointScaling } from '../scripts/lib/point-scaling.mjs';

test('Frigid Domain rounding plateaus do not hide its point scaling', async () => {
  const data = JSON.parse(await readFile(new URL('../public/planner/data.json', import.meta.url), 'utf8'));
  const engine = createEngine(data);
  const damageAt = (n) => engine.skillValues({ cls: 'Druid', level: 150,
    points: { frigid_domain: n }, soft: { frigid_domain: 25 }, quests: {} }, 'frigid_domain').cold_damage[1];
  assert.equal(damageAt(10), damageAt(7), 'three fewer points stay on the same rounded value');
  const result = probePointScaling(10, damageAt(10), damageAt);
  assert.ok(result.scales);
  assert.ok(result.fewer < 7);
});

test('point scaling still rejects constant and reversed damage', () => {
  assert.equal(probePointScaling(10, 171, () => 171).scales, false);
  assert.equal(probePointScaling(10, 171, () => 172).scales, false);
  assert.equal(probePointScaling(10, 171, n => n === 7 ? 172 : 100).scales, false);
});
