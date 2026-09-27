import {
  reactive,
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  shallowRef,
  onScopeDispose,
  getCurrentInstance,
  inject,
} from "vue";
import {
  RW,
  TUD,
  SUD,
  SETD,
  SOCKD,
  SOCK_GROUPS,
  SOCK_SLOTS,
  BASED,
  META,
  normalizeCatalog,
  RIMG,
  STD,
  GREAT,
  ELEM,
  OTHER,
  label,
  runeName,
  CLASSES,
  ARMOR,
  TAGS,
  ELEMS,
  SORTS,
  SHORT,
  lineValue,
} from "../data/index.js";
export const RunetoolKey = Symbol("Runetool");
const DOCS = "https://docs.median-xl.com/doc/items/";
// [id/hash, title, icon, subtitle, source link, hidden from the main navigation]
// Highest level the catalogue filters go to: the planner's maximum character level. Some
// sacred uniques need level 125 or 130, so 120 hid them.
export const MAX_ITEM_LEVEL = 150;
export const PAGES = [
  ["runewords", "Runeword Finder", "rune", "Find the right runes. Forge your next upgrade.", DOCS + "runewords"],
  ["uniques", "Tiered Uniques", "book", "Find your unique. See what the next tier brings.", DOCS + "tiereduniques"],
  ["sacred-uniques", "Sacred Uniques", "crown", "Endgame uniques on sacred bases.", DOCS + "sacreduniques"],
  ["sets", "Sets", "link", "Sacred sets, their items and set bonuses.", DOCS + "sets"],
  ["socketables", "Gems & Runes", "gem", "What every gem and rune adds to each slot.", DOCS + "socketables"],
  ["base-items", "Base Items", "shield", "Every base item, from Tier 1 to Sacred.", DOCS + "baseitems"],
  ["planner", "Character Planner", "tree", "Attributes, skills, equipment and stats in one build.", "https://github.com/azadix/medianxl-db"],
  ["builds", "Builds", "book", "Your saved snapshots and starter builds for every class.", "https://github.com/azadix/medianxl-db"],
  ["confirm", "Help confirm values", "check", "Send in-game skill screenshots so the planner's numbers can be checked against the game.", "https://github.com/azadix/medianxl-db", true],
];
// Bug reports and confirmation screenshots go to this repository's GitHub issues.
export const ISSUES_REPO = "https://github.com/DanielHuntr/median-xl-runetool";
// Pages whose data is the planner's (skill data from MedianDB and the game files).
export const SKILL_PAGES = ["planner", "confirm", "builds"];
const pageFromHash = () => {
  let h = window.location.hash.slice(1).split("?")[0];
  if (h === "skill-planner") h = "planner"; // links from the earlier skill-only planner
  return PAGES.some((p) => p[0] === h) ? h : "runewords";
};
const get = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem("mxlrw2:" + k)) ?? d;
  } catch {
    return d;
  }
};
const put = (k, v) => {
  try {
    localStorage.setItem("mxlrw2:" + k, JSON.stringify(v));
  } catch {}
};
const defaults = () => ({
  q: "",
  base: "",
  cls: "",
  generic: true,
  lvl: MAX_ITEM_LEVEL,
  sockets: [],
  tags: [],
  elems: [],
  pmode: "all",
  starOnly: false,
  full: false,
  sort: "level",
});

// Colour themes, as [value, label, group]. The Diablo II ones are dark themes named after
// places in the game.
export const THEMES = [
  ["auto", "Auto theme", "Standard"],
  ["light", "Light theme", "Standard"],
  ["dark", "Dark theme", "Standard"],
  ["hc", "High contrast", "Standard"],
  ["hell", "Hell", "Diablo II"],
  ["arreat", "Arreat Summit", "Diablo II"],
  ["horadric", "Horadric", "Diablo II"],
  ["kurast", "Kurast", "Diablo II"],
];
const knownTheme = (v) => (THEMES.some(([t]) => t === v) ? v : "dark");

