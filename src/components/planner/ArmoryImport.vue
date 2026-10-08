<script setup>
// Import a character from its median-xl.com page (planner/armory.js): by name (our server fetches
// the public page, api/char.js), or the saved page, its source or its "Export build" text, read in
// this browser only. Opens the character in the planner like a shared build
// (the player's own build for that class is kept to go back to), then says what couldn't come in.
import { ref, onMounted } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { useRunetool } from "../../composables/useRunetool.js";
import { RIMG, STD } from "../../data/index.js";
const emit = defineEmits(["close"]);
const { importArmory } = usePlanner();
const { owned } = useRunetool();
// Runes the character carries or stashes, into My Runes (the Runeword Finder): 1, or 2 for two or more.
const runeCount = (r) => Object.values(r?.runes || {}).reduce((a, n) => a + n, 0);
const runesAdded = ref(false);
// Runes in the game's order (El, Eld, Tir …), the others after.
const runeList = (r) => Object.entries(r?.runes || {}).sort(([a], [b]) => (STD.indexOf(a) + 1 || 99) - (STD.indexOf(b) + 1 || 99));
function addRunes() {
  for (const [rune, n] of Object.entries(result.value.runes || {})) owned.value[rune] = Math.max(owned.value[rune] || 0, Math.min(2, n));
  runesAdded.value = true;
}
const dialog = ref(null), text = ref(""), error = ref(""), result = ref(null), busy = ref(false), charName = ref("");
const NAME = /^[A-Za-z0-9_-]{2,16}$/;
async function fromName() {
  error.value = "";
  result.value = null;
  const name = charName.value.trim();
  if (!NAME.test(name)) return (error.value = "A character name is 2 to 16 letters, digits, - or _.");
  busy.value = true;
  try {
    const res = await fetch(`/api/char?name=${encodeURIComponent(name)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.page) return (error.value = body.error || "median-xl.com couldn't be reached. Try again, or save the page instead.");
    const r = importArmory(body.page);
    if (!r.ok) return (error.value = r.reason);
    result.value = r;
  } catch {
    error.value = "median-xl.com couldn't be reached. Try again, or save the page instead.";
  } finally {
    busy.value = false;
  }
}
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
        <form class="armory-by-name" @submit.prevent="fromName">
          <label class="field">Character name<input v-model="charName" type="text" autocomplete="off" spellcheck="false" maxlength="16" placeholder="As it's spelled in game" /></label>
          <button type="submit" class="btn gold" :disabled="busy || !charName.trim()">{{ busy ? "Fetching…" : "Fetch" }}</button>
        </form>
        <p class="muted armory-private">Fetched from the character's public page on median-xl.com, which shows the copy it last saved, not one played since. Quests aren't on it: those that give points are worked out from the points spent.</p>
        <p class="armory-or">Or from your own page, including its quests:</p>
        <ol class="armory-steps">
          <li>On median-xl.com, open your character's page (NotArmory → Your Characters → the character).</li>
          <li>Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save the page, then choose the file here. Or press <kbd>Ctrl</kbd>+<kbd>U</kbd> to see its source, then <kbd>Ctrl</kbd>+<kbd>A</kbd> and <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy it, and paste it below.</li>
          <li>Skills only? The page's <b>Export build</b> button copies its skills, quests and attributes: paste that below (it has no items).</li>
        </ol>
        <label class="field">Saved page<input type="file" accept=".html,.htm,text/html" @change="fromFile" /></label>
        <label class="field">Or paste the page source, or the Export build text<textarea v-model="text" rows="5" spellcheck="false" placeholder="<!DOCTYPE html> …"></textarea></label>
        <p class="muted armory-private">A saved or pasted page is read in your browser only: nothing is sent anywhere, and your account name and the page's session token aren't kept.</p>
        <p v-if="error" class="save-build-error" role="alert">{{ error }}</p>
        <div class="save-build-actions">
          <button type="button" class="btn" @click="close">Cancel</button>
          <button type="button" class="btn gold" :disabled="busy || !text.trim()" @click="run">Import</button>
        </div>
      </template>
      <template v-else>
        <div class="armory-result">
          <p class="armory-done" role="status">Imported <b>{{ result.name }}</b>: level {{ result.level }} {{ result.cls }}, with {{ result.items }} items{{ result.merc ? " and the mercenary" : "" }}.</p>
          <p v-if="result.spare">{{ result.spare }} item{{ result.spare === 1 ? "" : "s" }} from the inventory and stash {{ result.spare === 1 ? "is" : "are" }} under <b>Spare items</b> in the equipment panel, to try on.</p>
          <section v-if="runeCount(result)" class="armory-runes" aria-labelledby="armory-runes-h">
            <div class="armory-runes-head">
              <h3 id="armory-runes-h">{{ runeCount(result) }} rune{{ runeCount(result) === 1 ? "" : "s" }} found</h3>
              <button v-if="!runesAdded" type="button" class="btn" @click="addRunes">Add to My Runes</button>
              <span v-else class="muted armory-added">Added to My Runes</span>
            </div>
            <ul class="armory-rune-list">
              <li v-for="[rune, n] in runeList(result)" :key="rune">
                <img v-if="RIMG[rune]" :src="RIMG[rune]" alt="" />{{ rune }}<span v-if="n > 1" class="muted">×{{ n }}</span>
              </li>
            </ul>
          </section>
          <template v-if="result.missing.length">
            <p>These couldn't be brought in, so add them yourself if you need them:</p>
            <ul class="armory-missing"><li v-for="m in result.missing" :key="m">{{ m }}</li></ul>
          </template>
          <ul v-if="result.notes.length" class="armory-notes muted"><li v-for="n in result.notes" :key="n">{{ n }}</li></ul>
        </div>
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
.armory-private { font-size: 0.8125rem; line-height: 1.45; margin: 8px 0 0; }
.armory-by-name { display: flex; gap: 12px; align-items: flex-end; }
.armory-by-name .field { flex: 1; margin: 0; }
.armory-by-name input { width: 100%; }
.armory-or { margin: 16px 0 4px; font-weight: 600; font-size: 0.875rem; }
.armory-result { display: grid; gap: 12px; font-size: 0.9375rem; line-height: 1.5; }
.armory-result p { margin: 0; }
.armory-runes { padding: 12px; border: 1px solid var(--border); border-radius: 6px; display: grid; gap: 10px; }
.armory-runes-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.armory-runes h3 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
.armory-added { font-size: 0.8125rem; }
.armory-rune-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.armory-rune-list li { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 4px; border: 1px solid var(--border); border-radius: 999px; font-size: 0.8125rem; }
.armory-rune-list img { width: 18px; height: 18px; }
.armory-notes { margin: 0; padding: 2px 0 2px 12px; list-style: none; border-left: 2px solid var(--border); font-size: 0.8125rem; display: grid; gap: 3px; }
.armory-missing { margin: 6px 0 12px; padding-left: 20px; font-size: 0.8125rem; display: grid; gap: 3px; }
.save-build-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.save-build-error { color: #ef9990; }
kbd { padding: 0 4px; border: 1px solid var(--border); border-radius: 3px; font-size: 0.75rem; }
</style>
