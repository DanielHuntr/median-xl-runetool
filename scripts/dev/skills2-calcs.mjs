// Dev check: node scripts/dev/skills2-calcs.mjs <skill names…> — skills2.bin formula fields decoded.
import { readFileSync } from "node:fs";
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
import { decode, toText } from "../../src/planner/d2calc.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const m = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const X = (n) => m.read(`data/global/excel/${n}`);
const s2 = readBin(X("skills2.bin")), code = X(process.env.CODE || "skillscode.bin"), cb = X("skillcalc.bin");
const names = [...Array(cb.readUInt32LE(0))].map((_, i) => cb.toString("latin1", 4 + i * 4, 8 + i * 4).replace(/\0.*$/, "").trim());
const t = (o) => { if (o < 0) return "-"; const d = decode([...code.subarray(o, o + 200)]); return d.ok ? toText(d.tokens, names) : "?" + d.reason; };
for (const n of process.argv.slice(2)) {
  const s = Object.values(data.skills).find((x) => x.name === n);
  const r = s2.record(s.game.gameId);
  const md = ["mana_cost", "cooldown", "duration"].map((k) => `${k}=${s.constants.find((c) => c.key === k)?.values.filter(Boolean).join(",")}`).join(" ");
  console.log(`${n} | ${md}\n   0x32: ${t(r.readInt32LE(0x32))} | 0x36: ${t(r.readInt32LE(0x36))} | 0x3a: ${t(r.readInt32LE(0x3a))} | 0x3e: ${t(r.readInt32LE(0x3e))}`);
}
