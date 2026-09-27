// Superior quality, from the game files (scripts/extract-superior.mjs → superior-items.json):
// each variant is a set of item lines ("+(35 to 60)% Enhanced Defense") that a superior base
// adds. Base items and runewords (made in a base) can be superior; uniques and sets can't.
// The lines join the item's own, so their ranges get roll sliders and Enhanced Damage or
// Defense applies to that item only, like any other base's (character.js).
import SUPERIOR from "../data/superior-items.json" with { type: "json" };

export const SUPERIOR_PATCH = SUPERIOR.patch;
export const SUPERIOR_VARIANTS = SUPERIOR.variants;
const ARMOUR = new Set(["helm", "body", "shield", "gloves", "belt", "boots"]);

/** "weapon", "armor" or null (jewellery, quivers, charms) for an item's slot type. */
export const superiorKind = (slotType) => (slotType === "weapon" ? "weapon" : ARMOUR.has(slotType) ? "armor" : null);

/** The Superior variants an item of this slot type can roll. */
export const superiorVariants = (slotType) => SUPERIOR_VARIANTS.filter((v) => v.appliesTo === superiorKind(slotType));

// The same by item category (Base Items page), without the planner's catalogue: jewellery,
// quivers and charms can't be superior, armour pieces and shields roll armour variants.
export function superiorVariantsForCat(cat = "") {
  if (/Quivers$|^(Amulets|Rings|Jewels)$|Charms|Relics/.test(cat)) return [];
  const kind = /Helms|Circlets|Body Armors|Shields|Gloves|Belts|Boots/.test(cat) ? "armor" : "weapon";
  return SUPERIOR_VARIANTS.filter((v) => v.appliesTo === kind);
}

/** The variant a stored item state asks for, if it fits the item (else null). */
export function superiorOf(state, slotType) {
  const id = state?.superior;
  return Number.isInteger(id) ? superiorVariants(slotType).find((v) => v.id === id) || null : null;
}

/** A short label: "Superior: +35-60% Enhanced Defense". */
export const superiorLabel = (v) => `Superior: ${v.lines.map((l) => l.replace(/\((\d+) to (\d+)\)/g, "$1–$2")).join(", ")}`;

/** Display names for a resolved item (items.js resolve): "Superior Greaves" for a base, and a
 *  runeword's or custom item's base as "Superior Crown". */
export function superiorNames(r) {
  const sup = !!r?.superior;
  const base = r?.def.base && r.def.base !== r.def.name ? r.def.base : null;
  return {
    name: sup && r.def.kind === "base" ? `Superior ${r.def.name}` : r?.def.name,
    base: base && sup ? `Superior ${base}` : base,
  };
}
/** The item's lines that come from its Superior roll (they follow its own). */
export const superiorLineTexts = (r) => new Set(r?.superior ? r.lines.slice(-r.superior.lines.length) : []);
