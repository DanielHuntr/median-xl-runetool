// How easy an item is to get at a levelling stage, in Arcane Crystals, from the game's own
// Cube recipes (cube-recipes.js) and item levels:
//   - an item drops only from monsters at or above its item level (the Diablo II rule Median XL
//     runs on; each tier of a tiered unique has its own item level);
//   - "Tiered unique": a base + Oil of Enhancement + 2 Arcane Crystals makes it, so a unique
//     that drops here costs about 2 crystals to have for sure;
//   - "Next tier": + 1 Arcane Crystal per tier above the one that drops here;
//   - a runeword whose runes drop here is made, not found: nothing; runes above what drops
//     here cost more the further out of reach the highest one is;
//   - a set piece has no recipe: only luck, counted as 2 crystals, and more before it drops.
// A crystal is 5 Arcane Shards, from disenchanting uniques (Catalyst of Disenchantment, from
// Andariel on Normal).
// The generator (scripts/lib/refine.mjs) counts this against items while levelling, most at
// low levels; the alternatives list says it in words.

const DIFFICULTY_LEVELS = { Normal: [1, 70], Nightmare: [51, 105], Hell: [100, 150] };

/** The monster level a character of this level meets on this difficulty. */
export function dropLevel(level, difficulty = "Hell") {
  const [lo, hi] = DIFFICULTY_LEVELS[difficulty] || DIFFICULTY_LEVELS.Hell;
  return Math.max(lo, Math.min(hi, level));
}

const itemLevelOf = (lines) => Number((lines || []).map((l) => /^Item Level: (\d+)/.exec(l)?.[1]).find(Boolean) || 0);

/** The level of each standard rune, by name (socketables: [name, kindLabel, level, …]). */
export function runeLevels(catalog) {
  return new Map(catalog.all().filter((d) => d.kind === "socketable" && /runes/i.test(d.kindLabel || "")).map((d) => [d.name, d.lvl || 0]));
}

/**
 * { crystals, note } for an item state at a stage: roughly how many Arcane Crystals it's worth
 * to have it, and why. Base items and anything else: 0.
 */
export function easeOf(st, { catalog, level, difficulty, runes }) {
  const d = catalog.get(st?.ref);
  if (!d) return { crystals: 0, note: "" };
  const drops = dropLevel(level, difficulty);
  if (d.kind === "runeword") {
    const need = Math.max(0, ...(d.runes || []).map((r) => runes.get(r) ?? 0));
    const top = (d.runes || []).reduce((a, r) => ((runes.get(r) ?? 0) > (runes.get(a) ?? 0) ? r : a), d.runes?.[0]);
    if (need <= drops) return { crystals: 0, note: "Makeable: its runes drop by now" };
    return { crystals: Math.round((need - drops) / 10 * 10) / 10, note: `Needs ${top} (drops from level ${need})` };
  }
  if (d.kind === "unique") {
    const tiers = (d.variants || []).map((v) => itemLevelOf(v.lines));
    const worn = Math.min(st.variant ?? tiers.length - 1, tiers.length - 1);
    let dropsAt = -1;
    tiers.forEach((ilvl, i) => { if (ilvl <= drops) dropsAt = i; });
    const up = Math.max(0, worn - Math.max(0, dropsAt));
    const tier = tiers.length > 1 ? ` (tier ${worn + 1})` : "";
    return { crystals: 2 + up, note: up ? `2 crystals to make, +${up} to reach tier ${worn + 1}` : `Found, or 2 crystals to make${tier}` };
  }
  if (d.kind === "set") {
    const ilvl = itemLevelOf(d.variants?.[0]?.lines || d.lines);
    return ilvl > drops ? { crystals: 5, note: `Set piece: drops only, from level ${ilvl}` } : { crystals: 2, note: "Set piece: drops only" };
  }
  if (d.kind === "sacred") return { crystals: 6, note: "Sacred unique: Hell drops only" };
  return { crystals: 0, note: "" };
}

/** How much a crystal counts at a character level, in the generator's measure (~0.6 per 1%
 * more damage): 1.5 (2.5%) while levelling to 50, less later, nothing at the endgame. */
export const crystalWeight = (level) => (level <= 50 ? 1.5 : level <= 75 ? 1.2 : level <= 100 ? 0.9 : level <= 125 ? 0.6 : 0);
