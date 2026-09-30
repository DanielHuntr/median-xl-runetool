// A starter build's gear, charms and attributes, judged by what the build actually does
// (scripts/build-presets.mjs's score: its damage, survivability, mana and speed breakpoints)
// rather than by the stat wishlist Suggest gear starts from. Run after Suggest gear:
//   - charms and relics: each one the character's level allows is tried, and kept if the build
//     is better with it (relics: at most 3);
//   - gear: each slot's top suggestions and best runewords are tried in turn (breakpoints, the
//     stats this build's own formulas use), less what they cost to get at this stage (ease.js);
//   - sets: every set with two or more pieces the build can use is tried whole and in part
//     (2, 3, … pieces), so a set bonus can beat a mix of single pieces;
//   - attributes: points are moved between the attributes while the build gets better (a
//     caster buying the mana its skills need, a melee build its attack rating);
//   - a last look at every slot, since the build has changed since it was compared;
//   - alternatives: what else each slot could wear, and what it changes (with ctx.measure).
// Every change must leave gear the character can put on; items a stage keeps (keepGear) stay.

const SLOTS = ["weapon", "offhand", "helm", "body", "gloves", "belt", "boots", "amulet", "ring1", "ring2"];
const ATTRS = ["strength", "dexterity", "vitality", "energy"];

