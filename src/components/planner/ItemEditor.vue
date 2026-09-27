<script setup>
import { computed, ref } from "vue";
import { ORBS, orbById, orbFits, orbMultiplier } from '../../planner/orbs.js';
import ItemIcon from "./ItemIcon.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { SLOTS } from "../../planner/items.js";
import { pointsFor } from "../../planner/character.js";

const props = defineProps({ slot: { type: String, required: true } });
const { catalog, build, character, updateItem, unequip, state, openPicker, applyFix, emptySockets, fillEmptySockets, fillSockets, clearSockets, enhance, canAddOrb, addOrb } =
  usePlanner();

const item = computed(() => build.value.gear[props.slot]);
const ethereal = computed(() => item.value?.ethereal || r.value?.lines.some(l => /\bethereal\b/i.test(l)));
const chosenOrb = ref('');
const availableOrbs = computed(() => ORBS.filter(o => (!o.unique || state.includeUniqueOrbs) && orbFits(o, r.value.def, r.value.lines, item.value)));
function removeOrb(i) {
  updateItem(props.slot, { orbs: item.value.orbs.filter((_, index) => index !== i) });
}
const r = computed(() => character.value.equipped[props.slot] || (item.value && catalog.resolve(item.value, build.value.level)));
const inactive = computed(() => item.value && !character.value.equipped[props.slot]);
const slotLabel = computed(() => SLOTS.find((s) => s.id === props.slot)?.label);

const variants = computed(() => {
  const d = r.value?.baseDef || r.value?.def;
  if (!d?.variants || d.variants.length < 2) return [];
  const need = r.value.def.kind === "runeword" ? r.value.def.runes.length : 0;
  return d.variants.map((v, i) => ({
    i,
    label: v.label,
    ok: !need || v.lines.some((l) => (parseInt(/^Socketed \((\d)\)/.exec(l)?.[1] || "0", 10)) >= need),
  }));
});
const variantKey = computed(() => (r.value?.baseDef ? "baseVariant" : "variant"));
const currentVariant = computed(() => {
  const n = variants.value.length;
  return Math.min(item.value?.[variantKey.value] ?? n - 1, n - 1);
});
const setVariant = (i) => updateItem(props.slot, { [variantKey.value]: Number(i), rolls: [] });

function rollValue(i) {
  const x = r.value.ranges[i];
  const t = item.value.rolls?.[i] ?? 1;
  return x.min + (x.max - x.min) * t;
}
const step = (x) => (String(x.min).includes(".") || String(x.max).includes(".") ? 0.01 : 1);
function setRoll(i, v) {
  const x = r.value.ranges[i];
  const rolls = [...(item.value.rolls || [])];
  while (rolls.length < r.value.ranges.length) rolls.push(1);
  rolls[i] = x.max === x.min ? 1 : (Number(v) - x.min) / (x.max - x.min);
  updateItem(props.slot, { rolls });
}
const allRolls = (t) => updateItem(props.slot, { rolls: r.value.ranges.map(() => t) });

const canPickSockets = computed(() => ["base", "custom"].includes(r.value?.def.kind));
const setSocketCount = (n) => updateItem(props.slot, { socketCount: Number(n) });
// Empty sockets left on this item, for "Fill empty" on a filled socket.
const empty = computed(() => (r.value?.def.kind === "runeword" ? [] : emptySockets(props.slot)));
const anyFilled = computed(() => r.value?.def.kind !== "runeword" && (item.value?.sockets || []).some(Boolean));
function clearSocket(i) {
  const sockets = [...(item.value.sockets || [])];
  sockets[i] = null;
  updateItem(props.slot, { sockets });
}
const lineClass = (p) =>
  ({ stats: "counted", skill: "counted", oskill: "counted", info: "info", unknown: "unknown" })[p.kind] || "effect";
