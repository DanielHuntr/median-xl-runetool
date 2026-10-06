import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { createSSRApp, h, effectScope, provide } from "vue";
import { renderToString } from "@vue/server-renderer";

const planner = JSON.parse(await readFile(new URL("../public/planner/data.json", import.meta.url), "utf8"));

function stubBrowser(hash = "#planner") {
  const memory = new Map();
  globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), clear: () => memory.clear() };
  globalThis.window = {
    location: { hash, href: `http://localhost/${hash}` },
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.document = { documentElement: { dataset: {} } };
  return memory;
}

let vite;
const load = (p) => vite.ssrLoadModule(p);
test.before(async () => {
  stubBrowser();
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
});
test.after(() => vite.close());

async function env() {
  const data = await load("/src/data/index.js");
  const { createEngine } = await load("/src/planner/engine.js");
  const { createCatalog } = await load("/src/planner/items.js");
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  return { data, engine, catalog };
}
const build = (cls, extra = {}) => ({
  cls, level: 1, points: {}, quests: {}, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
  signets: 0, difficulty: "Hell", gear: {}, swap: false, inventory: [], buffs: [], ...extra,
});

test("skill rules: prerequisites, auto level, caps, safe removal, devotion", async () => {
  const { engine } = await env();
  let b = build("Amazon");
  const add = (id) => {
    const r = engine.canAdd(b, id, { autoLevel: true });
    if (r.ok) b = { ...b, level: r.level, points: { ...b.points, [id]: (b.points[id] || 0) + 1 } };
    return r;
  };
  assert.match(add("barrage").reason, /Requires Trinity Arrow/);
  assert.ok(add("trinity_arrow").ok);
  assert.ok(add("barrage").ok);
  assert.equal(b.level, 5, "barrage needs character level 5");
  for (let i = 0; i < 20; i++) add("trinity_arrow");
  assert.equal(b.points.trinity_arrow, engine.maxLevel(b, "trinity_arrow"));
  assert.match(engine.canRemove({ ...b, points: { trinity_arrow: 1, barrage: 1 } }, "trinity_arrow").reason, /Barrage/);
  // Without auto level, a point beyond the budget is refused with the level needed.
  const r = engine.canAdd({ ...b, level: 1 }, "dragonlore", { autoLevel: false });
  assert.equal(r.ok, false);
  // Devotion: points in Bow lock out another devotion tree.
  const jav = engine.treeNodes("Amazon", "Javelin").find((n) => !n.prereqs.some((p) => p.startsWith("skill_level")));
  if (jav) assert.match(engine.restrictionProblems(b, jav.id).join(" "), /Devotion/);
  // Warmth's cap grows with character level.
  assert.ok(engine.maxLevel(build("Sorceress", { level: 100 }), "warmth") > engine.maxLevel(build("Sorceress"), "warmth"));
});

test("formula parser: game maths without running arbitrary code", async () => {
  const { evaluate } = await load("/src/planner/formula.js");
  const ctx = { vars: { blvl: 5, slvl: 0, lvl: 5, ulvl: 100 }, skillLevel: () => 3, skillStat: () => 10, treePoints: () => 7 };
  assert.equal(evaluate("frames(25)", ctx).value, 1);
  assert.equal(evaluate("floor((293*lvl-2)/12)", ctx).value, 121);
  assert.equal(evaluate("-(5+floor(blvl/2))", ctx).value, -7);
  assert.equal(evaluate("if([[execution]],275,25)", ctx).value, 275);
  assert.equal(evaluate("if({{base_dexterity}}>=200,10,0)", ctx).usesStats, true);
  for (const evil of ["constructor", "this.constructor.constructor('x')()", "globalThis", "blvl;alert(1)", "a=1"])
    assert.throws(() => evaluate(evil, ctx), `should reject ${evil}`);
});

test("item text parser recognises almost every catalogue line", async () => {
  const { data, catalog } = await env();
  const { applyRolls, parseLine } = await load("/src/planner/statparse.js");
  const ctx = { level: 100, skillByName: catalog.skillByName };
  const one = (l) => parseLine(applyRolls(l).text, ctx);
  assert.deepEqual(one("Fire Resist +(31 to 50)%").effects, [["fire_resistance", 50]]);
  assert.deepEqual(one("-(3 to 8)% to Enemy Lightning Resistance").effects, [["enemy_lightning_resistance", 8]]);
  assert.deepEqual(one("+0.5 to Life (Based on Character Level)").effects, [["life", 50]]);
  assert.equal(one("Elemental Resists +10%").effects.length, 4);
  assert.equal(one("5% Chance to cast level 9 Bloodlust on Kill").kind, "proc");
  assert.equal(one("+3 to Holy Fire (Paladin Only)").kind, "skill");
  assert.equal(one("Totally new stat 5").kind, "unknown");
  assert.equal(applyRolls("+(10 to 20)% Enhanced Damage", [0]).text, "+10% Enhanced Damage");
  const lines = [
    ...data.SUD.flatMap((u) => u.raw),
    ...data.SETD.flatMap((s) => s.items.flatMap((i) => i.raw)),
    ...data.RW.flatMap((r) => r.stats),
  ];
  const unknown = lines.filter((l) => one(l).kind === "unknown").length;
  assert.ok(unknown / lines.length < 0.03, `${unknown} of ${lines.length} lines unrecognised`);
});

test("items: slots, sockets by slot type, set jewellery and runeword bases", async () => {
  const { catalog } = await env();
  assert.ok(catalog.forSlot("amulet", "Amazon").some((d) => d.name === "Eye of Wisdom"), "set amulet fits the amulet slot");
  assert.ok(catalog.forSlot("offhand", "Barbarian").some((d) => d.slotType === "weapon"), "barbarians dual-wield");
  assert.ok(!catalog.forSlot("offhand", "Sorceress").some((d) => d.slotType === "weapon"));
  const ruby = catalog.all().find((d) => d.name === "Perfect Ruby");
  const helm = catalog.forSlot("helm", "Paladin").find((d) => d.kind === "base");
  const shield = catalog.forSlot("offhand", "Paladin").find((d) => d.kind === "base" && d.slotType === "shield");
  const inHelm = catalog.resolve({ ref: helm.key, variant: 4, socketCount: 1, sockets: [ruby.key] }, 100);
  const inShield = catalog.resolve({ ref: shield.key, variant: 4, socketCount: 1, sockets: [ruby.key] }, 100);
  assert.notDeepEqual(inHelm.sockets[0].lines, inShield.sockets[0].lines, "gems give armor vs shield stats");
  const rw = catalog.all().find((d) => d.kind === "runeword" && d.name === "Gehenna");
  const bases = catalog.runewordBases(rw);
  assert.ok(bases.length > 20 && bases.every((b) => b.slotType === "weapon"));
  const r = catalog.resolve({ ref: rw.key, base: bases[0].key }, 100);
  assert.equal(r.socketCount, rw.runes.length);
  const custom = catalog.resolve({ ref: "custom", custom: { name: "Ring", slotType: "ring", text: "+2 to All Skills\nWidgets 5" } }, 90);
  assert.deepEqual(custom.parsed.map((p) => p.kind), ["stats", "unknown"]);
});

test("item +levels to the class's own skills: plain lines at most +3 together, (Class Only) lines in full; other classes' skills add up", async () => {
  // The game's skill level (D2Common 0x6FD9FCB0): stat 97 ("+N to Skill") capped at 3 for the
  // player's own class, stat 107 ("+N to Skill (Class Only)") not; the docs' Relics page says the same.
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const item = (slotType, text) => ({ ref: "custom", custom: { name: slotType, slotType, text: `Required Level: 1
${text}` } });
  const sorc = (gear) => computeCharacter(build("Sorceress", { level: 120, points: { warmth: 1 }, gear }), { engine, catalog, planner });
  assert.equal(sorc({ ring1: item("ring", "+10 to Warmth"), ring2: item("ring", "+10 to Warmth") }).soft.warmth, 3);
  assert.equal(sorc({ ring1: item("ring", "+2 to Warmth"), amulet: item("amulet", "+5 to Warmth (Sorceress Only)") }).soft.warmth, 7);
  const other = Object.entries(planner.skills).find(([id]) => !engine.node(build("Sorceress"), id) && Object.values(planner.trees).some((t) => JSON.stringify(t).includes(`"${id}"`)));
  assert.ok(other, "a skill from another class's tree");
  const c = sorc({ ring1: item("ring", `+4 to ${other[1].name}`), ring2: item("ring", `+5 to ${other[1].name}`) });
  assert.equal(c.itemSkills[other[0]], 9);
});

test("added bonuses from the game's cube recipes: trophies, scrolls of enchantment, shrines and cycles, each only where it fits", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const B = JSON.parse(await readFile(new URL("../src/data/item-bonuses.json", import.meta.url), "utf8"));
  const lies = catalog.all().find((d) => d.name === "The Book of Lies");
  const trophy = B.trophies.find((t) => `inv:${t.charm}` === lies.key);
  assert.deepEqual(trophy.lines, ["Weapon Physical Damage +20%"], "Lord of Lies Trophy");
  const wpd = (inventory) => computeCharacter(build("Barbarian", { level: 120, inventory }), { engine, catalog, planner }).s("enhanced_weapon_damage");
  assert.equal(wpd([{ ref: lies.key, addons: [trophy.id] }]) - wpd([{ ref: lies.key }]), 20);
  // A trophy for another charm, or a second trophy, adds nothing.
  const other = B.trophies.find((t) => t.id !== trophy.id);
  assert.equal(wpd([{ ref: lies.key, addons: [other.id] }]), wpd([{ ref: lies.key }]));
  // One scroll per item, on its own slot: +2 to All Skills on body armour, not on a helm.
  const allSkills = B.scrolls.find((x) => x.slot === "body" && x.lines.includes("+2 to All Skills"));
  const body = { ref: "custom", custom: { name: "Armor", slotType: "body", text: "Required Level: 1" } };
  const skills = (gear) => computeCharacter(build("Sorceress", { level: 120, gear }), { engine, catalog, planner }).allSkills;
  assert.equal(skills({ body: { ...body, addons: [allSkills.id] } }) - skills({ body }), 2);
  assert.equal(skills({ helm: { ref: "custom", custom: { name: "Helm", slotType: "helm", text: "Required Level: 1" }, addons: [allSkills.id] } }), 0);
  const fire = B.scrolls.find((x) => x.slot === "body" && x !== allSkills);
  assert.equal(catalog.resolve({ ...body, addons: [allSkills.id, fire.id] }, 120).addons.length, 1, "one scroll per item");
  // Shrines: a rare/crafted (custom) item or an honorific base, by category; never a unique.
  const shrine = B.shrines.find((x) => x.category.includes("body armor"));
  assert.equal(catalog.resolve({ ...body, addons: [shrine.id] }, 120).addons.length, 1);
  const unique = catalog.all().find((d) => d.kind === "unique" && d.slotType === "body");
  assert.equal(catalog.resolve({ ref: unique.key, addons: [shrine.id] }, 120).addons.length, 0);
  // Cycles in the Corrupted Wormhole, each adding its required level.
  const wormhole = catalog.all().find((d) => d.name === "Corrupted Wormhole");
  const cycle = B.cycles.find((x) => x.lines.includes("+5 Required Level"));
  const plain = catalog.resolve({ ref: wormhole.key }, 120);
  const cycled = catalog.resolve({ ref: wormhole.key, addons: [cycle.id, cycle.id] }, 120);
  assert.equal(cycled.head.reqLevel - plain.head.reqLevel, 10);
});

test("mastercrafted bases from the game files: fully socketed, never runeword bases, abilities that grow with stats", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const bow = catalog.all().find((d) => d.name === "Maiden Bow (Mastercrafted)");
  assert.equal(bow.kindLabel, "Mastercrafted base");
  const r = catalog.resolve({ ref: bow.key }, 120);
  assert.equal(r.socketCount, 6, "always fully socketed");
  assert.equal(r.canBeSuperior, false);
  assert.ok(!catalog.all().some((d) => d.kind === "runeword" && catalog.runewordBases(d).some((b) => b.mastercrafted)));
  assert.ok(r.parsed.every((p) => p.kind !== "unknown"), JSON.stringify(r.parsed.filter((p) => p.kind === "unknown")));
  // Avoid: max(1, Dexterity / 500), as skill 2031's formula has it.
  const avoid = (dexterity) => computeCharacter(build("Amazon", { level: 120, attrs: { dexterity }, gear: { weapon: { ref: bow.key } } }), { engine, catalog, planner }).stats.avoid_chance?.sources.find((x) => x.source === bow.name)?.value || 0;
  assert.equal(avoid(1000), 2);
  assert.equal(avoid(0), 1, "at least 1%");
  // The Kukri (skill 2032): 14 × Dexterity / 100 + weapon damage % + defense bonus %, one more at the maximum.
  const kukri = catalog.all().find((d) => d.name === "Kukri (Mastercrafted)");
  const c = computeCharacter(build("Assassin", { level: 120, gear: { weapon: { ref: kukri.key }, amulet: { ref: "custom", custom: { name: "Def", slotType: "amulet", text: "40% Bonus to Defense" } } } }), { engine, catalog, planner });
  const dex = c.attributes.dexterity.total;
  assert.equal(c.stats.maximum_lightning_damage.sources.find((x) => x.source === kukri.name).value, Math.floor((14 * dex) / 100) + c.s("enhanced_weapon_damage") + 40 + 1);
});

test("affixes from the game's tables on a custom item: those that fit its base, three of each on a rare, one per group", async () => {
  const { catalog } = await env();
  const A = JSON.parse(await readFile(new URL("../src/data/affixes.json", import.meta.url), "utf8"));
  const base = (name) => catalog.all().find((d) => d.kind === "base" && d.name === name);
  // At item level 120 (the character's, by default): the affix's level reached, its maximum not passed.
  const at120 = (a) => a.level <= 120 && (!a.max || a.max >= 120);
  const custom = (b, extra = {}) => ({ ref: "custom", custom: { name: "Mine", slotType: b.slotType, text: "" }, base: b.key, baseVariant: 0, ...extra });
  // Soulbinder Gloves take its oskill suffixes; gauntlets don't.
  const soul = base("Soulbinder Gloves (Mastercrafted)");
  const flame = A.affixes.find((a) => a.kind === "s" && a.group === 217 && a.types.includes("mw21") && !a.types.includes("glov") && at120(a));
  assert.ok(flame, "an oskill roll only the gloves take");
  assert.deepEqual(catalog.resolve(custom(soul, { affixes: [flame.id] }), 120).affixes.picked.map((a) => a.id), [flame.id]);
  assert.equal(catalog.resolve(custom(base("Gauntlets"), { affixes: [flame.id] }), 120).affixes.picked.length, 0);
  // One per group, three suffixes at most; a magic item takes one.
  const suffixes = A.affixes.filter((a) => a.kind === "s" && a.rare && a.types.includes("mw21") && at120(a));
  const sameGroup = suffixes.filter((a) => a.group === flame.group).slice(0, 2).map((a) => a.id);
  assert.equal(catalog.resolve(custom(soul, { affixes: sameGroup }), 120).affixes.picked.length, 1);
  const groups = [...new Map(suffixes.map((a) => [a.group, a.id])).values()];
  if (groups.length >= 4) assert.equal(catalog.resolve(custom(soul, { affixes: groups.slice(0, 4) }), 120).affixes.picked.length, 3);
  // A crafted item: four random rare affixes in all, at most three of a kind.
  const gloveTypes = catalog.resolve(custom(soul), 120).affixes.types;
  const fitting = (kind) => [...new Map(A.affixes.filter((x) => x.kind === kind && x.rare && at120(x) && x.types.some((t) => gloveTypes.includes(t)) && !(x.not || []).some((t) => gloveTypes.includes(t))).map((x) => [x.group, x.id])).values()].slice(0, 3);
  const mix = [...fitting("s"), ...fitting("p")];
  assert.equal(mix.length, 6);
  assert.equal(catalog.resolve(custom(soul, { affixes: mix }), 120).affixes.picked.length, 6, "a rare: three of each");
  assert.equal(catalog.resolve(custom(soul, { affixes: mix, crafted: true }), 120).affixes.picked.length, 4, "crafted: four in all");
  const r = catalog.resolve(custom(soul, { affixes: [flame.id], magic: true }), 120);
  assert.ok(flame.lines.every((l) => r.lines.includes(l) || r.ranges.some((x) => x.line === l)), "its lines join the item's, with roll sliders");
  assert.ok(r.head.reqLevel >= flame.req, "its required level counts");
  // Echo Sabre: procs only, and the same proc again.
  const sabre = base("Echo Sabre (Mastercrafted)");
  const fits = catalog.resolve(custom(sabre), 120).affixes;
  const proc = A.affixes.find((a) => a.rare && at120(a) && /Chance to cast level/.test(a.lines.join()) && a.types.some((t) => fits.types.includes(t)));
  const plain = A.affixes.find((a) => a.rare && at120(a) && !/Chance to cast/.test(a.lines.join()) && a.types.some((t) => fits.types.includes(t)));
  assert.equal(catalog.resolve(custom(sabre, { affixes: [proc.id, proc.id, plain.id] }), 120).affixes.picked.length, 2);
  // A custom ring with no base uses the game's ring types.
  const ringAffix = A.affixes.find((a) => a.rare && a.types.includes("ring") && at120(a));
  // Item level: an affix that stops rolling below 120 counts only on an item of a lower level.
  const capped = A.affixes.find((a) => a.rare && a.types.includes("ring") && a.max && a.max < 120);
  const ring = (extra) => catalog.resolve({ ref: "custom", custom: { name: "Ring", slotType: "ring", text: "" }, affixes: [capped.id], ...extra }, 120).affixes.picked.length;
  assert.deepEqual([ring({}), ring({ ilvl: capped.max })], [0, 1]);
  assert.equal(catalog.resolve({ ref: "custom", custom: { name: "Ring", slotType: "ring", text: "" }, affixes: [ringAffix.id] }, 120).affixes.picked.length, 1);
});

