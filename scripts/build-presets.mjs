// Builds the preset builds on the Builds page: src/data/preset-builds.json.
//
//   node scripts/build-presets.mjs            (after changes to skills, items or the recommender)
//
// One preset per skill tree (scripts/lib/preset-plan.mjs): the hand-picked presets below keep
// their trees, and every other tree gets its main skill from the data.
//   ONLY=id1,id2 node scripts/build-presets.mjs   builds just those, without publishing.
//   STAGES_ONLY=1 node scripts/build-presets.mjs  remakes only the levelling stages, keeping the
//     published endgame builds (after a change that affects levelling but not level 150).
//   SHARD=k/N (with PROGRESS_FILE)              builds only every Nth preset (k-th of them) into
//     its own progress file and stops; scripts/build-presets-parallel.mjs runs N at once.
//   RESUME=1 node scripts/build-presets.mjs       carries on a full run that stopped: each
//     finished preset is saved to .preset-progress.json as it's built (deleted once published).
// Each preset names a class, a main skill and optionally a second skill. The rest is
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
import { readFile, writeFile, rm } from "node:fs/promises";
import { publishPresets } from "./lib/publish-presets.mjs";
import { planTrees } from "./lib/preset-plan.mjs";
import { ratePresets, ratingEnv, summonPowerOf } from "./lib/rate-presets.mjs";
import { refineBuild } from "./lib/refine.mjs";
import { probePointScaling } from "./lib/point-scaling.mjs";
import { effectScope } from "vue";

