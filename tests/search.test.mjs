import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, search } from "../src/search.js";

const index = buildIndex({
  RW: [{ name: "Enigma", runes: ["Jah", "Ith", "Ber"], lvl: 65 }, { name: "Eternal", runes: ["Um"], lvl: 20 }],
  TUD: [{ name: "Grim Fang", base: "Hand Axe", cat: "Axes" }],
  SUD: [{ name: "Fang of the Old", base: "Sacred Axe", cat: "Axes" }],
  SETD: [{ name: "Ancient Legacy", cls: null, items: [{ name: "Ancient Wisdom", base: "Circlet" }] }],
  SOCKD: [{ name: "Eth Rune", group: "Standard runes" }],
  BASED: [{ name: "Hand Axe", cat: "Axes" }],
  made: { uniques: { "Grim Fang": "reroll" }, items: { "Eth Rune": 1, "Hand Axe (2)": 1 } },
  skills: { enigma_x: { name: "Énigmatic Blast", class: "Sorceress", tabName: "Arcane", description: "Boom." } },
});

test("an exact name comes first, then names that start with it", () => {
  const r = search(index, "enigma");
  assert.equal(r[0].name, "Enigma");
  assert.equal(r[0].kind, "runeword");
  const skill = r.find((e) => e.kind === "skill");
  assert.ok(skill, "accents are folded: Énigmatic matches enigma");
  assert.equal(skill.link, "#planner?skill=enigma_x");
});

test("words match in any order, at the start of words", () => {
  assert.equal(search(index, "fang grim")[0].name, "Grim Fang");
  assert.deepEqual(search(index, "fang").map((e) => e.name).slice(0, 2).sort(), ["Fang of the Old", "Grim Fang"]);
});

test("set items lead to their set, and cube recipes link into the cube", () => {
  const item = search(index, "ancient wisdom")[0];
  assert.equal(item.kind, "set-item");
  assert.equal(item.reveal, "Ancient Legacy");
  const cube = search(index, "eth rune").find((e) => e.kind === "cube");
  assert.equal(cube.link, "#cube?make=item:Eth%20Rune");
  assert.match(search(index, "grim").find((e) => e.kind === "cube").sub, /reroll/);
});

test("a base item's tier upgrades aren't listed one by one", () => {
  assert.deepEqual(search(index, "hand axe").map((e) => e.kind), ["base"]);
});

test("nothing for an empty query or no match", () => {
  assert.deepEqual(search(index, "  "), []);
  assert.deepEqual(search(index, "zzz"), []);
});
