// Dev check: node scripts/dev/game-only-elem.mjs — skills whose game files give elemental
// damage (elem table) that MedianDB has no value for, with the game's value at 10 points
// on a level 120 character (1000 Strength and Dexterity).
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  for (const [id, s] of Object.entries(planner.skills)) {
    const g = s.game, type = g?.elem?.type;
    if (!type || !s.class) continue;
    const key = `${type}_damage`;
    const b = { cls: s.class, level: 120, points: { [id]: 10 }, quests: {}, charStats: { strength: 1000, dexterity: 1000, energy: 500, vitality: 500, life: 5000, mana: 2000 } };
    if (!engine.node(b, id)) continue;
    const v = engine.skillValues(b, id);
    if (key in v) continue;
    const r = engine.gameElemental?.(b, id);
    console.log(`${id.padEnd(24)} ${s.tags.join(",").padEnd(40)} ${type} ${g.elem.min}-${g.elem.max} syn: ${(g.elem.synergy?.text || "").slice(0, 60)} | ${r ? JSON.stringify(r.values) : "(no engine hook yet)"}`);
  }
} finally { await vite.close(); }
