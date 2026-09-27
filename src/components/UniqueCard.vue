<script setup>
import Icon from "./AppIcon.vue";
import ItemArt from "./ItemArt.vue";
import { useRunetool } from "../composables/useRunetool.js";
const { st, compare, tiers, stats, tierIndex, tier, nextTier, label } =
  useRunetool();
defineProps({ u: { type: Object, required: true } });
</script>
<template>
  <article class="unique-card">
    <div class="card-head">
      <ItemArt kind="unique" :name="u.name" :base="u.base" />
      <div>
        <div class="item-kind">{{ u.cat }}</div>
        <h2>{{ u.name }}</h2>
        <p class="base">{{ u.base }}</p>
      </div>
    </div>
    <div
      v-if="u.t.length > 1"
      class="tier-tabs"
      role="group"
      :aria-label="u.name + ' tier'"
    >
      <button
        v-for="(t, i) in u.t"
        :class="{ selected: tierIndex(u) === i, over: t.req > st.lvl }"
        :aria-pressed="tierIndex(u) === i"
        :title="'Required level ' + t.req"
        @click="tiers[u.key] = i"
      >
        Tier {{ i + 1 }}
      </button>
    </div>
    <div class="unique-meta">
      <span
        v-if="tier(u).req !== null"
        :class="{ warning: tier(u).req > st.lvl }"
        >Level <b>{{ tier(u).req }}</b></span
      ><span v-if="tier(u).str"
        >Str <b>{{ tier(u).str }}</b></span
      ><span v-if="tier(u).dex"
        >Dex <b>{{ tier(u).dex }}</b></span
      ><span v-if="tier(u).sock">{{ tier(u).sock }} sockets</span
      ><span v-for="d in tier(u).dmg" class="damage">{{ d }}</span>
    </div>
    <p v-if="tier(u).req > st.lvl" class="warning">Above your maximum level</p>
    <table v-if="compare && nextTier(u)" class="comparison-table">
      <thead>
        <tr>
          <th>Tier {{ tierIndex(u) + 1 }}<small>SELECTED</small></th>
          <th>Tier {{ tierIndex(u) + 2 }}<small>NEXT TIER</small></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(_, i) in Array.from({
            length: Math.max(tier(u).mods.length, nextTier(u).mods.length),
          })"
        >
          <td>{{ tier(u).mods[i] || "—" }}</td>
          <td :class="{ improved: nextTier(u).mods[i] !== tier(u).mods[i] }">
            {{ nextTier(u).mods[i] || "—" }}
          </td>
        </tr>
      </tbody>
    </table>
    <ul v-else class="stats">
      <li v-for="m in tier(u).mods">{{ m }}</li>
    </ul>
    <div v-if="nextTier(u)" class="upgrade-cost">
      <div>
        <Icon name="rune" /><strong
          >Upgrade to Tier {{ tierIndex(u) + 2 }}</strong
        ><span>1 Arcane Crystal</span>
      </div>
      <small :class="{ warning: nextTier(u).req > st.lvl }"
        >Requires level {{ nextTier(u).req
        }}<template v-if="nextTier(u).str">
          · Str {{ nextTier(u).str }}</template
        ><template v-if="nextTier(u).dex">
          · Dex {{ nextTier(u).dex }}</template
        ></small
      >
    </div>
    <div v-else class="upgrade-cost">
      {{ u.t.length === 1 ? "No tier upgrades" : "Tier 4 · Highest tier" }}
    </div>
  </article>
</template>
