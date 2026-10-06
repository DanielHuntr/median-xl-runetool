// Estimated damage per skill for the left/right slots and the skill bar.
//
// Attack skills: (weapon damage with the skill's weapon-physical bonus) × the skill's
// "% Weapon Damage", then its conversions and flat bonus damage. Spells use known
// tooltip formulas plus matching spell damage bonuses; unavailable bases show bonuses only.
// Summons and buffs show their key effect. Everything here is an estimate.

import MULTI_HIT_DATA from "../data/multi-hit.json" with { type: "json" };

export const BASIC_ATTACK = "attack";
const ELEMENTS = ["fire", "cold", "lightning", "poison", "magic"];
// Minions that don't take your pierce (the docs' Minion Mechanics page; traps keep their own, below).
const NO_INHERITED_PIERCE = new Set(["iron_golem", "jinn", "spirit_of_vengeance", "vine_companion"]);
const CONVERSIONS = {
  converts_phys_to_fire: ["fire"],
  converts_phys_to_cold: ["cold"],
  converts_phys_to_lightning: ["lightning"],
  converts_phys_to_magic: ["magic"],
  converts_phys_to_fire_cold_or_lightning: ["fire", "cold", "lightning"],
};
// Flat bonus damage: key → elements it can be (one of several for "fire, cold or lightning").
const FLAT_BONUS = {
  bonus_magic_damage: ["magic"],
  bonus_lightning_damage: ["lightning"],
  bonus_physical_damage: ["physical"],
  bonus_fire_cold_or_lightning: ["fire", "cold", "lightning"],
};
// Tooltip keys that are a skill's own damage (min-max).
const TOOLTIP_DAMAGE = /^(fire|cold|lightning|magic|poison|physical)_damage$/;
// Skills that deal their damage several times: a count in the tooltip, as a value
// ("6 bolts", Mind Flay's "Beams: 3", which MedianDB keys as "minions") or as text
// (Slayer's "Casts 25 times"). The damage lines are for one of them.
// Overkill throws several axes ("axes: 7 + points/2" in its tooltip).
const COUNT_KEYS = new Set(["bolts", "missiles", "projectiles", "charged_bolts", "releases_bolts", "shoots_times", "total_bolts", "minions", "axes"]);
const COUNT_TEXT = /^(?:Casts|Shoots|Fires|Releases|Strikes|Hits) (\d+)(?:[-–](\d+))? times?(?: per (?:attack|cast|target))?$/i;
export function damageCount(effect) {
  const make = (min, max, text) => max > 1 && Number.isInteger(min) && Number.isInteger(max) && min > 0 && max >= min ? { n: max, ...(min !== max ? { min } : {}), text } : null;
  // Explicit repeats take priority over spread/projectile counts. Never multiply
  // the two together: their relationship needs skill-specific evidence.
  for (const l of effect) {
    if (l.status === 'unknown') continue;
    for (const text of (l.text || '').split('\n').map(s => s.trim())) {
      const m = COUNT_TEXT.exec(text) || /^(\d+)(?:[-–](\d+))? hits?(?: per (?:attack|cast|target))$/i.exec(text);
      if (m) { const count = make(+m[1], +(m[2] || m[1]), text); if (count) return count; }
      const upTo = /^(?:Hits up to|Up to) (\d+) (?:times|hits)(?: per (?:wraith|attack|cast|target))?$/i.exec(text);
      if (upTo && +upTo[1] > 1) return { n: +upTo[1], min: 1, text };
    }
  }
  for (const l of effect) {
    if (l.status === 'unknown') continue;
    const p = l.parts?.find((x) => COUNT_KEYS.has(x.key) && typeof x.values?.[0] === "number");
    if (p) { const count = make(p.values[0], p.values[0], l.text); if (count) return count; }
    for (const text of (l.text || '').split('\n').map(s => s.trim())) {
      const m = /^(\d+) (?:projectiles|bolts|missiles|beams)(?: per nova)?$/i.exec(text);
      if (m && +m[1] > 1) return { n: +m[1], text };
    }
  }
  return null;
}
export function repeatedParts(parts, count) {
  return parts.map(p => ({ ...p, range: p.element === 'poison' ? [...p.range]
    : pair(p.range[0] * (count.min ?? count.n), p.range[1] * count.n) }));
}
function repetition(effect, parts) {
  const count = damageCount(effect);
  if (!count) return {};
  const allParts = repeatedParts(parts, count);
  return { count, allParts, all: [0, 1].map(i => allParts.reduce((sum, p) => sum + p.range[i], 0)) };
}
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pair = (a, b) => [Math.floor(a), Math.floor(Math.max(a, b))];

