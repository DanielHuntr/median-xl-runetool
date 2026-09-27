// Dev check: node scripts/dev/superior-check.mjs — a Superior Greaves (4) at +47% Enhanced
// Defense against the in-game item (1,206 defense), and the item's own defense breakdown.
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
  const g = catalog.all().find((d) => d.kind === "base" && d.name === "Greaves");
  const variant = g.variants.findIndex((v) => v.label === "Tier 4");
  const b = (boots) => ({ cls: "Barbarian", level: 120, points: {}, quests: {}, attrs: { strength: 500, dexterity: 0, vitality: 0, energy: 0 }, signets: 0, difficulty: "Hell", gear: { boots }, swap: false, inventory: [], buffs: [] });
  for (const [label, st] of [["normal", { ref: g.key, variant }], ["superior +47%", { ref: g.key, variant, superior: 2, rolls: [1, 0.48] }]]) {
    const c = computeCharacter(b(st), { engine, catalog, planner });
    console.log(label.padEnd(14), "character defense", c.defense.total, "| items", JSON.stringify(c.defense.items ?? c.defense.sources ?? Object.keys(c.defense)).slice(0, 200));
  }
} finally { await vite.close(); }
