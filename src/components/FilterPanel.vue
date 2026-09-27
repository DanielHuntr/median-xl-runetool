<script setup>
// The runeword filters. On wide screens they sit docked beside the results (RunewordFinder.vue),
// so the list can be scrolled while filtering; on narrow ones they slide over the page
// (FiltersToolbar.vue).
import { computed, ref } from "vue";
import Icon from "./AppIcon.vue";
import { useRunetool } from "../composables/useRunetool.js";
defineProps({ docked: Boolean });
const emit = defineEmits(["close"]);
const { st, wide, dockFilters, weaponBases, armorBases, filterCount, toggle, reset, TAGS, ELEMS, results } = useRunetool();

// Item type groups. A whole group is stored as "@weapon" / "@armor" (one pill, "All weapons")
// rather than every type in it.
const typeGroups = computed(() => [
  { name: "Weapons", any: "@weapon", items: weaponBases },
  { name: "Armor", any: "@armor", items: armorBases },
]);
const picked = (g) => (st.bases.includes(g.any) ? g.items : g.items.filter((b) => st.bases.includes(b)));
function setGroup(g, chosen) {
  const rest = st.bases.filter((b) => b !== g.any && !g.items.includes(b));
  st.bases = [...rest, ...(chosen.length === g.items.length ? [g.any] : chosen)];
}
const flipType = (g, b) => setGroup(g, picked(g).includes(b) ? picked(g).filter((x) => x !== b) : [...picked(g), b]);
const allPicked = (g) => picked(g).length === g.items.length;
// Each group folds away; those with something chosen start open.
const opened = ref({});
const isOpen = (key, chosen) => opened.value[key] ?? chosen.length > 0;
const flipOpen = (key, chosen) => (opened.value = { ...opened.value, [key]: !isOpen(key, chosen) });
const listed = (xs, max = 3) => (xs.length > max ? `${xs.slice(0, max).join(", ")} +${xs.length - max}` : xs.join(", "));
const groupNote = (g) => (!picked(g).length ? "Any" : allPicked(g) ? `All ${g.items.length}` : isOpen(g.name, picked(g)) ? `${picked(g).length} of ${g.items.length}` : listed(picked(g)));
const count = computed(() => `${results.value.length} runeword${results.value.length === 1 ? "" : "s"}`);
</script>
<template>
  <div class="filter-panel" :class="{ docked }">
    <div class="filter-panel-head">
      <div>
        <div v-if="!docked" class="eyebrow">NARROW THE LIST</div>
        <h2 :id="docked ? 'filter-dock-heading' : 'filter-heading'">Filters</h2>
      </div>
      <div class="filter-panel-actions">
        <button v-if="wide" class="text-btn filter-dock-btn" :title="docked ? 'Open the filters as a slide-out panel instead' : 'Keep the filters open beside the runewords'" @click="dockFilters = !docked">
          <Icon :name="docked ? 'unpin' : 'pin'" />{{ docked ? "Undock" : "Dock" }}
        </button>
        <button class="icon-btn" aria-label="Close filters" @click="emit('close')"><Icon name="close" /></button>
      </div>
    </div>
    <div class="filter-drawer-body">
      <section v-for="g in typeGroups" :key="g.name" class="filter-group" :aria-label="g.name">
        <div class="filter-group-head">
          <button class="filter-toggle" :aria-expanded="isOpen(g.name, picked(g))" @click="flipOpen(g.name, picked(g))">
            <Icon name="chevron" class="filter-chevron" /><h3>{{ g.name }}</h3><small>{{ groupNote(g) }}</small>
          </button>
          <button class="text-btn filter-all" :class="{ on: allPicked(g) }" @click="setGroup(g, allPicked(g) ? [] : g.items)">
            <Icon :name="allPicked(g) ? 'close' : 'check'" />{{ allPicked(g) ? "Unselect all" : "Select all" }}
          </button>
        </div>
        <div v-show="isOpen(g.name, picked(g))" class="chips">
          <button v-for="b in g.items" :key="b" :aria-pressed="picked(g).includes(b)" @click="flipType(g, b)">{{ b }}</button>
        </div>
      </section>
      <section class="filter-group" aria-label="Must have these stats">
        <div class="filter-group-head">
          <button class="filter-toggle" :aria-expanded="isOpen('stats', st.tags)" @click="flipOpen('stats', st.tags)">
            <Icon name="chevron" class="filter-chevron" /><h3>Stats</h3><small>{{ st.tags.length && !isOpen('stats', st.tags) ? listed(st.tags) : "Must have all chosen" }}</small>
          </button>
          <button v-if="st.tags.length" class="text-btn filter-all on" @click="st.tags = []"><Icon name="close" />Unselect all</button>
        </div>
        <div v-show="isOpen('stats', st.tags)" class="chips">
          <button v-for="[t] in TAGS" :key="t" :aria-pressed="st.tags.includes(t)" @click="toggle('tags', t)">{{ t }}</button>
        </div>
      </section>
      <section class="filter-group" aria-label="Damage type">
        <div class="filter-group-head">
          <button class="filter-toggle" :aria-expanded="isOpen('elems', st.elems)" @click="flipOpen('elems', st.elems)">
            <Icon name="chevron" class="filter-chevron" /><h3>Damage type</h3><small>{{ st.elems.length ? listed(st.elems) : "Any" }}</small>
          </button>
        </div>
        <div v-show="isOpen('elems', st.elems)" class="chips">
          <button v-for="[t] in ELEMS" :key="t" :aria-pressed="st.elems.includes(t)" @click="toggle('elems', t)">{{ t }}</button>
        </div>
      </section>
      <section class="filter-group" aria-label="Number of runes">
        <div class="filter-group-head">
          <button class="filter-toggle" :aria-expanded="isOpen('sockets', st.sockets)" @click="flipOpen('sockets', st.sockets)">
            <Icon name="chevron" class="filter-chevron" /><h3>Number of runes</h3><small>{{ st.sockets.length ? listed([...st.sockets].sort().map(String), 6) : "Any" }}</small>
          </button>
        </div>
        <div v-show="isOpen('sockets', st.sockets)" class="chips">
          <button v-for="n in 6" :key="n" :aria-pressed="st.sockets.includes(n)" @click="toggle('sockets', n)">{{ n }}</button>
        </div>
      </section>
    </div>
    <div class="filter-drawer-foot">
      <button class="text-btn" :disabled="!filterCount" @click="reset">Clear all</button>
      <span v-if="docked" class="filter-count" aria-live="polite">{{ count }}</span>
      <button v-else class="btn gold" @click="emit('close')">Show {{ count }}</button>
    </div>
  </div>
</template>
