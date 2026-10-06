// Where the catalogue (copied from docs.median-xl.com) disagrees with the game files on a value,
// the game's value: src/data/catalogue-fixes.json, applied as the catalogue loads (src/data/index.js).
//   node scripts/extract-catalogue-fixes.mjs [game dir]   (after extract-cube; see catalogue-audit.mjs)
//
// Only a docs line whose wording matches a game line with other numbers is replaced (Darkfeast's
// "+(50 to 200) Spell Focus" is "+(100 to 200)" in the game; Blackheart's per-level life
// regeneration rounded up to 1 is 0.0875). Left alone, and listed by scripts/dev/audit-catalogue.mjs:
//   - an elemental base's own damage, which the docs add to the item's "Adds … Fire Damage";
//   - runewords, where the docs add their runes' bonuses in, but not always;
//   - lines worded differently, which are mostly the same stat written another way.
import { writeFileSync } from "node:fs";
import { auditCatalogue, wording } from "./lib/catalogue-audit.mjs";

const a = auditCatalogue(process.argv[2]);
const fixes = { uniques: {}, sacred: {}, sets: {} };
let count = 0;
const ELEMENTAL_ADDS = /^Adds .+ (Fire|Cold|Lightning|Magic) Damage$|^\+[\d(].* (Fire|Cold|Lightning|Magic) Damage$/i;
for (const item of a.items) {
  if (item.missing || !(item.kind in fixes)) continue;
  const left = [...item.onlyGame], pairs = [];
  for (const d of item.onlyDocs) {
    const i = left.findIndex((g) => wording(g) === wording(d));
    if (i < 0 || ELEMENTAL_ADDS.test(d)) continue;
    pairs.push([d, left[i]]);
    left.splice(i, 1);
  }
  if (!pairs.length) continue;
  count += pairs.length;
  if (item.kind === "uniques") ((fixes.uniques[item.name] ||= {})[item.tier] = pairs);
  else if (item.kind === "sets") fixes.sets[`${item.name}|${item.set}`] = pairs;
  else fixes.sacred[item.name] = pairs;
}
writeFileSync(new URL("../src/data/catalogue-fixes.json", import.meta.url), JSON.stringify({ patch: a.patch, source: "uniqueitems.bin, setitems.bin (scripts/lib/catalogue-audit.mjs)", fixes }, null, 1) + "\n");
console.log(`extract-catalogue-fixes: ${count} lines on ${Object.keys(fixes.uniques).length} tiered uniques, ${Object.keys(fixes.sacred).length} sacred uniques and ${Object.keys(fixes.sets).length} set items take the game's value`);
