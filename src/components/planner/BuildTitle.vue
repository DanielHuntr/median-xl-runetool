<script setup>
// Which build this is (the name it was opened or saved under), and its tiers: set by its author
// and shared with it, shown as the starter builds' badge and chips; a pop-out of S to F buttons
// sets them. Above the planner's tabs.
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { usePlanner, AUTHOR_TIERS, AUTHOR_TIER_KEYS } from "../../planner/usePlanner.js";

const { state, build, setAuthorTier } = usePlanner();
const CRITERIA = [["bossTier", "Bossing"], ["clearTier", "Clearing"], ["surviveTier", "Survival"]];
const tierOf = (k) => build.value.authorTiers?.[k] || "";
const anyTier = computed(() => AUTHOR_TIER_KEYS.some((k) => tierOf(k)));
const buildName = computed(() => state.openedName[state.cls] || `${state.cls} build`);
// The pop-out: closed by Esc or a click elsewhere.
const tiersOpen = ref(false);
const closeTiers = (e) => { if (!tiersOpen.value) return; if (e.type === "keydown" ? e.key === "Escape" : !e.target.closest?.(".tier-pop-wrap")) tiersOpen.value = false; };
onMounted(() => { document.addEventListener("click", closeTiers); document.addEventListener("keydown", closeTiers); });
onBeforeUnmount(() => { document.removeEventListener("click", closeTiers); document.removeEventListener("keydown", closeTiers); });
</script>
<template>
  <div class="build-title-row">
    <h2 class="build-name" :title="buildName">{{ buildName }}</h2>
    <div class="build-tiers tier-pop-wrap">
      <button type="button" class="build-tiers-open" :aria-expanded="tiersOpen" aria-controls="tier-pop" @click="tiersOpen = !tiersOpen">
        <template v-if="anyTier">
          <b v-if="tierOf('tier')" class="build-tier-badge" :class="'tier-' + tierOf('tier')">{{ tierOf('tier') }}</b>
          <template v-for="[k, label] in CRITERIA" :key="k"
            ><span v-if="tierOf(k)" class="build-tier-chip" :class="'tier-' + tierOf(k)">{{ label }} {{ tierOf(k) }}</span></template
          >
          <span class="build-tiers-edit">Edit</span>
        </template>
        <template v-else>Rate this build</template>
      </button>
      <div v-if="tiersOpen" id="tier-pop" class="stage-pop tier-pop" role="dialog" aria-label="Your tiers for this build">
        <p class="stage-pop-title">Your tiers for this build, shared with it</p>
        <div v-for="[k, label] in [['tier', 'Overall'], ...CRITERIA]" :key="k" class="tier-row" role="group" :aria-label="`${label} tier`">
          <span>{{ label }}</span>
          <button v-for="t in AUTHOR_TIERS" :key="t" type="button" class="tier-choice" :class="'tier-' + t" :aria-pressed="tierOf(k) === t"
            @click="setAuthorTier(k, tierOf(k) === t ? '' : t)">{{ t }}</button>
        </div>
        <button v-if="anyTier" type="button" class="text-btn" @click="AUTHOR_TIER_KEYS.forEach((k) => setAuthorTier(k, ''))">Clear all</button>
      </div>
    </div>
  </div>
</template>