test("multi-hit skills from missiles.bin: 2 or 3 hits, damage skills only, moving missiles only", async () => {
  const M = JSON.parse(await readFile(new URL("../src/data/multi-hit.json", import.meta.url), "utf8"));
  const entries = Object.entries(M.skills);
  assert.ok(entries.length >= 5);
  for (const [id, m] of entries) {
    assert.ok(m.hits >= 2 && m.hits <= 3, id);
    assert.ok(m.velocity > 0, `${id}: a moving missile`);
    assert.ok(planner.skills[id]?.tags.some((t) => ["Spell", "Projectile", "Attack", "Weapon Damage", "Melee Spell", "Warp Strike", "AoE"].includes(t)), id);
  }
  assert.ok(!M.skills.hammer_of_zerae || M.skills.hammer_of_zerae.hits <= 3);
});

test("summon damage: each minion's tooltip damage, your summon damage on top, every minion; pierce exceptions", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const { skillDamage } = await load("/src/planner/damage.js");
  const owner = (id) => Object.entries(planner.trees).find(([, t]) => JSON.stringify(t).includes(`"${id}"`))[0];
  const dmg = (id, text = "Required Level: 1") => {
    const b = build(owner(id), { level: 120, points: { [id]: 20 }, gear: { amulet: { ref: "custom", custom: { name: "A", slotType: "amulet", text } } } });
    const c = computeCharacter(b, { engine, catalog, planner });
    return skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats }, character: c });
  };
  const harvesters = dmg("harvesters");
  assert.equal(harvesters.kind, "summon");
  assert.ok(harvesters.total[1] > 0 && harvesters.count?.n > 1, JSON.stringify(harvesters.count));
  assert.equal(harvesters.all[1], harvesters.total[1] * harvesters.count.n);
  const boosted = dmg("harvesters", "+100% to Summon Damage");
  assert.ok(Math.abs(boosted.total[1] - harvesters.total[1] * 2) <= 1, `${boosted.total} vs ${harvesters.total}`);
  // Blood Skeleton's own formula reads summon damage (stat 470): counted once, not again on top.
  const skeleton = dmg("blood_skeleton"), skeletonBoosted = dmg("blood_skeleton", "+100% to Summon Damage");
  assert.ok(skeletonBoosted.notes[0].includes("already includes"), skeletonBoosted.notes[0]);
  assert.ok(skeletonBoosted.total[1] < skeleton.total[1] * 2 * 1.5, "not multiplied a second time");
  // Iron Golem doesn't take your pierce; other minions do (no override).
  assert.equal(dmg("iron_golem").pierce?.fire, 0);
  assert.equal(harvesters.pierce, undefined);
});

test("multi-hit skills: about N hits on a monster, counted in the total", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const { skillDamage } = await load("/src/planner/damage.js");
  const b = build("Sorceress", { level: 120, points: { frigid_nova: 20 } });
  const owner = Object.entries(planner.trees).find(([, t]) => JSON.stringify(t).includes('"frigid_nova"'))[0];
  b.cls = owner;
  const c = computeCharacter(b, { engine, catalog, planner });
  const d = skillDamage("frigid_nova", { engine, build: b, skillBuild: { ...b, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats }, character: c });
  assert.equal(d.multiHit, 3);
  assert.equal(d.all[1], d.total[1] * 3);
});

test("relics and charms are plain item text: no MedianDB colour tags or choice objects", () => {
  for (const c of Object.values(planner.inventory)) for (const l of [...c.lines, ...(c.trophy || [])]) {
    assert.equal(typeof l, "string", c.name);
    assert.doesNotMatch(l, /{(orange|grey)}/, c.name);
  }
});

test("the catalogue shows the game's text where the docs disagree (catalogue-fixes.json)", async () => {
  const { catalog } = await env();
  const lines = (name) => catalog.all().find((d) => d.name === name)?.variants.at(-1).lines || [];
  const darkfeast = lines("Darkfeast");
  assert.ok(darkfeast.includes("+(100 to 200) Spell Focus") && !darkfeast.includes("+(50 to 200) Spell Focus"), "Darkfeast: the game's lines");
  assert.ok(!darkfeast.includes("+50% Damage to Undead"), "a docs line the game doesn't have is dropped");
  const staff = lines("Staff of Shadows").filter((l) => /Slayer on Death Blow/.test(l));
  assert.deepEqual(staff, ["8% Chance to cast level 50 Slayer on Death Blow"], "the property's proc, once");
  assert.ok(lines("Relic (Nova Charge)").includes("+10 to Frozen Heart"), "a relic line MedianDB misses is added");
});

test("character sheet: attributes, life, resist penalty, set bonuses, gear skills, passives", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const cls = planner.classes.find((c) => c.name === "Amazon");
  const eye = catalog.all().find((d) => d.name === "Eye of Wisdom");
  const cloud = catalog.all().find((d) => d.name === "Charged Cloud");
  const b = build("Amazon", {
    level: 120,
    attrs: { strength: 10, dexterity: 0, vitality: 20, energy: 0 },
    gear: { amulet: { ref: eye.key }, weapon: { ref: cloud.key } },
  });
  const c = computeCharacter(b, { engine, catalog, planner });
  assert.equal(c.attributes.strength.base, cls.strength + 10);
  assert.ok(c.life.base > cls.life, "life grows with level and vitality");
  assert.equal(c.resist.fire.penalty, -70, "Hell elemental penalty (patch 1.5.0)");
  assert.equal(c.resist.magic.penalty, -60, "Hell magic penalty (patch 2.14.0)");
  const set = c.sets.find((s) => s.set.name === "Thunderstorm");
  assert.equal(set.count, 2);
  assert.equal(set.active.length, 1, "complete-set bonus applies");
  assert.ok(c.stats.enemy_lightning_resistance.sources.some((x) => /Thunderstorm set/.test(x.source)));
  assert.ok(c.allSkills > 0 && Object.values(c.soft).every((v) => v >= c.allSkills));
  // Warmth (passive) adds cold resistance through its paired stat.
  const sorc = computeCharacter(build("Sorceress", { level: 30, points: { molten_core: 1, warmth: 5 } }), { engine, catalog, planner });
  assert.ok(sorc.stats.cold_resistance?.sources.some((x) => /Warmth/.test(x.source)));
  // Skill pierce: Dragonlore's "-10% to enemy elemental resistances" is +10 pierce.
  const ama = computeCharacter(build("Amazon", { level: 30, points: { trinity_arrow: 5, barrage: 5, dragonlore: 1 } }), { engine, catalog, planner });
  const dl = ama.stats.enemy_lightning_resistance?.sources.find((x) => /Dragonlore/.test(x.source));
  assert.ok(dl && dl.value > 0, "skill pierce is positive");
  // Two-handed weapons warn when an off-hand item is equipped.
  const bow = catalog.forSlot("weapon", "Amazon").find((d) => d.kind === "base" && d.cat === "Bows");
  const sh = catalog.forSlot("offhand", "Amazon").find((d) => d.slotType === "shield");
  const w = computeCharacter(build("Amazon", { level: 90, gear: { weapon: { ref: bow.key }, offhand: { ref: sh.key } } }), { engine, catalog, planner });
  assert.ok(w.warnings.some((x) => /two-handed/.test(x)));
  // A Barbarian can put a weapon in the off-hand slot. If the main hand is empty, the damage
  // sheet should still treat that off-hand item as the active weapon, including on set II.
  const offhandOnly = build("Barbarian", { level: 90, swap: true, gear: {
    offhand2: { ref: "custom", custom: { name: "Off-hand axe", slotType: "weapon", text: "One-Hand Damage: 10 to 20\nRequired Level: 1" } },
  } });
  assert.equal(computeCharacter(offhandOnly, { engine, catalog, planner }).damage.hasWeapon, true);
});

test("recommendations follow the build's skills", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const R = await load("/src/planner/recommend.js");
  const run = (b, slot) => {
    const character = computeCharacter(b, { engine, catalog, planner });
    const profile = R.buildProfile(b, engine);
    return { profile, recs: R.recommendForSlot(slot, { build: b, engine, catalog, planner, character, profile, want: R.wantedStats(profile, character) }, 10) };
  };
  const bow = build("Amazon", { level: 110, points: { trinity_arrow: 15, barrage: 20, dragonlore: 1, wyrmshot: 25 } });
  const a = run(bow, "weapon");
  assert.equal(R.describeProfile(a.profile).weapon, "bow or crossbow");
  assert.ok(a.recs.length && a.recs.every((x) => /Bows$|Crossbows$/.test(x.def.cat || catalog.get(x.state.base)?.cat)), "bow builds get bows/crossbows");
  assert.ok(a.recs.every((x) => x.reasons.length), "every suggestion explains itself");
  const off = run(bow, "offhand").recs;
  assert.ok(off.length && off.every((x) => x.def.slotType === "quiver"), "bow builds get quivers in the off-hand");
  const snake = run(build("Barbarian", { level: 110, attrs: { strength: 500, dexterity: 500, vitality: 0, energy: 0 }, points: { snake_bite: 20 } }), "weapon");
  assert.equal(R.describeProfile(snake.profile).weapon, "throwing axe");
  assert.ok(snake.recs.length && snake.recs.every((x) => (x.def.cat || catalog.get(x.state.base)?.cat) === "Throwing Axes"), "throwing axe skills get throwing axes, not regular axes");
  const sorc = build("Sorceress", { level: 110, points: { molten_core: 1, warmth: 10, flamefront: 25, overheat: 10, flamestrike: 20 } });
  const s = run(sorc, "weapon");
  assert.deepEqual(R.describeProfile(s.profile).elements.map((e) => e.name), ["fire"]);
  assert.ok(s.recs.slice(0, 3).some((x) => x.reasons.some((r) => /Flamefront|Flamestrike|Fire/.test(r))), "fire picks near the top");
  const low = run({ ...sorc, level: 20 }, "amulet");
  assert.ok(low.recs.every((x) => catalog.resolve(x.state, 20).head.reqLevel <= 20), "nothing above the character's level");
  assert.equal(R.describeProfile(R.buildProfile(build("Druid"), engine)).empty, true);
});

test("requirement warnings offer an exact one-click fix", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { pointsFor } = await load("/src/planner/character.js");
  // floor((10 + n) × 1.1) must reach 100: n = 80 gives 99, n = 81 gives 100.
  assert.equal(pointsFor({ base: 10, flat: 0, pct: 10 }, 100), 81);
  assert.equal(pointsFor({ base: 200, flat: 0, pct: 0 }, 100), 0);
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Barbarian");
  p.setLevel(120);
  const heavy = catalog.forSlot("body", "Barbarian").find((d) => d.kind === "base" && d.variants.at(-1).lines.some((l) => /Required Strength: [3-9]\d\d/.test(l)));
  p.equip("body", { ref: heavy.key });
  const issue = p.character.value.issues.find((i) => i.fix?.attr === "strength");
  assert.ok(issue, "strength requirement flagged with a fix");
  p.applyFix(issue.fix);
  assert.ok(!p.character.value.issues.some((i) => i.fix?.attr === "strength"), "fix meets the requirement");
  p.setLevel(1);
  const lvl = p.character.value.issues.find((i) => i.fix?.kind === "level");
  p.applyFix(lvl.fix);
  assert.equal(p.build.value.level, lvl.fix.level);
  scope.stop();
});

test("skill damage estimates: attacks, elemental weapons, spells, summons", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const { skillDamage } = await load("/src/planner/damage.js");
  const est = (b, id) => {
    const character = computeCharacter(b, { engine, catalog, planner });
    const skillBuild = { ...b, soft: character.soft, charStats: character.charStats };
    return skillDamage(id, { engine, build: b, skillBuild, character });
  };
  // Stormstrike is an elemental bow: no physical damage, lightning from dexterity.
  const bow = catalog.all().find((d) => d.name === "Stormstrike");
  const b = build("Amazon", {
    level: 110, attrs: { strength: 300, dexterity: 800, vitality: 0, energy: 0 },
    points: { trinity_arrow: 15, barrage: 20 }, gear: { weapon: { ref: bow.key } },
  });
  const atk = est(b, "attack");
  assert.equal(atk.kind, "attack");
  assert.ok(atk.total[1] > 0 && atk.parts.some((p) => p.element === "lightning"), "elemental weapon damage counts");
  const barrage = est(b, "barrage");
  assert.ok(barrage.total[1] > 0 && barrage.formula.includes("90%"), "uses the skill's weapon damage %");
  assert.equal(est(build("Amazon", { level: 110, points: { trinity_arrow: 1, barrage: 1 } }), "barrage").total, undefined, "no weapon, no number");
  // An attack's own damage line (Hades Gate: 110% weapon damage plus "Fire Damage: x-y")
  // is part of the hit, unscaled; Way of the Phoenix raises it through its synergy.
  const f = JSON.parse(await readFile(new URL("./fixtures/assassin-level-97-crucify.json", import.meta.url), "utf8"));
  const sin = (phoenix) => ({ ...(f.build || f), points: { ...(f.build || f).points, hades_gate: 20, way_of_the_phoenix: phoenix } });
  for (const phoenix of [0, 20]) {
    const b = sin(phoenix);
    const hg = est(b, "hades_gate");
    const own = engine.skillValues({ ...b, ...computeCharacter(b, { engine, catalog, planner }) }, "hades_gate").fire_damage;
    const fire = hg.parts.find((p) => p.element === "fire");
    assert.equal(hg.kind, "attack");
    assert.ok(fire && fire.range[0] >= own[0] && fire.range[1] >= own[1], `own fire damage included (phoenix ${phoenix})`);
    assert.ok(hg.notes.some((n) => n.includes("skill's own")));
  }
  assert.ok(est(sin(20), "hades_gate").total[1] > est(sin(0), "hades_gate").total[1], "Way of the Phoenix adds to Hades Gate");
  // Twisted Claw and Mana Pulse add their own cold damage to the attack ("bonus cold damage
  // to attack", MedianDB's bonus_cold_damage_to_weapons); Twisted Claw's grows with points.
  const claw = catalog.all().find((d) => d.kind === "base" && d.slotType === "weapon" && /Claw/.test(d.cat || ""))
    || catalog.all().find((d) => d.kind === "base" && d.slotType === "weapon");
  const druid = (id, n) => build("Druid", { level: 120, attrs: { strength: 400, dexterity: 200, vitality: 0, energy: 0 }, points: { [id]: n }, gear: { weapon: { ref: claw.key } } });
  const cold = (id, n) => est(druid(id, n), id).parts.find((p) => p.element === "cold")?.range[1] || 0;
  assert.ok(cold("twisted_claw", 10) > 0, "Twisted Claw's cold damage counts");
  assert.ok(cold("twisted_claw", 20) > cold("twisted_claw", 10), "and grows with points");
  assert.ok(cold("mana_pulse", 10) > 0, "Mana Pulse's cold damage counts");
  // Damage the game's tooltip shows but MedianDB has no value for: Fusillade's "(Current
  // Value: +…)" = points × 3% of Dexterity as magic damage.
  const sorcVals = (n) => engine.skillValues({ cls: "Sorceress", level: 150, points: { fusillade: n }, quests: {}, charStats: { dexterity: 500 } }, "fusillade");
  assert.deepEqual(sorcVals(10).magic_damage, [150, 150]);
  assert.deepEqual(sorcVals(11).magic_damage, [165, 165]);
  // Damage as a share of an attribute: Maelstrom's "% of Dexterity gained as extra magic
  // damage", Retaliate's "% bonus fire damage" of Strength or Dexterity (the higher).
  const weapon = { ref: catalog.all().find((d) => d.kind === "base" && d.slotType === "weapon").key };
  const withAttrs = (cls, id, n) => build(cls, { level: 150, attrs: { strength: 300, dexterity: 600, vitality: 0, energy: 0 }, points: { [id]: n }, gear: { weapon } });
  const part = (d, el) => d.parts.find((p) => p.element === el)?.range[1] || 0;
  const mael = (n) => est(withAttrs("Assassin", "apf-20_maelstrom_mkv", n), "apf-20_maelstrom_mkv");
  assert.ok(part(mael(25), "magic") > part(mael(20), "magic"), "Maelstrom's magic damage grows with points");
  assert.ok(mael(25).notes.some((n) => /% of Dexterity/.test(n)));
  const ret = (n) => est(withAttrs("Paladin", "retaliate", n), "retaliate");
  assert.ok(part(ret(25), "fire") > part(ret(15), "fire"), "Retaliate's fire damage grows with points");
  // Overkill's axes count as repeated hits, like bolts.
  const ok = est(withAttrs("Barbarian", "overkill", 20), "overkill");
  assert.ok(ok.count && ok.count.n > 1 && ok.all[1] > ok.total[1], "Overkill's axes are counted");
  const spell = est(build("Sorceress", { level: 90, points: { molten_core: 1, flamefront: 10 } }), "flamefront");
  assert.equal(spell.kind, "spell");
  assert.ok(spell.total || spell.notes[0].includes("can't be worked out yet"));
  const summonId = engine.treeNodes("Necromancer", "Summon")[0].id;
  assert.equal(est(build("Necromancer", { level: 90, points: { [summonId]: 5 } }), summonId).kind, "summon");
  // Formulas that read character stats resolve from the sheet instead of "depends on your stats".
  const c = computeCharacter(b, { engine, catalog, planner });
  const described = engine.describe({ ...b, soft: c.soft, charStats: c.charStats }, "barrage", 20);
  assert.ok(!described.effect.some((l) => l.status === "varies"));
});

