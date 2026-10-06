// Character sheet calculations: attributes, life/mana, resistances, defense,
// block, attack rating, weapon damage and every summed stat, each with the list
// of sources that produced it. Results that depend on game formulas we have
// reproduced ourselves are flagged as estimates in the UI.
import {
  ELEMENTAL_RES_PENALTY, MAGIC_RES_PENALTY, BASE_MAX_RESIST, PHYS_RES_CAP, AVOID_CAP,
  BLOCK_CAP, BLOCK_CAP_MAX, SPELL_FOCUS_CAP, STAT_POINTS_PER_LEVEL, LAM_ESEN_POINTS,
  SIGNET_CAP, JUSTICAR_SIGNET_BONUS, CLASS_BASE_AR,
} from "./rules.js";
import { SLOTS } from "./items.js";
import { activeSkillIds } from './skillEffects.js';
import { computeMerc } from './mercs.js';

export const ATTRIBUTES = ["strength", "dexterity", "vitality", "energy"];

// Quests with stat, signet-cap and life rewards (medianxl-db Character.QUESTS).
export const OTHER_QUESTS = [
  ["lam_esens_tome", "Lam Esen's Tome", "stat_points", { normal: [10, 25], nightmare: [10, 80], hell: [10, 107] }],
  ["golden_bird", "The Golden Bird", "flat_life", { normal: [50, 25], nightmare: [50, 80], hell: [50, 107] }],
  ["justicar_signet", "Justicar Signet", "signet_cap", { hell: [JUSTICAR_SIGNET_BONUS, 115] }],
];

export function otherQuestDone(b, id, diff) {
  const q = OTHER_QUESTS.find((x) => x[0] === id);
  const r = q?.[3][diff];
  if (!r) return false;
  const o = b.quests?.[`${id}.${diff}`];
  return o === undefined ? b.level >= r[1] : o;
}
function questReward(b, type) {
  let n = 0;
  for (const [id, , t, rewards] of OTHER_QUESTS)
    if (t === type) for (const [d, [amount]] of Object.entries(rewards)) if (otherQuestDone(b, id, d)) n += amount;
  return n;
}

export const activeSlots = (b) =>
  SLOTS.filter((s) => (b.swap ? !["weapon", "offhand"].includes(s.id) : !s.swap)).map((s) => s.id);

// Life and mana. Maximum Life/Mana +% (ItemStatCost 76/77, op 11 on max life/mana, as in D2
// 1.13) multiply the character's own base value: the class start, levels and allocated
// Vitality or Energy (what a save stores as stats 7 and 9). Vitality and Energy from items or
// skills reach life and mana through their own ops (9 and 8) as bonuses, like +Life, so the
// percentage doesn't multiply them.
function pool(cls, level, [start, perLevel, attrStart, perPoint], baseAttr, totalAttr, pct, flat) {
  const above = (v) => Math.max(0, v - (cls?.[attrStart] || 0));
  const base = (cls?.[start] || 0) + (level - 1) * (cls?.[perLevel] || 0) + above(baseAttr) * (cls?.[perPoint] || 0);
  const bonus = (above(totalAttr) - above(baseAttr)) * (cls?.[perPoint] || 0);
  return { base: Math.floor(base), bonus: Math.floor(bonus), total: Math.floor(base * (1 + pct / 100) + bonus + flat) };
}
const LIFE = ["life", "lifePerLevel", "vitality", "lifePerVit"], MANA = ["mana", "manaPerLevel", "energy", "manaPerEne"];

/**
 * @param {object} b  build: { cls, level, points, quests, attrs, signets, difficulty, gear, swap, inventory, buffs }
 * @param {{ engine, catalog, planner }} env
 */
