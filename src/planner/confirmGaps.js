// What the planner still can't confirm against the game, and which in-game screenshots
// would confirm the most. Each tooltip value carries its provenance (engine.js): values
// read from the game files note the parts not yet seen in game as gaps ("format:2" for a
// tooltip line format, "variable:pst1" for a formula variable, "rule:…" for a display
// rule), and values only MedianDB has are a gap of their own skill. A screenshot of one
// skill's tooltip confirms every gap that skill shows, for all the skills that share it.

const VARIABLE_HELP = {
  pst: (n) => `the skill's passive stat slot ${n} (formula variable pst${n})`,
  ast: (n) => `the skill's aura stat slot ${n} (formula variable ast${n})`,
  syn: (n) => `synergy bonus ${n} (formula variable syn${n})`,
  clc: (n) => `the skill's calculated value ${n} (formula variable clc${n})`,
  ln: (n) => `a per-level table (formula variable ln${n})`,
  bl: (n) => `a per-base-level table (formula variable bl${n})`,
};
const NAMED_VARIABLES = {
  mana: "the mana cost formula (formula variable mana)",
  len: "the skill's duration (formula variable len)",
  rng: "the skill's range or radius (formula variable rng)",
  skcd: "the skill's cooldown (formula variable skcd)",
  pets: "the number of summons (formula variable pets)",
  wdm: "the skill's weapon damage percentage (formula variable wdm)",
  pdmn: "the skill's physical damage table (formula variable pdmn)",
  pdmx: "the skill's physical damage table (formula variable pdmx)",
  mnhp: "a summon's life (formula variable mnhp)",
  mnar: "a summon's armor (formula variable mnar)",
};

