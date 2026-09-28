// Starter build ratings (Builds page) and the generator's measure of a build
// (scripts/build-presets.mjs): damage per second against the typical Hell monster, one at a
// time (bossing) and on packs (clearing), survivability, and whether the build can pay for
// its skills. Tiers S (best) to F rank the starter builds against each other.
// A planner estimate, not a measure of how a build plays: no buffs from other players, no
// procs, and area damage estimated from each skill's tooltip.

// Tiers by rank among the rated builds, best first: the share of builds in each.
export const TIERS = [["S", 0.1], ["A", 0.2], ["B", 0.25], ["C", 0.2], ["D", 0.15], ["F", 0.1]];
// The overall rating: bossing, clearing and survivability (the community tier lists' main
// criteria: single-target damage, farming speed, staying alive).
const WEIGHTS = { boss: 0.4, clear: 0.35, survive: 0.25 };
// How long a fight lasts when a build spends its whole mana pool (the pool counts once per
// fight, on top of regeneration).
const FIGHT_SECONDS = 60;
// The most targets counted for one skill in a pack.
const PACK = 5;

// Hit recovery: frames by faster hit recovery, per class (Diablo II's tables; the Median XL
// build guides quote the same breakpoints: Assassin 7/15/27/48/86/200, Amazon 86/174/600,
// Paladin 7/15/27/48). Median XL's animdata get-hit rows (5 frames) don't give these, so the
// guides' tables are used. [fhr, frames], lowest first.
export const HIT_RECOVERY = {
  Amazon: [[0, 11], [6, 10], [13, 9], [20, 8], [32, 7], [52, 6], [86, 5], [174, 4], [600, 3]],
  Assassin: [[0, 9], [7, 8], [15, 7], [27, 6], [48, 5], [86, 4], [200, 3]],
  Barbarian: [[0, 9], [7, 8], [15, 7], [27, 6], [48, 5], [86, 4], [200, 3]],
  Druid: [[0, 14], [3, 13], [7, 12], [13, 11], [19, 10], [29, 9], [42, 8], [63, 7], [99, 6], [174, 5], [456, 4]],
  Necromancer: [[0, 13], [5, 12], [10, 11], [16, 10], [26, 9], [39, 8], [56, 7], [86, 6], [152, 5], [377, 4]],
  Paladin: [[0, 9], [7, 8], [15, 7], [27, 6], [48, 5], [86, 4], [200, 3]],
  Sorceress: [[0, 15], [5, 14], [9, 13], [14, 12], [20, 11], [30, 10], [42, 9], [60, 8], [86, 7], [142, 6], [280, 5]],
};
export function hitRecoveryFrames(cls, fhr) {
  const t = HIT_RECOVERY[cls];
  if (!t) return null;
  let f = t[0][1];
  for (const [at, frames] of t) if (fhr >= at) f = frames;
  return f;
}

const mid = (r) => ((r?.[0] || 0) + (r?.[1] || 0)) / 2;

// How many monsters of a pack one use of a skill reaches, from its tooltip: "up to N targets",
// an area (a radius, a nova, AoE), or a projectile that pierces. An estimate, capped at PACK.
function targetsOf(sk, text) {
  const n = Number(/up to (\d+) (?:targets|enemies|monsters)/i.exec(text)?.[1] || 0);
  if (n > 1) return Math.min(n, PACK);
  const tags = sk?.tags || [];
  if (tags.includes("AoE") || /radius|nova|area|yards|explod|all enemies|nearby/i.test(text)) return 4;
  if (tags.includes("Projectile") && /pierc/i.test(text)) return 2.5;
  if (tags.includes("Projectile") || tags.includes("Trap") || tags.includes("Totem")) return 1.5;
  return 1;
}

