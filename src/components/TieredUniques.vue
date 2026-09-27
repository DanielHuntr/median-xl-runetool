<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
const {
  st,
  tuQuery,
  tuCat,
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
        ><select v-model="tuCat" aria-label="Unique item type">
          <option value="">All item types</option>
          <option v-for="c in cats">{{ c }}</option></select
        ><label class="level"
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
          tuCat = '';
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
