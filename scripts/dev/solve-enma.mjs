// Dev check: node scripts/dev/solve-enma.mjs — which reading of enma/exma gives Lava Pit's
// in-game First Level "Fire Damage per second: 40-45" (enma × 5, exma × 5), and at which
// Character Level / Energy.
import { readFileSync } from "node:fs";
import { createGameEval } from "../../src/planner/gamecalc.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const g = data.skills.lava_pit.game;
const readings = {
  "edmn raw": (v) => v,
  "edmn / 256": (v) => Math.trunc(v / 256),
  "edmn × 25 / 256 (per second)": (v) => Math.trunc((v * 25) / 256),
  "edmn × 5 / 256": (v) => Math.trunc((v * 5) / 256),
  "edmn / 5": (v) => Math.trunc(v / 5),
  "edmn / 10": (v) => Math.trunc(v / 10),
  "edmn >> 4": (v) => v >> 4,
};
for (const [name, f] of Object.entries(readings)) {
  const hits = [];
  for (let E = Number(process.env.E_MIN || 10); E <= Number(process.env.E_MAX || 20); E++)
    for (let ulvl = 1; ulvl <= 150; ulvl++) {
      const e = createGameEval(g, data.game.variables, {
        blvl: 0, lvl: 1, ulvl,
        resolve: (kind, ref) => (kind === "stat" ? { value: ref === 1 ? E : 0, label: "" } : { value: 0, label: "" }),
      });
      let mn, mx;
      try { mn = e.variable("edmn"); mx = e.variable("edmx"); } catch { continue; }
      if (f(mn) === 8 && f(mx) === 9) hits.push(`E${E}/ulvl${ulvl}`);
    }
  console.log(name.padEnd(30), hits.length, hits.slice(0, 40).join(" "));
}
