import TU from "./uniques.json";
import RAW from "./runewords.json";
import RUNE_IMG from "./rune-images.json";
import SOCK_IMG from "./socketable-images.json";
import SU from "./sacred-uniques.json";
import SETS from "./sets.json";
import SOCK from "./socketables.json";
import BASE from "./base-items.json";
import META from "./catalog-meta.json";
import RW_BASES from "./runeword-bases.json";
const RIMG = { ...RUNE_IMG, ...SOCK_IMG };
const STD =
  "El Eld Tir Nef Eth Ith Tal Ral Ort Thul Amn Sol Shael Dol Hel Io Lum Ko Fal Lem Pul Um Mal Ist Gul Vex Ohm Lo Sur Ber Jah Cham Zod".split(
    " ",
  );
const GREAT =
  "Ol Elq Tyr Nif Xeth Xith Rhal Tuul Ahmn Zol Shaen Doj Iu Lux Ka Fel Lew Phul Un Mhal Yst Gur Vez Ohn Loz Zur Bur Iah Xod".split(
    " ",
  );
const ELEM = {
  Ign: ["Fire", "--el-fire"],
  Ful: ["Light", "--el-light"],
  Gla: ["Ice", "--el-ice"],
  Ven: ["Poison", "--el-pois"],
  Sil: ["Stone", "--el-stone"],
  Arc: ["Arcane", "--el-arc"],
};
const OTHER = "Taha Ghal Qor Hem Thal Urt Yham".split(" ");
const label = (r) => (ELEM[r] ? ELEM[r][0] : r);
const runeName = (r) => `${label(r)} Rune${ELEM[r] ? " (" + r + ")" : ""}`;
const CLASSES = [
  "Amazon",
  "Assassin",
  "Barbarian",
  "Druid",
  "Necromancer",
  "Paladin",
  "Sorceress",
];
const ARMOR = new Set([
  "Body Armors",
  "Helms",
  "Circlets",
  "Shields",
  "Gloves",
  "Belts",
  "Boots",
  "Amazon Helms",
  "Assassin Shields",
  "Barbarian Helms",
  "Druid Helms",
  "Necromancer Shields",
  "Paladin Shields",
  "Sorceress Body Armors",
  "Amazon Shields",
  "Barbarian Shields",
  "Paladin Helms",
  "Special Helms",
  "Special Shields",
]);

const TAGS = [
  ["All Skills", /to All Skills/i],
  ["Class skills", /to \w+ Skill Levels/],
  ["Attack speed", /% (Attack Speed|Combat Speeds)/],
  ["Cast speed", /% (Cast Speed|Combat Speeds)/],
  ["Spell Focus", /Spell Focus/],
  ["Spell damage", /to (\w+\/)?\w* ?Spell Damage/],
  ["Resist reduction", /^-.*to Enemy .*Resistance/],
  ["Max resists", /^Maximum .*Resists?/],
  ["Physical resist", /^Physical Resist \d|^Physical Resist \(/],
  ["Enhanced damage", /% Enhanced Damage/],
  ["Enhanced defense", /Enhanced Defense/],
  ["Deadly Strike", /Deadly Strike/],
  ["Crushing Blow", /Crushing Blow/],
  ["Life steal", /Life stolen/],
  ["Life", /to Life$|Maximum Life/],
  [
    "Attributes",
    /all Attributes|All Attributes|to Strength|to Dexterity|to Vitality|to Energy/,
  ],
  ["Summons", /Summon/],
  ["Procs", /Chance to cast/i],
  ["Movement speed", /Movement Speed/],
  ["Magic Find", /Magic Find/],
  ["Gold Find", /Gold Find/],
  ["Experience", /Experience Gained/],
];
const ELEMS = [
  [
    "Fire",
    /Fire (Spell )?Damage|Enemy Fire|Elemental Resistances|Tri-Elemental|Innate Elemental/,
  ],
  [
    "Cold",
    /Cold (Spell )?Damage|Enemy Cold|Elemental Resistances|Tri-Elemental|Innate Elemental/,
  ],
  [
    "Lightning",
    /Lightning (Spell )?Damage|Enemy Lightning|Elemental Resistances|Tri-Elemental|Innate Elemental/,
  ],
  ["Poison", /Poison (Spell )?Damage|Enemy Poison|Poison Skill/],
  ["Magic / physical", /Magic Damage|Physical\/Magic|Weapon Physical Damage/],
];
const SORTS = [
  ["level", "Sort: level, low first"],
  ["level-d", "Sort: level, high first"],
  ["name", "Sort: name"],
  ["sockets", "Sort: fewest runes"],
  ["s:ed", "Best Enhanced damage", /% Enhanced Damage/, /Based on/],
  ["s:edef", "Best Enhanced defense", /% Enhanced Defense/, /Based on/],
  ["s:all", "Most +All Skills", /to All Skills/, /when/],
  ["s:cls", "Most +Class skills", /to \w+ Skill Levels/],
  ["s:ias", "Most attack speed", /% (Attack Speed|Combat Speeds)/],
  ["s:fcr", "Most cast speed", /% (Cast Speed|Combat Speeds)/],
  ["s:sf", "Most Spell Focus (flat)", /^\+.*\d\)? Spell Focus$/],
  ["s:sfp", "Most Spell Focus (%)", /Bonus to Spell Focus/],
  [
    "s:pierce",
    "Most enemy resist reduction",
    /^-.*% to Enemy .*Resistance/,
    /per/,
  ],
  ["s:pr", "Most physical resist", /^Physical Resist /],
  ["s:ds", "Most Deadly Strike", /% Deadly Strike/],
  ["s:cb", "Most Crushing Blow", /Chance of Crushing Blow/],
  ["s:ll", "Most life steal", /Life stolen per Hit/],
  ["s:life", "Most flat life", /to Life$/],
  ["s:mf", "Most Magic Find", /% Magic Find/],
];
const SHORT = Object.fromEntries(
  SORTS.map((s) => [s[0], s[1].replace(/^(Best|Most) /, "")]),
);
function lineValue(line) {
  const s = line.replace(/\((-?[\d.]+) to (-?[\d.]+)\)/g, (_, a, b) => b);
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Math.abs(parseFloat(m[0])) : 0;
}

