<script setup>
// The welcome tour: page by page, what the site's controls do, in plain words, with the tour
// doing each one in front of the player: it types the search, picks a filter, puts runes in the
// cube, spends a skill point, opens the dialogs… The card says which page the step is about.
// Everything a step changes is put back as the player moves on (the cube's contents when they
// leave the cube, the planner from a snapshot taken before its steps), so the tour leaves
// nothing changed. It never saves, copies, signs in, or touches the player's rune counts.
// "Skip this page" jumps to the next page, "Skip tour" stops, and either way the player ends up
// back on the page they started on.
// It opens by itself for a first-time visitor, on whichever page they arrive (a shared link
// included): one who hasn't seen it and has none of the site's data in this browser yet.
// Closing it in any way counts as seen; "Welcome tour" in the More menu opens it again.
// The tour is a modal <dialog>, brought back to the front after a step opens one of the site's
// own dialogs, so its card always stays on top and the page underneath can't be clicked.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
import { activePlanner } from "../planner/tourHandle.js";

const { page, nav, PAGES, st, tuQuery, browse } = useRunetool();
const KEY = "mxlrw2:welcome";
const MENU = ".mobile-top .mobile-menu";

// ---------- Helpers for the demos.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => document.querySelector(sel);
const button = (root, label) => [...(root || document).querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const dlg = ref(null);
// The site's own open dialogs (not the tour's), and closing them.
const others = () => [...document.querySelectorAll("dialog[open]")].filter((d) => d !== dlg.value);
const closeDialogs = () => others().forEach((d) => d.close());
// Back on top of any dialog a step opened.
async function raise() {
  await sleep(120);
  const d = dlg.value;
  if (d?.open && others().length) { d.close(); d.showModal(); }
}
async function waitFor(fn, ms = 6000) {
  const until = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v || Date.now() > until) return v;
    await sleep(100);
  }
}
async function type(set, text, alive) {
  for (let i = 1; i <= text.length && alive(); i++) { set(text.slice(0, i)); await sleep(150); }
}
const setSelect = (sel, value) => { sel.value = value; sel.dispatchEvent(new Event("change", { bubbles: true })); };
const cubeEmpty = () => { const b = button(null, "Empty the cube"); if (b && !b.disabled) b.click(); };
async function twoIth(alive) {
  cubeEmpty();
  for (let i = 0; i < 2 && alive(); i++) {
    const tile = [...document.querySelectorAll(".cube-tiles button")].find((b) => b.textContent.trim() === "Ith Rune");
    if (!tile) return false;
    tile.click();
    await sleep(450);
  }
  return true;
}
// A link that opens another page (a rune's or a unique's cube recipe): follow it and light the
// recipe. The next step opens its own page again.
async function follow(el) {
  el.click();
  const bench = await waitFor(() => $(".cube-grid .cube-slot") && $(".cube-bench"));
  return bench ? { then: bench } : null;
}
// The planner on screen, once it has loaded.
const planner = () => waitFor(() => activePlanner.value, 8000);

