<script setup>
// A starter build's levelling guide: the build made again at levels 25 and 50 (Normal), 75
// and 100 (Nightmare), 125 (Hell) and the endgame build at 150, each with the skills, gear
// and attributes the planner's own rules give at that level (scripts/build-presets.mjs).
// The stages are in their own file, loaded when a guide is first opened.
import { tabKeys } from "../tabKeys.js";
import { computed, ref, watch, nextTick } from "vue";
import Icon from "./AppIcon.vue";
import { encodeBuild, plannerHash } from "../planner/buildCode.js";

const props = defineProps({ preset: { type: Object, default: null } });
const emit = defineEmits(["close"]);
const dialog = ref(null);
const all = ref(null), loadError = ref("");
async function loadStages() {
  if (all.value) return;
  try {
    all.value = (await import("../data/preset-stages.json")).default;
  } catch (e) {
    loadError.value = String(e?.message || e);
  }
}
// Median XL's areas by difficulty (levels.bin monster levels): Normal 1-50, Nightmare 51-100, Hell 100-125.
const RANGES = { Normal: "monsters level 1–50", Nightmare: "monsters level 51–100", Hell: "monsters level 100–125" };
const stages = computed(() => {
  const list = all.value?.stages?.[props.preset?.id];
  if (!list) return [];
  return list.map((s) => (s.final ? { ...s, endgame: true } : s));
});
const pick = ref(0);
watch(() => props.preset, async (p) => {
  if (!p) return dialog.value?.close();
  pick.value = 0;
  await loadStages();
  await nextTick();
  if (!dialog.value?.open) dialog.value?.showModal();
});
const stage = computed(() => stages.value[pick.value] || null);
const label = (s) => (s.endgame ? "Endgame" : s.level <= 50 ? (s.level < 50 ? "Normal" : "End of Normal") : s.level <= 100 ? (s.level < 100 ? "Nightmare" : "End of Nightmare") : "Hell");
const SLOT = { weapon: "Weapon", offhand: "Off-hand", helm: "Helm", body: "Body armor", gloves: "Gloves", belt: "Belt", boots: "Boots", amulet: "Amulet", ring1: "Ring", ring2: "Ring" };
const href = (s) => {
  const b = s.endgame ? props.preset.build : s.build;
  return `#${plannerHash(encodeBuild(b))}&name=${encodeURIComponent(`${props.preset.name}${s.endgame ? "" : ` (level ${s.level})`}`)}`;
};
const fmt = (n) => Math.round(n).toLocaleString();
function close() {
  dialog.value?.close();
  emit("close");
}
</script>
<template>
  <dialog ref="dialog" class="guide" aria-labelledby="guide-title" @cancel.prevent="close" @click="(e) => { if (e.target === dialog) close(); }">
    <div v-if="preset" class="guide-body">
      <header class="guide-head">
        <div>
          <p class="eyebrow">Levelling guide · {{ preset.cls }}</p>
          <h2 id="guide-title">{{ preset.name }}</h2>
        </div>
        <button type="button" class="icon-btn" aria-label="Close" @click="close"><Icon name="close" /></button>
      </header>
      <p v-if="loadError" class="guide-note">Couldn't load the guide: {{ loadError }}</p>
      <p v-else-if="!stages.length" class="guide-note">This build's levelling guide hasn't been generated yet.</p>
      <template v-else>
        <div class="guide-stages" role="tablist" aria-label="Stages" @keydown="tabKeys">
          <button v-for="(s, i) in stages" :key="s.level" type="button" role="tab" :aria-selected="pick === i" :tabindex="pick === i ? 0 : -1" :class="{ selected: pick === i }" @click="pick = i">
            <b>{{ s.level }}</b><small>{{ label(s) }}</small>
          </button>
        </div>
        <section v-if="stage" class="guide-stage" role="tabpanel">
          <template v-if="stage.endgame">
            <p class="guide-lead">The finished build at level {{ stage.level }}: what the starter build card shows.</p>
            <a class="btn gold" :href="href(stage)">Open the endgame build in the planner</a>
          </template>
          <template v-else-if="!stage.main">
            <p class="guide-note" v-for="n in stage.notes" :key="n">{{ n }}</p>
          </template>
          <template v-else>
            <p class="guide-lead">
              Level {{ stage.level }} · {{ stage.difficulty }} ({{ RANGES[stage.difficulty] }})
            </p>
            <div class="guide-grid">
              <div class="guide-card">
                <h3>Skill to use</h3>
                <p class="guide-skill">{{ stage.mainName }}</p>
                <p v-if="stage.levelling" class="guide-muted">Until {{ preset.skills[0] }} unlocks at level {{ stage.unlocksAt }}.</p>
                <p v-if="stage.vs" class="guide-muted">About {{ fmt(stage.vs) }} damage per hit or cast against a typical {{ stage.difficulty }} monster (est.).</p>
                <p class="guide-muted">{{ stage.life.toLocaleString() }} life · {{ stage.mana.toLocaleString() }} mana</p>
              </div>
              <div class="guide-card">
                <h3>Skill points</h3>
                <ul class="guide-list"><li v-for="[n, v] in stage.points.slice(0, 8)" :key="n"><span>{{ n }}</span><b>{{ v }}</b></li></ul>
              </div>
              <div class="guide-card">
                <h3>Attributes</h3>
                <ul class="guide-list"><li v-for="(v, a) in stage.attrs" :key="a"><span>{{ a[0].toUpperCase() + a.slice(1) }}</span><b>{{ v }}</b></li></ul>
              </div>
              <div class="guide-card guide-gear">
                <h3>Gear to aim for</h3>
                <ul class="guide-list"><li v-for="[slot, n] in stage.gear" :key="slot"><span>{{ SLOT[slot] || slot }}</span><b>{{ n }}</b></li></ul>
                <p v-if="!stage.gear.length" class="guide-muted">Nothing the planner suggests yet at this level.</p>
              </div>
            </div>
            <p v-for="n in stage.notes" :key="n" class="guide-note">{{ n }}</p>
            <div class="guide-actions">
              <a class="btn gold" :href="href(stage)">Open this stage in the planner</a>
              <span class="guide-muted">Made with the planner's own rules and Suggest gear; not tested in game.</span>
            </div>
          </template>
        </section>
      </template>
    </div>
  </dialog>
