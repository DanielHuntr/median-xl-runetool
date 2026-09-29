// Starter build ratings (Builds page) and the generator's measure of a build
// (scripts/build-presets.mjs): damage per second against the difficulty's typical boss, one at
// a time (bossing), and its typical monster on packs (clearing), survivability, and whether the
// build can pay for its skills. Tiers S (best) to F rank the starter builds against each other.
// Counted as the build guides do: resistance debuffs and curses the build has learned, and
// items' "chance to cast … on striking / on melee attack" procs; a summoner by its minions.
// A planner estimate, not a measure of how a build plays: no buffs from other players, no
// on-kill procs, and area damage estimated from each skill's tooltip.
import { typicalBoss } from "./target.js";

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
// Monster to-hit from the game's tables (monstats × monlvl) is about 6× lower than the Warcry
// Barbarian guide's figure: "825k defense at level 140 reaches the 5% chance-to-be-hit floor"
// needs ~43 000 to-hit, the tables give ~7 500. Median XL scales monster accuracy somewhere
// the planner doesn't read; this factor matches the guide. Calibrated, not checked in game.
const MONSTER_TO_HIT = 5.8;

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

// The typical boss of the rated difficulty (target.js), once per monster list.
const bossCache = new WeakMap();
function bossTargetOf(env) {
  if (env.bossTarget) return env.bossTarget;
  const monsters = env.planner?.monsters;
  if (!monsters?.length) return env.target;
  const d = env.difficulty || "Hell";
  let byDifficulty = bossCache.get(monsters);
  if (!byDifficulty) bossCache.set(monsters, (byDifficulty = {}));
  return (byDifficulty[d] ??= typicalBoss(monsters, d));
}

const ELEMENTAL = ["fire", "cold", "lightning", "poison"];
const RESISTS = ["fire", "cold", "lightning", "poison", "magic", "physical"];
// Whether the planner already puts a skill's enemy-resistance effect on the character (a
// buff whose line is a stat: Elemental Wisdom, Howl of the Spirits), once per skill.
const appliedCache = new Map();
function alreadyApplied(id, env) {
  if (appliedCache.has(id)) return appliedCache.get(id);
  const { engine, catalog, planner, computeCharacter } = env;
  let applied = false;
  try {
    const b = { cls: planner.skills?.[id]?.class, level: 150, points: { [id]: 20 }, quests: {}, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
      gear: {}, inventory: [], buffs: [id], signets: 0, difficulty: "Hell", skillBar: [id] };
    const c = computeCharacter(b, { engine, catalog, planner });
    applied = RESISTS.some((e) => c.s(`enemy_${e}_resistance`) !== 0);
  } catch { /* can't be built on its own: counted as not applied */ }
  appliedCache.set(id, applied);
  return applied;
}
const sum = (o) => Object.values(o).reduce((n, v) => n + v, 0);
/**
 * Enemy resistance the build's learned (or item-granted) debuffs, curses and buffs take off a target, beyond what
 * the planner already counts on the character, from each skill's effect lines ("Enemy
 * Elemental Resistances: -20%", "-25% Enemy Magic Resistance"). Debuffs and buffs add up; only
 * one curse holds at a time (the strongest). Lines without a number (Miasma, Spellbind) aren't
 * counted. { fire, cold, … } in points.
 */
