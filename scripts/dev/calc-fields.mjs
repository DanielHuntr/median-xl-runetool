// Dev check: node scripts/dev/calc-fields.mjs [skill names…] — int32 fields of skills.bin
// that hold formula offsets, decoded, to identify what each field is.
import { readFileSync } from "node:fs";
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
import { decode, toText } from "../../src/planner/d2calc.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const mpq = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const X = (n) => mpq.read(`data/global/excel/${n}`);
const skills = readBin(X("skills.bin")), code = X("skillscode.bin"), cb = X("skillcalc.bin");
const names = [...Array(cb.readUInt32LE(0))].map((_, i) => cb.toString("latin1", 4 + i * 4, 8 + i * 4).replace(/\0.*$/, "").trim());
const KNOWN = new Set([0x70, 0x74, 0x78, 0x7c, 0x80, 0x84, 0xa4, 0xa8, 0xac, 0xb0, 0xb4, 0x138, 0x13c, 0x140, 0x144, 0x210, 0x224]);
const text = (o) => { const d = decode([...code.subarray(o, o + 200)]); return d.ok ? toText(d.tokens, names) : null; };
// Fields where, across all skills, the value is -1 or decodes as a formula start.
const fields = [];
for (let o = 0; o + 4 <= skills.size; o += 4) {
  if (KNOWN.has(o)) continue;
  let formulas = 0, empty = 0;
  for (let i = 0; i < skills.count; i++) {
    const v = skills.record(i).readInt32LE(o);
    if (v === -1) empty++;
    else if (v >= 0 && v < code.length && (v === 0 || code[v - 1] === 0) && text(v)) formulas++;
  }
  if (formulas > 20 && formulas + empty >= skills.count * 0.97) fields.push([o, formulas]);
}
console.log("formula fields:", fields.map(([o, n]) => `0x${o.toString(16)} (${n})`).join(", "));
for (const name of process.argv.slice(2)) {
  const s = Object.values(data.skills).find((x) => x.name === name);
  const r = skills.record(s.game.gameId);
  console.log(`\n${name}`);
  for (const [o] of fields) { const v = r.readInt32LE(o); if (v >= 0) console.log(`  0x${o.toString(16)}: ${text(v)}`); }
}
