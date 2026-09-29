<script setup>
import { computed, reactive, watch } from "vue";
import Icon from "../AppIcon.vue";
import SkillIcon from "./SkillIcon.vue";
import TargetPicker from "./TargetPicker.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { BASIC_ATTACK } from "../../planner/damage.js";

// Left and right skill slots with each skill's estimated damage, like the two skill
// boxes on the in-game character screen.
const { state, build, engine, damageOf, tipOn } = usePlanner();
const slots = computed(() =>
  [
    ["left", "Left skill", build.value.leftSkill],
    ["right", "Right skill", build.value.rightSkill],
  ].map(([side, label, id]) => ({ side, label, id, d: id ? damageOf(id) : null, node: id && id !== BASIC_ATTACK ? engine.skill(id) : null })),
);
const fmt = (n) => Math.round(n).toLocaleString();
const range = (r) => `${fmt(r[0])}–${fmt(r[1])}`;
// The headline is one hit or cast, as the game's tooltip shows it. For skills that repeat
// (Slayer's 25 casts, Mind Flay's beams) the combined figure is only an upper bound:
// spread, range and timing decide how many actually land on one monster.
const per = (d) => (d.count ? "each" : d.kind === "attack" ? "per hit" : "per cast");
const open = (side) => (state.skillChooser = { target: side });
// Each card's breakdown opens and closes on its own; closed by default to save space. The
// choice is remembered in this browser only (a convenience, so storage errors are ignored).
const KEY = "mxlrw2:skill-slot-details";
const readOpen = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const details = reactive({ left: false, right: false, ...readOpen() });
watch(details, (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} });
const hasDetails = (s) => !!s.d?.total;
</script>
<template>
  <div class="skill-slots">
    <TargetPicker />
    <!-- Top to bottom: which slot, the skill, then its numbers as a stat list. -->
    <div v-for="s in slots" :key="s.side" class="skill-slot">
      <span class="skill-slot-label">{{ s.label }} <em v-if="s.d?.kind === 'attack' || s.d?.kind === 'spell'" class="est">est.</em></span>
      <div class="skill-slot-id">
        <button
          class="skill-slot-pick"
          :aria-label="`${s.label}: ${s.d ? s.d.name : 'empty'}. Choose a skill`"
          v-on="s.node ? tipOn({ kind: 'skill', id: s.id }) : {}"
          @click="open(s.side)"
        >
          <SkillIcon v-if="s.node" :image="s.node.image" />
          <span v-else-if="s.id" class="skill-icon attack-icon" aria-hidden="true"><Icon name="rune" /></span>
          <span v-else class="skill-icon empty" aria-hidden="true">+</span>
        </button>
        <div class="skill-slot-headline">
          <b class="skill-slot-name">{{ s.d ? s.d.name : "Choose a skill" }}</b>
          <span v-if="s.d?.total" class="skill-slot-total"
            :title="s.d.vs ? `Against ${s.d.vs.target.name}` : s.d.formula"
            >{{ range((s.d.vs || s.d).total) }}</span
          >
          <small v-if="s.d?.total" class="muted">{{ per(s.d) }}, {{ s.d.vs ? `vs ${s.d.vs.target.name}` : "before enemy resistance" }}</small>
        </div>
        <button
          v-if="hasDetails(s)"
          class="skill-slot-toggle"
          :aria-expanded="details[s.side]"
          :aria-controls="`skill-slot-${s.side}-details`"
          @click="details[s.side] = !details[s.side]"
        >
          Details<Icon name="chevron" aria-hidden="true" />
        </button>
      </div>
      <div v-if="hasDetails(s)" v-show="details[s.side]" :id="`skill-slot-${s.side}-details`" class="skill-slot-details">
      <!-- One hit or cast against the chosen target, by element. -->
      <dl v-if="s.d?.total" class="skill-slot-stats">
        <!-- Several hits a cast: the count as a fact; damage stays per hit (rarely do all land). -->
        <div v-if="s.d.count" class="skill-slot-stat">
          <dt>{{ s.d.count.text }}</dt>
          <dd>{{ range((s.d.vs || s.d).total) }}</dd>
          <dd class="res">each</dd>
        </div>
        <div v-for="p in (s.d.vs ? s.d.vs.parts : s.d.parts)" :key="p.element" class="skill-slot-stat">
          <dt :class="'el-' + p.element">{{ p.element[0].toUpperCase() + p.element.slice(1) }}</dt>
          <dd :class="'el-' + p.element">
            <template v-if="p.immune">immune</template>
            <template v-else>{{ fmt(p.range[0]) }}–{{ fmt(p.range[1]) }}</template>
          </dd>
          <dd class="res">{{ s.d.vs && !p.immune ? `${p.effective}% res` : "" }}</dd>
        </div>
        <div v-if="s.d.vs" class="skill-slot-stat">
          <dt>Before resistance</dt>
          <dd>{{ range(s.d.total) }}</dd>
          <dd class="res"></dd>
        </div>
      </dl>
      <p v-if="s.d?.count" class="skill-slot-note">Damage is for one hit. Spread, range and timing decide how many land on one monster (rarely all of them), and poison doesn't stack per hit.</p>
      <p v-if="s.d?.kind === 'spell'" class="skill-slot-note">Includes spell bonuses.</p>
      </div>
      <small v-for="l in s.d?.total ? [] : (s.d?.lines || []).slice(0, 2)" class="skill-slot-line">{{ l }}</small>
    </div>
  </div>
</template>
