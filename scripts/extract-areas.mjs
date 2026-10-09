// The game's areas and their monster levels, for "where to level" in the levelling guides:
// src/data/areas.json.
//
//   node scripts/extract-areas.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Source: levels.bin (544-byte records, medianxl-YmludGJsdHh0.mpq; D2 1.13c LevelsTxt): act
// 0x03 (0-4), monster level for Normal, Nightmare and Hell 0x16/0x18/0x1A (int16), area
// name 0xF5 (40 characters). Towns and areas with no monster level in any difficulty are
// left out, as are developer test areas and special areas that reuse a town's name (two
// Hell-only "Rogue Encampment" records), which a guide couldn't send anyone to by name.
// An area entered only through a Horadric Cube portal gets the recipe's lowest difficulty as
// `from` (0-2), from src/data/cube-main.json (run extract-cube first): the Moo Moo Farm has
// Nightmare monster levels in levels.bin, but Wirt's Leg opens it on Hell only.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readBin } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const levels = readBin(openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq")).read("data/global/excel/levels.bin"));
if (levels.size !== 544) throw new Error(`levels.bin records are ${levels.size} bytes, expected 544 (D2 1.13c)`);

const rows = Array.from({ length: levels.count - 1 }, (_, i) => {
  const r = levels.record(i + 1);
  return { id: i + 1, r, name: r.toString("latin1", 0xf5, 0xf5 + 40).replace(/\0.*$/s, "").trim(), mlvl: [0x16, 0x18, 0x1a].map((o) => r.readInt16LE(o)) };
});
// Cube outputs of type 1 open a portal to the level in their fifth field.
const cube = JSON.parse(readFileSync(new URL("../src/data/cube-main.json", import.meta.url), "utf8"));
const portalFrom = new Map();
for (const [, difficulty, , , , , outputs] of cube.recipes)
  for (const o of outputs) if (o[0] === 1) portalFrom.set(o[4], Math.min(portalFrom.get(o[4]) ?? 2, difficulty));
if (portalFrom.get(39) !== 2) throw new Error("cubemain: the Moo Moo Farm portal isn't Hell-only as expected");
const towns = new Set(rows.filter((x) => x.name && x.mlvl.every((l) => l <= 0)).map((x) => x.name));
const areas = [];
for (const { id, r, name, mlvl } of rows) {
  if (!name || /test/i.test(name) || towns.has(name) || mlvl.every((l) => l <= 0)) continue;
  const from = portalFrom.get(id);
  areas.push({ id, name, act: r[0x03] + 1, mlvl, ...(from ? { from } : {}) });
}
if (!areas.some((a) => a.name === "Blood Moor" && a.mlvl[0] === 1)) throw new Error("levels.bin: Blood Moor not where expected");
const file = fileURLToPath(new URL("../src/data/areas.json", import.meta.url));
writeFileSync(file, JSON.stringify({ patch, source: "levels.bin (medianxl-YmludGJsdHh0.mpq): act 0x03, monster levels 0x16/0x18/0x1A, name 0xF5; from: lowest difficulty of a cube portal (cubemain)", areas }) + "\n");
console.log(`${areas.length} areas → src/data/areas.json`);
