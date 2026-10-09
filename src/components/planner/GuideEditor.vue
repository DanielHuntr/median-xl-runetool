<script setup>
// Writing a build's guide (GuideView.vue shows it): a summary, and strengths and weaknesses one
// per line. Saved with the build, so it goes with every save, share link and published build.
import { ref, computed, onMounted } from "vue";
import { usePlanner, GUIDE_LIMITS } from "../../planner/usePlanner.js";
const emit = defineEmits(["close"]);
const { state, setGuide, say } = usePlanner();
const g = state.guides[state.cls];
const summary = ref(g?.summary || "");
const pros = ref((g?.pros || []).join("\n"));
const cons = ref((g?.cons || []).join("\n"));
const lines = (t) => t.split("\n").map((x) => x.trim()).filter(Boolean);
// Too many lines or a line too long: said under the box, and Save waits for it.
const listError = (t) => {
  const l = lines(t);
  if (l.length > GUIDE_LIMITS.items) return `Up to ${GUIDE_LIMITS.items} lines.`;
  if (l.some((x) => x.length > GUIDE_LIMITS.item)) return `Keep each line to ${GUIDE_LIMITS.item} characters.`;
  return "";
};
const prosError = computed(() => listError(pros.value));
const consError = computed(() => listError(cons.value));
const dialog = ref(null);
onMounted(() => dialog.value?.showModal?.());
function close() {
  dialog.value?.close();
  emit("close");
}
function save() {
  if (prosError.value || consError.value) return;
  setGuide({ summary: summary.value, pros: lines(pros.value), cons: lines(cons.value) });
  say(state.guides[state.cls] ? "Guide saved with the build. Save or share the build to pass it on." : "Guide cleared.", "info");
  close();
}
</script>
<template>
  <dialog ref="dialog" class="item-picker guide-editor" aria-labelledby="guide-editor-title" @close="emit('close')" @click="(e) => e.target === dialog && close()">
    <form class="picker-content" @submit.prevent="save">
      <div class="drawer-header">
        <h2 id="guide-editor-title">Build guide</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">&times;</button>
      </div>
      <p class="muted">What others see first when they open this build: how it plays and what it's good at. It covers every stage, and goes with the build when you save, share or publish it.</p>
      <label class="field">
        <span class="guide-field-head">Summary <small>{{ summary.length }} / {{ GUIDE_LIMITS.summary }}</small></span>
        <textarea v-model="summary" rows="6" :maxlength="GUIDE_LIMITS.summary" placeholder="A fast bow Amazon that clears maps with Multiple Shot and kills bosses with Guided Arrow…"></textarea>
      </label>
      <div class="guide-editor-lists">
        <label class="field">
          <span class="guide-field-head">Strengths <small>one per line</small></span>
          <textarea v-model="pros" rows="5" :aria-invalid="!!prosError" placeholder="Clears quickly&#10;Safe at range"></textarea>
          <small v-if="prosError" class="save-build-error" role="alert">{{ prosError }}</small>
        </label>
        <label class="field">
          <span class="guide-field-head">Weaknesses <small>one per line</small></span>
          <textarea v-model="cons" rows="5" :aria-invalid="!!consError" placeholder="Needs a good bow&#10;Low life early"></textarea>
          <small v-if="consError" class="save-build-error" role="alert">{{ consError }}</small>
        </label>
      </div>
      <div class="save-build-actions">
        <button type="button" class="btn" @click="close">Cancel</button>
        <button type="submit" class="btn gold" :disabled="!!(prosError || consError)">Save guide</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.save-build-actions { display: flex; justify-content: flex-end; gap: 12px; }
.save-build-error { color: var(--bad); font-size: 0.8125rem; }
</style>
