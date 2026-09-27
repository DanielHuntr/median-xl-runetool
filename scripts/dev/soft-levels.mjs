// Dev check: node scripts/dev/soft-levels.mjs — for every tree skill, its tooltip values with
// 5 hard points, with and without +20 levels from gear. Flags skills whose formulas use the
// skill level (lvl, or the game's per-level tables) but whose values don't change.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const seen = new Set();
  let checked = 0;
  const flagged = [];
  for (const cls of engine.classNames)
    for (const tab of engine.tabs(cls))
      for (const n of engine.treeNodes(cls, tab)) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        const s = engine.skill(n.id);
        const text = JSON.stringify(s.constants || []) + JSON.stringify(s.game || {});
        // lvl as a variable (not blvl/ulvl), or the game's per-level damage tables and lnN/dmN.
        const usesLevel = /(^|[^bu\w])lvl\b/.test(text) || /\b(ln|dm)\d\d\b/.test(text) || (s.game?.elem?.max || s.game?.phys?.max);
        if (!usesLevel) continue;
        const hard = Math.min(5, engine.maxLevel({ cls, level: 150, points: {}, quests: {} }, n.id)) || 1;
        const b = (soft) => ({ cls, level: 150, points: { [n.id]: hard }, quests: {}, soft: { [n.id]: soft }, charStats: { life: 5000, mana: 2000, energy: 500, strength: 300, dexterity: 300, vitality: 300 } });
        const v0 = JSON.stringify(engine.skillValues(b(0), n.id)), v1 = JSON.stringify(engine.skillValues(b(20), n.id));
        checked++;
        if (v0 === v1) flagged.push(`${cls}/${tab} ${s.name}: ${v0.slice(0, 160)}`);
      }
  console.log(`${checked} skills whose formulas use the skill level; ${flagged.length} don't change with +20 levels:`);
  for (const f of flagged) console.log(" ", f);
} finally { await vite.close(); }
