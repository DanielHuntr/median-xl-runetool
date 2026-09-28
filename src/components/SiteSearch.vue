<script setup>
// Site-wide search (src/search.js), opened with Ctrl+K / ⌘K, "/" outside a text box, or the
// sidebar's Search. Skills come from the planner's data, fetched the first time it opens.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import Icon from "./AppIcon.vue";
import MADE from "../data/cube-made.json";
import { useRunetool } from "../composables/useRunetool.js";
import { buildIndex, search, KINDS } from "../search.js";

const { RW, TUD, SUD, SETD, SOCKD, BASED, reveal } = useRunetool();
const dialog = ref(null);
const input = ref(null);
const query = ref("");
const active = ref(0);
const skills = shallowRef(null);
const skillsNote = ref("");

const index = computed(() => buildIndex({ RW, TUD, SUD: SUD.value, SETD: SETD.value, SOCKD: SOCKD.value, BASED: BASED.value, made: MADE, skills: skills.value }));
const hits = computed(() => search(index.value, query.value, 40));

async function loadSkills() {
  if (skills.value || skillsNote.value === "loading") return;
  skillsNote.value = "loading";
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}planner/data.json?v=${__BUILD_ID__}`);
    if (!res.ok) throw new Error();
    skills.value = (await res.json()).skills;
    skillsNote.value = "";
  } catch {
    skillsNote.value = "Skills couldn't be loaded, so they aren't searched.";
  }
}
function open() {
  if (dialog.value?.open) return input.value?.select();
  active.value = 0;
  dialog.value?.showModal();
  nextTick(() => input.value?.select());
  loadSkills();
}
const close = () => dialog.value?.close();
defineExpose({ open });

function go(e) {
  if (!e) return;
  close();
  if (e.link) {
    window.location.hash = e.link.slice(1);
    window.scrollTo({ top: 0 });
  } else reveal(e.to, e.reveal || e.name);
}
function move(step) {
  const n = hits.value.length;
  if (!n) return;
  active.value = (active.value + step + n) % n;
  nextTick(() => document.getElementById(`search-hit-${active.value}`)?.scrollIntoView({ block: "nearest" }));
}
function onInput() {
  active.value = 0;
}

function onKey(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
  if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey) {
    e.preventDefault();
    open();
  } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !document.querySelector("dialog[open]")) {
    e.preventDefault();
    open();
  }
}
// Other parts of the page (the sidebar) open it with window.dispatchEvent(new Event("site-search")).
onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("site-search", open);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("site-search", open);
});
const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
</script>
<template>
  <dialog ref="dialog" class="site-search" aria-label="Search the site" @click="(e) => { if (e.target === dialog) close(); }">
    <div class="ss-field">
      <Icon name="search" />
      <input
        ref="input"
        v-model="query"
        type="search"
        placeholder="Runewords, uniques, sets, gems, recipes, skills…"
        aria-label="Search the site"
        role="combobox"
        aria-controls="search-hits"
        :aria-expanded="hits.length > 0"
        :aria-activedescendant="hits.length ? `search-hit-${active}` : undefined"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="go(hits[active])"
        @keydown.esc.prevent="close"
      />
      <button type="button" class="ss-esc" aria-label="Close" @click="close">Esc</button>
    </div>
    <ul v-if="hits.length" id="search-hits" class="ss-hits" role="listbox" aria-label="Results">
      <li
        v-for="(h, i) in hits"
        :id="`search-hit-${i}`"
        :key="h.kind + h.name + h.sub"
        role="option"
        :aria-selected="i === active"
        :class="{ active: i === active }"
        @mousemove="active = i"
        @click="go(h)"
      >
        <span class="ss-kind" :class="'k-' + h.kind">{{ KINDS[h.kind] }}</span>
        <span class="ss-name"><b>{{ h.name }}</b><small>{{ h.sub }}</small></span>
        <Icon :name="h.kind === 'cube' ? 'cube' : 'arrow'" class="ss-go" />
      </li>
    </ul>
    <p v-else-if="query.trim()" class="ss-empty">Nothing is called that. Each page's own search also looks through stats.</p>
    <p v-else class="ss-empty">
      Type a name. <kbd>↑</kbd> <kbd>↓</kbd> to choose, <kbd>Enter</kbd> to open.
      <span class="ss-hint">Open this anywhere with <kbd>{{ mac ? "⌘" : "Ctrl" }}</kbd> <kbd>K</kbd> or <kbd>/</kbd>.</span>
    </p>
    <p v-if="skillsNote && skillsNote !== 'loading'" class="ss-empty">{{ skillsNote }}</p>
  </dialog>
</template>
<style scoped>
.site-search { width: min(640px, calc(100vw - 24px)); margin: 12vh auto auto; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); box-shadow: 0 20px 60px rgb(0 0 0 / 0.45); }
.site-search::backdrop { background: var(--shade); }
.ss-field { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--soft-border); }
.ss-field svg { width: 18px; height: 18px; color: var(--muted); flex: none; }
.ss-field input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: inherit; font-size: 1.0625rem; outline: none; }
.ss-field input::-webkit-search-cancel-button { display: none; }
kbd { padding: 1px 6px; border: 1px solid var(--soft-border); border-radius: 4px; background: var(--field); color: var(--muted); font: 0.6875rem/1.5 inherit; font-family: inherit; }
.ss-esc { padding: 1px 7px; border: 1px solid var(--soft-border); border-radius: 4px; background: var(--field); color: var(--muted); font-size: 0.75rem; }
.ss-esc:hover { color: var(--text); border-color: var(--border); }
.ss-hits { list-style: none; margin: 0; padding: 6px; max-height: min(60vh, 520px); overflow-y: auto; }
.ss-hits li { display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.ss-hits li.active { background: var(--gold-bg); }
.ss-kind { color: var(--muted); font-size: 0.6875rem; letter-spacing: 0.06em; text-transform: uppercase; }
.ss-kind.k-sacred, .ss-kind.k-unique { color: var(--gold); }
.ss-kind.k-set, .ss-kind.k-set-item { color: var(--set, #4caf50); }
.ss-name { display: grid; min-width: 0; }
.ss-name b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-name small { color: var(--muted); font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-go { width: 15px; height: 15px; color: var(--muted); opacity: 0; }
.ss-hits li.active .ss-go { opacity: 1; color: var(--gold); }
.ss-empty { margin: 0; padding: 14px 16px; color: var(--muted); font-size: 0.8125rem; line-height: 1.8; }
.ss-hint { display: block; }
@media (max-width: 600px) {
  .site-search { margin-top: 12px; }
  .ss-hits li { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; }
  .ss-kind { grid-column: 1; }
  .ss-name { grid-column: 1; }
  .ss-go { grid-row: 1 / 3; grid-column: 2; }
  .ss-hint { display: none; }
}
</style>
