// Skill planner rules as pure functions over the imported data and a plain build
// object: { cls, level, points: { skillId: n }, quests: { "questId.difficulty": bool } }.
//
// The game rules (point budget, quests, prerequisites, tag restrictions, devotions
// and dynamic max levels) are ported from azadix/medianxl-db (MIT), from
// src/character/Character.js, planner-core.js, planner-prereqs.js and
// src/skills/domain/skill-calculations.js / skill-allocation-rules.js.
import { evaluate, isPlainText } from "./formula.js";
import { createGameEval, poisonTotal, STAT_IDS, WEAPON_POISON_STATS } from "./gamecalc.js";
import { formatLine, LINE_TYPES } from "./desclines.js";
import { decode as decodeCalc, FUNCTIONS } from "./d2calc.js";
import { SKILL_STAT_PAIRS, PASSIVE_STATS, allowsSkillEffect, isToggleSkill, skillEquipmentFits, normalizeSkillDefinition } from './skillEffects.js';

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 150;
export const DIFFICULTIES = ["normal", "nightmare", "hell"];

// Skill point quests. expectedLevel is when the quest is normally done; it is
// counted as completed from that level unless the build says otherwise.
export const SKILL_QUESTS = [
  ["den_of_evil", "Den of Evil", { normal: [1, 5], nightmare: [1, 60], hell: [1, 105] }],
  ["radament", "Radament's Lair", { normal: [1, 18], nightmare: [1, 70], hell: [1, 107] }],
  ["izual", "The Fallen Angel (Izual)", { normal: [2, 35], nightmare: [2, 90], hell: [2, 110] }],
  ["inquisitor_of_the_triune", "Inquisitor of the Triune", { hell: [2, 115] }],
];

const DIFFICULTY_ORDER = ["Normal", "Nightmare", "Hell"];
const clampLevel = (l) => Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.floor(Number(l) || MIN_LEVEL)));

// ---------- Max level modifiers (skill-calculations.js MAX_LEVEL_MODIFIERS)
// `confirmed`: maximum levels read in game at a character level ({ 150: 30 }), with the
// GitHub issue that sent them; a test checks the rule gives each one.
const perLevel = (target, div, { start = 0, cap = Infinity, base = 0, confirmed = null } = {}) => ({
  target: [target],
  bonus: (_src, ulvl) => base + Math.min(Math.floor(Math.max(0, ulvl - start) / div), cap),
  ...(confirmed ? { confirmed } : {}),
});
const MAX_LEVEL_RULES = [
  { source: "specialization", spec: true, bonus: (src) => Math.floor(src / 2),
    note: "+1 to the maximum level of active skills for every 2 points" },
  perLevel("barkskin", 5, { confirmed: { at: { 150: 30 }, issue: 19 } }),
  { source: "noxious_mastery", target: ["curare"], bonus: (src) => Math.floor(src / 2),
    note: "+1 to Curare's maximum level for every 2 points" },
  perLevel("sanctity", 5, { cap: 5, confirmed: { at: { 150: 5 }, issue: 17 } }),
  perLevel("consecration", 5, { cap: 5, confirmed: { at: { 150: 5 }, issue: 16 } }),
  perLevel("holy_fire", 2, { cap: 25, confirmed: { at: { 150: 25 }, issue: 18 } }),
  { source: "elemental_command", target: ["trinity_arrow", "barrage"],
    bonus: (src, ulvl) => (src > 0 ? Math.min(Math.floor(ulvl / 4), 20) : 0),
    note: "+1 to Trinity Arrow and Barrage maximum level for every 4 character levels" },
  perLevel("spiritual_alignment", 4, { start: 11, confirmed: { at: { 150: 34 }, issue: 20 } }),
  { target: ["lioness"],
    bonus: (_src, _ulvl, points) =>
      Math.floor(["fend", "great_hunt", "hunters_prowess", "hyena_strike", "pounce", "takedown"]
        .reduce((n, id) => n + (points[id] || 0), 0) / 3) },
  { source: "galvanism", target: ["iron_spiral"],
    bonus: (src, ulvl) => (src > 0 && ulvl > 90 ? Math.floor((ulvl - 90) / 5) * 2 : 0),
    note: "+2 to Iron Spiral's maximum level for every 5 character levels above 90" },
  { source: "soulchain", target: ["fireheart_totem", "stormeye_totem", "frostclaw_totem", "dark_gathering"],
    bonus: (src) => src,
    note: "+1 to the soulchained totems' and Dark Gathering's maximum level per point" },
  // 5 at level 150 in game (MedianDB's count from 115 gave 7): it counts from 125. Where
  // between 120 (its required level) and 150 the steps fall is still to be checked.
  perLevel("aptitude", 5, { start: 125, confirmed: { at: { 150: 5 }, issue: null } }),
  perLevel("void_gazer", 5, { start: 95, confirmed: { at: { 100: 1, 104: 1, 150: 11 }, issue: 14 } }),
  // 38 at level 150 in game, one more than MedianDB's 37: it starts from the game file's
  // base of 1 (skills2.bin), not 0.
  perLevel("warmth", 4, { start: 1, base: 1, confirmed: { at: { 150: 38 }, issue: 15 } }),
];
// Skills whose points raise other skills' caps; removing them must not strand points.
const CAP_SOURCES = new Set(MAX_LEVEL_RULES.map((r) => r.source).filter(Boolean));

// ---------- Devotions (skill-calculations.js)
const PALADIN_DEVOTION = { holy: [30, 31], neutral: [32], unholy: [33, 34] };
const AMAZON_DEVOTION = { bow: [2], javelin: [3], spear: [4], storm: [5], blood: [6] };