// A demo runs a moment after its card shows: ({ el, alive }) => { undo?, then? } or null
// (alive() is false once the player has moved on; then: what to highlight afterwards).
const DEMOS = {
  async search({ alive }) {
    const before = st.q;
    await type((v) => (st.q = v), "life", alive);
    return { undo: () => (st.q = before) };
  },
  async cls() {
    const before = st.cls;
    st.cls = "Paladin";
    return { undo: () => (st.cls = before) };
  },
  async filter() {
    const before = [...st.bases];
    st.bases = ["Bows"];
    await nextTick();
    return { undo: () => (st.bases = before), then: $(".toolbar") };
  },
  async level({ alive }) {
    const before = st.lvl;
    await type((v) => (st.lvl = Number(v)), "30", alive);
    return { undo: () => (st.lvl = before) };
  },
  async runes({ el }) {
    el.click();
    await raise();
    return { undo: closeDialogs, then: $(".rune-drawer[open]") };
  },
  async starter() {
    const before = st.starter;
    st.starter = true;
    return { undo: () => (st.starter = before) };
  },
  follow: ({ el }) => follow(el),
  async star({ el }) {
    const star = [...el.querySelectorAll("button")].find((b) => /^Star /.test(b.getAttribute("aria-label") || ""));
    if (!star) return null;
    star.click();
    return { undo: () => { const b = [...el.querySelectorAll("button")].find((x) => /^Unstar /.test(x.getAttribute("aria-label") || "")); b?.click(); } };
  },
  async tier({ el }) {
    const was = el.querySelector("button.selected"), first = el.querySelector("button");
    if (!first || first === was) return null;
    first.click();
    return { undo: () => was?.isConnected && was.click() };
  },
  async compare({ el, alive }) {
    const box = el.querySelector("input");
    if (!box) return null;
    const before = box.checked;
    box.click();
    await sleep(1600);
    if (alive() && box.checked !== before) box.click();
    return { undo: () => box.isConnected && box.checked !== before && box.click() };
  },
  async tip({ el }) {
    el.classList.add("tip-shown");
    return { undo: () => el.classList.remove("tip-shown") };
  },
  // A sidebar link: open its page (on a phone: the menu, which lists it).
  async open({ el }) {
    el.click();
    if (el.matches(MENU)) { await raise(); return { undo: closeDialogs, then: $(".mobile-sheet[open] .mobile-sheet-body") }; }
    return {};
  },
  async cubeIn({ alive }) {
    return (await twoIth(alive)) ? { undo: cubeEmpty, until: "page" } : null;
  },
  async cubeItem() {
    const slot = $(".cube-grid .cube-slot");
    if (!slot) return null;
    slot.click();
    await nextTick();
    return { undo: () => { const b = $(".cube-edit [aria-label='Close the editor']"); b?.click(); }, then: $(".cube-edit") || undefined };
  },
  async transmute({ alive }) {
    // From two Ith Runes (what Pick items put in, unless the player came back here after).
    if ($(".cube-count")?.textContent.trim() !== "2 items" && !(await twoIth(alive))) return null;
    if (!alive()) return { undo: cubeEmpty, until: "page" };
    await sleep(300);
    $(".cube-go:not(:disabled)")?.click();
    await nextTick();
    return { undo: cubeEmpty, until: "page", then: $(".cube-result") };
  },
  // Looked up again to undo: the page redraws the select when the difficulty changes.
  async difficulty() {
    const find = () => [...document.querySelectorAll(".cube-char select")].find((s) => [...s.options].some((o) => o.textContent.trim() === "Normal"));
    const sel = find();
    if (!sel) return null;
    const before = sel.value;
    const normal = [...sel.options].find((o) => o.textContent.trim() === "Normal").value;
    if (before === normal) return null;
    setSelect(sel, normal);
    return { undo: () => { const s = find(); if (s) setSelect(s, before); } };
  },
  // The planner's: on the player's build, which is put back from the snapshot taken as its
  // steps began (PAGE_SETUP); a step's dialog is closed as the player moves on.
  async level90() { (await planner())?.setLevel(90); return {}; },
  // Another of the build's stages (Normal, unless the player renamed or moved them).
  async stage() {
    const p = await planner();
    const other = p?.stagesOf().find((n) => n !== p.state.stage[p.state.cls]);
    if (other) p.setStage(other);
    return {};
  },
  async attrs() { (await planner())?.addAttr("vitality", 10); return {}; },
  async picker() {
    const p = await planner();
    if (!p) return null;
    p.openPicker({ mode: "slot", slot: "weapon" });
    await raise();
    return { undo: () => p.closePicker(), then: $("dialog.item-picker[open] .picker-content, dialog.item-picker[open]") };
  },
  async suggest() {
    const p = await planner();
    if (!p) return null;
    p.state.suggesting = true;
    await raise();
    return { undo: () => (p.state.suggesting = false), then: $("dialog.item-picker.suggest[open]") };
  },
  async skill() {
    const p = await planner();
    if (!p) return null;
    const id = p.engine.skillIds().find((x) => p.engine.skill(x).class === p.state.cls && p.engine.canAdd(p.build.value, x).ok);
    if (id) p.add(id, 5);
    return {};
  },
  async stats() {
    const p = await planner();
    if (!p) return null;
    const before = p.state.statsOpen;
    p.toggleStats(true);
    await nextTick();
    return { undo: () => p.toggleStats(before), then: await waitFor(() => $(".stats-panel"), 2000) };
  },
  // The Mercenary tab, then back to the character (the Save and Share buttons are there).
  async merc({ el }) {
    el.click();
    return { undo: () => [...document.querySelectorAll("[role='tab']")].find((t) => t.parentElement === el.parentElement && t !== el)?.click() };
  },
  async save() {
    const b = button($(".planner-actions"), "Save build");
    if (!b) return null;
    b.click();
    await raise();
    return { undo: closeDialogs, then: await waitFor(() => $("dialog.save-build[open]"), 2000) };
  },
  async liked({ el }) {
    const liked = button(el, "Most liked"), newest = button(el, "Newest");
    if (!liked || liked.getAttribute("aria-pressed") === "true") return null;
    liked.click();
    return { undo: () => newest?.click() };
  },
  async mine({ el }) {
    const mine = button(el, "My filters"), community = button(el, "Community filters");
    if (!mine || mine.getAttribute("aria-selected") === "true") return null;
    mine.click();
    return { undo: () => community?.click() };
  },
  async account({ el }) {
    el.click();
    await raise();
    const shown = $(".mobile-sheet[open] .mobile-account") || $("dialog.account[open]");
    return { undo: closeDialogs, then: shown || undefined };
  },
  async more({ el }) {
    el.click();
    if (el.matches(MENU)) { await raise(); return { undo: closeDialogs, then: $(".mobile-sheet[open] .mobile-sheet-links") }; }
    await nextTick();
    return { undo: () => $(".more-pop") && $(".sidebar .side-more")?.click(), then: $(".more-pop") };
  },
};
// Set up as a page's steps begin; what it returns is run as the player leaves the page.
// The finders start from a clear list (the player's search and filters set aside, so a demo
// isn't lost among them) and get the player's back afterwards.
const copy = (v) => JSON.parse(JSON.stringify(v));
const clearList = (o) => { for (const k of Object.keys(o)) o[k] = Array.isArray(o[k]) ? [] : typeof o[k] === "boolean" ? false : ""; };
const PAGE_SETUP = {
  runewords() {
    const keep = copy(st);
    Object.assign(st, { q: "", bases: [], cls: "", lvl: MAX_ITEM_LEVEL, sockets: [], tags: [], elems: [], pmode: "all", starOnly: false, starter: false });
    return () => Object.assign(st, keep);
  },
  uniques() {
    const keep = { q: tuQuery.value, tiered: copy(browse.tiered), lvl: st.lvl };
    tuQuery.value = "";
    clearList(browse.tiered);
    st.lvl = MAX_ITEM_LEVEL;
    return () => { tuQuery.value = keep.q; Object.assign(browse.tiered, keep.tiered); st.lvl = keep.lvl; };
  },
  async planner() {
    const p = await planner();
    if (!p) return null;
    const snap = p.snapshot();
    return () => { closeDialogs(); p.restore(snap); };
  },
};

