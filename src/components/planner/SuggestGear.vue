<script setup>
import { ref, shallowRef, computed, onMounted, watch } from "vue";
import Icon from "../AppIcon.vue";
import ItemIcon from "./ItemIcon.vue";
import HoverCard from "./HoverCard.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { SLOTS, offhandFits } from "../../planner/items.js";
import { activeSlots } from "../../planner/character.js";

const emit = defineEmits(["close"]);
const { state, engine, build, character, profileSummary, recommendLater, equip, refreshGear, applyGearPreview, suggestionFingerprint, tipOn, enhance } = usePlanner();
// The options panel's one-line summary: which options are on.
const optionSummary = computed(() => {
  const on = [
    state.suggestAttributes && (state.allowAttributeRespec ? "Attributes (respec)" : "Attributes"),
    state.suggestSuperior && "Superior bases",
    state.suggestEnhancements && (state.includeUniqueOrbs ? "Orbs (incl. rare) and sockets" : "Orbs and sockets"),
  ].filter(Boolean);
  return on.length ? on.join(" · ") : "all off";
});
const dialog = ref(null);
const preview = shallowRef(null);
const busy = ref(false);
const attributes = ['strength', 'dexterity', 'vitality', 'energy'];
watch(suggestionFingerprint, () => { preview.value = null; });
onMounted(() => dialog.value?.showModal?.());

