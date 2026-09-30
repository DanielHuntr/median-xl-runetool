// Merges an installed-game extract (data/game/<patch>/skills.json) into the planner
// data built from MedianDB, and cross-checks the two. Rules:
//  - Only an extract whose patch matches MedianDB's dataset version is used; patches
//    are never mixed.
//  - Game files are authoritative for what they contain (caps, parameters, decoded
//    formulas). MedianDB formulas are kept, and each is marked as matching the game
//    or not wherever a game formula for the same stat exists.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { evaluate } from "../../src/planner/formula.js";
import { createGameEval, STAT_IDS } from "../../src/planner/gamecalc.js";

const GAME_DIR = new URL("../../data/game/", import.meta.url);
const byPatch = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

export function findExtract(datasetVersion) {
  if (!existsSync(GAME_DIR)) return null;
  const patches = readdirSync(GAME_DIR).filter((p) => p.startsWith(`${datasetVersion}.`) && existsSync(new URL(`${p}/skills.json`, GAME_DIR)));
  if (!patches.length) return null;
  const patch = patches.sort(byPatch).at(-1);
  const read = (n) => existsSync(new URL(`${patch}/${n}`, GAME_DIR)) ? JSON.parse(readFileSync(new URL(`${patch}/${n}`, GAME_DIR), "utf8")) : null;
  return { extract: read("skills.json"), fixtures: read("fixtures.json"), itemArt: read("item-art.json"), monsters: read("monsters.json"), mercs: read("mercs.json") };
}

/**
 * @param {object} data  planner data from MedianDB (mutated)
 * @param {object} extract  data/game/<patch>/skills.json
 * @param {object} fixtures  data/game/<patch>/fixtures.json (in-game tooltip observations), optional
 */
// Item art (scripts/extract-item-art.mjs) as compact lookups for the catalog:
// uniques/sets by name → [[base name, image]] (tiered uniques have one row per tier),
// bases by plain name → { tier label → image }. Images are data/game/<patch>/item-art/<image>.png, packed into sprite sheets by build-item-atlas.
export function mergeItemArt(data, art) {
  const [maj, min] = art.patch.split(".");
  if (`${maj}.${min}` !== data.gameVersion)
    throw new Error(`Item art ${art.patch} doesn't match MedianDB dataset ${data.gameVersion}; not merging different patches`);
  const group = (rows) => {
    const out = {};
    for (const r of rows) {
      const list = (out[r.name] ??= []);
      if (!list.some(([b, a]) => b === r.base && a === r.art)) list.push([r.base, r.art]);
    }
    return out;
  };
  // Game base names carry the tier ("Axe (3)", "Axe (Sacred)"); the catalog's don't.
  // bases: plain name → { "Tier 3": image, "Sacred": image, "": image for untiered bases }.
  const bases = {};
  for (const b of art.bases) {
    const t = /^(.*?)\s*\((\d|Sacred)\)$/.exec(b.name);
    const [name, tier] = t ? [t[1], t[2] === "Sacred" ? "Sacred" : `Tier ${t[2]}`] : [b.name, ""];
    (bases[name] ??= {})[tier] ??= b.art;
  }
  data.itemArt = { patch: art.patch, uniques: group(art.uniques), sets: group(art.sets), bases };
  return { uniques: Object.keys(data.itemArt.uniques).length, sets: Object.keys(data.itemArt.sets).length, bases: Object.keys(bases).length };
}