// A step: { page, at: selector, has: text the element contains, title, text, demo, phone?:
// selector on a phone when `at` isn't shown there, phoneText? }. No `at`: a card in the middle.
const STEPS = [
  { title: "Welcome to the Median XL Runetool", text: "A companion for Median XL 2.14: find runewords and uniques, work out cube recipes and plan your character. Item data comes from the game's own files. This tour goes through each page and shows what its buttons do, doing each one for you, then putting everything back as it was. It takes a few minutes, and you can skip a page or stop at any time." },

  { page: "runewords", at: ".primary-controls .search", demo: "search", title: "Search", text: "Search by a runeword's name, a rune, or a stat. Watch: typing \"life\" leaves only the runewords that add life." },
  { page: "runewords", at: ".primary-controls .class-picker", demo: "cls", title: "Your class", text: "Choose your class to leave out runewords made for other classes. Watch: picking Paladin." },
  { page: "runewords", at: ".primary-controls .filters-btn", demo: "filter", title: "Filters", text: "Narrow the list by item type (bows, helms, shields…), number of sockets, stats and damage type. Watch: picking Bows narrows the list, and the filter shows as a tag you can click to remove." },
  { page: "runewords", at: ".primary-controls .level", demo: "level", title: "Max level", text: "Type your character's level to hide runewords you can't use yet. Watch: at level 30, only the runewords you could use by then are left." },
  { page: "runewords", at: ".secondary-controls .btn", has: "My Runes", demo: "runes", title: "My Runes", text: "Tell the site which runes you have: click a rune to count one. The list then shows what you can make right now, and how many runes you're short for the rest." },
  { page: "runewords", at: ".secondary-controls .btn", has: "Starter runewords", demo: "starter", title: "Starter runewords", text: "New character? This shows the runewords made only from common runes (El to Ist), lowest level first." },
  { page: "runewords", at: ".rune-card .socket.has-recipe", demo: "follow", title: "Runes on a card", text: "A rune you can make in the Horadric Cube links to its recipe. Watch: clicking one opens the cube with that recipe loaded." },
  { page: "runewords", at: ".rune-card .card-actions", demo: "star", title: "Star and share", text: "The star saves a runeword to your favourites (the Starred button shows just those). The link icon copies a link to this card to send to someone. Watch: the star lights up." },

  { page: "uniques", at: ".unique-card .tier-tabs", demo: "tier", title: "Tiers", text: "Most uniques come in four tiers, each stronger than the last. Click I to IV to see each one; watch the card switch to tier I. A tier marked in red needs a higher level than the Max level you set." },
  { page: "uniques", at: ".unique-card .cube-link-square", demo: "follow", title: "Cube button", text: "Opens the Cube Recipes page with this unique's recipe loaded: how to make it, or how to upgrade it to the next tier. Watch." },
  { page: "uniques", at: "label.switch", has: "Compare", demo: "compare", title: "Compare with next tier", text: "With this on, each card shows what the next tier changes, so you can see whether upgrading is worth it. Watch it switch off, and back on." },
  { page: "uniques", at: ".unique-card .skill-class", demo: "tip", title: "Whose skill is it?", text: "A \"+ to a skill\" line has a tag saying which class the skill belongs to. Point at the tag for more, like this." },
  { page: "uniques", at: ".sidebar nav [data-page='sacred-uniques']", phone: MENU, demo: "open", title: "More to browse", text: "Sacred Uniques, Sets, Gems & Runes and Base Items work the same way: search, filters and Max level. Watch: Sacred Uniques opens.", phoneText: "Sacred Uniques, Sets, Gems & Runes and Base Items are in the menu, and work the same way: search, filters and Max level." },
  { page: "uniques", at: ".sidebar nav [data-page='oskills']", phone: MENU, demo: "open", title: "Oskills & Procs", text: "Find items that give you a skill from another class, or cast a skill for you when you attack or get hit. Watch: it opens.", phoneText: "In the menu: Oskills & Procs finds items that give you a skill from another class, or cast a skill for you when you attack or get hit." },

  { page: "cube", at: ".cube-picker", demo: "cubeIn", title: "Pick items", text: "Find an item here and click it to put it in the cube: runes, gems, reagents and gear are all listed. Watch: two Ith Runes go in." },
  { page: "cube", at: ".cube-grid", demo: "cubeItem", title: "The cube", text: "What you've put in. Click an item in the cube to change its details, such as quality, level or sockets. Watch: one opens." },
  { page: "cube", at: ".cube-go", demo: "transmute", title: "Transmute", text: "Shows what the game would make from what's in the cube, using the game's own recipe table. Watch: two Ith Runes make a Tal Rune. If nothing matches, it says what's close and what's missing." },
  { page: "cube", at: ".cube-char", demo: "difficulty", title: "Your character", text: "A few recipes depend on your class, level or difficulty. Set them here; most recipes ignore them. Watch: Normal difficulty." },

  { page: "planner", at: ".planner-toolbar", demo: "level90", title: "Class and level", text: "Choose your class and level. With \"Raise level automatically\" on, your level goes up as you spend points. Watch: level 90. (The tour puts your build back afterwards.)" },
  { page: "planner", at: ".stage-switch", demo: "stage", title: "Stages", text: "Plan each part of the game separately: Normal, Nightmare, Hell and Endgame keep their own skills and gear. The arrow on the open stage lets you rename, duplicate or delete it, and + adds one. Watch: another stage opens." },
  { page: "planner", at: ".attr-panel", demo: "attrs", title: "Attributes", text: "Spend attribute points. Life, damage and what you can equip update straight away. Watch: ten points into Vitality." },
  { page: "planner", at: ".skills-panel .skills-tree", demo: "skill", title: "Skills", text: "Click a skill to add a point and right-click to take one away (hold Shift for ten at a time). Point at a skill to see what it does at your level. Watch: five points go in." },
  { page: "planner", at: ".doll-panel", demo: "picker", title: "Equipment", text: "Click a slot to choose an item, then add sockets, runes and orbs to it. An item you can't wear yet is flagged. Watch: the weapon slot's list opens." },
  { page: "planner", at: ".suggest-btn", demo: "suggest", title: "Suggest gear", text: "Not sure what to wear? This suggests items that suit your skills and level. Nothing changes until you apply them." },
  { page: "planner", at: ".planner-actions .btn", has: "Stats", demo: "stats", title: "Stats", text: "Opens your full character sheet: damage for each skill, defence, resistances and more, worked out from the game's own formulas." },
  { page: "planner", at: "[role='tab']", has: "Mercenary", demo: "merc", title: "Mercenary", text: "Hire a mercenary and plan their gear too. The aura or buff they give you counts in your stats." },
  { page: "planner", at: ".planner-actions", demo: "save", title: "Save and share", text: "Save build keeps it in this browser (and your account, if you sign in). Share build copies a link anyone can open. Here's the Save dialog; the tour doesn't save anything." },

  { page: "builds", at: ".build-library", demo: "liked", title: "Builds", text: "Your saved builds, and builds other players have published, newest or most liked first. Opening one shows it in the planner, and your own build for that class is kept to go back to." },
  { page: "filters", at: ".loot-filters .tabs", demo: "mine", title: "Loot filters", text: "Community filters from median-xl.com, and your own under My filters. Open one to read its rules, or make a copy to edit." },

  { at: ".sidebar .side-account", phone: MENU, demo: "account", title: "No account needed", text: "Everything works without signing in, and is kept in this browser. Sign in with Google if you want your builds and filters on any device.", phoneText: "Everything works without signing in, and is kept in this browser. Sign in with Google from the menu if you want your builds and filters on any device." },
  { at: ".sidebar .side-more", phone: MENU, demo: "more", title: "Bugs and ideas", text: "Found a bug or have an idea? It's under More, along with backups and this tour if you want it again. Good hunting!", phoneText: "Found a bug or have an idea? The links are at the foot of the menu, along with backups and this tour if you want it again. Good hunting!" },
];

