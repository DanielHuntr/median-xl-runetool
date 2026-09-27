// Dev check: node scripts/dev/preset-probe.mjs <preset id> <skill id> [ref id] — one preset
// skill's damage, count, the character stats it reads, with and without a referenced skill.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const { skillDamage } = await vite.ssrLoadModule("/src/planner/damage.js");
  const { againstTarget, typicalTarget } = await vite.ssrLoadModule("/src/planner/target.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const [pid, id, ref] = process.argv.slice(2);
  const preset = JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets.find((p) => p.id === pid);
  const run = (b, label) => {
    const c = computeCharacter(b, { engine, catalog, planner });
    const sb = { ...b, soft: c.soft, charStats: c.charStats };
    const d = skillDamage(id, { engine, build: b, skillBuild: sb, character: c });
    const vs = againstTarget(d, c, typicalTarget(planner.monsters, "Hell"), "Hell");
    console.log(`${label}: total ${d.total} all ${d.all} count ${JSON.stringify(d.count)} vs ${vs?.total}/${vs?.all} parts ${d.parts.map((p) => p.element + " " + p.range).join(", ")}`);
    console.log(`   DS ${c.s("deadly_strike")} pierce L${c.s("enemy_lightning_resistance")} F${c.s("enemy_fire_resistance")} | values ${JSON.stringify(engine.skillValues(sb, id)).slice(0, 400)}`);
    if (ref) console.log(`   ${ref} values ${JSON.stringify(engine.skillValues(sb, ref)).slice(0, 300)}`);
  };
  run(preset.build, "preset");
  if (ref) run({ ...preset.build, points: { ...preset.build.points, [ref]: 0 } }, `without ${ref}`);
} finally { await vite.close(); }
