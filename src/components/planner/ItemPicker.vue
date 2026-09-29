<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import Icon from "../AppIcon.vue";
import ItemIcon from "./ItemIcon.vue";
import HoverCard from "./HoverCard.vue";
import CustomItemBuilder from "./CustomItemBuilder.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { SLOTS } from "../../planner/items.js";
import { MERC_SLOTS } from "../../planner/mercs.js";

// mode "slot": gear for props.slot · "socket": gems, runes, jewels · "inventory": charms and relics
// · "merc": the mercenary's props.slot, limited to the item types its act can wear (mercs.js)
const props = defineProps({
  mode: { type: String, default: "slot" },
  slot: { type: String, default: "" },
  slotType: { type: String, default: "" },
});
const emit = defineEmits(["pick", "close"]);
const { catalog, engine, state, build, profileSummary, recommendLater, tipOn, emptySockets, mercSlotCats } = usePlanner();
const merc = props.mode === "merc";
const mercCatsFor = computed(() => (merc ? mercSlotCats(props.slot) || [] : []));
const RIMG = catalog.images;

const dialog = ref(null);
const search = ref(null);
const q = ref("");
// Gear slots open on "Best for build" once the build has skills to go on.
const kind = ref(props.mode === "slot" && !profileSummary.value.empty ? "best" : "");
const usable = ref(true);
const limit = ref(80);
const runeword = ref(null);

const slotDef = computed(() => (merc ? MERC_SLOTS : SLOTS).find((s) => s.id === props.slot));
// Socket mode: recently used socketables, and filling every empty socket at once.
const recent = computed(() =>
  props.mode === "socket" ? state.recentSockets.map((r) => catalog.get(r)).filter((d) => d && !(usable.value && reqOf(d) > build.value.level)) : [],
);
const otherEmpty = computed(() =>
  props.mode === "socket" ? emptySockets(props.slot).filter((i) => i !== state.picker?.index).length : 0,
);
const fillAll = ref(false);
const title = computed(() =>
  props.mode === "socket" ? "Fill socket" : props.mode === "inventory" ? "Add a charm or relic" : merc ? `Mercenary's ${slotDef.value?.label.toLowerCase()}` : `Choose ${slotDef.value?.label.toLowerCase()}`,
);
const KINDS = computed(() =>
  props.mode === "socket"
    ? [["", "All"], ["Gems", "Gems"], ["runes", "Runes"], ["jewel", "Jewels"]]
    : props.mode === "inventory"
      ? [["", "All"], ["charm", "Charms"], ["relic", "Relics"]]
      : merc
        ? [["", "All"], ["unique", "Tiered uniques"], ["sacred", "Sacred uniques"], ["set", "Sets"], ["runeword", "Runewords"], ["base", "Base items"]]
        : [...(profileSummary.value.empty ? [] : [["best", "Best for build"]]), ["", "All"], ["unique", "Tiered uniques"], ["sacred", "Sacred uniques"], ["set", "Sets"], ["runeword", "Runewords"], ["base", "Base items"], ["custom", "Custom"]],
);
const carried = computed(() => new Set((build.value.inventory || []).map((x) => x.ref)));
const relicsFull = computed(() => (build.value.inventory || []).filter((x) => catalog.get(x.ref)?.kind === "relic").length >= 3);
const reqOf = (d) => {
  const lines = d.variants ? d.variants[0].lines : [];
  const l = lines.find((x) => /^Required Level: /.test(x));
  return d.kind === "runeword" ? d.lvl : d.kind === "socketable" ? d.lvl : l ? parseInt(l.split(": ")[1], 10) || 0 : 0;
};
const pool = computed(() => {
  if (props.mode === "socket") return [...catalog.socketables(), ...catalog.jewels()];
  // Charms and relics not carried yet (one of each), and relics only while fewer than 3 are
  // (usePlanner addInventory refuses the rest).
  if (props.mode === "inventory") return catalog.all().filter((d) => (d.kind === "charm" || (d.kind === "relic" && !relicsFull.value)) && !carried.value.has(d.key));
  if (merc) {
    const cats = mercCatsFor.value;
    return catalog.all().filter((d) =>
      d.kind === "runeword" ? catalog.runewordBases(d).some((b) => cats.includes(b.cat)) : ["base", "unique", "sacred", "set"].includes(d.kind) && cats.includes(d.cat));
  }
  return catalog.forSlot(props.slot, state.cls);
});
const list = computed(() => {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
  return pool.value.filter((d) => {
    if (kind.value === "runes" ? !(d.kind === "socketable" && d.kindLabel !== "Gems") : kind.value === "Gems" ? d.kindLabel !== "Gems" : kind.value === "jewel" ? d.slotType !== "jewel" : kind.value && d.kind !== kind.value)
      return false;
    if (usable.value && reqOf(d) > build.value.level) return false;
    return words.every((w) => d.search.includes(w));
  });
});
const bases = computed(() =>
  runeword.value && slotDef.value
    ? catalog.runewordBases(runeword.value).filter((b) => (merc ? mercCatsFor.value.includes(b.cat) : catalog.fitsSlot(b, props.slot, state.cls)))
    : [],
);

