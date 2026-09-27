// Dev check: node scripts/dev/smoke-poison.mjs — weapon poison from items and Way of the Spider in an attack.
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
  const claw = catalog.forSlot("weapon", "Assassin").find((d) => d.kind === "unique" && d.variants?.some((v) => v.lines.some((l) => /Poison Damage over/.test(l))));
  const b = { cls: "Assassin", level: 93, points: { way_of_the_spider: 25 }, quests: {}, attrs: { strength: 100, dexterity: 300, vitality: 0, energy: 0 },
    signets: 0, difficulty: "Hell", gear: claw ? { weapon: { ref: claw.key } } : {}, swap: false, inventory: [], buffs: [] };
  const c = computeCharacter(b, { engine, catalog, planner });
  console.log("claw:", claw?.name, "| weapon poison:", JSON.stringify(c.damage.weaponPoison));
  const d = skillDamage("attack", { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
  console.log(d.parts, d.notes);
} finally {
  await vite.close();
}
