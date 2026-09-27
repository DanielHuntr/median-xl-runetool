// Dev check: the store's fillSockets on items equipped by Suggest gear.
import { createServer } from "vite";
import { effectScope } from "vue";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
globalThis.window = { location: { hash: "" }, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = { documentElement: { dataset: {} } };
try {

  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { createPlanner } = await vite.ssrLoadModule("/src/planner/usePlanner.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const p = effectScope().run(() => createPlanner(engine, catalog, planner));
  p.setClass("Amazon"); p.setLevel(120); p.add("stormcall", 5); p.add("askari_lightning", 5);
  for (const slot of ["weapon", "helm", "body", "gloves", "boots", "belt"]) { const r = p.recommend(slot, 1)[0]; if (r) p.equip(slot, r.state); }
  for (const [slot, st] of Object.entries(p.build.value.gear)) {
    const r = catalog.resolve(st, 120);
    console.log(slot.padEnd(7), r.def.name.padEnd(24), r.def.kind.padEnd(9), "sockets", r.socketCount, "/", r.maxSockets, JSON.stringify(st.sockets || []));
  }
  const picks = p.fillSockets();
  console.log("picks:", picks.length, "| message:", p.state.message);
} finally {
  await vite.close();
}
