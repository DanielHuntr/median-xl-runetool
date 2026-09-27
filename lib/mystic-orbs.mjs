// Unique Mystic Orbs from the official docs (docs.median-xl.com/doc/wiki/umos).
//
// From that page: an orb is applied to a non-ethereal item and adds its bonus plus a
// required-level increase (+10 for most); each orb has a per-item limit (usually 2); it
// can't be applied if the item's required level would exceed the character level; and the
// increase counts after socket fillers ("always add the socket fillers before adding orbs").
// Groups say which items take the orb: "Ring/Amulet/Quiver", "Item" (any), "Armor", "Weapon".
export const UMO_URL = "https://docs.median-xl.com/doc/wiki/umos";

const strip = (s) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ");
const lines = (s) => strip(s).split("\n").map((l) => l.trim()).filter(Boolean);

/** @returns {{ id, name, group, lines: string[], reqLevel: number, limit: number }[]} */
export function parseUniqueOrbs(html) {
  const body = html.slice(Math.max(0, html.indexOf("well page")));
  const out = [];
  const seen = new Map();
  let group = null;
  for (const m of body.matchAll(/<p class="genbig uindex">([\s\S]*?)<\/p>|<td>([\s\S]*?)<\/td>/g)) {
    if (m[1] != null) {
      group = strip(m[1]).trim();
      continue;
    }
    const cell = m[2];
    const name = lines(/<span class="item-orange">([\s\S]*?)<\/span>/.exec(cell)?.[1] || "")[0];
    if (!name || !group) continue;
    const stats = lines(/<span class="item-magic">([\s\S]*?)<\/span>/.exec(cell)?.[1] || "");
    const req = stats.find((l) => /^\+\d+ Required Level$/.test(l));
    const limit = Number(/Limit per item:\s*(\d+)/.exec(cell)?.[1] || 1);
    // Same-named variants (Imperfect Sphere, Apple of Discord) get a numbered id.
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    out.push({
      id: n > 1 ? `${slug}-${n}` : slug,
      name,
      group,
      lines: stats.filter((l) => l !== req),
      reqLevel: req ? Number(/\d+/.exec(req)[0]) : 0,
      limit,
    });
  }
  return out;
}