// Read as the page starts, before anything is saved: someone who has used the site has some of
// this (settings written on every load, such as the theme and the sidebar's, don't count).
const USED = ["state", "owned", "stars", "planner", "saved-builds", "loot-filters", "browse", "tuQuery", "oskills", "cube-ctx"];
const firstVisit = (() => {
  try { return !localStorage.getItem(KEY) && !USED.some((k) => localStorage.getItem(`mxlrw2:${k}`) != null); } catch { return false; }
})();

const open = ref(false), step = ref(0), rect = ref(null), card = ref(null), cardPos = ref({}), onPhone = ref(false);
const cur = computed(() => STEPS[step.value]);
const last = computed(() => step.value === STEPS.length - 1);
const text = computed(() => (onPhone.value && cur.value.phoneText) || cur.value.text);
const chapter = (s) => (s.page ? PAGES.find((p) => p[0] === s.page)?.[1] : s === STEPS[0] ? "Welcome" : "Before you go");
// The first step on the next page, for "Skip this page" (none on the welcome card or the end).
const nextPage = computed(() => {
  const s = cur.value;
  if (!s.page) return -1;
  return STEPS.findIndex((x, i) => i > step.value && x.page !== s.page);
});
let lastFocus = null, startPage = null, token = 0;

// What the demos changed, to put back: the step's own, and the page's (kept until it is left).
let stepUndo = null, pageUndo = null;
function undoDemos(nextPage) {
  try { stepUndo?.(); } catch {}
  stepUndo = null;
  if (pageUndo && pageUndo.page !== nextPage) { try { pageUndo.undo(); } catch {} pageUndo = null; }
}

