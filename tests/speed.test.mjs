import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { castFrames, attackFrames, breakpoints, speedProfile } from "../src/planner/speed.js";

const data = JSON.parse(readFileSync(new URL("../src/data/speed.json", import.meta.url), "utf8"));

// The official calculator's loop (dev.median-xl.com/speedcalc, doCastMaths): walks speed up
// one at a time and logs each speed where frames drop. Our table must agree with it.
function officialCast(fpd, as) {
  const f = (i) => Math.ceil((256 * fpd) / Math.floor((as * (100 + Math.min(Math.floor((120 * i) / (120 + i)), 75))) / 100)) - 1;
  const out = [{ speed: 0, frames: f(0) }];
  let counter = 1;
  for (let i = 0; i <= 200; i++) if (f(i) === out[0].frames - counter) { out.push({ speed: i, frames: f(i) }); counter++; }
  return out;
}

test("cast breakpoints match the official calculator for every class and weapon animation", () => {
  let checked = 0;
  for (const modes of Object.values(data.anims))
    for (const [mode, [fpd, as]] of Object.entries(modes)) {
      if (!mode.startsWith("SC")) continue;
      const ours = breakpoints((s) => castFrames(fpd, as, s)).filter((b) => b.speed <= 200);
      assert.deepEqual(ours, officialCast(fpd, as), mode);
      checked++;
    }
  assert.equal(checked, 57); // 7 classes × 8 weapon kinds, and Assassin claws
});

test("the game data is the installed patch's animdata the calculator uses", () => {
  assert.equal(data.patch, "2.14.6");
  assert.deepEqual(data.anims.Amazon.A11HS, [16, 256]);
  assert.deepEqual(data.anims.Assassin.A1HT1, [11, 320]);
  assert.deepEqual(data.weapons["Short Sword"], ["1hs", -20]);
  assert.deepEqual(data.weapons["Broad Sword"], ["1hs", -10]); // not the one-off item of the same name
  assert.deepEqual(data.weapons["Great Maul"], ["stf", 23]);
});

test("more speed never costs frames, and the 75% cap stops the gains", () => {
  let last = Infinity;
  for (let s = 0; s <= 300; s++) {
    const f = attackFrames(16, 256, s, -20);
    assert.ok(f <= last);
    last = f;
  }
  assert.equal(castFrames(20, 435, 5000), castFrames(20, 435, 360));
});

test("an Amazon with a Short Sword: the swing starts two frames in", () => {
  const p = speedProfile(data, "Amazon", "Short Sword", { ias: 0, fcr: 0 });
  // Amazon A11HS 16 frames at 256, WSM -20: ceil(256 × 14 / floor(256 × 1.2)) − 1 = 11
  assert.equal(p.attack.frames, 11);
  assert.equal(p.weapon.wclass, "1hs");
  assert.ok(p.attack.next.frames < 11 && p.attack.next.speed > 0);
  assert.equal(p.cast.frames, castFrames(20, 435, 0));
});

test("bare hands use the unarmed animations; an unknown base is flagged", () => {
  assert.equal(speedProfile(data, "Barbarian", null).weapon.wclass, null);
  assert.equal(speedProfile(data, "Barbarian", "No Such Axe").weapon.known, false);
});

test("chance to hit: classic D2 formula, between 5% and 95%", async () => {
  const { hitChance, againstTarget } = await import("../src/planner/target.js");
  // 100 × 1000/(1000+1000) × 2×100/(100+100) = 50
  assert.equal(hitChance(1000, 1000, 100, 100), 50);
  assert.equal(hitChance(100000, 10, 120, 60), 95);
  assert.equal(hitChance(10, 100000, 1, 125), 5);
  const target = { levels: [0, 0, 110], def: [0, 0, 1000], res: {} };
  const c = { s: () => 0, ar: { total: 3000 } };
  const attack = againstTarget({ kind: "attack", parts: [{ element: "physical", range: [10, 10] }] }, c, target, "Hell", 110);
  assert.equal(attack.hit, 75);
  const spell = againstTarget({ kind: "spell", parts: [{ element: "fire", range: [10, 10] }] }, c, target, "Hell", 110);
  assert.equal(spell.hit, undefined, "spells always hit");
});

test("monster defense comes from the game files", () => {
  const { monsters } = JSON.parse(readFileSync(new URL("../data/game/2.14.4/monsters.json", import.meta.url), "utf8"));
  const zombie = monsters.find((m) => m.name === "Zombie");
  assert.deepEqual(zombie.def, [34, 234, 1481]); // 84/82/80% of monlvl.bin's defense at levels 1, 45, 110
  assert.ok(monsters.every((m) => m.def.length === 3));
});
