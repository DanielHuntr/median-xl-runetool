import { applyRolls, parseLine } from "../../src/planner/statparse.js";
import fs from "node:fs";
const R = (f) => JSON.parse(fs.readFileSync(new URL("../../src/data/" + f, import.meta.url), "utf8"));
const P = JSON.parse(fs.readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
// Longest names first so "Summon Shadow Warriors" wins over "Summon Shadow".
const skillByName = new Map(
  Object.entries(P.skillNames)
    .map(([id, n]) => [n.toLowerCase(), id])
    .sort((a, b) => b[0].length - a[0].length),
);
const lines = [];
for (const u of R("uniques.json")) for (const t of u[3]) lines.push(...t.split("|"));
for (const u of R("sacred-uniques.json")) lines.push(...u[3].split("|"));
for (const s of R("sets.json")) { lines.push(...s[3].split("|").filter((l) => !/^Set Bonus/.test(l))); for (const i of s[4]) lines.push(...i[2].split("|")); }
for (const w of R("runewords.json")) lines.push(...w[5].split("|"));
for (const s of R("socketables.json")) for (const x of s.slice(3, 6)) lines.push(...(x || "").split("|"));
for (const i of P.inventory) lines.push(...i.lines);
const kinds = {}, unk = {};
for (const l of lines) {
  const r = parseLine(applyRolls(l).text, { level: 100, skillByName });
  kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  if (r.kind === "unknown" || r.kind === "oskill") { const t = r.kind + "  " + r.text.replace(/-?\d+(\.\d+)?/g, "#"); unk[t] = (unk[t] || 0) + 1; }
}
console.log(lines.length, kinds);
const counted = lines.length - (kinds.unknown || 0);
console.log("recognised", (counted / lines.length * 100).toFixed(1) + "%");
console.log(Object.entries(unk).sort((a, b) => b[1] - a[1]).slice(0, 70).map((x) => x[1] + "  " + x[0]).join("\n"));
