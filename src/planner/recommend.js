// Item recommendations from the skills a build uses. Estimated and explainable:
//  1. buildProfile: what the chosen skills care about (elements, attack/spell/summon,
//     required weapons, which skills), weighted by points.
//  2. wantedStats: how much each character stat is worth to that profile.
//  3. Compare complete candidate characters for damage, survival and recovery;
//     retain small stat-based weights for unmodeled effects and socket/orb choices.
import { SLOTS } from "./items.js";
import { superiorVariants, superiorLabel } from "./superior.js";
import { ORBS, orbById, orbFits, orbGroup, orbMultiplier } from './orbs.js';
import { computeCharacter, activeSlots, ATTRIBUTES } from './character.js';
import { attributesSafe } from './requirements.js';
import { fundRequirements } from './attributeAllocation.js';
import { combatScore, combatReasons, relativeSpeed } from './combatScore.js';

const ELEMENTS = ["fire", "cold", "lightning", "poison", "magic", "physical"];
// Game stat ids (D2 ItemStatCost) read by skill formulas → item stat keys. 485 is Spell Focus
// (Flamefront's tooltip uses it in the docs' spell-focus formula).
const SCALING_STATS = {
  0: ["strength", "percent_strength"], 1: ["energy", "percent_energy"], 2: ["dexterity", "percent_dexterity"], 3: ["vitality", "percent_vitality"],
  329: ["fire_spell_damage"], 330: ["lightning_spell_damage"], 331: ["cold_spell_damage"], 332: ["poison_spell_damage"],
  333: ["enemy_fire_resistance"], 334: ["enemy_lightning_resistance"], 335: ["enemy_cold_resistance"], 336: ["enemy_poison_resistance"],
  485: ["spell_focus", "percent_spell_focus"],
};
const STAT_NAMES = { strength: "Strength", energy: "Energy", dexterity: "Dexterity", vitality: "Vitality", spell_focus: "Spell Focus" };
const ROLE_TAGS = { spell: ["Spell", "Melee Spell", "Curse", "Trap"], attack: ["Attack", "Weapon Damage", "Warp Strike"], summon: ["Summon", "Special Summon", "Totem"] };

// Weapon needs from restriction text ("Requires a bow or crossbow").
const WEAPON_WORDS = [
  ["bow", (c) => /Bows$/.test(c)],
  ["crossbow", (c) => /Crossbows$/.test(c)],
  ["spear", (c) => /Spears$/.test(c)],
  ["javelin", (c) => /Javelins$/.test(c)],
  ["throwing knife", (c) => c === "Throwing Knives"],
  ["throwing axe", (c) => c === "Throwing Axes"],
  ["sword", (c) => /Swords$/.test(c)],
  ["claw", (c) => c === "Assassin Claws"],
  ["naginata", (c) => c === "Assassin Naginatas"],
  ["halberd", (c) => c === "Assassin Naginatas"],
  ["dagger", (c) => /Daggers$/.test(c)],
  ["axe", (c) => /Axes$/.test(c) && !/Throwing/.test(c)],
  ["mace", (c) => /Maces$|Clubs$/.test(c)],
  ["hammer", (c) => /Hammers$/.test(c)],
  ["orb", (c) => c === "Sorceress Orbs"],
  ["scepter", (c) => c === "Scepters"],
  ["staff", (c) => /Staves$/.test(c)],
  ["wand", (c) => /Wands$/.test(c)],
  ["scythe", (c) => /Scythes$/.test(c)],
];
// Levels an item line gives one of the class's own skills: "(Class Only)" lines in full, plain
// "+N to Skill" lines at most +3 (the game's cap; character.js ownSkillItemLevels).
const ownSkillLevels = (p) => (p.cls ? p.value : Math.min(p.value, 3));
const RANGED = (c) => /Bows$|Crossbows$|Javelins$|Throwing/.test(c);
export function weaponNeed(restrictions) {
  for (const r of restrictions) {
    const m = /^Requires an? (.+)$/i.exec(r.trim());
    if (!m) continue;
    const text = m[1].toLowerCase();
    if (/melee weapon/.test(text)) return { label: "melee weapon", fits: (c) => !RANGED(c) };
    // Consume longer phrases first so "throwing axe" does not also satisfy plain "axe".
    const tests = [];
    let remaining = text;
    for (const [word, fits] of [...WEAPON_WORDS].sort((a, b) => b[0].length - a[0].length)) {
      const re = new RegExp(`\\b${word}s?\\b`);
      if (!re.test(remaining)) continue;
      tests.push(fits);
      remaining = remaining.replace(re, " ");
    }
    if (tests.length) return { label: m[1], fits: (c) => tests.some((f) => f(c)) };
  }
  return null;
}

/**
 * What the build's skills care about. Upgrade skills inherit from the skill they
 * modify (their tree parent); skills without element tags fall back to their own
 * scaling stats (a skill with "fire_damage" is a fire skill).
 */
