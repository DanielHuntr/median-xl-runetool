// A character's public NotArmory page on median-xl.com (/char/<name>), cut down to what the
// planner's importer reads (src/planner/armory.js parseArmoryPage): the title (name, level,
// class), the character's title (the difficulties it has finished), the attribute and signet figures, the skill list, the doll's class and mercenary, and
// the items JSON. Nothing else is kept: the header's account name, the site's navigation and
// scripts never leave our server. Used by api/char.js.
export const CHAR_SITE = "https://www.median-xl.com/char/";

// Character names: letters, digits, "-" and "_" (Diablo II allows letters, "-" and "_").
export const CHAR_NAME = /^[A-Za-z0-9_-]{2,16}$/;

const between = (s, start, end) => {
  const i = s.indexOf(start);
  if (i < 0) return "";
  const j = s.indexOf(end, i + start.length);
  return j < 0 ? "" : s.slice(i, j + end.length);
};

/** The page's HTML → a small HTML page with only the character's parts, or null if it isn't one. */
export function trimCharPage(html) {
  const s = String(html || "");
  const title = /<title>NotArmory [^<]*\(\d+ \w+\)<\/title>/.exec(s)?.[0];
  const items = between(s, '<script type="application/json" id="notarmory-items">', "</script>");
  if (!title || !items) return null;
  // The title before the name ("Slayer"), alone: the account name follows it in the same heading.
  // (A page already cut down keeps it on a line of its own.)
  const head = /<h1 class="na-name">\s*(?:<span class="na-title">([^<]*)<\/span>)?/.exec(s) || /^<span class="na-title">([^<]*)<\/span>$/m.exec(s);
  const rank = head ? `<span class="na-title">${head[1] || ""}</span>` : "";
  const stats = [...s.matchAll(/<div class="na-stat na-stat-(?:strength|dexterity|vitality|energy|signets|free-stats)"><dt>[^<]*<\/dt><dd>[^<]*<\/dd><\/div>/g)].map((m) => m[0]);
  const skills = [...s.matchAll(/<section class="na-skillcell( na-oskills)?">[\s\S]*?<\/section>/g)].map((m) => m[0]);
  const free = /<p class="na-free-skills">Free skill points: <b>\d+<\/b><\/p>/.exec(s)?.[0] || "";
  const doll = /<div class="na-doll-box" data-na-doll[^>]*><\/div>/.exec(s)?.[0] || "";
  return ["<!DOCTYPE html>", title, rank, ...stats, ...skills, free, doll, items].join("\n");
}
