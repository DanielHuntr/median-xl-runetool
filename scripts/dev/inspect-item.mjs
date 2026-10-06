// Dev check: one item's docs (or MedianDB) lines, the game's lines and its raw properties.
//   node scripts/dev/inspect-item.mjs "<name>" [uniques|sacred|sets|runewords|inventory] [tier]
import { readFileSync } from "node:fs";
import { gameText } from "../lib/item-text.mjs";

const [name, kind = "sacred", tier = "0"] = process.argv.slice(2);
const g = gameText();
const read = (f) => JSON.parse(readFileSync(new URL(`../../src/data/${f}`, import.meta.url), "utf8"));
const nameOf = (r, o) => g.lines(g.byKey(g.cstr(r, o))).join(": ");
const raw = (r, at, n) => {
  for (let k = 0; k < n; k++) {
    const o = at + 16 * k, p = r.readInt32LE(o);
    if (p < 0) continue;
    const parts = (g.data.props[p] || []).map(([f, s]) => (s >= 0 ? `f${f}→stat${s}(desc ${g.data.stats[s][0]}: ${g.data.stats[s][2]})` : `f${f}`)).join(", ");
    console.log(`   prop ${p} param ${r.readInt32LE(o + 4)} min ${r.readInt32LE(o + 8)} max ${r.readInt32LE(o + 12)}  ${parts}`);
  }
};
let docs = [], rows = [], at = 0x8C, n = 12;
if (kind === "uniques" || kind === "sacred") {
  const u = g.X("uniqueitems.bin", 332);
  for (let i = 0; i < u.count; i++) if (nameOf(u.record(i), 2) === name) rows.push(u.record(i));
  docs = kind === "uniques" ? read("uniques.json").find((x) => x[0] === name)?.[3]?.[+tier]?.split("|") : read("sacred-uniques.json").find((x) => x[0] === name)?.[3]?.split("|");
  if (kind === "uniques") rows = [rows[+tier]];
} else if (kind === "sets") {
  const s = g.X("setitems.bin", 440);
  for (let i = 0; i < s.count; i++) if (nameOf(s.record(i), 2) === name) rows.push(s.record(i));
  docs = read("sets.json").flatMap((x) => x[4]).find((x) => x[0] === name)?.[2]?.split("|");
  at = 0x88; n = 9;
} else if (kind === "runewords") {
  const r = g.X("runes.bin");
  for (let i = 0; i < r.count; i++) { const x = r.record(i); if (g.text(g.byKey(x.toString("latin1", 0, 64).replace(/\0.*$/, ""))) === name) rows.push(x); }
  docs = read("runewords.json").find((x) => x[0] === name)?.[5]?.split("|");
  at = 0xB0;
}
console.log("DOCS:", (docs || []).join(" ; "));
rows.forEach((r, i) => { console.log(`GAME row ${i}:`, g.rowText(r, at, n).join(" ; ")); raw(r, at, n); if (kind === "sets") { console.log("   partial:", g.rowText(r, 0x118, 10).join(" ; ")); } });
