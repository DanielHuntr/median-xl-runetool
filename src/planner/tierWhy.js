// Why a starter build sits where it does (rating.js): what it's best at and what holds it back,
// in the rating's own numbers, each compared with the typical (median) starter build. Shown on
// the Builds page cards under the bossing, clearing and survival tiers.

const ORDER = ["S", "A", "B", "C", "D", "F"];
const AREAS = [["bossTier", "bossing"], ["clearTier", "clearing"], ["surviveTier", "survival"]];

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const fmt = (n) => Math.round(n).toLocaleString("en-US");

/** The typical starter build's numbers, from the ratings being compared. */
export function fieldOf(ratings) {
  const rs = ratings.filter((r) => r?.bossTier);
  const m = (f) => median(rs.map(f));
  return {
    life: m((r) => r.life), resist: m((r) => r.resist), hitChance: m((r) => r.hitChance),
    perAction: m((r) => r.perAction), rate: m((r) => r.rate), reach: m((r) => r.clear / r.boss),
    ehp: m((r) => r.ehp), boss: m((r) => r.boss), clear: m((r) => r.clear),
  };
}

// What pulls each area down, weakest first; each only where the build is worse than typical.
function reasons(area, r, f) {
  const out = [];
  if (area === "survival") {
    if (f.life && r.life < f.life * 0.85) out.push([r.life / f.life, `less life than most (${fmt(r.life)})`]);
    if (f.resist != null && r.resist < Math.min(f.resist, 75)) out.push([r.resist / 75, `resistances at ${Math.round(r.resist)}%`]);
    if (f.hitChance != null && r.hitChance > f.hitChance * 1.25) out.push([f.hitChance / r.hitChance, `hit ${Math.round(r.hitChance)}% of the time`]);
    if (!r.avoid && !r.block && out.length) out.push([1, "no block or avoid"]);
    if (!out.length && f.ehp && r.ehp < f.ehp) out.push([r.ehp / f.ehp, `less effective life than most (${fmt(r.ehp)})`]);
  } else {
    if (r.sustain != null && r.sustain < 95) out.push([r.sustain / 100, `mana for ${r.sustain}% of its casting`]);
    if (r.hit != null && r.hit < 85) out.push([r.hit / 100, `lands ${Math.round(r.hit)}% of its hits`]);
    if (f.perAction && r.perAction < f.perAction * 0.75) out.push([r.perAction / f.perAction, "lower damage per hit than most"]);
    if (f.rate && r.rate < f.rate * 0.75) out.push([r.rate / f.rate, `slower than most (${r.rate.toFixed(1)} per second)`]);
    if (area === "clearing" && f.reach && r.clear / r.boss < f.reach * 0.75) out.push([0, "reaches few monsters at once"]);
    const [dps, typical] = area === "bossing" ? [r.boss, f.boss] : [r.clear, f.clear];
    if (!out.length && typical && dps < typical) out.push([dps / typical, `less damage per second than most (${fmt(dps)})`]);
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

/**
 * One line: "Best at clearing (A). Held back by survival (D): less life than most (9,500),
 * resistances at 60%." Null for an unrated build.
 */
export function tierWhy(r, field) {
  if (!r?.bossTier) return null;
  const areas = AREAS.map(([k, name]) => ({ name, tier: r[k], rank: ORDER.indexOf(r[k]) }));
  const best = Math.min(...areas.map((a) => a.rank)), worst = Math.max(...areas.map((a) => a.rank));
  const tops = areas.filter((a) => a.rank === best).map((a) => a.name);
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);
  if (best === worst) {
    const why = worst >= 2 ? reasons("bossing", r, field).concat(reasons("survival", r, field)).slice(0, 2) : [];
    return `Even across bossing, clearing and survival (${ORDER[best]})${why.length ? `: ${why.join(", ")}` : ""}.`;
  }
  const low = areas.filter((a) => a.rank === worst);
  const why = low.flatMap((a) => reasons(a.name, r, field)).filter((t, i, xs) => xs.indexOf(t) === i).slice(0, 2);
  // "Best at" only for a strength (B or better); "held back" only by a real weakness (C or worse).
  const strong = best <= 2 ? `Best at ${list(tops)} (${ORDER[best]}). ` : "";
  const weak = worst >= 3 ? "Held back by" : "Weakest at";
  const text = `${weak} ${list(low.map((a) => a.name))} (${ORDER[worst]})${why.length ? `: ${why.join(", ")}` : ""}.`;
  return strong + text;
}
