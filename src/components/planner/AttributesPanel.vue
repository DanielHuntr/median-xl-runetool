<script setup>
import { computed } from "vue";
import { usePlanner, AUTHOR_TIERS } from "../../planner/usePlanner.js";
import SkillSlots from "./SkillSlots.vue";
import { ATTRIBUTES, capTone } from "../../planner/character.js";

const { state, build, character, addAttr, setSignets, toggleStats, estimate, setAuthorTier } = usePlanner();
// The estimate's detail on hover: per criterion, its rank, and the stage it's compared with.
const estimateTitle = computed(() => {
  const e = estimate.value;
  if (!e) return "No estimate: the build needs a damage skill the planner can work out.";
  if (e.unrated) return e.unrated;
  const where = e.against.level === 150 ? "endgame" : `level ${e.against.level} · ${e.against.difficulty}`;
  return `Bossing ${e.bossTier} · Clearing ${e.clearTier} · Survival ${e.surviveTier}. Would be #${e.rank} of ${e.of} among the starter builds at ${where} (estimated with their measure)${e.assumed ? `. Assumes: ${e.assumed.join("; ")}` : ""}.`;
});
const c = character;
const free = computed(() => c.value.statPoints.available - c.value.statPoints.spent);
const title = (a) => a[0].toUpperCase() + a.slice(1);
const fmt = (n) => Math.round(n).toLocaleString();
function bump(a, e, sign) {
  addAttr(a, sign * (e.shiftKey ? 10 : 1));
}
const resists = computed(() => [
  ["Fire", c.value.resist.fire, "fire"],
  ["Cold", c.value.resist.cold, "cold"],
  ["Lightning", c.value.resist.lightning, "lightning"],
  ["Poison", c.value.resist.poison, "poison"],
]);
</script>
<template>
  <section class="attr-panel" aria-label="Attributes">
    <div class="attr-head">
      <div>
        <div class="eyebrow">{{ build.difficulty }}</div>
        <h2>{{ state.cls }}</h2>
      </div>
      <div class="level-badge"><small>Level</small><b>{{ build.level }}</b></div>
    </div>
    <!-- The planner's estimate of the build's tier, and the tier its author gives it (shared with it). -->
    <div class="build-tiers">
      <span class="build-tier" :title="estimateTitle">
        Estimate
        <b v-if="estimate?.tier" class="build-tier-badge" :class="'tier-' + estimate.tier">{{ estimate.tier }}</b>
        <small v-else class="muted">{{ estimate?.unrated ? "unrated" : "—" }}</small>
      </span>
      <label class="build-tier"
        >Your tier
        <select :value="build.authorTier || ''" aria-label="Your tier for this build" @change="setAuthorTier($event.target.value)">
          <option value="">—</option>
          <option v-for="t in AUTHOR_TIERS" :key="t" :value="t">{{ t }}</option>
        </select></label
      >
    </div>

    <div class="attr-grid">
      <div v-for="(a, i) in ATTRIBUTES" :key="a" class="attr" :class="'attr-' + i">
        <span class="attr-name">{{ title(a) }}</span>
        <b
          class="attr-value"
          :class="{ boosted: c.attributes[a].total !== c.attributes[a].base }"
          :title="`${c.attributes[a].base} base (class + points) · +${c.attributes[a].flat} from items · ${c.attributes[a].pct}% bonus`"
          >{{ fmt(c.attributes[a].total) }}</b
        >
        <span class="attr-buttons">
          <button
            class="attr-btn"
            :disabled="!build.attrs[a]"
            :aria-label="`Remove a point from ${title(a)}`"
            @click="bump(a, $event, -1)"
          >
            −
          </button>
          <button class="attr-btn plus" :disabled="free <= 0" :aria-label="`Add a point to ${title(a)}`" @click="bump(a, $event, 1)">
            +
          </button>
        </span>
        <small class="attr-spent">{{ build.attrs[a] }} spent</small>
      </div>
      <div class="stat-orb" :class="{ over: free < 0 }" aria-live="polite">
        <b>{{ free }}</b><small>stat points</small>
      </div>
    </div>
    <label class="signets"
      >Signets of Learning
      <input
        type="number"
        min="0"
        :max="c.statPoints.signetCap"
        :value="build.signets"
        @change="setSignets($event.target.value)"
      /><small>/ {{ c.statPoints.signetCap }}</small></label
    >
    <p class="muted attr-hint">Hold Shift to add or remove 10 points.</p>

    <SkillSlots />
    <!-- Defences fold into one line, so the three planner columns can match in height. -->
    <details class="attr-defences">
      <summary>
        <span class="attr-defences-title">Defences <span class="attr-defences-caret" aria-hidden="true">▾</span></span>
        <span class="attr-defences-line">
          <template v-for="([name, r, key], i) in resists" :key="key">{{ i ? " / " : "Res " }}<span :class="['el-' + key, capTone(r.value, r.max)]" :title="`${name} resist`">{{ r.value }}%</span></template>
          · Phys <span :class="capTone(c.resist.physical.value, c.resist.physical.max)">{{ c.resist.physical.value }}%</span>
          · Block {{ c.block.value }}% · Avoid {{ c.avoid.value }}%
        </span>
      </summary>
    <div class="attr-combat">
      <div class="combat-box">
        <span>Attack rating <em class="est">est.</em></span><b>{{ fmt(c.ar.total) }}</b>
      </div>
      <div class="combat-box">
        <span>Defense <em class="est">est.</em></span><b>{{ fmt(c.defense.total) }}</b>
      </div>
    </div>

    <div class="attr-defense">
      <dl class="res-list">
        <template v-for="[name, r, key] in resists" :key="key"
          ><dt :class="'el-' + key">{{ name }} resist</dt>
          <dd :class="capTone(r.value, r.max)">{{ r.value }}%<small> / {{ r.max }}%</small></dd></template
        >
      </dl>
      <dl class="res-list">
        <dt>Physical resist</dt>
        <dd :class="capTone(c.resist.physical.value, c.resist.physical.max)">{{ c.resist.physical.value }}%<small> / {{ c.resist.physical.max }}%</small></dd>
        <dt>Magic resist</dt>
        <dd :class="capTone(c.resist.magic.value, c.resist.magic.max)">{{ c.resist.magic.value }}%<small> / {{ c.resist.magic.max }}%</small></dd>
        <dt>Block chance <em class="est">est.</em></dt>
        <dd :class="capTone(c.block.value, c.block.cap)">{{ c.block.value }}%<small> / {{ c.block.cap }}%</small></dd>
        <dt>Avoid</dt>
        <dd :class="capTone(c.avoid.value, c.avoid.cap)">{{ c.avoid.value }}%<small> / {{ c.avoid.cap }}%</small></dd>
      </dl>
    </div>
    </details>

    <div class="orbs">
      <div class="orb life"><b>{{ fmt(c.life.total) }}</b><small>Life</small></div>
      <button class="btn" @click="toggleStats(true)">Full stats</button>
      <div class="orb mana"><b>{{ fmt(c.mana.total) }}</b><small>Mana</small></div>
    </div>
  </section>
</template>
