<script setup>
import ClassPicker from "../ClassPicker.vue";
import { ref, shallowRef, provide, computed, onMounted, onBeforeUnmount } from "vue";
import Icon from "../AppIcon.vue";
import SkillIcon from "./SkillIcon.vue";
import AttributesPanel from "./AttributesPanel.vue";
import EquipmentPanel from "./EquipmentPanel.vue";
import SkillsPanel from "./SkillsPanel.vue";
import SkillDetail from "./SkillDetail.vue";
import ItemEditorModal from "./ItemEditorModal.vue";
import ItemPicker from "./ItemPicker.vue";
import StatsPanel from "./StatsPanel.vue";
import HoverCard from "./HoverCard.vue";
import SkillChooser from "./SkillChooser.vue";
import SaveBuildDialog from "./SaveBuildDialog.vue";
import { createEngine, SKILL_QUESTS, DIFFICULTIES as QUEST_DIFFS, MAX_LEVEL } from "../../planner/engine.js";
import { createCatalog } from "../../planner/items.js";
import { createPlanner, PlannerKey, STAGES, STAGE_START } from "../../planner/usePlanner.js";
import { areasNear, gearCats, runewordsBetween } from "../../levelling.js";
import { OTHER_QUESTS, otherQuestDone } from "../../planner/character.js";
import { DIFFICULTIES } from "../../planner/rules.js";
import { TUD, SUD, SETD, RW, BASED, SOCKD, RIMG, fitsBase } from "../../data/index.js";
import "../../assets/planner.css";

// The planner's skill data and icons (~2.5 MB with artwork) load only when this page opens.
const props = defineProps({ data: { type: Object, default: null } });
const planner = shallowRef(null);
const error = ref("");
const copied = ref(false);
const saving = ref(false);
const proxy = {};
provide(PlannerKey, proxy);

function start(data) {
  const catalog = createCatalog({ TUD, SUD, SETD, RW, BASED, SOCKD, RIMG }, data);
  Object.assign(proxy, createPlanner(createEngine(data), catalog, data));
  proxy.source = data.source;
  proxy.gameVersion = data.gameVersion;
  proxy.game = data.game || null;
  proxy.importFromHash();
  planner.value = proxy;
  fillPresetStages();
}
// A starter build opened from the Builds page (&preset=<id>) brings its levelling guide's
// stages (scripts/build-presets.mjs): level 50 as Normal, 100 as Nightmare, 125 as Hell.
async function fillPresetStages(hash = window.location.hash) {
  const id = /[?&]preset=([a-z0-9-]+)/.exec(hash)?.[1];
  if (!id || !planner.value) return;
  const cls = planner.value.state.cls;
  const list = (await import("../../data/preset-stages.json")).default.stages?.[id] || [];
  const at = (level) => list.find((s) => s.level === level && s.build)?.build;
  planner.value.fillStages(cls, { Normal: at(50), Nightmare: at(100), Hell: at(125) });
}

// Levelling stages: which exist, and for the one being edited where to level and the
// runewords new since the stage before (src/levelling.js; areas from levels.bin).
const areas = shallowRef(null);
import("../../data/areas.json").then((m) => (areas.value = m.default.areas)).catch(() => {});
const stageName = computed(() => planner.value?.state.stage[planner.value.state.cls] ?? "Endgame");
const stageTip = (name) => {
  const [level, diff] = STAGE_START[name] || [];
  const filled = planner.value.stageFilled(name);
  return name === "Endgame" ? `The finished build${filled ? "" : " (empty)"}` : `From level ${level}, ${diff}${filled ? "" : " (empty: starts at that level)"}`;
};
const stageHelp = computed(() => {
  const p = planner.value;
  if (!p) return null;
  const b = p.build.value, name = stageName.value;
  const copyFrom = STAGES.filter((n) => n !== name && p.stageFilled(n));
  const empty = !Object.keys(b.points).length && !Object.keys(b.gear).length;
  const i = STAGES.indexOf(name);
  const prevLevel = i > 0 ? (STAGE_START[STAGES[i - 1]]?.[0] ?? 0) : 0;
  const c = { TUD, SUD, SETD, BASED };
  const cats = gearCats(b.gear, c);
  return {
    empty, copyFrom,
    areas: areas.value ? areasNear(areas.value, b.level, b.difficulty, 4) : [],
    runewords: runewordsBetween(RW, fitsBase, cats, name === "Endgame" ? 0 : prevLevel, b.level).slice(0, 6),
    cats, prevLevel,
  };
});
async function load() {
  error.value = "";
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}planner/data.json?v=${__BUILD_ID__}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    start(await res.json());
  } catch (e) {
    error.value = String(e.message || e);
  }
}
if (props.data) start(props.data);
const onHash = () => {
  planner.value?.importFromHash();
  fillPresetStages();
};
onMounted(() => {
  if (!props.data) load();
  window.addEventListener("hashchange", onHash);
});
onBeforeUnmount(() => window.removeEventListener("hashchange", onHash));

