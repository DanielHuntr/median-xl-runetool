// A starter build's gear, charms and attributes, judged by what the build actually does
// (scripts/build-presets.mjs's score: its damage, survivability, mana and speed breakpoints)
// rather than by the stat wishlist Suggest gear starts from. Run after Suggest gear:
//   - charms and relics: each one the character's level allows is tried, and kept if the build
//     is better with it (relics: at most 3);
//   - gear: each slot's top suggestions are tried in turn (breakpoints, the stats this build's
//     own formulas use);
//   - sets: every set with two or more pieces the build can use is tried as a whole, so a set
//     bonus can beat a mix of single pieces;
//   - attributes: points are moved between the attributes while the build gets better (a
//     caster buying the mana its skills need, a melee build its attack rating).
// Every change must leave gear the character can put on; items a stage keeps (keepGear) stay.

const SLOTS = ["weapon", "offhand", "helm", "body", "gloves", "belt", "boots", "amulet", "ring1", "ring2"];
const ATTRS = ["strength", "dexterity", "vitality", "energy"];

export function refineBuild(p, ctx) {
  const { engine, catalog, planner, score, level, keepGear = null, allow = null, fundLoadout, releaseUnusedRequirements, spendRemaining, wearableBothSets, buildProfile, computeCharacter, log = () => {} } = ctx;
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
  let cur = { b: clone(p.build.value), s: score(p.build.value) };
  const T = { t: Date.now(), trials: 0 };
  const lap = (what) => { if (process.env.PROFILE) console.log(`   [refine] ${what} ${((Date.now() - T.t) / 1000).toFixed(1)}s, ${T.trials} trials`); T.t = Date.now(); T.trials = 0; };
  const commit = (x, why) => {
    for (const k of ["gear", "attrs", "inventory"]) p.build.value[k] = clone(x.b[k]);
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
    const c = computeCharacter(b, env);
    if (c.statPoints.spent > c.statPoints.available) return null;
    return { b, s: score(b) };
  };
  const nameOf = (st) => catalog.get(st?.ref)?.name || "item";

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
  const setBuild = () => { p.build.value.gear = clone(cur.b.gear); p.build.value.attrs = clone(cur.b.attrs); p.build.value.inventory = clone(cur.b.inventory); };
  const slotPass = (n = 6) => {
    // Each slot's candidates, ranked once for the build as it stands.
    setBuild();
    const ranked = Object.fromEntries(SLOTS.filter((slot) => !keepGear?.[slot]).map((slot) => [slot, p.recommend(slot, n)]));
    for (const [slot, list] of Object.entries(ranked)) {
      for (const cand of list) {
        if (JSON.stringify(cand.state) === JSON.stringify(cur.b.gear[slot])) continue;
        const x = trial((b) => {
          b.gear[slot] = cand.state;
          if (slot === "weapon" && catalog.resolve(cand.state, b.level)?.twoHanded) delete b.gear.offhand;
        });
        if (x && x.s > cur.s + 0.05) commit(x, `${slot}: ${nameOf(cur.b.gear[slot])} → ${cand.def.name}`);
      }
    }
  };
  slotPass();
  lap("slots");

  // ---------- Sets, as a whole: the best piece of the set in each slot it has one for
  {
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
    for (const [id, pieces] of bySet) {
      if (pieces.size < 2) continue;
      const x = trial((b) => {
        for (const [slot, cand] of pieces) b.gear[slot] = cand.state;
        if (b.gear.weapon && catalog.resolve(b.gear.weapon, b.level)?.twoHanded) delete b.gear.offhand;
      });
      if (x && x.s > cur.s + 0.05) commit(x, `set ${catalog.setById?.(id)?.name || id}: ${[...pieces.values()].map((c) => c.def.name).join(", ")}`);
    }
  }
  lap("sets");

  // ---------- Honorific bases: a base item made Honorific (orbs count double), its sockets and
  // orbs filled by the planner's own suggestion. Its random magic affixes aren't counted. Weapons
  // keep the build's weapon type; each slot tries its three best bases the level allows.
  {
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
  slotPass(4);
  lap("slots again");

  // ---------- Attributes: move points while it helps (big steps first)
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
  lap("attributes");
  setBuild();
  return cur.s;
}
