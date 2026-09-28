<script setup>
// Copies a link to one thing on the site (#uniques?name=Grim%20Fang&tier=3); opening it
// goes to that card or recipe (useRunetool.js applyLink, CubeRecipes.vue applyLink).
import { ref } from "vue";
import Icon from "./AppIcon.vue";
const props = defineProps({ hash: { type: String, required: true }, label: { type: String, required: true } });
const copied = ref(false);
let timer = 0;
async function copy() {
  const url = new URL(window.location.href);
  url.hash = props.hash;
  try {
    await navigator.clipboard.writeText(url.toString());
  } catch {
    window.prompt("Copy this link:", url.toString());
    return;
  }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1600);
}
</script>
<template>
  <button type="button" class="copy-link" :class="{ copied }" :aria-label="copied ? 'Link copied' : `Copy a link to ${label}`" :data-tip="copied ? 'Link copied' : 'Copy link'" @click="copy">
    <Icon :name="copied ? 'check' : 'link'" />
  </button>
</template>
<style scoped>
.copy-link { display: grid; place-items: center; width: 29px; height: 29px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--muted); }
.copy-link:hover, .copy-link:focus-visible { color: var(--gold); background: var(--gold-bg); }
.copy-link.copied { color: var(--gold); }
.copy-link :deep(svg) { width: 16px; height: 16px; }
</style>
