// Evaluates a skill's extracted game formulas (data/game/<patch>/skills.json) for a
// given Base Level, Effective Level and Character Level. Every evaluation reports
// which inputs it used and which conditions it had to assume, so the UI can show them.
import { decode, run, levelTableSum, lengthFrames, OPCODES, FUNCTIONS } from "./d2calc.js";

// Opcodes and functions decoded by inference (d2calc.js), by token name.
const INFERRED_OPS = new Set(Object.values(OPCODES).filter((o) => o.inferred).map((o) => o.name));

// Variables whose meaning has been confirmed against in-game values. Others are
// evaluated (their definitions follow D2 1.13c) but results using them are marked
// as not yet checked in game.
export const CONFIRMED_VARIABLES = new Set([
  "blvl", "lvl", "ulvl", "par1", "par2", "par3", "par4", "par5", "par6", "par7", "par8",
  "ln12", "bl34", "clc1", "edmn", "edmx", "edln",
  // Mana cost: every fixture's Mana Cost line matches (Discharge 240, Askari Lightning 5 → 8,
  // Stormcall 2 → 4, Magic Missiles 1 → 3 and others). The mana modifier stays unconfirmed.
  "mana",
  // Range and radius: Incineration Trap "Range: 8 yards", Lava Pit and Magic Missiles 2 yards.
  "rng",
  // Duration: Incineration Trap "Duration: 10 seconds", Mind Flay "Duration: 2 seconds".
  "len",
  // Mind Flay's Shock lines: "Enemy Movement Speed: -30%" (ast1), "Enemy Elemental Damage: -10%" (-ast2).
  "ast1", "ast2",
  // Mind Flay's physical damage table at levels 1-3: +2, 2-3, +3.
  "pdmn", "pdmx",
]);
// MedianDB stat keys ↔ D2 passive stat ids (ItemStatCost) with the same meaning.
export const STAT_IDS = {
  fire_spell_damage: 329, lightning_spell_damage: 330, cold_spell_damage: 331, poison_spell_damage: 332,
  fire_pierce: 333, lightning_pierce: 334, cold_pierce: 335, poison_pierce: 336,
};
// Weapon poison granted by a passive (D2 poisonmindam/poisonmaxdam/poisonlength).
export const WEAPON_POISON_STATS = { min: 57, max: 58, length: 59 };
const LINEAR = { ln12: [0, 1], ln34: [2, 3], ln56: [4, 5], ln78: [6, 7] };
const BASE_LINEAR = { bl12: [0, 1], bl34: [2, 3], bl56: [4, 5], bl78: [6, 7] };
const DIMINISHING = { dm12: [0, 1], dm34: [2, 3], dm56: [4, 5], dm78: [6, 7] };

/**
 * @param {object} skill  one entry of the extract's `skills`
 * @param {string[]} names  skillcalc variable names (extract.formula.variables)
 * @param {{ blvl: number, lvl: number, ulvl: number, conditions?: Record<string, number> }} inputs
 *   blvl: Base Level (hard points), lvl: Effective Level, ulvl: Character Level.
 *   conditions: values for references to other stats/skills (default 0, reported as assumed).
 *   resolve(kind, a, name): optional lookup for those references ("stat", stat id | "skill",
 *     game skill id, variable name). Returns { value, label } or undefined (then conditions/0).
 */
