// Dev check: node scripts/dev/line-source.mjs <class> <skill id> <points> <key> [other id=points…] — one tooltip value's provenance.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const [cls, id, n, key, ...rest] = process.argv.slice(2);
  const points = { [id]: +n, ...Object.fromEntries(rest.map((r) => r.split("=")).map(([k, v]) => [k, +v])) };
  const b = { cls, level: 120, points, quests: {}, charStats: { mana: 1000, maxMana: 1000 } };
  for (const l of engine.describe(b, id, +n).effect) for (const p of l.parts || []) if (p.key === key) console.log(l.text, JSON.stringify(p.source, null, 1).slice(0, 1500));
} finally { await vite.close(); }
