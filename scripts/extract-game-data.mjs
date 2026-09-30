// Extracts skill data from an installed Median XL, for checking and completing the
// community (MedianDB) skill data. Needs the game files; the output is committed so
// builds don't.
//
//   node scripts/extract-game-data.mjs [game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Method
//  - medianxl-version.mpq → version.mxl: the exact patch (e.g. "2.14.4").
//  - medianxl-YmludGJsdHh0.mpq ("bintbltxt"): the game tables, compiled D2 1.13c .bin:
//      skills.bin (572-byte records), skills2.bin (D2Sigma extension, 66 bytes),
//      skilldesc.bin (names, tooltip lines and tree positions), skillscode.bin (compiled formulas),
//      skilldesccode.bin (tooltip-line formulas), skillcalc.bin
//      (formula variable names), string/patchstring/expansionstring.tbl (text).
//  - MPQ reading: scripts/lib/mpq.mjs (StormLib-documented format). Field offsets:
//    D2 1.13c D2SkillsTxt layout, confirmed per field in the comments below.
// Output: data/game/<patch>/skills.json
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openMpq } from "./lib/mpq.mjs";
import { readTbl, readBin, stringIndex } from "./lib/d2tables.mjs";
import { decode, toText, OPCODES, FUNCTIONS } from "../src/planner/d2calc.js";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const TABLES = "medianxl-YmludGJsdHh0.mpq";
const VERSION = "medianxl-version.mpq";
const CLASSES = ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"];
// Stat ids from D2 1.13c ItemStatCost that the extract labels. Others stay numeric.
const STATS = {
  48: "firemindam", 49: "firemaxdam", 50: "lightmindam", 51: "lightmaxdam", 52: "magicmindam", 53: "magicmaxdam",
  54: "coldmindam", 55: "coldmaxdam", 56: "coldlength", 57: "poisonmindam", 58: "poisonmaxdam", 59: "poisonlength",
  329: "passive_fire_mastery", 330: "passive_ltng_mastery", 331: "passive_cold_mastery", 332: "passive_pois_mastery",
  333: "passive_fire_pierce", 334: "passive_ltng_pierce", 335: "passive_cold_pierce", 336: "passive_pois_pierce",
};
const ELEMENTS = { 0: null, 1: "fire", 2: "lightning", 3: "magic", 4: "cold", 5: "poison" };

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const tablesPath = join(dir, TABLES), versionPath = join(dir, VERSION);
const patch = openMpq(versionPath).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error(`Couldn't read the game version from ${VERSION}`);

const mpq = openMpq(tablesPath);
const X = (n) => {
  const b = mpq.read(`data/global/excel/${n}`);
  if (!b) throw new Error(`${n} is missing from ${TABLES}`);
  return b;
};
const tbl = (n) => readTbl(mpq.read(`data/local/lng/eng/${n}`));
const str = stringIndex({ base: tbl("string.tbl"), patch: tbl("patchstring.tbl"), expansion: tbl("expansionstring.tbl") });
const skills = readBin(X("skills.bin")), skills2 = readBin(X("skills2.bin")), desc = readBin(X("skilldesc.bin"));
if (skills.size !== 0x23c) throw new Error(`skills.bin records are ${skills.size} bytes, expected 572 (D2 1.13c)`);
if (skills2.count !== skills.count) throw new Error("skills2.bin and skills.bin row counts differ");
const code = X("skillscode.bin");
const descCode = X("skilldesccode.bin");
const AST_BASE = Number(process.env.AST_BASE || 0x68);
const skills2Code = X("skills2code.bin");
const calcBin = X("skillcalc.bin");
const calcNames = [...Array(calcBin.readUInt32LE(0))].map((_, i) => calcBin.toString("latin1", 4 + i * 4, 8 + i * 4).replace(/\0.*$/, ""));
// Colour codes are "ÿc" + a letter; .tbl text is UTF-8, so ÿ can also appear as its Latin-1 reading "Ã¿".
const colour = (s) => s?.replace(/(?:ÿ|Ã¿)c./g, "").trim() ?? null;