// A skill-bar skill counts as a damage skill (placed with the hitters and checked like one) only
// with damage worth the name: the planner shows a token figure for some skills whose real effect
// it doesn't model (Harvest's "Poison Damage: 0-1", a healing skill of the Harvesters tree).
const dealsDamage = (d) => d.raw > 0 && d.vs >= 10;

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
  const { isToggleSkill } = await load("/src/planner/skillEffects.js");
  const { fundLoadout, spendRemaining, releaseUnusedRequirements, wearableBothSets } = await load("/src/planner/attributeAllocation.js");
  const { buildProfile, recommendForSlot, wantedStats } = await load("/src/planner/recommend.js");
  const { buffSpecs, suggestMercGear } = await load("/src/planner/mercs.js");
  const { combatScore } = await load("/src/planner/combatScore.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  // The rating's measures (src/planner/rating.js): what the generator optimises for.
  const renv = await ratingEnv(load, planner, data);
  const catalog = createCatalog(data, planner);
  const { createAvailability } = await load("/src/planner/availability.js");
  const relevance = await load("/src/planner/relevance.js");
  const foundGear = createAvailability(catalog, catalog.all().filter((d) => d.kind === "socketable").map((d) => [d.name, d.kindLabel, d.lvl]));
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
    // Per hit: a repeating skill's hits rarely all land on one target.
    return { d, vsParts: vs?.parts || [], raw: d?.total?.[1] ?? 0, vs: vs?.total?.[1] ?? 0 };
  };
  // The top weapon Suggest gear would pick for a probe build (tree planning).
  const recommendWeapon = (b) => {
    const c = computeCharacter(b, { engine, catalog, planner }), profile = buildProfile(b, engine);
    return recommendForSlot("weapon", { build: b, engine, catalog, planner, character: c, profile, want: wantedStats(profile, c) }, 1)[0];
  };
  const probe = (b, text) => ({ ...b, inventory: [...b.inventory, { ref: "custom", custom: { name: "Probe", slotType: "charm", text } }] });

  // Skill-bar skills (secondary = true) may legitimately not gain damage from their own
  // points (War Spirit is a fixed 50% weapon hit; Mana Pulse's cold damage grows with
  // character level): they only have to deal damage that responds to something the player
  // chooses. The left and right skills must pass every check.
  function check(p, b, id, secondary = false) {
    const base = damage(b, id);
    const name = engine.skillName(id);
    const soft = [];
    const fail = (msg, pointsOnly = false) => (secondary && pointsOnly ? soft.push(msg) : problems.push(`${p.name} (${p.cls}), ${name}: ${msg}`));
    let responds = false;
    if (!(base.raw > 0)) return fail(`no damage (${base.d?.kind}: ${base.d?.lines?.join("; ")})`);
    const report = [`${name} ${base.d.kind} ${base.raw} (vs typical Hell ${base.vs})`];
    // Start about 20% lower (6 at 30), then look past rounded plateaus if needed:
    // some skills gain less than 1 damage per point, or one axe per 4 levels.
    if (b.points[id] > 1) {
      const less = probePointScaling(b.points[id], base.raw,
        (n) => damage({ ...b, points: { ...b.points, [id]: n } }, id).raw);
      report.push(`  with ${b.points[id] - less.fewer} fewer points: ${less.damage}`);
      // Points can raise how many monsters it reaches instead (Wyrmshot: "Attacks up to 3
      // targets" at 1 point, 15 at 25): that responds to the player's choice too.
      const reach = (n) => {
        const c = computeCharacter({ ...b, points: { ...b.points, [id]: n } }, { engine, catalog, planner });
        const text = engine.describe({ ...b, points: { ...b.points, [id]: n }, soft: c.soft, charStats: c.charStats }, id, n).effect.map((l) => l.text).join(" ");
        return Number(/up to (\d+) (?:targets|enemies|monsters)/i.exec(text)?.[1] || 0);
      };
      // Or how many hits a cast makes (Magic Missiles' bolts): per-hit damage stays put.
      const hits = (n) => damage({ ...b, points: { ...b.points, [id]: n } }, id).d?.count?.n || 1;
      const reachGrows = !less.scales && (reach(b.points[id]) > reach(less.fewer) || hits(b.points[id]) > hits(less.fewer));
      if (reachGrows) report.push(`  targets: ${reach(less.fewer)} → ${reach(b.points[id])}`);
      if (!less.scales && !reachGrows) fail(`${b.points[id] - less.fewer} points fewer doesn't lower damage (${less.damage} vs ${base.raw})`, true);
      else responds = true;
    }
    // Each synergy with points.
    for (const ref of refsOf(id).filter((r) => b.points[r])) {
      const without = damage({ ...b, points: { ...b.points, [ref]: 0 } }, id);
      report.push(`  without ${engine.skillName(ref)}: ${without.raw} (vs ${without.vs})`);
      if (without.raw > base.raw || without.vs > base.vs) fail(`removing ${engine.skillName(ref)} raises damage (${without.raw} vs ${base.raw})`, true);
      if (without.raw < base.raw) responds = true;
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
      if (!(up.raw > base.raw)) fail(`${bonus.replace(/\n/g, ", ")} doesn't raise damage (${up.raw} vs ${base.raw})`, true);
      else responds = true;
    }
    // −enemy resistance, for elements the target resists.
    // (Not for a trap using its own pierce: yours doesn't apply to it, see damage.js.)
    // (Nor for an element already at −100% after your pierce: it can't go lower.)
    for (const e of els.filter((e) => !base.d.pierce?.[e] && !base.vsParts.some((x) => x.element === e && x.effective <= -100) && ["fire", "cold", "lightning", "poison"].includes(e) && target.res[e][2] > 0 && target.res[e][2] < 100)) {
      const pierce = damage(probe(b, `-20% to Enemy ${e[0].toUpperCase() + e.slice(1)} Resistance`), id);
      if (!(pierce.vs > base.vs)) fail(`−20% enemy ${e} resistance doesn't raise damage against the target (${pierce.vs} vs ${base.vs})`);
    }
    if (secondary && !responds) problems.push(`${p.name} (${p.cls}), ${name}: damage responds to nothing the player chooses (${soft.join("; ")})`);
    else if (soft.length) report.push(`  (skill bar; noted: ${soft.join("; ")})`);
    console.log("   " + report.join("\n   "));
  }

  const out = [], stages = {};
  // The levelling guide: the preset built again at these levels (Median XL's areas: Normal
  // monsters are levels 1-50, Nightmare 51-100, Hell 100-125; levels.bin 0x16/0x18/0x1A).
  const STAGES = [[25, "Normal"], [50, "Normal"], [75, "Nightmare"], [100, "Nightmare"], [125, "Hell"]];
  const skillsOfClassFor = (cls) => engine.tabs(cls).flatMap((t) => engine.treeNodes(cls, t).map((n) => n.id));
  const targets = Object.fromEntries(["Normal", "Nightmare", "Hell"].map((d) => [d, typicalTarget(planner.monsters, d)]));
  const damageIn = (b, id, difficulty) => {
    const c = computeCharacter(b, { engine, catalog, planner });
    const d = skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
    const vs = d && againstTarget(d, c, targets[difficulty], difficulty);
    return vs?.total?.[1] ?? 0;
  };
  // The skills a stage is built around: the preset's own when they can be learned at that
  // level; otherwise the strongest damage skill that can (from the main skill's tree first),
  // to level with until the main skill unlocks.
  function stageDef(def, level) {
    const at = (id) => id && engine.requiredCharLevel(id, { cls: def.cls, points: {} }) <= level;
    if (at(def.main)) return { ...def, right: at(def.right) ? def.right : undefined, extra: (def.extra || []).filter(at) };
    const tree = engine.skill(def.main).tabName;
    const probe = (id) => {
      const b = { cls: def.cls, level, points: {}, quests: {}, attrs: {}, signets: 0, difficulty: "Normal", gear: {}, swap: false, inventory: [], buffs: [], leftSkill: id, rightSkill: null, skillBar: [] };
      b.points[id] = Math.max(1, Math.min(engine.maxLevel(b, id), level));
      try { return damage(b, id).vs; } catch { return 0; }
    };
    const candidates = engine.tabs(def.cls).flatMap((t) => engine.treeNodes(def.cls, t).map((n) => n.id))
      .filter((id) => at(id) && !engine.skill(id).tags.some((t) => ["Passive", "Upgrade"].includes(t)))
      .map((id) => ({ id, vs: probe(id), same: engine.skill(id).tabName === tree }))
      .filter((x) => x.vs > 0)
      .sort((x, y) => (y.same - x.same) || (y.vs - x.vs));
    if (!candidates.length) return null;
    return { ...def, main: candidates[0].id, right: undefined, extra: [], buffs: [], summoner: false, levelling: true };
  }
  async function levellingGuide(def, endgame) {
    const guide = [];
    // A player doesn't go back a tier: each stage may only use an item (or runeword base) at
    // the highest tier an earlier stage used, or better.
    const minTiers = {};
    // Nor back to lower gems: normal 12, flawless 15, perfect 18 (socketables' levels).
    let minGemLevel = 0;
    // Nor does a player swap an item away and back: what the previous stage wears and the
    // finished build wears in the same slot (either ring slot for rings) stays on.
    let prev = null;
    const keepFrom = (gear) => {
      if (!gear) return null;
      const end = endgame.gear || {}, keep = {};
      const endRings = ["ring1", "ring2"].map((s) => end[s]?.ref).filter(Boolean);
      for (const [slot, st] of Object.entries(gear)) {
        if (!st?.ref) continue;
        if (slot === "ring1" || slot === "ring2") { const i = endRings.indexOf(st.ref); if (i >= 0) { endRings.splice(i, 1); keep[slot] = st; } }
        else if (end[slot]?.ref === st.ref) keep[slot] = st;
      }
      return Object.keys(keep).length ? keep : null;
    };
    for (const [level, difficulty] of STAGES) {
      const sdef = stageDef(def, level), notes = [];
      if (!sdef) { guide.push({ level, difficulty, notes: ["No damage skill the planner can work out is learnable yet."] }); continue; }
      try {
        // Levelling on found gear (availability.js): what a player finds on the way.
        const { p, scope } = await buildAt(sdef, level, difficulty, false, notes, { minTiers, minGemLevel, keepGear: keepFrom(prev), found: true });
        for (const st of Object.values(p.build.value.gear)) {
          const key = st.base || st.ref, tier = st.base ? st.baseVariant : st.variant;
          if (key && Number.isInteger(tier)) minTiers[key] = Math.max(minTiers[key] ?? -1, tier);
          for (const ref of st.sockets || []) {
            const d = ref && catalog.get(ref);
            if (d?.kind === "socketable" && d.kindLabel === "Gems") minGemLevel = Math.max(minGemLevel, d.lvl || 0);
          }
        }
        const b = JSON.parse(JSON.stringify(p.build.value));
        prev = b.gear;
        const c = computeCharacter(b, { engine, catalog, planner });
        scope.stop();
        guide.push({
          level, difficulty,
          main: sdef.main, right: sdef.right || null, levelling: !!sdef.levelling,
          mainName: engine.skillName(sdef.main),
          unlocksAt: sdef.levelling ? engine.requiredCharLevel(def.main, { cls: def.cls, points: {} }) : null,
          vs: Math.round(damageIn(b, sdef.main, difficulty)),
          points: Object.entries(b.points).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).map(([id, n]) => [engine.skillName(id), n]),
          attrs: b.attrs,
          gear: Object.entries(b.gear).filter(([slot]) => !slot.endsWith("2")).map(([slot, st]) => [slot, catalog.resolve(st, b.level)?.def.name]).filter(([, n]) => n),
          life: Math.round(c.life.total), mana: Math.round(c.mana.total),
          notes: [...new Set(notes)].slice(0, 4),
          build: b,
        });
        console.log(`   stage ${level} (${difficulty}): ${engine.skillName(sdef.main)}${sdef.levelling ? " (levelling)" : ""}, ${Object.keys(b.gear).length} items`);
      } catch (e) {
        guide.push({ level, difficulty, notes: [`Couldn't build this stage: ${e.message}`] });
        console.log(`   stage ${level}: failed: ${e.message}`);
      }
    }
    // The endgame build is the last stage.
    guide.push({ level: endgame.level, difficulty: "Hell", main: def.main, right: def.right || null, levelling: false, final: true });
    return guide;
  }
  const { plan, skipped, noScaling } = planTrees({ engine, catalog, planner, computeCharacter, damage, refsOf, recommend: recommendWeapon, handPicked: PRESETS });
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  if (noScaling.length) console.log(`Not used as a main or right skill (damage doesn't rise with its points in the planner): ${noScaling.join("; ")}`);
  console.log(`${plan.length} trees planned; not built (nothing the planner can build around yet): ${skipped.join("; ") || "none"}`);
  // One preset built at a level and difficulty: the endgame preset (final, level 150, Hell),
  // or a stage of its levelling guide. Problems go to `sink`.
  // Orbs a levelling stage may put on one item (a levelling player doesn't stack dozens); the
  // endgame build has no budget.
  const ORB_BUDGET = { Normal: 2, Nightmare: 5, Hell: 10 };
  async function buildAt(def, level, difficulty, final, sink, { minTiers = null, minGemLevel = 0, keepGear = null, found = false } = {}) {
    memory.clear();
    const scope = effectScope();
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass(def.cls);
    p.setLevel(level);
    p.setDifficulty(difficulty);
    if (difficulty === "Hell") p.build.value.quests['justicar_signet.hell'] = true;
    if (final) p.setSignets(computeCharacter(p.build.value, { engine, catalog, planner }).statPoints.signetCap);
    p.state.autoLevel = false;
    const missing = [def.main, def.right, ...(def.extra || [])].filter((id) => id && !engine.node(p.build.value, id));
    if (missing.length) throw new Error(`${def.name}: not ${def.cls} skills: ${missing.join(", ")}`);
    // A skill's prerequisites first (the points they need), then the skill to its maximum.
    // Optional skills (synergies) that can't be learned alongside the rest are skipped.
    const notesEssentials = [];
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
    // A right-hand skill that can't be learned alongside the rest is dropped (with a note)
    // rather than stopping the whole run.
    if (def.right) {
      try { learn(def.right); }
      catch (e) { console.log(`   dropping the right-hand skill: ${e.message}`); def.right = undefined; }
    }
    for (const id of def.extra || []) learn(id, !final);
    for (const id of [...synergies, ...(def.right ? refsOf(def.right).filter((r) => engine.node(p.build.value, r)) : [])])
      if ((p.build.value.points[id] || 0) < engine.maxLevel(p.build.value, id)) learn(id, true);
    // What the build guides give nearly every build for a point or two: a teleport, and
    // skills whose one point brings movement speed, damage taken reduced, physical
    // resistance, avoid or hit recovery (read from the game data at one point). A few points
    // at most; the rest goes where the build's measure says.
    if (level >= 12) {
      const budget = Math.max(2, Math.floor(engine.available(p.build.value) * 0.08));
      let spentOn = 0;
      const b0 = () => p.build.value;
      const effects = (id) => { try { return engine.skillStatEffects({ ...b0(), points: { ...b0().points, [id]: 1 } }, id) || []; } catch { return []; } };
      const worth = (id) => {
        const sk = engine.skill(id);
        if (!engine.node(b0(), id) || (b0().points[id] || 0) > 0 || sk.tags.some((t) => ["Stance", "Morph", "Paragon"].includes(t))) return 0;
        if (sk.tags.includes("Warp")) return 5;
        let v = 0;
        for (const [k, x] of effects(id)) {
          if (k === "movement_speed") v += x > 0 ? 3 : -99;
          else if (/damage_taken_reduced/.test(k) && x > 0) v += 3;
          else if (k === "physical_resistance" && x >= 5) v += 2;
          else if (k === "avoid_chance" && x >= 5) v += 2;
          else if (k === "hit_recovery" && x >= 10) v += 1;
        }
        return v;
      };
      const cands = skillsOfClassFor(def.cls).map((id) => ({ id, v: worth(id) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
      let warp = false;
      for (const { id } of cands) {
        const isWarp = engine.skill(id).tags.includes("Warp");
        if (isWarp && warp) continue;
        const before = JSON.parse(JSON.stringify(b0().points)), was = engine.spent(b0());
        try { learn(id, true, new Set(), 1); } catch { p.build.value.points = before; continue; }
        const cost = engine.spent(b0()) - was;
        if (!cost || cost > 2 || spentOn + cost > budget) { p.build.value.points = before; continue; }
        spentOn += cost;
        if (isWarp) warp = true;
        notesEssentials.push(engine.skillName(id));
      }
    }
    for (const id of def.buffs || []) p.toggleBuff(id);
    p.build.value.leftSkill = def.main;
    p.build.value.rightSkill = def.right || null;
    p.state.suggestAttributes = true;
    p.state.allowAttributeRespec = true;
    p.state.suggestEnhancements = true;
    p.state.maxOrbsPerItem = final ? null : ORB_BUDGET[difficulty] ?? null;
    p.state.minTiers = minTiers && Object.keys(minTiers).length ? { ...minTiers } : null;
    p.state.minGemLevel = minGemLevel || null;
    p.state.keepGear = keepGear;
    p.state.foundGear = found;
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
      if (!count || !funded) sink.push(`${def.name}: Suggest gear failed (${count} items, funded ${!!funded}): ${p.state.message}`);
      else {
        p.build.value.attrs = funded;
        p.build.value.attrs = releaseUnusedRequirements(p.build.value, {}, env);
        p.build.value.attrs = spendRemaining(p.build.value, env, buildProfile(p.build.value, engine));
      }
    } else {
      // A suggestion can need attributes only its own items give (Lionheart's strength for the
      // boots): check it can be put on one item at a time, and fund it that way if not. At
      // level 150 there's always room; lower stages sometimes need it.
      const env = { engine, catalog, planner };
      if (!wearableBothSets(p.build.value, env)) {
        const funded = fundLoadout(p.build.value, {}, env);
        if (funded) {
          p.build.value.attrs = funded;
          p.build.value.attrs = releaseUnusedRequirements(p.build.value, {}, env);
          p.build.value.attrs = spendRemaining(p.build.value, env, buildProfile(p.build.value, engine));
        } else sink.push(`${def.name} (level ${level}): its gear can't be put on one item at a time`);
      }
    }
    return count;
    };
    let count = await suggestGear();
    // Spend the full budget, comparing damage of the slotted skills plus survivability
    // and recovery. Neutral choices favour the main tree and passives, one point at a
    // time so newly unlocked upgrades can compete before filling an optional skill.
    const profile = buildProfile(p.build.value, engine);
    // A summoner's damage isn't estimated: its summons' own numbers (life, damage, count, which
    // points and synergies raise) stand in for it.
    const summonPower = (b) => summonPowerOf(b, [def.main, def.right], { engine, catalog, planner, computeCharacter });
    // The build's measure (rating.js): sustained bossing and clearing damage (speed
    // breakpoints, hit chance, cooldowns, mana), survivability (resistances, avoid, block),
    // hit recovery frames and movement; plus life recovery. Summons: their own numbers.
    // Measured against this stage's own difficulty: its typical monster's resistances.
    const renvD = { ...renv, difficulty, target: targets[difficulty] };
    const score = (b) => {
      const m = renv.rating.buildMetrics(b, renvD);
      const combat = combatScore(b, computeCharacter(b, { engine, catalog, planner }), engine, profile);
      return renv.rating.buildValue(m, { summonPower: def.summoner || m.unrated ? summonPower(b) : 0 }) + combat.sustainScore;
    };
    const skillsOfClass = skillsOfClassFor(def.cls);
    // Enhancement plans (sockets or orbs first, or orbs kept room for) judged by this measure.
    p.state.enhanceJudge = (gear) => score({ ...p.build.value, gear });
    const tLoop = Date.now();
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
        // A skill that raises other skills' caps (Specialization: +1 to active skills per 2
        // points) is worth what the raised skills then add: refill those already at their cap.
        const own = added, refill = [];
        for (const other of Object.keys(b.points)) {
          if (other === id) continue;
          const before = engine.maxLevel(b, other), after = engine.maxLevel(trial, other);
          if (!(after > before) || (b.points[other] || 0) < before) continue;
          let n = 0;
          while (n < after - before && engine.canAdd(trial, other, { autoLevel: false }).ok) { trial.points[other]++; n++; }
          if (n) { refill.push([other, n]); added += n; }
        }
        const gain = (score(trial) - now) / added;
        const node = engine.node(b, id);
        const priority = (id === def.main || id === def.right ? 4 : 0)
          + (node.tabName === engine.node(b, def.main).tabName ? 2 : 0)
          + (node.tags?.includes('Passive') ? 1 : 0);
        if (!best || gain > best.gain + 1e-8 || Math.abs(gain - best.gain) <= 1e-8 && priority > best.priority)
          best = { id, added: gain > 1e-8 ? own : 1, refill: gain > 1e-8 ? refill : [], gain, priority };
      }
      if (!best) break;
      p.add(best.id, best.added);
      for (const [other, n] of best.refill) p.add(other, n);
    }
    if (process.env.PROFILE) console.log(`   [time] points loop ${((Date.now() - tLoop) / 1000).toFixed(1)}s`);
    // The skill bar: the build's other usable skills with points, up to 8: buffs, stances
    // and morphs first (switched on, unless they clash with an active stance or morph), then
    // damage skills with more than one point (strongest first; a lone prerequisite point
    // isn't a skill the build uses), then movement (Warp) and summons, then any other active
    // skill with points (Discharge on the Storm Amazon: the planner doesn't work out its damage,
    // but the build uses it). Before the last gear suggestion, so the gear accounts for the buffs.
    {
      const b = p.build.value;
      const slotted = new Set([def.main, def.right].filter(Boolean));
      const usable = Object.keys(b.points).filter((id) => b.points[id] > 0 && !slotted.has(id) && engine.node(b, id)
        && !engine.skill(id).tags.some((t) => ["Passive", "Upgrade"].includes(t)) && engine.skill(id).tags.length);
      const tags = (id) => engine.skill(id).tags;
      const buffs = usable.filter((id) => isToggleSkill(engine.skill(id)));
      const hitters = usable.filter((id) => !buffs.includes(id) && b.points[id] > 1)
        .map((id) => ({ id, d: damage(b, id) })).filter((x) => dealsDamage(x.d)).sort((x, y) => y.d.vs - x.d.vs).map((x) => x.id);
      const moves = usable.filter((id) => !buffs.includes(id) && !hitters.includes(id) && tags(id).some((t) => t === "Warp" || t === "Warp Strike"));
      const summons = usable.filter((id) => !buffs.includes(id) && !hitters.includes(id) && tags(id).some((t) => /Summon/.test(t)));
      const others = usable.filter((id) => b.points[id] > 1 && ![...buffs, ...hitters, ...moves, ...summons].includes(id)).sort((x, y) => b.points[y] - b.points[x]);
      const bar = [...buffs, ...hitters, ...moves, ...summons, ...others].slice(0, 8);
      for (const id of buffs.filter((id) => bar.includes(id))) {
        const exclusive = tags(id).find((t) => t === "Stance" || t === "Morph");
        const clash = exclusive && b.buffs.some((x) => x !== id && engine.skill(x)?.tags.includes(exclusive));
        if (!clash && !b.buffs.includes(id)) p.toggleBuff(id);
      }
      for (const id of bar) p.addToBar(id);
    }
    // The mercenary (mercs.js): none, or the party-buff one that makes the build score highest
    // (its buff counts in the character's stats), with gear for a stronger buff and its survival.
    // Hired in this stage's difficulty; its level follows the character's. Before the last gear
    // suggestion, so the character's gear accounts for the buff.
    {
      const b = p.build.value;
      let best = { s: score(b), merc: null };
      for (const { spec } of buffSpecs(planner)) {
        const trial = JSON.parse(JSON.stringify(b));
        trial.merc = { spec, level: null, difficulty, gear: {}, off: [] };
        trial.merc.gear = suggestMercGear(trial, { catalog, data: planner });
        const s = score(trial);
        if (s > best.s + 1e-6) best = { s, merc: trial.merc };
      }
      if (best.merc) p.build.value.merc = best.merc;
      if (final || best.merc) console.log(`   mercenary (level ${level}, ${difficulty}): ${best.merc ? `${best.merc.spec}, ${Object.keys(best.merc.gear).length} items` : "none helps"}`);
    }
    // A published preset must have a successful suggestion for its final skills.
    if (!(count = await suggestGear(true))) {
      sink.push(`${def.name}: final equipment suggestion failed`);
    }
    // Gear, charms and relics, sets and attributes by the build's own measure (refine.mjs).
    {
      const changes = [], tRef = Date.now();
      refineBuild(p, { engine, catalog, planner, score, level, keepGear, allow: found ? foundGear.found : null,
        use: relevance.buildUse(p.build.value, renvD), wastedLines: relevance.wastedLines, fundLoadout, releaseUnusedRequirements, spendRemaining, wearableBothSets, buildProfile, computeCharacter, log: (t) => changes.push(t) });
      if (final || changes.length) console.log(`   refined (level ${level}): ${changes.length} changes${changes.length ? `: ${changes.slice(0, 8).join("; ")}${changes.length > 8 ? " …" : ""}` : ""}`);
      if (process.env.PROFILE) console.log(`   [time] refine ${((Date.now() - tRef) / 1000).toFixed(1)}s`);
      if (notesEssentials.length && final) console.log(`   utility: ${notesEssentials.join(", ")}`);
    }
    // Whatever happened above, the build must be able to put its gear on. If it can't (no
    // funding of its attributes fits the loadout), the loadout is put back together from
    // nothing: its items one at a time, the lowest requirement first, each kept if the whole
    // can still be worn, else swapped for the best the character can wear in that slot (the
    // planner's own suggestion with its current attributes), else left off. The stage says
    // what changed.
    {
      const env = { engine, catalog, planner };
      const b = p.build.value;
      if (!wearableBothSets(b, env)) {
        const nameOf = (st) => catalog.resolve(st, b.level)?.def.name || "item";
        const req = (st) => { const r = catalog.resolve(st, b.level); return (r?.head.reqStr || 0) + (r?.head.reqDex || 0); };
        const original = { ...b.gear }, changes = [];
        b.gear = {};
        // Items the stage keeps from the one before (keepGear) go on first, so they stay if
        // they can.
        const kept = (slot) => (keepGear?.[slot]?.ref === original[slot]?.ref ? 0 : 1);
        for (const slot of Object.keys(original).sort((x, y) => kept(x) - kept(y) || req(original[x]) - req(original[y]))) {
          // Whether the character's attribute points can be spent so it all goes on, not just
          // whether what's spent now covers it.
          const fits = (st) => {
            const trial = { ...b, gear: { ...b.gear, [slot]: st } };
            if (wearableBothSets(trial, env)) return true;
            const attrs = fundLoadout(trial, {}, env);
            return !!attrs && wearableBothSets({ ...trial, attrs }, env);
          };
          if (fits(original[slot])) { b.gear[slot] = original[slot]; b.attrs = fundLoadout(b, {}, env) || b.attrs; continue; }
          const pick = p.recommend(slot, 30).find((x) => fits(x.state));
          if (pick) { b.gear[slot] = pick.state; b.attrs = fundLoadout(b, {}, env) || b.attrs; }
          const was = nameOf(original[slot]);
          changes.push(!pick ? `took off ${was}` : pick.def.name === was ? `${was}: a lower tier` : `${was} → ${pick.def.name}`);
        }
        const funded = fundLoadout(b, {}, env);
        if (funded) b.attrs = funded;
        if (!wearableBothSets(b, env)) sink.push(`${def.name} (level ${level}): gear still can't be put on one item at a time`);
        if (changes.length) sink.push(`${def.name} (level ${level}): ${changes.join("; ")} (needed more attributes than it has)`);
      }
    }
    return { p, scope, count, t0 };
  }
  // A full run takes hours: each finished preset is saved, and RESUME=1 skips those done.
  const STAGES_ONLY = !!process.env.STAGES_ONLY;
  const PROGRESS = process.env.PROGRESS_FILE || (STAGES_ONLY ? ".preset-stages-progress.json" : ".preset-progress.json");
  const [shardK, shardN] = (process.env.SHARD || "").split("/").map(Number);
  const inShard = (i) => !shardN || i % shardN === shardK;
  const published = STAGES_ONLY ? JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets : [];
  const progress = !only.length && (process.env.RESUME || shardN) ? JSON.parse(await readFile(PROGRESS, "utf8").catch(() => "{}")) : {};
  if (progress.patch && progress.patch !== planner.game?.patch) throw new Error(`${PROGRESS} is from patch ${progress.patch}; delete it to start again`);
  const done = progress.done || {};
  if (Object.keys(done).length) console.log(`Resuming: ${Object.keys(done).length} presets already built (${PROGRESS})`);
  for (const def of plan.filter((d, i) => (!only.length || only.includes(d.id)) && inShard(i))) {
    if (done[def.id]) {
      out.push(done[def.id].preset);
      if (done[def.id].stages) stages[def.id] = done[def.id].stages;
      problems.push(...done[def.id].problems);
      continue;
    }
    const before = problems.length;
    if (STAGES_ONLY) {
      const pub = published.find((x) => x.id === def.id);
      if (!pub) { problems.push(`${def.name}: not published, so no stages to remake`); continue; }
      console.log(`
${def.name}: levelling stages`);
      out.push(pub);
      if (!process.env.NO_STAGES) stages[def.id] = await levellingGuide(def, pub.build);
      done[def.id] = { preset: pub, stages: stages[def.id] || null, problems: problems.slice(before) };
      await writeFile(PROGRESS, JSON.stringify({ patch: planner.game?.patch, done }));
      continue;
    }
    const { p, scope, count, t0 } = await buildAt(def, LEVEL, "Hell", true, problems);
    const b = JSON.parse(JSON.stringify(p.build.value));
    const c = computeCharacter(b, { engine, catalog, planner });
    if (engine.spent(b) !== engine.available(b)) problems.push(`${def.name}: ${engine.available(b) - engine.spent(b)} skill points remain unspent`);
    if (c.statPoints.signets !== c.statPoints.signetCap) problems.push(`${def.name}: signets are not at the available cap`);
    if (c.statPoints.spent !== c.statPoints.available) problems.push(`${def.name}: attribute points remain unspent`);
    console.log(`\n${def.name} (${def.cls}), level ${b.level}: ${engine.spent(b)}/${engine.available(b)} points, ${count} items in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`   points: ${Object.entries(b.points).map(([id, n]) => `${engine.skillName(id)} ${n}`).join(", ")}`);
    { const m = renv.rating.buildMetrics(b, renv); console.log(`   rating: boss ${m.boss ?? "-"}/s, clear ${m.clear ?? "-"}/s, sustain ${m.sustain ?? "-"}% (mana ${m.mana}, in ${m.manaIn}/s, spend ${m.manaSpend ?? "-"}/s), ehp ${m.ehp} (life ${m.life}, res ${m.resist}, avoid ${m.avoid}, block ${m.block}), hit recovery ${m.fhrFrames} frames, movement ${m.movement}%; inventory ${b.inventory.length}; attrs ${JSON.stringify(b.attrs)}`); }
    console.log(`   gear: ${Object.entries(b.gear).map(([s, st]) => `${s} ${catalog.resolve(st, b.level)?.def.name}`).join(", ")}`);
    for (const pr of p.problems.value) problems.push(`${def.name}: ${pr}`);
    for (const i of c.issues || []) problems.push(`${def.name}: ${i.text || i.message || JSON.stringify(i)}`);
    // Every damage skill the preset supplies must respond to the player's choices: the left
    // and right skills and the damage skills on the bar.
    if (def.summoner) for (const id of [def.main, def.right].filter(Boolean)) {
      // Summons: their numbers must respond to points in them.
      const c0 = computeCharacter(b, { engine, catalog, planner });
      const at = (n) => JSON.stringify(engine.skillValues({ ...b, points: { ...b.points, [id]: n }, soft: c0.soft, charStats: c0.charStats }, id));
      if (b.points[id] > 1 && at(b.points[id]) === at(b.points[id] - 1)) problems.push(`${def.name}: ${engine.skillName(id)}'s values don't change with points`);
    }
    // The right-hand skill is checked like the bar's: it must respond to something the player
    // chooses, but a skill that grows by less than a point per level (Frigid Domain) may not
    // show it over a few points.
    else for (const id of [def.main, def.right].filter(Boolean)) check(def, b, id, id === def.right);
    for (const id of b.skillBar.filter((x) => dealsDamage(damage(b, x)))) check(def, b, id, true);
    // What the Builds page shows without loading the planner: each slotted skill's damage
    // (every hit or cast it repeats, against the typical Hell monster), the gear and points.
    const summary = {
      skills: [def.main, def.right].filter(Boolean).map((id) => {
        const x = damage(b, id);
        return { id, name: engine.skillName(id), kind: x.d.kind, vs: x.vs, ...(x.d.count ? { count: x.d.count.n } : {}) };
      }),
      gear: Object.entries(b.gear).filter(([slot]) => !slot.endsWith("2")).map(([, st]) => catalog.resolve(st, b.level)?.def.name).filter(Boolean),
      unspent: engine.available(b) - engine.spent(b),
      bar: b.skillBar.map((id) => engine.skillName(id)),
      // The card's skill icons and what their hover shows (the Builds page has no skill data).
      icons: [[def.main, "Left skill"], [def.right, "Right skill"], ...b.skillBar.map((id) => [id, "Skill bar"])].filter(([id]) => id).map(([id, slot]) => {
        const sb = { ...b, soft: c.soft, charStats: c.charStats }, sk = engine.skill(id), d = damage(b, id);
        const lines = engine.describe(sb, id, b.points[id] || 0).effect.filter((l) => l.status !== "unknown" && l.text && !l.heading).map((l) => l.text).slice(0, 6);
        return { id, slot, name: sk.name, image: sk.image, points: b.points[id] || 0, soft: c.soft[id] || 0,
          ...(b.buffs.includes(id) ? { active: true } : {}), description: sk.description?.[0] || "", lines,
          ...(d.vs > 0 ? { vs: Math.round(d.vs), per: d.d.count ? "each" : d.d.kind === "attack" ? "per hit" : "per cast" } : {}) };
      }),
      buffs: b.buffs.map((id) => engine.skillName(id)),
      // The hired mercenary, for the card (its buff is already in the numbers above).
      ...(b.merc ? { merc: b.merc.spec } : {}),
      life: Math.round(c.life.total), mana: Math.round(c.mana.total),
    };
    scope.stop();
    out.push({ id: def.id, name: def.name, cls: def.cls, tree: def.tree, level: b.level, blurb: def.blurb, ...(def.summoner ? { summoner: true } : {}),
      skills: [def.main, def.right, ...b.skillBar].filter(Boolean).map((id) => engine.skillName(id)), summary, build: b });
    if (!process.env.NO_STAGES) stages[def.id] = await levellingGuide(def, b);
    if (!only.length) {
      done[def.id] = { preset: out.at(-1), stages: stages[def.id] || null, problems: problems.slice(before) };
      await writeFile(PROGRESS, JSON.stringify({ patch: planner.game?.patch, done }));
    }
  }
  if (shardN) {
    console.log(`
shard ${shardK}/${shardN}: ${out.length} presets saved to ${PROGRESS}`);
  }
  else if (STAGES_ONLY) {
    // With ONLY, just those builds' guides are replaced; the others stay.
    const prev = only.length ? JSON.parse(await readFile("src/data/preset-stages.json", "utf8").catch(() => '{"stages":{}}')).stages : {};
    await writeFile("src/data/preset-stages.json", JSON.stringify({ patch: planner.game?.patch, stages: { ...prev, ...stages } }));
    console.log(`levelling guides for ${Object.keys(stages).length} presets written to src/data/preset-stages.json (endgame builds kept)`);
    await rm(PROGRESS, { force: true });
  }
  else if (only.length) {
    console.log(`\nONLY=${only.join(",")}: ${out.length} built, presets not published`);
    // TRIAL_OUT=file: the builds and their guides go to that file alone, for the audit's --from
    // (a trial of a generator change on a few builds before remaking them all).
    if (process.env.TRIAL_OUT) {
      await writeFile(process.env.TRIAL_OUT, JSON.stringify({ presets: out, stages }));
      console.log(`trial written to ${process.env.TRIAL_OUT}`);
    }
    // Otherwise their levelling guides are merged into the guides file (one build's guide can be
    // redone alone).
    else if (!process.env.NO_STAGES && Object.keys(stages).length) {
      const file = "src/data/preset-stages.json";
      const prev = JSON.parse(await readFile(file, "utf8").catch(() => '{"stages":{}}'));
      await writeFile(file, JSON.stringify({ patch: planner.game?.patch, stages: { ...prev.stages, ...stages } }));
      console.log(`levelling guides merged into ${file}: ${Object.keys(stages).join(", ")}`);
    }
  }
  else {
    // The guides first: a preset check that blocks publishing shouldn't cost hours of guides.
    if (!process.env.NO_STAGES) {
      await writeFile("src/data/preset-stages.json", JSON.stringify({ patch: planner.game?.patch, stages }));
      console.log(`levelling guides for ${Object.keys(stages).length} presets written to src/data/preset-stages.json`);
    }
    // Tiers (S to F) against each other, for the Builds page (src/planner/rating.js).
    if (!problems.length) ratePresets(out, await ratingEnv(load, planner, data));
    await publishPresets("src/data/preset-builds.json", {
      note: "Generated by scripts/build-presets.mjs with the planner's own rules and Suggest gear; not tested in game.",
      patch: planner.game?.patch, skipped, presets: out,
    }, problems);
    console.log(`\n${out.length} presets written to src/data/preset-builds.json`);
    await rm(PROGRESS, { force: true });
  }
} finally {
  await vite.close();
}
if (problems.length) {
  console.error(`\n${problems.length} problems:\n - ${problems.join("\n - ")}`);
  process.exitCode = 1;
}
