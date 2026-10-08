<script setup>
// Bonuses the cube adds to a kept item (items.js BONUS_GROUPS): a charm's trophy and cycles, a
// scroll of enchantment, shrines on a sacred rare, crafted or honorific item. Shown only when
// one fits; emits the item's new list of bonus ids.
import { computed } from "vue";
import { BONUS_GROUPS, bonusById, bonusFits } from "../../planner/items.js";

const props = defineProps({
  // The resolved item (catalog.resolve): its def, twoHanded and honorific decide what fits.
  item: { type: Object, required: true },
  addons: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["update"]);

const fits = (b) => bonusFits(b, props.item.def, { twoHanded: props.item.twoHanded, honorific: props.item.honorific, types: props.item.types });
const groups = computed(() => BONUS_GROUPS.map((g) => {
  const options = g.list.map((b) => ({ ...b, group: g.group })).filter(fits);
  const chosen = props.addons.map((id, i) => ({ i, b: bonusById(id) })).filter((x) => x.b?.group === g.group);
  return { ...g, options, chosen, full: chosen.length >= g.max };
}).filter((g) => g.options.length));
const label = (b) => {
  const what = b.lines.filter((l) => !/Required Level$/.test(l)).join(", ");
  return b.group === "trophy" ? `${b.name}: ${what}` : b.group === "shrine" ? `${b.shrine} Shrine: ${what}` : b.group === "cycle" || b.group === "oil" ? `${b.name}: ${what}` : what;
};
// A list option kept short enough for the list to fit the window; the full lines show under it.
const short = (b) => { const t = label(b); return t.length > 64 ? `${t.slice(0, 62).replace(/[ ,]+\S*$/, "")}…` : t; };
const remove = (i) => emit("update", props.addons.filter((_, j) => j !== i));
// One per item (an oil, a scroll, a corruption, a trophy): the list shows the one chosen, and
// choosing another replaces it ("None" removes it).
function choose(g, id) {
  const others = props.addons.filter((a) => !g.chosen.some((x) => x.b.id === a));
  emit("update", id ? [...others, id] : others);
}
// More than one (shrines, cycles): choosing one in the list adds it, and the list resets.
function add(g, e) {
  const id = e.target.value;
  e.target.value = "";
  if (id && !g.full) emit("update", [...props.addons, id]);
}
// How each is added in game, as a hint under its list.
const NOTES = {
  trophy: "After its challenge, cubed with the charm.",
  scroll: "A scroll of enchantment, one per item.",
  shrine: "Crafting adds one set; blessing adds a second.",
  cycle: "From The Triune on Hell, cubed into the Corrupted Wormhole.",
  oil: "One per item, cubed with it.",
  corruption: "Corrupted Crystal, then an Oil of Craft reveals one. Can't be undone.",
};
</script>

<template>
  <div v-if="groups.length" class="item-bonuses" :class="{ compact }">
    <h3 v-if="!compact">Added bonuses</h3>
    <div class="bonus-rows">
      <div v-for="g in groups" :key="g.group" class="bonus-row">
        <span class="bonus-label">{{ g.group === "scroll" ? "Scroll" : g.label }}</span>
        <div class="bonus-pick">
          <select v-if="g.max === 1" :aria-label="g.label" :value="g.chosen[0]?.b.id || ''" @change="choose(g, $event.target.value)">
            <option value="">None</option>
            <option v-for="b in g.options" :key="b.id" :value="b.id" :title="label(b)">{{ short(b) }}</option>
          </select>
          <template v-else>
            <ul v-if="g.chosen.length" class="bonus-chosen">
              <li v-for="x in g.chosen" :key="x.i">
                <span>{{ label(x.b) }}</span>
                <button class="text-btn" :aria-label="`Remove ${label(x.b)}`" @click="remove(x.i)">Remove</button>
              </li>
            </ul>
            <select v-if="!g.full" :aria-label="`Add ${g.label.toLowerCase()}`" @change="add(g, $event)">
              <option value="">+ Add {{ g.group === "cycle" ? "a cycle" : "a shrine" }}…</option>
              <option v-for="b in g.options" :key="b.id" :value="b.id" :title="label(b)">{{ short(b) }}</option>
            </select>
          </template>
          <span v-if="g.max === 1 && g.chosen[0]" class="bonus-detail">{{ g.chosen[0].b.lines.filter((l) => !/Required Level$/.test(l)).join(" · ") }}</span>
          <small v-if="!compact" class="muted">{{ NOTES[g.group] }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bonus-rows { display: grid; gap: 14px; }
.bonus-row { display: grid; grid-template-columns: var(--editor-label, 8rem) minmax(0, 1fr); gap: 12px; align-items: start; }
.bonus-label { padding-top: 8px; font-size: 0.8125rem; color: var(--muted); }
.bonus-pick { display: grid; gap: 4px; min-width: 0; }
.bonus-pick select { width: 100%; max-width: 100%; text-overflow: ellipsis; }
.bonus-pick small { font-size: 0.75rem; }
.bonus-detail { font-size: 0.8125rem; line-height: 1.45; color: var(--stats); }
.bonus-chosen { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.bonus-chosen li { display: flex; gap: 10px; align-items: baseline; justify-content: space-between; font-size: 0.8125rem; color: var(--stats); }
.item-bonuses.compact .bonus-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
.item-bonuses.compact .bonus-label { padding-top: 0; }
@media (max-width: 560px) {
  .bonus-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .bonus-label { padding-top: 0; }
}
</style>
