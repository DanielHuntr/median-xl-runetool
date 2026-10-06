<script setup>
import CopyLink from "./CopyLink.vue";
import Icon from "./AppIcon.vue";
import StatLine from "./StatLine.vue";
import { useRunetool } from "../composables/useRunetool.js";
const {
  st,
  owned,
  stars,
  expanded,
  totalOwned,
  missing,
  isOwned,
  sortVal,
  star,
  expand,
  hit,
  stats,
  RIMG,
  label,
  runeName,
  SHORT,
} = useRunetool();
import { computed } from "vue";
import MADE from "../data/cube-made.json";
const props = defineProps({ r: { type: Object, required: true } });
// Categories the game allows beyond the docs' list ("Weapons" already covers class weapons).
// A rune the Horadric Cube makes (two Ith make a Tal; an elemental rune from a Runestone and an
// essence) links to the Cube page with that recipe loaded (cube-made.json); great runes drop only.
const runeRecipe = (rune) => (MADE.items[`${label(rune)} Rune`] ? `#cube?make=item:${encodeURIComponent(label(rune))}` : null);
const alsoFits = computed(() =>
  props.r.allowed && !props.r.bases.includes("Weapons") ? props.r.allowed.filter((c) => !props.r.bases.includes(c)) : [],
);
</script>
<template>
  <article class="rune-card">
    <div class="card-top">
      <span class="item-kind"
        >{{ r.slot === "armor" ? "ARMOR" : "WEAPON" }} · {{ r.runes.length }}
        {{ r.runes.length === 1 ? "RUNE" : "RUNES" }}</span
      ><span class="card-actions"><CopyLink :hash="`runewords?name=${encodeURIComponent(r.name)}`" :label="r.name" /><button
        class="star"
        :class="{ saved: stars.includes(r.name) }"
        :aria-pressed="stars.includes(r.name)"
        :aria-label="(stars.includes(r.name) ? 'Unstar ' : 'Star ') + r.name"
        @click="star(r.name)"
      >
        <Icon name="star" />
      </button></span>
    </div>
    <h2>{{ r.name }}</h2>
    <p v-if="r.subtitle" class="rw-subtitle">{{ r.subtitle }}</p>
    <p class="base">{{ r.bases.join(", ") }}</p>
    <p v-if="r.except" class="except">Not {{ r.except }}</p>
    <!-- Class items the game also accepts (inherited item types; runeword-bases.json). -->
    <p v-if="alsoFits.length" class="also-fits">Also fits: {{ alsoFits.join(", ") }}</p>
    <div class="card-meta">
      <span
        >LEVEL <b>{{ r.lvl }}</b></span
      ><span v-if="r.cls" class="class-only">{{ r.cls }} only</span
      ><span v-if="sortVal(r)?.v !== null && sortVal(r)" class="ranking"
        >{{ SHORT[st.sort] }}: {{ sortVal(r).v }}</span
      >
    </div>
    <div class="rune-sequence">
      <div v-for="(rune, i) in r.runes" class="rune-unit">
        <component
          :is="runeRecipe(rune) ? 'a' : 'span'"
          class="socket"
          :class="{ owned: isOwned(r, i), 'has-recipe': !!runeRecipe(rune) }"
          :href="runeRecipe(rune) || undefined"
          :tabindex="runeRecipe(rune) ? undefined : 0"
          :data-tip="runeRecipe(rune) ? `${runeName(rune)}: show its cube recipe` : runeName(rune)"
          :aria-label="runeName(rune) + (isOwned(r, i) ? ', owned' : '') + (runeRecipe(rune) ? ', show its cube recipe' : '')"
          ><img :src="RIMG[rune]" :alt="runeName(rune)" /></component
        ><span>{{ label(rune) }}</span>
      </div>
    </div>
    <div
      v-if="totalOwned"
      class="inventory-status"
      :class="{ craftable: missing(r) === 0 }"
    >
      <Icon :name="missing(r) === 0 ? 'check' : 'info'" />{{
        missing(r) === 0
          ? "You can make this"
          : "Missing " + missing(r) + " rune" + (missing(r) > 1 ? "s" : "")
      }}
    </div>
    <ul class="stats">
      <li v-for="s in stats(r)" :class="{ hit: hit(r, s.i) }"><StatLine :text="s.text" /></li>
    </ul>
    <button
      v-if="!st.full && r.stats.length > 4"
      class="show-more"
      @click="expand(r.id)"
      :aria-expanded="expanded.includes(r.id)"
    >
      {{
        expanded.includes(r.id)
          ? "Show less"
          : "Show all " + r.stats.length + " stats"
      }}<Icon name="chevron" />
    </button>
  </article>
</template>