test("planner store: saving, sharing and cleaning untrusted builds", async () => {
  const memory = stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Paladin");
  p.setLevel(90);
  p.addAttr("strength", 50);
  const helm = catalog.forSlot("helm", "Paladin").find((d) => d.kind === "sacred");
  p.equip("helm", { ref: helm.key, rolls: [0.5, 2, "x"] });
  assert.deepEqual(p.build.value.gear.helm.rolls, [0.5, 1, 1], "out-of-range rolls are reset");
  // Added bonuses: known ids only, kept through sharing.
  const scroll = JSON.parse(await readFile(new URL("../src/data/item-bonuses.json", import.meta.url), "utf8")).scrolls.find((x) => x.slot === "helm");
  p.equip("helm", { ...p.build.value.gear.helm, addons: [scroll.id, "scroll:made-up", 7] });
  assert.deepEqual(p.build.value.gear.helm.addons, [scroll.id]);
  const ringAffix = JSON.parse(await readFile(new URL("../src/data/affixes.json", import.meta.url), "utf8")).affixes.find((a) => a.types.includes("ring"));
  p.equip("ring1", { ref: "custom", custom: { name: "Ring", slotType: "ring", text: "" }, affixes: [ringAffix.id, "p-none"], magic: true });
  assert.deepEqual([p.build.value.gear.ring1.affixes, p.build.value.gear.ring1.magic], [[ringAffix.id], true]);
  p.equip("boots", { ref: "does-not-exist" });
  assert.equal(p.build.value.gear.boots, undefined);
  const url = p.shareUrl();
  await Promise.resolve();
  assert.ok(JSON.parse(memory.get("mxlrw2:planner")).builds.Paladin.gear.helm);
  p.reset();
  assert.equal(p.build.value.gear.helm, undefined);
  assert.ok(p.importFromHash(new URL(url).hash));
  assert.equal(p.build.value.attrs.strength, 50);
  assert.equal(p.build.value.gear.helm.ref, helm.key);
  assert.deepEqual(p.build.value.gear.helm.addons, [scroll.id], "added bonuses survive a share link");
  assert.deepEqual(p.build.value.gear.ring1.affixes, [ringAffix.id], "affixes survive a share link");
  assert.equal(p.importFromHash("#planner?b=bm90LWEtYnVpbGQ"), false);
  // Skill slots and bar survive sharing; unknown skills are dropped.
  p.setClass("Amazon");
  p.setLevel(30);
  p.add("trinity_arrow");
  p.setSkillSlot("right", "trinity_arrow");
  p.addToBar("trinity_arrow");
  const shared = new URL(p.shareUrl()).hash;
  p.reset();
  assert.ok(p.importFromHash(shared));
  assert.equal(p.build.value.rightSkill, "trinity_arrow");
  assert.deepEqual(p.build.value.skillBar, ["trinity_arrow"]);
  assert.ok(p.skillsInUse.value.some((d) => d.id === "trinity_arrow"));
  scope.stop();
});

test("a shared link opens on the stage it was shared from", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Sorceress");
  // Only the Normal stage made: the link still opens on Normal.
  p.setStage("Normal");
  p.setLevel(45);
  const normal = new URL(p.shareUrl()).hash;
  assert.match(normal, /&stage=Normal$/);
  p.reset();
  assert.ok(p.importFromHash(normal));
  assert.equal(p.state.stage.Sorceress, "Normal");
  assert.equal(p.build.value.level, 45);
  // The code alone carries it too, and &stage= picks another stage of the same build.
  assert.ok(p.importFromHash(normal.replace(/&stage=\w+$/, "")));
  assert.equal(p.state.stage.Sorceress, "Normal");
  assert.ok(p.importFromHash(normal.replace(/&stage=\w+$/, "&stage=hell")));
  assert.equal(p.state.stage.Sorceress, "Hell");
  assert.equal(p.build.value.level, 125, "an empty stage starts at its level");
  assert.ok(p.stageFilled("Normal"));
  // From Endgame, no stage is added.
  p.setStage("Endgame");
  assert.doesNotMatch(p.shareUrl(), /&stage=/);
  scope.stop();
});

test("opening a build keeps the player's own aside, to go back to or let go", async () => {
  const memory = stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Amazon");
  p.setLevel(40);
  p.add("trinity_arrow");
  const starter = new URL(p.shareUrl()).hash;
  p.reset();
  // An empty build isn't set aside.
  assert.ok(p.importFromHash(`${starter}&name=Starter`));
  assert.equal(p.state.kept.Amazon, undefined);
  p.reset();
  p.setLevel(70);
  p.addAttr("dexterity", 30);
  p.setStage("Normal");
  p.setLevel(55);
  p.setStage("Endgame");
  assert.ok(p.importFromHash(`${starter}&name=Starter`));
  assert.equal(p.build.value.level, 40);
  assert.equal(p.state.kept.Amazon.build.level, 70);
  await Promise.resolve();
  assert.match(p.state.message, /Your own Amazon build is kept/);
  // Opening another doesn't replace what was kept aside, and it's stored with the planner.
  assert.ok(p.importFromHash(`${starter}&name=Another`));
  assert.equal(p.state.kept.Amazon.build.level, 70);
  await Promise.resolve();
  assert.equal(JSON.parse(memory.get("mxlrw2:planner")).kept.Amazon.build.level, 70);
  const again = scope.run(() => createPlanner(engine, catalog, planner));
  assert.equal(again.state.kept.Amazon.build.attrs.dexterity, 30);
  p.restoreKept();
  assert.equal(p.build.value.level, 70);
  assert.equal(p.build.value.attrs.dexterity, 30);
  assert.ok(p.stageFilled("Normal"));
  assert.equal(p.state.kept.Amazon, undefined);
  assert.ok(p.importFromHash(`${starter}&name=Starter`));
  p.dropKept();
  assert.equal(p.state.kept.Amazon, undefined);
  assert.equal(p.build.value.level, 40);
  scope.stop();
});

test("planner renders attributes, equipment and skills together, with the stats panel", async () => {
  for (const view of ["closed", "open"]) {
    const memory = stubBrowser();
    memory.set("mxlrw2:planner", JSON.stringify({ cls: "Druid", statsOpen: view === "open" }));
    const { default: CharacterPlanner } = await load("/src/components/planner/CharacterPlanner.vue");
    const html = await renderToString(createSSRApp({ render: () => h(CharacterPlanner, { data: planner }) }));
    assert.ok(html.includes("Druid"), view);
    for (const marker of ["attr-panel", "doll-slot", "skills-panel", "skill-detail"])
      assert.ok(html.includes(marker), `renders ${marker}`);
    assert.equal(/class="stats-panel/.test(html), view === "open", `stats panel ${view}`);
  }
});

test("skill panel and stats show levels, provenance and dataset versions", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner, PlannerKey } = await load("/src/planner/usePlanner.js");
  const { default: SkillDetail } = await load("/src/components/planner/SkillDetail.vue");
  const { default: SkillSheet } = await load("/src/components/planner/SkillSheet.vue");
  const { default: StatsPanel } = await load("/src/components/planner/StatsPanel.vue");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Assassin");
  p.setLevel(93);
  p.add("way_of_the_spider", 10);
  p.state.selected = "way_of_the_spider";
  const render = (C, props = {}) => renderToString(createSSRApp({ setup: () => (provide(PlannerKey, p), () => h(C, props)) }));
  const detail = await render(SkillDetail);
  for (const text of ["Base Level", "Effective Level", "Character Level", "Hard-point cap", `Game files ${planner.game.patch}`, "Poison Damage to Weapon", "How this is calculated", "Reproduces an in-game tooltip exactly", "Synergies", "+20% Poison Damage to Weapon per Base Level"])
    assert.ok(detail.includes(text), `skill panel shows ${text}`);
  assert.ok(!/trust-tag|trust-legend/.test(detail), "no source tags on the lines");
  const sheet = await render(SkillSheet, { id: "way_of_the_spider" });
  assert.ok(sheet.includes(`MedianDB ${planner.gameVersion}`) && sheet.includes(`Game files ${planner.game.patch}`));
  p.toggleStats(true);
  const stats = await render(StatsPanel);
  assert.match(stats, /Weapon poison/, "Way of the Spider poison is its own weapon-poison pool");
  scope.stop();
});

test("sockets: fill the empty ones in one go, remember recent picks", async () => {
  const memory = stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Assassin");
  p.setLevel(93);
  // A base item with several sockets.
  const base = catalog.forSlot("weapon", "Assassin").find((d) => d.kind === "base" && catalog.resolve({ ref: d.key }, 93).maxSockets >= 4);
  p.equip("weapon", { ref: base.key });
  p.updateItem("weapon", { socketCount: catalog.resolve({ ref: base.key }, 93).maxSockets });
  const count = catalog.resolve(p.build.value.gear.weapon, 93).socketCount;
  const [skull, ruby] = ["Perfect Skull", "Perfect Ruby"].map((n) => catalog.socketables().find((d) => d.name === n).key);
  // Picking with "also fill the others" fills every socket.
  p.openPicker({ mode: "socket", slot: "weapon", index: 0 });
  p.pick({ ref: skull, fillAll: true });
  assert.deepEqual(p.build.value.gear.weapon.sockets.slice(0, count), Array(count).fill(skull));
  assert.deepEqual(p.emptySockets("weapon"), []);
  // "Fill empty" only touches empty sockets.
  p.clearSockets("weapon");
  p.openPicker({ mode: "socket", slot: "weapon", index: 1 });
  p.pick({ ref: ruby });
  assert.equal(p.fillEmptySockets("weapon", skull), count - 1);
  assert.equal(p.build.value.gear.weapon.sockets[1], ruby);
  assert.equal(p.build.value.gear.weapon.sockets.filter((x) => x === skull).length, count - 1);
  // Most recent first, saved with the planner.
  assert.deepEqual(p.state.recentSockets.slice(0, 2), [skull, ruby]);
  await Promise.resolve();
  assert.deepEqual(JSON.parse(memory.get("mxlrw2:planner")).recentSockets.slice(0, 2), [skull, ruby]);
  scope.stop();
});

test("item art from the game files: uniques, sacred uniques, set items and runeword bases", async () => {
  const { engine, catalog } = await env();
  const { existsSync } = await import("node:fs");
  // Game art is drawn from sprite sheets: the graphic must be in the atlas and its sheet deployed.
  const atlas = JSON.parse(await readFile(new URL("../src/data/item-atlas.json", import.meta.url), "utf8"));
  const inSheet = (name) => {
    const a = atlas.art[name.toLowerCase()];
    return !!a && existsSync(new URL(`../public/planner/items/${atlas.sheets[a[0]][0]}`, import.meta.url));
  };
  const file = (icon) => icon.startsWith("game/") && inSheet(icon.slice(5));
  for (const kind of ["unique", "sacred", "set"]) {
    const defs = catalog.all().filter((d) => d.kind === kind);
    const withArt = defs.filter((d) => d.icon.startsWith("game/"));
    assert.equal(withArt.length, defs.length, `${kind}: every item has game art`);
    assert.ok(withArt.every((d) => file(d.icon)), `${kind}: art is in the sprite sheets`);
  }
  const bases = catalog.all().filter((d) => d.kind === "base");
  const missing = bases.filter((d) => !d.icon.startsWith("game/")).map((d) => d.name);
  assert.ok(missing.length <= 10, `bases without game art: ${missing.join(", ")}`);
  // A runeword shows its chosen base's art.
  const rw = catalog.all().find((d) => d.kind === "runeword" && d.slotType === "weapon");
  const base = catalog.runewordBases(rw)[0];
  const r = catalog.resolve({ ref: rw.key, base: base.key }, 150);
  assert.equal(r.def.icon, base.icon);
  assert.ok(file(base.icon));
  void engine;
});

test("catalogue cards find their item art", async () => {
  const { existsSync } = await import("node:fs");
  const index = JSON.parse(await readFile(new URL("../public/planner/item-art.json", import.meta.url), "utf8"));
  globalThis.fetch = async () => ({ ok: true, json: async () => index });
  const { useItemArt } = await load("/src/composables/useItemArt.js");
  const { artName } = useItemArt();
  await new Promise((r) => setTimeout(r, 0));
  const atlas = JSON.parse(await readFile(new URL("../src/data/item-atlas.json", import.meta.url), "utf8"));
  const exists = (name) =>
    !!name && !!atlas.art[name.toLowerCase()] && existsSync(new URL(`../public/planner/items/${atlas.sheets[atlas.art[name.toLowerCase()][0]][0]}`, import.meta.url));
  const tiered = JSON.parse(await readFile(new URL("../src/data/uniques.json", import.meta.url), "utf8"));
  const sacred = JSON.parse(await readFile(new URL("../src/data/sacred-uniques.json", import.meta.url), "utf8"));
  const sets = JSON.parse(await readFile(new URL("../src/data/sets.json", import.meta.url), "utf8"));
  const bases = JSON.parse(await readFile(new URL("../src/data/base-items.json", import.meta.url), "utf8"));
  for (const [name, base] of [...tiered, ...sacred]) assert.ok(exists(artName("unique", name, { base })), `unique ${name}`);
  for (const s of sets) for (const [name, base] of s[4]) assert.ok(exists(artName("set", name, { base })), `set item ${name}`);
  for (const [name] of bases) assert.ok(exists(artName("base", name, { tier: "Tier 1" })), `base ${name}`);
  delete globalThis.fetch;
});

test("item editor opens as a modal for a filled slot", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner, PlannerKey } = await load("/src/planner/usePlanner.js");
  const { default: ItemEditorModal } = await load("/src/components/planner/ItemEditorModal.vue");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Assassin");
  p.setLevel(120);
  const u = catalog.forSlot("weapon", "Assassin").find((d) => d.kind === "unique");
  p.openEditor("weapon");
  assert.equal(p.state.editing, null, "an empty slot has nothing to edit");
  p.equip("weapon", { ref: u.key });
  p.openEditor("weapon");
  assert.equal(p.state.editing, "weapon");
  const html = await renderToString(createSSRApp({ setup: () => (provide(PlannerKey, p), () => h(ItemEditorModal)) }));
  assert.match(html, /<dialog[^>]*item-editor-modal/);
  assert.ok(html.includes(u.name));
  p.unequip("weapon");
  assert.equal(p.state.editing, null, "removing the item closes the editor");
  scope.stop();
});

test("a two-handed weapon and an off-hand never end up equipped together", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Barbarian");
  p.setLevel(120);
  const weapons = catalog.forSlot("weapon", "Barbarian").filter((d) => d.kind === "base");
  const twoH = weapons.find((d) => catalog.resolve({ ref: d.key }, 120).twoHanded);
  const shield = catalog.forSlot("offhand", "Barbarian").find((d) => d.kind === "base" && d.slotType === "shield");
  p.equip("weapon", { ref: twoH.key });
  p.equip("offhand", { ref: shield.key });
  assert.equal(p.build.value.gear.weapon, undefined, "the shield replaces the two-hander");
  p.equip("weapon", { ref: twoH.key });
  assert.equal(p.build.value.gear.offhand, undefined, "the two-hander replaces the shield");
  for (const cat of ['Arrow Quivers', 'Crossbow Quivers']) {
    const quiver = catalog.all().find(d => d.cat === cat && d.slotType === 'quiver');
    assert.ok(quiver, cat);
    for (const [main, off] of [['weapon', 'offhand'], ['weapon2', 'offhand2']]) {
      p.equip(off, { ref: quiver.key });
      p.equip(main, { ref: twoH.key });
      assert.equal(p.build.value.gear[off], undefined, `${cat} removed in ${off}`);
      assert.deepEqual(p.recommend(off), [], 'no off-hand suggested for a two-hander');
      p.equip(off, { ref: quiver.key });
      assert.equal(p.build.value.gear[main], undefined, `${cat} removes two-hander in ${main}`);
      p.build.value.gear[main] = { ref: twoH.key };
      const shared = new URL(p.shareUrl()).hash;
      p.importFromHash(shared);
      assert.equal(p.build.value.gear[off], undefined, 'invalid saved combination is cleaned on import');
    }
  }
  scope.stop();
});

