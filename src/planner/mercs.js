// Mercenaries: the type, level and gear a build hires (build.merc), its stats, and the buffs
// it casts on the party, which count toward the character's stats.
//  - Base stats and skills: the game's hireling.bin (scripts/extract-mercs.mjs → data.mercs),
//    with D2 1.13c's HirelingTxt growth: strength, dexterity and damage per level in 1/8,
//    resistances in 1/4, from the latest row at or below its level. An in-game Act 2
//    Shapeshifter at level 44 shows life 1,590 = 1,525 + 65 × (44 − 43) (the level-43 row).
//  - Skill levels: base + (level − the level it was hired at) × per-level / 32, rounded down,
//    + All Skills from its gear; every skill from hire (the docs' "Lvl" column isn't when
//    they're learned). In game (GitHub issues #9-#11): a level 44 Shapeshifter with no +skills
//    has Bloodlust 8 and Pounce 15 (hired at 15-16); a level 43 Ranger hired in Nightmare has
//    Dark Power 4 (hired at 36-37); a level 42 Bloodmage has Firedance 7 (hired at 15-18).
//    The stats follow the table rows instead (that Shapeshifter's life 1,590 is the level-43
//    row's). The hiring level defaults to the earliest possible, the difficulty's first row.
//  - Class items each act can wear and the fixed bonuses: the docs
//    (docs.median-xl.com/doc/class/hirelings), as written there.
//  - Buffs: the skills' own game formulas (aura stats), at the mercenary's skill level.
import { createGameEval } from "./gamecalc.js";
import { PASSIVE_STATS } from "./skillEffects.js";
import { formatLine } from "./desclines.js";

// The in-game mercenary screen: every slot but the rings.
export const MERC_SLOTS = [
  { id: "weapon", label: "Weapon" },
  { id: "offhand", label: "Off-hand" },
  { id: "helm", label: "Helm" },
  { id: "amulet", label: "Amulet" },
  { id: "body", label: "Body armor" },
  { id: "gloves", label: "Gloves" },
  { id: "belt", label: "Belt" },
  { id: "boots", label: "Boots" },
];
// What each slot takes: ordinary items for it, plus the class items the docs give each act
// ("Can equip Amazon class helms and bows"…). Weapons are Diablo II's for each act's
// hirelings (bows, spears, swords). The off-hand taking shields is assumed, not confirmed.
const ANY = {
  helm: ["Helms", "Circlets", "Special Helms"], body: ["Body Armors"], gloves: ["Gloves"], belt: ["Belts"], boots: ["Boots"],
  amulet: ["Amulets"], offhand: ["Shields", "Special Shields"],
};
export const MERC_ACTS = {
  1: { name: "The Sisters", cats: { ...ANY, helm: [...ANY.helm, "Amazon Helms"], weapon: ["Bows", "Amazon Bows"], offhand: null } },
  2: { name: "The Town Guard", cats: { ...ANY, helm: [...ANY.helm, "Paladin Helms"], weapon: ["Spears", "Paladin Spears"] } },
  3: { name: "The Iron Wolves", cats: { ...ANY, body: [...ANY.body, "Sorceress Body Armors"], weapon: ["One-Handed Swords", "Crystal Swords", "Sorceress Crystal Swords"] } },
  5: { name: "The Barbarians", cats: { ...ANY, helm: [...ANY.helm, "Barbarian Helms"], weapon: ["One-Handed Swords", "Barbarian Swords"] } },
};
// The class items the docs name, for the panel's note.
export const MERC_CLASS_ITEMS = { 1: "Amazon class helms and bows", 2: "Paladin spears and helms", 3: "Sorceress body armors and crystal swords", 5: "Barbarian helmets" };
// The docs' names where the game files use another.
const DOCS_NAME = { Lionheart: "Dragon Heart", Heartseeker: "Homing Nova Shot", Timefield: "Chronofield", "Short Duration Superbeast": "Superbeast", "Frigid Nova": "Frigid Sphere", "Werebear Morph": "Werebear", Sandstorm: "Claw Tornado" };
// Buffs the docs say reach the party ("buff nearby allies", "all damage of the party",
// "spell damage of party members"); the others hit enemies or the mercenary itself.
const PARTY_BUFFS = new Set(["Dark Power", "Bloodlust", "Firedance"]);
// Aura stats that aren't in the planner's passive table (ItemStatCost ids).
const AURA_STATS = {
  329: ["fire_spell_damage"], 330: ["lightning_spell_damage"], 331: ["cold_spell_damage"], 332: ["poison_spell_damage"],
  // Bloodlust's "Physical/Magic Spell Damage" line is this stat's formula.
  357: ["physical_magic_spell_damage"], 52: ["minimum_magic_damage"], 53: ["maximum_magic_damage"],
};

