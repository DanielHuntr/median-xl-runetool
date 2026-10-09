<script setup>
import ClassPicker from "../ClassPicker.vue";
import { ref, shallowRef, provide, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
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
import ArmoryImport from "./ArmoryImport.vue";
import MercPanel from "./MercPanel.vue";
import GuideView from "./GuideView.vue";
import GuideEditor from "./GuideEditor.vue";
import { MERC_ACTS, mercSpecs } from "../../planner/mercs.js";
import { tabKeys, menuKeys, focusMenu } from "../../tabKeys.js";
import { createEngine, SKILL_QUESTS, DIFFICULTIES as QUEST_DIFFS, MAX_LEVEL } from "../../planner/engine.js";
import { createCatalog } from "../../planner/items.js";
import { createPlanner, PlannerKey, STAGE_START, MAX_STAGES } from "../../planner/usePlanner.js";
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
const saving = ref(false), importing = ref(false), guideEditing = ref(false);
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
}

// The Mercenary tab's choices, grouped by act.
const mercActs = computed(() => {
  const specs = planner.value ? mercSpecs(planner.value.planner) : [];
  return Object.entries(MERC_ACTS).map(([act, a]) => ({ act: +act, name: a.name, specs: specs.filter((x) => x.act === +act) })).filter((a) => a.specs.length);
});
// Phones: the bottom bar's sections, one shown at a time, opened at their top.
// Phones: the head's settings and stages folded into a summary line until opened.
const headOpen = ref(false);
const SECTIONS = [["attributes", "Attributes", "user"], ["gear", "Gear", "shield"], ["skills", "Skills", "tree"]];
function showSection(id) {
  planner.value.state.section = id;
  nextTick(() => {
    const cols = document.querySelector(".planner-columns");
    const bar = document.querySelector(".mobile-top")?.offsetHeight || 0;
    if (cols && cols.getBoundingClientRect().top < bar) window.scrollTo({ top: cols.getBoundingClientRect().top + window.scrollY - bar - 8 });
  });
}
// Closing a planner panel (the item picker, Suggest gear, the item editor, the skill chooser or
// summary, the Stats panel) puts keyboard focus back where it was when the panel opened, not at
// the top of the page.
const PANELS = ["picker", "suggesting", "editing", "skillChooser", "skillSummary", "statsOpen"];
let returnFocus = null;
watch(
  () => !!planner.value && PANELS.some((k) => planner.value.state[k]),
  (open, was) => {
    if (open && !was) returnFocus = document.activeElement;
    if (open || !was) return;
    const el = returnFocus;
    returnFocus = null;
    nextTick(() => {
      // Lost, or still inside the panel on its way out (the Stats panel leaves after its animation).
      const at = document.activeElement;
      const lost = !at || at === document.body || !!at.closest("dialog, .stats-panel");
      if (lost && el?.isConnected) el.focus({ preventScroll: true });
    });
  },
);
// The stage's "Where to level" and "New runewords" popovers; one open at a time, closed by
// Esc, a click elsewhere or changing stage.
const stagePop = ref(null);
const toggleStagePop = (name) => (stagePop.value = stagePop.value === name ? null : name);
// The top bar's More menu (Import character, Reset): Reset asks inside it before clearing.
const resetAsking = ref(false);
watch(stagePop, (v) => v !== "more" && (resetAsking.value = false));
// Keyboard focus in the menus (the More menu, a stage's options): the first item when one opens,
// Cancel when an item asks to confirm, and back on the menu's button when an item has run, so
// focus never falls to the top of the page.
const menuButton = (which) => document.querySelector(which === "more" ? '[aria-label="More planner actions"]' : ".stage-menu-btn");
watch(stagePop, (v) => (v === "more" || v === "menu") && nextTick(() => focusMenu(document.querySelector(".stage-menu[role=menu]"))));
const focusConfirm = (on) => nextTick(() => (on ? document.querySelector(".stage-menu-confirm .btn:not(.danger)")?.focus() : focusMenu(document.querySelector(".stage-menu[role=menu]"))));
watch(resetAsking, focusConfirm);
function moreMenu(fn) { stagePop.value = null; menuButton("more")?.focus(); fn(); }
// The click's path as it was dispatched: a menu item the click itself replaced (Delete stage
// swapping to its confirmation) is no longer in the page, but the click was still inside.
const closeStagePop = (e) => {
  if (!stagePop.value) return;
  const inside = e.composedPath?.().some((el) => el.classList?.contains("stage-pop-wrap"));
  if (e.type === "keydown" ? e.key !== "Escape" : inside) return;
  // Esc from inside a menu or popover goes back to the button that opened it.
  const wrap = e.type === "keydown" && document.activeElement?.closest(".stage-pop-wrap");
  stagePop.value = null;
  wrap?.querySelector("[aria-haspopup], [aria-expanded]")?.focus();
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
// A stage's level and difficulty: its own build's (the open one, or one already made), else
// where a default stage starts when first opened.
const stageAt = (name) => {
  const p = planner.value, cls = p.state.cls;
  const b = name === p.state.stage[cls] ? p.build.value : p.state.stages[cls][name];
  if (b) return { level: b.level, difficulty: b.difficulty };
  return STAGE_START[name] ? { level: STAGE_START[name][0], difficulty: STAGE_START[name][1] } : null;
};
const stageTip = (name) => {
  const p = planner.value, at = stageAt(name);
  const made = name === p.state.stage[p.state.cls] || p.state.stages[p.state.cls][name];
  if (!at) return name;
  if (!made) return `Empty: starts at level ${at.level}, ${at.difficulty}`;
  return `Level ${at.level}, ${at.difficulty}${p.stageFilled(name) ? "" : " (empty)"}`;
};
// The player's own stages. The open stage's chip has a menu (move, rename, duplicate, delete); a new
// stage or a new name is typed into a chip in place; chips can be dragged into order.
const stageList = computed(() => planner.value?.stagesOf() ?? []);
const stageEdit = ref(null), stageText = ref(""), stageErr = ref(""), stageDeleting = ref(false);
watch(stageDeleting, focusConfirm);
const vFocus = { mounted: (el) => { el.focus(); el.select(); } };
function editStage(mode) {
  stagePop.value = null;
  stageEdit.value = mode;
  stageErr.value = "";
  stageText.value = mode === "rename" ? stageName.value : "";
}
function cancelStageEdit() { stageEdit.value = null; stageErr.value = ""; }
function commitStage() {
  if (!stageEdit.value) return;
  const p = planner.value, text = stageText.value.trim();
  if (!text || (stageEdit.value === "rename" && text === stageName.value)) return cancelStageEdit();
  const r = stageEdit.value === "rename" ? p.renameStage(stageName.value, text) : p.addStage(text);
  if (!r.ok) return (stageErr.value = r.reason);
  cancelStageEdit();
}
function stageMenu(fn) { stagePop.value = null; fn(); nextTick(() => menuButton("menu")?.focus()); }
function deleteStage() {
  stagePop.value = null;
  stageDeleting.value = false;
  planner.value.removeStage(stageName.value);
}
watch(stagePop, (v) => { if (v !== "menu") stageDeleting.value = false; });
// Dragging a chip: where it would land shows as a gold line before or after a chip.
const dragStage = ref(null), dropAt = ref(null);
function onStageDragStart(e, n) {
  dragStage.value = n;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", n);
}
function onStageDragOver(e, i) {
  if (!dragStage.value) return;
  const r = e.currentTarget.getBoundingClientRect();
  dropAt.value = e.clientX > r.left + r.width / 2 ? i + 1 : i;
}
function onStageDrop() {
  const n = dragStage.value, at = dropAt.value;
  if (n != null && at != null) planner.value.placeStage(n, at > stageList.value.indexOf(n) ? at - 1 : at);
  onStageDragEnd();
}
function onStageDragEnd() { dragStage.value = dropAt.value = null; }
const stageHelp = computed(() => {
  const p = planner.value;
  if (!p) return null;
  const b = p.build.value, name = stageName.value;
  const order = p.stagesOf();
  const i = order.indexOf(name);
  const prevLevel = i > 0 ? (stageAt(order[i - 1])?.level ?? 0) : 0;
  const c = { TUD, SUD, SETD, BASED };
  const cats = gearCats(b.gear, c);
  return {
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
      <!-- The planner's head: the build and its actions (a bar that stays in view while scrolling),
           then one panel with the character or mercenary settings and the levelling stages. -->
      <div class="planner-head-top">
        <BuildTitle />
          <div class="planner-actions">
            <button
              class="btn stats-toggle"
              :class="{ active: planner.state.statsOpen }"
              :aria-pressed="planner.state.statsOpen"
              :aria-controls="planner.state.statsOpen ? 'stats-panel' : null"
              @click="planner.toggleStats()"
            >
              <Icon name="panel" />Stats
            </button>
            <button class="btn" @click="saving = true"><Icon name="save" />Save<span class="wide-only"> build</span></button>
            <button class="btn" :data-tip="stageName === 'Endgame' ? 'Copies a link to this build' : `Copies a link to this build that opens on its ${stageName} stage`" @click="share">
              <Icon :name="copied ? 'check' : 'link'" /><template v-if="copied">Link copied</template><template v-else>Share<span class="wide-only"> build</span></template>
            </button>
            <div class="stage-pop-wrap more-wrap">
              <button type="button" class="btn" aria-haspopup="menu" aria-label="More planner actions" :aria-expanded="stagePop === 'more'" @click="toggleStagePop('more')">More<Icon name="chevron" class="more-chevron" /></button>
              <div v-if="stagePop === 'more'" class="stage-pop stage-menu more-menu" role="menu" aria-label="More planner actions" @keydown="menuKeys">
                <template v-if="!resetAsking">
                  <button type="button" role="menuitem" @click="moreMenu(() => (importing = true))"><Icon name="backup" />Import character</button>
                  <hr />
                  <button type="button" role="menuitem" class="danger" @click="resetAsking = true"><Icon name="close" />Reset character…</button>
                </template>
                <div v-else class="stage-menu-confirm">
                  <p>Clear your {{ planner.state.cls }}'s skills, stats and gear on every stage?</p>
                  <div><button type="button" class="btn danger" @click="moreMenu(() => planner.reset())">Reset</button><button type="button" class="btn" @click="resetAsking = false">Cancel</button></div>
                </div>
              </div>
            </div>
          </div>
      </div>
      <!-- Phones: the settings and stages fold into one line, open when tapped. -->
      <button type="button" class="planner-head-summary" :aria-expanded="headOpen" aria-controls="planner-head" @click="headOpen = !headOpen">
        <span>{{ planner.state.view === "guide" ? `Guide: ${planner.state.cls} · Level ${planner.build.value.level}` : planner.state.view === "merc" ? `Mercenary${planner.build.value.merc ? `: ${planner.build.value.merc.spec}` : ""}` : `${planner.state.cls} · Level ${planner.build.value.level} · ${planner.build.value.difficulty}` }} · {{ stageName }}</span>
        <Icon name="chevron" />
      </button>
      <div id="planner-head" class="planner-head" :class="{ folded: !headOpen }">
      <div class="planner-head-settings">
      <div class="planner-tabs" role="tablist" aria-label="Planner" @keydown="tabKeys">
        <button
          v-for="[v, label] in [['guide', 'Guide'], ['character', 'Character'], ['merc', 'Mercenary']]"
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
              @change="planner.setMercLevel($event.target.value); $event.target.value = planner.character.value.merc?.level ?? ''"
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
              @change="planner.setMercHiredAt($event.target.value); $event.target.value = planner.character.value.merc?.hiredAt ?? ''"
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
      <div v-else-if="planner.state.view === 'character'" class="toolbar planner-toolbar">
        <ClassPicker :model-value="planner.state.cls" :classes="planner.engine.classNames" label="Class" @update:model-value="planner.setClass" /><label class="level"
          >Level
          <input
            type="number"
            min="1"
            :max="MAX_LEVEL"
            :value="planner.build.value.level"
            @change="planner.setLevel($event.target.value); $event.target.value = planner.build.value.level"
            aria-label="Character level"
        /></label>
        <label class="field-inline"
          >Difficulty
          <select :value="planner.build.value.difficulty" @change="planner.setDifficulty($event.target.value)">
            <option v-for="d in DIFFICULTIES">{{ d }}</option>
          </select></label
        >
        <label class="switch"><input type="checkbox" v-model="planner.state.autoLevel" />Raise level automatically</label>
      </div>
      </div>

      <div class="planner-stages">
        <div class="stage-switch" role="group" aria-label="Levelling stage" @dragover.prevent @drop.prevent="onStageDrop">
          <span class="stage-label">Stage</span>
          <template v-for="(n, i) in stageList" :key="n">
            <div v-if="stageEdit === 'rename' && n === stageName" class="stage-chip editing active">
              <input v-model="stageText" v-focus maxlength="30" :aria-label="`Rename the ${n} stage`" @keydown.enter.prevent="commitStage" @keydown.esc="cancelStageEdit" @blur="commitStage" />
            </div>
            <div
              v-else
              class="stage-chip"
              :class="{ active: stageName === n, filled: planner.stageFilled(n), dragging: dragStage === n, 'drop-before': dropAt === i && dragStage !== n, 'drop-after': dropAt === i + 1 && i === stageList.length - 1 && dragStage !== n }"
              draggable="true"
              @dragstart="onStageDragStart($event, n)"
              @dragover.prevent="onStageDragOver($event, i)"
              @dragend="onStageDragEnd"
            >
              <button type="button" class="stage-btn" :aria-pressed="stageName === n" :data-tip="stageTip(n)" @click="planner.setStage(n)" @dblclick="stageName === n && editStage('rename')">{{ n }}</button>
              <div v-if="stageName === n" class="stage-pop-wrap">
                <button type="button" class="stage-menu-btn" aria-haspopup="menu" :aria-expanded="stagePop === 'menu'" :aria-label="`${n} stage options`" @click="toggleStagePop('menu')"><Icon name="chevron" /></button>
                <div v-if="stagePop === 'menu'" class="stage-pop stage-menu" role="menu" :aria-label="`${n} stage`" @keydown="menuKeys">
                  <template v-if="!stageDeleting">
                    <button type="button" role="menuitem" :disabled="i === 0" @click="stageMenu(() => planner.moveStage(n, -1))">Move earlier</button>
                    <button type="button" role="menuitem" :disabled="i === stageList.length - 1" @click="stageMenu(() => planner.moveStage(n, 1))">Move later</button>
                    <button type="button" role="menuitem" @click="editStage('rename')">Rename</button>
                    <button type="button" role="menuitem" :disabled="stageList.length >= MAX_STAGES" @click="stageMenu(() => planner.duplicateStage(n))">Duplicate</button>
                    <hr />
                    <button type="button" role="menuitem" class="danger" :disabled="stageList.length < 2" @click="stageDeleting = true">Delete stage</button>
                  </template>
                  <div v-else class="stage-menu-confirm">
                    <p>Delete <b>{{ n }}</b> and its build?</p>
                    <div><button type="button" class="btn danger" @click="deleteStage">Delete</button><button type="button" class="btn" @click="stageDeleting = false">Cancel</button></div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="stageEdit === 'add' && n === stageName" class="stage-chip editing">
              <input v-model="stageText" v-focus maxlength="30" placeholder="Stage name" aria-label="New stage name" @keydown.enter.prevent="commitStage" @keydown.esc="cancelStageEdit" @blur="commitStage" />
            </div>
          </template>
          <button
            v-if="stageList.length < MAX_STAGES && stageEdit !== 'add'"
            type="button"
            class="stage-add"
            aria-label="Add a stage"
            :data-tip="`Add a stage after ${stageName}, starting as a copy of it`"
            @click="editStage('add')"
          >+</button>
        </div>
        <p v-if="stageErr" class="stage-err" role="alert">{{ stageErr }}</p>
        <div v-if="stageName !== 'Endgame' && stageHelp && (stageHelp.areas.length || stageHelp.runewords.length)" class="stage-hint stage-pops">
          <div v-if="stageHelp.areas.length" class="stage-pop-wrap">
            <button type="button" class="text-btn" :aria-expanded="stagePop === 'areas'" aria-controls="stage-pop-areas" @click="toggleStagePop('areas')">
              Where to level <small>({{ stageHelp.areas.length }})</small>
            </button>
            <div v-if="stagePop === 'areas'" id="stage-pop-areas" class="stage-pop" role="dialog" aria-label="Where to level">
              <p class="stage-pop-title">Most experience at level {{ planner.build.value.level }} ({{ planner.build.value.difficulty }})</p>
              <ul>
                <li v-for="a in stageHelp.areas" :key="a.name"><span>{{ a.name }}</span><small>monster level {{ a.mlvl }}<template v-if="a.xp < 1"> · {{ Math.round(a.xp * 100) }}% experience</template></small></li>
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
        <GuideEditor v-if="guideEditing" @close="guideEditing = false" />
      </div>
      </div>

      <div class="planner-layout" :class="{ docked: planner.state.statsOpen && planner.state.statsPinned }">
        <div class="planner-content">
          <div
            v-if="planner.state.view !== 'guide' && (planner.problems.value.length || planner.character.value.warnings.length)"
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

          <GuideView v-if="planner.state.view === 'guide'" @edit="guideEditing = true" />
          <MercPanel v-else-if="planner.state.view === 'merc'" />
          <template v-else>
          <div class="planner-columns" :data-section="planner.state.section">
            <AttributesPanel />
            <EquipmentPanel />
            <SkillsPanel />
          </div>
          <div class="planner-sections" role="group" aria-label="Planner sections">
            <button v-for="[id, label, icon] in SECTIONS" :key="id" type="button" :aria-pressed="planner.state.section === id" @click="showSection(id)"><Icon :name="icon" /><span>{{ label }}</span></button>
            <button type="button" :aria-pressed="planner.state.statsOpen" @click="planner.toggleStats()"><Icon name="panel" /><span>Stats</span></button>
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
      <ArmoryImport v-if="importing" @close="importing = false" />
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
