// Skill-calculation accuracy against the installed game's data and in-game tooltips.
// Expected values come from outside the implementation: the in-game observations in
// data/game/<patch>/fixtures.json, the tooltip's own synergy text, and hand-worked
// arithmetic. Nothing here copies a constant from the calculation code.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEngine } from "../src/planner/engine.js";
import { decode, run, levelTableSum } from "../src/planner/d2calc.js";
import { combineWeaponPoison } from "../src/planner/character.js";
import { parseLine } from "../src/planner/statparse.js";
import { mergeGameData } from "../scripts/lib/merge-game.mjs";
import { formatLine } from "../src/planner/desclines.js";

const json = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const data = await json("../public/planner/data.json");
const engine = createEngine(data);
const patch = data.game.patch;
const { fixtures, observedIn } = await json(`../data/game/${patch}/fixtures.json`);
const WOTS = "way_of_the_spider";
const wots = fixtures.find((f) => f.skill === WOTS);
const input = (k) => wots.inputs[k].value;

// A build with the given Base Level, bonus levels and Character Level.
const at = ({ blvl = input("blvl"), lvl = input("lvl"), ulvl = input("ulvl") } = {}) => ({
  build: { cls: "Assassin", level: ulvl, points: { [WOTS]: blvl }, soft: { [WOTS]: lvl - blvl }, quests: {}, buffs: [] },
  blvl,
});
// Tooltip values by key ("poison_pierce" → [30]).
function values(opts) {
  const { build, blvl } = at(opts);
  const out = {};
  for (const l of engine.describe(build, WOTS, blvl).effect) for (const p of l.parts) out[p.key] = p.values;
  return out;
}
// "-1% to Enemy Poison Resistance per Base Level" → per-level rate from the tooltip text.
const rate = (re) => Math.abs(Number(wots.synergyText.map((t) => re.exec(t)?.[1]).find(Boolean)));

test("datasets are one patch, and the version is exposed for the UI", () => {
  assert.ok(patch.startsWith(`${data.gameVersion}.`), `game files ${patch} vs MedianDB ${data.gameVersion}`);
  assert.equal(engine.datasets.game.patch, patch);
  assert.equal(engine.datasets.medianDb.patch, data.gameVersion);
  // Fixtures carried over from an earlier patch name the one they were seen in (observedIn).
  assert.equal(wots.id && fixtures.every((f) => f.source.includes(observedIn || patch)), true, "fixtures name their patch");
});

