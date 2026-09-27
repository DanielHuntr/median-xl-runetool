// Which base categories each runeword can be made in, as the game decides it.
//
//   node scripts/extract-runeword-bases.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// The game allows a runeword in an item whose type, or any type it inherits from, is one of
// the runeword's item types, and none of its excluded types. Class items inherit from generic
// ones (a Paladin shield, "ashd", is a "shld"), so "Shields" runewords also go in class
// shields. The docs' base lists don't say that for armour, hence this table.
//
// Sources (medianxl-YmludGJsdHh0.mpq, D2 1.13c layouts; offsets from D2MOO):
//   runes.bin     name key 0x00 (a string-table key), complete 0x80, item types 0x86 (×6),
//                 excluded types 0x92 (×3)
//   itemtypes.bin code 0x00, parent types 0x04 and 0x06
//   weapons.bin / armor.bin (424-byte records) name string 0xF4, item types 0x11E (×2)
// Base categories are the app's (src/data/base-items.json), matched to game items by name.
// Output: src/data/runeword-bases.json { patch, runewords: { name: [category, …] } }.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const X = (n) => mpq.read(`data/global/excel/${n}`);
const tbls = ["string.tbl", "patchstring.tbl", "expansionstring.tbl"].map((n) => readTbl(mpq.read(`data/local/lng/eng/${n}`)));
const str = stringIndex({ base: tbls[0], patch: tbls[1], expansion: tbls[2] });
const byKey = (k) => { for (const t of [...tbls].reverse()) if (t.byKey.has(k)) return t.byKey.get(k); return null; };
const clean = (s) => s?.replace(/(?:ÿ|Ã¿)c./g, "").split("\n")[0].trim() ?? null;

const types = readBin(X("itemtypes.bin"));
const typeCode = (i) => (i > 0 && i < types.count ? types.record(i).toString("latin1", 0, 4).replace(/\0.*$/, "").trim() : null);
const parents = (i) => [types.record(i).readInt16LE(4), types.record(i).readInt16LE(6)].filter((p) => p > 0 && p < types.count);
// A type and everything it inherits from.
const lineage = (i, out = new Set([i])) => { for (const p of parents(i)) if (!out.has(p)) { out.add(p); lineage(p, out); } return out; };

// Game items by name → their types (tiers of a base share a name).
const typesByName = new Map();
for (const file of ["weapons.bin", "armor.bin"]) {
  const t = readBin(X(file));
  if (t.size !== 424) throw new Error(`${file} records are ${t.size} bytes, expected 424 (D2 1.13c)`);
  for (let i = 0; i < t.count; i++) {
    // Tiers are separate items named "Bastard Sword (3)", "… (Sacred)".
    const r = t.record(i), name = clean(str(r.readUInt16LE(0xf4)))?.replace(/\s*\((?:\d+|Sacred)\)$/, "");
    if (!name) continue;
    const set = typesByName.get(name) ?? typesByName.set(name, new Set()).get(name);
    for (const k of [0, 1]) { const v = r.readInt16LE(0x11e + k * 2); if (v > 0 && v < types.count) set.add(v); }
  }
}

// The app's base categories and the full type lineage of the bases in each.
const bases = JSON.parse(readFileSync(new URL("../src/data/base-items.json", import.meta.url), "utf8"));
const catLineage = new Map();
const unmatched = [];
for (const [name, cat] of bases) {
  const ts = typesByName.get(name);
  if (!ts?.size) { unmatched.push(name); continue; }
  const set = catLineage.get(cat) ?? catLineage.set(cat, new Set()).get(cat);
  for (const t of ts) for (const a of lineage(t)) set.add(a);
}

const runes = readBin(X("runes.bin"));
const out = {};
for (let i = 0; i < runes.count; i++) {
  const r = runes.record(i);
  if (!r[0x80]) continue; // incomplete (disabled) runewords
  const name = clean(byKey(r.toString("latin1", 0, 64).replace(/\0.*$/, "")));
  if (!name) continue;
  const allowed = [0, 1, 2, 3, 4, 5].map((k) => r.readUInt16LE(0x86 + k * 2)).filter((v) => v > 0 && v < types.count);
  const excluded = [0, 1, 2].map((k) => r.readUInt16LE(0x92 + k * 2)).filter((v) => v > 0 && v < types.count);
  const cats = [...catLineage].filter(([, lin]) => allowed.some((t) => lin.has(t)) && !excluded.some((t) => lin.has(t))).map(([c]) => c).sort();
  out[name] = cats;
}
const file = fileURLToPath(new URL("../src/data/runeword-bases.json", import.meta.url));
writeFileSync(file, JSON.stringify({
  patch,
  source: "runes.bin, itemtypes.bin, weapons.bin and armor.bin (medianxl-YmludGJsdHh0.mpq); see scripts/extract-runeword-bases.mjs",
  runewords: out,
}));
console.log(`extract-runeword-bases: Median XL ${patch}, ${Object.keys(out).length} runewords, ${catLineage.size} base categories${unmatched.length ? `; base items not found in the game files: ${unmatched.join(", ")}` : ""}`);
