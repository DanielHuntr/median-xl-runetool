// Dev check: node scripts/dev/ravage-gear.mjs — why Suggest gear can't fund a Werebear Ravage build.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import { effectScope } from "vue";
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
globalThis.window = { location: { hash: "", href: "http://x/" }, scrollTo() {}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = { documentElement: { dataset: {} } };
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const { createPlanner } = await vite.ssrLoadModule("/src/planner/usePlanner.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const p = effectScope().run(() => createPlanner(engine, catalog, planner));
  p.setClass("Druid"); p.setLevel(120);
  Object.assign(p.build.value.points, { werebear_morph: 25, rend: 1, ravage: 25 });
  for (const buffs of [[], ["werebear_morph"]]) {
    p.build.value.buffs = buffs;
    const c = computeCharacter(p.build.value, { engine, catalog, planner });
    console.log("buffs", buffs, "attr pct", JSON.stringify(Object.fromEntries(Object.entries(c.attributes).map(([a, v]) => [a, v.pct]))), "points", c.statPoints.available);
    p.state.suggestAttributes = true; p.state.allowAttributeRespec = true;
    const r = p.refreshGear({ preview: true });
    await Promise.resolve();
    console.log("  result", r ? `${r.count} items` : r, p.state.message);
  }
} finally { await vite.close(); }
// Second pass: the loadout Suggest gear picks without funding, and what funding it needs.
{
  const vite2 = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
  try {
    const data = await vite2.ssrLoadModule("/src/data/index.js");
    const { createEngine } = await vite2.ssrLoadModule("/src/planner/engine.js");
    const { createCatalog } = await vite2.ssrLoadModule("/src/planner/items.js");
    const { computeCharacter } = await vite2.ssrLoadModule("/src/planner/character.js");
    const { createPlanner } = await vite2.ssrLoadModule("/src/planner/usePlanner.js");
    const A = await vite2.ssrLoadModule("/src/planner/attributeAllocation.js");
    const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
    const engine = createEngine(planner), catalog = createCatalog(data, planner);
    const env = { engine, catalog, planner };
    const p = effectScope().run(() => createPlanner(engine, catalog, planner));
    p.setClass("Druid"); p.setLevel(120);
    Object.assign(p.build.value.points, { werebear_morph: 25, rend: 1, ravage: 25 });
    p.build.value.buffs = ["werebear_morph"];
    p.state.suggestAttributes = false;
    p.refreshGear();
    const b = JSON.parse(JSON.stringify(p.build.value));
    const c = computeCharacter(b, env);
    for (const [slot, st] of Object.entries(b.gear)) { const r = catalog.resolve(st, b.level); console.log(slot, r.def.name, "str", r.head.reqStr, "dex", r.head.reqDex, "lvl", r.head.reqLevel); }
    console.log("attrs", JSON.stringify(Object.fromEntries(Object.entries(c.attributes).map(([a, v]) => [a, [v.base, v.pct, v.total]]))), "points", c.statPoints);
    console.log("fund", JSON.stringify(A.fundLoadout(b, {}, env)));
    const need = Object.values(c.equipped).reduce((r, item) => ({ strength: Math.max(r.strength, item.head.reqStr), dexterity: Math.max(r.dexterity, item.head.reqDex) }), { strength: 0, dexterity: 0 });
    console.log("need", need, "fundRequirements", JSON.stringify(A.fundRequirements({ ...b, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 } }, need, env)));
  } finally { await vite2.close(); }
}
