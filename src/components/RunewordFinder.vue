<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool } from "../composables/useRunetool.js";
const { st, results, reset, stats, RW, label, SORTS } = useRunetool();
import FiltersToolbar from "./FiltersToolbar.vue";
import RunewordCard from "./RunewordCard.vue";
</script>
<template>
  <section aria-label="Runeword finder">
    <FiltersToolbar />
    <div class="results-bar">
      <div class="result-count" aria-live="polite">
        <strong>{{ results.length }}</strong> runewords
        <span v-if="results.length !== RW.length">/ {{ RW.length }}</span>
      </div>
      <div class="result-actions">
        <label class="switch"
          ><input type="checkbox" v-model="st.full" />Show full stats</label
        ><select v-model="st.sort" aria-label="Sort runewords">
          <option v-for="[key, text] in SORTS" :value="key">{{ text }}</option>
        </select>
      </div>
    </div>
    <div class="card-grid">
      <RunewordCard v-for="r in results" :key="r.id" :r="r" />
    </div>
    <div v-if="!results.length" class="empty">
      <Icon name="search" />
      <h2>Nothing matches.</h2>
      <p>Remove a filter above or clear all filters.</p>
      <button class="btn gold" @click="reset">Clear Filters</button>
    </div>
  </section>
</template>