function debuffsOf(b, sb, env) {
  const { engine, planner } = env;
  const out = Object.fromEntries(RESISTS.map((e) => [e, 0]));
  let curse = null;
  // Learned skills, and ones an item grants (character.js itemSkills) at the item's level.
  for (const [id, pts] of Object.entries({ ...(sb.itemSkills || {}), ...(b.points || {}) })) {
    if (!(pts > 0)) continue;
    const tags = planner.skills?.[id]?.tags || [];
    const kind = tags.includes("Curse") ? "curse" : tags.includes("Debuff") ? "debuff" : tags.includes("Buff") && !tags.includes("Passive") ? "buff" : null;
    if (!kind || (kind === "buff" && alreadyApplied(id, env))) continue;
    const cut = Object.fromEntries(RESISTS.map((e) => [e, 0]));
    let lines = [];
    try { lines = engine.describe(sb, id, pts).effect.map((l) => l.text || ""); } catch { continue; }
    for (const t of lines) {
      if (!/Enemy/i.test(t) || !/Resist/i.test(t) || /Pierces|Damage Taken/i.test(t)) continue;
      const n = Number(/-\s*(\d+)%/.exec(t)?.[1] || 0);
      if (!n) continue;
      const els = /Elemental/i.test(t) ? ELEMENTAL : RESISTS.filter((e) => new RegExp(e, "i").test(t));
      for (const e of els) cut[e] = Math.max(cut[e], n);
    }
    if (kind === "curse") { if (!curse || sum(cut) > sum(curse)) curse = cut; }
    else for (const e of RESISTS) out[e] += cut[e];
  }
  if (curse) for (const e of RESISTS) out[e] += curse[e];
  return out;
}

// "10% Chance to cast level 18 Crucify on Melee Attack": procs a build's own attacks trigger.
// A proc casts at its stated level without synergies (the Oskill Index); on-kill, on-death-blow
// and when-struck procs aren't counted (they need a kill or hit rate the planner doesn't have).
const PROC = /^(\d+)% Chance to cast level (\d+) (.+?) on (Striking|Melee Attack|Attack)$/;
const skillIdCache = new WeakMap();
function skillIdByName(planner, name) {
  let m = skillIdCache.get(planner);
  if (!m) skillIdCache.set(planner, (m = new Map(Object.entries(planner.skills || {}).map(([id, s]) => [s.name, id]))));
  return m.get(name);
}
function procsOf(c, planner) {
  const out = [];
  for (const r of Object.values(c.equipped || {})) {
    const texts = [...(r?.parsed || []).map((p) => p.text), ...(r?.sockets || []).filter(Boolean).flatMap((x) => x.lines || [])];
    for (const t of texts) {
      const m = PROC.exec(t || "");
      const id = m && skillIdByName(planner, m[3]);
      if (id) out.push({ id, chance: Number(m[1]) / 100, level: Number(m[2]), on: m[4] });
    }
  }
  return out;
}

