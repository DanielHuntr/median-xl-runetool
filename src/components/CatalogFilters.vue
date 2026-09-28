<script setup>
// The catalogue pages' Filters button and slide-out panel (Tiered and Sacred Uniques, Sets,
// Base Items), laid out like the runeword filters (FilterPanel.vue).
// sections: [{ key, title, note?, options: [name] } | { key, title, groups: [{ name, items }] }]
// `model` holds a list per key (browse.* in useRunetool.js).
import { computed, nextTick, ref, watch } from "vue";
import Icon from "./AppIcon.vue";

const props = defineProps({
  model: { type: Object, required: true },
  sections: { type: Array, required: true },
  count: { type: String, required: true },
});
const dialog = ref(null), trigger = ref(null);
const open = ref(false);
watch(open, async (v) => {
  await nextTick();
  if (v && !dialog.value?.open) dialog.value?.showModal();
  else if (!v && dialog.value?.open) dialog.value.close();
});
function close() {
  open.value = false;
  trigger.value?.focus();
}
const chosen = computed(() => props.sections.reduce((n, s) => n + (props.model[s.key]?.length || 0), 0));
const flip = (key, v) => {
  const list = props.model[key];
  props.model[key] = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
};
const allIn = (key, items) => items.every((i) => props.model[key].includes(i));
const setAll = (key, items, on) => {
  const rest = props.model[key].filter((x) => !items.includes(x));
  props.model[key] = on ? [...rest, ...items] : rest;
};
function clearAll() {
  for (const s of props.sections) props.model[s.key] = [];
}
// Groups fold away; those with something chosen start open.
const opened = ref({});
const isOpen = (id, sel) => opened.value[id] ?? sel.length > 0;
const flipOpen = (id, sel) => (opened.value = { ...opened.value, [id]: !isOpen(id, sel) });
const listed = (xs, max = 3) => (xs.length > max ? `${xs.slice(0, max).join(", ")} +${xs.length - max}` : xs.join(", "));
const inGroup = (key, items) => props.model[key].filter((x) => items.includes(x));
</script>
<template>
  <button ref="trigger" type="button" class="btn filters-btn" :class="{ active: open }" aria-haspopup="dialog" :aria-expanded="open" @click="open = true">
    <Icon name="filter" />Filters<b v-if="chosen" class="badge">{{ chosen }}</b>
  </button>
  <dialog ref="dialog" class="rune-drawer filter-drawer" aria-labelledby="catalog-filter-heading" @cancel.prevent="close" @close="open = false" @click="(e) => { if (e.target === dialog) close(); }">
    <div class="filter-panel">
      <div class="filter-panel-head">
        <div>
          <div class="eyebrow">NARROW THE LIST</div>
          <h2 id="catalog-filter-heading">Filters</h2>
        </div>
        <div class="filter-panel-actions">
          <button class="icon-btn" aria-label="Close filters" @click="close"><Icon name="close" /></button>
        </div>
      </div>
      <div class="filter-drawer-body">
        <template v-for="s in sections" :key="s.key">
          <template v-if="s.groups">
            <section v-for="g in s.groups" :key="g.name" class="filter-group" :aria-label="g.name">
              <div class="filter-group-head">
                <button class="filter-toggle" :aria-expanded="isOpen(g.name, inGroup(s.key, g.items))" @click="flipOpen(g.name, inGroup(s.key, g.items))">
                  <Icon name="chevron" class="filter-chevron" /><h3>{{ g.name }}</h3>
                  <small>{{ !inGroup(s.key, g.items).length ? "Any" : allIn(s.key, g.items) ? `All ${g.items.length}` : listed(inGroup(s.key, g.items)) }}</small>
                </button>
                <button class="text-btn filter-all" :class="{ on: allIn(s.key, g.items) }" @click="setAll(s.key, g.items, !allIn(s.key, g.items))">
                  <Icon :name="allIn(s.key, g.items) ? 'close' : 'check'" />{{ allIn(s.key, g.items) ? "Unselect all" : "Select all" }}
                </button>
              </div>
              <div v-show="isOpen(g.name, inGroup(s.key, g.items))" class="chips">
                <button v-for="c in g.items" :key="c" :aria-pressed="model[s.key].includes(c)" @click="flip(s.key, c)">{{ c }}</button>
              </div>
            </section>
          </template>
          <section v-else class="filter-group" :aria-label="s.title">
            <div class="filter-group-head">
              <button class="filter-toggle" :aria-expanded="isOpen(s.key, model[s.key])" @click="flipOpen(s.key, model[s.key])">
                <Icon name="chevron" class="filter-chevron" /><h3>{{ s.title }}</h3>
                <small>{{ model[s.key].length && !isOpen(s.key, model[s.key]) ? listed(model[s.key]) : s.note || "Any" }}</small>
              </button>
              <button v-if="model[s.key].length" class="text-btn filter-all on" @click="model[s.key] = []"><Icon name="close" />Unselect all</button>
            </div>
            <div v-show="isOpen(s.key, model[s.key])" class="chips">
              <button v-for="o in s.options" :key="o" :aria-pressed="model[s.key].includes(o)" @click="flip(s.key, o)">{{ o }}</button>
            </div>
          </section>
        </template>
      </div>
      <div class="filter-drawer-foot">
        <button class="text-btn" :disabled="!chosen" @click="clearAll">Clear all</button>
        <button class="btn gold" @click="close">Show {{ count }}</button>
      </div>
    </div>
  </dialog>
</template>
