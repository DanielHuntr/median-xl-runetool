// Turns item stat text into numbers. Two steps:
//  1. applyRolls: "+(18 to 29)% Enhanced Damage" → "+29% Enhanced Damage" using a
//     0–1 roll per range (1 = best roll).
//  2. parseLine: a rolled line → stat changes keyed by character stat names
//     (the medianxl-db character_stats vocabulary), or a proc/skill/flag, or
//     "not counted" when no pattern matches. Unmatched lines are always reported.

const N = "(-?\\d+(?:\\.\\d+)?)";
const RANGE = /\((-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)\)/g;
const ELEMENTS = { Fire: "fire", Cold: "cold", Lightning: "lightning", Poison: "poison", Magic: "magic" };
const FOUR = ["fire", "cold", "lightning", "poison"];
const maxRes = (el) => (el === "poison" ? "maximum_poison_resist" : `maximum_${el}_resistance`);
const ATTRS = { Strength: "strength", Dexterity: "dexterity", Vitality: "vitality", Energy: "energy" };

// Replace each "(a to b)" range with its rolled value. Returns the rolled text and
// the ranges found, so callers can offer a slider per range.
export function applyRolls(line, rolls = [], offset = 0) {
  const ranges = [];
  const text = line.replace(RANGE, (_, a, b) => {
    const min = Number(a),
      max = Number(b);
    const t = rolls[offset + ranges.length] ?? 1;
    ranges.push({ min, max });
    const v = min + (max - min) * Math.max(0, Math.min(1, t));
    const decimals = Math.max(decimalsOf(a), decimalsOf(b));
    return String(decimals ? Number(v.toFixed(decimals)) : Math.round(v));
  });
  return { text, ranges };
}
const decimalsOf = (s) => (String(s).split(".")[1] || "").length;

