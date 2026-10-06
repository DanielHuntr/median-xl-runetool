<script setup>
import ItemArt from "./ItemArt.vue";
import Icon from "./AppIcon.vue";
import DataStatus from "./DataStatus.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
import { superiorVariantsForCat, superiorLabel } from "../planner/superior.js";
const {
  st,
  browse,
  baseCats,
  baseTiers,
  bases,
  tiers,
  tierIndex,
  tier,
  clampLevel,
  BASED,
  catGroups,
} = useRunetool();
import { computed } from "vue";
import CatalogFilters from "./CatalogFilters.vue";
import FilterPills from "./FilterPills.vue";
const f = browse.bases;
const sections = computed(() => [{ key: "cats", groups: catGroups(baseCats.value) }]);
</script>
<template>
  <section aria-label="Base items">
    <div class="upgrade-note">
      <Icon name="info" />
      <p>
        Every base item has <strong>four tiers</strong> and a
        <strong>Sacred</strong> version. Higher tiers have better stats and
        higher requirements.<span
          >Tiered and sacred items roll 0 to max sockets. A Superior base also rolls one of the bonuses listed under it. Uniques, sets, crafted
          and honorific items always have max sockets.</span
        >
      </p>
    </div>
    <div class="toolbar">
      <div class="unique-controls base-controls">
        <label class="search"
          ><Icon name="search" /><input
            v-model="f.q"
            type="search"
            placeholder="Search base item or stat"
            aria-label="Search base items" /></label
        ><CatalogFilters :model="f" :sections="sections" :count="`${bases.length} base item${bases.length === 1 ? '' : 's'}`" /><select v-model="f.tier" aria-label="Show tier">
          <option value="">Best tier</option>
          <option v-for="t in baseTiers" :value="t">Show {{ t }}</option></select
        ><label class="level"
          >Max lvl
          <input
            v-model="st.lvl"
            @change="clampLevel"
            type="number"
            min="1"
            :max="MAX_ITEM_LEVEL"
            aria-label="Maximum character level"
        /></label>
      </div>
      <FilterPills :model="f" :keys="['cats']" />
    </div>
    <div class="results-bar">
      <div class="result-count" aria-live="polite">
        <strong>{{ bases.length }}</strong> base items
        <span v-if="bases.length !== BASED.length">/ {{ BASED.length }}</span>
      </div>
    </div>
    <div class="card-grid">
      <article v-for="b in bases" :key="b.key" class="unique-card">
        <div class="card-head">
          <ItemArt kind="base" :name="b.name" :tier="tier(b).label" />
          <div>
            <div class="item-kind">{{ b.cat }}</div>
            <h2>{{ b.name }}</h2>
          </div>
        </div>
        <div v-if="b.t.length > 1" class="tier-tabs" role="group" :aria-label="b.name + ' tier'">
          <button
            v-for="(t, i) in b.t"
            :class="{ selected: tierIndex(b) === i, over: t.req > st.lvl }"
            :aria-pressed="tierIndex(b) === i"
            :data-tip="t.label + (t.req ? ' · required level ' + t.req : '')"
            :aria-label="t.label"
            @click="tiers[b.key] = i"
          >
            {{ { "Tier 1": "I", "Tier 2": "II", "Tier 3": "III", "Tier 4": "IV", Sacred: "S" }[t.label] || t.label }}
          </button>
        </div>
        <div class="unique-meta">
          <span
            >{{ tier(b).label }} · Level <b>{{ tier(b).req ?? 1 }}</b></span
          ><span v-if="tier(b).str"
            >Str <b>{{ tier(b).str }}</b></span
          ><span v-if="tier(b).dex"
            >Dex <b>{{ tier(b).dex }}</b></span
          ><span v-if="tier(b).sock">{{ tier(b).sock }} sockets max</span
          ><span v-if="tier(b).cls" class="class-only"
            >{{ tier(b).cls }} only</span
          >
        </div>
        <p v-if="tier(b).req > st.lvl" class="warning">
          Above your maximum level
        </p>
        <ul class="stats">
          <li v-for="l in tier(b).lines">{{ l }}</li>
        </ul>
        <!-- What a Superior version adds (game files), on top of the lines above. -->
        <ul v-if="!b.mastercrafted && superiorVariantsForCat(b.cat).length" class="stats superior-lines" aria-label="Superior versions">
          <li v-for="v in superiorVariantsForCat(b.cat)" :key="v.id">{{ superiorLabel(v) }}</li>
        </ul>
      </article>
    </div>
    <div v-if="!bases.length" class="empty">
      <h2>Nothing matches.</h2>
      <p>Try another name, stat or item type.</p>
      <button
        class="btn"
        @click="
          f.q = '';
          f.cats = [];
        "
      >
        Clear filters
      </button>
    </div>
    <p class="coverage">
      {{ BASED.filter((b) => !b.mastercrafted).length }} base items from the official documentation, and {{ BASED.filter((b) => b.mastercrafted).length }} mastercrafted bases from the game files (always rare, fully socketed, each with an ability of its own). <DataStatus />
    </p>
  </section>
</template>
