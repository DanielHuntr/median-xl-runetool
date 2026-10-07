<script setup>
// The welcome tour: page by page, what the site's controls do, in plain words. Each step can
// open a page and highlight a control on it; the card says which page the step is about.
// "Skip this page" jumps to the next page, "Skip tour" stops, and either way the player ends up
// back on the page they started on.
// It opens by itself for a first-time visitor, on whichever page they arrive (a shared link
// included): one who hasn't seen it and has none of the site's data in this browser yet.
// Closing it in any way counts as seen; "Welcome tour" in the More menu opens it again.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRunetool } from "../composables/useRunetool.js";

const { page, nav, PAGES } = useRunetool();
const KEY = "mxlrw2:welcome";
const MENU = ".mobile-top .mobile-menu";
// A step: { page, at: selector, has: text the element contains, title, text, phone?: selector
// on a phone when `at` isn't shown there, phoneText? }. No `at`: a card in the middle.
const STEPS = [
  { title: "Welcome to the Median XL Runetool", text: "A companion for Median XL 2.14: find runewords and uniques, work out cube recipes and plan your character. Item data comes from the game's own files. This tour goes through each page and what its buttons do. It takes a couple of minutes, and you can skip a page or stop at any time." },

  { page: "runewords", at: ".primary-controls .search", title: "Search", text: "Search by a runeword's name, a rune, or a stat. Try \"life\" or \"Ber\" to see every runeword with it." },
  { page: "runewords", at: ".primary-controls .class-picker", title: "Your class", text: "Choose your class to leave out runewords made for other classes." },
  { page: "runewords", at: ".primary-controls .filters-btn", title: "Filters", text: "Narrow the list by item type (bows, helms, shields…), number of sockets, stats and damage type. Each filter you pick shows as a tag you can click to remove." },
  { page: "runewords", at: ".primary-controls .level", title: "Max level", text: "Type your character's level to hide runewords you can't use yet." },
  { page: "runewords", at: ".secondary-controls .btn", has: "My Runes", title: "My Runes", text: "Tell the site which runes you have. The list then shows what you can make right now, and how many runes you're short for the rest." },
  { page: "runewords", at: ".secondary-controls .btn", has: "Starter runewords", title: "Starter runewords", text: "New character? This shows the runewords made only from common runes (El to Ist), lowest level first." },
  { page: "runewords", at: ".rune-card .socket.has-recipe", title: "Runes on a card", text: "A rune you can make in the Horadric Cube links to its recipe. Click it to see what goes in (two Ith make a Tal)." },
  { page: "runewords", at: ".rune-card .card-actions", title: "Star and share", text: "The star saves a runeword to your favourites (the Starred button shows just those). The link icon copies a link to this card to send to someone." },

  { page: "uniques", at: ".unique-card .tier-tabs", title: "Tiers", text: "Most uniques come in four tiers, each stronger than the last. Click I to IV to see each one. A tier marked in red needs a higher level than the Max level you set." },
  { page: "uniques", at: ".unique-card .cube-link-square", title: "Cube button", text: "Opens the Cube Recipes page with this unique's recipe loaded: how to make it, or how to upgrade it to the next tier." },
  { page: "uniques", at: "label.switch", has: "Compare", title: "Compare with next tier", text: "With this on, each card shows what the next tier changes, so you can see whether upgrading is worth it." },
  { page: "uniques", at: ".unique-card .skill-class", title: "Whose skill is it?", text: "A \"+ to a skill\" line has a tag saying which class the skill belongs to. Point at the tag for more." },
  { page: "uniques", at: ".sidebar nav [data-page='sacred-uniques']", phone: MENU, title: "More to browse", text: "Sacred Uniques, Sets, Gems & Runes and Base Items work the same way: search, filters and Max level.", phoneText: "In the menu: Sacred Uniques, Sets, Gems & Runes and Base Items work the same way, with search, filters and Max level." },
  { page: "uniques", at: ".sidebar nav [data-page='oskills']", phone: MENU, title: "Oskills & Procs", text: "Find items that give you a skill from another class, or cast a skill for you when you attack or get hit.", phoneText: "In the menu: Oskills & Procs finds items that give you a skill from another class, or cast a skill for you when you attack or get hit." },

  { page: "cube", at: ".cube-picker", title: "Pick items", text: "Find an item here and click it to put it in the cube: runes, gems, reagents and gear are all listed." },
  { page: "cube", at: ".cube-grid", title: "The cube", text: "What you've put in. Click an item in the cube to change its details, such as quality, level or sockets." },
  { page: "cube", at: ".cube-go", title: "Transmute", text: "Shows what the game would make from what's in the cube, using the game's own recipe table. If nothing matches, it says what's close and what's missing." },
  { page: "cube", at: ".cube-char", title: "Your character", text: "A few recipes depend on your class, level or difficulty. Set them here; most recipes ignore them." },

  { page: "planner", at: ".planner-toolbar", title: "Class and level", text: "Choose your class and level. With \"Raise level automatically\" on, your level goes up as you spend points." },
  { page: "planner", at: ".stage-switch", title: "Stages", text: "Plan each part of the game separately: Normal, Nightmare, Hell and Endgame keep their own skills and gear. The arrow on the open stage lets you rename, duplicate or delete it, and + adds one." },
  { page: "planner", at: ".attr-panel", title: "Attributes", text: "Spend attribute points. Life, damage and what you can equip update straight away." },
  { page: "planner", at: ".doll-panel", title: "Equipment", text: "Click a slot to choose an item, then add sockets, runes and orbs to it. An item you can't wear yet is flagged." },
  { page: "planner", at: ".suggest-btn", title: "Suggest gear", text: "Not sure what to wear? This picks items that suit your skills and level." },
  { page: "planner", at: ".skills-panel .skills-tree", title: "Skills", text: "Click a skill to add a point and right-click to take one away (hold Shift for ten at a time). Point at a skill to see what it does at your level." },
  { page: "planner", at: ".planner-actions .btn", has: "Stats", title: "Stats", text: "Opens your full character sheet: damage for each skill, defence, resistances and more, worked out from the game's own formulas." },
  { page: "planner", at: "[role='tab']", has: "Mercenary", title: "Mercenary", text: "Hire a mercenary and plan their gear too. The aura or buff they give you counts in your stats." },
  { page: "planner", at: ".planner-actions", title: "Save and share", text: "Save build keeps it in this browser (and your account, if you sign in). Share build copies a link anyone can open." },

  { page: "builds", at: ".build-library", title: "Builds", text: "Your saved builds, and builds other players have published. Opening one shows it in the planner, and your own build for that class is kept to go back to." },
  { page: "filters", at: ".loot-filters .tabs", title: "Loot filters", text: "Community filters from median-xl.com, and your own. Open one to read its rules, or make a copy to edit." },

  { at: ".sidebar .side-account", phone: MENU, title: "No account needed", text: "Everything works without signing in, and is kept in this browser. Sign in with Google if you want your builds and filters on any device.", phoneText: "Everything works without signing in, and is kept in this browser. Sign in with Google from the menu if you want your builds and filters on any device." },
  { at: ".sidebar .side-more", phone: MENU, title: "Bugs and ideas", text: "Found a bug or have an idea? It's under More, along with backups and this tour if you want it again. Good hunting!", phoneText: "Found a bug or have an idea? The links are at the foot of the menu, along with backups and this tour if you want it again. Good hunting!" },
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

const done = () => { try { localStorage.setItem(KEY, "done"); } catch {} };
function start() {
  lastFocus = document.activeElement;
  startPage = page.value;
  step.value = 0;
  open.value = true;
}
function close() {
  open.value = false;
  done();
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
  const ph = s.phone && document.querySelector(s.phone);
  if (shown(ph)) return { el: ph, phone: true };
  return { el: null, phone: window.innerWidth < 760 };
}
async function waitFor(s, mine) {
  const until = Date.now() + 8000;
  for (;;) {
    const f = find(s);
    if (f.el || !s.at || Date.now() > until || mine !== token) return f;
    await new Promise((r) => setTimeout(r, 120));
  }
}

// The highlight, and the card beside the element (the sidebar), else below or above it, else
// at the foot of the screen (a tall panel); nothing to point at: the middle of the screen.
let target = null;
async function place() {
  if (!open.value) return;
  const r = target?.getBoundingClientRect();
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
  if (s.page && page.value !== s.page) nav(s.page);
  target = null;
  rect.value = null;
  const { el, phone } = await waitFor(s, mine);
  if (mine !== token || !open.value) return;
  onPhone.value = phone;
  target = el;
  if (el) el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center" });
  await place();
  card.value?.querySelector(".tour-next")?.focus({ preventScroll: true });
}
watch([open, step], () => open.value && show());
const onKey = (e) => {
  if (!open.value) return;
  if (e.key === "Escape") { e.preventDefault(); close(); }
  else if (e.key === "ArrowRight") next();
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
  <div v-if="open" class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
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
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 1000; }
.tour-shade { position: absolute; inset: 0; }
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
