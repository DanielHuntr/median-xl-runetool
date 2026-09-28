// Every Horadric Cube recipe, as the game has them: src/data/cube-main.json.
//
//   node scripts/extract-cube.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Sources (medianxl-YmludGJsdHh0.mpq, D2 1.13c layouts; offsets from D2MOO, checked against
// recipes with known results: two Nef Runes make an Eth Rune, Hand Axe (1) + Arcane Crystal
// makes Hand Axe (2), Wirt's Leg on Hell opens the Moo Moo Farm):
//   cubemain.bin (328-byte rows): enabled 0x00, minimum difficulty 0x02, class 0x03 (255 any),
//     condition op 0x04 / stat 0x08 / value 0x0C, number of input items 0x10, then 7 inputs of
//     8 bytes from 0x14 (flags u16, item or item type u16, unique/set id u16 (1-based),
//     quality u8, quantity u8) and 3 outputs of 84 bytes from 0x4C (flags u16, item u16,
//     unique/set id u16, quality u8, quantity u8, type u8 at 0x08, level 0x09, item level 0x0B,
//     then 5 properties of 12 bytes from 0x18: property i32, parameter i16, min i16, max i16).
//     Input flags: 1 an item, 2 an item type, 4 no sockets, 8 socketed, 0x10 ethereal,
//     0x20 not ethereal, 0x40 that unique or set item. Output types: 0xFC that item, 0xFD an
//     item of that type, 0xFE the first input changed, 0xFF a new item of the first input's
//     base; 1 a portal to a level. Output flag 1 keeps the first input's properties, 8 makes
//     that unique or set item.
//   itemtypes.bin (228): code 0x00, parent types 0x04 and 0x06.
//   weapons.bin / armor.bin / misc.bin (424): code 0x80, name string 0xF4, item types 0x11E (×2),
//     most sockets 0x138 (matches the docs' "Socketed (n)" for all 1,090 tiered bases); base
//     stats, located by matching the docs' base items (all rows agree): one-hand damage 0xFE/0xFF,
//     throw 0x100/0x101, two-hand 0x102/0x103 (bytes), defense 0xCC/0xD0, required strength
//     0x10A, dexterity 0x10C and level 0x13F.
//   uniqueitems.bin (332) / setitems.bin (440): name key 0x02, item code 0x28; unique items
//     also rarity 0x30 and level 0x34 (D2 1.13c D2UniqueItemsTxt), for what a recipe making
//     "a unique" of a base can roll (a Hand Axe (1) can only be Brainhack; Akara's Robe, rarity
//     0 and level 255, never rolls).
//   properties.bin (46): per slot k of 7, value 0x0A+2k (the class of a class-skills
//     property), function 0x18+k and stat 0x20+2k.
//   itemstatcost.bin (324): description function 0x36, value position 0x37, strings 0x38
//     (positive), 0x3A (negative), 0x3C (second).
//   skills.bin 0x194 → skilldesc.bin name 0x08; monstats.bin name 0x06; levels.bin name 0xF5.
//   inventory.bin (240): row 9 is the cube ("Transmogrify Box"): grid width 0x10, height 0x11
//     (15 × 10 in 2.14.4; its pixel bounds 0x14-0x20 over 29-pixel cells agree).
// Item art: the graphic names scripts/extract-item-art.mjs renders (weapons/armor/misc invfile
// 0x20, unique 0x40, set 0x60, colour map 0x142; uniqueitems.bin invfile 0x5A and colour 0x39;
// setitems.bin 0x62 and 0x41), kept when the sprite sheets (src/data/item-atlas.json) have them.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMpq } from "./lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "./lib/d2tables.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
const X = (n, size) => {
  const t = readBin(mpq.read(`data/global/excel/${n}`));
  if (size && t.size !== size) throw new Error(`${n} records are ${t.size} bytes, expected ${size} (D2 1.13c)`);
  return t;
};
const tbls = ["string.tbl", "patchstring.tbl", "expansionstring.tbl"].map((n) => readTbl(mpq.read(`data/local/lng/eng/${n}`)));
const str = stringIndex({ base: tbls[0], patch: tbls[1], expansion: tbls[2] });
const byKey = (k) => { for (const t of [...tbls].reverse()) if (t.byKey.has(k)) return t.byKey.get(k); return null; };
const NO_STRING = 5382; // "FLYING POLAR BUFFALO ERROR"
// Colour codes out; D2 writes multi-line text bottom line first.
const lines = (s) => (s ?? "").replace(/(?:ÿ|Ã¿)c./g, "").split("\n").map((l) => l.trim()).filter(Boolean).reverse();
const text = (s) => lines(s).join(" ");
const strText = (i) => (i && i !== NO_STRING ? text(str(i)) : "");
const cstr = (r, o) => r.toString("latin1", o, r.indexOf(0, o));

