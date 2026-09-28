import { reactive, computed, watch, inject, ref } from "vue";
import { MAX_LEVEL } from "./engine.js";
import { isToggleSkill } from './skillEffects.js';
import { spendRemaining, wearableBothSets, releaseUnusedRequirements, fundLoadout } from './attributeAllocation.js';
import { computeCharacter, ATTRIBUTES, activeSlots } from "./character.js";
import { SLOTS } from "./items.js";
import { cleanOrbs, orbById, orbFits } from './orbs.js';
import { DIFFICULTIES } from "./rules.js";
import { skillDamage, BASIC_ATTACK } from "./damage.js";
import { againstTarget, typicalTarget } from "./target.js";
import { encodeBuild, decodeBuild, plannerHash } from "./buildCode.js";
import { cleanMerc, mercCats, mercSpecs } from "./mercs.js";
import { buildProfile, wantedStats, recommendForSlot, describeProfile, suggestSockets, suggestEnhancements } from "./recommend.js";

export const PlannerKey = Symbol("Planner");
// A build's levelling stages: each is its own version of the character (skills, gear,
// attributes), so a player makes their own levelling guide by filling them in. An empty stage
// starts at its level and difficulty; Endgame is the finished build.
export const STAGES = ["Normal", "Nightmare", "Hell", "Endgame"];
export const STAGE_START = { Normal: [50, "Normal"], Nightmare: [100, "Nightmare"], Hell: [125, "Hell"] };
const STORAGE_KEY = "mxlrw2:planner";
const RECENT_SOCKETS = 8;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

const emptyBuild = (cls) => ({
  cls,
  level: 1,
  points: {},
  quests: {},
  attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
  signets: 0,
  difficulty: "Hell",
  gear: {},
  swap: false,
  inventory: [],
  buffs: [],
  // Skills in use: left/right mouse slots and up to 8 more on the skill bar.
  leftSkill: BASIC_ATTACK,
  rightSkill: null,
  skillBar: [],
  // The hired mercenary (mercs.js): { spec, level, gear, off } or null.
  merc: null,
});
const MAX_BAR = 8;

// Keeps only well-formed item states (saved data and share links are untrusted).
function cleanItem(st, catalog) {
  if (!st || typeof st !== "object") return null;
  const out = {};
  if (st.ref === "custom") {
    const c = st.custom || {};
    out.ref = "custom";
    out.custom = {
      name: String(c.name || "Custom item").slice(0, 80),
      slotType: String(c.slotType || "weapon"),
      text: String(c.text || "").slice(0, 4000),
    };
  } else if (typeof st.ref === "string" && catalog.get(st.ref)) out.ref = st.ref;
  else return null;
  if (st.ref.startsWith("rw:")) {
    if (!catalog.get(st.base)) return null;
    out.base = st.base;
  }
  if (st.ref === 'custom' && catalog.get(st.base)?.kind === 'base') out.base = st.base;
  for (const k of ["variant", "baseVariant", "socketCount"])
    if (Number.isInteger(st[k]) && st[k] >= 0 && st[k] < 10) out[k] = st[k];
  if (Array.isArray(st.rolls))
    out.rolls = st.rolls.slice(0, 40).map((x) => (typeof x === "number" && x >= 0 && x <= 1 ? x : 1));
  if (Array.isArray(st.sockets))
    out.sockets = st.sockets.slice(0, 6).map((r) => (typeof r === "string" && catalog.get(r) ? r : null));
  out.orbs = cleanOrbs(st.orbs);
  if (st.ethereal === true) out.ethereal = true;
  // Superior quality: a variant id from superior-items.json (items.js ignores one that doesn't fit).
  if (Number.isInteger(st.superior) && st.superior >= 0 && st.superior < 16) out.superior = st.superior;
  return out;
}

function cleanBuild(raw, cls, engine, catalog, planner = null) {
  const b = emptyBuild(cls);
  if (!raw || typeof raw !== "object") return b;
  b.level = engine.clampLevel(raw.level ?? 1);
  for (const [id, n] of Object.entries(raw.points || {}))
    if (engine.node(b, id) && Number.isInteger(n) && n > 0 && n <= MAX_LEVEL) b.points[id] = n;
  for (const [k, v] of Object.entries(raw.quests || {})) if (typeof v === "boolean") b.quests[k] = v;
  for (const a of ATTRIBUTES) b.attrs[a] = Math.max(0, Math.min(2000, Math.floor(Number(raw.attrs?.[a]) || 0)));
  b.signets = Math.max(0, Math.min(450, Math.floor(Number(raw.signets) || 0)));
  if (DIFFICULTIES.includes(raw.difficulty)) b.difficulty = raw.difficulty;
  for (const s of SLOTS) {
    const it = cleanItem(raw.gear?.[s.id], catalog);
    if (it) b.gear[s.id] = it;
  }
  for (const [main, off] of [['weapon', 'offhand'], ['weapon2', 'offhand2']]) {
    if (b.gear[main] && catalog.resolve(b.gear[main], b.level)?.twoHanded) delete b.gear[off];
  }
  b.swap = !!raw.swap;
  b.inventory = (raw.inventory || []).map((x) => cleanItem(x, catalog)).filter(Boolean).slice(0, 80);
  // Saved data can be anything: only lists are read (a string here used to stop the planner).
  const list = (v) => (Array.isArray(v) ? v : []);
  b.buffs = list(raw.buffs).filter((id) => engine.node(b, id));
  // Only skills with points can sit in the slots or on the bar.
  const usable = (id) => id === BASIC_ATTACK || (!!engine.node(b, id) && (b.points[id] || 0) > 0);
  if (raw.leftSkill === null || usable(raw.leftSkill)) b.leftSkill = raw.leftSkill ?? BASIC_ATTACK;
  if (usable(raw.rightSkill)) b.rightSkill = raw.rightSkill;
  b.skillBar = [...new Set(list(raw.skillBar).filter((id) => usable(id) && id !== BASIC_ATTACK))].slice(0, MAX_BAR);
  b.merc = planner ? cleanMerc(raw.merc, planner, (x) => cleanItem(x, catalog)) : null;
  return b;
}

