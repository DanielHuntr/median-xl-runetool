// Builds the preset builds on the Builds page: src/data/preset-builds.json.
//
//   node scripts/build-presets.mjs            (after changes to skills, items or the recommender)
//
// Each preset below names a class, a main skill and optionally a second skill. The rest is
// the planner's own work, the same as a player would do it in the app:
//   1. points: the main skill to its maximum, then every skill the main skill's formulas read
//      (its synergies, from the game files), then the listed extras, through the planner's
//      add-point rules (required levels and the points available at the level);
//   2. gear and attributes: "Suggest gear" with suggested attributes, sockets and orbs;
//   3. the skills in the left and right slots, and the listed buffs, stances or morphs.
// Then every preset is checked: damage must go up with points in the main skill, with each
// synergy, with a matching spell damage (spells) or enhanced damage (attacks) bonus, and
// against the target with −enemy resistance. Problems are printed and the script exits with
// an error, so a preset never ships with a skill whose damage ignores the player's choices.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import { publishPresets } from "./lib/publish-presets.mjs";
import { effectScope } from "vue";

const PRESETS = [
  { id: "amazon-stormcall", cls: "Amazon", name: "Stormcall", main: "stormcall", extra: ["thundermaiden"], blurb: "Lightning spell caster from the Storm tree." },
  { id: "amazon-wyrmshot", cls: "Amazon", name: "Wyrmshot Bow", main: "wyrmshot", extra: ["dragonlore", "keen_sight"], blurb: "Bow attacks from the Bow tree." },
  { id: "assassin-hades-gate", cls: "Assassin", name: "Hades Gate", main: "hades_gate", extra: ["laserblade"], blurb: "Fire warp strikes with a naginata or halberd." },
  { id: "assassin-beacon", cls: "Assassin", name: "Beacon Trapper", main: "beacon", right: "shockwave_trap", extra: ["subterfuge"], blurb: "Fire and physical traps." },
  { id: "barbarian-whirlwind", cls: "Barbarian", name: "Whirlwind", main: "whirlwind", extra: ["precision", "savagery"], blurb: "Melee spinning attack from the Windcarver tree." },
  { id: "barbarian-iron-spiral", cls: "Barbarian", name: "Iron Spiral", main: "iron_spiral", extra: ["elemental_overload"], blurb: "Lightning melee attack from the Elementalist tree." },
  { id: "druid-ravage", cls: "Druid", name: "Werebear Ravage", main: "ravage", buffs: ["werebear_morph"], extra: ["werebear_morph"], blurb: "Fire melee attacks in werebear form." },
  { id: "druid-heartseeker", cls: "Druid", name: "Heartseeker", main: "heartseeker", right: "steady_shot", extra: ["pathfinder"], blurb: "Fire projectiles from the Hunter tree." },
  { id: "necromancer-death-ripple", cls: "Necromancer", name: "Death Ripple", main: "death_ripple", extra: ["occult_path"], blurb: "Physical and magic spell from the Malice tree." },
  { id: "necromancer-flameburst", cls: "Necromancer", name: "Flameburst Shot", main: "flameburst_shot", right: "catapult_shot", extra: ["alchemical_preparation"], blurb: "Fire crossbow shots." },
  { id: "paladin-solar-flare", cls: "Paladin", name: "Solar Flare", main: "solar_flare", extra: ["scion"], blurb: "Physical and fire spell from the Incarnation tree." },
  { id: "paladin-slayer", cls: "Paladin", name: "Slayer", main: "slayer", right: "mind_flay", extra: ["stormlord"], blurb: "Lightning spells from the Warlock tree." },
  { id: "sorceress-havoc", cls: "Sorceress", name: "Havoc", main: "havoc", right: "flamestrike", extra: ["warmth", "molten_core"], blurb: "Fire spells from the Fire tree." },
  { id: "sorceress-glacial-torrent", cls: "Sorceress", name: "Glacial Torrent", main: "glacial_torrent", right: "frigid_nova", extra: ["crystalline_barrier"], blurb: "Cold melee spells from the Cold tree." },
];
const LEVEL = 150;

