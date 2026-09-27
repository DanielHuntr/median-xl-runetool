// Dev check: node scripts/dev/check-wdm.mjs — skills.bin 0x1A5 (SrcDam, 128ths) against MedianDB weapon_damage.
import { readFileSync } from "node:fs";
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const sk = readBin(openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`).read("data/global/excel/skills.bin"));
let ok = 0, bad = [];
for (const s of Object.values(data.skills)) {
  const row = s.game && s.constants.find((c) => c.key === "weapon_damage" && !c.variant);
  const v = row && String(row.values[0]).trim();
  if (!v || !/^\d+$/.test(v)) continue;
  const src = sk.record(s.game.gameId)[0x1a5];
  const wdm = Math.trunc((src * 100) / 128);
  if (wdm === +v) ok++;
  else bad.push(`${s.name}: MedianDB ${v}, game ${src}/128 = ${wdm}`);
}
console.log(ok, "match"); console.log(bad.join("\n"));
