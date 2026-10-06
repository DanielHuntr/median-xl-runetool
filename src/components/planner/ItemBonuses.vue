<script setup>
// Bonuses the cube adds to a kept item (items.js BONUS_GROUPS): a charm's trophy and cycles, a
// scroll of enchantment, shrines on a sacred rare, crafted or honorific item. Shown only when
// one fits; emits the item's new list of bonus ids.
import { computed, ref } from "vue";
import { BONUS_GROUPS, bonusById, bonusFits } from "../../planner/items.js";

const props = defineProps({
  // The resolved item (catalog.resolve): its def, twoHanded and honorific decide what fits.
  item: { type: Object, required: true },
  addons: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["update"]);

const fits = (b) => bonusFits(b, props.item.def, { twoHanded: props.item.twoHanded, honorific: props.item.honorific });
const groups = computed(() => BONUS_GROUPS.map((g) => {
  const options = g.list.map((b) => ({ ...b, group: g.group })).filter(fits);
  const chosen = props.addons.map((id, i) => ({ i, b: bonusById(id) })).filter((x) => x.b?.group === g.group);
  return { ...g, options, chosen, full: chosen.length >= g.max };
}).filter((g) => g.options.length));
const label = (b) => {
  const what = b.lines.filter((l) => !/Required Level$/.test(l)).join(", ");
  return b.group === "trophy" ? `${b.name}: ${what}` : b.group === "shrine" ? `${b.shrine} Shrine: ${what}` : b.group === "cycle" ? `${b.name}: ${what}` : what;
};
const picked = ref({});
function add(g) {
  const id = picked.value[g.group];
  if (!id || g.full) return;
  emit("update", [...props.addons, id]);
  picked.value[g.group] = "";
}
const remove = (i) => emit("update", props.addons.filter((_, j) => j !== i));
const NOTES = {
  trophy: "Cube the charm with its trophy, once you've done the trophy's challenge.",
  scroll: "One scroll per item.",
  shrine: "Crafting with a shrine adds one set; blessing the crafted item adds a second.",
  cycle: "Cycles from The Triune on Hell, each cubed into the Corrupted Wormhole.",
};
</script>

<template>
  <div v-if="groups.length" class="sockets item-bonuses" :class="{ compact }">
    <h3 v-if="!compact">Added bonuses</h3>
    <div v-for="g in groups" :key="g.group" class="bonus-group">
      <p v-if="!compact" class="muted">{{ g.label }}: {{ NOTES[g.group] }}</p>
      <ul v-if="g.chosen.length">
        <li v-for="x in g.chosen" :key="x.i">
          <span><b>{{ x.b.group === "scroll" ? x.b.name : g.label }}</b><small>{{ label(x.b) }}</small></span>
          <button class="text-btn" :aria-label="`Remove ${label(x.b)}`" @click="remove(x.i)">Remove</button>
        </li>
      </ul>
      <div v-if="!g.full" class="orb-add-controls">
        <label class="orb-select">{{ g.label }}
          <select v-model="picked[g.group]">
            <option value="">{{ g.group === "trophy" ? "No trophy" : `Choose ${g.group === "scroll" ? "a scroll" : g.group === "shrine" ? "a shrine" : "a cycle"}` }}</option>
            <option v-for="b in g.options" :key="b.id" :value="b.id">{{ label(b) }}</option>
          </select>
        </label>
        <button class="btn" :disabled="!picked[g.group]" @click="add(g)">Add</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bonus-group + .bonus-group { margin-top: 10px; }
.item-bonuses.compact { margin-top: 6px; }
.item-bonuses.compact .orb-add-controls { margin-top: 4px; }
.item-bonuses select { max-width: 100%; }
</style>
