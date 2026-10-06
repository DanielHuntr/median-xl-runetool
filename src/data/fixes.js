// Where the docs' (or MedianDB's) text disagrees with the game files, the game's text
// (scripts/extract-catalogue-fixes.mjs, src/data/catalogue-fixes.json): per item,
// [docs line, game line] pairs; a docs line the game doesn't have is paired with null (dropped)
// and a game line the docs miss has null before it (added). Applied to the bundled catalogue, a
// live one and the planner's relics and charms alike.
import CATALOGUE_FIXES from "./catalogue-fixes.json" with { type: "json" };

export const FIX = CATALOGUE_FIXES.fixes;

/** An item's lines with its fixes applied. */
export function fixList(lines, pairs) {
  if (!pairs) return lines;
  const out = [];
  for (const l of lines) {
    const p = pairs.find(([from]) => from === l);
    if (!p) out.push(l);
    else if (p[1] !== null) out.push(p[1]);
  }
  for (const [from, to] of pairs) if (from === null && to !== null && !out.includes(to)) out.push(to);
  return out;
}

/** The same for the catalogue's "|"-joined text. */
export const fixLines = (str, pairs) => (pairs ? fixList(str.split("|"), pairs).join("|") : str);
