<script setup>
import { computed } from "vue";
// Icons are 48px cells in 912px atlases (19 per row), keyed "icons-<prefix>_<index>".
const props = defineProps({ image: { type: String, default: "" } });
const style = computed(() => {
  const m = /^(?:icons|image)-([a-z]+)_(\d+)$/i.exec(props.image);
  if (!m) return null;
  const i = Number(m[2]);
  return {
    backgroundImage: `url(${import.meta.env.BASE_URL}planner/class-${m[1]}.webp?v=${__BUILD_ID__})`,
    backgroundPosition: `-${(i % 19) * 48}px -${Math.floor(i / 19) * 48}px`,
  };
});
</script>
<template>
  <span class="skill-icon" :class="{ missing: !style }" :style="style" aria-hidden="true"></span>
</template>
