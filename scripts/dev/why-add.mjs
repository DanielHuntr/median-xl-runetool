// Dev check: node scripts/dev/why-add.mjs <class> <skill id…> — why the planner allows or refuses a point.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const [cls, ...ids] = process.argv.slice(2);
  const b = { cls, level: 120, points: {}, quests: {} };
  for (const id of ids) console.log(id, JSON.stringify(engine.canAdd(b, id, { autoLevel: false })), "max", engine.maxLevel(b, id));
} finally { await vite.close(); }
