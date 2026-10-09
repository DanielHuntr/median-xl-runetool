<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool } from "../composables/useRunetool.js";
const { st, results, reset, stats, RW, label, SORTS, panel, filtersDocked, layout } = useRunetool();
import FilterPanel from "./FilterPanel.vue";
import FiltersToolbar from "./FiltersToolbar.vue";
import RunewordCard from "./RunewordCard.vue";
import { STARTER_MAX_RUNE } from "../data/index.js";
import LayoutToggle from "./LayoutToggle.vue";
const starterCount = RW.filter((r) => r.starter).length;
</script>
<template>
  <section aria-label="Runeword finder">
    <FiltersToolbar />
    <div class="finder-body" :class="{ docked: panel && filtersDocked }">
    <aside v-if="panel && filtersDocked" id="filter-dock" class="filter-dock" aria-labelledby="filter-dock-heading">
      <FilterPanel docked @close="panel = false" />
    </aside>
    <div class="finder-results">
    <div class="results-bar">
      <div class="result-count" aria-live="polite">
        <strong>{{ results.length }}</strong> {{ results.length === 1 ? "runeword" : "runewords" }}
        <span v-if="results.length !== RW.length">/ {{ RW.length }}</span>
      </div>
      <div class="result-actions">
        <label class="switch"
          ><input type="checkbox" v-model="st.full" />Show full stats</label
        ><select v-model="st.sort" aria-label="Sort runewords">
          <option v-for="[key, text] in SORTS" :value="key">{{ text }}</option>
        </select><LayoutToggle />
      </div>
    </div>
    <p v-if="st.starter" class="starter-note">
      New to Median XL? These {{ starterCount }} runewords take only the standard runes you'll find while levelling (El to {{ STARTER_MAX_RUNE }}), lowest required level first.
      Tick the runes you have under My Runes to see which you can make now; a rune's icon shows the cube recipe that makes it.
    </p>
    <div class="card-grid" :class="{ list: layout === 'list' }">
      <RunewordCard v-for="r in results" :key="r.id" :r="r" />
    </div>
    <div v-if="!results.length" class="empty">
      <Icon name="search" />
      <h2>Nothing matches.</h2>
      <p>Remove a filter above or clear all filters.</p>
      <button class="btn gold" @click="reset">Clear Filters</button>
    </div>
    </div>
    </div>
  </section>
</template>

<style scoped>
.starter-note { margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--soft-border); border-radius: 6px; background: var(--gold-bg); color: var(--text); font-size: 0.875rem; line-height: 1.45; }
</style>
