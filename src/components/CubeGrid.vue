<script setup>
// The cube as the game draws it: a grid (15 × 10 in Median XL 2.14) with each item taking its
// inventory size, packed in order. Hover or focus shows the item's tooltip; click selects it
// for editing; right-click or the × takes it out. Items dragged from the list drop in.
import { computed, ref } from "vue";
import ItemSprite from "./ItemSprite.vue";
import Icon from "./AppIcon.vue";
import CubeItemInfo from "./CubeItemInfo.vue";
import atlas from "../data/item-atlas.json";

const props = defineProps({
  cube: { type: Object, required: true },
  items: { type: Array, required: true },
  selected: { type: Number, default: null },
  fresh: { type: Array, default: () => [] },
});
const emit = defineEmits(["select", "remove", "drop"]);
const [W, H] = props.cube.grid;
// Cells are 32px, smaller on narrow screens (the --cell variable); positions are in cells.
const at = (n) => `calc(var(--cell) * ${n})`;

// An item's size in cells, from its graphic (28 pixels a cell).
const sizeOf = (it) => {
  const a = atlas.art[props.cube.artOf(it) || ""];
  return a ? [Math.max(1, Math.min(W, Math.round(a[3] / 28))), Math.max(1, Math.min(H, Math.round(a[4] / 28)))] : [1, 1];
};
// First-fit packing, top to bottom then left to right (as the game drops items in).
const placed = computed(() => {
  const used = Array.from({ length: H }, () => new Array(W).fill(false));
  const out = [];
  for (const it of props.items) {
    const [w, h] = sizeOf(it);
    let spot = null;
    for (let x = 0; x + w <= W && !spot; x++)
      for (let y = 0; y + h <= H && !spot; y++)
        if (used.slice(y, y + h).every((row) => row.slice(x, x + w).every((c) => !c))) spot = [x, y];
    if (!spot) { out.push({ it, w, h, x: -1, y: -1 }); continue; }
    for (let yy = spot[1]; yy < spot[1] + h; yy++) for (let xx = spot[0]; xx < spot[0] + w; xx++) used[yy][xx] = true;
    out.push({ it, w, h, x: spot[0], y: spot[1] });
  }
  return out;
});
const overflow = computed(() => placed.value.filter((p) => p.x < 0));
defineExpose({ fits: (item) => {
  // Would this item still fit after the current ones?
  const used = Array.from({ length: H }, () => new Array(W).fill(false));
  for (const p of placed.value) if (p.x >= 0) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) used[y][x] = true;
  const [w, h] = sizeOf(item);
  for (let x = 0; x + w <= W; x++) for (let y = 0; y + h <= H; y++) if (used.slice(y, y + h).every((row) => row.slice(x, x + w).every((c) => !c))) return true;
  return false;
} });

