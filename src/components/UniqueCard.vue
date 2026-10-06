<script setup>
import CopyLink from "./CopyLink.vue";
import Icon from "./AppIcon.vue";
import StatLine from "./StatLine.vue";
import ItemArt from "./ItemArt.vue";
import CubeLink from "./CubeLink.vue";
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
      <div class="card-head-side">
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
        :data-tip="`Tier ${i + 1}${t.req ? ` · required level ${t.req}` : ''}`"
        :aria-label="`Tier ${i + 1}`"
        @click="tiers[u.key] = i"
      >
        {{ ["I", "II", "III", "IV", "V"][i] }}
      </button>
    </div>
        <CubeLink kind="unique" :name="u.name" :tier="tierIndex(u) + 1" compact />
        <CopyLink :hash="`uniques?name=${encodeURIComponent(u.name)}${u.t.length > 1 ? `&tier=${tierIndex(u) + 1}` : ''}`" :label="u.t.length > 1 ? `${u.name}, tier ${tierIndex(u) + 1}` : u.name" />
      </div>
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
      <li v-for="m in tier(u).mods"><StatLine :text="m" /></li>
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
