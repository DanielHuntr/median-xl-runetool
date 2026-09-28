import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCube } from "../src/cube/engine.js";
import { propertyLines } from "../src/cube/stats.js";

const data = JSON.parse(readFileSync(new URL("../src/data/cube-main.json", import.meta.url), "utf8"));
const cube = createCube(data);
const HELL = { cls: 0, level: 150, difficulty: 2 };
const codeOf = (name) => {
  const it = [...cube.items.values()].find((i) => i.name === name);
  assert.ok(it, `no item named ${name}`);
  return it.code;
};
const item = (name, extra) => cube.makeItem(codeOf(name), extra);
const made = (r) => r.contents.map((i) => cube.itemName(i));

test("the recipe table is the game's", () => {
  assert.ok(data.recipes.length > 7000, `${data.recipes.length} recipes`);
  assert.match(data.patch, /^\d+\.\d+\.\d+$/);
});

test("two runes make the next rune", () => {
  const r = cube.transmute([item("Nef Rune"), item("Nef Rune")], HELL);
  assert.ok(r.matched);
  assert.deepEqual(made(r), ["Eth Rune"]);
});

test("a recipe needs exactly its ingredients", () => {
  assert.equal(cube.transmute([item("Nef Rune"), item("Nef Rune"), item("Arcane Crystal")], HELL).matched, false);
  assert.equal(cube.transmute([item("Nef Rune"), item("Wirt's Leg")], HELL).matched, false);
  // One rune alone is a recipe of its own: it goes down a rune.
  assert.deepEqual(made(cube.transmute([item("Nef Rune")], HELL)), ["Tir Rune"]);
});

test("an Arcane Crystal uptiers an item and keeps its quality", () => {
  const r = cube.transmute([item("Hand Axe (1)", { quality: 7 }), item("Arcane Crystal")], HELL);
  // A unique uptiers to the unique of the next tier's base: Brainhack on a Hand Axe (2).
  assert.equal(r.contents[0].code, codeOf("Hand Axe (2)"));
  assert.equal(r.contents[0].quality, 7);
  assert.deepEqual(made(r), ["Brainhack"]);
});

test("Wirt's Leg opens the Cow Level on Hell only", () => {
  const hell = cube.transmute([item("Wirt's Leg")], HELL);
  assert.ok(hell.matched);
  assert.match(hell.effects.join(" "), /Moo Moo Farm/);
  assert.equal(cube.transmute([item("Wirt's Leg")], { ...HELL, difficulty: 0 }).matched, false);
});

test("shrine blessing works once per item", () => {
  const bless = (it) => cube.transmute([it, item("Weird Shrine (5)"), item("Arcane Crystal"), item("Arcane Crystal")], HELL);
  const first = bless(item("Bastard Sword (Sacred)", { quality: 8 }));
  assert.ok(first.matched, "a crafted sacred two-hander can be blessed");
  const sword = first.contents[0];
  assert.ok(cube.itemLines(sword).includes("Shrine Blessed"));
  assert.deepEqual(made(first).slice(1), ["Weird Shrine (4)"], "the shrine loses a charge");
  assert.equal(bless(sword).matched, false, "a blessed item can't be blessed again");
});

test("a rune container gives one rune back and counts down", () => {
  const three = cube.transmute([item("Tal Container (07)", { stats: { 501: 3 } })], HELL);
  assert.deepEqual(made(three), ["Tal Container (07)", "Tal Rune"]);
  assert.ok(cube.itemLines(three.contents[0]).includes("Quantity: 2"));
  const last = cube.transmute([item("Tal Container (07)", { stats: { 501: 1 } })], HELL);
  assert.deepEqual(made(last), ["Tal Rune", "Oil of Craft"]);
});

test("class and character level decide the Sunstone recipe", () => {
  const shards = () => [item("Shard of Fire"), item("Shard of Ice"), item("Shard of Thunder")];
  assert.deepEqual(made(cube.transmute(shards(), { cls: 4, level: 40, difficulty: 2 })), ["Shard of Fire", "Shard of Ice", "Shard of Thunder"]);
  assert.deepEqual(made(cube.transmute(shards(), { cls: 4, level: 55, difficulty: 2 })), ["Sunstone of the Twin Seas"]);
});

