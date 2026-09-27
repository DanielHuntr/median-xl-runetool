// What the loot filter editor offers, from the game: src/data/filter-data.json.
//
//   node scripts/extract-filter-data.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// A Median XL loot filter rule targets any item, an item class or one item code:
//   itemclasses.bin (5-byte records): class id (int16 0x00), name string (int16 0x02), shown
//     flag (0x04). Row 0 is unused. These are the 109 classes of the in-game filter and the
//     Filter Exchange ("Tier Sacred" = 19, "Rune" = 28, …).
//   weapons.bin / armor.bin / misc.bin (424-byte records): item code (4 characters at 0x80),
//     name string (0xF4). A filter stores a code as the little-endian 32-bit number of its
//     characters: "r24 " → 540291698.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const X = (n) => readBin(mpq.read(`data/global/excel/${n}`));
const tbl = (n) => readTbl(mpq.read(`data/local/lng/eng/${n}`));
const str = stringIndex({ base: tbl("string.tbl"), patch: tbl("patchstring.tbl"), expansion: tbl("expansionstring.tbl") });
const clean = (s) => s?.replace(/(?:ÿ|Ã¿)c./g, "").replace(/\s+/g, " ").trim() || "";
const unused = (s) => !s || /POLAR BUFFALO|^dummy|^unused/i.test(s);

const ic = X("itemclasses.bin");
if (ic.size !== 5) throw new Error(`itemclasses.bin records are ${ic.size} bytes, expected 5`);
const classes = [];
for (let i = 1; i < ic.count; i++) {
  const r = ic.record(i), name = clean(str(r.readUInt16LE(2)));
  if (!unused(name)) classes.push({ id: r.readUInt16LE(0), name });
}

const items = [], seen = new Set();
for (const [file, group] of [["weapons.bin", "Weapon"], ["armor.bin", "Armor"], ["misc.bin", "Misc"]]) {
  const t = X(file);
  if (t.size !== 424) throw new Error(`${file} records are ${t.size} bytes, expected 424`);
  for (let i = 0; i < t.count; i++) {
    const r = t.record(i), code = r.toString("latin1", 0x80, 0x84), name = clean(str(r.readUInt16LE(0xf4)));
    if (unused(name) || !/^[\x21-\x7e][\x20-\x7e]{3}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    items.push({ code: r.readUInt32LE(0x80), id: code.trimEnd(), name, group });
  }
}
writeFileSync(fileURLToPath(new URL("../src/data/filter-data.json", import.meta.url)), JSON.stringify({
  patch, source: "itemclasses.bin, weapons.bin, armor.bin and misc.bin (medianxl-YmludGJsdHh0.mpq); see scripts/extract-filter-data.mjs",
  classes, items,
}));
console.log(`extract-filter-data: Median XL ${patch}: ${classes.length} item classes, ${items.length} items`);
