// The catalogue (copied from docs.median-xl.com) against the game's own tables: every item's stat
// lines as the game writes them (item-text.mjs) next to the docs', base lines aside.
//   tiered and sacred uniques  uniqueitems.bin, 12 properties from 0x8C (a tiered unique's
//                              tiers are its rows in table order)
//   set items                  setitems.bin, 9 from 0x88 and partial-set bonuses 10 from 0x118
//   runewords                  runes.bin, 12 from 0xB0, with their runes' socket bonuses added in
//                              (gems.bin: the rune's item index u32 0x28; weapon properties 0x30,
//                              helm and armour 0x60, shield 0x90), as the docs show them
//   relics and charms         the planner's (MedianDB) inventory against uniqueitems.bin: a charm
//                              by its item code, a relic among the uniques named "Relic"
// Several rows can share a name (a set amulet in several sets, an older version): the closest.
import { readFileSync } from "node:fs";
import { gameText } from "./item-text.mjs";
import { FIX, fixList } from "../../src/data/fixes.js";
import { parseLine } from "../../src/planner/statparse.js";

// Lines from the base item, not the unique: damage, defense, requirements, sockets, a class
// weapon's on-hit effect, an elemental base's innate damage, a jewel's note, and the boots'
// random movement speed that the docs add to the item's own.
const BASE = /^(One-Hand|Two-Hand|Throw) Damage:|^Defense:|^Required |^Item Level|Damage Bonus:|^Socketed|^Attack Speed Modifier|^Quality Level|^(Chance to )?Block|^\(\w+ Only\)$|^Durability|^Kick Damage|^Smite Damage|^Set Bonus|^\(\d items?\)|^Innate .+ Damage:|^(Amazing Grace|Area Effect Attack|Thunderfury|Mega Impact|Can be Inserted into Socketed Items)$|^(\(\d+ to \d+\)|\d+)% Movement Speed$|^\(Stackable\)$|^\(\d+\/\d+ chance to appear\)$|^\([\d.]+% of (Strength|Dexterity|Energy|Vitality)\)$/i;
// Notation aside: "(50-75)" is "(50 to 75)", "-(0 to 5)%" is "(-5 to 0)%", "+N to X (Class Only)" is "+N to X".
export const norm = (l) => l.trim().replace(/\s+/g, " ").replace(/ \(\w+ Only\)$/, "").toLowerCase()
  .replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, "($1 to $2)")
  .replace(/-\(0 to ([\d.]+)\)/g, "(-$1 to 0)")
  // An item rolling one element of several (Zann Esu's Stone): the docs' "[Random Elemental]".
  .replace(/maximum (fire|cold|lightning|poison) resist/g, "maximum [random elemental] resist");
// A line's wording with its numbers out, to pair a docs line with the game's.
export const wording = (l) => norm(l).replace(/\(-?[\d.]+ to -?[\d.]+\)|-?[\d.]+/g, "N");

// "Adds 7-9 Fire Damage", "Adds (9 to 11)-(13 to 14) Fire Damage", "+20 Cold Damage" → its ranges.
const ADDS = /^(?:Adds (\(-?\d+ to -?\d+\)|-?\d+)-(\(-?\d+ to -?\d+\)|-?\d+)|\+(\(-?\d+ to -?\d+\)|-?\d+)) (Fire|Cold|Lightning|Magic) Damage$/i;
const span = (t) => { const m = /\((-?\d+) to (-?\d+)\)/.exec(t); return m ? [+m[1], +m[2]] : [+t, +t]; };
const addsOf = (l) => { const m = ADDS.exec(l); if (!m) return null; const lo = span(m[1] ?? m[3]), hi = span(m[2] ?? m[3]); return { lo, hi, element: m[4].toLowerCase() }; };
const write = ([a, b]) => (a === b ? `${a}` : `(${a} to ${b})`);
/**
 * Docs lines against game lines: { onlyDocs, onlyGame } with their original text. The base
 * item's own lines (baseLines, its tier's) count as base: a docs line that is one, and an
 * elemental base's added damage, which the docs add to the item's own ("Adds 7-9 Fire Damage"
 * on Wasp Sting is its Maple Bow's).
 */
