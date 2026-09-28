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
  ["cube", "Cube Recipes", "cube", "Put items in the Horadric Cube and see what the game makes of them, from its own recipe table.", DOCS + "cube"],
  ["planner", "Character Planner", "tree", "Attributes, skills, equipment and stats in one build.", "https://github.com/azadix/medianxl-db"],
  ["builds", "Builds", "builds", "Your saved snapshots and starter builds for every class.", "https://github.com/azadix/medianxl-db"],
  ["filters", "Loot Filters", "filter", "Community loot filters, and your own.", "https://www.median-xl.com/filters/index.php"],
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
  bases: [],
  cls: "",
  lvl: MAX_ITEM_LEVEL,
  sockets: [],
  tags: [],
  elems: [],
  pmode: "all",
  starOnly: false,
  full: false,
  sort: "level",
});

// Colour themes, as [value, label, group, preview colours [background, panel, accent, text]]
// (the preview is drawn by the theme picker; auto follows the system: light or Classic).
// The Diablo II ones are named after places in the game.
export const THEMES = [
  ["auto", "Auto", "Standard", null],
  ["light", "Light", "Standard", ["#e7e3dc", "#fbfaf7", "#795815", "#2c2922"]],
  ["dark", "Classic", "Standard", ["#0e0e0e", "#1a1a1a", "#c7b377", "#d9d2bf"]],
  ["hc", "High contrast", "Standard", ["#000", "#000", "#ffe34d", "#fff"]],
  ["hell", "Hell", "Diablo II", ["#140a09", "#1e0f0d", "#f59050", "#f0e1d9"]],
  ["arreat", "Arreat Summit", "Diablo II", ["#0d1217", "#121a21", "#9fd6f2", "#e2eaf0"]],
  ["horadric", "Horadric", "Diablo II", ["#17130d", "#1f1a12", "#63d6c6", "#ede3cd"]],
  ["kurast", "Kurast", "Diablo II", ["#0c130e", "#111b14", "#cbdc6e", "#e0eadf"]],
  ["tristram", "Tristram", "Diablo II", ["#16120f", "#1e1814", "#ffa94d", "#ece2d6"]],
  ["worldstone", "Worldstone", "Diablo II", ["#0f0d18", "#17142a", "#c7a6ff", "#e7e3f5"]],
  ["parchment", "Parchment (light)", "Diablo II", ["#e9dfc9", "#f7efdd", "#7a1f1f", "#2b2016"]],
  ["heavens", "Heavens (light)", "Diablo II", ["#e8edf3", "#fbfcfe", "#6f5410", "#1d2533"]],
];
// "classic" was its own theme before it became the default dark one.
const knownTheme = (v) => (v === "classic" ? "dark" : THEMES.some(([t]) => t === v) ? v : "dark");

