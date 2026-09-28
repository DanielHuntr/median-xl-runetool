import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeMerc, cleanMerc, mercSpecs, mercCats } from "../src/planner/mercs.js";

const data = JSON.parse(readFileSync(new URL("../public/planner/data.json", import.meta.url), "utf8"));
const merc = (spec, level = 150, difficulty = "Hell", extra = {}) =>
  computeMerc({ level, difficulty, merc: { spec, level: null, gear: {}, off: [], ...extra } }, { catalog: null, data });

test("every docs specialization is in the game data, per act", () => {
  assert.deepEqual(mercSpecs(data).map((x) => `${x.act} ${x.spec}`), [
    "1 Ranger", "1 Priestess", "2 Exemplar", "2 Shapeshifter", "2 Fighter Mage", "3 Necrolyte", "3 Bloodmage", "3 Abjurer", "5 Barbarian",
  ]);
  // Ordinary items plus the class items the docs name for the act.
  assert.deepEqual(mercCats(3, "body"), ["Body Armors", "Sorceress Body Armors"]);
  assert.ok(mercCats(2, "helm").includes("Paladin Helms") && !mercCats(1, "helm").includes("Paladin Helms"));
  assert.equal(mercCats(1, "offhand"), null, "a bow takes both hands");
  assert.equal(mercCats(2, "ring1"), null, "no rings on the mercenary screen");
});

test("stats grow from the row at or below its level (D2 hireling rules)", () => {
  // Ranger, Hell: one row at level 90 (life 3146 +101/level, strength 350 + 24/8 per level).
  const m = merc("Ranger");
  assert.equal(m.row, 90);
  assert.equal(m.life, 3146 + 60 * 101);
  assert.equal(m.strength, 350 + Math.floor((60 * 24) / 8));
  assert.equal(m.resist.fire.stacked, 70, "Heroic Resistances");
  assert.equal(m.resist.fire.max, 80, "+1% max every 10 levels above 100");
  assert.equal(m.resist.physical, Math.floor(150 / 4), "Sisters: 1% per 4 levels");
  // Its level can't pass the character's.
  assert.equal(computeMerc({ level: 40, difficulty: "Normal", merc: { spec: "Ranger", level: 99, gear: {}, off: [] } }, { catalog: null, data }).level, 40);
});

test("party buffs come from the skills' game formulas, and can be switched off", () => {
  const m = merc("Ranger");
  const dp = m.skills.find((s) => s.name === "Dark Power");
  assert.equal(dp.learned, true);
  assert.ok(dp.effects.some(([k, v]) => k === "attack_speed" && v > 0));
  assert.ok(m.buffs.some(([k]) => k === "attack_speed"));
  assert.deepEqual(merc("Ranger", 150, "Hell", { off: ["Dark Power"] }).buffs, []);
  // Skills that hit enemies or the mercenary itself give the party nothing.
  assert.deepEqual(merc("Necrolyte").buffs, []);
});

test("stored mercenaries are checked", () => {
  const keep = (x) => x;
  assert.equal(cleanMerc({ spec: "Nobody" }, data, keep), null);
  const m = cleanMerc({ spec: "Bloodmage", level: 999, gear: { helm: { ref: "x" }, body: { ref: "y" } }, off: ["Firedance", "Nonsense"] }, data, keep);
  assert.equal(m.level, null);
  assert.deepEqual(Object.keys(m.gear).sort(), ["body", "helm"]);
  assert.deepEqual(m.off, ["Firedance"]);
});

test("an in-game Act 2 Shapeshifter at level 44 (hired in Normal)", () => {
  // From the mercenary screen: life 1,590; Claw Tornado, Pounce and Thorn Field level 17.
  // (Werebear 5 and Bloodlust 10 there are above the base 3 and 9: its gear isn't known.)
  const m = merc("Shapeshifter", 44, "Normal");
  assert.equal(m.life, 1590);
  const lvl = (n) => m.skills.find((s) => s.name === n).level;
  assert.deepEqual([lvl("Sandstorm"), lvl("Pounce"), lvl("Thorn Field")], [17, 17, 17]);
  assert.equal(m.resist.physical, 25 + Math.floor(44 / 5), "Grit: 25%, +1% per 5 levels (the screen shows 34%, gear unknown)");
});