export function createGameEval(skill, names, inputs) {
  const used = new Set();
  const assumed = new Map();
  const resolved = new Map();
  const inferred = new Set();
  const cache = new Map();
  const p = (i) => skill.params[i] ?? 0;
  const i32 = (n) => n | 0;

  function calc(c) {
    if (!c) return { ok: false, reason: "no formula" };
    if (c.undecoded) return { ok: false, reason: c.undecoded };
    const d = decode(hexBytes(c.code));
    if (d.ok)
      for (const t of d.tokens) {
        if (INFERRED_OPS.has(t.op)) inferred.add(t.op);
        if (t.op === "func" && !FUNCTIONS[t.arg].confirmed && !["skillref", "statref"].includes(FUNCTIONS[t.arg].name)) inferred.add(FUNCTIONS[t.arg].name);
      }
    if (!d.ok) return { ok: false, reason: d.reason };
    try {
      return { ok: true, value: run(d.tokens, { variable, func }, names) };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }
  // Elemental damage before the per-stat formula: table sum by level bracket, the
  // skill's damage synergy, then HitShift into 1/256 units (D2 1.13c).
  // Physical damage (pdmn/pdmx) works the same way with the physical table, the
  // physical damage synergy and the same HitShift (D2 1.13c layout).
  function elemental(which, table = skill.elem, label = "elemental") {
    const e = table;
    if (!e) throw new Error(`skill has no ${label} damage table`);
    const hitShift = skill.elem?.hitShift ?? 8;
    const lvl = inputs.lvl;
    const sum = which === "min" ? levelTableSum(e.min, e.minLev, lvl) : levelTableSum(e.max, e.maxLev, lvl);
    let synergy = 0;
    if (e.synergy) {
      const s = calc(e.synergy);
      if (!s.ok) throw new Error(`damage synergy: ${s.reason}`);
      synergy = s.value;
    }
    const withSynergy = Math.trunc((sum * (100 + synergy)) / 100);
    return i32(Math.trunc((withSynergy * 2 ** hitShift) / 256));
  }
  // A summon's "+N% Minion Life per Base Level" synergy, for summons whose minion-life
  // formula doesn't include it. Read from the line's formula, or the number in its text
  // ("+25% Life per Base Level"); 0 if there's none. (Damage bonuses are already in the
  // damage formulas: Guardian Spirit's ast1 is stat 470 + par8 × blvl.)
  function minionBonus(kind) {
    const re = /Life( and Damage)? per Base Level/i;
    const l = skill.lines?.find((x) => re.test(`${x.textA || ""} ${x.textB || ""}`));
    if (!l) return 0;
    if (l.calcA) {
      const r = calc(l.calcA);
      if (!r.ok) throw new Error(`minion ${kind} bonus: ${r.reason}`);
      return r.value;
    }
    return Number(/([+-]?\d+)%/.exec(l.textA || "")?.[1] || 0);
  }
  // A formula-valued field; a field with no formula is 0 (as with ast1-ast6).
  function field(c, name) {
    if (!c) return 0;
    const r = calc(c);
    if (!r.ok) throw new Error(`${name}: ${r.reason}`);
    return r.value;
  }
  function variable(name) {
    used.add(name);
    if (cache.has(name)) return cache.get(name);
    let v;
    if (name === "blvl") v = inputs.blvl;
    else if (name === "lvl") v = inputs.lvl;
    else if (name === "ulvl") v = inputs.ulvl;
    else if (/^par[1-8]$/.test(name)) v = p(+name[3] - 1);
    else if (LINEAR[name]) v = p(LINEAR[name][0]) + (inputs.lvl - 1) * p(LINEAR[name][1]);
    else if (BASE_LINEAR[name]) v = p(BASE_LINEAR[name][0]) + (inputs.blvl - 1) * p(BASE_LINEAR[name][1]);
    else if (DIMINISHING[name]) {
      const [a, b] = DIMINISHING[name].map(p);
      v = a + Math.trunc((110 * inputs.lvl * (b - a)) / (100 * (inputs.lvl + 6)));
    } else if (/^blz[1357]$/.test(name)) {
      // Like bl12-bl78 but counted from Base Level 0: par(a) + blvl × par(b). Inferred
      // from the name; used once (Mind Spark's maximum Tempest bolts).
      const a = +name[3] - 1;
      v = p(a) + inputs.blvl * p(a + 1);
    } else if (/^clc[1-4]$/.test(name)) {
      // An empty slot is 0, as with ast1-ast6.
      v = field(skill.calcs?.[name], name);
    } else if (name === "mnar") {
      // Minion attack rating: par5 × (lvl − 1). Inferred from Blood Skeleton (par5 100: in
      // game 200, 300, 400 with its "+ 200") and Guardian Spirit (par5 150: 100, 250, 400).
      v = p(4) * (inputs.lvl - 1);
    } else if (name === "mnhp") {
      // Minion life: (par3 + (lvl − 1) × par4) × (100 + par2)% × (10000 + ulvl²) / 10000 ×
      // (100 + the skill's "% Minion Life per Base Level" × blvl)%, rounded once. Inferred
      // from Blood Skeleton (121, 242, 363 at character level 10) and Guardian Spirit
      // (144, 212, 228, 300 with its ×4 at character level 12-14).
      // Life bonus %: the skill's own minion-life formula (clc1, when it reads stat 444, the
      // minion life stat: Guardian Spirit 1 + 9 × Base Level, Blood Skeleton 0), else its
      // "+N% Life per Base Level" line; plus 1 once the skill is learned. That extra 1 is
      // fitted: both summons show it in game at character level 2-3 and its source isn't
      // known (unlearned Blood Skeleton shows 120, learned 121 per level).
      const own = skill.calcs?.clc1;
      let bonus;
      if (own?.text && /stat\(stat 444\)|stat\(444\)/.test(own.text)) {
        const r = calc(own);
        if (!r.ok) throw new Error(`minion life bonus: ${r.reason}`);
        bonus = r.value;
      } else bonus = minionBonus("life") * inputs.blvl;
      // An extra minion life % from character level: (ulvl − 1) / 2. In game: 0 below level 3
      // (unlearned Blood Skeleton 120), 1 at level 3 (Blood Skeleton, Guardian Spirit), 49 at
      // level 99 (Blood Skeleton level 20: 3576; Abyss Knight level 25: 5422). Its source in
      // the game files isn't known.
      const extra = Math.trunc((inputs.ulvl - 1) / 2);
      bonus += extra;
      assumed.set("extra minion life % = (character level − 1) ÷ 2 (fits the game at levels 1-3 and 99; source unknown)", extra);
      const base = p(2) + (inputs.lvl - 1) * p(3);
      v = Math.trunc((base * (100 + p(1)) * (100 + bonus)) / 10000);
    } else if (["len", "rng", "skcd", "pets"].includes(name)) v = field(skill.vars?.[name], name);
    else if (name === "mana") {
      // D2 mana cost: (mana + lvlmana × (lvl − 1)) × 2^ManaShift / 256.
      const m = skill.mana;
      if (!m) throw new Error("skill has no mana data");
      const base = field(m.base, "mana"), per = field(m.perLevel, "lvlmana");
      // Falling per-level costs cannot grant mana. Apply the same zero floor as
      // the community-data path, including references to another skill's cost.
      v = Math.max(0, Math.trunc(((base + per * (Math.max(1, inputs.lvl) - 1)) * 2 ** m.shift) / 256));
    } else if (name === "wdm") v = Math.trunc(((skill.srcDam ?? 0) * 100) / 128);
    // enma/exma: the elemental damage as the tooltip shows it (Stormcall's 4-5 makes
    // Askari Lightning's in-game 15; Lava Pit shows enma × 5 = 40, exma × 5 = 45). Equal to
    // edmn/edmx for a character without elemental mastery; whether mastery is included
    // isn't known yet.
    else if (name === "enma") v = elemental("min");
    else if (name === "exma") v = elemental("max");
    else if (name === "pdmn") v = elemental("min", skill.phys, "physical");
    else if (name === "pdmx") v = elemental("max", skill.phys, "physical");
    else if (/^ast[1-6]$/.test(name)) {
      // AuraStatCalc1-6. A slot with no formula is 0 (D2 behaviour; Incineration Trap's
      // in-game damage needs Subterfuge's empty ast6 to be 0).
      const c = skill.ast?.[name];
      if (!c) v = 0;
      else {
        const r = calc(c);
        if (!r.ok) throw new Error(`${name}: ${r.reason}`);
        v = r.value;
      }
    } else if (name === "area") {
      // The area the character is in: formulas give special values in a few zones.
      assumed.set("area (not in a special zone)", 0);
      v = 0;
    } else if (/^syn[1-6]$/.test(name) || name === "aura") {
      // Median XL-specific; meaning unknown. Assumed 0 and listed with the result:
      // Incineration Trap's in-game pierce, range and activation delay match only with
      // syn1 = syn2 = 0 and aura = 0.
      assumed.set(name, 0);
      v = 0;
    } else if (/^pst[1-5]$/.test(name)) {
      // Tooltip formulas' pstN: the value of passive stat slot N (inferred from Way of
      // the Spider, whose "Poison Spell Damage" line is pst1 = its first passive stat).
      const row = skill.passive?.find((x) => (x.slot ?? skill.passive.indexOf(x) + 1) === +name[3]);
      if (!row) throw new Error(`${name}: no passive stat in that slot`);
      const r = calc(row.calc);
      if (!r.ok) throw new Error(`${name}: ${r.reason}`);
      v = r.value;
    } else if (name === "edmn") v = elemental("min");
    else if (name === "edmx") v = elemental("max");
    else if (name === "edln") {
      const e = skill.elem;
      if (!e) throw new Error("skill has no elemental length");
      v = lengthFrames(e.len, e.lenLev, inputs.lvl);
      if (e.lenSynergy) {
        const s = calc(e.lenSynergy);
        if (!s.ok) throw new Error(`length synergy: ${s.reason}`);
        v = Math.trunc((v * (100 + s.value)) / 100);
      }
    } else throw new Error(`variable ${name} isn't modelled`);
    cache.set(name, v);
    return v;
  }
  function func(fn, args) {
    const [a, b] = args;
    // A random roll: tooltips use its average, listed as an assumption.
    if (fn === "rand") {
      const avg = Math.trunc((a + b) / 2);
      assumed.set(`random ${a}-${b} (average)`, avg);
      return avg;
    }
    // Buffs, states and stats from particular sources aren't tracked: counted as 0.
    if (fn === "state") return assumed.set(`state ${a} active`, 0), 0;
    if (fn === "statsrc") return assumed.set(`stat ${a} from source ${args[2]}`, 0), 0;
    if (fn === "unitstat") return assumed.set(`stat ${b} of related unit ${a}`, 0), 0;
    if (fn === "func10") {
      const r = inputs.resolve?.("tab", a);
      if (!r) throw new Error(`points in skill tree ${a} aren't available here`);
      resolved.set(`tree ${a}`, r);
      return r.value;
    }
        if (fn !== "statref" && fn !== "skillref") throw new Error(`${fn}(${args.join(", ")}) isn't modelled`);
    const stat = fn === "statref";
    const key = stat ? `stat${a}` : `skill${a}.${names[b]?.trim() ?? b}`;
    if (inputs.conditions?.[key] !== undefined) return inputs.conditions[key];
    const r = inputs.resolve?.(stat ? "stat" : "skill", a, stat ? b : names[b]?.trim());
    if (r) {
      resolved.set(key, r);
      return r.value;
    }
    assumed.set(key, 0);
    return 0;
  }
  return {
    calc,
    variable,
    /** Result of a passive stat's formula, by stat id. */
    passive(stat) {
      const row = skill.passive?.find((x) => x.stat === stat);
      return row ? calc(row.calc) : { ok: false, reason: "no such passive stat" };
    },
    used: () => [...used],
    assumed: () => Object.fromEntries(assumed),
    /** References filled from the build: { "stat1": { value, label }, … }. */
    resolved: () => Object.fromEntries(resolved),
    unconfirmed: () => [...used].filter((v) => !CONFIRMED_VARIABLES.has(v)),
    /** Operators and functions used whose decoding is inferred, not seen in game. */
    inferred: () => [...inferred],
  };
}

// Formulas are stored as hex so the data file stays plain JSON (no Buffer in browsers).
function hexBytes(hex) {
  const out = new Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** "Poison Damage to Weapon" style total: per-frame value (1/256 units) × frames / 256. */
export const poisonTotal = (perFrame, frames) => Math.trunc((perFrame * frames) / 256);
