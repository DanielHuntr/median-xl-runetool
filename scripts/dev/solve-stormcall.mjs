// Dev check: node scripts/dev/solve-stormcall.mjs — Character Level / Energy that reproduce
// Stormcall's in-game level 1 "Lightning Damage: 4-5" and next level "5-7".
import { readFileSync } from "node:fs";
import { createGameEval } from "../../src/planner/gamecalc.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const g = data.skills.stormcall.game;
const at = (ulvl, E, blvl, lvl) => {
  const e = createGameEval(g, data.game.variables, { blvl, lvl, ulvl, resolve: (k, ref) => (k === "stat" ? { value: ref === 1 ? E : 0, label: "" } : { value: 0, label: "" }) });
  try { return [e.variable("edmn"), e.variable("edmx"), e.variable("mana")]; } catch (x) { return [x.message]; }
};
const hits = [];
for (let E = 15; E <= 30; E++) for (let ulvl = 1; ulvl <= 150; ulvl++) {
  const [a, b] = at(ulvl, E, 1, 1), [c, d] = at(ulvl, E, 1, 2);
  if (a === 4 && b === 5 && c === 5 && d === 7) hits.push(`E${E}/ulvl${ulvl}`);
}
console.log("raw edmn-edmx matches:", hits.length, hits.slice(0, 30).join(" "));
console.log("mana at lvl 1 / 2:", at(10, 22, 1, 1)[2], at(10, 22, 1, 2)[2]);
console.log("synergy formula:", g.elem.synergy.text);
