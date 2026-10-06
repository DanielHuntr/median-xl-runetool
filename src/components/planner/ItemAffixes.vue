<script setup>
// A custom item's magic or rare affixes, from the game's affix tables (items.js chosenAffixes):
// the ones that fit its base, three prefixes and three suffixes on a rare or crafted item, one
// of each on a magic item, one per group. Emits { affixes, magic }.
import { computed, ref } from "vue";
import Icon from "../AppIcon.vue";
import { AFFIX_LIMIT, affixesFor } from "../../planner/items.js";

const props = defineProps({
  // The resolved item: r.affixes = { types, picked, rules }, r.state = its saved state.
  item: { type: Object, required: true },
});
const emit = defineEmits(["update"]);

const magic = computed(() => !!props.item.state.magic);
const picked = computed(() => props.item.affixes?.picked || []);
const limit = computed(() => AFFIX_LIMIT[magic.value ? "magic" : "rare"]);
const all = computed(() => affixesFor(props.item.affixes?.types, { magic: magic.value, procsOnly: props.item.affixes?.rules.procsOnly }));
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
const full = (kind) => picked.value.filter((a) => a.kind === kind).length >= limit.value;
const choice = ref({ p: "", s: "" });
const ids = () => picked.value.map((a) => a.id);
function add(kind) {
  if (!choice.value[kind] || full(kind)) return;
  emit("update", { affixes: [...ids(), choice.value[kind]], magic: magic.value });
  choice.value[kind] = "";
}
const remove = (id) => emit("update", { affixes: ids().filter((x) => x !== id), magic: magic.value });
// Switching quality keeps the affixes that still fit (items.js drops the rest).
const setMagic = (m) => emit("update", { affixes: ids(), magic: m });
const KINDS = [["p", "Prefixes", "a prefix"], ["s", "Suffixes", "a suffix"]];
</script>

<template>
  <div v-if="item.affixes?.types" class="sockets item-affixes">
    <h3>Affixes</h3>
    <div class="affix-quality" role="group" aria-label="Item quality">
      <button type="button" :aria-pressed="!magic" @click="setMagic(false)">Rare or crafted</button>
      <button type="button" :aria-pressed="magic" @click="setMagic(true)">Magic</button>
    </div>
    <p class="muted">
      From the game's affix tables, those that fit this base: {{ limit }} prefix{{ limit > 1 ? "es" : "" }} and {{ limit }} suffix{{ limit > 1 ? "es" : "" }}, one from each group.
      <template v-if="item.affixes.rules.procsOnly"> This base rolls procs only{{ item.affixes.rules.repeatProcs ? ", and the same one more than once" : "" }}.</template>
    </p>
    <ul v-if="picked.length">
      <li v-for="a in picked" :key="a.id">
        <span><b>{{ a.kind === "p" ? "Prefix" : "Suffix" }}</b><small>{{ label(a) }}</small></span>
        <button class="text-btn" :aria-label="`Remove ${a.lines.join(', ')}`" @click="remove(a.id)">Remove</button>
      </li>
    </ul>
    <label class="search affix-search"><Icon name="search" /><input v-model="query" type="search" placeholder="Filter affixes, e.g. resist or Flamefront" aria-label="Filter affixes" /></label>
    <div v-for="[kind, title, one] in KINDS" :key="kind" class="orb-add-controls">
      <label class="orb-select">{{ title }}
        <select v-model="choice[kind]" :disabled="full(kind)">
          <option value="">{{ full(kind) ? `${title}: all ${limit} chosen` : `Choose ${one} (${options(kind).length})` }}</option>
          <option v-for="a in options(kind)" :key="a.id" :value="a.id">{{ label(a) }}</option>
        </select>
      </label>
      <button class="btn" :disabled="!choice[kind] || full(kind)" @click="add(kind)">Add</button>
    </div>
  </div>
</template>

<style scoped>
.affix-quality { display: inline-flex; gap: 4px; margin-bottom: 6px; }
.affix-quality button { padding: 4px 10px; border: 1px solid var(--soft-border); border-radius: 6px; background: var(--field); color: var(--muted); }
.affix-quality button[aria-pressed="true"] { color: var(--text); border-color: var(--gold); }
.affix-search { margin: 6px 0; }
.item-affixes select { max-width: 100%; }
</style>
