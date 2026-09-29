<script setup>
// Saves the planner's current build to the player's saved builds (listed on the Builds page).
import { ref, computed, nextTick, onMounted } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { useSavedBuilds, MAX_NAME } from "../../planner/savedBuilds.js";
import { BASIC_ATTACK } from "../../planner/damage.js";
const emit = defineEmits(["close"]);
const { state, build, engine, buildCode, say, estimate } = usePlanner();
const { save, byName } = useSavedBuilds();
const dialog = ref(null), input = ref(null), error = ref("");
// The skills in the left and right slots describe the build best.
const skills = computed(() => [build.value.leftSkill, build.value.rightSkill].filter((id) => id && id !== BASIC_ATTACK).map((id) => engine.skillName(id)));
const name = ref(state.openedName[state.cls] || (skills.value[0] ? `${skills.value[0]} ${state.cls}` : `${state.cls} build`));
const existing = computed(() => byName(name.value));
onMounted(async () => {
  dialog.value.showModal();
  await nextTick();
  input.value?.select();
});
function close() {
  dialog.value?.close();
  emit("close");
}
function submit() {
  error.value = "";
  if (!name.value.trim()) return (error.value = "Give the build a name.");
  // The planner's estimate as it stands, shown on the saved build's card (the Builds page doesn't load the planner).
  const e = estimate.value;
  const r = save({ name: name.value, code: buildCode(), cls: state.cls, level: build.value.level, skills: skills.value,
    estimate: e?.tier ? { tier: e.tier, bossTier: e.bossTier, clearTier: e.clearTier, surviveTier: e.surviveTier, against: e.against } : null });
  if (!r.ok) return (error.value = r.reason);
  state.openedName[state.cls] = r.entry.name;
  say(`${r.replaced ? "Updated" : "Saved"} "${r.entry.name}". Find it under Builds.`, "info");
  close();
}
</script>
<template>
  <dialog ref="dialog" class="item-picker save-build" aria-labelledby="save-build-title" @close="emit('close')" @click="(e) => e.target === dialog && close()">
    <form class="picker-content" @submit.prevent="submit">
      <div class="drawer-header">
        <h2 id="save-build-title">Save build</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">&times;</button>
      </div>
      <label class="field">Name<input ref="input" v-model="name" :maxlength="MAX_NAME" required autocomplete="off" /></label>
      <p v-if="existing" class="muted">You already have a build called "{{ existing.name }}". Saving replaces it.</p>
      <p class="muted">Saved in this browser. Your saved builds are listed under Builds.</p>
      <p v-if="error" class="save-build-error" role="alert">{{ error }}</p>
      <div class="save-build-actions">
        <button type="button" class="btn" @click="close">Cancel</button>
        <button type="submit" class="btn gold">{{ existing ? "Replace" : "Save" }}</button>
      </div>
    </form>
  </dialog>
</template>
<style scoped>
.save-build { width: min(520px, calc(100vw - 32px)); }
.save-build .field { margin: 24px 0 16px; }
.save-build .muted { line-height: 1.6; }
.save-build-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.save-build-error { color: #ef9990; }
</style>
