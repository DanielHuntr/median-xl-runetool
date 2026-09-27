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
// levels and resistances are merged. Output: data/game/<patch>/monsters.json.
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
  out.push({
    id, name, levels, res,
    ...(bit(flags, 6) ? { boss: true } : {}),
    ...(bit(flags, 13) ? { demon: true } : {}),
    ...(bit(flags, 11) || bit(flags, 12) ? { undead: true } : {}),
  });
}
const file = fileURLToPath(new URL(`../data/game/${patch}/monsters.json`, import.meta.url));
mkdirSync(fileURLToPath(new URL(`../data/game/${patch}/`, import.meta.url)), { recursive: true });
writeFileSync(file, JSON.stringify({ patch, source: "monstats.bin (medianxl-YmludGJsdHh0.mpq); layout from D2MOO", monsters: out }));
console.log(`extract-monsters: Median XL ${patch}, ${out.length} monsters (${out.filter((m) => m.boss).length} bosses) → data/game/${patch}/monsters.json`);
