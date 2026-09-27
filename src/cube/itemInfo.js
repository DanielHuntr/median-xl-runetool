// What an item's tooltip shows, from the catalogue data the other pages use: a base's own
// lines (damage, defense, requirements) for its tier, a tiered unique's lines at that tier, a
// sacred unique's or set item's lines. Split like the game's tooltip: the base lines first,
// then the magic lines.
import TIERED from "../data/uniques.json" with { type: "json" };
import SACRED from "../data/sacred-uniques.json" with { type: "json" };
import SETS from "../data/sets.json" with { type: "json" };
import BASES from "../data/base-items.json" with { type: "json" };

const tiered = new Map(TIERED.map(([name, base, , tiers]) => [name, { base, tiers }]));
const sacred = new Map(SACRED.map(([name, base, , text]) => [name, { base, text }]));
const setItems = new Map();
for (const [setName, , , , items] of SETS) for (const [name, base, text] of items) setItems.set(name, { base, text, set: setName });
const bases = new Map(BASES.map(([name, , tiers]) => [name, new Map(tiers)]));

// "Bastard Sword (2)" → base "Bastard Sword", tier "Tier 2" (index 1); "(Sacred)" → Sacred.
function tierOf(name) {
  const m = /^(.*) \((\d|Sacred)\)$/.exec(name || "");
  if (!m) return { base: name, label: null, index: -1 };
  return { base: m[1], label: m[2] === "Sacred" ? "Sacred" : `Tier ${m[2]}`, index: m[2] === "Sacred" ? 4 : +m[2] - 1 };
}
// The lines every item of a base has (the game writes them in white, the rest in blue).
const BASE_LINE = /^(One-Hand|Two-Hand|Throw|Defense|Required|Item Level|Quality Level|Attack Speed Modifier|Strength Damage|Dexterity Damage|Chance to Block|Durability|Speed|Kick Damage|Smite Damage|Missile|Max Stack|Quantity)/;
const split = (text) => {
  const lines = (text || "").split("|").map((l) => l.trim()).filter(Boolean);
  return { base: lines.filter((l) => BASE_LINE.test(l)), mods: lines.filter((l) => !BASE_LINE.test(l)) };
};

// A base's own lines from the game's item tables, when the docs don't have that base
// (scripts/extract-cube.mjs baseStats).
function gameBaseLines(cube, code) {
  const b = cube.data.baseStats?.[code];
  if (!b) return [];
  const [o1, o2, t1, t2, h1, h2, d1, d2, str, dex, lvl] = b;
  const range = (a, z) => (a === z ? `${a}` : `${a} to ${z}`);
  return [
    o2 ? `One-Hand Damage: ${range(o1, o2)}` : null,
    t2 ? `Two-Hand Damage: ${range(t1, t2)}` : null,
    h2 ? `Throw Damage: ${range(h1, h2)}` : null,
    d2 ? `Defense: ${range(d1, d2)}` : null,
    lvl > 1 ? `Required Level: ${lvl}` : null,
    str ? `Required Strength: ${str}` : null,
    dex > 1 ? `Required Dexterity: ${dex}` : null,
  ].filter(Boolean);
}

// cube: the engine (names); it: a cube item.
export function itemInfo(cube, it) {
  const baseName = cube.items.get(it.code)?.name || it.name;
  const { base, label, index } = tierOf(baseName);
  const special = it.special ? cube.itemName(it) : null;
  let from = null;
  if (special && it.quality === 7) {
    const t = tiered.get(special);
    if (t) from = t.tiers[Math.min(Math.max(index, 0), t.tiers.length - 1)];
    else if (sacred.has(special)) from = sacred.get(special).text;
  } else if (special && it.quality === 5 && setItems.has(special)) from = setItems.get(special).text;
  const docs = bases.get(base)?.get(label);
  const own = from ? split(from) : docs ? split(docs) : { base: gameBaseLines(cube, it.code), mods: [] };
  return {
    base: own.base,
    // The catalogue's magic lines for a named unique or set item; recipe-added lines follow.
    mods: from ? own.mods : own.mods.filter((l) => /^Socketed/.test(l) === false),
    set: special && it.quality === 5 ? setItems.get(special)?.set || null : null,
    tier: label,
  };
}
