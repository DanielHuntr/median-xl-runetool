<script setup>
// The Horadric Cube: put items in, transmute, and see what the game does with them. Recipes
// are the game's own table (src/cube/engine.js); the guide below is the docs' summary.
import { computed, reactive, ref, shallowRef, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import Icon from "./AppIcon.vue";
import CubeRecipeCard from "./CubeRecipeCard.vue";
import CubeGrid from "./CubeGrid.vue";
import CubeIcon from "./CubeIcon.vue";
import CubeItemInfo from "./CubeItemInfo.vue";
import { CUBE_GROUPS, JEWEL_PRESETS } from "../data/cube-recipes.js";
import { createCube, CLASSES, DIFFICULTIES, QUALITIES } from "../cube/engine.js";

const cube = shallowRef(null);
const loadError = ref("");
onMounted(async () => {
  try {
    cube.value = createCube((await import("../data/cube-main.json")).default);
  } catch (err) {
    loadError.value = String(err?.message || err);
  }
  applyLink();
  window.addEventListener("hashchange", applyLink);
});
onBeforeUnmount(() => window.removeEventListener("hashchange", applyLink));

// Links from the catalogue pages ("Made in the Horadric Cube"): #cube?make=unique:Brainhack
// or #cube?make=item:Eth loads the recipe that makes it.
const linkNote = ref("");
function applyLink() {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const make = params.get("make");
  if (!make || !cube.value) return;
  const [kind, ...rest] = make.split(":");
  const target = rest.join(":");
  history.replaceState(null, "", "#cube");
  const m = cube.value.recipeToMake(kind === "unique" ? { unique: target, tier: +params.get("tier") || 0 } : { item: target });
  if (!m) { linkNote.value = `No recipe in the cube makes ${target}.`; return; }
  contents.value = m.contents;
  editing.value = null;
  result.value = null;
  fresh.value = [];
  linkNote.value = m.chance
    ? `Loaded: this recipe makes a random unique ${m.chance}, weighted by rarity; ${target} is one of them. Press Transmute to try it.`
    : m.base
    ? `Loaded: a ${m.base} rerolled as a unique becomes ${target}. Press Transmute to try it.`
    : `Loaded the recipe that makes ${target}. Press Transmute to try it.`;
  nextTick(() => document.getElementById("cube-bench")?.scrollIntoView({ block: "start" }));
}

// The character the recipes are checked for (some are class-, level- or difficulty-bound).
const saved = (() => { try { return JSON.parse(localStorage.getItem("mxlrw2:cube-ctx")) || {}; } catch { return {}; } })();
const ctx = reactive({ cls: 0, level: 120, difficulty: 2, ...saved });
watch(ctx, () => { try { localStorage.setItem("mxlrw2:cube-ctx", JSON.stringify(ctx)); } catch {} });

const contents = ref([]);
const editing = ref(null);
const result = ref(null);
const before = ref(null);
const grid = ref(null);
const fresh = ref([]);
const full = ref("");

// Into the cube, if there's room for it (items take their inventory size).
function add(item) {
  if (!item) return;
  if (grid.value && !grid.value.fits(item)) {
    full.value = `No room in the cube for ${cube.value.itemName(item)}.`;
    return;
  }
  full.value = "";
  contents.value = [...contents.value, item];
  result.value = null;
  fresh.value = [];
}
function dropped(key) {
  const e = entries.value.find((x) => x.key === key);
  if (e) add(e.make(rankOf(e).fit));
}
function select(id) {
  editing.value = editing.value === id ? null : id;
}
function remove(id) {
  contents.value = contents.value.filter((it) => it.id !== id);
  if (editing.value === id) editing.value = null;
  result.value = null;
}
function empty() {
  contents.value = [];
  editing.value = null;
  result.value = null;
}
function update(id, patch) {
  contents.value = contents.value.map((it) => (it.id === id ? { ...it, ...patch } : it));
  result.value = null;
}
function setStat(id, stat, value) {
  const it = contents.value.find((x) => x.id === id);
  update(id, { stats: { ...it.stats, [stat]: value } });
}
function transmute() {
  const r = cube.value.transmute(contents.value, ctx);
  editing.value = null;
  if (r.matched) {
    before.value = contents.value;
    contents.value = r.contents;
    fresh.value = r.contents.map((it) => it.id);
    result.value = { matched: true, text: cube.value.describe(r.recipe), effects: r.effects, notes: r.notes || [], random: r.random, unchecked: r.unchecked };
  } else {
    const near = cube.value.suggest(contents.value, ctx, { max: 2, limit: 3 });
    result.value = { matched: false, near };
  }
}
function undo() {
  contents.value = before.value;
  before.value = null;
  result.value = null;
}
function loadRecipe(recipe) {
  contents.value = cube.value.load(recipe);
  editing.value = null;
  result.value = null;
  document.getElementById("cube-bench")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
// Add what a suggestion is missing.
function fillMissing(s) {
  for (const m of s.missing) for (let k = 0; k < m.qty; k++) add(cube.value.exampleFor(m));
}

const name = (it) => cube.value.itemName(it);
const editItem = computed(() => contents.value.find((it) => it.id === editing.value) || null);
const editChecks = computed(() => (editItem.value ? cube.value.checks(editItem.value.code) : null));
const editSpecials = computed(() => (editItem.value ? cube.value.specialsFor(editItem.value.code) : []));
const editVersions = computed(() => (editItem.value ? cube.value.variantsOf(editItem.value.code) : null));
function chooseVersion(code) {
  update(editing.value, { code, name: cube.value.items.get(code).name, special: 0 });
}
const equipment = (it) => ["weapon", "armor"].includes(cube.value.items.get(it.code)?.group);
function chooseSpecial(value) {
  const [q, id] = value.split(":").map(Number);
  update(editing.value, id ? { quality: q, special: id } : { special: 0, quality: editItem.value.quality === 7 || editItem.value.quality === 5 ? 2 : editItem.value.quality });
}

// The item list: every item some recipe uses, plus the unique and set items recipes name.
const GROUPS = [
  ["all", "All"], ["reagent", "Reagents"], ["rune", "Runes"], ["gem", "Gems & jewels"], ["orb", "Mystic orbs"], ["shrine", "Shrines"],
  ["jewelry", "Jewelry & charms"], ["special", "Uniques & sets"], ["weapon", "Weapons"], ["armor", "Armor"], ["other", "Other"],
];
// Groups by the game's item types (all of Median XL's gems are type "gem", quivers are the
// arrow and bolt types), then by name for reagents the types don't single out.
function groupOf(it) {
  const n = `${it.name} ${it.sub}`;
  const is = (...types) => types.some((t) => it.types.has(t));
  if (/Shrine/.test(it.name)) return "shrine";
  if (is("rune", "erun") || (/\bRune\b/.test(n) && it.group === "misc")) return "rune";
  // The "Great" gems (Great Rainbow Stone) aren't the gem type, so they go by name.
  if (is("gem", "jewl") || (it.group === "misc" && /\b(Amethyst|Topaz|Sapphire|Emerald|Ruby|Diamond|Skull|Onyx|Bloodstone|Turquoise|Amber|Rainbow Stone)$/.test(it.name))) return "gem";
  if (is("myst")) return "orb";
  if (is("misl", "bowq", "xboq")) return "weapon";
  if (is("amul", "ring", "char", "cycl")) return "jewelry";
  if (is("trph", "trfr", "embl", "esse") || /Reagent|Catalyst|Oil of|Arcane|Corrupted|Essence|Soul|Signet|Container|Cluster/.test(n)) return "reagent";
  if (it.group === "weapon" || it.group === "armor") return it.group;
  return "other";
}
// List order: gems by gem, then grade (Chipped to Perfect, then Great); runes in the game's
// order (their codes run El r01 to Zod); everything else by name.
const GRADES = ["Chipped", "Flawed", "", "Flawless", "Perfect", "Great"];
function orderKey(e) {
  if (e.group === "gem") {
    const m = /^(Chipped|Flawed|Flawless|Perfect|Great)? ?(.*)$/.exec(e.label);
    return [m[2], GRADES.indexOf(m[1] || "")];
  }
  if (e.group === "rune") return ["", e.key];
  return [e.label, 0];
}
function byOrder(a, b) {
  const [x, i] = orderKey(a), [y, j] = orderKey(b);
  return x.localeCompare(y) || (typeof i === "number" ? i - j : String(i).localeCompare(String(j))) || a.label.localeCompare(b.label);
}
// What the "can it go in" check looks at, without making a cube item.
const probe = (code, quality = 2, special = 0) => ({ code, quality, special, sockets: 0, ethereal: false, stats: {} });
// "Tiers 1–4, Sacred", "1–10 charges".
function versionsText(v) {
  const nums = v.list.map((x) => x.label).filter((l) => /^\d+$/.test(l)).map(Number);
  const named = v.list.map((x) => x.label).filter((l) => !/^\d+$/.test(l));
  const range = nums.length ? (nums.length > 1 ? `${Math.min(...nums)}–${Math.max(...nums)}` : `${nums[0]}`) : "";
  if (v.kind === "Charges") return `${range} charges`;
  return [`${v.kind === "Tier" ? "Tiers" : "Versions"} ${range}`.trim(), ...named].join(", ");
}
const entries = computed(() => {
  const c = cube.value;
  if (!c) return [];
  const out = [], done = new Set();
  for (const it of c.items.values()) {
    const v = c.variantsOf(it.code);
    if (v) {
      // One row for the base; it goes in at the first version that fits the cube.
      if (done.has(v)) continue;
      done.add(v);
      const codes = v.list.map((x) => x.code).filter((code) => c.recipesFor(code).size && c.listed(code));
      if (!codes.length) continue;
      const first = c.items.get(v.default);
      out.push({ key: `v:${first.group}:${v.base}`, label: v.base, art: c.artOf({ code: v.default }), hint: versionsText(v), sub: [versionsText(v), first.sub].filter(Boolean).join(" · "), group: groupOf(first),
        probes: codes.map((code) => probe(code)), make: (fit) => c.makeItem(fit?.code || v.default) });
      continue;
    }
    if (!c.recipesFor(it.code).size || !c.listed(it.code)) continue;
    // Items that share a name say what's different ("base of Mark of the Angiris").
    out.push({ key: it.code, label: it.name, art: c.artOf({ code: it.code }), hint: c.hintOf(it.code), sub: [c.hintOf(it.code), it.sub].filter(Boolean).join(" · "), group: groupOf(it), probes: [probe(it.code)], make: () => c.makeItem(it.code) });
  }
  for (const [list, quality, what] of [[c.data.uniques, 7, "Unique"], [c.data.sets, 5, "Set item"]])
    for (const [id, [label, code]] of Object.entries(list))
      if (c.items.has(code) && c.listed(`${quality}:${id}`)) out.push({ key: `${quality}:${id}`, label, art: c.artOf({ code, quality, special: +id }), hint: c.hintOf(`${quality}:${id}`) || (quality === 7 ? "Unique" : "Set item"), sub: [c.hintOf(`${quality}:${id}`), `${what} · ${c.items.get(code).name}`].filter(Boolean).join(" · "), group: "special", probes: [probe(code, quality, +id)], make: () => c.makeItem(code, { quality, special: +id }) });
  return out.sort(byOrder);
});
const pickQuery = ref("");
const pickGroup = ref("all");
const onlyFitting = ref(true);
// How much each item would help with what's in the cube (src/cube/engine.js steps/rank):
// finishes a recipe, gets one closer, or only adds more of the same to a bulk recipe
// (another unique for disenchanting ten at once). Null steps: the cube is empty.
const steps = computed(() => (cube.value ? cube.value.steps(contents.value, ctx) : null));
const slots = steps;
function rankOf(e) {
  let best = null;
  for (const pr of e.probes) {
    const r = cube.value.rank(pr, steps.value);
    if (!r.fits) continue;
    const better = !best || (best.bulk && !r.bulk) || (best.bulk === r.bulk && r.left < best.left);
    if (better) best = { ...r, fit: pr };
  }
  return best || { fits: false, left: Infinity, bulk: false, fit: null };
}
const shown = computed(() => {
  const words = pickQuery.value.toLowerCase().split(/\s+/).filter(Boolean);
  const list = entries.value.filter((e) => (pickGroup.value === "all" || e.group === pickGroup.value) && words.every((w) => `${e.label} ${e.sub}`.toLowerCase().includes(w)));
  const ranked = list.map((e) => ({ ...e, ...rankOf(e) }));
  if (!steps.value) return ranked;
  const out = onlyFitting.value ? ranked.filter((e) => e.fits) : ranked;
  return out.sort((a, b) => (a.bulk - b.bulk) || (a.left - b.left) || byOrder(a, b));
});
// Hovering a tile shows the item's tooltip, fixed to the screen (the list scrolls).
const tileTip = ref(null);
function showTile(e, ev) {
  const r = ev.currentTarget.getBoundingClientRect();
  const probeItem = cube.value.makeItem(e.probes[0].code, { quality: e.probes[0].quality, special: e.probes[0].special });
  // Beside the tile (to its left, over the page rather than the other tiles) when there's
  // room; otherwise above or below it.
  const beside = r.left > 380;
  const below = r.top < 260;
  const style = beside
    ? { left: `${r.left - 10}px`, top: `${Math.min(Math.max(r.top + r.height / 2, 120), window.innerHeight - 120)}px`, transform: "translate(-100%, -50%)" }
    : { left: `${Math.min(Math.max(r.left + r.width / 2, 180), window.innerWidth - 180)}px`, top: `${below ? r.bottom + 8 : r.top - 8}px`, transform: below ? "translate(-50%, 0)" : "translate(-50%, -100%)" };
  tileTip.value = { item: probeItem, hint: e.hint, style };
}
const hideTile = () => (tileTip.value = null);
// The sections the list shows while the cube has something in it.
const sections = computed(() => {
  if (!steps.value) return null;
  const pick = (fn) => shown.value.filter(fn);
  return [
    { id: "finish", title: "Finishes a recipe", items: pick((e) => e.fits && !e.bulk && e.left === 0) },
    { id: "closer", title: "Gets you closer", items: pick((e) => e.fits && !e.bulk && e.left > 0) },
    { id: "bulk", title: "More of the same", note: "Only for recipes that take several at once, such as disenchanting up to ten uniques with one Catalyst.", items: pick((e) => e.fits && e.bulk), folded: true },
    { id: "other", title: "Doesn't go with what's in the cube", items: pick((e) => !e.fits), folded: true },
  ].filter((sec) => sec.items.length);
});
const PAGE = 60;
const pickLimit = ref(PAGE);
watch([pickQuery, pickGroup, onlyFitting, contents], () => (pickLimit.value = PAGE));

// Recipes with what's in the cube, and the recipe book.
const suggestions = computed(() => (cube.value && contents.value.length ? cube.value.suggest(contents.value, ctx, { max: 3, limit: 24 }) : []));
const bookQuery = ref("");
const bookForCube = ref(true);
const bookFiltered = computed(() => bookForCube.value && contents.value.length > 0);
const bookResults = computed(() => (cube.value && bookQuery.value.trim().length > 1
  ? cube.value.search(bookQuery.value, { limit: 40, ...(bookFiltered.value ? { contents: contents.value, ctx } : {}) }) : []));
const guideGroup = ref(CUBE_GROUPS[0].id);
const guide = computed(() => CUBE_GROUPS.find((g) => g.id === guideGroup.value) || CUBE_GROUPS[0]);
function findInGame(recipe) {
  bookQuery.value = recipe.name.replace(/\s*\(.*\)$/, "");
  document.getElementById("cube-book")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <section class="cube-page">
    <p v-if="loadError" class="cube-error">Couldn't load the cube recipes: {{ loadError }}</p>
    <p v-else-if="!cube" class="cube-loading">Loading the cube recipes…</p>
    <template v-else>
      <div id="cube-bench" class="cube-layout">
        <section class="cube-bench" aria-labelledby="cube-title">
          <header class="cube-bench-head">
            <div>
              <p class="eyebrow">Horadric Cube</p>
              <h2 id="cube-title">Transmute</h2>
            </div>
            <div class="cube-char" role="group" aria-label="Your character" aria-describedby="cube-char-note">
              <label>Class<select v-model.number="ctx.cls"><option v-for="(c, i) in CLASSES" :key="c" :value="i">{{ c }}</option></select></label>
              <label>Level<input v-model.number="ctx.level" type="number" min="1" max="150" inputmode="numeric" /></label>
              <label>Difficulty<select v-model.number="ctx.difficulty"><option v-for="(d, i) in DIFFICULTIES" :key="d" :value="i">{{ d }}</option></select></label>
            </div>
            <p id="cube-char-note" class="cube-char-note">Most recipes work for anyone. These matter for a few: class items and challenge items (413 recipes), Hell-only portals like the Cow Level (19), and level brackets such as the Sunstone of the Twin Seas (36).</p>
          </header>

          <p v-if="linkNote" class="cube-link-note" role="status"><Icon name="cube" /><span>{{ linkNote }}</span><button type="button" class="icon-btn" aria-label="Dismiss" @click="linkNote = ''"><Icon name="close" /></button></p>
          <CubeGrid ref="grid" :cube="cube" :items="contents" :selected="editing" :fresh="fresh" @select="select" @remove="remove" @drop="dropped" />
          <p v-if="full" class="cube-full" role="status">{{ full }}</p>

          <div v-if="editItem" class="cube-edit" :aria-label="`Edit ${name(editItem)}`">
            <header class="cube-edit-head">
              <b>{{ name(editItem) }}</b>
              <button type="button" class="icon-btn" aria-label="Close the editor" @click="editing = null"><Icon name="close" /></button>
            </header>
            <div class="cube-edit-fields">
              <label v-if="editVersions">{{ editVersions.kind }}
                <select :value="editItem.code" @change="chooseVersion($event.target.value)">
                  <option v-for="x in editVersions.list" :key="x.code" :value="x.code">{{ x.label }}</option>
                </select>
              </label>
              <label v-if="editSpecials.length">Which item
                <select :value="editItem.special ? `${editItem.quality}:${editItem.special}` : '0:0'" @change="chooseSpecial($event.target.value)">
                  <option value="0:0">Any</option>
                  <option v-for="s in editSpecials" :key="`${s.quality}:${s.id}`" :value="`${s.quality}:${s.id}`">{{ s.name }} ({{ s.quality === 7 ? "unique" : "set" }})</option>
                </select>
              </label>
              <label v-if="!editItem.special && (editChecks.quality || equipment(editItem))">Quality
                <select :value="editItem.quality" @change="update(editItem.id, { quality: +$event.target.value })">
                  <option v-for="(q, k) in QUALITIES" :key="k" :value="+k">{{ q }}</option>
                </select>
              </label>
              <label v-if="editChecks.sockets || equipment(editItem)">Sockets (0–{{ cube.maxSocketsOf(editItem.code) }})
                <input type="number" min="0" :max="cube.maxSocketsOf(editItem.code)" :value="editItem.sockets" @change="update(editItem.id, { sockets: Math.max(0, Math.min(cube.maxSocketsOf(editItem.code), +$event.target.value || 0)) })" />
              </label>
            </div>
            <label v-if="editChecks.ethereal || equipment(editItem)" class="switch cube-edit-switch"><input type="checkbox" role="switch" :checked="editItem.ethereal" @change="update(editItem.id, { ethereal: $event.target.checked })" />Ethereal</label>
            <details v-if="editChecks.stats.length" class="cube-edit-more">
              <summary>Has anything already been done to this item? <span>Optional</span></summary>
              <p class="cube-edit-help">Some recipes only work once, or while a count is below a limit. Leave these alone for a fresh item; set them to match one you already have.</p>
              <ul class="cube-states">
                <li v-for="s in editChecks.stats" :key="s.stat">
                  <span class="cube-state-text">
                    <b :id="`state-${editItem.id}-${s.stat}`">{{ s.label }}</b>
                    <small v-if="s.checkedBy.length">Checked by {{ s.checkedBy.join(", ") }}</small>
                  </span>
                  <label v-if="s.flag" class="switch"><input type="checkbox" role="switch" :aria-labelledby="`state-${editItem.id}-${s.stat}`" :checked="!!editItem.stats[s.stat]" @change="setStat(editItem.id, s.stat, $event.target.checked ? 1 : 0)" /></label>
                  <input v-else type="number" min="0" :max="s.max" :aria-labelledby="`state-${editItem.id}-${s.stat}`" :value="editItem.stats[s.stat] ?? 0" @change="setStat(editItem.id, s.stat, Math.max(0, Math.min(s.max, +$event.target.value || 0)))" />
                </li>
              </ul>
            </details>
          </div>

          <div class="cube-actions">
            <button type="button" class="btn gold cube-go" :disabled="!contents.length" @click="transmute"><Icon name="cube" />Transmute</button>
            <button v-if="before && result?.matched" type="button" class="btn" @click="undo">Undo</button>
            <button type="button" class="text-btn" :disabled="!contents.length" @click="empty">Empty the cube</button>
            <span class="cube-count">{{ contents.length }} item{{ contents.length === 1 ? "" : "s" }}</span>
          </div>

          <div v-if="result" class="cube-result" :class="{ ok: result.matched }" aria-live="polite">
            <template v-if="result.matched">
              <b>Transmuted</b>
              <p>{{ result.text.inputs.join(" + ") }} <span aria-hidden="true">→</span> {{ result.text.outputs.map((o) => o.name).join(" + ") }}</p>
              <p v-for="e in result.effects" :key="e" class="cube-effect">{{ e }}</p>
              <p v-for="n in result.notes" :key="n" class="cube-note">{{ n }}</p>
              <p v-if="result.text.blocked" class="cube-note">The game hands these back unchanged: this combination isn't allowed.</p>
              <p v-if="result.random" class="cube-note">This recipe has random results: transmute again (after Undo) to see another.</p>
              <p v-if="result.unchecked" class="cube-note">This recipe also checks something the simulator doesn't know (a quest, an event, or a value on the item such as its required level). In game it may do nothing.</p>
            </template>
            <template v-else>
              <b>Nothing happens</b>
              <p>No recipe takes exactly these items{{ contents.length ? "" : "" }}. The cube needs every ingredient and nothing extra.</p>
              <p v-for="n in result.near" :key="n.recipe.row" class="cube-note">
                <template v-if="n.missingCount">Add {{ n.missingText.join(", ") }} to make {{ n.text.outputs.map((o) => o.name).join(" + ") }}.</template>
                <template v-else>{{ n.text.outputs.map((o) => o.name).join(" + ") }} needs: {{ n.text.conditions.join(", ") }}.</template>
              </p>
            </template>
          </div>
        </section>

        <aside class="cube-picker" aria-labelledby="cube-picker-title">
          <h2 id="cube-picker-title" class="sr-only">Add items</h2>
          <label class="search"><Icon name="search" /><input v-model="pickQuery" type="search" placeholder="Find an item, rune or reagent" aria-label="Find an item" /></label>
          <div class="chips cube-groups" role="group" aria-label="Item groups">
            <button v-for="[g, label] in GROUPS" :key="g" type="button" :aria-pressed="pickGroup === g" @click="pickGroup = g">{{ label }}</button>
          </div>
          <label v-if="contents.length" class="switch cube-fit"><input v-model="onlyFitting" type="checkbox" />Hide items that don't go with what's in the cube</label>
          <div v-if="sections" class="cube-sections">
            <p v-if="!sections.length" class="cube-list-empty">Nothing here goes with what's in the cube.</p>
            <details v-for="sec in sections" :key="sec.id" class="cube-sec" :open="!sec.folded">
              <summary><b>{{ sec.title }}</b> <span>{{ sec.items.length }}</span></summary>
              <p v-if="sec.note" class="cube-sec-note">{{ sec.note }}</p>
              <ul class="cube-tiles">
                <li v-for="e in sec.items.slice(0, sec.id === 'finish' ? 999 : pickLimit)" :key="e.key">
                  <button
                    type="button"
                    draggable="true"
                    :class="{ dim: !e.fits }"
                    :aria-label="`Add ${e.label}${e.hint ? ` (${e.hint})` : ''}`"
                    @click="add(e.make(e.fit))"
                    @dragstart="(ev) => { hideTile(); ev.dataTransfer.setData('text/x-cube-item', e.key); ev.dataTransfer.effectAllowed = 'copy'; }"
                @mouseenter="(ev) => showTile(e, ev)"
                @mouseleave="hideTile"
                @focus="(ev) => showTile(e, ev)"
                @blur="hideTile"
                  >
                    <CubeIcon :art="e.art" :size="48" />
                    <b>{{ e.label }}</b>
                    <small v-if="e.hint" class="cube-hint">{{ e.hint }}</small>
                  </button>
                </li>
              </ul>
              <button v-if="sec.id !== 'finish' && sec.items.length > pickLimit" type="button" class="show-more" @click="pickLimit += PAGE">Show more ({{ sec.items.length - pickLimit }})</button>
            </details>
          </div>
          <ul v-else class="cube-tiles">
            <li v-for="e in shown.slice(0, pickLimit)" :key="e.key">
              <button
                type="button"
                draggable="true"
                :class="{ dim: !e.fits }"
                :title="`${e.label}${e.sub ? ` (${e.sub})` : ''}${e.fits ? '' : ': no recipe uses this with what\'s in the cube'}`"
                @click="add(e.make(e.fit))"
                @dragstart="(ev) => { hideTile(); ev.dataTransfer.setData('text/x-cube-item', e.key); ev.dataTransfer.effectAllowed = 'copy'; }"
                @mouseenter="(ev) => showTile(e, ev)"
                @mouseleave="hideTile"
                @focus="(ev) => showTile(e, ev)"
                @blur="hideTile"
              >
                <CubeIcon :art="e.art" :size="48" />
                <b>{{ e.label }}</b>
                <small v-if="e.hint" class="cube-hint">{{ e.hint }}</small>
              </button>
            </li>
            <li v-if="!shown.length" class="cube-list-empty">{{ slots ? "Nothing here goes with what's in the cube." : "No items match." }}</li>
          </ul>
          <button v-if="!sections && shown.length > pickLimit" type="button" class="show-more" @click="pickLimit += PAGE">Show more ({{ shown.length - pickLimit }})</button>
          <div v-if="tileTip" class="cube-tip cube-tip-fixed" :style="tileTip.style" role="tooltip">
            <CubeItemInfo :cube="cube" :item="tileTip.item" :hint="tileTip.hint" />
            <small>Click or drag into the cube</small>
          </div>
        </aside>
      </div>

      <section v-if="suggestions.length" class="cube-section" aria-labelledby="cube-suggest-title">
        <header>
          <p class="eyebrow">From the game's recipe table</p>
          <h2 id="cube-suggest-title">Recipes with what's in your cube</h2>
        </header>
        <div class="cube-recipes">
          <CubeRecipeCard v-for="s in suggestions" :key="s.recipe.row" :entry="s" :ready="s.ready">
            <template #status>
              <span v-if="s.ready" class="cube-tag ok">Ready to transmute</span>
              <span v-else-if="s.missingCount" class="cube-tag">Missing: {{ s.missingText.join(", ") }}</span>
            </template>
            <button v-if="s.missingCount" type="button" class="btn" @click="fillMissing(s)">Add missing</button>
          </CubeRecipeCard>
        </div>
      </section>

      <section id="cube-book" class="cube-section" aria-labelledby="cube-book-title">
        <header class="cube-book-head">
          <div>
            <p class="eyebrow">Recipe book</p>
            <h2 id="cube-book-title">Every recipe in the game</h2>
          </div>
          <label class="search"><Icon name="search" /><input v-model="bookQuery" type="search" placeholder="Search recipes: Eth Rune, signet, shrine, Arcane Crystal…" aria-label="Search the recipe book" /></label>
        </header>
        <label v-if="contents.length" class="switch cube-book-filter"><input v-model="bookForCube" type="checkbox" />Only recipes that use what's in the cube</label>
        <template v-if="bookQuery.trim().length > 1">
          <p class="cube-book-count">{{ bookResults.length ? `${bookResults.length}${bookResults.length === 40 ? "+" : ""} recipes${bookFiltered ? " for what's in the cube" : ""}` : bookFiltered ? "No recipe for what's in the cube mentions that." : "No recipe mentions that." }}</p>
          <div class="cube-recipes">
            <CubeRecipeCard v-for="r in bookResults" :key="r.recipe.row" :entry="r">
              <button type="button" class="btn" @click="loadRecipe(r.recipe)">Load into the cube</button>
            </CubeRecipeCard>
          </div>
        </template>
        <p v-else-if="bookFiltered" class="cube-book-count">Search to look up recipes for what's in the cube; the ones it's closest to are listed above.</p>
        <div v-else class="cube-guide">
          <p class="cube-guide-intro">A summary of the recipes from the official docs. Search above for the game's own recipes, or open a group.</p>
          <div class="chips" role="group" aria-label="Recipe groups">
            <button v-for="g in CUBE_GROUPS" :key="g.id" type="button" :aria-pressed="guideGroup === g.id" @click="guideGroup = g.id">{{ g.title }}</button>
          </div>
          <p class="cube-guide-summary">{{ guide.summary }}</p>
          <ul class="cube-guide-list">
            <li v-for="r in guide.recipes" :key="r.name">
              <div><b>{{ r.name }}</b><small v-if="r.note">{{ r.note }}</small></div>
              <p>{{ r.input }} <span aria-hidden="true">→</span> {{ r.output }}</p>
              <button type="button" class="text-btn" @click="findInGame(r)">Find in the game's recipes</button>
            </li>
          </ul>
          <table v-if="guide.id === 'jewelcrafting'" class="cube-jewels">
            <caption>Jewel preset costs</caption>
            <thead><tr><th>Gold</th><th>Preset modifier</th></tr></thead>
            <tbody><tr v-for="[cost, stat] in JEWEL_PRESETS" :key="cost + stat"><td>{{ cost }}</td><td>{{ stat }}</td></tr></tbody>
          </table>
          <a class="text-btn" href="https://docs.median-xl.com/doc/items/cube" target="_blank" rel="noopener">Cube page in the official docs <Icon name="arrow" /></a>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.cube-page { display: grid; gap: 28px; padding-bottom: 32px; }
.cube-loading, .cube-error { color: var(--muted); padding: 24px 0; }
.cube-error { color: var(--bad); }
.cube-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr); gap: 20px; align-items: start; }
.cube-bench, .cube-picker { border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.cube-bench { padding: 20px; display: grid; gap: 14px; }
.cube-bench-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px; }
.cube-bench-head h2, .cube-section h2 { margin: 0; color: var(--gold); font-family: var(--serif); }
.eyebrow { margin: 0 0 4px; }
.cube-char { display: flex; flex-wrap: wrap; gap: 8px; }
.cube-char-note { flex-basis: 100%; margin: 0; color: var(--muted); font-size: 0.75rem; line-height: 1.5; }
.cube-char label, .cube-edit label { display: grid; gap: 4px; color: var(--muted); font-size: 0.75rem; }
.cube-char select, .cube-char input, .cube-edit select, .cube-edit input[type="number"] { min-height: 36px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--field); color: var(--text); font: inherit; font-size: 0.875rem; }
.cube-char input { width: 72px; }
.cube-edit label.switch { display: inline-flex; align-items: center; gap: 9px; color: var(--text); font-size: 0.8125rem; }
.cube-edit { display: grid; gap: 12px; padding: 12px 14px; border: 1px solid var(--gold); border-radius: 8px; background: var(--field); }
.cube-edit-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cube-edit-head b { color: var(--gold); font-size: 0.9375rem; }
.cube-edit-head .icon-btn { width: 28px; height: 28px; }
.cube-edit-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px 12px; }
.cube-edit-fields select, .cube-edit-fields input { width: 100%; }
.cube-edit-switch { justify-self: start; color: var(--text); }
.cube-edit-more { border-top: 1px solid var(--soft-border); padding-top: 10px; }
.cube-edit-more summary { cursor: pointer; color: var(--text); font-size: 0.8125rem; }
.cube-edit-more summary span { margin-left: 6px; color: var(--muted); font-size: 0.75rem; }
.cube-edit-more summary:hover { color: var(--gold); }
.cube-edit-help { margin: 6px 0 0; color: var(--muted); font-size: 0.75rem; line-height: 1.5; }
.cube-states { list-style: none; margin: 8px 0 0; padding: 0; }
.cube-states li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--soft-border); }
.cube-state-text { display: grid; gap: 2px; min-width: 0; }
.cube-state-text b { color: var(--text); font-size: 0.8125rem; font-weight: 500; }
.cube-state-text small { color: var(--muted); font-size: 0.6875rem; line-height: 1.35; }
.cube-states input[type="number"] { width: 72px; }
.cube-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.cube-go { min-height: 44px; padding-inline: 20px; font-size: 0.9375rem; }
.cube-go:disabled { opacity: 0.5; cursor: default; }
.cube-count { margin-left: auto; color: var(--muted); font-size: 0.8125rem; }
.cube-result { display: grid; gap: 4px; padding: 12px 14px; border: 1px dashed var(--border); border-radius: 8px; background: var(--field); }
.cube-result.ok { border-style: solid; border-color: var(--gold); }
.cube-result b { color: var(--muted); font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
.cube-result.ok b { color: var(--gold); }
.cube-result p { margin: 0; line-height: 1.5; }
.cube-effect { color: var(--gold); }
.cube-note { color: var(--muted); font-size: 0.8125rem; }
/* Item picker */
.cube-picker { padding: 14px; display: grid; gap: 10px; position: sticky; top: 16px; }
.cube-picker .search { display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--field); }
.cube-picker .search input { flex: 1; min-width: 0; min-height: 40px; border: 0; background: none; color: var(--text); outline: none; }
.cube-picker .search:focus-within { border-color: var(--gold); }
.cube-picker .search svg { width: 16px; color: var(--muted); }
.cube-groups { margin: 0; gap: 5px; }
.cube-groups button { padding: 5px 9px; font-size: 0.75rem; }
.cube-fit { font-size: 0.8125rem; }
.cube-tiles { list-style: none; margin: 0; padding: 2px; display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; max-height: min(560px, 60vh); overflow-y: auto; }
.cube-tiles button { width: 100%; height: 100%; display: grid; justify-items: center; align-content: start; gap: 4px; padding: 8px 4px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text); cursor: grab; }
.cube-tiles button:hover, .cube-tiles button:focus-visible { background: var(--raised); border-color: var(--soft-border); }
.cube-tiles button:active { cursor: grabbing; }
.cube-tiles button.dim { opacity: 0.4; }
.cube-tiles b { font-weight: 500; font-size: 0.75rem; line-height: 1.25; text-align: center; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cube-tiles small { color: var(--gold); opacity: 0.85; font-size: 0.6875rem; line-height: 1.2; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cube-sections { display: grid; gap: 6px; max-height: min(620px, 66vh); overflow: hidden auto; padding-right: 2px; }
.cube-sections > * { min-width: 0; }
.cube-sections .cube-tiles { max-height: none; overflow: visible; }
.cube-sec summary { display: flex; align-items: baseline; gap: 8px; padding: 6px 4px; cursor: pointer; list-style: none; border-bottom: 1px solid var(--soft-border); }
.cube-sec summary::-webkit-details-marker { display: none; }
.cube-sec summary::before { content: "▸"; color: var(--muted); font-size: 0.75rem; transition: transform 0.15s; }
.cube-sec[open] summary::before { transform: rotate(90deg); }
.cube-sec summary b { font-size: 0.8125rem; color: var(--gold); }
.cube-sec summary span { color: var(--muted); font-size: 0.75rem; }
.cube-sec-note { margin: 6px 4px 2px; color: var(--muted); font-size: 0.75rem; line-height: 1.45; }
.cube-tip-fixed { position: fixed; }
.cube-link-note { display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 10px 8px 12px; border: 1px solid var(--gold); border-radius: 8px; background: var(--gold-bg); color: var(--text); font-size: 0.8125rem; }
.cube-link-note > svg { width: 16px; flex-shrink: 0; color: var(--gold); }
.cube-link-note span { flex: 1; }
.cube-link-note .icon-btn { width: 26px; height: 26px; }
.cube-full { margin: 0; color: var(--bad); font-size: 0.8125rem; }
.cube-tiles .cube-list-empty { grid-column: 1 / -1; list-style: none; }
.cube-list-empty { padding: 14px 10px; color: var(--muted); font-size: 0.875rem; }
/* Recipe cards */
.cube-section { display: grid; gap: 14px; }
.cube-section > header, .cube-book-head { padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.cube-book-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; }
.cube-book-head .search { display: flex; align-items: center; gap: 8px; flex: 0 1 460px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--field); }
.cube-book-head .search input { flex: 1; min-width: 0; min-height: 40px; border: 0; background: none; color: var(--text); outline: none; }
.cube-book-head .search svg { width: 16px; color: var(--muted); }
.cube-book-count { margin: 0; color: var(--muted); font-size: 0.875rem; }
.cube-recipes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cube-tag { padding: 2px 8px; border-radius: 999px; background: var(--raised); color: var(--muted); font-size: 0.75rem; }
.cube-tag.ok { background: var(--gold-bg); color: var(--gold); }
.cube-book-filter { font-size: 0.8125rem; }
.cube-guide { display: grid; gap: 12px; }
.cube-guide-intro, .cube-guide-summary { margin: 0; color: var(--muted); }
.cube-guide .chips { margin: 0; }
.cube-guide-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.cube-guide-list li { display: grid; grid-template-columns: minmax(180px, 0.5fr) minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.cube-guide-list li > div { display: grid; gap: 3px; }
.cube-guide-list small { color: var(--muted); font-size: 0.75rem; line-height: 1.4; }
.cube-guide-list p { margin: 0; line-height: 1.5; font-size: 0.875rem; }
.cube-jewels { width: 100%; border-collapse: collapse; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.cube-jewels caption { text-align: left; color: var(--gold); padding: 0 0 8px; font-weight: 600; }
.cube-jewels th, .cube-jewels td { padding: 8px 12px; border-top: 1px solid var(--border); text-align: left; }
.cube-jewels td:first-child { color: var(--gold); white-space: nowrap; }
/* Side by side, the picker is exactly as tall as the cube: it adds nothing to the row's
   height (height 0), fills it (min-height 100%), and its item list scrolls inside. */
@media (min-width: 1101px) {
  .cube-layout { align-items: stretch; }
  .cube-picker { position: static; height: 0; min-height: 100%; display: flex; flex-direction: column; }
  .cube-picker > .cube-sections, .cube-picker > .cube-tiles { flex: 1 1 0; min-height: 0; max-height: none; overflow: hidden auto; }
}
@media (max-width: 1100px) {
  .cube-layout { grid-template-columns: minmax(0, 1fr); }
  .cube-picker { position: static; }
  .cube-recipes { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .cube-bench { padding: 14px; }
  .cube-box { grid-template-columns: minmax(0, 1fr); }
  .cube-guide-list li { grid-template-columns: minmax(0, 1fr); gap: 6px; }
}
</style>
