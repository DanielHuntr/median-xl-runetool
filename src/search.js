// Site-wide search (Ctrl+K): one index over runewords, uniques, sacred uniques, sets and
// their items, gems and runes, base items, cube recipes and skills. Names are matched, not
// stats, so a search finds the thing itself; each page's own search box covers stats.

export const KINDS = {
  runeword: "Runeword",
  unique: "Tiered unique",
  sacred: "Sacred unique",
  set: "Set",
  "set-item": "Set item",
  socketable: "Gem or rune",
  base: "Base item",
  cube: "Cube recipe",
  skill: "Skill",
};
// When scores tie, things people look up most come first.
const ORDER = Object.keys(KINDS);

const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "");

/**
 * @param {object} d  { RW, TUD, SUD, SETD, SOCKD, BASED, made?: cube-made.json, skills?: planner data skills }
 * @returns entries { kind, name, sub, to, link?, reveal? }; `to` is the page, `link` a hash to open instead.
 */
export function buildIndex(d) {
  const out = [];
  const add = (e) => out.push({ ...e, key: fold(e.name) });
  for (const r of d.RW || []) add({ kind: "runeword", name: r.name, sub: `${r.runes.join(" · ")} · level ${r.lvl}`, to: "runewords" });
  for (const u of d.TUD || []) add({ kind: "unique", name: u.name, sub: `${u.base} · ${u.cat}`, to: "uniques" });
  for (const u of d.SUD || []) add({ kind: "sacred", name: u.name, sub: `${u.base} · ${u.cat}`, to: "sacred-uniques" });
  for (const s of d.SETD || []) {
    add({ kind: "set", name: s.name, sub: `${s.cls ? `${s.cls} set` : "Set"} · ${s.items.length} items`, to: "sets" });
    for (const i of s.items) add({ kind: "set-item", name: i.name, sub: `${i.base} · part of ${s.name}`, to: "sets", reveal: s.name });
  }
  for (const s of d.SOCKD || []) add({ kind: "socketable", name: s.name, sub: s.group, to: "socketables" });
  for (const b of d.BASED || []) add({ kind: "base", name: b.name, sub: b.cat, to: "base-items" });
  if (d.made) {
    for (const [name, how] of Object.entries(d.made.uniques || {}))
      add({ kind: "cube", name, sub: how === "reroll" ? "Show the recipe: reroll its base" : "Show the recipe", to: "cube", link: `#cube?make=unique:${encodeURIComponent(name)}` });
    // "Hand Axe (2)": a base item's upgrade recipes, one per tier; the base item is listed,
    // and its card links to them.
    const bases = new Set((d.BASED || []).map((b) => b.name));
    for (const name of Object.keys(d.made.items || {}))
      if (!bases.has(name.replace(/ \(\d\)$/, "")))
        add({ kind: "cube", name, sub: "Show the recipe", to: "cube", link: `#cube?make=item:${encodeURIComponent(name)}` });
  }
  for (const [id, s] of Object.entries(d.skills || {}))
    if (s?.name && s.class && /^[a-z0-9_]+$/.test(id))
      add({ kind: "skill", name: s.name, sub: `${s.class} · ${s.tabName || "skill"}`, to: "planner", link: `#planner?skill=${id}` });
  return out;
}

// Whole name, start of the name, start of a word, anywhere in the name.
function score(key, q, words) {
  if (key === q) return 100;
  if (key.startsWith(q)) return 80;
  if (!words.every((w) => key.includes(w))) return 0;
  const starts = words.filter((w) => key.startsWith(w) || key.includes(" " + w)).length;
  return 40 + (starts === words.length ? 20 : starts * 5);
}

/** Best matches first, at most `limit`; the same name and kind appears once. */
export function search(index, query, limit = 30) {
  const q = fold(query).trim().replace(/\s+/g, " ");
  if (!q) return [];
  const words = q.split(" ");
  const seen = new Set();
  return index
    .map((e) => ({ e, s: score(e.key, q, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.key.length - b.e.key.length || ORDER.indexOf(a.e.kind) - ORDER.indexOf(b.e.kind) || a.e.name.localeCompare(b.e.name))
    .map((x) => x.e)
    .filter((e) => {
      const k = e.kind + "|" + e.key + "|" + (e.sub || "");
      return !seen.has(k) && seen.add(k);
    })
    .slice(0, limit);
}
