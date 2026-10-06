<script setup>
import ClassPicker from "./ClassPicker.vue";
import Icon from "./AppIcon.vue";
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import FilterPanel from "./FilterPanel.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
import { STARTER_MAX_RUNE } from "../data/index.js";
const {
  st,
  stars,
  panel,
  drawer,
  expanded,
  dialog,
  runeTrigger,
  totalOwned,
  filterCount,
  pills,
  toggle,
  remove,
  reset,
  star,
  stats,
  clampLevel,
  RW,
  label,
  CLASSES,
  filtersDocked,
} = useRunetool();
// Starter runewords: one click to the runewords a newer player can make while levelling, lowest
// level first (index.js marks them: standard runes up to Ist).
const starterCount = RW.filter((r) => r.starter).length;
function toggleStarter() {
  st.starter = !st.starter;
  if (st.starter) st.sort = "level";
}
// Wide screens dock the filters beside the results (RunewordFinder.vue); narrower ones slide
// them out from the right like My Runes (a modal <dialog>).
const filterDialog = ref(null), filterTrigger = ref(null), root = ref(null);
watch([panel, filtersDocked], async () => {
  await nextTick();
  const d = filterDialog.value;
  if (!d) return;
  const show = panel.value && !filtersDocked.value;
  if (show && !d.open) d.showModal();
  else if (!show && d.open) d.close();
});
function closeFilters() {
  panel.value = false;
  filterTrigger.value?.focus();
}
// The docked panel sticks just under this (sticky) toolbar.
let ro;
onMounted(() => {
  ro = new ResizeObserver(() => document.documentElement.style.setProperty("--toolbar-h", `${root.value?.offsetHeight || 0}px`));
  if (root.value) ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());
</script>
<template>
  <div ref="root" class="toolbar">
    <div class="primary-controls">
      <label class="search"
        ><Icon name="search" /><input
          v-model="st.q"
          type="search"
          placeholder="Search runewords, runes or stats"
          aria-label="Search runewords" /></label
      ><ClassPicker v-model="st.cls" :classes="CLASSES" any-label="Any class" /><button
        ref="filterTrigger"
        class="btn filters-btn"
        :class="{ active: panel }"
        @click="panel = filtersDocked ? !panel : true"
        :aria-expanded="panel"
        :aria-haspopup="filtersDocked ? null : 'dialog'"
        :aria-controls="filtersDocked ? 'filter-dock' : null"
      >
        <Icon name="filter" />Filters
        <b v-if="filterCount" class="badge">{{ filterCount }}</b></button
      ><label class="level"
        >Max lvl
        <input
          v-model="st.lvl"
          @change="clampLevel"
          type="number"
          min="1"
          :max="MAX_ITEM_LEVEL"
          inputmode="numeric"
          aria-label="Maximum character level"
      /></label>
    </div>
    <div class="secondary-controls">
      <button
        ref="runeTrigger"
        class="btn"
        @click="drawer = true"
        aria-haspopup="dialog"
      >
        <Icon name="bag" />My Runes
        <b v-if="totalOwned" class="badge">{{ totalOwned }}</b></button
      ><button
        class="btn"
        :class="{ active: st.starOnly }"
        :aria-pressed="st.starOnly"
        @click="st.starOnly = !st.starOnly"
      >
        <Icon name="star" />Starred
        <b v-if="stars.length" class="badge">{{ stars.length }}</b></button
      ><button
        class="btn"
        :class="{ active: st.starter }"
        :aria-pressed="st.starter"
        :data-tip="`Runewords made only of common runes, El to ${STARTER_MAX_RUNE}: the ones you can make while levelling`"
        @click="toggleStarter"
      >
        <Icon name="rune" />Starter runewords <b class="badge">{{ starterCount }}</b></button
      ><span class="toolbar-note">{{ RW.length }} runewords in the armory</span>
    </div>
    <div v-if="pills.length" class="active-filters">
      <button
        v-for="p in pills"
        class="pill"
        @click="remove(p)"
        :aria-label="'Remove ' + p.label"
      >
        {{ p.label }} <Icon name="close" /></button
      ><button class="text-btn" @click="reset">Clear all</button>
    </div>
    <dialog
      ref="filterDialog"
      class="rune-drawer filter-drawer"
      aria-labelledby="filter-heading"
      @cancel.prevent="closeFilters"
      @close="() => { if (!filtersDocked) panel = false; }"
      @click="(e) => { if (e.target === filterDialog) closeFilters(); }"
    >
      <FilterPanel v-if="!filtersDocked" @close="closeFilters" />
    </dialog>
  </div>
</template>
