<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
const {
  st,
  tuQuery,
  browse,
  catGroups,
  TAGS,
  ELEMS,
  compare,
  tiers,
  cats,
  results,
  uniques,
  tier,
  clampLevel,
  label,
} = useRunetool();
import UniqueCard from "./UniqueCard.vue";
import CatalogFilters from "./CatalogFilters.vue";
import FilterPills from "./FilterPills.vue";
const f = browse.tiered;
const sections = [
  { key: "cats", groups: catGroups(cats) },
  { key: "tags", title: "Stats", note: "Must have all chosen", options: TAGS.map((t) => t[0]) },
  { key: "elems", title: "Damage type", options: ELEMS.map((t) => t[0]) },
];
</script>
<template>
  <section aria-label="Tiered uniques">
    <div class="upgrade-note">
      <Icon name="info" />
      <p>
        Tiered weapons and armor come in four tiers. Upgrade one tier with
        <strong>1 Arcane Crystal</strong>.<span
          >Non-sacred weapons and armor only. Jewelry and quivers have no tier
          upgrades.</span
        >
      </p>
    </div>
    <div class="toolbar">
      <div class="unique-controls">
        <label class="search"
          ><Icon name="search" /><input
            v-model="tuQuery"
            type="search"
            placeholder="Search name, base or stat"
            aria-label="Search tiered uniques" /></label
        ><CatalogFilters :model="f" :sections="sections" :count="`${uniques.length} unique${uniques.length === 1 ? '' : 's'}`" /><label class="level"
          >Max lvl
          <input
            v-model="st.lvl"
            @change="clampLevel"
            type="number"
            min="1"
            :max="MAX_ITEM_LEVEL"
            aria-label="Maximum character level"
        /></label>
      </div>
      <FilterPills :model="f" :keys="['cats', 'tags', 'elems']" />
    </div>
    <div class="results-bar">
      <div class="result-count">
        <strong>{{ uniques.length }}</strong> uniques
      </div>
      <label class="switch"
        ><input type="checkbox" v-model="compare" />Compare with next
        tier</label
      >
    </div>
    <p class="tier-hint">
      Each item opens at the highest tier you can equip at level {{ st.lvl }}.
    </p>
    <div class="unique-grid">
      <UniqueCard v-for="u in uniques" :key="u.id" :u="u" />
    </div>
    <div v-if="!uniques.length" class="empty">
      <h2>Nothing matches.</h2>
      <p>Try another name, stat or weapon type.</p>
      <button
        class="btn"
        @click="
          tuQuery = '';
          f.cats = [];
          f.tags = [];
          f.elems = [];
        "
      >
        Clear filters
      </button>
    </div>
    <p class="coverage">
      Full official catalogue: weapons, armor, class items, jewelry and quivers.
      Refreshed 25 September 2026.
    </p>
  </section>
</template>
