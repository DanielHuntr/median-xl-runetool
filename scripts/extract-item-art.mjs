// Renders inventory art for uniques, sacred uniques, set items and base items from an
// installed Median XL, as the game draws it: the item's DC6 graphic, drawn with the
// unit palette and recoloured by the item's colour transform.
//
//   node scripts/extract-item-art.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Sources (D2 1.13c formats; Median XL archives first, then patch_d2, d2exp, d2data):
//  - uniqueitems.bin (332-byte rows): name key 0x02, item code 0x28, InvTransform colour
//    0x39 (255 = none), own InvFile 0x5A.
//  - setitems.bin (440-byte rows): name key 0x02, item code 0x28, InvTransform 0x41, InvFile 0x62.
//  - weapons/armor/misc.bin (424-byte rows): invfile 0x20, uniqueinvfile 0x40, setinvfile
//    0x60, code 0x80, name string 0xF4, InvTrans (which colour-map file) 0x142.
//  - data/global/items/<invfile>.dc6, data/global/palette/units/pal.dat and the colour
//    maps data/global/items/palette/<file>.dat (21 maps × 256 entries).
// Output: data/game/<patch>/item-art/*.png (packed into sprite sheets by
// scripts/build-item-atlas.mjs) and data/game/<patch>/item-art.json.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "./lib/d2tables.mjs";
import { readDc6, toRgba, png } from "./lib/dc6.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const BS = String.fromCharCode(92); // MPQ paths use backslashes
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");

const modArchives = readdirSync(dir).filter((n) => /^medianxl-.*\.mpq$/i.test(n) && n !== "medianxl-version.mpq").sort();
const archives = [...modArchives, "patch_d2.mpq", "d2exp.mpq", "d2data.mpq"].filter((n) => existsSync(join(dir, n))).map((n) => [n, openMpq(join(dir, n))]);
const used = new Set();
function read(path) {
  const p = path.split("/").join(BS);
  for (const [n, m] of archives)
    if (m.has(p)) {
      used.add(n);
      return m.read(p);
    }
  return null;
}
const table = (n) => {
  const b = read(`data/global/excel/${n}`);
  if (!b) throw new Error(`${n} missing`);
  return readBin(b);
};
const tbl = (n) => readTbl(read(`data/local/lng/eng/${n}`));
const strings = { base: tbl("string.tbl"), patch: tbl("patchstring.tbl"), expansion: tbl("expansionstring.tbl") };
const byIndex = stringIndex(strings);
const byKey = (k) => strings.patch.byKey.get(k) ?? strings.expansion.byKey.get(k) ?? strings.base.byKey.get(k) ?? k;
const clean = (s) => s?.replace(/(?:ÿ|Ã¿)c./g, "").split("\n").pop().trim() || null;
const cstr = (r, o, n = 32) => r.toString("latin1", o, o + n).replace(/\0.*$/, "");

// Colour-map files by InvTrans value (D2 order; Median XL uses 2 and 8 for inventory art).
const MAP_FILES = [null, "grey", "grey2", "gold", "brown", "greybrown", "invgrey", "invgrey2", "invgreybrown"];
const palette = read("data/global/palette/units/pal.dat");
const maps = new Map();
const colourMap = (trans, colour) => {
  const file = MAP_FILES[trans];
  if (!file || colour === 255) return null;
  if (!maps.has(file)) maps.set(file, read(`data/global/items/palette/${file}.dat`));
  return maps.get(file)?.subarray(colour * 256, colour * 256 + 256) ?? null;
};

const bases = new Map();
for (const n of ["weapons.bin", "armor.bin", "misc.bin"]) {
  const t = table(n);
  if (t.size !== 424) throw new Error(`${n} rows are ${t.size} bytes, expected 424 (D2 1.13c)`);
  for (let i = 0; i < t.count; i++) {
    const r = t.record(i);
    const code = r.toString("latin1", 0x80, 0x84).trim();
    if (!code || bases.has(code)) continue;
    bases.set(code, { code, name: clean(byIndex(r.readUInt16LE(0xf4))), inv: cstr(r, 0x20), uniqueInv: cstr(r, 0x40), setInv: cstr(r, 0x60), trans: r[0x142] });
  }
}

const outDir = fileURLToPath(new URL(`../data/game/${patch}/item-art/`, import.meta.url));
mkdirSync(outDir, { recursive: true });
const rendered = new Map();
const missing = new Set();
// Renders once per (graphic, colour map, colour); returns the file stem or null.
function art(file, trans, colour) {
  if (!file) return null;
  // Output names are URL-safe (some graphics are named like "#sacred").
  const stem = file.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const key = colour === 255 || !MAP_FILES[trans] ? stem : `${stem}-${trans}-${colour}`;
  if (rendered.has(key)) return rendered.get(key);
  const dc6 = read(`data/global/items/${file}.dc6`);
  let out = null;
  if (dc6) {
    const sprite = readDc6(dc6);
    writeFileSync(join(outDir, `${key}.png`), png(sprite.width, sprite.height, toRgba(sprite, palette, colourMap(trans, colour))));
    out = key;
  } else missing.add(file);
  rendered.set(key, out);
  return out;
}

const result = { uniques: [], sets: [], bases: [] };
const u = table("uniqueitems.bin");
if (u.size !== 332) throw new Error(`uniqueitems.bin rows are ${u.size} bytes, expected 332`);
for (let i = 0; i < u.count; i++) {
  const r = u.record(i);
  const b = bases.get(r.toString("latin1", 0x28, 0x2c).trim());
  const name = clean(byKey(cstr(r, 0x02)));
  if (!b || !name) continue;
  const file = cstr(r, 0x5a) || b.uniqueInv || b.inv;
  const a = art(file, b.trans, r[0x39]);
  if (a) result.uniques.push({ name, base: b.name, code: b.code, art: a });
}
const s = table("setitems.bin");
if (s.size !== 440) throw new Error(`setitems.bin rows are ${s.size} bytes, expected 440`);
for (let i = 0; i < s.count; i++) {
  const r = s.record(i);
  const b = bases.get(r.toString("latin1", 0x28, 0x2c).trim());
  const name = clean(byKey(cstr(r, 0x02)));
  if (!b || !name) continue;
  const file = cstr(r, 0x62) || b.setInv || b.inv;
  const a = art(file, b.trans, r[0x41]);
  if (a) result.sets.push({ name, base: b.name, code: b.code, art: a });
}
// Plain bases (also used for runewords, which have no art of their own).
for (const b of bases.values()) {
  const a = b.name && art(b.inv, 0, 255);
  if (a) result.bases.push({ name: b.name, code: b.code, art: a });
}

const sha = (p) => createHash("sha256").update(readFileSync(join(dir, p))).digest("hex");
const manifest = {
  patch,
  extractedAt: new Date().toISOString(),
  source: {
    files: Object.fromEntries([...used].sort().map((n) => [n, sha(n)])),
    method: "DC6 inventory graphics drawn with pal.dat and the item's colour transform (see scripts/extract-item-art.mjs).",
  },
  ...result,
};
const target = new URL(`../data/game/${patch}/`, import.meta.url);
mkdirSync(target, { recursive: true });
writeFileSync(new URL("item-art.json", target), JSON.stringify(manifest, null, 1) + "\n");
console.log(
  `extract-item-art: Median XL ${patch}: ${result.uniques.length} uniques, ${result.sets.length} set items, ${result.bases.length} bases, ` +
    `${[...rendered.values()].filter(Boolean).length} images${missing.size ? `; ${missing.size} graphics not found` : ""}`,
);
