// Game rules used by the character calculations, each with its source. Values
// marked "D2" follow classic Diablo II because Median XL documents that the
// mechanic works "much the same"; those results are shown as estimates.

export const DIFFICULTIES = ["Normal", "Nightmare", "Hell"];

// Patch 1.5.0: "Resistance penalty is now 30% and 70% for Nightmare and Hell".
export const ELEMENTAL_RES_PENALTY = { Normal: 0, Nightmare: -30, Hell: -70 };
// Patch 2.14.0: "Magic resistance penalty is now -30% on Nightmare, -60% on Hell".
export const MAGIC_RES_PENALTY = { Normal: 0, Nightmare: -30, Hell: -60 };

// D2 default maximum resistance before "+x% Maximum ... Resist" bonuses.
export const BASE_MAX_RESIST = 75;
// Patch 1.6.0: "Physical Resist cap being 75% rather than 50%" was a bug.
export const PHYS_RES_CAP = 50;
// Patch 2.5.0: "Avoid from all sources is now capped at 60%".
export const AVOID_CAP = 60;
// docs.median-xl.com/doc/concepts/defense: block "Capped at 50% ... (can be increased up to 80%)".
export const BLOCK_CAP = 50;
export const BLOCK_CAP_MAX = 80;
// docs.median-xl.com/doc/concepts/spellfocus: "min(spell_focus/10, 100)%".
export const SPELL_FOCUS_CAP = 1000;

// Stat points: 5 per level (D2), Lam Esen's Tome gives 10 per difficulty (patch 1.3.0),
// Signets of Learning are capped at 400 (patch 1.0.0); the Justicar Signet quest
// raises that cap by 50 (medianxl-db Character.QUESTS).
export const STAT_POINTS_PER_LEVEL = 5;
export const LAM_ESEN_POINTS = 10;
export const SIGNET_CAP = 400;
export const JUSTICAR_SIGNET_BONUS = 50;

// D2 starting attack rating by class (added to 5 × Dexterity − 35).
export const CLASS_BASE_AR = {
  Amazon: 5,
  Assassin: 15,
  Barbarian: 20,
  Druid: 5,
  Necromancer: -10,
  Paladin: 20,
  Sorceress: -15,
};

export const SOURCES = {
  resistPenalty: "Patch 1.5.0 (elemental) and 2.14.0 (magic)",
  physCap: "Patch 1.6.0",
  avoidCap: "Patch 2.5.0",
  block: "docs.median-xl.com · Defense and Block",
  spellFocus: "docs.median-xl.com · Spell Focus",
  statPoints: "5 per level; Lam Esen's Tome 10 per difficulty (patch 1.3.0)",
};