// Best variant (tier) the character can use at their level.
function bestVariant(d) {
  let best = 0;
  (d.variants || []).forEach((v, i) => {
    const l = v.lines.find((x) => /^Required Level: /.test(x));
    if (!l || parseInt(l.split(": ")[1], 10) <= build.value.level) best = i;
  });
  return best;
}
// Scored suggestions for this slot (only when that filter is on). They are worked out in
// the background, so the picker opens at once; null until ready.
const recs = computed(() => (kind.value === "best" ? recommendLater(props.slot, 60) : []));
const recList = computed(() => {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
  return (recs.value || []).filter((x) => words.every((w) => x.def.search.includes(w)));
});
function choose(d) {
  if (d.kind === "runeword") return (runeword.value = d);
  if (props.mode === "socket") return emit("pick", { ref: d.key, fillAll: fillAll.value && otherEmpty.value > 0 });
  emit("pick", { ref: d.key, variant: bestVariant(d) });
}
function chooseBase(b) {
  // The highest tier with enough sockets for the runes.
  const need = runeword.value.runes.length;
  let v = b.variants.length - 1;
  while (v > 0 && !(b.variants[v].lines.some((l) => new RegExp(`^Socketed \\(([${need}-9])\\)`).test(l)))) v--;
  emit("pick", { ref: runeword.value.key, base: b.key, baseVariant: bestVariant(b) >= v ? bestVariant(b) : v });
}
function close() {
  emit("close");
}
onMounted(async () => {
  dialog.value?.showModal?.();
  await nextTick();
  search.value?.focus();
});
</script>
<template>
  <dialog
    ref="dialog"
    class="item-picker"
    :class="{ 'custom-item-modal': kind === 'custom' }"
    aria-labelledby="picker-title"
    @cancel.prevent="close"
    @click="(e) => e.target === dialog && close()"
  >
    <div class="picker-content">
      <div class="drawer-header">
        <div>
          <div class="eyebrow">{{ state.cls }} · level {{ build.level }}</div>
          <h2 id="picker-title">{{ runeword ? `${runeword.name}: choose a base` : title }}</h2>
        </div>
        <button class="icon-btn" aria-label="Close" @click="close"><Icon name="close" /></button>
      </div>

      <template v-if="runeword">
        <p class="muted">
          {{ runeword.runes.join(" · ") }} · needs {{ runeword.runes.length }} sockets. Runeword stats already include its
          runes.
        </p>
        <button class="text-btn" @click="runeword = null">← Back to the list</button>
        <ul class="picker-list">
          <li v-for="b in bases" :key="b.key">
            <button @click="chooseBase(b)">
              <ItemIcon :icon="b.icon" /><span
                ><b>{{ b.name }}</b><small>{{ b.cat }}</small></span
              >
            </button>
          </li>
        </ul>
      </template>

      <template v-else-if="kind === 'custom'">
        <div class="picker-filters">
          <button v-for="[k, label] in KINDS" :aria-pressed="kind === k" @click="kind = k">{{ label }}</button>
        </div>
        <CustomItemBuilder :slot="props.slot" @pick="emit('pick', $event)" />
      </template>

      <template v-else>
        <label class="search"
          ><Icon name="search" /><input ref="search" v-model="q" type="search" placeholder="Search name, base or stat" aria-label="Search items"
        /></label>
        <div class="picker-filters">
          <button v-for="[k, label] in KINDS" :aria-pressed="kind === k" @click="kind = k; limit = 80">{{ label }}</button>
          <label class="switch"
            ><input type="checkbox" v-model="usable" />Usable at level {{ build.level }}</label
          >
        </div>
        <label v-if="otherEmpty" class="switch fill-all"
          ><input type="checkbox" v-model="fillAll" />Also fill the other {{ otherEmpty }} empty socket{{ otherEmpty > 1 ? "s" : "" }}</label
        >
        <div v-if="recent.length && !q" class="recent-sockets">
          <p class="eyebrow">Recently used</p>
          <ul class="picker-list compact">
            <li v-for="d in recent" :key="d.key">
              <button @click="choose(d)">
                <ItemIcon :icon="d.icon" :src="d.img ? RIMG[d.img] : ''" /><span
                  ><b :class="'q-' + d.kind">{{ d.name }}</b><small>{{ d.kindLabel }}</small></span
                >
              </button>
            </li>
          </ul>
        </div>
        <template v-if="kind === 'best'">
          <p class="muted" aria-live="polite">
            Ranked for your {{ profileSummary.roles.map((r) => r.name).join(" and ") || "build" }}
            <template v-if="profileSummary.elements.length">
              ({{ profileSummary.elements.map((e) => e.name).join(", ") }})</template
            ><template v-if="profileSummary.weapon"> · needs a {{ profileSummary.weapon }}</template
            ><template v-if="profileSummary.scalesWith.length"> · scales with {{ profileSummary.scalesWith.join(", ") }}</template
            ><template v-if="profileSummary.synergySkills.length"> · synergy: {{ profileSummary.synergySkills.map((id) => engine.skillName(id)).join(", ") }}</template>. Items you can use at
            level {{ build.level }} with your current attributes, at their best rolls. Suggestions, not a damage simulation.
          </p>
          <ul class="picker-list recs">
            <li v-for="x in recList" :key="x.def.key">
              <button v-on="tipOn({ kind: 'item', item: x.state })" @click="emit('pick', { ...x.state, suggested: true })">
                <ItemIcon :icon="x.def.icon" /><span
                  ><b :class="'q-' + x.def.kind">{{ x.def.name }}</b
                  ><small>{{ x.def.kindLabel }}<template v-if="x.def.base && x.def.base !== x.def.name"> · {{ x.def.base }}</template></small
                  ><small class="rec-reasons">{{ x.reasons.join(" · ") }}</small
                  ><small v-if="x.warnings.length" class="warning">{{ x.warnings.join(", ") }}</small></span
                >
              </button>
            </li>
          </ul>
          <p v-if="!recs" class="muted suggest-pending" aria-busy="true">Comparing {{ props.slot.startsWith("weapon") ? "weapons" : "items" }} for your build…</p>
          <p v-else-if="!recList.length" class="muted">Nothing suits this build here yet. Try "All".</p>
        </template>
        <template v-else>
        <p class="muted" aria-live="polite">{{ list.length }} items<template v-if="mode === 'inventory' && (carried.size || relicsFull)"> · the ones you carry are left out<template v-if="relicsFull">, and relics: you carry 3, the most allowed</template></template></p>
        <ul class="picker-list">
          <li v-for="d in list.slice(0, limit)" :key="d.key">
            <button v-on="d.variants ? tipOn({ kind: 'item', item: { ref: d.key, variant: bestVariant(d) } }) : {}" @click="choose(d)">
              <ItemIcon :icon="d.icon" :src="d.img ? RIMG[d.img] : ''" /><span
                ><b :class="'q-' + d.kind">{{ d.name }}</b
                ><small>{{ d.kindLabel }}<template v-if="d.base && d.base !== d.name"> · {{ d.base }}</template
                  ><template v-if="reqOf(d)"> · lvl {{ reqOf(d) }}</template></small
                ></span
              >
            </button>
          </li>
        </ul>
        <button v-if="list.length > limit" class="btn" @click="limit += 120">Show more</button>
        </template>
      </template>
    </div>
    <HoverCard />
  </dialog>
</template>
