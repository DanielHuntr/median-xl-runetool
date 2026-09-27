// Dev check: node scripts/dev/preset-survey.mjs — damage skills per class and tree, their
// synergies (from the game tooltip's synergy lines) and damage at 20 points with no gear.
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
  const byName = new Map(Object.entries(planner.skills).map(([id, s]) => [s.name, id]));
  for (const cls of engine.classNames) {
    const b0 = { cls, level: 120, points: {}, quests: {}, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 }, gear: {}, inventory: [], buffs: [], signets: 0, swap: false, difficulty: "Hell" };
    console.log(`\n== ${cls} (points at 120: ${engine.available(b0)})`);
    for (const tab of engine.tabs(cls)) {
      if (["Mastery", "Reward", "Innate", "Coven"].includes(tab)) continue;
      for (const n of engine.treeNodes(cls, tab)) {
        const s = planner.skills[n.id];
        const syn = (s.game?.lines || []).filter((l) => l.block === "synergy" && l.type === 63 || (l.block === "synergy" && byName.has(l.textA))).map((l) => l.textA).filter((t) => byName.has(t));
        const b = { ...b0, points: { [n.id]: 20 } };
        const c = computeCharacter(b, { engine, catalog, planner });
        const d = skillDamage(n.id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
        console.log(`  ${tab.padEnd(12)} ${n.id.padEnd(26)} req ${String(engine.requiredCharLevel(n.id, b)).padStart(3)} ${d?.kind?.padEnd(6)} ${d?.total ? d.total.join("-") : "-"}  [${s.tags.join(",")}] syn: ${[...new Set(syn)].map((x) => byName.get(x)).join(", ")}`);
      }
    }
  }
} finally { await vite.close(); }