test("suggestions follow what the skills' formulas scale with (synergies)", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const { buildProfile, wantedStats, describeProfile } = await load("/src/planner/recommend.js");
  // Askari Lightning reads Stormcall's damage; Stormcall's synergy reads Energy and Spell Focus.
  const b = build("Amazon", { level: 120, points: { askari_lightning: 25, stormcall: 20 } });
  const profile = buildProfile(b, engine);
  const summary = describeProfile(profile);
  assert.deepEqual(summary.synergySkills, ["stormcall"]);
  assert.ok(summary.scalesWith.includes("Energy") && summary.scalesWith.includes("Spell Focus"));
  const want = wantedStats(profile, computeCharacter(b, { engine, catalog, planner }));
  const plain = wantedStats(buildProfile(build("Amazon", { level: 120, points: { trinity_arrow: 20 } }), engine), computeCharacter(build("Amazon", { level: 120 }), { engine, catalog, planner }));
  assert.ok(want.energy > (plain.energy || 0) + 3, "Energy is worth much more to an Energy-scaling build");
  // Askari alone still points at Stormcall as the skill to invest in.
  assert.ok(buildProfile(build("Amazon", { level: 120, points: { askari_lightning: 25 } }), engine).scaling.skills.stormcall > 0);
});

test("only skills with points can be chosen; removing the last point unslots a skill", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner, PlannerKey } = await load("/src/planner/usePlanner.js");
  const { default: SkillChooser } = await load("/src/components/planner/SkillChooser.vue");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Amazon");
  p.setLevel(30);
  p.add("trinity_arrow");
  // Gear levels to every skill don't make unlearned skills choosable.
  p.equip("amulet", { ref: catalog.forSlot("amulet", "Amazon").find((d) => d.variants.some((v) => v.lines.some((l) => /to All Skills/.test(l)))).key });
  p.state.skillChooser = { target: "right" };
  const html = await renderToString(createSSRApp({ setup: () => (provide(PlannerKey, p), () => h(SkillChooser)) }));
  assert.ok(html.includes("Trinity Arrow"));
  assert.ok(!html.includes("Barrage"), "an unlearned skill isn't listed even with +all skills");
  p.setSkillSlot("right", "trinity_arrow");
  p.addToBar("trinity_arrow");
  p.remove("trinity_arrow");
  assert.equal(p.build.value.rightSkill, null);
  assert.deepEqual(p.build.value.skillBar, []);
  scope.stop();
});

test("socket suggestions cap resistances first, then damage; unique jewels once", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter, activeSlots } = await load("/src/planner/character.js");
  const R = await load("/src/planner/recommend.js");
  const b = build("Amazon", { level: 120, difficulty: "Hell", points: { askari_lightning: 25, stormcall: 20 }, attrs: { strength: 100, dexterity: 100, vitality: 200, energy: 200 } });
  const profile = R.buildProfile(b, engine);
  // Socket behaviour is independent of whether the gear scorer prefers runewords.
  for (const slot of ['helm', 'body', 'gloves', 'boots']) b.gear[slot] = {
    ref: 'custom', custom: { name: slot, slotType: slot, text: 'Required Level: 1\nSocketed (6)' }, socketCount: 6,
  };
  const res = (gear) => computeCharacter({ ...b, gear }, { engine, catalog, planner }).resist;
  const before = res(b.gear);
  const { gear, picks } = R.suggestSockets({ build: b, engine, catalog, planner, computeCharacter, activeSlots, profile });
  assert.ok(picks.length > 0);
  const after = res(gear);
  for (const el of ["fire", "cold", "lightning", "poison"]) {
    assert.ok(after[el].value > before[el].value, `${el} resistance improves`);
    assert.ok(after[el].max - after[el].value <= 5, `${el} ends within 5 of the cap`);
  }
  const jewels = picks.filter((p) => catalog.get(p.ref).slotType === "jewel").map((p) => p.ref);
  assert.equal(new Set(jewels).size, jewels.length, "no unique jewel twice");
  assert.equal(JSON.stringify(b.gear).includes('"sockets"'), false, "the build itself isn't changed");
});

test('mystic orbs: level budgets, socket levels, limits, multipliers and saved builds', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const { ORBS, cleanOrbs } = await load('/src/planner/orbs.js');
  for (const o of ORBS.filter(o => !o.unique))
    assert.ok(catalog.parseLines(o.lines, 10).every(p => p.kind !== 'unknown'), `${o.name}: ${o.lines}`);
  stubBrowser();
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setLevel(10);
  const custom = level => ({ ref: 'custom', custom: { name: 'Test ring', slotType: 'ring', text: `Required Level: ${level}\nSocketed (1)` }, socketCount: 1 });
  p.equip('ring1', custom(8));
  assert.equal(p.canAddOrb('ring1', 'mo-18'), false, '8 + 4 exceeds level 10');
  p.equip('ring1', custom(6));
  assert.equal(p.canAddOrb('ring1', 'mo-18'), true, '6 + 4 fits level 10 exactly');
  p.addOrb('ring1', 'mo-18');
  assert.equal(catalog.resolve(p.build.value.gear.ring1, 10).head.reqLevel, 10);
  assert.equal(p.canAddOrb('ring1', 'mo-19'), false, 'existing orb consumes allowance');
  const filler = catalog.socketables().find(d => d.lvl > 10);
  p.updateItem('ring1', { sockets: [filler.key] });
  assert.equal(catalog.resolve(p.build.value.gear.ring1, 10).head.reqLevel, filler.lvl + 4);
  assert.equal(p.canAddOrb('ring1', 'mo-19'), false);
  assert.deepEqual(cleanOrbs(Array(20).fill('mo-18')), Array(5).fill('mo-18'));
  const spheres = ORBS.filter(o => o.name === 'Imperfect Sphere');
  assert.equal(cleanOrbs(spheres.map(o => o.id)).length, 1, 'sphere variants share their limit');
  p.setLevel(120);
  p.equip('ring1', custom(1));
  assert.equal(p.canAddOrb('ring1', 'umo-weight-of-talent'), false, 'body-only unique orb excluded');
  p.updateItem('ring1', { ethereal: true });
  assert.equal(p.canAddOrb('ring1', 'mo-18'), false, 'ethereal items excluded');
  p.setLevel(10);
  const doubled = custom(6);
  doubled.custom.text += '\nOrb Effects Applied to this Item are Doubled';
  doubled.orbs = ['mo-18'];
  const r = catalog.resolve(doubled, 10);
  assert.equal(r.orbs[0].parsed[0].effects[0][1], 14);
  assert.equal(r.head.reqLevel, 10, 'only bonuses double, not the level penalty');
  p.equip('ring1', doubled);
  const url = p.shareUrl();
  p.updateItem('ring1', { orbs: [] });
  p.importFromHash(new URL(url).hash);
  assert.deepEqual(p.build.value.gear.ring1.orbs, ['mo-18']);
  const o = ORBS.find(o => o.id === 'mo-19'), minimum = o.minLevel;
  try {
    o.minLevel = 20;
    p.equip('ring1', custom(1));
    assert.equal(p.canAddOrb('ring1', o.id), false, 'orb own minimum is checked');
    const result = p.enhance('ring1');
    assert.ok(result.orbPicks.every(pick => pick.ref !== o.id));
  } finally { o.minLevel = minimum; scope.stop(); }
});

test('enhancement suggestions preserve choices and never exceed player level', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter, activeSlots } = await load('/src/planner/character.js');
  const R = await load('/src/planner/recommend.js');
  for (const level of [1, 10, 30, 120]) {
    const b = build('Amazon', { level, difficulty: 'Normal', points: { stormcall: 1 }, gear: {
      ring1: { ref: 'custom', custom: { name: 'Ring', slotType: 'ring', text: 'Required Level: 1' } },
      helm: { ref: 'custom', custom: { name: 'Helm', slotType: 'helm', text: 'Required Level: 1\nSocketed (2)' }, socketCount: 2 },
    } });
    if (level >= 10) b.gear.ring1.orbs = ['mo-18'];
    const before = JSON.stringify(b);
    const result = R.suggestEnhancements({ build: b, engine, catalog, planner, computeCharacter, activeSlots, profile: R.buildProfile(b, engine) });
    assert.equal(JSON.stringify(b), before, 'input not mutated');
    for (const st of Object.values(result.gear)) {
      assert.ok(catalog.resolve(st, level).head.reqLevel <= level, `valid at level ${level}`);
      assert.ok((st.orbs || []).every(id => id.startsWith('mo-')), 'ordinary by default');
    }
    if (level >= 10) assert.equal(result.gear.ring1.orbs[0], 'mo-18');
    if (level === 1) assert.equal(result.orbPicks.length, 0);
  }
});

test('orb bonuses reach character stats before sockets are scored; existing sockets stay intact', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter, activeSlots } = await load('/src/planner/character.js');
  const R = await load('/src/planner/recommend.js');
  const b = build('Amazon', { level: 30, difficulty: 'Normal', points: { stormcall: 1 }, gear: {
    helm: { ref: 'custom', custom: { name: 'Helm', slotType: 'helm', text: 'Required Level: 1\nSocketed (2)' }, socketCount: 2, orbs: ['mo-35'] },
  } });
  const c = computeCharacter(b, { engine, catalog, planner });
  assert.equal(c.stats.fire_resistance.total, 3);
  assert.match(c.stats.fire_resistance.sources[0].source, /orb/);
  const low = catalog.socketables().find(d => d.lvl <= 10);
  b.gear.helm.sockets = [low.key];
  const result = R.suggestEnhancements({ build: b, engine, catalog, planner, computeCharacter, activeSlots, profile: R.buildProfile(b, engine), includeUnique: true });
  assert.equal(result.gear.helm.sockets[0], low.key);
  assert.equal(result.gear.helm.orbs[0], 'mo-35');
  assert.ok(catalog.resolve(result.gear.helm, 30).head.reqLevel <= 30);
  b.level = 4;
  const rejected = R.suggestSockets({ build: b, engine, catalog, planner, computeCharacter, activeSlots, profile: R.buildProfile(b, engine) });
  assert.equal(rejected.picks.length, 0, 'no filler added to an already over-level item');
});

test('spell estimates include orb damage bonuses and Askari scales Stormcall once', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { skillDamage } = await load('/src/planner/damage.js');
  const b = build('Amazon', { level: 120, points: { stormcall: 10, askari_lightning: 10 }, gear: {
    body: { ref: 'custom', custom: { name: 'Test armor', slotType: 'body', text: 'Required Level: 1' } },
  } });
  const estimate = id => {
    const c = computeCharacter(b, { engine, catalog, planner });
    return skillDamage(id, { engine, build: b, character: c, skillBuild: { ...b, soft: c.soft, charStats: c.charStats } });
  };
  const before = estimate('stormcall');
  const askariBefore = estimate('askari_lightning');
  b.gear.body.orbs = Array(5).fill('mo-6');
  const after = estimate('stormcall');
  assert.deepEqual(after.total, before.total.map(v => Math.floor(v * 1.1)), '10% lightning spell damage reaches displayed estimate');
  // Askari reads Stormcall's enma, which has the mastery in it (applied in 256ths, before the
  // game's ÷ 256, so a little above ×1.1): once, not ×1.21.
  const ratio = estimate('askari_lightning').total[1] / askariBefore.total[1];
  assert.ok(ratio > 1.09 && ratio < 1.12, `Askari formula already reads Stormcall; apply the lightning bonus once (×${ratio})`);
  b.gear.body.orbs = Array(5).fill('mo-25');
  assert.ok(estimate('stormcall').total[1] > before.total[1], 'spell focus reaches the underlying formula');
  b.gear.body.custom.text += '\n+100 Spell Focus\n+10% Bonus to Spell Focus';
  const focused = computeCharacter(b, { engine, catalog, planner });
  assert.equal(focused.charStats.spell_focus, focused.spellFocus.value, 'percentage focus bonus reaches skill formulas');
  assert.equal(focused.charStats.spell_focus, 143);
  b.gear.body.custom.text = 'Required Level: 1';
  b.gear.body.orbs = ['mo-4'];
  assert.deepEqual(estimate('stormcall').total, before.total, 'fire damage does not boost lightning');
  const awakening = catalog.all().find(d => d.name === 'The Awakening');
  assert.ok(awakening);
  const resolved = catalog.resolve({ ref: awakening.key, orbs: ['mo-6'] }, 150);
  assert.equal(resolved.orbs.length, 0, 'The Awakening is ethereal and cannot take orbs');
  assert.ok(resolved.socketCount > 0);
});

test('spell formula mastery is not multiplied twice; weapon damage orbs affect attacks', async () => {
  const { skillDamage } = await load('/src/planner/damage.js');
  const engine = {
    node: () => ({ name: 'Test spell', tags: ['Spell', 'Lightning'] }),
    skillValues: () => ({}),
    describe: () => ({ effect: [{ status: 'ok', text: 'Lightning Damage: 110-220', parts: [{ key: 'lightning_damage', values: [110, 220], source: { resolved: { stat330: { value: 10, label: 'lightning_spell_damage (character sheet)' } } } }] }] }),
  };
  const character = { s: k => k === 'lightning_spell_damage' ? 10 : 0 };
  assert.deepEqual(skillDamage('test', { engine, build: { points: {} }, skillBuild: {}, character }).total, [110, 220]);
  const envData = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const b = build('Barbarian', { level: 120, gear: { weapon: { ref: 'custom', custom: { name: 'Test sword', slotType: 'weapon', text: 'One-Hand Damage: 100 to 200\nRequired Level: 1' } } } });
  const attack = () => skillDamage('attack', { engine: envData.engine, build: b, character: computeCharacter(b, { ...envData, planner }) });
  const before = attack().total;
  b.gear.weapon.orbs = ['mo-31'];
  assert.deepEqual(attack().total, [before[0], before[1] + 6]);
  b.gear.weapon.orbs = ['mo-30'];
  assert.ok(attack().total[0] > before[0]);
});

test('shared level-80 Amazon: every suggested replacement fits attributes and preserves retained gear', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter, activeSlots } = await load('/src/planner/character.js');
  const { attributesSafe } = await load('/src/planner/requirements.js');
  const R = await load('/src/planner/recommend.js');
  const b = JSON.parse(await readFile(new URL('./fixtures/amazon-level-80-attributes.json', import.meta.url), 'utf8'));
  const character = computeCharacter(b, { engine, catalog, planner });
  assert.ok(character.issues.some(i => i.fix?.kind === 'attr'), 'fixture reproduces reported shortage');
  const profile = R.buildProfile(b, engine);
  let count = 0;
  for (const slot of activeSlots(b).filter(s => s !== 'offhand')) {
    const recs = R.recommendForSlot(slot, { build: b, engine, catalog, planner, character, profile, want: R.wantedStats(profile, character) }, 3);
    for (const rec of recs) {
      count++;
      const gear = { ...b.gear }; delete gear[slot];
      const bare = computeCharacter({ ...b, gear }, { engine, catalog, planner });
      const r = catalog.resolve(rec.state, b.level);
      assert.ok(r.head.reqStr <= bare.attributes.strength.total, `${slot}: ${r.def.name} Strength`);
      assert.ok(r.head.reqDex <= bare.attributes.dexterity.total, `${slot}: ${r.def.name} Dexterity`);
      const after = computeCharacter({ ...b, gear: { ...gear, [slot]: rec.state } }, { engine, catalog, planner });
      assert.ok(attributesSafe(character, after, [slot]), `${slot} does not worsen other items`);
    }
  }
  assert.ok(count > 0, 'existing shortages do not block all repairs');
});

test('suggestions fall back to wearable tiers and reject self-supporting attribute bonuses', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const R = await load('/src/planner/recommend.js');
  const def = catalog.all().find(d => d.kind === 'unique' && d.slotType === 'body' && d.variants.length > 1);
  const saved = def.variants;
  try {
    def.variants = [
      { label: 'Low tier', lines: ['Required Level: 1', 'Required Strength: 10', '+10% to Lightning Spell Damage'] },
      { label: 'High tier', lines: ['Required Level: 1', 'Required Strength: 500', '+600 to Strength', '+100% to Lightning Spell Damage'] },
    ];
    const b = build('Amazon', { level: 80, points: { stormcall: 10 } });
    const character = computeCharacter(b, { engine, catalog, planner }), profile = R.buildProfile(b, engine);
    const rec = R.recommendForSlot('body', { build: b, engine, catalog, planner, character, profile, want: R.wantedStats(profile, character) }, 1000).find(r => r.def.key === def.key);
    assert.ok(rec);
    assert.equal(rec.state.variant, 0, 'high tier cannot bootstrap its own Strength');
  } finally { def.variants = saved; }
});