// [regex, (match, ctx) => [[key, value], ...]]. First match wins.
const PATTERNS = [
  // Attributes
  [new RegExp(`^\\+?${N} to (Strength|Dexterity|Vitality|Energy)$`), (m) => [[ATTRS[m[2]], +m[1]]]],
  [new RegExp(`^${N}% to (Strength|Dexterity|Vitality|Energy)$`), (m) => [[`percent_${ATTRS[m[2]]}`, +m[1]]]],
  [new RegExp(`^\\+?${N} to all Attributes$`, "i"), (m) => Object.values(ATTRS).map((k) => [k, +m[1]])],
  [new RegExp(`^${N}% to All Attributes$`, "i"), (m) => Object.values(ATTRS).map((k) => [`percent_${k}`, +m[1]])],
  [new RegExp(`^\\+?${N} to (Strength|Dexterity|Vitality|Energy) \\(Based on Character Level\\)$`), (m, c) => [[ATTRS[m[2]], Math.floor(+m[1] * c.level)]]],
  // Life and mana
  [new RegExp(`^\\+?${N} to Life$`), (m) => [["life", +m[1]]]],
  [new RegExp(`^\\+?${N} to Mana$`), (m) => [["mana", +m[1]]]],
  [new RegExp(`^\\+?${N} to Life \\(Based on Character Level\\)$`), (m, c) => [["life", +m[1] * c.level]]],
  [new RegExp(`^\\+?${N} to Mana \\(Based on Character Level\\)$`), (m, c) => [["mana", +m[1] * c.level]]],
  [new RegExp(`^(?:You and Undead Minions: )?Maximum Life \\+?${N}%$`), (m) => [["maximum_life", +m[1]]]],
  [new RegExp(`^Maximum Mana \\+?${N}%$`), (m) => [["maximum_mana", +m[1]]]],
  [new RegExp(`^Maximum Life and Mana \\+?${N}%$`), (m) => [["maximum_life", +m[1]], ["maximum_mana", +m[1]]]],
  [new RegExp(`^\\+?${N} Life Regenerated per Second$`), (m) => [["life_regenerated_per_second", +m[1]]]],
  [new RegExp(`^\\+?${N} Life Regenerated per Second \\(Based on Character Level\\)$`), (m, c) => [["life_regenerated_per_second", +m[1] * c.level]]],
  [new RegExp(`^Regenerate Mana \\+?${N}%$`), (m) => [["regenerate_mana", +m[1]]]],
  [new RegExp(`^\\+?${N} Maximum Stamina$`), (m) => [["maximum_stamina", +m[1]]]],
  // Skills
  [new RegExp(`^\\+?${N} to All Skills$`), (m) => [["all_skills", +m[1]]]],
  [new RegExp(`^\\+?${N} to (Amazon|Assassin|Barbarian|Druid|Necromancer|Paladin|Sorceress) Skill Levels$`), (m) => [[`class_skills:${m[2]}`, +m[1]]]],
  // Resistances
  [new RegExp(`^(Fire|Cold|Lightning|Poison|Magic) Resist \\+?${N}%$`), (m) => [[`${ELEMENTS[m[1]]}_resistance`, +m[2]]]],
  [new RegExp(`^Elemental Resists \\+?${N}%$`), (m) => FOUR.map((e) => [`${e}_resistance`, +m[1]])],
  [new RegExp(`^(?:Physical Resist \\+?${N}%|\\+?${N}% Physical Resist)$`), (m) => [["physical_resistance", +(m[1] ?? m[2])]]],
  [new RegExp(`^Maximum (Fire|Cold|Lightning|Poison) Resist \\+?${N}%$`), (m) => [[maxRes(ELEMENTS[m[1]]), +m[2]]]],
  [new RegExp(`^Maximum Elemental Resists \\+?${N}%$`), (m) => FOUR.map((e) => [maxRes(e), +m[1]])],
  [new RegExp(`^(Fire|Cold|Lightning|Magic) Absorb ${N}%$`), (m) => [[`${ELEMENTS[m[1]]}_absorb`, +m[2]]]],
  [new RegExp(`^\\+?${N}% (Fire|Cold|Lightning|Magic) Absorb$`), (m) => [[`${ELEMENTS[m[2]]}_absorb`, +m[1]]]],
  [new RegExp(`^\\+?${N} (Fire|Cold|Lightning|Magic) Absorb$`), (m) => [[`flat_${ELEMENTS[m[2]]}_absorb`, +m[1]]]],
  [new RegExp(`^(Fire|Cold|Lightning|Magic) Absorb \\+?${N}$`), (m) => [[`flat_${ELEMENTS[m[1]]}_absorb`, +m[2]]]],
  [new RegExp(`^Physical Damage Taken Reduced by ${N}$`), (m) => [["physical_damage_taken_reduced", +m[1]]]],
  [new RegExp(`^Elemental/Magic Damage Taken Reduced by ${N}$`), (m) => [["elemental_magic_damage_taken_reduced", +m[1]]]],
  [new RegExp(`^Poison Length Reduction ${N}%$`), (m) => [["poison_length_reduction", +m[1]]]],
  [new RegExp(`^Curse Length Reduction ${N}%$`), (m) => [["curse_length_reduction", +m[1]]]],
  [/^Half Freeze Duration$/, () => [["half_freeze_duration", 1]]],
  [/^Cannot Be Frozen$/, () => [["cannot_be_frozen", 1]]],
  // Defense and block
  [new RegExp(`^\\+?${N}% Enhanced Defense$`), (m) => [["enhanced_defense", +m[1]]]],
  [new RegExp(`^\\+?${N}% Enhanced Defense \\(Based on Character Level\\)$`), (m, c) => [["enhanced_defense", +m[1] * c.level]]],
  [new RegExp(`^\\+?${N} Defense$`), (m) => [["defense", +m[1]]]],
  [new RegExp(`^\\+?${N} Defense \\(Based on Character Level\\)$`), (m, c) => [["defense", +m[1] * c.level]]],
  [new RegExp(`^\\+?${N}% Bonus to Defense$`),(m) => [["defense_bonus_multiplier", +m[1]]]],
  [new RegExp(`^\\+?${N} Defense vs\\. Melee$`), (m) => [["defense_vs_melee", +m[1]]]],
  [new RegExp(`^\\+?${N} Defense vs\\. Missile$`), (m) => [["defense_vs_missile", +m[1]]]],
  [new RegExp(`^${N}% Base Block Chance$`), (m) => [["base_block_chance", +m[1]]]],
  [new RegExp(`^Maximum Block Chance \\+?${N}%$`), (m) => [["max_block_chance", +m[1]]]],
  [new RegExp(`^${N}% Block Speed$`), (m) => [["block_speed", +m[1]]]],
  [new RegExp(`^${N}% Chance to Avoid Damage$`), (m) => [["avoid_chance", +m[1]]]],
  [new RegExp(`^${N}% Chance to Dodge.*$`), (m) => [["dodge_chance", +m[1]]]],
  [new RegExp(`^${N}% Chance to Evade.*$`), (m) => [["evade_chance", +m[1]]]],
  // Speed
  [new RegExp(`^\\+?${N}% Attack Speed$`), (m) => [["attack_speed", +m[1]]]],
  [new RegExp(`^\\+?${N}% Cast Speed$`), (m) => [["cast_speed", +m[1]]]],
  [new RegExp(`^\\+?${N}% Hit Recovery$`), (m) => [["hit_recovery", +m[1]]]],
  [new RegExp(`^\\+?${N}% (?:to )?Movement Speed$`), (m) => [["movement_speed", +m[1]]]],
  [new RegExp(`^Movement Speed Penalty: ${N}$`), (m) => [["movement_speed", -Math.abs(+m[1])]]],
  // Patch 2.0.0 describes Combat Speeds as more than attack and cast speed.
  [new RegExp(`^\\+?${N}% Combat Speeds$`), (m) =>
    ["attack_speed", "cast_speed", "hit_recovery", "block_speed"].map((k) => [k, +m[1]])],
  // Weapon damage
  [new RegExp(`^\\+?${N}% Enhanced Damage$`), (m) => [["enhanced_damage", +m[1]]]],
  [new RegExp(`^(?:Weapon Physical Damage \\+?${N}%|\\+?${N}% Weapon Physical Damage)$`), (m) => [["enhanced_weapon_damage", +(m[1] ?? m[2])]]],
  [new RegExp(`^Weapon Physical Damage \\+?${N}% \\(Based on Character Level\\)$`), (m, c) => [["enhanced_weapon_damage", +m[1] * c.level]]],
  [new RegExp(`^\\+?${N} to Maximum Damage$`), (m) => [["max_damage", +m[1]]]],
  [new RegExp(`^\\+?${N} to Maximum Damage \\(Based on Character Level\\)$`), (m, c) => [["max_damage", +m[1] * c.level]]],
  [new RegExp(`^\\+?${N} to Minimum Damage$`), (m) => [["min_damage", +m[1]]]],
  [new RegExp(`^\\+?${N} Damage$`), (m) => [["min_damage", +m[1]], ["max_damage", +m[1]]]],
  [new RegExp(`^Adds ${N}-${N} Damage$`), (m) => [["min_damage", +m[1]], ["max_damage", +m[2]]]],
  [new RegExp(`^Adds ${N}-${N} (Fire|Cold|Lightning|Magic) Damage$`), (m) => {
    const e = ELEMENTS[m[3]];
    return [[`minimum_${e}_damage`, +m[1]], [`maximum_${e}_damage`, +m[2]]];
  }],
  [new RegExp(`^\\+?${N} (Fire|Cold|Lightning|Magic) Damage$`), (m) => {
    const e = ELEMENTS[m[2]];
    return [[`minimum_${e}_damage`, +m[1]], [`maximum_${e}_damage`, +m[1]]];
  }],
  [new RegExp(`^\\+?${N} Maximum Tri-Elemental Damage per ${N} Character Levels$`), (m, c) =>
    ["fire", "cold", "lightning"].map((e) => [`maximum_${e}_damage`, +m[1] * Math.floor(c.level / +m[2])])],
  // Weapon poison: the shown total over the item's own duration. Kept as per-second
  // rates plus the duration so several sources can be combined (character.js).
  [new RegExp(`^(?:Adds ${N}-)?\\+?${N} Poison Damage over ${N} seconds$`), (m) => {
    const min = m[1] == null ? +m[2] : +m[1], max = +m[2], secs = +m[3] || 1;
    return [["poison_damage", max], ["poison_min_per_second", min / secs], ["poison_max_per_second", max / secs], ["poison_item_seconds", secs], ["poison_item_sources", 1]];
  }],
  [new RegExp(`^${N}% Innate Elemental Damage$`), (m) => [["innate_elemental_damage", +m[1]]]],
  [new RegExp(`^Additional (Strength|Dexterity) Damage Bonus: ${N}%$`), (m) => [[`${m[1].toLowerCase()}_damage_bonus`, +m[2]]]],
  [new RegExp(`^${N}% Bonus to Attack Rating$`), (m) => [["percent_attack_rating", +m[1]]]],
  [new RegExp(`^${N}% Bonus to Attack Rating \\(Based on Character Level\\)$`), (m, c) => [["percent_attack_rating", +m[1] * c.level]]],
  [new RegExp(`^\\+?${N} to Attack Rating$`), (m) => [["attack_rating", +m[1]]]],
  [new RegExp(`^\\+?${N} to Attack Rating \\(Based on Character Level\\)$`), (m, c) => [["attack_rating", +m[1] * c.level]]],
  [new RegExp(`^${N}% Chance of Crushing Blow$`), (m) => [["chance_of_crushing_blow", +m[1]]]],
  [new RegExp(`^${N}% Chance of Crushing Blow \\(Based on Character Level\\)$`), (m, c) => [["chance_of_crushing_blow", +m[1] * c.level]]],
  [new RegExp(`^\\+?${N}% Deadly Strike$`),(m) => [["deadly_strike", +m[1]]]],
  [new RegExp(`^${N}% Deadly Strike \\(Based on Character Level\\)$`), (m, c) => [["deadly_strike", +m[1] * c.level]]],
  [new RegExp(`^${N}% Life stolen per Hit$`), (m) => [["life_stolen_per_hit", +m[1]]]],
  [new RegExp(`^${N}% Mana stolen per Hit$`), (m) => [["mana_stolen_per_hit", +m[1]]]],
  [new RegExp(`^\\+?${N}% Damage to Demons$`), (m) => [["damage_to_demons", +m[1]]]],
  [new RegExp(`^\\+?${N}% Damage to Undead$`), (m) => [["damage_to_undead", +m[1]]]],
  // Spells
  [new RegExp(`^\\+?${N}% to (Fire|Cold|Lightning|Poison) Spell Damage$`), (m) => [[`${ELEMENTS[m[2]]}_spell_damage`, +m[1]]]],
  [new RegExp(`^\\+?${N}% to (Fire|Cold|Lightning|Poison) Spell Damage \\(Based on Character Level\\)$`), (m, c) => [[`${ELEMENTS[m[2]]}_spell_damage`, +m[1] * c.level]]],
  [new RegExp(`^\\+?${N}% to (Fire|Cold|Lightning|Poison) and (Fire|Cold|Lightning|Poison) Spell Damage$`), (m) =>
    [m[2], m[3]].map((e) => [`${ELEMENTS[e]}_spell_damage`, +m[1]])],
  [new RegExp(`^\\+?${N}% to Physical/Magic Spell Damage$`), (m) => [["physical_magic_spell_damage", +m[1]]]],
  // The game's line for all five spell damage stats at one value (itemstatcost description
  // group 5: fire, lightning, cold, poison and physical/magic).
  [new RegExp(`^\\+?${N}% to Spell Damage$`), (m) => [...FOUR.map((e) => [`${e}_spell_damage`, +m[1]]), ["physical_magic_spell_damage", +m[1]]]],
  [new RegExp(`^\\+?${N}% to Elemental Spell Damage$`), (m) => ["fire", "cold", "lightning"].map((e) => [`${e}_spell_damage`, +m[1]])],
  [new RegExp(`^-?${N}% to Enemy (Fire|Cold|Lightning|Poison|Magic) Resistance$`), (m) => [[`enemy_${ELEMENTS[m[2]]}_resistance`, Math.abs(+m[1])]]],
  [new RegExp(`^-?${N}% to Enemy Elemental Resistances$`), (m) => FOUR.map((e) => [`enemy_${e}_resistance`, Math.abs(+m[1])])],
  [new RegExp(`^\\+?${N} Spell Focus$`), (m) => [["spell_focus", +m[1]]]],
  [new RegExp(`^\\+?${N}% Bonus to Spell Focus$`), (m) => [["percent_spell_focus", +m[1]]]],
  [new RegExp(`^\\+?${N}% Bonus to Poison Skill Duration$`), (m) => [["bonus_to_poison_skill_duration", +m[1]]]],
  [new RegExp(`^${N}% Mana Cost of Skills$`), (m) => [["mana_cost_of_skills", +m[1]]]],
  [new RegExp(`^Activation Frequency ${N}%$`), (m) => [["activation_frequency", +m[1]]]],
  // Sustain
  [new RegExp(`^\\+?${N} Life after each Kill$`), (m) => [["life_after_each_kill", +m[1]]]],
  [new RegExp(`^\\+?${N} Mana after each Kill$`), (m) => [["mana_after_each_kill", +m[1]]]],
  [new RegExp(`^\\+?${N} Life and Mana after each Kill$`), (m) => [["life_after_each_kill", +m[1]], ["mana_after_each_kill", +m[1]]]],
  [new RegExp(`^\\+?${N} Life after each Demon Kill$`), (m) => [["life_after_each_demon_kill", +m[1]]]],
  [new RegExp(`^\\+?${N} Life on Melee Attack$`), (m) => [["life_on_melee_attack", +m[1]]]],
  [new RegExp(`^\\+?${N} Mana on Melee Attack$`), (m) => [["mana_on_melee_attack", +m[1]]]],
  [new RegExp(`^\\+?${N} Life on Striking$`), (m) => [["life_on_striking", +m[1]]]],
  [new RegExp(`^\\+?${N} Mana on Striking$`), (m) => [["mana_on_striking", +m[1]]]],
  [new RegExp(`^\\+?${N} Life when Struck by an Enemy$`), (m) => [["life_when_struck_by_an_enemy", +m[1]]]],
  [new RegExp(`^\\+?${N} Mana when Struck by an Enemy$`), (m) => [["mana_when_struck_by_an_enemy", +m[1]]]],
  // Summons
  [new RegExp(`^\\+?${N}% to Summon Damage$`), (m) => [["summoned_minion_damage", +m[1]]]],
  [new RegExp(`^\\+?${N}% to Summon Life$`), (m) => [["summoned_minion_life", +m[1]]]],
  [new RegExp(`^\\+?${N}% to Summon Attack Rating$`), (m) => [["summoned_minion_attack_rating", +m[1]]]],
  [new RegExp(`^\\+?${N}% to Summon Elemental Resistances$`), (m) => [["summoned_minion_resistances", +m[1]]]],
  [new RegExp(`^\\+?${N}% to Summon Physical Resist$`), (m) => [["summon_physical_resistance", +m[1]]]],
  // Misc
  [new RegExp(`^${N}% Magic Find$`), (m) => [["magic_find", +m[1]]]],
  [new RegExp(`^${N}% Gold Find$`), (m) => [["gold_find", +m[1]]]],
  [new RegExp(`^\\+?${N}% to Experience Gained$`), (m) => [["experience_gained", +m[1]]]],
  [new RegExp(`^\\+?${N} to Light Radius$`), (m) => [["light_radius", +m[1]]]],
  [new RegExp(`^Slow Target ${N}%$`), (m) => [["slows_target_by", +m[1]]]],
  [new RegExp(`^Slows Attacker by ${N}%$`), (m) => [["slows_attacker", +m[1]]]],
  [new RegExp(`^Target Takes Additional Damage of ${N}$`), (m) => [["target_takes_additional_damage", +m[1]]]],
  [new RegExp(`^\\+?${N} to Maximum (\\w+) Minions$`), (m) => [[`maximum_${m[2].toLowerCase()}_minions`, +m[1]]]],
  [new RegExp(`^${N}% to All Vendor Prices$`), (m) => [["vendor_prices", +m[1]]]],
  [new RegExp(`^Hit Causes Monster to Flee \\+?${N}%$`), (m) => [["hit_causes_monsters_to_flee", +m[1]]]],
  [new RegExp(`^Attacker Flees after Striking ${N}%$`), (m) => [["attacker_flees_after_striking", +m[1]]]],
  [new RegExp(`^${N}% Weapon Damage Taken Restores Mana$`), (m) => [["damage_taken_goes_to_mana", +m[1]]]],
];