const cube = X("cubemain.bin", 328), types = X("itemtypes.bin", 228), props = X("properties.bin", 46), isc = X("itemstatcost.bin", 324);
const uniques = X("uniqueitems.bin", 332), setItems = X("setitems.bin", 440), levels = X("levels.bin");
const skills = X("skills.bin"), skilldesc = X("skilldesc.bin"), monstats = X("monstats.bin", 424);

// Item types and what each inherits from.
const typeCode = (i) => types.record(i).toString("latin1", 0, 4).replace(/\0.*$/, "").trim();
const parents = (i) => [types.record(i).readInt16LE(4), types.record(i).readInt16LE(6)].filter((p) => p > 0 && p < types.count);
const lineage = (i, out = new Set([i])) => { for (const p of parents(i)) if (!out.has(p)) { out.add(p); lineage(p, out); } return out; };

// Graphic names as the art extractor writes them.
const atlas = JSON.parse(readFileSync(new URL("../src/data/item-atlas.json", import.meta.url), "utf8")).art;
const MAP_FILES = [null, "grey", "grey2", "gold", "brown", "greybrown", "invgrey", "invgrey2", "invgreybrown"];
const artName = (file, trans = 0, colour = 255) => {
  if (!file) return null;
  const stem = file.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const key = colour === 255 || !MAP_FILES[trans] ? stem : `${stem}-${trans}-${colour}`;
  return atlas[key] ? key : atlas[stem] ? stem : null;
};
const inv = new Map(); // code → [invfile, unique invfile, set invfile, colour map]
const maxSockets = {}; // code → the most sockets the base can have
// code → [one-hand min, max, two-hand min, max, throw min, max, defense min, max, str, dex, level]
const baseStats = {};

// Every item: code, name, the types it belongs to (with their parents), and which file.
const items = [], itemIndex = [];
for (const [file, group] of [["weapons.bin", "weapon"], ["armor.bin", "armor"], ["misc.bin", "misc"]]) {
  const t = X(file, 424);
  for (let i = 0; i < t.count; i++) {
    const r = t.record(i), code = r.toString("latin1", 0x80, 0x84).replace(/\0.*$/, "").trimEnd();
    // Multi-line names: the first line is the name, the rest a subtitle ("Cube Reagent").
    const [name = "", ...sub] = lines(str(r.readUInt16LE(0xf4)));
    const ts = new Set();
    for (const k of [0, 1]) { const v = r.readInt16LE(0x11e + k * 2); if (v > 0 && v < types.count) for (const a of lineage(v)) ts.add(a); }
    itemIndex.push(code);
    if (!inv.has(code)) inv.set(code, [cstr(r, 0x20), cstr(r, 0x40), cstr(r, 0x60), r[0x142]]);
    if (r[0x138] && !maxSockets[code]) maxSockets[code] = r[0x138];
    if (group !== "misc" && !baseStats[code])
      baseStats[code] = [r[0xfe], r[0xff], r[0x102], r[0x103], r[0x100], r[0x101], r.readInt32LE(0xcc), r.readInt32LE(0xd0), r.readUInt16LE(0x10a), r.readUInt16LE(0x10c), r[0x13f]];
    items.push({ code, name, sub: sub.join(" "), types: [...ts], group });
  }
}

