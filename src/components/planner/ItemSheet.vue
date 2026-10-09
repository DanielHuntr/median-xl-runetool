<script>
import { ref as moduleRef } from "vue";
// Whether the unused lines are shown, for every sheet this visit.
const openUnused = moduleRef(false);
</script>
<script setup>
import { computed } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { orbMultiplier } from '../../planner/orbs.js';
import { superiorNames, superiorLineTexts } from '../../planner/superior.js';
import { lineWaste } from '../../planner/relevance.js';

// The in-game style item sheet shown when hovering an item.
const props = defineProps({ item: { type: Object, required: true }, pinned: { type: Boolean, default: false } });
const { catalog, build, character, lineUse } = usePlanner();

const r = computed(() => catalog.resolve(props.item, build.value.level));
const HEAD = /^(Required |Item Level|Quality Level|Socketed \(|\(\w+ Only\)$|(One-Hand|Two-Hand|Throw) Damage|Defense:|Chance to Block)/;
const lines = computed(() => r.value.parsed.filter((p) => !HEAD.test(p.text)));
const reqs = computed(() => {
  const h = r.value.head;
  const a = character.value.attributes;
  return [
    h.reqLevel && { t: `Required Level: ${h.reqLevel}`, ok: build.value.level >= h.reqLevel },
    h.reqStr && { t: `Required Strength: ${h.reqStr}`, ok: a.strength.total >= h.reqStr },
    h.reqDex && { t: `Required Dexterity: ${h.reqDex}`, ok: a.dexterity.total >= h.reqDex },
    r.value.cls && { t: `(${r.value.cls} Only)`, ok: r.value.cls === build.value.cls },
  ].filter(Boolean);
});
const set = computed(() => {
  const id = r.value.def.setId;
  if (id == null) return null;
  const s = catalog.setById(id);
  const equipped = new Set(Object.values(character.value.equipped).filter((x) => x.def.setId === id).map((x) => x.def.name));
  const count = equipped.size;
  return {
    name: s.name,
    items: s.items.map((i) => ({ name: i.name, on: equipped.has(i.name) })),
    bonuses: s.bonuses.map((b) => {
      const n = /with (\d+) or more/.exec(b.when)?.[1];
      return { ...b, active: n ? count >= Number(n) : count >= s.items.length };
    }),
  };
});
const cls = (p) =>
  ({ stats: "counted", skill: "counted", oskill: "counted", unknown: "unknown" })[p.kind] || "effect";
const fmt = (n) => Math.floor(n).toLocaleString();
// Lines this build can't use (relevance.js), with why.
const unused = (p) => (lineUse.value ? lineWaste(p, lineUse.value) : null);
const usedLines = computed(() => lines.value.filter((p) => !unused(p)));
const unusedLines = computed(() => lines.value.filter(unused));
// Grouped at the bottom, closed: the sheet shows what the build uses at a glance. Opened on a
// pinned sheet, and left open for the next one this visit.
const unusedOpen = computed(() => openUnused.value);
const toggleUnused = () => { openUnused.value = !openUnused.value; };
const names = computed(() => superiorNames(r.value));
const fromSuperior = computed(() => superiorLineTexts(r.value));
</script>
<template>
  <div v-if="r" class="sheet item-sheet">
    <p class="sheet-kind" :class="'q-' + r.def.kind">{{ r.def.kindLabel }}</p>
    <p class="sheet-name" :class="'q-' + r.def.kind">{{ names.name }}</p>
    <p v-if="names.base" class="sheet-base">
      {{ names.base }}<template v-if="r.label"> ({{ r.label }})</template>
    </p>
    <p v-if="r.def.kind === 'runeword'" class="sheet-runes">'{{ r.def.runes.join("") }}'</p>
    <p v-if="r.head.damage">
      {{ r.head.damage.type }} Damage: <b>{{ fmt(r.head.damage.min) }} to {{ fmt(r.head.damage.max) }}</b>
    </p>
    <p v-if="r.head.defense != null">Defense: <b>{{ fmt(r.head.defense) }}</b></p>
    <p v-if="r.head.block != null">Chance to Block: <b>{{ r.head.block }}%{{ r.head.blockClass ? " + Class" : "" }}</b></p>
    <p v-for="q in reqs" :class="{ unmet: !q.ok }">{{ q.t }}</p>
    <ul class="sheet-lines">
      <li v-for="p in usedLines" :class="cls(p)">
        {{ p.text }}<small v-if="p.kind === 'unknown'"> (not counted)</small><small v-else-if="fromSuperior.has(p.text)" class="superior-note"> (Superior)</small>
      </li>
      <li v-if="r.socketCount" class="counted">Socketed ({{ r.socketCount }})</li>
    </ul>
    <!-- Right after the lines the build uses: the ones it can't. -->
    <div v-if="unusedLines.length" class="sheet-unused">
      <button v-if="pinned" type="button" class="unused-toggle" :aria-expanded="unusedOpen" @click="toggleUnused">
        Unused by this build ({{ unusedLines.length }}) <span aria-hidden="true">{{ unusedOpen ? "▴" : "▾" }}</span>
      </button>
      <p v-else class="unused-toggle">Unused by this build ({{ unusedLines.length }}) · Alt to pin and show</p>
      <ul v-if="pinned && unusedOpen" class="sheet-lines unused-list">
        <li v-for="p in unusedLines" :key="p.text">{{ p.text }}<small>{{ unused(p) }}</small></li>
      </ul>
    </div>
    <ul v-if="r.orbs?.length" class="sheet-sockets">
      <li v-for="o in r.orbs"><b>{{ o.def.name }} orb</b>: {{ o.def.lines.join(', ') }}<span v-if="orbMultiplier(r.lines) > 1"> (bonuses ×{{ orbMultiplier(r.lines) }})</span> (+{{ o.def.reqLevel }} required level)<small v-if="o.parsed.some(p => p.kind === 'unknown')"> — some effects not counted</small></li>
    </ul>
    <ul v-if="r.sockets.some(Boolean)" class="sheet-sockets">
      <li v-for="s in r.sockets.filter(Boolean)">
        <b>{{ s.def.name }}</b>: {{ s.lines.join(", ") }}
      </li>
    </ul>
    <div v-if="set" class="sheet-set">
      <p class="q-set">{{ set.name }}</p>
      <p v-for="i in set.items" :class="i.on ? 'q-set' : 'dim'">{{ i.name }}</p>
      <template v-for="b in set.bonuses">
        <p :class="b.active ? 'q-set' : 'dim'">{{ b.when }}</p>
        <p v-for="l in b.lines" :class="b.active ? 'counted' : 'dim'">{{ l }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* What the item is (Tiered unique, Set · name, Sacred unique…), above its name. */
.sheet-kind { margin: 0 0 2px; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8; }
</style>
