// Dev check: node scripts/dev/missing-vs-game.mjs — each "no formula" value next to the game's own tooltip lines.
import { readFileSync } from "node:fs";
const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").filter((l) => l.includes("No formula in MedianDB")).map((l) => l.split(" | "));
for (const [id, key] of rows) {
  const s = data.skills[id];
  console.log(`\n${id} · ${key} · MedianDB shows "${data.stats[key]?.format}"`);
  for (const l of s.game?.lines || []) if (l.block !== "synergy" && (l.textA || l.textB)) console.log(`   ${l.block} ${l.type} ${JSON.stringify(l.textA)} ${JSON.stringify(l.textB || "")} | ${l.calcA?.text || ""} | ${l.calcB?.text || ""}`);
}
