// What a levelling guide adds at each stage, for starter builds and your own saved builds:
// where to level (areas whose monsters give full experience, highest monster level first, from
// levels.bin) and the
// runewords that become usable since the last stage for the item types the build wears.
export const DIFFICULTY = { Normal: 0, Nightmare: 1, Hell: 2 };
// The stages of every guide; a saved build's has no endgame stage of its own.
export const STAGES = [[25, "Normal"], [50, "Normal"], [75, "Nightmare"], [100, "Nightmare"], [125, "Hell"]];

/**
 * The share of a kill's experience a character gets from a monster (the docs' Experience page):
 * all of it within 5 levels either way; then 10% less per level apart before character level
 * 100 (3% at 15 apart), 20% less per level from level 100 (3% at 10 apart).
 */
export function experienceShare(level, mlvl) {
  const apart = Math.abs(level - mlvl);
  if (apart <= 5) return 1;
  const [step, floor] = level >= 100 ? [0.2, 10] : [0.1, 15];
  return apart >= floor ? 0.03 : Math.round((1 - step * (apart - 5)) * 100) / 100;
}

/**
 * Areas of this difficulty to level in (one per name): the most experience first, then the
 * highest monster level (more experience per kill at the same share), each with its share.
 */
export function areasNear(areas, level, difficulty, n = 5) {
  const k = DIFFICULTY[difficulty] ?? 2;
  const seen = new Set();
  return areas
    .filter((a) => a.mlvl[k] > 0)
    .map((a) => ({ name: a.name, act: a.act, mlvl: a.mlvl[k], off: Math.abs(a.mlvl[k] - level), xp: experienceShare(level, a.mlvl[k]) }))
    .sort((a, b) => b.xp - a.xp || b.mlvl - a.mlvl || a.act - b.act)
    .filter((a) => !seen.has(a.name) && seen.add(a.name))
    .slice(0, n);
}

/**
 * The item types (base categories) a build wears where runewords go: weapon, off-hand, helm, body.
 * @param gear  build.gear ({ slot: { ref, base? } })
 * @param c  { TUD, SUD, SETD, BASED } catalogues
 */
export function gearCats(gear, c) {
  const byBase = (name) => c.BASED.find((b) => b.name === name)?.cat ?? null;
  const catOf = (st) => {
    if (!st?.ref) return null;
    const [kind, a, b] = st.ref.split(":");
    if (kind === "rw") return st.base ? catOf({ ref: st.base }) : null;
    if (kind === "base") return c.BASED.find((x) => String(x.id) === a)?.cat ?? null;
    if (kind === "tu") return c.TUD.find((x) => String(x.id) === a)?.cat ?? null;
    if (kind === "su") return c.SUD.find((x) => String(x.id) === a)?.cat ?? null;
    if (kind === "set") return byBase(c.SETD.find((x) => String(x.id) === a)?.items[+b]?.base);
    return null;
  };
  return [...new Set(["weapon", "offhand", "helm", "body"].map((s) => catOf(gear?.[s])).filter(Boolean))];
}

/** Runewords for these item types whose level is above `from` and at most `to`, highest first. */
export function runewordsBetween(RW, fits, cats, from, to) {
  if (!cats.length) return [];
  return RW.filter((r) => r.lvl > from && r.lvl <= to && cats.some((cat) => fits(r, cat)))
    .sort((a, b) => b.lvl - a.lvl || a.name.localeCompare(b.name));
}