// One saved character per class, so switching class never loses work.
export function createPlanner(engine, catalog, planner) {
  const saved = load();
  const firstClass = engine.classNames.includes(saved.cls) ? saved.cls : engine.classNames[0];
  const state = reactive({
    cls: firstClass,
    autoLevel: saved.autoLevel ?? true,
    // Stats panel: open/closed, and pinned (docked beside the planner) or floating.
    statsOpen: saved.statsOpen ?? false,
    statsPinned: saved.statsPinned ?? false,
    // Item picker: null | { mode: "slot", slot } | { mode: "socket", slot, index } | { mode: "inventory" }
    picker: null,
    // Hover sheet: null | { kind: "item", item: itemState, slot? } | { kind: "skill", id }, plus the anchor's rect.
    tip: null,
    suggesting: false,
    suggestAttributes: saved.suggestAttributes ?? false,
    allowAttributeRespec: false,
    includeUniqueOrbs: false,
    suggestEnhancements: saved.suggestEnhancements ?? true,
    // Suggest runewords in Superior bases (superior.js); on by default.
    suggestSuperior: saved.suggestSuperior ?? true,
    // Monster that skill damage is measured against: "typical" or a monster id (target.js).
    target: saved.target ?? "typical",
    targetDifficulty: ['Normal', 'Nightmare', 'Hell'].includes(saved.targetDifficulty) ? saved.targetDifficulty : null,
    // Skill chooser: null | { target: "left" | "right" | "bar" }
    skillChooser: null,
    builds: {},
    tab: saved.tab || {},
    // Socketables picked most recently (newest first), offered at the top of the socket picker.
    recentSockets: (Array.isArray(saved.recentSockets) ? saved.recentSockets : []).filter((r) => typeof r === "string" && catalog.get(r)).slice(0, RECENT_SOCKETS),
    selected: null,
    slot: null,
    // Slot whose item editor is open as a modal, or null.
    editing: null,
    message: "",
    tone: "warn",
    // Name of the build last opened from the Builds page, per class (suggested when saving).
    openedName: {},
    // The planner's tab: your character or your mercenary.
    view: saved.view === "merc" ? "merc" : "character",
    // Per class: the stage being edited, and the other stages' builds.
    stage: {},
    stages: {},
  });
  for (const cls of engine.classNames) {
    state.builds[cls] = cleanBuild(saved.builds?.[cls], cls, engine, catalog, planner);
    state.stage[cls] = STAGES.includes(saved.stage?.[cls]) ? saved.stage[cls] : "Endgame";
    state.stages[cls] = cleanStages(saved.stages?.[cls], cls, state.stage[cls]);
  }
  // Stored or shared stages: well-formed builds of this class, never the active stage's slot.
  function cleanStages(raw, cls, active) {
    const out = {};
    for (const name of STAGES) if (name !== active && raw?.[name] && typeof raw[name] === "object") out[name] = cleanBuild({ ...raw[name], cls }, cls, engine, catalog, planner);
    return out;
  }
  const stageStart = (cls, name) => {
    const [level, difficulty] = STAGE_START[name] || [1, "Hell"];
    return { ...emptyBuild(cls), level, difficulty };
  };
  /** Edit another stage: the current one is kept, the chosen one loaded (or started empty). */
  function setStage(name) {
    const cls = state.cls, cur = state.stage[cls];
    if (!STAGES.includes(name) || name === cur) return;
    const { [name]: next, ...rest } = state.stages[cls];
    state.stages[cls] = { ...rest, [cur]: state.builds[cls] };
    state.builds[cls] = next || stageStart(cls, name);
    state.stage[cls] = name;
    state.selected = state.slot = state.editing = null;
    state.message = "";
  }
  const stageFilled = (name) => name === state.stage[state.cls] || !!state.stages[state.cls][name];
  /** Fill the stage being edited with a copy of another, at this stage's level and difficulty. */
  function copyStage(from) {
    const cls = state.cls, cur = state.stage[cls];
    const src = state.stages[cls][from];
    if (!src || from === cur) return;
    const [level, difficulty] = STAGE_START[cur] || [src.level, src.difficulty];
    state.builds[cls] = { ...JSON.parse(JSON.stringify(src)), level, difficulty };
    say(`Copied the ${from} stage. Check what the planner flags at level ${level}.`, "info");
  }
  /** Stages worked out elsewhere (a starter build's levelling guide), put in the empty stages. */
  // A stage only counts as made once it has skill points or gear: an empty one (opened before
  // its starter build had stages, say) is filled too, including the one being edited.
  const emptyStage = (b) => !b || (!Object.keys(b.points || {}).length && !Object.keys(b.gear || {}).length);
  function fillStages(cls, builds) {
    for (const [name, b] of Object.entries(builds)) {
      if (!b) continue;
      const next = cleanBuild({ ...b, cls }, cls, engine, catalog, planner);
      if (name === state.stage[cls]) {
        if (emptyStage(state.builds[cls])) state.builds[cls] = next;
      } else if (emptyStage(state.stages[cls][name])) state.stages[cls] = { ...state.stages[cls], [name]: next };
    }
  }

  const build = computed(() => state.builds[state.cls]);
  const character = computed(() => computeCharacter(build.value, { engine, catalog, planner }));
  // The build as skill rules and tooltips see it: +skills from gear become soft levels.
  const skillBuild = computed(() => ({ ...build.value, soft: character.value.soft, charStats: character.value.charStats }));
  // Item recommendations: the build's profile and the stats it values, recomputed as skills change.
  const profile = computed(() => buildProfile(build.value, engine));
  const profileSummary = computed(() => describeProfile(profile.value));
  const wanted = computed(() => wantedStats(profile.value, character.value));
  const recommendationOptions = computed(() => ({
    build: build.value, engine, catalog, planner, character: character.value, profile: profile.value, want: wanted.value,
    weaponEnhancements: state.suggestEnhancements, includeUnique: state.includeUniqueOrbs, superior: state.suggestSuperior,
  }));
  // Each slot's full ranking is kept until the build or the suggestion options change, so
  // the suggestions dialog and the item picker share the work (weapons take the longest).
  const recCache = new Map();
  const recFingerprint = () => JSON.stringify([build.value, state.suggestEnhancements, state.includeUniqueOrbs, state.suggestSuperior]);
  function rankedFor(slot) {
    const fp = recFingerprint();
    const hit = recCache.get(slot);
    if (hit?.fp === fp) return hit.list;
    const list = recommendForSlot(slot, recommendationOptions.value, Infinity);
    recCache.set(slot, { fp, list });
    return list;
  }
  const recommend = (slot, limit = 30) => rankedFor(slot).slice(0, limit);
  // For dialogs: returns the list if it's ready, otherwise null and works it out in the
  // background, one slot per task (weapons last) so the dialog can open and draw first.
  const recReady = ref(0);
  const recQueue = new Set();
  let recTimer = null;
  // After the next frame is drawn: requestAnimationFrame runs just before a paint, and a
  // timeout from there runs after it. (Plain timeouts can run before the dialog is drawn.)
  const afterPaint = (fn) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(fn, 0)) : setTimeout(fn, 0);
  function recommendLater(slot, limit = 30) {
    void recReady.value;
    const hit = recCache.get(slot);
    if (hit?.fp === recFingerprint()) return hit.list.slice(0, limit);
    recQueue.add(slot);
    recTimer ??= afterPaint(runRecQueue);
    return null;
  }
  function runRecQueue() {
    recTimer = null;
    const slot = [...recQueue].sort((a, b) => a.startsWith('weapon') - b.startsWith('weapon'))[0];
    if (slot) {
      recQueue.delete(slot);
      rankedFor(slot);
      recReady.value++;
    }
    if (recQueue.size) recTimer = afterPaint(runRecQueue);
  }
  const tabs = computed(() => engine.tabs(state.cls));
  const tab = computed(() => {
    const t = state.tab[state.cls];
    return tabs.value.includes(t) ? t : tabs.value[0];
  });
  const spent = computed(() => engine.spent(build.value));
  const available = computed(() => engine.available(build.value));
  const minLevel = computed(() => engine.minRequiredLevel(build.value));
  const problems = computed(() => {
    const out = engine.buildProblems(build.value).map((p) => p.reason);
    if (spent.value > available.value)
      out.unshift(`${spent.value} skill points spent but only ${available.value} available at level ${build.value.level}`);
    return out;
  });
  const allocated = computed(() =>
    engine.tabs(state.cls).flatMap((t) =>
      engine
        .treeNodes(state.cls, t)
        .filter((n) => build.value.points[n.id])
        .map((n) => ({ ...n, points: build.value.points[n.id] })),
    ),
  );

  function say(msg, tone = "warn") {
    state.message = "";
    state.tone = tone;
    queueMicrotask(() => (state.message = msg));
  }

  // ---------- Skills
  function add(id, times = 1) {
    let added = 0;
    for (let i = 0; i < times; i++) {
      const r = engine.canAdd(build.value, id, { autoLevel: state.autoLevel });
      if (!r.ok) {
        if (!added) say(r.reason);
        break;
      }
      build.value.level = r.level;
      build.value.points[id] = (build.value.points[id] || 0) + 1;
      added++;
    }
    if (added) state.message = "";
    return added;
  }
  function remove(id, times = 1) {
    let removed = 0;
    for (let i = 0; i < times; i++) {
      const r = engine.canRemove(build.value, id);
      if (!r.ok) {
        if (!removed) say(r.reason);
        break;
      }
      if (--build.value.points[id] <= 0) {
        delete build.value.points[id];
        unslot(id);
      }
      removed++;
    }
    if (removed) state.message = "";
    return removed;
  }
  const addMax = (id) => add(id, MAX_LEVEL);
  // A skill with no points can't be used: take it out of the slots and the skill bar.
  function unslot(id) {
    const b = build.value;
    if (b.leftSkill === id) b.leftSkill = BASIC_ATTACK;
    if (b.rightSkill === id) b.rightSkill = null;
    b.skillBar = b.skillBar.filter((x) => x !== id);
  }

  // ---------- Skills in use and their damage estimates
  const monsters = planner.monsters || [];
  const targetDifficulty = computed(() => state.targetDifficulty || build.value.difficulty);
  const target = computed(() => {
    if (!monsters.length) return null;
    const chosen = state.target !== "typical" && monsters.find((m) => String(m.id) === String(state.target));
    return chosen || typicalTarget(monsters, targetDifficulty.value);
  });
  // Each skill's damage, and what lands on the chosen target (vs).
  const damageOf = (id) => {
    if (!id) return null;
    const d = skillDamage(id, { engine, build: build.value, skillBuild: skillBuild.value, character: character.value });
    return d && { ...d, vs: againstTarget(d, character.value, target.value, targetDifficulty.value, build.value.level) };
  };
  const skillsInUse = computed(() => {
    const b = build.value;
    return [...new Set([b.leftSkill, b.rightSkill, ...b.skillBar].filter(Boolean))].map((id) => damageOf(id)).filter(Boolean);
  });
  function setSkillSlot(side, id) {
    build.value[side === "left" ? "leftSkill" : "rightSkill"] = id;
  }
  function addToBar(id) {
    const bar = build.value.skillBar;
    if (id === BASIC_ATTACK || bar.includes(id)) return;
    if (bar.length >= MAX_BAR) return say(`The skill bar holds ${MAX_BAR} skills. Remove one first.`);
    bar.push(id);
  }
  function removeFromBar(id) {
    build.value.skillBar = build.value.skillBar.filter((x) => x !== id);
  }
  function chooseSkill(id) {
    const c = state.skillChooser;
    if (!c) return;
    if (c.target === "bar") addToBar(id);
    else setSkillSlot(c.target, id);
    state.skillChooser = null;
  }
  function toggleBuff(id) {
    const skill = engine.skill(id);
    if ((!build.value.points[id] && !engine.isInnate(id)) || !engine.node(build.value, id) || !isToggleSkill(skill)) return;
    const list = build.value.buffs;
    const exclusive = skill.tags.find(tag => ['Stance', 'Morph'].includes(tag));
    build.value.buffs = list.includes(id) ? list.filter((x) => x !== id)
      : [...list.filter(x => !exclusive || !engine.skill(x)?.tags.includes(exclusive)), id];
  }

  // ---------- Character
  const setLevel = (v) => (build.value.level = engine.clampLevel(v));
  function setClass(cls) {
    if (!engine.classNames.includes(cls)) return;
    state.cls = cls;
    state.selected = null;
    state.slot = null;
    state.editing = null;
    state.message = "";
  }
  const setTab = (t) => (state.tab[state.cls] = t);
  function toggleStats(open = !state.statsOpen) {
    state.statsOpen = open;
  }
  const togglePin = () => (state.statsPinned = !state.statsPinned);
  const toggleQuest = (id, diff, done) => (build.value.quests[`${id}.${diff}`] = done);
  const resetQuests = () => (build.value.quests = {});
  function addAttr(a, n) {
    const c = character.value;
    const free = c.statPoints.available - c.statPoints.spent;
    if (n > 0 && free <= 0) return say("No stat points left. Raise your level or add Signets of Learning.");
    build.value.attrs[a] = Math.max(0, build.value.attrs[a] + (n > 0 ? Math.min(n, free) : n));
  }
  // One-click fix for a requirement warning (see character.js issues).
  function applyFix(fix) {
    if (!fix) return;
    if (fix.kind === "level") {
      setLevel(fix.level);
      return say(`Level set to ${build.value.level}.`, "info");
    }
    const name = fix.attr[0].toUpperCase() + fix.attr.slice(1);
    const c = character.value;
    const free = c.statPoints.available - c.statPoints.spent;
    if (free <= 0)
      return say(`${name} needs ${fix.amount} more points, but none are free. Raise your level or add Signets of Learning.`);
    const add = Math.min(free, fix.amount);
    build.value.attrs[fix.attr] += add;
    if (add < fix.amount)
      say(`Added ${add} to ${name}; ${fix.amount - add} more needed. Raise your level or add Signets of Learning.`);
    else say(`Added ${add} to ${name}.`, "info");
  }
  const setSignets = (v) => (build.value.signets = Math.max(0, Math.min(450, Math.floor(Number(v) || 0))));
  const setDifficulty = (d) => DIFFICULTIES.includes(d) && (build.value.difficulty = d);

  // ---------- Equipment
  function clearEquipment() {
    hideTip();
    build.value.gear = {};
    state.slot = null;
    state.editing = null;
    if (state.picker?.mode !== 'inventory') state.picker = null;
    say('Cleared equipment from both weapon sets.', 'info');
  }
  const suggestionFingerprint = () => JSON.stringify([build.value, state.suggestAttributes, state.allowAttributeRespec, state.suggestEnhancements, state.includeUniqueOrbs, state.suggestSuperior]);
  function applyGearPreview(preview) {
    if (!preview || preview.fingerprint !== suggestionFingerprint()) {
      say('Your build or options changed. Generate a new preview before applying.', 'info');
      return false;
    }
    build.value.attrs = { ...preview.attrs };
    build.value.gear = JSON.parse(JSON.stringify(preview.gear));
    hideTip();
    state.editing = null;
    state.slot = null;
    return true;
  }
  function refreshGear({ preview = false } = {}) {
    if (profileSummary.value.empty) {
      say('Spend some skill points first to suggest equipment.', 'info');
      return 0;
    }
    // Build a fresh active loadout without relying on attributes from discarded gear.
    // Commit once complete, retaining the inactive weapon set and charms/relics.
    const fingerprint = suggestionFingerprint();
    const next = { ...build.value, attrs: { ...build.value.attrs }, gear: { ...build.value.gear } };
    if (state.suggestAttributes && state.allowAttributeRespec) next.attrs = Object.fromEntries(ATTRIBUTES.map(a => [a, 0]));
    if (state.suggestAttributes) {
      const c = computeCharacter(next, { engine, catalog, planner });
      if (c.statPoints.spent > c.statPoints.available) {
        say('This build has overspent attribute points. Correct the allocation or enable attribute respec.', 'info');
        return null;
      }
    }
    const slots = activeSlots(next);
    for (const slot of slots) delete next.gear[slot];
    const priority = ['amulet', 'ring1', 'ring2', next.swap ? 'weapon2' : 'weapon', 'helm', 'body', 'gloves', 'belt', 'boots', next.swap ? 'offhand2' : 'offhand'];
    let count = 0;
    for (let pass = 0; pass < slots.length; pass++) {
      let added = 0;
      for (const slot of priority) {
        if (!slots.includes(slot) || next.gear[slot]) continue;
        const current = computeCharacter(next, { engine, catalog, planner });
        const currentProfile = buildProfile(next, engine);
        const rec = recommendForSlot(slot, { build: next, engine, catalog, planner, character: current,
          profile: currentProfile, want: wantedStats(currentProfile, current), superior: state.suggestSuperior, allocateAttributes: state.suggestAttributes }, 30)
          .find(() => !slot.startsWith('offhand') || !current.weapon?.twoHanded);
        if (!rec) continue;
        next.gear[slot] = rec.state;
        if (state.suggestAttributes) next.attrs = rec.attrs;
        added++; count++;
      }
      if (!added) break;
    }
    // Revisit early picks with the full loadout present, allowing complementary gear
    // (such as life on hit alongside attack speed) to beat an isolated stat choice.
    for (const slot of priority) {
      const current = computeCharacter(next, { engine, catalog, planner });
      const currentProfile = buildProfile(next, engine);
      const rec = recommendForSlot(slot, { build: next, engine, catalog, planner, character: current,
        profile: currentProfile, want: wantedStats(currentProfile, current), superior: state.suggestSuperior, allocateAttributes: state.suggestAttributes }, 1)[0];
      if (!rec || rec.improvement <= 0.25) continue;
      next.gear[slot] = rec.state;
      if (state.suggestAttributes) next.attrs = rec.attrs;
      if (slot.startsWith('weapon') && catalog.resolve(rec.state, next.level)?.twoHanded)
        delete next.gear[slot === 'weapon' ? 'offhand' : 'offhand2'];
    }
    count = slots.filter(slot => next.gear[slot]).length;
    const result = state.suggestEnhancements ? suggestEnhancements({ build: next, engine, catalog, planner,
      computeCharacter, activeSlots, profile: buildProfile(next, engine), includeUnique: state.includeUniqueOrbs }) : null;
    if (result) {
      next.gear = result.gear;
      // Armor enhancements can unlock a stronger weapon tier. Recompare weapons
      // with their own sockets/orbs after the rest of the outfit is finalized.
      const weaponSlot = next.swap ? 'weapon2' : 'weapon';
      const current = computeCharacter(next, { engine, catalog, planner });
      const currentProfile = buildProfile(next, engine);
      const rec = recommendForSlot(weaponSlot, { build: next, engine, catalog, planner, character: current,
        profile: currentProfile, want: wantedStats(currentProfile, current), superior: state.suggestSuperior, weaponEnhancements: true,
        includeUnique: state.includeUniqueOrbs }, 1)[0];
      if (rec && rec.improvement > 0.25) {
        next.gear[weaponSlot] = rec.state;
        if (catalog.resolve(rec.state, next.level)?.twoHanded) delete next.gear[next.swap ? 'offhand2' : 'offhand'];
      }
      count = slots.filter(slot => next.gear[slot]).length;
    }
    if (state.suggestAttributes) {
      const floor = state.allowAttributeRespec ? {} : build.value.attrs;
      const funded = fundLoadout(next, floor, { engine, catalog, planner });
      if (!funded) {
        say('The suggested equipment needs more attribute points than are available. Your build has not changed.', 'info');
        return null;
      }
      next.attrs = funded;
      next.attrs = releaseUnusedRequirements(next, state.allowAttributeRespec ? {} : build.value.attrs, { engine, catalog, planner });
      next.attrs = spendRemaining(next, { engine, catalog, planner }, buildProfile(next, engine));
      if (!wearableBothSets(next, { engine, catalog, planner })) {
        say('Could not find an equipment plan that can be equipped safely. Your build has not changed.', 'info');
        return null;
      }
    }
    if (preview) return { fingerprint, gear: next.gear, attrs: next.attrs, character: computeCharacter(next, { engine, catalog, planner }), count };
    hideTip();
    build.value.gear = next.gear;
    build.value.attrs = next.attrs;
    state.editing = null;
    state.slot = null;
    if (state.picker?.mode !== 'inventory') state.picker = null;
    const orbCount = slots.reduce((n, slot) => n + (next.gear[slot]?.orbs?.length || 0), 0);
    const socketCount = slots.reduce((n, slot) => n + (next.gear[slot]?.sockets?.filter(Boolean).length || 0), 0);
    say(count ? `Refreshed ${count} equipment slots for your current build${result ? `, with ${orbCount} orbs and ${socketCount} socket fillers` : ''}.`
      : 'No suitable equipment meets your current build requirements. Active equipment slots were cleared.', 'info');
    return count;
  }
  function equip(slot, item) {
    const it = cleanItem(item, catalog);
    if (!it) return;
    build.value.gear[slot] = it;
    const r = catalog.resolve(it, build.value.level);
    // A two-handed weapon occupies both hands, including the ammunition slot.
    const off = slot === "weapon" ? "offhand" : slot === "weapon2" ? "offhand2" : null;
    const offItem = off && build.value.gear[off] && catalog.resolve(build.value.gear[off], build.value.level);
    if (r?.twoHanded && offItem) {
      delete build.value.gear[off];
      say(`${r.def.name} is two-handed, so the off-hand item was removed.`, "info");
    }
    // Equipping any off-hand item removes an incompatible two-handed weapon.
    const main = slot === "offhand" ? "weapon" : slot === "offhand2" ? "weapon2" : null;
    const mainItem = main && build.value.gear[main] && catalog.resolve(build.value.gear[main], build.value.level);
    if (mainItem?.twoHanded) {
      delete build.value.gear[main];
      say(`${mainItem.def.name} is two-handed, so it was removed to make room for ${r.def.name}.`, "info");
    }
    state.slot = slot;
  }
  function unequip(slot) {
    hideTip();
    delete build.value.gear[slot];
    if (state.editing === slot) state.editing = null;
  }
  function openEditor(slot) {
    hideTip();
    state.slot = slot;
    if (build.value.gear[slot]) state.editing = slot;
  }
  function closeEditor() {
    state.editing = null;
  }
  // Hover sheets for items and skills. Only on devices with a real hover pointer;
  // touch users get the detail panels instead. A short delay avoids flicker.
  let tipTimer = null;
  const canHover = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
  function showTip(el, payload) {
    if (!canHover() || !el?.getBoundingClientRect) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      state.tip = { ...payload, rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom } };
    }, 120);
  }
  function hideTip() {
    clearTimeout(tipTimer);
    state.tip = null;
  }
  // v-on helper: <button v-on="tipOn({ kind: 'skill', id })">
  const tipOn = (payload) => ({
    mouseenter: (e) => showTip(e.currentTarget, payload),
    mouseleave: hideTip,
    focus: (e) => showTip(e.currentTarget, payload),
    blur: hideTip,
  });
  function openPicker(p) {
    hideTip();
    state.picker = p;
  }
  function closePicker() {
    hideTip();
    state.picker = null;
  }
  // ---------- The mercenary (mercs.js): part of the build, so each stage has its own.
  const mercAct = () => mercSpecs(planner).find((x) => x.spec === build.value.merc?.spec)?.act ?? null;
  const mercSlotCats = (slot) => mercCats(mercAct(), slot);
  function setMerc(spec) {
    if (!spec) return (build.value.merc = null);
    const prev = build.value.merc;
    const act = mercSpecs(planner).find((x) => x.spec === spec)?.act;
    if (!act) return;
    // Items stay if the new type can wear them (same act).
    const keep = prev && mercSpecs(planner).find((x) => x.spec === prev.spec)?.act === act;
    build.value.merc = { spec, level: prev?.level ?? null, difficulty: prev?.difficulty ?? null, hiredAt: keep ? prev.hiredAt ?? null : null, gear: keep ? prev.gear : {}, off: prev?.off || [] };
  }
  function setMercLevel(v) {
    if (!build.value.merc) return;
    const n = parseInt(v, 10);
    build.value.merc.level = Number.isInteger(n) && n >= 1 ? Math.min(n, build.value.level) : null;
  }
  function setMercHiredAt(v) {
    if (!build.value.merc) return;
    const n = parseInt(v, 10);
    build.value.merc.hiredAt = Number.isInteger(n) && n >= 1 ? Math.min(n, 150) : null;
  }
  function setMercDifficulty(d) {
    if (build.value.merc && DIFFICULTIES.includes(d)) build.value.merc.difficulty = d;
  }
  const removeMercItem = (slot) => build.value.merc && delete build.value.merc.gear[slot];
  function toggleMercBuff(name) {
    const m = build.value.merc;
    if (m) m.off = m.off.includes(name) ? m.off.filter((x) => x !== name) : [...m.off, name];
  }
  // Applies a choice from the item picker to whatever opened it.
  function pick(item) {
    hideTip();
    const p = state.picker;
    if (!p) return;
    if (p.mode === "slot") {
      equip(p.slot, item);
      // Picked from the build's suggestions: its sockets come filled too.
      if (item.suggested && state.suggestEnhancements) enhance(p.slot);
    }
    else if (p.mode === "socket") {
      const it = build.value.gear[p.slot];
      if (it) {
        const sockets = [...(it.sockets || [])];
        sockets[p.index] = item.ref;
        updateItem(p.slot, { sockets });
        if (item.fillAll) fillEmptySockets(p.slot, item.ref);
        rememberSocket(item.ref);
      }
    } else if (p.mode === "merc") {
      const it = cleanItem(item, catalog);
      if (it && build.value.merc) build.value.merc.gear[p.slot] = it;
    } else addInventory(item.ref);
    state.picker = null;
  }
  function rememberSocket(ref) {
    state.recentSockets = [ref, ...state.recentSockets.filter((r) => r !== ref)].slice(0, RECENT_SOCKETS);
  }
  // Empty sockets of the item in a slot (by index), up to its socket count.
  function emptySockets(slot) {
    const it = build.value.gear[slot];
    const count = it ? catalog.resolve(it, build.value.level)?.socketCount || 0 : 0;
    const out = [];
    for (let i = 0; i < count; i++) if (!it.sockets?.[i]) out.push(i);
    return out;
  }
  function fillEmptySockets(slot, ref) {
    const it = build.value.gear[slot];
    if (!it || !catalog.get(ref)) return 0;
    const empty = emptySockets(slot);
    const sockets = [...(it.sockets || [])];
    for (const i of empty) sockets[i] = ref;
    updateItem(slot, { sockets });
    rememberSocket(ref);
    return empty.length;
  }
  // Fills empty sockets (one item, or every equipped item) with the best socketables for
  // the build: damage it scales with, and resistances up to the cap (recommend.js).
  function fillSockets(slot = null, { quiet = false } = {}) {
    const { gear, picks } = suggestSockets({
      build: build.value, engine, catalog, planner, computeCharacter, activeSlots, profile: profile.value, only: slot,
    });
    for (const p of picks) updateItem(p.slot, { sockets: gear[p.slot].sockets });
    for (const p of picks) rememberSocket(p.ref);
    if (!quiet) say(picks.length ? `Filled ${picks.length} socket${picks.length > 1 ? "s" : ""}: ${summarise(picks)}.` : "No empty sockets to fill.", "info");
    return picks;
  }
  function enhance(slot = null, { quiet = false } = {}) {
    const result = suggestEnhancements({ build: build.value, engine, catalog, planner, computeCharacter, activeSlots,
      profile: profile.value, only: slot, includeUnique: state.includeUniqueOrbs });
    for (const s of new Set([...result.picks, ...result.orbPicks].map(p => p.slot)))
      updateItem(s, { sockets: result.gear[s].sockets || [], orbs: result.gear[s].orbs || [] });
    if (!quiet) say(`Added ${result.orbPicks.length} mystic orbs and filled ${result.picks.length} sockets within level ${build.value.level}.`, 'info');
    return result;
  }
  function canAddOrb(slot, id) {
    const st = build.value.gear[slot], o = orbById(id);
    const r = st && catalog.resolve(st, build.value.level);
    if (!r || !o || o.minLevel > build.value.level || !orbFits(o, r.def, r.lines, st)) return false;
    const next = cleanOrbs([...(st.orbs || []), id]);
    return next.length > (st.orbs || []).length && catalog.resolve({ ...st, orbs: next }, build.value.level).head.reqLevel <= build.value.level;
  }
  function addOrb(slot, id) {
    if (canAddOrb(slot, id)) updateItem(slot, { orbs: [...(build.value.gear[slot].orbs || []), id] });
  }
  const summarise = (picks) => {
    const counts = new Map();
    for (const p of picks) counts.set(p.name, (counts.get(p.name) || 0) + 1);
    return [...counts].map(([n, c]) => (c > 1 ? `${c} × ${n}` : n)).join(", ");
  };
  function clearSockets(slot) {
    if (build.value.gear[slot]) updateItem(slot, { sockets: [] });
  }
  function updateItem(slot, patch) {
    const it = build.value.gear[slot];
    if (it) Object.assign(it, patch);
  }
  function addInventory(ref) {
    const def = catalog.get(ref);
    if (!def) return;
    const inv = build.value.inventory;
    if (inv.some((x) => x.ref === ref)) return say(`${def.name} is already in your inventory.`);
    if (def.kind === "relic" && inv.filter((x) => catalog.get(x.ref)?.kind === "relic").length >= 3)
      return say("You can carry at most 3 relics.");
    inv.push({ ref });
  }
  const removeInventory = (i) => build.value.inventory.splice(i, 1);
  const swapWeapons = () => (build.value.swap = !build.value.swap);

  function reset() {
    state.builds[state.cls] = emptyBuild(state.cls);
    state.stage[state.cls] = "Endgame";
    state.stages[state.cls] = {};
    state.openedName[state.cls] = "";
    state.selected = null;
    state.slot = null;
    state.editing = null;
    say(`${state.cls} character cleared.`, "info");
  }

  // ---------- Sharing: base64url JSON, versioned, cleaned on import
  // The code carries every stage: the one being edited, and the others under "stages".
  const buildCode = () => {
    const others = state.stages[state.cls];
    return encodeBuild(Object.keys(others).length ? { ...build.value, stage: state.stage[state.cls], stages: others } : build.value);
  };
  function shareUrl() {
    const url = new URL(window.location.href);
    url.hash = plannerHash(buildCode());
    return url.toString();
  }
  function importFromHash(hash = window.location.hash) {
    // #planner?skill=<id> (site search): show that skill in its class's tree. Each class
    // keeps its own build, so switching class loses nothing.
    const sk = /[?&]skill=([a-z0-9_]+)/.exec(hash);
    const skill = sk && engine.skill(sk[1]);
    if (skill && engine.classNames.includes(skill.class)) {
      if (typeof history !== "undefined") history.replaceState(null, "", "#planner");
      setClass(skill.class);
      if (engine.tabs(skill.class).includes(skill.tabName)) state.tab[skill.class] = skill.tabName;
      state.selected = sk[1];
      return true;
    }
    const m = /[?&]b=([A-Za-z0-9_-]+)/.exec(hash);
    if (!m) return false;
    try {
      const raw = decodeBuild(m[1]);
      if (!raw) throw new Error("bad build");
      // Version 1 links came from the skill-only planner.
      const src = raw.v === 1 ? engine.decode(m[1]) : raw;
      if (![1, 2].includes(raw.v) || !engine.classNames.includes(src.cls)) throw new Error("bad build");
      const b = cleanBuild(src, src.cls, engine, catalog, planner);
      state.builds[b.cls] = b;
      state.stage[b.cls] = STAGES.includes(raw.stage) ? raw.stage : "Endgame";
      state.stages[b.cls] = cleanStages(raw.stages, b.cls, state.stage[b.cls]);
      setClass(b.cls);
      state.tab[b.cls] = engine
        .tabs(b.cls)
        .reduce((a, t) => (engine.tabPoints(b, t) > engine.tabPoints(b, a) ? t : a), engine.tabs(b.cls)[0]);
      // Builds opened from the Builds page carry their name (&name=…).
      const named = /[?&]name=([^&]*)/.exec(hash);
      let title = "";
      try { title = named ? decodeURIComponent(named[1]).slice(0, 80) : ""; } catch {}
      state.openedName[b.cls] = title;
      say(`${title ? `Opened "${title}"` : `Loaded a shared ${b.cls} build`}. It replaced the ${b.cls} build that was in the planner.`, "info");
      return true;
    } catch {
      say("That share link isn't a valid build.");
      return false;
    }
  }

  watch(
    () => ({
      cls: state.cls,
      autoLevel: state.autoLevel,
      statsOpen: state.statsOpen,
      statsPinned: state.statsPinned,
      suggestEnhancements: state.suggestEnhancements,
      suggestSuperior: state.suggestSuperior,
      suggestAttributes: state.suggestAttributes,
      target: state.target,
      targetDifficulty: state.targetDifficulty,
      tab: state.tab,
      recentSockets: state.recentSockets,
      builds: state.builds,
      stage: state.stage,
      stages: state.stages,
      view: state.view,
    }),
    (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
      } catch {}
    },
    { deep: true },
  );

  return {
    engine, catalog, planner, state, build, character, skillBuild, tabs, tab, spent, available, minLevel,
    problems, allocated, emptySockets, fillEmptySockets, fillSockets, enhance, canAddOrb, addOrb, clearSockets, openEditor, closeEditor, add, addMax, remove, toggleBuff, setLevel, setClass, setTab, toggleStats, togglePin, toggleQuest,
    resetQuests, addAttr, setSignets, setDifficulty, equip, unequip, clearEquipment, refreshGear, applyGearPreview, suggestionFingerprint, recommendLater, updateItem, addInventory,
    removeInventory, swapWeapons, reset, shareUrl, buildCode, importFromHash, setStage, stageFilled, copyStage, fillStages,
    mercSlotCats, setMerc, setMercLevel, setMercHiredAt, setMercDifficulty, removeMercItem, toggleMercBuff, say, openPicker, closePicker, pick,
    profile, profileSummary, recommend, applyFix, showTip, hideTip, tipOn, monsters, target, targetDifficulty,
    damageOf, skillsInUse, setSkillSlot, addToBar, removeFromBar, chooseSkill,
  };
}

export function usePlanner() {
  const p = inject(PlannerKey);
  if (!p) throw new Error("Planner provider is missing");
  return p;
}
