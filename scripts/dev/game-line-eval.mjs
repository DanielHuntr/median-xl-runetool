// Dev check: node scripts/dev/game-line-eval.mjs <class> <skill id> <points> [dex] — evaluates
// each of a skill's game tooltip lines (and edmn/edmx) with a given Dexterity/Strength.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { gameEvaluator } = await vite.ssrLoadModule("/src/planner/gamecalc.js").catch(() => ({}));
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const [cls, id, n, stat = "500"] = process.argv.slice(2);
  globalThis.__dbg = id;
  const b = { cls, level: 150, points: { [id]: +n }, quests: {}, charStats: { dexterity: +stat, strength: +stat, energy: +stat, vitality: +stat, life: 5000, mana: 2000 } };
  console.log("skillValues:", JSON.stringify(engine.skillValues(b, id)));
  console.log("engine exports with game:", Object.keys(engine).filter((k) => /game/i.test(k)).join(", "));
  const d = engine.describe(b, id, +n);
  for (const l of [...d.effect]) console.log("  effect", l.status, JSON.stringify(l.text));
} finally { await vite.close(); }
