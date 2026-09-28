// The mercenaries, from the game: data/game/<patch>/mercs.json (merged into the planner data
// by scripts/import-skills.mjs, like the monsters).
//
//   node scripts/extract-mercs.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Source: hireling.bin (280-byte records, medianxl-YmludGJsdHh0.mpq), D2 1.13c HirelingTxt:
//   0x04 hireling id, 0x0C act, 0x10 difficulty (1-3), 0x1C level, 0x24/0x28 life and per
//   level, 0x2C/0x30 defense and per level, 0x34/0x38 strength and per level (1/8),
//   0x3C/0x40 dexterity and per level (1/8), 0x44/0x48 attack rating and per level,
//   0x50/0x54 damage min/max, 0x58 damage per level (1/8), 0x5C/0x60 resistances and per
//   level (1/4), 0x78 skills (6 × int32), 0xC6 skill levels (6 bytes), 0xCC skill levels
//   gained per level (6 bytes, 1/32). The fractions are D2's HirelingTxt conventions.
// One row per hiring point: a mercenary uses the row with the highest level at or below its
// own in its difficulty. Which specialization a hireling id is (Ranger, Exemplar…) is named
// from its skills, as the docs list them (docs.median-xl.com/doc/class/hirelings).
// The mercenaries' skills' game records (formulas) come from the skill extract (skills.json).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readBin } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const H = readBin(openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq")).read("data/global/excel/hireling.bin"));
if (H.size !== 280) throw new Error(`hireling.bin records are ${H.size} bytes, expected 280 (D2 1.13c)`);
const extract = JSON.parse(readFileSync(fileURLToPath(new URL(`../data/game/${patch}/skills.json`, import.meta.url)), "utf8"));
if (extract.patch !== patch) throw new Error(`skills.json is from ${extract.patch}; run extract-game-data first`);
const gameSkills = new Map((Array.isArray(extract.skills) ? extract.skills : Object.values(extract.skills)).map((s) => [s.gameId, s]));

// Specializations by a skill only they have (the docs' skill lists).
const SPECS = [
  ["Trinity Arrow", 1, "Ranger"], ["Heartseeker", 1, "Priestess"],
  ["Colosseum", 2, "Exemplar"], ["Thorn Field", 2, "Shapeshifter"], ["Lemures", 2, "Fighter Mage"],
  ["Pyroblast", 3, "Bloodmage"], ["Hailstorm", 3, "Necrolyte"], ["Tempest", 3, "Abjurer"],
  ["Wraithsword", 5, "Barbarian"],
];

const types = new Map();
for (let i = 0; i < H.count; i++) {
  const r = H.record(i), i32 = (o) => r.readInt32LE(o);
  const skills = [0, 1, 2, 3, 4, 5]
    .map((k) => ({ gameId: i32(0x78 + 4 * k), level: r[0xc6 + k], perLevel: r[0xcc + k] }))
    .filter((s) => s.gameId > 0 && gameSkills.has(s.gameId))
    // The first two slots are often the same skill (its attack and its AI use).
    .filter((s, k, all) => all.findIndex((x) => x.gameId === s.gameId) === k)
    .map((s) => ({ ...s, name: gameSkills.get(s.gameId).name }));
  const act = i32(0x0c);
  const spec = SPECS.find(([n, a]) => a === act && skills.some((s) => s.name === n))?.[2];
  if (!spec) throw new Error(`hireling row ${i}: no specialization matches its skills (${skills.map((s) => s.name).join(", ")})`);
  const key = `${spec}|${i32(0x10)}`;
  const t = types.get(key) ?? types.set(key, { spec, act, difficulty: i32(0x10), hireIds: [], rows: [], skills }).get(key);
  if (!t.hireIds.includes(i32(0x04))) t.hireIds.push(i32(0x04));
  t.rows.push({
    level: i32(0x1c),
    life: [i32(0x24), i32(0x28)], defense: [i32(0x2c), i32(0x30)],
    strength: [i32(0x34), i32(0x38)], dexterity: [i32(0x3c), i32(0x40)],
    ar: [i32(0x44), i32(0x48)], damage: [i32(0x50), i32(0x54), i32(0x58)], resist: [i32(0x5c), i32(0x60)],
  });
}
// The Barbarians have two hireling ids with the same rows: each row once.
const out = [...types.values()].map((t) => ({ ...t, rows: t.rows.filter((r, i, all) => all.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i).sort((a, b) => a.level - b.level) }));
// Records of every mercenary skill, for their tooltips and buffs.
const skills = Object.fromEntries([...new Set(out.flatMap((t) => t.skills.map((s) => s.gameId)))].map((id) => [id, gameSkills.get(id)]));
const file = fileURLToPath(new URL(`../data/game/${patch}/mercs.json`, import.meta.url));
writeFileSync(file, JSON.stringify({ patch, source: "hireling.bin (medianxl-YmludGJsdHh0.mpq), D2 1.13c HirelingTxt; specializations named as docs.median-xl.com/doc/class/hirelings", types: out, skills }) + "\n");
console.log(`extract-mercs: ${out.length} mercenary types (${new Set(out.map((t) => t.spec)).size} specializations × difficulty), ${Object.keys(skills).length} skills → data/game/${patch}/mercs.json`);
