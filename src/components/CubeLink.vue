<script setup>
// "Made in the Horadric Cube" on a catalogue card, linking to the Cube page with the recipe
// loaded (src/data/cube-made.json, from scripts/extract-cube.mjs). Nothing when the cube
// doesn't make it.
import { computed } from "vue";
import Icon from "./AppIcon.vue";
import MADE from "../data/cube-made.json";
// tier: the tier shown on the card (1-4), so the recipe loads that tier's base.
// compact: a square icon button (card corners), with the words in its tooltip.
const props = defineProps({ kind: { type: String, required: true }, name: { type: String, required: true }, tier: { type: Number, default: 0 }, compact: Boolean });
const how = computed(() => (props.kind === "unique" ? MADE.uniques[props.name] : MADE.items[props.name] || MADE.items[`${props.name} Rune`] ? "recipe" : null));
const tip = computed(() => (how.value === "reroll" ? "Show recipe: made in the Horadric Cube by rerolling its base"
  : how.value === "chance" ? "Show recipe: the Horadric Cube makes a random unique of this base; this is one of them"
  : "Show recipe: made in the Horadric Cube"));
const href = computed(() => `#cube?make=${props.kind}:${encodeURIComponent(props.name)}${props.tier ? `&tier=${props.tier}` : ""}`);
</script>
<template>
  <a v-if="how && compact" class="cube-link-square" :href="href" :aria-label="tip" :data-tip="tip"><Icon name="cube" /></a>
  <a v-else-if="how" class="cube-link" :href="href" :data-tip="tip">
    <Icon name="cube" />
    <span>Show recipe</span>
    <Icon name="arrow" class="cube-link-arrow" />
  </a>
</template>
<style scoped>
.cube-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 4px 10px; border: 1px solid var(--soft-border); border-radius: 999px; background: var(--gold-bg); color: var(--gold); font-size: 0.75rem; text-decoration: none; }
.cube-link:hover, .cube-link:focus-visible { border-color: var(--gold); }
.cube-link svg { width: 13px; height: 13px; }
.cube-link-arrow { opacity: 0.7; }
.cube-link-square { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--soft-border); border-radius: 6px; background: var(--gold-bg); color: var(--gold); }
.cube-link-square:hover, .cube-link-square:focus-visible { border-color: var(--gold); }
.cube-link-square svg { width: 17px; height: 17px; }
</style>