export function mergeGameData(data, extract, fixtures = null) {
  const [maj, min] = extract.patch.split(".");
  if (`${maj}.${min}` !== data.gameVersion)
    throw new Error(`Game extract ${extract.patch} doesn't match MedianDB dataset ${data.gameVersion}; not merging different patches`);
  const byName = new Map();
  for (const g of extract.skills) {
    const key = `${g.name}|${g.class ?? ""}`;
    byName.set(key, byName.has(key) ? null : g); // null marks an ambiguous name
    if (!byName.has(g.name)) byName.set(g.name, g);
    else if (byName.get(g.name) !== g) byName.set(g.name, null);
  }
  // Innate and shared skills have no class in the game files and several copies
  // ("Vindicate" at 639, 1475, 1849). MedianDB's "Vindicate (Innate)" is the copy among
  // that class's own skills: the one nearest the middle of the class's game ids.
  // Shared skills ("Paragon of Fate", class __all__) use the first copy.
  const classIds = {};
  for (const g of extract.skills) if (g.class) (classIds[g.class] ??= []).push(g.gameId);
  const middle = (ids) => [...ids].sort((a, b) => a - b)[Math.floor(ids.length / 2)];
  function unclassed(s) {
    const name = s.name.replace(/\s*\(Innate\)$/, "");
    if (!classIds[s.class]) return extract.skills.filter((g) => g.name === name).sort((a, b) => a.gameId - b.gameId)[0] ?? null;
    const copies = extract.skills.filter((g) => g.name === name && !g.class);
    if (!copies.length) return null;
    const m = middle(classIds[s.class]);
    return copies.sort((a, b) => Math.abs(a.gameId - m) - Math.abs(b.gameId - m))[0];
  }
  const report = { paired: 0, unpaired: [], capDiffers: [], reqLevelDiffers: [], tagFixes: [], formulaChecks: { matches: 0, differs: [], unchecked: [] } };
  for (const [id, s] of Object.entries(data.skills)) {
    const g = byName.get(`${s.name}|${s.class}`) ?? byName.get(s.name) ?? unclassed(s);
    if (!g) {
      report.unpaired.push(s.name);
      continue;
    }
    report.paired++;
    // Innate and shared skills take no points: only their formulas are used, not the
    // game's cap or required level (Vindicate's reads -10).
    const noPoints = !g.class || s.class === "__all__" || / \(Innate\)$/.test(s.name);
    s.game = {
      gameId: g.gameId,
      reqLevel: noPoints ? null : g.reqLevel,
      baseCap: noPoints ? null : g.baseCap,
      // The hard-point cap as formulas read it (mlvl), kept for skills without points too.
      cap: g.baseCap,
      toHit: g.toHit || [0, 0],
      capModifier: g.capModifier || null,
      params: g.params,
      calcs: g.calcs,
      passive: g.passive,
      elem: g.elem,
      ast: g.ast || {},
      ...(g.astStats && Object.keys(g.astStats).length ? { astStats: g.astStats } : {}),
      vars: g.vars || {},
      mana: g.mana || null,
      srcDam: g.srcDam ?? 0,
      phys: g.phys || null,
      // The game's own tooltip lines: per-level, extra and synergy blocks.
      lines: g.lines || [],
    };
    const tagFix = elementTags(s, g);
    if (tagFix) report.tagFixes.push({ id, name: s.name, ...tagFix });
    if (!noPoints && g.baseCap !== s.max) report.capDiffers.push({ id, name: s.name, medianDb: s.max, game: g.baseCap });
    // Cross-check MedianDB formulas that have a game passive-stat equivalent.
    for (const row of s.constants) {
      const stat = STAT_IDS[row.key];
      if (!stat || row.variant || !g.passive.some((p) => p.stat === stat)) continue;
      const result = compare(row.values[0], g, stat, extract.formula.variables, Math.max(1, g.baseCap || s.max || 1));
      // "differs" only when both sides produced numbers that disagree.
      row.gameCheck = result.ok ? "matches" : result.example.reason ? "unchecked" : "differs";
      if (result.ok) report.formulaChecks.matches++;
      else (result.example.reason ? report.formulaChecks.unchecked : report.formulaChecks.differs).push({ id, name: s.name, key: row.key, ...result.example });
    }
  }
  for (const cls of Object.keys(data.trees))
    for (const nodes of Object.values(data.trees[cls]))
      for (const n of nodes) {
        const g = data.skills[n.id]?.game;
        const tree = Number((n.prereqs.find((p) => p.startsWith("character_level:")) || "character_level:1").split(":")[1]);
        if (g && g.reqLevel != null && g.reqLevel !== tree) report.reqLevelDiffers.push({ id: n.id, name: data.skills[n.id].name, medianDb: tree, game: g.reqLevel });
      }
  // Class copies of one planner skill: the game has a Specialization per class (Assassin's
  // 1185, Barbarian's 1278 …) where the planner has one shared skill, and formulas read the
  // class's own copy (Blink's cap reads skill(1185).clc1). Game id → planner id, by name.
  const pairedIds = new Set(Object.values(data.skills).filter((s) => s.game).map((s) => s.game.gameId));
  const plannerByName = new Map();
  for (const [id, s] of Object.entries(data.skills)) {
    const n = s.name.replace(/ \(Innate\)$/, "");
    plannerByName.set(n, plannerByName.has(n) ? null : id);
  }
  const aliases = {};
  for (const g of extract.skills) if (!pairedIds.has(g.gameId) && plannerByName.get(g.name)) aliases[g.gameId] = plannerByName.get(g.name);
  data.game = {
    patch: extract.patch,
    aliases,
    // Missile parameters formulas read (missref), by missile id.
    missiles: extract.missiles || {},
    // Unnamed helper skills read by other skills' formulas, by game id.
    helpers: Object.fromEntries(
      (extract.helpers || []).map((h) => [h.gameId, { gameId: h.gameId, params: h.params, calcs: h.calcs, ast: h.ast, vars: h.vars, mana: h.mana, srcDam: h.srcDam, phys: h.phys, passive: h.passive, elem: h.elem }]),
    ),
    extractedAt: extract.extractedAt,
    files: extract.source.files,
    method: extract.source.method,
    variables: extract.formula.variables,
    functions: extract.formula.functions,
    report: {
      paired: report.paired,
      unpaired: report.unpaired.length,
      capDiffers: report.capDiffers,
      reqLevelDiffers: report.reqLevelDiffers,
      formulaMatches: report.formulaChecks.matches,
      formulaDiffers: report.formulaChecks.differs,
      formulaUnchecked: report.formulaChecks.unchecked,
      tagFixes: report.tagFixes,
    },
  };
  data.fixtures = fixtures?.fixtures ?? [];
  return report;
}