// Readable names for the item types recipes use. The game has no names for them (the .txt
// column isn't compiled), so the common ones are named here after their members and the
// shrine texts ("1H Weapon/Shield or Small Armor"); the rest are named from their members.
const TYPE_NAMES = {
  ssgl: "Sacred item", ct1x: "Sacred one-handed weapon, shield or small armor", ct2x: "Sacred two-handed weapon or body armor",
  ct1w: "Sacred one-handed weapon", ct2w: "Sacred two-handed weapon", ct1a: "Sacred shield or small armor", ct2a: "Sacred body armor",
  flsh: "Full shrine (10 charges)", prsh: "Shrine", weap: "Weapon", armo: "Armor", ring: "Ring", amul: "Amulet", erun: "Enchanted rune",
  swea: "Sacred weapon", sarm: "Sacred armor", awea: "Angelic weapon", aarm: "Angelic armor", aaaa: "Angelic item", jewl: "Jewel",
  misl: "Quiver", boot: "Boots", helm: "Helm", tors: "Body armor", glov: "Gloves", belt: "Belt", shie: "Shield", tier: "Tiered item",
  miss: "Missile weapon", gem4: "Perfect gem", esse: "Essence", embl: "Emblem", "asa#": "Mystic orb", dcht: "Any item",
  // Diablo II's own types (their names are in the uncompiled itemtypes.txt).
  bowq: "Arrow quiver", xboq: "Bolt quiver", scep: "Scepter", staf: "Staff", hamm: "Hammer", knif: "Dagger", spea: "Spear", mace: "Mace",
  tkni: "Throwing knife", jave: "Javelin", h2h: "Claw", phlm: "Barbarian helm", bhlm: "Bone helm or mask", axe: "Axe", swor: "Sword",
  pole: "Polearm", xbow: "Crossbow", bow: "Bow", wand: "Wand", club: "Club", orb: "Sorceress orb", head: "Voodoo head", pelt: "Druid pelt",
  ashd: "Paladin shield", shld: "Shield", circ: "Circlet", char: "Charm", gem: "Gem", rune: "Rune", poti: "Potion", ques: "Quest item",
  // Median XL's crafting groups of normal bases.
  qshi: "Shield", qtor: "Body armor", qglv: "Gloves", qstf: "Staff", qbow: "Bow", qxbw: "Crossbow", qhlm: "Helm", qcic: "Circlet",
  qh2h: "Claw", qaur: "Paladin shield", qphm: "Barbarian helm", qplt: "Druid pelt", "sw&a": "Tiered weapon or armor", cyc3: "Large or Golden Cycle",
};
const members = new Map();
for (const it of items) for (const t of it.types) (members.get(t) ?? members.set(t, []).get(t)).push(it.name);
function typeName(i) {
  const code = typeCode(i);
  if (TYPE_NAMES[code]) return TYPE_NAMES[code];
  const names = [...new Set((members.get(i) || []).map((n) => n.replace(/\s*\((?:\d+|Sacred|Angelic)\)$/, "")))];
  if (!names.length) return code;
  return names.length <= 3 ? names.join(" or ") : `${names.slice(0, 2).join(", ")} or ${names.length - 2} other bases`;
}

