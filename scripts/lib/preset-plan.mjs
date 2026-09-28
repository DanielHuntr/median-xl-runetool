// Which skill each skill tree's preset is built around (scripts/build-presets.mjs).
//
// Hand-picked presets keep their tree. Every other tree (not Mastery, Reward, Innate or
// Coven) gets its main skill from the data: the tree's active skills that deal damage the
// planner can work out are each tried on a probe build (the skill and its synergies at their
// caps, level 150, a suggested weapon for attacks) and the strongest against the typical Hell
// monster wins; the next one takes the right-hand slot. A tree without a damage skill is
// built around its strongest summon. A tree with neither is reported, not forced.
export const SUPPORT_TABS = new Set(["Mastery", "Reward", "Innate", "Coven"]);
const MORPH_FOR = { werebear: "werebear_morph", werewolf: "werewolf_form", wereowl: "wereowl_form" };

export function planTrees({ engine, catalog, planner, computeCharacter, damage, refsOf, recommend, handPicked }) {
  const covered = new Map(handPicked.map((d) => [`${d.cls}|${engine.skill(d.main).tabName}`, d]));
  const plan = [], skipped = [], noScaling = [];
  for (const cls of engine.classNames)
    for (const tab of engine.tabs(cls)) {
      if (SUPPORT_TABS.has(tab)) continue;
      const known = covered.get(`${cls}|${tab}`);
      const nodes = engine.treeNodes(cls, tab);
      const probe = (id) => {
        const b = { cls, level: 150, points: {}, quests: {}, attrs: { strength: 400, dexterity: 400, vitality: 200, energy: 300 }, signets: 0,
          difficulty: "Hell", gear: {}, swap: false, inventory: [], buffs: [], leftSkill: id, rightSkill: null, skillBar: [] };
        for (const x of [id, ...refsOf(id)]) if (engine.node(b, x)) b.points[x] = Math.max(1, engine.maxLevel(b, x));
        const morph = Object.entries(MORPH_FOR).find(([k]) => (engine.skill(id).restriction || []).join(" ").toLowerCase().includes(k))?.[1];
        if (morph && engine.node(b, morph)) { b.points[morph] = 1; b.buffs = [morph]; }
        let d = damage(b, id);
        if (d.d?.kind === "attack") {
          const weapon = recommend(b, "weapon");
          if (weapon) { b.gear = { weapon: weapon.state }; d = damage(b, id); }
        }
        // Its damage must rise with its own points to anchor a preset (the checks require it),
        // compared about 20% fewer points down (6 at 30): some grow by less than 1 per point
        // (Retaliate, Frigid Domain) or one axe per 4 levels (Overkill), which rounds away
        // over a point or two.
        const top = b.points[id];
        const less = top > 1 ? damage({ ...b, points: { ...b.points, [id]: Math.max(1, top - Math.max(3, Math.ceil(top * 0.2))) } }, id) : null;
        const scales = !less || less.raw < d.raw;
        return { id, kind: d.d?.kind, vs: d.vs, morph, scales };
      };
      const active = nodes.filter((n) => !engine.skill(n.id).tags.some((t) => ["Passive", "Upgrade"].includes(t)));
      const probed = active.map((n) => probe(n.id));
      for (const x of probed) if ((x.kind === "attack" || x.kind === "spell") && x.vs > 0 && !x.scales)
        noScaling.push(`${cls} ${tab}: ${engine.skillName(x.id)}`);
      // A skill anchors a preset only with damage worth the name at full points: the planner can
      // show a token figure for skills whose real damage it doesn't model (Harvest's "Poison
      // Damage: 0-1" at level 20, a healing skill of the Harvesters tree).
      const MIN_VS = 10;
      const hitters = probed.filter((x) => x.scales).filter((x) => (x.kind === "attack" || x.kind === "spell") && x.vs >= MIN_VS).sort((a, b) => b.vs - a.vs);
      const name = (id) => engine.skillName(id);
      // Two skills the game won't let you learn together (Shockwave Trap and Incineration Trap),
      // including through what they require (Askari Lightning needs Stormcall, which Hammer of
      // Zerae blocks).
      const needs = (id, out = new Set()) => {
        if (out.has(id)) return out;
        out.add(id);
        for (const p of engine.node({ cls }, id)?.prereqs || []) {
          const [type, , target = ""] = p.split(":");
          if (type === "skill_level" || type === "skill_level_any") needs(target.split("|")[0], out);
        }
        return out;
      };
      const blocks = (x, y) => (engine.node({ cls }, x)?.prereqs || []).some((p) => p.startsWith("skill_blocked_by:") && p.endsWith(`:${y}`));
      const clash = (a, b) => { const A = needs(a), B = needs(b); return [...A].some((x) => [...B].some((y) => blocks(x, y) || blocks(y, x))); };
      const slug = (...xs) => xs.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const build = (main, others, idParts) => {
        const right = others.find((x) => x.id !== main.id && x.vs > main.vs * 0.2 && !clash(main.id, x.id));
        return { id: slug(...idParts), cls, tree: tab, name: `${tab}: ${name(main.id)}`, main: main.id, ...(right ? { right: right.id } : {}),
          ...(main.morph ? { buffs: [main.morph], extra: [main.morph] } : {}),
          blurb: `${main.kind === "attack" ? "Attack" : "Spell"} build from the ${tab} tree.`, auto: true, ranked: hitters.slice(0, 4).map((x) => `${name(x.id)} ${Math.round(x.vs)}`) };
      };
      // First build: the hand-picked one, or the tree's strongest damage skill.
      const first = known ? { ...known, tree: tab } : hitters.length ? build(hitters[0], hitters, [cls, tab]) : null;
      if (first) {
        plan.push(first);
        // A second build around the next strongest skill (at least 40% as strong). It may be the
        // first build's right-hand skill, but never pairs with the first build's main skill, so
        // the two builds have different focuses rather than the same pair swapped.
        const best = hitters[0]?.vs || 0;
        const second = hitters.find((x) => x.id !== first.main && x.vs >= best * 0.4);
        if (second) plan.push(build(second, hitters.filter((x) => x.id !== first.main), [cls, tab, name(second.id)]));
        continue;
      }
      // Summons: what the planner treats as one (Wolf Companion is tagged "Special"), but not a
      // spell (Lorenado is a tornado the data lists with a minion count).
      const summons = active.filter((n, i) => probed[i].kind === "summon" && !engine.skill(n.id).tags.includes("Spell"))
        .sort((a, b) => engine.requiredCharLevel(b.id, { cls, points: {} }) - engine.requiredCharLevel(a.id, { cls, points: {} }));
      if (summons.length) {
        plan.push({ id: `${cls}-${tab}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), cls, tree: tab, name: `${tab}: ${name(summons[0].id)}`, main: summons[0].id,
          ...(summons[1] ? { right: summons[1].id } : {}), summoner: true, blurb: `Summon build from the ${tab} tree (the planner doesn't estimate minion damage yet).`, auto: true });
        continue;
      }
      skipped.push(`${cls} ${tab}: no damage skill or summon the planner can work out (${active.map((n) => name(n.id)).join(", ") || "only passives"})`);
    }
  return { plan, skipped, noScaling };
}