export function createEngine(data) {
  // Normalize old bundled data too; every consumer sees the same classification.
  const skills = Object.fromEntries(Object.entries(data.skills).map(([id, skill]) =>
    [id, normalizeSkillDefinition(id, skill)]));
  const classNames = data.classes.map((c) => c.name);

  // Per class: tree nodes (layout + prerequisites) merged with skill data.
  const nodesByClass = {};
  const tabsByClass = {};
  for (const cls of classNames) {
    tabsByClass[cls] = Object.keys(data.trees[cls]);
    nodesByClass[cls] = new Map();
    for (const [tab, nodes] of Object.entries(data.trees[cls]))
      for (const n of nodes) nodesByClass[cls].set(n.id, { ...skills[n.id], ...n, id: n.id, tree: tab });
  }
  const node = (b, id) => nodesByClass[b.cls]?.get(id);
  const nodes = (b) => [...(nodesByClass[b.cls]?.values() || [])];
  // A skill's level from points, or for one an item grants from outside the class's tree
  // (character.js itemSkills), the item's level.
  const pts = (b, id) => b.points[id] || b.itemSkills?.[id] || 0;
  const skillName = (id) => skills[id]?.name || data.skillNames?.[id] || String(id).replace(/_/g, " ");
  const isInnate = (s) => s.tabName === "Innate" || /innate/i.test(s.id);

  // ---------- Dataset provenance. MedianDB (community data) and the installed game's
  // files (data/game/<patch>) are merged only when their patches match; see
  // scripts/lib/merge-game.mjs.
  const game = data.game?.variables ? data.game : null;
  const datasets = {
    medianDb: { label: `MedianDB ${data.gameVersion}`, patch: data.gameVersion, commit: data.source?.commit?.slice(0, 7) || null, repo: data.source?.repo || null },
    game: game ? { label: `Game files ${game.patch}`, patch: game.patch, extractedAt: game.extractedAt, files: game.files, method: game.method } : null,
  };
  // Game id → planner skill, including class copies of a shared skill (merge-game.mjs aliases).
  const byGameId = new Map([...Object.entries(data.game?.aliases || {}).map(([gid, id]) => [Number(gid), id]),
    ...Object.entries(skills).filter(([, s]) => s.game).map(([id, s]) => [s.game.gameId, id])]);
  const capConflicts = new Map((game?.report?.capDiffers || []).filter((x) => x.medianDb > 0).map((x) => [x.id, x]));
  const reqConflicts = new Map((game?.report?.reqLevelDiffers || []).map((x) => [x.id, x]));

  // ---------- Points budget
  function questDone(b, id, diff, level = b.level) {
    const q = SKILL_QUESTS.find((x) => x[0] === id);
    const r = q?.[2][diff];
    if (!r) return false;
    const o = b.quests?.[`${id}.${diff}`];
    return o === undefined ? level >= r[1] : o;
  }
  function questPoints(b, level = b.level) {
    let n = 0;
    for (const [id, , rewards] of SKILL_QUESTS)
      for (const [diff, [amount]] of Object.entries(rewards)) if (questDone(b, id, diff, level)) n += amount;
    return n;
  }
  const available = (b, level = b.level) => clampLevel(level) - 1 + questPoints(b, level);
  const spent = (b) => Object.values(b.points).reduce((a, n) => a + n, 0);

  // ---------- Max level
  // The game's own cap: skills2.bin's hard-point cap plus its maximum-level formula, read at
  // this character level and these points (Specialization's +1 per 2 points, Warmth's
  // ulvl / 4, Lioness's points in six other skills ÷ 3 …). Locks (−500 and below: devotions
  // and prerequisites) fall back to the planner's own rules, which explain them.
  function gameMaxLevel(b, id, level, points) {
    const g = skills[id]?.game;
    if (!game || g?.baseCap == null || !g.capModifier) return null;
    const blvl = points[id] || 0;
    const r = evalRecord(g, { ...b, level: clampLevel(level), points }, blvl, blvl, 0).calc(g.capModifier);
    // A lock (±500 and beyond: an exclusive devotion or a missing prerequisite) leaves the cap to
    // the planner's rules, which say why the skill is locked.
    if (!r.ok || Math.abs(r.value) >= 500) return null;
    return g.baseCap + r.value;
  }
  function maxLevel(b, id, level = b.level, points = b.points) {
    const s = skills[id];
    if (!s) return 0;
    const fromGame = gameMaxLevel(b, id, level, points);
    if (fromGame != null) {
      const v = Math.min(fromGame, MAX_LEVEL);
      return v < 1 && !isInnate({ ...s, id }) ? 1 : v;
    }
    let v = baseCap(id);
    for (const r of MAX_LEVEL_RULES) {
      const src = r.source ? points[r.source] || 0 : 0;
      if (r.spec ? s.spec : r.target?.includes(id)) v += r.bonus(src, clampLevel(level), points);
    }
    v = Math.min(v, MAX_LEVEL);
    if (v < 1 && !isInnate({ ...s, id })) v = 1;
    return v;
  }
  // Hard-point cap before rules: always the game files' (skills2.bin), except for the few
  // skills whose cap grows with character level (MedianDB 0 + a level rule above). Their
  // game number isn't the cap on its own (Warmth's is 1, Sanctity's is the rule's final 5):
  // the growth is in the game's code, not its data files.
  const levelBuilt = (id) => skills[id].max === 0 && MAX_LEVEL_RULES.some((r) => r.target?.includes(id));
  const gameCap = (id) => skills[id].game?.baseCap != null && !levelBuilt(id);
  function baseCap(id) {
    const s = skills[id];
    return gameCap(id) ? s.game.baseCap : s.max;
  }
  // What the game showed for this skill's level-built cap ({ at: { 150: 38 }, issue }), or null.
  const capConfirmed = (id) => MAX_LEVEL_RULES.find((r) => !r.source && r.confirmed && r.target?.includes(id))?.confirmed || null;
  function capSource(id) {
    const s = skills[id];
    if (!s) return null;
    const dynamic = MAX_LEVEL_RULES.some((r) => r.target?.includes(id) || (r.spec && s.spec));
    const conflict = capConflicts.get(id) || null;
    return {
      base: baseCap(id),
      from: gameCap(id) ? datasets.game?.label : datasets.medianDb.label,
      dynamic,
      conflict: conflict && { medianDb: conflict.medianDb, game: conflict.game },
      confirmed: capConfirmed(id),
    };
  }
  // Explanations for a skill's dynamic cap, limited to sources this class has.
  function maxLevelNotes(b, id) {
    const s = skills[id];
    const out = [];
    for (const r of MAX_LEVEL_RULES) {
      if (r.source && !node(b, r.source)) continue;
      if (r.source === id && r.note) out.push(r.note);
      else if (!r.source && r.target?.includes(id))
        out.push("Maximum level increases with character level");
      else if (r.source && r.source !== id && (r.spec ? s?.spec : r.target?.includes(id)))
        out.push(`Maximum level raised by ${skillName(r.source)}`);
    }
    return [...new Set(out)];
  }
  function minLevelForPoints(b, id, points) {
    if (points <= 0 || maxLevel(b, id, MAX_LEVEL) >= points && maxLevel(b, id, MIN_LEVEL) >= points)
      return MIN_LEVEL;
    for (let l = MIN_LEVEL; l <= MAX_LEVEL; l++) if (maxLevel(b, id, l) >= points) return l;
    return MAX_LEVEL + 1;
  }

  // ---------- Prerequisites (planner-prereqs.js). Character level is checked separately.
  function tabPoints(b, tabName) {
    return nodes(b).reduce((n, s) => n + (s.tabName === tabName || s.tree === tabName ? pts(b, s.id) : 0), 0);
  }
  function prereqProblems(b, id) {
    const s = node(b, id);
    const out = [];
    for (const p of s?.prereqs || []) {
      const [type, value, target = ""] = p.split(":");
      const n = parseInt(value, 10);
      if (type === "skill_level" && pts(b, target) < n)
        out.push(n === 1 ? `Requires ${skillName(target)}` : `Requires ${n} points in ${skillName(target)}`);
      else if (type === "skill_level_any") {
        const ids = target.split("|");
        if (!ids.some((t) => pts(b, t) >= n))
          out.push(`Requires ${n === 1 ? "" : n + " points in "}${ids.map(skillName).join(" or ")}`);
      } else if (type === "skill_blocked_by" && pts(b, target) > n)
        out.push(`Cannot be learned with points in ${skillName(target)}`);
      else if (type === "tree_points" && tabPoints(b, target) < n)
        out.push(`Requires ${n} points in the ${target} tree`);
    }
    // An unlockable skill needs its deed, and the deed its difficulty.
    const need = unlockDifficulty(id);
    if (need && DIFFICULTY_ORDER.indexOf(b.difficulty || "Hell") < DIFFICULTY_ORDER.indexOf(need))
      out.push(`Unlocked by "${unlockOf(id)}", which needs ${need} difficulty`);
    return out;
  }
  // Mastery skills the game unlocks by a deed, not a level: their tooltip reads "Defeat
  // Bartuc in the Chamber of Blood / Unlockable Skill" and skills.bin's reqlevel is 1.
  // MedianDB gives five of them a level (100-125), which the game files don't have.
  // The difficulty an unlock deed needs: named in it ("on Hell difficulty", "in Nightmare
  // Difficulty"), or where its area has monsters only in Hell (levels.bin, via the planner
  // data's hellOnlyAreas: Bremmtown, Chapel of Vanity, Chamber of Blood, Bramwell…).
  // Unknown (null) for deeds that are items (Paragon's Hammer, the Sunstone) or whose area
  // isn't one place ("the Pit": several areas have that name).
  function unlockDifficulty(id) {
    const text = unlockOf(id);
    if (!text) return null;
    const named = /\b(Normal|Nightmare|Hell) difficulty\b/i.exec(text)?.[1];
    if (named) return named[0].toUpperCase() + named.slice(1).toLowerCase();
    return (data.hellOnlyAreas || []).some((a) => text.includes(a)) ? "Hell" : null;
  }
  function unlockOf(id) {
    const line = skills[id]?.game?.lines?.find((l) => /Unlockable Skill/i.test(l.textA || ""));
    return line ? line.textA.split("\n").filter((t) => !/Unlockable Skill/i.test(t)).join(" ").trim() || null : null;
  }
  // Required character level: always the game's (skills.bin reqlevel, which is also what
  // unlockable skills use); MedianDB's tree only for a skill the game gives none.
  const treeCharLevel = (id, b) =>
    Math.max(0, ...(node(b, id)?.prereqs || []).filter((p) => p.startsWith("character_level:")).map((p) => parseInt(p.split(":")[1], 10)));
  const requiredCharLevel = (id, b) => skills[id]?.game?.reqLevel ?? treeCharLevel(id, b);
  function requiredLevelSource(id, b) {
    const tree = treeCharLevel(id, b), g = skills[id]?.game?.reqLevel ?? null, unlock = unlockOf(id);
    return { value: requiredCharLevel(id, b), medianDb: tree, game: g, conflict: reqConflicts.has(id), ...(unlock ? { unlock } : {}) };
  }

  // ---------- First-point restrictions (skill-allocation-rules.js)
  const COVEN = ["living_flame", "warp_armor", "snow_queen", "vengeful_power"];
  const PROFICIENCY = ["mighty_vigor", "aptitude", "pillage", "warder", "unyielding"];
  const TOTEMS = ["fireheart_totem", "stormeye_totem", "frostclaw_totem"];
  function devotionOf(s) {
    if (s.classId === 5) {
      if (data.devotionUltimates[s.id]) return data.devotionUltimates[s.id];
      for (const [d, tabs] of Object.entries(PALADIN_DEVOTION)) if (tabs.includes(s.tab)) return d;
    }
    if (s.classId === 2)
      for (const [d, tabs] of Object.entries(AMAZON_DEVOTION)) if (tabs.includes(s.tab)) return d;
    return null;
  }
  const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function restrictionProblems(b, id) {
    const s = node(b, id);
    if (!s || pts(b, id) > 0) return [];
    const others = nodes(b).filter((o) => o.id !== id && pts(b, o.id) > 0);
    const out = [];
    const tagged = (tag) => others.find((o) => o.tags.includes(tag));
    if (s.tags.includes("Ultimate") && tagged("Ultimate"))
      out.push(`${tagged("Ultimate").name} already has points. Only one Ultimate skill is allowed.`);
    if (s.tags.includes("Paragon") && tagged("Paragon"))
      out.push(`${tagged("Paragon").name} already has points. Only one Paragon skill is allowed.`);
    if (s.tabName === "Mastery" && others.filter((o) => o.tabName === "Mastery").length >= 3)
      out.push("Points can go into at most 3 different Mastery skills.");
    if (COVEN.includes(id) && others.filter((o) => COVEN.includes(o.id)).length >= 2)
      out.push(`At most 2 of ${COVEN.map(skillName).join(", ")} can have points.`);
    if (PROFICIENCY.includes(id) && others.filter((o) => PROFICIENCY.includes(o.id)).length >= 2)
      out.push(`At most 2 of ${PROFICIENCY.map(skillName).join(", ")} can have points.`);
    const totems = others.filter((o) => TOTEMS.includes(o.id)).length;
    if (id === "soulchain" && totems > 1)
      out.push("Soulchain can't be learned while more than one elemental totem has points.");
    if (TOTEMS.includes(id) && pts(b, "soulchain") > 0 && totems >= 1)
      out.push("A second elemental totem can't be learned while Soulchain has points.");
    const mine = devotionOf(s);
    const locked = mine && others.map(devotionOf).find(Boolean);
    if (locked && locked !== mine)
      out.push(`You are locked into ${title(locked)} Devotion. This skill needs ${title(mine)} Devotion.`);
    return out;
  }

  // ---------- Build validity and the minimum level it needs
  function minRequiredLevel(b) {
    const need = spent(b);
    let level = MAX_LEVEL + 1;
    for (let l = MIN_LEVEL; l <= MAX_LEVEL; l++)
      if (available(b, l) >= need) {
        level = l;
        break;
      }
    for (const [id, n] of Object.entries(b.points))
      if (n > 0) level = Math.max(level, requiredCharLevel(id, b), minLevelForPoints(b, id, n));
    return level;
  }
  // Problems with the points already spent (used for warnings and to vet changes).
  function buildProblems(b) {
    const out = [];
    for (const [id, n] of Object.entries(b.points)) {
      if (n <= 0) continue;
      for (const reason of prereqProblems(b, id)) out.push({ id, reason: `${skillName(id)}: ${reason}` });
      const cap = maxLevel(b, id);
      if (n > cap) out.push({ id, reason: `${skillName(id)} has ${n} points but its maximum is ${cap}` });
    }
    return out;
  }
  const withPoints = (b, id, n) => {
    const points = { ...b.points };
    if (n > 0) points[id] = n;
    else delete points[id];
    return { ...b, points };
  };
  const newProblems = (before, after) => {
    const seen = new Set(buildProblems(before).map((p) => p.reason));
    return buildProblems(after).filter((p) => !seen.has(p.reason));
  };

  // Returns { ok, reason, level } — level is the character level the build
  // needs after the change (raise to it when auto-level is on).
  function canAdd(b, id, { autoLevel = false } = {}) {
    const s = node(b, id);
    if (!s) return { ok: false, reason: "Not a skill of this class" };
    const cur = pts(b, id);
    if (cur === 0) {
      const blockers = [...prereqProblems(b, id), ...restrictionProblems(b, id)];
      if (blockers.length) return { ok: false, reason: blockers[0] };
    }
    if (cur + 1 > maxLevel(b, id, MAX_LEVEL))
      return { ok: false, reason: cur ? `${s.name} is at its maximum level` : `${s.name} can't take skill points` };
    const next = withPoints(b, id, cur + 1);
    const needLevel = minRequiredLevel(next);
    if (needLevel > MAX_LEVEL) return { ok: false, reason: "No skill points left, even at level 150" };
    if (needLevel > b.level && !autoLevel) {
      const why =
        cur + 1 > maxLevel(b, id)
          ? `${s.name} is at its maximum level for character level ${b.level}`
          : requiredCharLevel(id, b) > b.level
            ? `${s.name} requires character level ${requiredCharLevel(id, b)}`
            : "No skill points left";
      return { ok: false, reason: `${why}. Raise your level to ${needLevel}.` };
    }
    const level = Math.max(b.level, needLevel);
    const broken = newProblems({ ...b, level }, { ...next, level });
    if (broken.length) return { ok: false, reason: broken[0].reason };
    return { ok: true, reason: "", level };
  }
  function canRemove(b, id) {
    const cur = pts(b, id);
    if (!cur) return { ok: false, reason: "No points to remove" };
    const broken = newProblems(b, withPoints(b, id, cur - 1));
    if (broken.length) return { ok: false, reason: `Can't remove: ${broken[0].reason}` };
    return { ok: true, reason: "" };
  }

  // ---------- Game-file formulas
  // Stat references the character sheet can answer: D2 1.13c ItemStatCost ids for the
  // attributes, spell damage (passive_*_mastery) and pierce (passive_*_pierce); 485 is
  // inferred to be Spell Focus because Flamefront's tooltip uses it in exactly the docs'
  // spell-focus formula. Other referenced stats are hidden Median XL stats, assumed 0 and listed.
  const ATTRIBUTE_STATS = {
    0: "strength", 1: "energy", 2: "dexterity", 3: "vitality",
    329: "fire_spell_damage", 330: "lightning_spell_damage", 331: "cold_spell_damage", 332: "poison_spell_damage",
    333: "enemy_fire_resistance", 334: "enemy_lightning_resistance", 335: "enemy_cold_resistance", 336: "enemy_poison_resistance",
    485: "spell_focus",
    60: 'life_stolen_per_hit', 187: 'stance', 409: 'skill_duration',
    25: 'enhanced_weapon_damage', 27: 'regenerate_mana', 110: 'poison_length_reduction',
    136: 'chance_of_crushing_blow', 470: 'summoned_minion_damage', 487: 'summoned_minion_resistances',
    228: 'mana_cost_of_skills',
  };
  const ELEMENT_KEYS = {
    fire_damage: "fire", cold_damage: "cold", lightning_damage: "lightning", magic_damage: "magic", poison_damage: "poison",
    average_fire_dot_range: "fire", average_fire_dot: "fire",
  };
  // MedianDB keys shown as one value that the game table gives as min-max: the average.
  const AVERAGE_KEYS = new Set(["average_fire_dot"]);
  // MedianDB keys for a skill's physical damage table (pdmn-pdmx).
  const PHYSICAL_KEYS = new Set(["physical_damage", "bonus_physical_damage"]);
  // MedianDB keys whose game tooltip line is worded differently (normalised game text).
  const KEY_ALIASES = {
    all_skills: ['toallskills'],
    bonus_magic_damage: ["bonusmagicdamage"],
    bonus_cold_damage_to_weapons: ["bonuscolddamagetoattack"],
    bonus_fire_damage_to_weapons: ["firedamagetoweapon"],
    bonus_physical_damage: ["bonusphysicaldamage"],
    // Fervor's "% to Summon Damage" (MedianDB's formula uses min where the game's ln12 grows).
    summoned_minion_damage: ["tosummondamage"],
    vitality: ["vitalityandenergy"],
    energy: ["vitalityandenergy"],
    regenerate_life: ["regeneratelife"],
    enemy_elemental_resistances: ["toenemyelementalresistances"],
    minion_life_percent: ["life"],
    percent_dex_gained_as_extra_magic_damage: ["oftotaldexterity"],
    shoots_times: ["shoots"],
    attack_rating_percent: ["toattackrating"],
    all_attributes: ["allattributes"],
    spell_focus: ["tospellfocus"],
    energy_percent: ["toenergy"],
    maximum_mana: ["tomaximummana"],
    freeze_duration: ["freezelength"],
    enemy_feedback_resistance: ["enemyphysicalandfeedbackresistances"],
    enemy_attack_speed: ["enemyattackandcastspeed"],
    thunder_frequency: ["thunderfrequencyevery"],
    total_damage_reduction: ["globaldamagereduction"],
    enemy_cast_speed: ["enemyattackandcastspeed"],
    // The game's own wording: "8 bats total" (Noctule), "Activation Frequency: +3%" (Shadow Flow).
    total_bats: ["batstotal"],
    activation_frequency: ["activationfrequency"],
  };
  // Values the game states as fixed text in a tooltip line ("Enemy Weapon Damage: -30%",
  // "8 Wraiths", "Cooldown: 3 seconds"): normalised label → { value, text }.
  function staticValues(g) {
    const out = new Map();
    for (const l of g.lines || []) {
      if (l.calcA || l.calcB) continue;
      for (const part of `${l.textA || ""}\n${l.textB || ""}`.split("\n")) {
        const t = part.trim();
        const m = /^(.+?):\s*([+-]?\d+(?:\.\d+)?)/.exec(t) || /^([+-]?\d+(?:\.\d+)?)\s+(.+)$/.exec(t);
        if (!m) continue;
        const [label, value] = /^[+-]?\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
        out.set(norm(label), { value: Number(value), text: t });
      }
    }
    return out;
  }
  // Evaluates game formulas (a planner skill's or a helper skill's) at given levels.
  // References to other skills read them at their own levels: hard points, plus gear
  // levels only once learned (D2). An unlearned skill is level 0, so its level-based
  // values are 0, but its fixed parameters still count: Incineration Trap's in-game
  // tooltip reads a helper skill's par2 = 100. Helper skills are always level 0.
  function evalRecord(g, b, blvl, lvl, depth) {
    return createGameEval(g, game.variables, {
      blvl,
      lvl,
      ulvl: b.level,
      missiles: game.missiles,
      // The skill's maximum level, for maxe; worked out only when a formula reads it.
      get maxLevel() {
        const id = byGameId.get(g.gameId);
        return id && b.points ? maxLevel(b, id) : undefined;
      },
      resolve(kind, ref, name) {
        // Hard points in the class's nth skill tree (Death Pact: "Based on Points in the
        // Crossbow Tree" reads func10(4); Crossbow is the Necromancer's 4th tree).
        if (kind === "tab") {
          const tab = tabsByClass[b.cls]?.[ref - 1];
          return { value: tab ? tabPoints(b, tab) : 0, label: `points in the ${tab ?? `tree ${ref}`} tree` };
        }
        if (kind === "stat") {
          // Life and mana (D2 stats 6-9: current and maximum life, current and maximum mana),
          // stored in 256ths as Solar Flare's "stat(stat 8) / 256 / 40" shows. Confluence ("Mind
          // Flay is stronger when you are healthy") reads current over maximum life. Assumed:
          // full life and mana.
          if (ref >= 6 && ref <= 9) {
            const life = ref < 8, v = b.charStats?.[life ? "life" : "mana"];
            return typeof v === "number"
              ? { value: v * 256, label: `${ref % 2 ? "maximum" : "current"} ${life ? "life" : "mana"} ×256 (character sheet${ref % 2 ? "" : ", assuming full"})` }
              : undefined;
          }
          const key = ATTRIBUTE_STATS[ref];
          if (key) {
            const statKey = ref < 4 && name === 1 ? `base_${key}` : key;
            return b.charStats ? { value: b.charStats[statKey] ?? b.charStats[key] ?? 0, label: `${statKey} (character sheet)` } : undefined;
          }
          // Other stats come from the passive skills the character has learned (D2): the
          // sum of their passive-stat formulas for this stat. Items and buffs aren't counted.
          if (depth > 3) return undefined;
          let value = 0;
          const from = [];
          for (const n of nodes(b)) {
            const lv = pts(b, n.id);
            const pg = skills[n.id]?.game;
            if (!lv || !pg?.passive?.some((p) => p.stat === ref)) continue;
            const r = evalRecord(pg, b, lv, levelOf(b, n.id, lv), depth + 1).passive(ref);
            if (!r.ok) throw new Error(`stat ${ref} from ${skillName(n.id)}: ${r.reason}`);
            value += r.value;
            from.push(`${skillName(n.id)} ${r.value}`);
          }
          return { value, label: from.length ? `from ${from.join(", ")}` : "no learned skill grants it (items and buffs aren't counted)" };
        }
        if (depth > 4) return undefined;
        const other = byGameId.get(ref);
        const helper = other ? null : game.helpers?.[ref];
        if (!other && !helper) return undefined;
        const ob = other ? pts(b, other) : 0;
        const ol = ob > 0 ? ob + (b.soft?.[other] || 0) : 0;
        const who = other ? skillName(other) : `helper skill ${ref}`;
        // A skill the character hasn't learned is read at level 0: its per-level values are 0
        // (gamecalc.js), its fixed ones still count. In game: Snake Bite's poison ignores
        // Gladiator's Dominance's clc3 (ln56 / 2, per level); Night Hawks gets Grim Vision's
        // base +20% (par3, GitHub issue #29); Frigid Nova gets Witch Blood's clc2, which is
        // Character Level and Energy, not skill level (all six readings, 2026-09-30).
        // A variable the planner can't work out fails the whole formula (shown as
        // missing) rather than silently counting as 0.
        let e, v;
        try {
          e = evalRecord(other ? skills[other].game : helper, b, ob, ol, depth + 1);
          v = e.variable(name);
        } catch (err) {
          throw new Error(`${who}'s ${name}: ${err.message}`);
        }
        const assumed = Object.keys(e.assumed());
        const where = other ? `at level ${ol}${ol ? "" : " (not learned)"}` : "(fixed value)";
        return { value: v, label: `${who} ${name} ${where}${assumed.length ? `, assuming ${assumed.join(", ")} = 0` : ""}` };
      },
    });
  }
  function gameEval(b, id, blvl = pts(b, id)) {
    const g = skills[id]?.game;
    if (!g || !game) return null;
    return evalRecord(g, b, blvl, levelOf(b, id, blvl), 0);
  }
  // A tooltip line's evaluator. Once the skill is learned, the game's tooltip works out its
  // "extra" block (the lines above Current Skill Level) one level ahead: Mana Pulse at 1/1
  // shows "+50 bonus cold damage to attack", its level-2 value (level 1 is 28), and Fire
  // Elementals at level 1 shows the Cooldown of 6 Spirits (2.4 seconds) under "Spirits: 5",
  // while its unlearned First Level shows 2 seconds (GitHub issue #30). That's how the
  // tooltip is drawn, not what the skill does, so only a tooltip as shown (b.asShown, set by
  // describe) reads it; every calculation reads the current level.
  function lineEval(b, id, blvl, block) {
    const g = skills[id]?.game;
    if (!g || !game) return null;
    return evalRecord(g, b, blvl, levelOf(b, id, blvl) + (b.asShown && block === "extra" && blvl > 0 ? 1 : 0), 0);
  }
  // Effective Level. An unlearned skill's tooltip ("First Level") is Base Level 0 at
  // level 1: the game shows Askari Lightning's (299 + lvl) × (100 + blvl) / 100 as 300%.
  const levelOf = (b, id, blvl) => (blvl > 0 ? blvl + (b.soft?.[id] || 0) : 1);
  const levelInputs = (b, id, blvl) => ({ blvl, lvl: levelOf(b, id, blvl), ulvl: b.level });
  // ---------- In-game evidence. Every line an in-game screenshot shows (data.fixtures) that the
  // planner reproduces exactly supports each gap it relies on (a formula variable, operator,
  // line format or display rule); a line with the same label that doesn't match counts
  // against them. A gap with two or more different matching lines and nothing against it is
  // confirmed, and says by which screenshots. Worked out once, on first use.
  let evidence = null, collecting = false;
  function gapEvidence() {
    const found = new Map(); // gap → { for: Map(text → fixture id), against: Set(fixture id) }
    const tally = (gap) => found.get(gap) ?? (found.set(gap, { for: new Map(), against: new Set() }), found.get(gap));
    for (const f of data.fixtures || []) {
      if (!skills[f.skill]) continue;
      const input = (k) => f.inputs[k].value;
      const b = { cls: skills[f.skill].class, level: input("ulvl"), points: { ...(f.inputs.points?.value || {}), [f.skill]: input("blvl") },
        soft: { [f.skill]: input("lvl") - input("blvl") }, quests: {}, buffs: [], charStats: f.inputs.charStats?.value };
      const readings = [[b, input("blvl"), f.otherLines, f.synergyText]];
      if (f.nextLines) {
        const nb = input("blvl") + f.nextLevel.blvl, nl = input("lvl") + f.nextLevel.lvl;
        readings.push([{ ...b, points: { ...b.points, [f.skill]: nb }, soft: { [f.skill]: nl - nb } }, nb, f.nextLines, null]);
      }
      for (const [rb, blvl, shown, synergyShown] of readings) {
        let lines = [];
        try {
          lines = [...describe(rb, f.skill, blvl).effect, ...(synergyShown ? synergies(rb, f.skill, blvl)?.lines || [] : [])];
        } catch { continue; }
        // A recorded difference that's layout only (sameValue: Snake Bite's "over 1.8 seconds" on
        // its own line) counts as a match; one in the value counts against.
        const layout = new Map((f.knownDifferences || []).filter((k) => k.sameValue).map((k) => [k.game, k.planner]));
        const byLabel = new Map([...(shown || []), ...(synergyShown || [])].map((t) => [lineLabel(layout.get(t) ?? t), layout.get(t) ?? t]));
        for (const l of lines) {
          const game = byLabel.get(lineLabel(l.text));
          if (game == null) continue;
          const match = game.toLowerCase() === String(l.text).toLowerCase();
          for (const p of l.parts || [])
            for (const gap of p.source?.rawGaps || p.source?.gaps || []) {
              const t = tally(gap);
              if (match) t.for.set(l.text, f.id);
              else t.against.add(f.id);
            }
        }
      }
    }
    return found;
  }
  const confirmedGap = (gap) => {
    const t = evidence?.get(gap);
    return !!t && t.for.size >= 2 && !t.against.size;
  };
  // The gaps a provenance note stands for, so a confirmed gap's note goes with it.
  function gapsOfNote(n) {
    const vars = /^Uses formula variables not yet checked in game: (.*)$/.exec(n);
    if (vars) return vars[1].split(", ").map((v) => `variable:${v}`);
    const ops = /^Uses formula operators decoded by inference, not yet checked in game: (.*)$/.exec(n);
    if (ops) return ops[1].split(", ").map((o) => `operator:${o}`);
    if (/^Reads other skills or stats through formula functions/.test(n)) return ["function:reference"];
    const g = noteGap(n);
    return g === "missing" ? [] : [g];
  }
  // Takes out the gaps in-game screenshots confirm, saying which; keeps the raw list (rawGaps).
  function withEvidence(source) {
    if (!evidence && !collecting) {
      collecting = true;
      try { evidence = gapEvidence(); } finally { collecting = false; }
    }
    const rawGaps = source.rawGaps || source.gaps;
    const confirmed = rawGaps.filter(confirmedGap);
    if (!confirmed.length) return { ...source, rawGaps };
    const gaps = rawGaps.filter((g) => !confirmedGap(g));
    const ids = [...new Set(confirmed.flatMap((g) => [...evidence.get(g).for.values()]))];
    const notes = [...source.notes.filter((n) => { const own = gapsOfNote(n); return !own.length || own.some((g) => gaps.includes(g)); }),
      `Checked against ${ids.length} in-game screenshot${ids.length > 1 ? "s" : ""}: ${ids.slice(0, 4).join(", ")}${ids.length > 4 ? ", …" : ""}`];
    const status = source.status === "game-inferred" && !gaps.length ? "game" : source.status;
    return { ...source, rawGaps, gaps, notes, status };
  }
  function gameSource(e, inputs, formula, notes = []) {
    const unconfirmed = e.unconfirmed();
    const resolved = e.resolved();
    const n = [...notes];
    if (unconfirmed.length) n.push(`Uses formula variables not yet checked in game: ${unconfirmed.join(", ")}`);
    const ops = e.inferred();
    if (ops.length) n.push(`Uses formula operators decoded by inference, not yet checked in game: ${ops.join(", ")}`);
    if (Object.keys(resolved).length) n.push("Reads other skills or stats through formula functions whose meaning is inferred");
    const gaps = [...unconfirmed.map((v) => `variable:${v}`), ...ops.map((o) => `operator:${o}`),
      ...(Object.keys(resolved).length ? ["function:reference"] : []), ...notes.map(noteGap)];
    return withEvidence({ status: n.length ? "game-inferred" : "game", from: datasets.game.label, formula, inputs, assumed: e.assumed(), resolved, notes: n, gaps });
  }
  // What a screenshot would need to confirm, as a stable key: a line format, a formula
  // variable or operator, or a display rule (shared when several skills rely on it).
  const FORMAT_NOTE = /^Line format \(type (\d+)\) inferred/;
  function noteGap(note) {
    const f = FORMAT_NOTE.exec(note);
    if (f) return `format:${f[1]}`;
    if (/^Formula can't be evaluated/.test(note)) return "missing";
    return `rule:${note.split(":")[0]}`;
  }
  const seconds = (frames) => frames / 25; // D2: 25 frames per second
  // A tooltip value computed from the game's own formulas: null when the game files
  // have nothing for this key, { failed } when they do but it can't be evaluated.
  function gameLine(b, id, key, blvl) {
    const g = skills[id]?.game;
    if (!g || !game) return null;
    const e = gameEval(b, id, blvl);
    const inputs = levelInputs(b, id, blvl);
    const calcText = (st) => {
      const c = g.passive.find((p) => p.stat === st)?.calc;
      return `stat ${st} = ${c?.text || `(${c?.undecoded || "none"})`}`;
    };
    const elemText = () => {
      const x = g.elem;
      return [
        `${x.type} table: min ${x.min} + [${x.minLev}] per level, max ${x.max} + [${x.maxLev}] per level (levels 2–8, 9–16, 17–22, 23–28, 29+)`,
        `damage synergy % = ${x.synergy?.text || x.synergy?.undecoded || "none"}`,
        `× 2^${x.hitShift} ÷ 256 (HitShift)`,
      ];
    };
    const W = WEAPON_POISON_STATS;
    try {
      // Mana cost from the game's own mana formula (matches the in-game tooltips of
      // Incineration Trap, Askari Lightning, Discharge, Lava Pit and Blood Skeleton).
      if ((key === "mana_cost" || key === "minion_mana_cost") && g.mana?.base) {
        const mana = e.variable("mana");
        return {
          values: [mana],
          text: `Mana Cost: ${mana}`,
          source: gameSource(e, inputs, [
            `mana = (${g.mana.base.text} + ${g.mana.perLevel?.text ?? 0} × (lvl − 1)) × 2^${g.mana.shift} ÷ 256`,
            'Mana cost is floored at zero.',
          ]),
        };
      }
      const stat = STAT_IDS[key];
      if (stat && g.passive.some((p) => p.stat === stat)) {
        const r = e.passive(stat);
        if (!r.ok) return { failed: r.reason };
        // The game's own line for this passive (its formula is "pstN"), in the game's words.
        const slot = g.passive.find((p) => p.stat === stat).slot;
        const line = slot && (g.lines || []).find((l) => l.calcA?.text === `pst${slot}` && !l.calcB && LINE_TYPES[l.type]?.confirmed);
        const text = line ? formatLine(line, r.value).text : undefined;
        return { values: [r.value], text, source: gameSource(e, inputs, [calcText(stat)]) };
      }
      if (key === "poison_dot" && g.passive.some((p) => p.stat === W.min)) {
        const rs = [W.min, W.max, W.length].map((st) => e.passive(st));
        const bad = rs.find((r) => !r.ok);
        if (bad) return { failed: bad.reason };
        const [mn, mx, len] = rs.map((r) => r.value);
        return {
          label: "Poison Damage to Weapon",
          values: [poisonTotal(mn, len), poisonTotal(mx, len), seconds(len)],
          source: gameSource(e, inputs, [
            calcText(W.min), calcText(W.max), calcText(W.length), ...elemText(),
            `length frames = ${g.elem.len} + [${g.elem.lenLev}] per level (levels 2–8, 9–16, 17+)`,
            "shown: per-frame × frames ÷ 256, over frames ÷ 25 seconds",
          ]),
        };
      }
      if (key === "poison_dot" && g.elem?.type === "poison") {
        // Total = table × (100 + synergy)% × 2^HitShift ÷ 256 × frames, rounded down once:
        // Snake Bite in game (58706 over 1.8 seconds at level 20, 59691 at 21).
        const len = e.variable("edln");
        const [mn, mx] = ["min", "max"].map((w) => Math.trunc(e.elementalExact(w) * len));
        // One number when min and max are equal ("Poison Damage: 58706", Snake Bite).
        const secs = String(Math.trunc((len * 10) / 25) / 10);
        return {
          values: [mn, mx, seconds(len)],
          text: mn === mx ? `Poison Damage: ${mn} over ${secs} seconds` : undefined,
          source: gameSource(e, inputs, [...elemText(), "shown: per-frame × frames, rounded once, over frames ÷ 25 seconds"],
            ["The skill's own poison: its total confirmed in game for Snake Bite"]),
        };
      }
      if (ELEMENT_KEYS[key] && g.elem?.type === ELEMENT_KEYS[key]) {
        // The skill's own tooltip line for this damage gives the display formula and
        // format (e.g. Incineration Trap: "Fire Damage: edmn-edmx per second").
        // Failing that, a one-value line in a format confirmed in game (Egg Trap: "+94 bonus
        // lightning damage to attack" is edmx; GitHub issue #24).
        const levelLines = (g.lines || []).filter((l) => l.block === "level" && l.calcA);
        const line = levelLines.find((l) => l.calcB && /\bedm[nx]\b/.test(`${l.calcA.text} ${l.calcB.text}`))
          || levelLines.find((l) => !l.calcB && LINE_TYPES[l.type]?.confirmed && /^edm[nx]$/.test(l.calcA.text.trim()));
        if (line) {
          const a = e.calc(line.calcA), c = line.calcB ? e.calc(line.calcB) : a;
          const bad = [a, c].find((r) => !r.ok);
          if (bad) return { failed: bad.reason };
          const f = formatLine(line, a.value, c.value);
          const notes = f.format === "confirmed" ? [] : [`Line format (type ${line.type}) inferred from its text; not yet seen in game`];
          return {
            values: [a.value, c.value],
            text: f.text,
            source: gameSource(e, inputs, [...elemText(), line.calcB ? `shown: ${line.calcA.text} to ${line.calcB.text}` : `shown: ${line.calcA.text}`], notes),
          };
        }
        // No damage line of its own: the raw value, as Median XL's tooltips show edmn/edmx.
        const [mn, mx] = ["edmn", "edmx"].map((v) => e.variable(v));
        // No damage: the game shows no damage line (Discharge's First Level).
        if (mn === 0 && mx === 0) return { hidden: true };
        // Equal min and max show as one number ("Lightning Damage: 15", Askari Lightning).
        const label = (data.stats[key]?.format || "").replace(/:.*$/, "");
        return {
          values: AVERAGE_KEYS.has(key) ? [Math.trunc((mn + mx) / 2)] : [mn, mx],
          text: mn === mx && label && !AVERAGE_KEYS.has(key) ? `${label}: ${mn}` : undefined,
          // Display confirmed in game: Stormcall, Askari Lightning and Mind Flay show it this way.
          source: gameSource(e, inputs, [...elemText(), "shown as the raw damage value (as in game: Stormcall, Askari Lightning, Mind Flay)"]),
        };
      }
      // Physical damage from the skill's physical table, unless the game has its own
      // line for this value (Veneration of Justice: " Bonus Physical Damage").
      if (PHYSICAL_KEYS.has(key) && (g.phys?.min > 0 || g.phys?.max > 0) && !gameNamedLine(b, id, key, blvl)?.values) {
        const [mn, mx] = ["pdmn", "pdmx"].map((v) => e.variable(v));
        const x = g.phys;
        // Equal min and max show as "+N" ("Physical Damage: +2", Mind Flay in game).
        const label = (data.stats[key]?.format || "").replace(/:.*$/, "");
        return {
          values: [mn, mx],
          text: mn === mx && label ? `${label}: +${mn}` : undefined,
          source: gameSource(
            e,
            inputs,
            [
              `physical table: min ${x.min} + [${x.minLev}] per level, max ${x.max} + [${x.maxLev}] per level (levels 2–8, 9–16, 17–22, 23–28, 29+)`,
              `damage synergy % = ${x.synergy?.text || x.synergy?.undecoded || "none"}`,
              `× 2^${g.elem?.hitShift ?? 8} ÷ 256 (HitShift)`,
              "shown as the raw value, and as +N when min and max are equal (as in game: Mind Flay, levels 1–3)",
            ],
          ),
        };
      }
    } catch (err) {
      return { failed: err.message };
    }
    return null;
  }
  // The game's own tooltip line with the same name as a MedianDB value ("Activation
  // Delay: " for activation_delay), evaluated and formatted as the game shows it. Only
  // line types with a known format are used; the rest stay with MedianDB.
  const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z]/g, "");
  // A tooltip line's label without its numbers ("Attack Rating"), to pair lines for one value.
  const lineLabel = (t) => norm(String(t).replace(/\([^)]*\)/g, "").replace(/[-+?\d.%]+/g, " ").replace(/\b(seconds?|yards?|hit points)\b/gi, ""));
  function gameNamedLine(b, id, key, blvl) {
    const g = skills[id]?.game;
    // Match on MedianDB's internal name and on the label it displays: "Life flat" is shown
    // as "Life: …" (names carry placeholders, e.g. "Activation delay: # seconds").
    const stat = data.stats[key];
    const names = new Set([stat?.name, stat?.format].map((t) => norm(t?.replace(/[:#{].*$/, ""))).filter(Boolean));
    for (const a of KEY_ALIASES[key] || []) names.add(a);
    // "Minions" is labelled per skill in MedianDB's row ("Skeletons", "Spirits").
    if (key === "minions") {
      const label = constantRow(id, key, 0)?.values?.[0];
      if (label) names.add(norm(label));
    }
    if (!g || !game || !names.size) return null;
    // The label can be in either text ("… bonus cold damage to attack" is the second).
    const line = (g.lines || []).find(
      (l) => l.calcA && LINE_TYPES[l.type] && (names.has(norm(l.textA)) || (!norm(l.textA) && names.has(norm(l.textB)))),
    );
    if (!line) {
      // A value the game's tooltip states as fixed text.
      const fixed = [...names].map((n) => staticValues(g).get(n)).find(Boolean);
      if (!fixed) return null;
      return {
        values: [fixed.value],
        text: fixed.text,
        source: {
          status: "game", from: datasets.game.label, formula: [`fixed text on the game's tooltip: "${fixed.text}"`],
          inputs: levelInputs(b, id, blvl), assumed: {}, resolved: {}, notes: [],
        },
      };
    }
    const e = lineEval(b, id, blvl, line.block);
    const a = e.calc(line.calcA), c = line.calcB ? e.calc(line.calcB) : { ok: true, value: null };
    const bad = [a, c].find((r) => !r.ok);
    if (bad) return { failed: bad.reason };
    const f = formatLine(line, a.value, c.value);
    if (f.header) return null;
    // The game doesn't show this line now (e.g. worth 0): neither should the planner.
    if (f.hidden) return { hidden: true };
    // "Enemy Elemental Resistances: -" + 20: the sign is in the text, not the value.
    const sign = /-\s*$/.test(line.textA) ? -1 : 1;
    const notes = f.format === "confirmed" ? [] : [`Line format (type ${line.type}) inferred from its text; not yet seen in game`];
    return {
      values: [a.value * sign, c.value],
      text: f.text,
      source: gameSource(e, levelInputs(b, id, blvl), [`value = ${line.calcA.text}`, line.calcB && `second value = ${line.calcB.text}`].filter(Boolean), notes),
    };
  }
  // In-game tooltip observations (data/game/<patch>/fixtures.json): per skill, which
  // keys the game formulas reproduce exactly at the observed inputs.
  const fixtureResults = new Map();
  function fixtureCheck(id) {
    if (fixtureResults.has(id)) return fixtureResults.get(id);
    const out = {};
    for (const f of data.fixtures || []) {
      if (f.skill !== id) continue;
      const blvl = f.inputs.blvl.value, lvl = f.inputs.lvl.value, ulvl = f.inputs.ulvl.value;
      for (const [when, observed] of Object.entries(f.observed)) {
        // The fixture records how the tooltip's Next Level block steps the levels.
        const step = when === "next" ? f.nextLevel || { blvl: 1, lvl: 1 } : { blvl: 0, lvl: 0 };
        const bl = blvl + step.blvl, l = lvl + step.lvl;
        const probe = {
          cls: skills[id].class, level: ulvl, quests: {},
          points: { ...(f.inputs.points?.value || {}), [id]: bl }, soft: { [id]: l - bl },
          charStats: f.inputs.charStats?.value,
        };
        for (const [key, expected] of Object.entries(observed)) {
          const got = gameLine(probe, id, key, bl)?.values ?? null;
          const ok = !!got && expected.every((v, i) => got[i] === v);
          const prev = out[key];
          out[key] = {
            fixture: f.id, source: f.source, ok: (prev ? prev.ok : true) && ok,
            checks: [...(prev?.checks || []), { when, blvl: bl, lvl: l, ulvl, expected, got }],
          };
        }
      }
    }
    fixtureResults.set(id, out);
    return out;
  }
  // The game's own tooltip lines of one block ("extra" or "synergy"), each formula
  // evaluated for the build. Static text with several lines becomes one entry per line
  // (Blood Skeleton's synergies); a formatted value keeps its lines together (Death
  // Pact's "+34 to Mana / (Based on Points in the Totem Tree) / Scholar").
  // D2 text colour codes on tooltip lines (skill.game.lines[].colour), by name for the UI.
  const COLOURS = { 0: "white", 1: "red", 2: "green", 3: "blue", 4: "gold", 5: "grey", 6: "black", 7: "tan", 8: "orange", 9: "yellow", ":": "darkgreen", ";": "purple" };
  // A section heading inside a block: the game's own header line (type 40, drawn gold), or a
  // coloured title of a few words with no numbers (Mind Flay's orange "Shock", gold "Synergies").
  const isHeading = (l, text) => l.type === 40 || (!!l.colour && !/\d/.test(text) && /^[A-Z]/.test(text) && text.trim().split(/\s+/).length <= 3);
  function gameBlock(b, id, blvl, block, observed = new Set()) {
    const g = skills[id]?.game;
    const inputs = levelInputs(b, id, blvl);
    let title = null;
    const lines = [];
    for (const l of (g?.lines || []).filter((x) => x.block === block)) {
      // One evaluator per line, so each line lists only its own inputs and assumptions.
      const e = lineEval(b, id, blvl, l.block);
      const value = (c) => {
        if (!c) return { value: null };
        const r = e.calc(c);
        return r.ok ? { value: r.value } : { value: null, failed: r.reason };
      };
      const a = value(l.calcA), c = value(l.calcB);
      const f = formatLine(l, a.value, c.value);
      if (f.header) {
        title ??= f.header;
        lines.push({ text: f.header, heading: true, colour: COLOURS[l.colour ?? "4"], status: "ok", parts: [], header: true });
        continue;
      }
      if (f.hidden) continue;
      const colour = l.colour != null ? COLOURS[l.colour] : undefined;
      if (!l.calcA && !l.calcB && isHeading(l, f.text || "")) {
        lines.push({ text: f.text, heading: true, colour, status: "ok", slot: l.slot, parts: [] });
        continue;
      }
      const failed = [a, c].find((x) => x.failed)?.failed;
      const formula = [l.calcA && `value = ${l.calcA.text || l.calcA.undecoded}`, l.calcB && `second value = ${l.calcB.text || l.calcB.undecoded}`].filter(Boolean);
      const source = gameSource(e, inputs, formula, failed ? [`Formula can't be evaluated: ${failed}`] : []);
      source.notes.push(f.format === "confirmed" ? `Line format confirmed by ${f.confirmedBy}` : `Line format (type ${l.type}) inferred from its text; not yet seen in game`);
      if (f.format !== "confirmed") Object.assign(source, withEvidence({ ...source, rawGaps: undefined, gaps: [...(source.rawGaps || source.gaps), `format:${l.type}`] }));
      if (failed) source.status = "missing";
      else if (f.format === "inferred") source.status = "game-inferred";
      const texts = l.calcA || l.calcB ? [f.text] : f.lines || [f.text];
      for (const text of texts) {
        // A line of fixed text ending in a colon heads what follows ("While Backstabbing:").
        if (!l.calcA && !l.calcB && /^[^\d]+:$/.test(text.trim())) {
          lines.push({ text, heading: true, colour, status: "ok", slot: l.slot, parts: [] });
          continue;
        }
        const seen = !failed && observed.has(text);
        const src = seen ? { ...source, status: "verified", notes: [...source.notes, "Matches the in-game tooltip text"] } : source;
        lines.push({ text, colour, status: failed ? "unknown" : "ok", trust: src.status, slot: l.slot, parts: [{ key: block, values: [a.value, c.value], source: src }] });
      }
    }
    return { title, lines };
  }
  // ---------- Synergies: the game's own synergy block (skilldesc lines 10-16) with each
  // formula evaluated for the build, plus what the damage/length synergy formulas add now.
  const SYNERGY_KEY = "synergy";
  function synergies(b, id, blvl = pts(b, id)) {
    const g = skills[id]?.game;
    if (!g || !game) return null;
    const inputs = levelInputs(b, id, blvl);
    const observed = new Set((data.fixtures || []).filter((f) => f.skill === id).flatMap((f) => f.synergyText || []));
    const block = gameBlock(b, id, blvl, "synergy", observed);
    const title = block.title;
    // The flat list as the game's text reads (the type 40 header is the title, not a line).
    const lines = block.lines.filter((l) => !l.header);
    // What the synergy formulas add at these levels (the text only gives rates).
    const bonus = [];
    const el = g.elem;
    const weaponPoison = el && g.passive.some((p) => p.stat === WEAPON_POISON_STATS.min);
    const damageName = weaponPoison ? "Poison Damage to Weapon" : el?.type ? `${el.type[0].toUpperCase()}${el.type.slice(1)} Damage` : "Damage";
    // Dragon Jaws' untyped elemental record is not its displayed damage. Its
    // physical table carries the character-level and current-mana multipliers.
    const damageSynergy = id === 'dragon_jaws' ? [g.phys?.synergy, 'Physical Damage (including character level)'] : [el?.synergy, damageName];
    for (const [c, what] of [damageSynergy, [el?.lenSynergy, "duration"]]) {
      if (!c) continue;
      const e = gameEval(b, id, blvl);
      const r = e.calc(c);
      // -100% means the skill deals no damage of its own now: nothing to show.
      if (r.ok && r.value <= -100) continue;
      const status = !r.ok ? "missing" : weaponPoison && fixtureCheck(id).poison_dot?.ok ? "verified" : null;
      const source = gameSource(e, inputs, [`synergy % = ${c.text || c.undecoded}`], r.ok ? [] : [`Formula can't be evaluated: ${r.reason}`]);
      if (status) source.status = status;
      if (status === "verified") source.notes.push("Part of the Poison Damage to Weapon calculation that reproduces the in-game tooltip");
      bonus.push({
        text: r.ok ? `${r.value >= 0 ? "+" : ""}${r.value}% ${what} from synergies now` : `${what} bonus from synergies`,
        status: r.ok ? "ok" : "unknown",
        trust: source.status,
        parts: [{ key: SYNERGY_KEY, values: [r.ok ? r.value : null], source }],
      });
    }
    if (!lines.length && !bonus.length) return null;
    // Sections as the game draws them, each under its own coloured heading (Mind Flay:
    // orange "Shock", then gold "Synergies"). Lines before any heading go under "Synergies",
    // unless the game has a heading of its own further down: then they stand untitled above it,
    // as in the game (Death Pact's "bonuses unlock after putting points into the other trees"
    // above its Synergies), rather than under a second "Synergies".
    const sections = [];
    const laterHeading = block.lines.some((l) => l.heading);
    for (const l of block.lines) {
      if (l.heading) sections.push({ title: l.text, colour: l.colour || "gold", lines: [] });
      else (sections.at(-1) ?? sections[sections.push({ title: laterHeading ? "" : title || "Synergies", colour: "gold", lines: [] }) - 1]).lines.push(l);
    }
    // What the synergy formulas add now belongs with the synergies.
    if (bonus.length) {
      const syn = sections.findLast((x) => /synerg/i.test(x.title)) ?? sections.at(-1) ?? sections[sections.push({ title: "Synergies", colour: "gold", lines: [] }) - 1];
      syn.bonus = bonus;
    }
    return { title: title || "Synergies", lines, bonus, sections };
  }

  // ---------- What a skill's damage scales with, read from its game formulas: the damage
  // synergy (elemental and physical) and the tooltip's damage lines. Collects the character
  // stats they read (stat ids) and the skills they read: a skill's level (a synergy, as
  // "skill(x).blvl × 20") or its damage (Askari Lightning reads Stormcall's enma/exma,
  // whose own synergy reads Energy and Spell Focus: followed one step).
  const DAMAGE_VARS = /^(edmn|edmx|enma|exma|pdmn|pdmx|edln)$/;
  function formulaRefs(calc) {
    const out = { stats: [], skills: [] };
    if (!calc?.code) return out;
    const bytes = [];
    for (let i = 0; i < calc.code.length; i += 2) bytes.push(parseInt(calc.code.substr(i, 2), 16));
    const d = decodeCalc(bytes);
    if (!d.ok) return out;
    d.tokens.forEach((t, i) => {
      if (t.op !== "func") return;
      const fn = FUNCTIONS[t.arg].name;
      const a = d.tokens[i - 2]?.arg, v = d.tokens[i - 1]?.arg;
      if (fn === "statref" && a != null) out.stats.push(a);
      if (fn === "skillref" && a != null) out.skills.push({ gameId: a, variable: game?.variables[v]?.trim() });
    });
    return out;
  }
  const scalingCache = new Map();
  function skillScaling(id, depth = 0) {
    if (scalingCache.has(id) && depth === 0) return scalingCache.get(id);
    const g = skills[id]?.game;
    const out = { stats: new Set(), skills: new Map() };
    if (!g) return out;
    const damageLine = (l) => l.block === "level" && [l.calcA, l.calcB].some((c) => /\b(edm[nx]|enma|exma|pdm[nx]|pst\d)\b/.test(c?.text || ""));
    const formulas = [g.elem?.synergy, g.phys?.synergy, ...(g.lines || []).filter(damageLine).flatMap((l) => [l.calcA, l.calcB])];
    for (const c of formulas) {
      const r = formulaRefs(c);
      r.stats.forEach((st) => out.stats.add(st));
      for (const ref of r.skills) {
        const other = byGameId.get(ref.gameId);
        if (!other || other === id) continue;
        out.skills.set(other, DAMAGE_VARS.test(ref.variable || "") ? "damage" : out.skills.get(other) || "level");
        // Reading another skill's damage: what that damage scales with counts too.
        if (DAMAGE_VARS.test(ref.variable || "") && depth < 1) skillScaling(other, depth + 1).stats.forEach((st) => out.stats.add(st));
      }
    }
    if (depth === 0) scalingCache.set(id, out);
    return out;
  }

  // Provenance, least trusted first. A line's trust is its least trusted value's.
  const TRUST = ["missing", "community", "game-inferred", "matches-game", "game", "verified"];

  // ---------- Tooltip text
  const constantRow = (id, key, occ) => {
    const rows = (skills[id]?.constants || []).filter((c) => c.key === key && c.occ === occ);
    return rows.find((r) => !r.variant) || rows[0] || null;
  };
  // One tooltip value with its provenance: the game-file formula where one exists and
  // evaluates, otherwise MedianDB's formula, otherwise { missing }.
  function lineValue(b, id, key, occ, blvl) {
    const row = constantRow(id, key, occ) || (occ > 0 ? constantRow(id, key, 0) : null);
    let g = occ === 0 ? gameLine(b, id, key, blvl) : null;
    if (g?.hidden) return { hidden: true };
    // A value of 0 is shown only if the game's own tooltip line would show it (Warmth's First
    // Level hides "Cold Resistance: 0%").
    if (occ === 0 && g?.values && g.values[0] === 0 && gameNamedLine(b, id, key, blvl)?.hidden) return { hidden: true };
    if (occ === 0 && !g?.values) {
      const named = gameNamedLine(b, id, key, blvl);
      if (named?.hidden) return { hidden: true };
      if (named?.values || !g) g = named ?? g;
    }
    if (g?.values) {
      const check = fixtureCheck(id)[key];
      const source = { ...g.source, notes: [...g.source.notes] };
      if (check) source.verifiedBy = check;
      // A formatted game line identical to one seen in game (fixtures' otherLines).
      const seen = g.text && (data.fixtures || []).some((f) => f.skill === id && (f.otherLines || []).includes(g.text));
      if (check?.ok) source.status = "verified";
      else if (!check && seen) {
        source.status = "verified";
        source.notes.push("Matches the in-game tooltip text");
      }
      else if (check) {
        source.status = "game-inferred";
        source.notes.push(`Doesn't reproduce in-game observation ${check.fixture}`);
      }
      if (row) source.notes.push(`${row.gameCheck === "matches" ? "MedianDB's formula agrees" : "MedianDB's formula"}: ${row.values[0]}`);
      return { values: g.values.map((value) => ({ value })), label: g.label, text: g.text, row, source };
    }
    if (!row) return g?.failed ? { missing: `Game formula can't be evaluated: ${g.failed}` } : null;
    const notes = [];
    if (g?.failed) notes.push(`Game formula can't be evaluated (${g.failed}), so MedianDB's is used`);
    if (row.gameCheck === "matches") notes.push("Same results as the game formula across Base Levels 1–cap and Character Levels 20–120");
    return {
      values: row.values.map((raw) => slotValue(b, id, raw, blvl, 0)),
      row,
      source: {
        status: row.gameCheck === "matches" ? "matches-game" : "community",
        from: `${datasets.medianDb.label}${datasets.medianDb.commit ? ` @${datasets.medianDb.commit}` : ""}`,
        formula: row.values.filter((v) => String(v ?? "").trim()),
        inputs: levelInputs(b, id, blvl),
        notes,
      },
    };
  }
  // One value slot: number, text label, or null when it can't be worked out.
  function slotValue(b, id, raw, blvl, depth) {
    const v = String(raw ?? "").trim();
    if (!v) return { value: null };
    if (/^-?\d+(\.\d+)?$/.test(v)) return { value: Number(v) };
    const ctx = {
      // slvl: bonus levels from gear (+skills), supplied by the character layer as b.soft.
      vars: { blvl, slvl: blvl > 0 ? b.soft?.[id] || 0 : 0, lvl: levelOf(b, id, blvl), ulvl: b.level },
      skillLevel: (other) => pts(b, other),
      // {{stat}} tokens: character-sheet values (b.charStats), following stats.json aliases.
      stat: b.charStats
        ? (k) => b.charStats[k] ?? b.charStats[data.stats[k]?.paired?.[0]?.[1]] ?? 0
        : undefined,
      skillStat: (other, stat) => {
        if (depth > 8) throw new Error("Formula references nest too deeply");
        const r = constantRow(other, stat, 0);
        const x = r ? slotValue(b, other, r.values[0], pts(b, other), depth + 1) : { value: 0 };
        if (typeof x.value !== "number") throw new Error("Referenced value unavailable");
        return x.value;
      },
      treePoints: (tabId) => nodes(b).reduce((n, s) => n + (s.tab === tabId ? pts(b, s.id) : 0), 0),
    };
    try {
      const r = evaluate(v, ctx);
      return { value: r.value, varies: r.usesStats || r.usesConditions };
    } catch {
      return isPlainText(v) ? { value: v } : { value: null };
    }
  }
  const fmt = (v) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : v);
  function manaCost(vals, lvl) {
    const [mana, lvlmana, shift, min] = vals.map((x) => (typeof x === "number" ? x : 0));
    const base = Math.trunc(mana) + Math.trunc(lvlmana) * (Math.max(1, lvl) - 1);
    const cost = Math.trunc((base * 2 ** shift) / 256);
    return Math.max(vals[3] == null ? 0 : Math.trunc(min), cost);
  }
  // Expands "{{stat}}" placeholders. Returns { text, status, minLevel, trust, parts }:
  // status is "ok", "varies" (depends on stats/conditions), "unknown" or "note"; trust is
  // the least trusted value's provenance (TRUST); parts lists each value with its source.
  function expandLine(b, id, line, blvl, counters) {
    if (/^\s*<<[^>]*>>\s*$/.test(line)) return null;
    const note = /<p\b/i.test(line);
    let status = note ? "note" : "ok";
    let minLevel = null;
    let hidden = false;
    const parts = [];
    let text = line
      .replace(/\{\{(\w+)\}\}/g, (_, rawKey) => {
        const key = rawKey.toLowerCase();
        const occ = (counters[key] = (counters[key] ?? -1) + 1);
        const stat = data.stats[key];
        const format = stat?.format ?? `${key.replace(/_/g, " ")}: {value0}`;
        if (!/\{value\d\}/.test(format)) return format;
        const v = lineValue(b, id, key, occ, blvl);
        if (v?.hidden) {
          hidden = true;
          return "";
        }
        if (!v || v.missing) {
          status = "unknown";
          parts.push({ key, values: null, source: { status: "missing", notes: [v?.missing || "No formula in MedianDB or the game files"] } });
          return (stat?.name || key.replace(/_/g, " ")).replace(/[:#].*$/, "").trim();
        }
        if (v.row?.minLevel) minLevel = v.row.minLevel;
        const vals = v.values;
        if (vals.some((x) => x.varies)) status = status === "unknown" ? status : "varies";
        parts.push({ key, values: vals.map((x) => x.value), source: v.source });
        // The game's own line, already formatted.
        if (v.text) return v.text;
        if (key === "mana_cost") {
          if (typeof vals[0].value !== "number") return (status = "unknown"), "Mana cost";
          return `Mana cost: ${manaCost(vals.map((x) => x.value), levelOf(b, id, blvl))}`;
        }
        let missing = false;
        const shape = v.label ? format.replace(/^[^:{]*:/, `${v.label}:`) : format;
        const out = shape.replace(/\{value(\d)\}/g, (_, i) => {
          const x = vals[i]?.value;
          if (x == null) return (missing = true), "?";
          const shown = fmt(x);
          return stat?.signed && typeof x === "number" && x >= 0 ? `+${shown}` : shown;
        });
        if (missing) status = "unknown";
        return out.replace("{name}", stat?.name || key);
      })
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text || hidden) return null;
    const segments = text.split(/(\[\[[a-z0-9_-]+\]\])/gi).filter(Boolean).map(value => {
      const ref = /^\[\[([a-z0-9_-]+)\]\]$/i.exec(value);
      // The game names an innate skill without the planner's "(Innate)": Shadow Dancer's "Bloodbath".
      return ref ? { text: skillName(ref[1]).replace(/ \(Innate\)$/, ""), skill: ref[1] } : { text: value };
    });
    const heading = /^\s*\[\[[a-z0-9_-]+\]\]\s*:?[\s]*$/i.test(text);
    text = segments.map(s => s.text).join('');
    const trust = parts.length ? parts.map((p) => p.source.status).sort((a, c) => TRUST.indexOf(a) - TRUST.indexOf(c))[0] : null;
    return { text, segments, heading, status: note && status === "ok" ? "note" : status, minLevel, trust, parts };
  }
  // Character stats a skill grants at its current level (stats.json pairedStat),
  // e.g. Warmth's cold resistance. Values that depend on character stats are skipped.
  // Each entry: [stat, value, label, trust] (trust as in TRUST).
  // minionOnly: just the minion bonuses (summoned_minion_*) of a learned skill that isn't a
  // passive or a buff (character.js: Fervor, Apex Predator).
  function skillStatEffects(b, id, { minionOnly = false } = {}) {
    const skill = skills[id];
    if (!skill || !(minionOnly || skill.tags.includes('Passive') || isToggleSkill(skill))) return [];
    if (!skillEquipmentFits(skill, b.charStats)) return [];
    if (id === 'hunger' && !(b.buffs || []).includes('werebear_morph')) return [];
    if (id === 'feral_escalation' && !(b.buffs || []).includes('werewolf_form')) return [];
    const blvl = pts(b, id);
    const soft = b.soft?.[id] || 0;
    if (blvl + soft <= 0 && !isInnate({ ...skill, id })) return [];
    const out = [];
    const rows = (skills[id]?.constants || []).filter((r) => !r.variant).map((r) => [r.key, r.occ, r]);
    // Some skills (Stormlord, Spark of Hope, Tainted Blood) have game formulas
    // and tooltip placeholders but no community constant rows for their effects.
    for (const text of skill.effect || []) for (const match of text.matchAll(/\{\{(\w+)\}\}/g))
      if (!rows.some(r => r[0] === match[1])) rows.push([match[1], 0, null]);
    // Stats the game files give (a pierce or mastery), from them. A MedianDB row for the same
    // stat under another name goes: "Enemy Elemental Resistances" on Dragonlore, beside the
    // game's fire, cold and lightning pierce, would count them twice and add a poison pierce
    // the game doesn't give.
    const outputs = (key) => (SKILL_STAT_PAIRS[key] || data.stats[key]?.paired || []).map(([, k]) => k);
    for (const [key, st] of Object.entries(STAT_IDS)) {
      if (rows.some((r) => r[0] === key) || !skills[id]?.game?.passive.some((p) => p.stat === st)) continue;
      const mine = outputs(key);
      for (let i = rows.length - 1; i >= 0; i--)
        if (!(rows[i][0] in STAT_IDS) && outputs(rows[i][0]).some((k) => mine.includes(k))) rows.splice(i, 1);
      rows.push([key, 0, null]);
    }
    for (const [rowKey, occ, row] of rows) {
      const paired = SKILL_STAT_PAIRS[rowKey] || data.stats[rowKey]?.paired;
      if (!paired) continue;
      if (!allowsSkillEffect(b, id, rowKey, skill)) continue;
      if (row?.minLevel && b.level < row.minLevel) continue;
      const v = lineValue(b, id, rowKey, occ, blvl);
      if (!v || v.missing || v.hidden) continue;
      for (const [slot, key] of paired) {
        const x = v.values[slot];
        if (typeof x?.value !== "number" || x.varies || !x.value) continue;
        // "Enemy Fire Resistance: -10%" means 10% fire pierce; "*_pierce" stats are already positive.
        const value = rowKey.startsWith("enemy_") && key.startsWith("enemy_") ? -x.value : x.value;
        out.push([key, value, data.stats[rowKey].name, v.source.status]);
      }
    }
    // Project otherwise omitted self-passives from the installed game's formulas.
    // Never project a summon record: its passive stats describe the creature.
    if (skill.tags.includes('Passive') && !skill.tags.some(t => ['Summon', 'Special Summon', 'Totem'].includes(t)) && skill.game && game) {
      const e = gameEval(b, id, blvl);
      for (const passive of skill.game.passive) {
        const mapping = PASSIVE_STATS[passive.stat];
        if (!mapping) continue;
        const [key, divisor = 1] = mapping;
        if (out.some(effect => effect[0] === key)) continue;
        // Stance-specific outputs must remain inactive outside their stance.
        if (id === 'bloodthirst' && !allowsSkillEffect(b, id, 'critical_strike_chance', skill)) continue;
        const result = e.passive(passive.stat);
        if (result.ok && Number.isFinite(result.value) && result.value)
          out.push([key, result.value / divisor, key.replace(/_/g, ' '), 'game-inferred']);
      }
    }
    if (id === 'pinnacle') out.push(['total_defense_multiplier', -50, 'Total Character Defense', 'game']);
    if (id === 'ecstatic_frenzy') out.push(['zero_defense', 1, 'Defense set to zero', 'game']);
    const extra = (key, value, name = key.replace(/_/g, ' '), trust = 'game-inferred') => {
      if (Number.isFinite(value) && value) out.push([key, value, name, trust]);
    };
    const gameValue = variable => {
      if (!skill.game || !game) return null;
      try { return gameEval(b, id, blvl).variable(variable); } catch { return null; }
    };
    const value = (key, slot = 0) => {
      const result = lineValue(b, id, key, 0, blvl);
      const x = result?.values?.[slot];
      return typeof x?.value === 'number' && !x.varies ? x.value : null;
    };
    const c = b.charStats;
    if (c) {
      const regen = skill.game?.lines?.find(line => /^Regenerates (\d+)% Life in /i.test(line.textA || '') && line.calcA);
      if (regen && game) {
        const duration = gameEval(b, id, blvl).calc(regen.calcA);
        const pct = Number(/^Regenerates (\d+)%/i.exec(regen.textA)[1]);
        if (duration.ok && duration.value > 0) extra('life_regenerated_per_second',
          Math.min(c.life, id === 'vindicate_innate' ? 15000 : Infinity) * pct / 100 / (duration.value / 25));
      }
      if (id === 'laserblade') {
        const bonus = gameValue('clc1');
        extra('minimum_magic_damage', bonus); extra('maximum_magic_damage', bonus);
      }
      if (id === 'deathlord') extra('defense', gameValue('ast1'));
      if (id === 'nova_charge') extra('energy', gameValue('ast1'));
      if (id === 'paragon') extra('vitality', (value('vitality_bonus_per_gem') || 0) * (c.socketed_gems || 0));
      if (id === 'runemaster') extra('total_defense_multiplier', (value('defense_bonus_multiplier_per_socketed_rune') || 0) * (c.socketed_runes || 0));
      if (id === 'lionheart') {
        const divisor = value('deadly_strike_per_strength', 1);
        if (divisor > 0) extra('deadly_strike', Math.floor(c.strength / divisor));
        extra('attack_rating', Math.floor(c.life * 0.05));
      }
      if (id === 'ice_elementals') {
        extra('cold_spell_damage', gameValue('ast4'));
        extra('maximum_cold_resistance', 5); extra('total_defense_multiplier', 20);
      }
      if (id === 'veneration_of_justice') {
        // Only where its tooltip's Vitality and Energy didn't already give them (counted twice otherwise).
        const bonus = gameValue('ast1');
        if (bonus != null) for (const key of ['vitality', 'energy']) if (!out.some((e) => e[0] === key)) extra(key, Math.max(30, bonus));
      }
    }
    if (id === 'raven_familiar') {
      extra('all_skills', value('all_skills')); extra('cast_speed', 15); extra('percent_energy', 25);
    }
    if (['blight', 'heart_of_stone'].includes(id)) extra('disable_elemental_damage', 1, 'No fire, cold or lightning damage', 'game');
    if (id === 'consecration') extra('disable_fire_damage', 1, 'No fire damage', 'game');
    if (id === 'holy_fire') extra('disable_poison_damage', 1, 'No poison damage', 'game');
    // Death Pact's game tooltip exposes tree-based bonuses without community rows.
    // Its poison mastery is already projected through STAT_IDS above.
    if (id === 'death_pact') {
      const amount = gameValue('clc1');
      for (const element of ['fire', 'cold', 'lightning']) extra(`${element}_spell_damage`, amount, 'Spell Damage');
      extra('physical_magic_spell_damage', amount, 'Spell Damage');
    }
    return minionOnly ? out.filter((effect) => effect[0].startsWith('summoned_minion_')) : out;
  }
  // Weapon poison a skill grants through D2's poisonmindam/maxdam/length passives (Way
  // of the Spider): per-frame damage in 1/256 units and frames. Null when there is none.
  function weaponPoison(b, id) {
    const g = skills[id]?.game;
    const blvl = pts(b, id);
    const W = WEAPON_POISON_STATS;
    if (!g?.passive.some((p) => p.stat === W.min) || blvl + (b.soft?.[id] || 0) <= 0) return null;
    const e = gameEval(b, id, blvl);
    const rs = [W.min, W.max, W.length].map((st) => e.passive(st));
    if (rs.some((r) => !r.ok)) return null;
    const [min, max, frames] = rs.map((r) => r.value);
    const status = fixtureCheck(id).poison_dot?.ok ? "verified" : gameSource(e, levelInputs(b, id, blvl), []).status;
    return { min, max, frames, total: [poisonTotal(min, frames), poisonTotal(max, frames)], seconds: seconds(frames), status };
  }
  // Level breakdown for the UI: Base Level (hard points), bonus levels from gear,
  // Effective Level, Character Level, and the cap and required level with their sources.
  function levels(b, id) {
    const base = pts(b, id), bonus = b.soft?.[id] || 0;
    return {
      base, bonus, effective: base + bonus, character: b.level,
      cap: maxLevel(b, id), capSource: capSource(id), required: requiredLevelSource(id, b),
    };
  }
  // A skill's evaluated scaling values at its current points (plus gear levels),
  // keyed by stat ("weapon_damage", "converts_phys_to_fire", …; repeats get "#1", "#2").
  function skillValues(b, id, blvl = pts(b, id)) {
    const out = {};
    const rows = [...(skills[id]?.constants || [])];
    for (const text of skills[id]?.effect || []) for (const match of text.matchAll(/\{\{(\w+)\}\}/g))
      if (!rows.some(row => row.key === match[1])) rows.push({ key: match[1], occ: 0 });
    for (const row of rows) {
      if (row.variant || (row.minLevel && b.level < row.minLevel)) continue;
      const result = lineValue(b, id, row.key, row.occ, blvl);
      if (result?.values) out[row.key + (row.occ ? `#${row.occ}` : "")] = result.values.map(v => v.value);
    }
    // Elemental damage an attack's game tooltip shows but MedianDB has no value for (Mana
    // Pulse's " bonus cold damage to attack", Primordial Strike's "(Current Value: …)",
    // Twisted Claw's cold damage). Evaluated from that tooltip line, so its conditions hold
    // (Fortress: only with points in the skill it reads). Attacks add it to the hit (damage.js).
    const g = skills[id]?.game, type = g?.elem?.type;
    if (type && game && out.weapon_damage && !(`${type}_damage` in out) && !(`bonus_${type}_damage` in out) && !(`bonus_${type}_damage_to_weapons` in out)
      && !(skills[id].tags || []).some((t) => t === "Passive")) {
      const line = (g.lines || []).find((l) => (l.block === "level" || l.block === "extra") && /\bedm[nx]\b/.test(`${l.calcA?.text || ""} ${l.calcB?.text || ""}`));
      if (line?.calcA) {
        const e = gameEval(b, id, blvl);
        const lo = e.calc(line.calcA), hi = line.calcB ? e.calc(line.calcB) : lo;
        if (lo.ok && hi.ok && hi.value > 0) out[`${type}_damage`] = [Math.floor(lo.value), Math.floor(hi.value)];
      }
    }
    return out;
  }
  // asShown: the tooltip as the game draws it (the default, for pages and in-game checks);
  // false for calculations, which need what the skill does at its level (see lineEval).
  // Tooltip lines the game draws itself, not from skilldesc: damage and mana cost.
  const AUTO_LINE_KEYS = [...Object.keys(ELEMENT_KEYS), ...PHYSICAL_KEYS, "poison_dot", "mana_cost", "minion_mana_cost"];
  function describe(b, id, blvl, { asShown = true } = {}) {
    if (asShown && !b.asShown) b = { ...b, asShown: true };
    const s = skills[id];
    const block = (lines) => {
      const counters = {};
      return lines.flatMap((l) => {
        if (id === 'backstab' && l.trim() === '<<backstab_while_backstabbing>>') {
          const bonus = gameBlock(b, id, blvl, 'extra').lines.filter(l => /% Weapon Physical Damage$/.test(l.text));
          return [
            { text: 'While backstabbing:', heading: true, status: 'note', parts: [] },
            { text: '2% Avoid per 5 Base Levels', status: 'ok', parts: [] },
            ...bonus,
          ];
        }
        return expandLine(b, id, l, blvl, counters);
      }).filter(Boolean);
    };
    // MedianDB lines that neither source has a value for and that the game's own tooltip
    // doesn't show (likely stale community data) are listed apart, not as tooltip lines.
    const notInGame = (l) =>
      s.game?.lines?.length &&
      l.status === "unknown" &&
      l.parts.length &&
      l.parts.every((p) => p.source.status === "missing" && /^No formula/.test(p.source.notes[0] || ""));
    // Lines whose text is exactly what the game showed (fixtures) are verified, whichever
    // source computed them (e.g. MedianDB's attack rating for Blood Skeleton).
    const own = (data.fixtures || []).filter((f) => f.skill === id);
    const seen = new Set(own.flatMap((f) => [...(f.otherLines || []), ...(f.nextLines || [])]));
    // Lines the game shows only in a section below (Mind Flay's "Duration: 2 seconds" under
    // Shock), never in the main block, stay in that section only.
    const belowOnly = new Set(own.flatMap((f) => f.synergyText || []).filter((t) => !seen.has(t)));
    const effect = block(s.effect).filter((l) => !(own.length && belowOnly.has(l.text))).map((l) =>
      seen.has(l.text) && l.trust !== "verified"
        ? {
            ...l,
            trust: "verified",
            parts: l.parts.map((p) => ({ ...p, source: { ...p.source, status: "verified", notes: [...(p.source.notes || []), "Matches the in-game tooltip text"] } })),
          }
        : l,
    );
    // The tooltip as shown is the game's own (game files first): its extra block, then its
    // per-level block, each drawn bottom-up as the game does, then the lines the game adds
    // itself rather than from skilldesc (the skill's damage and its Mana Cost), still worked
    // out from the game formulas through MedianDB's keys. MedianDB's own wording is only a
    // fallback, for a skill the game files don't describe. Calculations (asShown: false)
    // keep the keyed lines below.
    if (asShown && s.game?.lines?.length && game) {
      // A game line and MedianDB's line for the same value share a label ("Attack Rating").
      const label = lineLabel;
      const keyed = new Map(effect.filter((l) => l.parts.length === 1).map((l) => [label(l.text), l]));
      // Skill names in the game's text link to the skill, as MedianDB's [[skill]] references do.
      const names = [...nodesByClass[s.class]?.values() || []].map((n) => [skills[n.id].name.replace(/ \(Innate\)$/, ""), n.id]).filter(([n]) => n.length > 3).sort((x, y) => y[0].length - x[0].length);
      const link = (l) => {
        const hit = names.find(([n]) => l.text.includes(n));
        if (!hit) return l;
        const [n, ref] = hit, at = l.text.indexOf(n);
        return { ...l, segments: [{ text: l.text.slice(0, at) }, { text: n, skill: ref }, { text: l.text.slice(at + n.length) }].filter((x) => x.text) };
      };
      // "Unlockable Skill …" text is shown with the skill's unlock requirement, not in its tooltip.
      const drawn = (block) => gameBlock(b, id, blvl, block, seen).lines.filter((l) => !l.header && !/^Unlockable Skill/i.test(l.text)).map((l, i) => [l, i]).sort((x, y) => (y[0].slot ?? 0) - (x[0].slot ?? 0) || x[1] - y[1]).map(([l]) => l).map((l) => {
        const mdb = l.parts.length ? keyed.get(label(l.text)) : null;
        // The game's formula can't be worked out yet (a variable not modelled): MedianDB's
        // value for the same line, if it has one; otherwise the line stays unknown.
        if (l.status === "unknown" && mdb && mdb.status !== "unknown") return link(mdb);
        return link(mdb ? { ...l, parts: l.parts.map((p) => {
          // Fixed text ("Enemy Weapon Damage: -30%") has no formula: MedianDB's number for it.
          const values = p.values.filter((v) => v != null);
          return { ...p, key: mdb.parts[0].key, values: values.length ? values : mdb.parts[0].values };
        }) } : l);
      });
      // Only where the game files have the value: Snake Stance has no poison table of its own (its
      // poison is the game's "Poison Damage to Weapon" line), so MedianDB's "Poison Damage: ?-?" goes.
      const added = block(s.effect.filter((t) => AUTO_LINE_KEYS.some((k) => t.includes(`{{${k}}}`)))).filter((l) => !notInGame(l) && l.status !== "unknown");
      return {
        description: block(s.description),
        restriction: block(s.restriction),
        // A value the game draws a line for itself (Rend's "Physical Damage: +4") isn't added again.
        effect: (() => { const own = [...drawn("extra"), ...drawn("level")], labels = new Set(own.map((l) => lineLabel(l.text)));
          return [...own, ...added.filter((l) => !labels.has(lineLabel(l.text)))]; })(),
        notInGame: [],
      };
    }
    // No MedianDB line renders for this skill (Death Pact lists only sub-entries): the game's own
    // per-level and extra lines instead.
    const fromGame = !effect.length && s.game ? [...gameBlock(b, id, blvl, "level").lines, ...gameBlock(b, id, blvl, "extra").lines].filter((l) => !l.header) : [];
    return {
      description: block(s.description),
      restriction: block(s.restriction),
      effect: [...effect.filter((l) => !notInGame(l)), ...fromGame],
      notInGame: effect.filter(notInGame).map((l) => l.text),
    };
  }

  // ---------- Build sharing: compact, versioned, validated on import
  function encode(b) {
    const json = JSON.stringify({ v: 1, c: b.cls, l: b.level, p: b.points, q: b.quests || {} });
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(str) {
    const json = decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))));
    const o = JSON.parse(json);
    if (o?.v !== 1 || !classNames.includes(o.c)) throw new Error("Not a Runetool skill build");
    const points = {};
    for (const [id, n] of Object.entries(o.p || {}))
      if (nodesByClass[o.c].has(id) && Number.isInteger(n) && n > 0 && n <= MAX_LEVEL) points[id] = n;
    const quests = {};
    for (const [k, v] of Object.entries(o.q || {})) if (typeof v === "boolean" && /^\w+\.(normal|nightmare|hell)$/.test(k)) quests[k] = v;
    return { cls: o.c, level: clampLevel(o.l), points, quests };
  }

  return {
    capConfirmed,
    gameBlock,
    /** In-game evidence per gap: { for: Map(line → screenshot), against: Set(screenshot) }. */
    gapEvidence: () => { if (!evidence) withEvidence({ gaps: [], notes: [] }); return evidence; },
    classNames,
    classes: data.classes,
    tabs: (cls) => tabsByClass[cls] || [],
    treeNodes: (cls, tab) => (data.trees[cls]?.[tab] || []).map((n) => nodesByClass[cls].get(n.id)),
    node,
    // Own keys only: an id from a link ("constructor", "__proto__") isn't a skill.
    skill: (id) => (typeof id === "string" && Object.hasOwn(skills, id) ? skills[id] : undefined),
    skillIds: () => Object.keys(skills),
    skillName,
    isInnate: (id) => isInnate({ ...skills[id], id }),
    questDone,
    questPoints,
    available,
    spent,
    maxLevel,
    maxLevelNotes,
    prereqProblems,
    requiredCharLevel,
    requiredLevelSource,
    unlockOf,
    unlockDifficulty,
    capSource,
    levels,
    weaponPoison,
    synergies,
    /** What a skill's damage scales with: { stats: Set<stat id>, skills: Map<id, "level"|"damage"> }. */
    skillScaling,
    fixtureCheck,
    datasets,
    TRUST,
    restrictionProblems,
    minRequiredLevel,
    buildProblems,
    canAdd,
    canRemove,
    tabPoints,
    describe,
    skillStatEffects,
    skillValues,
    encode,
    decode,
    clampLevel,
    CAP_SOURCES,
  };
}