export function refineBuild(p, ctx) {
  const { engine, catalog, planner, score: rawScore, level, keepGear = null, allow = null, ease = null, optionalBuffs = [], measure = null, use = null, wastedLines = null, mostlyWasted = null, fundLoadout, releaseUnusedRequirements, spendRemaining, wearableBothSets, buildProfile, computeCharacter, fast = false, log = () => {} } = ctx;
  const env = { engine, catalog, planner };
  const clone = (b) => JSON.parse(JSON.stringify(b));
  // Attributes for a changed loadout: what it needs, the rest as the planner would spend it.
  const fund = (b) => {
    const a = fundLoadout(b, {}, env);
    if (!a) return false;
    b.attrs = a;
    b.attrs = releaseUnusedRequirements(b, {}, env);
    b.attrs = spendRemaining(b, env, buildProfile(b, engine));
    return wearableBothSets(b, env);
  };
  // Items are judged by what they do for this build, less a little for each of their lines
  // that can't help it (relevance.js: another element, spell stats on an attack build, …), so
  // a focused item beats one mostly bought for nothing when they're close. About what 2% more
  // damage is worth per wasted line.
  const WASTE = 1.2;
  const waste = (b) => (use && wastedLines ? Object.values(b.gear).reduce((n, st) => n + wastedLines(catalog.resolve(st, b.level), use), 0) : 0);
  // And less for what the gear costs to get at this stage (ease.js: Arcane Crystals to make or
  // upgrade it, runes that don't drop yet, set pieces that are luck), most at low levels: a
  // runeword a player can make wins over a drop that's only a little better. Not the swap.
  const easeCost = (b) => (ease ? Object.entries(b.gear).reduce((n, [slot, st]) => n + (/2$/.test(slot) ? 0 : ease(st)), 0) : 0);
  // A build that doesn't attack gets nothing from its weapon's damage, so the weapon's +levels to
  // its own skills (All Skills, its class, or a skill it has points in) count for more than the
  // measured damage alone: about 2% more damage a level (WASTE), so a caster weapon with +skills
  // beats a stat stick unless the stat stick is clearly better (Stormcall's Gnarled Root).
  const casterSkills = (b) => {
    if (!use || use.attack || !(use.spell || use.summon) || !b.gear.weapon) return 0;
    let n = 0;
    for (const p of catalog.resolve(b.gear.weapon, b.level)?.parsed || []) {
      if (p.kind === "stats") for (const [k, v] of p.effects) { if (k === "all_skills" || k === `class_skills:${b.cls}`) n += v; }
      else if (p.kind === "skill" && (b.points[p.id] || 0) > 0) n += p.value;
    }
    return n;
  };
  const score = (b) => rawScore(b) - WASTE * waste(b) - easeCost(b) + WASTE * casterSkills(b);
  // Items worn mostly for nothing (relevance.js mostlyWasted) aren't candidates, and one worn
  // (Suggest gear's, or kept from the stage before) needn't be beaten to be replaced.
  const wastedItem = (st) => !!(mostlyWasted && use && st && mostlyWasted(catalog.resolve(st, level), use));
  let cur = { b: clone(p.build.value), s: score(p.build.value) };
  const T = { t: Date.now(), trials: 0 };
  const lap = (what) => { if (process.env.PROFILE) console.log(`   [refine] ${what} ${((Date.now() - T.t) / 1000).toFixed(1)}s, ${T.trials} trials`); T.t = Date.now(); T.trials = 0; };
  const commit = (x, why) => {
    for (const k of ["gear", "attrs", "inventory", "buffs"]) p.build.value[k] = clone(x.b[k]);
    log(`${why} (${(x.s - cur.s).toFixed(1)})`);
    cur = { b: clone(x.b), s: x.s };
  };
  // refund: "never" keeps the attributes as they are; "if-needed" re-funds them only when the
  // change can't be worn with them (the attribute pass at the end re-balances anyway).
  const trial = (change, refund = "if-needed") => {
    T.trials++;
    const b = clone(cur.b);
    if (change(b) === false) return null;
    // A two-handed weapon leaves no hand for an off-hand item (the off-hand candidates were
    // ranked before the weapon changed).
    if (b.gear.weapon && catalog.resolve(b.gear.weapon, b.level)?.twoHanded) delete b.gear.offhand;
    if (b.gear.weapon2 && catalog.resolve(b.gear.weapon2, b.level)?.twoHanded) delete b.gear.offhand2;
    if (!wearableBothSets(b, env) && (refund === "never" || !fund(b))) return null;
    let c = computeCharacter(b, env);
    // A buff an item grants (character.js itemSkills) is on with the item, so the item is
    // judged with it, unless the buff pass has found the build better without it.
    const grant = Object.keys(c.itemSkills || {}).filter((id) => itemBuff(id) && !b.buffs.includes(id) && !buffsOff.has(id));
    if (grant.length) { b.buffs = [...b.buffs, ...grant]; c = computeCharacter(b, env); }
    if (c.statPoints.spent > c.statPoints.available) return null;
    return { b, s: score(b) };
  };
  const nameOf = (st) => catalog.get(st?.ref)?.name || "item";

  // Buffs from items: switched on with their item (not stances or morphs, which exclude others).
  const itemBuff = (id) => { const t = engine.skill(id)?.tags || []; return t.includes("Buff") && !t.some((x) => ["Stance", "Morph", "Passive"].includes(x)); };
  const buffsOff = new Set();
  // ---------- Buffs the build has without spending points (its class's innate: Bloodlust,
  // Titan's Fortitude, Mark of the Wild, …): on when the build is better with one, as the
  // guides keep them up. Again at the end, when the build has changed.
  const buffPass = () => {
    const granted = Object.keys(computeCharacter(cur.b, env).itemSkills || {}).filter(itemBuff);
    for (const id of [...optionalBuffs, ...granted]) {
      const flip = trial((b) => { b.buffs = b.buffs.includes(id) ? b.buffs.filter((x) => x !== id) : [...b.buffs, id]; }, "never");
      if (flip && flip.s > cur.s + 0.05) {
        commit(flip, `${flip.b.buffs.includes(id) ? "+" : "-"} ${id}`);
        if (flip.b.buffs.includes(id)) buffsOff.delete(id); else buffsOff.add(id);
      }
    }
  };
  buffPass();

  // ---------- Charms and relics
  const reqOf = new Map(planner.inventory.map((c) => [`inv:${c.id}`, c.reqLevel ?? 1]));
  const pool = catalog.all().filter((d) => (d.kind === "charm" || d.kind === "relic") && (reqOf.get(d.key) ?? 999) <= level && (!allow || allow(d)) && catalog.forClass(d, cur.b.cls));
  // Charms only add to the character, so the attributes it has still put its gear on.
  const gainOf = (ref) => {
    const x = trial((b) => { if (b.inventory.some((i) => i.ref === ref)) return false; b.inventory.push({ ref }); }, "never");
    return x ? { ref, x, gain: x.s - cur.s } : null;
  };
  const ranked = pool.map((d) => gainOf(d.key)).filter((g) => g && g.gain > 0.05).sort((a, b) => b.gain - a.gain);
  let relics = cur.b.inventory.filter((i) => catalog.get(i.ref)?.kind === "relic").length;
  for (const g of ranked) {
    const relic = catalog.get(g.ref).kind === "relic";
    if (relic && relics >= 3) continue;
    const x = trial((b) => { if (b.inventory.some((i) => i.ref === g.ref)) return false; b.inventory.push({ ref: g.ref }); }, "never");
    if (x && x.s > cur.s + 0.05) { commit(x, `+ ${nameOf({ ref: g.ref })}`); if (relic) relics++; }
  }

  lap("charms");
  // ---------- Gear, one slot at a time, by the build's own measure
  const setBuild = () => { for (const k of ["gear", "attrs", "inventory", "buffs"]) p.build.value[k] = clone(cur.b[k]); };
  // An item before orbs: its sockets filled (they're part of the item) but no orbs, whose
  // +4 required level each would favour items with a lower requirement over better ones.
  const bare = (st) => st && { ...st, orbs: [] };
  // A slot's candidates: the top suggestions, plus its best runewords (which the suggestions'
  // ranking can leave out while levelling), less items mostly worn for nothing.
  const shortlist = (slot, n) => {
    const all = p.recommend(slot, fast ? 30 : 60);
    const top = all.slice(0, n), runewords = all.filter((c) => c.def.kind === "runeword" && !top.includes(c)).slice(0, fast ? 1 : 3);
    return [...top, ...runewords].filter((c) => !wastedItem(c.state));
  };
  // full: items compared as they'd be worn (sockets and orbs, as the suggestion fills them),
  // for the last look, where what an item can become is what counts.
  const slotPass = (n = 10, { full = false } = {}) => {
    const as = (st) => (full ? st : bare(st));
    // Each slot's candidates, ranked once for the build as it stands. Items are compared on
    // their own, before sockets and orbs: otherwise an item with a lower level requirement
    // wins on the room it leaves for orbs (+4 required level each) rather than on itself,
    // and early +skills get outbid. The winner then gets its sockets and orbs. (Not in the
    // last look: see full.)
    setBuild();
    let changed = 0;
    const ranked = Object.fromEntries(SLOTS.filter((slot) => !keepGear?.[slot]).map((slot) => [slot, shortlist(slot, n)]));
    for (const [slot, list] of Object.entries(ranked)) {
      const now = wastedItem(cur.b.gear[slot]) ? null : trial((b) => { if (b.gear[slot]) b.gear[slot] = as(b.gear[slot]); });
      let best = null;
      for (const cand of list) {
        if (cand.def.key === cur.b.gear[slot]?.ref) continue;
        const x = trial((b) => {
          b.gear[slot] = as(cand.state);
          if (slot === "weapon" && catalog.resolve(cand.state, b.level)?.twoHanded) delete b.gear.offhand;
        });
        if (x && (!best || x.s > best.x.s)) best = { x, cand };
      }
      if (!best || (now && best.x.s <= now.s + 0.05)) continue;
      const from = nameOf(cur.b.gear[slot]);
      commit(best.x, `${slot}: ${from} → ${best.cand.def.name}`);
      changed++;
      setBuild();
      try { p.enhance(slot, { quiet: true }); } catch {}
      const st = clone(p.build.value.gear[slot]);
      const y = trial((b) => { b.gear[slot] = st; });
      // (In the last look the item was compared filled; keep that if refilling does worse.)
      if (y && (!full || y.s >= cur.s)) commit(y, `${slot}: sockets and orbs`);
      setBuild();
    }
    return changed;
  };
  slotPass(fast ? 5 : 10);
  lap("slots");

  // ---------- Sets, as a whole: the best piece of the set in each slot it has one for
  if (!fast) {
    setBuild();
    const bySet = new Map();
    for (const slot of SLOTS) {
      if (keepGear?.[slot]) continue;
      for (const cand of p.recommend(slot, 60)) {
        const id = cand.def.setId;
        if (id == null) continue;
        const pieces = bySet.get(id) ?? bySet.set(id, new Map()).get(id);
        // Each piece once (rings: the same ring can't go in both slots), best-ranked first.
        if ([...pieces.values()].some((c) => c.def.key === cand.def.key) || pieces.has(slot)) continue;
        pieces.set(slot, cand);
      }
    }
    // Partial sets as well as whole ones: a set's tiers start at 2 pieces ("Set Bonus with 2 or
    // more set items"), and 2 or 3 pieces beside better items elsewhere can beat the whole set,
    // while one piece alone never shows the bonus. Every pair of the set's pieces is tried, the
    // best pair grown one piece at a time, and the whole set; the best of them is kept.
    const wear = (entries) => trial((b) => {
      for (const [slot, cand] of entries) b.gear[slot] = cand.state;
      if (b.gear.weapon && catalog.resolve(b.gear.weapon, b.level)?.twoHanded) delete b.gear.offhand;
    });
    for (const [id, pieces] of bySet) {
      if (pieces.size < 2) continue;
      const all = [...pieces];
      let best = null;
      const consider = (entries) => { const x = wear(entries); if (x && (!best || x.s > best.x.s)) best = { x, entries }; return x; };
      let pair = null;
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const x = consider([all[i], all[j]]);
        if (x && (!pair || x.s > pair.s)) pair = { s: x.s, entries: [all[i], all[j]] };
      }
      let grow = pair?.entries;
      while (grow && grow.length < all.length - 1) {
        let next = null;
        for (const e of all.filter((e) => !grow.includes(e))) {
          const x = consider([...grow, e]);
          if (x && (!next || x.s > next.s)) next = { s: x.s, entries: [...grow, e] };
        }
        grow = next?.entries;
      }
      consider(all);
      if (best && best.x.s > cur.s + 0.05)
        commit(best.x, `set ${catalog.setById?.(id)?.name || id} (${best.entries.length} of ${all.length}): ${best.entries.map(([, c]) => c.def.name).join(", ")}`);
    }
  }
  lap("sets");

  // ---------- Honorific bases: a base item made Honorific (orbs count double), its sockets and
  // orbs filled by the planner's own suggestion. Its random magic affixes aren't counted. Weapons
  // keep the build's weapon type; each slot tries its three best bases the level allows.
  if (!fast) {
    const reqOfLines = (lines) => Number((lines || []).map((l) => /^Required Level: (\d+)/.exec(l)?.[1]).find(Boolean) || 0);
    const cls = cur.b.cls;
    for (const slot of ["weapon", "offhand", "helm", "body", "gloves", "belt", "boots"]) {
      if (keepGear?.[slot]) continue;
      const now = cur.b.gear[slot] && catalog.resolve(cur.b.gear[slot], level);
      if (slot === "offhand" && cur.b.gear.weapon && catalog.resolve(cur.b.gear.weapon, level)?.twoHanded) continue;
      const bases = catalog.forSlot(slot, cls).filter((d) => d.kind === "base" && (!allow || allow(d))
        && (slot !== "weapon" || !now || d.cat === (now.baseDef?.cat || now.def.cat)))
        .map((d) => {
          let idx = -1;
          d.variants.forEach((v, i) => { if (reqOfLines(v.lines) <= level) idx = i; });
          return idx >= 0 ? { d, idx } : null;
        })
        .filter(Boolean).sort((x, y) => y.idx - x.idx).slice(0, 3);
      for (const { d, idx } of bases) {
        setBuild();
        p.build.value.gear[slot] = { ref: d.key, variant: idx, honorific: true, socketCount: 6, sockets: [], orbs: [] };
        const two = slot === "weapon" && catalog.resolve(p.build.value.gear[slot], level)?.twoHanded;
        if (two) delete p.build.value.gear.offhand;
        try { p.enhance(slot, { quiet: true }); } catch { continue; }
        const st = clone(p.build.value.gear[slot]);
        const x = trial((b) => { b.gear[slot] = st; if (two) delete b.gear.offhand; });
        if (x && x.s > cur.s + 0.05) commit(x, `${slot}: Honorific ${d.name}`);
      }
    }
    setBuild();
  }
  lap("honorific");

  // ---------- Attributes: move points while it helps (big steps first)
  const attributePass = () => {
    for (const step of [100, 50, 20]) {
      for (let round = 0; round < 12; round++) {
        let best = null;
        for (const from of ATTRS) for (const to of ATTRS) {
          if (from === to || (cur.b.attrs[from] || 0) < step) continue;
          const x = trial((b) => { b.attrs[from] -= step; b.attrs[to] = (b.attrs[to] || 0) + step; }, "never");
          if (x && x.s > cur.s + 0.05 && (!best || x.s > best.x.s)) best = { x, from, to };
        }
        if (!best) break;
        commit(best.x, `${step} ${best.from} → ${best.to}`);
      }
    }
  };
  attributePass();
  lap("attributes");
  // ---------- A last look at each slot: the build has changed since its slot was compared
  // (other slots, sets, attributes), and an item that lost then can win now. Again while it
  // changes something (a new belt can make another weapon the better one), up to 3 times.
  for (let round = 0; round < (fast ? 0 : 3); round++) {
    const changed = slotPass(10, { full: true });
    attributePass();
    buffPass();
    if (!changed) break;
  }
  lap("final check");
  // ---------- What else each slot could wear, for the alternatives list: each candidate in
  // the finished build, by the same measure, with what it changes.
  const alternatives = {};
  if (measure && !fast) {
    setBuild();
    const m0 = measure(cur.b);
    const pct = (a, b) => (b > 0 ? Math.round((a / b - 1) * 1000) / 10 : 0);
    for (const slot of SLOTS) {
      if (!cur.b.gear[slot] || keepGear?.[slot]) continue;
      const rows = [];
      for (const cand of shortlist(slot, 10)) {
        if (cand.def.key === cur.b.gear[slot]?.ref) continue;
        const x = trial((b) => { b.gear[slot] = cand.state; });
        if (!x) continue;
        const m = measure(x.b);
        rows.push({ ref: cand.state.ref, ...(cand.state.variant != null ? { variant: cand.state.variant } : {}), ...(cand.state.base ? { base: cand.state.base, baseVariant: cand.state.baseVariant } : {}),
          kind: cand.def.kind, value: Math.round((x.s - cur.s) * 10) / 10, boss: pct(m.boss, m0.boss), clear: pct(m.clear, m0.clear), ehp: pct(m.ehp, m0.ehp),
          ...(wastedLines && use ? { unused: wastedLines(catalog.resolve(cand.state, level), use) } : {}) });
      }
      alternatives[slot] = rows.sort((a, b) => b.value - a.value);
    }
    setBuild();
  }
  lap("alternatives");
  setBuild();
  return { score: cur.s, alternatives };
}
