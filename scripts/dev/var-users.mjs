// Dev check: node scripts/dev/var-users.mjs — for each unmodelled variable, skills whose
// tooltip lines use it, with candidate skills.bin formula fields decoded next to MedianDB.
import { readFileSync } from "node:fs";
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
import { decode, toText } from "../../src/planner/d2calc.js";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const m = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const X = (n) => m.read(`data/global/excel/${n}`);
const sk = readBin(X("skills.bin")), code = X("skillscode.bin"), cb = X("skillcalc.bin");
const names = [...Array(cb.readUInt32LE(0))].map((_, i) => cb.toString("latin1", 4 + i * 4, 8 + i * 4).replace(/\0.*$/, "").trim());
const t = (o) => { if (o <= 0) return String(o); const d = decode([...code.subarray(o, o + 200)]); return d.ok ? toText(d.tokens, names) : "?"; };
const FIELDS = (process.env.FIELDS || "0x5c,0x60,0x64,0x68,0x6c,0x190").split(",").map(Number);
const VARS = (process.argv[2] || "len,rng,skcd,mana,mnar,mnhp,wdm,pdmx,exma").split(",");
const users = {};
for (const s of Object.values(data.skills)) {
  if (!s.game) continue;
  for (const l of s.game.lines) for (const c of [l.calcA, l.calcB]) for (const v of VARS)
    if (c?.text && new RegExp(`\\b${v}\\b`).test(c.text)) (users[v] ??= []).push([s, l.textA, c.text]);
}
for (const [v, list] of Object.entries(users)) {
  console.log(`== ${v} (${list.length} lines)`);
  for (const [s, ta, ct] of list.slice(0, +(process.env.N || 3))) {
    const r = sk.record(s.game.gameId);
    console.log(`  ${s.name} | ${JSON.stringify(ta)} ${ct}`);
    console.log(`     ${FIELDS.map((f) => `0x${f.toString(16)}: ${t(r.readInt32LE(f))}`).join(" | ")}`);
    console.log(`     MedianDB: ${s.constants.map((c) => `${c.key}=${c.values[0]}`).join("; ").slice(0, 200)}`);
  }
}