// Undecodable formulas can't be measured (an unconfirmed opcode's operand size is
// unknown), so up to 48 bytes are kept for later study.
function calcAt(off, source = code) {
  if (off < 0) return null;
  const window = [...source.subarray(off, off + 256)];
  const d = decode(window);
  const bytes = d.ok ? window.slice(0, d.length) : window.slice(0, 48);
  const out = { code: Buffer.from(bytes).toString("hex") };
  if (d.ok) {
    out.text = toText(d.tokens, calcNames, { stat: (id) => STATS[id] || `stat ${id}` });
    // Formulas referencing other skills or stats name them, for the UI and checks.
    const refs = d.tokens.filter((t) => t.op === "func" && FUNCTIONS[t.arg].name.endsWith("ref"));
    if (refs.length) out.references = refs.length;
  } else out.undecoded = d.reason;
  return out;
}
const i16 = (r, o) => r.readInt16LE(o), i32 = (r, o) => r.readInt32LE(o);
const list = (r, o, n, read = i32, step = 4) => [...Array(n)].map((_, k) => read(r, o + k * step));

// Tooltip lines (D2 1.13c D2SkillDescTxt): 17 lines, each a type byte (0x42), two
// string ids (0x54, 0x76) and two skilldesccode.bin formula offsets (0x98, 0xDC).
// Lines 0-5 are the per-level lines, 6-9 extra lines, 10-16 the synergy block
// (confirmed on Way of the Spider: its "Synergies" header and three lines).
const NO_STRING = 5382; // unused slots point at this id ("FLYING POLAR BUFFALO ERROR")
// D2 text colour codes: "ÿc" + a character (0 white, 1 red, 2 green, 3 blue, 4 gold, 5 grey,
// 6 black, 7 tan, 8 orange, 9 yellow, : dark green, ; purple).
const colourOf = (v) => (v && v !== NO_STRING ? /^\s*(?:ÿ|Ã¿)c(.)/.exec(str(v) ?? "")?.[1] ?? null : null);
const BLOCKS = (i) => (i < 6 ? "level" : i < 10 ? "extra" : "synergy");
function descLines(r) {
  // Spacing is part of the format ("Poison Spell Damage: " + value), so only colour
  // codes and leading/trailing line breaks are removed.
  const text = (v) => (v && v !== NO_STRING ? str(v)?.replace(/(?:ÿ|Ã¿)c./g, "").replace(/^\n+|\n+$/g, "") ?? null : null);
  const out = [];
  for (let i = 0; i < 17; i++) {
    const type = r[0x42 + i];
    if (!type) continue;
    const line = { slot: i, block: BLOCKS(i), type };
    const a = text(r.readUInt16LE(0x54 + 2 * i)), b = text(r.readUInt16LE(0x76 + 2 * i));
    // The line's colour code, when its text starts with one ("ÿc8Shock", "ÿc4Synergies").
    const colour = colourOf(r.readUInt16LE(0x54 + 2 * i));
    if (colour) line.colour = colour;
    const ca = calcAt(i32(r, 0x98 + 4 * i), descCode), cb = calcAt(i32(r, 0xdc + 4 * i), descCode);
    if (a != null) line.textA = a;
    if (b != null) line.textB = b;
    if (ca) line.calcA = ca;
    if (cb) line.calcB = cb;
    out.push(line);
  }
  return out;
}

const out = [];
for (let id = 0; id < skills.count; id++) {
  const r = skills.record(id);
  const d = i16(r, 0x194); // SkillDesc
  if (d < 0) continue;
  const name = colour(str(desc.record(d).readUInt16LE(0x08)));
  if (!name) continue;
  out.push(record(id, name, d));
}

