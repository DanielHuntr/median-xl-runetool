// Fetches and parses the sets, sacred uniques, socketables and base items
// catalogues from the official Median XL documentation. Shared by the build-time
// importer (scripts/import-docs.mjs) and the live endpoint (api/catalog.js).
//
// HTML line handling and the sets / sacred-unique table walking are adapted from
// azadix/medianxl-db (MIT). See THIRD_PARTY_LICENSES.txt.

export const DOCS = "https://docs.median-xl.com/doc/items/";
export const PAGES = ["baseitems", "sacreduniques", "sets", "socketables"];

// A parse below these counts means the docs are down or their layout changed;
// the result is rejected rather than replacing good data.
export const MINIMUMS = {
  baseItems: 200,
  sacredUniques: 400,
  sets: 45,
  setItems: 170,
  socketables: 100,
};

export async function fetchPage(name, { timeout = 20000 } = {}) {
  const res = await fetch(DOCS + name, {
    signal: AbortSignal.timeout(timeout),
    headers: { "user-agent": "median-xl-runetool (catalogue import)" },
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

const decode = (s) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&rarr;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

function lines(html) {
  return decode(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
const text = (html) => lines(html).join(" ");

// The docs split some label/value pairs across sibling spans, e.g.
// "Defense:" + "(5050 - 6312) to (5712 - 7140)" or "Chance to Block:" + "45%".
function joinSplit(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    let line = src[i];
    if (/:$/.test(line) && src[i + 1] && !/:$/.test(src[i + 1])) {
      line += " " + src[++i];
      if (/^Chance to Block:/.test(line))
        while (/^(\+?\s*Class\s*)?[+-]?\(?[\d.]*( to [\d.]+)?\)?%?\s*\+?$/i.test(src[i + 1] || "") && src[i + 1])
          line += " " + src[++i];
    } else if (/^\([^)]*% of [^)]+\)$/.test(src[i + 1] || "") && /Damage:$/.test(line)) {
      line += " " + src[++i];
    }
    out.push(line);
  }
  return out;
}

const cells = (html) =>
  [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);

// Walks a page yielding each <table> together with the latest "genbig" heading.
function* tables(html, cls = "") {
  const re = new RegExp(
    `<p\\b[^>]*class=["'][^"']*\\bgenbig\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/p>|<table${cls ? ` class="${cls}"` : ">"}([\\s\\S]*?)<\\/table>`,
    "gi",
  );
  let section = "";
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) section = text(m[1]);
    else yield { section, body: m[2] };
  }
}

const titleCase = (s) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- Base items: [name, category, [[tierLabel, "line|line"], ...]]
export function parseBaseItems(html) {
  const items = [];
  for (const { section, body } of tables(html)) {
    const th = /<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(body);
    if (!th) continue;
    const tiers = [];
    for (const cell of cells(body)) {
      const l = joinSplit(lines(cell));
      if (!l.length || !/^(Tier \d|Sacred)$/.test(l[0])) continue;
      tiers.push([l[0], l.slice(1).join("|")]);
    }
    if (tiers.length) items.push([text(th[1]), section, tiers]);
  }
  return items;
}

// ---------- Sacred uniques: [name, base, category, "line|line"]
const JEWELRY = {
  Amulets: "Amulet",
  Rings: "Ring",
  Jewels: "Jewel",
  "Arrow Quivers": "Arrow Quiver",
  "Crossbow Quivers": "Bolt Quiver",
};
export function parseSacredUniques(html, baseCat = new Map()) {
  const out = [];
  for (const { section, body } of tables(html, "uniques")) {
    const th = /<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(body);
    const base = th ? text(th[1]).replace(/\s*\(Sacred\)$/i, "") : JEWELRY[section] || section;
    const cat = baseCat.get(base) || (JEWELRY[section] ? section : section || "Other");
    for (const cell of cells(body)) {
      const nm =
        /<span\b[^>]*class="[^"]*\bitem-unique\b[^"]*\bmargin_bottom\b[^"]*"[^>]*>[\s\S]*?<b[^>]*>\s*([\s\S]*?)<\/b>/i.exec(
          cell,
        );
      if (!nm) continue;
      const name = text(nm[1]);
      const l = joinSplit(lines(cell));
      const at = l.indexOf(name);
      out.push([name, base, cat, l.slice(at >= 0 ? at + 1 : 0).join("|")]);
    }
  }
  return out;
}

