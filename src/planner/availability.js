// "Found gear": items a player can count on finding or making without trading for the
// rarest drops (the community starter tier list's budget idea). Used for each starter build's
// found-gear version (scripts/build-presets.mjs) and shown on the Builds page.
//   - tiered uniques, base items and standard crafting: yes;
//   - sacred uniques (Hell-only drops): no;
//   - runewords: only standard runes up to Ist (enchanted, great and elemental runes are rare
//     Hell drops, and high standard runes too);
//   - set items: up to required level 100 (the later sets drop from the hardest content);
//   - charms and relics: up to required level 90 (the later ones come from uber bosses).
export const FOUND = { maxRune: "Ist", maxSetLevel: 100, maxInventoryLevel: 90 };

export function createAvailability(catalog, socketables) {
  // Rune name → [group, level] ("Ist" → ["Standard runes", 63]).
  const runes = new Map(socketables.filter((s) => /runes/i.test(s[1])).map((s) => [s[0].replace(/ Rune$/, ""), [s[1], s[2]]]));
  const maxRune = runes.get(FOUND.maxRune)?.[1] ?? 63;
  const runeOk = (name) => {
    const r = runes.get(String(name).replace(/ Rune$/, ""));
    return !!r && r[0] === "Standard runes" && r[1] <= maxRune;
  };
  const reqOf = (def) => {
    const line = (def.variants?.[0]?.lines || def.lines || []).map((l) => /^Required Level: (\d+)/.exec(l)?.[1]).find(Boolean);
    return line ? Number(line) : 0;
  };
  /** Whether an item counts as found gear. */
  function found(def) {
    if (!def) return false;
    if (def.kind === "sacred") return false;
    if (def.kind === "runeword") return (def.runes || []).every(runeOk);
    if (def.kind === "set") return reqOf(def) <= FOUND.maxSetLevel;
    if (def.kind === "charm" || def.kind === "relic") return reqOf(def) <= FOUND.maxInventoryLevel;
    if (def.kind === "socketable" && /runes/i.test(def.kindLabel || "")) return runeOk(def.name);
    return true;
  }
  /** Why an item isn't found gear, for the Builds page. */
  function why(def) {
    if (def.kind === "sacred") return "sacred unique";
    if (def.kind === "runeword") return "high runes";
    if (def.kind === "set") return "late set";
    if (def.kind === "charm" || def.kind === "relic") return "uber charm";
    return "";
  }
  return { found, why };
}
