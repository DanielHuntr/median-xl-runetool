// Dev check: node scripts/dev/time-recommend.mjs (ENH=1 weapon enhancements, SUP=1 superior bases) — how long gear suggestions take per slot,
// and how many candidate item states each one scores.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const character = await vite.ssrLoadModule("/src/planner/character.js");
  const rec = await vite.ssrLoadModule("/src/planner/recommend.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const fixture = JSON.parse(await readFile("tests/fixtures/assassin-level-97-crucify.json", "utf8"));
  const build = { buffs: [], inventory: [], quests: {}, signets: 0, swap: false, skillBar: [], ...(fixture.build || fixture) };
  let calls = 0;
  const orig = character.computeCharacter;
  const env = { engine, catalog, planner };
  const t0 = performance.now();
  const ch = orig(build, env);
  console.log(`one character computation: ${(performance.now() - t0).toFixed(1)} ms`);
  const profile = rec.buildProfile(build, engine), want = rec.wantedStats(profile, ch);
  const opts = { build, engine, catalog, planner, character: ch, profile, want, weaponEnhancements: process.env.ENH === "1", superior: process.env.SUP === "1" };
  let total = 0;
  for (const slot of character.activeSlots(build)) {
    const t = performance.now();
    const out = rec.recommendForSlot(slot, opts, slot.startsWith("weapon") ? Infinity : 3);
    const ms = performance.now() - t; total += ms;
    console.log(`${slot.padEnd(8)} ${ms.toFixed(0).padStart(6)} ms  ${out.length} results`);
  }
  console.log(`all slots: ${total.toFixed(0)} ms`);
  void calls;
} finally { await vite.close(); }