const reqs = computed(() => {
  const h = r.value.head;
  const a = character.value.attributes;
  return [
    h.reqLevel && {
      t: `Level ${h.reqLevel}`,
      ok: build.value.level >= h.reqLevel,
      fix: { kind: "level", level: h.reqLevel },
      label: `Set level ${h.reqLevel}`,
    },
    h.reqStr && {
      t: `Str ${h.reqStr}`,
      ok: a.strength.total >= h.reqStr,
      fix: { kind: "attr", attr: "strength", amount: pointsFor(a.strength, h.reqStr) },
      label: `Add ${pointsFor(a.strength, h.reqStr)} Str`,
    },
    h.reqDex && {
      t: `Dex ${h.reqDex}`,
      ok: a.dexterity.total >= h.reqDex,
      fix: { kind: "attr", attr: "dexterity", amount: pointsFor(a.dexterity, h.reqDex) },
      label: `Add ${pointsFor(a.dexterity, h.reqDex)} Dex`,
    },
    r.value.cls && { t: `${r.value.cls} only`, ok: r.value.cls === state.cls },
  ].filter(Boolean);
});
</script>
<template>
  <section v-if="item && r" id="item-editor" tabindex="-1" class="item-editor" :aria-label="`${slotLabel}: ${r.def.name}`">
    <div class="item-editor-head">
      <ItemIcon :icon="r.def.icon" />
      <div>
        <div class="item-kind">{{ slotLabel }} · {{ r.def.kindLabel }}</div>
        <h2 :class="'q-' + r.def.kind">{{ r.def.name }}</h2>
        <p class="base">
          {{ r.def.base && r.def.base !== r.def.name ? r.def.base : r.def.cat }}<template v-if="r.label"> · {{ r.label }}</template>
        </p>
      </div>
    </div>
    <p v-if="inactive" class="warning">This slot belongs to the other weapon set, so it isn't counted right now.</p>

    <div class="item-controls">
      <label v-if="variants.length" class="field-inline"
        >{{ r.def.kind === "runeword" ? "Base tier" : "Tier" }}
        <select :value="currentVariant" @change="setVariant($event.target.value)">
          <option v-for="v in variants" :value="v.i" :disabled="!v.ok">{{ v.label }}{{ v.ok ? "" : " (too few sockets)" }}</option>
        </select></label
      >
      <label v-if="canPickSockets && r.maxSockets" class="field-inline"
        >Sockets
        <select :value="r.socketCount" @change="setSocketCount($event.target.value)">
          <option v-for="n in r.maxSockets + 1" :value="n - 1">{{ n - 1 }}</option>
        </select></label
      >
      <button class="btn" @click="openPicker({ mode: 'slot', slot })">Change item</button>
      <button class="btn" @click="unequip(slot)">Remove</button>
    </div>

    <div class="unique-meta">
      <span v-for="q in reqs" :class="{ warning: !q.ok }"
        ><b>{{ q.t }}</b
        ><button v-if="!q.ok && q.fix" class="fix-btn" @click="applyFix(q.fix)">{{ q.label }}</button></span
      >
      <span v-if="r.head.damage"
        >{{ r.head.damage.type }} damage <b>{{ Math.floor(r.head.damage.min) }}–{{ Math.floor(r.head.damage.max) }}</b></span
      >
      <span v-if="r.head.defense != null">Defense <b>{{ Math.floor(r.head.defense) }}</b></span>
      <span v-if="r.head.block != null">Block <b>{{ r.head.block }}%{{ r.head.blockClass ? " + class" : "" }}</b></span>
    </div>

    <div class="sockets orb-editor">
      <h3>Mystic orbs <button class="text-btn" @click="enhance(slot)">Suggest orbs and sockets</button></h3>
      <p v-if="ethereal" class="muted">This item is Ethereal and cannot receive mystic orbs. Its empty sockets can still be filled.</p>
      <template v-else>
      <label class="switch"><input type="checkbox" role="switch" v-model="state.includeUniqueOrbs" />Include rare unique mystic orbs</label>
      <p class="muted">Bonuses ×{{ orbMultiplier(r.lines) }}. Required level {{ r.head.reqLevel }} / {{ build.level }}. Orb penalties include your socket fillers.</p>
      <ul v-if="item.orbs?.length"><li v-for="(id, i) in item.orbs || []" :key="i">
        <span><b>{{ orbById(id)?.name }}</b><small>{{ orbById(id)?.lines.join(', ') }}</small><small>+{{ orbById(id)?.reqLevel }} required level</small></span>
        <button class="text-btn" :aria-label="`Remove ${orbById(id)?.name} orb`" @click="removeOrb(i)">Remove</button>
      </li></ul>
      <div class="orb-add-controls">
      <label class="orb-select">Mystic orb <select v-model="chosenOrb">
        <option value="">Choose an orb</option>
        <option v-for="o in availableOrbs" :key="o.id" :value="o.id" :disabled="!canAddOrb(slot, o.id)">{{ o.name }} — {{ o.lines.join(', ') }} (+{{ o.reqLevel }} levels)</option>
      </select></label>
      <button class="btn" :disabled="!canAddOrb(slot, chosenOrb)" @click="addOrb(slot, chosenOrb)">Add orb</button>
      </div>
      </template>
    </div>
    <div v-if="r.socketCount" class="sockets">
      <h3>
        Sockets
        <button
          v-if="empty.length"
          class="text-btn"
          title="Best gems, runes or jewels for your build: damage stats and resistances up to the cap"
          @click="fillSockets(slot)"
        >
          Suggest
        </button>
        <button v-if="anyFilled" class="text-btn" @click="clearSockets(slot)">Empty all</button>
      </h3>
      <ul>
        <li v-for="(s, i) in r.def.kind === 'runeword' ? r.def.runes : r.sockets" :key="i">
          <template v-if="r.def.kind === 'runeword'">
            <ItemIcon :src="catalog.images[s]" /><span>{{ s }} rune</span>
          </template>
          <template v-else-if="s">
            <ItemIcon :icon="s.def.icon" :src="s.def.img ? catalog.images[s.def.img] : ''" /><span
              >{{ s.def.name }}<small>{{ s.lines.join(" · ") }}</small></span
            >
            <button
              v-if="empty.length"
              class="text-btn"
              :title="`Put ${s.def.name} in the ${empty.length} empty socket${empty.length > 1 ? 's' : ''}`"
              @click="fillEmptySockets(slot, s.def.key)"
            >
              Fill empty ({{ empty.length }})
            </button>
            <button class="text-btn" @click="openPicker({ mode: 'socket', slot, index: i })">Change</button>
            <button class="text-btn" :aria-label="`Empty socket ${i + 1}`" @click="clearSocket(i)">Empty</button>
          </template>
          <button v-else class="socket-empty" @click="openPicker({ mode: 'socket', slot, index: i })">+ Fill socket {{ i + 1 }}</button>
        </li>
      </ul>
    </div>

    <div v-if="r.ranges.length" class="rolls">
      <h3>
        Rolls
        <button class="text-btn" @click="allRolls(1)">All max</button>
        <button class="text-btn" @click="allRolls(0)">All min</button>
      </h3>
      <label v-for="(x, i) in r.ranges" :key="i" class="roll"
        ><span>{{ x.line.replace(/\((-?[\d.]+) to (-?[\d.]+)\)/, "[$1–$2]") }}</span>
        <input
          type="range"
          :min="Math.min(x.min, x.max)"
          :max="Math.max(x.min, x.max)"
          :step="step(x)"
          :value="rollValue(i)"
          @input="setRoll(i, $event.target.value)"
          :aria-label="x.line"
        /><b>{{ Math.round(rollValue(i) * 100) / 100 }}</b></label
      >
    </div>

    <h3>Stats</h3>
    <ul class="item-lines">
      <li v-for="p in r.parsed" :class="lineClass(p)">
        {{ p.text }}<small v-if="p.kind === 'unknown'"> · not counted</small
        ><small v-else-if="p.kind === 'oskill'"> · oskill</small
        ><small v-else-if="p.kind === 'proc' || p.kind === 'feature' || p.kind === 'skillmod'"> · effect, not a stat</small>
      </li>
    </ul>
  </section>
</template>
