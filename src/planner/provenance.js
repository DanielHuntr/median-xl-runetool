// Labels for where a calculated value comes from (engine TRUST order, least trusted
// first), shown in the skill panel's "How this is calculated" details.
export const TRUST_LABELS = {
  verified: { short: "Verified", long: "Reproduces an in-game tooltip exactly" },
  game: { short: "Game files", long: "Calculated from the installed game's own formula" },
  "matches-game": { short: "Checked", long: "Community formula, which gives the same results as the game's" },
  "game-inferred": { short: "Inferred", long: "Game formula, but part of how it's read or shown is inferred" },
  community: { short: "Community", long: "Community (MedianDB) formula, not checked against the game" },
  missing: { short: "Missing", long: "No formula available in either source" },
};
// Values below these are kept out of "confirmed" totals.
export const CONFIRMED = new Set(["verified", "game", "matches-game"]);
export const isConfirmed = (trust) => !trust || CONFIRMED.has(trust);
