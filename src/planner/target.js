// Damage against a chosen monster: its resistances (monstats.bin, per difficulty; see
// scripts/extract-monsters.mjs) less your pierce, deadly strike on attacks, and an attack's
// chance to hit (classic D2 formula, with the game's monster defense). Damage is per hit or
// cast; speed in frames is src/planner/speed.js.

import { repeatedParts } from './damage.js';
export const DIFFICULTY_INDEX = { Normal: 0, Nightmare: 1, Hell: 2 };
const ELEMENTS = ["physical", "magic", "fire", "lightning", "cold", "poison"];

// Different game records can become the same comparison target in one difficulty.
// Keep the underlying records/IDs intact for saved selections and other difficulties.
export function distinctTargets(monsters, difficulty) {
  const k = DIFFICULTY_INDEX[difficulty] ?? 2;
  const seen = new Set();
  return [...monsters].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id).filter(m => {
    if (!(m.levels[k] > 0)) return false;
    const key = JSON.stringify([m.name, m.levels[k], !!m.boss, !!m.demon, !!m.undead, ...ELEMENTS.map(e => m.res[e]?.[k] ?? 0)]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The picker's short list: monsters the game files flag as bosses (monstats.bin), one row
// per name. Where a boss has several records (different encounters or versions), the row is
// the highest-level one in this difficulty and `versions` counts them; searching shows all.
export function mainTargets(monsters, difficulty) {
  const k = DIFFICULTY_INDEX[difficulty] ?? 2;
  const byName = new Map();
  for (const m of distinctTargets(monsters, difficulty)) {
    if (!m.boss) continue;
    const g = byName.get(m.name);
    if (!g) byName.set(m.name, { m, versions: 1 });
    else { g.versions++; if (m.levels[k] > g.m.levels[k]) g.m = m; }
  }
  return [...byName.values()].map(({ m, versions }) => (versions > 1 ? { ...m, versions } : m));
}

// Inferred rules (classic D2, not documented for Median XL):
//  - 100% resistance or more is immunity, which pierce doesn't break;
//  - otherwise pierce lowers the resistance in full, down to -100%;
//  - deadly strike doubles physical damage; its chance (capped at 100%) weights the average.
export const TARGET_RULES = [
  "Resistances are the monster's own for this difficulty (game files).",
  "Inferred (classic D2): 100% or more is immunity, which −enemy resistance doesn't break; otherwise −enemy resistance lowers it in full, down to −100%.",
  "Inferred (classic D2): deadly strike doubles physical damage on attacks, weighted by its chance.",
  "Inferred (classic D2): chance to hit on attacks = 100 × AR / (AR + defense) × 2 × your level / (your level + monster level), between 5% and 95%. Monster defense is the game's (monstats.bin % of monlvl.bin); Median XL doesn't document the formula.",
  "Not included: crushing blow and curses. Speed is under Speed in the stats.",
];

/** Chance to hit with an attack (%, classic D2 formula; 5–95). */
export function hitChance(ar, defense, level, monsterLevel) {
  const p = 100 * (ar / Math.max(1, ar + defense)) * ((2 * level) / Math.max(1, level + monsterLevel));
  return Math.max(5, Math.min(95, Math.floor(p)));
}

/** The resistance that applies, after pierce. */
export function effectiveResist(res, pierce) {
  if (res >= 100) return { value: res, immune: true };
  return { value: Math.max(-100, res - Math.max(0, pierce)), immune: false };
}

/** A made-up but representative target: the median resistances of ordinary (non-boss) monsters. */
export function typicalTarget(monsters, difficulty) {
  const d = DIFFICULTY_INDEX[difficulty] ?? 2;
  const pool = monsters.filter((m) => !m.boss && m.levels[d] > 0);
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const res = Object.fromEntries(ELEMENTS.map((e) => [e, [0, 1, 2].map((k) => (k === d ? median(pool.map((m) => m.res[e][d])) : 0))]));
  const third = (f) => [0, 1, 2].map((k) => (k === d ? median(pool.map(f)) : 0));
  // Its first attack's to-hit and average damage per hit (extract-monsters.mjs), for how much
  // of a hit gets through a character's defense and damage reduction (rating.js).
  const withHit = pool.some((m) => m.toHit) ? { toHit: third((m) => m.toHit?.[d] ?? 0), hit: third((m) => (m.damage?.[d] ? (m.damage[d][0] + m.damage[d][1]) / 2 : 0)) } : {};
  return { id: "typical", name: `Typical ${difficulty} monster`, typical: true, count: pool.length, levels: third((m) => m.levels[d]), res, ...(pool.some((m) => m.def) ? { def: third((m) => m.def?.[d] ?? 0) } : {}), ...withHit };
}

/**
 * @param d  a skillDamage result (parts are for one hit or cast; `all` covers several)
 * @param c  the character (for pierce, deadly strike and attack rating)
 * @param level  the character's level (chance to hit)
 * @returns {{ parts, total, all?, immune: string[], target, difficulty, hit? }} or null without damage
 */
export function againstTarget(d, c, target, difficulty, level = 0) {
  if (!d?.parts?.length || !target) return null;
  const k = DIFFICULTY_INDEX[difficulty] ?? 2;
  const ds = d.kind === "attack" ? Math.min(100, Math.max(0, c.s("deadly_strike") + (d.deadlyStrike || 0))) / 100 : 0;
  const parts = d.parts.map((p) => {
    const base = target.res[p.element]?.[k] ?? 0;
    // A trap's own pierce replaces the character's (damage.js).
    const pierce = p.element === "physical" ? 0 : d.pierce?.[p.element] ?? c.s(`enemy_${p.element}_resistance`);
    const r = effectiveResist(base, pierce);
    const crit = p.element === "physical" ? 1 + ds : 1;
    const mult = r.immune ? 0 : (1 - r.value / 100) * crit;
    // The small epsilon keeps 100 × 0.7 × 1.5 at 105 (floating point gives 104.999…).
    const down = (x) => Math.floor(x * mult + 1e-9);
    return { element: p.element, range: [down(p.range[0]), down(p.range[1])], resist: base, pierce, effective: r.value, immune: r.immune };
  });
  const total = [parts.reduce((n, p) => n + p.range[0], 0), parts.reduce((n, p) => n + p.range[1], 0)];
  const allParts = d.count ? repeatedParts(parts, d.count) : null;
  // Attacks can miss; spells and traps always hit.
  const hit = d.kind === "attack" && target.def && level > 0 ? hitChance(d.ar ?? c.ar?.total ?? 0, target.def[k] ?? 0, level, target.levels[k] || 1) : null;
  return {
    parts, total, target, difficulty,
    ...(hit !== null ? { hit } : {}),
    ...(allParts ? { allParts, all: [0, 1].map(i => allParts.reduce((n, p) => n + p.range[i], 0)) } : {}),
    immune: parts.filter((p) => p.immune).map((p) => p.element),
  };
}
