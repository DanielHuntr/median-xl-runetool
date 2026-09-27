<script setup>
import { computed } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { orbMultiplier } from '../../planner/orbs.js';
import { superiorNames, superiorLineTexts } from '../../planner/superior.js';

// The in-game style item sheet shown when hovering an item.
const props = defineProps({ item: { type: Object, required: true } });
const { catalog, build, character } = usePlanner();

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
const names = computed(() => superiorNames(r.value));
const fromSuperior = computed(() => superiorLineTexts(r.value));
</script>
<template>
  <div v-if="r" class="sheet item-sheet">
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
      <li v-for="p in lines" :class="cls(p)">
        {{ p.text }}<small v-if="p.kind === 'unknown'"> (not counted)</small><small v-else-if="fromSuperior.has(p.text)" class="superior-note"> (Superior)</small>
      </li>
      <li v-if="r.socketCount" class="counted">Socketed ({{ r.socketCount }})</li>
    </ul>
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