// One skill's data. Helper skills (no name or description) are included when another
// skill's formula reads them, e.g. Incineration Trap's "skill(1126).par2".
function record(id, name, d) {
  const r = skills.record(id);
  const cls = r.readInt8(0x0c); // charclass
  const eType = r[0x1dc];
  // slot (1-5) is what tooltip formulas call pst1-pst5.
  const passive = list(r, 0x98, 5, i16, 2)
    .map((stat, k) => ({ slot: k + 1, stat, name: STATS[stat] ?? null, calc: calcAt(i32(r, 0xa4 + k * 4)) }))
    // A slot with a formula but no stat still counts: other formulas read it as pstN.
    .filter((p) => p.stat >= 0 || p.calc);
  // Where the skill sits in its class's skill tree (skilldesc.bin SkillPage, SkillRow,
  // SkillColumn at 0x02-0x04); page 0 means it isn't in a tree.
  const dr = d >= 0 ? desc.record(d) : null;
  const tree = dr && dr[2] > 0 ? { page: dr[2], row: dr[3], col: dr[4] } : null;
  return {
    gameId: id,
    name,
    class: CLASSES[cls] ?? null,
    tree,
    reqLevel: i16(r, 0x174), // reqlevel — Way of the Spider = 5 (patch 2.0.0)
    // skills2.bin byte 47: hard-point cap (Way of the Spider = 25; matches MedianDB for 366 of 376 skills).
    baseCap: skills2.record(id)[47],
    maxLvl: i16(r, 0x12c),
    // skills2.bin 0x3e: the maximum-level modifier. The hard-point cap in game is baseCap
    // + this formula: Warmth 1 + ulvl / 4 = 38 at 150, Void Gazer 1 + max(0, ulvl − 100) / 5
    // = 1, 1, 11 at 100, 104, 150, and eight more in-game readings (GitHub issues #14-#20).
    // Values of −500 and below are locks (devotions, prerequisites), −999 while Resurrect's
    // Servants of Valor has under 10 points. (Read before as a mana modifier; it isn't one.)
    capModifier: calcAt(skills2.record(id).readInt32LE(0x3e), skills2Code),
    // ToHit (0x198) and LevToHit (0x19c): the attack rating bonus formulas read as toht.
    // Found by scanning for MedianDB's values (Iron Spiral 10 + 5 per level, Angel of Death
    // 30 + 10, Catapult Shot 50 + 15; six skills agree on these two offsets and no others).
    toHit: [i32(r, 0x198), i32(r, 0x19c)],
    params: list(r, 0x148, 8),
    calcs: Object.fromEntries(
      [["clc1", 0x138], ["clc2", 0x13c], ["clc3", 0x140], ["clc4", 0x144]].map(([k, o]) => [k, calcAt(i32(r, o))]).filter(([, v]) => v),
    ),
    // AuraStatCalc1-6 (0x70, after the six AuraStat ids at 0x64): formulas call them
    // ast1-ast6. Only slots with a formula are kept; an empty slot evaluates to 0.
    ast: Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((k) => [`ast${k}`, calcAt(i32(r, AST_BASE + (k - 1) * 4))]).filter(([, v]) => v),
    ),
    passive,
    // AuraStat1-6 (0x54, six int16 stat ids): the stats ast1-ast6 grant while the skill is
    // in use (Whirlwind: 141 deadly strike from Savagery, 67 movement speed -10). Only slots
    // with both a stat and a formula are kept.
    astStats: Object.fromEntries(
      list(r, 0x54, 6, i16, 2).map((stat, k) => [`ast${k + 1}`, stat]).filter(([k, stat]) => stat >= 0 && calcAt(i32(r, AST_BASE + (Number(k.slice(3)) - 1) * 4))),
    ),
    // Formula fields that formulas read as variables. Located by matching MedianDB:
    // len (0x60) = duration (Summon Familiars 750, Ecstatic Frenzy par1 = 15000 frames),
    // rng (0x64) = range (Wyrmshot par1 + Keen Sight × par2 = 38 + 2 × Keen Sight),
    // skcd (0x190) = cooldown (Summon Familiars 150, Deep Freeze 300, Shower of Rocks 50);
    // (mnhp/mnar, minion life and attack rating, are not these fields: Blood Skeleton's
    // in-game attack rating rises 200 → 300 with its level while 0x6c doesn't change.)
    // pets (0xc0) = PetMax (Blood Skeleton: 2 + blvl / 4, shown in game as "Skeletons: 2").
    vars: Object.fromEntries(
      [["len", 0x60], ["rng", 0x64], ["pets", 0xc0], ["skcd", 0x190]]
        .map(([k, o]) => [k, calcAt(i32(r, o))])
        .filter(([, v]) => v),
    ),
    // Mana cost: base and per-level formulas in skills2code.bin (skills2.bin 0x36, 0x3a;
    // equal to MedianDB's mana and lvlmana for every skill checked), ManaShift at
    // skills.bin 0x188. 0x3e is a modifier formula whose meaning isn't confirmed.
    mana: {
      shift: r[0x188],
      // MinMana (skills.bin 0x186): the cost never goes below it (D2Sigma.dll 0x100A1D21).
      min: r.readUInt16LE(0x186),
      base: calcAt(skills2.record(id).readInt32LE(0x36), skills2Code),
      perLevel: calcAt(skills2.record(id).readInt32LE(0x3a), skills2Code),

    },
    // SrcDam (0x1a5): weapon damage share in 128ths; formulas read it as wdm (%).
    srcDam: r[0x1a5],
    // Physical damage table (D2 layout): MinDam, MaxDam, five level-bracket steps each,
    // and DmgSymPerCalc; formulas read it as pdmn/pdmx.
    phys: {
      min: i32(r, 0x1a8),
      max: i32(r, 0x1ac),
      minLev: list(r, 0x1b0, 5),
      maxLev: list(r, 0x1c4, 5),
      synergy: calcAt(i32(r, 0x1d8)),
    },
    lines: d >= 0 ? descLines(desc.record(d)) : [],
    // The damage tables are kept even without an element type (type null): formulas
    // read edmn/edmx/edln from them either way.
    elem: {
      type: ELEMENTS[eType] ?? null,
      hitShift: r[0x1a4],
      min: i32(r, 0x1e0),
      max: i32(r, 0x1e4),
      minLev: list(r, 0x1e8, 5),
      maxLev: list(r, 0x1fc, 5),
      synergy: calcAt(i32(r, 0x210)), // EDmgSymPerCalc
      len: i32(r, 0x214),
      lenLev: list(r, 0x218, 3),
      lenSynergy: calcAt(i32(r, 0x224)), // ELenSymPerCalc
    },
  };
}
// Skills referenced by formulas (skillref: skill id and variable pushed as constants).
const referenced = (c) => {
  if (!c?.code) return [];
  const d = decode([...Buffer.from(c.code, "hex")]);
  if (!d.ok) return [];
  return d.tokens.flatMap((t, i) => (t.op === "func" && FUNCTIONS[t.arg].name === "skillref" && d.tokens[i - 2]?.arg != null ? [d.tokens[i - 2].arg] : []));
};
const calcsOf = (s) => [...Object.values(s.calcs), ...Object.values(s.ast), ...Object.values(s.vars), s.mana.base, s.mana.perLevel, s.mana.modifier, s.phys.synergy, ...s.passive.map((p) => p.calc), s.elem?.synergy, s.elem?.lenSynergy, ...s.lines.flatMap((l) => [l.calcA, l.calcB])];
const have = new Set(out.map((s) => s.gameId));
const helpers = [];
for (let queue = out.flatMap((s) => calcsOf(s).flatMap(referenced)); queue.length; ) {
  const id = queue.pop();
  if (have.has(id) || id < 0 || id >= skills.count) continue;
  have.add(id);
  const h = { ...record(id, null, -1), helper: true };
  helpers.push(h);
  queue.push(...calcsOf(h).flatMap(referenced));
}

