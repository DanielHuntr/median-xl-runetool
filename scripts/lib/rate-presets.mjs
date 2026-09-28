// Rates starter builds (src/planner/rating.js) and stores it on each: summary.rating =
// { tier, rank, of, bossTier, clearTier, surviveTier, boss, clear, ehp, … } or { unrated, … },
// and found.rating for the found-gear version.
// Used by build-presets.mjs when it publishes and by rate-presets.mjs on its own.
export function ratePresets(presets, env) {
  const { buildMetrics, assignTiers } = env.rating;
  const list = presets.map((p) => ({ id: p.id, metrics: buildMetrics(p.build, env) }));
  const tiers = assignTiers(list);
  for (const p of presets) {
    const m = list.find((x) => x.id === p.id).metrics;
    p.summary = { ...p.summary, rating: { ...(tiers.get(p.id) || {}), ...m } };
  }
  // Found-gear versions: rated the same way, ranked among themselves.
  const found = presets.filter((p) => p.found?.build).map((p) => ({ id: p.id, metrics: buildMetrics(p.found.build, env) }));
  const foundTiers = assignTiers(found);
  for (const p of presets) {
    const m = found.find((x) => x.id === p.id)?.metrics;
    if (m) p.found = { ...p.found, rating: { ...(foundTiers.get(p.id) || {}), ...m } };
  }
  return presets;
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