// ---------- Sets: [name, subtitle, class|null, "bonus|lines", [[item, base, "line|line"], ...]]
export function parseSets(html) {
  const out = [];
  for (const { section, body } of tables(html, "sets")) {
    const tds = cells(body);
    const summary = tds.find((c) => !/<img\b/i.test(c));
    if (!summary) continue;
    const s = lines(summary);
    const bonusAt = s.findIndex((l) => /^Set Bonus\b/i.test(l));
    if (!s[0] || bonusAt < 0) continue;
    const cls = /^(\w+) SETS$/.exec(section)?.[1];
    const items = [];
    for (const cell of tds) {
      if (!/<img\b/i.test(cell)) continue;
      const l = joinSplit(lines(cell));
      if (l.length < 3) continue;
      const [name, base, ...stats] = l;
      items.push([name, base.replace(/\s*\(Sacred\)$/i, ""), stats.join("|")]);
    }
    out.push([
      s[0],
      /^\(.*\)$/.test(s[1] || "") ? s[1].slice(1, -1) : "",
      cls && cls !== "OTHER" ? titleCase(cls) : null,
      s.slice(bonusAt).join("|"),
      items,
    ]);
  }
  return out;
}

// ---------- Socketables: [name, group, level, weapon, armor, shield, imageKey, imageUrl]
// imageKey is the rune code for runes (matching rune-images.json) and
// "gem:<name>" for gems (matching socketable-images.json).
export const SOCKET_GROUPS = [
  "Gems",
  "Standard runes",
  "Enchanted runes",
  "Great runes",
  "Elemental runes",
];
const ELEMENTAL = {
  Fire: "Ign",
  Lightning: "Ful",
  Light: "Ful",
  Ice: "Gla",
  Cold: "Gla",
  Poison: "Ven",
  Stone: "Sil",
  Arcane: "Arc",
};
export function parseSocketables(html) {
  const out = [];
  let t = 0;
  for (const { body } of tables(html)) {
    const group = SOCKET_GROUPS[t++];
    for (const row of body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
      const c = cells(row[1]);
      if (c.length < 5) continue;
      const name = text(c[1]);
      const url = /<img[^>]*src="([^"]+)"/i.exec(c[0])?.[1] || "";
      const slots = [...c[4].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) =>
        lines(m[1]).join("|"),
      );
      const key =
        group === "Gems"
          ? "gem:" + name
          : group === "Elemental runes"
            ? ELEMENTAL[name] || name
            : name;
      out.push([name, group, parseInt(text(c[2])) || 1, ...slots.slice(0, 3), key, url]);
    }
  }
  if (t !== SOCKET_GROUPS.length)
    throw new Error(`Expected ${SOCKET_GROUPS.length} socketable tables, got ${t}`);
  return out;
}

export function validate(c) {
  const counts = {
    baseItems: c.baseItems.length,
    sacredUniques: c.sacredUniques.length,
    sets: c.sets.length,
    setItems: c.sets.reduce((n, s) => n + s[4].length, 0),
    socketables: c.socketables.length,
  };
  const short = Object.entries(MINIMUMS).filter(([k, min]) => counts[k] < min);
  if (short.length)
    throw new Error(
      "Docs parse looks incomplete: " +
        short.map(([k, min]) => `${k} ${counts[k]} < ${min}`).join(", "),
    );
  return counts;
}

// Returns { fetchedAt, source, counts, baseItems, sacredUniques, sets, socketables }.
export async function loadCatalog(getPage = fetchPage) {
  const [baseHtml, suHtml, setHtml, sockHtml] = await Promise.all(PAGES.map((p) => getPage(p)));
  const baseItems = parseBaseItems(baseHtml);
  const catalog = {
    fetchedAt: new Date().toISOString(),
    source: DOCS,
    baseItems,
    sacredUniques: parseSacredUniques(suHtml, new Map(baseItems.map(([n, cat]) => [n, cat]))),
    sets: parseSets(setHtml),
    socketables: parseSocketables(sockHtml),
  };
  catalog.counts = validate(catalog);
  return catalog;
}