// Base categories the game allows for each runeword (scripts/extract-runeword-bases.mjs):
// the docs' base lists leave out inherited types, e.g. class shields for "Shields" runewords.
const GAME_BASES = RW_BASES.runewords || {};
const RW_ALL = RAW.map(([name, lvl, runes, bases, except, stats, subtitle], i) => {
  const r = runes.split(" "),
    b = bases.split(", "),
    s = stats.split("|");
  let cls = null;
  for (const c of CLASSES) {
    if (b.some((x) => x.startsWith(c))) cls = c;
  }
  const only = s.find((l) => /^\((\w+) Only\)$/.test(l));
  if (only) cls = only.match(/\((\w+) Only/)[1];
  const skillCls =
    (s.map((l) => l.match(/to (\w+) Skill Levels/)).find(Boolean) || [])[1] ||
    null;
  const text = (
    name +
    " " +
    r.join(" ") +
    " " +
    r.map(label).join(" ") +
    " " +
    bases +
    " " +
    s.join(" ")
  ).toLowerCase();
  return {
    id: i,
    name,
    ...(subtitle ? { subtitle } : {}),
    lvl,
    runes: r,
    bases: b,
    ...(GAME_BASES[name] ? { allowed: GAME_BASES[name] } : {}),
    except,
    stats: s,
    cls,
    skillCls,
    slot: b.every((x) => ARMOR.has(x)) ? "armor" : "weapon",
    text,
    tags: TAGS.filter(([_, re]) => s.some((l) => re.test(l))).map((t) => t[0]),
    elems: ELEMS.filter(([_, re]) => s.some((l) => re.test(l))).map(
      (t) => t[0],
    ),
  };
});
// The docs list a few runewords under two base headings (Demhe, Anak, Gharaniq), giving
// identical rows; each is kept once, with its first row's id so saved references hold.
const seenRw = new Set();
const RW = RW_ALL.filter((r) => {
  const k = r.name + "|" + r.runes.join(" ");
  if (seenRw.has(k)) return false;
  seenRw.add(k);
  return true;
});

const HEAD =
  /^(One-Hand|Two-Hand|Throw) Damage|^Required|^Item Level|Damage Bonus:|^Socketed/;
const TUD = TU.map(([name, base, cat, tiers], i) => {
  const t = tiers.map((str) => {
    const l = str.split("|");
    const g = (re) => {
      const x = l.find((y) => re.test(y));
      return x ? x.split(": ")[1] : null;
    };
    return {
      head: l.filter((x) => HEAD.test(x)),
      mods: l.filter((x) => !HEAD.test(x)),
      req: g(/^Required Level/) ? parseInt(g(/^Required Level/)) : null,
      str: g(/^Required Strength/),
      dex: g(/^Required Dexterity/),
      sock: (l.find((x) => /^Socketed/.test(x)) || "").replace(/\D/g, ""),
      dmg: l.filter((x) => /Damage: /.test(x) && !/Bonus|Innate/.test(x)),
    };
  });
  return {
    id: i,
    key: i,
    name,
    base,
    cat,
    t,
    text: (name + " " + base + " " + cat + " " + tiers.join(" ")).toLowerCase(),
  };
});

// Splits a "line|line" stat block into requirements and the lines to display.
const REQ = /^Required (Level|Strength|Dexterity): /;
function statBlock(str) {
  const l = str.split("|").filter(Boolean);
  const g = (k) => {
    const x = l.find((y) => y.startsWith(`Required ${k}: `));
    return x ? x.split(": ")[1] : null;
  };
  const cls = l.find((x) => /^\(\w+ Only\)$/.test(x));
  return {
    req: g("Level") ? parseInt(g("Level")) : null,
    str: g("Strength"),
    dex: g("Dexterity"),
    sock: (l.find((x) => /^Socketed/.test(x)) || "").replace(/\D/g, ""),
    cls: cls ? cls.slice(1, -6) : null,
    lines: l.filter((x) => !REQ.test(x) && !/^Socketed/.test(x) && x !== cls),
    raw: l,
  };
}

const sacredOf = (SU) => SU.map(([name, base, cat, stats], i) => ({
  id: i,
  name,
  base,
  cat,
  ...statBlock(stats),
  text: (name + " " + base + " " + cat + " " + stats).toLowerCase(),
}));

const setsOf = (SETS) => SETS.map(([name, sub, cls, bonus, items], i) => {
  const bonuses = [];
  for (const l of bonus.split("|"))
    if (/^Set Bonus\b/.test(l)) bonuses.push({ when: l, lines: [] });
    else bonuses.at(-1)?.lines.push(l);
  const it = items.map(([n, base, stats]) => ({ name: n, base, ...statBlock(stats) }));
  const reqs = it.map((x) => x.req).filter((x) => x !== null);
  return {
    id: i,
    name,
    sub,
    cls,
    bonuses,
    items: it,
    minReq: reqs.length ? Math.min(...reqs) : null,
    maxReq: reqs.length ? Math.max(...reqs) : null,
    text: [name, sub, cls, bonus, ...items.flat()].join(" ").toLowerCase(),
  };
});

const SOCK_SLOTS = ["Weapons", "Armor", "Shields"];
const socketablesOf = (SOCK) => SOCK.map(([name, group, lvl, w, a, s, img, url], i) => ({
  id: i,
  name,
  group,
  lvl,
  img,
  url: url || "",
  slots: [w, a, s].map((x) => (x || "").split("|").filter(Boolean)),
  text: (name + " " + group + " " + [w, a, s].join(" ")).toLowerCase(),
}));

const basesOf = (BASE) => BASE.map(([name, cat, tiers], i) => ({
  id: i,
  key: "bi:" + i,
  name,
  cat,
  t: tiers.map(([label, stats]) => ({ label, ...statBlock(stats) })),
  text: (name + " " + cat + " " + tiers.flat().join(" ")).toLowerCase(),
}));

// Raw catalogue (bundled JSON or the /api/catalog response) → display records.
function normalizeCatalog(c) {
  const SOCKD = socketablesOf(c.socketables);
  return {
    SUD: sacredOf(c.sacredUniques),
    SETD: setsOf(c.sets),
    SOCKD,
    SOCK_GROUPS: [...new Set(SOCKD.map((s) => s.group))],
    BASED: basesOf(c.baseItems),
  };
}
const BUNDLED = { ...META, baseItems: BASE, sacredUniques: SU, sets: SETS, socketables: SOCK };
const { SUD, SETD, SOCKD, SOCK_GROUPS, BASED } = normalizeCatalog(BUNDLED);

export {
  META,
  BUNDLED,
  normalizeCatalog,
  TU,
  RAW,
  RIMG,
  STD,
  GREAT,
  ELEM,
  OTHER,
  label,
  runeName,
  CLASSES,
  ARMOR,
  TAGS,
  ELEMS,
  SORTS,
  SHORT,
  lineValue,
  RW,
  TUD,
  SUD,
  SETD,
  SOCKD,
  SOCK_GROUPS,
  SOCK_SLOTS,
  BASED,
};