export function buildProfile(b, engine) {
  // scaling: what the skills' damage formulas read (engine.skillScaling): stats (item stat
  // key → share) and synergy skills (skill id → share), e.g. Askari Lightning → Stormcall,
  // Energy and Spell Focus.
  const profile = { skills: {}, elements: {}, roles: {}, weapons: [], total: 0, scaling: { stats: {}, skills: {} } };
  const cache = new Map();
  function traits(id, depth = 0) {
    if (cache.has(id)) return cache.get(id);
    const s = engine.node(b, id) || engine.skill(id);
    const t = { elements: new Set(), roles: new Set(), weapon: null };
    if (!s) return t;
    for (const tag of s.tags) {
      const e = tag.toLowerCase();
      if (ELEMENTS.includes(e)) t.elements.add(e);
      for (const [role, tags] of Object.entries(ROLE_TAGS)) if (tags.includes(tag)) t.roles.add(role);
    }
    if (!t.elements.size)
      for (const c of s.constants || [])
        for (const e of ELEMENTS) if (c.key.includes(e) && !c.key.includes("resist")) t.elements.add(e);
    if (!t.roles.size && (s.constants || []).some((c) => c.key === "weapon_damage")) t.roles.add("attack");
    t.weapon = weaponNeed(s.restriction || []);
    if (t.weapon && !t.roles.size) t.roles.add("attack");
    // Upgrades and supports take on what the skill they build on does.
    if ((!t.elements.size || !t.roles.size) && depth < 4)
      for (const p of s.parents || []) {
        const pt = traits(p, depth + 1);
        if (!t.elements.size) pt.elements.forEach((e) => t.elements.add(e));
        if (!t.roles.size) pt.roles.forEach((r) => t.roles.add(r));
        t.weapon ??= pt.weapon;
      }
    cache.set(id, t);
    return t;
  }
  for (const [id, pts] of Object.entries(b.points)) {
    if (!pts || engine.isInnate(id)) continue;
    const s = engine.skill(id);
    // Passives count for +skill bonuses but shape the profile less than active skills.
    const w = pts * (s?.tags.includes("Passive") ? 0.4 : 1);
    profile.skills[id] = pts;
    profile.total += w;
    const sc = engine.skillScaling?.(id);
    if (sc) {
      for (const st of sc.stats)
        for (const key of SCALING_STATS[st] || []) profile.scaling.stats[key] = (profile.scaling.stats[key] || 0) + w;
      // Reading another skill's damage makes it as important as the skill itself; a
      // level synergy ("per level of X") a bit less.
      for (const [other, kind] of sc.skills)
        if (!engine.isInnate(other)) profile.scaling.skills[other] = (profile.scaling.skills[other] || 0) + w * (kind === "damage" ? 1 : 0.6);
    }
    const t = traits(id);
    t.elements.forEach((e) => (profile.elements[e] = (profile.elements[e] || 0) + w / t.elements.size));
    t.roles.forEach((r) => (profile.roles[r] = (profile.roles[r] || 0) + w / t.roles.size));
    if (t.weapon) {
      const hit = profile.weapons.find((x) => x.label === t.weapon.label);
      if (hit) hit.weight += w;
      else profile.weapons.push({ ...t.weapon, weight: w });
    }
  }
  const norm = (o) => {
    const sum = Object.values(o).reduce((a, x) => a + x, 0) || 1;
    for (const k of Object.keys(o)) o[k] /= sum;
  };
  norm(profile.elements);
  norm(profile.roles);
  for (const o of [profile.scaling.stats, profile.scaling.skills]) for (const k of Object.keys(o)) o[k] /= profile.total || 1;
  profile.weapons.sort((a, b) => b.weight - a.weight);
  const skillSum = Object.values(profile.skills).reduce((a, x) => a + x, 0) || 1;
  for (const k of Object.keys(profile.skills)) profile.skills[k] /= skillSum;
  return profile;
}

// What one "typical" amount of each stat is. Scores are value ÷ typical × worth.
const TYPICAL = {
  all_skills: 1, life: 150, maximum_life: 10, mana: 100, maximum_mana: 10, regenerate_mana: 30,
  strength: 30, dexterity: 30, vitality: 30, energy: 30, percent_strength: 10, percent_dexterity: 10, percent_vitality: 10, percent_energy: 10,
  fire_resistance: 20, cold_resistance: 20, lightning_resistance: 20, poison_resistance: 20, magic_resistance: 10, physical_resistance: 5,
  maximum_fire_resistance: 3, maximum_cold_resistance: 3, maximum_lightning_resistance: 3, maximum_poison_resist: 3,
  avoid_chance: 5, physical_damage_taken_reduced: 50, elemental_magic_damage_taken_reduced: 50,
  cast_speed: 20, attack_speed: 20, hit_recovery: 20, movement_speed: 20,
  fire_spell_damage: 20, cold_spell_damage: 20, lightning_spell_damage: 20, poison_spell_damage: 20, physical_magic_spell_damage: 20,
  enemy_fire_resistance: 10, enemy_cold_resistance: 10, enemy_lightning_resistance: 10, enemy_poison_resistance: 10, enemy_magic_resistance: 10,
  spell_focus: 50, percent_spell_focus: 10, bonus_to_poison_skill_duration: 20, mana_cost_of_skills: -10,
  enhanced_damage: 60, enhanced_weapon_damage: 30, min_damage: 20, max_damage: 30, deadly_strike: 10, chance_of_crushing_blow: 10,
  percent_attack_rating: 60, attack_rating: 500, life_stolen_per_hit: 4, innate_elemental_damage: 20,
  minimum_fire_damage: 40, maximum_fire_damage: 60, minimum_cold_damage: 40, maximum_cold_damage: 60,
  minimum_lightning_damage: 40, maximum_lightning_damage: 60, minimum_magic_damage: 40, maximum_magic_damage: 60, poison_damage: 100,
  summoned_minion_damage: 30, summoned_minion_life: 30, summoned_minion_resistances: 20, summoned_minion_attack_rating: 50, summon_physical_resistance: 5,
  life_after_each_kill: 50, life_on_striking: 50, life_on_melee_attack: 50, magic_find: 30,
};

