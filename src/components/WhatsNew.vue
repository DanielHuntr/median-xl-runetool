<script setup>
// "What's new": a button in the page header (with a dot while there's something the visitor
// hasn't seen) that opens a short list of what changed, newest first (src/data/changelog.js).
// Opening it marks the latest entry as seen, in this browser.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { CHANGELOG } from "../data/changelog.js";

const KEY = "mxlrw2:news-seen";
const latest = CHANGELOG[0]?.date || "";
const seen = ref((() => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } })());
const unseen = computed(() => !!latest && seen.value < latest);
const open = ref(false), btn = ref(null), panel = ref(null);
const when = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
// Entries newer than what the visitor had seen are marked "New".
const seenBefore = ref(seen.value);
async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  seenBefore.value = seen.value;
  seen.value = latest;
  try { localStorage.setItem(KEY, latest); } catch {}
  await nextTick();
  panel.value?.querySelector("h2")?.focus();
}
const close = () => { if (open.value) { open.value = false; btn.value?.focus(); } };
const outside = (e) => { if (open.value && !e.target.closest?.(".news")) open.value = false; };
const esc = (e) => { if (e.key === "Escape") close(); };
onMounted(() => { document.addEventListener("click", outside); document.addEventListener("keydown", esc); });
onBeforeUnmount(() => { document.removeEventListener("click", outside); document.removeEventListener("keydown", esc); });
</script>

<template>
  <div class="news">
    <button ref="btn" type="button" class="news-btn" :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      What's new<span v-if="unseen" class="news-dot"><span class="sr-only"> (new)</span></span>
    </button>
    <div v-if="open" ref="panel" class="news-panel" role="dialog" aria-labelledby="news-title">
      <header>
        <h2 id="news-title" tabindex="-1">What's new</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">&times;</button>
      </header>
      <section v-for="e in CHANGELOG" :key="e.date">
        <h3>{{ when(e.date) }}<span v-if="e.date > seenBefore" class="news-new">New</span></h3>
        <ul>
          <li v-for="t in e.items" :key="t">{{ t }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.news { position: relative; }
.news-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font-size: 0.8125rem;
  white-space: nowrap;
}
.news-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0 2px var(--bg, #0e0e0e);
}
.news-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 60;
  width: min(400px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  overflow-y: auto;
  padding: 16px 18px 6px;
  border: 1px solid var(--border);
  border-top: 2px solid var(--gold);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.45);
  text-align: left;
}
.news-panel header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.news-panel h2 { margin: 0; color: var(--gold); font-size: 1.15rem; outline: none; }
.news-panel section { padding: 10px 0; border-top: 1px solid var(--soft-border, var(--border)); }
.news-panel h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; }
.news-new { padding: 1px 6px; border-radius: 4px; background: var(--gold-bg); color: var(--gold); letter-spacing: 0; text-transform: none; }
.news-panel ul { margin: 0; padding-left: 18px; display: grid; gap: 5px; font-size: 0.875rem; line-height: 1.45; }
@media (max-width: 600px) {
  .news-panel { position: fixed; top: 64px; right: 16px; left: 16px; width: auto; }
}
</style>