// Recipes.
const recipes = [], usedTypes = new Set(), usedItems = new Set(), usedUniques = new Set(), usedSets = new Set(), usedProps = new Set(), usedLevels = new Set();
const OUT_SPECIFIC = 8;
for (let row = 0; row < cube.count; row++) {
  const r = cube.record(row);
  if (!r[0]) continue;
  const inputs = [];
  for (let k = 0; k < 7; k++) {
    const o = 0x14 + k * 8, flags = r.readUInt16LE(o), ref = r.readUInt16LE(o + 2);
    if (!flags && !ref) continue;
    const id = r.readUInt16LE(o + 4), quality = r[o + 6], qty = r[o + 7] || 1;
    let key;
    if (flags & 2) { key = typeCode(ref); usedTypes.add(ref); }
    else { key = itemIndex[ref]; usedItems.add(ref); }
    if (flags & 0x40) (quality === 5 ? usedSets : usedUniques).add(id);
    inputs.push([flags, key, id, quality, qty]);
  }
  const outputs = [];
  for (let k = 0; k < 3; k++) {
    const o = 0x4c + k * 84, type = r[o + 8], flags = r.readUInt16LE(o), ref = r.readUInt16LE(o + 2);
    if (!type) continue;
    const id = r.readUInt16LE(o + 4), quality = r[o + 6], qty = r[o + 7], lvl = r[o + 9], ilvl = r[o + 11];
    let key = ref;
    if (type === 0xfc) { key = itemIndex[ref]; usedItems.add(ref); }
    else if (type === 0xfd) { key = typeCode(ref); usedTypes.add(ref); }
    else if (type === 1) usedLevels.add(quality);
    if (flags & OUT_SPECIFIC) (quality === 5 ? usedSets : usedUniques).add(id);
    const mods = [];
    for (let m = 0; m < 5; m++) {
      const mo = o + 0x18 + m * 12, prop = r.readInt32LE(mo);
      if (prop < 0) continue;
      usedProps.add(prop);
      mods.push([prop, r.readInt16LE(mo + 4), r.readInt16LE(mo + 6), r.readInt16LE(mo + 8)]);
    }
    outputs.push([type, flags, key, id, quality, qty, lvl, ilvl, mods]);
  }
  // The condition (stat compared on the first input, or on the character).
  const op = r[4] ? [r[4], r.readInt32LE(8), r.readInt32LE(12)] : 0;
  recipes.push([row, r[2], r[3], op, r[0x10], inputs, outputs]);
}

// Properties → the stats they set, and how the game writes each stat.
const propOut = {}, usedStats = new Set(), usedSkills = new Set(), usedMonsters = new Set(), usedStrings = new Set();
for (const p of usedProps) {
  const r = props.record(p), parts = [];
  for (let k = 0; k < 7; k++) {
    const func = r[0x18 + k], stat = r.readInt16LE(0x20 + k * 2);
    if (!func) continue;
    parts.push([func, stat, r.readInt16LE(0x0a + k * 2)]);
    if (stat >= 0) usedStats.add(stat);
  }
  propOut[p] = parts;
}
// Stats the conditions read on the first ingredient (ops 15-18) need their text too.
for (const [, , , op] of recipes) if (op && op[0] >= 15 && op[0] <= 18) usedStats.add(op[1]);
const statOut = {};
for (const s of usedStats) {
  const r = isc.record(s);
  statOut[s] = [r[0x36], r[0x37], strText(r.readUInt16LE(0x38)), strText(r.readUInt16LE(0x3a)), strText(r.readUInt16LE(0x3c))];
}
// Parameters that name something: skills (functions 15, 24, 27, 28), monsters (22, 23) and
// whole strings (Median XL's function 31, e.g. a shrine vessel's "Shrine stats:" block).
for (const [, , , , , , outputs] of recipes)
  for (const o of outputs)
    for (const [prop, param] of o[8])
      for (const [, stat] of propOut[prop]) {
        const f = statOut[stat]?.[0];
        if ([15, 24, 27, 28].includes(f)) usedSkills.add(param);
        else if (f === 22 || f === 23) usedMonsters.add(param);
        else if (f === 31) usedStrings.add(param);
      }
// Hidden stats (no text in game) that conditions read, sorted by what they are:
//  - rolls: a recipe stores a random number on the item (a Treasure of Fiacla gets 1-10000
//    when it's made) and later recipes pick an outcome by thresholds on it;
//  - picks: never set by a recipe; the game rolls them as it transmutes (Oil of Lesser
//    Alchemy's ten bonuses test 1 to 10), so each value is one random outcome;
//  - counters: recipes add to them step by step (an Item Design's ingredients).
const setBy = new Map();
for (const [, , , , , , outputs] of recipes)
  for (const o of outputs)
    for (const [prop, , min, max] of o[8])
      for (const [, stat] of propOut[prop] || []) (setBy.get(stat) ?? setBy.set(stat, []).get(stat)).push([min, max]);