/** How much each stat is worth (a "typical" amount) to this build and character. */
export function wantedStats(profile, character) {
  const r = profile.roles;
  const spell = r.spell || 0, attack = r.attack || 0, summon = r.summon || 0;
  const want = {
    all_skills: 10, life: 3, maximum_life: 3, strength: 0.8, dexterity: 0.8 + 1.2 * attack, vitality: 1.5,
    physical_resistance: 3, avoid_chance: 2, magic_resistance: 1, hit_recovery: 0.5, movement_speed: 0.5,
    physical_damage_taken_reduced: 1, elemental_magic_damage_taken_reduced: 1, life_after_each_kill: 0.5, magic_find: 0.2,
    cast_speed: 4 * spell, attack_speed: 4 * attack,
    spell_focus: 3 * spell, percent_spell_focus: 3 * spell, energy: 0.8 * spell, mana: 1.2 * spell, maximum_mana: 1.2 * spell,
    regenerate_mana: 1.5 * spell, mana_cost_of_skills: 1.5 * spell,
    enhanced_damage: 3 * attack, enhanced_weapon_damage: 3 * attack, min_damage: 1.5 * attack, max_damage: 2 * attack,
    deadly_strike: 2.5 * attack, chance_of_crushing_blow: 2 * attack, percent_attack_rating: 1.5 * attack,
    attack_rating: 1 * attack, life_stolen_per_hit: 2 * attack, life_on_striking: 0.8 * attack, life_on_melee_attack: 0.8 * attack,
    summoned_minion_damage: 4 * summon, summoned_minion_life: 3 * summon, summoned_minion_resistances: 2 * summon,
    summoned_minion_attack_rating: 1.5 * summon, summon_physical_resistance: 2 * summon,
  };
  // Complementary sustain: faster attacks make on-hit recovery more useful, and
  // existing on-hit recovery makes additional attack speed more valuable.
  const melee = character.weapon && !RANGED(character.weapon.def.cat || '');
  const speed = relativeSpeed(character.s('attack_speed'), character.weapon?.head.speedMod || 0);
  const healing = character.s('life_on_striking') + (melee ? character.s('life_on_melee_attack') : 0);
  want.life_on_striking = 2 * attack * speed;
  want.life_on_melee_attack = melee ? 2 * attack * speed : 0;
  want.attack_speed += attack * Math.min(4, healing / 25);
  for (const [el, share] of Object.entries(profile.elements)) {
    if (el === "physical") continue;
    const k = el === "magic" ? "physical_magic_spell_damage" : `${el}_spell_damage`;
    want[k] = (want[k] || 0) + 5 * share * (spell + 0.3 * summon);
    want[`enemy_${el}_resistance`] = (want[`enemy_${el}_resistance`] || 0) + 5 * share * (spell + attack);
    if (el !== "poison") {
      want[`minimum_${el}_damage`] = 1.5 * share * attack;
      want[`maximum_${el}_damage`] = 2 * share * attack;
    } else {
      want.poison_damage = 2 * share * attack;
      want.bonus_to_poison_skill_duration = 2 * share * spell;
    }
    want.innate_elemental_damage = (want.innate_elemental_damage || 0) + 2 * share * attack;
  }
  // Stats the skills' own formulas read: a strong, direct reason to want them.
  for (const [key, share] of Object.entries(profile.scaling?.stats || {})) want[key] = (want[key] || 0) + 4 * share;
  if (profile.elements.physical) want.physical_magic_spell_damage = (want.physical_magic_spell_damage || 0) + 4 * profile.elements.physical * spell;
  // Resistances matter most while below the cap.
  for (const el of ["fire", "cold", "lightning", "poison"]) {
    const res = character.resist[el];
    const short = res.value < res.max;
    want[`${el}_resistance`] = short ? 3 : 0.4;
    const mk = el === "poison" ? "maximum_poison_resist" : `maximum_${el}_resistance`;
    want[mk] = short ? 0.5 : 2;
  }
  return want;
}

