<script setup>
import { computed } from "vue";
import { usePlanner, AUTHOR_TIERS } from "../../planner/usePlanner.js";
import SkillSlots from "./SkillSlots.vue";
import { ATTRIBUTES, capTone } from "../../planner/character.js";

const { state, build, character, addAttr, setSignets, toggleStats, setAuthorTier } = usePlanner();
// The build's tiers as its author gives them, as the starter builds show theirs: overall, then
// bossing, clearing and survival.
const CRITERIA = [["bossTier", "Bossing"], ["clearTier", "Clearing"], ["surviveTier", "Survival"]];
const tierOf = (k) => build.value.authorTiers?.[k] || "";
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
    <!-- The build's tiers, set by its author and shared with it: the starter builds' badge and chips. -->
    <div class="build-tiers" role="group" aria-label="Your tiers for this build">
      <label class="build-tier-pick overall" :class="tierOf('tier') && 'tier-' + tierOf('tier')" title="Your overall tier for this build"
        ><select :value="tierOf('tier')" aria-label="Overall tier" @change="setAuthorTier('tier', $event.target.value)">
          <option value="">Tier</option>
          <option v-for="t in AUTHOR_TIERS" :key="t" :value="t">{{ t }}</option>
        </select></label
      >
      <label v-for="[k, label] in CRITERIA" :key="k" class="build-tier-pick chip" :class="tierOf(k) && 'tier-' + tierOf(k)"
        >{{ label }}
        <select :value="tierOf(k)" :aria-label="`${label} tier`" @change="setAuthorTier(k, $event.target.value)">
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