test("suggestions list what the cube contents can become, grouped by family", () => {
  const s = cube.suggest([item("Arcane Crystal")], HELL, { max: 1, limit: 50 });
  const uptier = s.find((x) => /\(2\)/.test(x.text.outputs[0].name));
  assert.ok(uptier?.similar > 100, "uptiering is one family, not a row per base");
  assert.ok(s.some((x) => x.text.outputs.some((o) => o.name === "Arcane Cluster")));
  assert.ok(s.every((x) => !x.text.blocked));
});

test("the picker only offers items that still fit a recipe", () => {
  const slots = cube.openSlots([item("Nef Rune")], HELL);
  assert.ok(cube.fitsAny(item("Nef Rune"), slots));
  assert.ok(!cube.fitsAny(item("Wirt's Leg"), slots));
  assert.equal(cube.openSlots([], HELL), null);
});

test("loading a recipe fills the cube with a working example", () => {
  const recipe = cube.search("eth rune", { limit: 10 }).find((r) => r.text.inputs.join() === "2 × Nef Rune").recipe;
  const r = cube.transmute(cube.load(recipe), HELL);
  assert.deepEqual(made(r), ["Eth Rune"]);
});

test("recipe outputs are written as item lines", () => {
  const classSkills = Object.entries(data.props).filter(([, parts]) => parts.some(([, stat]) => stat === 83)).map(([p]) => +p);
  const lines = classSkills.map((p) => propertyLines(data, [p, 0, 1, 1])[0]);
  assert.ok(lines.includes("+1 to Paladin Skill Levels") && lines.includes("+1 to Assassin Skill Levels"), lines.join(", "));
  const blessed = Object.entries(data.props).find(([, parts]) => parts.some(([, stat]) => stat === 219))[0];
  assert.deepEqual(propertyLines(data, [+blessed, 0, 1, 1]), ["Shrine Blessed"]);
});

test("random recipes roll: Oil of Lesser Alchemy gives one of ten bonuses", () => {
  const amulet = () => [item("Amulet", { quality: 5 }), item("Oil of Lesser Alchemy (3)")];
  const seen = new Set();
  for (const roll of [0, 0.15, 0.35, 0.55, 0.95]) {
    const r = cube.transmute(amulet(), HELL, () => roll);
    assert.ok(r.matched && r.random, "a set amulet always becomes a crafted one");
    seen.add(cube.itemLines(r.contents[0]).join());
  }
  assert.equal(seen.size, 5, "different rolls give different bonuses");
  assert.match(cube.describe(cube.transmute(amulet(), HELL, () => 0).recipe).conditions.join(), /Random: 1 in 10/);
});

test("conditions are written in words, never as stat numbers", () => {
  for (const r of cube.recipes) for (const c of cube.describe(r).conditions) assert.doesNotMatch(c, /stat d/, c);
});

test("tiers and charges of one base are one item with versions", () => {
  const v = cube.variantsOf(codeOf("Angel Star (2)"));
  assert.equal(v.base, "Angel Star");
  assert.equal(v.kind, "Tier");
  assert.deepEqual(v.list.map((x) => x.label), ["1", "2", "3", "4", "Sacred"]);
  const shrine = cube.variantsOf(codeOf("Creepy Shrine (4)"));
  assert.equal(shrine.kind, "Charges");
  assert.equal(cube.items.get(shrine.default).name, "Creepy Shrine (10)", "a shrine goes in full");
});

