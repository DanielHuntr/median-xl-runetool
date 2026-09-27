// Dev check: node scripts/dev/missing.mjs — every tooltip value the planner can't work out, with the reason.
import { readFileSync } from "node:fs";
import { createEngine } from "../../src/planner/engine.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const engine = createEngine(data);
const rows = [];
for (const cls of engine.classNames)
  for (const tab of engine.tabs(cls))
    for (const n of engine.treeNodes(cls, tab)) {
      const [blvl, ulvl] = (process.env.AT || "10,100").split(",").map(Number);
      const b = { cls, level: ulvl, points: { [n.id]: blvl }, quests: {} };
      const d = engine.describe(b, n.id, blvl);
      for (const block of ["description", "restriction", "effect"])
        for (const l of d[block]) for (const p of l.parts) if (p.source.status === "missing") rows.push([n.id, p.key, p.source.notes[0], l.text]);
      const syn = engine.synergies(b, n.id, blvl);
      for (const l of [...(syn?.lines || []), ...(syn?.bonus || [])]) if (l.trust === "missing") rows.push([n.id, "synergy", l.parts[0].source.notes[0], l.text]);
    }
const mode = process.argv[2];
if (mode === "keys") {
  const c = {};
  for (const r of rows) c[r[1]] = (c[r[1]] || 0) + 1;
  console.log(Object.entries(c).sort((a, b) => b[1] - a[1]));
} else for (const r of rows) console.log(r.join(" | "));
console.log(rows.length, "missing");