// A skill's element tags, game data first: the element of its damage table (elem.type) is
// added when MedianDB's tags leave it out (Earthquake: magic), and an element tag is dropped
// when the skill has a damage table and nothing in its game tooltip names that element
// (Parasite's "Fire": its damage and conversion are magic, GitHub issue #27). A tag its
// tooltip does name stays (Stampede's "Magic"). Gear suggestions and the rating read these.
const ELEMENT_TAGS = ["Fire", "Cold", "Lightning", "Poison", "Magic"];
function elementTags(s, g) {
  const own = ELEMENT_TAGS.find((e) => e.toLowerCase() === g.elem?.type);
  if (!own) return null;
  const text = (g.lines || []).map((l) => `${l.textA || ""} ${l.textB || ""}`).join(" ").toLowerCase();
  const dropped = s.tags.filter((t) => ELEMENT_TAGS.includes(t) && t !== own && !text.includes(t.toLowerCase()));
  const added = s.tags.includes(own) ? [] : [own];
  if (!added.length && !dropped.length) return null;
  s.tags = [...s.tags.filter((t) => !dropped.includes(t)), ...added];
  return { added, dropped };
}

// Evaluates a MedianDB formula and the game's passive-stat formula on a grid of
// Base Levels, bonus levels and character levels (including the 99/100/101 edge).
function compare(formula, g, stat, names, cap) {
  const bases = [...new Set([1, 2, Math.min(5, cap), Math.min(10, cap), cap])];
  for (const blvl of bases)
    for (const soft of [0, 7, 16])
      for (const ulvl of [20, 60, 93, 99, 100, 101, 120]) {
        const lvl = blvl + soft;
        let mine;
        try {
          mine = evaluate(formula, {
            vars: { blvl, slvl: soft, lvl, ulvl },
            skillLevel: () => 0,
            skillStat: () => 0,
            treePoints: () => 0,
          });
        } catch {
          return { ok: false, example: { reason: "MedianDB formula doesn't evaluate" } };
        }
        if (mine.usesStats || mine.usesConditions) return { ok: false, example: { reason: "depends on character stats" } };
        const game = createGameEval(g, names, { blvl, lvl, ulvl }).passive(stat);
        if (!game.ok) return { ok: false, example: { reason: `game formula: ${game.reason}` } };
        if (game.value !== mine.value) return { ok: false, example: { blvl, lvl, ulvl, medianDb: mine.value, game: game.value } };
      }
  return { ok: true };
}

