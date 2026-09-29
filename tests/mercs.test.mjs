import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeMerc, cleanMerc, mercSpecs, mercCats, buffSpecs } from "../src/planner/mercs.js";

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

test("in-game mercenaries (GitHub issues #9-#11): life by table row, skills from the hiring level", () => {
  // Gulzar, a level 44 Shapeshifter: life 1,590 (the level-43 row); with no +skills Bloodlust 8,
  // Pounce and Thorn Field 15, so hired at 15-16; its gear's +2 skills show 10 and 17.
  const g = merc("Shapeshifter", 44, "Normal", { hiredAt: 16 });
  assert.equal(g.life, 1590);
  const lvl = (m, n) => m.skills.find((s) => s.name === n).level;
  assert.deepEqual([lvl(g, "Bloodlust"), lvl(g, "Pounce"), lvl(g, "Thorn Field"), lvl(g, "Werebear Morph")], [8, 15, 15, 3]);
  // A level 43 Ranger hired in Nightmare (at 36): Dark Power 4.
  assert.equal(lvl(merc("Ranger", 43, "Nightmare", { hiredAt: 36 }), "Dark Power"), 4);
  // A level 42 Bloodmage (hired in Normal, at 15): Firedance 7.
  assert.equal(lvl(merc("Bloodmage", 42, "Normal", { hiredAt: 15 }), "Firedance"), 7);
  // Unset, it's hired as early as the difficulty allows.
  assert.equal(merc("Ranger", 43, "Nightmare").hiredAt, 36);
});

test("buff tooltips at those levels match the game (issues #9-#11)", () => {
  const tip = (spec, L, diff, hiredAt, name) => merc(spec, L, diff, { hiredAt }).skills.find((s) => s.name === name).tooltip;
  const same = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
  same(tip("Ranger", 43, "Nightmare", 36, "Dark Power"),
    ["Duration: 23 seconds", "Attack Speed: +16%", "Magic Damage to Party Weapons: 5-7", "Physical Damage: +14%", "Chance of Crushing Blow: 10%"]);
  same(tip("Shapeshifter", 44, "Normal", 16, "Bloodlust"),
    ["Duration: 127 seconds", "Physical/Magic Spell Damage: +10%", "Elemental Spell Damage: +10%", "Physical Damage: +24%"]);
  assert.ok(tip("Bloodmage", 42, "Normal", 15, "Firedance").includes("Elemental Spell Damage: +29%"));
  assert.ok(tip("Bloodmage", 42, "Normal", 15, "Firedance").includes("Physical Damage: +51%"));
});

test("the buff mercenaries, and their expected tooltip lines from the game's own formulas", () => {
  assert.deepEqual(buffSpecs(data).map((x) => x.spec), ["Ranger", "Priestess", "Shapeshifter", "Bloodmage"]);
  const dp = merc("Ranger").skills.find((s) => s.name === "Dark Power");
  // The tooltip's attack speed (220 × …) and the stat it applies (200 × …) differ in the game files.
  assert.ok(dp.tooltip.some((l) => /^Attack Speed: \+\d+%$/.test(l)));
  assert.ok(dp.tooltip.includes("Duration: 50 seconds"));
});

test("the Priestess's Vindicate heals the character by a share of its own life", async () => {
  const m = computeMerc({ cls: "Amazon", level: 150, difficulty: "Hell", merc: { spec: "Priestess", level: null, difficulty: "Hell", gear: {}, off: [] } }, { catalog: null, data });
  assert.ok(m.healing?.seconds > 0, "its tooltip's seconds");
  assert.equal(m.healing.cap, 15000);
});