// Item effects on a build's own skill ("Hammer of Zerae: +2 Projectiles", "+25% Damage to
// Vessel of Justice", "Hammer of Zerae: Deals Weapon Damage in an Area as it Travels"). The
// game applies these in its own code, not in the skill formulas the data files carry, so they're
// read from their wording: a number is used as given; an effect in words only is assumed
// (listed in `assumed`, shown as such): an area or explosion reaches a pack when clearing, a
// conditional one ("if you've blocked recently") holds half the time, "Enhances" is taken as
// +10%. Weapon-wide effects count for attacks ("Area Effect Attack", "Ignore Target's Defense"),
// and restrictions too ("Deal no Elemental Damage"; spells, where only melee, summon and support
// skills may be used). A skill "Nullified" is lost.
const AREA = /in an Area|Area Effect|Explod|Nova|area/i;
// Skills whose missile drops damaging bursts as it travels, from the game's missiles.bin
// (scripts/dev/decode-missiles.mjs): a monster is hit by the bursts dropped while the missile is
// within the burst's reach of it, not by all of them. An estimate (shown as assumed): the
// missile's speed and the burst's radius in Diablo II's usual units (eighths of a sub-tile a
// frame; sub-tiles), passing a monster once or twice as it spirals out.
//   Hammer of Zerae (missile 2586, "blessedhammer"): 85 frames at speed 35-84, a lightning nova
//   (2587, radius 3) every frame: about 3 hits on a monster in its path. With "Deals Weapon
//   Damage in an Area as it Travels" (Echoing Fury; missile 5502): a weapon damage burst (5504,
//   radius 1) every 2 frames: about 2. (Every burst hitting would be 85 and 42: the Sin War
//   ladder's Storm Amazons, few and middling, don't bear that out.)
const TRAVEL_HITS = { hammer_of_zerae: { hits: 3, travelling: 2 } };
function itemEffectsOn(id, kind, c, engine) {
  const fx = { mult: 1, adds: [], targetsAdd: 0, targetsMult: 1, minTargets: 0, cdCut: 0, nullified: false, physicalOnly: false, ignoreDefense: false, hits: 1, assumed: [] };
  const travel = TRAVEL_HITS[id];
  if (travel) { fx.hits = travel.hits; fx.minTargets = 4; }
  const name = engine.skillName(id);
  const own = [...(c.skillmods || []).filter((m) => m.id === id).map((m) => m.text),
    ...(c.unknown || []).map((u) => u.text).filter((t) => name && t.includes(name))];
  const weapon = (c.features || []).map((f) => f.text);
  const all = [...own, ...weapon, ...(c.unknown || []).map((u) => u.text)];
  if (all.some((t) => /Deal no Elemental Damage/i.test(t))) { fx.physicalOnly = true; fx.assumed.push("Deal no Elemental Damage: fire, cold, lightning and poison lost; a conversion to them doesn't happen, the physical damage kept whole"); }
  if (kind === "spell" && all.some((t) => /May Only use Melee, Summon and Support Skills/i.test(t))) fx.nullified = true;
  if (kind === "attack") {
    if (weapon.some((t) => /^Ignore Target's Defense$/i.test(t))) fx.ignoreDefense = true;
    if (weapon.some((t) => /^Area Effect Attack$/i.test(t))) { fx.minTargets = Math.max(fx.minTargets, 4); fx.assumed.push("Area Effect Attack: reaches a pack"); }
  }
  for (const t of own) {
    const half = /recently|if you|while |when /i.test(t) ? 0.5 : 1;
    const num = (re) => Number(re.exec(t)?.[1] || 0) * half;
    if (/Nullified/i.test(t)) { fx.nullified = true; continue; }
    if (travel && /as it Travels/i.test(t)) { fx.hits = travel.travelling; continue; }
    let used = false;
    const pct = num(/\+([\d.]+)% (?:Bonus )?(?:Total )?(?:\w+ )?Damage(?: Multiplier)?(?: to)?/i);
    if (pct) { fx.mult *= 1 + pct / 100; used = true; }
    const flat = /Adds? ([\d.]+)(?:-([\d.]+))? (Fire|Cold|Lightning|Poison|Magic|Physical)? ?Damage/i.exec(t);
    if (flat) { fx.adds.push({ avg: ((Number(flat[1]) + Number(flat[2] || flat[1])) / 2) * half, element: (flat[3] || "physical").toLowerCase() }); used = true; }
    const more = num(/\+([\d.]+) (?:[\w' ]+ )?(?:Projectiles?|Targets?)/i);
    if (more) { fx.targetsAdd += more; used = true; }
    const morePct = num(/(?:projectiles|targets)[^%]*increased by ([\d.]+)%/i);
    if (morePct) { fx.targetsMult *= 1 + morePct / 100; used = true; }
    const pierce = num(/([\d.]+)% Pierce Chance/i);
    if (pierce) { fx.targetsMult *= 1 + pierce / 100; used = true; }
    const area = num(/area increased by ([\d.]+)%/i);
    if (area) { fx.targetsMult *= 1 + area / 200; used = true; }
    const cd = num(/Cooldown Reduced by ([\d.]+) seconds?/i);
    if (cd) { fx.cdCut += cd; used = true; }
    if (used) continue;
    if (/Enhances/i.test(t)) { fx.mult *= 1 + 0.1 * half; fx.assumed.push(`${t}: taken as +10%`); }
    else if (AREA.test(t)) { fx.minTargets = Math.max(fx.minTargets, 4); fx.assumed.push(`${t}: reaches a pack`); }
    else if (/Pierce/i.test(t)) { fx.minTargets = Math.max(fx.minTargets, 2.5); fx.assumed.push(`${t}: reaches a few`); }
  }
  if (travel) fx.assumed.push(`${name}: about ${fx.hits} of the bursts it drops as it travels hit a monster in its path (estimated from the game's missile data)`);
  return fx;
}

/**
 * One build's numbers.
 * @param b    a planner build
 * @param env  { engine, catalog, planner, computeCharacter, skillDamage, againstTarget, speedProfile, speedData, target,
 *   difficulty } — target: the typical monster of that difficulty (Hell unless given)
 * @returns {{ boss, clear, dps, sustain, ehp, life, resist, avoid, block, fhrFrames, movement, skills, skill, perAction, rate, hit, cooldown?, manaSpend, manaIn }
 *   | { unrated, ... }}
 */
export function buildMetrics(b, env) {
  const { engine, catalog, planner, computeCharacter, skillDamage, againstTarget, speedProfile, speedData, target } = env;
  const c = computeCharacter(b, { engine, catalog, planner });
  const sb = { ...b, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats };
  // The build's debuffs and curses on the target (debuffsOf): pierce for the elements, the
  // target's own physical resistance for physical (pierce doesn't apply to physical damage).
  const debuff = debuffsOf(b, sb, env);
  const cD = RESISTS.some((e) => e !== "physical" && debuff[e])
    ? { ...c, s: (k) => { const e = /^enemy_(\w+)_resistance$/.exec(k)?.[1]; return c.s(k) + (e && e !== "physical" ? debuff[e] || 0 : 0); } } : c;
  const lowered = (t) => (debuff.physical && t?.res?.physical ? { ...t, res: { ...t.res, physical: t.res.physical.map((v) => v - debuff.physical) } } : t);
  const clearTarget = lowered(target), bossTarget = lowered(bossTargetOf(env));
  const speed = speedProfile(speedData, b.cls, c.weapon?.def.base ?? null, { ias: c.s("attack_speed"), fcr: c.s("cast_speed") });
  const dmgCache = new Map();
  const dmg = (id) => {
    if (!dmgCache.has(id)) dmgCache.set(id, id ? skillDamage(id, { engine, build: b, skillBuild: sb, character: c }) : null);
    return dmgCache.get(id);
  };
  const assumed = [];
  const dk = { Normal: 0, Nightmare: 1, Hell: 2 }[env.difficulty || "Hell"] ?? 2;
  const one = (id, tgt, isBoss = false) => {
    const d = dmg(id);
    if (!d || !["attack", "spell"].includes(d.kind) || !(d.total?.[1] > 0)) return null;
    const fx = itemEffectsOn(id, d.kind, c, engine);
    if (fx.nullified) return null;
    const lines = engine.describe(sb, id, b.points[id] || 0).effect.map((l) => l.text || "");
    // "Deal no Elemental Damage" (Echoing Fury): fire, cold, lightning and poison are lost, and a
    // skill's conversion of physical damage to them (Hammer of Zerae's 25% to lightning) is
    // assumed not to happen, so its physical part is whole.
    const converted = Number(lines.map((l) => /^Converts ([\d.]+)% Physical Damage/i.exec(l)?.[1]).find(Boolean) || 0) / 100;
    const dd = fx.physicalOnly
      ? { ...d, parts: d.parts.filter((p) => !ELEMENTAL.includes(p.element)).map((p) => (p.element === "physical" && converted < 1 ? { ...p, range: p.range.map((v) => v / (1 - converted)) } : p)) }
      : d;
    if (!dd.parts.length) return null;
    const vs = againstTarget(dd, cD, tgt, env.difficulty || "Hell", b.level);
    // One hit: a skill that repeats (bolts, arrows, beams) rarely lands them all on one target;
    // a missile that damages again and again as it travels (TRAVEL_HITS) counts each burst.
    const base = mid(vs?.total);
    const res = (e) => Math.max(-100, Math.min(95, (tgt?.res?.[e]?.[dk] ?? 0) - (e === "physical" ? 0 : cD.s(`enemy_${e}_resistance`) || 0)));
    // An attack's weapon poison (Curare, poison on the weapon) doesn't add up hit by hit: only
    // the strongest poison ticks, and hitting again refreshes it (the Poison Mechanics guide).
    // It counts once, as its total over its duration a second; the rest counts per hit.
    const poisonSeconds = d.kind === "attack" ? c.damage?.weaponPoison?.seconds || 0 : 0;
    const poisonParts = poisonSeconds > 0 ? (vs?.parts || []).filter((p) => p.element === "poison") : [];
    const poison = poisonParts.length ? mid([poisonParts.reduce((n, p) => n + p.range[0], 0), poisonParts.reduce((n, p) => n + p.range[1], 0)]) * fx.mult : 0;
    const perAction = ((base * fx.mult - poison) + fx.adds.reduce((n, a) => n + a.avg * (1 - res(a.element) / 100), 0)) * fx.hits;
    const poisonDps = poison > 0 ? poison / poisonSeconds : 0;
    if (!(perAction > 0) && !(poisonDps > 0)) return null;
    const text = [...(d.lines || []), ...lines].join(" ");
    const hit = fx.ignoreDefense && d.kind === "attack" ? 1 : vs?.hit != null ? vs.hit / 100 : 1;
    // Attacks or casts per second, from the game's speed breakpoints.
    const rate = (d.kind === "attack" ? speed?.attack : speed?.cast)?.perSecond || 1;
    const cd = Math.max(0, Number(lines.map((l) => /^Cooldown: ([\d.]+) seconds/.exec(l)?.[1]).find(Boolean) || 0) - fx.cdCut);
    for (const t of fx.assumed) if (!assumed.includes(t)) assumed.push(t);
    const cost = Number(lines.map((l) => /^Mana cost: (\d+)/i.exec(l)?.[1]).find(Boolean) || 0);
    // Damage the tooltip already gives per second (Incineration Trap's fire) is taken as it
    // is; a poison's total is spread over its duration (only the strongest poison sticks).
    const over = /over ([\d.]+) seconds/.exec(text)?.[1];
    const perSecond = /per second/.test(text) || !!over;
    let dps = (/per second/.test(text) ? perAction : over ? Math.min(perAction / Number(over), perAction * rate) : perAction * rate * hit) + poisonDps;
    // Crushing blow: in Median XL a quarter of a monster's current life, and none on its bosses
    // (the community's mechanics guide). While clearing, each landed hit deals its damage and,
    // at that chance, takes a quarter of what's left: the time to kill the difficulty's typical
    // monster (its life from the game files), as damage a second.
    const cb = !isBoss && d.kind === "attack" ? Math.min(100, c.s("chance_of_crushing_blow") || 0) / 100 : 0;
    const life = tgt?.life?.[dk] || 0;
    if (cb > 0 && life > 0 && perAction > 0) {
      const perBurst = perAction / fx.hits, landed = rate * fx.hits * hit;
      let hp = life, n = 0;
      while (hp > 0 && n < 5000) { hp = (hp - perBurst) * (1 - cb / 4); n++; if (hp < 1) break; }
      if (landed > 0) dps = Math.max(dps, life / (n / landed) + poisonDps);
    }
    const targets = Math.min(PACK, Math.max(fx.minTargets, targetsOf(engine.skill(id), text) * fx.targetsMult + fx.targetsAdd));
    return { dps, cd, rate, cost, perSecond, perHit: perAction * hit, targets, kind: d.kind,
      skill: engine.skillName(id), perAction: Math.round(perAction), hit: Math.round(hit * 100) };
  };
  // The build's skills in hand and on its bar. A skill with a cooldown is used whenever it's
  // ready (its damage once per cooldown) and the strongest skill without one fills the time
  // between, as a player would. Bossing and clearing pick their own filler.
  const ids = [...new Set([b.leftSkill, b.rightSkill, ...(b.skillBar || [])])];
  const bossSkills = ids.map((id) => one(id, bossTarget, true)).filter(Boolean), clearSkills = ids.map((id) => one(id, clearTarget)).filter(Boolean);
  const rotation = (skills, reach) => {
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
  const bossR = rotation(bossSkills, () => 1), clearR = rotation(clearSkills, (x) => x.targets);
  // Procs from the attacks filling the rotation: chance × attacks a second (landed, for "on
  // striking"; melee weapons only, for "on melee attack") × the proc's own hit.
  const melee = c.weapon && !/Bows$|Crossbows$|Javelins$|Throwing/.test(c.weapon.def.cat || "");
  const procs = procsOf(c, planner);
  const procDps = (r, tgt, reach) => {
    const f = r.filler;
    if (!f || f.kind !== "attack" || !procs.length) return 0;
    let total = 0;
    for (const p of procs) {
      if (p.on === "Melee Attack" && !melee) continue;
      const pb = { ...b, points: { [p.id]: p.level } };
      let pd;
      try { pd = skillDamage(p.id, { engine, build: pb, skillBuild: { ...pb, soft: {}, charStats: c.charStats }, character: c }); } catch { continue; }
      if (!pd || !["attack", "spell"].includes(pd.kind)) continue;
      const vs = againstTarget(pd, cD, tgt, env.difficulty || "Hell", b.level);
      const per = mid(vs?.total) * (pd.kind === "attack" && vs?.hit != null ? vs.hit / 100 : 1);
      const landed = f.perAction > 0 ? f.perHit / f.perAction : 1;
      const triggers = f.rate * (p.on === "Striking" ? landed : 1) * r.share;
      total += p.chance * triggers * per * reach({ targets: targetsOf(engine.skill(p.id), (pd.lines || []).join(" ")) });
    }
    return total;
  };
  const bossProcs = procDps(bossR, bossTarget, () => 1), clearProcs = procDps(clearR, clearTarget, (x) => x.targets);
  const boss = (bossR.dps + bossProcs) * sustainOf(bossR), clear = (clearR.dps + clearProcs) * sustainOf(clearR);
  // Survivability: life, over how much of the difficulty's typical monster's hit gets through,
  // as effective life. Half the hit is physical: the chance it lands (Diablo II's: its to-hit
  // against your defense, scaled by the two levels, 5% to 95%), block, physical resistance,
  // then flat physical damage reduction. Half is elemental: your average resistance, then flat
  // elemental/magic reduction. Avoid dodges either.
  const el = ["fire", "cold", "lightning", "poison"].map((k) => c.resist[k]?.value ?? 0);
  const elemAvg = el.reduce((n, v) => n + Math.max(-100, Math.min(95, v)), 0) / el.length;
  const phys = Math.max(0, Math.min(95, c.resist.physical?.value ?? 0));
  const avoid = Math.max(0, Math.min(75, c.avoid?.value ?? 0)), block = Math.max(0, Math.min(75, c.block?.value ?? 0));
  const life = c.life.total;
  const k = { Normal: 0, Nightmare: 1, Hell: 2 }[env.difficulty || "Hell"] ?? 2;
  const hitSize = target?.hit?.[k] || 0, toHit = (target?.toHit?.[k] || 0) * MONSTER_TO_HIT, mlvl = target?.levels?.[k] || b.level;
  const defense = c.defense?.total ?? 0;
  const landed = toHit ? Math.max(5, Math.min(95, (100 * toHit) / (toHit + defense) * ((2 * mlvl) / (mlvl + b.level)))) / 100 : 1;
  let ehp;
  if (hitSize > 0) {
    const physHit = Math.max(1, hitSize * (1 - phys / 100) - c.s("physical_damage_taken_reduced"));
    const elemHit = Math.max(1, hitSize * (1 - elemAvg / 100) - c.s("elemental_magic_damage_taken_reduced"));
    const through = (0.5 * landed * (1 - block / 100) * physHit + 0.5 * elemHit) * (1 - avoid / 100);
    ehp = (life * hitSize) / through;
  } else ehp = ((life * 100) / (100 - elemAvg)) * (100 / (100 - phys)) / (1 - avoid / 100) / (1 - block / 200);
  const out = { life: Math.round(life), resist: Math.round(elemAvg), avoid: Math.round(avoid), block: Math.round(block), ehp: Math.round(ehp), hitChance: Math.round(landed * 100), defense: Math.round(defense),
    fhrFrames: hitRecoveryFrames(b.cls, c.s("hit_recovery")), fhrBase: HIT_RECOVERY[b.cls]?.[0][1] ?? null, fhrAt86: hitRecoveryFrames(b.cls, 86), movement: Math.round(c.s("movement_speed")),
    manaIn: Math.round(manaIn), mana: Math.round(c.mana.total),
    // A summoner's gear (the guides': minion damage and life, minion resistances to 75%), and
    // Cannot Be Frozen (the guides' must for Hell and the ubers).
    minion: { damage: c.s("summoned_minion_damage"), life: c.s("summoned_minion_life"), res: c.s("summoned_minion_resistances") },
    cannotBeFrozen: c.s("cannot_be_frozen") > 0,
    ...(bossProcs > 0 ? { procs: Math.round(bossProcs) } : {}),
    // Item effects on the build's skills counted from their wording, not a number (itemEffectsOn).
    ...(assumed.length ? { assumed } : {}) };
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
  const mn = m.minion || {};
  const minions = 20 * Math.log1p(Math.max(0, mn.damage || 0) / 100) + 10 * Math.log1p(Math.max(0, mn.life || 0) / 100)
    + 10 * Math.log(100 / (100 - Math.min(75, Math.max(0, mn.res || 0))));
  const offense = m.unrated ? 60 * Math.log1p(summonPower / 100) + minions
    : 60 * (WEIGHTS.boss / (WEIGHTS.boss + WEIGHTS.clear)) * Math.log1p(m.boss / 100)
      + 60 * (WEIGHTS.clear / (WEIGHTS.boss + WEIGHTS.clear)) * Math.log1p(m.clear / 100);
  const survive = 60 * Math.log1p(m.ehp / 500) + (m.cannotBeFrozen ? 3 : 0);
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
// What each tier is ranked by: overall (bossing, clearing and survival together) and each
// criterion on its own.
const TIER_VALUES = {
  overall: (m) => m.boss ** WEIGHTS.boss * m.clear ** WEIGHTS.clear * m.ehp ** WEIGHTS.survive,
  boss: (m) => m.boss, clear: (m) => m.clear, survive: (m) => m.ehp,
};
const rateable = (m) => m && !m.unrated && m.boss > 0;
/**
 * The scale the rated builds make, for placing a build that isn't one of them (a player's
 * own) as if it were: per criterion, the rated builds' values, highest first (a tier is a
 * share of the ranks, TIERS). Saved with the starter builds (rate-presets.mjs tier-scales).
 */
export function tierScale(list) {
  const rated = list.filter((x) => rateable(x.metrics));
  return Object.fromEntries(Object.entries(TIER_VALUES).map(([k, f]) => [k, rated.map((x) => Math.round(f(x.metrics))).sort((a, b) => b - a)]));
}
// The tier a rank falls in among n builds, as assignTiers deals them out.
function tierAtRank(rank, n) {
  let start = 0;
  for (const [i, [tier, share]] of TIERS.entries()) {
    const end = i === TIERS.length - 1 ? n : Math.min(n, start + Math.round(share * n));
    if (rank <= end) return tier;
    start = end;
  }
  return TIERS.at(-1)[0];
}
/**
 * Where a build's numbers (buildMetrics) would sit on a scale (tierScale): the tier it would
 * get among those builds, overall and per criterion, and its rank.
 */
export function placeOnScale(m, scale) {
  if (!rateable(m) || !scale?.overall?.length) return m?.unrated ? { unrated: m.unrated } : null;
  const place = (k) => {
    // Rounded as the scale's values are (tierScale), so a build equal to one of them ties with it.
    const v = Math.round(TIER_VALUES[k](m)), values = scale[k];
    const rank = values.filter((x) => x > v).length + 1;
    return { rank, tier: tierAtRank(rank, values.length + 1) };
  };
  const o = place("overall");
  return { tier: o.tier, rank: o.rank, of: scale.overall.length + 1, bossTier: place("boss").tier, clearTier: place("clear").tier, surviveTier: place("survive").tier };
}

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
  const overall = tierBy(TIER_VALUES.overall);
  const boss = tierBy(TIER_VALUES.boss), clear = tierBy(TIER_VALUES.clear), survive = tierBy(TIER_VALUES.survive);
  const out = new Map();
  for (const x of rated) {
    const o = overall.get(x.id);
    out.set(x.id, { tier: o.tier, rank: o.rank, of: o.of, score: Math.round(o.v), bossTier: boss.get(x.id).tier, clearTier: clear.get(x.id).tier, surviveTier: survive.get(x.id).tier });
  }
  return out;
}
