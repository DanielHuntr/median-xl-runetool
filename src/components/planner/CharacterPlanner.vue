<script setup>
import ClassPicker from "../ClassPicker.vue";
import { ref, shallowRef, provide, computed, watch, onMounted, onBeforeUnmount } from "vue";
import Icon from "../AppIcon.vue";
import SkillIcon from "./SkillIcon.vue";
import AttributesPanel from "./AttributesPanel.vue";
import EquipmentPanel from "./EquipmentPanel.vue";
import SkillsPanel from "./SkillsPanel.vue";
import QuestsDialog from "./QuestsDialog.vue";
import BuildTitle from "./BuildTitle.vue";
import ItemEditorModal from "./ItemEditorModal.vue";
import ItemPicker from "./ItemPicker.vue";
import StatsPanel from "./StatsPanel.vue";
import HoverCard from "./HoverCard.vue";
import SkillChooser from "./SkillChooser.vue";
import SaveBuildDialog from "./SaveBuildDialog.vue";
import MercPanel from "./MercPanel.vue";
import { MERC_ACTS, mercSpecs } from "../../planner/mercs.js";
import { tabKeys } from "../../tabKeys.js";
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

// The Mercenary tab's choices, grouped by act.
const mercActs = computed(() => {
  const specs = planner.value ? mercSpecs(planner.value.planner) : [];
  return Object.entries(MERC_ACTS).map(([act, a]) => ({ act: +act, name: a.name, specs: specs.filter((x) => x.act === +act) })).filter((a) => a.specs.length);
});
// The stage's "Where to level" and "New runewords" popovers; one open at a time, closed by
// Esc, a click elsewhere or changing stage.
const stagePop = ref(null);
const toggleStagePop = (name) => (stagePop.value = stagePop.value === name ? null : name);
const closeStagePop = (e) => {
  if (!stagePop.value) return;
  if (e.type === "keydown" ? e.key === "Escape" : !e.target.closest?.(".stage-pop-wrap")) stagePop.value = null;
};
watch(() => planner.value && [planner.value.state.cls, stageName.value], () => (stagePop.value = null));
// Why the mercenary's level can't go higher: it's never above the character's, and a
// difficulty's mercenaries start at a level (a Hell Shapeshifter at 90).
const mercHint = computed(() => {
  const p = planner.value, m = p?.character.value.merc;
  if (!m) return "";
  const diff = p.build.value.merc?.difficulty || p.build.value.difficulty;
  if (m.cap < m.minLevel)
    return `A ${m.spec} hired in ${diff} starts at level ${m.minLevel}, and a mercenary can't be above your level (${m.cap}). Raise your level on the ${p.state.cls} tab, or choose an earlier difficulty.`;
  if (m.level === m.cap && m.cap < 150 && (p.build.value.merc?.level ?? 0) > m.cap)
    return `A mercenary can't be above your level (${m.cap}).`;
  return "";
});
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
  document.addEventListener("click", closeStagePop);
  document.addEventListener("keydown", closeStagePop);
});
onBeforeUnmount(() => {
  window.removeEventListener("hashchange", onHash);
  document.removeEventListener("click", closeStagePop);
  document.removeEventListener("keydown", closeStagePop);
});

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
// The quest list, from the stage row (QuestsDialog).
const questsOpen = ref(false);
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
      <div v-if="planner.state.kept[planner.state.cls]" class="viewing-bar" role="region" aria-label="Opened build">
        <p>
          Viewing <b>{{ planner.state.openedName[planner.state.cls] || `a shared ${planner.state.cls} build` }}</b>.
          Your own {{ planner.state.cls }} build is kept aside<template v-if="planner.state.kept[planner.state.cls].name"> ({{ planner.state.kept[planner.state.cls].name }})</template>.
        </p>
        <button type="button" class="btn" @click="planner.restoreKept()">Back to my build</button>
        <button type="button" class="text-btn" @click="planner.dropKept()">Keep this one instead</button>
      </div>
      <BuildTitle />
      <div class="planner-tabs" role="tablist" aria-label="Planner" @keydown="tabKeys">
        <button
          v-for="[v, label] in [['character', planner.state.cls], ['merc', 'Mercenary']]"
          :key="v"
          type="button"
          role="tab"
          :aria-selected="planner.state.view === v"
          :tabindex="planner.state.view === v ? 0 : -1"
          @click="planner.state.view = v"
        >
          {{ label }}<small v-if="v === 'merc' && planner.build.value.merc">{{ planner.build.value.merc.spec }}</small>
        </button>
      </div>
      <div v-if="planner.state.view === 'merc'" class="toolbar planner-toolbar merc-toolbar">
        <label class="field-inline"
          >Mercenary
          <select :value="planner.build.value.merc?.spec || ''" @change="planner.setMerc($event.target.value)">
            <option value="">None hired</option>
            <optgroup v-for="a in mercActs" :key="a.act" :label="`Act ${a.act}: ${a.name}`">
              <option v-for="x in a.specs" :key="x.spec" :value="x.spec">{{ x.spec }}</option>
            </optgroup>
          </select></label
        >
        <template v-if="planner.build.value.merc">
          <label class="level"
            >Level
            <input
              type="number"
              min="1"
              :max="planner.build.value.level"
              :value="planner.character.value.merc?.level"
              aria-label="Mercenary level (at most yours)"
              @change="planner.setMercLevel($event.target.value)"
          /></label>
          <label class="level"
            >Hired at
            <input
              type="number"
              min="1"
              :max="planner.character.value.merc?.level"
              :value="planner.character.value.merc?.hiredAt"
              aria-label="Level the mercenary was hired at (its skills grow from here)"
              title="Its skills grow from the level it was hired at; the earliest possible by default"
              @change="planner.setMercHiredAt($event.target.value)"
          /></label>
          <label class="field-inline"
            >Hired in
            <select :value="planner.build.value.merc.difficulty || planner.build.value.difficulty" @change="planner.setMercDifficulty($event.target.value)">
              <option v-for="d in DIFFICULTIES">{{ d }}</option>
            </select></label
          >
        </template>
        <p v-if="mercHint" class="merc-hint">{{ mercHint }}</p>
      </div>
      <div v-else class="toolbar planner-toolbar">
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
          <button class="btn" :data-tip="stageName === 'Endgame' ? 'Copies a link to this build' : `Copies a link to this build that opens on its ${stageName} stage`" @click="share">
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
        <div v-else-if="stageName !== 'Endgame' && stageHelp && (stageHelp.areas.length || stageHelp.runewords.length)" class="stage-hint stage-pops">
          <div v-if="stageHelp.areas.length" class="stage-pop-wrap">
            <button type="button" class="text-btn" :aria-expanded="stagePop === 'areas'" aria-controls="stage-pop-areas" @click="toggleStagePop('areas')">
              Where to level <small>({{ stageHelp.areas.length }})</small>
            </button>
            <div v-if="stagePop === 'areas'" id="stage-pop-areas" class="stage-pop" role="dialog" aria-label="Where to level">
              <p class="stage-pop-title">Areas near level {{ planner.build.value.level }} ({{ planner.build.value.difficulty }})</p>
              <ul>
                <li v-for="a in stageHelp.areas" :key="a.name"><span>{{ a.name }}</span><small>monster level {{ a.mlvl }}</small></li>
              </ul>
            </div>
          </div>
          <div v-if="stageHelp.runewords.length" class="stage-pop-wrap">
            <button type="button" class="text-btn" :aria-expanded="stagePop === 'runewords'" aria-controls="stage-pop-runewords" @click="toggleStagePop('runewords')">
              New runewords <small>({{ stageHelp.runewords.length }})</small>
            </button>
            <div v-if="stagePop === 'runewords'" id="stage-pop-runewords" class="stage-pop" role="dialog" aria-label="New runewords">
              <p class="stage-pop-title">New since level {{ stageHelp.prevLevel }} for your {{ stageHelp.cats.join(", ") }}</p>
              <ul>
                <li v-for="r in stageHelp.runewords" :key="r.name"><span>{{ r.name }}</span><small>level {{ r.lvl }}</small></li>
              </ul>
            </div>
          </div>
        </div>
        <!-- Quests, at the row's other end (QuestsDialog). -->
        <button type="button" class="btn stage-quests" aria-haspopup="dialog" @click="questsOpen = true">Quests</button>
        <QuestsDialog v-if="questsOpen" @close="questsOpen = false" />
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

          <MercPanel v-if="planner.state.view === 'merc'" />
          <template v-else>
          <div class="planner-columns">
            <AttributesPanel />
            <EquipmentPanel />
            <SkillsPanel />
          </div>

          </template>

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
        </div>

        <Transition name="stats-slide">
          <StatsPanel v-if="planner.state.statsOpen" />
        </Transition>
      </div>

      <HoverCard :active="!planner.state.picker && !planner.state.suggesting && !planner.state.skillChooser && !planner.state.editing && !planner.state.skillSummary" />
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
