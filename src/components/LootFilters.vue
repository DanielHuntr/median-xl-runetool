<script setup>
// Loot filters: the community's (median-xl.com Filter Exchange, via /api/filters) and the
// player's own, edited here and exported in the same JSON. Item classes and codes come from
// the game files (filter-data.json); the filter logic is in filters/lootFilter.js.
import { tabKeys } from "../tabKeys.js";
import { ref, computed, onMounted, nextTick, watch } from "vue";
import Icon from "./AppIcon.vue";
import FD from "../data/filter-data.json";
import { QUALITIES, ETHEREAL, MAX_RULES, newRule, cleanFilter, exportFilter, importFilter, describeRule } from "../filters/lootFilter.js";
import { useSavedFilters, MAX_FILTERS } from "../filters/savedFilters.js";

const SITE = "https://www.median-xl.com/filters/index.php";
const CLASSES = FD.classes;
const className = (id) => CLASSES.find((c) => c.id === id)?.name ?? `class ${id}`;
const itemByCode = new Map(FD.items.map((i) => [i.code, i]));
const itemLabel = (i) => `${i.name} (${i.id})`;
const itemByLabel = new Map(FD.items.map((i) => [itemLabel(i), i]));
const itemName = (code) => itemByCode.get(code)?.name ?? `item ${code}`;
const words = (r) => describeRule(r, { className, itemName });

const tab = ref("community");
const message = ref(""), tone = ref("info");
// Status messages fade after a few seconds.
let sayTimer = null;
const say = (m, t = "info") => {
  message.value = m; tone.value = t;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => (message.value = ""), t === "warn" ? 8000 : 4000);
};

// ---------- Community filters
const list = ref(null), listError = ref(""), query = ref(""), cls = ref("");
const opened = ref(null); // { meta, filter } | { meta, error } | { meta, loading }
const rulesDialog = ref(null);
onMounted(async () => {
  try {
    const res = await fetch("/api/filters");
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    list.value = body.filters;
  } catch (e) {
    listError.value = String(e.message || e);
  }
});
const classes = computed(() => [...new Set((list.value || []).map((f) => f.cls))].sort());
const shown = computed(() => (list.value || []).filter((f) => (!cls.value || f.cls === cls.value)
  && `${f.name} ${f.author} ${f.description.join(" ")}`.toLowerCase().includes(query.value.trim().toLowerCase())));
