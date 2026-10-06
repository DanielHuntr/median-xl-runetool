// Where the catalogue (copied from docs.median-xl.com) disagrees with the game files, the game's
// text: src/data/catalogue-fixes.json, applied as the catalogue loads (src/data/index.js).
//   node scripts/extract-catalogue-fixes.mjs [game dir]   (after extract-cube; see catalogue-audit.mjs)
//
// scripts/lib/catalogue-audit.mjs pairs every item's docs lines with the game's, setting aside
// what isn't a disagreement (base lines, an elemental base's added damage, lines split or grouped
// differently, the same text in other notation). What it can't pair is a real difference, and
// the game's text replaces the docs': a docs line with the wording of a game line and other
// numbers takes the game's (Blackheart's per-level life regeneration rounded up to 1 is 0.0875;
// Darkfeast's older ranges), a docs line the game doesn't have goes, and a game line the docs
// miss is added (Compass of Souls, tier 3). Each item's fix: [docs line or null, game line or null].
import { readFileSync, writeFileSync } from "node:fs";
import { auditCatalogue, wording } from "./lib/catalogue-audit.mjs";
import { parseLine } from "../src/planner/statparse.js";

const a = auditCatalogue(process.argv[2]);
const fixes = { uniques: {}, sacred: {}, sets: {}, runewords: {}, inventory: {} };
// Relics and charms (MedianDB): only lines the planner reads as stats, skills or procs; the game's
// quest and crafting notes ("Transmute with a Thal rune…") and MedianDB's ("Add Cycles…") aren't
// stats, and a charm's cube-rolled range (Umbaru Treasure's "+(-48 to 80) to Strength") isn't on
// the dropped item but is what cubing can give it, so it stays.
const planner = JSON.parse(readFileSync(new URL("../public/planner/data.json", import.meta.url), "utf8"));
const skillByName = new Map(Object.entries(planner.skillNames).map(([id, n]) => [n.toLowerCase(), id]));
const isStat = (l) => ["stats", "skill", "oskill", "proc"].includes(parseLine(l.replace(/\((-?[\d.]+) to (-?[\d.]+)\)/g, "$2"), { level: 120, skillByName }).kind);
const byName = new Map(Object.values(planner.inventory).map((c) => [c.name, c]));
let lines = 0, items = 0;
for (const item of a.items) {
  if (item.missing || !(item.kind in fixes)) continue;
  const left = [...item.onlyGame], pairs = [];
  for (const d of item.onlyDocs) {
    const i = left.findIndex((g) => wording(g) === wording(d));
    if (i >= 0) { pairs.push([d, left[i]]); left.splice(i, 1); } else pairs.push([d, null]);
  }
  for (const g of left) pairs.push([null, g]);
  if (item.kind === "inventory") {
    const kept = pairs.filter(([d, g]) => (g && isStat(g)) && (d === null || isStat(d)));
    if (!kept.length) continue;
    lines += kept.length; items++;
    fixes.inventory[byName.get(item.name)?.id ?? item.name] = kept;
    continue;
  }
  if (!pairs.length) continue;
  lines += pairs.length; items++;
  if (item.kind === "uniques") ((fixes.uniques[item.name] ||= {})[item.tier] = pairs);
  else if (item.kind === "sets") fixes.sets[`${item.name}|${item.set}`] = pairs;
  else if (item.kind === "runewords") fixes.runewords[`${item.name}|${item.runes}`] = pairs;
  else fixes.sacred[item.name] = pairs;
}
writeFileSync(new URL("../src/data/catalogue-fixes.json", import.meta.url), JSON.stringify({ patch: a.patch, source: "uniqueitems.bin, setitems.bin, runes.bin, gems.bin (scripts/lib/catalogue-audit.mjs)", fixes }, null, 1) + "\n");
console.log(`extract-catalogue-fixes: ${lines} lines on ${items} items take the game's text`);
