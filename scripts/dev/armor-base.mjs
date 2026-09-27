// Dev check: node scripts/dev/armor-base.mjs <name> — armor.bin tiers of a base: finds the
// defense/strength/level fields from the Tier 4 record's known values, then prints each tier.
import { openMpq } from "../lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "../lib/d2tables.mjs";
const mpq = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const tbl = (n) => readTbl(mpq.read(`data/local/lng/eng/${n}`));
const str = stringIndex({ base: tbl("string.tbl"), patch: tbl("patchstring.tbl"), expansion: tbl("expansionstring.tbl") });
const t = readBin(mpq.read("data/global/excel/armor.bin"));
const name = process.argv[2];
const rows = [];
for (let i = 0; i < t.count; i++) {
  const r = t.record(i), n = str(r.readUInt16LE(0xf4))?.replace(/(?:ÿ|Ã¿)c./g, "").trim();
  if (n && n.replace(/\s*\((?:\d+|Sacred)\)$/, "") === name) rows.push([n, r]);
}
const [, t4] = rows.find(([n]) => /\(4\)$/.test(n)) || [];
const find = (v, w = 2) => { const out = []; for (let o = 0; o + w <= t.size; o++) if ((w === 2 ? t4.readUInt16LE(o) : t4[o]) === v) out.push(o); return out; };
console.log("Tier 4 offsets: mindef 610", find(610), "maxdef 820", find(820), "str 454", find(454), "level 26", find(26), "(bytes)", find(26, 1), "qlvl 85", find(85, 1));
const fields = process.argv.slice(3).map((x) => x.split(":")).map(([k, o, w]) => [k, Number(o), Number(w || 2)]);
for (const [n, r] of rows) console.log(n.padEnd(22), fields.map(([k, o, w]) => `${k} ${w === 1 ? r[o] : r.readUInt16LE(o)}`).join("  "));
