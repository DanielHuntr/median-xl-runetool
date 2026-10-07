// Median XL loot filters: the JSON the in-game filter and the Filter Exchange (median-xl.com/
// filters) use, as documented by the community editor (azadix/mxl-filter-editor, MIT):
//   { default_show_items, name, rules: [{ active, show_item, item_quality, ethereal,
//     min_clvl, max_clvl, min_ilvl, max_ilvl, rule_type, params, notify, automap }] }
// rule_type -1 = any item (params null), 0 = an item class ({ class: id }), 1 = one item
// ({ code: n }). Classes and item codes come from the game files (filter-data.json). Levels
// run 0-150, where 0 means no limit. Imported filters are untrusted: clean() keeps only
// these fields, in range.

// D2 item qualities (the filter's item_quality), with Honorific added by Median XL.
export const QUALITIES = [
  [-1, "Any"], [1, "Low Quality"], [2, "Normal"], [3, "Superior"], [4, "Magic"], [5, "Set"],
  [6, "Rare"], [7, "Unique"], [8, "Crafted"], [9, "Honorific"],
];
export const ETHEREAL = [[0, "Either"], [1, "Ethereal"], [2, "Not ethereal"]];
export const MAX_RULES = 500;
const LEVEL = (v) => Math.max(0, Math.min(150, Math.floor(Number(v) || 0)));

// Keys in the game's own order (alphabetical, as its exported filters and the community editor
// write them), so an exported filter reads exactly like one the game made.
export const newRule = () => ({
  active: true, automap: false, ethereal: 0, item_quality: -1, max_clvl: 0, max_ilvl: 0,
  min_clvl: 0, min_ilvl: 0, notify: false, params: null, rule_type: -1, show_item: true,
});

export function cleanRule(r) {
  const out = newRule();
  if (!r || typeof r !== "object") return out;
  for (const k of ["active", "show_item", "notify", "automap"]) if (typeof r[k] === "boolean") out[k] = r[k];
  if (QUALITIES.some(([v]) => v === r.item_quality)) out.item_quality = r.item_quality;
  if ([0, 1, 2].includes(r.ethereal)) out.ethereal = r.ethereal;
  for (const k of ["min_clvl", "max_clvl", "min_ilvl", "max_ilvl"]) out[k] = LEVEL(r[k]);
  if (r.rule_type === 0 && Number.isInteger(r.params?.class)) { out.rule_type = 0; out.params = { class: r.params.class }; }
  else if (r.rule_type === 1 && Number.isInteger(r.params?.code)) { out.rule_type = 1; out.params = { code: r.params.code >>> 0 }; }
  return out;
}

// A filter's name in plain printable characters (letters, digits, spaces and punctuation such
// as "Oroborius' Filter"): the game is an old Diablo II mod, so accents, emoji and control
// characters are left out rather than risk a name it can't show or read.
const cleanName = (n) => (typeof n === "string" ? n.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) : "");

export function cleanFilter(f) {
  const rules = Array.isArray(f?.rules) ? f.rules.slice(0, MAX_RULES).map(cleanRule) : [];
  return {
    default_show_items: typeof f?.default_show_items === "boolean" ? f.default_show_items : true,
    name: cleanName(f?.name) || "New filter",
    rules,
  };
}

/** Pretty JSON, the same shape as the Filter Exchange's "Copy to Clipboard". */
export const exportFilter = (f) => JSON.stringify(cleanFilter(f), null, 2);

/** Parses pasted or uploaded text; throws a readable error if it isn't a filter. */
export function importFilter(text) {
  let raw;
  try { raw = JSON.parse(String(text).trim()); } catch { throw new Error("That isn't valid JSON."); }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.rules)) throw new Error("That JSON isn't a loot filter (it has no rules).");
  return cleanFilter(raw);
}

/** A 4-character item code ("r24 ") ↔ the number a filter stores (little-endian). */
export const codeNumber = (id) => [...id.padEnd(4, " ").slice(0, 4)].reduce((n, ch, i) => n + ch.charCodeAt(0) * 256 ** i, 0);

/** One rule in words, like the Filter Exchange: "SHOW Unique · type Tier Sacred · Notify · Map". */
export function describeRule(r, { className = (id) => `class ${id}`, itemName = (code) => `item ${code}` } = {}) {
  const quality = QUALITIES.find(([v]) => v === r.item_quality)?.[1];
  const parts = [`${r.show_item ? "SHOW" : "HIDE"}${r.item_quality !== -1 ? ` ${quality}` : ""}`];
  parts.push(r.rule_type === 0 ? `type ${className(r.params.class)}` : r.rule_type === 1 ? itemName(r.params.code) : "any item");
  if (r.ethereal) parts.push(r.ethereal === 1 ? "ethereal" : "not ethereal");
  const range = (lo, hi, what) => (lo && hi ? `${what} ${lo}–${hi}` : lo ? `${what} ≥ ${lo}` : hi ? `${what} ≤ ${hi}` : null);
  for (const x of [range(r.min_clvl, r.max_clvl, "char level"), range(r.min_ilvl, r.max_ilvl, "item level")]) if (x) parts.push(x);
  if (r.notify) parts.push("Notify");
  if (r.automap) parts.push("Map");
  return parts.join(" · ");
}
