// Dev check: node scripts/dev/check-operators.mjs — where a game tooltip line uses the
// inferred comparison/ternary operators and MedianDB has a formula for the same value,
// compare the two across Base Levels and Character Levels.
import { readFileSync } from "node:fs";
import { createEngine } from "../../src/planner/engine.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const withoutGame = structuredClone(data);
for (const s of Object.values(withoutGame.skills)) delete s.game;
withoutGame.game = null;
const game = createEngine(data), community = createEngine(withoutGame);
// The inferred operators as the formula text shows them (not the "=" in "value = …").
const OPS = / (<|>|<=|>=|==|!=) | \? /;
const firstNumber = (t) => Number(/-?\d+(\.\d+)?/.exec(t)?.[0]);
let agree = 0, differ = 0;
const diffs = [];
for (const [id, s] of Object.entries(data.skills)) {
  if (!s.game) continue;
  for (const blvl of [1, 5, 10, 20]) for (const ulvl of [30, 90, 120]) {
    const b = { cls: s.class, level: ulvl, points: { [id]: blvl }, quests: {} };
    const g = game.describe(b, id, blvl).effect, c = community.describe(b, id, blvl).effect;
    for (const l of g) for (const p of l.parts) {
      if (!["game", "game-inferred", "verified"].includes(p.source.status) || !p.source.formula?.some((f) => OPS.test(f))) continue;
      const cl = c.find((x) => x.parts.some((y) => y.key === p.key && y.source.status === "community" && y.values?.every((v) => v == null || typeof v === "number")));
      if (!cl || cl.status === "varies") continue;
      // Compare what each shows (units already converted, e.g. frames → seconds).
      const gv = firstNumber(l.text), cv = firstNumber(cl.text);
      if (!Number.isFinite(gv) || !Number.isFinite(cv)) continue;
      if (Math.abs(gv - cv) <= Math.max(0.51, Math.abs(cv) * 0.01)) agree++;
      else { differ++; if (diffs.length < 15) diffs.push(`${id} blvl ${blvl} ulvl ${ulvl}: game "${l.text}" vs MedianDB "${cl.text}" | ${p.source.formula.join(" ; ")}`); }
    }
  }
}
console.log({ agree, differ });
console.log(diffs.join("\n"));
