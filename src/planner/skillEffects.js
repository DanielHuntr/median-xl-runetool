// Character-wide effects, as opposed to the damage/AR of an individual attack or summon.
// Keep these outside the imported dataset so reimporting the game data preserves the rules.
// MedianDB omits Phoenix and Raven's Passive tags. Their game records grant
// elemental weapon damage, mastery and pierce exactly like the other Ways.
export function normalizeSkillTags(id, tags = []) {
  if (id === 'dragon_jaws') return [...new Set([...tags, 'Spell', 'Physical'])];
  return ['way_of_the_phoenix', 'way_of_the_raven'].includes(id) && !tags.includes('Passive') ? [...tags, 'Passive'] : tags;
}

// Dragon Jaws has no community tooltip rows. The in-game tooltip shows these
// fields; their values still come from the installed game's physical/mana tables.
export function normalizeSkillDefinition(id, skill) {
  return {
    ...skill, tags: normalizeSkillTags(id, skill.tags),
    ...(id === 'dragon_jaws' ? {
      description: skill.description?.length ? skill.description : ['Shreds the target area with monstrous fangs'],
      effect: skill.effect?.length ? skill.effect : ['{{physical_damage}}', '{{mana_cost}}'],
    } : {}),
  };
}

export const SKILL_STAT_PAIRS = {
  weapon_physical_damage: [[0, 'enhanced_weapon_damage']],
  physical_damage_percent: [[0, 'enhanced_weapon_damage']],
  attack_rating_percent: [[0, 'percent_attack_rating']],
  elemental_spell_damage: ['fire', 'cold', 'lightning', 'poison'].map(e => [0, `${e}_spell_damage`]),
  bonus_magic_damage: [[0, 'minimum_magic_damage'], [0, 'maximum_magic_damage']],
  bonus_physical_damage: [[0, 'min_damage'], [0, 'max_damage']],
  life_leech: [[0, 'life_stolen_per_hit']],
  maximum_avoid_chance: [[0, 'maximum_avoid_chance']],
  skill_duration: [[0, 'skill_duration']],
  loma_per_character_level: [[0, 'life_on_melee_attack']],
  adds_percent_str_and_dex_as_wpd: [[1, 'enhanced_weapon_damage']],
  claw_physical_damage: [[0, 'enhanced_weapon_damage']],
  javelin_physical_damage: [[0, 'enhanced_weapon_damage']],
  // Total-defense modifiers multiply the complete defense result, unlike bonus defense.
  defense_bonus_multiplier: [[0, 'total_defense_multiplier']],
};

export const isToggleSkill = skill => skill?.tags?.some(t => ['Buff', 'Stance', 'Morph'].includes(t));

export function skillEquipmentFits(skill, context) {
  if (!context) return true;
  const category = context.weapon_category;
  for (const text of skill?.restriction || []) {
    if (/Requires an Amazon class shield/i.test(text) && context.shield_category !== 'Amazon Shields') return false;
    if (/Requires a Barbarian class shield/i.test(text) && context.shield_category !== 'Barbarian Shields') return false;
    const required = /^Requires an? (spear|naginata or halberd|sword|dagger|axe or mace|bow or crossbow|mace, hammer, or scepter|orb or scepter|melee weapon|elemental melee weapon)$/i.exec(text)?.[1];
    if (!required) continue;
    if (!context.has_weapon) return false;
    // Custom items do not declare a weapon family, so do not guess their category.
    if (!category) continue;
    const ranged = /Bows$|Crossbows$|Javelins$|Throwing/.test(category);
    const matches = {
      spear: /Spears$/.test(category), 'naginata or halberd': category === 'Assassin Naginatas',
      sword: /Swords$/.test(category), dagger: /Daggers$/.test(category),
      'axe or mace': /Axes$|Maces$|Clubs$/.test(category) && !ranged,
      'bow or crossbow': /Bows$|Crossbows$/.test(category),
      'mace, hammer, or scepter': /Maces$|Hammers$|Scepters$/.test(category),
      'orb or scepter': /Orbs$|Scepters$/.test(category),
      'melee weapon': !ranged, 'elemental melee weapon': !ranged && !!context.elemental_weapon,
    };
    if (!matches[required.toLowerCase()]) return false;
  }
  return true;
}

