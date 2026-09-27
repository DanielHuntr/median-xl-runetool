// Dev check: node scripts/dev/itemstatcost.mjs [stat…] — ItemStatCost.bin records. Finds the
// op block by structure: item_maxhp_percent (76) and item_maxmana_percent (77) share an op and
// target maxhp (7) and maxmana (9); item_hp_perlevel (216) targets maxhp with base level (12).
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
const m = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const t = readBin(m.read("data/global/excel/itemstatcost.bin"));
console.log("itemstatcost.bin", t.count, "records of", t.size, "bytes");
const r = (i) => t.record(i);
for (let o = 0; o + 1 < t.size; o++) {
  if (r(76).readInt16LE(o) === 7 && r(77).readInt16LE(o) === 9 && r(216).readInt16LE(o) === 7)
    console.log(`maxhp/maxmana target at 0x${o.toString(16)}; bytes before: 76 [${[...r(76).subarray(o - 6, o)]}] 77 [${[...r(77).subarray(o - 6, o)]}] 216 [${[...r(216).subarray(o - 6, o)]}]`);
}
for (const id of process.argv.slice(2)) console.log(id, [...r(+id)].map((b, i) => (b ? `${i.toString(16)}:${b}` : null)).filter(Boolean).join(" "));
