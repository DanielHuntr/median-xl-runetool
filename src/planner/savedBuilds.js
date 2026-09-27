// The player's saved builds. They live in this browser for now (localStorage); the pages
// only use this module, so the storage can move later (an account or a server) without
// changing them. Stored data is untrusted: entries are checked when read, and the build
// itself is cleaned by the planner when it's opened.
import { ref } from "vue";
import { decodeBuild } from "./buildCode.js";

const KEY = "mxlrw2:saved-builds";
export const MAX_SAVED = 100;
export const MAX_NAME = 60;
const CLASSES = ["Amazon", "Assassin", "Barbarian", "Druid", "Necromancer", "Paladin", "Sorceress"];

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function clean(e) {
  if (!e || typeof e !== "object") return null;
  const id = text(e.id, 40), name = text(e.name, MAX_NAME), code = typeof e.code === "string" && /^[A-Za-z0-9_-]{8,}$/.test(e.code) ? e.code : null;
  if (!id || !name || !code || !CLASSES.includes(e.cls)) return null;
  const decoded = decodeBuild(code);
  if (!decoded || ![1, 2].includes(decoded.v) || decoded.cls !== e.cls) return null;
  return {
    id, name, code, cls: e.cls,
    level: Number.isInteger(e.level) && e.level > 0 && e.level <= 150 ? e.level : null,
    skills: (Array.isArray(e.skills) ? e.skills : []).map((s) => text(s, 60)).filter(Boolean).slice(0, 2),
    savedAt: typeof e.savedAt === "string" && !Number.isNaN(Date.parse(e.savedAt)) ? e.savedAt : null,
    ...(text(e.preset, 60) ? { preset: text(e.preset, 60) } : {}),
  };
}
function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    const seen = new Set();
    return (Array.isArray(raw) ? raw : []).map(clean).filter((e) => e && !seen.has(e.id) && seen.add(e.id)).slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}
function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// One shared list, newest first, kept in step with other tabs.
let list = null;
function shared() {
  if (list) return list;
  list = ref(read());
  if (typeof window !== "undefined" && window.addEventListener)
    window.addEventListener("storage", (e) => { if (e.key === KEY || e.key === null) list.value = read(); });
  return list;
}
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function useSavedBuilds() {
  const builds = shared();
  const commit = (next) => {
    if (!write(next)) return false;
    builds.value = next;
    return true;
  };
  const byName = (name) => builds.value.find((b) => b.name.toLowerCase() === text(name, MAX_NAME).toLowerCase()) || null;
  /**
   * Saves a build under a name; a build already saved under that name is replaced.
   * @returns {{ ok: boolean, entry?, replaced?: boolean, reason?: string }}
   */
  function save({ name, code, cls, level, skills = [], preset }) {
    const entry = clean({ id: byName(name)?.id || newId(), name, code, cls, level, skills, preset, savedAt: new Date().toISOString() });
    if (!entry) return { ok: false, reason: "That build can't be saved." };
    const replaced = !!byName(name);
    const rest = builds.value.filter((b) => b.id !== entry.id);
    if (!replaced && rest.length >= MAX_SAVED) return { ok: false, reason: `You can keep up to ${MAX_SAVED} saved builds. Delete one first.` };
    if (!commit([entry, ...rest])) return { ok: false, reason: "Your browser didn't let the build be saved (storage is full or blocked)." };
    return { ok: true, entry, replaced };
  }
  function rename(id, name) {
    if (!builds.value.some((b) => b.id === id)) return { ok: false, reason: "That saved build no longer exists." };
    const n = text(name, MAX_NAME);
    if (!n) return { ok: false, reason: "Give the build a name." };
    const clash = byName(n);
    if (clash && clash.id !== id) return { ok: false, reason: `Another saved build is already called "${clash.name}".` };
    return commit(builds.value.map((b) => (b.id === id ? { ...b, name: n } : b))) ? { ok: true } : { ok: false, reason: "Couldn't save the new name." };
  }
  const remove = (id) => commit(builds.value.filter((b) => b.id !== id));
  return { builds, save, rename, remove, byName };
}
