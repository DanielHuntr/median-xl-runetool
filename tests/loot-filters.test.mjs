import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseFilterList, parseFilterPage } from "../lib/filters-site.mjs";
import { cleanFilter, importFilter, exportFilter, describeRule, codeNumber, newRule } from "../src/filters/lootFilter.js";

const FD = JSON.parse(await readFile(new URL("../src/data/filter-data.json", import.meta.url), "utf8"));

// Minimal pages in the Filter Exchange's layout (hand-written, not copies of the site).
const LIST = `<table id='table-filters'><thead><tr><th>Title</th></tr></thead><tbody>
<tr ><td><a href='?mode=view&id=7'>Test &amp; Filter</a></td><td>Generic</td><td><p>Line one<br />
Line two</p><ul><li>Shows runes</li></ul></td><td>3</td><td>someone</td><td>2026-01-02</td><td>1,234</td><td>56</td></tr>
</tbody></table>`;
const RULES = { default_show_items: false, name: "Test", rules: [
  { active: true, show_item: true, item_quality: 7, ethereal: 0, min_clvl: 0, max_clvl: 0, min_ilvl: 0, max_ilvl: 0, rule_type: 0, params: { class: 19 }, notify: true, automap: true },
  { active: true, show_item: true, item_quality: -1, ethereal: 0, min_clvl: 0, max_clvl: 50, min_ilvl: 0, max_ilvl: 0, rule_type: 1, params: { code: 540291698 }, notify: false, automap: false },
] };
const PAGE = `<script>copyToClipboard(Clipboard('${JSON.stringify(RULES, null, 2).replace(/\n/g, "\r\n").replace(/"/g, "&quot;")}'))</script>`;

test("Filter Exchange pages parse: the list (plain-text descriptions) and a filter's embedded JSON", () => {
  const [f] = parseFilterList(LIST);
  assert.deepEqual({ ...f, description: undefined }, { id: 7, name: "Test & Filter", cls: "Generic", description: undefined, rules: 3, author: "someone", updated: "2026-01-02", views: 1234, uses: 56 });
  assert.deepEqual(f.description, ["Line one", "Line two", "• Shows runes"]);
  assert.deepEqual(parseFilterPage(PAGE), RULES);
  assert.throws(() => parseFilterList("<p>nothing</p>"));
});

test("filter data comes from the game files: the 109 classes and item codes", () => {
  assert.equal(FD.classes.length, 109);
  assert.equal(FD.classes.find((c) => c.id === 19).name, "Tier Sacred");
  assert.equal(FD.classes.find((c) => c.id === 28).name, "Rune");
  // A filter stores an item code as its 4 characters, little-endian: "r24 " is Ist Rune.
  assert.equal(codeNumber("r24"), 540291698);
  assert.equal(FD.items.find((i) => i.code === 540291698).name, "Ist Rune");
  assert.ok(FD.items.every((i) => codeNumber(i.id) === i.code));
});

test("filters are cleaned on import and export in the Filter Exchange's shape", () => {
  const f = importFilter(JSON.stringify({ ...RULES, extra: 1, rules: [...RULES.rules, { item_quality: 99, min_clvl: 999, rule_type: 1, params: { code: "x" } }] }));
  assert.equal(f.rules.length, 3);
  // A broken rule becomes a plain rule (levels clamped to 150), not an error.
  assert.deepEqual(f.rules[2], { ...newRule(), min_clvl: 150 });
  assert.equal(f.default_show_items, false);
  assert.deepEqual(JSON.parse(exportFilter(f)).rules.slice(0, 2), RULES.rules);
  assert.deepEqual(Object.keys(JSON.parse(exportFilter(f))), ["default_show_items", "name", "rules"]);
  assert.throws(() => importFilter("not json"), /valid JSON/);
  assert.throws(() => importFilter("{}"), /no rules/);
  assert.equal(cleanFilter({ rules: new Array(900).fill({}) }).rules.length, 500);
  const words = (r) => describeRule(r, { className: (id) => FD.classes.find((c) => c.id === id).name, itemName: (c) => FD.items.find((i) => i.code === c).name });
  assert.equal(words(RULES.rules[0]), "SHOW Unique · type Tier Sacred · Notify · Map");
  assert.equal(words(RULES.rules[1]), "SHOW · Ist Rune · char level ≤ 50");
});

test("an exported filter reads like the game's own: keys in its order, plain-text name", async () => {
  const { exportFilter, newRule } = await import("../src/filters/lootFilter.js");
  // The order the game's exported filters (and the community editor) use.
  assert.deepEqual(Object.keys(newRule()), ["active", "automap", "ethereal", "item_quality", "max_clvl", "max_ilvl", "min_clvl", "min_ilvl", "notify", "params", "rule_type", "show_item"]);
  const game = { default_show_items: true, name: "Oroborius' Filter", rules: [{ active: true, automap: false, ethereal: 0, item_quality: -1, max_clvl: 50, max_ilvl: 0, min_clvl: 0, min_ilvl: 0, notify: false, params: { code: 540307560 }, rule_type: 1, show_item: true }] };
  assert.equal(exportFilter(game), JSON.stringify(game, null, 2), "a game filter comes back byte for byte");
  assert.equal(JSON.parse(exportFilter({ ...game, name: "Café ☕\nbuild" })).name, "Caf build", "no accents, emoji or line breaks in a name");
});
