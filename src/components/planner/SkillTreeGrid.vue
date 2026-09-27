<script setup>
import { computed } from "vue";
import SkillIcon from "./SkillIcon.vue";
import { usePlanner } from "../../planner/usePlanner.js";
const { engine, state, build, character, tab, add, remove, tipOn } = usePlanner();

const nodes = computed(() => engine.treeNodes(state.cls, tab.value));
const rows = computed(() => Math.max(1, ...nodes.value.map((n) => n.row)));
const lines = computed(() => {
  const at = new Map(nodes.value.map((n) => [n.id, n]));
  return nodes.value.flatMap((n) =>
    n.parents
      .filter((p) => at.has(p))
      .map((p) => ({
        key: p + ">" + n.id,
        x1: at.get(p).col * 100 - 50,
        y1: at.get(p).row * 100 - 50,
        x2: n.col * 100 - 50,
        y2: n.row * 100 - 50,
        on: (build.value.points[p] || 0) > 0,
      })),
  );
});
function info(n) {
  const b = build.value;
  const points = b.points[n.id] || 0;
  const innate = engine.isInnate(n.id);
  const blockers = points
    ? []
    : [...engine.prereqProblems(b, n.id), ...engine.restrictionProblems(b, n.id)];
  const levelReq = engine.requiredCharLevel(n.id, b);
  const locked = !innate && !points && (blockers.length > 0 || (!state.autoLevel && levelReq > b.level));
  const max = engine.maxLevel(b, n.id);
  const bonus = character.value.soft[n.id] || 0;
  const label = [
    n.name,
    innate ? "innate skill" : `${points} of ${max} points`,
    bonus ? `+${bonus} from equipment and skills` : "",
    ...blockers,
    levelReq > b.level ? `requires character level ${levelReq}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return { points, innate, locked, max, label, bonus };
}
const infos = computed(() => new Map(nodes.value.map((n) => [n.id, info(n)])));
function onClick(n, e) {
  state.selected = n.id;
  if (engine.isInnate(n.id)) return;
  e.shiftKey ? add(n.id, 10) : add(n.id);
}
function onRemove(n, e) {
  state.selected = n.id;
  e.shiftKey ? remove(n.id, 10) : remove(n.id);
}
function onKey(n, e) {
  if (["-", "Delete", "Backspace"].includes(e.key)) {
    e.preventDefault();
    onRemove(n, e);
  }
}
</script>
<template>
  <div class="skill-tree" :style="{ '--rows': rows }">
    <svg
      class="skill-links"
      :viewBox="`0 0 300 ${rows * 100}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        v-for="l in lines"
        :key="l.key"
        :x1="l.x1"
        :y1="l.y1"
        :x2="l.x2"
        :y2="l.y2"
        :class="{ on: l.on }"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <button
        v-for="n in nodes"
        :key="n.id"
        class="skill-node"
        :class="{
          allocated: infos.get(n.id).points > 0,
          locked: infos.get(n.id).locked,
          innate: infos.get(n.id).innate,
          selected: state.selected === n.id,
        }"
        :style="{ gridRow: n.row, gridColumn: n.col }"
        :aria-label="infos.get(n.id).label"
        v-on="tipOn({ kind: 'skill', id: n.id })"
        @click="onClick(n, $event)"
        @contextmenu.prevent="onRemove(n, $event)"
        @keydown="onKey(n, $event)"
        @focus="state.selected = n.id"
      >
        <span class="skill-frame"
          ><SkillIcon :image="n.image" /><b
            class="skill-points"
            v-if="!infos.get(n.id).innate"
            >{{ infos.get(n.id).points
            }}<i v-if="infos.get(n.id).bonus">+{{ infos.get(n.id).bonus }}</i
            ><small>/{{ infos.get(n.id).max }}</small></b
          ></span
        ><span class="skill-name">{{ n.name }}</span>
      </button>
  </div>
</template>