async function share() {
  const url = planner.value.shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2500);
  } catch {
    window.prompt("Copy this link to share your build:", url);
  }
}
function confirmReset() {
  if (window.confirm(`Clear your ${planner.value.state.cls} character (skills, stats and gear, every stage)?`)) planner.value.reset();
}
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "unknown date");
const cap = (s) => s[0].toUpperCase() + s.slice(1);
</script>
<template>
  <section aria-label="Character planner" class="planner">
    <div v-if="!planner" class="empty">
      <template v-if="error">
        <h2>The planner data didn't load.</h2>
        <p>{{ error }}</p>
        <button class="btn" @click="load">Try again</button>
      </template>
      <p v-else role="status">Loading planner data…</p>
    </div>
    <template v-else>
      <div class="toolbar planner-toolbar">
        <ClassPicker :model-value="planner.state.cls" :classes="planner.engine.classNames" label="Class" @update:model-value="planner.setClass" /><label class="level"
          >Level
          <input
            type="number"
            min="1"
            :max="MAX_LEVEL"
            :value="planner.build.value.level"
            @change="planner.setLevel($event.target.value)"
            aria-label="Character level"
        /></label>
        <label class="field-inline"
          >Difficulty
          <select :value="planner.build.value.difficulty" @change="planner.setDifficulty($event.target.value)">
            <option v-for="d in DIFFICULTIES">{{ d }}</option>
          </select></label
        >
        <label class="switch"><input type="checkbox" v-model="planner.state.autoLevel" />Raise level automatically</label>
        <div class="planner-actions">
          <button
            class="btn"
            :class="{ active: planner.state.statsOpen }"
            :aria-pressed="planner.state.statsOpen"
            :aria-controls="planner.state.statsOpen ? 'stats-panel' : null"
            @click="planner.toggleStats()"
          >
            <Icon name="panel" />Stats
          </button>
          <button class="btn" @click="saving = true"><Icon name="save" />Save build</button>
          <button class="btn" @click="share">
            <Icon :name="copied ? 'check' : 'link'" />{{ copied ? "Link copied" : "Share build" }}
          </button>
          <button class="btn" @click="confirmReset"><Icon name="close" />Reset</button>
        </div>
      </div>

      <div class="planner-stages">
        <div class="stage-switch" role="group" aria-label="Levelling stage">
          <span class="stage-label">Stage</span>
          <button
            v-for="n in STAGES"
            :key="n"
            type="button"
            :aria-pressed="stageName === n"
            :class="{ filled: planner.stageFilled(n) }"
            :data-tip="stageTip(n)"
            @click="planner.setStage(n)"
          >{{ n }}</button>
        </div>
        <p v-if="stageHelp?.empty && stageHelp.copyFrom.length" class="stage-hint">
          This stage is empty.
          <button v-for="n in stageHelp.copyFrom" :key="n" type="button" class="text-btn" @click="planner.copyStage(n)">Copy {{ n }}</button>
        </p>
        <p v-else-if="stageName !== 'Endgame' && stageHelp" class="stage-hint">
          <template v-if="stageHelp.areas.length">
            Level in: <span v-for="(a, i) in stageHelp.areas" :key="a.name">{{ i ? ", " : "" }}{{ a.name }} <small>({{ a.mlvl }})</small></span>.
          </template>
          <template v-if="stageHelp.runewords.length">
            New runewords for your {{ stageHelp.cats.join(", ") }}: {{ stageHelp.runewords.map((r) => `${r.name} (${r.lvl})`).join(", ") }}.
          </template>
        </p>
      </div>
      <p class="planner-message" :class="planner.state.tone" role="status">{{ planner.state.message }}</p>

      <div class="planner-layout" :class="{ docked: planner.state.statsOpen && planner.state.statsPinned }">
        <div class="planner-content">
          <div
            v-if="planner.problems.value.length || planner.character.value.warnings.length"
            class="upgrade-note planner-problems"
          >
            <Icon name="info" />
            <div>
              <p v-if="planner.problems.value.length">
                <strong>Your skills need level {{ planner.minLevel.value }}.</strong>
                <button
                  v-if="planner.minLevel.value <= MAX_LEVEL"
                  class="text-btn"
                  @click="planner.setLevel(planner.minLevel.value)"
                >
                  Set level {{ planner.minLevel.value }}
                </button>
              </p>
              <ul>
                <li v-for="p in planner.problems.value">{{ p }}</li>
                <li v-for="i in planner.character.value.issues">
                  {{ i.text
                  }}<button v-if="i.fix" class="fix-btn" @click="planner.applyFix(i.fix)">
                    {{
                      i.fix.kind === "level"
                        ? `Set level ${i.fix.level}`
                        : `Add ${i.fix.amount} to ${i.fix.attr[0].toUpperCase() + i.fix.attr.slice(1)}`
                    }}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div class="planner-columns">
            <AttributesPanel />
            <EquipmentPanel />
            <SkillsPanel />
          </div>

          <div class="planner-details">
            <SkillDetail />
          </div>

          <div class="planner-extras">
            <section class="planner-summary" aria-label="Skill summary">
              <h2 class="group-title">Skill summary</h2>
              <p v-if="!planner.allocated.value.length" class="muted">No skill points spent yet.</p>
              <ul v-else>
                <li v-for="n in planner.allocated.value" :key="n.id">
                  <button
                    v-on="planner.tipOn({ kind: 'skill', id: n.id })"
                    @click="
                      planner.setTab(n.tree);
                      planner.state.selected = n.id;
                    "
                  >
                    <SkillIcon :image="n.image" /><span>{{ n.name }}<small>{{ n.tree }}</small></span
                    ><b
                      >{{ n.points
                      }}<i v-if="planner.character.value.soft[n.id]">+{{ planner.character.value.soft[n.id] }}</i></b
                    >
                  </button>
                </li>
              </ul>
            </section>
            <details class="planner-quests">
              <summary><h2 class="group-title">Quests</h2></summary>
              <p class="muted">
                Quests count as done once you reach the level they're usually finished at. Untick any you haven't done.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Quest</th>
                    <th v-for="d in QUEST_DIFFS">{{ cap(d) }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="q in SKILL_QUESTS">
                    <th scope="row">{{ q[1] }}</th>
                    <td v-for="d in QUEST_DIFFS">
                      <label v-if="q[2][d]" class="quest-check"
                        ><input
                          type="checkbox"
                          :checked="planner.engine.questDone(planner.build.value, q[0], d)"
                          @change="planner.toggleQuest(q[0], d, $event.target.checked)"
                          :aria-label="`${q[1]}, ${d}: +${q[2][d][0]} skill points`"
                        />+{{ q[2][d][0] }} skill</label
                      >
                    </td>
                  </tr>
                  <tr v-for="q in OTHER_QUESTS">
                    <th scope="row">{{ q[1] }}</th>
                    <td v-for="d in QUEST_DIFFS">
                      <label v-if="q[3][d]" class="quest-check"
                        ><input
                          type="checkbox"
                          :checked="otherQuestDone(planner.build.value, q[0], d)"
                          @change="planner.toggleQuest(q[0], d, $event.target.checked)"
                          :aria-label="`${q[1]}, ${d}`"
                        />+{{ q[3][d][0] }}
                        {{ q[2] === "stat_points" ? "stat" : q[2] === "flat_life" ? "life" : "signets" }}</label
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
              <button class="text-btn" @click="planner.resetQuests()">Go back to level-based quests</button>
            </details>
          </div>

          <p class="coverage">
            Skill data for Median XL {{ planner.gameVersion }} from
            <a :href="planner.source.repo" target="_blank" rel="noopener">medianxl-db</a>
            (commit {{ String(planner.source.commit).slice(0, 7) }}, fetched {{ shortDate(planner.source.fetchedAt) }}).
            <template v-if="planner.game">
              Skill formulas, caps and required levels checked against the Median XL {{ planner.game.patch }} game
              files (extracted {{ shortDate(planner.game.extractedAt) }}).
            </template>
            Items from the official documentation. Values marked "est." are our own calculations of game formulas.
          </p>
          <details v-if="planner.game" class="coverage data-report">
            <summary>
              Where MedianDB {{ planner.gameVersion }} and the {{ planner.game.patch }} game files disagree
            </summary>
            <p>
              {{ planner.game.report.paired }} skills matched by name.
              {{ planner.game.report.formulaMatches }} community formulas give the same results as the game's;
              {{ planner.game.report.formulaDiffers.length }} differ;
              {{ planner.game.report.formulaUnchecked.length }} couldn't be compared.
            </p>
            <p><b>Hard-point caps</b> (the game value is used, except where MedianDB's 0 means the cap is built by level or skill rules):</p>
            <ul>
              <li v-for="x in planner.game.report.capDiffers">{{ x.name }}: MedianDB {{ x.medianDb }}, game {{ x.game }}</li>
            </ul>
            <p><b>Required character level</b> (the higher is used, except for skills the game unlocks by a deed):</p>
            <ul>
              <li v-for="x in planner.game.report.reqLevelDiffers">
                {{ x.name }}: MedianDB {{ x.medianDb }}, game {{ x.game }}<template v-if="planner.engine.unlockOf(x.id)">;
                unlocked by "{{ planner.engine.unlockOf(x.id) }}", so the game's is used</template>
              </li>
            </ul>
          </details>
        </div>

        <Transition name="stats-slide">
          <StatsPanel v-if="planner.state.statsOpen" />
        </Transition>
      </div>

      <HoverCard :active="!planner.state.picker && !planner.state.suggesting && !planner.state.skillChooser && !planner.state.editing" />
      <ItemEditorModal v-if="planner.state.editing" />
      <SkillChooser v-if="planner.state.skillChooser" />
      <SaveBuildDialog v-if="saving" @close="saving = false" />
      <ItemPicker
        v-if="planner.state.picker"
        :key="planner.state.picker.mode + (planner.state.picker.slot || '') + (planner.state.picker.index ?? '')"
        :mode="planner.state.picker.mode"
        :slot="planner.state.picker.slot || ''"
        @pick="planner.pick"
        @close="planner.closePicker()"
      />
    </template>
  </section>
</template>
