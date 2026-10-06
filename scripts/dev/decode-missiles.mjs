// A skill's missiles from the installed game's missiles.bin (Diablo II 1.13c layout, 420-byte
// records), for how a skill deals its damage: its missile's life in frames, what it drops as it
// travels and how often (sub-missile and Param1), and whether it hits the same monster again.
// damage.js MULTI_HIT takes Hammer of Zerae's numbers from this; scripts/extract-multi-hit.mjs the rest.
//   node scripts/dev/decode-missiles.mjs <skill game id> [game dir]
//   e.g. node scripts/dev/decode-missiles.mjs 1054        (Hammer of Zerae)
import { openMpq } from "../lib/mpq.mjs";
import { join } from "node:path";

const skill = Number(process.argv[2]);
const dir = process.argv[3] || process.env.MXL_DIR || "C:/games/median-xl";
if (!skill) throw new Error("usage: decode-missiles.mjs <skill game id> [game dir]");
const buf = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq")).read("data/global/excel/missiles.bin");
const n = buf.readUInt32LE(0), size = (buf.length - 4) / n;
if (size !== 420) throw new Error(`missiles.bin records are ${size} bytes, expected 420 (D2 1.13c)`);
const rec = (i) => buf.subarray(4 + i * size, 4 + (i + 1) * size);
const none = (x) => x === 0xffff || x === 0;
for (let i = 0; i < n; i++) {
  const r = rec(i), w = (o) => r.readUInt16LE(o), d = (o) => r.readInt32LE(o), b = (o) => r.readUInt8(o);
  // The missile's own skill (0x194), or a skill named in its hit parameters (an item's switch).
  if (w(0x194) !== skill && ![0, 1, 2].some((k) => d(0x4c + 4 * k) === skill)) continue;
  const cel = r.subarray(0x138, 0x178).toString("latin1").replace(/\0.*$/s, "") || "-";
  const sub = [0x18, 0x1a, 0x1c].map(w).filter((x) => !none(x)), hitSub = [0x24, 0x26, 0x28, 0x2a].map(w).filter((x) => !none(x));
  console.log(`#${i} ${cel}: life ${w(0x96)} frames, speed ${b(0x9a)}-${b(0x9c)}, drops [${sub}] (Param1 ${d(0x38)}: every Param1 frames), on hit [${hitSub}],`
    + ` collide type ${b(0x183)}, next hit ${b(0x188)} after ${b(0x189)}, size ${b(0x18a)}, skill ${w(0x194)}, params [${[0, 1, 2, 3, 4].map((k) => d(0x38 + 4 * k))}] hit params [${[0, 1, 2].map((k) => d(0x4c + 4 * k))}]`);
}
