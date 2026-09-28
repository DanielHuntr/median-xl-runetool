// Backing up and restoring what this app keeps in the browser (every "mxlrw2:" key in
// localStorage): saved builds, loot filters, rune inventory, favourites, filters, theme…
// A backup is a JSON file. Restoring merges saved builds and loot filters into the ones
// already here (nothing is lost; an entry with the same id or build name is kept as it is)
// and replaces the settings. Version 1 files, from scripts/export-browser-state.js, work too.
// Entries are only merged here; each store cleans its own entries when it reads them.
export const FORMAT = "median-xl-runetool";
const PREFIX = "mxlrw2:";
const LISTS = { "saved-builds": 100, "loot-filters": 50 };
const MAX_BYTES = 5_000_000;
const KEY_RE = /^[a-z0-9-]+(:[a-z0-9-]+)*$/;

/** Everything the app has saved, as a backup object. */
export function makeBackup(storage = localStorage, now = new Date()) {
  const data = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      data[key.slice(PREFIX.length)] = JSON.parse(storage.getItem(key));
    } catch {} // not JSON: nothing the app could read back either
  }
  return { format: FORMAT, version: 2, savedAt: now.toISOString(), data };
}

/** What a backup (or this browser) holds, for the dialog. */
export function summarise(data) {
  const n = (k) => (Array.isArray(data?.[k]) ? data[k].length : 0);
  const settings = Object.keys(data || {}).filter((k) => !(k in LISTS)).length;
  return { builds: n("saved-builds"), filters: n("loot-filters"), settings };
}

/**
 * Checks a backup file's text and restores it into storage.
 * @returns {{ ok: true, added: { builds, filters }, skipped: { builds, filters }, settings } | { ok: false, reason }}
 */
export function restoreBackup(text, storage = localStorage) {
  if (typeof text !== "string" || text.length > MAX_BYTES) return { ok: false, reason: "That file is too large to be a backup." };
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file isn't a backup (it isn't JSON)." };
  }
  if (payload?.format !== FORMAT || ![1, 2].includes(payload.version) || !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data))
    return { ok: false, reason: "That file isn't a Runetool backup." };
  const keys = Object.keys(payload.data).filter((k) => KEY_RE.test(k) && payload.data[k] != null);
  for (const k of Object.keys(LISTS)) if (k in payload.data && payload.data[k] != null && !Array.isArray(payload.data[k]))
    return { ok: false, reason: "The backup's saved builds or loot filters are damaged." };

  const current = (k) => {
    try {
      const v = JSON.parse(storage.getItem(PREFIX + k));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const added = { builds: 0, filters: 0 }, skipped = { builds: 0, filters: 0 };
  const writes = [];
  let settings = 0;
  for (const k of keys) {
    const value = payload.data[k];
    if (!(k in LISTS)) {
      writes.push([k, value]);
      settings++;
      continue;
    }
    const which = k === "saved-builds" ? "builds" : "filters";
    const list = current(k);
    const ids = new Set(list.map((e) => e?.id));
    const names = new Set(list.map((e) => (typeof e?.name === "string" ? e.name.trim().toLowerCase() : null)).filter(Boolean));
    const merged = [...list];
    for (const e of value) {
      const name = typeof e?.name === "string" ? e.name.trim().toLowerCase() : null;
      if (!e || typeof e.id !== "string" || ids.has(e.id) || (name && names.has(name)) || merged.length >= LISTS[k]) {
        skipped[which]++;
        continue;
      }
      merged.push(e);
      ids.add(e.id);
      if (name) names.add(name);
      added[which]++;
    }
    writes.push([k, merged]);
  }
  try {
    for (const [k, v] of writes) storage.setItem(PREFIX + k, JSON.stringify(v));
  } catch {
    return { ok: false, reason: "Your browser didn't let the backup be saved (storage is full or blocked)." };
  }
  return { ok: true, added, skipped, settings };
}