/**
 * Scores items for one slot. Returns [{ def, state, score, reasons, warnings }], best first.
 */
// maxOrbs: at most that many mystic orbs per item (starter builds' levelling stages).
// minTiers: { item or runeword base key: lowest tier (variant) allowed }, so a levelling build
// never goes back to a lower tier of something it already had.
export function recommendForSlot(slot, { build, engine, catalog, planner, character, profile, want, weaponEnhancements = false, includeUnique = false, allocateAttributes = false, superior = false, maxOrbs = null, minTiers = null, minGemLevel = null, allow = null, judge = null }, limit = 30) {
  const mainSlot = slot === 'offhand' ? 'weapon' : slot === 'offhand2' ? 'weapon2' : null;
  if (mainSlot && build.gear[mainSlot] && catalog.resolve(build.gear[mainSlot], build.level)?.twoHanded) return [];
  const slotDef = SLOTS.find((s) => s.id === slot);
  const isWeapon = slot.startsWith("weapon");
  const need = isWeapon && profile.roles.attack > 0.3 ? profile.weapons[0] : null;
  // Bow and crossbow builds hold a quiver, not a shield.
  const launcher = profile.roles.attack > 0.3 && profile.weapons[0];
  const wantsQuiver = !isWeapon && slot.startsWith("offhand") && launcher && (launcher.fits("Bows") || launcher.fits("Crossbows"));
  const quiverFits = (cat) =>
    (launcher.fits("Bows") && cat === "Arrow Quivers") || (launcher.fits("Crossbows") && cat === "Crossbow Quivers");
  const equippedSets = new Map();
  for (const r of Object.values(character.equipped))
    if (r.def.setId != null && !(build.gear[slot] && character.equipped[slot] === r)) equippedSets.set(r.def.setId, (equippedSets.get(r.def.setId) || 0) + 1);

  const out = [];
  const weaponCandidates = new Map();
  const env = { engine, catalog, planner };
  const baseline = combatScore(build, character, engine, profile);
  const strippedCache = new Map();
  // Points spent meeting an item's Strength or Dexterity requirement can't go where the build
  // would otherwise put them (Energy for a caster, Vitality for most), so each is charged at
  // the average worth of a free point: the best gain from putting all of them into one
  // attribute, divided by their number. (The first few points are worth more than the rest, so
  // pricing by them would overcharge.) Without this, requirements looked free and casters
  // ended up with 600+ Strength.
  let pointValue = null;
  const valueOfPoint = () => {
    if (pointValue != null) return pointValue;
    const free = character.statPoints.available - character.statPoints.spent;
    if (free <= 0) return (pointValue = 0);
    const gains = ATTRIBUTES.map((a) => {
      const next = { ...build, attrs: { ...build.attrs, [a]: (build.attrs[a] || 0) + free } };
      return combatScore(next, computeCharacter(next, env), engine, profile).score - baseline.score;
    });
    return (pointValue = Math.max(0, ...gains) / free);
  };
  const fitsAttributes = (state, r) => {
    // Mirror equip(): changing handedness may also remove the other hand.
    const gear = { ...build.gear };
    delete gear[slot];
    const off = slot === 'weapon' ? 'offhand' : slot === 'weapon2' ? 'offhand2' : null;
    const main = slot === 'offhand' ? 'weapon' : slot === 'offhand2' ? 'weapon2' : null;
    let removed = '';
    if (off && r.twoHanded && gear[off]) removed = off;
    if (main && gear[main] && catalog.resolve(gear[main], build.level)?.twoHanded) removed = main;
    if (removed) delete gear[removed];
    if (!strippedCache.has(removed)) strippedCache.set(removed, computeCharacter({ ...build, gear }, env));
    const bare = strippedCache.get(removed);
    // An item cannot supply the attributes needed to equip itself.
    let attrs = build.attrs;
    if (r.head.reqStr > bare.attributes.strength.total || r.head.reqDex > bare.attributes.dexterity.total) {
      if (!allocateAttributes) return null;
      attrs = fundRequirements({ ...build, gear }, { strength: r.head.reqStr, dexterity: r.head.reqDex }, env);
      if (!attrs) return null;
    }
    const next = { ...build, attrs, gear: { ...gear, [slot]: state } };
    const after = computeCharacter(next, env);
    if (!attributesSafe(character, after, [slot])) return null;
    const outcome = combatScore(next, after, engine, profile);
    const extra = ATTRIBUTES.reduce((n, a) => n + Math.max(0, (attrs[a] || 0) - (build.attrs[a] || 0)), 0);
    return { ...outcome, score: outcome.score - (extra ? extra * valueOfPoint() : 0), attrs };
  };
  for (const def of catalog.forSlot(slot, build.cls)) {
    if (def.kind === "base") continue;
    // Only items the caller allows (found gear for a starter build's levelling stages, availability.js).
    if (allow && !allow(def)) continue;
    // Not items whose skill bonuses are another class's (items.js otherClassSkills).
    if (catalog.forClass && !catalog.forClass(def, build.cls)) continue;
    let states;
    if (def.kind === "runeword") {
      const bases = catalog.runewordBases(def).filter((b) => catalog.fitsSlot(b, slot, build.cls) && (!need || need.fits(b.cat)));
      states = bases.flatMap(base => base.variants.flatMap((v, i) => {
        const sockets = Number(/^Socketed \((\d+)\)/.exec(v.lines.find(l => /^Socketed/.test(l)) || '')?.[1] || 0);
        return sockets >= def.runes.length ? [{ ref: def.key, base: base.key, baseVariant: i }] : [];
      })).sort((a, b) => b.baseVariant - a.baseVariant);
    } else {
      states = def.variants.map((_, variant) => ({ ref: def.key, variant })).reverse();
    }
    let state, r, outcome;
    const viable = [];
    // States run from the highest tier down (per base, for runewords). Once a tier fits without
    // extra attribute points, the lower tiers of that item or base can't beat it (they have the
    // same lines, lower), so they aren't scored.
    const settled = new Set();
    for (const candidate of states) {
      const tierKey = candidate.base || candidate.ref;
      if (settled.has(tierKey)) continue;
      if (minTiers && (minTiers[tierKey] ?? -1) > (candidate.base ? candidate.baseVariant : candidate.variant)) continue;
      const resolved = catalog.resolve(candidate, build.level);
      if (!resolved || resolved.head.reqLevel > build.level) continue;
      if (need && resolved.def.slotType === 'weapon' && !need.fits(resolved.def.cat)) continue;
      if (wantsQuiver && !(resolved.def.slotType === 'quiver' && quiverFits(resolved.def.cat))) continue;
      const evaluated = fitsAttributes(candidate, resolved);
      if (!evaluated) continue;
      if (evaluated.attrs === build.attrs) settled.add(tierKey);
      if (isWeapon && weaponEnhancements) viable.push({ state: candidate, outcome: evaluated });
      if (!outcome || evaluated.score > outcome.score) {
        state = candidate; r = resolved; outcome = evaluated;
      }
    }
    if (!r) continue;
    // A runeword in a Superior base (superior.js), at the variant's best roll: tried on the best
    // base found, and kept if it scores higher. Assumes Median XL allows runewords in superior
    // bases, as D2 does (the option can be turned off).
    if (superior && def.kind === "runeword")
      for (const v of superiorVariants(r.def.slotType)) {
        const candidate = { ...state, superior: v.id };
        const resolved = catalog.resolve(candidate, build.level);
        const evaluated = resolved && resolved.head.reqLevel <= build.level && fitsAttributes(candidate, resolved);
        if (!evaluated) continue;
        if (isWeapon && weaponEnhancements) viable.push({ state: candidate, outcome: evaluated });
        if (evaluated.score > outcome.score) { state = candidate; r = resolved; outcome = evaluated; }
      }
    if (viable.length) weaponCandidates.set(def.key, viable);

    let score = 0;
    const parts = [];
    for (const p of r.parsed) {
      let v = 0;
      let text = p.text;
      if (p.kind === "stats")
        for (const [key, value] of p.effects) {
          if (key === `class_skills:${build.cls}`) v += value * 8;
          else if (want[key] && TYPICAL[key]) v += (value / TYPICAL[key]) * want[key];
        }
      // +levels to a skill the build uses are worth more the more points it has.
      else if (p.kind === "skill" && profile.skills[p.id]) v = ownSkillLevels(p) * (4 + 20 * profile.skills[p.id]);
      // +levels to a synergy of the build's skills (Stormcall for Askari Lightning).
      else if (p.kind === "skill" && profile.scaling?.skills[p.id]) {
        v = ownSkillLevels(p) * (3 + 15 * profile.scaling.skills[p.id]);
        text = `${p.text} (synergy for your skills)`;
      }
      // Levels in class skills the build doesn't use are nearly worthless to it.
      else if (p.kind === "skill" && engine.node(build, p.id)) v = ownSkillLevels(p) * 0.05;
      else if (p.kind === "skillmod" && profile.skills[p.id]) v = 3;
      if (v > 0.05) {
        score += v;
        parts.push({ v, text });
      }
    }
    if (def.setId != null && equippedSets.has(def.setId)) {
      score += 4;
      parts.push({ v: 4, text: `Adds to your ${catalog.setById(def.setId).name} set` });
    }
    const warnings = [];
    parts.sort((x, y) => y.v - x.v);
    // A small fallback for useful effects the damage model cannot yet evaluate.
    // Known damage and durability dominate; +skills are valued through their actual effects.
    const fallback = Math.min(outcome.knownDamage ? 2 : 15, score * (outcome.knownDamage ? 0.02 : 0.15));
    // A build that doesn't attack gets nothing from its weapon's damage: the weapon's +levels to
    // its own skills count for more (as refine.mjs casterSkills), so caster weapons with +skills
    // make the shortlist instead of stat sticks (Stormcall's Gnarled Root at level 50).
    let casterLevels = 0;
    if (isWeapon && !((profile.roles.attack || 0) > 0.2) && ((profile.roles.spell || 0) + (profile.roles.summon || 0)) > 0)
      for (const p of r.parsed) {
        if (p.kind === "stats") for (const [key, value] of p.effects) { if (key === "all_skills" || key === `class_skills:${build.cls}`) casterLevels += value; }
        else if (p.kind === "skill" && profile.skills[p.id]) casterLevels += ownSkillLevels(p);
      }
    score = outcome.score - baseline.score + fallback + 1.2 * casterLevels;
    const comparisons = combatReasons(baseline, outcome);
    // r.def carries the runeword's base (name and icon).
    out.push({ def: r.def, state, attrs: outcome.attrs, score, improvement: outcome.score - baseline.score,
      reasons: [...(r.superior ? [{ text: `In a ${superiorLabel(r.superior).replace(/^Superior:/, "Superior base:")}` }] : []), ...comparisons.slice(0, 2), ...parts.slice(0, 2)].map(x => x.text), warnings });
  }
  out.sort((x, y) => y.score - x.score);
  if (isWeapon && weaponEnhancements) {
    // Refine a bounded shortlist with the equipment that will actually be applied.
    // Compare every wearable unique tier: lower tiers can have more orb headroom.
    // Runewords use their strongest wearable base (their sockets are already filled).
    const shortlist = out.slice(0, 12);
    const current = out.find(rec => rec.def.key === build.gear[slot]?.ref);
    if (current && !shortlist.includes(current)) shortlist.push(current);
    for (const rec of shortlist) {
      const candidates = weaponCandidates.get(rec.def.key).sort((a, b) => b.outcome.score - a.outcome.score);
      const states = (rec.def.kind === 'runeword' ? candidates.slice(0, 1) : candidates).map(c => c.state);
      if (rec.def.key === build.gear[slot]?.ref) states.push(build.gear[slot]);
      const fallback = rec.score - rec.improvement;
      let bestScore = rec.improvement + baseline.score;
      for (const candidate of states) {
        const gear = { ...build.gear, [slot]: candidate };
        if (catalog.resolve(candidate, build.level)?.twoHanded) delete gear[slot === 'weapon' ? 'offhand' : 'offhand2'];
        const plan = suggestEnhancements({ build: { ...build, gear }, ...env, computeCharacter, activeSlots,
          profile, only: slot, includeUnique, maxOrbs, minGemLevel, allow, judge });
        const state = plan.gear[slot], resolved = catalog.resolve(state, build.level);
        if (!resolved || resolved.head.reqLevel > build.level) continue;
        const outcome = fitsAttributes(state, resolved);
        if (!outcome || outcome.score <= bestScore) continue;
        bestScore = outcome.score;
        rec.state = state;
        rec.attrs = outcome.attrs;
        rec.def = resolved.def;
        rec.improvement = outcome.score - baseline.score;
        rec.score = rec.improvement + fallback;
        rec.reasons = combatReasons(baseline, outcome).slice(0, 3).map(r => r.text);
        rec.reasons.push('Compared with suggested orbs and sockets');
      }
    }
    out.sort((x, y) => y.score - x.score);
  }
  return out.slice(0, limit);
}

