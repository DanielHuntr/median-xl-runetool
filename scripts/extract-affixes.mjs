// The magic and rare affixes the game rolls, for the planner's affix picker on rare, crafted and
// magic items: src/data/affixes.json.
//   node scripts/extract-affixes.mjs [game dir]   (default: $MXL_DIR or C:/games/median-xl)
//
// magicprefix.bin / magicsuffix.bin (144-byte rows, D2 1.13c D2MagicAffixTxt): name 0x00, three
// properties from 0x24 (code, parameter, min, max: i32 each), spawnable u16 0x54, level u32 0x58
// (the item level it needs), group u32 0x5C, maximum level u32 0x60 (0: none), rare u8 0x64 (may
// roll on rare and crafted items), required level u8 0x65, item types 7 × u16 from 0x6A,
// excluded types 5 × u16 from 0x78. Only spawnable affixes are kept. Lines are written as the
// game writes them (scripts/lib/item-text.mjs: every property and stat, skills named).
// It also writes every skill's name (src/data/skill-names.json), which the Oskills & Procs page
// checks item lines against.
// Each base item's types per tier (its game item and that item's parent types, from
// src/data/cube-main.json; run scripts/extract-cube.mjs first) say which affixes fit it.
import { readFileSync, writeFileSync } from "node:fs";
import { gameText } from "./lib/item-text.mjs";

const g = gameText(process.argv[2]);
const read = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8"));
const cube = read("cube-main.json"), baseItems = read("base-items.json"), mastercrafted = read("mastercrafted.json");

const itemtypes = g.X("itemtypes.bin", 228);
const typeCode = (i) => itemtypes.record(i).toString("latin1", 0, 4).replace(/\0/g, "").trim();

const affixes = [];
let skipped = 0;
for (const [file, kind] of [["magicprefix.bin", "p"], ["magicsuffix.bin", "s"]]) {
  const t = g.X(file, 144);
  for (let i = 0; i < t.count; i++) {
    const r = t.record(i);
    if (r.readUInt16LE(0x54) !== 1) continue;
    const shown = g.rowText(r, 0x24, 3).filter((l) => l && !/^(Prefixes|Suffixes): \d+$/.test(l));
    if (!shown.length) { skipped++; continue; }
    const types = (o, n) => Array.from({ length: n }, (_, k) => r.readUInt16LE(o + 2 * k)).filter(Boolean).map(typeCode);
    affixes.push({
      id: `${kind}${i}`, kind, group: r.readUInt16LE(0x5C), level: r.readUInt32LE(0x58), ...(r.readUInt32LE(0x60) ? { max: r.readUInt32LE(0x60) } : {}), req: r[0x65],
      ...(r[0x64] ? { rare: 1 } : {}), types: types(0x6A, 7), ...(types(0x78, 5).length ? { not: types(0x78, 5) } : {}), lines: shown,
    });
  }
}

// Item types of every base tier, by the planner's names ("Hand Axe" → "Tier 1": "Hand Axe (1)").
const byName = new Map(cube.items.map((x) => [x[1], x[2]]));
const TIER = { "Tier 1": "(1)", "Tier 2": "(2)", "Tier 3": "(3)", "Tier 4": "(4)", Sacred: "(Sacred)" };
const bases = {};
for (const [name, , tiers] of baseItems)
  bases[name] = Object.fromEntries(tiers.map(([label]) => [label, byName.get(`${name} ${TIER[label]}`) || byName.get(name) || []]));
for (const b of mastercrafted.bases) bases[b.name] = { Mastercrafted: byName.get(b.name) || [] };
const missing = Object.entries(bases).filter(([, t]) => Object.values(t).some((x) => !x.length)).map(([n]) => n);
if (missing.length) throw new Error(`No game item for: ${missing.join(", ")}`);
// Jewellery has no base items: a custom ring, amulet or jewel uses the plain game item's types.
const jewellery = { ring: byName.get("Ring"), amulet: byName.get("Amulet"), jewel: byName.get("Jewel") };

// Every skill's name.
const skills = g.X("skills.bin"), names = new Set();
for (let id = 0; id < skills.count; id++) { const n = g.skillName(id); if (n) names.add(n); }

writeFileSync(new URL("../src/data/affixes.json", import.meta.url), JSON.stringify({ patch: g.patch, source: "magicprefix.bin, magicsuffix.bin, itemtypes.bin (item types via cube-main.json)", bases, jewellery, affixes }) + "\n");
writeFileSync(new URL("../src/data/skill-names.json", import.meta.url), JSON.stringify({ patch: g.patch, source: "skills.bin 0x194 → skilldesc.bin 0x08 → string tables", names: [...names].sort() }) + "\n");
console.log(`extract-affixes: ${affixes.filter((a) => a.kind === "p").length} prefixes, ${affixes.filter((a) => a.kind === "s").length} suffixes (${affixes.filter((a) => a.rare).length} can roll on rares); ${skipped} with no visible line left out`);
