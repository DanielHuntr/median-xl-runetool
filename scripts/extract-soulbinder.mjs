// Soulbinder Gloves (Mastercrafted) roll one oskill from affix group 217 of the game's
// magicsuffix.bin: each roll's skill and level range, for the Oskills & Procs page. The group
// also holds rolls for other items, so only those that spawn on the gloves' item type are kept
// (mw21, or glov, which it counts as; the affix's seven item types sit at 0x6A). Skill names
// come from the game too (skills.bin 0x194 → skilldesc.bin 0x08 → the string tables); a roll
// of a skill with no description (an empty placeholder) shows nothing in game and is left out.
//   node scripts/extract-soulbinder.mjs [game dir]   (default: $MXL_DIR or C:/games/median-xl)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openMpq } from "./lib/mpq.mjs";
import { readBin, readTbl, stringIndex } from "./lib/d2tables.mjs";

const GROUP = 217, OSKILL = 150; // affix group (record 0x5C); the oskill property (mod 1 code 0x24)
const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const X = (n) => readBin(mpq.read(`data/global/excel/${n}`));
const tbls = ["string.tbl", "patchstring.tbl", "expansionstring.tbl"].map((n) => readTbl(mpq.read(`data/local/lng/eng/${n}`)));
const str = stringIndex({ base: tbls[0], patch: tbls[1], expansion: tbls[2] });
const text = (s) => (s ?? "").replace(/(?:ÿ|Ã¿)c./g, "").split("\n").map((l) => l.trim()).filter(Boolean).reverse().join(" ");
const skills = X("skills.bin"), skilldesc = X("skilldesc.bin");
const skillName = (id) => {
  if (id < 0 || id >= skills.count) return null;
  const d = skills.record(id).readInt16LE(0x194);
  return d >= 0 ? text(str(skilldesc.record(d).readUInt16LE(0x08))) || null : null;
};
const itemtypes = X("itemtypes.bin");
const typeIndex = (code) => {
  for (let i = 0; i < itemtypes.count; i++) if (itemtypes.record(i).toString("latin1", 0, 4) === code) return i;
  throw new Error(`No item type ${code}`);
};
const GLOVES = new Set(["mw21", "glov"].map(typeIndex));
const onGloves = (r) => [0, 1, 2, 3, 4, 5, 6].some((k) => GLOVES.has(r.readUInt16LE(0x6A + 2 * k)));

const t = X("magicsuffix.bin");
const rolls = [], nameless = [];
for (let i = 0; i < t.count; i++) {
  const r = t.record(i);
  // Spawnable (u16 0x54): 50 of the gloves' rolls are switched off and never roll.
  if (r.readUInt16LE(0x5C) !== GROUP || r.readInt32LE(0x24) !== OSKILL || !onGloves(r) || r.readUInt16LE(0x54) !== 1) continue;
  const skill = skillName(r.readInt32LE(0x28));
  if (!skill) { nameless.push(r.readInt32LE(0x28)); continue; }
  rolls.push({ skill, min: r.readInt32LE(0x2C), max: r.readInt32LE(0x30) });
}
rolls.sort((a, b) => a.skill.localeCompare(b.skill) || a.min - b.min);
writeFileSync(new URL("../src/data/soulbinder.json", import.meta.url), JSON.stringify({ patch, source: "magicsuffix.bin, affix group 217", rolls }, null, 2) + "\n");
console.log(`${rolls.length} Soulbinder oskill rolls${nameless.length ? `; left out, no name: skill ${nameless.join(", ")}` : ""}`);
