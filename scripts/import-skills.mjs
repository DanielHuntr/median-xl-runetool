// Builds the skill planner data (public/planner/) from azadix/medianxl-db (MIT).
// See THIRD_PARTY_LICENSES.txt.
//
//   node scripts/import-skills.mjs               fetch the repo's latest commit on main; fail on error
//   node scripts/import-skills.mjs --fallback    on error keep the existing files (used by prebuild)
//   node scripts/import-skills.mjs <clone-dir>   read from a local clone of the repo
//
// The repo is pinned to one commit per import, so skills, trees and icons always
// come from the same snapshot. Nothing is written unless validate() passes.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { findExtract, mergeGameData, mergeItemArt, alignTreesWithGame, mergeClassStats } from "./lib/merge-game.mjs";
import { normalizeSkillTags } from '../src/planner/skillEffects.js';

const REPO = "azadix/medianxl-db";
const OUT = new URL("../public/planner/", import.meta.url);
const CLASSES = ["Amazon", "Assassin", "Barbarian", "Druid", "Necromancer", "Paladin", "Sorceress"];
const args = process.argv.slice(2);
const fallback = args.includes("--fallback");
const localDir = args.find((a) => !a.startsWith("--"));

async function latestCommit() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
    headers: { accept: "application/vnd.github.sha", "user-agent": "median-xl-runetool" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`GitHub commit lookup: HTTP ${res.status}`);
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("GitHub commit lookup: unexpected response");
  return sha;
}

function source(commit) {
  if (localDir)
    return (path, binary) =>
      readFile(`${localDir}/public/${path}`, binary ? undefined : "utf8");
  return async (path, binary) => {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/public/${path}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
  };
}

// tree_struct prerequisites → "type:value:target" strings. Pairs in a list are
// AND; a nested list of pairs is an OR group (skill_level_any). Adapted from
// medianxl-db src/shared/tree-struct.js.
const isPair = (x) => Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && Number.isFinite(Number(x[1]));
const isOrGroup = (x) => Array.isArray(x) && x.length >= 2 && x.every(isPair);
const pairList = (raw) => (isPair(raw) ? [raw] : Array.isArray(raw) ? raw.filter(isPair) : []);
function prereqStrings(p = {}) {
  const out = [];
  if (p.character_level != null && Number.isFinite(Number(p.character_level)))
    out.push(`character_level:${Math.floor(Number(p.character_level))}`);
  const sl = p.skill_level;
  if (isPair(sl)) out.push(`skill_level:${Math.floor(sl[1])}:${sl[0].trim()}`);
  else if (Array.isArray(sl))
    for (const item of sl) {
      if (isOrGroup(item))
        out.push(`skill_level_any:${Math.floor(item[0][1])}:${item.map((x) => x[0].trim()).join("|")}`);
      else if (isPair(item)) out.push(`skill_level:${Math.floor(item[1])}:${item[0].trim()}`);
      else throw new Error(`Unknown skill_level shape: ${JSON.stringify(item)}`);
    }
  for (const [id, n] of pairList(p.skill_blocked_by))
    out.push(`skill_blocked_by:${Math.floor(n)}:${id.trim()}`);
  const tp = pairList(p.tree_points);
  if (tp.length === 1) out.push(`tree_points:${Math.floor(tp[0][1])}:${tp[0][0]}`);
  return out;
}