// The display rules engine.js notes, in plain words.
const RULE_HELP = [
  [/^Mana modifier formula not applied/, "An extra mana cost adjustment in the game files, which the planner doesn't apply yet"],
  [/^Shown as the raw damage value/, "How the game shows the skill's elemental damage (as a raw value, like Stormcall)"],
  [/^Physical damage table shown as the raw value/, "How the game shows physical damage from the skill's own damage table"],
  [/^The skill's own poison/, "How the game shows the skill's own poison damage"],
];

// Gaps that belong to one skill (its own values), rather than a format or rule many share.
export const isOwn = (key) => key.startsWith("community:") || key.startsWith("values:");

/** Plain-language description of a gap key, with an example line (or a skill's own lines). */
export function describeGap(key, example = "") {
  const [kind, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (kind === "format") return `How the game writes tooltip lines like "${example || "…"}" (line type ${rest})`;
  if (kind === "variable") {
    const m = /^([a-z]+)(\d+)$/.exec(rest);
    if (NAMED_VARIABLES[rest]) return `How the game works out ${NAMED_VARIABLES[rest]}`;
    return m && VARIABLE_HELP[m[1]] ? `How the game reads ${VARIABLE_HELP[m[1]](m[2])}` : `The formula variable "${rest}"`;
  }
  if (kind === "operator") return `A formula operator decoded by inference (${rest})`;
  if (kind === "function") return "Formulas that read another skill's level or a character stat";
  if (kind === "rule") return RULE_HELP.find(([re]) => re.test(rest))?.[1] ?? rest;
  const own = Array.isArray(example) && example.length ? `: ${example.join("; ")}` : "";
  if (kind === "community") return `Values that so far only come from MedianDB, not the game files${own}`;
  if (kind === "values") return `Values the planner can't work out yet${own}`;
  return key;
}

/**
 * @param engine  createEngine(data)
 * @param {{ level?: number, blvl?: number, limit?: number }} opts
 * @returns {{ gaps: { key, text, skills: number, statSkills: number }[],
 *   suggestions: { id, name, cls, tab, requiredLevel, confirms: { key, text, skills }[], helps: number, affectsStats: boolean }[],
 *   skills: number, unconfirmedSkills: number }}
 */
export function confirmationGaps(engine, { level = 150, blvl = 1, limit = 12 } = {}) {
  const bySkill = new Map(); // id → { id, name, cls, tab, gaps: Set, examples: Map, affectsStats }
  const skillsWith = new Map(); // gap → Set of skill ids
  let total = 0;
  const seen = new Set();
  for (const cls of engine.classNames)
    for (const tab of engine.tabs(cls))
      for (const n of engine.treeNodes(cls, tab)) {
        // Shared skills (Mastery, Paragons) appear in every class: count them once.
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        total++;
        const b = { cls, level, points: { [n.id]: blvl }, quests: {} };
        const d = engine.describe(b, n.id, blvl);
        const gaps = new Set(), examples = new Map();
        for (const block of ["description", "restriction", "effect"])
          for (const line of d[block] || [])
            for (const part of line.parts || []) {
              const src = part.source || {};
              const keys =
                src.status === "community" ? [`community:${n.id}`]
                : src.status === "missing" ? [`values:${n.id}`]
                : src.status === "game-inferred" ? src.gaps || []
                : [];
              for (const k of keys) {
                gaps.add(k);
                if (!line.text) continue;
                if (isOwn(k)) (examples.get(k) ?? examples.set(k, []).get(k)).includes(line.text) || examples.get(k).push(line.text);
                else if (!examples.has(k)) examples.set(k, line.text);
              }
            }
        if (!gaps.size) continue;
        const affectsStats = engine.skillStatEffects(b, n.id).some(([, , , trust]) => trust && !["verified", "game", "matches-game"].includes(trust));
        bySkill.set(n.id, { id: n.id, name: n.name, cls, tab, gaps, examples, affectsStats, requiredLevel: engine.requiredCharLevel(n.id, b) });
        for (const k of gaps) (skillsWith.get(k) ?? skillsWith.set(k, new Set()).get(k)).add(n.id);
      }

  const example = (k) => [...bySkill.values()].find((s) => s.examples.has(k))?.examples.get(k) || "";
  const gaps = [...skillsWith]
    .map(([key, ids]) => {
      const gap = { key, text: describeGap(key, example(key)), skills: ids.size, statSkills: [...ids].filter((id) => bySkill.get(id).affectsStats).length };
      if (isOwn(key)) {
        // One skill's own values: name the skill and list them.
        const s = bySkill.get([...ids][0]);
        Object.assign(gap, { skill: { id: s.id, name: s.name, cls: s.cls, tab: s.tab }, lines: s.examples.get(key) || [] });
      }
      return gap;
    })
    .sort((a, b) => b.skills - a.skills || (a.skill && b.skill ? a.skill.cls.localeCompare(b.skill.cls) || a.skill.name.localeCompare(b.skill.name) : 0) || a.key.localeCompare(b.key));

  // Greedy cover: each pick is the skill whose screenshot confirms the most skills'
  // remaining gaps; ties go to skills that affect character stats, then lower levels.
  const covered = new Set();
  const suggestions = [];
  const helpOf = (s) => {
    const ids = new Set();
    for (const k of s.gaps) if (!covered.has(k)) for (const id of skillsWith.get(k)) ids.add(id);
    return ids.size;
  };
  while (suggestions.length < limit) {
    let best = null, bestHelp = 0;
    for (const s of bySkill.values()) {
      const h = helpOf(s);
      if (h > bestHelp || (h === bestHelp && h > 0 && best &&
        (s.affectsStats > best.affectsStats || (s.affectsStats === best.affectsStats && s.requiredLevel < best.requiredLevel)))) {
        best = s; bestHelp = h;
      }
    }
    if (!best) break;
    const confirms = [...best.gaps].filter((k) => !covered.has(k))
      .map((k) => ({ key: k, text: describeGap(k, best.examples.get(k) || example(k)), skills: skillsWith.get(k).size }))
      .sort((a, b) => b.skills - a.skills);
    for (const k of best.gaps) covered.add(k);
    suggestions.push({ id: best.id, name: best.name, cls: best.cls, tab: best.tab, requiredLevel: best.requiredLevel, confirms, helps: bestHelp, affectsStats: best.affectsStats });
  }
  return { gaps, suggestions, skills: total, unconfirmedSkills: bySkill.size };
}

/**
 * Specific questions only an in-game check can answer, from where the sources disagree:
 * required levels where MedianDB is higher than the game files (the planner uses the higher),
 * and caps that grow with character level. Each names a skill to look at.
 *
 * Settled by the game files, so no longer asked:
 *  - Mastery skills MedianDB gives a level (Chemistry, Continuity, Endurance, Specialization,
 *    Tenacity) are unlocked by a deed in game ("Defeat Bartuc in the Chamber of Blood /
 *    Unlockable Skill"), with skills.bin reqlevel 1 (engine.js unlockOf);
 *  - "Maximum Life +%" is ItemStatCost stat 76, op 11 on max life: it raises the base value
 *    only, not +Life or Vitality from items (character.js pool).
 * For the caps, the game's tooltip states the rate ("Max Level Increases Every 4 Character
 * Levels") and skills2.bin the maximum; what isn't in the files is the level counting starts at.
 * @returns {{ id, question, detail, skill?: { id, name, cls, tab } }[]}
 */
export function openQuestions(engine, data) {
  const where = (id) => {
    for (const cls of engine.classNames)
      for (const tab of engine.tabs(cls)) {
        const n = engine.treeNodes(cls, tab).find((x) => x.id === id);
        if (n) return { id, name: n.name, cls, tab };
      }
    return null;
  };
  const out = [];
  for (const d of data.game?.report?.reqLevelDiffers || []) {
    if (!(d.medianDb > d.game) || engine.unlockOf?.(d.id)) continue;
    const skill = where(d.id);
    if (skill) out.push({ id: `req:${d.id}`, skill, question: `From what character level can you put a point in ${d.name}?`,
      detail: `MedianDB says level ${d.medianDb}; the game files say ${d.game}. The planner uses ${d.medianDb}.` });
  }
  for (const cls of engine.classNames)
    for (const tab of engine.tabs(cls))
      for (const n of engine.treeNodes(cls, tab)) {
        if (out.some((q) => q.skill?.id === n.id)) continue;
        const b = { cls, level: 150, points: {}, quests: {} };
        const L = engine.levels(b, n.id);
        // Answered: the game showed its cap (engine.js MAX_LEVEL_RULES confirmed).
        if (!L.capSource?.dynamic || engine.capConfirmed?.(n.id)) continue;
        const at = (lvl) => engine.maxLevel({ ...b, level: lvl }, n.id, lvl);
        // Only caps that actually change with character level (other rules depend on points).
        if (at(1) === at(150)) continue;
        // The game's own wording of the rule, where its tooltip has one.
        const rule = (engine.skill(n.id)?.game?.lines || []).map((l) => l.textA || "")
          .flatMap((t) => t.split("\n")).find((t) => /max(imum)? (base )?level/i.test(t) && /character level/i.test(t));
        const rate = rule?.includes("%d") ? rule.replace("%d", engine.skill(n.id).game.params?.[7] || "N") : rule;
        out.push({ id: `cap:${n.id}`, skill: { id: n.id, name: n.name, cls, tab },
          question: `What is ${n.name}'s maximum level at your character level?`,
          detail: `${rate ? `The game confirms the rule ("${rate.trim()}"), but not the level it starts counting from. ` : ""}The planner follows MedianDB: ${at(1)} at level 1, ${at(50)} at 50, ${at(100)} at 100, ${at(150)} at 150.` });
      }
  return out;
}
