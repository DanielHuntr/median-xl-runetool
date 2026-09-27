// Dev check: node scripts/dev/monsters.mjs <ids…|name> — monstats.bin records by id or name.
import { openMpq } from "../lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "../lib/d2tables.mjs";
const m = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const tbl = (n) => readTbl(m.read(`data/local/lng/eng/${n}`));
const str = stringIndex({ base: tbl("string.tbl"), patch: tbl("patchstring.tbl"), expansion: tbl("expansionstring.tbl") });
const ms = readBin(m.read("data/global/excel/monstats.bin"));
console.log("monstats.bin", ms.count, "records of", ms.size, "bytes");
const name = (i) => str(ms.record(i).readUInt16LE(0x06))?.replace(/(?:ÿ|Ã¿)c./g, "");
const args = process.argv.slice(2);
const ids = args.every((a) => /^\d+$/.test(a)) ? args.map(Number) : [...Array(ms.count).keys()].filter((i) => new RegExp(args.join(" "), "i").test(name(i) || ""));
for (const i of ids.slice(0, 20)) {
  const r = ms.record(i);
  console.log(`${i} ${JSON.stringify(name(i))} code ${JSON.stringify(r.toString("latin1", 0x10, 0x14))}`);
}