test("merging refuses game files from a different patch", async () => {
  const extract = await json(`../data/game/${patch}/skills.json`);
  const other = { ...structuredClone(data), gameVersion: "2.13" };
  assert.throws(() => mergeGameData(other, extract), /doesn't match/);
});

test("Way of the Spider reproduces the in-game tooltip (current and next level)", () => {
  const check = engine.fixtureCheck(WOTS);
  for (const [when, observed] of Object.entries(wots.observed))
    for (const key of Object.keys(observed)) {
      const c = check[key].checks.find((x) => x.when === when);
      assert.deepEqual(c.got, c.expected, `${when} ${key}`);
    }
  // And through the same path the UI uses.
  const now = values();
  for (const [key, expected] of Object.entries(wots.observed.current)) assert.deepEqual(now[key], expected, key);
  const step = wots.nextLevel;
  const next = values({ blvl: input("blvl") + step.blvl, lvl: input("lvl") + step.lvl });
  for (const [key, expected] of Object.entries(wots.observed.next)) assert.deepEqual(next[key], expected, `next ${key}`);
  // The tooltip label is the game's: poison on the weapon, not a spell.
  const line = engine.describe(at().build, WOTS, input("blvl")).effect.find((l) => l.parts.some((p) => p.key === "poison_dot"));
  assert.match(line.text, /^Poison Damage to Weapon: \d+-\d+ over \d+ seconds$/);
  assert.equal(line.trust, "verified");
});

test("poison pierce follows Base Level only, at the stated rate, around the cap", () => {
  const perBase = rate(/(-?\d+)% to Enemy Poison Resistance per Base Level/);
  const cap = engine.maxLevel(at().build, WOTS);
  for (const blvl of [cap - 2, cap - 1]) {
    const a = values({ blvl, lvl: blvl + 16 })[`poison_pierce`][0];
    const b = values({ blvl: blvl + 1, lvl: blvl + 17 })[`poison_pierce`][0];
    assert.equal(b - a, perBase, `Base Level ${blvl} → ${blvl + 1}`);
  }
  // Bonus levels and character level don't move it.
  const base = values().poison_pierce[0];
  assert.equal(values({ lvl: input("lvl") + 10 }).poison_pierce[0], base);
  assert.equal(values({ ulvl: 120 }).poison_pierce[0], base);
});

test("poison spell damage: +2% per character level below 100, flat from 100", () => {
  const perLevel = rate(/\+(\d+)% Poison Spell Damage per Character Level under 100/);
  const psd = (ulvl) => values({ ulvl }).poison_spell_damage[0];
  assert.equal(psd(98) - psd(99), perLevel);
  assert.equal(psd(99) - psd(100), perLevel);
  assert.equal(psd(100) - psd(101), 0);
  assert.equal(psd(101) - psd(120), 0);
});

test("changing one input changes only the values that depend on it", () => {
  const base = values();
  // Effective Level (gear bonus): spell damage and poison change, pierce doesn't.
  const lvl = values({ lvl: input("lvl") + 1 });
  assert.equal(lvl.poison_pierce[0], base.poison_pierce[0]);
  assert.notEqual(lvl.poison_spell_damage[0], base.poison_spell_damage[0]);
  assert.notDeepEqual(lvl.poison_dot, base.poison_dot);
  // Character Level at or above 100: pierce and spell damage fixed; poison synergy scales with it.
  const hi = values({ ulvl: 100 }), hi2 = values({ ulvl: 110 });
  assert.equal(hi2.poison_pierce[0], hi.poison_pierce[0]);
  assert.equal(hi2.poison_spell_damage[0], hi.poison_spell_damage[0]);
  assert.notDeepEqual(hi2.poison_dot, hi.poison_dot);
  // Base Level with the same Effective Level: pierce and poison change, spell damage doesn't.
  const moved = values({ blvl: input("blvl") - 1 });
  assert.notEqual(moved.poison_pierce[0], base.poison_pierce[0]);
  assert.equal(moved.poison_spell_damage[0], base.poison_spell_damage[0]);
  assert.notDeepEqual(moved.poison_dot, base.poison_dot);
});

test("weapon poison ignores Poison Spell Damage", () => {
  const { build } = at();
  const plain = engine.weaponPoison(build, WOTS);
  const boosted = engine.weaponPoison({ ...build, charStats: { poison_spell_damage: 500, energy: 500 } }, WOTS);
  assert.deepEqual(boosted.total, plain.total);
  assert.deepEqual(plain.total, wots.observed.current.poison_dot.slice(0, 2));
});

test("weapon poison sources: rates add, item durations average, skill durations add", () => {
  const stats = {};
  const add = (k, v) => ((stats[k] ??= { total: 0, sources: [] }).total += v, stats[k].sources.push({ source: "x", value: v }));
  for (const text of ["Adds 100-200 Poison Damage over 2 seconds", "+400 Poison Damage over 4 seconds"])
    for (const [k, v] of parseLine(text, { level: 1, skillByName: new Map() }).effects) add(k, v);
  const items = combineWeaponPoison(stats, []);
  // 50-100/s + 100/s; average of 2 s and 4 s.
  assert.deepEqual(items.perSecond, [150, 200]);
  assert.equal(items.seconds, 3);
  assert.deepEqual(items.total, [450, 600]);
  const withSkill = combineWeaponPoison(stats, [{ source: "s", total: [100, 100], seconds: 2 }]);
  assert.equal(withSkill.seconds, 5);
  assert.deepEqual(withSkill.perSecond, [200, 250]);
  assert.equal(items.status, "inferred");
});

test("+skills raise skill-level values: Prismatic Cloak matches the game at 6 points, level 22; Fervor grows", () => {
  // In game (screenshot): 6 hard points, skill level 22 → reduced by 65 (68 next level),
  // Max Life +5% (per base level, so +skills don't change it), Block Speed 52%.
  const cloak = (hard, soft) => engine.skillValues({ cls: "Assassin", level: 150, points: { prismatic_cloak: hard }, soft: { prismatic_cloak: soft }, quests: {} }, "prismatic_cloak");
  assert.equal(cloak(6, 16).elemental_magic_damage_reduced_flat[0], 65);
  assert.equal(cloak(6, 17).elemental_magic_damage_reduced_flat[0], 68);
  assert.equal(cloak(6, 16).maximum_life[0], 5);
  assert.equal(cloak(6, 16).block_speed[0], 52);
  assert.equal(cloak(6, 30).maximum_life[0], 5, "Max Life is per base level");
  // Fervor's summon damage is the game's ln12: 10 + 3 per level after the first. MedianDB's
  // formula (min instead of max) would keep it at 10.
  const fervor = (hard, soft = 0) => engine.skillValues({ cls: "Paladin", level: 150, points: { fervor: hard }, soft: { fervor: soft }, quests: {} }, "fervor").summoned_minion_damage[0];
  assert.equal(fervor(1), 10);
  assert.equal(fervor(5), 22);
  assert.equal(fervor(5, 20), 82);
});

test("hard-point cap and required level come from the game files, checked at the edges", () => {
  const g = data.skills[WOTS].game;
  const b = (level, pts) => ({ cls: "Assassin", level, points: pts ? { [WOTS]: pts } : {}, quests: {} });
  assert.equal(engine.maxLevel(b(150, 0), WOTS), g.baseCap);
  assert.equal(engine.canAdd(b(150, g.baseCap - 1), WOTS).ok, true);
  assert.equal(engine.canAdd(b(150, g.baseCap), WOTS).ok, false);
  assert.equal(engine.requiredCharLevel(WOTS, b(1)), g.reqLevel);
  assert.equal(engine.canAdd(b(g.reqLevel - 1), WOTS).ok, false);
  assert.equal(engine.canAdd(b(g.reqLevel), WOTS).ok, true);
  // Where the sources disagree, the game's required level is used and both are exposed;
  // for skills the game unlocks by a deed ("Defeat Bartuc … / Unlockable Skill") that's the
  // game's reqlevel (1): MedianDB's 100-125 isn't in the game files.
  const unlockable = [];
  for (const x of data.game.report.reqLevelDiffers) {
    const cls = data.skills[x.id].class;
    const r = engine.requiredLevelSource(x.id, { cls, level: 1, points: {} });
    assert.equal(r.conflict, true);
    if (r.unlock) {
      unlockable.push(x.id);
      assert.equal(r.value, x.game, x.name);
      // Learnable at the game's level (at least 10: level 1 has no skill points yet), even
      // where MedianDB asks for more (Mastery: 100-125). Land of the Dead is unlockable too,
      // and the game itself requires 115 for it.
      const at = Math.max(10, x.game);
      assert.equal(engine.canAdd({ cls, level: at, points: {}, quests: {} }, x.id).ok, true, `${x.name} at level ${at}`);
    } else assert.equal(r.value, Math.max(x.medianDb, x.game), x.name);
  }
  assert.deepEqual(unlockable.sort(), ["chemistry", "continuity", "endurance", "land_of_the_dead", "specialization", "tenacity"]);
  assert.equal(engine.requiredCharLevel("land_of_the_dead", { cls: "Necromancer", points: {} }), 115);
  assert.match(engine.unlockOf("endurance"), /^Defeat Bartuc/);
  // Fixed-cap conflicts use the game value; rule-built caps (MedianDB 0) keep the rules.
  for (const x of data.game.report.capDiffers) {
    const src = engine.capSource(x.id);
    assert.equal(src.base, x.medianDb > 0 ? x.game : 0, x.name);
  }
});

test("every tooltip value carries its provenance; unknowns stay out of confirmed values", () => {
  // Every line of every tree skill: a value that can't be worked out is "missing", shown
  // without a number, and says why; nothing unknown is labelled as confirmed.
  let missing = 0;
  for (const cls of engine.classNames)
    for (const tab of engine.tabs(cls))
      for (const n of engine.treeNodes(cls, tab))
        for (const l of engine.describe({ cls, level: 100, points: { [n.id]: 10 }, quests: {} }, n.id, 10).effect)
          for (const p of l.parts) {
            assert.ok(engine.TRUST.includes(p.source.status), `${n.id} ${p.key}`);
            if (p.source.status !== "missing") continue;
            missing++;
            assert.equal(l.status, "unknown", `${n.id} ${p.key}`);
            assert.ok(p.source.notes[0], `${n.id} ${p.key} says why`);
          }
  assert.equal(missing, 0, "every tooltip value of every tree skill is worked out");
  // MedianDB-only values are labelled community.
  const community = engine.classNames.some((cls) =>
    engine.tabs(cls).some((tab) =>
      engine.treeNodes(cls, tab).some((n) =>
        engine.describe({ cls, level: 100, points: { [n.id]: 5 }, quests: {} }, n.id, 5).effect.some((l) => l.trust === "community"),
      ),
    ),
  );
  // Every tree skill's values now come from the game files; none is MedianDB's alone.
  assert.equal(community, false, "no value is MedianDB's alone");
  // Skill contributions to character stats carry the same label.
  for (const [, , , trust] of engine.skillStatEffects(at().build, WOTS)) assert.equal(trust, "verified");
});

test("formula bytecode: confirmed opcodes run with 32-bit integer maths; others are refused", () => {
  // 7 + 3 * 2 → 13
  const d = decode([0x07, 7, 0x07, 3, 0x07, 2, 0x12, 0x10, 0x00]);
  assert.ok(d.ok);
  assert.equal(run(d.tokens, { variable: () => 0 }, []), 13);
  // Integer division truncates toward zero: -7 / 2 → -3
  const div = decode([0x07, 0xf9, 0x07, 2, 0x13, 0x00]);
  assert.equal(run(div.tokens, { variable: () => 0 }, []), -3);
  // max(4, 9) via function 1
  const mx = decode([0x07, 4, 0x07, 9, 0x01, 1, 0x00]);
  assert.equal(run(mx.tokens, { variable: () => 0 }, []), 9);
  // Opcodes not in the table are never guessed at, and unbalanced formulas are refused.
  const bad = decode([0x07, 1, 0x14, 0x00]);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /unconfirmed opcode 0x14/);
  assert.equal(decode([0x07, 1, 0x07, 2, 0x00]).ok, false, "two values left");
  assert.equal(decode([0x07, 1, 0x10, 0x00]).ok, false, "+ with one value");
});