/** The specializations on offer: [{ spec, act }] in act order. */
export function mercSpecs(data) {
  const seen = new Map();
  for (const t of data.mercs?.types || []) if (!seen.has(t.spec)) seen.set(t.spec, { spec: t.spec, act: t.act });
  return [...seen.values()].sort((a, b) => a.act - b.act);
}
export const mercCats = (act, slot) => MERC_ACTS[act]?.cats[slot] || null;
export const docsSkillName = (name) => DOCS_NAME[name] || name;

/** A stored build.merc, kept only if it names a real type (untrusted data). */
export function cleanMerc(raw, data, cleanItem) {
  if (!raw || typeof raw !== "object") return null;
  const spec = mercSpecs(data).find((x) => x.spec === raw.spec);
  if (!spec) return null;
  const m = { spec: spec.spec, level: null, difficulty: null, hiredAt: null, gear: {}, off: [] };
  if (Number.isInteger(raw.hiredAt) && raw.hiredAt >= 1 && raw.hiredAt <= 150) m.hiredAt = raw.hiredAt;
  if (["Normal", "Nightmare", "Hell"].includes(raw.difficulty)) m.difficulty = raw.difficulty;
  if (Number.isInteger(raw.level) && raw.level >= 1 && raw.level <= 150) m.level = raw.level;
  for (const { id } of MERC_SLOTS) {
    if (!mercCats(spec.act, id)) continue;
    const it = cleanItem(raw.gear?.[id]);
    if (it) m.gear[id] = it;
  }
  m.off = (Array.isArray(raw.off) ? raw.off : []).filter((n) => PARTY_BUFFS.has(n));
  return m;
}

/**
 * The hired mercenary's stats and party buffs, or null without one.
 * @param b  the build ({ merc, level, difficulty })
 * @returns {{ spec, act, level, row, life, defense, strength, dexterity, ar, damage, resist,
 *   allSkills, skills: [{ name, docsName, level, learnedAt, learned, buff, on, effects, uncounted }],
 *   buffs: [[key, value, label, trust]], items, notes }}
 */
