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
  // Stormcall 2 → 4, Magic Missiles 1 → 3 and others).
  "mana",
  // Range and radius: Incineration Trap "Range: 8 yards", Lava Pit and Magic Missiles 2 yards.
  "rng",
  // Duration: Incineration Trap "Duration: 10 seconds", Mind Flay "Duration: 2 seconds".
  "len",
  // Mind Flay's Shock lines: "Enemy Movement Speed: -30%" (ast1), "Enemy Elemental Damage: -10%" (-ast2).
  "ast1", "ast2",
  // Mind Flay's physical damage table at levels 1-3: +2, 2-3, +3.
  "pdmn", "pdmx",
  // Families: each member runs the same code on a different slot of the same array, so one
  // member confirmed in game confirms the rest. ln12-ln78 (ln78: Anathema's duration, 14
  // readings), bl12-bl78 (bl12: Anathema's innate elemental damage, 9), ast1-ast6 (ast3:
  // Iron Golem's attack rating, 19; ast6: Lava Pit, Magic Missiles), pst1-pst5 and clc1-clc4
  // (formula slots of the skill's own record, confirmed across 138 in-game screenshots).
  "ln34", "ln56", "ln78", "bl12", "bl56", "bl78",
  "ast3", "ast4", "ast5", "ast6", "pst1", "pst2", "pst3", "pst4", "pst5", "clc2", "clc3", "clc4",
  // dm12-dm78: D2Common.dll 0x6FD9DC30, min(min + trunc(trunc(110 × lvl ÷ (lvl + 6)) × (max − min)
  // ÷ 100), max); dm34 matches Wild and Free's Hit Recovery in game (8 readings).
  "dm12", "dm34", "dm56", "dm78",
  // bd12-bd78: D2Sigma.dll 0x100A5BE0, the same by Base Level (D2Common #10306 with no bonus
  // levels), called with par1/par2 … par7/par8 (skills.bin 0x148-0x164); 0 below Base Level 1.
  "bd12", "bd34", "bd56", "bd78",
  // toht: skills.bin ToHit (0x198) + LevToHit (0x19c) × (lvl − 1). The only offset pair where
  // six skills' attack rating bonuses all come out as MedianDB states them (Iron Spiral, Overkill,
  // Raid, Angel of Death, Carnage, Catapult Shot).
  "toht",
  // mlvl: the skill's hard-point cap, skills2.bin's word at 0x2F (D2Sigma.dll 0x100A654C);
  // Ceaseless Fury's own text ("0.33 seconds per Base Level") is Harbinger's 50 frames ÷ its cap of 6.
  "mlvl",
  // Median XL's own variables, read from its callback (D2Sigma.dll, table 0x100A67B0 for
  // variables 73-110): wdm = SrcDam × 100 ÷ 128 (0x100A6532), blz1-blz7 and bdz1-bdz7 (bl and
  // bd with par(a) below Base Level 1), maxe (0x100A65C3).
  "wdm", "blz1", "blz3", "blz5", "blz7", "bdz1", "bdz3", "bdz5", "bdz7", "maxe",
  // enma/exma: D2Common.dll variables 49/50 (see variable); Lava Pit's First Level in game.
  "enma", "exma",
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
// bd12-bd78: the same diminishing returns counted by Base Level (D2Sigma.dll 0x100A5BE0, see
// CONFIRMED_VARIABLES). Ferocity's attack speed at Base Level 1 is 29% (MedianDB says 28%).
const BASE_DIMINISHING = { bd12: [0, 1], bd34: [2, 3], bd56: [4, 5], bd78: [6, 7] };

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
  // exact: per frame without rounding (a poison's total is rounded once, over its frames).
  function elemental(which, table = skill.elem, label = "elemental", exact = false) {
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
    if (exact) return (sum * (100 + synergy) * 2 ** hitShift) / 25600;
    const withSynergy = Math.trunc((sum * (100 + synergy)) / 100);
    return i32(Math.trunc((withSynergy * 2 ** hitShift) / 256));
  }
  // enma/exma (see variable): the damage in 256ths, plus mastery% of it, then ÷ 256.
  const MASTERY_STAT = { fire: 329, lightning: 330, cold: 331, poison: 332 };
  function elementalMastery(which) {
    const e = skill.elem;
    if (!e) throw new Error("skill has no elemental damage table");
    const hitShift = e.hitShift ?? 8;
    const sum = which === "min" ? levelTableSum(e.min, e.minLev, inputs.lvl) : levelTableSum(e.max, e.maxLev, inputs.lvl);
    let synergy = 0;
    if (e.synergy) {
      const s = calc(e.synergy);
      if (!s.ok) throw new Error(`damage synergy: ${s.reason}`);
      synergy = s.value;
    }
    const shifted = i32(Math.trunc((sum * (100 + synergy)) / 100) * 2 ** hitShift);
    const stat = MASTERY_STAT[e.type];
    let mastery = 0;
    if (stat) {
      const r = inputs.resolve?.("stat", stat, 0);
      if (r) { resolved.set(`stat${stat}`, r); mastery = r.value; }
      else assumed.set(`${e.type} spell damage (stat ${stat})`, 0);
    }
    return i32(Math.trunc((shifted + Math.trunc((shifted * mastery) / 100)) / 256));
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
    // Per-level values are 0 at level 0 (an unlearned skill another skill reads; see engine.js).
    else if (LINEAR[name]) v = inputs.lvl > 0 ? p(LINEAR[name][0]) + (inputs.lvl - 1) * p(LINEAR[name][1]) : 0;
    // At Base Level 0 (unlearned) it's 0: Shadow Dancer's First Level shows no Critical
    // Strike Chance (bl12 would otherwise be 15 − 1 = 14).
    else if (BASE_LINEAR[name]) v = inputs.blvl > 0 ? p(BASE_LINEAR[name][0]) + (inputs.blvl - 1) * p(BASE_LINEAR[name][1]) : 0;
    else if (DIMINISHING[name]) {
      // D2Common.dll 0x6FD9DC30: the level's share is truncated first, then capped at max.
      const [a, b] = DIMINISHING[name].map(p), L = inputs.lvl;
      v = L > 0 ? Math.min(a + Math.trunc((Math.trunc((110 * L) / (L + 6)) * (b - a)) / 100), b) : 0;
    } else if (BASE_DIMINISHING[name]) {
      // D2Sigma.dll 0x100A5BE0 (no cap at max, unlike dm).
      const [a, b] = BASE_DIMINISHING[name].map(p), L = inputs.blvl;
      v = L > 0 ? a + Math.trunc((Math.trunc((110 * L) / (L + 6)) * (b - a)) / 100) : 0;
    } else if (/^blz[1357]$/.test(name)) {
      // D2Sigma.dll 0x100A5C40 with its flag set: bl's par(a) + (blvl − 1) × par(b) from Base
      // Level 1, and par(a) itself below it (bl gives 0 there). Mind Spark's Tempest bolts.
      const a = +name[3] - 1;
      v = inputs.blvl > 0 ? p(a) + (inputs.blvl - 1) * p(a + 1) : p(a);
    } else if (/^bdz[1357]$/.test(name)) {
      // D2Sigma.dll 0x100A5BE0 with its flag set: bd, and par(a) below Base Level 1.
      const a = +name[3] - 1, L = inputs.blvl, lo = p(a), hi = p(a + 1);
      v = L > 0 ? lo + Math.trunc((Math.trunc((110 * L) / (L + 6)) * (hi - lo)) / 100) : lo;
    } else if (name === "maxe") {
      // D2Sigma.dll 0x100A65C3: 1 when the skill has points and its Base Level is its maximum
      // (bmax), else 0 (Dirge reads Soulbond's). The maximum comes from the planner's cap.
      const max = inputs.maxLevel ?? skill.cap ?? skill.baseCap;
      v = inputs.blvl > 0 && max != null && inputs.blvl >= max ? 1 : 0;
    } else if (/^clc[1-4]$/.test(name)) {
      // An empty slot is 0, as with ast1-ast6.
      v = field(skill.calcs?.[name], name);
    } else if (name === "mnar") {
      // Minion attack rating: par5 × (lvl − 1). Inferred from Blood Skeleton (par5 100: in
      // game 200, 300, 400 with its "+ 200") and Guardian Spirit (par5 150: 100, 250, 400).
      v = p(4) * (inputs.lvl - 1);
    } else if (name === "mnhp") {
      // Minion life: (par3 + (lvl − 1) × par4) × (100 + par2)% × (100 + the skill's own minion
      // life bonus)% × (100 + half the character level)%, rounded down once.
      // Own bonus: the skill's minion-life formula (clc1, when it reads stat 444, the minion
      // life stat: Guardian Spirit 1 + 9 × Base Level, Protector Spirit 1 + 15 × Base Level),
      // else its "+N% Life per Base Level" line (Blood Skeleton: none).
      // Character level: +ulvl ÷ 2 %, a separate multiplier, not added to the own bonus.
      // Protector Spirit at character level 150 settles both (GitHub: 728, 1996, 4428, 12124
      // at levels 1, 5, 10, 20: added together they'd need a bonus that grows with Base
      // Level); Blood Skeleton (120 at level 1, 121 at 3, 3576 at 99) and Guardian Spirit fit
      // too. Its source in the game files isn't known.
      // The game's result lands a hair above the exact product: × 1.0001 before rounding
      // down fits every value seen (Blood Skeleton's 3755, Protector Spirit's 499 × 4 and
      // 1107 × 4 would each be 1 short without it). Its fixed-point maths isn't known.
      const own = skill.calcs?.clc1;
      let bonus;
      if (own?.text && /stat\(stat 444\)|stat\(444\)/.test(own.text)) {
        const r = calc(own);
        if (!r.ok) throw new Error(`minion life bonus: ${r.reason}`);
        bonus = r.value;
      } else bonus = minionBonus("life") * inputs.blvl;
      const extra = Math.trunc(inputs.ulvl / 2);
      assumed.set("extra minion life % = character level ÷ 2, multiplied separately (fits the game at levels 1, 3, 99 and 150; source unknown)", extra);
      const base = p(2) + (inputs.lvl - 1) * p(3);
      v = Math.trunc(((base * (100 + p(1)) * (100 + bonus) * (100 + extra)) / 1000000) * 1.0001);
    } else if (["len", "rng", "skcd", "pets"].includes(name)) v = field(skill.vars?.[name], name);
    else if (name === "mana") {
      // Mana cost: (mana + lvlmana × (lvl − 1)) × 2^ManaShift / 256,
      // rounded down once. In game: Anathema (110, 22, shift 6) 27, 33, 77, 82, 132, 137 at
      // levels 1, 2, 10, 11, 20, 21; Psionic Storm (20, 42, shift 5) 2, 7, 49, 55, 128, 133;
      // Snake Bite (9, 29, shift 5) 70, 73 at 20, 21. Rounding each part on its own gives
      // 32, 7 and 58 there. Mind Flay (16, 18, shift 5) is the exception: the game shows
      // exactly 2 × level (GitHub issue #13), which this gives only at levels 1-4; its
      // fixtures record the difference, as do Resurrect's (both Paladin skills; the per-level
      // cost is about 10% lower in game). skills2.bin 0x3e, once read as a mana modifier, is
      // the maximum-level formula (engine.js gameMaxLevel); skills.bin's own mana fields are 0.
      const m = skill.mana;
      if (!m) throw new Error("skill has no mana data");
      // Median XL's mana routine (D2Sigma.dll 0x100A1CF7, per-level part 0x100A1DC0): the
      // per-level formula × (100 + Mana Cost of Skills, stat 228) ÷ 100, rounded down, then
      // (base + per-level × (level − 1)) << ManaShift, no lower than MinMana, ÷ 256. Resurrect's
      // and Mind Flay's in-game costs are this with −10% Mana Cost of Skills (44 → 39, 18 → 16).
      const base = field(m.base, "mana");
      let per = field(m.perLevel, "lvlmana");
      const r = inputs.resolve?.("stat", 228, 0);
      const reduction = r ? r.value : 0;
      if (r && r.value) resolved.set("stat228", r);
      per = Math.trunc((per * (100 + reduction)) / 100);
      const cost = Math.trunc(((base + per * (Math.max(1, inputs.lvl) - 1)) * 2 ** m.shift) / 256);
      // Falling per-level costs cannot grant mana (the same zero floor as the community path).
      v = Math.max(0, m.min ?? 0, cost);
    } else if (name === "wdm") v = Math.trunc(((skill.srcDam ?? 0) * 100) / 128);
    // toht: attack rating bonus %, ToHit + LevToHit × (level − 1) (D2 1.13c), 0 at level 0.
    else if (name === "toht") v = inputs.lvl > 0 ? (skill.toHit?.[0] ?? 0) + (inputs.lvl - 1) * (skill.toHit?.[1] ?? 0) : 0;
    // mlvl: the skill's hard-point cap. Ceaseless Fury's "Cooldown reduced by 0.33 seconds per
    // Base Level" is Harbinger's 50 frames ÷ its cap of 6 (Harbinger's skcd reads it as mlvl).
    else if (name === "mlvl") v = skill.cap ?? skill.baseCap ?? 0;
    // enma/exma: edmn/edmx with the character's mastery for the skill's element (D2Common.dll:
    // variables 49/50 run edmn's and edmx's routines, 0x6FDA0460 and 0x6FDA0360, with the
    // mastery flag set; 0x6FD9F870 reads fire, lightning, cold or poison spell damage, stats
    // 329-332) applied to the value before the ÷ 256. Lava Pit's First Level in game (no gear,
    // no mastery): enma × 5 = 40, exma × 5 = 45.
    else if (name === "enma" || name === "exma") v = elementalMastery(name === "enma" ? "min" : "max");
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
      // A slot the skill has no passive stat in reads 0 (Warmth's "Maximum Cold Resist" reads
      // pst3 of two; the game hides the line, GitHub issue #12).
      if (!row) return assumed.set(`${name} (no passive stat in that slot)`, 0), 0;
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
    // missref(missile, variable): a missile's parameter, by misscalc.bin's variable order
    // (par1-5, cpa1-5, hpa1-3, chp1-3, dpa1-2) from missiles.bin (merge-game.mjs missiles).
    if (fn === "missref") {
      const m = inputs.missiles?.[a];
      const groups = [["par", 5], ["cpa", 5], ["hpa", 3], ["chp", 3], ["dpa", 2]];
      let i = b;
      for (const [g, n] of groups) {
        if (i < n) {
          if (!m) throw new Error(`missile ${a} isn't extracted`);
          resolved.set(`missile ${a} ${g}${i + 1}`, { value: m[g][i], label: `missile ${a} ${g}${i + 1} (missiles.bin)` });
          return m[g][i];
        }
        i -= n;
      }
      throw new Error(`missref(${a}, ${b}): missile variable ${b} isn't modelled`);
    }
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
    elementalExact: (which) => elemental(which, skill.elem, "elemental", true),
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
