// Dev check: node scripts/dev/attack-own-damage.mjs — attack skills (% weapon damage) whose
// tooltip also has damage lines of their own, at 20 points on a level 120 character.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const seen = new Set();
  for (const cls of engine.classNames)
    for (const tab of engine.tabs(cls))
      for (const n of engine.treeNodes(cls, tab)) {
        if (seen.has(n.id)) continue; seen.add(n.id);
        const b = { cls, level: 120, points: { [n.id]: 20 }, quests: {} };
        const v = engine.skillValues(b, n.id);
        if (!(typeof v.weapon_damage?.[0] === "number" && v.weapon_damage[0])) continue;
        const own = Object.entries(v).filter(([k]) => /^(fire|cold|lightning|magic|poison|physical)_damage$/.test(k));
        if (own.length) console.log(`${cls}/${tab} ${n.name}: ${v.weapon_damage[0]}% | ${own.map(([k, x]) => `${k} ${JSON.stringify(x)}`).join(", ")} | tags ${engine.skill(n.id).tags?.join(",")}`);
      }
} finally { await vite.close(); }
