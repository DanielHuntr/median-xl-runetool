// Dev check: node scripts/dev/suggest-check.mjs — profile and top suggestions for an
// Amazon Askari Lightning + Stormcall build.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const { buildProfile, wantedStats, recommendForSlot, describeProfile } = await vite.ssrLoadModule("/src/planner/recommend.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const build = { cls: "Amazon", level: 120, points: { askari_lightning: 25, stormcall: 20 }, quests: {}, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 }, signets: 0, difficulty: "Hell", gear: {}, swap: false, inventory: [], buffs: [] };
  const character = computeCharacter(build, { engine, catalog, planner });
  const profile = buildProfile(build, engine);
  const want = wantedStats(profile, character);
  const sum = describeProfile(profile);
  console.log("scales with:", sum.scalesWith, "| synergy skills:", sum.synergySkills, "| roles:", sum.roles.map((r) => r.name));
  console.log("worth: energy", want.energy?.toFixed(2), "spell_focus", want.spell_focus?.toFixed(2), "lightning_spell_damage", want.lightning_spell_damage?.toFixed(2));
  for (const slot of ["amulet", "helm", "weapon"]) {
    const recs = recommendForSlot(slot, { build, engine, catalog, planner, character, profile, want }, 3);
    console.log(`\n${slot}:`);
    for (const r of recs) console.log(`  ${r.def.name} — ${r.reasons.join(" · ")}`);
  }
} finally {
  await vite.close();
}