test("inferred opcodes: int32, comparisons, negation and ?: (hand-worked)", () => {
  const val = (bytes, vars = {}) => {
    const d = decode(bytes);
    assert.ok(d.ok, d.reason);
    return run(d.tokens, { variable: (n) => vars[n] }, ["lvl"]);
  };
  assert.equal(val([0x09, 0x50, 0xc3, 0x00, 0x00, 0x00]), 50000);
  // lvl < 41 ? 5 * lvl : 120 + 2 * lvl, around 41
  const curve = [0x04, 0, 0x07, 41, 0x0a, 0x07, 5, 0x04, 0, 0x12, 0x07, 120, 0x07, 2, 0x04, 0, 0x12, 0x10, 0x16, 0x00];
  assert.equal(val(curve, { lvl: 40 }), 200);
  assert.equal(val(curve, { lvl: 41 }), 202);
  // > >= <= == != on 3 vs 3
  const cmp = (op) => val([0x07, 3, 0x07, 3, op, 0x00]);
  assert.deepEqual([0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f].map(cmp), [0, 0, 1, 1, 1, 0]);
  assert.equal(val([0x07, 1, 0x15, 0x07, 12, 0x12, 0x00]), -12);
});

test("level tables apply per level bracket", () => {
  // Distinct per-bracket steps make each bracket's contribution visible.
  const steps = [1, 10, 100, 1000, 10000];
  const sum = (lvl) => levelTableSum(0, steps, lvl);
  assert.equal(sum(1), 0);
  assert.equal(sum(8) - sum(7), 1);
  assert.equal(sum(9) - sum(8), 10);
  assert.equal(sum(16) - sum(15), 10);
  assert.equal(sum(17) - sum(16), 100);
  assert.equal(sum(23) - sum(22), 1000);
  assert.equal(sum(29) - sum(28), 10000);
});

