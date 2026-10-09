<script setup>
// An item's tooltip body, drawn like the game's: the name in its quality colour, its base and
// state in grey, the base's own lines in white (damage, defense, requirements), then the magic
// lines in blue (a unique's or set item's stats, and what recipes added).
import { computed } from "vue";
import { itemInfo } from "../cube/itemInfo.js";
const props = defineProps({ cube: { type: Object, required: true }, item: { type: Object, required: true }, hint: { type: String, default: "" } });
const QUALITY = { 3: "superior", 4: "magic", 5: "set", 6: "rare", 7: "unique", 8: "crafted", 9: "honorific" };
const QUALITY_NAME = { 3: "Superior", 4: "Magic", 5: "Set", 6: "Rare", 7: "Unique", 8: "Crafted", 9: "Honorific" };
const it = computed(() => props.item);
const info = computed(() => itemInfo(props.cube, it.value));
const sub = computed(() => props.cube.items.get(it.value.code)?.sub || "");
const added = computed(() => props.cube.itemLines(it.value).filter((l) => !info.value.mods.includes(l)));
</script>
<template>
  <b :class="QUALITY[it.quality] && !it.random ? `q-${QUALITY[it.quality]}` : ''">{{ cube.itemName(it) }}</b>
  <span v-if="info.set" class="cube-tip-set">{{ info.set }}</span>
  <span v-if="it.special" class="cube-tip-base">{{ it.name }}</span>
  <span v-else-if="hint || cube.hintOf(it.code)" class="cube-tip-base">{{ hint || cube.hintOf(it.code) }}</span>
  <span v-if="sub" class="cube-tip-base">{{ sub }}</span>
  <span v-if="it.quality > 2 && !it.special && !it.random" class="cube-tip-base">{{ QUALITY_NAME[it.quality] }}</span>
  <span v-for="l in info.base" :key="`b${l}`" class="cube-tip-plain">{{ l }}</span>
  <span v-if="it.ethereal" class="cube-tip-base">Ethereal (Cannot be Repaired)</span>
  <span v-for="l in info.mods" :key="`m${l}`" class="cube-tip-line">{{ l }}</span>
  <span v-for="l in added" :key="`a${l}`" class="cube-tip-line">{{ l }}</span>
  <span v-if="it.sockets" class="cube-tip-line">Socketed ({{ it.sockets }})</span>
</template>
<style>
/* Game-style tooltip (cube and item list): always dark, whatever the theme. */
.cube-tip { z-index: 50; display: grid; gap: 2px; min-width: 180px; max-width: 340px; padding: 8px 12px; border: 1px solid #3f3a2f; background: #000000f0; color: #d9d2bf; text-align: center; pointer-events: none; font-size: 0.8125rem; line-height: 1.35; box-shadow: 0 8px 24px #000a; }
.cube-tip b { color: #dcdcdc; font-size: 0.875rem; }
.cube-tip .cube-tip-base { color: #9a9a9a; }
.cube-tip .cube-tip-set { color: #3cff3c; }
.cube-tip .cube-tip-plain { color: #dcdcdc; }
.cube-tip .cube-tip-line { color: #8f8fff; }
.cube-tip small { margin-top: 4px; color: #6f6a5d; font-size: 0.75rem; }
.cube-tip b.q-magic { color: #8f8fff; } .cube-tip b.q-set { color: #3cff3c; } .cube-tip b.q-rare { color: #ffff6e; }
.cube-tip b.q-unique { color: #d8bf7a; } .cube-tip b.q-crafted { color: #ffa800; } .cube-tip b.q-honorific { color: #c080ff; }
</style>
