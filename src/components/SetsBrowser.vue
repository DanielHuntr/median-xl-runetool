<script setup>
import ClassPicker from "./ClassPicker.vue";
import ItemArt from "./ItemArt.vue";
import Icon from "./AppIcon.vue";
import DataStatus from "./DataStatus.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
const { st, browse, sets, clampLevel, CLASSES, SETD } = useRunetool();
const f = browse.sets;
</script>
<template>
  <section aria-label="Sets">
    <div class="upgrade-note">
      <Icon name="info" />
      <p>
        All set items are <strong>sacred</strong> and spawn with maximum
        sockets.<span
          >Set bonuses stack as you equip more items from the same set.</span
        >
      </p>
    </div>
    <div class="toolbar">
      <div class="unique-controls">
        <label class="search"
          ><Icon name="search" /><input
            v-model="f.q"
            type="search"
            placeholder="Search set, item, base or stat"
            aria-label="Search sets" /></label
        ><ClassPicker v-model="f.cls" :classes="CLASSES" any-label="Any class" other-label="Other sets" /><label class="level"
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
        <strong>{{ sets.length }}</strong> sets
        <span v-if="sets.length !== SETD.length">/ {{ SETD.length }}</span>
      </div>
    </div>
    <div class="unique-grid">
      <article v-for="s in sets" :key="s.id" class="unique-card set-card">
        <div class="item-kind">
          {{ s.cls || "Any class" }} · {{ s.items.length }} items
        </div>
        <h2>{{ s.name }}</h2>
        <p class="base">{{ s.sub }}</p>        <div class="unique-meta spaced">
          <span v-if="s.minReq !== null"
            >Level
            <b
              >{{ s.minReq
              }}<template v-if="s.maxReq !== s.minReq">
                – {{ s.maxReq }}</template
              ></b
            ></span
          >
        </div>
        <div v-for="b in s.bonuses" class="set-bonus">
          <h3>{{ b.when.replace(/:$/, "") }}</h3>
          <ul class="stats">
            <li v-for="l in b.lines">{{ l }}</li>
          </ul>
        </div>
        <details v-for="it in s.items" class="set-item">
          <summary>
            <ItemArt kind="set" :name="it.name" :base="it.base" small /><span
              ><b>{{ it.name }}</b
              ><small>{{ it.base }}</small></span
            ><span class="set-item-req" :class="{ warning: it.req > st.lvl }"
              >Lvl {{ it.req }}</span
            ><Icon name="chevron" />
          </summary>
          <div class="unique-meta">
            <span v-if="it.str"
              >Str <b>{{ it.str }}</b></span
            ><span v-if="it.dex"
              >Dex <b>{{ it.dex }}</b></span
            ><span v-if="it.sock">{{ it.sock }} sockets</span
            ><span v-if="it.cls" class="class-only">{{ it.cls }} only</span>
          </div>
          <ul class="stats">
            <li v-for="l in it.lines">{{ l }}</li>
          </ul>
        </details>
      </article>
    </div>
    <div v-if="!sets.length" class="empty">
      <h2>Nothing matches.</h2>
      <p>Try another name, stat or class, or raise your maximum level.</p>
      <button
        class="btn"
        @click="
          f.q = '';
          f.cls = '';
        "
      >
        Clear filters
      </button>
    </div>
    <p class="coverage">
      {{ SETD.length }} sets and
      {{ SETD.reduce((n, s) => n + s.items.length, 0) }} set items from the
      official documentation. <DataStatus />
    </p>
  </section>
</template>