const hidden = { rolls: {}, picks: {}, counters: [] };
for (const [, , , op] of recipes) {
  if (!op || op[0] < 15 || op[0] > 18) continue;
  const [, stat, value] = op;
  if (statOut[stat]?.[2]) continue;
  const sets = setBy.get(stat);
  if (sets?.some(([min, max]) => min < max && max >= 100)) hidden.rolls[stat] = Math.max(hidden.rolls[stat] || 0, ...sets.map(([, max]) => max));
  else if (!sets) hidden.picks[stat] = Math.max(hidden.picks[stat] || 0, value);
  else if (!hidden.counters.includes(stat)) hidden.counters.push(stat);
}
const skillName = (id) => {
  if (id < 0 || id >= skills.count) return null;
  const d = skills.record(id).readInt16LE(0x194);
  return d >= 0 ? text(str(skilldesc.record(d).readUInt16LE(0x08))) || null : null;
};
// Several items share a name ("Amulet" is the usual amulet and the bases of a few uniques):
// the unique and set items made on each, to tell them apart.
const nameCount = new Map();
for (const it of items) if (it.name) nameCount.set(it.name, (nameCount.get(it.name) || 0) + 1);
const shared = new Set(items.filter((it) => nameCount.get(it.name) > 1).map((it) => it.code));
const madeOn = {};
for (const t of [uniques, setItems])
  for (let i = 0; i < t.count; i++) {
    const r = t.record(i), code = r.toString("latin1", 0x28, 0x2c).replace(/ .*$/, "").trimEnd();
    if (!shared.has(code)) continue;
    const [name] = lines(byKey(cstr(r, 2)));
    if (name && !(madeOn[code] ||= []).includes(name)) madeOn[code].push(name);
  }
// Art: per item code, and per unique ("7:id") and set item ("5:id") that recipes name.
// Every unique by the base it's made on: [id (1-based), rarity, level].
const uniquesByBase = {};
for (let i = 0; i < uniques.count; i++) {
  const r = uniques.record(i), code = r.toString("latin1", 0x28, 0x2c).replace(/\0.*$/, "").trimEnd();
  if (!code || !lines(byKey(cstr(r, 2))).length) continue;
  (uniquesByBase[code] ||= []).push([i + 1, r.readUInt32LE(0x30), r.readUInt16LE(0x34)]);
  usedUniques.add(i + 1);
}
const art = {};
for (const it of items) { const a = artName(inv.get(it.code)?.[0]); if (a) art[it.code] = a; }
for (const [ids, t, quality, fileAt, colourAt, baseSlot] of [[usedUniques, uniques, 7, 0x5a, 0x39, 1], [usedSets, setItems, 5, 0x62, 0x41, 2]])
  for (const id of ids) {
    if (!(id > 0 && id <= t.count)) continue;
    const r = t.record(id - 1), base = inv.get(r.toString("latin1", 0x28, 0x2c).replace(/\0.*$/, "").trimEnd());
    if (!base) continue;
    const a = artName(cstr(r, fileAt) || base[baseSlot] || base[0], base[3], r[colourAt]);
    if (a) art[`${quality}:${id}`] = a;
  }
