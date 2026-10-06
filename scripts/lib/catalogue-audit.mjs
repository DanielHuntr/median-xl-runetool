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

// Lines from the base item, not the unique: damage, defense, requirements, sockets, a class
// weapon's on-hit effect, an elemental base's innate damage, a jewel's note, and the boots'
// random movement speed that the docs add to the item's own.
const BASE = /^(One-Hand|Two-Hand|Throw) Damage:|^Defense:|^Required |^Item Level|Damage Bonus:|^Socketed|^Attack Speed Modifier|^Quality Level|^(Chance to )?Block|^\(\w+ Only\)$|^Durability|^Kick Damage|^Smite Damage|^Set Bonus|^\(\d items?\)|^Innate .+ Damage:|^(Amazing Grace|Area Effect Attack|Thunderfury|Mega Impact|Can be Inserted into Socketed Items)$|^(\(\d+ to \d+\)|\d+)% Movement Speed$/i;
export const norm = (l) => l.trim().replace(/\s+/g, " ").replace(/ \(\w+ Only\)$/, "").toLowerCase();
// A line's wording with its numbers out, to pair a docs line with the game's.
export const wording = (l) => norm(l).replace(/\(-?[\d.]+ to -?[\d.]+\)|-?[\d.]+/g, "N");

/** Docs lines against game lines: { onlyDocs, onlyGame } with their original text. */
export function compare(docLines, gameLines) {
  // Lines that aren't text (a charm's choice of versions in MedianDB's data) aren't compared.
  const text = (l) => typeof l === "string" && l && !BASE.test(l);
  const doc = docLines.filter(text), left = gameLines.filter(text);
  const onlyDocs = [];
  for (const l of doc) {
    const i = left.findIndex((x) => norm(x) === norm(l));
    if (i >= 0) left.splice(i, 1); else onlyDocs.push(l);
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
export function auditCatalogue(dir) {
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

  const uniques = byName(g.X("uniqueitems.bin", 332), 2);
  for (const [name, , , tiers] of read("uniques.json")) {
    const rows = uniques.get(name) || [];
    tiers.forEach((t, i) => note("uniques", `${name} (tier ${i + 1})`, { name, tier: i }, rows[i] && compare(t.split("|"), g.rowText(rows[i], 0x8C, 12))));
  }
  for (const [name, , , stats] of read("sacred-uniques.json"))
    note("sacred", name, { name }, closest((uniques.get(name) || []).map((r) => compare(stats.split("|"), g.rowText(r, 0x8C, 12)))));

  const setItems = byName(g.X("setitems.bin", 440), 2);
  for (const [setName, , , , list] of read("sets.json"))
    for (const [item, , stats] of list)
      note("sets", `${item} (${setName})`, { name: item, set: setName },
        closest((setItems.get(item) || []).map((r) => compare(stats.split("|"), [...g.rowText(r, 0x88, 9), ...g.rowText(r, 0x118, 10)]))));

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
    const r = runewords.get(name);
    const at = WEAPONS.test(bases) ? 0x30 : /^.*Shields/.test(bases) ? 0x90 : 0x60;
    const runeRows = r ? [0, 1, 2, 3, 4, 5].map((k) => gemByItem.get(r.readInt32LE(0x98 + 4 * k))).filter(Boolean).map((rr) => [rr, at, 3]) : [];
    note("runewords", `${name} (${runeList})`, { name, runes: runeList }, r && compare(stats.split("|"), g.rowsText([[r, 0xB0, 12], ...runeRows])));
  }
  // The planner's relics and charms (MedianDB).
  const u = g.X("uniqueitems.bin", 332), rows = [];
  for (let i = 0; i < u.count; i++) { const r = u.record(i); rows.push({ r, name: nameOf(r, 2), code: r.toString("latin1", 0x28, 0x2c).replace(/\0.*$/, "").trim() }); }
  const lineCache = new Map(), linesOf = (x) => lineCache.get(x) ?? lineCache.set(x, g.rowText(x.r, 0x8C, 12)).get(x);
  const planner = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
  for (const c of Object.values(planner.inventory || {})) {
    const code = c.id.split("-")[0];
    const cands = c.kind === "relic" ? rows.filter((x) => x.name === "Relic") : rows.filter((x) => x.code === code || x.name === c.name);
    note("inventory", c.name, { name: c.name }, closest(cands.map((x) => compare(c.lines, linesOf(x)))));
  }
  return { patch: g.patch, tally, items };
}
