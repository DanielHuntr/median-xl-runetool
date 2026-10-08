<script setup>
// A list to choose from that's too long for a plain dropdown (72 corruptions, every mystic orb,
// a base's affixes): closed, it looks like a select; open, it has a filter box and the options
// in groups, each with its stats, and an option that can't be chosen says why. The keyboard
// works as in a combobox: arrows move, Enter chooses, Escape closes, typing filters.
import { ref, computed, nextTick, watch, onBeforeUnmount, useId } from "vue";
import Icon from "./AppIcon.vue";

const props = defineProps({
  // [{ value, label, detail?, group?, disabled?, reason? }]
  options: { type: Array, required: true },
  // The chosen value (shown on the button), or null for an "add" list that always shows its prompt.
  value: { type: [String, Number, null], default: null },
  placeholder: { type: String, default: "Choose…" },
  // A "None" choice at the top, for a list where the choice can be taken away.
  noneLabel: { type: String, default: "" },
  label: { type: String, required: true },
  filterPlaceholder: { type: String, default: "Filter" },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(["choose"]);
const id = useId();
const open = ref(false), query = ref(""), active = ref(-1), up = ref(false);
const root = ref(null), input = ref(null), button = ref(null), list = ref(null);

const chosen = computed(() => props.options.find((o) => o.value === props.value));
const words = computed(() => query.value.toLowerCase().split(/\s+/).filter(Boolean));
const shown = computed(() => {
  const all = [...(props.noneLabel && props.value != null && props.value !== "" ? [{ value: "", label: props.noneLabel, none: true }] : []), ...props.options];
  if (!words.value.length) return all;
  return all.filter((o) => {
    const hay = `${o.label} ${o.detail || ""} ${o.group || ""}`.toLowerCase();
    return words.value.every((w) => hay.includes(w));
  });
});
const pickable = (i) => i >= 0 && i < shown.value.length && !shown.value[i].disabled;
const optionId = (i) => `${id}-o${i}`;

async function show() {
  if (props.disabled) return;
  // Opens upwards when there's more room above than below (a list near the bottom of the editor).
  const r = button.value?.getBoundingClientRect();
  up.value = !!r && innerHeight - r.bottom < 380 && r.top > innerHeight - r.bottom;
  open.value = true;
  query.value = "";
  active.value = Math.max(0, shown.value.findIndex((o) => o.value === props.value));
  if (!pickable(active.value)) active.value = shown.value.findIndex((o, i) => pickable(i));
  await nextTick();
  input.value?.focus();
  scrollActive();
}
function hide(refocus = true) {
  open.value = false;
  if (refocus) button.value?.focus();
}
function choose(o) {
  if (!o || o.disabled) return;
  hide();
  emit("choose", o.value);
}
function move(step) {
  const n = shown.value.length;
  if (!n) return;
  let i = active.value;
  for (let k = 0; k < n; k++) {
    i = (i + step + n) % n;
    if (pickable(i)) break;
  }
  active.value = i;
  scrollActive();
}
function scrollActive() {
  nextTick(() => list.value?.querySelector(`#${CSS.escape(optionId(active.value))}`)?.scrollIntoView({ block: "nearest" }));
}
function onKey(e) {
  if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  else if (e.key === "Enter") { e.preventDefault(); choose(shown.value[active.value]); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
  else if (e.key === "Tab") hide(false);
}
watch(query, () => {
  active.value = shown.value.findIndex((o, i) => pickable(i));
});
// A press outside closes it.
const outside = (e) => { if (!root.value?.contains(e.target)) hide(false); };
watch(open, (on) => (on ? document.addEventListener("pointerdown", outside, true) : document.removeEventListener("pointerdown", outside, true)));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside, true));
// A group's heading goes before its first option shown.
const startsGroup = (i) => shown.value[i].group && shown.value[i].group !== shown.value[i - 1]?.group;
</script>
<template>
  <div ref="root" class="search-select" :class="{ open }">
    <button
      ref="button"
      type="button"
      class="search-select-btn"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="chosen ? `${label}: ${chosen.label}` : label"
      @click="open ? hide() : show()"
      @keydown.down.prevent="show"
    >
      <span class="search-select-value" :class="{ placeholder: !chosen }">{{ chosen ? chosen.label : placeholder }}</span>
      <Icon name="chevron" class="search-select-chevron" />
    </button>
    <div v-if="open" class="search-select-pop" :class="{ up }">
      <label class="search search-select-filter"
        ><Icon name="search" /><input
          ref="input"
          v-model="query"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="true"
          :aria-controls="`${id}-list`"
          :aria-activedescendant="pickable(active) ? optionId(active) : null"
          :aria-label="`Filter ${label.toLowerCase()}`"
          :placeholder="filterPlaceholder"
          @keydown="onKey"
      /></label>
      <ul :id="`${id}-list`" ref="list" class="search-select-list" role="listbox" :aria-label="label">
        <template v-for="(o, i) in shown" :key="o.none ? '__none' : o.value">
          <li v-if="startsGroup(i)" class="search-select-group" role="presentation">{{ o.group }}</li>
          <li
            :id="optionId(i)"
            role="option"
            class="search-select-option"
            :class="{ active: i === active, disabled: o.disabled, none: o.none }"
            :aria-selected="o.value === value"
            :aria-disabled="o.disabled || null"
            @pointerenter="!o.disabled && (active = i)"
            @click="choose(o)"
          >
            <span class="search-select-label">{{ o.label }}<small v-if="o.reason" class="search-select-reason">{{ o.reason }}</small></span>
            <small v-if="o.detail" class="search-select-detail">{{ o.detail }}</small>
          </li>
        </template>
        <li v-if="!shown.length" class="search-select-empty" role="presentation">Nothing matches.</li>
      </ul>
    </div>
  </div>
</template>
