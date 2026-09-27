// Dev check: node scripts/dev/tree-vs-game.mjs [game dir]
// Compares the planner's skill trees with the installed game's: skilldesc.bin gives each
// skill's tab (SkillPage, byte 0x02), row (0x03) and column (0x04). Reports skills the game
// places in a tab that the planner lacks, planner skills the game doesn't place, and any
// skill whose tab, row or column differs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openMpq } from "../lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "../lib/d2tables.mjs";
import { createEngine } from "../../src/planner/engine.js";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const X = (n) => mpq.read(`data/global/excel/${n}`);
const tbl = (n) => readTbl(mpq.read(`data/local/lng/eng/${n}`));
const str = stringIndex({ base: tbl("string.tbl"), patch: tbl("patchstring.tbl"), expansion: tbl("expansionstring.tbl") });
const colour = (s) => s?.replace(/(?:ÿ|Ã¿)c./g, "").trim() ?? null;
const skills = readBin(X("skills.bin")), desc = readBin(X("skilldesc.bin"));
const game = JSON.parse(readFileSync(new URL("../../data/game/2.14.4/skills.json", import.meta.url), "utf8")).skills;
const classOf = new Map(Object.values(game).map((g) => [g.gameId, g.class]));

// Every skill the game draws in a class tree: page > 0.
const placed = [];
for (let id = 0; id < skills.count; id++) {
  const d = skills.record(id).readInt16LE(0x194);
  if (d < 0) continue;
  const r = desc.record(d), page = r[2], row = r[3], col = r[4];
  const name = colour(str(r.readUInt16LE(0x08)));
  if (page > 0 && name) placed.push({ id, name, cls: classOf.get(id) ?? null, page, row, col });
}

const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const engine = createEngine(data);
let problems = 0;
for (const cls of engine.classNames) {
  const mine = placed.filter((p) => p.cls === cls);
  const nodes = engine.tabs(cls).flatMap((tab) => engine.treeNodes(cls, tab).map((n) => ({ ...n, tab })));
  // The game's page for each planner tab, from the skills they share.
  const pageOfTab = new Map();
  for (const n of nodes) {
    const g = mine.find((p) => p.name === n.name);
    if (g) pageOfTab.set(n.tab, g.page);
  }
  const tabOfPage = new Map([...pageOfTab].map(([t, p]) => [p, t]));
  const pages = [...new Set(mine.map((p) => p.page))].sort((a, b) => a - b);
  console.log(`${cls}: game pages ${pages.map((p) => `${p}=${tabOfPage.get(p) ?? "?"}(${mine.filter((m) => m.page === p).length})`).join(" ")}`);
  for (const g of mine) {
    const n = nodes.find((x) => x.name === g.name);
    if (!n) { problems++; console.log(`  missing: ${g.name} (page ${g.page}${tabOfPage.has(g.page) ? " " + tabOfPage.get(g.page) : ""}, row ${g.row}, col ${g.col})`); continue; }
    if (pageOfTab.get(n.tab) !== g.page || n.row !== g.row || n.col !== g.col) {
      problems++;
      console.log(`  moved: ${g.name}: planner ${n.tab} r${n.row} c${n.col}, game page ${g.page} r${g.row} c${g.col}`);
    }
  }
  for (const n of nodes)
    if (n.tab !== "Innate" && !mine.some((g) => g.name === n.name)) { problems++; console.log(`  not in the game's trees: ${n.name} (${n.tab})`); }
}
console.log(`${problems} differences`);