// A filter's rules open in a modal (closed with Esc, the × or a click outside).
const closeRules = () => { rulesDialog.value?.close(); opened.value = null; };
async function view(meta) {
  opened.value = { meta, loading: true };
  await nextTick();
  if (!rulesDialog.value?.open) rulesDialog.value?.showModal();
  try {
    const res = await fetch(`/api/filters?id=${meta.id}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    // Only if it's still the open one (it may have been closed or another opened meanwhile).
    if (opened.value?.meta.id === meta.id) opened.value = { meta, filter: cleanFilter(body.filter) };
  } catch (e) {
    if (opened.value?.meta.id === meta.id) opened.value = { meta, error: String(e.message || e) };
  }
}

// ---------- My filters
const { filters, add, remove } = useSavedFilters();
const selectedId = ref(filters.value[0]?.id ?? null);
watch(selectedId, () => (expanded.value = null));
const current = computed(() => filters.value.find((f) => f.id === selectedId.value) || null);
function create(filter, from = "") {
  const entry = add(filter, from);
  if (!entry) return say(`You can keep up to ${MAX_FILTERS} filters. Delete one first.`, "warn");
  selectedId.value = entry.id;
  tab.value = "mine";
  return entry;
}
const editCopy = (o) => {
  closeRules();
  // Named as it is listed (its JSON name can differ, e.g. an older name).
  if (create({ ...o.filter, name: `${o.meta.name} (copy)`.slice(0, 60) }, `${o.meta.name} by ${o.meta.author} (median-xl.com filter ${o.meta.id})`))
    say(`Copied "${o.meta.name}" to your filters.`);
};
const importText = ref(""), importing = ref(false);
function doImport(text = importText.value) {
  try {
    create(importFilter(text), "Imported");
    importText.value = "";
    importing.value = false;
    say("Filter imported.");
  } catch (e) {
    say(e.message, "warn");
  }
}
async function importFile(e) {
  const file = e.target.files?.[0];
  if (file) doImport(await file.text());
  e.target.value = "";
}
function deleteCurrent() {
  if (!current.value || !window.confirm(`Delete "${current.value.filter.name}"?`)) return;
  remove(current.value.id);
  selectedId.value = filters.value[0]?.id ?? null;
}
async function copyJson() {
  const text = exportFilter(current.value.filter);
  try { await navigator.clipboard.writeText(text); say("Filter JSON copied."); }
  catch { window.prompt("Copy the filter JSON:", text); }
}
function download() {
  const f = current.value.filter;
  const url = URL.createObjectURL(new Blob([exportFilter(f)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${f.name.replace(/[^\w -]+/g, "").trim() || "filter"}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

// Rule editing (the rule objects are edited in place; the saved list persists itself). One
// rule's editor is open at a time; the list shows each rule as a line of words.
const rules = computed(() => current.value?.filter.rules || []);
const expanded = ref(null);
const toggle = (i) => (expanded.value = expanded.value === i ? null : i);
// A new rule goes at the end, opened, scrolled to and focused, so a long filter doesn't
// leave it out of sight.
async function addRule() {
  if (rules.value.length >= MAX_RULES) return;
  rules.value.push(newRule());
  const i = rules.value.length - 1;
  expanded.value = i;
  await nextTick();
  const el = document.getElementById(`lf-rule-${i}`);
  el?.closest(".lf-rule")?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.querySelector("select")?.focus({ preventScroll: true });
}
const move = (i, d) => {
  const r = rules.value;
  if (i + d < 0 || i + d >= r.length) return;
  [r[i], r[i + d]] = [r[i + d], r[i]];
  if (expanded.value === i) expanded.value = i + d;
  else if (expanded.value === i + d) expanded.value = i;
};
const dup = (i) => { if (rules.value.length < MAX_RULES) { rules.value.splice(i + 1, 0, JSON.parse(JSON.stringify(rules.value[i]))); expanded.value = i + 1; } };
const drop = (i) => { rules.value.splice(i, 1); if (expanded.value === i) expanded.value = null; else if (expanded.value > i) expanded.value--; };
// In-game item colours for the quality word.
const QUALITY_CLASS = { 1: "q-low", 3: "q-sup", 4: "q-magic", 5: "q-set", 6: "q-rare", 7: "q-unique", 8: "q-crafted", 9: "q-honor" };
const qualityName = (v) => QUALITIES.find(([q]) => q === v)?.[1];
const target = (r) => (r.rule_type === 0 ? className(r.params.class) : r.rule_type === 1 ? itemName(r.params.code) : "Any item");
function conditions(r) {
  const out = [];
  if (r.ethereal) out.push(r.ethereal === 1 ? "Ethereal" : "Not ethereal");
  const range = (lo, hi, w) => (lo && hi ? `${w} ${lo}–${hi}` : lo ? `${w} ≥ ${lo}` : hi ? `${w} ≤ ${hi}` : null);
  for (const x of [range(r.min_clvl, r.max_clvl, "Char lvl"), range(r.min_ilvl, r.max_ilvl, "Item lvl")]) if (x) out.push(x);
  return out;
}
function setTarget(r, type) {
  r.rule_type = Number(type);
  r.params = r.rule_type === 0 ? { class: CLASSES[0].id } : r.rule_type === 1 ? { code: FD.items[0].code } : null;
}
const itemText = (r) => (r.rule_type === 1 ? (itemByCode.has(r.params.code) ? itemLabel(itemByCode.get(r.params.code)) : String(r.params.code)) : "");
function setItem(r, text) {
  const hit = itemByLabel.get(text) || FD.items.find((i) => i.name.toLowerCase() === text.trim().toLowerCase());
  if (hit) r.params = { code: hit.code };
  else say(`No item called "${text}". Pick one from the list.`, "warn");
}
const level = (v) => Math.max(0, Math.min(150, Math.floor(Number(v) || 0)));
</script>
<template>
  <section class="loot-filters" aria-label="Loot filters">
    <div class="tabs" role="tablist" aria-label="Loot filters" @keydown="tabKeys">
      <button role="tab" :aria-selected="tab === 'community'" :tabindex="tab === 'community' ? 0 : -1" @click="tab = 'community'">Community filters</button>
      <button role="tab" :aria-selected="tab === 'mine'" :tabindex="tab === 'mine' ? 0 : -1" @click="tab = 'mine'">My filters<span v-if="filters.length" class="badge">{{ filters.length }}</span></button>
    </div>
    <p v-if="message" class="lf-message" :class="tone" role="status">{{ message }}</p>

    <!-- Community filters -->
    <div v-if="tab === 'community'" role="tabpanel">
      <p class="muted">
        Shared on the <a :href="SITE" target="_blank" rel="noopener">median-xl.com Filter Exchange</a> by their authors. Open one to read its rules or edit a copy.
      </p>
      <div class="lf-toolbar">
        <label class="search"><Icon name="search" /><input v-model="query" type="search" placeholder="Search filters" aria-label="Search filters" /></label>
        <select v-model="cls" aria-label="Class"><option value="">All classes</option><option v-for="c in classes" :key="c">{{ c }}</option></select>
      </div>
      <p v-if="listError" class="warning">The Filter Exchange didn't load ({{ listError }}). <a :href="SITE" target="_blank" rel="noopener">Open it on median-xl.com</a>.</p>
      <p v-else-if="!list" role="status" class="muted">Loading community filters…</p>
      <div v-else class="lf-grid">
        <article v-for="f in shown" :key="f.id" class="lf-card">
          <h3>{{ f.name }}</h3>
          <p class="lf-tags"><span class="lf-tag">{{ f.cls }}</span><span class="lf-tag">{{ f.rules }} rules</span><span class="lf-tag">{{ f.uses.toLocaleString() }} uses</span></p>
          <p class="lf-byline">by {{ f.author }} · updated {{ f.updated }}</p>
          <p class="lf-desc">{{ f.description.join(" ") }}</p>
          <div class="lf-actions">
            <button class="btn gold" aria-haspopup="dialog" @click="view(f)">View rules</button>
            <a class="btn" :href="`${SITE}?mode=view&id=${f.id}`" target="_blank" rel="noopener">On median-xl.com <Icon name="arrow" /></a>
          </div>
        </article>
        <p v-if="!shown.length" class="muted">No filters match.</p>
      </div>
    </div>

<!-- A filter's rules -->
    <dialog ref="rulesDialog" class="lf-dialog" aria-labelledby="lf-dialog-title" @close="opened = null" @click="(e) => e.target === rulesDialog && closeRules()">
      <div v-if="opened" class="lf-dialog-body">
        <header class="lf-dialog-head">
          <div>
            <h2 id="lf-dialog-title">{{ opened.meta.name }}</h2>
            <p class="lf-tags"><span class="lf-tag">{{ opened.meta.cls }}</span><span class="lf-tag">{{ opened.meta.rules }} rules</span><span class="lf-tag">{{ opened.meta.uses.toLocaleString() }} uses</span></p>
            <p class="lf-byline">by {{ opened.meta.author }} · updated {{ opened.meta.updated }}</p>
          </div>
          <button class="icon-btn" aria-label="Close" @click="closeRules">&times;</button>
        </header>
        <div class="lf-dialog-scroll">
          <p v-for="(l, i) in opened.meta.description" :key="i" class="lf-dialog-desc">{{ l }}</p>
          <p v-if="opened.loading" role="status" class="muted">Loading rules…</p>
          <p v-else-if="opened.error" class="warning">Couldn't load the rules ({{ opened.error }}).</p>
          <template v-else>
            <p class="muted lf-dialog-note">Items not matched by a rule are {{ opened.filter.default_show_items ? "shown" : "hidden" }}. Dimmed rules are switched off.</p>
            <ol class="lf-rule-words">
              <li v-for="(r, i) in opened.filter.rules" :key="i" :class="{ off: !r.active, hide: !r.show_item }">{{ words(r) }}</li>
            </ol>
          </template>
        </div>
        <footer class="lf-actions lf-dialog-foot">
          <button class="btn gold" :disabled="!opened.filter" @click="editCopy(opened)">Edit a copy</button>
          <a class="btn" :href="`${SITE}?mode=view&id=${opened.meta.id}`" target="_blank" rel="noopener">On median-xl.com <Icon name="arrow" /></a>
        </footer>
      </div>
    </dialog>

    <!-- My filters -->
    <div v-if="tab === 'mine'" role="tabpanel" class="lf-mine">
      <aside class="lf-list" aria-label="Your filters">
        <div class="lf-list-actions">
          <button class="btn gold" @click="create({ name: 'New filter', rules: [] })">+ New filter</button>
          <button class="btn" :aria-expanded="importing" @click="importing = !importing">Import</button>
        </div>
        <div v-if="importing" class="lf-import">
          <label class="lf-field">Paste filter JSON<textarea v-model="importText" rows="5" spellcheck="false" placeholder="{ &quot;name&quot;: …, &quot;rules&quot;: [ … ] }"></textarea></label>
          <div class="lf-row">
            <button class="btn gold" :disabled="!importText.trim()" @click="doImport()">Import</button>
            <label class="btn">Choose a file<input type="file" accept=".json,application/json" hidden @change="importFile" /></label>
          </div>
        </div>
        <ul v-if="filters.length">
          <li v-for="f in filters" :key="f.id">
            <button :aria-current="f.id === selectedId" @click="selectedId = f.id"><b>{{ f.filter.name }}</b><small>{{ f.filter.rules.length }} rules</small></button>
          </li>
        </ul>
        <p v-else class="muted lf-empty">No filters yet. Start a new one, import one, or edit a copy of a community filter.</p>
        <p class="lf-hint">Saved in this browser.</p>
      </aside>

      <div v-if="current" class="lf-editor">
        <section class="lf-head-card" aria-label="Filter">
          <div class="lf-head-main">
            <label class="lf-field lf-name">Filter name<input v-model="current.filter.name" maxlength="60" /></label>
            <label class="switch"><input type="checkbox" role="switch" v-model="current.filter.default_show_items" />Show items no rule matches</label>
          </div>
          <p v-if="current.from" class="lf-hint">Based on {{ current.from }}.</p>
          <div class="lf-row lf-head-actions">
            <button class="btn gold" @click="copyJson">Copy JSON</button>
            <button class="btn" @click="download">Download .json</button>
            <span class="lf-spacer"></span>
            <button class="btn" @click="create({ ...current.filter, name: `${current.filter.name} (copy)`.slice(0, 60) }, current.from)">Duplicate</button>
            <button class="btn lf-danger" @click="deleteCurrent">Delete</button>
          </div>
          <p class="lf-hint">Exports the same JSON as the Filter Exchange's "Copy to Clipboard".</p>
        </section>

        <div class="lf-rules-head">
          <h3>Rules <span class="lf-count">{{ rules.length }}</span></h3>
          <p class="lf-hint">Kept in this order. Select a rule to edit it.</p>
          <button class="btn gold" :disabled="rules.length >= MAX_RULES" @click="addRule">+ Add rule</button>
        </div>
        <ol v-if="rules.length" class="lf-rules">
          <li v-for="(r, i) in rules" :key="i" class="lf-rule" :class="{ off: !r.active, open: expanded === i }">
            <div class="lf-rule-line">
              <span class="lf-index">{{ i + 1 }}</span>
              <label class="switch lf-rule-switch" :title="r.active ? 'Rule on' : 'Rule off'"><input type="checkbox" role="switch" v-model="r.active" :aria-label="`Rule ${i + 1} on`" /></label>
              <button class="lf-rule-summary" :aria-expanded="expanded === i" :aria-controls="`lf-rule-${i}`" @click="toggle(i)">
                <b :class="r.show_item ? 'lf-show' : 'lf-hide'">{{ r.show_item ? "Show" : "Hide" }}</b>
                <span v-if="r.item_quality !== -1" :class="QUALITY_CLASS[r.item_quality]">{{ qualityName(r.item_quality) }}</span>
                <span class="lf-target">{{ target(r) }}</span>
                <span v-for="c in conditions(r)" :key="c" class="lf-chip">{{ c }}</span>
                <span v-if="r.notify" class="lf-chip lf-chip-on">Notify</span>
                <span v-if="r.automap" class="lf-chip lf-chip-on">Map</span>
              </button>
              <span class="lf-rule-tools">
                <button class="icon-btn" :aria-label="`Move rule ${i + 1} up`" :disabled="i === 0" @click="move(i, -1)">↑</button>
                <button class="icon-btn" :aria-label="`Move rule ${i + 1} down`" :disabled="i === rules.length - 1" @click="move(i, 1)">↓</button>
                <button class="icon-btn" :aria-label="`Duplicate rule ${i + 1}`" title="Duplicate" @click="dup(i)">⧉</button>
                <button class="icon-btn" :aria-label="`Delete rule ${i + 1}`" title="Delete" @click="drop(i)">✕</button>
              </span>
            </div>
            <div v-if="expanded === i" :id="`lf-rule-${i}`" class="lf-rule-edit">
              <label class="lf-field">Action<select v-model="r.show_item"><option :value="true">Show</option><option :value="false">Hide</option></select></label>
              <label class="lf-field">Quality<select v-model="r.item_quality"><option v-for="[v, n] in QUALITIES" :key="v" :value="v">{{ n }}</option></select></label>
              <label class="lf-field">Applies to<select :value="r.rule_type" @change="setTarget(r, $event.target.value)"><option :value="-1">Any item</option><option :value="0">An item type</option><option :value="1">One item</option></select></label>
              <label class="lf-field">Ethereal<select v-model="r.ethereal"><option v-for="[v, n] in ETHEREAL" :key="v" :value="v">{{ n }}</option></select></label>
              <label v-if="r.rule_type === 0" class="lf-field lf-wide">Item type<select v-model="r.params.class"><option v-for="c in CLASSES" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
              <label v-else-if="r.rule_type === 1" class="lf-field lf-wide">Item<input :value="itemText(r)" list="lf-items" placeholder="Start typing an item name" @change="setItem(r, $event.target.value)" /></label>
              <fieldset class="lf-field lf-range"><legend>Character level</legend><input type="number" min="0" max="150" :value="r.min_clvl" aria-label="From character level" @change="r.min_clvl = level($event.target.value)" /><span>to</span><input type="number" min="0" max="150" :value="r.max_clvl" aria-label="To character level" @change="r.max_clvl = level($event.target.value)" /></fieldset>
              <fieldset class="lf-field lf-range"><legend>Item level</legend><input type="number" min="0" max="150" :value="r.min_ilvl" aria-label="From item level" @change="r.min_ilvl = level($event.target.value)" /><span>to</span><input type="number" min="0" max="150" :value="r.max_ilvl" aria-label="To item level" @change="r.max_ilvl = level($event.target.value)" /></fieldset>
              <div class="lf-field lf-toggles"><span>When shown</span><label class="switch"><input type="checkbox" role="switch" v-model="r.notify" />Notify</label><label class="switch"><input type="checkbox" role="switch" v-model="r.automap" />Mark on map</label></div>
              <p class="lf-hint lf-wide">Levels: 0 means no limit.</p>
            </div>
          </li>
        </ol>
        <div v-if="rules.length > 5" class="lf-row lf-add-bottom"><button class="btn" :disabled="rules.length >= MAX_RULES" @click="addRule">+ Add rule</button></div>
        <p v-else-if="!rules.length" class="muted lf-empty">No rules yet. Add one to start.</p>
        <p class="lf-hint">Item types and items are from the Median XL {{ FD.patch }} game files.</p>
        <datalist id="lf-items"><option v-for="i in FD.items" :key="i.code" :value="itemLabel(i)" /></datalist>
      </div>
      <p v-else class="muted lf-empty">Choose a filter, or start a new one.</p>
    </div>
  </section>
</template>
<style scoped>
.loot-filters { padding: 0 24px 32px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button { padding: 8px 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--muted); }
.tabs button[aria-selected="true"] { color: var(--gold); border-color: var(--gold); background: var(--gold-bg); }
.tabs button:hover:not([aria-selected="true"]) { color: var(--text); border-color: var(--gold); background: var(--raised); }
.tabs .badge { margin-left: 8px; }
.lf-message { margin: 0 0 16px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); font-size: 0.875rem; }
.lf-message.warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, var(--border)); }
.lf-message.info { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, var(--border)); }
.lf-toolbar { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 20px; }
.lf-toolbar .search { flex: 1; min-width: 220px; }
.lf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 20px; }
.lf-card { display: flex; flex-direction: column; gap: 10px; padding: 22px 24px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); min-width: 0; }
.lf-card h3 { margin: 0; font-size: 1.125rem; line-height: 1.3; overflow-wrap: anywhere; }
.lf-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.lf-tag { padding: 2px 8px; border: 1px solid var(--soft-border); border-radius: 12px; background: var(--field); color: var(--muted); font-size: 0.75rem; }
.lf-byline { margin: 0; color: var(--muted); font-size: 0.75rem; }
.lf-desc { margin: 4px 0 0; font-size: 0.875rem; line-height: 1.6; color: var(--text); overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.lf-actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; align-items: center; }
.lf-card .lf-actions { margin: auto 0 0; padding-top: 8px; }
.lf-dialog { width: min(820px, calc(100vw - 32px)); max-height: min(86dvh, 900px); padding: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--text); }
.lf-dialog::backdrop { background: var(--shade); }
.lf-dialog[open] { overflow: hidden; }
.lf-dialog-body { display: flex; flex-direction: column; max-height: min(86dvh, 900px); }
.lf-dialog-head { display: flex; justify-content: space-between; gap: 16px; padding: 22px 24px 14px; border-bottom: 1px solid var(--soft-border); }
.lf-dialog-head h2 { margin: 0 0 8px; font-family: var(--serif); color: var(--gold); overflow-wrap: anywhere; }
.lf-dialog-head > div { display: grid; gap: 6px; min-width: 0; }
.lf-dialog-scroll { overflow: auto; padding: 16px 24px; }
.lf-dialog-desc { margin: 0 0 4px; font-size: 0.875rem; line-height: 1.6; }
.lf-dialog-note { margin: 16px 0 0; padding-top: 12px; border-top: 1px solid var(--soft-border); }
.lf-dialog-foot { margin: 0; padding: 14px 24px; border-top: 1px solid var(--soft-border); }
.lf-rule-words { margin: 12px 0 0; padding-left: 32px; font-size: 0.875rem; line-height: 1.7; columns: 2 340px; column-gap: 32px; }
.lf-rule-words .hide { color: var(--muted); }
.lf-rule-words .off { opacity: 0.55; }
.lf-mine { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 24px; align-items: start; }
@media (max-width: 860px) { .lf-mine { grid-template-columns: minmax(0, 1fr); } .lf-list { position: static; } }
.lf-list { display: grid; gap: 12px; position: sticky; top: 16px; }
.lf-list-actions, .lf-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.lf-list-actions .btn { flex: 1; }
.lf-list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.lf-list li button { width: 100%; text-align: left; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); display: grid; gap: 2px; }
.lf-list li button b { font-weight: 600; overflow-wrap: anywhere; }
.lf-list li button small { color: var(--muted); font-size: 0.75rem; }
.lf-list li button[aria-current="true"] { border-color: var(--gold); background: var(--gold-bg); }
.lf-list li button:hover:not([aria-current="true"]) { border-color: var(--gold); background: var(--raised); }
.lf-hint { margin: 0; color: var(--muted); font-size: 0.75rem; line-height: 1.5; }
.lf-empty { margin: 0; padding: 16px; border: 1px dashed var(--border); border-radius: 8px; text-align: center; }
.lf-import { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.lf-import textarea { font-family: ui-monospace, monospace; font-size: 0.75rem; }
/* Form fields: label above, a full-width control below. */
.lf-field { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; border: 0; min-width: 0; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.02em; }
.lf-field legend { padding: 0; margin-bottom: 6px; }
.lf-field input:not([type="checkbox"]), .lf-field select, .lf-field textarea { width: 100%; min-height: 36px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--field); color: var(--text); font: inherit; font-size: 0.875rem; letter-spacing: 0; }
.lf-field input:not([type="checkbox"]):focus-visible, .lf-field select:focus-visible, .lf-field textarea:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
.lf-editor { display: grid; gap: 18px; min-width: 0; }
.lf-head-card { display: grid; gap: 12px; padding: 20px 22px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.lf-head-main { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: end; }
.lf-name { flex: 1; min-width: 240px; }
.lf-name input { font-size: 1rem; font-weight: 600; }
.lf-head-actions { padding-top: 4px; }
.lf-spacer { flex: 1; }
.lf-danger:hover { color: var(--bad); border-color: var(--bad); }
.lf-rules-head { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
.lf-rules-head h3 { margin: 0; font-size: 1rem; }
.lf-rules-head .lf-hint { flex: 1; }
.lf-count { margin-left: 6px; padding: 1px 8px; border-radius: 10px; background: var(--raised); color: var(--muted); font-size: 0.75rem; font-weight: 400; }
.lf-rules { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); overflow: hidden; }
.lf-rule + .lf-rule { border-top: 1px solid var(--soft-border); }
.lf-rule.open { background: var(--field); }
.lf-rule.off .lf-rule-summary { opacity: 0.5; }
.lf-rule-line { display: flex; align-items: center; gap: 10px; padding: 6px 10px 6px 14px; min-height: 48px; }
.lf-index { width: 26px; flex: none; text-align: right; color: var(--muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.lf-rule-switch { min-height: 0; flex: none; }
.lf-rule-summary { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 8px; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--text); text-align: left; font-size: 0.875rem; cursor: pointer; }
.lf-rule-summary:hover, .lf-rule-summary:focus-visible { border-color: var(--border); background: var(--raised); }
.lf-show, .lf-hide { font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 7px; border-radius: 4px; }
.lf-show { color: var(--good); background: color-mix(in srgb, var(--good) 14%, transparent); }
.lf-hide { color: var(--bad); background: color-mix(in srgb, var(--bad) 14%, transparent); }
.lf-target { font-weight: 600; overflow-wrap: anywhere; }
.lf-chip { padding: 1px 8px; border: 1px solid var(--soft-border); border-radius: 10px; color: var(--muted); font-size: 0.75rem; }
.lf-chip-on { color: var(--gold); border-color: var(--border); }
.q-low { color: var(--d2-grey); } .q-sup { color: var(--d2-white); } .q-magic { color: var(--d2-blue); } .q-set { color: var(--d2-green); }
.q-rare { color: var(--d2-yellow); } .q-unique { color: var(--d2-gold); } .q-crafted { color: var(--d2-orange); } .q-honor { color: var(--d2-purple); }
.lf-rule-tools { display: inline-flex; flex: none; gap: 2px; opacity: 0.6; }
.lf-rule-line:hover .lf-rule-tools, .lf-rule-tools:focus-within { opacity: 1; }
.lf-rule-tools .icon-btn { width: 30px; height: 30px; }
.lf-rule-edit { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 16px; padding: 6px 22px 20px 60px; }
@media (max-width: 1180px) { .lf-rule-edit { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lf-rule-edit .lf-range { grid-column: span 1; }
.lf-rule-edit .lf-toggles { grid-column: span 2; }
@media (max-width: 1180px) { .lf-rule-edit .lf-toggles { grid-column: 1 / -1; } }
@media (max-width: 600px) { .lf-rule-edit { padding: 6px 14px 16px; } .lf-rule-tools { opacity: 1; } }
.lf-wide { grid-column: 1 / -1; }
.lf-add-bottom { justify-content: flex-end; }
.lf-range { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; }
.lf-range legend { grid-column: 1 / -1; }
.lf-range span { color: var(--muted); }
.lf-toggles { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
.lf-toggles .switch { color: var(--text); font-size: 0.875rem; letter-spacing: 0; }
.lf-toggles > span { width: 100%; }

</style>