</template>
<style scoped>
.guide { width: min(900px, calc(100vw - 32px)); max-height: 88dvh; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text); }
.guide::backdrop { background: var(--shade); }
.guide-body { display: grid; gap: 14px; padding: 20px 22px 22px; }
.guide-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.guide-head h2 { margin: 0; color: var(--gold); font-family: var(--serif); font-size: 1.6rem; }
.eyebrow { margin: 0 0 4px; }
.guide-stages { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 6px; }
.guide-stages button { display: grid; gap: 2px; padding: 8px 6px; border: 1px solid var(--soft-border); border-radius: 8px; background: var(--field); color: var(--text); }
.guide-stages button b { font-family: var(--serif); font-size: 1.15rem; }
.guide-stages button small { color: var(--muted); font-size: 0.6875rem; }
.guide-stages button:hover { border-color: var(--border); }
.guide-stages button.selected { border-color: var(--gold); background: var(--gold-bg); }
.guide-stages button.selected b { color: var(--gold); }
.guide-stage { display: grid; gap: 12px; }
.guide-lead { margin: 0; color: var(--text); }
.guide-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.guide-card { display: grid; align-content: start; gap: 6px; padding: 12px 14px; border: 1px solid var(--soft-border); border-radius: 8px; background: var(--field); }
.guide-card h3 { margin: 0; color: var(--muted); font-size: 0.6875rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; }
.guide-skill { margin: 0; color: var(--gold); font-family: var(--serif); font-size: 1.2rem; }
.guide-muted { margin: 0; color: var(--muted); font-size: 0.8125rem; line-height: 1.45; }
.guide-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; font-size: 0.8125rem; }
.guide-list li { display: flex; justify-content: space-between; gap: 10px; }
.guide-list li span { color: var(--muted); }
.guide-list li b { font-weight: 500; text-align: right; }
.guide-note { margin: 0; color: var(--muted); font-size: 0.8125rem; }
.guide-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
@media (max-width: 640px) {
  .guide-grid { grid-template-columns: minmax(0, 1fr); }
  .guide-body { padding: 16px; }
}
</style>
