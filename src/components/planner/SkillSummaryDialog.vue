<script setup>
// Every skill with points, across all trees, in one list (the tree view shows one tree at a
// time). Opened from the skill points counter; choosing a skill opens its tree and selects it.
// "Skill order" lists the points in the order they were spent, with the character level each
// can come at, for planning a character's levelling; a row can be moved earlier or later.
import { ref, computed, onMounted } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import SkillIcon from "./SkillIcon.vue";
import HoverCard from "./HoverCard.vue";
const emit = defineEmits(["close"]);
const { state, allocated, character, setTab, tipOn, hideTip, engine, build, skillOrder, moveOrder } = usePlanner();
const dialog = ref(null), view = ref("skills");
onMounted(() => dialog.value?.showModal?.());
function close() {
  hideTip();
  dialog.value?.close();
  emit("close");
}
function open(n) {
  setTab(n.tree);
  state.selected = n.id;
  close();
}
// Recomputed as the build changes (moving a row changes the order).
const rows = computed(() => (view.value === "order" ? (void build.value.order?.length, void JSON.stringify(build.value.order), skillOrder()) : []));
const lvl = (n) => (n > 150 ? "after 150" : n);
const levels = (r) => (r.level > 150 ? "After level 150" : r.level === r.levelTo ? `Level ${r.level}` : `Levels ${r.level}–${lvl(r.levelTo)}`);
const max = (id) => engine.maxLevel?.(build.value, id) ?? engine.skill(id)?.max ?? "";
</script>
<template>
  <dialog ref="dialog" class="item-picker skill-summary-dialog" aria-labelledby="skill-summary-title" @close="emit('close')" @click="(e) => e.target === dialog && close()">
    <div class="picker-content">
      <div class="drawer-header">
        <h2 id="skill-summary-title">Skill summary <small class="muted">{{ allocated.length }} {{ allocated.length === 1 ? "skill" : "skills" }}</small></h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">&times;</button>
      </div>
      <p v-if="!allocated.length" class="muted">No skill points spent yet.</p>
      <template v-else>
        <div class="tabs summary-tabs" role="tablist" aria-label="Show">
          <button role="tab" :aria-selected="view === 'skills'" @click="view = 'skills'">By skill</button>
          <button role="tab" :aria-selected="view === 'order'" @click="view = 'order'">Skill order</button>
        </div>
        <section v-if="view === 'skills'" class="planner-summary" aria-label="Skill summary">
          <ul>
            <li v-for="n in allocated" :key="n.id">
              <button v-on="tipOn({ kind: 'skill', id: n.id })" @click="open(n)">
                <SkillIcon :image="n.image" /><span>{{ n.name }}<small>{{ n.tree }}</small></span
                ><b>{{ n.points }}<i v-if="character.soft[n.id]">+{{ character.soft[n.id] }}</i></b>
              </button>
            </li>
          </ul>
        </section>
        <section v-else class="skill-order" aria-label="Skill order">
          <p class="muted">The order your points were spent in, and the character level each can come at (one point a level, plus quest points). Move a row to plan your levelling.</p>
          <ol>
            <li v-for="(r, i) in rows" :key="`${r.start}-${r.id}`" :class="{ problem: r.problem }">
              <span class="order-level">{{ levels(r) }}</span>
              <SkillIcon :image="engine.skill(r.id).image" />
              <span class="order-skill">{{ engine.skillName(r.id) }}<small>+{{ r.count }} · to {{ r.to }}/{{ max(r.id) }}</small><small v-if="r.problem" class="order-problem">{{ r.problem }}</small></span>
              <span class="order-move">
                <button type="button" class="icon-btn" :disabled="i === 0" :aria-label="`Move ${engine.skillName(r.id)} earlier`" @click="moveOrder(rows, i, -1)">↑</button>
                <button type="button" class="icon-btn" :disabled="i === rows.length - 1" :aria-label="`Move ${engine.skillName(r.id)} later`" @click="moveOrder(rows, i, 1)">↓</button>
              </span>
            </li>
          </ol>
        </section>
      </template>
    </div>
    <HoverCard />
  </dialog>
</template>
<style scoped>
.summary-tabs { display: flex; gap: 8px; margin: 4px 0 14px; }
.summary-tabs button { padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--muted); font-size: 0.8125rem; }
.summary-tabs button[aria-selected="true"] { border-color: var(--gold); color: var(--gold); background: var(--gold-bg); }
.skill-order > p { margin: 0 0 12px; font-size: 0.8125rem; }
.skill-order ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 60vh; overflow-y: auto; }
.skill-order li { display: grid; grid-template-columns: 7.5em 32px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
.skill-order li.problem { border-color: color-mix(in srgb, #e5534b 60%, var(--border)); }
.order-level { color: var(--gold); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
.order-skill { display: grid; gap: 1px; }
.order-skill small { color: var(--muted); font-size: 0.75rem; }
.order-skill .order-problem { color: #ef9990; }
.order-move { display: flex; gap: 4px; }
.order-move .icon-btn { width: 30px; height: 30px; }
.skill-order :deep(.skill-icon) { width: 32px; height: 32px; }
</style>