test("Way of the Spider's synergy block is the game's text, as shown in game", () => {
  const syn = engine.synergies(at().build, WOTS, input("blvl"));
  assert.equal(syn.title, "Synergies");
  assert.deepEqual(syn.lines.map((l) => l.text), wots.synergyText);
  assert.ok(syn.lines.every((l) => l.trust === "verified"));
});

test("synergy lines and the current synergy bonus follow their own inputs", () => {
  const syn = (opts) => engine.synergies(at(opts).build, WOTS, at(opts).blvl);
  const texts = (o) => syn(o).lines.map((l) => l.text);
  const underHundred = wots.synergyText.find((t) => /under 100/.test(t));
  // The "under 100" line is shown below level 100 (seen in game); hiding it from 100 is inferred.
  assert.ok(texts({ ulvl: 99 }).includes(underHundred));
  assert.ok(!texts({ ulvl: 100 }).includes(underHundred));
  // The bonus the synergy formula adds now: grows with Base Level and Character Level,
  // not with bonus levels from gear.
  const bonus = (o) => syn(o).bonus[0].parts[0].values[0];
  assert.ok(bonus({ blvl: 24, lvl: 41 }) < bonus());
  assert.ok(bonus({ ulvl: 94 }) > bonus());
  assert.equal(bonus({ lvl: input("lvl") + 5 }), bonus());
  // At the fixture it's part of the verified Poison Damage to Weapon calculation.
  assert.equal(syn().bonus[0].trust, "verified");
});

test("a value that needs something the planner can't work out is missing, not zero", async () => {
  // pass isn't modelled (Paragon of Fate's unlock reads it): a formula needing it fails with
  // the reason, unless the unknown is multiplied by 0.
  const { createGameEval } = await import("../src/planner/gamecalc.js");
  const names = data.game.variables;
  const toht = names.findIndex((n) => n.trim() === "pass");
  const e = createGameEval({ params: [], passive: [] }, names, { blvl: 1, lvl: 1, ulvl: 1 });
  const hex = (bytes) => ({ code: bytes.map((b) => b.toString(16).padStart(2, "0")).join("") });
  const alone = e.calc(hex([0x04, toht, 0x00]));
  assert.equal(alone.ok, false);
  assert.match(alone.reason, /pass/);
  assert.deepEqual(e.calc(hex([0x04, toht, 0x07, 0, 0x12, 0x00])), { ok: true, value: 0 });
});

