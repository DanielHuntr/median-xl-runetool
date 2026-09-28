// Starter build tiers (Builds page): each build's estimated damage per second and
// survivability in Hell, and a tier from S (best) to F against the other starter builds.
// A planner estimate, not a measure of how a build plays: one target at a time (area damage
// and extra targets aren't counted), the typical Hell monster, no buffs from other players.

// Tiers by rank among the rated builds, best first: the share of builds in each.
export const TIERS = [["S", 0.1], ["A", 0.2], ["B", 0.25], ["C", 0.2], ["D", 0.15], ["F", 0.1]];
// How much each counts: damage most, survivability as a quarter.
const DAMAGE_WEIGHT = 0.75;

const mid = (r) => ((r?.[0] || 0) + (r?.[1] || 0)) / 2;

/**
 * One build's numbers.
 * @param b    a planner build
 * @param env  { engine, catalog, planner, computeCharacter, skillDamage, againstTarget, speedProfile, speedData, target }
 * @returns {{ dps, skill, perAction, rate, hit, ehp, life, resist } | { unrated, ehp, life, resist }}
 */
export function buildMetrics(b, env) {
  const { engine, catalog, planner, computeCharacter, skillDamage, againstTarget, speedProfile, speedData, target } = env;
  const c = computeCharacter(b, { engine, catalog, planner });
  const sb = { ...b, soft: c.soft, charStats: c.charStats };
  const speed = speedProfile(speedData, b.cls, c.weapon?.def.base ?? null, { ias: c.s("attack_speed"), fcr: c.s("cast_speed") });
  const one = (id) => {
    const d = id && skillDamage(id, { engine, build: b, skillBuild: sb, character: c });
    if (!d || !["attack", "spell"].includes(d.kind) || !(d.total?.[1] > 0)) return null;
    const vs = againstTarget(d, c, target, "Hell", b.level);
    const perAction = mid(vs?.all ?? vs?.total);
    if (!(perAction > 0)) return null;
    const text = (d.lines || []).join(" ");
    const hit = vs?.hit != null ? vs.hit / 100 : 1;
    // Attacks or casts per second, from the game's speed breakpoints.
    const rate = (d.kind === "attack" ? speed?.attack : speed?.cast)?.perSecond || 1;
    const cd = Number(engine.describe(sb, id, b.points[id] || 0).effect.map((l) => /^Cooldown: ([\d.]+) seconds/.exec(l.text)?.[1]).find(Boolean) || 0);
    // Damage the tooltip already gives per second (Incineration Trap's fire) is taken as it
    // is; a poison's total is spread over its duration (recasting doesn't stack it).
    const over = /over ([\d.]+) seconds/.exec(text)?.[1];
    const dps = /per second/.test(text) ? perAction : over ? Math.min(perAction / Number(over), perAction * rate) : perAction * rate * hit;
    return { dps, cd, rate, perHit: perAction * hit, skill: engine.skillName(id), perAction: Math.round(perAction), hit: Math.round(hit * 100) };
  };
  // The build's skills in hand and on its bar. A skill with a cooldown is used whenever it's
  // ready (its damage once per cooldown) and the strongest skill without one fills the time
  // between, as a player would.
  const skills = [...new Set([b.leftSkill, b.rightSkill, ...(b.skillBar || [])])].map(one).filter(Boolean);
  const filler = skills.filter((x) => !x.cd).sort((x, y) => y.dps - x.dps)[0] || null;
  let busy = 0, burst = 0;
  const used = [];
  for (const x of skills.filter((x) => x.cd > 0).sort((p, q) => q.perHit / q.cd - p.perHit / p.cd)) {
    const time = 1 / x.rate / x.cd; // share of each second spent using it
    if (busy + time > 1) continue;
    busy += time;
    burst += x.perHit / x.cd;
    used.push(x);
  }
  const dps = burst + (filler ? filler.dps * (1 - busy) : 0);
  // Survivability: life, over what gets through resistances in Hell (the four elements, then
  // physical resistance), as effective life.
  const el = ["fire", "cold", "lightning", "poison"].map((k) => c.resist[k]?.value ?? 0);
  const elemAvg = el.reduce((n, v) => n + Math.max(-100, Math.min(95, v)), 0) / el.length;
  const phys = Math.max(0, Math.min(95, c.resist.physical?.value ?? 0));
  const life = c.life.total;
  const ehp = ((life * 100) / (100 - elemAvg)) * (100 / (100 - phys));
  const out = { life: Math.round(life), resist: Math.round(elemAvg), ehp: Math.round(ehp) };
  // A summon build's damage is mostly its minions', which the planner doesn't estimate: its
  // other skills alone would rate it too low.
  const main = b.leftSkill && skillDamage(b.leftSkill, { engine, build: b, skillBuild: sb, character: c });
  if (main?.kind === "summon") return { ...out, unrated: "Summon build: the planner doesn't estimate minion damage yet" };
  if (!(dps > 0)) return { ...out, unrated: "The planner doesn't estimate this build's damage" };
  // The skill doing most of it, for the card.
  const lead = [filler && { x: filler, v: filler.dps * (1 - busy) }, ...used.map((x) => ({ x, v: x.perHit / x.cd }))].filter(Boolean).sort((p, q) => q.v - p.v)[0].x;
  return { ...out, dps: Math.round(dps), skills: [filler, ...used].filter(Boolean).map((x) => x.skill), skill: lead.skill,
    perAction: lead.perAction, rate: Math.round(lead.rate * 100) / 100, hit: lead.hit, ...(lead.cd ? { cooldown: lead.cd } : {}) };
}

/**
 * Tiers for a list of { id, metrics }: rated builds are ranked by their score, best first.
 * @returns Map id → { tier, rank, of, score }
 */
export function assignTiers(list) {
  const rated = list.filter((x) => x.metrics && !x.metrics.unrated && x.metrics.dps > 0);
  const score = (m) => m.dps ** DAMAGE_WEIGHT * m.ehp ** (1 - DAMAGE_WEIGHT);
  const ranked = rated.map((x) => ({ id: x.id, score: score(x.metrics) })).sort((a, b) => b.score - a.score);
  const out = new Map();
  let start = 0;
  TIERS.forEach(([tier, share], i) => {
    const end = i === TIERS.length - 1 ? ranked.length : Math.min(ranked.length, start + Math.round(share * ranked.length));
    for (let k = start; k < end; k++) out.set(ranked[k].id, { tier, rank: k + 1, of: ranked.length, score: Math.round(ranked[k].score) });
    start = end;
  });
  return out;
}