function build({ versions, gameMeta, skills, trees, stats, items }) {
  const active = versions.find((v) => v.is_active) || versions[0];
  const byId = new Map(skills.map((s) => [s.id, s]));
  const outTrees = {};
  const used = new Set();
  for (const cls of CLASSES) {
    if (!trees[cls]) throw new Error(`tree_struct has no ${cls}`);
    outTrees[cls] = {};
    for (const [tab, block] of Object.entries(trees[cls])) {
      outTrees[cls][tab] = block.skill_details.map((d) => {
        if (!byId.has(d.id)) throw new Error(`Tree skill ${d.id} missing from skills.json`);
        used.add(d.id);
        return {
          id: d.id,
          row: d.row,
          col: d.col,
          parents: (d.layoutParents || []).filter((p) => byId.has(p)),
          prereqs: prereqStrings(d.prerequisites),
        };
      });
    }
  }
  // Skills referenced by formulas ([[other_skill]]) are kept so tooltips can resolve them.
  for (const id of [...used])
    for (const c of byId.get(id).scalingConstants || [])
      for (const v of [c.value0, c.value1, c.value2, c.value3])
        for (const m of String(v ?? "").matchAll(/\[\[([a-z0-9_-]+)\]\]/gi))
          if (byId.has(m[1])) used.add(m[1]);
  const outSkills = {};
  const statKeys = new Set();
  const prefixes = new Set();
  for (const id of used) {
    const s = byId.get(id);
    const text = [...(s.description || []), ...(s.restriction || []), ...(s.skillEffect || [])];
    for (const t of text) for (const m of t.matchAll(/\{\{(\w+)\}\}/g)) statKeys.add(m[1].toLowerCase());
    const prefix = /^(?:icons|image)-([a-z]+)_\d+$/i.exec(s.image || "")?.[1];
    if (prefix) prefixes.add(prefix);
    outSkills[id] = {
      name: s.displayName,
      class: s.class,
      classId: s.classId,
      tab: s.tab,
      tabName: s.tabName,
      tags: normalizeSkillTags(id, s.tags),
      max: s.baseMaxLevel ?? 0,
      spec: !!s.affectedBySpecialization,
      image: s.image || "",
      description: s.description || [],
      restriction: s.restriction || [],
      effect: s.skillEffect || [],
      constants: (s.scalingConstants || []).map((c) => ({
        key: String(c.statKey).toLowerCase(),
        occ: c.occurrenceIndex ?? 0,
        variant: c.variantKey || "",
        minLevel: c.minCharacterLevel ?? null,
        values: [c.value0, c.value1, c.value2, c.value3].map((v) => (v == null ? "" : String(v))),
      })),
    };
  }
  // Skill stats that also raise a character stat (e.g. Warmth → cold resistance).
  for (const s of Object.values(outSkills)) for (const c of s.constants) statKeys.add(c.key);
  const outStats = {};
  for (const s of stats)
    if (statKeys.has(s.key.toLowerCase())) {
      const row = { name: s.name, format: s.format, signed: s.signed ?? false };
      const paired = (s.pairedStat || [])
        .map((p) => [Number(p.valueIndex ?? 0), String(p.plannerKey || p.stat || "").toLowerCase()])
        .filter(([i, k]) => Number.isInteger(i) && k);
      if (paired.length) row.paired = paired;
      outStats[s.key.toLowerCase()] = row;
    }
  const classes = gameMeta.classes
    .filter((c) => CLASSES.includes(c.name))
    .map((c) => ({
      name: c.name,
      id: c.id,
      prefix: c.image_prefix,
      life: c.base_life,
      mana: c.base_mana,
      strength: c.base_strength,
      dexterity: c.base_dexterity,
      vitality: c.base_vitality,
      energy: c.base_energy,
      lifePerLevel: c.life_per_level,
      manaPerLevel: c.mana_per_level,
      lifePerVit: c.life_per_vitality,
      manaPerEne: c.mana_per_energy,
    }));
  // Charms and relics (inventory items) plus icon names for base items and jewellery.
  const baseIcons = {};
  for (const b of items.baseitems) baseIcons[b.name.replace(/\s*\((\d|Sacred)\)$/, "")] ??= b.icon;
  for (const o of items.other) baseIcons[o.name] ??= o.icon;
  // MedianDB marks some lines with a colour ("{orange}+1 Extra Abyss Knight", added upstream in
  // October 2026); the game shows the text, so the colour tag is dropped.
  const COLOUR = /{(orange|grey|gray|red|green|blue|gold|white|yellow|purple|tan|black|darkgreen)}/gi;
  const uncolour = (l) => (typeof l === "string" ? l.replace(COLOUR, "").trim() : l);
  // MedianDB also describes choices now ({ label, oneOf: [...] }): one of several bonuses (Bone
  // Chimes' version, Lylia's Curse's maximum resist) as its first option, as before; optional
  // ones that start with "(none)" (Dulra Aegis's gems) left out, so nothing is credited unasked.
  const lineText = (l) => {
    if (typeof l === "string") return uncolour(l);
    const options = Array.isArray(l?.oneOf) ? l.oneOf : [];
    if (!options.length || options[0] === "(none)") return null;
    const first = options[0];
    return uncolour(typeof first === "string" ? first : first?.low ?? first?.high ?? null);
  };
  const inventory = [...items.charms, ...items.relics].map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.rarity === "relic" ? "relic" : "charm",
    icon: c.icon || "",
    reqLevel: c.reqLevel || 0,
    lines: (c.modifiers || []).map(lineText).filter(Boolean),
    trophy: (c.trophy || []).map(lineText).filter(Boolean),
  }));
  // Every skill's name, so item lines such as "+2 to Spiral Dance" resolve to oskills.
  const skillNames = Object.fromEntries(
    skills.filter((s) => s.displayName).map((s) => [s.id, s.displayName]),
  );
  return {
    gameVersion: active.name,
    skillNames,
    baseIcons,
    inventory,
    shieldClassBlock: gameMeta.shieldClassBlockPercent || [],
    folder: `${active.major}_${active.minor}`,
    classes,
    trees: outTrees,
    skills: outSkills,
    stats: outStats,
    devotionUltimates: gameMeta.paladinDevotionUltimateSkills || {},
    prefixes: [...prefixes].sort(),
  };
}

