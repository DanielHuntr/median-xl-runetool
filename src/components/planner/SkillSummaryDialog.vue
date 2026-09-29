<script setup>
// Every skill with points, across all trees, in one list (the tree view shows one tree at a
// time). Opened from the skill points counter; choosing a skill opens its tree and selects it.
import { ref, onMounted } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import SkillIcon from "./SkillIcon.vue";
import HoverCard from "./HoverCard.vue";
const emit = defineEmits(["close"]);
const { state, allocated, character, setTab, tipOn, hideTip } = usePlanner();
const dialog = ref(null);
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
</script>
<template>
  <dialog ref="dialog" class="item-picker skill-summary-dialog" aria-labelledby="skill-summary-title" @close="emit('close')" @click="(e) => e.target === dialog && close()">
    <div class="picker-content">
      <div class="drawer-header">
        <h2 id="skill-summary-title">Skill summary <small class="muted">{{ allocated.length }} skills</small></h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">&times;</button>
      </div>
      <p v-if="!allocated.length" class="muted">No skill points spent yet.</p>
      <section v-else class="planner-summary" aria-label="Skill summary">
        <ul>
          <li v-for="n in allocated" :key="n.id">
            <button v-on="tipOn({ kind: 'skill', id: n.id })" @click="open(n)">
              <SkillIcon :image="n.image" /><span>{{ n.name }}<small>{{ n.tree }}</small></span
              ><b>{{ n.points }}<i v-if="character.soft[n.id]">+{{ character.soft[n.id] }}</i></b>
            </button>
          </li>
        </ul>
      </section>
    </div>
    <HoverCard />
  </dialog>
</template>