const done = () => { try { localStorage.setItem(KEY, "done"); } catch {} };
async function start() {
  if (open.value) return;
  lastFocus = document.activeElement;
  // The page in the address (what the player sees), else the app's.
  const inHash = window.location.hash.slice(1).split("?")[0];
  startPage = PAGES.some((p) => p[0] === inHash) ? inHash : page.value;
  step.value = 0;
  open.value = true;
  await nextTick();
  dlg.value?.showModal();
}
async function close() {
  token++;
  undoDemos(null);
  dlg.value?.close();
  open.value = false;
  done();
  await nextTick();
  if (startPage && page.value !== startPage) nav(startPage);
  lastFocus?.focus?.();
}
const next = () => (last.value ? close() : step.value++);
const back = () => step.value > 0 && step.value--;
const skipPage = () => nextPage.value > 0 && (step.value = nextPage.value);

// The step's element: the first shown one matching its selector (and text), or on a phone its
// phone selector. Waits for a page that is still loading (the planner and cube load data).
const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
function find(s) {
  const pick = (sel) => sel && [...document.querySelectorAll(sel)].find((el) => shown(el) && (!s.has || el.textContent.includes(s.has)));
  const el = pick(s.at);
  if (el) return { el, phone: false };
  const ph = s.phone && $(s.phone);
  if (shown(ph)) return { el: ph, phone: true };
  return { el: null, phone: window.innerWidth < 760 };
}
async function findWhenReady(s, mine) {
  const until = Date.now() + 8000;
  for (;;) {
    const f = find(s);
    if (f.el || !s.at || Date.now() > until || mine !== token) return f;
    await sleep(120);
  }
}