function validate(d) {
  const problems = [];
  if (d.classes.length !== CLASSES.length) problems.push(`classes ${d.classes.length}`);
  for (const cls of CLASSES) {
    const tabs = Object.keys(d.trees[cls] || {});
    if (tabs.length < 6) problems.push(`${cls} has ${tabs.length} tabs`);
  }
  const n = Object.keys(d.skills).length;
  if (n < 350) problems.push(`only ${n} skills`);
  if (Object.keys(d.stats).length < 50) problems.push(`only ${Object.keys(d.stats).length} stats`);
  if (d.inventory.length < 150) problems.push(`only ${d.inventory.length} charms and relics`);
  if (Object.keys(d.baseIcons).length < 150) problems.push(`only ${Object.keys(d.baseIcons).length} base item icons`);
  if (problems.length) throw new Error("Skill data looks incomplete: " + problems.join(", "));
}

try {
  const commit = localDir ? "local" : await latestCommit();
  const get = source(commit);
  const versions = JSON.parse(await get("tree_data/versions.json"));
  const active = versions.find((v) => v.is_active) || versions[0];
  const folder = `tree_data/${active.major}_${active.minor}`;
  const [gameMeta, skills, trees, stats] = await Promise.all(
    ["game_meta.json", "skills.json", "tree_struct.json"]
      .map((f) => get(`${folder}/${f}`))
      .concat(get("tree_data/stats.json"))
      .map(async (p) => JSON.parse(await p)),
  );
  const itemFolder = `items/${active.major}_${active.minor}`;
  const [baseitems, other, charms, relics] = await Promise.all(
    ["baseitems", "other", "charms", "relics"].map(async (n) => JSON.parse(await get(`${itemFolder}/${n}.json`))),
  );
  const data = build({ versions, gameMeta, skills, trees, stats, items: { baseitems, other, charms, relics } });
  validate(data);
  // Installed-game data for the same patch (scripts/extract-game-data.mjs), if present.
  const found = findExtract(data.gameVersion);
  if (found?.extract) {
    const r = mergeGameData(data, found.extract, found.fixtures);
    console.log(
      `import-skills: merged game files ${found.extract.patch}: ${r.paired} skills paired, ${r.capDiffers.length} cap differences, ${r.reqLevelDiffers.length} required-level differences, formulas ${r.formulaChecks.matches} match, ${r.formulaChecks.differs.length} differ, ${r.formulaChecks.unchecked.length} couldn't be compared`,
    );
    const classFixes = mergeClassStats(data, found.extract);
    if (classFixes.length) console.log(`import-skills: class stats from the game files: ${classFixes.join("; ")}`);
    const trees = alignTreesWithGame(data, found.extract);
    for (const [what, list] of Object.entries(trees))
      if (list.length) console.log(`import-skills: skill trees ${what} to match the game files: ${list.join("; ")}`);
    // Monsters to measure damage against (scripts/extract-monsters.mjs), same patch only.
    if (found.monsters?.patch === found.extract.patch) {
      data.monsters = found.monsters.monsters;
      console.log(`import-skills: ${data.monsters.length} monsters from the game files`);
    }
    // Areas with monsters only in Hell (levels.bin, scripts/extract-areas.mjs): where an
    // unlockable skill's deed happens tells the planner which difficulty it needs.
    try {
      const areas = JSON.parse(readFileSync(new URL("../src/data/areas.json", import.meta.url), "utf8"));
      if (areas.patch === found.extract.patch)
        data.hellOnlyAreas = [...new Set(areas.areas.filter((x) => !x.mlvl[0] && !x.mlvl[1] && x.mlvl[2]).map((x) => x.name))];
    } catch {}
    // Mercenaries (scripts/extract-mercs.mjs), same patch only.
    if (found.mercs?.patch === found.extract.patch) {
      data.mercs = { types: found.mercs.types, skills: found.mercs.skills };
      console.log(`import-skills: ${data.mercs.types.length} mercenary types from the game files`);
    }
    if (found.itemArt) {
      const a = mergeItemArt(data, found.itemArt);
      console.log(`import-skills: item art ${found.itemArt.patch}: ${a.uniques} uniques, ${a.sets} set items, ${a.bases} bases`);
    }
  } else {
    data.game = null;
    console.warn(`import-skills: no game extract for ${data.gameVersion}; skill values are MedianDB only`);
  }
  // Only the item icons the planner can show are copied.
  const iconNames = [...new Set([...Object.values(data.baseIcons), ...data.inventory.map((i) => i.icon)].filter(Boolean))];
  const icons = [];
  for (const n of iconNames) {
    try {
      icons.push([n, await get(`icons/item_icons/${n}.webp`, true)]);
    } catch {
      // A few catalogue entries point at icons the repo doesn't ship; they fall back to a placeholder.
    }
  }
  if (icons.length < iconNames.length * 0.8)
    throw new Error(`Only ${icons.length} of ${iconNames.length} item icons could be fetched`);
  data.itemIcons = icons.map(([n]) => n).sort();
  const atlases = await Promise.all(
    data.prefixes.map(async (p) => [p, await get(`${folder}/class-${p}.webp`, true)]),
  );
  for (const [p, buf] of atlases)
    if (buf.length < 1000 || buf.toString("ascii", 8, 12) !== "WEBP")
      throw new Error(`class-${p}.webp is not a WebP image`);
  // Class portraits for the class picker: MedianDB's portraits/<Class>/1.gif (the standing
  // character sprite, 50×90), saved by class prefix.
  const portraits = await Promise.all(
    data.classes.map(async (c) => [c.prefix, await get(`portraits/${c.name}/1.gif`, true)]),
  );
  for (const [p, buf] of portraits)
    if (buf.length < 500 || buf.toString("ascii", 0, 3) !== "GIF") throw new Error(`The ${p} portrait is not a GIF image`);

  data.source = {
    repo: `https://github.com/${REPO}`,
    commit,
    fetchedAt: new Date().toISOString(),
  };
  await mkdir(OUT, { recursive: true });
  for (const [p, buf] of atlases) await writeFile(new URL(`class-${p}.webp`, OUT), buf);
  await mkdir(new URL("portraits/", OUT), { recursive: true });
  for (const [p, buf] of portraits) await writeFile(new URL(`portraits/${p}.gif`, OUT), buf);
  await mkdir(new URL("items/", OUT), { recursive: true });
  for (const [n, buf] of icons) await writeFile(new URL(`items/${n}.webp`, OUT), buf);
  await writeFile(new URL("data.json", OUT), JSON.stringify(data));
  // The catalogue pages load only the item art index, not the whole planner data.
  if (data.itemArt) await writeFile(new URL("item-art.json", OUT), JSON.stringify(data.itemArt));
  console.log(
    `import-skills: ${Object.keys(data.skills).length} skills, ${data.classes.length} classes, Median XL ${data.gameVersion}, ${REPO}@${commit.slice(0, 7)}`,
  );
} catch (err) {
  if (!fallback) throw err;
  let when = "the last import";
  try {
    when = JSON.parse(await readFile(new URL("data.json", OUT), "utf8")).source.fetchedAt;
  } catch {}
  console.warn(`import-skills: refresh failed (${err.message}). Keeping the planner data from ${when}.`);
}
