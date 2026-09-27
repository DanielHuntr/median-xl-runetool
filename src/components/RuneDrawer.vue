<script setup>
import Icon from "./AppIcon.vue";
import { useRunetool } from "../composables/useRunetool.js";
const {
  st,
  owned,
  drawer,
  dialog,
  groups,
  totalOwned,
  cycle,
  closeDrawer,
  RIMG,
  label,
  runeName,
} = useRunetool();
</script>
<template>
  <dialog
    ref="dialog"
    class="rune-drawer"
    @cancel.prevent="closeDrawer"
    @close="drawer = false"
    @click="
      (e) => {
        if (e.target === dialog) closeDrawer();
      }
    "
    aria-labelledby="rune-heading"
  >
    <div class="drawer-content">
      <div class="drawer-header">
        <div>
          <div class="eyebrow">YOUR INVENTORY</div>
          <h2 id="rune-heading">My Runes</h2>
        </div>
        <button
          class="icon-btn"
          aria-label="Close rune inventory"
          @click="closeDrawer"
        >
          <Icon name="close" />
        </button>
      </div>
      <p>
        Select the runes you own. Select again to mark that you own two, and
        once more to clear it.
      </p>
      <label class="drawer-select"
        >Show<select v-model="st.pmode">
          <option value="all">Every runeword</option>
          <option value="make">Only ones I can make now</option>
          <option value="near">Missing one rune at most</option>
        </select></label
      >
      <div class="inventory-count">
        <strong>{{ totalOwned }} runes owned</strong
        ><button class="text-btn" @click="owned = {}">Clear all runes</button>
      </div>
      <div v-for="[name, runes] in groups" class="rune-group">
        <h3>{{ name }}</h3>
        <div class="rune-grid">
          <button
            v-for="r in runes"
            :class="{ owned: owned[r] }"
            :aria-label="runeName(r) + ', ' + (owned[r] || 0) + ' owned'"
            @click="cycle(r)"
          >
            <img :src="RIMG[r]" :alt="runeName(r)" /><span>{{ label(r) }}</span
            ><b v-if="owned[r] === 2">×2</b
            ><Icon v-else-if="owned[r] === 1" name="check" />
          </button>
        </div>
      </div>
      <div class="drawer-note">
        <Icon name="info" />
        <p>
          Two of the same standard rune can be cubed into the next rune. Great
          and elemental runes cannot be upgraded this way.
        </p>
      </div>
    </div>
  </dialog>
</template>
