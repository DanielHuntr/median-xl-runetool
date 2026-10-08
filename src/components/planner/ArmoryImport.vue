<script setup>
// Import a character from its median-xl.com page (planner/armory.js): the saved page or its
// source, read in this browser only. Opens the character in the planner like a shared build
// (the player's own build for that class is kept to go back to), then says what couldn't come in.
import { ref, onMounted } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
const emit = defineEmits(["close"]);
const { importArmory } = usePlanner();
const dialog = ref(null), text = ref(""), error = ref(""), result = ref(null), busy = ref(false);
onMounted(() => dialog.value?.showModal?.());
function close() {
  dialog.value?.close();
  emit("close");
}
async function fromFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  if (f.size > 5_000_000) return (error.value = "That file is too large to be a character page.");
  text.value = await f.text();
  run();
}
function run() {
  error.value = "";
  result.value = null;
  if (!text.value.trim()) return (error.value = "Choose the saved page or paste its source first.");
  busy.value = true;
  const r = importArmory(text.value);
  busy.value = false;
  if (!r.ok) return (error.value = r.reason);
  result.value = r;
  text.value = "";
}
</script>
<template>
  <dialog ref="dialog" class="item-picker armory-import" aria-labelledby="armory-title" @close="emit('close')" @click="(e) => e.target === dialog && close()">
    <div class="picker-content">
      <div class="drawer-header">
        <h2 id="armory-title">Import a character</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">&times;</button>
      </div>
      <template v-if="!result">
        <ol class="armory-steps">
          <li>On median-xl.com, open your character's page (NotArmory → Your Characters → the character).</li>
          <li>Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save the page, then choose the file here. Or press <kbd>Ctrl</kbd>+<kbd>U</kbd> to see its source, then <kbd>Ctrl</kbd>+<kbd>A</kbd> and <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy it, and paste it below.</li>
        </ol>
        <label class="field">Saved page<input type="file" accept=".html,.htm,text/html" @change="fromFile" /></label>
        <label class="field">Or paste the page source<textarea v-model="text" rows="5" spellcheck="false" placeholder="<!DOCTYPE html> …"></textarea></label>
        <p class="muted armory-private">The page is read in your browser only: nothing is sent anywhere, and your account name and the page's session token aren't kept.</p>
        <p v-if="error" class="save-build-error" role="alert">{{ error }}</p>
        <div class="save-build-actions">
          <button type="button" class="btn" @click="close">Cancel</button>
          <button type="button" class="btn gold" :disabled="busy || !text.trim()" @click="run">Import</button>
        </div>
      </template>
      <template v-else>
        <p class="armory-done" role="status">Imported <b>{{ result.name }}</b>: level {{ result.level }} {{ result.cls }}, with {{ result.items }} items{{ result.merc ? " and the mercenary" : "" }}.</p>
        <template v-if="result.missing.length">
          <p>These couldn't be brought in, so add them yourself if you need them:</p>
          <ul class="armory-missing"><li v-for="m in result.missing" :key="m">{{ m }}</li></ul>
        </template>
        <ul v-if="result.notes.length" class="armory-missing muted"><li v-for="n in result.notes" :key="n">{{ n }}</li></ul>
        <p class="muted">Uniques and set items come in at their best rolls; their exact rolls aren't read from the page yet.</p>
        <div class="save-build-actions">
          <button type="button" class="btn gold" @click="close">Done</button>
        </div>
      </template>
    </div>
  </dialog>
</template>
<style scoped>
.armory-import { width: min(560px, calc(100vw - 32px)); }
.armory-steps { margin: 4px 0 14px; padding-left: 20px; display: grid; gap: 6px; font-size: 0.875rem; line-height: 1.5; }
.armory-import .field { margin: 0 0 12px; }
.armory-import textarea { width: 100%; font: 0.75rem ui-monospace, monospace; resize: vertical; }
.armory-private { font-size: 0.8125rem; }
.armory-done { font-size: 0.9375rem; }
.armory-missing { margin: 6px 0 12px; padding-left: 20px; font-size: 0.8125rem; display: grid; gap: 3px; }
.save-build-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.save-build-error { color: #ef9990; }
kbd { padding: 0 4px; border: 1px solid var(--border); border-radius: 3px; font-size: 0.75rem; }
</style>