test("suggestions only list recipes the item can actually do", () => {
  const unique = item("Angel Star (1)", { quality: 7 });
  const s = cube.suggest([unique], HELL, { max: 3, limit: 60 });
  // Revealing a hidden bonus needs a roll the item doesn't have.
  assert.ok(!s.some((x) => x.text.inputs.join() === "Weapon,Oil of Craft"), "no reveal recipes for an ordinary item");
  assert.ok(s.some((x) => /Catalyst of Disenchantment/.test(x.text.inputs.join())), "a unique can be disenchanted");
  // An upgraded weapon can't take another luck oil.
  const upgraded = item("Angel Star (1)", { quality: 7, stats: { 443: 1 } });
  assert.ok(!cube.suggest([upgraded], HELL, { max: 1, limit: 60 }).some((x) => /Oil of Luck/.test(x.text.inputs.join())));
});

test("a recipe's random results are one entry", () => {
  const treasure = item("Treasure of Fiacla Gear");
  const s = cube.suggest([treasure], HELL);
  assert.equal(s.length, 1);
  assert.ok(s[0].outcomes.length >= 8, `${s[0].outcomes.length} outcomes`);
  assert.ok(cube.transmute([treasure], HELL).matched, "a treasure always opens (it's made with its roll)");
});

test("the recipe book can list only recipes for the cube's contents", () => {
  const all = cube.search("rune", { limit: 200 });
  const forNef = cube.search("rune", { limit: 200, contents: [item("Nef Rune")], ctx: HELL });
  assert.ok(forNef.length > 0 && forNef.length < all.length);
  assert.ok(forNef.every((r) => r.text.inputs.some((t) => /Nef Rune|Rune|rune/.test(t))));
});

test("items that share a name say what's different", () => {
  const amulets = [...cube.items.values()].filter((i) => i.name === "Amulet" && cube.recipesFor(i.code).size);
  const shown = amulets.filter((i) => cube.listed(i.code)).map((i) => cube.hintOf(i.code)).sort();
  assert.deepEqual(shown, ["base of Mark of the Angiris", "the usual one"]);
  // Each Soulforged Mystic Orb names the bonus it adds; no two the same.
  const orbs = [...cube.items.values()].filter((i) => i.name === "Soulforged Mystic Orb" && cube.listed(i.code)).map((i) => cube.hintOf(i.code));
  assert.ok(orbs.length > 5 && new Set(orbs).size === orbs.length && orbs.includes("Cannot Be Frozen"), orbs.join(", "));
  assert.equal(cube.hintOf([...cube.items.values()].find((i) => i.code === "11^").code), "holds 11 signets");
});

test("the item list ranks what helps: finishing a recipe first, bulk extras last", () => {
  const unique = (name) => {
    const [id, [, code]] = Object.entries(data.uniques).find(([, [n]]) => n === name);
    return cube.makeItem(code, { quality: 7, special: +id });
  };
  const steps = cube.steps([unique("Adamantine Guard")], HELL);
  assert.deepEqual(cube.rank(item("Catalyst of Disenchantment"), steps), { fits: true, left: 0, bulk: false });
  const another = cube.rank(unique("Akara's Robe"), steps);
  assert.ok(another.fits && another.bulk, "another unique only fits as bulk disenchanting");
  assert.equal(cube.rank(item("Nef Rune"), steps).fits, false);
});

test("socket punching: jewels add sockets to an item without any", () => {
  const recipe = cube.recipes.find((r) => r.inputs.some((i) => i.key === "jewl" && i.qty === 2) && r.inputs[0].key === "weap");
  const d = cube.describe(recipe);
  assert.equal(d.outputs[0].name, "Weapon");
  assert.deepEqual(d.outputs[0].lines, ["Socketed (2, or the base's most if fewer)"]);
  const r = cube.transmute([item("Bastard Sword (1)"), item("Jewel"), item("Jewel")], HELL);
  assert.equal(r.contents[0].sockets, 2);
  assert.equal(cube.transmute([r.contents[0], item("Jewel")], HELL).matched, false, "an item with sockets can't be punched again");
});

