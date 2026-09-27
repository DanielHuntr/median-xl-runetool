// Dev check: node scripts/dev/socket-check.mjs — gear an Askari Amazon with the top picks,
// then fill every empty socket; prints picks and resistances before/after.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter, activeSlots } = await vite.ssrLoadModule("/src/planner/character.js");
  const R = await vite.ssrLoadModule("/src/planner/recommend.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const build = { cls: "Amazon", level: 120, points: { askari_lightning: 25, stormcall: 20 }, quests: {}, attrs: { strength: 100, dexterity: 100, vitality: 200, energy: 200 }, signets: 0, difficulty: "Hell", gear: {}, swap: false, inventory: [], buffs: [] };
  const profile = R.buildProfile(build, engine);
  for (const slot of activeSlots(build)) {
    const character = computeCharacter(build, { engine, catalog, planner });
    const rec = R.recommendForSlot(slot, { build, engine, catalog, planner, character, profile, want: R.wantedStats(profile, character) }, 1)[0];
    if (rec && !(slot === "offhand" && character.weapon?.twoHanded)) build.gear[slot] = rec.state;
  }
  const res = (b) => Object.entries(computeCharacter(b, { engine, catalog, planner }).resist).filter(([k]) => ["fire", "cold", "lightning", "poison"].includes(k)).map(([k, r]) => `${k} ${r.value}/${r.max}`).join(", ");
  console.log("before:", res(build));
  const t = Date.now();
  const { gear, picks } = R.suggestSockets({ build, engine, catalog, planner, computeCharacter, activeSlots, profile });
  console.log(`${picks.length} sockets in ${Date.now() - t} ms`);
  for (const p of picks) console.log(`  ${p.slot}[${p.index}] ${p.name} — ${p.reasons.join(" · ")}`);
  console.log("after: ", res({ ...build, gear }));
} finally {
  await vite.close();
}
