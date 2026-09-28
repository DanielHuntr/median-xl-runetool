// Attack and cast speed in frames, and the breakpoints: the formulas of the official Median
// XL speed calculator (dev.median-xl.com/speedcalc), with the animation frames and weapon
// classes and speeds read from the game (scripts/extract-speed.mjs → src/data/speed.json).
//
//   effective speed  = floor(120 × speed / (120 + speed)), capped at 75 (after the weapon)
//   cast frames      = ceil(256 × frames / floor(animSpeed × (100 + effective) / 100)) − 1
//   attack frames    = ceil(256 × (frames − start) / floor(animSpeed × (100 + effective − WSM) / 100)) − 1
// "start" is 2 for Amazons and Sorceresses swinging or thrusting a one-handed, two-handed
// sword or staff-class weapon, else 0. The game runs at 25 frames a second.
// Not covered: wereforms, throwing, dual wielding, and skill speed that skips the curve.

const MODE = { "1hs": "1HS", "1ht": "1HT", "2hs": "2HS", "2ht": "2HT", stf: "STF", bow: "BOW", xbw: "XBW", ht1: "HT1" };
const STARTS_LATE = new Set(["1HS", "1HT", "2HS", "STF"]);
export const FPS = 25;
// The calculators stop looking at this much speed.
const SEARCH = 300;

const effective = (speed) => (speed >= 0 ? Math.floor((120 * speed) / (120 + speed)) : Math.max(-95, speed));
const frames = (fpd, animSpeed, pct) => Math.ceil((256 * fpd) / Math.floor((animSpeed * (100 + pct)) / 100)) - 1;

export const castFrames = (fpd, animSpeed, fcr) => frames(fpd, animSpeed, Math.min(effective(fcr), 75));
export const attackFrames = (fpd, animSpeed, ias, wsm = 0, start = 0) => frames(fpd - start, animSpeed, Math.min(effective(ias) - wsm, 75));

/** Every speed where frames drop, from 0 up: [{ speed, frames }]. */
export function breakpoints(fn) {
  const out = [];
  let last = Infinity;
  for (let s = 0; s <= SEARCH; s++) {
    const f = fn(s);
    if (f < last) out.push({ speed: s, frames: f });
    last = f;
  }
  return out;
}

/**
 * A character's attack and cast speed with the weapon they hold.
 * @param data  src/data/speed.json
 * @param weaponBase  the weapon's base name ("Hand Axe"), or null bare-handed
 * @returns { attack, cast } each { frames, perSecond, speed, table: [{speed, frames}], next: {speed, frames} | null }
 *   or null for one the game has no animation for; `weapon` says what was assumed.
 */
export function speedProfile(data, cls, weaponBase, { ias = 0, fcr = 0 } = {}) {
  const anims = data?.anims?.[cls];
  if (!anims) return null;
  const w = weaponBase ? data.weapons[weaponBase] : null;
  const mode = w ? MODE[w[0]] : "HTH";
  const wsm = w ? w[1] : 0;
  const start = STARTS_LATE.has(mode) && (cls === "Amazon" || cls === "Sorceress") ? 2 : 0;
  const one = (anim, fn, speed) => {
    if (!anim) return null;
    const table = breakpoints((s) => fn(anim, s));
    const now = fn(anim, speed);
    const next = table.find((b) => b.frames < now && b.speed > speed) || null;
    return { frames: now, perSecond: FPS / now, speed, table, next };
  };
  return {
    weapon: { base: w ? weaponBase : null, known: !weaponBase || !!w, wclass: w?.[0] ?? null, wsm },
    attack: one(anims["A1" + mode], ([fpd, as], s) => attackFrames(fpd, as, s, wsm, start), ias),
    cast: one(anims["SC" + mode], ([fpd, as], s) => castFrames(fpd, as, s), fcr),
  };
}