export function createRunetool() {
  const st = reactive({ ...defaults(), ...get("state", {}) });
  const owned = ref(get("owned", {})),
    stars = ref(get("stars", [])),
    theme = ref(knownTheme(get("theme", "dark")));
  const page = ref(pageFromHash()),
    panel = ref(false),
    drawer = ref(false),
    expanded = ref([]),
    tuQuery = ref(""),
    tuCat = ref(""),
    compare = ref(true),
    tiers = reactive({}),
    browse = reactive({
      sacred: { q: "", cat: "" },
      sets: { q: "", cls: "" },
      sock: { q: "", group: "" },
      bases: { q: "", cat: "", tier: "" },
    }),
    dialog = ref(null),
    runeTrigger = ref(null);
  const allBases = [...new Set(RW.flatMap((r) => r.bases))];
  const weaponBases = allBases.filter((b) => !ARMOR.has(b)),
    armorBases = allBases.filter((b) => ARMOR.has(b));
  const groups = [
    ["Standard runes", STD],
    ["Enchanted runes", GREAT],
    ["Elemental runes", Object.keys(ELEM)],
    ["Great runes", OTHER],
  ];
  const cats = [...new Set(TUD.map((u) => u.cat))];
  // The four docs catalogues start as the bundled snapshot and are replaced by
  // /api/catalog when it answers with a complete parse (see loadLiveCatalog).
  const catalog = {
    SUD: shallowRef(SUD),
    SETD: shallowRef(SETD),
    SOCKD: shallowRef(SOCKD),
    SOCK_GROUPS: shallowRef(SOCK_GROUPS),
    BASED: shallowRef(BASED),
  };
  const dataStatus = reactive({
    source: "bundled",
    fetchedAt: META.fetchedAt,
    error: null,
  });
  function applyCatalog(raw) {
    const next = normalizeCatalog(raw);
    for (const k of Object.keys(catalog)) catalog[k].value = next[k];
    Object.keys(tiers).forEach((k) => k.startsWith("bi:") && delete tiers[k]);
    Object.assign(dataStatus, {
      source: "live",
      fetchedAt: raw.fetchedAt || new Date().toISOString(),
      error: null,
    });
  }
  async function loadLiveCatalog(url = "/api/catalog") {
    dataStatus.source = "loading";
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "HTTP " + res.status);
      const ok = ["baseItems", "sacredUniques", "sets", "socketables"].every(
        (k) => Array.isArray(body[k]) && body[k].length,
      );
      if (!ok) throw new Error("Incomplete catalogue response");
      applyCatalog(body);
    } catch (err) {
      Object.assign(dataStatus, {
        source: "bundled",
        fetchedAt: META.fetchedAt,
        error: String(err?.message || err),
      });
    }
  }
  const sacredCats = computed(() => [
      ...new Set(catalog.SUD.value.map((u) => u.cat)),
    ]),
    baseCats = computed(() => [
      ...new Set(catalog.BASED.value.map((b) => b.cat)),
    ]),
    baseTiers = computed(() => [
      ...new Set(catalog.BASED.value.flatMap((b) => b.t.map((t) => t.label))),
    ]);
  const words = (q) => q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const sacredUniques = computed(() => {
    const q = words(browse.sacred.q);
    return catalog.SUD.value.filter(
      (u) =>
        (!browse.sacred.cat || u.cat === browse.sacred.cat) &&
        (u.req === null || u.req <= st.lvl) &&
        q.every((w) => u.text.includes(w)),
    );
  });
  const sets = computed(() => {
    const q = words(browse.sets.q);
    return catalog.SETD.value.filter(
      (s) =>
        (!browse.sets.cls ||
          (browse.sets.cls === "@none" ? !s.cls : s.cls === browse.sets.cls)) &&
        (s.minReq === null || s.minReq <= st.lvl) &&
        q.every((w) => s.text.includes(w)),
    );
  });
  const socketables = computed(() => {
    const q = words(browse.sock.q);
    return catalog.SOCKD.value.filter(
      (s) =>
        (!browse.sock.group || s.group === browse.sock.group) &&
        s.lvl <= st.lvl &&
        q.every((w) => s.text.includes(w)),
    );
  });
  const bases = computed(() => {
    const q = words(browse.bases.q);
    return catalog.BASED.value.filter(
      (b) =>
        (!browse.bases.cat || b.cat === browse.bases.cat) &&
        q.every((w) => b.text.includes(w)),
    );
  });
  const totalOwned = computed(() =>
    Object.values(owned.value).reduce((a, b) => a + b, 0),
  );
  const filterCount = computed(
    () => st.tags.length + st.elems.length + st.sockets.length,
  );
  function missing(rw) {
    const need = {};
    rw.runes.forEach((r) => (need[r] = (need[r] || 0) + 1));
    return Object.entries(need).reduce(
      (n, [r, q]) => n + Math.max(0, q - (owned.value[r] || 0)),
      0,
    );
  }
  function isOwned(rw, i) {
    const r = rw.runes[i];
    return (
      (owned.value[r] || 0) >=
      rw.runes.slice(0, i + 1).filter((x) => x === r).length
    );
  }
  function sortVal(rw) {
    const def = SORTS.find((s) => s[0] === st.sort);
    if (!def?.[2]) return null;
    let best = 0,
      hit = null;
    rw.stats.forEach((l, i) => {
      if (def[2].test(l) && !(def[3] && def[3].test(l))) {
        const v = lineValue(l);
        if (v >= best) {
          best = v;
          hit = i;
        }
      }
    });
    return { v: hit === null ? null : best, i: hit };
  }
  const results = computed(() => {
    const words = st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return RW.filter((r) => {
      if (!words.every((w) => r.text.includes(w))) return false;
      if (
        (st.base === "@weapon" && r.slot !== "weapon") ||
        (st.base === "@armor" && r.slot !== "armor")
      )
        return false;
      // A specific base: the game's own allowed categories when extracted (runeword-bases.json).
      if (st.base && !st.base.startsWith("@") && r.allowed) {
        if (!r.allowed.includes(st.base)) return false;
      } else if (
        st.base &&
        !st.base.startsWith("@") &&
        !r.bases.includes(st.base) &&
        !(
          !ARMOR.has(st.base) &&
          r.bases.includes("Weapons") &&
          !r.except.includes(st.base)
        )
      )
        return false;
      if (st.cls) {
        if (r.cls && r.cls !== st.cls) return false;
        if (!st.generic && r.cls !== st.cls && r.skillCls !== st.cls)
          return false;
      }
      return (
        r.lvl <= st.lvl &&
        (!st.sockets.length || st.sockets.includes(r.runes.length)) &&
        st.tags.every((t) => r.tags.includes(t)) &&
        st.elems.every((t) => r.elems.includes(t)) &&
        (!st.starOnly || stars.value.includes(r.name)) &&
        (st.pmode !== "make" || missing(r) === 0) &&
        (st.pmode !== "near" || missing(r) <= 1)
      );
    }).sort((a, b) => {
      if (st.sort === "name") return a.name.localeCompare(b.name);
      if (st.sort === "sockets")
        return a.runes.length - b.runes.length || a.lvl - b.lvl;
      if (st.sort === "level")
        return a.lvl - b.lvl || a.name.localeCompare(b.name);
      if (st.sort === "level-d")
        return b.lvl - a.lvl || a.name.localeCompare(b.name);
      return (sortVal(b)?.v ?? -1) - (sortVal(a)?.v ?? -1) || a.lvl - b.lvl;
    });
  });
  const pills = computed(() => {
    let a = [];
    if (st.q.trim()) a.push({ label: st.q, key: "q" });
    if (st.cls) a.push({ label: st.cls, key: "cls" });
    if (st.base)
      a.push({
        label:
          st.base === "@weapon"
            ? "Any weapon"
            : st.base === "@armor"
              ? "Any armor"
              : st.base,
        key: "base",
      });
    if (st.lvl < MAX_ITEM_LEVEL) a.push({ label: "Level ≤ " + st.lvl, key: "lvl" });
    for (const key of ["tags", "elems", "sockets"])
      st[key].forEach((v) =>
        a.push({ label: key === "sockets" ? v + " runes" : v, key, value: v }),
      );
    if (st.pmode !== "all")
      a.push({
        label: st.pmode === "make" ? "Can make now" : "Missing ≤ 1 rune",
        key: "pmode",
      });
    if (st.starOnly) a.push({ label: "Starred", key: "starOnly" });
    return a;
  });
  function toggle(key, v) {
    st[key] = st[key].includes(v)
      ? st[key].filter((x) => x !== v)
      : [...st[key], v];
  }
  function remove(p) {
    if (["tags", "elems", "sockets"].includes(p.key)) toggle(p.key, p.value);
    else st[p.key] = defaults()[p.key];
  }
  function reset() {
    Object.assign(st, defaults(), { sort: st.sort, full: st.full });
  }
  function star(n) {
    stars.value = stars.value.includes(n)
      ? stars.value.filter((x) => x !== n)
      : [...stars.value, n];
  }
  function expand(id) {
    expanded.value = expanded.value.includes(id)
      ? expanded.value.filter((x) => x !== id)
      : [...expanded.value, id];
  }
  function hit(r, i) {
    return (
      sortVal(r)?.i === i ||
      TAGS.some(([t, re]) => st.tags.includes(t) && re.test(r.stats[i])) ||
      ELEMS.some(([t, re]) => st.elems.includes(t) && re.test(r.stats[i]))
    );
  }
  function stats(r) {
    return r.stats
      .map((text, i) => ({ text, i }))
      .filter(
        (s) =>
          st.full || expanded.value.includes(r.id) || s.i < 4 || hit(r, s.i),
      );
  }
  const uniques = computed(() => {
    const q = tuQuery.value.toLowerCase().trim().split(/\s+/);
    return TUD.filter(
      (u) =>
        (!tuCat.value || u.cat === tuCat.value) &&
        q.every((w) => u.text.includes(w)),
    );
  });
  function tierIndex(u) {
    if (tiers[u.key] !== undefined) return tiers[u.key];
    if (browse.bases.tier && String(u.key).startsWith("bi:")) {
      const i = u.t.findIndex((t) => t.label === browse.bases.tier);
      if (i >= 0) return i;
    }
    let b = 0;
    u.t.forEach((t, i) => {
      if (t.req <= st.lvl) b = i;
    });
    return b;
  }
  const tier = (u) => u.t[tierIndex(u)],
    nextTier = (u) => u.t[tierIndex(u) + 1];
  function cycle(r) {
    const n = ((owned.value[r] || 0) + 1) % 3;
    if (n) owned.value[r] = n;
    else delete owned.value[r];
  }
  function nav(p) {
    page.value = p;
    window.location.hash = p;
    window.scrollTo({ top: 0 });
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme() {
    document.documentElement.dataset.theme =
      theme.value === "auto" ? (media.matches ? "dark" : "light") : theme.value;
  }
  watch(
    theme,
    () => {
      put("theme", theme.value);
      applyTheme();
    },
    { immediate: true },
  );
  media.addEventListener("change", applyTheme);
  watch(st, () => put("state", st), { deep: true });
  watch(
    () => browse.bases.tier,
    () => Object.keys(tiers).forEach((k) => k.startsWith("bi:") && delete tiers[k]),
  );
  watch(owned, () => put("owned", owned.value), { deep: true });
  watch(stars, () => put("stars", stars.value), { deep: true });
  watch(drawer, async (open) => {
    await nextTick();
    if (!dialog.value) return;
    if (open && !dialog.value.open) dialog.value.showModal();
    else if (!open && dialog.value.open) dialog.value.close();
  });
  function closeDrawer() {
    drawer.value = false;
    runeTrigger.value?.focus();
  }
  function clampLevel() {
    st.lvl = Math.min(MAX_ITEM_LEVEL, Math.max(1, parseInt(st.lvl) || MAX_ITEM_LEVEL));
    Object.keys(tiers).forEach((k) => delete tiers[k]);
  }
  const hashchange = () => (page.value = pageFromHash());
  if (getCurrentInstance()) {
    onMounted(() => {
      window.addEventListener("hashchange", hashchange);
      loadLiveCatalog();
    });
  }
  onScopeDispose(() => {
    media.removeEventListener("change", applyTheme);
    window.removeEventListener("hashchange", hashchange);
  });
  return {
    st,
    owned,
    stars,
    theme,
    page,
    panel,
    drawer,
    expanded,
    tuQuery,
    tuCat,
    compare,
    tiers,
    browse,
    dialog,
    runeTrigger,
    weaponBases,
    armorBases,
    groups,
    cats,
    sacredCats,
    baseCats,
    baseTiers,
    sacredUniques,
    sets,
    socketables,
    bases,
    totalOwned,
    filterCount,
    missing,
    isOwned,
    sortVal,
    results,
    pills,
    toggle,
    remove,
    reset,
    star,
    expand,
    hit,
    stats,
    uniques,
    tierIndex,
    tier,
    nextTier,
    cycle,
    nav,
    closeDrawer,
    clampLevel,
    RW,
    TUD,
    ...catalog,
    SOCK_SLOTS,
    dataStatus,
    applyCatalog,
    loadLiveCatalog,
    PAGES,
    RIMG,
    label,
    runeName,
    CLASSES,
    TAGS,
    ELEMS,
    SORTS,
    SHORT,
  };
}

export function useRunetool() {
  const store = inject(RunetoolKey);
  if (!store) throw new Error("Runetool provider is missing");
  return store;
}
