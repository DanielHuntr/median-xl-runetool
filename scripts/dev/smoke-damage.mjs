// Dev check: node scripts/dev/smoke-damage.mjs
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const { skillDamage } = await vite.ssrLoadModule("/src/planner/damage.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const bow = catalog.all().find((d) => d.name === "Stormstrike");
  const run = (b, ids) => {
    const character = computeCharacter(b, { engine, catalog, planner });
    const skillBuild = { ...b, soft: character.soft, charStats: character.charStats };
    console.log(`weapon ${character.damage.physical}, AR ${character.ar.total}`);
    for (const id of ids) {
      const d = skillDamage(id, { engine, build: b, skillBuild, character });
      console.log(` ${d.name} [${d.kind}] total ${d.total || "-"} | ${d.parts.map((p) => p.element + " " + p.range.join("-")).join(", ")} | ${d.lines.join(" · ")}${d.notes.length ? " | NOTE " + d.notes.join(" ") : ""}`);
    }
  };
  const base = { quests: {}, signets: 0, difficulty: "Hell", swap: false, inventory: [], buffs: [] };
  run({ ...base, cls: "Amazon", level: 110, attrs: { strength: 300, dexterity: 800, vitality: 50, energy: 0 },
    points: { trinity_arrow: 15, barrage: 20, dragonlore: 1, wyrmshot: 25 }, gear: { weapon: { ref: bow.key } } },
    ["attack", "barrage", "trinity_arrow", "wyrmshot", "dragonlore"]);
  run({ ...base, cls: "Sorceress", level: 110, attrs: { strength: 100, dexterity: 50, vitality: 150, energy: 300 },
    points: { molten_core: 1, warmth: 10, flamefront: 25, overheat: 10 }, gear: {} }, ["flamefront", "attack"]);
  const nec = catalog.all();
  run({ ...base, cls: "Necromancer", level: 90, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    points: Object.fromEntries(engine.treeNodes("Necromancer", "Summon").slice(0, 1).map((n) => [n.id, 5])), gear: {} },
    engine.treeNodes("Necromancer", "Summon").slice(0, 1).map((n) => n.id));
} finally {
  await vite.close();
}
