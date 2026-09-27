// Reproduce the reported weapon comparison using the same character and skill calculations as the UI.
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const load = name => vite.ssrLoadModule(`/src/planner/${name}.js`);
try {
  const planner = JSON.parse(await readFile('public/planner/data.json', 'utf8'));
  const { createEngine } = await load('engine'), { createCatalog } = await load('items');
  const { computeCharacter, activeSlots } = await load('character');
  const { combatScore } = await load('combatScore'), { skillDamage } = await load('damage');
  const R = await load('recommend');
  const engine = createEngine(planner), catalog = createCatalog(await vite.ssrLoadModule('/src/data/index.js'), planner);
  const env = { engine, catalog, planner };
  for (const level of [93, 97]) {
    const build = JSON.parse(await readFile(`tests/fixtures/assassin-level-${level}-crucify.json`, 'utf8'));
    const profile = R.buildProfile(build, engine), character = computeCharacter(build, env);
    const recs = R.recommendForSlot('weapon', { ...env, build, character, profile, want: R.wantedStats(profile, character) }, 1000);
    console.log(`\nLevel ${level}; equipped dexterity ${character.attributes.dexterity.total}`);
    const rows = [];
    for (const state of [{ ref: 'rw:30', base: 'base:55', baseVariant: 3 }, ...[0, 1, 2, 3].map(variant => ({ ref: 'tu:84', variant }))]) {
      for (const enhanced of [false, true]) {
        let next = { ...build, gear: { ...build.gear, weapon: state } };
        if (enhanced) next.gear = R.suggestEnhancements({ ...env, build: next, computeCharacter, activeSlots, profile, only: 'weapon' }).gear;
        const c = computeCharacter(next, env), outcome = combatScore(next, c, engine, profile);
        const d = skillDamage('crucify', { engine, build: next, skillBuild: { ...next, soft: c.soft, charStats: c.charStats }, character: c });
        const item = catalog.resolve(next.gear.weapon, build.level);
        rows.push({ name: item.def.name, tier: state.variant == null ? 'staff' : state.variant + 1, enhanced,
          requiredDex: item.head.reqDex, requiredLevel: item.head.reqLevel, damageDisplay: d.total.join('–'),
          poisonSeconds: c.damage.weaponPoison?.seconds, offense: Math.round(outcome.damage), score: +outcome.score.toFixed(2) });
      }
    }
    console.table(rows);
    console.log('Unenhanced recommendations:', recs.slice(0, 5).map(r => ({ name: r.def.name, state: r.state, score: +r.score.toFixed(2) })));
    const enhanced = R.recommendForSlot('weapon', { ...env, build, character, profile, want: R.wantedStats(profile, character), weaponEnhancements: true }, 5);
    console.log('Enhanced recommendations:', enhanced.map(r => ({ name: r.def.name, tier: r.state.variant == null ? 'staff' : r.state.variant + 1, score: +r.score.toFixed(2) })));
  }
} finally { await vite.close(); }
