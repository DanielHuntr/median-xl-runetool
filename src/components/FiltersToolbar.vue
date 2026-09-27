<script setup>
import ClassPicker from "./ClassPicker.vue";
import Icon from "./AppIcon.vue";
import { useRunetool, MAX_ITEM_LEVEL } from "../composables/useRunetool.js";
const {
  st,
  stars,
  panel,
  drawer,
  expanded,
  dialog,
  runeTrigger,
  weaponBases,
  armorBases,
  totalOwned,
  filterCount,
  pills,
  toggle,
  remove,
  reset,
  star,
  stats,
  clampLevel,
  RW,
  label,
  CLASSES,
  TAGS,
  ELEMS,
} = useRunetool();
</script>
<template>
  <div class="toolbar">
    <div class="primary-controls">
      <label class="search"
        ><Icon name="search" /><input
          v-model="st.q"
          type="search"
          placeholder="Search runewords, runes or stats"
          aria-label="Search runewords" /></label
      ><ClassPicker v-model="st.cls" :classes="CLASSES" any-label="Any class" /><select v-model="st.base" aria-label="Item type">
        <option value="">Any item</option>
        <option value="@weapon">Any weapon</option>
        <option value="@armor">Any armor</option>
        <optgroup label="Weapons">
          <option v-for="b in weaponBases">{{ b }}</option>
        </optgroup>
        <optgroup label="Armor">
          <option v-for="b in armorBases">{{ b }}</option>
        </optgroup></select
      ><label class="level"
        >Max lvl
        <input
          v-model="st.lvl"
          @change="clampLevel"
          type="number"
          min="1"
          :max="MAX_ITEM_LEVEL"
          inputmode="numeric"
          aria-label="Maximum character level"
      /></label>
    </div>
    <div class="secondary-controls">
      <button
        class="btn"
        :class="{ active: panel }"
        @click="panel = !panel"
        :aria-expanded="panel"
        aria-controls="advanced"
      >
        <Icon name="filter" />Filters
        <b v-if="filterCount" class="badge">{{ filterCount }}</b></button
      ><button
        ref="runeTrigger"
        class="btn"
        @click="drawer = true"
        aria-haspopup="dialog"
      >
        <Icon name="bag" />My Runes
        <b v-if="totalOwned" class="badge">{{ totalOwned }}</b></button
      ><button
        class="btn"
        :class="{ active: st.starOnly }"
        :aria-pressed="st.starOnly"
        @click="st.starOnly = !st.starOnly"
      >
        <Icon name="star" />Starred
        <b v-if="stars.length" class="badge">{{ stars.length }}</b></button
      ><span class="toolbar-note">{{ RW.length }} runewords in the armory</span>
    </div>
    <div v-if="pills.length" class="active-filters">
      <button
        v-for="p in pills"
        class="pill"
        @click="remove(p)"
        :aria-label="'Remove ' + p.label"
      >
        {{ p.label }} <Icon name="close" /></button
      ><button class="text-btn" @click="reset">Clear all</button>
    </div>
    <div v-if="panel" class="advanced" id="advanced">
      <div>
        <h3>Must have these stats</h3>
        <div class="chips">
          <button
            v-for="[t] in TAGS"
            :aria-pressed="st.tags.includes(t)"
            @click="toggle('tags', t)"
          >
            {{ t }}
          </button>
        </div>
      </div>
      <div>
        <h3>Damage type</h3>
        <div class="chips">
          <button
            v-for="[t] in ELEMS"
            :aria-pressed="st.elems.includes(t)"
            @click="toggle('elems', t)"
          >
            {{ t }}
          </button>
        </div>
        <h3>Number of runes</h3>
        <div class="chips">
          <button
            v-for="n in 6"
            :aria-pressed="st.sockets.includes(n)"
            @click="toggle('sockets', n)"
          >
            {{ n }}
          </button>
        </div>
      </div>
      <div class="advanced-bottom">
        <label class="switch"
          ><input type="checkbox" v-model="st.generic" />Also show runewords any
          class can use</label
        ><button class="btn gold" @click="panel = false">Done</button>
      </div>
    </div>
  </div>
</template>