export function computeCharacter(b, { engine, catalog, planner }) {
  const cls = planner.classes.find((c) => c.name === b.cls);
  const stats = {};
  // trust: provenance of a skill-computed value (engine TRUST); item text has none.
  const add = (key, value, source, trust = null) => {
    if (!value) return;
    (stats[key] ??= { total: 0, sources: [] }).total += value;
    stats[key].sources.push(trust ? { source, value, trust } : { source, value });
  };
  const s = (key) => stats[key]?.total || 0;
  const skillBonus = { all: [], cls: [], skill: {} };
  const lists = { oskills: [], procs: [], features: [], skillmods: [], unknown: [] };
  // Problems with the build, each with an optional one-click fix:
  // { kind: "attr", attr, amount } adds stat points, { kind: "level", level } sets the level.
  const issues = [];
  const warn = (text, fix = null) => issues.push({ text, fix });

  // ---------- Items
  const slots = activeSlots(b);
  const equipped = {};
  for (const id of slots) {
    const st = b.gear?.[id];
    if (st) equipped[id] = catalog.resolve(st, b.level);
  }
  const inventory = (b.inventory || []).map((st) => catalog.resolve(st, b.level)).filter(Boolean);
  const offhand = equipped.offhand2 || equipped.offhand;
  const weapon = equipped.weapon2 || equipped.weapon || (offhand?.def.slotType === "weapon" ? offhand : null);
  const hasBuiltInHead = (r) => ["unique", "sacred", "set"].includes(r.def.kind);

  const itemDefense = [];
  // Enhanced defense on each item (resolved items are shared, so this is kept here).
  const localEdDef = new Map();
  let weaponLocalEd = 0;
  function takeParsed(parsed, label, r, fromSocket = false) {
    for (const p of parsed) {
      if (p.kind === "stats") {
        for (const [key, value] of p.effects) {
          // Enhanced damage/defense on an item boosts that item, not the character.
          if (key === "enhanced_defense" && r && r.def.slotType !== "weapon") {
            if (fromSocket || !hasBuiltInHead(r)) localEdDef.set(r, (localEdDef.get(r) || 0) + value);
            continue;
          }
          if (key === "enhanced_damage" && r && r === weapon) {
            if (fromSocket || !hasBuiltInHead(r)) weaponLocalEd += value;
            continue;
          }
          if (key.startsWith("class_skills:")) {
            if (key.slice(13) === b.cls) skillBonus.cls.push({ source: label, value });
            continue;
          }
          if (key === "all_skills") {
            skillBonus.all.push({ source: label, value });
            continue;
          }
          add(key, value, label);
        }
      } else if (p.kind === "skill") {
        if (engine.node(b, p.id)) (skillBonus.skill[p.id] ??= []).push({ source: label, value: p.value, classOnly: !!p.cls });
        else lists.oskills.push({ id: p.id, name: engine.skillName(p.id), value: p.value, source: label });
      } else if (p.kind === "oskill") lists.oskills.push({ name: p.name, value: p.value, source: label });
      else if (p.kind === "proc") lists.procs.push({ text: p.text, source: label });
      else if (p.kind === "feature") lists.features.push({ text: p.text, source: label });
      else if (p.kind === "skillmod") lists.skillmods.push({ id: p.id, text: p.text, source: label });
      else if (p.kind === "unknown") lists.unknown.push({ text: p.text, source: label });
    }
  }
  // b.ablate (the build audit, scripts/audit-builds.mjs): one line of one item left out,
  // { slot, line } (line: an index into the item's own parsed lines, or "all"), or a carried
  // item, { slot: "inv:<index>" }, to measure what it adds.
  const ablated = (slot, list) => (b.ablate?.slot === slot ? (b.ablate.line === "all" ? [] : list.filter((_, i) => i !== b.ablate.line)) : list);
  for (const [slot, r] of Object.entries(equipped)) {
    const label = `${r.def.name} (${SLOTS.find((x) => x.id === slot).label})`;
    takeParsed(ablated(slot, r.parsed), label, r);
    r.orbs?.forEach(o => takeParsed(o.parsed, `${o.def.name} orb on ${r.def.name}`, r, true));
    r.sockets.forEach((sock, i) => sock && takeParsed(sock.parsed, `${sock.def.name} in ${r.def.name}`, r, true));
    if (r.cls && r.cls !== b.cls) warn(`${r.def.name} can only be used by a ${r.cls}.`);
  }
  inventory.forEach((r, i) => takeParsed(ablated(`inv:${i}`, r.parsed), r.def.name, null));
  if (weapon?.twoHanded && offhand)
    warn(`${weapon.def.name} is two-handed, so the off-hand item can't be used with it.`);

  // Set bonuses: count distinct equipped pieces per set.
  const setCounts = {};
  for (const r of Object.values(equipped))
    if (r.def.setId != null) (setCounts[r.def.setId] ??= new Set()).add(r.def.name);
  const sets = [];
  for (const [id, names] of Object.entries(setCounts)) {
    const set = catalog.setById(Number(id));
    const count = names.size;
    const active = set.bonuses.filter((bonus) => {
      const n = /with (\d+) or more/.exec(bonus.when)?.[1];
      return n ? count >= Number(n) : count >= set.items.length;
    });
    for (const bonus of active)
      takeParsed(catalog.parseLines(bonus.lines, b.level), `${set.name} set (${count} items)`, null);
    sets.push({ set, count, active });
  }

  // ---------- Skills: +skills from gear, then passive/buff bonuses
  const sum = (arr) => arr.reduce((n, x) => n + x.value, 0);
  const gearAllSkills = sum(skillBonus.all);
  let allSkills = gearAllSkills;
  const classSkills = sum(skillBonus.cls);
  // Item lines for one of the class's own skills, as the game adds them (D2Common 0x6FD9FCB0):
  // "+N to Skill (Class Only)" (stat 107) counts in full, plain "+N to Skill" (stat 97, summed
  // over every item first) at most +3. Neither is a base level, so synergies don't read them.
  const OWN_SKILL_ITEM_CAP = 3;
  const ownSkillItemLevels = (id) => {
    const lines = skillBonus.skill[id] || [];
    return sum(lines.filter((x) => x.classOnly)) + Math.min(OWN_SKILL_ITEM_CAP, sum(lines.filter((x) => !x.classOnly)));
  };
  // Skills items grant from outside the class's tree ("+3 to Pestilence", "+(6 to 16) to
  // Bloodlust"): usable at the items' levels added together (the game sums the stat over every
  // item, uncapped for another class's skills) plus +all skills, with no synergies. The engine reads them as the skill's level (engine.js pts), and a buff among them
  // can be switched on like a learned one (skillEffects.js activeSkillIds).
  const itemSkills = {};
  const idByName = new Map(Object.entries(planner.skills || {}).map(([id, s]) => [s.name, id]));
  for (const o of lists.oskills) {
    const id = o.id || idByName.get(o.name);
    if (!id || engine.node(b, id) || !(o.value > 0)) continue;
    itemSkills[id] = (itemSkills[id] || 0) + Math.trunc(o.value);
  }
  for (const id in itemSkills) itemSkills[id] += gearAllSkills;
  const soft = {};
  const setSoft = () => { for (const tab of engine.tabs(b.cls))
    for (const n of engine.treeNodes(b.cls, tab)) {
      if (engine.isInnate(n.id)) continue;
      const v = allSkills + classSkills + ownSkillItemLevels(n.id);
      if (v) soft[n.id] = v;
      else delete soft[n.id];
    } };
  setSoft();
  const equipmentContext = {
    has_weapon: Number(weapon?.def.slotType === 'weapon'), weapon_category: weapon?.def.cat || '',
    elemental_weapon: Number(!!weapon && !weapon.head.damage), shield_category: offhand?.def.cat || '',
  };
  const active = activeSkillIds({ ...b, itemSkills, charStats: equipmentContext }, engine);
  const stance = active.find(id => engine.skill(id).tags.includes('Stance'));
  const learnedMinionUpgrades = Object.keys(b.points || {}).filter(id => b.points[id] > 0 && !active.includes(id) && engine.node(b, id)
    && !engine.skill(id).tags.some(t => ['Summon', 'Special Summon', 'Totem'].includes(t)));
  const skillFlags = {
    ...equipmentContext,
    stance: ({ bear_stance: 1, lion_stance: 2, snake_stance: 3, eagle_stance: 4, wolf_stance: 5 })[stance] || 0,
    morphed: Number(active.some(id => engine.skill(id).tags.includes('Morph'))),
    wielding_claw: Number(weapon?.def.cat === 'Assassin Claws'),
    wielding_javelin: Number(/Javelins$/.test(weapon?.def.cat || '')),
    socketed_runes: Object.values(equipped).reduce((n, r) => n + (r.def.kind === 'runeword' ? r.def.runes.length : r.sockets.filter(sock => /rune/i.test(sock?.def.kindLabel || '')).length), 0),
    socketed_gems: Object.values(equipped).reduce((n, r) => n + r.sockets.filter(sock => /gem/i.test(sock?.def.kindLabel || '')).length, 0),
  };
  // Rebuild skill effects from the item baseline, never accumulate another pass.
  // This lets attribute/skill-level providers feed dependent passives and buffs,
  // independent of the order in which points were allocated.
  // The mercenary's party buffs count like gear: they don't depend on the character's skills.
  const merc = computeMerc(b, { catalog, data: planner });
  for (const [key, value, source, trust] of merc?.buffs || []) add(key, value, source, trust);
  const itemStats = Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, { total: value.total, sources: [...value.sources] }]));
  const contextStats = () => {
    const values = { ...skillFlags, ...Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, value.total])) };
    for (const attr of ATTRIBUTES) {
      values[`base_${attr}`] = (cls?.[attr] || 0) + (b.attrs?.[attr] || 0);
      values[attr] = Math.floor((values[`base_${attr}`] + s(attr)) * (1 + s(`percent_${attr}`) / 100));
    }
    values.life = pool(cls, b.level, LIFE, values.base_vitality, values.vitality, s('maximum_life'), s('life') + questReward(b, 'flat_life')).total;
    values.mana = pool(cls, b.level, MANA, values.base_energy, values.energy, s('maximum_mana'), s('mana')).total;
    values.spell_focus = Math.floor(s('spell_focus') * (1 + s('percent_spell_focus') / 100));
    return values;
  };
  let skillEffects = [], signature = '';
  for (let pass = 0; pass < 8; pass++) {
    const input = { ...b, soft, itemSkills, charStats: contextStats() };
    const effects = active.flatMap(id => engine.skillStatEffects(input, id).map(effect => ({ id, effect })));
    // A learned skill that isn't a passive or a buff can still give minions their bonuses
    // (Fervor's summon damage, Apex Predator's summon resistances: Resurrect's in-game
    // Physical Damage counts Fervor's, GitHub issue #23). Only those: its other stats are
    // for its own summons (Fervor's fire damage is its Servants').
    for (const id of learnedMinionUpgrades)
      for (const effect of engine.skillStatEffects(input, id, { minionOnly: true })) effects.push({ id, effect });
    const nextSignature = JSON.stringify(effects);
    if (nextSignature === signature) break;
    signature = nextSignature;
    skillEffects = effects;
    for (const key of Object.keys(stats)) delete stats[key];
    for (const [key, value] of Object.entries(itemStats)) stats[key] = { total: value.total, sources: [...value.sources] };
    allSkills = gearAllSkills;
    for (const { id, effect: [key, value, , trust] } of effects) {
      if (key === 'all_skills') allSkills += Math.trunc(value);
      add(key === 'enhanced_defense' ? 'defense_bonus_multiplier' : key, value, `${engine.skillName(id)} (skill)`, trust);
    }
    setSoft();
    if (pass === 7) warn('Some skill effects have circular dependencies and could not be fully resolved.');
  }
  for (const { id, effect: [key, value, , trust] } of skillEffects)
    if (key === 'all_skills') skillBonus.all.push({ source: `${engine.skillName(id)} (skill)`, value: Math.trunc(value), trust });
  const withSoft = { ...b, soft, itemSkills, charStats: contextStats() };
  const skillPoison = [];
  for (const id of active) {
    const sk = engine.skill(id);
    const wp = engine.weaponPoison?.(withSoft, id);
    if (wp) skillPoison.push({ source: `${sk.name} (skill)`, ...wp });
  }

  // ---------- Attributes and stat points
  const attributes = {};
  for (const a of ATTRIBUTES) {
    const base = (cls?.[a] || 0) + (b.attrs?.[a] || 0);
    const flat = s(a);
    const pct = s(`percent_${a}`);
    attributes[a] = { base, flat, pct, total: Math.floor((base + flat) * (1 + pct / 100)) };
  }
  const signetCap = SIGNET_CAP + questReward(b, "signet_cap");
  const signets = Math.min(b.signets || 0, signetCap);
  const statPoints = {
    fromLevels: (b.level - 1) * STAT_POINTS_PER_LEVEL,
    fromQuests: questReward(b, "stat_points"),
    signets,
    signetCap,
    spent: ATTRIBUTES.reduce((n, a) => n + (b.attrs?.[a] || 0), 0),
  };
  statPoints.available = statPoints.fromLevels + statPoints.fromQuests + signets;
  if (statPoints.spent > statPoints.available)
    warn(`${statPoints.spent} stat points spent but only ${statPoints.available} available.`);
  const STR = attributes.strength.total, DEX = attributes.dexterity.total;
  // Mastercrafted abilities that grow with other stats, as the hidden skill carrying each one
  // out computes them (skills.bin passive stats and their formulas, whole numbers as the game's
  // formulas are): Maiden Bow (skill 2031) max(1, Dexterity / 500)% avoid; Kukri (2032)
  // 14 × Dexterity / 100 + weapon physical damage % + defense bonus % lightning damage, one more
  // at the maximum (its tooltip leaves the Dexterity out); Flying Kinzhal (2043) Movement Speed / 7
  // Deadly Strike.
  const kukri = new Set();
  for (const r of Object.values(equipped)) for (const l of r.lines) {
    if (l === "+1% Chance to Avoid Damage per 500 Dexterity") add("avoid_chance", Math.max(1, Math.floor(DEX / 500)), r.def.name);
    else if (l === "1% Deadly Strike per 7% Movement Speed") add("deadly_strike", Math.floor(s("movement_speed") / 7), r.def.name);
    else if (/^\+1 Lightning Damage per 1% (Bonus to Defense|Total Physical Weapon Damage Bonus)$/.test(l) && !kukri.has(r)) {
      kukri.add(r);
      const n = Math.floor((14 * DEX) / 100) + Math.floor(s("enhanced_weapon_damage")) + Math.floor(s("defense_bonus_multiplier"));
      add("minimum_lightning_damage", n, r.def.name);
      add("maximum_lightning_damage", n + 1, r.def.name);
    }
  }
  // Gear that takes an attribute below zero ("-75 to Vitality"): say which, and offer the points.
  for (const a of ATTRIBUTES) {
    if (attributes[a].total >= 0) continue;
    const name = a[0].toUpperCase() + a.slice(1);
    const re = new RegExp(`^-\\d+ to (${name}|all Attributes)$`, "i");
    const from = Object.values(equipped).filter((r) => r.lines.some((l) => re.test(l))).map((r) => r.def.name);
    warn(`${name} is ${attributes[a].total}${from.length ? `: ${from.join(" and ")} take${from.length === 1 ? "s" : ""} away more than you have` : ""}.`, {
      kind: "attr", attr: a, amount: pointsFor(attributes[a], 0),
    });
  }

  for (const r of Object.values(equipped)) {
    if (r.head.reqLevel > b.level)
      warn(`${r.def.name} needs character level ${r.head.reqLevel}.`, { kind: "level", level: r.head.reqLevel });
    if (r.head.reqStr > STR)
      warn(`${r.def.name} needs ${r.head.reqStr} Strength (you have ${STR}).`, {
        kind: "attr", attr: "strength", amount: pointsFor(attributes.strength, r.head.reqStr),
      });
    if (r.head.reqDex > DEX)
      warn(`${r.def.name} needs ${r.head.reqDex} Dexterity (you have ${DEX}).`, {
        kind: "attr", attr: "dexterity", amount: pointsFor(attributes.dexterity, r.head.reqDex),
      });
  }

  // ---------- Life and mana (class formula from game_meta, then % and flat bonuses)
  const questLife = questReward(b, "flat_life");
  if (questLife) add("life", questLife, "The Golden Bird (quest)");
  const lifePool = pool(cls, b.level, LIFE, attributes.vitality.base, attributes.vitality.total, s("maximum_life"), s("life"));
  const life = { base: lifePool.base, fromAttribute: lifePool.bonus, pct: s("maximum_life"), flat: s("life"), total: lifePool.total };
  const manaPool = pool(cls, b.level, MANA, attributes.energy.base, attributes.energy.total, s("maximum_mana"), s("mana"));
  const mana = { base: manaPool.base, fromAttribute: manaPool.bonus, pct: s("maximum_mana"), flat: s("mana"), total: manaPool.total };
  // The mercenary's Vindicate: its share of this life, per second (mercs.js).
  if (merc?.healing) add("life_regenerated_per_second", Math.floor(Math.min(life.total, merc.healing.cap) / merc.healing.seconds), merc.healing.source, "game-inferred");

  // ---------- Resistances
  const diff = b.difficulty || "Hell";
  const resist = {};
  for (const el of ["fire", "cold", "lightning", "poison"]) {
    const stacked = s(`${el}_resistance`);
    const maxKey = el === "poison" ? "maximum_poison_resist" : `maximum_${el}_resistance`;
    const max = BASE_MAX_RESIST + s(maxKey);
    resist[el] = { stacked, penalty: ELEMENTAL_RES_PENALTY[diff], max, value: Math.min(stacked + ELEMENTAL_RES_PENALTY[diff], max) };
  }
  {
    const stacked = s("magic_resistance");
    const max = BASE_MAX_RESIST + s("maximum_magic_resistance");
    resist.magic = { stacked, penalty: MAGIC_RES_PENALTY[diff], max, value: Math.min(stacked + MAGIC_RES_PENALTY[diff], max) };
    const phys = s("physical_resistance");
    resist.physical = { stacked: phys, penalty: 0, max: PHYS_RES_CAP, value: Math.min(phys, PHYS_RES_CAP) };
  }

  // ---------- Defense (estimate: D2 rules, which the docs say Median XL keeps)
  let armor = 0;
  const defenseParts = [];
  for (const [slot, r] of Object.entries(equipped)) {
    if (r.head.defense == null) continue;
    const ed = localEdDef.get(r) || 0;
    // An item with its own Enhanced Defense starts from its maximum defense + 1 (a D2 rule; a
    // Superior Greaves (4) at +47% shows 1,206 in game: (820 + 1) × 1.47, not 820 × 1.47).
    const v = Math.floor((r.head.defense + (ed > 0 ? 1 : 0)) * (1 + ed / 100));
    armor += v;
    defenseParts.push({ source: r.def.name, value: v });
  }
  const dexDefense = Math.floor(DEX / 4);
  const defense = {
    items: armor, parts: defenseParts, flat: s("defense"), dex: dexDefense, pct: s("defense_bonus_multiplier"),
  };
  defense.total = s('zero_defense') ? 0 : Math.max(0, Math.floor((armor + defense.flat + dexDefense) * (1 + defense.pct / 100)
    * Math.max(0, 1 + s('total_defense_multiplier') / 100)));

  // ---------- Block (docs: Block% × (Dex − 15) / (2 × Level), capped at 50%, up to 80%)
  const classBlock = planner.shieldClassBlock.find((g) => g.classes.includes(b.cls))?.percent ?? 0;
  const shield = offhand && offhand.def.slotType === "shield" ? offhand : null;
  const blockPct = (shield ? (shield.head.block || 0) + (shield.head.blockClass ? classBlock : 0) : 0) + s("base_block_chance");
  const blockCap = Math.min(BLOCK_CAP + s("max_block_chance"), BLOCK_CAP_MAX);
  const block = {
    pct: blockPct,
    cap: blockCap,
    value: blockPct > 0 ? Math.min(Math.floor((blockPct * Math.max(0, DEX - 15)) / (2 * b.level)), blockCap) : 0,
  };

  // ---------- Attack rating (estimate: D2 formula)
  const ar = { flat: s("attack_rating"), pct: s("percent_attack_rating") };
  // The class's to-hit factor comes from the game's charstats.bin (10 for every class in
  // Median XL); the classic D2 table is only a fallback without the game extract.
  const toHit = cls?.toHitFactor ?? CLASS_BASE_AR[b.cls] ?? 0;
  ar.total = Math.max(0, Math.floor((5 * DEX - 35 + toHit + ar.flat) * (1 + ar.pct / 100)));

  // ---------- Weapon damage (estimate)
  const damage = computeDamage({ weapon, weaponLocalEd, s, STR, DEX, attributes });
  damage.weaponPoison = s('disable_poison_damage') ? null : combineWeaponPoison(stats, skillPoison);
  if (damage.weaponPoison) damage.elements.poison = damage.weaponPoison.total;

  // ---------- Spell focus (docs formula)
  const sfRaw = s("spell_focus") * (1 + s("percent_spell_focus") / 100);
  const E = attributes.energy.total;
  const spellFocus = {
    value: Math.floor(sfRaw),
    cap: SPELL_FOCUS_CAP,
    bonus: Math.floor((130 * (E + 20)) / (500 + E) + Math.min(Math.min(sfRaw, SPELL_FOCUS_CAP) / 10, 100)),
  };

  const avoidCap = Math.min(100, AVOID_CAP + s('maximum_avoid_chance'));
  const avoid = { value: Math.min(s("avoid_chance"), avoidCap), cap: avoidCap };

  // Values skill formulas can reference as {{key}}: every summed stat plus the
  // attribute, life and mana totals ({{energy}}, {{base_dexterity}}, …).
  const charStats = { ...skillFlags, ...Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.total])) };
  for (const a of ATTRIBUTES) {
    charStats[a] = attributes[a].total;
    charStats[`base_${a}`] = attributes[a].base;
  }
  Object.assign(charStats, { life: life.total, mana: mana.total, level: b.level, spell_focus: spellFocus.value });

  return {
    charStats,
    itemSkills,
    stats, s, equipped, inventory, weapon, offhand, sets, soft, allSkills, classSkills, skillBonus,
    attributes, statPoints, life, mana, resist, defense, block, ar, damage, spellFocus, avoid, merc,
    difficulty: diff, issues, warnings: issues.map((i) => i.text), ...lists,
  };
}

