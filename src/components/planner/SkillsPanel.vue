<script setup>
import { tabKeys } from "../../tabKeys.js";
import SkillTreeGrid from "./SkillTreeGrid.vue";
import SkillBar from "./SkillBar.vue";
import SkillSummaryDialog from "./SkillSummaryDialog.vue";
import SkillDetail from "./SkillDetail.vue";
import { usePlanner } from "../../planner/usePlanner.js";
const { engine, state, build, tabs, tab, setTab, available, spent, character, allocated } = usePlanner();
</script>
<template>
  <section class="skills-panel" aria-label="Skill trees">
    <div class="skills-panel-inner">
      <div class="skills-tree" role="tabpanel" :aria-label="tab + ' tree'">
        <SkillTreeGrid />
      </div>
      <div class="skills-side">
        <div class="skill-orb" aria-live="polite">
          <b>{{ available - spent }}</b><small>skill points</small>
        </div>
        <!-- Every skill with points, all trees at once (SkillSummaryDialog). -->
        <button type="button" class="btn skills-summary-btn" :disabled="!allocated.length" @click="state.skillSummary = true">Summary</button>
        <div class="skills-tabs" role="tablist" aria-label="Skill trees" aria-orientation="vertical" @keydown="tabKeys">
          <button
            v-for="t in tabs"
            role="tab"
            :aria-selected="tab === t"
            :tabindex="tab === t ? 0 : -1"
            :class="{ selected: tab === t }"
            @click="setTab(t)"
          >
            {{ t }}<b v-if="engine.tabPoints(build, t)">{{ engine.tabPoints(build, t) }}</b>
          </button>
        </div>
        <p v-if="character.allSkills || character.classSkills" class="skills-bonus">
          Bonuses: +{{ character.allSkills }} all skills<template v-if="character.classSkills"
            >, +{{ character.classSkills }} {{ state.cls }}</template
          >
        </p>
      </div>
    </div>
    <SkillBar />
    <!-- The selected skill, or how to add points, with the trees it belongs to. -->
    <SkillDetail />
    <SkillSummaryDialog v-if="state.skillSummary" @close="state.skillSummary = false" />
  </section>
</template>
