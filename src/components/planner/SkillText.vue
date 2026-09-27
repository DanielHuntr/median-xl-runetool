<script setup>
defineProps({ line: { type: Object, required: true } });
</script>
<template>
  <template v-if="line.segments?.length">
    <span v-for="(segment, i) in line.segments" :key="i" :class="{ 'skill-reference': segment.skill }">{{ segment.text }}</span>
  </template>
  <template v-else>{{ line.text }}</template>
</template>
