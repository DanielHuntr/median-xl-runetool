import { openMpq } from "./lib/mpq.mjs";
import { join } from "node:path";
const mpq = openMpq(join("C:/games/median-xl", "medianxl-YmludGJsdHh0.mpq"));
const buf = mpq.read("data/global/excel/missiles.bin");
const n = buf.readUInt32LE(0), size = (buf.length - 4) / n;
const rec = (i) => buf.subarray(4 + i * size, 4 + (i + 1) * size);
const cel = (r) => r.subarray(0x138, 0x178).toString("latin1").replace(/\0.*$/s, "");
const show = (i) => {
  const r = rec(i), w = (o) => r.readUInt16LE(o), d = (o) => r.readInt32LE(o), bt = (o) => r.readUInt8(o);
  const sub = [0x18, 0x1a, 0x1c].map(w).filter((x) => x !== 0xffff && x), hsub = [0x24, 0x26, 0x28, 0x2a].map(w).filter((x) => x !== 0xffff && x);
  console.log(`#${i} cel=${cel(r)} srvDo=${w(0xc)} srvHit=${w(0xe)} dmgFunc=${w(0x10)} expl=${w(0x16) === 0xffff ? "-" : w(0x16)} sub=[${sub}] hitSub=[${hsub}] params=[${[0, 1, 2, 3, 4].map((k) => d(0x38 + 4 * k))}] hitPar=[${[0, 1, 2].map((k) => d(0x4c + 4 * k))}]`);
  console.log(`     range=${w(0x96)} levRange=${w(0x98)} vel=${bt(0x9a)} maxVel=${bt(0x9c)} collideType=${bt(0x183)} collideKill=${bt(0x186)} nextHit=${bt(0x188)} nextDelay=${bt(0x189)} size=${bt(0x18a)} srcDamage=${bt(0x12d)} hitShift=${bt(0x196)} skill=${w(0x194)} qty=${bt(0x18e)} dmg=${d(0xb0)}-${d(0xb4)} elem=${bt(0xe4)}`);
};
for (const i of [2586, 2587, 4505, 4563, 4564, 4565, 5501, 5502, 5503, 5504, 5505]) show(i);