// Extracted ItemStatCost ids with known character-sheet meanings. Life/mana
// passives use 8-bit fixed point. Unknown hidden game stats stay unprojected.
export const PASSIVE_STATS = {
  0: ['strength'], 1: ['energy'], 2: ['dexterity'], 3: ['vitality'],
  7: ['life', 256], 9: ['mana', 256], 20: ['base_block_chance'],
  25: ['enhanced_weapon_damage'], 27: ['regenerate_mana'], 36: ['physical_resistance'],
  39: ['fire_resistance'], 40: ['maximum_fire_resistance'], 41: ['lightning_resistance'], 42: ['maximum_lightning_resistance'],
  43: ['cold_resistance'], 44: ['maximum_cold_resistance'], 45: ['poison_resistance'], 46: ['maximum_poison_resist'],
  48: ['minimum_fire_damage'], 49: ['maximum_fire_damage'], 50: ['minimum_lightning_damage'], 51: ['maximum_lightning_damage'],
  54: ['minimum_cold_damage'], 55: ['maximum_cold_damage'], 60: ['life_stolen_per_hit'],
  76: ['maximum_life'], 77: ['maximum_mana'], 93: ['attack_speed'], 96: ['movement_speed'],
  99: ['hit_recovery'], 102: ['block_speed'], 105: ['cast_speed'], 110: ['poison_length_reduction'],
  119: ['percent_attack_rating'], 136: ['chance_of_crushing_blow'], 141: ['deadly_strike'], 171: ['enhanced_defense'],
  213: ['max_block_chance'], 337: ['critical_strike'],
  359: ['percent_strength'], 360: ['percent_energy'], 361: ['percent_dexterity'], 362: ['percent_vitality'],
  485: ['spell_focus'], 487: ['summoned_minion_resistances'],
};
export function activeSkillIds(build, engine) {
  const available = id => !!engine.node(build, id) && ((build.points[id] || 0) > 0 || engine.isInnate(id));
  const toggled = (build.buffs || []).filter(id => available(id) && isToggleSkill(engine.skill(id)));
  const last = tag => toggled.filter(id => engine.skill(id).tags.includes(tag)).at(-1);
  return [...new Set([...Object.keys(build.points), ...toggled])].filter(id => {
    if (!available(id)) return false;
    const skill = engine.skill(id);
    if (!skillEquipmentFits(skill, build.charStats)) return false;
    if (skill?.tags.includes('Passive')) return true;
    if (!toggled.includes(id)) return false;
    return ['Stance', 'Morph'].every(tag => !skill.tags.includes(tag) || last(tag) === id);
  });
}

export function allowsSkillEffect(build, id, key, skill) {
  // A summoned creature's own attack rating, damage and masteries are not player stats.
  if (skill.tags.some(t => ['Summon', 'Special Summon', 'Totem'].includes(t)))
    return id === 'protector_spirit' && ['bloodlust_damage', 'bloodlust_elemental_damage'].includes(key);
  const buffs = new Set(build.buffs || []), c = build.charStats || {};
  if (key === 'claw_physical_damage') return !!c.wielding_claw;
  if (key === 'javelin_physical_damage') return !!c.wielding_javelin;
  if (key === 'grit_while_unmorphed') return !c.morphed;
  if (id === 'aptitude') return key === 'weapon_physical_damage' ? c.stance === 5 : key === 'innate_elemental_damage' ? c.stance === 4 : false;
  if (id === 'bloodthirst') return key === 'poison_pierce' ? c.stance === 3 : key === 'lightning_pierce' ? c.stance === 4 : key === 'critical_strike_chance' && c.stance === 5;
  if (id === 'hunger') return buffs.has('werebear_morph');
  if (id === 'feral_escalation') return buffs.has('werewolf_form');
  // This damage belongs to Hammer of Zerae, not every attack the character makes.
  if (id === 'reckoning_of_zerae' && key === 'bonus_lightning_damage') return false;
  return true;
}
