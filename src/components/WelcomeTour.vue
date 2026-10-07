<script setup>
// A short welcome tour: what each part of the site is for, one step at a time, with the part
// it's about highlighted (the sidebar on a desktop; the menu or search button on a phone).
// It opens by itself for a first-time visitor, on whichever page they arrive (a shared link
// included): one who hasn't seen it and has none of the site's data in this browser yet.
// Closing it in any way counts as seen; "Welcome tour" in the More menu opens it again.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const KEY = "mxlrw2:welcome";
const searchKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K";
const nav = (id) => `.sidebar nav [data-page="${id}"]`;
const MENU = ".mobile-top .mobile-menu";
const STEPS = [
  { title: "Welcome to the Median XL Runetool", text: "A companion for Median XL 2.14: find runewords and uniques, work out cube recipes and plan your character. Item data comes from the game's own files. Want a quick look around?" },
  { at: ".sidebar .nav-search", phone: ".mobile-top [aria-label='Search the site']", title: "Search everything", phoneText: "Type an item, runeword, skill or recipe and jump straight to it.", text: `Type an item, runeword, skill or recipe and jump straight to it. The shortcut is ${searchKey}.` },
  { at: nav("runewords"), phone: MENU, title: "Runeword Finder", phoneText: "In the menu. Mark the runes you have under My Runes to see what you can make right now. New character? Starter runewords lists the ones made only of common runes.", text: "Mark the runes you have under My Runes to see what you can make right now. New character? Starter runewords lists the ones made only of common runes." },
  { at: nav("uniques"), phone: MENU, title: "Uniques and sets", phoneText: "In the menu: every tiered unique at every tier, plus sacred uniques and sets. A card's cube button loads the recipe that makes or upgrades the item.", text: "Every tiered unique at every tier, plus sacred uniques and sets. A card's cube button loads the recipe that makes or upgrades the item." },
  { at: nav("cube"), phone: MENU, title: "Cube Recipes", phoneText: "In the menu. Put items in the Horadric Cube and see what comes out, straight from the game's recipe table.", text: "Put items in the Horadric Cube and see what comes out, straight from the game's recipe table." },
  { at: nav("planner"), phone: MENU, title: "Character Planner", phoneText: "In the menu. Skills, attributes, gear and a mercenary in one place, with damage and stats worked out from the game's formulas. Plan each levelling stage separately: Normal, Nightmare, Hell and Endgame.", text: "Skills, attributes, gear and a mercenary in one place, with damage and stats worked out from the game's formulas. Plan each levelling stage separately: Normal, Nightmare, Hell and Endgame." },
  { at: nav("builds"), phone: MENU, title: "Builds", phoneText: "In the menu. Builds you save appear there. Share any build as a link, or publish it for other players to find.", text: "Builds you save appear here. Share any build as a link, or publish it for other players to find." },
  { at: ".sidebar .side-account", phone: MENU, title: "No account needed", phoneText: "Everything works without signing in, and is kept in this browser. Sign in with Google from the menu if you want your builds and filters on any device.", text: "Everything works without signing in, and is kept in this browser. Sign in with Google if you want your builds and filters on any device." },
  { at: ".sidebar .side-more", phone: MENU, title: "Bugs and ideas", phoneText: "Found a bug or have an idea? The links are at the foot of the menu, along with backups and this tour if you want it again. Good hunting!", text: "Found a bug or have an idea? It's under More, along with backups and this tour if you want it again. Good hunting!" },
];

// Read as the page starts, before anything is saved: someone who has used the site has some of
// this (settings written on every load, such as the theme and the sidebar's, don't count).
const USED = ["state", "owned", "stars", "planner", "saved-builds", "loot-filters", "browse", "tuQuery", "oskills", "cube-ctx"];
const firstVisit = (() => {
  try { return !localStorage.getItem(KEY) && !USED.some((k) => localStorage.getItem(`mxlrw2:${k}`) != null); } catch { return false; }
})();