/** Plain-language summary of the profile for the UI. */
export function describeProfile(profile) {
  const pct = (x) => Math.round(x * 100);
  const top = (o) =>
    Object.entries(o)
      .filter(([, v]) => v >= 0.15)
      .sort((a, b) => b[1] - a[1]);
  const roleNames = { spell: "spells", attack: "weapon attacks", summon: "summons" };
  return {
    elements: top(profile.elements).map(([k, v]) => ({ name: k, pct: pct(v) })),
    roles: top(profile.roles).map(([k, v]) => ({ name: roleNames[k], pct: pct(v) })),
    weapon: profile.weapons[0]?.label || null,
    // What the skills' formulas read: stats and synergy skills, strongest first.
    scalesWith: Object.entries(profile.scaling?.stats || {})
      .filter(([k, v]) => STAT_NAMES[k] && v >= 0.1)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => STAT_NAMES[k]),
    synergySkills: Object.entries(profile.scaling?.skills || {})
      .filter(([, v]) => v >= 0.1)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k),
    empty: profile.total === 0,
  };
}

// ---------- Sockets
// Fills the empty sockets of the equipped items (not runewords, whose runes are fixed),
// one socket at a time, with the gem, rune or jewel worth most to this build: the same
// stat weights as the gear suggestions (damage from the build's elements, roles and what
// its formulas scale with), with resistances counted only up to the cap. The character is
// recomputed after every pick, so once a resistance is capped the next socket goes
// elsewhere.
const RESISTS = { fire_resistance: "fire", cold_resistance: "cold", lightning_resistance: "lightning", poison_resistance: "poison" };

