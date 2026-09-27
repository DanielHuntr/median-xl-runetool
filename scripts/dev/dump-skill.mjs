// Dev check: node scripts/dev/dump-skill.mjs <table> <from> <to> <skill names…> — raw bytes of skill records.
import { readFileSync } from "node:fs";
import { openMpq } from "../lib/mpq.mjs";
import { readBin } from "../lib/d2tables.mjs";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const m = openMpq(`${process.env.MXL_DIR || "C:/games/median-xl"}/medianxl-YmludGJsdHh0.mpq`);
const [table, from, to, ...names] = process.argv.slice(2);
const t = readBin(m.read(`data/global/excel/${table}`));
for (const n of names) {
  const s = Object.values(data.skills).find((x) => x.name === n);
  const r = t.record(s.game.gameId);
  const mana = s.constants.find((c) => c.key === "mana_cost")?.values.join(",");
  console.log(n.padEnd(18), (mana || "").padEnd(12), [...r.subarray(Number(from), Number(to))].map((b) => b.toString(16).padStart(2, "0")).join(" "));
}
