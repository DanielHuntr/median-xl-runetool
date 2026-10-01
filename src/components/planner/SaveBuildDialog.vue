<script setup>
// Saves the planner's current build to the player's saved builds (listed on the Builds page).
import { ref, computed, nextTick, onMounted } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { useSavedBuilds, MAX_NAME } from "../../planner/savedBuilds.js";
import { BASIC_ATTACK } from "../../planner/damage.js";
import { useAuth } from "../../composables/useAuth.js";
import { getProfile, saveToAccount, getMyBuild } from "../../planner/accountData.js";
const emit = defineEmits(["close"]);
const { state, build, engine, buildCode, say } = usePlanner();
const { builds: savedList, save, byName } = useSavedBuilds();
const dialog = ref(null), input = ref(null), error = ref("");
// The skills in the left and right slots describe the build best.
const skills = computed(() => [build.value.leftSkill, build.value.rightSkill].filter((id) => id && id !== BASIC_ATTACK).map((id) => engine.skillName(id)));
const name = ref(state.openedName[state.cls] || (skills.value[0] ? `${skills.value[0]} ${state.cls}` : `${state.cls} build`));
// The saved build this is (opened from it, or saved before): saving updates it, renaming it if
// the name changed, unless "Save as a new build" is ticked.
const linked = state.savedAs[state.cls] || {};
const linkedEntry = computed(() => savedList.value.find((b) => b.id === linked.id) || null);
const accountBuild = ref(null);
const isLinked = computed(() => !!(linkedEntry.value || accountBuild.value));
const linkedName = computed(() => linkedEntry.value?.name || accountBuild.value?.name || "");
const asNew = ref(false);
const updating = computed(() => isLinked.value && !asNew.value);
const existing = computed(() => {
  const e = byName(name.value);
  return e && !(updating.value && e.id === linkedEntry.value?.id) ? e : null;
});
// Signed in: also to the account (on by default), and optionally published for the community,
// which needs a display name (the account page).
const { user } = useAuth();
const toAccount = ref(true), publish = ref(false), displayName = ref(""), busy = ref(false);
onMounted(async () => {
  dialog.value.showModal();
  await nextTick();
  input.value?.select();
  if (user.value) {
    const p = await getProfile(user.value.id);
    if (p.ok) displayName.value = p.displayName;
    // Its account copy: kept published if it is.
    if (linked.accountId) {
      const b = await getMyBuild(linked.accountId);
      if (b.ok && b.build) { accountBuild.value = b.build; publish.value = b.build.published; }
    }
  }
});
function close() {
  dialog.value?.close();
  emit("close");
}
async function submit() {
  error.value = "";
  if (!name.value.trim()) return (error.value = "Give the build a name.");
  if (user.value && toAccount.value && publish.value && !displayName.value) return (error.value = "Choose a display name on your account page before publishing.");
  const entry = { name: name.value, code: buildCode(), cls: state.cls, level: build.value.level, skills: skills.value };
  if (updating.value && existing.value) return (error.value = `Another saved build is already called "${existing.value.name}".`);
  const r = save({ ...entry, id: updating.value ? linked.id : "" });
  if (!r.ok) return (error.value = r.reason);
  state.savedAs[state.cls] = { id: r.entry.id, accountId: updating.value ? linked.accountId : "" };
  state.openedName[state.cls] = r.entry.name;
  state.mine[state.cls] = true;
  let where = "Find it under Builds.";
  if (user.value && toAccount.value) {
    busy.value = true;
    const a = await saveToAccount(user.value.id, { ...entry, name: r.entry.name }, { published: publish.value, id: updating.value ? linked.accountId : "" });
    busy.value = false;
    if (!a.ok) return (error.value = `Saved in this browser, but not to your account: ${a.reason}`);
    state.savedAs[state.cls].accountId = a.id;
    where = publish.value ? "Saved to your account and published on the Builds page." : "Saved to your account too.";
  }
  say(`${r.replaced ? "Updated" : "Saved"} "${r.entry.name}". ${where}`, "info");
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
      <p v-if="updating" class="muted">Updates your saved build "{{ linkedName }}"{{ name.trim() && name.trim() !== linkedName ? `, renaming it "${name.trim()}"` : "" }}.</p>
      <p v-if="existing" class="muted">{{ updating ? `Another saved build is already called "${existing.name}". Choose another name.` : `You already have a build called "${existing.name}". Saving replaces it.` }}</p>
      <label v-if="isLinked" class="save-build-check"><input v-model="asNew" type="checkbox" /> Save as a new build instead</label>
      <p class="muted">Saved in this browser. Your saved builds are listed under Builds.</p>
      <template v-if="user">
        <label class="save-build-check"><input v-model="toAccount" type="checkbox" /> Also save to my account</label>
        <label class="save-build-check" :class="{ off: !toAccount }"><input v-model="publish" type="checkbox" :disabled="!toAccount" /> Publish it on the Builds page<small v-if="displayName"> as {{ displayName }}</small></label>
      </template>
      <p v-if="error" class="save-build-error" role="alert">{{ error }}</p>
      <div class="save-build-actions">
        <button type="button" class="btn" @click="close">Cancel</button>
        <button type="submit" class="btn gold" :disabled="busy">{{ busy ? "Saving…" : updating ? "Update" : existing ? "Replace" : "Save" }}</button>
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
.save-build-check { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: .875rem; }
.save-build-check small { color: var(--muted); }
.save-build-check.off { opacity: .5; }
</style>
