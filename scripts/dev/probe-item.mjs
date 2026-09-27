// Dev check: node scripts/dev/probe-item.mjs <preset id> <skill id> "<item line>" — a preset
// skill's damage with and without an extra charm carrying the given stat line(s).
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
  const [pid, id, text] = process.argv.slice(2);
  const preset = JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets.find((p) => p.id === pid);
  const run = (b, label) => {
    const c = computeCharacter(b, { engine, catalog, planner });
    const d = skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
    const vs = againstTarget(d, c, typicalTarget(planner.monsters, "Hell"), "Hell");
    console.log(`${label}: ${d.parts.map((p) => `${p.element} ${p.range.join("-")}`).join(", ")} | vs ${vs?.total} | leech ${c.s("life_stolen_per_hit")}`);
  };
  run(preset.build, "preset");
  run({ ...preset.build, inventory: [...preset.build.inventory, { ref: "custom", custom: { name: "Probe", slotType: "charm", text } }] }, `+ "${text}"`);
} finally { await vite.close(); }
