<script setup>
import { ref, computed, onMounted } from "vue";
import Icon from "../AppIcon.vue";
import SkillIcon from "./SkillIcon.vue";
import HoverCard from "./HoverCard.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { BASIC_ATTACK } from "../../planner/damage.js";

// Picks a skill for the left/right slot or the skill bar. Lists only skills with points
// (passives excluded): as in D2, levels from gear don't make an unlearned skill usable.
const { state, build, engine, character, chooseSkill, damageOf, tipOn } = usePlanner();
const dialog = ref(null);
onMounted(() => dialog.value?.showModal?.());
const close = () => (state.skillChooser = null);

const target = computed(() => state.skillChooser?.target);
const title = computed(() =>
  target.value === "bar" ? "Add to skill bar" : `Choose ${target.value === "left" ? "left" : "right"} skill`,
);
const groups = computed(() => {
  const b = build.value;
  return engine
    .tabs(b.cls)
    .map((tab) => ({
      tab,
      skills: engine
        .treeNodes(b.cls, tab)
        .filter((n) => !engine.isInnate(n.id) && !n.tags.includes("Passive"))
        .filter((n) => (b.points[n.id] || 0) > 0)
        .filter((n) => target.value !== "bar" || !b.skillBar.includes(n.id)),
    }))
    .filter((g) => g.skills.length);
});
function summary(id) {
  const d = damageOf(id);
  if (!d) return "";
  if (d.total) return `${d.total[0].toLocaleString()}–${d.total[1].toLocaleString()} per hit`;
  return d.lines[0] || "";
}
</script>
<template>
  <dialog
    ref="dialog"
    class="item-picker skill-chooser"
    aria-labelledby="skill-chooser-title"
    @cancel.prevent="close"
    @click="(e) => e.target === dialog && close()"
  >
    <div class="picker-content">
      <div class="drawer-header">
        <div>
          <div class="eyebrow">{{ build.cls }} · level {{ build.level }}</div>
          <h2 id="skill-chooser-title">{{ title }}</h2>
        </div>
        <button class="icon-btn" aria-label="Close" @click="close"><Icon name="close" /></button>
      </div>
      <ul class="picker-list">
        <li v-if="target !== 'bar'">
          <button @click="chooseSkill(BASIC_ATTACK)">
            <span class="skill-icon attack-icon" aria-hidden="true"><Icon name="rune" /></span
            ><span><b>Attack</b><small>Basic weapon attack · {{ summary(BASIC_ATTACK) }}</small></span>
          </button>
        </li>
        <li v-if="target !== 'bar' && build[target === 'left' ? 'leftSkill' : 'rightSkill']">
          <button @click="chooseSkill(null)">
            <span class="skill-icon" aria-hidden="true"></span><span><b>Empty</b><small>Clear this slot</small></span>
          </button>
        </li>
      </ul>
      <p v-if="!groups.length" class="muted">
        Put points into an active skill first; skills you've put points into are listed here.
      </p>
      <section v-for="g in groups" :key="g.tab">
        <h3 class="chooser-tab">{{ g.tab }}</h3>
        <ul class="picker-list">
          <li v-for="n in g.skills" :key="n.id">
            <button v-on="tipOn({ kind: 'skill', id: n.id })" @click="chooseSkill(n.id)">
              <SkillIcon :image="n.image" /><span
                ><b>{{ n.name }}</b
                ><small
                  >Level {{ (build.points[n.id] || 0) + (character.soft[n.id] || 0) }} · {{ summary(n.id) }}</small
                ></span
              >
            </button>
          </li>
        </ul>
      </section>
    </div>
    <HoverCard />
  </dialog>
</template>
