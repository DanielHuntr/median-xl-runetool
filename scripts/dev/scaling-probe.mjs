// Dev check: node scripts/dev/scaling-probe.mjs <class> <skill id>… — a skill's values and
// damage at its cap and one point fewer (probe build as in preset-plan.mjs), with the game
// formulas that should drive them.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const data = await L("/src/data/index.js");
  const { createEngine } = await L("/src/planner/engine.js");
  const { createCatalog } = await L("/src/planner/items.js");
  const { computeCharacter } = await L("/src/planner/character.js");
  const { skillDamage } = await L("/src/planner/damage.js");
  const R = await L("/src/planner/recommend.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const [cls, ...ids] = process.argv.slice(2);
  for (const id of ids) {
    const b = { cls, level: 150, points: { [id]: 0 }, quests: {}, attrs: { strength: 400, dexterity: 400, vitality: 200, energy: 300 }, signets: 0,
      difficulty: "Hell", gear: {}, swap: false, inventory: [], buffs: [], leftSkill: id, rightSkill: null, skillBar: [] };
    b.points[id] = engine.maxLevel(b, id);
    const run = (bb) => {
      const c = computeCharacter(bb, { engine, catalog, planner });
      const sb = { ...bb, soft: c.soft, charStats: c.charStats };
      return { v: engine.skillValues(sb, id), d: skillDamage(id, { engine, build: bb, skillBuild: sb, character: c }) };
    };
    let x = run(b);
    if (x.d?.kind === "attack") {
      const c = computeCharacter(b, { engine, catalog, planner }), pr = R.buildProfile(b, engine);
      const w = R.recommendForSlot("weapon", { build: b, engine, catalog, planner, character: c, profile: pr, want: R.wantedStats(pr, c) }, 1)[0];
      if (w) b.gear = { weapon: w.state };
      x = run(b);
    }
    const y = run({ ...b, points: { ...b.points, [id]: b.points[id] - 1 } });
    const s = engine.skill(id), g = s.game || {};
    console.log(`\n== ${s.name} [${x.d?.kind}] tags ${s.tags.join(",")} | points ${b.points[id]} vs ${b.points[id] - 1}`);
    console.log(`  values N  : ${JSON.stringify(x.v)}`);
    console.log(`  values N-1: ${JSON.stringify(y.v)}`);
    console.log(`  damage N  : ${x.d?.parts?.map((p) => `${p.element} ${p.range}`).join(", ")} | N-1: ${y.d?.parts?.map((p) => `${p.element} ${p.range}`).join(", ")}`);
    console.log(`  MedianDB  : ${JSON.stringify(s.effect)} | ${JSON.stringify((s.constants || []).map((c) => `${c.key}=${c.values.filter(Boolean).join("|")}`))}`);
    console.log(`  game elem : ${JSON.stringify(g.elem && { t: g.elem.type, min: g.elem.min, max: g.elem.max, minLev: g.elem.minLev, maxLev: g.elem.maxLev, syn: g.elem.synergy?.text })}`);
    console.log(`  game phys : ${JSON.stringify(g.phys && { min: g.phys.min, max: g.phys.max, syn: g.phys.synergy?.text })} params ${JSON.stringify(g.params)} srcDam ${g.srcDam}`);
    console.log(`  game lines: ${JSON.stringify((g.lines || []).map((l) => [l.block, (l.textA || "").slice(0, 40), l.calcA?.text, l.calcB?.text].filter(Boolean).join("~")))}`);
    console.log(`  game calcs: ${JSON.stringify(Object.fromEntries(Object.entries(g.calcs || {}).map(([k, v]) => [k, v.text])))} vars ${JSON.stringify(Object.fromEntries(Object.entries(g.vars || {}).map(([k, v]) => [k, v.text])))}`);
  }
} finally { await vite.close(); }