test("sockets are capped at what the base can have", () => {
  assert.equal(cube.maxSocketsOf(codeOf("Short Sword (1)")), 1);
  assert.equal(cube.maxSocketsOf(codeOf("Short Sword (3)")), 3);
  const six = Array.from({ length: 6 }, () => item("Jewel"));
  const t1 = cube.transmute([item("Bastard Sword (1)"), ...six], HELL);
  assert.ok(t1.matched);
  assert.equal(t1.contents[0].sockets, cube.maxSocketsOf(codeOf("Bastard Sword (1)")));
  assert.ok(t1.contents[0].sockets <= 2, "no tier 1 base has more than 2 sockets");
  assert.match(t1.notes.join(" "), /at most/);
});

test("making a unique of a base rolls from the game's unique table", () => {
  const reroll = (base, roll = 0) => cube.transmute([item(base), item("Arcane Crystal"), item("Arcane Crystal"), item("Oil of Enhancement")], HELL, () => roll);
  assert.equal(cube.itemName(reroll("Hand Axe (1)").contents[0]), "Brainhack");
  // Akara's Robe (rarity 0) never rolls: a Quilted Armor (1) always becomes The War Cloak.
  assert.equal(cube.itemName(reroll("Quilted Armor (1)").contents[0]), "The War Cloak");
  const amulets = cube.uniqueChoices(codeOf("Amulet"));
  assert.ok(amulets.length > 5 && Math.abs(amulets.reduce((n, c) => n + c.chance, 0) - 1) < 1e-9);
  const s = cube.suggest([item("Hand Axe (1)")], HELL, { max: 3, limit: 60 }).find((x) => x.becomes);
  assert.deepEqual(s.becomes.map((c) => c.name), ["Brainhack"]);
});

test("the item list leaves out items no recipe is meant for, but keeps uniques", () => {
  assert.equal(cube.listed(codeOf("Choking Gas Potion")), false, "throwing potions only match catch-all 'any weapon' recipes");
  assert.equal(cube.listed(codeOf("Bardiche (1)")), true);
  const [id] = Object.entries(data.uniques).find(([, [n]]) => n === "Kingsport's Signals");
  assert.equal(cube.listed(`7:${id}`), true);
});

test("links from the catalogue load the recipe that makes the item", () => {
  const made = JSON.parse(readFileSync(new URL("../src/data/cube-made.json", import.meta.url), "utf8"));
  assert.equal(made.uniques.Brainhack, "reroll");
  assert.equal(made.uniques.Mjolner, undefined, "turning one Mjolner into the other isn't making it");
  const axe = cube.recipeToMake({ unique: "Brainhack" });
  assert.equal(cube.itemName(cube.transmute(axe.contents, HELL, () => 0).contents[0]), "Brainhack");
  const eth = cube.recipeToMake({ item: "Eth" });
  assert.deepEqual(cube.transmute(eth.contents, HELL).contents.map((i) => cube.itemName(i)), ["Eth Rune"]);
});

test("a link from a card showing a tier loads that tier's base", () => {
  const four = cube.recipeToMake({ unique: "Grim Fang", tier: 4 });
  assert.equal(cube.itemName(four.contents[0]), "Short Sword (4)");
  assert.equal(cube.itemName(cube.recipeToMake({ unique: "Grim Fang" }).contents[0]), "Short Sword (1)");
});

test("every recipe shown, loaded into the cube, transmutes (upgrade steps, corrupted items)", () => {
  const book = cube.recipeToMake({ unique: "Book of Cain: Cube Reagent" });
  assert.equal(cube.transmute(book.contents, {}).matched, true, "the Item Design comes with its 6 upgrade steps");
  const failing = [];
  for (const r of cube.recipes) {
    if (cube.describe(r).blocked || r.unrolled) continue;
    const c = cube.load(r);
    // Ingredients no item in the game can be (a type without items) can't be loaded.
    if (c.length !== r.inputs.reduce((n, i) => n + i.qty, 0)) continue;
    const ctx = { level: r.op?.[0] === 4 ? r.op[2] : 150, difficulty: 2, cls: r.cls ?? undefined };
    if (!cube.transmute(c, ctx, () => 0.5).matched) failing.push(`${r.row}: ${cube.describe(r).inputs.join(" + ")}`);
  }
  assert.deepEqual(failing, []);
});
