<script setup>
import { ref, computed, watch } from "vue";
import ItemSprite from "../ItemSprite.vue";
import atlas from "../../data/item-atlas.json";
// Item art: "game/<name>" is art rendered from the game files, drawn from the sprite
// sheets; other names are MedianDB icons (public/planner/items/<name>.webp). A direct src
// is used as is (the embedded gem and rune artwork).
const props = defineProps({ icon: { type: String, default: "" }, src: { type: String, default: "" } });
const failed = ref(false);
const sprite = computed(() => (!props.src && props.icon.startsWith("game/") && atlas.art[props.icon.slice(5).toLowerCase()] ? props.icon.slice(5) : ""));
const url = computed(() => {
  if (props.src) return props.src;
  if (!props.icon || props.icon.startsWith("game/")) return "";
  return `${import.meta.env.BASE_URL}planner/items/${props.icon}.webp?v=${__BUILD_ID__}`;
});
watch(url, () => (failed.value = false));
</script>
<template>
  <ItemSprite v-if="sprite" class="item-icon" :name="sprite" />
  <img v-else-if="url && !failed" class="item-icon" :src="url" alt="" loading="lazy" @error="failed = true" />
  <span v-else class="item-icon missing" aria-hidden="true"></span>
</template>
