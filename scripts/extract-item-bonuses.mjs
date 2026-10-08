// Bonuses the Horadric Cube adds to an item the player keeps, for the planner's item editor
// ("Added bonuses"): src/data/item-bonuses.json. Read from the game's own recipe table
// (src/data/cube-main.json, so run scripts/extract-cube.mjs first) through the cube engine:
//   - trophies: a challenge charm + its trophy (The Book of Lies + Lord of Lies Trophy adds
//     Weapon Physical Damage +20%), keyed by the charm's item code (the planner's charm id);
//   - scrolls of enchantment: one per item ("Already Enchanted"), by slot, or by weapon class
//     for the weapon scrolls that name one (Staff, Mace, Hammer, Javelin, Spear). The scrolls
//     made for a rare or crafted base, the ethereal one and "+33 to a skill" (a random skill)
//     are left out;
//   - shrines: the preset bonuses a shrine adds to a sacred rare, crafted or honorific item
//     (crafting and blessing add the same set), per item category, from the plain recipe
//     (without Oil of Intensity, which narrows the same ranges upwards);
//   - cycles: Small, Medium and Large Cycles cubed into the Corrupted Wormhole;
//   - oils: Oil of Luck, Greater Luck and Conjuration on a kept item (one per item, "Already
//     Upgraded"), each by the game item type the recipe takes ("weap", "elex" for elemental
//     weapons, "armo", "ring", "amul", "misl" for quivers, "jewl"), in recipe order: the game
//     uses the first recipe that matches, so an elemental weapon gets Oil of Luck's attack speed
//     rather than the weapon's enhanced damage;
//   - corruptions: what a corrupted item can turn out to have. A Corrupted Crystal on a sacred
//     item ("ssgl") marks it corrupted and rolls a hidden number (stat 498); an Oil of Craft then
//     reveals the outcome that number's band gives ("(Cube with Oil of Craft to Reveal)"). Each
//     band lists outcomes by item type in recipe order, the first that fits applying. An outcome
//     keeps, for each band it appears in, the item types listed before it there.
// Lines as the cube engine writes them, with "(a-b)" ranges as the item text's "(a to b)";
// hidden markers (Already Enchanted, a trophy's "- Name -") and repeated lines dropped.
//
//   node scripts/extract-item-bonuses.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createCube } from "../src/cube/engine.js";

const data = JSON.parse(readFileSync(new URL("../src/data/cube-main.json", import.meta.url), "utf8"));
const cube = createCube(data);
const tidy = (lines) => [...new Set(lines
  .filter((l) => l !== "Already Enchanted" && !/^- .+ -$/.test(l) && !/^\+1 to a skill$/.test(l) && !/:$/.test(l))
  .map((l) => l.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, "($1 to $2)")
    // The item text's wording (the docs' boots scroll), which the planner's parser reads.
    .replace(/^(\d+)% Avoid Damage$/, "$1% Chance to Avoid Damage")))];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const trophies = [], scrolls = [], shrines = [], cycles = [], oils = [];
const corruptionByKey = new Map(), bandTypes = new Map();
const WEAPON_SCROLL = { Staff: "Staves", Mace: "Maces", Hammer: "Hammers", Javelin: "Javelins", Spear: "Spears" };
const SLOT_SCROLL = { "Body armor": "body", Gloves: "gloves", Boots: "boots", Belt: "belt", Helm: "helm", Ring: "ring", Amulet: "amulet" };
const shrineSeen = new Set();

