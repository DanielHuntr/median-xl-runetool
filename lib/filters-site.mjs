// Community loot filters from median-xl.com/filters (the Filter Exchange): the public list,
// and one filter's rules, which its page embeds as JSON for its "Copy to Clipboard" button.
// Used by api/filters.js. Authors' descriptions are HTML on the site; they are returned as
// plain text (lines), never as markup.
export const FILTERS_SITE = "https://www.median-xl.com/filters/index.php";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
// A character code past Unicode's range (an author's "&#99999999;") stays as written: decoding it
// would throw and take the whole list down with it.
const codePoint = (n) => (Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : null);
const decode = (s) => s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
  ENTITIES[e.toLowerCase()] ?? (e[0] === "#" ? codePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) ?? m : m));
// HTML to plain lines: list items and paragraphs become lines; other tags are dropped.
const text = (html) => decode(html.replace(/<\s*(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, ""))
  .split("\n").map((l) => l.trim()).filter(Boolean);

/** The list page → [{ id, name, cls, description: [lines], rules, author, updated, views, uses }]. */
export function parseFilterList(html) {
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const out = [];
  for (const row of body.split(/<tr\b[^>]*>/i).slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const link = /href='\?mode=view&(?:amp;)?id=(\d+)'>([\s\S]*?)<\/a>/i.exec(cells[0] || "");
    if (!link || cells.length < 8) continue;
    const num = (s) => Number(decode(s).replace(/[^\d]/g, "")) || 0;
    out.push({
      id: Number(link[1]), name: decode(link[2]).trim(), cls: decode(cells[1]).trim(), description: text(cells[2]),
      rules: num(cells[3]), author: decode(cells[4]).trim(), updated: decode(cells[5]).trim(), views: num(cells[6]), uses: num(cells[7]),
    });
  }
  if (!out.length) throw new Error("No filters found on the Filter Exchange page (layout changed?)");
  return out;
}

/** A filter page → the filter object ({ default_show_items, name, rules }). */
export function parseFilterPage(html) {
  const start = html.indexOf("Clipboard('");
  if (start < 0) throw new Error("No filter JSON on the page (layout changed?)");
  // A JavaScript string in single quotes: find its unescaped closing quote.
  let i = start + "Clipboard('".length, raw = "";
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === "\\") { raw += html.slice(i, i + 2); i++; continue; }
    if (ch === "'") break;
    raw += ch;
  }
  const js = raw.replace(/\\(r|n|t|'|"|\\|\/)/g, (m, c) => ({ r: "\r", n: "\n", t: "\t" })[c] ?? c);
  const filter = JSON.parse(decode(js));
  if (!filter || !Array.isArray(filter.rules)) throw new Error("The filter JSON has no rules");
  return filter;
}