function socketValue(parsed, want, character, profile, build) {
  let v = 0;
  const parts = [];
  for (const p of parsed) {
    let x = 0;
    if (p.kind === "stats")
      for (const [key, value] of p.effects) {
        if (RESISTS[key]) {
          // Only the part that fills the gap to the cap counts, and it counts more the
          // further below the cap the character is (4 when nearly capped, 20 when far off):
          // capping resistances comes first, as usually advised for Hell.
          const res = character.resist[RESISTS[key]];
          const gap = Math.max(0, res.max - res.value);
          const weight = 4 + 16 * Math.min(1, gap / Math.max(1, res.max));
          x += (Math.min(value, gap) * weight + Math.max(0, value - gap) * 0.1) / TYPICAL[key];
        } else if (key === `class_skills:${build.cls}`) x += value * 8;
        else if (want[key] && TYPICAL[key]) x += (value / TYPICAL[key]) * want[key];
      }
    else if (p.kind === "skill" && profile.skills[p.id]) x = ownSkillLevels(p) * (4 + 20 * profile.skills[p.id]);
    else if (p.kind === "skill" && profile.scaling?.skills[p.id]) x = ownSkillLevels(p) * (3 + 15 * profile.scaling.skills[p.id]);
    if (Math.abs(x) > 0.02) {
      v += x;
      parts.push({ x, text: p.text });
    }
  }
  parts.sort((a, b) => b.x - a.x);
  return { v, reasons: parts.slice(0, 2).map((p) => p.text) };
}