/**
 * One build's numbers.
 * @param b    a planner build
 * @param env  { engine, catalog, planner, computeCharacter, skillDamage, againstTarget, speedProfile, speedData, target }
 * @returns {{ boss, clear, dps, sustain, ehp, life, resist, avoid, block, fhrFrames, movement, skills, skill, perAction, rate, hit, cooldown?, manaSpend, manaIn }
 *   | { unrated, ... }}
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
    const lines = engine.describe(sb, id, b.points[id] || 0).effect.map((l) => l.text || "");
    const text = [...(d.lines || []), ...lines].join(" ");
    const hit = vs?.hit != null ? vs.hit / 100 : 1;
    // Attacks or casts per second, from the game's speed breakpoints.
    const rate = (d.kind === "attack" ? speed?.attack : speed?.cast)?.perSecond || 1;
    const cd = Number(lines.map((l) => /^Cooldown: ([\d.]+) seconds/.exec(l)?.[1]).find(Boolean) || 0);
    const cost = Number(lines.map((l) => /^Mana cost: (\d+)/i.exec(l)?.[1]).find(Boolean) || 0);
    // Damage the tooltip already gives per second (Incineration Trap's fire) is taken as it
    // is; a poison's total is spread over its duration (only the strongest poison sticks).
    const over = /over ([\d.]+) seconds/.exec(text)?.[1];
    const perSecond = /per second/.test(text) || !!over;
    const dps = /per second/.test(text) ? perAction : over ? Math.min(perAction / Number(over), perAction * rate) : perAction * rate * hit;
    return { dps, cd, rate, cost, perSecond, perHit: perAction * hit, targets: targetsOf(engine.skill(id), text),
      skill: engine.skillName(id), perAction: Math.round(perAction), hit: Math.round(hit * 100) };
  };
  // The build's skills in hand and on its bar. A skill with a cooldown is used whenever it's
  // ready (its damage once per cooldown) and the strongest skill without one fills the time
  // between, as a player would. Bossing and clearing pick their own filler.
  const skills = [...new Set([b.leftSkill, b.rightSkill, ...(b.skillBar || [])])].map(one).filter(Boolean);
  const rotation = (reach) => {
    const filler = skills.filter((x) => !x.cd).sort((x, y) => y.dps * reach(y) - x.dps * reach(x))[0] || null;
    let busy = 0, burst = 0, mana = 0;
    const used = [];
    for (const x of skills.filter((x) => x.cd > 0).sort((p, q) => (q.perHit * reach(q)) / q.cd - (p.perHit * reach(p)) / p.cd)) {
      const time = 1 / x.rate / x.cd; // share of each second spent using it
      if (busy + time > 1) continue;
      busy += time;
      burst += (x.perHit * reach(x)) / x.cd;
      mana += x.cost / x.cd;
      used.push(x);
    }
    const share = 1 - busy;
    // A filler whose damage runs on by itself (a poison, a per-second aura) isn't recast
    // every frame: at most once a second for mana.
    if (filler) mana += filler.cost * (filler.perSecond ? 1 : filler.rate) * share;
    return { dps: burst + (filler ? filler.dps * reach(filler) * share : 0), filler, used, mana, share };
  };
  // Mana: the pool once per fight, plus regeneration (maximum mana / 20 × (100 + regeneration
  // %) per second, the formula the Lightning Sorceress guide gives; not checked in game).
  const regen = (c.mana.total / 20) * (100 + c.s("mana_regeneration_rate")) / 100;
  const manaIn = c.mana.total / FIGHT_SECONDS + regen;
  const sustainOf = (r) => (r.mana > 0 ? Math.min(1, manaIn / r.mana) : 1);
  const bossR = rotation(() => 1), clearR = rotation((x) => x.targets);
  const boss = bossR.dps * sustainOf(bossR), clear = clearR.dps * sustainOf(clearR);
  // Survivability: life, over what gets through resistances in Hell (the four elements, then
  // physical resistance), avoid and block, as effective life.
  const el = ["fire", "cold", "lightning", "poison"].map((k) => c.resist[k]?.value ?? 0);
  const elemAvg = el.reduce((n, v) => n + Math.max(-100, Math.min(95, v)), 0) / el.length;
  const phys = Math.max(0, Math.min(95, c.resist.physical?.value ?? 0));
  const avoid = Math.max(0, Math.min(75, c.avoid?.value ?? 0)), block = Math.max(0, Math.min(75, c.block?.value ?? 0));
  const life = c.life.total;
  const ehp = ((life * 100) / (100 - elemAvg)) * (100 / (100 - phys)) / (1 - avoid / 100) / (1 - block / 200);
  const out = { life: Math.round(life), resist: Math.round(elemAvg), avoid: Math.round(avoid), block: Math.round(block), ehp: Math.round(ehp),
    fhrFrames: hitRecoveryFrames(b.cls, c.s("hit_recovery")), fhrBase: HIT_RECOVERY[b.cls]?.[0][1] ?? null, fhrAt86: hitRecoveryFrames(b.cls, 86), movement: Math.round(c.s("movement_speed")),
    manaIn: Math.round(manaIn), mana: Math.round(c.mana.total) };
  // A summon build's damage is mostly its minions', which the planner doesn't estimate: its
  // other skills alone would rate it too low.
  const main = b.leftSkill && skillDamage(b.leftSkill, { engine, build: b, skillBuild: sb, character: c });
  if (main?.kind === "summon") return { ...out, unrated: "Summon build: the planner doesn't estimate minion damage yet" };
  if (!(boss > 0)) return { ...out, unrated: "The planner doesn't estimate this build's damage" };
  // The skill doing most of it, for the card.
  const lead = [bossR.filler && { x: bossR.filler, v: bossR.filler.dps * bossR.share }, ...bossR.used.map((x) => ({ x, v: x.perHit / x.cd }))]
    .filter(Boolean).sort((p, q) => q.v - p.v)[0].x;
  return { ...out, boss: Math.round(boss), clear: Math.round(clear), dps: Math.round(boss),
    sustain: Math.round(sustainOf(bossR) * 100), manaSpend: Math.round(bossR.mana),
    skills: [bossR.filler, ...bossR.used].filter(Boolean).map((x) => x.skill), clearSkills: [clearR.filler, ...clearR.used].filter(Boolean).map((x) => x.skill),
    skill: lead.skill, perAction: lead.perAction, rate: Math.round(lead.rate * 100) / 100, hit: lead.hit, ...(lead.cd ? { cooldown: lead.cd } : {}) };
}

/**
 * The generator's measure of a build: bossing and clearing damage (sustained), survivability,
 * hit recovery frames and movement. Higher is better; only differences matter.
 */
