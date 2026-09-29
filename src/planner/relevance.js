// Whether an item's line can do anything for a build: its damage skills' elements, whether it
// casts, attacks or summons. Used by the build audit (scripts/audit-builds.mjs) to explain
// lines that do nothing, and by the starter-build generator (scripts/lib/refine.mjs) to
// prefer items whose stats the build uses over ones mostly bought for nothing.
// Resistance reduction counts for an element the build deals even against 0% resistance: it
// takes the resistance below zero (to -100%), as in the game.

const ELEMENTS = ["fire", "cold", "lightning", "poison", "magic", "physical"];

/** What a build's damage skills deal and how: { elements: Set, spell, attack, summon }. */
export function buildUse(b, env) {
  const { engine, computeCharacter, skillDamage } = env;
  const c = computeCharacter(b, env);
  const sb = { ...b, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats };
  const out = { elements: new Set(), spell: false, attack: false, summon: false };
  for (const id of new Set([b.leftSkill, b.rightSkill, ...(b.skillBar || [])])) {
    if (!id) continue;
    const d = skillDamage(id, { engine, build: b, skillBuild: sb, character: c });
    if (!d) continue;
    if (d.kind === "summon") out.summon = true;
    if (!(d.total?.[1] > 0)) continue;
    if (d.kind === "spell") out.spell = true;
    if (d.kind === "attack") out.attack = true;
    for (const p of d.parts || []) out.elements.add(p.element);
  }
  return out;
}

/**
 * One stat key: relevant to the build (null), of a kind it can't use (the reason), or not one
 * this can place (undefined).
 */
export function keyReason(k, use) {
  // Flat damage added to attacks ("+60 Fire Damage", "Adds 20-38 Magic Damage"), weapon damage
  // and attack-only stats.
  if (/^(fire|cold|lightning|magic|physical|poison)_damage$|^bonus_(\w+_)?damage$|^bonus_maximum_damage$|^weapon_(physical_)?damage$|^(enhanced_damage|attack_rating|deadly_strike|crushing_blow|life_steal|life_leech|mana_steal)/.test(k))
    return use.attack ? null : "attack stat, no attacks";
  if (/summon|minion/.test(k)) return use.summon ? null : "summon stat, no summons";
  if (/(^|_)resistance$|resist$|absorb/.test(k) && !/^enemy_/.test(k)) return null; // your own resistances
  const els = k === "physical_magic_spell_damage" ? ["physical", "magic"] : ELEMENTS.filter((e) => new RegExp(`(^|_)${e}(_|$)`).test(k));
  if (/spell_damage|spell_focus/.test(k) && !use.spell) return "spell stat, no damage spells";
  if (/spell_damage|^enemy_.*resistance|pierce/.test(k) && els.length) return els.some((e) => use.elements.has(e)) ? null : `wrong damage type (${els.join("/")})`;
  if (/spell_damage/.test(k)) return null; // all spell damage
  if (k === "attack_speed") return use.attack ? null : "attack stat, no attacks";
  if (k === "cast_speed") return use.spell ? null : "cast speed, no spells";
  return undefined;
}

/** Why a parsed line can't help this build, or null if it can (or can't be told). */
export function lineWaste(p, use) {
  const keys = p?.kind === "stats" ? p.effects.map(([k]) => k) : [];
  const reasons = keys.map((k) => keyReason(k, use));
  if (!keys.length || reasons.some((r) => r === null)) return null;
  const wrong = reasons.filter((r) => typeof r === "string");
  return wrong.length && wrong.length === reasons.filter((r) => r !== undefined).length ? wrong[0] : null;
}

/** How many of a resolved item's own lines can't help this build. */
export const wastedLines = (r, use) => (r?.parsed || []).filter((p) => lineWaste(p, use)).length;

/** A line that adds to the build's own damage type: its element's spell damage or reduction. */
export function servesDamage(p, use) {
  const keys = p?.kind === "stats" ? p.effects.map(([k]) => k) : [];
  return keys.some((k) => /spell_damage|^enemy_.*resistance|pierce/.test(k) && keyReason(k, use) === null);
}

/**
 * An item worn mostly for nothing: more than half its stat lines can't help the build, and
 * none adds to its damage type. An all-element item on a one-element build (The Tesseract's
 * +30% to each element's spell damage on a fire caster) isn't: its fire lines are why it's worn.
 */
export function mostlyWasted(r, use) {
  const lines = (r?.parsed || []).filter((p) => p.kind === "stats");
  const wasted = lines.filter((p) => lineWaste(p, use)).length;
  return lines.length >= 2 && wasted * 2 > lines.length && !lines.some((p) => servesDamage(p, use));
}
