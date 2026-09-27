// Dev check: node scripts/dev/provenance-coverage.mjs — how every skill tooltip value is sourced.
import { readFileSync } from "node:fs";
import { createEngine } from "../../src/planner/engine.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const engine = createEngine(data);
const count = {}, missingWhy = {};
for (const cls of engine.classNames)
  for (const tab of engine.tabs(cls))
    for (const n of engine.treeNodes(cls, tab)) {
      const b = { cls, level: 100, points: { [n.id]: 10 }, quests: {} };
      const d = engine.describe(b, n.id, 10);
      for (const l of [...d.description, ...d.effect])
        for (const p of l.parts) {
          count[p.source.status] = (count[p.source.status] || 0) + 1;
          if (p.source.status === "missing") {
            const why = p.source.notes[0].replace(/: .*isn't modelled/, ": unmodelled variable").replace(/unconfirmed opcode 0x\w+/, "unconfirmed opcode").replace(/unknown function \d+/, "unknown function");
            missingWhy[why] = (missingWhy[why] || 0) + 1;
          }
        }
    }
console.log(engine.TRUST.map((t) => `${t} ${count[t] || 0}`).join(", "));
console.log(missingWhy);