export function buildValue(m, { summonPower = 0 } = {}) {
  const offense = m.unrated ? 60 * Math.log1p(summonPower / 100)
    : 60 * (WEIGHTS.boss / (WEIGHTS.boss + WEIGHTS.clear)) * Math.log1p(m.boss / 100)
      + 60 * (WEIGHTS.clear / (WEIGHTS.boss + WEIGHTS.clear)) * Math.log1p(m.clear / 100);
  const survive = 60 * Math.log1p(m.ehp / 500);
  // Each hit-recovery frame saved (the guides' "86 FHR"), and movement speed, the guides'
  // quality-of-life staples.
  // Frames up to the 86% breakpoint count fully (the guides' usual target); beyond, a third.
  const at86 = m.fhrAt86 ?? m.fhrFrames;
  const recovery = m.fhrFrames != null && m.fhrBase ? 3 * (m.fhrBase - Math.max(m.fhrFrames, at86)) + Math.max(0, at86 - m.fhrFrames) : 0;
  // Up to 60% movement speed (the guides' Spark of Hope and boots target); little beyond.
  const move = 6 * Math.min(1, Math.max(0, m.movement) / 60);
  return offense + survive + recovery + move;
}

/**
 * Tiers for a list of { id, metrics }: overall (bossing, clearing and survivability
 * together) and one per criterion, each ranked among the rated builds, best first.
 * @returns Map id → { tier, rank, of, score, bossTier, clearTier, surviveTier }
 */
export function assignTiers(list) {
  const rated = list.filter((x) => x.metrics && !x.metrics.unrated && x.metrics.boss > 0);
  const tierBy = (value) => {
    const ranked = rated.map((x) => ({ id: x.id, v: value(x.metrics) })).sort((a, b) => b.v - a.v);
    const out = new Map();
    let start = 0;
    TIERS.forEach(([tier, share], i) => {
      const end = i === TIERS.length - 1 ? ranked.length : Math.min(ranked.length, start + Math.round(share * ranked.length));
      for (let k = start; k < end; k++) out.set(ranked[k].id, { tier, rank: k + 1, of: ranked.length, v: ranked[k].v });
      start = end;
    });
    return out;
  };
  const overall = tierBy((m) => m.boss ** WEIGHTS.boss * m.clear ** WEIGHTS.clear * m.ehp ** WEIGHTS.survive);
  const boss = tierBy((m) => m.boss), clear = tierBy((m) => m.clear), survive = tierBy((m) => m.ehp);
  const out = new Map();
  for (const x of rated) {
    const o = overall.get(x.id);
    out.set(x.id, { tier: o.tier, rank: o.rank, of: o.of, score: Math.round(o.v), bossTier: boss.get(x.id).tier, clearTier: clear.get(x.id).tier, surviveTier: survive.get(x.id).tier });
  }
  return out;
}