export function createRunetool() {
  const saved = get("state", {});
  // Item types used to be a single choice (base: "Swords" or "@weapon").
  if (typeof saved.base === "string") saved.bases = saved.base ? [saved.base] : [];
  delete saved.base;
  delete saved.generic;
  if (!Array.isArray(saved.bases)) delete saved.bases;
  const st = reactive({ ...defaults(), ...saved });
  const owned = ref(get("owned", {})),
    stars = ref(get("stars", [])),
    theme = ref(knownTheme(get("theme", "dark")));
  const page = ref(pageFromHash()),
    // The filters slide out like My Runes; on wide screens they can instead be docked beside
    // the results (remembered, as is leaving the docked panel open).
    wideQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 1280px)") : null,
    wide = ref(!!wideQuery?.matches),
    dockFilters = ref(get("dockFilters", false) === true),
    filtersDocked = computed(() => wide.value && dockFilters.value),
    panel = ref(filtersDocked.value && get("filtersOpen", false) === true),
    drawer = ref(false),
    expanded = ref([]),
    tuQuery = ref(""),
    compare = ref(true),
    tiers = reactive({}),
    // The catalogue pages' filters (CatalogFilters.vue): item types, stats and damage types,
    // each a list where any chosen type and every chosen stat must match.
    browse = reactive({
      tiered: { cats: [], tags: [], elems: [] },
      sacred: { q: "", cats: [], tags: [], elems: [] },
      sets: { q: "", cls: "", tags: [] },
      sock: { q: "", group: "" },
      bases: { q: "", cats: [], tier: "" },
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
  // Item types in three groups for the filter panels.
  const JEWELRY = new Set(["Amulets", "Rings", "Jewels", "Arrow Quivers", "Crossbow Quivers"]);
  const catGroups = (list) => [
    { name: "Weapons", items: list.filter((c) => !ARMOR.has(c) && !JEWELRY.has(c)) },
    { name: "Armor", items: list.filter((c) => ARMOR.has(c)) },
    { name: "Jewelry & quivers", items: list.filter((c) => JEWELRY.has(c)) },
  ].filter((g) => g.items.length);
  // Every chosen stat and damage type appears on some line.
  const hasAll = (lines, chosen, table) => chosen.every((t) => {
    const re = table.find((x) => x[0] === t)?.[1];
    return !re || lines.some((l) => re.test(l));
  });
  const statsMatch = (lines, f) => hasAll(lines, f.tags || [], TAGS) && hasAll(lines, f.elems || [], ELEMS);
  const inCats = (cat, f) => !f.cats.length || f.cats.includes(cat);
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
        inCats(u.cat, browse.sacred) &&
        (u.req === null || u.req <= st.lvl) &&
        q.every((w) => u.text.includes(w)) &&
        statsMatch(u.lines, browse.sacred),
    );
  });
  const sets = computed(() => {
    const q = words(browse.sets.q);
    return catalog.SETD.value.filter(
      (s) =>
        (!browse.sets.cls ||
          (browse.sets.cls === "@none" ? !s.cls : s.cls === browse.sets.cls)) &&
        (s.minReq === null || s.minReq <= st.lvl) &&
        q.every((w) => s.text.includes(w)) &&
        statsMatch([...s.bonuses.flatMap((b) => b.lines), ...s.items.flatMap((i) => i.lines)], browse.sets),
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
        inCats(b.cat, browse.bases) &&
        q.every((w) => b.text.includes(w)),
    );
  });
  const totalOwned = computed(() =>
    Object.values(owned.value).reduce((a, b) => a + b, 0),
  );
  const filterCount = computed(
    () => st.bases.length + st.tags.length + st.elems.length + st.sockets.length,
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
  function fitsBase(r, base) {
    if (base === "@weapon") return r.slot === "weapon";
    if (base === "@armor") return r.slot === "armor";
    // A specific base: the game's own allowed categories when extracted (runeword-bases.json).
    if (r.allowed) return r.allowed.includes(base);
    return (
      r.bases.includes(base) ||
      (!ARMOR.has(base) && r.bases.includes("Weapons") && !r.except.includes(base))
    );
  }
  const results = computed(() => {
    const words = st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return RW.filter((r) => {
      if (!words.every((w) => r.text.includes(w))) return false;
      // Item types: it fits any one of those chosen.
      if (st.bases.length && !st.bases.some((b) => fitsBase(r, b))) return false;
      // A class: its own runewords and those any class can use.
      if (st.cls && r.cls && r.cls !== st.cls) return false;
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
    for (const b of st.bases)
      a.push({ label: b === "@weapon" ? "All weapons" : b === "@armor" ? "All armor" : b, key: "bases", value: b });
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
    if (["tags", "elems", "sockets", "bases"].includes(p.key)) toggle(p.key, p.value);
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
        inCats(u.cat, browse.tiered) &&
        q.every((w) => u.text.includes(w)) &&
        statsMatch(u.t.flatMap((t) => t.mods), browse.tiered),
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
  // Site search: open a catalogue page searched for one thing. The page's other filters
  // (and the level limit) are only cleared when they would hide it; then its card is
  // scrolled to and highlighted.
  function reveal(to, name) {
    const shows = (list) => list.value.some((x) => x.name === name);
    const lists = { "sacred-uniques": ["sacred", sacredUniques], sets: ["sets", sets], socketables: ["sock", socketables], "base-items": ["bases", bases] };
    // Back to no filter: lists empty, choices (class, group) to "any"; the search and tier stay.
    const clear = (f) => { for (const k of Object.keys(f)) if (k !== "q" && k !== "tier") f[k] = Array.isArray(f[k]) ? [] : ""; };
    if (to === "runewords") {
      st.q = name;
      if (!shows(results)) Object.assign(st, defaults(), { q: name, sort: st.sort, full: st.full });
    } else if (to === "uniques") {
      tuQuery.value = name;
      if (!shows(uniques)) clear(browse.tiered);
    } else if (lists[to]) {
      const [key, list] = lists[to];
      browse[key].q = name;
      if (!shows(list)) clear(browse[key]);
      if (!shows(list)) st.lvl = MAX_ITEM_LEVEL;
    } else return;
    nav(to);
    nextTick(() => {
      const card = [...document.querySelectorAll("main article h2")].find((h) => h.textContent.trim() === name)?.closest("article");
      if (!card) return;
      card.scrollIntoView({ block: "center" });
      card.classList.remove("found");
      void card.offsetWidth; // restart the highlight
      card.classList.add("found");
    });
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
  wideQuery?.addEventListener?.("change", (e) => (wide.value = e.matches));
  watch(panel, (open) => filtersDocked.value && put("filtersOpen", open));
  watch(dockFilters, (v) => put("dockFilters", v));
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
    wide,
    dockFilters,
    filtersDocked,
    drawer,
    expanded,
    tuQuery,
    compare,
    tiers,
    browse,
    dialog,
    runeTrigger,
    weaponBases,
    armorBases,
    groups,
    cats,
    catGroups,
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
    reveal,
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
