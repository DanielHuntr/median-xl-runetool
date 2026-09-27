import { computeCharacter, ATTRIBUTES, activeSlots } from './character.js';
import { combatScore } from './combatScore.js';

// Work on copies: opening a suggestion must never spend the player's points.
export function fundRequirements(build, required, env) {
  const next = { ...build, attrs: { ...build.attrs } };
  for (let pass = 0; pass < 12; pass++) {
    const c = computeCharacter(next, env);
    let remaining = c.statPoints.available - c.statPoints.spent;
    let changed = false;
    for (const a of ['strength', 'dexterity']) {
      const gap = Math.max(0, (required[a] || 0) - c.attributes[a].total);
      if (!gap) continue;
      const multiplier = 1 + c.attributes[a].pct / 100;
      if (multiplier <= 0) return null;
      const points = Math.max(1, Math.ceil(gap / multiplier));
      if (points > remaining) return null;
      next.attrs[a] = (next.attrs[a] || 0) + points;
      remaining -= points;
      changed = true;
    }
    if (!changed) return remaining >= 0 ? next.attrs : null;
  }
  return null;
}

// Rebuild an equip sequence from an empty active set. No item can fund itself,
// and mutually dependent items cannot bootstrap one another into being usable.
export function wearableInOrder(build, env) {
  const pending = activeSlots(build).filter(slot => build.gear[slot]);
  const trial = { ...build, gear: { ...build.gear } };
  for (const slot of pending) delete trial.gear[slot];
  while (pending.length) {
    const c = computeCharacter(trial, env);
    const i = pending.findIndex(slot => {
      const r = env.catalog.resolve(build.gear[slot], build.level);
      return r && r.head.reqLevel <= build.level && r.head.reqStr <= c.attributes.strength.total && r.head.reqDex <= c.attributes.dexterity.total;
    });
    if (i < 0) return false;
    const [slot] = pending.splice(i, 1);
    trial.gear[slot] = build.gear[slot];
  }
  const c = computeCharacter(trial, env);
  return Object.values(c.equipped).every(r => r.head.reqStr <= c.attributes.strength.total && r.head.reqDex <= c.attributes.dexterity.total);
}

export function spendRemaining(build, env, profile) {
  let next = { ...build, attrs: { ...build.attrs } };
  let c = computeCharacter(next, env);
  let remaining = Math.max(0, c.statPoints.available - c.statPoints.spent);
  // Compare small allocations through the same damage/survival model as gear.
  // Reevaluate as scaling and defensive returns change, rather than hardcoding a class.
  while (remaining > 0) {
    const step = Math.min(10, remaining);
    let best = null;
    for (const a of ['vitality', ...ATTRIBUTES.filter(a => a !== 'vitality')]) {
      const candidate = { ...next, attrs: { ...next.attrs, [a]: (next.attrs[a] || 0) + step } };
      const sheet = computeCharacter(candidate, env);
      const score = combatScore(candidate, sheet, env.engine, profile).score;
      if (!best || score > best.score) best = { candidate, score };
    }
    next = best.candidate;
    remaining -= step;
  }
  return next.attrs;
}

export function releaseUnusedRequirements(build, floor, env) {
  const next = { ...build, attrs: { ...build.attrs } };
  for (const a of ['strength', 'dexterity']) {
    let lo = floor[a] || 0, hi = next.attrs[a] || 0;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (wearableBothSets({ ...next, attrs: { ...next.attrs, [a]: mid } }, env)) hi = mid;
      else lo = mid + 1;
    }
    next.attrs[a] = lo;
  }
  return next.attrs;
}

export function wearableBothSets(build, env) {
  return wearableInOrder(build, env) && wearableInOrder({ ...build, swap: !build.swap }, env);
}

// Enhancement and replacement passes can change the attributes needed to start
// equipping a loadout. Fund that sequence before spending points on damage/life.
export function fundLoadout(build, floor, env) {
  const next = { ...build, attrs: Object.fromEntries(ATTRIBUTES.map(a => [a, floor[a] || 0])) };
  for (let pass = 0; pass < 4; pass++) {
    for (const swap of [build.swap, !build.swap]) {
      const trial = { ...next, swap, gear: { ...next.gear } };
      const pending = activeSlots(trial).filter(slot => trial.gear[slot]);
      for (const slot of pending) delete trial.gear[slot];
      while (pending.length) {
        let best = null;
        for (const slot of pending) {
          const r = env.catalog.resolve(next.gear[slot], next.level);
          if (!r || r.head.reqLevel > next.level) continue;
          const attrs = fundRequirements(trial, { strength: r.head.reqStr, dexterity: r.head.reqDex }, env);
          if (!attrs) continue;
          const spent = ATTRIBUTES.reduce((n, a) => n + (attrs[a] || 0), 0);
          if (!best || spent < best.spent) best = { slot, attrs, spent };
        }
        if (!best) return null;
        trial.attrs = best.attrs;
        next.attrs = best.attrs;
        trial.gear[best.slot] = next.gear[best.slot];
        pending.splice(pending.indexOf(best.slot), 1);
      }
      const c = computeCharacter(trial, env);
      const required = Object.values(c.equipped).reduce((r, item) => ({ strength: Math.max(r.strength, item.head.reqStr), dexterity: Math.max(r.dexterity, item.head.reqDex) }), { strength: 0, dexterity: 0 });
      const attrs = fundRequirements(trial, required, env);
      if (!attrs) return null;
      next.attrs = attrs;
    }
    if (wearableBothSets(next, env)) return next.attrs;
  }
  return null;
}
