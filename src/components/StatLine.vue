<script setup>
// One item line; a "+N to <Skill>" line gets a tag naming the skill's class, with a tooltip
// (src/data/skillClass.js).
import { computed } from "vue";
import { skillClass } from "../data/skillClass.js";

const props = defineProps({ text: { type: String, required: true } });
const sc = computed(() => skillClass(props.text));
</script>

<template>
  {{ text
  }}<span v-if="sc" class="skill-class" tabindex="0" :data-tip="sc.tip" :aria-label="sc.tip">{{ sc.tag }}</span>
</template>
