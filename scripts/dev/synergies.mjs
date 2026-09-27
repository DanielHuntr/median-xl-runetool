// Dev check: node scripts/dev/synergies.mjs [skill ids…] — the game's synergy block per skill.
import { readFileSync } from "node:fs";
import { createEngine } from "../../src/planner/engine.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const engine = createEngine(data);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["way_of_the_spider", "flamefront", "hammer_of_zerae", "jinn", "askari_lightning", "shockwave_trap"];
for (const id of ids) {
  const s = data.skills[id];
  const b = { cls: s.class, level: 93, points: { [id]: 25 }, soft: { [id]: 16 }, quests: {}, charStats: { energy: 200, spell_focus: 500 } };
  const syn = engine.synergies(b, id, 25);
  console.log(`\n${s.name}: ${syn?.title}`);
  for (const l of [...(syn?.lines || []), ...(syn?.bonus || [])]) console.log(`  [${l.trust}] ${l.text}${l.status === "unknown" ? "  -- " + l.parts[0].source.notes[0] : ""}`);
}
const count = {};
for (const cls of engine.classNames) for (const tab of engine.tabs(cls)) for (const n of engine.treeNodes(cls, tab)) {
  const syn = engine.synergies({ cls, level: 100, points: { [n.id]: 10 }, quests: {} }, n.id, 10);
  for (const l of [...(syn?.lines || []), ...(syn?.bonus || [])]) count[l.trust] = (count[l.trust] || 0) + 1;
}
console.log("\nall tree skills at Base Level 10, character level 100:", count);