// The skill trees as the game draws them (skilldesc.bin page, row and column, recorded by
// extract-game-data as skill.tree). MedianDB lists some shared tabs and skills only under
// the Amazon: the Mastery tab and the Paragon of Fate and Sanctity rewards. In game every
// class has its own copy of each (same caps and formulas; only game ids differ). So, per class:
//  - a skill the game places in the class's tree but the planner lacks is added, reusing
//    the MedianDB entry of the same name and its tree node (requirements and links), so
//    saved builds, tooltips and calculations need nothing extra;
//  - rows and columns follow the game where they differ;
//  - tabs follow the game's page order (tabs the game doesn't place, like Innate, stay last).
// Returns what changed, for the import log.
export function alignTreesWithGame(data, extract) {
  const report = { added: [], moved: [], reordered: [] };
  const idByName = new Map();
  const nodeById = new Map();
  for (const tabs of Object.values(data.trees))
    for (const [tab, nodes] of Object.entries(tabs))
      for (const n of nodes) {
        nodeById.set(n.id, { ...n, tab });
        if (data.skills[n.id]) idByName.set(data.skills[n.id].name, n.id);
      }
  for (const [cls, tabs] of Object.entries(data.trees)) {
    const placed = extract.skills.filter((g) => g.class === cls && g.tree);
    if (!placed.length) continue;
    const where = new Map(placed.map((g) => [g.name, g.tree]));
    // Which tab each game page is, from the skills already in the planner's tabs.
    const tabOfPage = new Map();
    for (const [tab, nodes] of Object.entries(tabs))
      for (const n of nodes) {
        const t = where.get(data.skills[n.id]?.name);
        if (t && !tabOfPage.has(t.page)) tabOfPage.set(t.page, tab);
      }
    for (const g of placed) {
      const id = idByName.get(g.name);
      if (!id || Object.values(tabs).some((nodes) => nodes.some((n) => n.id === id))) continue;
      const donor = nodeById.get(id);
      const tab = tabOfPage.get(g.tree.page) ?? donor.tab;
      tabOfPage.set(g.tree.page, tab);
      (tabs[tab] ??= []).push({ id, row: g.tree.row, col: g.tree.col, parents: [...donor.parents], prereqs: [...donor.prereqs] });
      report.added.push(`${cls} ${tab}: ${g.name}`);
    }
    for (const [tab, nodes] of Object.entries(tabs)) {
      const ids = new Set(nodes.map((n) => n.id));
      for (const n of nodes) {
        n.parents = n.parents.filter((p) => ids.has(p));
        const t = where.get(data.skills[n.id]?.name);
        if (t && (t.row !== n.row || t.col !== n.col)) {
          report.moved.push(`${cls} ${tab}: ${data.skills[n.id].name} r${n.row} c${n.col} → r${t.row} c${t.col}`);
          n.row = t.row;
          n.col = t.col;
        }
      }
    }
    const pageOf = new Map([...tabOfPage].map(([page, tab]) => [tab, page]));
    const before = Object.keys(tabs);
    const order = [...before].sort((a, b) => (pageOf.get(a) ?? Infinity) - (pageOf.get(b) ?? Infinity));
    if (order.join() !== before.join()) report.reordered.push(`${cls}: ${order.join(", ")}`);
    data.trees[cls] = Object.fromEntries(order.map((t) => [t, tabs[t]]));
  }
  return report;
}

// Class base stats from the game's charstats.bin (extract-game-data) replace MedianDB's
// where they differ: MedianDB's life per level is wrong for four classes (the user's saves
// confirm the game file: Amazon level 3 has 127.5 life, Paladin level 3 has 140) and its
// Paladin mana per Energy is 1.5 where the game has 2. Returns the differences it fixed.
const CLASS_FIELDS = ["strength", "dexterity", "vitality", "energy", "life", "mana", "lifePerLevel", "manaPerLevel", "lifePerVit", "manaPerEne", "toHitFactor"];
export function mergeClassStats(data, extract) {
  const changed = [];
  for (const g of extract.classes || []) {
    const c = data.classes.find((x) => x.name === g.name);
    if (!c) continue;
    for (const k of CLASS_FIELDS) {
      if (g[k] == null || c[k] === g[k]) continue;
      if (c[k] != null) changed.push(`${g.name} ${k}: MedianDB ${c[k]} → game ${g[k]}`);
      c[k] = g[k];
    }
    c.statsFrom = `game files ${extract.patch} (charstats.bin)`;
  }
  return changed;
}
