// What attack and cast speed breakpoints are made of, from the game: src/data/speed.json.
//
//   node scripts/extract-speed.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Sources:
//  - data/global/animdata.d2 (medianxl-YW5pbWRhdGE.mpq): 256 hash blocks, each a uint32 count
//    then 160-byte records: animation name (8 chars, e.g. "AMA11HS" = Amazon, attack 1,
//    one-handed swing), frames per direction (uint32 0x08), animation speed (uint32 0x0C).
//    The official Median XL speed calculator (dev.median-xl.com/speedcalc) reads the same
//    two numbers; all 322 of its rows match this file in 2.14.4.
//  - weapons.bin (424-byte records, medianxl-YmludGJsdHh0.mpq): name string 0xF4, weapon
//    class 0xC0 (the animation it uses: 1hs, 1ht, 2hs, 2ht, stf, bow, xbw, ht1), weapon
//    speed modifier 0xD8 (int32; checked against the calculator's table for 40 bases).
// Only the seven classes' own attack (A1) and cast (SC) animations are kept; wereforms,
// mercenaries, throwing and dual wielding aren't modelled by the planner.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");

const CLASSES = { AM: "Amazon", AI: "Assassin", BA: "Barbarian", DZ: "Druid", NE: "Necromancer", PA: "Paladin", SO: "Sorceress" };
const MODES = /^(A1|SC)(1HS|1HT|2HS|2HT|STF|BOW|XBW|HT1|HTH)$/;

const anim = openMpq(join(dir, "medianxl-YW5pbWRhdGE.mpq")).read("data/global/animdata.d2");
if (!anim) throw new Error("animdata.d2 not found");
const anims = Object.fromEntries(Object.values(CLASSES).map((c) => [c, {}]));
let o = 0;
for (let block = 0; block < 256; block++) {
  const n = anim.readUInt32LE(o);
  o += 4;
  for (let i = 0; i < n; i++, o += 160) {
    const name = anim.toString("latin1", o, o + 8).replace(/\0.*$/, "");
    const cls = CLASSES[name.slice(0, 2)], mode = name.slice(2);
    if (cls && MODES.test(mode)) anims[cls][mode] = [anim.readUInt32LE(o + 8), anim.readUInt32LE(o + 12)];
  }
}
if (o !== anim.length) throw new Error(`animdata.d2: read ${o} of ${anim.length} bytes`);

const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const tbls = ["string.tbl", "patchstring.tbl", "expansionstring.tbl"].map((n) => readTbl(mpq.read(`data/local/lng/eng/${n}`)));
const str = stringIndex({ base: tbls[0], patch: tbls[1], expansion: tbls[2] });
const clean = (s) => s?.replace(/(?:ÿ|Ã¿)c./g, "").split("\n")[0].trim() ?? null;
const w = readBin(mpq.read("data/global/excel/weapons.bin"));
if (w.size !== 424) throw new Error(`weapons.bin records are ${w.size} bytes, expected 424`);
const WCLASS = /^(1hs|1ht|2hs|2ht|stf|bow|xbw|ht1)$/;
const seen = {};
for (let i = 0; i < w.count; i++) {
  const r = w.record(i);
  // Tiers are separate items named "Hand Axe (3)", "… (Sacred)"; they share class and speed.
  const name = clean(str(r.readUInt16LE(0xf4)))?.replace(/\s*\((?:\d+|Sacred)\)$/, "");
  const wclass = r.toString("latin1", 0xc0, 0xc4).replace(/\0.*$/, "").trim();
  if (!name || !WCLASS.test(wclass)) continue;
  const key = `${wclass} ${r.readInt32LE(0xd8)}`;
  (seen[name] ??= {})[key] = (seen[name][key] || 0) + 1;
}
// A few names are also used by one-off items (Broad Sword, Throwing Axe); the tiers agree,
// so the value most rows share is the base's.
const weapons = {};
for (const [name, counts] of Object.entries(seen)) {
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (Object.entries(counts).some(([k, m]) => k !== best && m === n)) console.warn(`${name}: no majority (${Object.keys(counts).join(", ")})`);
  const [wclass, speed] = best.split(" ");
  weapons[name] = [wclass, +speed];
}

for (const [cls, modes] of Object.entries(anims)) if (!modes.A1HTH || !modes.SCHTH) throw new Error(`${cls}: no unarmed animations`);
const file = fileURLToPath(new URL("../src/data/speed.json", import.meta.url));
writeFileSync(file, JSON.stringify({
  patch,
  source: "animdata.d2 (medianxl-YW5pbWRhdGE.mpq); weapons.bin weapon class 0xC0 and speed 0xD8; formulas from dev.median-xl.com/speedcalc",
  anims,
  weapons,
}) + "\n");
console.log(`${Object.keys(weapons).length} weapon bases, ${Object.values(anims).reduce((n, m) => n + Object.keys(m).length, 0)} animations → src/data/speed.json`);
