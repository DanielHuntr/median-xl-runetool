// Item inventory art for the catalogue pages (names of graphics in the sprite sheets): public/planner/item-art.json (written by
// scripts/import-skills.mjs from the game-file extract), fetched once on first use.
// Until it arrives, or if it can't be fetched, lookups return "" and cards show no art.
import { shallowRef } from "vue";

const index = shallowRef(null);
let loading = null;

function load() {
  if (loading || typeof fetch === "undefined") return;
  loading = fetch(`${import.meta.env.BASE_URL}planner/item-art.json?v=${__BUILD_ID__}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (index.value = j))
    .catch(() => {});
}

const plainBase = (n) => n?.replace(/\s*\((?:Sacred|\d+)\)$/i, "");

export function useItemArt() {
  load();
  /**
   * @param {"unique"|"set"|"base"} kind
   * @param {string} name  item name (base name for "base")
   * @param {{ base?: string, tier?: string }} opts  base picks between same-named items;
   *   tier ("Tier 2", "Sacred") picks a base's tier graphic
   */
  function artName(kind, name, { base, tier } = {}) {
    const art = index.value;
    if (!art) return "";
    if (kind === "base") {
      const tiers = art.bases[name];
      return tiers ? ((tier && tiers[tier]) || Object.values(tiers).at(-1)) : "";
    }
    const rows = (kind === "set" ? art.sets : art.uniques)[name];
    if (!rows) return "";
    return ((rows.find(([b]) => plainBase(b) === base) || rows[0])[1]);
  }
  return { artName };
}
