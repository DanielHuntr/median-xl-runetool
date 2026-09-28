<script setup>
// Back up and restore what the app keeps in this browser (src/backup.js).
import { ref } from "vue";
import Icon from "./AppIcon.vue";
import { makeBackup, restoreBackup, summarise } from "../backup.js";

const dialog = ref(null);
const here = ref({ builds: 0, filters: 0, settings: 0 });
const result = ref(null);
const error = ref("");
const file = ref(null);

function open() {
  result.value = null;
  error.value = "";
  try { here.value = summarise(makeBackup().data); } catch {}
  dialog.value?.showModal();
}
const close = () => dialog.value?.close();
defineExpose({ open });

function download() {
  error.value = "";
  try {
    const backup = makeBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `runetool-backup-${backup.savedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    error.value = "Your browser didn't let the backup be made (storage is blocked).";
  }
}
async function restore(e) {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  error.value = "";
  result.value = null;
  const r = restoreBackup(await f.text());
  if (r.ok) result.value = r;
  else error.value = r.reason;
}
const reload = () => window.location.reload();
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
</script>
<template>
  <dialog ref="dialog" class="backup" aria-labelledby="backup-title" @click="(e) => { if (e.target === dialog) close(); }">
    <div class="backup-body">
      <header class="backup-head">
        <div>
          <p class="eyebrow">Your data</p>
          <h2 id="backup-title">Back up &amp; restore</h2>
        </div>
        <button type="button" class="icon-btn" aria-label="Close" @click="close"><Icon name="close" /></button>
      </header>
      <p class="backup-note">
        Everything you save here stays in this browser. Clearing site data, or a new browser or computer, starts empty,
        so keep a backup file to bring it with you.
      </p>
      <p class="backup-have">
        This browser has {{ plural(here.builds, "saved build") }}, {{ plural(here.filters, "loot filter") }} and
        {{ plural(here.settings, "other setting") }} (rune inventory, favourites, filters, theme).
      </p>
      <div class="backup-actions">
        <button type="button" class="btn gold" @click="download"><Icon name="save" /> Download a backup</button>
        <button type="button" class="btn" @click="file.click()"><Icon name="backup" /> Restore from a file…</button>
        <input ref="file" type="file" accept=".json,application/json" hidden @change="restore" />
      </div>
      <p class="backup-note">
        Restoring adds the backup's builds and loot filters to the ones here; any with the same name are left as they are.
        Settings are replaced by the backup's.
      </p>
      <p v-if="error" class="backup-msg bad" role="alert">{{ error }}</p>
      <div v-if="result" class="backup-msg good" role="status">
        <p>
          Restored: {{ plural(result.added.builds, "build") }} and {{ plural(result.added.filters, "loot filter") }} added,
          {{ plural(result.settings, "setting") }} replaced.
          <template v-if="result.skipped.builds + result.skipped.filters">
            {{ plural(result.skipped.builds + result.skipped.filters, "entry", "entries") }} you already have
            {{ result.skipped.builds + result.skipped.filters === 1 ? "was" : "were" }} left alone.
          </template>
        </p>
        <button type="button" class="btn gold" @click="reload">Reload to use them</button>
      </div>
    </div>
  </dialog>
</template>
<style scoped>
.backup { width: min(560px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); }
.backup::backdrop { background: var(--shade); }
.backup-body { display: grid; gap: 14px; padding: 20px 22px 22px; }
.backup-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.backup-head h2 { margin: 0; color: var(--gold); font-family: var(--serif); font-size: 1.6rem; }
.eyebrow { margin: 0 0 4px; }
.backup-note { margin: 0; color: var(--muted); font-size: 0.8125rem; line-height: 1.5; }
.backup-have { margin: 0; font-size: 0.9375rem; }
.backup-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.backup-msg { display: grid; gap: 10px; justify-items: start; margin: 0; padding: 10px 12px; border: 1px solid var(--soft-border); border-radius: 8px; background: var(--field); }
.backup-msg p { margin: 0; }
.backup-msg.bad { border-color: var(--red, #c0584f); }
.backup-msg.good { border-color: var(--gold); }
@media (max-width: 640px) { .backup-body { padding: 16px; } }
</style>