// Class base stats from charstats.bin (D2 1.13c layout, 196-byte records; offsets from
// D2MOO's D2CharStatsTxt). Per-level and per-point gains are stored in quarter points
// (Amazon LifePerLevel 115 = 28.75). Starting life is Vitality + LifeAdd; starting mana is
// Energy. Checked against saves: Amazon level 3 has 127.5 life, Paladin level 3 has 140.
const charstats = readBin(X("charstats.bin"));
if (charstats.size !== 196) throw new Error(`charstats.bin records are ${charstats.size} bytes, expected 196 (D2 1.13c)`);
const classes = [];
for (let i = 0; i < charstats.count; i++) {
  const r = charstats.record(i);
  const name = r.toString("latin1", 0x20, 0x30).replace(/ .*$/, "");
  if (!CLASSES.includes(name)) continue;
  classes.push({
    name,
    strength: r[0x30], dexterity: r[0x31], energy: r[0x32], vitality: r[0x33],
    life: r[0x33] + r[0x35], mana: r[0x32],
    toHitFactor: r.readInt32LE(0x3c),
    lifePerLevel: r[0x43] / 4, manaPerLevel: r[0x45] / 4,
    lifePerVit: r[0x46] / 4, manaPerEne: r[0x48] / 4,
    statsPerLevel: r[0x50], blockFactor: r[0x49],
  });
}

