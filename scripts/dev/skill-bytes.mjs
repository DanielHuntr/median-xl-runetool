// Dev check: node scripts/dev/skill-bytes.mjs <game skill id> [from] [to] — int16 view of a skills.bin record.
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
const m = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const t = readBin(m.read("data/global/excel/skills.bin"));
const [id, from = "0x40", to = "0x98"] = process.argv.slice(2);
const r = t.record(+id);
console.log("record size", t.size);
const row = [];
for (let o = +from; o < +to; o += 2) row.push(`${o.toString(16)}:${r.readInt16LE(o)}`);
console.log(row.join(" "));