test('replacing attribute gear cannot strand another item; bulk picks and enhancements remain wearable', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const { attributeDeficits } = await load('/src/planner/requirements.js');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Amazon'); p.setLevel(80); p.add('stormcall', 10);
    p.equip('amulet', { ref: 'custom', custom: { name: 'Strength support', slotType: 'amulet', text: '+100 to Strength' } });
    p.equip('body', { ref: 'custom', custom: { name: 'Dependent armor', slotType: 'body', text: 'Required Strength: 100' } });
    for (const rec of p.recommend('amulet', 1000)) {
      const old = p.build.value.gear.amulet;
      p.equip('amulet', rec.state);
      assert.equal(attributeDeficits(p.character.value).body.strength, 0);
      p.equip('amulet', old);
    }
    p.unequip('amulet'); p.unequip('body');
    for (const slot of ['weapon', 'amulet', 'ring1', 'ring2', 'helm', 'body', 'gloves', 'belt', 'boots']) {
      const rec = p.recommend(slot, 1)[0];
      if (rec) p.equip(slot, rec.state);
    }
    p.enhance();
    assert.ok(Object.values(attributeDeficits(p.character.value)).every(gap => !gap.strength && !gap.dexterity));
    assert.deepEqual({ ...p.build.value.attrs }, { strength: 0, dexterity: 0, vitality: 0, energy: 0 }, 'no attribute allocation changed');
  } finally { scope.stop(); }
});

test('automatic enhancements reject damage bonuses that create attribute shortages', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter, activeSlots } = await load('/src/planner/character.js');
  const { ORBS } = await load('/src/planner/orbs.js');
  const R = await load('/src/planner/recommend.js');
  const b = build('Amazon', { level: 30, points: { stormcall: 1 }, gear: {
    body: { ref: 'custom', custom: { name: 'Armor', slotType: 'body', text: 'Required Strength: 10\nSocketed (1)' }, socketCount: 1 },
  } });
  const badOrb = { id: 'test-unsafe-orb', name: 'Unsafe orb', unique: true, minLevel: 0, reqLevel: 4, limit: 1, group: 'Armor', lines: ['+1000% to Lightning Spell Damage', '-1000 to Strength'] };
  const jewel = catalog.jewels()[0], variants = jewel.variants;
  ORBS.push(badOrb);
  jewel.variants = [{ label: '', lines: ['Required Level: 1', '+1000% to Lightning Spell Damage', '-1000 to Strength'] }];
  try {
    const opts = { build: b, engine, catalog, planner, computeCharacter, activeSlots, profile: R.buildProfile(b, engine), includeUnique: true };
    const sockets = R.suggestSockets(opts);
    assert.ok(sockets.picks.every(p => p.ref !== jewel.key), 'unsafe jewel excluded');
    const enhanced = R.suggestEnhancements(opts);
    assert.ok(enhanced.orbPicks.every(p => p.ref !== badOrb.id), 'unsafe orb excluded');
    assert.ok(enhanced.picks.every(p => p.ref !== jewel.key));
  } finally { ORBS.splice(ORBS.indexOf(badOrb), 1); jewel.variants = variants; }
});

test('single suggested picks stay clean while the gear dialog controls bulk enhancements', async () => {
  const { engine, catalog } = await env();
  const { createPlanner, PlannerKey } = await load('/src/planner/usePlanner.js');
  const { default: SuggestGear } = await load('/src/components/planner/SuggestGear.vue');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Amazon'); p.setLevel(30); p.build.value.points.stormcall = 1;
    const item = { ref: 'custom', suggested: true, custom: { name: 'Test helm', slotType: 'helm', text: 'Required Level: 1\nSocketed (1)' }, socketCount: 1 };
    p.state.suggestEnhancements = true;
    p.openPicker({ mode: 'slot', slot: 'helm' }); p.pick(item);
    assert.equal(p.build.value.gear.helm.orbs.length, 0);
    assert.equal((p.build.value.gear.helm.sockets || []).filter(Boolean).length, 0);
    assert.equal(p.build.value.gear.helm.socketCount, undefined);
    const html = await renderToString(createSSRApp({ setup() { provide(PlannerKey, p); return () => h(SuggestGear); } }));
    assert.match(html, /role="switch"[^>]*aria-describedby="enhancement-help"/);
    assert.doesNotMatch(html, />\s*Fill empty sockets\s*</);
    p.enhance('helm');
    assert.ok(p.build.value.gear.helm.orbs.length + (p.build.value.gear.helm.sockets || []).filter(Boolean).length > 0);
    const beforeToggle = JSON.stringify(p.build.value);
    p.state.suggestEnhancements = false;
    p.state.suggestEnhancements = true;
    assert.equal(JSON.stringify(p.build.value), beforeToggle, 'changing the option does not modify equipped gear');
  } finally { scope.stop(); }
});

test('refresh gear replaces occupied slots using current level, attributes and enhancement options', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const { attributeDeficits } = await load('/src/planner/requirements.js');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Amazon'); p.setLevel(80);
    p.build.value.points = { stormcall: 10, askari_lightning: 10 };
    p.build.value.attrs.dexterity = 200;
    p.state.suggestEnhancements = false;
    p.equip('helm', { ref: 'custom', custom: { name: 'Old equipment', slotType: 'helm', text: '+1000 to Strength' } });
    const spare = { ref: 'custom', custom: { name: 'Spare weapon', slotType: 'weapon', text: 'One-Hand Damage: 1 to 2' } };
    p.equip('weapon2', spare);
    const spareBefore = JSON.stringify(p.build.value.gear.weapon2);
    assert.ok(p.refreshGear() > 0);
    assert.ok(Object.values(p.build.value.gear).every(st => st.custom?.name !== 'Old equipment'));
    assert.deepEqual(Object.values(attributeDeficits(p.character.value)).filter(g => g.strength || g.dexterity), []);
    assert.equal(JSON.stringify(p.build.value.gear.weapon2), spareBefore);
    const first = JSON.stringify(p.build.value.gear);
    p.setLevel(20); p.build.value.attrs.dexterity = 0;
    p.build.value.points = { trinity_arrow: 5, barrage: 1 };
    p.state.suggestEnhancements = true;
    assert.ok(p.refreshGear() > 0);
    assert.notEqual(JSON.stringify(p.build.value.gear), first);
    assert.ok(/Bows|Crossbows/.test(p.character.value.weapon.def.cat));
    for (const r of Object.values(p.character.value.equipped)) assert.ok(r.head.reqLevel <= 20);
    assert.ok(Object.values(attributeDeficits(p.character.value)).every(g => !g.strength && !g.dexterity));
    assert.equal(JSON.stringify(p.build.value.gear.weapon2), spareBefore);
    p.state.suggestEnhancements = false;
    p.refreshGear();
    assert.ok(Object.values(p.character.value.equipped).every(r => !r.orbs.length && !r.sockets.some(Boolean)));
    assert.equal(p.build.value.attrs.dexterity, 0);
  } finally { scope.stop(); }
});

test('attribute funding respects level, quest and signet budgets and rejects circular equipment', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { fundRequirements, wearableInOrder, fundLoadout } = await load('/src/planner/attributeAllocation.js');
  const e = { engine, catalog, planner };
  const b = { cls: 'Assassin', level: 10, points: {}, buffs: [], attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 }, quests: {}, signets: 0, gear: {}, inventory: [] };
  const c = computeCharacter(b, e);
  assert.equal(c.statPoints.available, 45);
  assert.equal(fundRequirements(b, { strength: c.attributes.strength.total + 46 }, e), null);
  assert.equal(fundRequirements(b, { strength: c.attributes.strength.total + 45 }, e).strength, 45);
  const boosted = { ...b, signets: 2, quests: { 'lam_esens_tome.normal': true } };
  assert.equal(computeCharacter(boosted, e).statPoints.available, 57);
  assert.equal(fundRequirements(boosted, { strength: c.attributes.strength.total + 57 }, e).strength, 57);
  const item = slotType => ({ ref: 'custom', custom: { slotType, text: `Required Strength: ${c.attributes.strength.total + 10}\n+20 to Strength` } });
  assert.equal(wearableInOrder({ ...b, gear: { helm: item('helm'), body: item('body') } }, e), false);
  assert.equal(wearableInOrder({ ...b, attrs: { ...b.attrs, strength: 10 }, gear: { helm: item('helm'), body: item('body') } }, e), true);
  const circular = { ...b, gear: { helm: item('helm'), body: item('body') } };
  const funded = fundLoadout(circular, { ...b.attrs, vitality: 5 }, e);
  assert.equal(funded.strength, 10, 'reserve points to equip the first item instead of relying on circular bonuses');
  assert.equal(funded.vitality, 5, 'retain already assigned points');
  assert.ok(wearableInOrder({ ...circular, attrs: funded }, e));
});

test('attribute suggestion preview preserves assigned points, applies atomically and rejects stale plans', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const { wearableInOrder } = await load('/src/planner/attributeAllocation.js');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Assassin'); p.setLevel(30);
    p.build.value.points = { crucify: 5, way_of_the_spider: 5 };
    p.build.value.attrs.energy = 10;
    p.state.suggestAttributes = true;
    p.state.suggestEnhancements = false;
    const before = JSON.stringify(p.build.value);
    const preview = p.refreshGear({ preview: true });
    assert.ok(preview?.count > 0);
    assert.equal(JSON.stringify(p.build.value), before, 'preview is read-only');
    assert.ok(preview.attrs.energy >= 10);
    assert.equal(preview.character.statPoints.spent, preview.character.statPoints.available);
    assert.ok(wearableInOrder({ ...p.build.value, attrs: preview.attrs, gear: preview.gear }, { engine, catalog, planner }));
    p.setLevel(31);
    assert.equal(p.applyGearPreview(preview), false);
    p.setLevel(30);
    assert.equal(p.applyGearPreview(preview), true);
    assert.deepEqual(p.build.value.attrs, preview.attrs);
    assert.deepEqual(p.build.value.gear, preview.gear);
    p.build.value.attrs.energy = 999;
    assert.equal(p.refreshGear({ preview: true }), null, 'overspending requires explicit respec');
    p.state.allowAttributeRespec = true;
    p.state.suggestEnhancements = true;
    const respec = p.refreshGear({ preview: true });
    assert.ok(respec);
    assert.ok(respec.attrs.energy < 999);
    assert.equal(p.build.value.attrs.energy, 999);
    assert.equal(respec.character.statPoints.spent, respec.character.statPoints.available);
    assert.ok(Object.values(respec.character.equipped).every(r => r.head.reqLevel <= 30));
    assert.ok(wearableInOrder({ ...p.build.value, attrs: respec.attrs, gear: respec.gear }, { engine, catalog, planner }));
  } finally { scope.stop(); }
});

test('shared level-150 Assassin generates a wearable allocation with all suggestion options enabled', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const { wearableBothSets } = await load('/src/planner/attributeAllocation.js');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Assassin');
    Object.assign(p.build.value, JSON.parse(await readFile(new URL('./fixtures/assassin-level-150-allocation.json', import.meta.url), 'utf8')));
    Object.assign(p.state, { suggestAttributes: true, allowAttributeRespec: true, suggestEnhancements: true, includeUniqueOrbs: true });
    const before = JSON.stringify(p.build.value);
    const preview = p.refreshGear({ preview: true });
    assert.ok(preview?.count > 0);
    assert.equal(JSON.stringify(p.build.value), before);
    assert.equal(preview.character.statPoints.spent, preview.character.statPoints.available);
    assert.ok(wearableBothSets({ ...p.build.value, attrs: preview.attrs, gear: preview.gear }, { engine, catalog, planner }));
  } finally { scope.stop(); }
});

test('custom modifier pills produce counted stats and base-backed items retain their mechanics and saved base', async () => {
  const { engine, catalog } = await env();
  const { CUSTOM_STATS, customStatText } = await load('/src/planner/customStats.js');
  const { parseLine } = await load('/src/planner/statparse.js');
  for (const s of CUSTOM_STATS) {
    const line = customStatText([{ id: s.id, values: [10, 20] }]);
    assert.notEqual(parseLine(line, { level: 150 }).kind, 'unknown', line);
  }
  const { computeCharacter } = await load('/src/planner/character.js');
  const base = catalog.forSlot('weapon', 'Assassin').find(d => d.kind === 'base' && /Halberd/i.test(d.name));
  assert.ok(base);
  for (let i = 0; i < base.variants.length; i++) {
    const raw = catalog.resolve({ ref: base.key, variant: i }, 150);
    const custom = { ref: 'custom', base: base.key, baseVariant: i, socketCount: 2, custom: { name: 'My halberd', text: '+100% Enhanced Damage\n+5 to Strength', slotType: 'weapon' } };
    const resolved = catalog.resolve(custom, 150);
    assert.equal(resolved.label, raw.label);
    assert.equal(resolved.def.cat, raw.def.cat);
    assert.equal(resolved.head.reqStr, raw.head.reqStr);
    assert.equal(resolved.twoHanded, raw.twoHanded);
    assert.equal(resolved.maxSockets, raw.maxSockets);
    const before = computeCharacter(build('Assassin', { level: 150, gear: { weapon: { ref: base.key, variant: i } } }), { engine, catalog, planner });
    const after = computeCharacter(build('Assassin', { level: 150, gear: { weapon: custom } }), { engine, catalog, planner });
    assert.ok(after.damage.physical[0] > before.damage.physical[0]);
  }
  stubBrowser();
  const { createPlanner, PlannerKey } = await load('/src/planner/usePlanner.js');
  const { default: Builder } = await load('/src/components/planner/CustomItemBuilder.vue');
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Assassin');
    p.equip('weapon', { ref: 'custom', base: base.key, baseVariant: base.variants.length - 1, custom: { text: '+2 to All Skills', slotType: 'weapon' } });
    assert.equal(p.build.value.gear.weapon.base, base.key);
    assert.equal(p.build.value.gear.weapon.baseVariant, base.variants.length - 1);
    const html = await renderToString(createSSRApp({ setup() { provide(PlannerKey, p); return () => h(Builder, { slot: 'weapon' }); } }));
    assert.match(html, /Item base/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /Other stat lines/);
  } finally { scope.stop(); }
});

test('clear equipment removes both weapon sets and closes stale editors without resetting the build', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Amazon'); p.setLevel(30); p.build.value.attrs.dexterity = 20;
    p.build.value.points = { stormcall: 1 };
    for (const slot of ['weapon', 'weapon2', 'body']) p.equip(slot, { ref: 'custom', custom: { name: slot, slotType: slot === 'body' ? 'body' : 'weapon', text: '' } });
    p.build.value.inventory = [{ ref: 'custom', custom: { name: 'Kept charm', slotType: 'charm', text: '+10 to Life' } }];
    const before = JSON.stringify({ ...p.build.value, gear: {} });
    p.openEditor('body'); p.openPicker({ mode: 'socket', slot: 'body', index: 0 });
    p.clearEquipment();
    assert.deepEqual(p.build.value.gear, {});
    assert.equal(JSON.stringify(p.build.value), before);
    assert.equal(p.state.editing, null); assert.equal(p.state.picker, null); assert.equal(p.state.slot, null);
    p.clearEquipment();
    assert.deepEqual(p.build.value.gear, {});
    p.build.value.points = {};
    p.equip('body', { ref: 'custom', custom: { name: 'Manual armor', slotType: 'body', text: '' } });
    assert.equal(p.refreshGear(), 0, 'no automatic replacement without a skill profile');
    assert.ok(p.build.value.gear.body);
  } finally { scope.stop(); }
});

test('combat scoring values speed with on-hit sustain and distinguishes attacks from spells', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { combatScore } = await load('/src/planner/combatScore.js');
  const { buildProfile } = await load('/src/planner/recommend.js');
  const b = build('Assassin', { level: 93, points: { crucify: 10 }, leftSkill: 'crucify' });
  const score = (lines, target = b) => {
    const next = { ...target, gear: { weapon: { ref: 'custom', custom: { name: 'Test weapon', slotType: 'weapon', text: `Two-Hand Damage: 100 to 200\n${lines}` } } } };
    const c = computeCharacter(next, { engine, catalog, planner });
    return combatScore(next, c, engine, buildProfile(next, engine));
  };
  const plain = score(''), speed = score('60% Attack Speed'), heal = score('+50 Life on Melee Attack'), both = score('60% Attack Speed\n+50 Life on Melee Attack');
  assert.ok(speed.damage > plain.damage);
  assert.ok(both.recovery > heal.recovery, 'speed increases on-hit recovery');
  assert.ok(both.score - speed.score > heal.score - plain.score, 'combined sustain is valued more than isolated healing');
  const caster = build('Amazon', { level: 93, points: { stormcall: 10 } });
  assert.equal(score('+50 Life on Melee Attack', caster).recovery, 0, 'spells do not receive melee life on hit');
  assert.equal(score('60% Attack Speed', caster).damage, score('', caster).damage);
});