/**
 * @returns {{ gear: object, picks: { slot, index, ref, name, reasons }[] }} the gear with
 *   sockets filled (a copy) and what went where.
 */
// minGemLevel: no gem below this level (normal 12, flawless 15, perfect 18): a levelling build
// that has socketed flawless gems doesn't go back to normal ones. Runes and jewels aren't graded.
export function suggestSockets({ build, engine, catalog, planner, computeCharacter, activeSlots, profile, only = null, minGemLevel = null, allow = null, keepOrbRoom = false }) {
  // A plain copy (the store's gear is a reactive proxy, which structuredClone can't copy).
  const gear = JSON.parse(JSON.stringify(build.gear));
  const reqLevel = (d) => {
    if (d.kind === "socketable") return d.lvl || 0;
    const l = d.variants?.at(-1)?.lines.find((x) => /^Required Level: /.test(x));
    return l ? parseInt(l.split(": ")[1], 10) || 0 : 0;
  };
  const candidates = [...catalog.socketables(), ...catalog.jewels()].filter((d) => (!allow || allow(d)) && (!catalog.forClass || catalog.forClass(d, build.cls)) && reqLevel(d) <= build.level
    && !(minGemLevel && d.kind === "socketable" && d.kindLabel === "Gems" && (d.lvl || 0) < minGemLevel));
  // Jewels are all unique items: each is suggested at most once (already socketed ones
  // count), so rare finds aren't stacked. Gems and runes can repeat.
  const usedJewels = new Set(
    Object.values(gear).flatMap((st) => (st?.sockets || []).filter((ref) => ref && catalog.get(ref)?.slotType === "jewel")),
  );
  const picks = [];
  for (const slot of activeSlots(build)) {
    if (only && !(Array.isArray(only) ? only.includes(slot) : slot === only)) continue;
    const st = gear[slot];
    const r0 = st && catalog.resolve(st, build.level);
    if (!r0 || r0.def.kind === "runeword") continue;
    for (let i = 0; i < r0.socketCount; i++) {
      if (st.sockets?.[i]) continue;
      const character = computeCharacter({ ...build, gear }, { engine, catalog, planner });
      const want = wantedStats(profile, character);
      // Score each filler from its own lines, then check the best first (resolving the item
      // and the attribute check are the costly parts); the first that passes is the pick.
      // The sort is stable, so ties keep catalogue order.
      const scored = candidates
        .filter((d) => !(d.slotType === "jewel" && usedJewels.has(d.key)) && (!keepOrbRoom || reqLevel(d) <= r0.head.reqLevel))
        .map((d) => ({ d, score: socketValue(catalog.socketFill(d, r0.def.slotType, build.level).parsed, want, character, profile, build) }))
        .sort((a, b) => b.score.v - a.score.v);
      let best = null;
      for (const { d, score } of scored) {
        const sockets = [...(st.sockets || [])];
        sockets[i] = d.key;
        const r = catalog.resolve({ ...st, sockets }, build.level);
        if (!r || r.head.reqLevel > build.level || !r.sockets[i]) continue;
        const after = computeCharacter({ ...build, gear: { ...gear, [slot]: { ...st, sockets } } }, { engine, catalog, planner });
        if (attributesSafe(character, after)) { best = { ...score, d }; break; }
      }
      if (!best || best.v <= 0) continue;
      st.sockets = [...(st.sockets || [])];
      st.sockets[i] = best.d.key;
      if (best.d.slotType === "jewel") usedJewels.add(best.d.key);
      picks.push({ slot, index: i, ref: best.d.key, name: best.d.name, reasons: best.reasons });
    }
  }
  return { gear, picks };
}

