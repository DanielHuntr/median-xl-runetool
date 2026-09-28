<script setup>
// The chosen catalogue filters as removable pills under the toolbar (CatalogFilters.vue).
import { computed } from "vue";
import Icon from "./AppIcon.vue";

const props = defineProps({ model: { type: Object, required: true }, keys: { type: Array, required: true } });
const pills = computed(() => props.keys.flatMap((k) => props.model[k].map((v) => ({ k, v }))));
const drop = (p) => (props.model[p.k] = props.model[p.k].filter((x) => x !== p.v));
const clear = () => props.keys.forEach((k) => (props.model[k] = []));
</script>
<template>
  <div v-if="pills.length" class="active-filters">
    <button v-for="p in pills" :key="p.k + p.v" class="pill" :aria-label="'Remove ' + p.v" @click="drop(p)">{{ p.v }} <Icon name="close" /></button
    ><button class="text-btn" @click="clear">Clear all</button>
  </div>
</template>