for (const r of cube.recipes) {
  const d = cube.describe(r);
  const out = d.outputs[0];
  if (!out?.lines?.length) continue;
  const [first, second] = d.inputs;
  // Trophies: charm + "<Name> Trophy", the charm changed.
  if (d.inputs.length === 2 && /Trophy$/.test(second) && out.name === first) {
    const title = (out.lines.find((l) => /^- .+ -$/.test(l)) || "").replace(/^- | -$/g, "");
    trophies.push({ id: `trophy:${r.inputs[0].key}`, charm: r.inputs[0].key, name: second, title, lines: tidy(out.lines) });
    continue;
  }
  // Scrolls of enchantment.
  const scroll = /^Scroll of Enchantment: (\w[\w ]*?)(?: \((.+)\))?$/.exec(second || "");
  if (d.inputs.length === 2 && scroll && out.lines.includes("Already Enchanted")) {
    const fits = SLOT_SCROLL[first] ? { slot: SLOT_SCROLL[first] } : WEAPON_SCROLL[first] ? { cat: WEAPON_SCROLL[first] } : null;
    if (!fits) continue;
    const lines = tidy(out.lines);
    scrolls.push({ id: `scroll:${slug(`${first} ${lines[0]}`)}`, ...fits, name: `Scroll of Enchantment: ${scroll[1]}`, lines });
    continue;
  }
  // Shrines: "Rare Sacred <category> + <Shrine> Shrine (n)" making a new crafted item.
  const shrine = /^(\w+) Shrine \(\d+\)$/.exec(second || "");
  const cat = /^Rare Sacred (.+)$/.exec(first || "");
  if (d.inputs.length === 2 && shrine && cat) {
    const key = `${shrine[1]}|${cat[1]}`;
    if (shrineSeen.has(key)) continue;
    shrineSeen.add(key);
    shrines.push({ id: `shrine:${slug(shrine[1])}:${slug(cat[1])}`, shrine: shrine[1], category: cat[1], lines: tidy(out.lines) });
    continue;
  }
  // Oils: a kept item + Oil of Luck, Greater Luck or Conjuration ("Already Upgraded").
  const oil = /^Oil of (Luck|Greater Luck|Conjuration)$/.exec(second || "");
  if (d.inputs.length === 2 && oil && out.name === first && out.lines.includes("Already Upgraded")) {
    const lines = tidy(out.lines.filter((l) => l !== "Already Upgraded"));
    const type = r.inputs[0].key;
    // Greater Luck adds the same as Luck (it also hands back an Oil of Luck): one option for both.
    const same = oils.find((o) => o.type === type && o.lines.join("|") === lines.join("|"));
    if (same) { if (!same.name.includes(oil[1])) same.name += ` or ${oil[1]}`; continue; }
    oils.push({ id: `oil:${slug(oil[1])}:${type}`, name: `Oil of ${oil[1]}`, type, on: first, order: oils.length, lines });
    continue;
  }
  // Corruption outcomes, revealed with an Oil of Craft (by the hidden number's band, op 16 on stat 498).
  if (d.inputs.length === 2 && second === "Oil of Craft" && out.lines.some((l) => /to Reveal\)?$/.test(l)) && r.op?.[0] === 16 && r.op[1] === 498) {
    const lines = tidy(out.lines.filter((l) => !/to Reveal\)?$/.test(l)));
    const type = r.inputs[0].key, band = r.op[2];
    const before = bandTypes.get(band) || [];
    const key = `${type}|${lines.join("|")}`;
    const c = corruptionByKey.get(key) || { id: `corruption:${type}:${slug(lines.join(" "))}`, type, on: first, lines, after: [] };
    c.after.push([...before]);
    corruptionByKey.set(key, c);
    bandTypes.set(band, [...before, type]);
    continue;
  }
  // Cycles into the Corrupted Wormhole.
  if (d.inputs.length === 2 && /^(Small|Medium|Large) Cycle/.test(second || "") && out.name === first) {
    const lines = tidy(out.lines);
    cycles.push({ id: `cycle:${slug(`${second.split(" (")[0]} ${lines.filter((l) => !/Required Level/.test(l)).join(" ")}`)}`, charm: r.inputs[0].key, name: second.split(" (")[0], lines });
  }
}
const corruptions = [...corruptionByKey.values()];
const ids = [...trophies, ...scrolls, ...shrines, ...cycles, ...oils, ...corruptions].map((x) => x.id);
const dup = ids.find((id, i) => ids.indexOf(id) !== i);
if (dup) throw new Error(`Two bonuses share the id ${dup}`);
writeFileSync(new URL("../src/data/item-bonuses.json", import.meta.url), JSON.stringify({ patch: data.patch, source: "cubemain.bin (via src/data/cube-main.json)", trophies, scrolls, shrines, cycles, oils, corruptions }, null, 1) + "\n");
console.log(`extract-item-bonuses: ${trophies.length} trophies, ${scrolls.length} scrolls of enchantment, ${shrines.length} shrine bonuses, ${cycles.length} cycles, ${oils.length} oils, ${corruptions.length} corruption outcomes`);