const cubeRow = X("inventory.bin").record(9);
const grid = [cubeRow[0x10], cubeRow[0x11]];
const pick = (ids, fn) => Object.fromEntries([...ids].map((i) => [i, fn(i)]).filter(([, v]) => v));
const out = {
  patch,
  source: "cubemain.bin and the item, property and stat tables (medianxl-YmludGJsdHh0.mpq); see scripts/extract-cube.mjs",
  types: Object.fromEntries([...types.count ? Array(types.count).keys() : []].filter((i) => i > 0 && typeCode(i)).map((i) => [typeCode(i), typeName(i)])),
  items: items.filter((it) => it.name && it.code).map((it) => [it.code, it.name, it.types.map(typeCode), it.group, ...(it.sub ? [it.sub] : [])]),
  uniques: pick(usedUniques, (id) => (id > 0 && id <= uniques.count ? [lines(byKey(cstr(uniques.record(id - 1), 2))).join(": "), uniques.record(id - 1).toString("latin1", 0x28, 0x2c).replace(/\0.*$/, "").trimEnd()] : null)),
  sets: pick(usedSets, (id) => (id > 0 && id <= setItems.count ? [text(byKey(cstr(setItems.record(id - 1), 2))), setItems.record(id - 1).toString("latin1", 0x28, 0x2c).replace(/\0.*$/, "").trimEnd()] : null)),
  levels: pick(usedLevels, (id) => (id < levels.count ? cstr(levels.record(id), 0xf5) : null)),
  props: propOut,
  stats: statOut,
  skills: pick(usedSkills, skillName),
  monsters: pick(usedMonsters, (id) => (id >= 0 && id < monstats.count ? text(str(monstats.record(id).readUInt16LE(6))) : null)),
  strings: pick(usedStrings, (id) => lines(str(id))),
  hidden,
  madeOn,
  grid,
  art,
  maxSockets,
  uniquesByBase,
  baseStats,
  recipes,
};
const file = fileURLToPath(new URL("../src/data/cube-main.json", import.meta.url));
writeFileSync(file, JSON.stringify(out));

// A small index for the other pages ("Made in the Horadric Cube" on uniques, gems and runes):
// src/data/cube-made.json. A unique is made by a recipe that names it, or by rerolling its
// tiered base as a unique (Tiered item + 2 Arcane Crystals + Oil of Enhancement); an item by
// a recipe whose result it is (not one that hands it back), or by chance: a recipe that makes
// a random unique of its base (Amulet or Ring + 2 Arcane Crystals + Oil of Enhancement), for each
// of that base's uniques that can drop (rarity above 0). Unique names are only counted
// for the recipes that create them, not ones that reroll a unique already put in.
const typeOfCode = new Map(items.map((it) => [it.code, new Set(it.types.map(typeCode))]));
const nameOf = new Map(items.map((it) => [it.code, it.name]));
const made = { uniques: {}, items: {} };
for (const [, , , , , inputs, outputs] of recipes) {
  const inKeys = new Set(inputs.map((i) => i[1]));
  for (const [type, flags, key, id, quality] of outputs) {
    // (Not a recipe that takes the unique itself and gives it back rerolled.)
    if (type === 0xfc && flags & OUT_SPECIFIC && quality === 7) {
      const n = out.uniques[id]?.[0];
      if (inputs.some(([f, , inId, q]) => f & 0x40 && q === 7 && out.uniques[inId]?.[0] === n)) continue;
      if (n) made.uniques[n] = "recipe";
    } else if (type === 0xfc && !(flags & OUT_SPECIFIC) && quality === 7 && uniquesByBase[key]
      // Not a recipe that uses up a named unique (the Seven Deadly Sins sigil takes Ring of Pride).
      && !inputs.some(([f, , , q]) => f & 0x40 && q === 7)) {
      // A base with one unique that can drop makes that one (a tier upgrade); several: one by chance.
      const droppable = uniquesByBase[key].filter(([, rarity]) => rarity > 0);
      for (const [uid] of droppable) { const n = out.uniques[uid]?.[0]; if (n && !made.uniques[n]) made.uniques[n] = droppable.length > 1 ? "chance" : "recipe"; }
    } else if (type === 0xfc && !(flags & OUT_SPECIFIC) && !inKeys.has(key) && nameOf.get(key)) made.items[nameOf.get(key)] = 1;
    else if (type === 0xff && quality === 7 && inputs[0]?.[0] & 2 && inputs[0][1] === "tier")
      for (const [code, list] of Object.entries(uniquesByBase))
        if (typeOfCode.get(code)?.has("tier")) for (const [uid, rarity] of list) { const n = out.uniques[uid]?.[0]; if (n && rarity > 0 && !made.uniques[n]) made.uniques[n] = "reroll"; }
  }
}
writeFileSync(fileURLToPath(new URL("../src/data/cube-made.json", import.meta.url)), JSON.stringify({ patch, ...made }));
console.log(`extract-cube: Median XL ${patch}: ${recipes.length} recipes, ${out.items.length} items, ${Object.keys(out.props).length} properties, ${Object.keys(out.stats).length} stats`);
