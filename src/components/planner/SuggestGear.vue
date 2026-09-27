<script setup>
import { ref, shallowRef, computed, onMounted, watch } from "vue";
import Icon from "../AppIcon.vue";
import ItemIcon from "./ItemIcon.vue";
import HoverCard from "./HoverCard.vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { SLOTS } from "../../planner/items.js";
import { activeSlots } from "../../planner/character.js";

const emit = defineEmits(["close"]);
const { state, engine, build, character, profileSummary, recommendLater, equip, refreshGear, applyGearPreview, suggestionFingerprint, tipOn, enhance } = usePlanner();
const dialog = ref(null);
const preview = shallowRef(null);
const busy = ref(false);
const attributes = ['strength', 'dexterity', 'vitality', 'energy'];
watch(suggestionFingerprint, () => { preview.value = null; });
onMounted(() => dialog.value?.showModal?.());

// Top picks for each slot the character is using now (the active weapon set). They are
// worked out in the background, so the dialog opens at once; recs is null until ready.
const rows = computed(() =>
  activeSlots(build.value)
    .filter((id) => !id.startsWith("offhand") || !character.value.weapon?.twoHanded)
    .map((id) => ({
      id,
      label: SLOTS.find((s) => s.id === id).label,
      current: character.value.equipped[id]?.def.name || null,
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
          Compares your build's damage, survivability and life recovery with each item equipped, including combinations such as attack speed and life on hit.
          Items must fit your level and attributes without making other equipment unusable. Speed and enemy defenses are estimates, not an exact DPS simulation.
        </p>
        <div class="suggest-options">
          <label class="switch"><input type="checkbox" role="switch" v-model="state.suggestAttributes" :disabled="busy" />Suggest attribute allocation</label>
          <p class="muted">Use unspent points from your level, completed quests and consumed signets to meet equipment requirements, then compare damage and survivability for the remaining points.</p>
          <label class="switch" :class="{ 'option-disabled': !state.suggestAttributes }"><input type="checkbox" role="switch" v-model="state.allowAttributeRespec" :disabled="!state.suggestAttributes || busy" />Allow attribute respec</label>
          <p class="muted">Respec allows a complete redistribution. Otherwise, points you have already assigned are preserved.</p>
          <label class="switch"><input type="checkbox" role="switch" v-model="state.suggestEnhancements" aria-describedby="enhancement-help" />Suggest orbs and empty sockets</label>
          <p id="enhancement-help" class="muted">Choose suitable orbs and socket fillers for the newly suggested equipment.</p>
          <label class="switch" :class="{ 'option-disabled': !state.suggestEnhancements }"><input type="checkbox" role="switch" v-model="state.includeUniqueOrbs" :disabled="!state.suggestEnhancements" />Include rare unique mystic orbs</label>
        </div>
        <div class="suggest-actions"><button class="btn gold" :disabled="busy" @click="refresh">{{ busy ? 'Calculating suggestions…' : 'Preview suggested build' }}</button></div>
        <p class="muted">Review changes before applying. Suggestions replace the active weapon set and shared armor. Slots without a suitable item are left empty.</p>
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
          <h3>
            {{ r.label }}<small v-if="r.current"> · wearing {{ r.current }}</small>
          </h3>
          <p v-if="!r.recs" class="muted suggest-pending" aria-busy="true">Comparing {{ r.id.startsWith('weapon') ? 'weapons' : 'items' }} for your build…</p>
          <p v-else-if="!r.recs.length" class="muted">No suitable items meet your current level and attribute requirements.</p>
          <ul v-if="r.recs" class="picker-list recs">
            <li v-for="x in r.recs" :key="x.def.key">
              <button v-on="tipOn({ kind: 'item', item: x.state })" @click="take(r.id, x)">
                <ItemIcon :icon="x.def.icon" /><span
                  ><b :class="'q-' + x.def.kind">{{ x.def.name }}</b
                  ><small>{{ x.def.kindLabel }}<template v-if="x.def.base && x.def.base !== x.def.name"> · {{ x.def.base }}</template></small
                  ><small class="rec-reasons">{{ x.reasons.join(" · ") }}</small
                  ><small v-if="x.warnings.length" class="warning">{{ x.warnings.join(", ") }}</small></span
                ><em class="rec-equip">Equip</em>
              </button>
            </li>
          </ul>
        </section>
      </template>
    </div>
    <HoverCard />
  </dialog>
</template>