test("a skill reading another skill's damage uses that skill's levels in the build", () => {
  // Askari Lightning deals a share of Stormcall's damage: none without Stormcall.
  const ask = (points) => engine.describe({ cls: "Amazon", level: 6, points, quests: {}, charStats: { energy: 22 } }, "askari_lightning", 1).effect;
  const damage = (lines) => lines.find((l) => l.parts.some((p) => p.key === "lightning_damage"));
  assert.equal(damage(ask({ askari_lightning: 1 })), undefined, "no Stormcall: no damage line (the game shows none)");
  assert.equal(damage(ask({ askari_lightning: 1, stormcall: 1 })).text, "Lightning Damage: 15");
});

test("tooltip line formats: game format strings, confirmed and inferred types", () => {
  const printf = formatLine({ type: 66, textA: "+%d%% Total Damage per Base Level" }, 3);
  assert.deepEqual([printf.text, printf.format], ["+3% Total Damage per Base Level", "confirmed"]);
  // Multi-line text is shown bottom-up (Blood Skeleton's synergies).
  assert.deepEqual(formatLine({ type: 18, textA: "Gain 67%\n+1 Skeleton" }).lines, ["+1 Skeleton", "Gain 67%"]);
  // Lines worth 0 aren't shown (Death Pact, Discharge).
  assert.equal(formatLine({ type: 6, textA: "% to Spell Damage" }, 0).hidden, true);
  assert.equal(formatLine({ type: 12, textA: "Thunder Frequency: every " }, 0).hidden, true);
  assert.equal(formatLine({ type: 6, textA: "% Damage" }, 20).text, "+20% Damage");
  // Type 7 ("6 bolts") was confirmed by Magic Missiles; type 2, signed, by Resurrect (issue #23).
  assert.deepEqual([formatLine({ type: 7, textA: " bolts" }, 6).text, formatLine({ type: 7, textA: " bolts" }, 6).format], ["6 bolts", "confirmed"]);
  const hr = formatLine({ type: 2, textA: "Hit Recovery: ", textB: "%" }, 13);
  assert.deepEqual([hr.text, hr.format], ["Hit Recovery: +13%", "confirmed"]);
  assert.equal(formatLine({ type: 17, textA: "Fire Damage: ", textB: " " }, 81, 88).text, "Fire Damage: 81-88 per second");
  assert.equal(formatLine({ type: 19, textA: "Range: " }, 12).text, "Range: 8 yards");
  // Unknown line types still show their text and value, marked inferred.
  const unknown = formatLine({ type: 250, textA: "Thing: ", calcA: {} }, 7);
  assert.deepEqual([unknown.text, unknown.format], ["Thing: 7", "inferred"]);
  assert.equal(formatLine({ type: 76, textA: "x" }, 0).hidden, true);
});

test("every in-game fixture reproduces: values, tooltip lines and synergy text", () => {
  for (const f of fixtures) {
    const input = (k) => f.inputs[k].value;
    const cls = data.skills[f.skill].class;
    const b = {
      cls, level: input("ulvl"), points: { ...(f.inputs.points?.value || {}), [f.skill]: input("blvl") },
      soft: { [f.skill]: input("lvl") - input("blvl") }, quests: {},
      charStats: f.inputs.charStats?.value,
    };
    const check = engine.fixtureCheck(f.skill);
    for (const key of Object.keys(f.observed.current)) assert.equal(check[key]?.ok, true, `${f.id}: ${key}`);
    const lines = engine.describe(b, f.skill, input("blvl")).effect.map((l) => l.text.toLowerCase());
    // Known, documented differences are pinned to the planner's value (see the fixture).
    const expect = (text) => (f.knownDifferences || []).find((k) => k.game === text)?.planner ?? text;
    for (const text of f.otherLines || []) assert.ok(lines.includes(expect(text).toLowerCase()), `${f.id}: "${text}" in ${JSON.stringify(lines)}`);
    if (f.nextLines) {
      // The next level as the fixture records it (e.g. level + 1 with Base Level unchanged).
      const nb = input("blvl") + f.nextLevel.blvl, nl = input("lvl") + f.nextLevel.lvl;
      const nextBuild = { ...b, points: { ...b.points, [f.skill]: nb }, soft: { [f.skill]: nl - nb } };
      const next = engine.describe(nextBuild, f.skill, nb).effect.map((l) => l.text.toLowerCase());
      for (const text of f.nextLines) assert.ok(next.includes(expect(text).toLowerCase()), `${f.id} next: "${text}" in ${JSON.stringify(next)}`);
    }
    const syn = engine.synergies(b, f.skill, input("blvl"));
    if (f.synergyText) assert.deepEqual(syn.lines.map((l) => l.text), f.synergyText, f.id);
  }
});

