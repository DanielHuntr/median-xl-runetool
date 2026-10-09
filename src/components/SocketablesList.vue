<script setup>
import { computed } from "vue";
import Icon from "./AppIcon.vue";
import CubeLink from "./CubeLink.vue";
import DataStatus from "./DataStatus.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
const {
  st,
  browse,
  socketables,
  clampLevel,
  SOCKD,
  SOCK_GROUPS,
  SOCK_SLOTS,
  RIMG,
} = useRunetool();
const f = browse.sock;
const grouped = computed(() =>
  SOCK_GROUPS.value
    .map((g) => [g, socketables.value.filter((s) => s.group === g)])
    .filter(
    ([, list]) => list.length,
  ),
);
</script>
<template>
  <section aria-label="Gems and runes">
    <div class="toolbar">
      <div class="unique-controls">
        <label class="search"
          ><Icon name="search" /><input
            v-model="f.q"
            type="search"
            placeholder="Search gem, rune or stat"
            aria-label="Search gems and runes" /></label
        ><select v-model="f.group" aria-label="Socketable type">
          <option value="">All gems and runes</option>
          <option v-for="g in SOCK_GROUPS">{{ g }}</option></select
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
    </div>
    <div class="results-bar">
      <div class="result-count" aria-live="polite">
        <strong>{{ socketables.length }}</strong> {{ socketables.length === 1 ? "gem or rune" : "gems and runes" }}
        <span v-if="socketables.length !== SOCKD.length"
          >/ {{ SOCKD.length }}</span
        >
      </div>
    </div>
    <div v-for="[g, list] in grouped" :key="g" class="sock-group">
      <h2 class="group-title">{{ g }}</h2>
      <div class="card-grid">
        <article v-for="s in list" :key="s.id" class="unique-card sock-card">
          <div class="sock-head">
            <span class="socket"
              ><img
                v-if="RIMG[s.img] || s.url"
                :src="RIMG[s.img] || s.url"
                :alt="s.name"
            /></span>
            <div>
              <h2>{{ s.name }}</h2>
              <div class="item-kind">Level {{ s.lvl }}</div>
            </div>
            <CubeLink kind="item" :name="s.name" compact class="sock-cube" />
          </div>
          <dl class="sock-slots">
            <template v-for="(slot, i) in SOCK_SLOTS"
              ><dt>{{ slot }}</dt>
              <dd>
                <span v-for="l in s.slots[i]">{{ l }}</span>
              </dd></template
            >
          </dl>
        </article>
      </div>
    </div>
    <div v-if="!socketables.length" class="empty">
      <h2>Nothing matches.</h2>
      <p>Try another name or stat, or raise your maximum level.</p>
      <button
        class="btn"
        @click="
          f.q = '';
          f.group = '';
        "
      >
        Clear filters
      </button>
    </div>
    <p class="coverage">
      {{ SOCKD.length }} gems and runes from the official documentation. <DataStatus />
    </p>
  </section>
</template>
