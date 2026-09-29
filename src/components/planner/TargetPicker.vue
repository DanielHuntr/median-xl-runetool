<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { DIFFICULTY_INDEX, TARGET_RULES, distinctTargets, mainTargets } from "../../planner/target.js";
const { state, monsters, target, targetDifficulty } = usePlanner();
const k = computed(() => DIFFICULTY_INDEX[targetDifficulty.value] ?? 2);
const dialog = ref(null), search = ref(null), query = ref(''), difficulty = ref('Hell'), limit = ref(80), scope = ref('main');
const difficulties = ['Normal', 'Nightmare', 'Hell'];
// The target's row in the column, the rest in a pop-out under it: the target's
// resistances, a way to choose another, and how the comparison is worked out. Esc or a click
// elsewhere closes it.
const popOpen = ref(false);
const closePop = (e) => { if (!popOpen.value) return; if (e.type === "keydown" ? e.key === "Escape" : !e.target.closest?.(".target-pop-wrap")) popOpen.value = false; };
onMounted(() => { document.addEventListener("click", closePop); document.addEventListener("keydown", closePop); });
onBeforeUnmount(() => { document.removeEventListener("click", closePop); document.removeEventListener("keydown", closePop); });
const index = computed(() => DIFFICULTY_INDEX[difficulty.value]);
const difficultyTargets = computed(() => distinctTargets(monsters, difficulty.value));
const q = computed(() => query.value.trim().toLowerCase());
// Bosses by default; a search looks through every monster so nothing is out of reach.
const options = computed(() => q.value
  ? difficultyTargets.value.filter(m => m.name.toLowerCase().includes(q.value))
  : scope.value === 'main' ? mainTargets(monsters, difficulty.value) : difficultyTargets.value);
watch([query, difficulty, scope], () => { limit.value = 80; });
async function open() {
  popOpen.value = false;
  difficulty.value = targetDifficulty.value;
  query.value = ''; limit.value = 80;
  dialog.value.showModal();
  await nextTick(); search.value?.focus();
}
function choose(id) {
  state.targetDifficulty = difficulty.value;
  state.target = String(id);
  dialog.value.close();
}
const RES = [["fire", "Fire"], ["cold", "Cold"], ["lightning", "Lightning"], ["poison", "Poison"], ["magic", "Magic"], ["physical", "Physical"]];
const resists = computed(() => (target.value ? RES.map(([e, n]) => ({ e, n, v: target.value.res[e][k.value] })) : []));
</script>
<template>
  <div v-if="target" class="target-picker target-pop-wrap stage-pop-wrap">
    <div class="target-field">
      <span>Damage against</span>
      <button type="button" class="btn target-open" :aria-expanded="popOpen" aria-controls="target-pop" @click="popOpen = !popOpen">{{ target.name }}<span v-if="!target.typical"> &middot; {{ targetDifficulty }}</span><span class="target-caret" aria-hidden="true">{{ popOpen ? " ▴" : " ▾" }}</span></button>
    </div>
    <div v-if="popOpen" id="target-pop" class="stage-pop target-pop" role="dialog" aria-label="Damage target">
      <p class="target-res">
        <span v-for="r in resists" :key="r.e" :class="['el-' + r.e, { immune: r.v >= 100 }]">{{ r.n }} {{ r.v >= 100 ? "immune" : r.v + "%" }}</span>
      </p>
      <button type="button" class="btn target-choose" aria-haspopup="dialog" @click="open">Choose another target <span aria-hidden="true">&rsaquo;</span></button>
      <p v-if="target.typical" class="muted">The median resistances of {{ target.count }} ordinary {{ targetDifficulty }} monsters (bosses left out).</p>
      <p v-for="r in TARGET_RULES" :key="r" class="muted">{{ r }}</p>
    </div>
    <Teleport to="body">
      <dialog ref="dialog" class="item-picker monster-picker" aria-labelledby="monster-picker-title" @click="e => e.target === dialog && dialog.close()">
        <div class="picker-content">
          <div class="drawer-header"><h2 id="monster-picker-title">Choose damage target</h2><button class="icon-btn" aria-label="Close monster picker" @click="dialog.close()">&times;</button></div>
          <div class="picker-filters" aria-label="Target difficulty"><button v-for="d in difficulties" :key="d" :aria-pressed="difficulty === d" @click="difficulty = d">{{ d }}</button></div>
          <div class="picker-filters" aria-label="Monsters to list"><button :aria-pressed="scope === 'main'" @click="scope = 'main'">Bosses</button><button :aria-pressed="scope === 'all'" @click="scope = 'all'">All monsters</button></div>
          <label class="field">Find a monster<input ref="search" v-model="query" type="search" placeholder="Search monsters..." /></label>
          <p class="muted">Target difficulty changes the damage comparison only. <template v-if="scope === 'main' && !q">Showing bosses (as flagged in the game files); search to find any monster.</template></p>
          <ul class="picker-list monster-list">
            <li><button @click="choose('typical')"><span><b>Typical {{ difficulty }} monster</b><small>Median resistances of ordinary monsters</small></span></button></li>
            <li v-for="m in options.slice(0, limit)" :key="m.id"><button @click="choose(m.id)"><span><b>{{ m.name }}</b><small>Level {{ m.levels[index] }}<template v-if="m.boss"> &middot; Boss</template><template v-if="m.undead"> &middot; Undead</template><template v-if="m.versions"> &middot; highest of {{ m.versions }} versions (search to see all)</template></small><span class="target-res"><span v-for="[el, name] in RES" :key="el" :class="'el-' + el">{{ name }} {{ m.res[el][index] >= 100 ? 'immune' : m.res[el][index] + '%' }}</span></span></span></button></li>
          </ul>
          <p v-if="!options.length" class="muted">No monsters match this search in {{ difficulty }}.</p>
          <button v-if="options.length > limit" class="btn" @click="limit += 80">Show more ({{ options.length - limit }} remaining)</button>
        </div>
      </dialog>
    </Teleport>
  </div>
</template>
