// What a Superior item adds, as the game decides it: src/data/superior-items.json.
//
//   node scripts/extract-superior.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Sources (medianxl-YmludGJsdHh0.mpq, D2 1.13c layouts, located by structure):
//   qualityitems.bin (112-byte records): item-type flags at 0x00-0x09 (0x00 armour, 0x01
//     weapon; the rest are sub-types: shield, belt, boots… for armour rows, bow and others
//     for weapon rows), number of properties 0x0A, then two properties of four int32s from
//     0x0C (property, parameter, min, max; property -1 = none), and two 32-byte effect names
//     from 0x2C ("improved damage", "improved armor class").
//   properties.bin (46-byte records): function 0x18, first stat 0x20 (int16). The four
//     properties Superior uses are written as the item lines the planner already reads.
// In 2.14.4: weapons +35-60% Enhanced Damage, or +35-50% with +50-100% Attack Rating;
// armour +35-60% Enhanced Defense, or +35-50% with 1% Physical Resist.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readBin } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const quality = readBin(mpq.read("data/global/excel/qualityitems.bin"));
const props = readBin(mpq.read("data/global/excel/properties.bin"));
if (quality.size !== 112) throw new Error(`qualityitems.bin records are ${quality.size} bytes, expected 112`);

const range = (min, max) => (min === max ? `${min}` : `(${min} to ${max})`);
// Property function and stat → the item line (ItemStatCost ids: 16 item_armor_percent,
// 119 item_tohit_percent, 36 damageresist; function 7 is weapon damage %).
function line(property, min, max) {
  const r = props.record(property);
  const func = r[0x18], stat = r.readInt16LE(0x20);
  if (func === 7) return `+${range(min, max)}% Enhanced Damage`;
  if (func === 2 && stat === 16) return `+${range(min, max)}% Enhanced Defense`;
  if (func === 1 && stat === 119) return `${range(min, max)}% Bonus to Attack Rating`;
  if (func === 1 && stat === 36) return `+${range(min, max)}% Physical Resist`;
  throw new Error(`Superior property ${property} (function ${func}, stat ${stat}) has no known item line`);
}
const text = (r, o) => r.toString("latin1", o, o + 32).replace(/\0.*$/s, "");

const variants = [];
for (let i = 0; i < quality.count; i++) {
  const r = quality.record(i);
  const appliesTo = r[0x00] ? "armor" : r[0x01] ? "weapon" : null;
  if (!appliesTo) throw new Error(`qualityitems.bin row ${i} is neither armour nor weapon`);
  const lines = [];
  for (let k = 0; k < Math.min(2, r[0x0a]); k++) {
    const o = 0x0c + k * 16, property = r.readInt32LE(o);
    if (property >= 0) lines.push(line(property, r.readInt32LE(o + 8), r.readInt32LE(o + 12)));
  }
  variants.push({ id: i, appliesTo, lines, effects: [text(r, 0x2c), text(r, 0x4c)].filter(Boolean) });
}
writeFileSync(fileURLToPath(new URL("../src/data/superior-items.json", import.meta.url)), JSON.stringify({
  patch,
  source: "qualityitems.bin and properties.bin (medianxl-YmludGJsdHh0.mpq); see scripts/extract-superior.mjs",
  variants,
}, null, 1));
console.log(`extract-superior: Median XL ${patch}: ${variants.map((v) => `${v.appliesTo} [${v.lines.join(", ")}]`).join("; ")}`);
