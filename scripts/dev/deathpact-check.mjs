// Dev check: Death Pact for the MedianDB planner build (Necromancer 83) vs the game formulas.
import { readFileSync } from "node:fs";
import { createEngine } from "../../src/planner/engine.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const engine = createEngine(data);
const byName = Object.fromEntries(Object.entries(data.skills).filter(([, s]) => s.class === "Necromancer").map(([id, s]) => [s.name, id]));
const pts = { "Angel of Death": 25, Apprenticeship: 5, "Blood Skeleton": 5, Carnage: 1, "Death Pact": 1, "Death Ripple": 5, "Death Ward": 1, Deathlord: 25, "Demonic Commune": 6, Embalming: 1, "Ominous Vigor": 5, Parasite: 1, Sacrifices: 1, Widowmaker: 6 };
const points = {};
for (const [n, p] of Object.entries(pts)) { if (!byName[n]) console.log("unknown skill", n); else points[byName[n]] = p; }
const b = { cls: "Necromancer", level: 83, points, quests: {}, charStats: { strength: 15, dexterity: 25, vitality: 20, energy: 25, mana: 845, life: 2220 } };
for (const tab of engine.tabs("Necromancer")) console.log(`  tree ${tab}: ${engine.tabPoints(b, tab)} points`);
const syn = engine.synergies(b, "death_pact", 1);
const d = engine.describe(b, "death_pact", 1);
console.log("effect:", d.effect.map((l) => `[${l.trust}] ${l.text}`));
console.log("synergy/extra:", syn?.lines.map((l) => `[${l.trust}] ${l.text}`));
const g = data.skills.death_pact.game;
for (const l of g.lines.filter((l) => l.block !== "level")) console.log("  game", l.block, l.type, JSON.stringify(l.textA), l.calcA?.text);