// The highlight, and the card beside the element (the sidebar), else below or above it, else
// at the foot of the screen (a tall panel); nothing to point at: the middle of the screen.
let target = null;
async function place() {
  if (!open.value) return;
  const r = target?.isConnected ? target.getBoundingClientRect() : null;
  const vw = window.innerWidth, vh = window.innerHeight, m = 16;
  rect.value = r ? { top: Math.max(r.top, 0) - 4, left: r.left - 4, width: r.width + 8, height: Math.min(r.bottom, vh) - Math.max(r.top, 0) + 8 } : null;
  await nextTick();
  const c = card.value?.getBoundingClientRect();
  if (!c) return;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  if (!r) return (cardPos.value = { left: `${(vw - c.width) / 2}px`, top: `${(vh - c.height) / 2}px` });
  if (r.right + m + c.width <= vw - m) return (cardPos.value = { left: `${r.right + m}px`, top: `${clamp(r.top - 8, m, vh - c.height - m)}px` });
  const left = `${clamp(r.left, m, vw - c.width - m)}px`;
  if (r.bottom + m + c.height <= vh - m) cardPos.value = { left, top: `${r.bottom + m}px` };
  else if (r.top - m - c.height >= m) cardPos.value = { left, top: `${r.top - m - c.height}px` };
  else cardPos.value = { left: `${vw - c.width - m}px`, top: `${vh - c.height - m}px` };
}
async function show() {
  const mine = ++token, s = cur.value;
  const alive = () => mine === token && open.value;
  undoDemos(s.page);
  // A page saves what was put back before it is left (its watchers stop when it closes).
  await nextTick();
  if (!alive()) return;
  if (s.page && page.value !== s.page) nav(s.page);
  target = null;
  rect.value = null;
  const { el, phone } = await findWhenReady(s, mine);
  if (!alive()) return;
  // A page's setup (the planner's snapshot), once, as its steps begin.
  if (s.page && PAGE_SETUP[s.page] && pageUndo?.page !== s.page) {
    const undo = await PAGE_SETUP[s.page]();
    if (undo) pageUndo = { page: s.page, undo };
    if (!alive()) return;
  }
  onPhone.value = phone;
  target = el;
  if (el) el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center" });
  await place();
  card.value?.querySelector(".tour-next")?.focus({ preventScroll: true });
  // The step's demo, a moment after its card shows (it's the tour doing it, not the player).
  const demo = el && s.demo && DEMOS[s.demo];
  if (!demo) return;
  await sleep(700);
  if (!alive()) return;
  let r = null;
  try { r = await demo({ el, alive }); } catch {}
  if (!r) return;
  // Kept to undo later, or (the player closed the tour or moved on meanwhile) undone now.
  const undo = r.undo || (() => {});
  const keep = r.until === "page" ? open.value && page.value === s.page : alive();
  if (!keep) { try { undo(); } catch {} return; }
  if (r.until === "page") { if (pageUndo?.page !== s.page) pageUndo = { page: s.page, undo }; }
  else stepUndo = undo;
  await raise();
  if (!alive()) return;
  await nextTick();
  if (r.then) { target = r.then; r.then.scrollIntoView({ block: "nearest" }); }
  await place();
  card.value?.querySelector(".tour-next")?.focus({ preventScroll: true });
}
watch(step, () => open.value && show());
watch(open, (v) => v && show());
const onKey = (e) => {
  if (!open.value) return;
  if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") back();
};
const onMove = () => place();

