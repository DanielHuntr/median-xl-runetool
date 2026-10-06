// Mastercrafted bases (Soulbinder Gloves, Echo Sabre, Maiden Bow, …): src/data/mastercrafted.json,
// for Base Items and the planner. The docs' base list doesn't have them. From the game:
//   - base stats: damage, defense, required strength, dexterity and level, from
//     src/data/cube-main.json baseStats (weapons.bin / armor.bin; run scripts/extract-cube.mjs
//     first) and the attack speed modifier from src/data/speed.json (extract-speed.mjs);
//   - sockets and the special ability: each has its own item type (mw01 …) with one automagic.bin
//     affix (group 801-808; Cincture's is on its quality type, qblt): property 3 its sockets, property 157 a string id whose text is the
//     ability ("+1% Chance to Avoid Damage per 500 Dexterity"); a hidden skill carries it out.
//     The "Cannot be Renewed" line is left out, and so is the text of the two Pandemonium-season
//     bases, which says they no longer work;
//   - the Strength/Dexterity damage bonus: weapons.bin u16 0x106 / 0x108, per 100 points (matches
//     the docs' "(0.11 per Strength)%" on all 635 tiered weapons).
//   node scripts/extract-mastercrafted.mjs [game dir]   (default: $MXL_DIR or C:/games/median-xl)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openMpq } from "./lib/mpq.mjs";
import { readBin, readTbl, stringIndex } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const X = (n) => readBin(mpq.read(`data/global/excel/${n}`));
const tbls = ["string.tbl", "patchstring.tbl", "expansionstring.tbl"].map((n) => readTbl(mpq.read(`data/local/lng/eng/${n}`)));
const str = stringIndex({ base: tbls[0], patch: tbls[1], expansion: tbls[2] });
const read = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), "utf8"));
const cube = read("cube-main.json"), speed = read("speed.json");
const weapons = X("weapons.bin");
const weaponRow = new Map(Array.from({ length: weapons.count }, (_, i) => weapons.record(i)).map((r) => [r.toString("latin1", 0x80, 0x84).replace(/\0/g, "").trim(), r]));
const perPoint = (code) => {
  const r = weaponRow.get(code);
  if (!r) return [];
  const line = (v, stat) => (v ? [`${stat} Damage Bonus: (${v / 100} per ${stat})%`] : []);
  return [...line(r.readUInt16LE(0x106), "Strength"), ...line(r.readUInt16LE(0x108), "Dexterity")];
};

// The game's item code → its category among the app's base categories.
const CATEGORY = { mz01: "Bows", mz02: "Daggers", mz03: "Staves", mz04: "Belts", mz05: "Throwing Knives", mz21: "Gloves", mz22: "One-Handed Swords" };
const itemtypes = X("itemtypes.bin");
const typeCode = (i) => itemtypes.record(i).toString("latin1", 0, 4).replace(/\0/g, "").trim();
const automagic = X("automagic.bin");
const affixOf = (type) => {
  for (let i = 0; i < automagic.count; i++) {
    const r = automagic.record(i);
    if ([0, 1, 2, 3, 4, 5, 6].some((k) => typeCode(r.readUInt16LE(0x6A + 2 * k)) === type)) {
      const mods = [0, 1, 2].map((k) => [r.readInt32LE(0x24 + 16 * k), r.readInt32LE(0x28 + 16 * k), r.readInt32LE(0x2C + 16 * k)]);
      return { sockets: mods.find(([p]) => p === 3)?.[2] || 0, text: mods.find(([p]) => p === 157)?.[1] ?? null };
    }
  }
  return null;
};
// A tooltip string's lines, top first (D2 stores them bottom-up), without colour codes.
const tooltip = (id) => (str(id) || "").replace(/(?:ÿ|Ã¿)c./g, "").split("\n").map((l) => l.trim()).filter(Boolean).reverse();

const out = [];
for (const [code, cat] of Object.entries(CATEGORY)) {
  const item = cube.items.find((x) => x[0] === code); // [code, name, item types, kind]
  if (!item) throw new Error(`No item ${code} in cube-main.json`);
  const name = item[1];
  const type = item[2].find((t) => /^mw\d\d$/.test(t));
  const [oneMin, oneMax, twoMin, twoMax, throwMin, throwMax, defMin, defMax, reqStr, reqDex, reqLvl] = cube.baseStats[code];
  // Cincture's affix names its quality type (qblt) instead of mw04.
  const { sockets, text } = affixOf(type) || affixOf(item[2].find((t) => /^q/.test(t))) || { sockets: 0, text: null };
  const ability = text == null ? [] : tooltip(text).filter((l) => l !== "Cannot be Renewed");
  const retired = ability.some((l) => /nonfunctional/i.test(l));
  const lines = [
    ...(throwMax ? [`Throw Damage: ${throwMin} to ${throwMax}`] : []),
    ...(oneMax ? [`One-Hand Damage: ${oneMin} to ${oneMax}`] : []),
    ...(twoMax ? [`Two-Hand Damage: ${twoMin} to ${twoMax}`] : []),
    ...(defMax ? [`Defense: ${defMin} to ${defMax}`] : []),
    ...(reqLvl ? [`Required Level: ${reqLvl}`] : []),
    ...(reqStr ? [`Required Strength: ${reqStr}`] : []),
    ...(reqDex ? [`Required Dexterity: ${reqDex}`] : []),
    ...(speed.weapons[name] ? [`Attack Speed Modifier: ${speed.weapons[name][1]}`] : []),
    ...perPoint(code),
    ...(sockets ? [`Socketed (${sockets})`] : []),
  ];
  out.push({ code, name, cat, lines, ability: retired ? [] : ability, ...(retired ? { retired: true } : {}) });
}
writeFileSync(new URL("../src/data/mastercrafted.json", import.meta.url), JSON.stringify({ patch, source: "weapons.bin/armor.bin (via cube-main.json), speed.json, automagic.bin groups 801-808, string tables", bases: out }, null, 1) + "\n");
console.log(`extract-mastercrafted: ${out.map((b) => `${b.name}${b.ability.length ? ` [${b.ability.join("; ")}]` : ""}`).join(", ")}`);
