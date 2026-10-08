<script setup>
// A custom item's magic, rare or crafted affixes, from the game's affix tables (items.js
// chosenAffixes): the ones that fit its base and item level, within the quality's limits, one
// per group. Emits the item's new { affixes, magic, crafted, ilvl }.
import { computed, ref } from "vue";
import Icon from "../AppIcon.vue";
import { AFFIX_LIMIT, affixesFor } from "../../planner/items.js";

const props = defineProps({
  // The resolved item: r.affixes = { types, picked, rules, ilvl, quality }, r.state its saved state.
  item: { type: Object, required: true },
});
const emit = defineEmits(["update"]);

const quality = computed(() => props.item.affixes?.quality || "rare");
const limit = computed(() => AFFIX_LIMIT[quality.value]);
const picked = computed(() => props.item.affixes?.picked || []);
const ilvl = computed(() => props.item.affixes?.ilvl ?? null);
const all = computed(() => affixesFor(props.item.affixes?.types, { magic: quality.value === "magic", procsOnly: props.item.affixes?.rules.procsOnly, ilvl: ilvl.value }));
const query = ref("");
const label = (a) => `${a.lines.join(", ")}${a.req ? ` (level ${a.req})` : ""}`;
function options(kind) {
  const taken = new Set(picked.value.map((a) => a.group));
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  const repeat = props.item.affixes?.rules.repeatProcs;
  return all.value.filter((a) => a.kind === kind && (repeat || !taken.has(a.group))
    && words.every((w) => a.lines.join(" ").toLowerCase().includes(w)))
    .sort((a, b) => a.lines[0].localeCompare(b.lines[0]) || a.req - b.req);
}
const full = (kind) => picked.value.length >= limit.value.total || picked.value.filter((a) => a.kind === kind).length >= limit.value.each;
const choice = ref({ p: "", s: "" });
// The saved state, changed: switching quality or item level keeps every chosen affix, and
// items.js counts those that still fit.
const send = (patch) => emit("update", {
  affixes: props.item.state.affixes || [], magic: quality.value === "magic", crafted: quality.value === "crafted", ilvl: props.item.state.ilvl, ...patch,
});
function add(kind) {
  if (!choice.value[kind] || full(kind)) return;
  send({ affixes: [...picked.value.map((a) => a.id), choice.value[kind]] });
  choice.value[kind] = "";
}
const remove = (id) => send({ affixes: picked.value.map((a) => a.id).filter((x) => x !== id) });
const setQuality = (q) => send({ magic: q === "magic", crafted: q === "crafted" });
function setIlvl(v) {
  const n = Math.round(Number(v));
  send({ ilvl: n >= 1 && n <= 150 ? n : undefined });
}
const QUALITIES = [["rare", "Rare"], ["crafted", "Crafted"], ["magic", "Magic"]];
const KINDS = [["p", "Prefixes", "a prefix"], ["s", "Suffixes", "a suffix"]];
const summary = computed(() => {
  const { each, total } = limit.value;
  if (quality.value === "crafted") return `up to ${total} random rare affixes (at most ${each} of a kind) beside the shrine's own bonuses, added under Added bonuses`;
  return `${each} prefix${each > 1 ? "es" : ""} and ${each} suffix${each > 1 ? "es" : ""}${quality.value === "rare" ? " from the rare affixes" : ""}`;
});
</script>

<template>
  <div v-if="item.affixes?.types" class="sockets item-affixes">
    <h3>Affixes</h3>
    <div class="affix-row">
      <div class="affix-quality" role="group" aria-label="Item quality">
        <button v-for="[q, name] in QUALITIES" :key="q" type="button" :aria-pressed="quality === q" @click="setQuality(q)">{{ name }}</button>
      </div>
      <label class="field-inline affix-ilvl" title="An item's level is the level of the monster or area that dropped it. Affixes need at least their own level, and some stop rolling above a maximum."
        >Item level <input type="number" min="1" max="150" :value="ilvl" @change="setIlvl($event.target.value)" aria-label="Item level"
      /></label>
    </div>
    <p class="muted">
      From the game's affix tables, those that fit this base at item level {{ ilvl }}: {{ summary }}, one from each group.
      <template v-if="item.affixes.rules.procsOnly"> This base rolls procs only{{ item.affixes.rules.repeatProcs ? ", and the same one more than once" : "" }}.</template>
    </p>
    <ul v-if="picked.length">
      <li v-for="a in picked" :key="a.id">
        <span><b>{{ a.kind === "p" ? "Prefix" : "Suffix" }}</b><small>{{ label(a) }}</small></span>
        <button class="text-btn" :aria-label="`Remove ${a.lines.join(', ')}`" @click="remove(a.id)">Remove</button>
      </li>
    </ul>
    <label class="search affix-search"><Icon name="search" /><input v-model="query" type="search" placeholder="Filter affixes, e.g. resist or Flamefront" aria-label="Filter affixes" /></label>
    <select v-for="[kind, title, one] in KINDS" :key="kind" v-model="choice[kind]" class="add-select" :aria-label="`Add ${one}`" :disabled="full(kind)" @change="(e) => { choice[kind] = e.target.value; add(kind); }">
      <option value="">{{ full(kind) ? `${title}: no more on this item` : `+ Add ${one} (${options(kind).length})…` }}</option>
      <option v-for="a in options(kind)" :key="a.id" :value="a.id">{{ label(a) }}</option>
    </select>
  </div>
</template>

<style scoped>
.affix-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.affix-quality { display: inline-flex; gap: 4px; }
.affix-quality button { padding: 4px 10px; border: 1px solid var(--soft-border); border-radius: 6px; background: var(--field); color: var(--muted); }
.affix-quality button[aria-pressed="true"] { color: var(--text); border-color: var(--gold); }
.affix-search { margin: 6px 0; }
.affix-ilvl { margin: 0; }
.affix-ilvl input { width: 64px; }
.item-affixes select { max-width: 100%; }
</style>
