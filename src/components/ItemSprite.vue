<script setup>
import { computed, useId } from "vue";
import atlas from "../data/item-atlas.json";
// One item graphic cut from the game-art sprite sheets (scripts/build-item-atlas.mjs).
// The SVG keeps the graphic's own size and shape, so it sizes like the <img> it replaces,
// and each sheet is a single cached request however many items a page shows. The clip
// keeps neighbouring graphics out when the box is a different shape from the graphic.
// --w and --h are its size in the game's inventory (28px a cell), for places that draw
// every item at one scale (the equipment doll).
const props = defineProps({ name: { type: String, required: true } });
const clip = `sprite-${useId()}`;
const sprite = computed(() => {
  const a = atlas.art[props.name.toLowerCase()];
  if (!a) return null;
  const [n, x, y, w, h] = a, [file, sw, sh] = atlas.sheets[n];
  return { x, y, w, h, sw, sh, href: `${import.meta.env.BASE_URL}planner/items/${file}` };
});
</script>
<template>
  <svg
    v-if="sprite"
    :viewBox="`${sprite.x} ${sprite.y} ${sprite.w} ${sprite.h}`"
    :width="sprite.w"
    :height="sprite.h"
    :style="{ aspectRatio: `${sprite.w} / ${sprite.h}`, '--w': sprite.w, '--h': sprite.h }"
    aria-hidden="true"
    focusable="false"
  >
    <clipPath :id="clip"><rect :x="sprite.x" :y="sprite.y" :width="sprite.w" :height="sprite.h" /></clipPath>
    <image :href="sprite.href" :width="sprite.sw" :height="sprite.sh" :clip-path="`url(#${clip})`" />
  </svg>
</template>
