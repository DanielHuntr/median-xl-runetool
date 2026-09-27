// Rebuild the class-wide audit: node scripts/dev/audit-skill-interactions.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const data = JSON.parse(await readFile('public/planner/data.json', 'utf8'));
  const load = name => vite.ssrLoadModule(`/src/planner/${name}.js`);
  const { createEngine } = await load('engine'), { createCatalog } = await load('items');
  const { computeCharacter } = await load('character');
  const engine = createEngine(data), catalog = createCatalog(await vite.ssrLoadModule('/src/data/index.js'), data);
  const gameIds = new Map(Object.entries(data.skills).filter(([, s]) => s.game).map(([id, s]) => [s.game.gameId, id]));
  const report = [];
  for (const cls of engine.classNames) {
    const rows = [];
    for (const id of [...new Set(engine.tabs(cls).flatMap(tab => engine.treeNodes(cls, tab).map(s => s.id)))]) {
      const skill = engine.skill(id);
      const b = { cls, level: 120, points: {}, buffs: [id], attrs: { strength: 150, dexterity: 150, energy: 150, vitality: 150 },
        quests: {}, gear: {}, inventory: [], signets: 0, swap: false, difficulty: 'Normal' };
      const refs = new Set();
      for (const row of skill.constants) for (const raw of row.values)
        for (const match of raw.matchAll(/\[\[([\w-]+)\]\]/g)) if (match[1] !== id) refs.add(match[1]);
      for (const match of JSON.stringify(skill.game || {}).matchAll(/skill\((\d+)\)/g)) {
        const other = gameIds.get(Number(match[1]));
        if (other && other !== id) refs.add(other);
      }
      const samples = [];
      for (const points of [1, Math.max(1, engine.maxLevel(b, id))]) {
        b.points = { [id]: points };
        const c = computeCharacter(b, { engine, catalog, planner: data });
        const input = { ...b, soft: c.soft, charStats: c.charStats };
        const effects = engine.skillStatEffects(input, id);
        const unknown = engine.describe(input, id, points).effect.filter(line => line.status === 'unknown').map(line => line.text);
        samples.push({ points, stats: effects.map(([key]) => key), unknown,
          finite: Object.values(c.stats).every(stat => Number.isFinite(stat.total)),
          converged: !c.warnings.some(w => /circular dependencies/.test(w)) });
      }
      rows.push({ id, name: skill.name, tags: skill.tags, references: [...refs].sort(), samples });
    }
    report.push({ cls, rows });
  }
  const total = report.reduce((n, c) => n + c.rows.length, 0);
  const lines = ['# Skill interaction audit', '',
    `Dataset: installed game ${data.game.patch}; ${total} class-tree entries across all seven classes (shared skills appear in each applicable class).`, '',
    'Every entry below was evaluated at base level 1 and its level-120 base cap. This checks finite calculations and dependency convergence, not independent in-game verification of every value. Named regression tests in `tests/skill-effects.test.mjs` check cross-skill behavior and activation separately.', '',
    'Skill effects are evaluated from the equipment baseline until stable. Buffs, stances, morphs and summon auras require the Skill active toggle; passives apply automatically. One stance and one morph may be active at a time. Innate buffs need no spent points.', '',
    '## Limits that remain', '',
    '- Target-specific effects, proc uptime, charges, current-life thresholds, traps placed in another skill’s area, and minion AI are not a combat simulation. A finite formula is not proof that these mechanics are fully represented.',
    '- Examples needing more combat state include Witch Blood’s current-life thresholds, Vengeful Power after being hit, Cognition thresholds, Black Wind’s weapon-derived damage, Concentrated Effect’s area/damage tradeoff, and Catalyst Trap placement.',
    '- Some helper-skill effects are shown in the game tooltip but lack a character-sheet mapping. Formula references below record declared dependencies; they do not claim every helper effect is implemented.',
    '- Unknown game formulas remain marked unknown in the tooltip. Character damage and gear ranking remain estimates.', '',
    '## Regression cases', '',
    '- Assassin: Pinnacle +5 all skills at 25 hard points and its defense penalty; Anathema physical damage penalty; skill-level bonuses reach Way of the Spider and Crucify.',
    '- Amazon: Dragonlore weapon damage, Ecstatic Frenzy defense loss and added magic damage; summoned attack rating stays on the summon.',
    '- Barbarian: stance exclusivity and weapon damage feeding Heart of Stone.',
    '- Druid: morph-dependent bonuses and Growth feeding Primal Bond.',
    '- Necromancer: Death Pact tree bonuses and Famine using final attributes independent of allocation order.',
    '- Paladin: Stormlord attribute bonuses and Spark of Hope speed buffs.',
    '- Sorceress: Nova Charge base Dexterity feeds Energy and Blight; prohibited elemental damage is removed.', ''];
  for (const { cls, rows } of report) {
    lines.push(`## ${cls} (${rows.length})`, '', '| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |', '| --- | --- | --- | --- |');
    for (const row of rows) {
      const keys = [...new Set(row.samples.flatMap(s => s.stats))];
      const unknown = [...new Set(row.samples.flatMap(s => s.unknown))];
      const status = row.samples.every(s => s.finite && s.converged) ? 'Finite; converged' : 'NEEDS REVIEW';
      lines.push(`| ${row.name} | ${row.references.map(engine.skillName).join(', ') || '—'} | ${keys.join(', ') || 'None in this isolated sample'} | ${status}${unknown.length ? `; ${unknown.length} unknown tooltip lines` : ''} |`);
    }
    lines.push('');
  }
  await mkdir('docs', { recursive: true });
  await writeFile('docs/skill-interactions.md', lines.join('\n'));
  console.log(`${total} entries, ${total * 2} level samples; report: docs/skill-interactions.md`);
  const failures = report.flatMap(c => c.rows.filter(r => r.samples.some(s => !s.finite || !s.converged)));
  console.log('Numerical/convergence failures:', failures.map(r => r.id));
  if (failures.length) process.exitCode = 1;
} finally { await vite.close(); }
