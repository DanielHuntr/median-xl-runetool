import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const root = new URL('../../', import.meta.url);
const planner = JSON.parse(await readFile(new URL('public/planner/data.json', root), 'utf8'));
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const load = p => server.ssrLoadModule(p);
  const { createEngine } = await load('/src/planner/engine.js');
  const { createCatalog } = await load('/src/planner/items.js');
  const { computeCharacter } = await load('/src/planner/character.js');
  const { skillDamage } = await load('/src/planner/damage.js');
  const engine = createEngine(planner), catalog = createCatalog(await load('/src/data/index.js'), planner);
  const rows = [], failures = [];
  for (const [id, s] of Object.entries(planner.skills)) {
    const source = [...s.effect, ...s.description, ...(s.game?.lines || []).map(l => l.textA || '')].join('\n');
    if (!/\bhits?\b|\btimes\b|\bbeams?\b|\bprojectiles?\b|\{\{(?:minions|bolts|missiles|charged_bolts|releases_bolts|shoots_times|total_bolts)\}\}/i.test(source)) continue;
    const results = [];
    for (const points of [1, s.max || 1]) {
      const b = { cls: s.class, level: 150, points: { [id]: points }, attrs: {}, buffs: [], gear: { weapon: { ref: 'custom', custom: { slotType: 'weapon', text: 'Two-Hand Damage: 100 to 200' } } }, inventory: [], quests: {}, difficulty: 'Hell' };
      const c = computeCharacter(b, { engine, catalog, planner });
      const d = skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
      if (d?.count) {
        if (!d.all?.every(Number.isFinite) || d.all.some((n, i) => n !== d.allParts.reduce((sum, p) => sum + p.range[i], 0))) failures.push(id);
        results.push(`${points} points: ${d.count.min || d.count.n}–${d.count.n} (${d.count.text.replace(/\n/g, '; ')})`);
      } else results.push(`${points} points: ${d?.kind === 'summon' ? 'summon; no player-hit multiplier' : !d?.total ? 'no direct damage model' : 'per hit/cast only; no numeric repeat total'}`);
    }
    const wording = source.split('\n').filter(l => /hits?|times|beams?|projectiles?|\{\{(?:minions|bolts|missiles|shoots_times|total_bolts)/i.test(l)).join('; ');
    rows.push(`| ${s.class} | ${s.name} | ${wording.replace(/\|/g, '/')} | ${results.join('<br>')} |`);
  }
  await writeFile(new URL('docs/repeated-damage-audit.md', root), `# Repeated damage audit\n\nScans all imported skills, sampling first and maximum base level at character level 150. Repeat totals describe potential if all listed hits land, not guaranteed single-target damage or DPS. Ranges preserve minimum/maximum hit counts. Poison is not stacked per hit. Unknown frequency, conditional bonuses, proc chances, summons, and vague “multiple hits” are not invented as fixed multipliers. Independent in-game hit testing is still needed to establish overlap and timing. Gear scoring continues to use per-hit/cast damage.\n\n${rows.length} candidate skills; ${failures.length} aggregation failures.\n\n| Class | Skill | Source wording | Result |\n|---|---|---|---|\n${rows.join('\n')}\n`);
  console.log(`${rows.length} skills with count-related wording; ${failures.length} aggregation failures.`);
  if (failures.length) throw new Error(failures.join(', '));
} finally { await server.close(); }