test("Backstab mana stays nonnegative with bonus levels in both calculation paths", async () => {
  const { createGameEval } = await import("../src/planner/gamecalc.js");
  const fallbackData = structuredClone(data);
  delete fallbackData.skills.backstab.game;
  const fallback = createEngine(fallbackData);
  // 150 base, -4 per additional level, scaled by 64/256. Level 46 used
  // to display -7; verify the positive side of the boundary as well.
  for (const [lvl, expected] of [[20, 18], [37, 1], [38, 0], [39, 0], [46, 0], [100, 0]]) {
    const build = { cls: 'Assassin', level: 150, points: { backstab: 20 }, soft: { backstab: lvl - 20 }, quests: {}, buffs: [] };
    const e = createGameEval(data.skills.backstab.game, data.game.variables, { blvl: 20, lvl, ulvl: 150 });
    assert.equal(e.variable('mana'), expected, `effective level ${lvl}`);
    for (const calculator of [engine, fallback]) {
      const lines = calculator.describe(build, 'backstab', 20).effect.map(l => l.text);
      assert.ok(lines.some(l => l.toLowerCase() === `mana cost: ${expected}`), JSON.stringify(lines));
    }
  }
});

test("all classes: displayed mana costs remain finite and nonnegative at high bonus levels", () => {
  let checked = 0;
  for (const [id, skill] of Object.entries(data.skills)) {
    if (!skill.effect.some(line => /\{\{(?:minion_)?mana_cost\}\}/.test(line))) continue;
    for (const bonus of [0, 26, 100]) {
      const hard = Math.max(1, skill.max || 1);
      const build = { cls: skill.class, level: 150, points: { [id]: hard }, soft: { [id]: bonus }, quests: {}, buffs: [] };
      for (const line of engine.describe(build, id, hard).effect) {
        if (!/^Mana cost:/i.test(line.text)) continue;
        const value = Number(line.text.split(':')[1].trim());
        assert.ok(Number.isFinite(value) && value >= 0, `${id} +${bonus}: ${line.text}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `checked ${checked} mana costs`);
});

test("Backstab shows its conditional section and hard-point weapon bonus", () => {
  const build = { cls: 'Assassin', level: 150, points: { backstab: 2 }, soft: { backstab: 16 }, quests: {}, buffs: [] };
  const lines = engine.describe(build, 'backstab', 2).effect;
  // The game's own wording and order (its skilldesc text, drawn bottom-up).
  const heading = lines.findIndex(l => l.heading && l.text === 'While Backstabbing:');
  assert.ok(heading > 0);
  assert.equal(lines[heading + 1].text, '2% avoid per 5 base levels');
  assert.match(lines[heading + 2].text, /\+120% Weapon Physical Damage/);
  assert.ok(engine.describe(build, 'backstab', 3).effect.some(l => /\+140% Weapon Physical Damage/.test(l.text)));
});

test("skill references across all classes have readable names and styled segments", () => {
  let checked = 0;
  for (const [id, skill] of Object.entries(data.skills)) {
    const build = { cls: skill.class, level: 150, points: { [id]: 1 }, soft: {}, quests: {}, buffs: [] };
    const d = engine.describe(build, id, 1);
    for (const line of [...d.description, ...d.restriction, ...d.effect]) {
      assert.ok(!/\[\[/.test(line.text), `${id}: ${line.text}`);
      for (const segment of line.segments || []) {
        if (!segment.skill) continue;
        // As the game names it: an innate skill without the planner's "(Innate)".
        assert.equal(segment.text, engine.skillName(segment.skill).replace(/ \(Innate\)$/, ""));
        checked++;
      }
    }
  }
  // (Lines worth 0 are hidden as the game hides them, Execution's Broadside line at level 1 among them.)
  assert.ok(checked > 90, `styled ${checked} references`);
});

test("extracted skill fields agree with independent sources", async () => {
  const { createGameEval } = await import("../src/planner/gamecalc.js");
  const ev = (id, blvl, ulvl = 99) => createGameEval(data.skills[id].game, data.game.variables, { blvl, lvl: blvl, ulvl });
  // Mana cost (skills2code.bin + ManaShift): the in-game Incineration Trap tooltip says 5.
  const trap = fixtures.find((f) => f.skill === "incineration_trap");
  const shownMana = Number(/Mana Cost: (\d+)/.exec(trap.otherLines.join("\n"))[1]);
  assert.equal(ev("incineration_trap", 1).variable("mana"), shownMana);
  // Cooldown (skcd) and duration (len) equal MedianDB's fixed values where it has them.
  const frames = (id, key) => Number(/^frames\((\d+)\)$/.exec(data.skills[id].constants.find((c) => c.key === key).values[0])[1]);
  assert.equal(ev("summon_familiars", 1).variable("skcd"), frames("summon_familiars", "cooldown"));
  assert.equal(ev("deep_freeze", 1).variable("skcd"), frames("deep_freeze", "cooldown"));
  assert.equal(ev("summon_familiars", 1).variable("len"), frames("summon_familiars", "duration"));
  // Weapon damage % (SrcDam in 128ths) equals MedianDB for most skills that list it.
  let same = 0, total = 0;
  for (const [id, s] of Object.entries(data.skills)) {
    const row = s.game && s.constants.find((c) => c.key === "weapon_damage" && /^\d+$/.test(String(c.values[0])));
    if (!row) continue;
    total++;
    if (ev(id, 1).variable("wdm") === Number(row.values[0])) same++;
  }
  assert.ok(same / total > 0.8, `${same}/${total}`);
});

test("game tooltip text fills values MedianDB words differently or states as text", () => {
  const b = (id, blvl = 5) => ({ cls: data.skills[id].class, level: 100, points: { [id]: blvl }, quests: {} });
  const line = (id, key) => engine.describe(b(id), id, 5).effect.find((l) => l.parts.some((p) => p.key === key));
  // "Enemy Weapon Damage: -30%" is fixed text on Grim Presence's game tooltip.
  const gp = data.skills.grim_presence.game.lines.map((l) => l.textA).join("\n");
  const stated = Number(/Enemy Weapon Damage: (-?\d+)/.exec(gp)[1]);
  assert.equal(line("grim_presence", "enemy_weapon_damage").parts[0].values[0], stated);
  // Innate skills are paired with the game (class-less copies), without a cap or required level.
  assert.equal(data.skills.vindicate_innate.game.reqLevel, null);
  assert.ok(data.skills.vindicate_innate.game.lines.length > 0);
});

test("the only values still missing are the documented unknowns", () => {
  // exma/enma aren't decoded; stat 470 has no source in the skill data; minion life and
  // attack rating come from the summoned monster, which isn't modelled.
  const allowed = /\b(exma|enma)\b|stat 470|summoned monster/;
  for (const cls of engine.classNames)
    for (const tab of engine.tabs(cls))
      for (const n of engine.treeNodes(cls, tab))
        for (const [blvl, ulvl] of [[1, 1], [10, 100], [30, 150]]) {
          const b = { cls, level: ulvl, points: { [n.id]: blvl }, quests: {} };
          const lines = [...engine.describe(b, n.id, blvl).effect, ...(engine.synergies(b, n.id, blvl)?.lines || []), ...(engine.synergies(b, n.id, blvl)?.bonus || [])];
          for (const l of lines)
            for (const p of l.parts)
              if (p.source.status === "missing") assert.match(p.source.notes[0], allowed, `${n.id} ${p.key}: ${p.source.notes[0]}`);
        }
});

test("Death Pact's tree bonuses agree with MedianDB's planner for a real build", () => {
  // A Necromancer 83 build and MedianDB planner's Death Pact (shared by the project owner,
  // 2026-09-26): Weapon Physical Damage 47%, Attack Speed 1%, Spell Damage 2%, Mana 34,
  // Summon Elemental Resistances 0% (the game hides lines worth 0).
  const names = { "Angel of Death": 25, Apprenticeship: 5, "Blood Skeleton": 5, Carnage: 1, "Death Pact": 1, "Death Ripple": 5, "Death Ward": 1, Deathlord: 25, "Demonic Commune": 6, Embalming: 1, "Ominous Vigor": 5, Parasite: 1, Sacrifices: 1, Widowmaker: 6 };
  const points = {};
  for (const [n, p] of Object.entries(names)) points[Object.keys(data.skills).find((id) => data.skills[id].class === "Necromancer" && data.skills[id].name === n)] = p;
  const b = { cls: "Necromancer", level: 83, points, quests: {} };
  const shown = [...engine.describe(b, "death_pact", 1).effect, ...engine.synergies(b, "death_pact", 1).lines].map((l) => l.text).join("\n");
  for (const text of ["+47% to Weapon Physical Damage", "+1% to Attack Speed", "+2% to Spell Damage", "+34 to Mana"]) assert.ok(shown.includes(text), text);
  assert.ok(!shown.includes("Summon Elemental Resistances"), "0% line hidden");
});

test("element tags follow the game files: the damage table's element, never one its tooltip doesn't name", () => {
  const tags = (id) => data.skills[id].tags;
  // Parasite's damage and conversion are magic in game (issue #27); MedianDB tagged it Fire.
  assert.ok(tags("parasite").includes("Magic") && !tags("parasite").includes("Fire"));
  assert.ok(tags("earthquake").includes("Magic"), "added where MedianDB had none");
  assert.ok(tags("stampede").includes("Lightning") && tags("stampede").includes("Magic"), "a tag its tooltip names stays");
  const E = ["Fire", "Cold", "Lightning", "Poison", "Magic"];
  for (const [id, s] of Object.entries(data.skills)) {
    const own = E.find((e) => e.toLowerCase() === s.game?.elem?.type);
    if (own) assert.ok(s.tags.includes(own), `${id}: ${own}`);
  }
});

test("the tooltip's extra block is drawn one level ahead once learned; calculations use the skill's own level", () => {
  const b = { cls: "Druid", level: 150, points: { mana_pulse: 1 }, soft: {}, quests: {}, buffs: [] };
  const cold = (opts) => engine.describe(b, "mana_pulse", 1, opts).effect.map((l) => l.text).find((t) => /cold/.test(t));
  assert.equal(cold(), "+50 bonus cold damage to attack", "as the game shows it at 1/1");
  assert.equal(cold({ asShown: false }), "+28 bonus cold damage to attack", "what level 1 does");
  assert.equal(engine.skillValues(b, "mana_pulse").bonus_cold_damage_to_weapons[0], 28);
  // Unlearned (First Level): the current level either way.
  assert.equal(engine.describe({ ...b, points: {} }, "mana_pulse", 0).effect.map((l) => l.text).find((t) => /cold/.test(t)), "+28 bonus cold damage to attack");
});

test("maximum level is the game's: skills2.bin's cap plus its maximum-level formula", () => {
  const cap = (id, ulvl, points = {}) => engine.maxLevel({ cls: data.skills[id].class, level: ulvl, points: { [id]: 1, ...points }, quests: {} }, id);
  // Every in-game reading (GitHub issues #14-#20).
  assert.deepEqual([cap("warmth", 150), cap("barkskin", 150), cap("spiritual_alignment", 150), cap("holy_fire", 150)], [38, 30, 34, 25]);
  assert.deepEqual([cap("sanctity", 150), cap("consecration", 150), cap("aptitude", 150)], [5, 5, 5]);
  assert.deepEqual([cap("void_gazer", 100), cap("void_gazer", 104), cap("void_gazer", 150)], [1, 1, 11]);
  // A class's own copy of a shared skill: Specialization's +1 per 2 points (Blink reads skill(1185)).
  assert.equal(cap("blink", 150, { specialization: 10 }) - cap("blink", 150), 5);
  // Elemental Command's "(Current Bonus: +14)" at level 75: Trinity Arrow 5 + 14.
  assert.equal(cap("trinity_arrow", 75, { elemental_command: 1 }), 19);
  // "Requires either Pestilence or Dream Eater" (the game's own Nightwalker text).
  assert.ok(cap("nightwalker", 150, { pestilence: 1 }) > cap("nightwalker", 150));
});

test("attack rating bonus (toht) and maximum level (mlvl) are read from the game files", () => {
  const line = (id, blvl, re) => engine.describe({ cls: data.skills[id].class, level: 150, points: { [id]: blvl }, soft: {}, quests: {} }, id, blvl).effect.map((l) => l.text).find((t) => re.test(t));
  // skills.bin ToHit 10, LevToHit 5 (0x198, 0x19c).
  assert.equal(line("iron_spiral", 10, /Attack Rating/), "Attack Rating: +55%");
  // Harbinger's 50 frames ÷ Ceaseless Fury's cap of 6, as its own synergy text says (0.33 s per Base Level).
  assert.equal(line("ceaseless_fury", 3, /Cooldown/), "Cooldown reduced by 1 second");
});

test("in-game screenshots confirm what their lines rely on, and say which", () => {
  const b = { cls: "Assassin", level: 150, points: { shadow_dancer: 10 }, soft: {}, quests: {} };
  const crit = engine.describe(b, "shadow_dancer", 10).effect.find((l) => /Critical Strike/.test(l.text));
  const src = crit.parts[0].source;
  assert.ok(!src.gaps.includes("variable:pst1"), "passive slot 1 is confirmed");
  // The evidence itself: matching lines in several screenshots, none against.
  const t = engine.gapEvidence().get("function:reference");
  assert.ok(t.for.size >= 2 && !t.against.size);
  const ref = engine.describe({ cls: "Paladin", level: 150, points: { resurrect: 1, conclave: 1 }, soft: {}, quests: {} }, "resurrect", 1)
    .effect.find((l) => /^Life:/.test(l.text)).parts[0].source;
  assert.ok(ref.notes.some((n) => /^Checked against \d+ in-game screenshots?/.test(n)), "says which screenshots");
});
