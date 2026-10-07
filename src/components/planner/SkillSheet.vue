<script setup>
import { computed } from "vue";
import SkillText from './SkillText.vue';
import { usePlanner } from "../../planner/usePlanner.js";

// The in-game style skill sheet shown when hovering a skill.
const props = defineProps({ id: { type: String, required: true } });
const { engine, build, skillBuild, character } = usePlanner();

const s = computed(() => engine.node(build.value, props.id) || engine.skill(props.id));
const d = computed(() => {
  const b = build.value;
  const points = b.points[props.id] || 0;
  const bonus = character.value.soft[props.id] || 0;
  const max = engine.maxLevel(b, props.id);
  const blockers = points ? [] : [...engine.prereqProblems(b, props.id), ...engine.restrictionProblems(b, props.id)];
  const req = engine.requiredCharLevel(props.id, b);
  if (req > b.level) blockers.unshift(`Requires character level ${req}`);
  return {
    points,
    bonus,
    max,
    innate: engine.isInnate(props.id),
    blockers,
    now: engine.describe(skillBuild.value, props.id, points),
    next: points && points < max ? engine.describe(skillBuild.value, props.id, points + 1) : null,
    synergies: engine.synergies(skillBuild.value, props.id, points),
  };
});
const tags = computed(() => [s.value.tabName, ...s.value.tags.filter((t) => t !== s.value.tabName)].join(" · "));
</script>
<template>
  <div v-if="s" class="sheet skill-sheet">
    <p class="sheet-name">{{ s.name }}</p>
    <p class="sheet-base">{{ tags }}</p>
    <p v-if="d.innate">Innate skill</p>
    <p v-else>
      Level <b>{{ d.points + d.bonus }}</b
      ><template v-if="d.bonus"> ({{ d.points }} + {{ d.bonus }} from equipment and skills)</template> · max {{ d.max }} points
    </p>
    <p v-for="x in d.blockers" class="unmet">{{ x }}</p>
    <p v-for="l in d.now.description" class="sheet-desc"><SkillText :line="l" /></p>
    <p v-for="l in d.now.restriction" class="dim"><SkillText :line="l" /></p>
    <ul class="sheet-lines">
      <li v-for="l in d.now.effect" :class="[l.status === 'unknown' ? 'unknown' : l.status === 'note' ? 'effect' : 'counted', { 'skill-effect-heading': l.heading }]">
        <SkillText :line="l" /><small v-if="l.status === 'unknown'"> (not available)</small
        ><small v-else-if="l.status === 'varies'"> (depends on stats)</small>
      </li>
    </ul>
    <template v-if="d.next?.effect?.length">
      <p class="sheet-next">With one more point</p>
      <ul class="sheet-lines">
        <li v-for="l in d.next.effect" :class="[l.status === 'unknown' ? 'unknown' : 'counted', { 'skill-effect-heading': l.heading }]"><SkillText :line="l" /></li>
      </ul>
    </template>
    <template v-if="d.synergies">
      <template v-for="(sec, i) in d.synergies.sections" :key="i">
        <p v-if="sec.title" class="sheet-next" :class="'d2c-' + sec.colour">{{ sec.title }}</p>
        <ul class="sheet-lines">
          <li v-for="l in [...sec.lines, ...(sec.bonus || [])]" :class="[l.status === 'unknown' ? 'unknown' : 'counted', l.colour && 'd2c-' + l.colour]">
            {{ l.text }}
          </li>
        </ul>
      </template>
    </template>
    <p class="sheet-source">{{ [engine.datasets.medianDb.label, engine.datasets.game?.label].filter(Boolean).join(" · ") }}</p>
  </div>
</template>
