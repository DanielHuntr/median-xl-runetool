<script setup>
// The quests that give skill points, stat points, life or signets, per difficulty: ticked once
// the character reaches the level they're usually done at, each one changeable. Opened from the
// Quests button on the stage row (CharacterPlanner.vue).
import { ref, onMounted } from "vue";
import { usePlanner } from "../../planner/usePlanner.js";
import { SKILL_QUESTS, DIFFICULTIES as QUEST_DIFFS } from "../../planner/engine.js";
import { OTHER_QUESTS, otherQuestDone } from "../../planner/character.js";
const emit = defineEmits(["close"]);
const { engine, build, toggleQuest, resetQuests } = usePlanner();
const dialog = ref(null);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
onMounted(() => dialog.value?.showModal?.());
function close() {
  dialog.value?.close();
  emit("close");
}
</script>
<template>
  <dialog ref="dialog" class="item-picker quests-dialog" aria-labelledby="quests-title" @close="emit('close')" @click="(e) => e.target === dialog && close()">
    <div class="picker-content planner-quests">
      <div class="drawer-header">
        <h2 id="quests-title">Quests</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="close">&times;</button>
      </div>
      <p class="muted">Quests count as done once you reach the level they're usually finished at. Untick any you haven't done.</p>
      <table>
        <thead>
          <tr>
            <th>Quest</th>
            <th v-for="d in QUEST_DIFFS" :key="d">{{ cap(d) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="q in SKILL_QUESTS" :key="q[0]">
            <th scope="row">{{ q[1] }}</th>
            <td v-for="d in QUEST_DIFFS" :key="d">
              <label v-if="q[2][d]" class="quest-check"
                ><input
                  type="checkbox"
                  :checked="engine.questDone(build, q[0], d)"
                  :aria-label="`${q[1]}, ${d}: +${q[2][d][0]} skill points`"
                  @change="toggleQuest(q[0], d, $event.target.checked)"
                />+{{ q[2][d][0] }} skill</label
              >
            </td>
          </tr>
          <tr v-for="q in OTHER_QUESTS" :key="q[0]">
            <th scope="row">{{ q[1] }}</th>
            <td v-for="d in QUEST_DIFFS" :key="d">
              <label v-if="q[3][d]" class="quest-check"
                ><input
                  type="checkbox"
                  :checked="otherQuestDone(build, q[0], d)"
                  :aria-label="`${q[1]}, ${d}`"
                  @change="toggleQuest(q[0], d, $event.target.checked)"
                />+{{ q[3][d][0] }} {{ q[2] === "stat_points" ? "stat" : q[2] === "flat_life" ? "life" : "signets" }}</label
              >
            </td>
          </tr>
        </tbody>
      </table>
      <button v-if="Object.keys(build.quests || {}).length" class="text-btn" @click="resetQuests()">Go back to level-based quests</button>
    </div>
  </dialog>
</template>