const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
globalThis.window = { location: { hash: "#planner", href: "http://localhost/#planner" }, scrollTo() {}, addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = { documentElement: { dataset: {} } };

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const problems = [];
try {
  const load = (p) => vite.ssrLoadModule(p);
  const data = await load("/src/data/index.js");
  const { createEngine } = await load("/src/planner/engine.js");
  const { createCatalog } = await load("/src/planner/items.js");
  const { computeCharacter } = await load("/src/planner/character.js");
  const { skillDamage } = await load("/src/planner/damage.js");
  const { againstTarget, typicalTarget } = await load("/src/planner/target.js");
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const { fundLoadout, spendRemaining, releaseUnusedRequirements, wearableBothSets } = await load("/src/planner/attributeAllocation.js");
  const { buildProfile } = await load("/src/planner/recommend.js");
  const { combatScore } = await load("/src/planner/combatScore.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const gameIds = new Map(Object.entries(planner.skills).filter(([, s]) => s.game).map(([id, s]) => [s.game.gameId, id]));
  // Skills a skill's formulas read: its synergies and upgrades (game files and MedianDB).
  const refsOf = (id) => {
    const out = new Set();
    const s = engine.skill(id);
    for (const row of s.constants || []) for (const raw of row.values) for (const m of raw.matchAll(/\[\[([\w-]+)\]\]/g)) out.add(m[1]);
    for (const m of JSON.stringify(s.game || {}).matchAll(/skill\((\d+)\)/g)) if (gameIds.has(+m[1])) out.add(gameIds.get(+m[1]));
    out.delete(id);
    return [...out];
  };
  const target = typicalTarget(planner.monsters, "Hell");
  // Damage of one skill: every hit if it repeats, against the typical Hell monster too.
  const damage = (b, id) => {
    const c = computeCharacter(b, { engine, catalog, planner });
    const d = skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
    const vs = d && againstTarget(d, c, target, "Hell");
    return { d, vsParts: vs?.parts || [], raw: d?.all?.[1] ?? d?.total?.[1] ?? 0, vs: vs?.all?.[1] ?? vs?.total?.[1] ?? 0 };
  };
  const probe = (b, text) => ({ ...b, inventory: [...b.inventory, { ref: "custom", custom: { name: "Probe", slotType: "charm", text } }] });

  function check(p, b, id) {
    const base = damage(b, id);
    const name = engine.skillName(id);
    const fail = (msg) => problems.push(`${p.name} (${p.cls}), ${name}: ${msg}`);
    if (!(base.raw > 0)) return fail(`no damage (${base.d?.kind}: ${base.d?.lines?.join("; ")})`);
    const report = [`${name} ${base.d.kind} ${base.raw} (vs typical Hell ${base.vs})`];
    // Points in the skill itself.
    if (b.points[id] > 1) {
      const less = damage({ ...b, points: { ...b.points, [id]: b.points[id] - 1 } }, id);
      if (!(less.raw < base.raw)) fail(`one point fewer doesn't lower damage (${less.raw} vs ${base.raw})`);
    }
    // Each synergy with points.
    for (const ref of refsOf(id).filter((r) => b.points[r])) {
      const without = damage({ ...b, points: { ...b.points, [ref]: 0 } }, id);
      report.push(`  without ${engine.skillName(ref)}: ${without.raw} (vs ${without.vs})`);
      if (without.raw > base.raw || without.vs > base.vs) fail(`removing ${engine.skillName(ref)} raises damage (${without.raw} vs ${base.raw})`);
    }
    // A matching damage bonus from gear.
    const els = [...new Set(base.d.parts.map((x) => x.element))];
    // Elemental weapon bases need an elemental probe; physical enhanced damage may
    // correctly have no effect on them. Converted physical attacks still accept flat damage.
    const attackElement = els.find((e) => ["fire", "cold", "lightning", "magic"].includes(e));
    const bonus = base.d.kind === "attack" ? (els.includes("physical") || !attackElement ? "+100% Enhanced Damage" : `Adds 100-100 ${attackElement[0].toUpperCase() + attackElement.slice(1)} Damage`)
      : els.filter((e) => e !== "physical" && e !== "magic").map((e) => `+50% to ${e[0].toUpperCase() + e.slice(1)} Spell Damage`).concat(els.some((e) => e === "physical" || e === "magic") ? ["+50% to Physical/Magic Spell Damage"] : []).join("\n");
    if (bonus) {
      const up = damage(probe(b, bonus), id);
      report.push(`  with ${bonus.replace(/\n/g, ", ")}: ${up.raw}`);
      if (!(up.raw > base.raw)) fail(`${bonus.replace(/\n/g, ", ")} doesn't raise damage (${up.raw} vs ${base.raw})`);
    }
    // −enemy resistance, for elements the target resists.
    // (Not for a trap using its own pierce: yours doesn't apply to it, see damage.js.)
    // (Nor for an element already at −100% after your pierce: it can't go lower.)
    for (const e of els.filter((e) => !base.d.pierce?.[e] && !base.vsParts.some((x) => x.element === e && x.effective <= -100) && ["fire", "cold", "lightning", "poison"].includes(e) && target.res[e][2] > 0 && target.res[e][2] < 100)) {
      const pierce = damage(probe(b, `-20% to Enemy ${e[0].toUpperCase() + e.slice(1)} Resistance`), id);
      if (!(pierce.vs > base.vs)) fail(`−20% enemy ${e} resistance doesn't raise damage against the target (${pierce.vs} vs ${base.vs})`);
    }
    console.log("   " + report.join("\n   "));
  }

  const out = [];
  for (const def of PRESETS) {
    memory.clear();
    const scope = effectScope();
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass(def.cls);
    p.setLevel(LEVEL);
    p.build.value.quests['justicar_signet.hell'] = true;
    p.setSignets(computeCharacter(p.build.value, { engine, catalog, planner }).statPoints.signetCap);
    p.state.autoLevel = false;
    const missing = [def.main, def.right, ...(def.extra || [])].filter((id) => id && !engine.node(p.build.value, id));
    if (missing.length) throw new Error(`${def.name}: not ${def.cls} skills: ${missing.join(", ")}`);
    // A skill's prerequisites first (the points they need), then the skill to its maximum.
    // Optional skills (synergies) that can't be learned alongside the rest are skipped.
    const learn = (id, optional = false, seen = new Set(), upTo = Infinity) => {
      if (seen.has(id)) return;
      if (optional && !engine.canAdd(p.build.value, id, { autoLevel: false }).ok && !(engine.node(p.build.value, id)?.prereqs || []).some((x) => x.startsWith("skill_level"))) return;
      seen.add(id);
      for (const pre of engine.node(p.build.value, id)?.prereqs || []) {
        const [type, value, target = ""] = pre.split(":");
        const n = parseInt(value, 10);
        if (type === "skill_level" || type === "skill_level_any") {
          const t = target.split("|")[0];
          if ((p.build.value.points[t] || 0) < n) learn(t, optional, seen, n);
        } else if (type === "tree_points") {
          // Points in the tree: the skill's own synergies there, then the preset's extras.
          for (const r of [...refsOf(id), ...(def.extra || [])])
            if (engine.tabPoints(p.build.value, target) < n && engine.node(p.build.value, r)?.tabName === target && r !== id) learn(r, true, seen);
          if (engine.tabPoints(p.build.value, target) < n) throw new Error(`${def.name}: ${engine.skillName(id)} needs ${n} points in the ${target} tree`);
        }
      }
      p.add(id, Math.min(upTo, engine.maxLevel(p.build.value, id)) - (p.build.value.points[id] || 0));
      if (!p.build.value.points[id] && optional) return;
      if (!p.build.value.points[id]) throw new Error(`${def.name}: couldn't learn ${engine.skillName(id)}: ${JSON.stringify(engine.canAdd(p.build.value, id, { autoLevel: false }))}`);
    };
    learn(def.main);
    const synergies = refsOf(def.main).filter((r) => engine.node(p.build.value, r));
    if (def.right) learn(def.right);
    for (const id of def.extra || []) learn(id);
    for (const id of [...synergies, ...(def.right ? refsOf(def.right).filter((r) => engine.node(p.build.value, r)) : [])])
      if ((p.build.value.points[id] || 0) < engine.maxLevel(p.build.value, id)) learn(id, true);
    for (const id of def.buffs || []) p.toggleBuff(id);
    p.build.value.leftSkill = def.main;
    p.build.value.rightSkill = def.right || null;
    p.state.suggestAttributes = true;
    p.state.allowAttributeRespec = true;
    p.state.suggestEnhancements = true;
    const t0 = Date.now();
    const suggestGear = async (again = false) => {
    p.state.suggestAttributes = true;
    let count = p.refreshGear();
    await Promise.resolve();
    if (!count) {
      // Suggest gear with suggested attributes can pick a loadout that can't be put on one
      // item at a time (Werebear Ravage). Then: gear alone, and fund it the same way.
      console.log(`   Suggest gear with attributes failed (${p.state.message}); suggesting gear alone`);
      p.state.suggestAttributes = false;
      count = p.refreshGear();
      const env = { engine, catalog, planner };
      // Gear the current attributes can already put on stays as it is; otherwise fund it.
      const funded = count && wearableBothSets(p.build.value, env) ? p.build.value.attrs : fundLoadout(p.build.value, {}, env);
      await Promise.resolve();
      if ((!count || !funded) && again) return null;
      if (!count || !funded) problems.push(`${def.name}: Suggest gear failed (${count} items, funded ${!!funded}): ${p.state.message}`);
      else {
        p.build.value.attrs = funded;
        p.build.value.attrs = releaseUnusedRequirements(p.build.value, {}, env);
        p.build.value.attrs = spendRemaining(p.build.value, env, buildProfile(p.build.value, engine));
      }
    }
    return count;
    };
    let count = await suggestGear();
    // Spend the full budget, comparing damage of the slotted skills plus survivability
    // and recovery. Neutral choices favour the main tree and passives, one point at a
    // time so newly unlocked upgrades can compete before filling an optional skill.
    const profile = buildProfile(p.build.value, engine);
    const score = (b) => {
      const hit = [def.main, def.right].filter(Boolean).reduce((n, id) => n + damage(b, id).vs, 0);
      const combat = combatScore(b, computeCharacter(b, { engine, catalog, planner }), engine, profile);
      return 60 * Math.log1p(hit / 100) + combat.defenseScore + combat.sustainScore;
    };
    const skillsOfClass = engine.tabs(def.cls).flatMap((t) => engine.treeNodes(def.cls, t).map((n) => n.id));
    for (let round = 0; round < engine.available(p.build.value); round++) {
      const b = p.build.value, now = score(b);
      if (engine.available(b) - engine.spent(b) <= 0 || !(now > 0)) break;
      let best = null;
      for (const id of skillsOfClass) {
        const trial = JSON.parse(JSON.stringify(b));
        let added = 0;
        for (let i = 0; i < 25; i++) {
          if (!engine.canAdd(trial, id, { autoLevel: false }).ok) break;
          trial.points[id] = (trial.points[id] || 0) + 1;
          added++;
        }
        if (!added) continue;
        const gain = (score(trial) - now) / added;
        const node = engine.node(b, id);
        const priority = (id === def.main || id === def.right ? 4 : 0)
          + (node.tabName === engine.node(b, def.main).tabName ? 2 : 0)
          + (node.tags?.includes('Passive') ? 1 : 0);
        if (!best || gain > best.gain + 1e-8 || Math.abs(gain - best.gain) <= 1e-8 && priority > best.priority)
          best = { id, added: gain > 1e-8 ? added : 1, gain, priority };
      }
      if (!best) break;
      p.add(best.id, best.added);
    }
    // A published preset must have a successful suggestion for its final skills.
    if (!(count = await suggestGear(true))) {
      problems.push(`${def.name}: final equipment suggestion failed`);
    }
    const b = JSON.parse(JSON.stringify(p.build.value));
    const c = computeCharacter(b, { engine, catalog, planner });
    if (engine.spent(b) !== engine.available(b)) problems.push(`${def.name}: ${engine.available(b) - engine.spent(b)} skill points remain unspent`);
    if (c.statPoints.signets !== c.statPoints.signetCap) problems.push(`${def.name}: signets are not at the available cap`);
    if (c.statPoints.spent !== c.statPoints.available) problems.push(`${def.name}: attribute points remain unspent`);
    console.log(`\n${def.name} (${def.cls}), level ${b.level}: ${engine.spent(b)}/${engine.available(b)} points, ${count} items in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`   points: ${Object.entries(b.points).map(([id, n]) => `${engine.skillName(id)} ${n}`).join(", ")}`);
    console.log(`   gear: ${Object.entries(b.gear).map(([s, st]) => `${s} ${catalog.resolve(st, b.level)?.def.name}`).join(", ")}`);
    for (const pr of p.problems.value) problems.push(`${def.name}: ${pr}`);
    for (const i of c.issues || []) problems.push(`${def.name}: ${i.text || i.message || JSON.stringify(i)}`);
    for (const id of [def.main, def.right].filter(Boolean)) check(def, b, id);
    // What the Builds page shows without loading the planner: each slotted skill's damage
    // (every hit or cast it repeats, against the typical Hell monster), the gear and points.
    const summary = {
      skills: [def.main, def.right].filter(Boolean).map((id) => {
        const x = damage(b, id);
        return { id, name: engine.skillName(id), kind: x.d.kind, vs: x.vs, ...(x.d.count ? { count: x.d.count.n } : {}) };
      }),
      gear: Object.entries(b.gear).filter(([slot]) => !slot.endsWith("2")).map(([, st]) => catalog.resolve(st, b.level)?.def.name).filter(Boolean),
      unspent: engine.available(b) - engine.spent(b),
      life: Math.round(c.life.total), mana: Math.round(c.mana.total),
    };
    out.push({ id: def.id, name: def.name, cls: def.cls, level: b.level, blurb: def.blurb, summary, build: b });
    scope.stop();
  }
  await publishPresets("src/data/preset-builds.json", {
    note: "Generated by scripts/build-presets.mjs with the planner's own rules and Suggest gear; not tested in game.",
    patch: planner.game?.patch, presets: out,
  }, problems);
  console.log(`\n${out.length} presets written to src/data/preset-builds.json`);
} finally {
  await vite.close();
}
if (problems.length) {
  console.error(`\n${problems.length} problems:\n - ${problems.join("\n - ")}`);
  process.exitCode = 1;
}