// Top picks for each slot the character is using now (the active weapon set). They are
// worked out in the background, so the dialog opens at once; recs is null until ready.
// The same item as the one worn: same catalogue entry, base (for a runeword) and quality.
// A superior version of what's worn is a suggestion of its own.
const isCurrent = (r, x) => {
  const worn = build.value.gear[r.id];
  return !!r.current && x.state.ref === worn?.ref && (!x.state.base || x.state.base === worn?.base) && (x.state.superior ?? null) === (worn?.superior ?? null);
};
const rows = computed(() =>
  activeSlots(build.value)
    .filter((id) => !id.startsWith("offhand") || offhandFits(character.value.weapon))
    .map((id) => ({
      id,
      label: SLOTS.find((s) => s.id === id).label,
      // What's worn now, marked on its row (or listed first when it isn't a suggestion).
      current: character.value.equipped[id] || null,
      recs: recommendLater(id, 3),
    })),
);
async function refresh() {
  busy.value = true;
  preview.value = null;
  await new Promise(resolve => setTimeout(resolve, 20));
  try { preview.value = refreshGear({ preview: true }) || null; }
  finally { busy.value = false; }
}
function apply() {
  if (applyGearPreview(preview.value)) emit('close');
}
function take(slot, rec) {
  equip(slot, rec.state);
  if (state.suggestEnhancements) enhance(slot);
  state.slot = slot;
}
</script>
<template>
  <dialog
    ref="dialog"
    class="item-picker suggest"
    aria-labelledby="suggest-title"
    @cancel.prevent="emit('close')"
    @click="(e) => e.target === dialog && emit('close')"
  >
    <div class="picker-content">
      <div class="drawer-header">
        <div>
          <div class="eyebrow">{{ state.cls }} · level {{ build.level }}</div>
          <h2 id="suggest-title">Suggested gear</h2>
        </div>
        <button class="icon-btn" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
      </div>

      <p v-if="profileSummary.empty" class="muted">
        Spend some skill points first. Suggestions are based on the skills you choose.
      </p>
      <template v-else>
        <div class="profile-summary">
          <span v-for="r in profileSummary.roles" class="profile-chip">{{ r.name }} {{ r.pct }}%</span>
          <span v-for="e in profileSummary.elements" class="profile-chip" :class="'el-' + e.name">{{ e.name }} {{ e.pct }}%</span>
          <span v-if="profileSummary.weapon" class="profile-chip plain">needs a {{ profileSummary.weapon }}</span>
          <span v-if="profileSummary.scalesWith.length" class="profile-chip plain">scales with {{ profileSummary.scalesWith.join(", ") }}</span>
          <span v-if="profileSummary.synergySkills.length" class="profile-chip plain"
            >synergy: {{ profileSummary.synergySkills.map((id) => engine.skillName(id)).join(", ") }}</span
          >
        </div>
        <p class="muted">
          Compares damage, survivability and life recovery with each item equipped. Items must fit your level and attributes; speed and enemy defenses are estimates.
        </p>
        <!-- Options, closed by default; the summary line says which are on. -->
        <details class="suggest-options">
          <summary>Options <span class="muted">{{ optionSummary }}</span></summary>
          <div class="suggest-option-grid">
            <label class="switch"><input type="checkbox" role="switch" v-model="state.suggestAttributes" :disabled="busy" aria-describedby="opt-attrs" />Suggest attributes</label>
            <small id="opt-attrs" class="muted">Spend unspent points on requirements, then damage and survival.</small>
            <label class="switch" :class="{ 'option-disabled': !state.suggestAttributes }"><input type="checkbox" role="switch" v-model="state.allowAttributeRespec" :disabled="!state.suggestAttributes || busy" aria-describedby="opt-respec" />Allow respec</label>
            <small id="opt-respec" class="muted">Redistribute all points, not just unspent ones.</small>
            <label class="switch"><input type="checkbox" role="switch" v-model="state.suggestSuperior" aria-describedby="opt-superior" />Superior runeword bases</label>
            <small id="opt-superior" class="muted">Adds the base's Superior bonus (game files). Assumes it works as in Diablo II.</small>
            <label class="switch"><input type="checkbox" role="switch" v-model="state.suggestEnhancements" aria-describedby="enhancement-help" />Orbs and sockets</label>
            <small id="enhancement-help" class="muted">Fill suggested items with mystic orbs and socket fillers.</small>
            <label class="switch" :class="{ 'option-disabled': !state.suggestEnhancements }"><input type="checkbox" role="switch" v-model="state.includeUniqueOrbs" :disabled="!state.suggestEnhancements" aria-describedby="opt-unique" />Rare unique orbs</label>
            <small id="opt-unique" class="muted">Also use the rare unique mystic orbs.</small>
          </div>
        </details>
        <div class="suggest-actions"><button class="btn gold" :disabled="busy" @click="refresh">{{ busy ? 'Calculating suggestions…' : 'Preview suggested build' }}</button></div>
        <p class="muted suggest-note">You review the changes before applying. It replaces the active weapon set and armour; slots with nothing suitable are left empty.</p>
        <section v-if="preview" class="suggest-preview" aria-live="polite">
          <h3>Proposed build</h3>
          <table class="attribute-preview">
            <thead><tr><th>Assigned points</th><th>Current</th><th>Suggested</th><th>Final attribute</th></tr></thead>
            <tbody><tr v-for="a in attributes" :key="a"><th>{{ a }}</th><td>{{ build.attrs[a] || 0 }}</td><td>{{ preview.attrs[a] || 0 }}</td><td>{{ preview.character.attributes[a].total }}</td></tr></tbody>
          </table>
          <p class="muted">{{ preview.character.statPoints.spent }} / {{ preview.character.statPoints.available }} points allocated. Remaining points are compared in small batches using estimated damage and survivability.</p>
          <ul class="suggested-equipment">
            <li v-for="slot in activeSlots(build)" :key="slot"><b>{{ SLOTS.find(s => s.id === slot)?.label }}:</b> {{ character.equipped[slot]?.def.name || 'Empty' }} → {{ preview.character.equipped[slot]?.def.name || 'Empty' }}
              <small v-if="preview.gear[slot]" class="muted"> · requires level {{ preview.character.equipped[slot]?.head.reqLevel || 1 }} · {{ preview.gear[slot].orbs?.length || 0 }} orbs · {{ preview.gear[slot].sockets?.filter(Boolean).length || 0 }} socket fillers</small>
            </li>
          </ul>
          <div class="suggest-actions"><button class="btn gold" @click="apply">Apply gear and attributes</button><button class="btn" @click="preview = null">Discard preview</button></div>
        </section>

        <h3>Individual replacements</h3>
        <p class="muted">These items fit your current attributes. Use the build preview above to include a new attribute allocation.</p>
        <section v-for="r in rows" :key="r.id" class="suggest-slot">
          <h3>{{ r.label }}</h3>
          <p v-if="!r.recs" class="muted suggest-pending" aria-busy="true">Comparing {{ r.id.startsWith('weapon') ? 'weapons' : 'items' }} for your build…</p>
          <p v-else-if="!r.recs.length" class="muted">No suitable items meet your current level and attribute requirements.</p>
          <ul v-if="r.recs" class="picker-list recs">
            <li v-if="r.current && !r.recs.some((x) => isCurrent(r, x))" class="rec-current">
              <div v-on="tipOn({ kind: 'item', item: build.gear[r.id] })" tabindex="0">
                <ItemIcon :icon="r.current.def.icon" /><span
                  ><b :class="'q-' + r.current.def.kind">{{ r.current.def.name }}</b
                  ><small>{{ r.current.def.kindLabel }}<template v-if="r.current.def.base && r.current.def.base !== r.current.def.name"> · {{ r.current.def.base }}</template></small></span
                ><em class="rec-tag">Currently equipped</em>
              </div>
            </li>
            <li v-for="x in r.recs" :key="x.def.key" :class="{ 'rec-current': isCurrent(r, x) }">
              <button v-on="tipOn({ kind: 'item', item: x.state })" @click="take(r.id, x)">
                <ItemIcon :icon="x.def.icon" /><span
                  ><b :class="'q-' + x.def.kind">{{ x.def.name }}</b
                  ><small>{{ x.def.kindLabel }}<template v-if="x.def.base && x.def.base !== x.def.name"> · {{ x.def.base }}</template></small
                  ><small class="rec-reasons">{{ x.reasons.join(" · ") }}</small
                  ><small v-if="x.warnings.length" class="warning">{{ x.warnings.join(", ") }}</small></span
                ><em v-if="isCurrent(r, x)" class="rec-tag">Currently equipped</em><em v-else class="rec-equip">Equip</em>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </div>
    <HoverCard />
  </dialog>
</template>
