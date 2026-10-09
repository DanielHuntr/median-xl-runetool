<script setup>
// Colour theme picker: a button showing the current theme, opening a panel of theme cards,
// each a small preview drawn in that theme's colours (THEMES in useRunetool.js). Choosing a
// card applies it at once and leaves the panel open to try others; Esc, the × or a click
// outside closes it. The cards are a radio group: arrow keys move between them.
import { ref, computed, nextTick, onBeforeUnmount } from "vue";
import Icon from "./AppIcon.vue";
import { useRunetool, THEMES } from "../composables/useRunetool.js";

const { theme } = useRunetool();
const open = ref(false), root = ref(null), trigger = ref(null), panel = ref(null);
const groups = [...new Set(THEMES.map((t) => t[2]))].map((g) => ({ name: g, themes: THEMES.filter((t) => t[2] === g) }));
const current = computed(() => THEMES.find((t) => t[0] === theme.value) || THEMES[0]);
const LIGHT = THEMES.find((t) => t[0] === "light")[3], DARK = THEMES.find((t) => t[0] === "dark")[3];
// A theme's preview colours; Auto shows light and Classic side by side.
const colours = (t) => t[3] || null;
const swatch = computed(() => {
  const c = colours(current.value);
  return c ? { background: `linear-gradient(135deg, ${c[0]} 50%, ${c[2]} 50%)` } : { background: `linear-gradient(135deg, ${LIGHT[0]} 50%, ${DARK[0]} 50%)` };
});

function onDocClick(e) {
  if (open.value && !root.value?.contains(e.target)) close();
}
function onKey(e) {
  if (e.key === "Escape" && open.value) { e.preventDefault(); close(true); }
}
async function toggle() {
  open.value = !open.value;
  if (open.value) {
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey);
    await nextTick();
    panel.value?.querySelector('[aria-checked="true"]')?.focus();
  } else close();
}
function close(focusTrigger = false) {
  open.value = false;
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onKey);
  if (focusTrigger) trigger.value?.focus();
}
onBeforeUnmount(() => close());
const choose = (v) => (theme.value = v);
// Arrow keys move between the cards (in reading order).
function move(e) {
  const cards = [...panel.value.querySelectorAll('[role="radio"]')];
  const i = cards.indexOf(document.activeElement);
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step || i < 0) return;
  e.preventDefault();
  cards[(i + step + cards.length) % cards.length].focus();
}
</script>
<template>
  <div ref="root" class="theme-picker">
    <button ref="trigger" class="theme-trigger" :aria-expanded="open" aria-haspopup="dialog" aria-controls="theme-panel" @click="toggle">
      <span class="theme-swatch" :style="swatch" aria-hidden="true"></span>
      <span class="theme-trigger-text"><small>Theme</small>{{ current[1] }}</span>
      <Icon name="chevron" class="theme-chevron" />
    </button>
    <div v-if="open" id="theme-panel" ref="panel" class="theme-panel" role="dialog" aria-label="Colour theme" @keydown="move">
      <div class="theme-panel-head">
        <b>Colour theme</b>
        <button class="icon-btn" aria-label="Close" @click="close(true)"><Icon name="close" /></button>
      </div>
      <section v-for="g in groups" :key="g.name" class="theme-group">
        <h3 :id="`theme-group-${g.name}`">{{ g.name }}</h3>
        <div class="theme-grid" role="radiogroup" :aria-labelledby="`theme-group-${g.name}`">
          <button v-for="t in g.themes" :key="t[0]" class="theme-card" role="radio" :aria-checked="theme === t[0]"
            :tabindex="theme === t[0] ? 0 : -1" @click="choose(t[0])">
            <!-- A tiny window in the theme's colours. -->
            <span v-if="colours(t)" class="theme-preview" :style="{ background: colours(t)[0] }" aria-hidden="true">
              <span class="theme-preview-panel" :style="{ background: colours(t)[1], color: colours(t)[3] }">
                <span class="theme-preview-bar" :style="{ background: colours(t)[2] }"></span>Aa
              </span>
            </span>
            <span v-else class="theme-preview theme-preview-auto" aria-hidden="true">
              <span :style="{ background: LIGHT[0] }"><i :style="{ background: LIGHT[1], color: LIGHT[3] }">Aa</i></span>
              <span :style="{ background: DARK[0] }"><i :style="{ background: DARK[1], color: DARK[3] }">Aa</i></span>
            </span>
            <span class="theme-name">{{ t[1] }}<small v-if="!colours(t)">Follows your system</small></span>
            <Icon v-if="theme === t[0]" name="check" class="theme-check" />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.theme-picker { position: relative; }
.theme-trigger { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 12px 6px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--field); color: var(--text); }
.theme-trigger:hover, .theme-trigger[aria-expanded="true"] { border-color: var(--gold); background: var(--raised); }
.theme-swatch { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border); box-shadow: inset 0 0 0 1px #0002; flex: none; }
.theme-trigger-text { display: grid; text-align: left; line-height: 1.15; font-size: 0.875rem; }
.theme-trigger-text small { color: var(--muted); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; }
.theme-chevron { width: 14px; height: 14px; color: var(--muted); transform: rotate(90deg); transition: transform 0.15s; }
.theme-trigger[aria-expanded="true"] .theme-chevron { transform: rotate(-90deg); }
.theme-panel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; width: min(480px, calc(100vw - 32px)); max-height: min(78vh, 640px); overflow: auto;
  padding: 14px 16px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); box-shadow: 0 16px 48px var(--shade); }
.theme-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.theme-panel-head b { font-family: var(--serif); color: var(--gold); font-size: 1.0625rem; }
.theme-group h3 { margin: 12px 0 8px; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
.theme-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 420px) { .theme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.theme-card { position: relative; display: grid; gap: 6px; padding: 6px 6px 8px; border: 1px solid var(--soft-border); border-radius: 8px; background: var(--field); color: var(--text); text-align: left; }
.theme-card:hover { border-color: var(--gold); background: var(--raised); }
.theme-card[aria-checked="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset; }
.theme-preview { display: block; height: 56px; border-radius: 5px; padding: 8px; border: 1px solid #0003; overflow: hidden; }
.theme-preview-panel { display: flex; align-items: center; gap: 6px; height: 100%; padding: 0 8px; border-radius: 4px; font-family: var(--serif); font-size: 1rem; font-weight: 700; }
.theme-preview-bar { width: 6px; align-self: stretch; margin: 6px 0; border-radius: 3px; }
.theme-preview-auto { display: grid; grid-template-columns: 1fr 1fr; padding: 0; }
.theme-preview-auto > span { display: grid; padding: 8px 6px; }
.theme-preview-auto i { display: grid; place-items: center; border-radius: 4px; font-style: normal; font-family: var(--serif); font-weight: 700; }
.theme-name { display: grid; padding: 0 2px; font-size: 0.8125rem; line-height: 1.25; }
.theme-name small { color: var(--muted); font-size: 0.75rem; }
.theme-check { position: absolute; top: 10px; right: 10px; width: 16px; height: 16px; padding: 2px; border-radius: 50%; background: var(--gold); color: var(--panel); }
</style>