// Upgrade skills name the skill they improve as their first effect line ("[[whirlwind]]"
// then "{{deadly_strike}}": Savagery, "Adds Deadly Strike to your attacks during Whirlwind").
// Their damage stats apply to that skill only, unless the skill's own values already change
// with the upgrade (Erupting Strike is part of Steady Shot's fire formula), so nothing counts
// twice. Bonuses that need combat state ("per Fury Charge": Hunter's Prowess) are left out,
// as are stats for other hits (Gale Force's splash) and critical strike, which the planner
// doesn't model yet.
const UPGRADE_KEYS = new Set(["deadly_strike", "weapon_physical_damage", "physical_damage_percent", "bonus_maximum_damage",
  "base_physical_damage_to_thunderslam", "fire_damage", "cold_damage", "lightning_damage", "poison_damage", "magic_damage"]);
const upgradeIndex = new WeakMap();
function upgradesOf(engine, id) {
  let index = upgradeIndex.get(engine);
  if (!index) {
    index = new Map();
    for (const up of engine.skillIds?.() || []) {
      const sk = engine.skill(up);
      if (!sk?.tags?.includes("Upgrade")) continue;
      for (const e of sk.effect || []) {
        const m = /^\[\[([\w-]+)\]\]$/.exec(e);
        if (m) (index.get(m[1]) ?? index.set(m[1], []).get(m[1])).push(up);
      }
    }
    upgradeIndex.set(engine, index);
  }
  return (index.get(id) || []).filter((up) => !(engine.skill(up).effect || []).some((e) => /\bper [\w ]*Charge\b/i.test(e)));
}
function withUpgrades(engine, skillBuild, id, values) {
  const out = { ...values }, from = [];
  for (const up of upgradesOf(engine, id)) {
    if (!((skillBuild.points?.[up] || 0) + (skillBuild.soft?.[up] || 0))) continue;
    const without = engine.skillValues({ ...skillBuild, points: { ...skillBuild.points, [up]: 0 }, soft: { ...skillBuild.soft, [up]: 0 } }, id);
    if (JSON.stringify(without) !== JSON.stringify(values)) continue;
    const v = engine.skillValues(skillBuild, up);
    const keys = Object.keys(v).filter((k) => UPGRADE_KEYS.has(k) && typeof v[k]?.[0] === "number" && v[k][0]);
    for (const k of keys) {
      const cur = out[k];
      out[k] = cur && typeof cur[0] === "number" ? cur.map((x, i) => (typeof x === "number" && typeof v[k][i] === "number" ? x + v[k][i] : x)) : v[k];
    }
    if (keys.length) from.push(engine.skillName(up));
  }
  return { values: out, from };
}

/**
 * @returns {{
 *   id, name, kind: "attack"|"spell"|"summon"|"other", total?: [min,max],
 *   parts: { element, range: [min,max] }[], lines: string[], notes: string[], formula: string,
 * }}
 */
