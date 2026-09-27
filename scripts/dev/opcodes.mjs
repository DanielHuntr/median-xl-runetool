// Dev check: node scripts/dev/opcodes.mjs — formulas using unconfirmed opcodes, with exact
// lengths taken from where the next formula starts in skillscode.bin / skilldesccode.bin.
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
const mpq = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const X = (n) => mpq.read(`data/global/excel/${n}`);
const skills = readBin(X("skills.bin")), desc = readBin(X("skilldesc.bin"));
export const code = X("skillscode.bin"), descCode = X("skilldesccode.bin");
const offs = new Set(), dOffs = new Set();
const add = (set, o) => o >= 0 && set.add(o);
for (let i = 0; i < skills.count; i++) {
  const r = skills.record(i);
  for (let o = 0; o < skills.size - 3; o += 4) add(offs, r.readInt32LE(o)); // every int32 that could be an offset
}
for (let i = 0; i < desc.count; i++) {
  const r = desc.record(i);
  for (let k = 0; k < 34; k++) add(dOffs, r.readInt32LE(0x98 + 4 * k));
}
// Keep offsets that start right after a 0x00 terminator (or at 0): real formula starts.
const starts = (buf, set) => [...set].filter((o) => o < buf.length && (o === 0 || buf[o - 1] === 0)).sort((a, b) => a - b);
export function segments(buf, set) {
  const s = starts(buf, set);
  return s.map((o, i) => buf.subarray(o, s[i + 1] ?? buf.length));
}
export const all = [...segments(code, offs), ...segments(descCode, dOffs)];
if (process.argv[1]?.endsWith("opcodes.mjs")) {
  const known = new Set([0x00, 0x01, 0x04, 0x07, 0x08, 0x10, 0x11, 0x12, 0x13]);
  const sizes = { 0x01: 1, 0x04: 1, 0x07: 1, 0x08: 2 };
  const stats = {};
  for (const seg of all) {
    // walk with known sizes until an unknown op
    for (let p = 0; p < seg.length; ) {
      const op = seg[p];
      if (!known.has(op)) { (stats[op] ??= []).push(seg); break; }
      p += 1 + (sizes[op] || 0);
    }
  }
  for (const [op, segs] of Object.entries(stats)) {
    console.log(`0x${(+op).toString(16)}: ${segs.length} formulas`);
    for (const s of segs.slice(0, 4)) console.log("   " + [...s].map((b) => b.toString(16).padStart(2, "0")).join(" "));
  }
}