// Compare two greedy plans: reserve sockets first, or spend the orb allowance first.
// Both retain existing enhancements and validate the final requirement on every pick.
const orbMayStrandGear = (p) =>
  /^Requirements \+/.test(p.text) ||
  (p.kind === 'stats' && p.effects.some(([k, v]) => v < 0 && /^(percent_)?(strength|dexterity)$/.test(k)));

export function suggestEnhancements(options) {
  const { build, catalog, engine, planner, computeCharacter, activeSlots, profile, only, includeUnique = false, maxOrbs = null } = options;
  const slots = activeSlots(build).filter(s => !only || (Array.isArray(only) ? only.includes(s) : s === only));
  const original = computeCharacter(build, { engine, catalog, planner });
  const want = wantedStats(profile, original);
  // keepOrbRoom: socket fillers no higher-level than the item itself, so the orbs' level cost
  // (+4 each) still fits (a level-120 jewel leaves a level-51 weapon room for one orb at 125).
  function plan(socketsFirst, keepOrbRoom = false) {
    let gear = JSON.parse(JSON.stringify(build.gear)), picks = [];
    const orbPicks = [];
    if (socketsFirst) ({ gear, picks } = suggestSockets({ ...options, keepOrbRoom, build: { ...build, gear } }));
    // All normal orbs cost at least four levels. This also bounds malformed inputs.
    for (let step = 0; step < slots.length * 40; step++) {
      const character = computeCharacter({ ...build, gear }, { engine, catalog, planner });
      const weights = wantedStats(profile, character);
      let best = null;
      for (const slot of slots) {
        const st = gear[slot], r = st && catalog.resolve(st, build.level);
        if (!r || r.head.reqLevel > build.level) continue;
        for (const o of ORBS) {
          if (o.unique && !includeUnique || o.minLevel > build.level || !orbFits(o, r.def, r.lines, st)) continue;
          if (maxOrbs != null && (st.orbs || []).length >= maxOrbs) continue;
          if ((st.orbs || []).filter(id => orbGroup(orbById(id) || { id }) === orbGroup(o)).length >= o.limit) continue;
          // An orb adds its level cost after everything else (catalog.resolve), so the
          // requirement and the orb's effect are known without resolving the whole item.
          if (r.head.reqLevel + o.reqLevel > build.level) continue;
          const next = { ...st, orbs: [...(st.orbs || []), o.id] };
          // Honorific items get double from their orbs (items.js), as do items that say so.
          const applied = { parsed: catalog.orbParsed(o, orbMultiplier(r.lines) * (r.honorific ? 2 : 1), build.level) };
          // Only recommend bonuses the planner can quantify.
          if (applied.parsed.some(p => !['stats', 'skill', 'info'].includes(p.kind))) continue;
          const score = socketValue(applied.parsed, weights, character, profile, build);
          if (score.v > 0.02 && (!best || score.v / o.reqLevel > best.value)) {
            // Only an orb that lowers Strength or Dexterity, or raises requirements, can leave
            // gear unwearable; the full check (a whole character computation) is kept for those.
            const safe = !applied.parsed.some(orbMayStrandGear) ||
              attributesSafe(character, computeCharacter({ ...build, gear: { ...gear, [slot]: next } }, { engine, catalog, planner }));
            if (safe) best = { slot, next, orb: o, reasons: score.reasons, value: score.v / o.reqLevel };
          }
        }
      }
      if (!best) break;
      gear[best.slot] = best.next;
      orbPicks.push({ slot: best.slot, ref: best.orb.id, name: best.orb.name, reasons: best.reasons });
    }
    if (!socketsFirst) ({ gear, picks } = suggestSockets({ ...options, keepOrbRoom, build: { ...build, gear } }));
    // Score the aggregate addition, so resistance above the cap isn't rewarded per orb.
    const effects = new Map(), other = [];
    for (const slot of slots) {
      const st = gear[slot];
      if (!st) continue;
      const r = catalog.resolve(st, build.level);
      const added = [
        ...r.orbs.slice(original.equipped[slot]?.orbs.length || 0).flatMap(o => o.parsed),
        ...r.sockets.flatMap((s, i) => s && !build.gear[slot]?.sockets?.[i] ? s.parsed : []),
      ];
      for (const p of added) if (p.kind === 'stats') for (const [k,v] of p.effects) effects.set(k, (effects.get(k) || 0) + v); else other.push(p);
    }
    const score = socketValue([{ kind: 'stats', effects: [...effects], text: '' }, ...other], want, original, profile, build).v;
    return { gear, picks, orbPicks, score };
  }
  // The plans, compared by the caller's own measure when it gives one (the starter-build
  // generator: the build's damage and survival), else by the stat wishlist.
  const plans = [plan(false), plan(true), plan(true, true)];
  const judge = options.judge;
  const value = (p) => (judge ? judge(p.gear) : p.score);
  return plans.reduce((best, p) => (value(p) > value(best) ? p : best));
}
