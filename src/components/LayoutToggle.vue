<script setup>
// Cards or a compact list, for the catalogue pages' results (useRunetool layout, saved).
import Icon from "./AppIcon.vue";
import { useRunetool } from "../composables/useRunetool.js";
const { layout } = useRunetool();
</script>
<template>
  <div class="layout-toggle" role="group" aria-label="Show results as">
    <button type="button" :aria-pressed="layout === 'cards'" aria-label="Cards" data-tip="Cards" @click="layout = 'cards'"><Icon name="grid" /></button>
    <button type="button" :aria-pressed="layout === 'list'" aria-label="List" data-tip="Compact list" @click="layout = 'list'"><Icon name="list" /></button>
  </div>
</template>