const QUALITY = { 3: "superior", 4: "magic", 5: "set", 6: "rare", 7: "unique", 8: "crafted", 9: "honorific" };
const QUALITY_NAME = { 3: "Superior", 4: "Magic", 5: "Set", 6: "Rare", 7: "Unique", 8: "Crafted", 9: "Honorific" };
// The tooltip follows an item by its id: the placed items are rebuilt whenever the cube
// redraws (a click selects an item), so they can't be compared as objects.
const tipId = ref(null);
const tip = computed(() => placed.value.find((p) => p.it.id === tipId.value && p.x >= 0) || null);
const show = (p) => (tipId.value = p.it.id);
const hide = (p) => { if (!p || tipId.value === p.it.id) tipId.value = null; };
const tipStyle = computed(() => {
  const p = tip.value;
  if (!p) return {};
  const left = at(p.x + p.w / 2);
  // Above the item, or below it when it sits near the top.
  return p.y > 2 ? { left, top: at(p.y), transform: "translate(-50%, calc(-100% - 8px))" } : { left, top: at(p.y + p.h), transform: "translate(-50%, 8px)" };
});
const dragOver = ref(false);
function onDrop(e) {
  dragOver.value = false;
  const key = e.dataTransfer?.getData("text/x-cube-item");
  if (key) emit("drop", key);
}
</script>
<template>
  <div class="cube-grid-wrap">
    <div
      class="cube-grid"
      :class="{ over: dragOver }"
      :style="{ width: at(W), height: at(H), '--cell': `min(32px, calc((100vw - 72px) / ${W}))` }"
      @mouseleave="hide()"
      @keydown.esc="hide()"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <p v-if="!items.length" class="cube-grid-empty">Drag items here, or click them in the list.</p>
      <!-- Only the items are in the list (the empty note and tooltip aren't); it adds no box. -->
      <div role="list" aria-label="Cube contents" class="cube-grid-list">
      <div
        v-for="p in placed.filter((q) => q.x >= 0)"
        :key="p.it.id"
        role="listitem"
        class="cube-slot"
        :class="[QUALITY[p.it.quality] && !p.it.random ? `q-${QUALITY[p.it.quality]}` : '', { selected: selected === p.it.id, fresh: fresh.includes(p.it.id) }]"
        :style="{ left: at(p.x), top: at(p.y), width: at(p.w), height: at(p.h) }"
        @mouseenter="show(p)"
        @mouseleave="hide(p)"
      >
        <button
          type="button"
          class="cube-slot-btn"
          :aria-label="`${cube.itemName(p.it)}. Select to edit`"
          :aria-pressed="selected === p.it.id"
          @click="emit('select', p.it.id)"
          @contextmenu.prevent="emit('remove', p.it.id)"
          @focus="show(p)"
          @blur="hide(p)"
        >
          <ItemSprite v-if="cube.artOf(p.it)" :name="cube.artOf(p.it)" class="cube-slot-art" :style="{ width: `calc(${at(p.w)} - 4px)`, height: `calc(${at(p.h)} - 4px)` }" />
          <span v-else class="cube-slot-text">{{ cube.itemName(p.it).slice(0, 2) }}</span>
        </button>
        <button type="button" class="cube-slot-x" :aria-label="`Take ${cube.itemName(p.it)} out`" @click="emit('remove', p.it.id)"><Icon name="close" /></button>
      </div>
      </div>
      <!-- The tooltip, drawn like the game's: name in its quality colour, then the item's lines. -->
      <div v-if="tip" class="cube-tip" :style="tipStyle" role="tooltip">
        <CubeItemInfo :cube="cube" :item="tip.it" />
        <small>Click to edit · right-click to take out</small>
      </div>
    </div>
    <p v-if="overflow.length" class="cube-grid-full">No room for {{ overflow.map((p) => cube.itemName(p.it)).join(", ") }}: the cube is full.</p>
  </div>
</template>
<style scoped>
.cube-grid-list { display: contents; }
.cube-grid-wrap { padding: 4px 0; }
.cube-grid { position: relative; margin: 0 auto; border: 2px solid var(--border); border-radius: 4px; box-shadow: inset 0 0 24px #0008;
  background: linear-gradient(90deg, #ffffff0a 1px, transparent 1px) 0 0 / var(--cell) var(--cell), linear-gradient(#ffffff0a 1px, transparent 1px) 0 0 / var(--cell) var(--cell), #0b0a08; }
.cube-grid.over { border-color: var(--gold); box-shadow: inset 0 0 24px #0008, 0 0 0 2px var(--gold-bg); }
.cube-grid-empty { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 20px; color: #9c9483; text-align: center; font-size: 0.875rem; pointer-events: none; }
.cube-slot { position: absolute; padding: 1px; }
.cube-slot-btn { width: 100%; height: 100%; display: grid; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 2px; background: #ffffff08; cursor: pointer; }
.cube-slot-btn:hover, .cube-slot-btn:focus-visible { background: #ffffff18; border-color: #c7b37788; outline: none; }
.cube-slot.selected .cube-slot-btn { border-color: #c7b377; background: #c7b37722; }
.cube-slot-art { image-rendering: pixelated; object-fit: contain; }
.cube-slot-text { color: #d9d2bf; font-size: 0.75rem; font-weight: 700; }
/* Quality tints, like the game's coloured item backgrounds. */
.q-magic .cube-slot-btn { background: #2e3b8a44; }
.q-rare .cube-slot-btn { background: #7a6e1a44; }
.q-unique .cube-slot-btn { background: #7a5a2a55; }
.q-set .cube-slot-btn { background: #1e6a2044; }
.q-crafted .cube-slot-btn { background: #8a4a0d44; }
.q-honorific .cube-slot-btn { background: #5a2a8a44; }
.cube-slot-x { position: absolute; top: -6px; right: -6px; z-index: 2; width: 18px; height: 18px; display: none; place-items: center; padding: 0; border: 1px solid #3f3a2f; border-radius: 50%; background: #1a1a1a; color: #d9d2bf; }
.cube-slot:hover .cube-slot-x, .cube-slot:focus-within .cube-slot-x { display: grid; }
.cube-slot-x:hover { color: #ff7a6e; border-color: #ff7a6e; }
.cube-slot-x svg { width: 10px; height: 10px; }
.cube-slot.fresh .cube-slot-btn { animation: cube-new 1.4s ease-out; }
@keyframes cube-new { 0% { box-shadow: 0 0 0 0 #ffd76a; background: #ffd76a55; } 100% { box-shadow: 0 0 14px 6px transparent; } }
@media (prefers-reduced-motion: reduce) { .cube-slot.fresh .cube-slot-btn { animation: none; } }
/* Game-style tooltip: always dark, whatever the theme. */
.cube-tip { position: absolute; }
.cube-grid-full { margin: 6px 0 0; color: var(--bad); font-size: 0.8125rem; text-align: center; }
</style>