// Fewest stat points that bring an attribute's total to at least `need`,
// allowing for flat and % bonuses from gear: total = floor((base + flat) × (1 + pct/100)).
// How a capped stat reads: below zero is bad (red), at or above its cap is maxed (green).
export const capTone = (value, max) => (value < 0 ? "negative" : value >= max ? "capped" : null);

export function pointsFor(a, need) {
  const total = (n) => Math.floor((a.base + n + a.flat) * (1 + a.pct / 100));
  let n = Math.max(0, Math.ceil(need / (1 + a.pct / 100) - a.flat - a.base) - 1);
  while (total(n) < need) n++;
  return n;
}

function computeDamage({ weapon, weaponLocalEd, s, STR, DEX, attributes }) {
  // Elemental weapons (e.g. Crystal Swords, Stag Bows) have no physical damage line:
  // their damage is innate elemental plus added elemental damage.
  const out = { hasWeapon: weapon?.def.slotType === "weapon", elemental: !!weapon && !weapon.head.damage, elements: {} };
  const statBonus =
    (weapon?.head.strPer || 0) * STR + (weapon?.head.dexPer || 0) * DEX + s("strength_damage_bonus") + s("dexterity_damage_bonus");
  const otherPct = s("enhanced_weapon_damage") + s("enhanced_damage");
  out.statBonus = statBonus;
  out.otherPct = otherPct;
  out.localEd = weaponLocalEd;
  if (out.hasWeapon) {
    const d = weapon.head.damage || { type: "Elemental", min: 0, max: 0 };
    const mult = Math.max(0, 1 + (statBonus + otherPct) / 100);
    const min = Math.floor((d.min * (1 + weaponLocalEd / 100) + s("min_damage")) * mult);
    const max = Math.floor((d.max * (1 + weaponLocalEd / 100) + s("max_damage")) * mult);
    out.type = d.type;
    out.base = [d.min, d.max];
    out.physical = [min, Math.max(min, max)];
  }
  const innateMult = 1 + s("innate_elemental_damage") / 100;
  for (const el of ["fire", "cold", "lightning", "magic"]) {
    if (s(`disable_${el}_damage`) || s('disable_elemental_damage') && el !== 'magic') continue;
    let min = s(`minimum_${el}_damage`), max = s(`maximum_${el}_damage`);
    for (const inn of weapon?.head.innate || []) {
      const elements = /Tri-Elemental/i.test(inn.element) ? ["fire", "cold", "lightning"] : [inn.element.toLowerCase()];
      if (elements.includes(el)) {
        const v = Math.floor(((inn.pct / 100) * (attributes[inn.stat]?.total || 0)) * innateMult);
        min += v;
        max += v;
      }
    }
    if (min || max) out.elements[el] = [min, max];
  }
  return out;
}

