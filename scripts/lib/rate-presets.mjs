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

// The Builds page card of a build, for the endgame and each levelling stage alike: its left and
// right skills and what they do against the difficulty's typical monster, gear, the skill icons
// with their hover text, buffs, mercenary, life and mana. (The Builds page has no skill data.)
export function cardSummary(b, { main, right }, env, difficulty = "Hell") {
  const { engine, catalog, planner, computeCharacter, skillDamage, againstTarget, typicalTarget } = env;
  const target = typicalTarget(planner.monsters, difficulty);
  const c = computeCharacter(b, { engine, catalog, planner });
  const sb = { ...b, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats };
  // Per hit: a repeating skill's hits rarely all land on one target.
  const damage = (id) => {
    const d = skillDamage(id, { engine, build: b, skillBuild: sb, character: c });
    const vs = d && againstTarget(d, c, target, difficulty);
    return { d, vs: vs?.total?.[1] ?? 0 };
  };
  const bar = b.skillBar || [];
  return {
    skills: [main, right].filter(Boolean).map((id) => {
      const x = damage(id);
      return { id, name: engine.skillName(id), kind: x.d?.kind, vs: x.vs, ...(x.d?.count ? { count: x.d.count.n } : {}) };
    }),
    gear: Object.entries(b.gear).filter(([slot]) => !slot.endsWith("2")).map(([, st]) => catalog.resolve(st, b.level)?.def.name).filter(Boolean),
    unspent: engine.available(b) - engine.spent(b),
    bar: bar.map((id) => engine.skillName(id)),
    icons: [[main, "Left skill"], [right, "Right skill"], ...bar.map((id) => [id, "Skill bar"])].filter(([id]) => id).map(([id, slot]) => {
      const sk = engine.skill(id), d = damage(id);
      const lines = engine.describe(sb, id, b.points[id] || 0).effect.filter((l) => l.status !== "unknown" && l.text && !l.heading).map((l) => l.text).slice(0, 6);
      return { id, slot, name: sk.name, image: sk.image, points: b.points[id] || 0, soft: c.soft[id] || 0,
        ...(b.buffs.includes(id) ? { active: true } : {}), description: sk.description?.[0] || "", lines,
        ...(d.vs > 0 ? { vs: Math.round(d.vs), per: d.d?.count ? "each" : d.d?.kind === "attack" ? "per hit" : "per cast" } : {}) };
    }),
    buffs: b.buffs.map((id) => engine.skillName(id)),
    // The hired mercenary, for the card (its buff is already in the numbers).
    ...(b.merc ? { merc: b.merc.spec } : {}),
    life: Math.round(c.life.total), mana: Math.round(c.mana.total), difficulty,
  };
}

// The levelling stages rated the same way, each against the other starter builds at the same
// stage (level and difficulty), and given the same card summary as the endgame build:
// stage.rating and stage.summary in the guides (preset-stages.json).
export function rateStages(presets, stages, env) {
  const { buildMetrics, assignTiers } = env.rating;
  const levels = [...new Set(Object.values(stages).flatMap((list) => (list || []).filter((s) => s.build).map((s) => s.level)))];
  for (const level of levels) {
    const at = presets.map((p) => ({ p, s: (stages[p.id] || []).find((x) => x.level === level && x.build) })).filter((x) => x.s);
    const list = at.map(({ p, s }) => {
      const envD = { ...env, difficulty: s.difficulty, target: env.typicalTarget(env.planner.monsters, s.difficulty) };
      return { id: p.id, metrics: buildMetrics(s.build, envD), p, s };
    });
    const tiers = assignTiers(list);
    for (const x of list) {
      x.s.rating = { ...(tiers.get(x.id) || {}), ...x.metrics };
      x.s.summary = cardSummary(x.s.build, { main: x.s.main, right: x.s.right }, env, x.s.difficulty);
    }
  }
  return stages;
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
    target: typicalTarget(planner.monsters, "Hell"), typicalTarget, rating };
}
