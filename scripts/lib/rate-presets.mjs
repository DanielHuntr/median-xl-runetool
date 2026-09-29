// Rates starter builds (src/planner/rating.js) and stores it on each: summary.rating =
// { tier, rank, of, bossTier, clearTier, surviveTier, boss, clear, ehp, … } or { unrated, … }.
// Used by build-presets.mjs when it publishes and by rate-presets.mjs on its own.
export function ratePresets(presets, env) {
  const { buildMetrics, assignTiers } = env.rating;
  const list = presets.map((p) => ({ id: p.id, metrics: buildMetrics(p.build, env) }));
  const tiers = assignTiers(list);
  for (const p of presets) {
    const m = list.find((x) => x.id === p.id).metrics;
    p.summary = { ...p.summary, rating: { ...(tiers.get(p.id) || {}), ...m } };
  }
  return presets;
}

// A summoner's measure in place of the damage the planner doesn't estimate for summons: its
// summon skills' own numbers (life, damage, count, which points and synergies raise), summed.
// Used by the generator (build-presets.mjs) and the audit (audit-builds.mjs) alike.
export function summonPowerOf(b, ids, { engine, catalog, planner, computeCharacter }) {
  const c = computeCharacter(b, { engine, catalog, planner });
  return ids.filter(Boolean).reduce((n, id) => {
    const v = engine.skillValues({ ...b, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats }, id);
    return n + Object.values(v).flat().filter((x) => typeof x === "number" && x > 0).reduce((a, x) => a + x, 0);
  }, 0);
}

// What rating needs, loaded through Vite (the planner's modules import JSON and .vue-free JS).
export async function ratingEnv(load, planner, data) {
  const { createEngine } = await load("/src/planner/engine.js");
  const { createCatalog } = await load("/src/planner/items.js");
  const { computeCharacter } = await load("/src/planner/character.js");
  const { skillDamage } = await load("/src/planner/damage.js");
  const { againstTarget, typicalTarget } = await load("/src/planner/target.js");
  const { speedProfile } = await load("/src/planner/speed.js");
  const rating = await load("/src/planner/rating.js");
  const speedData = (await load("/src/data/speed.json")).default;
  const engine = createEngine(planner);
  return { engine, catalog: createCatalog(data, planner), planner, computeCharacter, skillDamage, againstTarget, speedProfile, speedData,
    target: typicalTarget(planner.monsters, "Hell"), rating };
}
