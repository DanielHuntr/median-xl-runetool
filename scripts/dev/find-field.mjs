// Dev check: node scripts/dev/find-field.mjs <key> [slot] — finds skills.bin offsets whose
// value matches a MedianDB constant (numeric) across many skills, to locate a field.
import { readFileSync } from "node:fs";
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const mpq = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const table = process.env.TABLE || "skills.bin";
const skills = readBin(mpq.read(`data/global/excel/${table}`));
const [key, slot = 0, conv = ""] = process.argv.slice(2);
const pairs = [];
for (const s of Object.values(data.skills)) {
  const row = s.game && s.constants.find((c) => c.key === key && !c.variant);
  let v = row && String(row.values[slot] ?? "").trim();
  if (conv === "frames") v = /^frames\((\d+(\.\d+)?)\)$/.exec(v || "")?.[1];
  // D2 SrcDam: weapon damage share in 128ths (128 = 100%).
  if (conv === "src128" && /^\d+$/.test(v || "")) v = String(Math.round((Number(v) * 128) / 100));
  if (v && /^-?\d+(\.\d+)?$/.test(v)) pairs.push([s.game.gameId, Number(v), s.name]);
}
console.log(key, "slot", slot, pairs.length, "skills with a constant");
const hits = [];
for (let o = 0; o < skills.size; o++)
  for (const [w, read] of [["u8", (r) => r[o]], ["i16", (r) => (o + 1 < skills.size ? r.readInt16LE(o) : NaN)], ["i32", (r) => (o + 3 < skills.size ? r.readInt32LE(o) : NaN)]]) {
    let ok = 0;
    for (const [id, v] of pairs) if (read(skills.record(id)) === v) ok++;
    if (ok >= pairs.length * 0.5 && ok >= 5) hits.push([ok, `0x${o.toString(16)} ${w}`]);
  }
console.log(hits.sort((a, b) => b[0] - a[0]).slice(0, 8));
