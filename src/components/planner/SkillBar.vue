<script setup>
import { computed } from "vue";
import Icon from "../AppIcon.vue";
import SkillIcon from "./SkillIcon.vue";
import { usePlanner } from "../../planner/usePlanner.js";

// The other skills the build uses (like the F1–F8 hotkeys), each with its estimate.
// Any of them can be put in the left or right slot.
const { state, build, engine, damageOf, setSkillSlot, removeFromBar, tipOn } = usePlanner();
const rows = computed(() =>
  build.value.skillBar.map((id) => ({ id, node: engine.skill(id), d: damageOf(id), points: build.value.points[id] || 0 })),
);
const fmt = (n) => Math.round(n).toLocaleString();
</script>
<template>
  <section class="skill-bar" aria-label="Skill bar">
    <div class="skill-bar-head">
      <h3 class="group-title">Skill bar</h3>
      <small class="muted">{{ build.skillBar.length }}/8</small>
      <button class="btn" :disabled="build.skillBar.length >= 8" @click="state.skillChooser = { target: 'bar' }">+ Add</button>
    </div>
    <p v-if="!rows.length" class="muted">Add the skills you use to see their damage, and swap them into your left and right slots.</p>
    <ul v-else>
      <li v-for="r in rows" :key="r.id">
        <span class="skill-bar-skill" tabindex="0" v-on="tipOn({ kind: 'skill', id: r.id })"
          ><SkillIcon :image="r.node?.image" /><span
            ><b>{{ r.node?.name }}</b
            ><small v-if="r.d?.total" class="skill-bar-est" :title="r.d.formula"
              >{{ fmt((r.d.vs || r.d).total[0]) }}–{{ fmt((r.d.vs || r.d).total[1]) }} {{ r.d.count ? `each, ${r.d.count.n} per cast` : r.d.kind === "attack" ? "per hit" : "per cast" }}<template v-if="r.d.vs"> vs {{ r.d.vs.target.name }}</template> <em class="est">est.</em></small
            ><small v-else-if="r.d" class="muted">{{ r.d.lines[0] }}</small
            ><small v-if="!r.points" class="warning">no points</small></span
          ></span
        >
        <span class="skill-bar-actions">
          <button
            :aria-pressed="build.leftSkill === r.id"
            :aria-label="`Use ${r.node?.name} as left skill`"
            title="Left skill"
            @click="setSkillSlot('left', r.id)"
          >
            L
          </button>
          <button
            :aria-pressed="build.rightSkill === r.id"
            :aria-label="`Use ${r.node?.name} as right skill`"
            title="Right skill"
            @click="setSkillSlot('right', r.id)"
          >
            R
          </button>
          <button :aria-label="`Remove ${r.node?.name} from the skill bar`" title="Remove" @click="removeFromBar(r.id)">
            <Icon name="close" />
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>
