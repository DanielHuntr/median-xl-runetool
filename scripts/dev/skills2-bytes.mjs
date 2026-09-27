// Dev check: node scripts/dev/skills2-bytes.mjs <game id…> — skills2.bin bytes per skill (byte 47 is the hard-point cap).
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
const m = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const t = readBin(m.read("data/global/excel/skills2.bin"));
console.log("skills2.bin", t.count, "records of", t.size, "bytes");
for (const id of process.argv.slice(2)) {
  const r = t.record(+id);
  console.log(String(id).padEnd(5), [...r].map((b, i) => (b ? `${i}:${b}` : null)).filter(Boolean).join(" "));
}