test('combat scoring values usable survival and does not multiply poison duration by attack speed', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { combatScore } = await load('/src/planner/combatScore.js');
  const { buildProfile } = await load('/src/planner/recommend.js');
  const b = build('Assassin', { level: 93, points: { crucify: 10, way_of_the_spider: 25 }, difficulty: 'Normal' });
  const score = text => {
    const next = { ...b, gear: { weapon: { ref: 'custom', custom: { name: 'Poison weapon', slotType: 'weapon', text: `Two-Hand Damage: 10 to 20\n${text}` } } } };
    const c = computeCharacter(next, { engine, catalog, planner });
    return combatScore(next, c, engine, buildProfile(next, engine));
  };
  const capped = score('Elemental Resists +75%'), over = score('Elemental Resists +150%');
  assert.equal(over.durability, capped.durability, 'overcap resistance has no false survival gain');
  assert.ok(capped.durability > score('').durability);
  assert.ok(score('+200 to Life').durability > score('').durability);
  const short = score('Adds 100-200 Poison Damage over 1 seconds');
  const long = score('Adds 1000-2000 Poison Damage over 10 seconds');
  assert.ok(Number.isFinite(short.damage) && Number.isFinite(long.damage));
  // Isolate poison from the passive whose duration legitimately changes the combined rate.
  b.points = { crucify: 10 };
  assert.equal(score('Adds 100-200 Poison Damage over 1 seconds').damage, score('Adds 1000-2000 Poison Damage over 10 seconds').damage);
});

test('Crucify evaluates Elverfolk as a melee weapon without credit for caster bonuses', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { combatScore } = await load('/src/planner/combatScore.js');
  const { buildProfile, wantedStats } = await load('/src/planner/recommend.js');
  const b = build('Assassin', { level: 93, points: { crucify: 10, way_of_the_spider: 25 }, leftSkill: 'crucify',
    attrs: { strength: 1, dexterity: 76, vitality: 0, energy: 0 },
    gear: { weapon: { ref: 'rw:30', base: 'base:55', baseVariant: 3 } } });
  const profile = buildProfile(b, engine), def = catalog.get('rw:30'), original = def.lines;
  // The item text is edited in place below, so resolved items are recomputed each time.
  const score = () => (catalog.clearResolved(), combatScore(b, computeCharacter(b, { engine, catalog, planner }), engine, profile));
  assert.equal(def.name, 'Elverfolk');
  assert.deepEqual(profile.roles, { attack: 1 });
  const want = wantedStats(profile, computeCharacter(b, { engine, catalog, planner }));
  for (const key of ['cast_speed', 'spell_focus', 'energy', 'poison_spell_damage', 'physical_magic_spell_damage']) {
    assert.equal(want[key] || 0, 0, `${key} has no fallback or enhancement weight for Crucify`);
  }
  try {
    const full = score();
    def.lines = original.filter(line => !/Cast Speed|Spell Focus|Energy/i.test(line));
    assert.ok(def.lines.length < original.length, 'actually removes caster bonuses');
    assert.equal(score().score, full.score, 'caster bonuses contribute nothing to this attack build');
    def.lines = original.filter(line => !/All Skills/i.test(line));
    assert.ok(score().damage < full.damage, 'all skills improves the attack and its poison passive');
    def.lines = original.filter(line => !/Elemental Resists/i.test(line));
    assert.ok(score().durability < full.durability, 'resistances provide real survival value');
  } finally { def.lines = original; catalog.clearResolved(); }
});

test('Crucify weapon comparisons include enhancement budgets, wearable tiers and the applied result', async t => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { combatScore } = await load('/src/planner/combatScore.js');
  const { attributesSafe } = await load('/src/planner/requirements.js');
  const R = await load('/src/planner/recommend.js');
  for (const level of [93, 97]) {
    const b = JSON.parse(await readFile(new URL(`./fixtures/assassin-level-${level}-crucify.json`, import.meta.url), 'utf8'));
    const snapshot = JSON.stringify(b), character = computeCharacter(b, { engine, catalog, planner });
    const profile = R.buildProfile(b, engine), baseline = combatScore(b, character, engine, profile);
    const options = { build: b, engine, catalog, planner, character, profile, want: R.wantedStats(profile, character) };
    await t.test(`level ${level}: unenhanced comparison respects attributes`, () => {
      const recs = R.recommendForSlot('weapon', options, 1000);
      const blackleach = recs.find(r => r.def.key === 'tu:84');
      assert.equal(blackleach.state.variant, level === 93 ? 2 : 3);
      assert.ok(recs.every(r => !r.state.orbs?.length && !r.state.sockets?.length));
      if (level === 97) assert.ok(recs.indexOf(blackleach) < recs.findIndex(r => r.def.key === 'rw:30'));
    });
    await t.test(`level ${level}: enhanced Blackleach beats Elverfolk without deficits`, () => {
      const recs = R.recommendForSlot('weapon', { ...options, weaponEnhancements: true }, 1000);
      const blackleach = recs.find(r => r.def.key === 'tu:84'), elverfolk = recs.find(r => r.def.key === 'rw:30');
      assert.ok(blackleach.score > elverfolk.score, 'compare final equipped outcomes, not empty sockets against a finished runeword');
      assert.equal(blackleach.state.variant, level === 93 ? 2 : 3);
      assert.ok(blackleach.state.sockets.some(Boolean));
      for (const rec of recs.slice(0, 12)) {
        const next = { ...b, gear: { ...b.gear, weapon: rec.state } };
        const after = computeCharacter(next, { engine, catalog, planner });
        assert.ok(attributesSafe(character, after, ['weapon']), rec.def.name);
        assert.ok(catalog.resolve(rec.state, b.level).head.reqLevel <= b.level);
        const applied = combatScore(next, after, engine, profile);
        assert.ok(Math.abs(applied.score - baseline.score - rec.improvement) < 1e-8, 'reported improvement matches applied sockets/orbs');
      }
      assert.equal(JSON.stringify(b), snapshot, 'recommendations never mutate the shared build');
    });
  }
});

test('weapon recommendations refresh after attribute and option changes and bulk refresh applies the scored weapon', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const { attributeDeficits } = await load('/src/planner/requirements.js');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/assassin-level-93-crucify.json', import.meta.url), 'utf8'));
  // Keep all armor choices; isolate the reported weapon pair for this store-level test.
  const originalForSlot = catalog.forSlot;
  catalog.forSlot = (slot, cls) => originalForSlot(slot, cls).filter(d => !slot.startsWith('weapon') || ['rw:30', 'tu:84'].includes(d.key));
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Assassin');
    Object.assign(p.build.value, fixture);
    p.state.suggestEnhancements = true;
    const first = p.recommend('weapon', 1)[0];
    assert.equal(first.state.ref, 'tu:84');
    assert.equal(first.state.variant, 2);
    assert.equal(p.recommend('weapon', 3)[0], first, 'different list lengths reuse the scored results');
    p.build.value.attrs.dexterity += 50;
    const changed = p.recommend('weapon', 1)[0];
    assert.notEqual(changed, first);
    assert.equal(changed.state.ref, 'tu:84');
    assert.equal(changed.state.variant, 3, 'new attributes unlock the stronger tier');
    p.state.suggestEnhancements = false;
    assert.ok(p.recommend('weapon', 3).every(r => !r.state.orbs?.length && !r.state.sockets?.length));
    p.state.suggestEnhancements = true;
    assert.ok(p.refreshGear() > 0);
    assert.ok(Object.values(attributeDeficits(p.character.value)).every(g => !g.strength && !g.dexterity));
    assert.ok(Object.values(p.character.value.equipped).every(r => r.head.reqLevel <= p.build.value.level));
    const next = p.recommend('weapon', 1)[0];
    assert.ok(!next || next.improvement <= 0.25, 'final loadout does not leave a clearly better enhanced weapon unapplied');
  } finally { scope.stop(); catalog.forSlot = originalForSlot; }
});

test('weapon ranking uses attack damage instead of raw skill-bonus counts', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const R = await load('/src/planner/recommend.js');
  const weapons = catalog.forSlot('weapon', 'Assassin').filter(d => d.kind === 'unique').slice(0, 2);
  const saved = weapons.map(d => d.variants), originalForSlot = catalog.forSlot;
  try {
    weapons[0].variants = [{ label: '', lines: ['Two-Hand Damage: 5 to 10', '+8 to All Skills'] }];
    weapons[1].variants = [{ label: '', lines: ['Two-Hand Damage: 500 to 600', '40% Attack Speed', '+30 Life on Melee Attack'] }];
    catalog.forSlot = () => weapons;
    const b = build('Assassin', { level: 93, points: { crucify: 10 }, attrs: { strength: 1, dexterity: 76, vitality: 0, energy: 0 } });
    const character = computeCharacter(b, { engine, catalog, planner }), profile = R.buildProfile(b, engine);
    const recs = R.recommendForSlot('weapon', { build: b, engine, catalog, planner, character, profile, want: R.wantedStats(profile, character) });
    assert.equal(recs[0].def.key, weapons[1].key);
    assert.ok(recs[0].reasons.some(r => /damage potential/.test(r)));
  } finally { weapons.forEach((d, i) => d.variants = saved[i]); catalog.forSlot = originalForSlot; }
});

test("gem, rune and jewel lines count in every socket type, including comma-joined armor gem lines", async () => {
  const { catalog } = await env();
  const hosts = ["weapon", "body", "offhand"].map((slot) =>
    catalog.forSlot(slot, "Paladin").find((d) => d.kind === "base" && d.variants.some((v) => v.lines.some((l) => /Socketed \([1-9]\)/.test(l)))));
  const armorGem = catalog.socketables().find((s) => s.slotLines.some((ls) => ls.some((l) => l.includes(", "))));
  assert.ok(armorGem, "some filler joins two stats on one line");
  for (const host of hosts) {
    const v = host.variants.findIndex((x) => x.lines.some((l) => /Socketed \([1-9]\)/.test(l)));
    const r = catalog.resolve({ ref: host.key, variant: v, socketCount: 1, sockets: [armorGem.key] }, 150);
    const s = r.sockets[0];
    s.parsed.forEach((p, i) => assert.notEqual(p.kind, "unknown", `${armorGem.name} in ${host.cat}: ${s.lines[i]}`));
  }
});

test("level-gated item lines and extra required levels follow the character and item level", async () => {
  const { catalog } = await env();
  const { parseLine } = await load("/src/planner/statparse.js");
  const at = (level, l) => parseLine(l, { level, skillByName: catalog.skillByName });
  assert.deepEqual(at(50, "+15 Spell Focus Until Level 100").effects, [["spell_focus", 15]]);
  assert.deepEqual(at(100, "+15 Spell Focus Until Level 100").effects, []);
  assert.deepEqual(at(89, "+10% Physical Resist After Level 90").effects, []);
  assert.deepEqual(at(90, "+10% Physical Resist After Level 90").effects, [["physical_resistance", 10]]);
  // "+N Required Level" on a socket filler raises the item's level after the fillers' own levels.
  const note = catalog.jewels().find((j) => j.variants.at(-1).lines.some((l) => /^\+\d+ Required Level$/.test(l)));
  assert.ok(note, "a jewel adds required level");
  const extra = Number(/\d+/.exec(note.variants.at(-1).lines.find((l) => /^\+\d+ Required Level$/.test(l)))[0]);
  const own = Number(/\d+/.exec(note.variants.at(-1).lines.find((l) => /^Required Level:/.test(l)) || "0")?.[0] || 0);
  const host = catalog.forSlot("body", "Paladin").find((d) => d.kind === "base" && d.variants.some((v) => v.lines.some((l) => /Socketed \([1-9]\)/.test(l))));
  const v = host.variants.findIndex((x) => x.lines.some((l) => /Socketed \([1-9]\)/.test(l)));
  const bare = catalog.resolve({ ref: host.key, variant: v, socketCount: 1 }, 150).head.reqLevel;
  const withNote = catalog.resolve({ ref: host.key, variant: v, socketCount: 1, sockets: [note.key] }, 150).head.reqLevel;
  assert.equal(withNote, Math.max(bare, own) + extra);
});

test("every mystic orb's lines count and its required level applies on items it fits", async () => {
  const { catalog } = await env();
  const { ORBS, orbFits } = await load("/src/planner/orbs.js");
  const hosts = ["weapon", "helm", "body", "offhand", "ring1", "amulet"]
    .map((slot) => catalog.forSlot(slot, "Paladin").find((d) => d.kind === "base" || d.kind === "unique"));
  for (const o of ORBS) {
    const h = hosts.find((x) => orbFits(o, x, x.variants.at(-1).lines, {}));
    if (!h) continue;
    const st = { ref: h.key, variant: h.variants.length - 1 };
    const before = catalog.resolve(st, 150), after = catalog.resolve({ ...st, orbs: [o.id] }, 150);
    assert.equal(after.head.reqLevel - before.head.reqLevel, o.reqLevel, o.name);
    after.orbs[0].parsed.forEach((p, i) => assert.notEqual(p.kind, "unknown", `${o.name}: ${o.lines[i]}`));
  }
});

test("an Honorific base item gets double from its mystic orbs, and says so in its name", async () => {
  const { catalog } = await env();
  const { ORBS, orbFits } = await load("/src/planner/orbs.js");
  const { superiorNames } = await load("/src/planner/superior.js");
  const helm = catalog.forSlot("helm", "Paladin").find((d) => d.kind === "base");
  const st = { ref: helm.key, variant: helm.variants.length - 1 };
  const orb = ORBS.find((o) => orbFits(o, helm, helm.variants.at(-1).lines, {}) && catalog.resolve({ ...st, orbs: [o.id] }, 150).orbs[0]?.parsed.some((p) => p.effects?.length));
  const value = (r) => r.orbs[0].parsed.flatMap((p) => p.effects || []).map(([, v]) => v)[0];
  const plain = catalog.resolve({ ...st, orbs: [orb.id] }, 150), hono = catalog.resolve({ ...st, orbs: [orb.id], honorific: true }, 150);
  assert.equal(value(hono), 2 * value(plain), orb.name);
  assert.equal(superiorNames(hono).name, `Honorific ${helm.name}`);
  // Only base items can be Honorific.
  const unique = catalog.forSlot("helm", "Paladin").find((d) => d.kind === "unique");
  assert.equal(catalog.resolve({ ref: unique.key, honorific: true }, 150).honorific, false);
});

test("items giving another class's skills are that class's, and Suggest gear leaves them out", async () => {
  const { catalog } = await env();
  const byName = (n) => catalog.all().find((d) => d.name === n);
  assert.equal(catalog.forClass(byName("Warmage's Fireblade"), "Amazon"), false);
  assert.equal(catalog.forClass(byName("Warmage's Fireblade"), "Sorceress"), true);
  assert.equal(catalog.forClass(byName("Relic (Arcane Torrent)"), "Amazon"), false, "a relic of another class's skill");
  assert.equal(catalog.forClass(byName("Relic (Summon Frostwalker)"), "Amazon"), true, "a skill no class owns");
  assert.equal(catalog.forClass(byName("Elder Law"), "Barbarian"), false, "(Druid Only) skills");
  assert.equal(catalog.forClass(byName("Ahriman"), "Amazon"), true);
});

test('dialogs get recommendations in the background, shared with the rest of the planner', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/assassin-level-93-crucify.json', import.meta.url), 'utf8'));
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Assassin');
    Object.assign(p.build.value, fixture);
    // Not ready yet: the dialog opens at once and shows a pending state.
    assert.equal(p.recommendLater('helm', 3), null);
    assert.equal(p.recommendLater('weapon', 3), null);
    for (let i = 0; i < 50 && (p.recommendLater('helm', 3) === null || p.recommendLater('weapon', 3) === null); i++)
      await new Promise((r) => setTimeout(r, 20));
    const helm = p.recommendLater('helm', 3), weapon = p.recommendLater('weapon', 3);
    assert.ok(helm && weapon, 'both slots are worked out in the background');
    // The same ranking the synchronous path gives, from the shared cache (same objects).
    assert.equal(p.recommend('weapon', 1)[0], weapon[0]);
    assert.deepEqual(helm.map((r) => r.def.key), p.recommend('helm', 3).map((r) => r.def.key));
    // A change to the build invalidates it.
    p.build.value.attrs.dexterity += 50;
    assert.equal(p.recommendLater('weapon', 3), null);
  } finally { scope.stop(); }
});