// Lines that describe the item rather than the character, or are pure flavour.
const INFO = [
  /^Required (Level|Strength|Dexterity): /,
  /^Item Level: /,
  /^Quality Level: /,
  /^Socketed \(/,
  /^Requirements [+-]?\d+%$/,
  /^\(\w+ Only\)$/,
  /^(One-Hand|Two-Hand|Throw) Damage: /,
  /^Defense: /,
  /^Chance to Block: /,
  /^Attack Speed Modifier: /,
  /^Melee range: /,
  /^(Strength|Dexterity) Damage Bonus: /,
  /^Innate .+ Damage: /,
  /^\(Bonus for each Socketed/,
  /^\(Stackable\)$/,
  /^Can be Inserted into Socketed Items$/,
  /^Ethereal$/,
  /^\+\d+ Required Level$/,
  /^\d+ Yard Radius$/,
];
// Built-in effects shown by name (attack modifiers, auras and similar).
const FEATURES = /^(Attacker Takes .+|Freezes attacker.*|Unlocks your .+|Area Effect Attack|Thunderfury|Amazing Grace|Mega Impact|Stun Attack|Ignore Target's Defense|Orb Effects Applied to this Item are Doubled|Gematria|Demon Blood Aura|Random Movement Speed Bonus|Cannot Be Frozen|Half Freeze Duration|Total Defense = \d+|You may only use .+|Can spawn .+|Can only spawn .+|\+1% Chance to Avoid Damage per 500 Dexterity|\+1 Lightning Damage per 1% (?:Bonus to Defense|Total Physical Weapon Damage Bonus)|1% Deadly Strike per 7% Movement Speed)$/;

/**
 * @param {string} text   a rolled line (no "(a to b)" ranges)
 * @param {{ level: number, skillByName: Map<string, string> }} ctx
 * @returns {{ kind: "stats"|"skill"|"oskill"|"proc"|"feature"|"info"|"unknown", effects?: [string, number][], text: string }}
 */
export function parseLine(text, ctx) {
  const line = text.trim();
  if (!line) return { kind: "info", text: line };
  for (const re of INFO) if (re.test(line)) return { kind: "info", text: line };
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(line);
    if (m) return { kind: "stats", effects: fn(m, ctx), text: line };
  }
  // "+15 Spell Focus Until Level 100" counts below that level; "… After Level 90" from it on.
  const gated = /^(.+) (Until|After) Level (\d+)$/.exec(line);
  if (gated) {
    const inner = parseLine(gated[1], ctx);
    if (inner.kind === "stats") {
      const on = gated[2] === "Until" ? ctx.level < +gated[3] : ctx.level >= +gated[3];
      return { kind: "stats", effects: on ? inner.effects : [], text: line };
    }
  }
  // Gems in armor join two stats on one line: "Fire Resist +20%, Maximum Fire Resist +1%".
  if (line.includes(", ")) {
    const parts = line.split(", ").map((l) => parseLine(l, ctx));
    if (parts.every((x) => x.kind === "stats")) return { kind: "stats", effects: parts.flatMap((x) => x.effects), text: line };
  }
  if (FEATURES.test(line)) return { kind: "feature", text: line };
  const proc = /^(\d+(?:\.\d+)?)% Chance to cast level (\d+) (.+?) (on .+|when .+)$/.exec(line);
  if (proc) return { kind: "proc", text: line, chance: +proc[1], level: +proc[2], skill: proc[3], when: proc[4] };
  const reanimate = /^(\d+)% Reanimate as: (.+)$/.exec(line);
  if (reanimate) return { kind: "feature", text: line };
  // "+3 to Holy Fire (Paladin Only)" / "+2 to Summon Shadows"
  const skill = /^\+?(-?\d+) to (.+?)(?: \((\w+) Only\))?$/.exec(line);
  if (skill) {
    const id = ctx.skillByName.get(skill[2].toLowerCase());
    return id
      ? { kind: "skill", text: line, id, value: +skill[1], cls: skill[3] || null }
      : { kind: "oskill", text: line, name: skill[2], value: +skill[1], cls: skill[3] || null };
  }
  // Lines tied to a specific skill ("+25% Bonus Damage to Bloodlust") are shown on
  // that skill rather than counted as character stats.
  const lower = line.toLowerCase();
  for (const [name, id] of ctx.skillByName)
    if (name.length > 3 && lower.includes(name)) return { kind: "skillmod", text: line, id };
  return { kind: "unknown", text: line };
}

// Head lines carry the item's own damage/defense/block.
// "(29 - 31) to (33 - 35)" is min damage 29–31 and max 33–35 depending on the ED roll.
export function parseSpan(s, t = 1) {
  const part = (p) => {
    const r = /^\((-?[\d.]+) - (-?[\d.]+)\)$/.exec(p.trim());
    return r ? +r[1] + (+r[2] - +r[1]) * t : Number(p);
  };
  const [a, b] = s.split(" to ");
  return b === undefined ? [part(a), part(a)] : [part(a), part(b)];
}
