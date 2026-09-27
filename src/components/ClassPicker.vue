<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount, useId } from 'vue';
import Icon from './AppIcon.vue';
const props = defineProps({ modelValue: { type: String, default: '' }, classes: { type: Array, required: true }, anyLabel: String, otherLabel: String, label: { type: String, default: 'Character class' } });
const emit = defineEmits(['update:modelValue']);
const prefixes = { Amazon: 'ama', Assassin: 'ass', Barbarian: 'bar', Druid: 'dru', Necromancer: 'nec', Paladin: 'pal', Sorceress: 'sor' };
// Each class's portrait (MedianDB portraits/<Class>/1.gif, saved by import-skills). Not the
// class-*.webp files: those are whole skill-icon sheets.
const image = name => prefixes[name] ? `${import.meta.env.BASE_URL}planner/portraits/${prefixes[name]}.gif?v=${__BUILD_ID__}` : null;
const options = computed(() => [...(props.anyLabel ? [{ value: '', label: props.anyLabel }] : []), ...props.classes.map(c => ({ value: c, label: c })), ...(props.otherLabel ? [{ value: '@none', label: props.otherLabel }] : [])]);
const selected = computed(() => options.value.find(o => o.value === props.modelValue));
const root = ref(null), trigger = ref(null), list = ref(null), open = ref(false);
const id = useId();
async function show(last = false) {
  open.value = true; await nextTick();
  const buttons = list.value?.querySelectorAll('[role="option"]');
  const index = last ? options.value.length - 1 : Math.max(0, options.value.findIndex(o => o.value === props.modelValue));
  buttons?.[index]?.focus();
}
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus(); }
function choose(value) { emit('update:modelValue', value); close(true); }
function keys(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
  const buttons = [...(list.value?.querySelectorAll('[role="option"]') || [])];
  const current = buttons.indexOf(document.activeElement);
  let next;
  if (e.key === 'ArrowDown') next = (current + 1) % buttons.length;
  else if (e.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = buttons.length - 1;
  else if (e.key.length === 1 && /[a-z]/i.test(e.key)) next = options.value.findIndex(o => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
  if (next >= 0) { e.preventDefault(); buttons[next]?.focus(); }
}
const outside = e => { if (!root.value?.contains(e.target)) close(); };
onMounted(() => document.addEventListener('pointerdown', outside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
</script>
<template>
  <div ref="root" class="class-picker" @focusout="e => { if (!root.contains(e.relatedTarget)) close(); }">
    <button ref="trigger" type="button" class="class-picker-trigger" :aria-label="`${label}: ${selected?.label || modelValue}`" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="id" @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show(true)">
      <img v-if="image(modelValue)" :src="image(modelValue)" alt="" width="32" height="32" /><Icon v-else name="grid" />
      <span>{{ selected?.label || modelValue }}</span><Icon name="chevron" class="class-picker-chevron" />
    </button>
    <div v-if="open" :id="id" ref="list" role="listbox" :aria-label="label" class="class-picker-options" @keydown="keys">
      <button v-for="o in options" :key="o.value" type="button" role="option" :aria-selected="modelValue === o.value" @click="choose(o.value)">
        <img v-if="image(o.value)" :src="image(o.value)" alt="" width="32" height="32" /><Icon v-else name="grid" /><span>{{ o.label }}</span><span v-if="modelValue === o.value" class="class-picker-check" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>
