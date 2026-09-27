// Dev check: node scripts/dev/preset-diff.mjs <before.json> <preset id> — gear and key
// stats of one preset before and after regenerating.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const [beforeFile, id] = process.argv.slice(2);
  const pick = async (f) => JSON.parse(await readFile(f, "utf8")).presets.find((p) => p.id === id);
  for (const [label, p] of [["before", await pick(beforeFile)], ["after", await pick("src/data/preset-builds.json")]]) {
    const c = computeCharacter(p.build, { engine, catalog, planner });
    const s = (k) => Math.round(c.s(k));
    console.log(`${label}: energy ${c.attributes.energy.total} (base ${c.attributes.energy.base}), focus ${c.spellFocus.value}, +all skills ${c.allSkills}, class skills ${c.classSkills ?? "?"}, phys/magic SD ${s("physical_magic_spell_damage")}, life ${c.life.total}`);
    console.log("   " + Object.entries(c.equipped).map(([sl, r]) => `${sl}:${r.def.name}`).join(" "));
  }
} finally { await vite.close(); }
