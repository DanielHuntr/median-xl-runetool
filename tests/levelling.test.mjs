import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areasNear, experienceShare, gearCats, runewordsBetween } from "../src/levelling.js";

const { areas, patch } = JSON.parse(readFileSync(new URL("../src/data/areas.json", import.meta.url), "utf8"));

test("areas come from the game's levels.bin", () => {
  assert.equal(patch, "2.14.4");
  const moor = areas.find((a) => a.name === "Blood Moor");
  assert.deepEqual([moor.act, ...moor.mlvl], [1, 1, 51, 100]);
  assert.ok(!areas.some((a) => a.name === "Rogue Encampment"), "towns have no monsters");
});

test("experience by level difference (the docs' Experience page)", () => {
  assert.equal(experienceShare(80, 85), 1);
  assert.equal(experienceShare(80, 72), 0.7);
  assert.equal(experienceShare(80, 95), 0.03);
  assert.equal(experienceShare(120, 113), 0.6);
  assert.equal(experienceShare(120, 130), 0.03);
});

test("where to level: full-experience areas in that difficulty, highest monster level first, one row per name", () => {
  const near = areasNear(areas, 75, "Nightmare");
  assert.equal(near.length, 5);
  assert.ok(near.every((a) => a.xp === 1 && Math.abs(a.mlvl - 75) <= 5), JSON.stringify(near));
  assert.ok(near.every((a, i) => i === 0 || a.mlvl <= near[i - 1].mlvl), "highest monster level first");
  assert.equal(new Set(near.map((a) => a.name)).size, 5);
  assert.ok(areasNear(areas, 25, "Normal").every((a) => a.mlvl <= 50), "Normal areas only");
});

test("gear categories: uniques, sets by base, runewords by their base", () => {
  const c = {
    TUD: [{ id: 3, cat: "Bows" }], SUD: [{ id: 1, cat: "Helms" }],
    SETD: [{ id: 0, items: [{ base: "Plate Mail" }] }], BASED: [{ id: 9, name: "Plate Mail", cat: "Body Armors" }, { id: 4, name: "Buckler", cat: "Shields" }],
  };
  const gear = { weapon: { ref: "tu:3" }, helm: { ref: "su:1" }, body: { ref: "set:0:0" }, offhand: { ref: "rw:12", base: "base:4" }, ring1: { ref: "tu:3" } };
  assert.deepEqual(gearCats(gear, c).sort(), ["Body Armors", "Bows", "Helms", "Shields"]);
});

test("runewords new since the last stage, for the types worn", () => {
  const RW = [{ name: "A", lvl: 20, bases: ["Bows"] }, { name: "B", lvl: 40, bases: ["Bows"] }, { name: "C", lvl: 45, bases: ["Swords"] }, { name: "D", lvl: 60, bases: ["Bows"] }];
  const fits = (r, cat) => r.bases.includes(cat);
  assert.deepEqual(runewordsBetween(RW, fits, ["Bows"], 25, 50).map((r) => r.name), ["B"]);
  assert.deepEqual(runewordsBetween(RW, fits, [], 0, 150), []);
});