export function compare(docLines, gameLines, baseLines = []) {
  const baseNorm = new Set(baseLines.map(norm));
  // A base line the docs list on their own (Compass of Souls: its Hexblade's "Adds 5-6 Fire
  // Damage" beside its own "Adds 5-8") is base; one they don't is added into the item's line.
  const listed = new Set(docLines.filter((l) => typeof l === "string" && baseNorm.has(norm(l))).map(norm));
  // Each base line once: the base and the item can add the same (Compass of Souls, tier 3: its
  // Hexblade's "Adds 40-60 Fire Damage" and its own).
  const unused = baseLines.map(norm);
  docLines = docLines.filter((l) => { if (typeof l !== "string") return true; const i = unused.indexOf(norm(l)); if (i < 0) return true; unused.splice(i, 1); return false; });
  const baseAdds = baseLines.filter((l) => !listed.has(norm(l))).map(addsOf).filter(Boolean);
  // The item's minimum or maximum alone ("+(700 to 900) to Maximum Lightning Damage": Lacerator)
  // counts as an "Adds" line with nothing at the other end.
  const MINMAX = /^\+(\(-?\d+ to -?\d+\)|-?\d+) to (Minimum|Maximum) (Fire|Cold|Lightning|Magic) Damage$/i;
  gameLines = gameLines.map((l) => {
    let a = typeof l === "string" && addsOf(l);
    const mm = !a && typeof l === "string" && MINMAX.exec(l);
    if (mm) a = { lo: /min/i.test(mm[2]) ? span(mm[1]) : [0, 0], hi: /max/i.test(mm[2]) ? span(mm[1]) : [0, 0], element: mm[3].toLowerCase() };
    const b = a && baseAdds.find((x) => x.element === a.element);
    if (!b) return l;
    const lo = [a.lo[0] + b.lo[0], a.lo[1] + b.lo[1]], hi = [a.hi[0] + b.hi[0], a.hi[1] + b.hi[1]];
    return `Adds ${write(lo)}-${write(hi)} ${a.element[0].toUpperCase() + a.element.slice(1)} Damage`;
  });
  // Lines that aren't text (a charm's choice of versions in MedianDB's data) aren't compared.
  const text = (l) => typeof l === "string" && l && !BASE.test(l);
  // A game string can itself hold "|" (Elemental Trance's "Str: Fire | Dex: Cold | …"), which
  // is how the docs' text separates lines: split the same way.
  const doc = docLines.filter(text), left = gameLines.flatMap((l) => (typeof l === "string" ? l.split(" | ") : [])).filter(text);
  const onlyDocs = [];
  for (const l of doc) {
    const i = left.findIndex((x) => norm(x) === norm(l));
    if (i >= 0) left.splice(i, 1); else onlyDocs.push(l);
  }
  // The same text broken into lines differently ("While Dual Wielding This Weapon:" over the
  // line it qualifies; a relic's "Gain" / "Exodia" / "while Carrying All Summon Trio Relics"):
  // joined runs of lines on either side that read the same.
  const joined = (list) => norm(list.join(" "));
  for (const [from, into] of [[onlyDocs, left], [left, onlyDocs]])
    for (let i = 0; i < into.length; i++) {
      let hit = false;
      for (let n = 2; n <= Math.min(4, from.length) && !hit; n++)
        for (let a = 0; a + n <= from.length && !hit; a++)
          if (joined(from.slice(a, a + n)) === joined([into[i]])) { from.splice(a, n); into.splice(i, 1); i--; hit = true; }
    }
  return { onlyDocs, onlyGame: left };
}
const size = (c) => c.onlyDocs.length + c.onlyGame.length;
const closest = (list) => list.sort((a, b) => size(a) - size(b))[0] || null;