// Missiles skill formulas read through missref(id, variable): the parameter groups the
// variable list (misscalc.bin: par1-5, cpa1-5, hpa1-3, chp1-3, dpa1-2) names, from missiles.bin
// (D2 1.13c, 420-byte records): Param 0x38, HitPar 0x4C, CltParam 0x58, CltHitPar 0x6C,
// DmgParam 0x78. Catapult Shot's "Converts 100% Physical Damage to Fire" is missile 1750's dpa1.
const missilesBin = mpq.read("data/global/excel/missiles.bin");
const missileSize = (missilesBin.length - 4) / missilesBin.readUInt32LE(0);
if (missileSize !== 420) throw new Error(`missiles.bin records are ${missileSize} bytes, expected 420 (D2 1.13c)`);
const missileIds = new Set();
JSON.stringify(out, (k, v) => { if (k === "text" && typeof v === "string") for (const m of v.matchAll(/missref\((\d+), /g)) missileIds.add(+m[1]); return v; });
const missiles = {};
for (const id of [...missileIds].sort((a, b) => a - b)) {
  const r = missilesBin.subarray(4 + id * 420, 4 + (id + 1) * 420);
  const ints = (o, n) => Array.from({ length: n }, (_, k) => r.readInt32LE(o + 4 * k));
  missiles[id] = { par: ints(0x38, 5), hpa: ints(0x4c, 3), cpa: ints(0x58, 5), chp: ints(0x6c, 3), dpa: ints(0x78, 2) };
}

const result = {
  patch,
  extractedAt: new Date().toISOString(),
  source: {
    game: "Median XL (installed files)",
    files: { [TABLES]: sha(tablesPath), [VERSION]: sha(versionPath) },
    method:
      "MPQ tables archive → D2 1.13c compiled .bin tables (skills, skills2, skilldesc, skillscode, skilldesccode, skillcalc) and .tbl strings. See scripts/extract-game-data.mjs.",
  },
  formula: {
    variables: calcNames,
    opcodes: Object.fromEntries(Object.entries(OPCODES).map(([k, v]) => [`0x${(+k).toString(16)}`, `${v.name}: ${v.confirmed}`])),
    functions: Object.fromEntries(Object.entries(FUNCTIONS).map(([k, v]) => [k, `${v.name}${v.confirmed ? "" : ` (inferred: ${v.note})`}`])),
  },
  classes,
  skills: out,
  // Unnamed skills that other skills' formulas read (fixed parameters and formulas).
  helpers,
  missiles,
};
const target = new URL(`../data/game/${patch}/`, import.meta.url);
mkdirSync(target, { recursive: true });
writeFileSync(new URL("skills.json", target), JSON.stringify(result, null, 1) + "\n");
const calcs = out.flatMap((s) => [...Object.values(s.calcs), ...s.passive.map((p) => p.calc), s.elem?.synergy].filter(Boolean));
const lineCalcs = out.flatMap((s) => s.lines.flatMap((l) => [l.calcA, l.calcB]).filter(Boolean));
console.log(
  `extract-game-data: Median XL ${patch}, ${out.length} named skills, ${calcs.filter((c) => !c.undecoded).length}/${calcs.length} formulas and ${lineCalcs.filter((c) => !c.undecoded).length}/${lineCalcs.length} tooltip-line formulas decoded, ${out.reduce((n, s) => n + s.lines.filter((l) => l.block === "synergy").length, 0)} synergy-block lines → data/game/${patch}/skills.json`,
);
