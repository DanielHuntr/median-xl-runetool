<script setup>
import { tabKeys } from "../../tabKeys.js";
import SkillTreeGrid from "./SkillTreeGrid.vue";
import SkillBar from "./SkillBar.vue";
import { usePlanner } from "../../planner/usePlanner.js";
const { engine, state, build, tabs, tab, setTab, available, spent, character } = usePlanner();
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
  </section>
</template>
