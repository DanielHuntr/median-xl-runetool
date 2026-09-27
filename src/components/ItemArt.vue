<script setup>
import { computed } from "vue";
import ItemSprite from "./ItemSprite.vue";
import { useItemArt } from "../composables/useItemArt.js";

// In-game inventory art for a catalogue card; renders nothing when there's none.
const props = defineProps({
  kind: { type: String, required: true }, // "unique" | "set" | "base"
  name: { type: String, required: true },
  base: { type: String, default: "" },
  tier: { type: String, default: "" },
  small: { type: Boolean, default: false },
});
const { artName } = useItemArt();
const art = computed(() => artName(props.kind, props.name, { base: props.base, tier: props.tier }));
</script>
<template>
  <ItemSprite v-if="art" :class="['item-art', { small }]" :name="art" />
</template>
