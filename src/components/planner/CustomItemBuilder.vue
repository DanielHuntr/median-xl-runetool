<script setup>
import { ref, computed, watch } from 'vue';
import ItemIcon from './ItemIcon.vue';
import { usePlanner } from '../../planner/usePlanner.js';
import { SLOTS } from '../../planner/items.js';
import { CUSTOM_STATS, STAT_GROUPS, customStatText } from '../../planner/customStats.js';
const props = defineProps({ slot: { type: String, required: true } });
const emit = defineEmits(['pick']);
const { catalog, build } = usePlanner();
const base = ref(''), variant = ref(0), sockets = ref(0), query = ref(''), baseQuery = ref(''), group = ref(''), extra = ref('');
const selected = ref([]);
const choosingBase = ref(true);
function pickBase(key) { base.value = key; choosingBase.value = false; baseQuery.value = ''; }
const bases = computed(() => catalog.forSlot(props.slot, build.value.cls).filter(d => d.kind === 'base'));
const baseList = computed(() => {
  const q = baseQuery.value.trim().toLowerCase();
  return q ? bases.value.filter(b => `${b.name} ${b.cat}`.toLowerCase().includes(q)) : bases.value;
});
const baseDef = computed(() => bases.value.find(d => d.key === base.value));
const variants = computed(() => baseDef.value?.variants || []);
watch(base, () => { variant.value = 0; sockets.value = 0; });
watch(variant, () => { sockets.value = 0; });
const maxSockets = computed(() => Number(/Socketed \((\d+)\)/.exec(variants.value[variant.value]?.lines.join('\n') || '')?.[1] || 0));
const groups = computed(() => STAT_GROUPS.filter(g => CUSTOM_STATS.some(s => s.group === g)));
const choices = computed(() => {
  const q = query.value.trim().toLowerCase();
  return CUSTOM_STATS.filter(s => (!group.value || s.group === group.value) && s.label.toLowerCase().includes(q));
});
const valid = computed(() => selected.value.every(row => row.values.every(v => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0) && (row.values.length < 2 || Number(row.values[0]) <= Number(row.values[1])) && (row.values.length < 3 || Number(row.values[2]) > 0)));
function toggle(stat) {
  const i = selected.value.findIndex(s => s.id === stat.id);
  if (i >= 0) selected.value.splice(i, 1);
  else selected.value.push({ id: stat.id, values: Array(stat.count).fill(1) });
}
// The item takes its base's name; a stats-only item is just "Custom item".
const item = computed(() => ({ ref: 'custom', ...(base.value ? { base: base.value, baseVariant: variant.value } : {}),
  socketCount: Math.min(maxSockets.value, Math.max(0, Number(sockets.value) || 0)),
  custom: { name: baseDef.value?.name || 'Custom item', slotType: baseDef.value?.slotType || SLOTS.find(s => s.id === props.slot)?.accepts[0] || 'weapon',
    text: [customStatText(selected.value), extra.value].filter(Boolean).join('\n') } }));
