// Dev check: node scripts/dev/values-of.mjs <class> <skill id> <points> [other id=points…] — tooltip values and lines.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const [cls, id, n, ...rest] = process.argv.slice(2);
  const points = { [id]: +n, ...Object.fromEntries(rest.map((r) => r.split("=")).map(([k, v]) => [k, +v])) };
  const b = { cls, level: 120, points, quests: {} };
  console.log(JSON.stringify(engine.skillValues(b, id)));
  for (const l of engine.describe(b, id, +n).effect) console.log(" ", l.status, JSON.stringify(l.text));
} finally { await vite.close(); }
