// Extracts the monsters the planner can measure damage against, from the installed game.
//
//   node scripts/extract-monsters.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Source: monstats.bin in medianxl-YmludGJsdHh0.mpq, D2 1.13c layout (424-byte records),
// field offsets from D2MOO's D2MonStatsTxt and its loader (DATATBLS_LoadMonStatsTxt):
//   0x06 name string, 0x0C flags (bit 6 boss, 8 NPC, 11/12 undead, 13 demon, 15 killable,
//   25 enabled), 0x4C alignment (0 enemy, 1 ally such as the player's summons, 2 neutral), 0xAA level ×3 difficulties, 0x144 resistances ×6 × 3 difficulties in the
//   order physical (ResDm), magic, fire, lightning, cold, poison.
// Only enabled, killable, named, non-NPC, non-allied monsters are kept; records identical in name,
// levels and resistances are merged. Defense: monstats 0xBC ×3 (% of monlvl.bin's). Output: data/game/<patch>/monsters.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const tbl = (n) => readTbl(mpq.read(`data/local/lng/eng/${n}`));
const str = stringIndex({ base: tbl("string.tbl"), patch: tbl("patchstring.tbl"), expansion: tbl("expansionstring.tbl") });
const ms = readBin(mpq.read("data/global/excel/monstats.bin"));
if (ms.size !== 424) throw new Error(`monstats.bin records are ${ms.size} bytes, expected 424 (D2 1.13c)`);

// Defense: monstats.bin 0xBC ×3 is a percentage of monlvl.bin's defense for the monster's
// level (120-byte rows, one per level; int32 defense for Normal, Nightmare and Hell first,
// as D2 1.13c MonLvl.txt).
const ml = readBin(mpq.read("data/global/excel/monlvl.bin"));
if (ml.size !== 120) throw new Error(`monlvl.bin records are ${ml.size} bytes, expected 120 (D2 1.13c)`);
const levelDefense = (level, k) => (level > 0 && level < ml.count ? ml.record(level).readInt32LE(k * 4) : 0);
// To-hit and damage the same way: monstats 0xC2 (A1TH) and 0xDA/0xE0 (A1MinD/A1MaxD) ×3 are
// percentages of monlvl.bin's to-hit (int32 columns 6-8) and damage (18-20) for the level
// (D2MOO's layout, in order after defense; checked: a Hell Ghoul, level 110, to-hit 3519,
// 172-403 damage). The monster's first attack; its other attacks and spells aren't read.
const levelColumn = (level, col, k) => (level > 0 && level < ml.count ? ml.record(level).readInt32LE((col + k) * 4) : 0);

const RES = ["physical", "magic", "fire", "lightning", "cold", "poison"];
const bit = (f, n) => ((f >>> n) & 1) === 1;
const three = (r, o) => [0, 1, 2].map((k) => r.readInt16LE(o + k * 2));
const out = [];
const seen = new Set();
for (let id = 0; id < ms.count; id++) {
  const r = ms.record(id);
  const flags = r.readUInt32LE(0x0c);
  if (!bit(flags, 25) || !bit(flags, 15) || bit(flags, 8) || r[0x4c] === 1) continue;
  const name = str(r.readUInt16LE(0x06))?.replace(/(?:ÿ|Ã¿)c./g, "").replace(/\s+/g, " ").trim();
  // Unused string slots read "FLYING POLAR BUFFALO ERROR" (id 5382 and others), and some
  // records point at multi-line recipe tooltips ("Cube with any Enhanced Rune…"), not names.
  if (!name || /POLAR BUFFALO/.test(name) || str(r.readUInt16LE(0x06)).includes("\n")) continue;
  const levels = three(r, 0xaa);
  if (levels.every((l) => l <= 0)) continue;
  const res = Object.fromEntries(RES.map((k, j) => [k, three(r, 0x144 + j * 6)]));
  const key = JSON.stringify([name, levels, res]);
  if (seen.has(key)) continue;
  seen.add(key);
  const acPct = three(r, 0xbc);
  const def = levels.map((l, k) => Math.floor((acPct[k] * levelDefense(l, k)) / 100));
  const thPct = three(r, 0xc2), minPct = three(r, 0xda), maxPct = three(r, 0xe0);
  const toHit = levels.map((l, k) => Math.floor((thPct[k] * levelColumn(l, 6, k)) / 100));
  const damage = levels.map((l, k) => [Math.floor((minPct[k] * levelColumn(l, 18, k)) / 100), Math.floor((maxPct[k] * levelColumn(l, 18, k)) / 100)]);
  out.push({
    id, name, levels, res, def, toHit, damage,
    ...(bit(flags, 6) ? { boss: true } : {}),
    ...(bit(flags, 13) ? { demon: true } : {}),
    ...(bit(flags, 11) || bit(flags, 12) ? { undead: true } : {}),
  });
}
const file = fileURLToPath(new URL(`../data/game/${patch}/monsters.json`, import.meta.url));
mkdirSync(fileURLToPath(new URL(`../data/game/${patch}/`, import.meta.url)), { recursive: true });
writeFileSync(file, JSON.stringify({ patch, source: "monstats.bin and monlvl.bin (medianxl-YmludGJsdHh0.mpq); layout from D2MOO", monsters: out }));
console.log(`extract-monsters: Median XL ${patch}, ${out.length} monsters (${out.filter((m) => m.boss).length} bosses) → data/game/${patch}/monsters.json`);