export function computeMerc(b, { catalog, data }) {
  const m = b.merc;
  if (!m?.spec || !data.mercs) return null;
  // The difficulty it was hired in (its own, else the character's).
  const diff = { Normal: 1, Nightmare: 2, Hell: 3 }[m.difficulty || b.difficulty] ?? 3;
  const types = data.mercs.types.filter((t) => t.spec === m.spec);
  const type = types.find((t) => t.difficulty === diff) || types.at(-1);
  if (!type) return null;
  const L = Math.max(1, Math.min(m.level ?? b.level, b.level));
  const row = [...type.rows].reverse().find((r) => r.level <= L) || type.rows[0];
  const d = Math.max(0, L - row.level);
  const act = type.act;
  const notes = [];

  // Its items: stats as the character's (item text parsed the same way).
  const stats = {};
  const add = (k, v) => v && (stats[k] = (stats[k] || 0) + v);
  const items = [];
  let weaponEd = 0, armor = 0;
  for (const { id, label } of MERC_SLOTS) {
    const st = m.gear?.[id];
    const r = st && catalog.resolve(st, L);
    if (!r) continue;
    items.push({ slot: id, label, name: r.def.name });
    let localEd = 0;
    const take = (parsed, fromSocket) => {
      for (const p of parsed || []) if (p.kind === "stats") for (const [k, v] of p.effects) {
        if (k === "enhanced_defense" && r.def.slotType !== "weapon") { if (fromSocket || !["unique", "sacred", "set"].includes(r.def.kind)) localEd += v; continue; }
        if (k === "enhanced_damage" && id === "weapon") { weaponEd += v; continue; }
        add(k, v);
      }
    };
    take(r.parsed, false);
    r.sockets?.forEach((s) => s && take(s.parsed, true));
    r.orbs?.forEach((o) => take(o.parsed, true));
    if (r.head.defense != null) armor += Math.floor((r.head.defense + (localEd > 0 ? 1 : 0)) * (1 + localEd / 100));
    if (id === "weapon") items.at(-1).damage = r.head.damage;
  }
  const s = (k) => stats[k] || 0;

  // Attributes; the Barbarians' Mountain King: +20% strength and dexterity, +1% strength per
  // 4 levels and +1% dexterity per 3 levels.
  const mk = act === 5 ? [20 + Math.floor(L / 4), 20 + Math.floor(L / 3)] : [0, 0];
  const strength = Math.floor((row.strength[0] + Math.floor((d * row.strength[1]) / 8) + s("strength")) * (1 + (s("percent_strength") + mk[0]) / 100));
  const dexterity = Math.floor((row.dexterity[0] + Math.floor((d * row.dexterity[1]) / 8) + s("dexterity")) * (1 + (s("percent_dexterity") + mk[1]) / 100));
  const life = Math.floor((row.life[0] + d * row.life[1] + s("life")) * (1 + s("maximum_life") / 100));
  // Iron Wolves' Warp Armor: total defense +300%, +5% per level.
  const warp = act === 3 ? 300 + 5 * L : 0;
  const defense = Math.floor((row.defense[0] + d * row.defense[1] + armor + s("defense")) * (1 + (s("defense_bonus_multiplier") + warp) / 100));
  const ar = Math.floor((row.ar[0] + d * row.ar[1] + s("attack_rating")) * (1 + s("percent_attack_rating") / 100));
  // Heroic Strength: +1% weapon damage per 2 strength (the Sisters': dexterity).
  const heroic = Math.floor((act === 1 ? dexterity : strength) / 2);
  const w = items.find((x) => x.slot === "weapon")?.damage;
  const baseDmg = w ? [w.min, w.max].map((x) => Math.floor(x * (1 + weaponEd / 100))) : [row.damage[0], row.damage[1]].map((x) => x + Math.floor((d * row.damage[2]) / 8));
  const dmgPct = heroic + s("enhanced_weapon_damage") + s("enhanced_damage");
  const damage = { range: baseDmg.map((x, i) => Math.floor((x + s(i ? "max_damage" : "min_damage")) * (1 + dmgPct / 100))), heroic, pct: dmgPct, weapon: !!w };
  // Heroic Resistances: all +70% (the row's resistance), +1% max every 10 levels above 100.
  const baseRes = row.resist[0] + Math.floor((d * row.resist[1]) / 4);
  const maxBonus = L > 100 ? Math.floor((L - 100) / 10) : 0;
  const resist = {};
  for (const el of ["fire", "cold", "lightning", "poison"]) {
    const maxKey = el === "poison" ? "maximum_poison_resist" : `maximum_${el}_resistance`;
    resist[el] = { stacked: baseRes + s(`${el}_resistance`), max: 75 + maxBonus + s(maxKey) };
  }
  resist.physical = (act === 1 ? Math.floor(L / 4) : act === 2 ? 25 + Math.floor(L / 5) : 0) + s("physical_resistance");
  const extras = [];
  if (act === 1) extras.push(["Avoid melee attacks", `${Math.min(60, Math.floor(dexterity / 40))}%`]);
  if (act === 2) extras.push(["Crushing blow", `${15 + Math.floor(L / 10) + s("chance_of_crushing_blow")}%`]);
  if (m.spec === "Fighter Mage") extras.push(["Fire and cold spell damage", `+${L}%`]);
  if (act === 3) extras.push(["Spell focus", `+${250 + 5 * L}`], ["Elemental spell damage", `+${L}%`]);
  if (act === 5) extras.push(["Damage reduction", "20%"]);

  // Skills: base level + levels gained since the row's level + All Skills from its gear
  // (the docs: "+X to All Skills" reaches mercenaries; "+X to [Skill]" and class skills don't).
  const allSkills = s("all_skills");
  // The level it was hired at: at least the difficulty's first row, at most its level now.
  const hiredAt = Math.min(L, Math.max(type.rows[0].level, m.hiredAt ?? type.rows[0].level));
  const skills = type.skills.map((sk) => {
    const level = sk.level + Math.floor((Math.max(0, L - hiredAt) * sk.perLevel) / 32) + allSkills;
    const buff = PARTY_BUFFS.has(sk.name);
    const on = buff && !m.off?.includes(sk.name);
    const out = { name: sk.name, docsName: docsSkillName(sk.name), level, learned: true, buff, on, effects: [], uncounted: [], tooltip: [] };
    const rec = data.mercs.skills?.[sk.gameId];
    if (buff && out.learned && rec && data.game?.variables) {
      const e = createGameEval(rec, data.game.variables, { blvl: level, lvl: level, ulvl: L });
      // What its in-game tooltip should read at this level: the game's own tooltip formulas
      // (skilldesc lines), to check against a screenshot. They can differ from the stats it
      // applies (Dark Power's tooltip attack speed uses 220 × …, its aura stat 200 × …).
      const value = (c) => { if (!c) return null; const r = e.calc(c); return r.ok ? r.value : undefined; };
      for (const line of rec.lines || []) {
        if (!["level", "extra"].includes(line.block) || !(line.textA || "").trim() || /item granted skill/i.test(line.textA)) continue;
        const a = value(line.calcA), b = value(line.calcB);
        if (a === undefined || b === undefined) continue;
        const text = formatLine(line, a, b).text;
        if (text) out.tooltip.push(text);
      }
      for (const [slot, stat] of Object.entries(rec.astStats || {})) {
        const map = AURA_STATS[stat] || PASSIVE_STATS[stat];
        let r;
        try { r = e.variable(slot); } catch (err) { r = { ok: false, reason: err.message }; }
        const value = typeof r === "number" ? r : r?.ok ? r.value : null;
        // A stat the planner has no meaning for is listed, unless it comes to nothing.
        if (!map) { if (value !== 0) out.uncounted.push(`stat ${stat}${value != null ? ` (${value})` : ""}: not a character stat the planner knows`); continue; }
        if (value == null || !Number.isFinite(value)) { out.uncounted.push(`${map[0].replace(/_/g, " ")}: formula couldn't be worked out`); continue; }
        if (value) out.effects.push([map[0], value / (map[1] || 1)]);
      }
    }
    return out;
  });
  const buffs = skills.filter((x) => x.on).flatMap((x) => x.effects.map(([k, v]) => [k, v, `Mercenary's ${x.docsName} (level ${x.level})`, "game-inferred"]));
  return { spec: m.spec, act, actName: MERC_ACTS[act]?.name, level: L, hiredAt, row: row.level, difficulty: type.difficulty, life, defense, strength, dexterity, ar, damage, resist, extras, allSkills, skills, buffs, items, notes };
}