// Skills whose missile hits a monster again as it passes through it: an estimate from the game's
// missile data (scripts/extract-multi-hit.mjs, at most 3), and Hammer of Zerae's spiral read by
// hand (missile 2586: a lightning nova every frame for 85 frames; about 3 on a monster in its
// path, where every nova landing would be 85, which the Sin War ladder doesn't bear out).
const MULTI_HIT = { ...Object.fromEntries(Object.entries(MULTI_HIT_DATA.skills).map(([id, m]) => [id, m.hits])), hammer_of_zerae: 3 };
export function skillDamage(id, ctx) {
  const d = skillDamageOf(id, ctx);
  const hits = MULTI_HIT[id];
  if (!d?.parts?.length || !hits || d.count) return d;
  const count = { n: hits, text: `About ${hits} hits on a monster` };
  const allParts = repeatedParts(d.parts, count);
  return {
    ...d, count, allParts, all: [0, 1].map((i) => allParts.reduce((x, p) => x + p.range[i], 0)), multiHit: hits,
    notes: [...(d.notes || []), `Its missile hits a monster about ${hits} times as it passes through (estimated from the game's missile data); the total counts each.`],
  };
}
function skillDamageOf(id, { engine, build, skillBuild, character }) {
  const c = character;
  if (id === BASIC_ATTACK) return attack({ id, name: "Attack", pct: 100, values: {} }, c);
  const s = engine.node(build, id) || engine.skill(id);
  if (!s) return null;
  const { values, from: upgrades } = withUpgrades(engine, skillBuild, id, engine.skillValues(skillBuild, id));
  const weaponPct = num(values.weapon_damage?.[0]);
  if (weaponPct) {
    const d = attack({ id, name: s.name, pct: weaponPct, values }, c, engine.describe(skillBuild, id, build.points[id] || 0, { asShown: false }));
    if (upgrades.length) d.notes.push(`Includes ${upgrades.join(" and ")} (upgrade${upgrades.length > 1 ? "s" : ""} of this skill).`);
    return d;
  }

  const tags = s.tags || [];
  const describe = engine.describe(skillBuild, id, build.points[id] || 0, { asShown: false });
  // "Deals 150% of your vessel skill damage per hit" (Absolution, Sentence): that share of the
  // stronger Vessel the build has points in (its spell damage already applied), split by the
  // skill's "Converts 50% Physical Damage to Magic".
  const vesselLine = describe.effect.find((l) => /^Deals (\d+)% of your vessel skill damage per hit/i.test(l.text || ""));
  if (vesselLine) {
    const pct = Number(/(\d+)%/.exec(vesselLine.text)[1]);
    const vessels = engine.skillIds().filter((v) => v !== id && engine.skill(v).class === s.class && /^Vessel of /.test(engine.skill(v).name) && (build.points[v] || 0) > 0)
      .map((v) => skillDamage(v, { engine, build, skillBuild, character }))
      .filter((d) => d?.total)
      .sort((a, b) => b.total[1] - a.total[1]);
    const from = vessels[0];
    if (!from) return { id, name: s.name, kind: "spell", parts: [], lines: [vesselLine.text, "Needs points in a Vessel skill"], notes: [], formula: "" };
    const conv = Math.min(100, num(values.converts_phys_to_magic?.[0]) || 0) / 100;
    const parts = from.parts.flatMap((p) => {
      const r = [p.range[0] * pct / 100, p.range[1] * pct / 100];
      if (p.element !== "physical" || !conv) return [{ element: p.element, range: pair(r[0], r[1]) }];
      return [{ element: "physical", range: pair(r[0] * (1 - conv), r[1] * (1 - conv)) }, { element: "magic", range: pair(r[0] * conv, r[1] * conv) }];
    });
    const total = pair(parts.reduce((n, p) => n + p.range[0], 0), parts.reduce((n, p) => n + p.range[1], 0));
    return {
      id, name: s.name, kind: "spell", parts, total,
      lines: [vesselLine.text, `${pct}% of ${from.name} (${from.total[0]}-${from.total[1]})${conv ? `, ${conv * 100}% as magic` : ""}`],
      notes: [`Per hit: ${pct}% of your vessel's damage, as the tooltip says; the vessel's own spell damage bonuses are already in it.`],
      formula: "",
    };
  }
  const firstLines = describe.effect.filter((l) => l.status !== "unknown").slice(0, 2).map((l) => l.text);
  // Damage lines on the skill's own tooltip (game formulas, e.g. Incineration Trap's
  // "Fire Damage: 81-88 per second"), with their synergies already applied.
  // Also a poison spell's "Poison Damage: 17-17 over 1.6 seconds" (poison_dot: the total over
  // its duration, Arachnomancy, Lorenado), and a damage spell's flat "Physical Damage: +76"
  // (the Nephalem vessels); on a buff, that flat damage is added to attacks instead.
  const spellFlat = tags.includes("Spell") && !tags.includes("Buff");
  const tooltipDamage = describe.effect.flatMap((l) =>
    l.status === "unknown"
      ? []
      : (l.parts || [])
          .filter((p) => typeof p.values?.[0] === "number" && (typeof p.values?.[1] === "number" || p.key === "bonus_physical_damage"))
          .filter((p) => TOOLTIP_DAMAGE.test(p.key) || p.key === "poison_dot" || (spellFlat && p.key === "bonus_physical_damage"))
          .map((p) => ({
            element: p.key === "poison_dot" ? "poison" : p.key === "bonus_physical_damage" ? "physical" : p.key.split("_")[0],
            range: pair(p.values[0], p.values[1] ?? p.values[0]), text: l.text, source: p.source,
          })),
  );
  // A count of minions makes a summon, unless the skill deals damage of its own: MedianDB
  // also uses "minions" for Mind Flay's beams (and Lorenado's tornadoes).
  if (tags.includes("Summon") || tags.includes("Special Summon") || (values.minions && !tooltipDamage.length)) {
    const m = values.minions;
    const lines = m && m[1] ? [`${m[0] || "Minions"}: ${Math.floor(num(m[1]))}`] : firstLines;
    const extra = [];
    if (c.s("summoned_minion_damage")) extra.push(`+${c.s("summoned_minion_damage")}% summon damage`);
    if (c.s("summoned_minion_life")) extra.push(`+${c.s("summoned_minion_life")}% summon life`);
    // Its minions' damage, an estimate: the tooltip's damage for one minion ("Damage: 266-276"
    // is physical; "Magic Damage", a poison's total over its duration), for each minion, with
    // your summon damage: some summons' own formulas already read it (stat 470, Blood Skeleton,
    // Night Hawks, Guardian Spirit), the rest's tooltips don't move with it (Harvesters, Fire
    // Elementals), so it's added on top only for those (assumed: the game applies it to them).
    // How often minions attack isn't known (the docs: minion speeds are unknown).
    const n = typeof m?.[0] === "number" ? m[0] : typeof m?.[1] === "number" ? m[1] : 1;
    const mult = Math.max(0, 1 + c.s("summoned_minion_damage") / 100);
    const readsSummonDamage = (p) => Object.values(p.source?.resolved || {}).some((r) => /^summoned_minion_damage\b/.test(r.label || ""));
    let alreadyIn = false;
    const parts = describe.effect.flatMap((l) => l.status === "unknown" ? [] : (l.parts || [])
      .filter((p) => typeof p.values?.[0] === "number" && (p.key === "damage" || p.key === "poison_dot" || TOOLTIP_DAMAGE.test(p.key)))
      .map((p) => {
        const m = readsSummonDamage(p) ? ((alreadyIn = true), 1) : mult;
        return {
          element: p.key === "damage" ? "physical" : p.key === "poison_dot" ? "poison" : p.key.split("_")[0],
          range: pair(p.values[0] * m, (typeof p.values[1] === "number" ? p.values[1] : p.values[0]) * m),
        };
      }));
    if (!parts.length) return { id, name: s.name, kind: "summon", parts: [], lines: [...lines, ...extra], notes: [], formula: "" };
    const total = pair(parts.reduce((x, p) => x + p.range[0], 0), parts.reduce((x, p) => x + p.range[1], 0));
    const count = n > 1 ? { n, text: `${n} minions` } : null;
    const allParts = count ? repeatedParts(parts, count) : null;
    // Minions take your pierce, except those the docs' Minion Mechanics page names.
    const noPierce = NO_INHERITED_PIERCE.has(id);
    return {
      id, name: s.name, kind: "summon", total, parts, lines: [...lines, ...extra],
      ...(count ? { count, allParts, all: [0, 1].map((i) => allParts.reduce((x, p) => x + p.range[i], 0)) } : {}),
      ...(noPierce ? { pierce: Object.fromEntries(ELEMENTS.map((e) => [e, 0])) } : {}),
      notes: [
        `Estimated: each minion's damage from the skill's tooltip${mult !== 1 ? (alreadyIn ? `, which already includes your +${c.s("summoned_minion_damage")}% summon damage` : `, with your +${c.s("summoned_minion_damage")}% summon damage on top`) : ""}${count ? `; the total is for all ${n} if each lands a hit` : ""}. How often minions attack isn't known.`,
        ...(noPierce ? [`${s.name} doesn't use your pierce (the docs' Minion Mechanics page).`] : []),
      ],
      formula: "",
    };
  }
  if (tags.includes("Spell") || tags.includes("Melee Spell") || tooltipDamage.length) {
    const els = ELEMENTS.filter((e) => tags.map((t) => t.toLowerCase()).includes(e) || tooltipDamage.some((d) => d.element === e));
    const physMagic = tags.includes("Physical") || tags.includes("Magic");
    const lines = tooltipDamage.map((d) => d.text);
    if (!tooltipDamage.length) lines.push(`Energy & spell focus: +${c.spellFocus.bonus}% base damage`);
    for (const e of els) {
      const sd = e === "magic" ? c.s("physical_magic_spell_damage") : c.s(`${e}_spell_damage`);
      const pierce = c.s(`enemy_${e}_resistance`);
      lines.push(`${cap(e)}: +${sd}% spell damage${pierce ? `, −${pierce}% enemy resistance` : ""}`);
    }
    if (physMagic && !els.includes("magic")) lines.push(`Physical/magic: +${c.s("physical_magic_spell_damage")}% spell damage`);
    if (tooltipDamage.length) {
      const parts = tooltipDamage.map(d => {
        const key = ['magic', 'physical'].includes(d.element) ? 'physical_magic_spell_damage' : `${d.element}_spell_damage`;
        const stat = { fire: 329, lightning: 330, cold: 331, poison: 332 }[d.element];
        const resolved = d.source?.resolved || {};
        // Mastery is already in a value read through enma/exma (the game's elemental damage with
        // mastery), including another skill's: Askari Lightning reads Stormcall's enma.
        const included = stat && resolved[`stat${stat}`] || Object.values(resolved).some(r => r.label?.startsWith(`${key} `))
          || Object.keys(resolved).some(k => /\.(enma|exma)$/.test(k));
        const multiplier = c.s(`disable_${d.element}_damage`) || c.s('disable_elemental_damage') && ['fire', 'cold', 'lightning'].includes(d.element) ? 0
          : included ? 1 : Math.max(0, 1 + c.s(key) / 100);
        return { element: d.element, range: pair(d.range[0] * multiplier, d.range[1] * multiplier) };
      });
      const total = pair(parts.reduce((n, d) => n + d.range[0], 0), parts.reduce((n, d) => n + d.range[1], 0));
      // Several casts, beams or bolts: total and parts stay for one (gear scoring compares
      // those), and "all" is the combined damage if every one of them lands.
      const repeat = repetition(describe.effect, parts);
      const count = repeat.count;
      // A trap's own pierce (Shockwave Trap's "Lightning Pierce", raised by Deadly Constructs)
      // is a stat of the trap in the game files (skills.bin passive stats, beside the trap's
      // own attack speed), so it applies to the trap's damage. Inferred: the trap uses its own
      // pierce, not yours; its formula copies your spell damage into it, but not your pierce.
      const pierce = tags.includes("Trap")
        ? Object.fromEntries(ELEMENTS.map((e) => [e, values[`${e}_pierce`]?.[0]]).filter(([, v]) => typeof v === "number" && v > 0))
        : null;
      const ownPierce = pierce && Object.keys(pierce).length ? pierce : null;
      return {
        id, name: s.name, kind: "spell", total, parts, lines: count ? [count.text, ...lines] : lines,
        ...repeat,
        ...(ownPierce ? { pierce: ownPierce } : {}),
        notes: [
          ...(id === 'dragon_jaws' ? ['Assumes full mana. The current-mana damage bonus falls as mana is spent, up to a maximum of +600%.'] : []),
          ...(ownPierce ? [`Against a monster, the trap's own pierce (${Object.entries(ownPierce).map(([e, v]) => `${v}% ${e}`).join(", ")}) is used instead of yours (inferred from the game files).`] : []),
          ...(count ? [`${count.text}: the total is for all ${count.n} if every one lands; the tooltip's damage is for each one.`] : []),
          "Estimated damage including spell damage bonuses from equipment, orbs and skills; before enemy resistance. Energy and spell focus already read by the skill formula are not multiplied again.",
        ],
        formula: "Skill formula damage × (1 + matching spell damage %), before enemy resistance; bonuses already read by the formula are not applied twice.",
      };
    }
    return {
      id, name: s.name, kind: "spell", parts: [], lines,
      notes: ["This spell's base damage can't be worked out yet, so only the bonuses you give it are shown."],
      formula: "Base damage × (1 + energy & focus bonus) × (1 + element spell damage %), before enemy resistance.",
    };
  }
  return { id, name: s.name, kind: "other", parts: [], lines: firstLines, notes: [], formula: "" };
}