// Weapon poison from items ("Adds 75-150 Poison Damage over 2 seconds") and skills
// (Way of the Spider's poisonmindam/maxdam/length). Per-second damage adds up; item
// durations are averaged, and skill durations are added on top.
// Source: the Median XL forum poison guide (Oct 2021, before 2.0), which also says
// weapon poison is not raised by Poison Spell Damage but is scaled with the attack's
// weapon damage like other added damage. It predates 2.14, so the result is "inferred".
export const WEAPON_POISON_RULE = {
  status: "inferred",
  source: "Median XL forum poison mechanics guide (October 2021, pre-2.0); not confirmed for 2.14",
};
export function combineWeaponPoison(stats, skills) {
  const v = (k) => stats[k]?.total || 0;
  const itemCount = v("poison_item_sources");
  if (!itemCount && !skills.length) return null;
  const itemSeconds = itemCount ? v("poison_item_seconds") / itemCount : 0;
  let minRate = v("poison_min_per_second"), maxRate = v("poison_max_per_second");
  for (const sk of skills) {
    minRate += sk.total[0] / sk.seconds;
    maxRate += sk.total[1] / sk.seconds;
  }
  const seconds = itemSeconds + skills.reduce((n, sk) => n + sk.seconds, 0);
  const sources = [
    ...(stats.poison_min_per_second?.sources || []).map((x, i) => ({
      source: x.source,
      value: `${Math.round(x.value * 100) / 100}-${Math.round((stats.poison_max_per_second.sources[i]?.value || 0) * 100) / 100}/s`,
    })),
    ...skills.map((sk) => ({ source: sk.source, value: `${sk.total[0]}-${sk.total[1]} over ${sk.seconds}s`, trust: sk.status })),
  ];
  return {
    perSecond: [minRate, maxRate],
    seconds,
    total: [Math.floor(minRate * seconds), Math.floor(maxRate * seconds)],
    itemSeconds,
    sources,
    ...WEAPON_POISON_RULE,
  };
}