/** The specializations with a party buff (the ones worth hiring for your own stats). */
export const buffSpecs = (data) => mercSpecs(data).filter((x) => (data.mercs.types.find((t) => t.spec === x.spec)?.skills || []).some((s) => PARTY_BUFFS.has(s.name)));

// Its gear, for the starter builds: +All Skills first (a stronger buff), then staying alive
// (life, resistances, defense). Only items it can wear, is high enough level for, and has
// the strength and dexterity for; each item's highest such tier.
const RES = ["fire_resistance", "cold_resistance", "lightning_resistance", "poison_resistance"];
function mercItemScore(r) {
  let s = 0;
  const add = (k, v) => {
    if (k === "all_skills") s += 1000 * v;
    else if (k === "life") s += v;
    else if (k === "maximum_life") s += 20 * v;
    else if (RES.includes(k)) s += 5 * v;
    else if (k === "physical_resistance") s += 15 * v;
  };
  for (const p of r.parsed || []) if (p.kind === "stats") for (const [k, v] of p.effects) add(k, v);
  for (const x of [...(r.sockets || []), ...(r.orbs || [])]) for (const p of x?.parsed || []) if (p.kind === "stats") for (const [k, v] of p.effects) add(k, v);
  return s + (r.head.defense || 0) / 10;
}
export function suggestMercGear(b, { catalog, data }) {
  const m = computeMerc(b, { catalog, data });
  if (!m) return {};
  const gear = {};
  for (const { id } of MERC_SLOTS) {
    const cats = mercCats(m.act, id);
    if (!cats) continue;
    let best = null;
    for (const d of catalog.all()) {
      let states;
      if (d.kind === "runeword") {
        const bases = catalog.runewordBases(d).filter((x) => cats.includes(x.cat));
        // Only base tiers with enough sockets for its runes (as the character's gear suggestion).
        const sockets = (v) => Number(/^Socketed \((\d+)\)/.exec(v.lines.find((l) => /^Socketed/.test(l)) || "")?.[1] || 0);
        states = bases.flatMap((base) => base.variants.flatMap((v, i) => (sockets(v) >= d.runes.length ? [{ ref: d.key, base: base.key, baseVariant: i }] : [])).reverse());
      } else if (["unique", "sacred", "set"].includes(d.kind) && cats.includes(d.cat)) {
        states = d.variants.map((_, variant) => ({ ref: d.key, variant })).reverse();
      } else continue;
      for (const st of states) {
        const r = catalog.resolve(st, m.level);
        if (!r || r.head.reqLevel > m.level || r.head.reqStr > m.strength || r.head.reqDex > m.dexterity) continue;
        const score = mercItemScore(r);
        if (!best || score > best.score) best = { state: st, score };
        if (d.kind !== "runeword") break;
      }
    }
    if (best) gear[id] = best.state;
  }
  return gear;
}