function attack({ id, name, pct, values }, c, describe = null) {
  const d = c.damage;
  if (!d.hasWeapon)
    return { id, name, kind: "attack", parts: [], lines: ["Equip a weapon to see this skill's damage."], notes: [], formula: "" };
  // The skill's own weapon-physical bonus joins the stat and gear bonuses.
  const wpd = num(values.weapon_physical_damage?.[0]) + num(values.physical_damage_percent?.[0]);
  const mult = Math.max(0, 1 + (d.statBonus + d.otherPct + wpd) / 100);
  const scale = pct / 100;
  // Upheaval's "base physical damage to Thunder Slam", "increased by your Weapon Physical
  // Damage bonus": flat damage like +damage on items (inferred).
  const basePhys = num(values.base_physical_damage_to_thunderslam?.[0]);
  let pmin = (d.base[0] * (1 + d.localEd / 100) + c.s("min_damage") + basePhys) * mult * scale;
  let pmax = (d.base[1] * (1 + d.localEd / 100) + c.s("max_damage") + basePhys + num(values.bonus_maximum_damage?.[0])) * mult * scale;
  const parts = {};
  const add = (el, a, b) => {
    parts[el] ??= [0, 0];
    parts[el][0] += a;
    parts[el][1] += b;
  };
  // Elemental damage from gear is scaled by the skill's weapon damage too (assumption).
  // Weapon poison (items and e.g. Way of the Spider) is a total over its duration, and
  // Poison Spell Damage doesn't apply to it (see character.js combineWeaponPoison).
  for (const [el, [a, b]] of Object.entries(d.elements)) add(el, a * scale, b * scale);
  const notes = [];
  if (d.weaponPoison)
    notes.push(
      `Poison is weapon poison over ${Math.round(d.weaponPoison.seconds * 100) / 100} seconds, scaled by this attack's ${pct}% weapon damage and not by Poison Spell Damage (inferred: ${d.weaponPoison.source}).`,
    );
  // Conversion: part of the physical hit becomes elemental.
  for (const [key, els] of Object.entries(CONVERSIONS)) {
    const conv = Math.min(100, num(values[key]?.[0]));
    if (!conv) continue;
    const cmin = (pmin * conv) / 100, cmax = (pmax * conv) / 100;
    pmin -= cmin;
    pmax -= cmax;
    if (els.length > 1) notes.push(`${conv}% of physical becomes ${els.join(", ")} (one per hit); shown as ${els[0]}.`);
    add(els[0], cmin, cmax);
  }
  for (const [key, els] of Object.entries(FLAT_BONUS)) {
    const v = num(values[key]?.[0]);
    if (!v) continue;
    if (els[0] === "physical") {
      pmin += v;
      pmax += v;
    } else add(els[0], v, v);
    if (els.length > 1) notes.push(`${v} bonus ${els.join(", ")} damage; shown as ${els[0]}.`);
  }
  // The skill's own damage lines (Hades Gate's "Fire Damage: 702-856"), synergies included,
  // join the hit as the tooltip shows them: not scaled by the weapon damage %, and without
  // spell damage bonuses (whether those apply to an attack's own damage isn't confirmed).
  const own = [];
  for (const [key, v] of Object.entries(values)) {
    // Also the skill's own "bonus cold damage to attack" (Mana Pulse, Twisted Claw), which
    // MedianDB names bonus_<element>_damage_to_weapons. A single value is min and max.
    const toWeapons = /^bonus_(fire|cold|lightning|magic|poison)_damage_to_weapons$/.exec(key);
    if (toWeapons && typeof v?.[0] === "number") {
      const hi = typeof v[1] === "number" ? v[1] : v[0];
      add(toWeapons[1], v[0], hi);
      own.push(`${v[0]}-${hi} ${toWeapons[1]}`);
      continue;
    }
    // Damage as a share of an attribute, when the game's own value for it isn't already here:
    // Maelstrom's "X% of Dexterity gained as extra magic damage", Retaliate's "X% Bonus Fire
    // Damage (of Strength or Dexterity, whichever is higher)". The game's tables match these
    // (Maelstrom: magic = (6 + 4 per level) % of Dexterity).
    const fromAttr = /^percent_(dex|str|ene|vit)_gained_as_extra_(fire|cold|lightning|magic|poison)_damage$/.exec(key)
      || /^bonus_(fire|cold|lightning|magic|poison)_damage_based_on_(str_or_dex)$/.exec(key);
    if (fromAttr && typeof v?.[0] === "number") {
      const [el, attr] = key.startsWith("percent_") ? [fromAttr[2], fromAttr[1]] : [fromAttr[1], fromAttr[2]];
      if (typeof values[`${el}_damage`]?.[0] === "number") continue;
      const A = c.attributes;
      const base = attr === "str_or_dex" ? Math.max(A.strength.total, A.dexterity.total)
        : { dex: A.dexterity, str: A.strength, ene: A.energy, vit: A.vitality }[attr].total;
      const dmg = Math.floor((v[0] * base) / 100);
      if (dmg > 0) { add(el, dmg, dmg); own.push(`${dmg} ${el} (${v[0]}% of ${attr === "str_or_dex" ? "Strength or Dexterity" : { dex: "Dexterity", str: "Strength", ene: "Energy", vit: "Vitality" }[attr]})`); }
      continue;
    }
    if (!TOOLTIP_DAMAGE.test(key) || typeof v?.[0] !== "number" || typeof v?.[1] !== "number") continue;
    const el = key.split("_")[0];
    if (el === "physical") {
      pmin += v[0];
      pmax += v[1];
    } else add(el, v[0], v[1]);
    own.push(`${v[0]}-${v[1]} ${el}`);
  }
  if (own.length)
    notes.push(`Includes the skill's own ${own.join(" and ")} damage as its tooltip shows it (not scaled by weapon damage; spell damage bonuses not added, unconfirmed).`);
  const list = [];
  if (pmax > 0) list.push({ element: "physical", range: pair(pmin, pmax) });
  for (const [el, [a, b]] of Object.entries(parts))
    if (b > 0 && !c.s(`disable_${el}_damage`) && !(c.s('disable_elemental_damage') && ['fire', 'cold', 'lightning'].includes(el))) list.push({ element: el, range: pair(a, b) });
  const total = pair(list.reduce((n, p) => n + p.range[0], 0), list.reduce((n, p) => n + p.range[1], 0));
  const lines = [];
  for (const p of list)
    if (p.element !== "physical") {
      const pierce = c.s(`enemy_${p.element}_resistance`);
      if (pierce) lines.push(`${cap(p.element)}: −${pierce}% enemy resistance`);
    }
  if (describe) {
    const extra = describe.effect.find((l) => /Projectiles|Hits|Targets/i.test(l.text) && l.status !== "unknown");
    if (extra) lines.push(extra.text);
  }
  return {
    id, name, kind: "attack", total, parts: list, lines, notes,
    ...repetition(describe?.effect || [], list),
    // Deadly strike this skill gets on top of yours (Savagery during Whirlwind).
    ...(num(values.deadly_strike?.[0]) ? { deadlyStrike: num(values.deadly_strike[0]) } : {}),
    ar: c.ar.total,
    formula: `Weapon damage × ${pct}% (with ${Math.round(d.statBonus + d.otherPct + wpd)}% physical bonus), then conversions and bonus damage. Per hit, before enemy resistance.`,
  };
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