/**
 * @returns {{ patch, items: [{ kind, name, tier?, item, onlyDocs, onlyGame } | { kind, item, missing }] }}
 *   kind: uniques | sacred | sets | runewords; tier: a tiered unique's (0-based); only items
 *   that differ or aren't found are listed.
 */
export function auditCatalogue(dir, { applyFixes = false } = {}) {
  // With applyFixes, the docs' text as the site shows it: src/data/catalogue-fixes.json applied.
  const fix = (lines, pairs) => (applyFixes ? fixList(lines, pairs) : lines);
  const g = gameText(dir);
  const read = (f) => JSON.parse(readFileSync(new URL(`../../src/data/${f}`, import.meta.url), "utf8"));
  const nameOf = (r, o) => g.lines(g.byKey(g.cstr(r, o))).join(": ");
  const byName = (t, at) => { const m = new Map(); for (let i = 0; i < t.count; i++) { const r = t.record(i), n = nameOf(r, at); if (n) (m.get(n) ?? m.set(n, []).get(n)).push(r); } return m; };
  const items = [], tally = {};
  const note = (kind, item, extra, c) => {
    const t = (tally[kind] ||= { items: 0, same: 0, differ: 0, missing: 0 });
    t.items++;
    if (!c) { t.missing++; items.push({ kind, item, ...extra, missing: true }); return; }
    if (!size(c)) { t.same++; return; }
    t.differ++;
    items.push({ kind, item, ...extra, ...c });
  };

  // A base item's lines at a tier (base-items.json, the docs' base list), for the base lines above.
  const baseTiers = new Map(read("base-items.json").map(([name, , tiers]) => [name, tiers.map(([, stats]) => stats.split("|"))]));
  const baseAt = (name, tier = -1) => { const t = baseTiers.get(name) || []; return t.at(tier) || []; };
  const uniques = byName(g.X("uniqueitems.bin", 332), 2);
  for (const [name, base, , tiers] of read("uniques.json")) {
    const rows = uniques.get(name) || [];
    tiers.forEach((t, i) => note("uniques", `${name} (tier ${i + 1})`, { name, tier: i }, rows[i] && compare(fix(t.split("|"), FIX.uniques[name]?.[i]), g.rowText(rows[i], 0x8C, 12, { itemName: name }), baseAt(base, i))));
  }
  for (const [name, base, , stats] of read("sacred-uniques.json"))
    note("sacred", name, { name }, closest((uniques.get(name) || []).map((r) => compare(fix(stats.split("|"), FIX.sacred[name]), g.rowText(r, 0x8C, 12, { itemName: name }), baseAt(base)))));

  const setItems = byName(g.X("setitems.bin", 440), 2);
  for (const [setName, , , , list] of read("sets.json"))
    for (const [item, base, stats] of list)
      note("sets", `${item} (${setName})`, { name: item, set: setName },
        closest((setItems.get(item) || []).map((r) => compare(fix(stats.split("|"), FIX.sets[`${item}|${setName}`]), [...g.rowText(r, 0x88, 9, { itemName: item }), ...g.rowText(r, 0x118, 10)], baseAt(base)))));

  const runes = g.X("runes.bin"), runewords = new Map();
  for (let i = 0; i < runes.count; i++) {
    const r = runes.record(i);
    if (!r[0x80]) continue;
    const n = g.text(g.byKey(r.toString("latin1", 0, 64).replace(/\0.*$/, "")));
    if (n) runewords.set(n, r);
  }
  const gems = g.X("gems.bin", 192), gemByItem = new Map();
  for (let i = 0; i < gems.count; i++) gemByItem.set(gems.record(i).readUInt32LE(0x28), gems.record(i));
  const WEAPONS = /^(Weapons|.*(Swords|Axes|Maces|Hammers|Spears|Bows|Staves|Daggers|Claws|Javelins|Scepters|Wands|Orbs|Scythes|Knives|Crossbows|Naginatas))/;
  const seen = new Set();
  for (const [name, , runeList, bases, , stats] of read("runewords.json")) {
    const key = `${name}|${runeList}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A game name can run on ("Victory (Median XL - 6 years)" is the docs' Victory).
    const r = runewords.get(name) ?? [...runewords].find(([n]) => n.startsWith(`${name} `))?.[1];
    const at = WEAPONS.test(bases) ? 0x30 : /^.*Shields/.test(bases) ? 0x90 : 0x60;
    const runeRows = r ? [0, 1, 2, 3, 4, 5].map((k) => gemByItem.get(r.readInt32LE(0x98 + 4 * k))).filter(Boolean).map((rr) => [rr, at, 3]) : [];
    // The docs add each rune's bonus in, list it as a line of its own, or leave it out, and not
    // the same way for every rune (Voodoo Branch: its Stone rune listed, its others added in):
    // every way for each rune (3^runes readings), the closest.
    const readings = [];
    if (r) for (let code = 0; code < 3 ** runeRows.length; code++) {
      const summed = [], apart = [];
      runeRows.forEach((row, k) => { const how = Math.floor(code / 3 ** k) % 3; if (how === 0) summed.push(row); else if (how === 1) apart.push(row); });
      readings.push(compare(fix(stats.split("|"), FIX.runewords[`${name}|${runeList}`]), [...g.rowsText([[r, 0xB0, 12], ...summed], { itemName: name }), ...apart.flatMap(([rr, ra, rn]) => g.rowText(rr, ra, rn))]));
    }
    note("runewords", `${name} (${runeList})`, { name, runes: runeList }, r && closest(readings));
  }
  // The planner's relics and charms (MedianDB).
  const u = g.X("uniqueitems.bin", 332), rows = [];
  for (let i = 0; i < u.count; i++) { const r = u.record(i); rows.push({ r, name: nameOf(r, 2), code: r.toString("latin1", 0x28, 0x2c).replace(/\0.*$/, "").trim() }); }
  const lineCache = new Map(), linesOf = (x) => lineCache.get(x) ?? lineCache.set(x, g.rowText(x.r, 0x8C, 12, { itemName: x.name })).get(x);
  const planner = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
  const skillByName = new Map(Object.entries(planner.skillNames).map(([id, n]) => [n.toLowerCase(), id]));
  for (const c of Object.values(planner.inventory || {})) {
    const code = c.id.split("-")[0];
    const cands = c.kind === "relic" ? rows.filter((x) => x.name === "Relic") : rows.filter((x) => x.code === code || x.name === c.name);
    // Only stat lines count: how to get or use a charm ("Transmute with a Thal rune…", "Add Cycles
    // to apply specific bonuses") is text, not a stat, on either side. A charm the game says is
    // rolled in the cube ("Cube with Essence/Runestone to Roll Stat") has MedianDB's range of what
    // cubing gives it: Umbaru Treasure, 16 Essences at (-3 to 5) each (cube recipe 37), (-48 to 80).
    const stats = (lines) => lines.filter((l) => typeof l === "string" && ["stats", "skill", "oskill", "proc"].includes(parseLine(l.replace(/\((-?[\d.]+) to (-?[\d.]+)\)/g, "$2"), { level: 120, skillByName }).kind));
    const rolled = c.lines.includes("Cube with Essence/Runestone to Roll Stat");
    const own = stats(fix(c.lines, FIX.inventory?.[c.id])).filter((l) => !(rolled && /^\+\(-?\d+ to \d+\) to (Strength|Dexterity|Vitality|Energy)$/.test(l)));
    note("inventory", c.name, { name: c.name }, closest(cands.map((x) => compare(own, stats(linesOf(x))))));
  }
  return { patch: g.patch, tally, items };
}