const open = ref(false), step = ref(0), rect = ref(null), card = ref(null), cardPos = ref({});
// Pointing at the phone layout's menu or search button: that step's phone wording.
const onPhone = ref(false);
const text = computed(() => (onPhone.value && cur.value.phoneText) || cur.value.text);
const cur = computed(() => STEPS[step.value]);
const last = computed(() => step.value === STEPS.length - 1);
let lastFocus = null;

const done = () => { try { localStorage.setItem(KEY, "done"); } catch {} };
function start() {
  lastFocus = document.activeElement;
  step.value = 0;
  open.value = true;
}
function close() {
  open.value = false;
  done();
  lastFocus?.focus?.();
}
const next = () => (last.value ? close() : step.value++);
const back = () => step.value > 0 && step.value--;

// The highlighted part and where the card goes: beside it (the sidebar), else below or
// above it, else (nothing to point at) in the middle of the screen.
function target() {
  const s = cur.value;
  for (const sel of [s.at, s.phone]) {
    const el = sel && document.querySelector(sel);
    if (el && el.offsetParent && el.getClientRects().length) return { el, phone: sel === s.phone };
  }
  return { el: null, phone: window.innerWidth < 760 };
}
async function place() {
  if (!open.value) return;
  const { el, phone } = target();
  onPhone.value = phone;
  el?.scrollIntoView?.({ block: "nearest" });
  const r = el?.getBoundingClientRect();
  rect.value = r ? { top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 } : null;
  await nextTick();
  const c = card.value?.getBoundingClientRect();
  if (!c) return;
  const vw = window.innerWidth, vh = window.innerHeight, m = 16;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  if (!r) cardPos.value = { left: `${(vw - c.width) / 2}px`, top: `${(vh - c.height) / 2}px` };
  else if (r.right + m + c.width <= vw - m) cardPos.value = { left: `${r.right + m}px`, top: `${clamp(r.top - 8, m, vh - c.height - m)}px` };
  else {
    const below = r.bottom + m + c.height <= vh - m;
    cardPos.value = { left: `${clamp(r.left, m, vw - c.width - m)}px`, top: `${below ? r.bottom + m : Math.max(m, r.top - m - c.height)}px` };
  }
}
watch([open, step], async () => {
  if (!open.value) return;
  await nextTick();
  await place();
  card.value?.querySelector(".tour-next")?.focus();
});
const onKey = (e) => {
  if (!open.value) return;
  if (e.key === "Escape") { e.preventDefault(); close(); }
  else if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") back();
};
const onResize = () => place();

onMounted(() => {
  window.addEventListener("welcome-tour", start);
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  if (firstVisit) setTimeout(start, 400);
});
onBeforeUnmount(() => {
  window.removeEventListener("welcome-tour", start);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", onResize);
});
</script>

<template>
  <div v-if="open" class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
    <div class="tour-shade" :class="{ dim: !rect }" @click="close" />
    <div v-if="rect" class="tour-spot" :style="{ top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` }" />
    <div ref="card" class="tour-card" :style="cardPos">
      <p class="tour-count" aria-hidden="true">{{ step + 1 }} of {{ STEPS.length }}</p>
      <h2 id="tour-title">{{ cur.title }}</h2>
      <p id="tour-text">{{ text }}</p>
      <div class="tour-actions">
        <button v-if="step === 0" type="button" class="btn" @click="close">Not now</button>
        <template v-else>
          <button type="button" class="text-btn tour-skip" @click="close">Skip tour</button>
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
  width: min(340px, calc(100vw - 32px));
  padding: 18px 20px 16px;
  border: 1px solid var(--border);
  border-top: 2px solid var(--gold);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
}
.tour-count { margin: 0 0 6px; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; }
.tour-card h2 { margin: 0 0 8px; color: var(--gold); font-size: 1.15rem; }
.tour-card p#tour-text { margin: 0 0 16px; font-size: 0.875rem; line-height: 1.5; }
.tour-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
.tour-skip { margin-right: auto; font-size: 0.8125rem; }
@media (prefers-reduced-motion: reduce) { .tour-spot { transition: none; } }
</style>