test('every class has the skill trees the game draws: same skills, tabs in page order, same rows and columns', async () => {
  const { engine } = await env();
  const extract = JSON.parse(await readFile(new URL('../data/game/2.14.4/skills.json', import.meta.url), 'utf8'));
  for (const cls of engine.classNames) {
    const placed = extract.skills.filter((g) => g.class === cls && g.tree);
    assert.ok(placed.length > 40, `${cls}: the game places its tree skills`);
    const nodes = engine.tabs(cls).flatMap((tab) => engine.treeNodes(cls, tab).map((n) => ({ ...n, tab })));
    const pageOfTab = new Map();
    for (const g of placed) {
      const n = nodes.find((x) => x.name === g.name);
      assert.ok(n, `${cls}: ${g.name} (game page ${g.tree.page}) is in the planner`);
      assert.deepEqual([n.row, n.col], [g.tree.row, g.tree.col], `${cls}: ${g.name} position`);
      if (pageOfTab.has(n.tab)) assert.equal(pageOfTab.get(n.tab), g.tree.page, `${cls}: ${n.tab} is one game page`);
      pageOfTab.set(n.tab, g.tree.page);
    }
    const order = engine.tabs(cls).filter((t) => pageOfTab.has(t)).map((t) => pageOfTab.get(t));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${cls}: tabs in the game's order`);
  }
  // The shared tabs every class has in game, which MedianDB lists only under the Amazon.
  for (const cls of engine.classNames) {
    assert.ok(engine.tabs(cls).includes('Mastery'), `${cls} has Mastery`);
    assert.ok(engine.treeNodes(cls, 'Reward').some((n) => n.name === 'Paragon of Fate'), `${cls} has Paragon of Fate`);
  }
});

test('"Help confirm values" ranks the screenshots that confirm the most, from the provenance of every tooltip', async () => {
  const { engine } = await env();
  const { confirmationGaps } = await load('/src/planner/confirmGaps.js');
  const r = confirmationGaps(engine);
  assert.ok(r.skills > 400 && r.unconfirmedSkills <= r.skills);
  // Everything is confirmed now (the game's code, and 138 in-game screenshots): no suggestions.
  assert.equal(r.unconfirmedSkills, 0);
  assert.deepEqual(r.suggestions, []);
  // Greedy cover: each pick adds less than the one before, and nothing is suggested twice.
  const helps = r.suggestions.map((s) => s.helps);
  assert.deepEqual(helps, [...helps].sort((a, b) => b - a));
  assert.equal(new Set(r.suggestions.map((s) => s.id)).size, r.suggestions.length);
  for (const s of r.suggestions) {
    assert.ok(s.confirms.length && s.confirms.every((c) => c.text && !/^(format|variable|rule|operator):/.test(c.text)), `${s.name}: plain descriptions`);
    assert.ok(engine.classNames.includes(s.cls) && engine.tabs(s.cls).includes(s.tab), `${s.name}: in its class's tree`);
  }
  // Every gap a tooltip reports is counted, and each count matches the skills listing it.
  // (Every Assassin skill at one point; Shadow Flow, once the example, is now confirmed in game.)
  const keys = new Set(engine.tabs('Assassin').flatMap((t) => engine.treeNodes('Assassin', t)).flatMap((n) =>
    engine.describe({ cls: 'Assassin', level: 150, points: { [n.id]: 1 }, quests: {} }, n.id, 1).effect
      .flatMap((l) => l.parts.flatMap((p) => p.source?.status === 'game-inferred' ? p.source.gaps : []))));
  assert.equal(keys.size, 0, 'no Assassin tooltip reports an unconfirmed gap');
  assert.deepEqual(r.gaps, []);
});

test("tooltip sections below the levels keep the game's headings and colours", async () => {
  const { engine } = await env();
  const mf = engine.synergies({ cls: 'Paladin', level: 2, points: { mind_flay: 1 }, quests: {}, charStats: { energy: 15 } }, 'mind_flay', 1);
  // In game: orange "Shock" (ÿc8) with its three lines, then gold "Synergies" (ÿc4).
  assert.deepEqual(mf.sections.map((s) => [s.title, s.colour, s.lines.length]), [['Shock', 'orange', 3], ['Synergies', 'gold', 2]]);
  assert.ok(mf.sections[1].bonus?.length, "what the synergies add now sits with the synergies");
  // A plain "Synergies" header (line type 40, no colour code) is drawn gold, as in game.
  const mm = engine.synergies({ cls: 'Amazon', level: 3, points: { magic_missiles: 1 }, quests: {}, charStats: { energy: 15 } }, 'magic_missiles', 1);
  assert.deepEqual(mm.sections.map((s) => [s.title, s.colour]), [['Synergies', 'gold']]);
  // The flat list is unchanged: the in-game synergy text, headings included, without the type 40 header.
  assert.deepEqual(mm.lines.map((l) => l.text), ['Energy: +8% Increased Damage', '+1 Projectile per 5 Skill Levels (Max 15)']);
});

test('Mind Flay is a damage spell per beam, not a summon, although MedianDB counts its beams as "minions"', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { skillDamage } = await load('/src/planner/damage.js');
  const b = build('Paladin', { level: 120, points: { mind_flay: 30 }, leftSkill: 'mind_flay' });
  const c = computeCharacter(b, { engine, catalog, planner });
  const d = skillDamage('mind_flay', { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
  assert.equal(d.kind, 'spell');
  assert.deepEqual(d.parts.map((p) => p.element), ['physical', 'lightning']);
  assert.deepEqual(d.total, [d.parts[0].range[0] + d.parts[1].range[0], d.parts[0].range[1] + d.parts[1].range[1]]);
  assert.equal(d.count.n, Number(/\d+/.exec(d.lines[0])[0]));
  // The total is for every beam; total and parts stay per beam (gear scoring compares those).
  assert.deepEqual(d.all, [d.total[0] * d.count.n, d.total[1] * d.count.n]);
  // A count given only as text: Slayer "Casts 25 times".
  const sb = build('Paladin', { level: 120, points: { slayer: 25 } });
  const cs = computeCharacter(sb, { engine, catalog, planner });
  const slayer = skillDamage('slayer', { engine, build: sb, skillBuild: { ...sb, soft: cs.soft, charStats: cs.charStats }, character: cs });
  assert.deepEqual([slayer.kind, slayer.count.n, slayer.count.text], ['spell', 25, 'Casts 25 times']);
  assert.deepEqual(slayer.all, [slayer.total[0] * 25, slayer.total[1] * 25]);
  assert.match(d.lines[0], /^Beams: \d+$/);
  // Real summons with a minion count stay summons.
  const w = skillDamage('wolf_companion', { engine, build: build('Barbarian', { level: 60, points: { wolf_companion: 10 } }),
    skillBuild: build('Barbarian', { level: 60, points: { wolf_companion: 10 } }), character: computeCharacter(build('Barbarian', { level: 60 }), { engine, catalog, planner }) });
  assert.equal(w.kind, 'summon');
});

test('shared class picker shows local class portraits and preserves special filter choices', async () => {
  const { default: ClassPicker } = await load('/src/components/ClassPicker.vue');
  for (const cls of planner.classes) {
    const html = await renderToString(createSSRApp({ render: () => h(ClassPicker, { modelValue: cls.name, classes: planner.classes.map(c => c.name) }) }));
    // The class's portrait, not its skill-icon sheet (class-*.webp is a grid of every skill icon).
    assert.ok(html.includes(`planner/portraits/${cls.prefix}.gif`), `${cls.name} portrait`);
    assert.doesNotMatch(html, /planner\/class-\w+\.webp/);
    assert.match(html, /aria-haspopup="listbox"/);
    const gif = await readFile(new URL(`../public/planner/portraits/${cls.prefix}.gif`, import.meta.url));
    assert.equal(gif.toString('ascii', 0, 3), 'GIF', `${cls.name} portrait is a GIF`);
  }
  const html = await renderToString(createSSRApp({ render: () => h(ClassPicker, { modelValue: '@none', classes: [], anyLabel: 'Any class', otherLabel: 'Other sets' }) }));
  assert.match(html, /Other sets/);
  assert.doesNotMatch(html, /<img/);
});

test('monster picker uses its own difficulty without changing the character build', async () => {
  const { engine, catalog } = await env();
  const { createPlanner, PlannerKey } = await load('/src/planner/usePlanner.js');
  const { default: TargetPicker } = await load('/src/components/planner/TargetPicker.vue');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Sorceress'); p.setLevel(100);
    p.build.value.difficulty = 'Hell'; p.build.value.points.flamefront = 10;
    p.state.target = 'typical'; p.state.targetDifficulty = 'Normal';
    assert.equal(p.target.value.name, 'Typical Normal monster');
    assert.equal(p.damageOf('flamefront').vs.difficulty, 'Normal');
    assert.equal(p.build.value.difficulty, 'Hell');
    p.state.targetDifficulty = 'Nightmare';
    assert.equal(p.damageOf('flamefront').vs.difficulty, 'Nightmare');
    const context = {};
    const html = await renderToString(createSSRApp({ setup() { provide(PlannerKey, p); return () => h(TargetPicker); } }), context);
    // The target's row opens a pop-out (resistances, "Choose another target", how it's worked out).
    assert.match(html, /aria-controls="target-pop"/);
    assert.doesNotMatch(html, /datalist/);
    const modal = context.teleports.body;
    assert.match(modal, /Choose damage target/);
    for (const d of ['Normal', 'Nightmare', 'Hell']) assert.ok(modal.includes(`>${d}</button>`));
    assert.match(modal, /Find a monster/);
  } finally { scope.stop(); }
});

test('damage against a chosen monster: its resistances less pierce, immunities, deadly strike on attacks', async () => {
  const { effectiveResist, typicalTarget, againstTarget } = await load('/src/planner/target.js');
  const monsters = planner.monsters;
  assert.ok(monsters.length > 1000, 'monsters from the game files');
  assert.ok(monsters.every((m) => !/POLAR BUFFALO/.test(m.name)), 'no placeholder names');
  // Resistance rules.
  assert.deepEqual(effectiveResist(35, 20), { value: 15, immune: false });
  assert.deepEqual(effectiveResist(20, 200), { value: -100, immune: false });
  assert.deepEqual(effectiveResist(150, 200), { value: 150, immune: true });
  // Andariel in Hell (monstats.bin): lightning 50%.
  const andariel = monsters.find((m) => m.name === 'Andariel' && m.boss);
  assert.equal(andariel.res.lightning[2], 50);
  const c = { s: (k) => ({ enemy_lightning_resistance: 20, deadly_strike: 50 })[k] || 0 };
  const spell = againstTarget({ kind: 'spell', parts: [{ element: 'lightning', range: [100, 200] }] }, c, andariel, 'Hell');
  assert.deepEqual(spell.total, [70, 140], '50% less 20% pierce = 30% resistance');
  const hit = againstTarget({ kind: 'attack', parts: [{ element: 'physical', range: [100, 100] }] }, c, andariel, 'Hell');
  assert.deepEqual(hit.total, [105, 105], '30% physical resistance, then +50% expected from deadly strike');
  // Several hits: the total covers all of them.
  const many = againstTarget({ kind: 'spell', count: { n: 25, text: 'Casts 25 times' }, parts: [{ element: 'lightning', range: [100, 200] }] }, c, andariel, 'Hell');
  assert.deepEqual(many.all, [1750, 3500]);
  // The typical target is the median of ordinary monsters, for the difficulty only.
  const t = typicalTarget(monsters, 'Hell');
  assert.ok(t.typical && t.count > 500 && t.res.fire[2] >= 0 && t.res.fire[2] < 100);
});

test('class base stats come from the game files and match real saves (life, mana, attack rating)', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { saves } = JSON.parse(await readFile(new URL('./fixtures/save-base-stats.json', import.meta.url), 'utf8'));
  for (const s of saves) {
    const c = computeCharacter(build(s.cls, { level: s.level, attrs: s.attrs, difficulty: 'Normal' }), { engine, catalog, planner });
    if (s.maxLife != null) assert.equal(c.life.total, Math.floor(s.maxLife), `${s.file} life`);
    assert.equal(c.mana.total, Math.floor(s.maxMana), `${s.file} mana`);
  }
  // Every class's stats are the game's, and say so.
  const game = JSON.parse(await readFile(new URL('../data/game/2.14.4/skills.json', import.meta.url), 'utf8')).classes;
  for (const g of game) {
    const c = planner.classes.find((x) => x.name === g.name);
    for (const k of ['lifePerLevel', 'manaPerLevel', 'lifePerVit', 'manaPerEne', 'life', 'mana', 'toHitFactor']) assert.equal(c[k], g[k], `${g.name} ${k}`);
    assert.match(c.statsFrom, /charstats\.bin/);
  }
  // Attack rating at level 1: 5 × Dexterity − 35 + the class's to-hit factor from the game files.
  for (const cls of ['Sorceress', 'Paladin']) {
    const c = computeCharacter(build(cls, { level: 1 }), { engine, catalog, planner });
    const toHit = planner.classes.find((x) => x.name === cls).toHitFactor;
    assert.equal(c.ar.total, 5 * c.attributes.dexterity.total - 35 + toHit, cls);
  }
});

test('Maximum Life +% raises base life only: not +Life or Vitality from items (ItemStatCost op 11)', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const cls = planner.classes.find((x) => x.name === 'Barbarian');
  const item = (text) => ({ ref: 'custom', custom: { name: 'Test', slotType: 'charm', text } });
  const at = (inventory, attrs = { strength: 0, dexterity: 0, vitality: 50, energy: 0 }) =>
    computeCharacter(build('Barbarian', { level: 50, attrs, inventory }), { engine, catalog, planner }).life;
  const base = at([]);
  // Allocated vitality is part of the base the percentage multiplies.
  const raw = cls.life + 49 * cls.lifePerLevel + 50 * cls.lifePerVit;
  assert.equal(base.base, Math.floor(raw));
  const pct = at([item('Maximum Life +50%')]);
  // (base.flat is quest life, the Golden Bird, counted by level.)
  assert.equal(pct.total, Math.floor(raw * 1.5 + base.flat));
  // +Life and +Vitality from items add after the percentage.
  const both = at([item('Maximum Life +50%\n+100 to Life\n+40 to Vitality')]);
  assert.equal(both.fromAttribute, Math.floor(40 * cls.lifePerVit));
  assert.equal(both.total, Math.floor(raw * 1.5 + Math.floor(40 * cls.lifePerVit) + 100 + base.flat));
  // The same vitality allocated instead is multiplied.
  assert.ok(at([item('Maximum Life +50%')], { strength: 0, dexterity: 0, vitality: 90, energy: 0 }).total > both.total - 100);
});

test('Superior quality from the game files: bases and runewords gain its lines, uniques do not', async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load('/src/planner/character.js');
  const { SUPERIOR_VARIANTS, superiorVariantsForCat } = await load('/src/planner/superior.js');
  // qualityitems.bin in 2.14.4: two weapon and two armour variants.
  assert.deepEqual(SUPERIOR_VARIANTS.map((v) => [v.appliesTo, v.lines]), [
    ['weapon', ['+(35 to 60)% Enhanced Damage']],
    ['weapon', ['(50 to 100)% Bonus to Attack Rating', '+(35 to 50)% Enhanced Damage']],
    ['armor', ['+(35 to 60)% Enhanced Defense']],
    ['armor', ['+(35 to 50)% Enhanced Defense', '+1% Physical Resist']],
  ]);
  assert.equal(superiorVariantsForCat('Boots').length, 2);
  assert.equal(superiorVariantsForCat('Rings').length, 0);
  // A superior Greaves (4) at +47%, like the one seen in game: 820 × 1.47 ≈ 1,206 defense.
  // Its own range (Movement Speed) comes first, then the superior roll.
  const greaves = catalog.all().find((d) => d.kind === 'base' && d.name === 'Greaves');
  const t4 = greaves.variants.findIndex((v) => v.label === 'Tier 4');
  const r = catalog.resolve({ ref: greaves.key, variant: t4, superior: 2, rolls: [1, (47 - 35) / 25] }, 120);
  assert.ok(r.lines.includes('+47% Enhanced Defense'), r.lines.join(' | '));
  const def = (gear) => computeCharacter(build('Barbarian', { level: 120, attrs: { strength: 500, dexterity: 0, vitality: 0, energy: 0 }, gear }), { engine, catalog, planner }).defense;
  const plain = def({ boots: { ref: greaves.key, variant: t4 } }), sup = def({ boots: { ref: greaves.key, variant: t4, superior: 2, rolls: [1, (47 - 35) / 25] } });
  assert.equal(plain.items, 820);
  assert.equal(sup.items, 1206, 'as in game: (820 + 1) × 1.47');
  // Armour variants don't fit a weapon, and uniques can't be superior.
  assert.equal(catalog.resolve({ ref: greaves.key, variant: t4, superior: 0 }, 120).superior, null);
  const unique = catalog.all().find((d) => d.kind === 'unique' && d.slotType === 'boots');
  assert.equal(catalog.resolve({ ref: unique.key, superior: 2 }, 120).superior, null);
  // A runeword in a superior weapon base: its Enhanced Damage is local to the weapon.
  const rw = catalog.all().find((d) => d.kind === 'runeword' && d.slotType === 'weapon' && catalog.runewordBases(d).length);
  const base = catalog.runewordBases(rw)[0];
  const weaponEd = (superior) => computeCharacter(build('Barbarian', { level: 150, attrs: { strength: 2000, dexterity: 2000, vitality: 0, energy: 0 },
    gear: { weapon: { ref: rw.key, base: base.key, ...(superior != null ? { superior } : {}) } } }), { engine, catalog, planner }).damage.localEd;
  assert.equal(weaponEd(0) - weaponEd(), 60);
  // Suggest gear puts runewords in superior bases when the option is on, and says so.
  const { recommendForSlot, buildProfile, wantedStats } = await load('/src/planner/recommend.js');
  const wb = build('Barbarian', { level: 150, attrs: { strength: 800, dexterity: 400, vitality: 200, energy: 0 }, points: { whirlwind: 20 } });
  const wc = computeCharacter(wb, { engine, catalog, planner });
  const profile = buildProfile(wb, engine);
  const recs = (superior) => recommendForSlot('weapon', { build: wb, engine, catalog, planner, character: wc, profile, want: wantedStats(profile, wc), superior }, 40)
    .filter((x) => x.def.kind === 'runeword');
  const on = recs(true), off = recs(false);
  assert.ok(on.some((x) => x.state.superior != null && x.reasons[0].startsWith('In a Superior base')), 'superior runeword bases suggested');
  assert.ok(off.every((x) => x.state.superior == null), 'not when the option is off');
  // Saved and shared builds keep it.
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  stubBrowser();
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Barbarian');
    p.equip('boots', { ref: greaves.key, variant: t4, superior: 2 });
    assert.equal(p.build.value.gear.boots.superior, 2);
  } finally { scope.stop(); }
});