const preview = computed(() => catalog.resolve(item.value, build.value.level));
</script>
<template>
  <div class="custom-builder">
    <p class="muted custom-intro">Pick a base and tier, then add modifiers and enter their values. Sacred here is a base tier, not a sacred unique.</p>
    <div class="custom-builder-columns">
    <section class="custom-builder-selection" aria-label="Item base, values and preview">
    <div class="field">
      <span>Item base</span>
      <div v-if="!choosingBase" class="custom-base-chosen">
        <ItemIcon v-if="baseDef" :icon="baseDef.icon" /><span><b>{{ baseDef?.name || 'No base' }}</b><small>{{ baseDef?.cat || 'Stats only' }}</small></span>
        <button class="text-btn" @click="choosingBase = true">Change</button>
      </div>
      <template v-else>
        <input v-model="baseQuery" type="search" placeholder="Search bases…" aria-label="Search item bases" />
        <ul class="picker-list compact custom-base-list">
          <li><button :aria-pressed="!base" @click="pickBase('')"><span><b>No base</b><small>Stats only</small></span></button></li>
          <li v-for="b in baseList" :key="b.key">
            <button :aria-pressed="base === b.key" @click="pickBase(b.key)">
              <ItemIcon :icon="b.icon" /><span><b>{{ b.name }}</b><small>{{ b.cat }}</small></span>
            </button>
          </li>
        </ul>
      </template>
    </div>
    <div v-if="variants.length > 1 || maxSockets" class="custom-base-opts">
      <div v-if="variants.length > 1" class="field"><span>Base tier</span><div class="picker-filters"><button v-for="(v, i) in variants" :key="i" :aria-pressed="variant === i" @click="variant = i">{{ v.label }}</button></div></div>
      <label v-if="maxSockets" class="field">Sockets <select v-model.number="sockets"><option v-for="n in maxSockets + 1" :key="n" :value="n - 1">{{ n - 1 }}</option></select></label>
    </div>
    <h3>Selected modifiers</h3>
    <p v-if="!selected.length" class="muted">Pick modifiers on the right to set their values here.</p>
    <div v-for="row in selected" :key="row.id" class="custom-stat-row">
      <span>{{ CUSTOM_STATS[row.id].label }}</span>
      <span class="custom-stat-values"><template v-for="(_, i) in row.values" :key="i"><small v-if="i" aria-hidden="true">{{ i === 2 ? 'over' : 'to' }}</small><input v-model.number="row.values[i]" type="number" :min="i === 2 ? 0.01 : 0" step="any" :aria-label="`${CUSTOM_STATS[row.id].label}: ${i === 2 ? 'seconds' : row.values.length > 1 ? (i ? 'maximum' : 'minimum') : 'value'}`" /><small v-if="i === 2" aria-hidden="true">s</small></template></span>
      <button class="icon-btn" :aria-label="`Remove ${CUSTOM_STATS[row.id].label}`" @click="toggle(CUSTOM_STATS[row.id])">×</button>
    </div>
    <details><summary>Other stat lines (advanced)</summary><label class="field">Additional modifiers <textarea v-model="extra" rows="3" placeholder="One in-game stat per line" /></label></details>
    <section v-if="preview" class="custom-item-preview"><h3>Item preview</h3><p v-if="baseDef" class="muted">{{ baseDef.name }}<template v-if="variants[variant]?.label"> · {{ variants[variant].label }}</template></p><ul><li v-for="(line, i) in preview.lines" :key="i">{{ line }}<small v-if="preview.parsed[i]?.kind === 'unknown'" class="warning"> (not counted)</small></li></ul><p v-if="preview.head.reqLevel > build.level" class="warning">Requires level {{ preview.head.reqLevel }}; your character is level {{ build.level }}.</p></section>
    <p v-if="!valid" class="warning">Enter nonnegative values, with minimum damage no greater than maximum damage and poison duration greater than zero.</p>
    </section>
    <section class="custom-builder-controls" aria-label="Modifiers">
    <label class="field">Find a modifier <input v-model="query" type="search" placeholder="Search damage, life, resistance…" /></label>
    <div class="picker-filters" role="group" aria-label="Modifier category">
      <button :aria-pressed="!group" @click="group = ''">All</button>
      <button v-for="g in groups" :key="g" :aria-pressed="group === g" @click="group = group === g ? '' : g">{{ g }}</button>
    </div>
    <div class="picker-filters custom-stat-pills"><button v-for="s in choices" :key="s.id" :aria-pressed="selected.some(r => r.id === s.id)" @click="toggle(s)">{{ s.label }}</button></div>
    <p v-if="!choices.length" class="muted">No matching modifiers. You can add other stat lines under "Other stat lines".</p>
    </section>
    </div>
    <button class="btn gold custom-equip" :disabled="!preview || !valid" @click="emit('pick', item)">Equip custom item</button>
  </div>
</template>
