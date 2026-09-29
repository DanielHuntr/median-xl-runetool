<script setup>
import { computed, ref } from "vue";
import Icon from "../AppIcon.vue";
import ItemIcon from "./ItemIcon.vue";
import SuggestGear from "./SuggestGear.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { SLOTS } from "../../planner/items.js";
import { superiorNames } from "../../planner/superior.js";

const { catalog, state, build, character, swapWeapons, removeInventory, openPicker, openEditor, unequip, clearEquipment, say, tipOn } = usePlanner();
function suggestGear() {
  state.suggesting = true;
}

const handSlots = computed(() =>
  build.value.swap ? { weapon: "weapon2", offhand: "offhand2" } : { weapon: "weapon", offhand: "offhand" },
);
// Grid areas follow the in-game inventory layout.
const doll = computed(() => [
  { area: "weapon", slot: handSlots.value.weapon },
  { area: "offhand", slot: handSlots.value.offhand },
  { area: "helm", slot: "helm" },
  { area: "amulet", slot: "amulet" },
  { area: "body", slot: "body" },
  { area: "gloves", slot: "gloves" },
  { area: "ring1", slot: "ring1" },
  { area: "belt", slot: "belt" },
  { area: "ring2", slot: "ring2" },
  { area: "boots", slot: "boots" },
]);
const label = (slot) => SLOTS.find((s) => s.id === slot).label;
const resolved = (slot) =>
  character.value.equipped[slot] || (build.value.gear[slot] && catalog.resolve(build.value.gear[slot], build.value.level));
// Empty slot: pick an item. Filled slot: open its editor as a modal.
function openSlot(slot) {
  state.slot = slot;
  if (!build.value.gear[slot]) return openPicker({ mode: "slot", slot });
  openEditor(slot);
}
function removeSlot(slot) {
  const name = resolved(slot)?.def.name;
  unequip(slot);
  if (state.slot === slot) state.slot = null;
  say(`Removed ${name}.`, "info");
}
const inventory = computed(() =>
  build.value.inventory.map((st, i) => ({ i, def: catalog.get(st.ref) })).filter((x) => x.def),
);
// The charm list, with how many are carried: open, scrolling within the space the equipment
// column has left (planner.css), and folding away from its heading.
const charmsOpen = ref(true);
// Charms or relics only, when there are both.
const charmFilter = ref("");
const relicCount = computed(() => inventory.value.filter((x) => x.def.kind === "relic").length);
const shownInventory = computed(() => (charmFilter.value ? inventory.value.filter((x) => (x.def.kind === "relic") === (charmFilter.value === "relic")) : inventory.value));
const charmSummary = computed(() => {
  const relics = inventory.value.filter((x) => x.def.kind === "relic").length;
  const charms = inventory.value.length - relics;
  return [charms && `${charms} charm${charms === 1 ? "" : "s"}`, relics && `${relics} relic${relics === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
});
</script>
<template>
  <section class="doll-panel" aria-label="Equipment">
    <div class="doll-top">
      <h2 class="group-title">Equipment</h2>
      <button class="btn suggest-btn" title="Refresh equipment for your current build and view suggestions" @click="suggestGear"><Icon name="star" />Suggest gear</button>
      <button class="btn clear-equipment-btn" :disabled="!Object.keys(build.gear).length" title="Clear equipment from both weapon sets" @click="clearEquipment">Clear all</button>
      <div class="weapon-sets" role="group" aria-label="Weapon set">
        <button :aria-pressed="!build.swap" @click="build.swap && swapWeapons()">I</button>
        <button :aria-pressed="build.swap" @click="!build.swap && swapWeapons()">II</button>
      </div>
    </div>
    <div class="doll">
      <div v-for="d in doll" :key="d.area" class="doll-cell" :class="d.area" :style="{ gridArea: d.area }">
        <button
          class="doll-slot"
          :class="[d.area, { filled: build.gear[d.slot], selected: state.slot === d.slot }]"
          :aria-label="build.gear[d.slot] ? `${label(d.slot)}: ${resolved(d.slot)?.superior && resolved(d.slot).def.kind !== 'base' ? 'Superior ' : ''}${superiorNames(resolved(d.slot)).name}` : `${label(d.slot)}: empty, choose an item`"
          v-on="build.gear[d.slot] ? tipOn({ kind: 'item', item: build.gear[d.slot] }) : {}"
          @click="openSlot(d.slot)"
        >
          <template v-if="build.gear[d.slot] && resolved(d.slot)">
            <ItemIcon :icon="resolved(d.slot).def.icon" />
            <span v-if="resolved(d.slot).superior" class="doll-superior" aria-hidden="true">Superior</span>
            <span class="doll-name" :class="'q-' + resolved(d.slot).def.kind">{{ superiorNames(resolved(d.slot)).name }}</span>
            <span v-if="resolved(d.slot).socketCount" class="doll-sockets" aria-hidden="true"
              ><i
                v-for="n in resolved(d.slot).socketCount"
                :class="{ on: resolved(d.slot).def.kind === 'runeword' || resolved(d.slot).sockets[n - 1] }"
              ></i
            ></span>
          </template>
          <span v-else class="doll-empty">{{ label(d.slot) }}</span>
        </button>
        <button
          v-if="build.gear[d.slot]"
          class="doll-remove"
          :aria-label="`Remove ${resolved(d.slot)?.def.name || 'item'} from ${label(d.slot)}`"
          title="Remove"
          @click="removeSlot(d.slot)"
        >
          <Icon name="close" />
        </button>
      </div>
    </div>

    <div class="charms">
      <div class="doll-top">
        <h2 class="group-title">
          <button v-if="inventory.length" type="button" class="charms-toggle" :aria-expanded="charmsOpen" aria-controls="charm-list" @click="charmsOpen = !charmsOpen">
            Charms &amp; relics <span class="charms-count">{{ inventory.length }}</span><span class="charms-caret" aria-hidden="true">{{ charmsOpen ? "▴" : "▾" }}</span>
          </button>
          <template v-else>Charms &amp; relics</template>
        </h2>
        <button class="btn" @click="openPicker({ mode: 'inventory' })">+ Add</button>
      </div>
      <p v-if="!inventory.length" class="muted">None yet. Charms and up to 3 relics count toward your stats.</p>
      <p v-else-if="!charmsOpen" class="muted charms-summary">{{ charmSummary }}</p>
      <div v-if="charmsOpen && relicCount && relicCount < inventory.length" class="picker-filters charm-filters" aria-label="Show">
        <button type="button" :aria-pressed="charmFilter === ''" @click="charmFilter = ''">All {{ inventory.length }}</button>
        <button type="button" :aria-pressed="charmFilter === 'charm'" @click="charmFilter = 'charm'">Charms {{ inventory.length - relicCount }}</button>
        <button type="button" :aria-pressed="charmFilter === 'relic'" @click="charmFilter = 'relic'">Relics {{ relicCount }}</button>
      </div>
      <ul v-if="inventory.length && charmsOpen" id="charm-list">
        <li v-for="x in shownInventory" :key="x.i">
          <span class="charm-name" tabindex="0" v-on="tipOn({ kind: 'item', item: build.inventory[x.i] })"
            ><ItemIcon :icon="x.def.icon" /><span :class="'q-' + x.def.kind">{{ x.def.name }}</span></span
          >
          <button class="text-btn" :aria-label="`Remove ${x.def.name}`" @click="removeInventory(x.i)">Remove</button>
        </li>
      </ul>
    </div>
    <SuggestGear v-if="state.suggesting" @close="state.suggesting = false" />
  </section>
</template>
