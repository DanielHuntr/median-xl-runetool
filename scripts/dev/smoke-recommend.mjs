// Dev check: node scripts/dev/smoke-recommend.mjs
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const R = await vite.ssrLoadModule("/src/planner/recommend.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const base = { quests: {}, attrs: { strength: 100, dexterity: 300, vitality: 100, energy: 0 }, signets: 0, difficulty: "Hell", gear: {}, swap: false, inventory: [], buffs: [] };
  const builds = {
    "Amazon bow": { ...base, cls: "Amazon", level: 110, points: { trinity_arrow: 15, barrage: 20, dragonlore: 1, wyrmshot: 25, elemental_command: 1, keen_sight: 5 } },
    "Sorceress fire": { ...base, cls: "Sorceress", level: 110, attrs: { strength: 100, dexterity: 50, vitality: 150, energy: 150 }, points: { molten_core: 1, warmth: 10, flamefront: 25, overheat: 10, flamestrike: 20 } },
  };
  for (const [name, b] of Object.entries(builds)) {
    const character = computeCharacter(b, { engine, catalog, planner });
    const profile = R.buildProfile(b, engine);
    const want = R.wantedStats(profile, character);
    console.log(`\n=== ${name}:`, JSON.stringify(R.describeProfile(profile)));
    for (const slot of ["weapon", "amulet", "helm", "gloves"]) {
      const recs = R.recommendForSlot(slot, { build: b, engine, catalog, planner, character, profile, want }, 4);
      console.log(`  ${slot}:`);
      for (const x of recs) console.log(`    ${x.score.toFixed(1).padStart(5)}  ${x.def.name} (${x.def.kindLabel}${x.def.cat ? ", " + x.def.cat : ""}) — ${x.reasons.join(" · ")}${x.warnings.length ? "  [" + x.warnings.join(", ") + "]" : ""}`);
    }
  }
} finally {
  await vite.close();
}
