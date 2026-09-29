import { skillDamage } from './damage.js';

const average = range => ((range?.[0] || 0) + (range?.[1] || 0)) / 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
// Relative throughput, not animation frames or measured attacks/casts per second.
// Diminishing returns keep speed useful without assuming unbounded linear scaling.
export function relativeSpeed(speed, weaponModifier = 0) {
  const positive = Math.max(0, speed);
  const effective = 120 * positive / (120 + positive) + Math.min(0, speed);
  return clamp((100 + effective - weaponModifier) / 100, 0.2, 2.5);
}

export function combatScore(build, character, engine, profile) {
  const c = character, s = c.s;
  const skillBuild = { ...build, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats };
  const selected = new Set([build.leftSkill, build.rightSkill, ...(build.skillBar || [])]);
  const skills = Object.keys(build.points).filter(id => build.points[id] > 0 && !engine.skill(id)?.tags.includes('Passive'));
  const attackRate = relativeSpeed(s('attack_speed'), c.weapon?.head.speedMod || 0);
  const castRate = relativeSpeed(s('cast_speed'));
  let damage = 0, physical = 0, weights = 0, attacks = 0;
  const skillNames = [];
  const attackHit = clamp(c.ar.total / (c.ar.total + Math.max(100, build.level * 20)), 0.2, 0.95);
  for (const id of skills) {
    const d = skillDamage(id, { engine, build, skillBuild, character: c });
    if (!d?.total || !['attack', 'spell'].includes(d.kind)) continue;
    skillNames.push(d.name);
    const weight = selected.has(id) ? 3 : 1;
    let value = 0, phys = 0;
    for (const part of d.parts) {
      let amount = Math.max(0, average(part.range));
      if (part.element === 'physical' && d.kind === 'attack') {
        amount *= 1 + clamp(s('deadly_strike'), 0, 100) / 100;
        phys += amount;
      }
      // Pierce is compared against a neutral non-immune target; no immunity breaking assumed.
      if (part.element !== 'physical') amount *= 1 + clamp(s(`enemy_${part.element}_resistance`), -100, 100) / 100;
      if (d.kind === 'attack' && part.element === 'poison') {
        // Reapplying weapon poison does not stack its full duration on every hit.
        value += amount / Math.max(1, c.damage.weaponPoison?.seconds || 1);
      } else {
        const periodicSpell = d.kind === 'spell' && (part.element === 'poison' || d.lines.some(l => /per second|over [\d.]+ seconds/i.test(l)));
        value += amount * (d.kind === 'attack' ? attackRate * attackHit : periodicSpell ? 1 : castRate);
      }
    }
    damage += value * weight;
    physical += phys * weight;
    attacks += (d.kind === 'attack' ? 1 : 0) * weight;
    weights += weight;
  }
  const knownDamage = weights > 0;
  if (weights) { damage /= weights; physical /= weights; attacks /= weights; }
  const melee = c.weapon && !/Bows$|Crossbows$|Javelins$|Throwing/.test(c.weapon.def.cat || '');
  const onHit = s('life_on_striking') + (melee ? s('life_on_melee_attack') : 0);
  // Sustain potential is conditional on landing hits and on the target allowing leech.
  // Life after each kill (the casters' guides' main sustain) at an assumed one kill a second
  // while clearing: the planner doesn't know how fast a build kills.
  const recovery = Math.max(0, s('life_regenerated_per_second') + s('life_after_each_kill') + attacks * attackRate * attackHit *
    (onHit + physical * Math.max(0, s('life_stolen_per_hit')) / 100));
  let incoming = 0.4 * (1 - clamp(c.resist.physical.value, -100, 90) / 100);
  for (const el of ['fire', 'cold', 'lightning', 'poison', 'magic']) incoming += 0.12 * (1 - clamp(c.resist[el].value, -100, 90) / 100);
  incoming *= 1 - clamp(c.avoid.value, 0, 75) / 100;
  incoming *= 1 - clamp(c.block.value, 0, 75) / 200;
  const durability = Math.max(1, c.life.total) / Math.max(0.05, incoming);
  const defense = 4 * Math.log1p(Math.max(0, c.defense.total) / 1000);
  // Crucify's extra spikes improve coverage, not a guarantee that every spike hits one target.
  const coverage = (build.points.crucify || 0) >= 10 && c.weapon?.twoHanded ? 8 * (profile.roles.attack || 0) : 0;
  const summon = (profile.roles.summon || 0) * (20 * Math.log1p(Math.max(0, s('summoned_minion_damage')) / 100)
    + 10 * Math.log1p(Math.max(0, s('summoned_minion_life')) / 100));
  const offenseScore = 60 * Math.log1p(Math.max(0, damage) / 100) + coverage + summon;
  const defenseScore = 60 * Math.log1p(durability / 500) + defense;
  const sustainScore = 20 * Math.log1p(recovery / Math.max(1, c.life.total) * 10);
  return { score: offenseScore + defenseScore + sustainScore, damage, durability, recovery, knownDamage, skillNames,
    offenseScore, defenseScore, sustainScore, coverage };
}

export function combatReasons(before, after) {
  const reasons = [];
  for (const [key, weight, label] of [
    ['damage', 'offenseScore', 'damage potential'], ['durability', 'defenseScore', 'survivability'], ['recovery', 'sustainScore', 'life recovery potential'],
  ]) {
    const delta = after[key] - before[key];
    if (Math.abs(delta) < 0.01) continue;
    const change = before[key] > 0 ? `${delta >= 0 ? '+' : ''}${Math.round(delta / before[key] * 100)}%` : 'Adds';
    reasons.push({ v: Math.abs(after[weight] - before[weight]), text: `${change} ${label}${key === 'damage' && after.skillNames.length ? ` (${after.skillNames.slice(0, 2).join(', ')})` : ''}${key === 'recovery' ? ' (speed + sustain)' : ''}` });
  }
  if (after.coverage > before.coverage) reasons.push({ v: 8, text: 'Crucify: 60% more spikes with a two-handed weapon' });
  return reasons.sort((a, b) => b.v - a.v);
}