onMounted(() => {
  window.addEventListener("welcome-tour", start);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onMove);
  window.addEventListener("scroll", onMove, { passive: true, capture: true });
  if (firstVisit) setTimeout(start, 400);
});
onBeforeUnmount(() => {
  window.removeEventListener("welcome-tour", start);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onMove);
  window.removeEventListener("scroll", onMove, { capture: true });
});
</script>

<template>
  <dialog v-if="open" ref="dlg" class="tour" aria-labelledby="tour-title" aria-describedby="tour-text" @cancel.prevent="close">
    <div class="tour-shade" :class="{ dim: !rect }" />
    <div v-if="rect" class="tour-spot" :style="{ top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` }" />
    <div ref="card" class="tour-card" :style="cardPos">
      <p class="tour-count"><span>{{ chapter(cur) }}</span> · {{ step + 1 }} of {{ STEPS.length }}</p>
      <h2 id="tour-title">{{ cur.title }}</h2>
      <p id="tour-text">{{ text }}</p>
      <div class="tour-actions">
        <button v-if="step === 0" type="button" class="btn" @click="close">Not now</button>
        <template v-else>
          <button type="button" class="text-btn tour-skip" @click="close">Skip tour</button>
          <button v-if="nextPage > 0" type="button" class="text-btn tour-skip-page" @click="skipPage">Skip this page</button>
          <button type="button" class="btn" @click="back">Back</button>
        </template>
        <button type="button" class="btn gold tour-next" @click="next">{{ step === 0 ? "Show me around" : last ? "Done" : "Next" }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.tour {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  overflow: visible;
}
.tour::backdrop { background: transparent; }
.tour-shade { position: fixed; inset: 0; }
.tour-shade.dim { background: rgb(0 0 0 / 0.62); }
.tour-spot {
  position: fixed;
  border-radius: 8px;
  box-shadow: 0 0 0 2px var(--gold), 0 0 0 200vmax rgb(0 0 0 / 0.62);
  pointer-events: none;
  transition: top 0.2s, left 0.2s, width 0.2s, height 0.2s;
}
.tour-card {
  position: fixed;
  width: min(360px, calc(100vw - 32px));
  padding: 18px 20px 16px;
  border: 1px solid var(--border);
  border-top: 2px solid var(--gold);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
}
.tour-count { margin: 0 0 6px; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; }
.tour-count span { color: var(--gold); }
.tour-card h2 { margin: 0 0 8px; color: var(--gold); font-size: 1.15rem; }
.tour-card p#tour-text { margin: 0 0 16px; font-size: 0.875rem; line-height: 1.5; }
.tour-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
.tour-skip { margin-right: auto; font-size: 0.8125rem; }
.tour-skip-page { font-size: 0.8125rem; }
@media (prefers-reduced-motion: reduce) { .tour-spot { transition: none; } }
</style>
