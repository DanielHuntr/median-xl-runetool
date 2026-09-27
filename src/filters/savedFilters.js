// The player's own loot filters, kept in this browser (localStorage) like saved builds, and
// cleaned when read (lootFilter.js). Only this module touches storage, so it can move later.
import { ref, watch } from "vue";
import { cleanFilter } from "./lootFilter.js";

const KEY = "mxlrw2:loot-filters";
export const MAX_FILTERS = 50;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return (Array.isArray(raw) ? raw : []).slice(0, MAX_FILTERS)
      .filter((e) => e && typeof e.id === "string" && e.filter)
      .map((e) => ({ id: e.id.slice(0, 40), from: typeof e.from === "string" ? e.from.slice(0, 120) : "", filter: cleanFilter(e.filter) }));
  } catch {
    return [];
  }
}

let list = null;
/** Shared, reactive list of { id, from, filter }; saved on every change (errors ignored). */
export function useSavedFilters() {
  if (!list) {
    list = ref(read());
    watch(list, (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }, { deep: true });
  }
  const add = (filter, from = "") => {
    if (list.value.length >= MAX_FILTERS) return null;
    const entry = { id: newId(), from, filter: cleanFilter(filter) };
    list.value.unshift(entry);
    return entry;
  };
  const remove = (id) => (list.value = list.value.filter((e) => e.id !== id));
  return { filters: list, add, remove };
}