test('runewords can be made in the bases the game allows, including class armour that inherits a generic type', async () => {
  const { catalog } = await env();
  const data = await load('/src/data/index.js');
  const rw = (name) => catalog.all().find((d) => d.kind === 'runeword' && d.name === name);
  const cats = (name) => new Set(catalog.runewordBases(rw(name)).map((b) => b.cat));
  // Wall of Fire's item type is "shld", which every class shield inherits (runes.bin, itemtypes.bin).
  for (const c of ['Shields', 'Paladin Shields', 'Necromancer Shields']) assert.ok(cats('Wall of Fire').has(c), `Wall of Fire in ${c}`);
  // Shark excludes Necromancer Daggers and Assassin Claws, as the docs say.
  assert.ok(!cats('Shark').has('Necromancer Daggers') && !cats('Shark').has('Assassin Claws'));
  assert.ok(cats('Shark').has('Daggers'));
  // The finder uses the same rule: Paladin Shields shows the generic shield runewords too.
  const finder = data.RW.find((r) => r.name === 'Wall of Fire');
  assert.ok(finder.allowed.includes('Paladin Shields'));
  // Names split from their subtitles.
  const victory = data.RW.find((r) => r.name === 'Victory');
  assert.equal(victory.subtitle, '(Median XL - 6 years)');
  assert.ok(data.RW.every((r) => !/Median/.test(r.name)));
});

test('a saved build whose skill bar or buffs are not lists still loads (they are dropped)', async () => {
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  for (const bad of [{ skillBar: 'x' }, { buffs: 'x' }, { skillBar: 5, buffs: { a: 1 } }]) {
    stubBrowser();
    localStorage.setItem('mxlrw2:planner', JSON.stringify({ cls: 'Amazon', builds: { Amazon: { cls: 'Amazon', level: 50, ...bad } } }));
    const scope = effectScope();
    try {
      const p = scope.run(() => createPlanner(engine, catalog, planner));
      assert.deepEqual([p.build.value.skillBar, p.build.value.buffs], [[], []], JSON.stringify(bad));
      assert.equal(p.build.value.level, 50);
    } finally { scope.stop(); }
  }
});

test('named snapshot links restore a level-150 build without changing other classes', async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load('/src/planner/usePlanner.js');
  const scope = effectScope();
  try {
    const p = scope.run(() => createPlanner(engine, catalog, planner));
    p.setClass('Assassin');
    p.setLevel(150);
    p.build.value.attrs.strength = 200;
    p.build.value.gear.weapon = { ref: 'tu:84', variant: 3, orbs: ['mo-27'], sockets: ['sock:90'] };
    const original = JSON.parse(JSON.stringify(p.build.value));
    const code = p.buildCode();
    p.setClass('Amazon');
    p.setLevel(42);
    const amazon = JSON.stringify(p.build.value);
    assert.equal(p.importFromHash(`#planner?b=${code}&name=My%20snapshot`), true);
    assert.deepEqual(JSON.parse(JSON.stringify(p.build.value)), original);
    assert.equal(p.state.openedName.Assassin, 'My snapshot');
    assert.equal(JSON.stringify(p.state.builds.Amazon), amazon);
  } finally { scope.stop(); }
});

test('open questions come from where the sources disagree, and only for caps that really change with level', async () => {
  const { engine } = await env();
  const { openQuestions } = await load('/src/planner/confirmGaps.js');
  const q = openQuestions(engine, planner);
  const ids = q.map((x) => x.id);
  // Required levels where MedianDB is higher than the game files are asked about, unless
  // the game files settle them (Mastery skills unlocked by a deed, not a level).
  for (const d of planner.game.report.reqLevelDiffers.filter((d) => d.medianDb > d.game))
    assert.equal(ids.includes(`req:${d.id}`), !engine.unlockOf(d.id), d.name);
  // Cap questions only where the cap differs between character levels 1 and 150.
  for (const x of q.filter((x) => x.id.startsWith('cap:'))) {
    const b = { cls: x.skill.cls, points: {}, quests: {} };
    assert.notEqual(engine.maxLevel({ ...b, level: 1 }, x.skill.id, 1), engine.maxLevel({ ...b, level: 150 }, x.skill.id, 150), x.skill.name);
  }
  // Each cap question quotes the game's own rule; the max-life question is settled by
  // ItemStatCost (stat 76, op 11) and no longer asked.
  for (const x of q.filter((x) => x.id.startsWith('cap:'))) assert.match(x.detail, /The game confirms the rule \("[^"]*\d[^"]*"\)/, x.id);
  // Caps read in game (issues #14-#20, Aptitude in chat) are answered, not asked.
  assert.ok(!ids.includes('cap:warmth') && !ids.includes('cap:aptitude') && !ids.includes('rule:max-life-percent'));
});

test("level-built caps match what the game showed (issues #14-#20)", async () => {
  const { engine } = await env();
  const seen = { aptitude: "Barbarian", void_gazer: "Assassin", warmth: "Sorceress", consecration: "Paladin", sanctity: "Paladin", holy_fire: "Paladin", barkskin: "Druid", spiritual_alignment: "Druid" };
  for (const [id, cls] of Object.entries(seen)) {
    const c = engine.capConfirmed(id);
    assert.ok(c, `${id} has its in-game answer recorded`);
    for (const [level, cap] of Object.entries(c.at))
      assert.equal(engine.maxLevel({ cls, level: +level, points: {}, quests: {} }, id, +level), cap, `${id} at level ${level} (issue #${c.issue})`);
  }
});

test("gear that takes an attribute below zero is flagged, and never suggested", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const { attributesSafe } = await load("/src/planner/requirements.js");
  const rebel = { ref: "rw:135", base: "base:141", baseVariant: 1, superior: 3 };
  const bare = build("Assassin", { level: 100, attrs: { strength: 57, dexterity: 458, vitality: 0, energy: 0 } });
  const withRebel = { ...bare, gear: { body: rebel } };
  const before = computeCharacter(bare, { engine, catalog, planner });
  const after = computeCharacter(withRebel, { engine, catalog, planner });
  assert.ok(after.attributes.vitality.total < 0, "Rebel's -75 Vitality goes below zero with no points in it");
  const issue = after.issues.find((i) => /^Vitality is -\d+: Rebel/.test(i.text));
  assert.ok(issue, after.issues.map((i) => i.text).join(" / "));
  assert.equal(issue.fix.attr, "vitality");
  assert.equal(attributesSafe(before, after), false, "Suggest gear won't put it on");
});

test("levelling stages: each is its own build, carried by save codes and share links", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const { decodeBuild } = await load("/src/planner/buildCode.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Sorceress");
  p.reset();
  p.setLevel(150);
  assert.equal(p.state.stage.Sorceress, "Endgame");
  assert.equal(p.stageFilled("Normal"), false);
  p.setStage("Normal");
  assert.deepEqual([p.build.value.level, p.build.value.difficulty], [50, "Normal"], "an empty stage starts at its level");
  p.copyStage("Endgame");
  assert.deepEqual([p.build.value.level, p.build.value.difficulty], [50, "Normal"], "a copy keeps the stage's level");
  p.setLevel(40);
  p.setStage("Endgame");
  assert.equal(p.build.value.level, 150, "the endgame build is kept");
  assert.equal(p.stageFilled("Normal"), true);
  const code = decodeBuild(p.buildCode());
  assert.equal(code.stage, "Endgame");
  assert.equal(code.stages.Normal.level, 40);
  // A share link brings every stage back.
  const q = scope.run(() => createPlanner(engine, catalog, planner));
  q.importFromHash(`#planner?b=${p.buildCode()}`);
  q.setStage("Normal");
  assert.equal(q.build.value.level, 40);
  // A starter's stages go only where a stage is empty (no points or gear), the one being
  // edited included.
  q.fillStages("Sorceress", { Normal: { level: 20 }, Hell: { level: 125, difficulty: "Hell" } });
  assert.equal(q.build.value.level, 20, "an empty stage being edited is filled");
  assert.equal(q.stageFilled("Hell"), true);
  q.setLevel(60);
  q.add(engine.skillIds().find((id) => engine.skill(id).class === "Sorceress" && engine.canAdd(q.build.value, id).ok));
  q.fillStages("Sorceress", { Normal: { level: 30 } });
  assert.equal(q.build.value.level, 60, "a stage with points isn't replaced");
  p.reset();
  assert.equal(p.stageFilled("Normal"), false, "reset clears every stage");
  scope.stop();
});

test("a hired mercenary's party buff counts in the character's stats and travels with the build", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Amazon");
  p.reset();
  p.setLevel(150);
  const before = p.character.value.s("attack_speed");
  p.setMerc("Ranger");
  const withMerc = p.character.value.s("attack_speed");
  assert.ok(withMerc > before, "Dark Power's attack speed is added");
  assert.ok(p.character.value.stats.attack_speed.sources.some((x) => /Mercenary's Dark Power/.test(x.source)));
  p.toggleMercBuff("Dark Power");
  assert.equal(p.character.value.s("attack_speed"), before, "switched off");
  const q = scope.run(() => createPlanner(engine, catalog, planner));
  q.importFromHash(`#planner?b=${p.buildCode()}`);
  assert.equal(q.build.value.merc.spec, "Ranger");
  assert.deepEqual(q.build.value.merc.off, ["Dark Power"]);
  scope.stop();
});

test("unlockable skills need their deed's difficulty (Specialization: Baal on Hell)", async () => {
  const { engine } = await env();
  assert.equal(engine.unlockDifficulty("specialization"), "Hell");
  assert.equal(engine.unlockDifficulty("spellbind"), "Nightmare");
  assert.equal(engine.unlockDifficulty("endurance"), "Hell", "the Chamber of Blood has monsters only in Hell (levels.bin)");
  assert.equal(engine.unlockDifficulty("tenacity"), null, "several areas are called Pit, so it can't be placed");
  const b = (difficulty) => ({ cls: "Amazon", level: 100, points: {}, quests: {}, difficulty });
  assert.equal(engine.canAdd(b("Nightmare"), "specialization").ok, false);
  assert.match(engine.canAdd(b("Nightmare"), "specialization").reason, /needs Hell difficulty/);
  assert.equal(engine.canAdd(b("Hell"), "specialization").ok, true);
});

test("tooltip lines worth 0 are hidden where the game hides them (Warmth's First Level, issue #12)", async () => {
  const { engine } = await env();
  const first = engine.describe({ cls: "Sorceress", level: 9, points: { warmth: 0 }, soft: {}, quests: {} }, "warmth", 0).effect.map((l) => l.text);
  assert.deepEqual(first, ["Mana Regeneration Rate: 3%"]);
});

test("a skill an item grants from outside the class works at the item's level, and its buff can be switched on", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const helm = catalog.all().find((d) => d.name === "Bul Kathos' Temper");
  const at = (buffs) => computeCharacter(build("Barbarian", { level: 120, attrs: { strength: 400, dexterity: 100, vitality: 0, energy: 0 }, gear: { helm: { ref: helm.key } }, buffs }), { engine, catalog, planner });
  const off = at([]), on = at(["lightning_shield"]);
  // Its level: the item's own plus +all skills (the Oskill Index); not a Barbarian skill, so no points.
  assert.ok(off.itemSkills.lightning_shield > 0, "Lightning Shield granted");
  assert.equal(off.s("attacker_takes_lightning_damage"), 0);
  assert.ok(on.s("attacker_takes_lightning_damage") > 0, "switched on, its effect counts");
  // A skill of the class's own tree isn't an item skill (+skills to it are soft levels).
  assert.ok(Object.keys(off.itemSkills).every((id) => !engine.node(build("Barbarian"), id)));
});

test("where MedianDB and the game files disagree, the game's value is used", async () => {
  const { engine } = await env();
  // Formulas: every one the import found differing shows the game's number (Incineration
  // Trap's fire pierce: MedianDB 20% at level 1, the game 4%).
  for (const x of planner.game.report.formulaDiffers) {
    const s = planner.skills[x.id];
    const b = build(s.class, { level: Math.max(x.ulvl, 1), points: { [x.id]: x.blvl } });
    const effect = engine.describe(b, x.id, x.blvl).effect;
    // The game's number shown, or the game's own tooltip formula built on it (2.14.6's
    // Annihilation writes max(10, pst1): its stat is 1 at level 1, its tooltip 10%).
    const line = effect.find((l) => l.text && l.text.includes(`${x.game}%`))
      || effect.find((l) => l.trust === "game" && (l.parts || []).some((pt) => (pt.source?.formula || []).some((f) => /\bpst\d\b/.test(f))));
    assert.ok(line, `${x.name}: the game's ${x.game} shown, not MedianDB's ${x.medianDb}`);
  }
  // Caps and required levels: the game's (level-grown caps aside, which follow what the game shows).
  for (const x of planner.game.report.capDiffers) {
    const src = engine.capSource(x.id);
    if (!src.dynamic) assert.equal(src.base, x.game, `${x.name} cap`);
  }
  for (const x of planner.game.report.reqLevelDiffers) assert.equal(engine.requiredCharLevel(x.id, build(planner.skills[x.id].class)), x.game, `${x.name} required level`);
});

test("a build's author sets its tiers (overall, bossing, clearing, survival), and they travel with it", async () => {
  stubBrowser();
  const { engine, catalog } = await env();
  const { createPlanner } = await load("/src/planner/usePlanner.js");
  const { encodeBuild } = await load("/src/planner/buildCode.js");
  const scope = effectScope();
  const p = scope.run(() => createPlanner(engine, catalog, planner));
  p.setClass("Amazon");
  p.setAuthorTier("tier", "A");
  p.setAuthorTier("bossTier", "S");
  p.setAuthorTier("clearTier", "B");
  p.setAuthorTier("surviveTier", "Q"); // not a tier: ignored
  p.setAuthorTier("mood", "S"); // not a criterion: ignored
  assert.deepEqual(p.build.value.authorTiers, { tier: "A", bossTier: "S", clearTier: "B" });
  // In a share link, and cleaned on the way in: anything that isn't a tier is dropped.
  const shared = JSON.parse(JSON.stringify(p.build.value));
  p.importFromHash(`#planner?b=${encodeBuild({ ...shared, authorTiers: { tier: "A", bossTier: "S", clearTier: "Z", extra: "S" } })}`);
  assert.deepEqual(p.build.value.authorTiers, { tier: "A", bossTier: "S" });
  // Clearing them all leaves none.
  p.setAuthorTier("tier", "");
  p.setAuthorTier("bossTier", "");
  assert.equal(p.build.value.authorTiers, undefined);
  scope.stop();
});

test("a learned upgrade's minion bonus reaches its summons: Fervor's summon damage in Resurrect (issue #23)", async () => {
  const { engine, catalog } = await env();
  const { computeCharacter } = await load("/src/planner/character.js");
  const line = (points) => {
    const b = build("Paladin", { level: 150, points: { conclave: 1, resurrect: 1, ...points } });
    const c = computeCharacter(b, { engine, catalog, planner });
    const d = engine.describe({ ...b, soft: c.soft, itemSkills: c.itemSkills, charStats: c.charStats }, "resurrect", 1);
    return { c, text: d.effect.map((l) => l.text).find((t) => /^Physical Damage/.test(t)) };
  };
  // In game, with Fervor and Conclave at 1: Physical Damage +25% (20 + Fervor's 10 halved).
  const withFervor = line({ fervor: 1 });
  assert.equal(withFervor.text, "Physical Damage: +25%");
  assert.equal(withFervor.c.s("summoned_minion_damage"), 10);
  assert.equal(line({}).text, "Physical Damage: +20%");
  // Only the minion bonus: Fervor's fire damage is its Servants', not the character's.
  assert.ok(!withFervor.c.stats.total_damage_added_as_fire?.sources.some((x) => /Fervor/.test(x.source)));
});
