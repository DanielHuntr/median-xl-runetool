<script setup>
import ItemArt from "./ItemArt.vue";
import CubeLink from "./CubeLink.vue";
import Icon from "./AppIcon.vue";
import DataStatus from "./DataStatus.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
import { computed } from "vue";
import CatalogFilters from "./CatalogFilters.vue";
import FilterPills from "./FilterPills.vue";
const { st, browse, sacredCats, sacredUniques, clampLevel, SUD, catGroups, TAGS, ELEMS } =
  useRunetool();
const f = browse.sacred;
const sections = computed(() => [
  { key: "cats", groups: catGroups(sacredCats.value) },
  { key: "tags", title: "Stats", note: "Must have all chosen", options: TAGS.map((t) => t[0]) },
  { key: "elems", title: "Damage type", options: ELEMS.map((t) => t[0]) },
]);
</script>
<template>
  <section aria-label="Sacred uniques">
    <div class="upgrade-note">
      <Icon name="info" />
      <p>
        Sacred uniques use <strong>sacred</strong> base items and have no tier
        upgrades.<span
          >Items above your maximum level are hidden. Raise it to {{ MAX_ITEM_LEVEL }} to see
          everything.</span
        >
      </p>
    </div>
    <div class="toolbar">
      <div class="unique-controls">
        <label class="search"
          ><Icon name="search" /><input
            v-model="f.q"
            type="search"
            placeholder="Search name, base or stat"
            aria-label="Search sacred uniques" /></label
        ><CatalogFilters :model="f" :sections="sections" :count="`${sacredUniques.length} sacred unique${sacredUniques.length === 1 ? '' : 's'}`" /><label class="level"
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
      <FilterPills :model="f" :keys="['cats', 'tags', 'elems']" />
    </div>
    <div class="results-bar">
      <div class="result-count" aria-live="polite">
        <strong>{{ sacredUniques.length }}</strong> sacred uniques
        <span v-if="sacredUniques.length !== SUD.length"
          >/ {{ SUD.length }}</span
        >
      </div>
    </div>
    <div class="unique-grid">
      <article v-for="u in sacredUniques" :key="u.id" class="unique-card">
        <div class="card-head">
          <ItemArt kind="unique" :name="u.name" :base="u.base" />
          <div>
            <div class="item-kind">{{ u.cat }}</div>
            <h2>{{ u.name }}</h2>
            <p class="base">{{ u.base }}</p>
          </div>
          <div class="card-head-side"><CubeLink kind="unique" :name="u.name" compact /></div>
        </div>
        <div class="unique-meta spaced">
          <span v-if="u.req !== null"
            >Level <b>{{ u.req }}</b></span
          ><span v-if="u.str"
            >Str <b>{{ u.str }}</b></span
          ><span v-if="u.dex"
            >Dex <b>{{ u.dex }}</b></span
          ><span v-if="u.sock">{{ u.sock }} sockets</span
          ><span v-if="u.cls" class="class-only">{{ u.cls }} only</span>
        </div>
        <ul class="stats">
          <li v-for="m in u.lines">{{ m }}</li>
        </ul>
      </article>
    </div>
    <div v-if="!sacredUniques.length" class="empty">
      <h2>Nothing matches.</h2>
      <p>Try another name, stat or item type, or raise your maximum level.</p>
      <button
        class="btn"
        @click="
          f.q = '';
          f.cats = [];
          f.tags = [];
          f.elems = [];
        "
      >
        Clear filters
      </button>
    </div>
    <p class="coverage">
      {{ SUD.length }} sacred uniques from the official documentation. <DataStatus />
    </p>
  </section>
</template>
