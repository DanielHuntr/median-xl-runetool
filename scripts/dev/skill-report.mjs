// Dev check: node scripts/dev/skill-report.mjs <ulvl> <ids…> — planner tooltip (First Level) next to the game's lines and formulas.
import { readFileSync } from "node:fs";
import { createEngine } from "../../src/planner/engine.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const engine = createEngine(data);
const [ulvl, ...ids] = process.argv.slice(2);
const energy = Number(process.env.ENERGY || 15);
for (const id of ids) {
  const s = data.skills[id];
  const blvl = Number(process.env.BLVL || 0);
  const b = { cls: s.class, level: +ulvl, points: blvl ? { [id]: blvl } : {}, quests: {}, charStats: { energy, spell_focus: 0 } };
  console.log(`\n=== ${s.name} (${s.class}, game ${s.game?.gameId}) ulvl ${ulvl}`);
  for (const l of engine.describe(b, id, blvl).effect) console.log(`  [${l.trust}] ${l.text}${l.status === "unknown" ? "  -- " + l.parts.find((p) => p.source.status === "missing")?.source.notes[0] : ""}`);
  const syn = engine.synergies(b, id, blvl);
  for (const l of [...(syn?.lines || []), ...(syn?.bonus || [])]) console.log(`  syn [${l.trust}] ${l.text}${l.status === "unknown" ? "  -- " + l.parts[0].source.notes[0] : ""}`);
  console.log("  game lines:");
  for (const l of s.game.lines) console.log(`    ${l.block} ${l.type} ${JSON.stringify(l.textA ?? "")} ${JSON.stringify(l.textB ?? "")} | ${l.calcA?.text ?? ""} | ${l.calcB?.text ?? ""}`);
  const e = s.game.elem;
  console.log(`  elem ${e?.type} ${e?.min}-${e?.max} [${e?.minLev}] [${e?.maxLev}] hs ${e?.hitShift} syn: ${e?.synergy?.text ?? ""}`);
  console.log(`  params ${s.game.params} | calcs ${JSON.stringify(Object.fromEntries(Object.entries({ ...s.game.calcs, ...s.game.ast, ...s.game.vars }).map(([k, v]) => [k, v?.text])))}`);
}
