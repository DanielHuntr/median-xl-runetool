<script setup>
// One recipe as pictures: ingredients + … → results, each named underneath, then what the
// results get. Ingredients the cube is missing are faded. A recipe with random results
// lists each with its chance; the footer (tags and buttons) is the caller's.
import CopyLink from "./CopyLink.vue";
import { computed, ref } from "vue";
import CubeIcon from "./CubeIcon.vue";
const props = defineProps({ entry: { type: Object, required: true }, ready: Boolean });
const text = computed(() => props.entry.text);
const random = computed(() => props.entry.outcomes?.length > 1);
const conditions = computed(() => text.value.conditions.filter((c) => !(random.value && c.startsWith("Random:"))));
const missing = (k) => {
  const inp = props.entry.recipe.inputs[k];
  return (props.entry.missing || []).some((m) => m.key === inp.key && m.flags === inp.flags && m.quality === inp.quality && m.id === inp.id);
};
const all = ref(false);
const outcomes = computed(() => (all.value ? props.entry.outcomes : props.entry.outcomes.slice(0, 4)));
// A recipe that rerolls your item as a unique: the unique it becomes (from the game's table).
const becomes = computed(() => props.entry.becomes || null);
const one = computed(() => (becomes.value?.length === 1 ? becomes.value[0] : null));
const lines = computed(() => [...new Set(text.value.outputs.flatMap((o) => o.lines))].slice(0, 8));
const pct = (x) => (x === undefined ? "" : x >= 0.1 ? `${Math.round(x * 100)}%` : `${+(x * 100).toFixed(2)}%`);
</script>
<template>
  <article class="cube-recipe" :class="{ ready }">
    <div class="cube-recipe-row">
      <template v-for="(ic, k) in text.inputIcons" :key="`in${k}`">
        <span v-if="k" class="cube-recipe-op" aria-hidden="true">+</span>
        <figure class="cube-recipe-item" :class="{ missing: missing(k) }">
          <CubeIcon :art="ic.art" :qty="ic.qty" :any="ic.any" :missing="missing(k)" />
          <figcaption>{{ ic.qty > 1 ? `${ic.qty} × ` : "" }}{{ ic.text }}<span v-if="missing(k)" class="sr-only"> (missing)</span></figcaption>
        </figure>
      </template>
      <span class="cube-recipe-op arrow" aria-label="makes">→</span>
      <figure v-if="random" class="cube-recipe-item">
        <CubeIcon :art="entry.outcomes[0].outputs[0].icon?.art" any />
        <figcaption>One of {{ entry.outcomes.length }} results</figcaption>
      </figure>
      <template v-else>
        <template v-for="(o, k) in text.outputs" :key="`out${k}`">
          <span v-if="k" class="cube-recipe-op" aria-hidden="true">+</span>
          <figure class="cube-recipe-item out">
            <CubeIcon v-if="one && o.rerolled" :art="one.art" />
            <CubeIcon v-else :art="o.icon.art" :qty="o.icon.qty || 1" :any="o.icon.any" :portal="o.icon.portal" />
            <figcaption>{{ one && o.rerolled ? one.name : o.name }}</figcaption>
          </figure>
        </template>
      </template>
    </div>
    <p v-if="becomes && becomes.length > 1" class="cube-recipe-becomes">Becomes one of: {{ becomes.map((c) => `${c.name} (${pct(c.chance)})`).join(", ") }}</p>
    <p v-else-if="becomes && !becomes.length" class="cube-recipe-becomes">No unique can roll on this base: it becomes a rare item.</p>
    <p v-else-if="one" class="cube-recipe-becomes">Your item becomes {{ one.name }}, the only unique on this base.</p>
    <ul v-if="random" class="cube-recipe-outcomes">
      <li v-for="(o, i) in outcomes" :key="i">
        <b>{{ o.outputs.map((x) => x.name).join(" + ") }}</b><em v-if="o.chance !== undefined">{{ pct(o.chance) }}</em>
        <span v-for="l in o.outputs[0].lines.slice(0, 2)" :key="l">{{ l }}</span>
      </li>
      <li v-if="entry.outcomes.length > 4"><button type="button" class="text-btn" @click="all = !all">{{ all ? "Show fewer" : `Show all ${entry.outcomes.length}` }}</button></li>
    </ul>
    <ul v-else-if="lines.length" class="cube-recipe-lines"><li v-for="l in lines" :key="l">{{ l }}</li></ul>
    <div class="cube-recipe-foot">
      <slot name="status" />
      <span v-for="c in conditions" :key="c" class="cube-tag">{{ c }}</span>
      <span v-if="entry.similar" class="cube-similar">+{{ entry.similar.toLocaleString() }} like it for other bases</span>
      <slot />
      <CopyLink class="cube-recipe-link" :hash="`cube?recipe=${entry.recipe.row}`" label="this recipe" />
    </div>
  </article>
</template>
<style scoped>
.cube-recipe { display: grid; gap: 10px; align-content: space-between; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.cube-recipe.ready { border-color: var(--gold); }
.cube-recipe-link { margin-left: auto; }
.cube-recipe-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; }
.cube-recipe-item { display: grid; justify-items: center; gap: 4px; width: 84px; margin: 0; }
.cube-recipe-item figcaption { font-size: 0.75rem; line-height: 1.25; text-align: center; color: var(--text); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cube-recipe-item.out figcaption { color: var(--gold); font-weight: 600; }
.cube-recipe-item.missing figcaption { color: var(--muted); font-style: italic; }
.cube-recipe-op { align-self: center; margin-top: -18px; color: var(--muted); font-size: 1rem; }
.cube-recipe-op.arrow { color: var(--gold); font-size: 1.25rem; margin-inline: 2px; }
.cube-recipe ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
.cube-recipe-lines li { color: var(--d2-blue); font-size: 0.75rem; }
.cube-recipe-outcomes li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding-top: 4px; font-size: 0.8125rem; }
.cube-recipe-outcomes li + li { border-top: 1px dashed var(--soft-border); }
.cube-recipe-outcomes b { color: var(--gold); font-weight: 600; }
.cube-recipe-outcomes em { color: var(--muted); font-style: normal; font-size: 0.75rem; }
.cube-recipe-outcomes span { flex-basis: 100%; color: var(--d2-blue); font-size: 0.75rem; }
.cube-recipe-outcomes .text-btn { padding: 2px 0; font-size: 0.75rem; }
.cube-recipe-becomes { margin: 0; color: var(--muted); font-size: 0.75rem; line-height: 1.45; }
.cube-recipe-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cube-recipe-foot :deep(.btn) { margin-left: auto; padding: 5px 10px; font-size: 0.8125rem; }
.cube-tag, .cube-recipe-foot :deep(.cube-tag) { padding: 2px 8px; border-radius: 999px; background: var(--raised); color: var(--muted); font-size: 0.75rem; }
.cube-recipe-foot :deep(.cube-tag.ok) { background: var(--gold-bg); color: var(--gold); }
.cube-similar { color: var(--muted); font-size: 0.75rem; }
</style>
