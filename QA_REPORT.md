# QA Report: Median XL Runetool and Character Planner

## Fix status (updated after fixes)

| ID | Status | What changed |
|---|---|---|
| QA-001 | **Fixed** | Class stats now come from the game's `charstats.bin` (`mergeClassStats`). A test pins the planner to the save values: Amazon level 3 life 127, Paladin level 3 life 140, Assassin level 93 mana 705. |
| QA-002 | **Fixed** | Runeword bases now come from the game's runeword and item-type tables (`extract-runeword-bases.mjs`), used by both the finder and the planner. 55 runewords gain inherited categories; none lose any. Paladin Shields now shows 11 runewords instead of 4. |
| QA-003 | **Fixed** | Paladin mana per Energy is 2, from `charstats.bin`. |
| QA-004 | **Fixed** | A saved `skillBar` or `buffs` that isn't a list is dropped instead of stopping the planner (test added). |
| QA-005 | **Fixed** | Attack rating uses the game's to-hit factor (10 for every class). |
| QA-006 | **Fixed** | One shared maximum level (150) for all catalogue filters, the saved-state clamp and the notice. All 423 sacred uniques are reachable (test added). |
| QA-007 | **Fixed** | Duplicate runeword rows are merged (231 runewords); ids are kept for saved references (test added). |
| QA-008 | **Fixed** | The confirm page's grid can shrink, and its tables scroll inside their box. No overflow at 320–1920px. |
| QA-009 | **Fixed** | The planner action row wraps, and the Quests table scrolls in its panel. Also fixed: long card names ("Gotterdammerung") widening Sacred Uniques at 320px. |
| QA-010 | **Fixed** | `prebuild` only builds the sprite sheets from committed files. Refreshing data is `npm run import-data`. |
| QA-011 | **Partly fixed** | Monster portraits are now included in the build version hash and requested with `?v=`. **Keeping the diablo2.io artwork at all is the owner's decision.** |
| QA-012 | **Fixed (settled by the game files)** | The five Mastery skills MedianDB gives a level to (Chemistry 125, Continuity 115, Endurance 115, Specialization 125, Tenacity 100) are "Unlockable Skill"s in the game's own tooltip (e.g. "Defeat Bartuc in the Chamber of Blood"), with skills.bin reqlevel 1. The planner now uses the game's level and shows the unlock condition. |
| QA-013 | **Fixed** | Victory and Eternal have proper names; the subtitle is shown under the name. |
| QA-014 | **Fixed** | Light-theme lightning colour is #7a6600: 4.57–5.40:1 on the light panels. |
| QA-015 | **Deferred** | Loading catalogue data per page means restructuring the shared catalogue state. Low severity; not changed. |
| QA-016 | **No change needed** | Item hover sheets and the item editor already mark each uncounted line "(not counted)". Modelling those effects is separate work. |
| QA-017 | **Fixed (settled by the game files)** | ItemStatCost.bin: Maximum Life +% (stat 76) and Maximum Mana +% (77) are op 11 on max life/mana, unchanged from D2 1.13, which multiplies the base value only. Vitality (op 9) and Energy (op 8) from items add as bonuses. The planner already left +Life out; it now also leaves life from item/skill Vitality (and mana from Energy) out of the percentage. |
| QA-018 | **Partly confirmed** | The game tooltips state each rate and maximum (e.g. "Max Level Increases Every 4 Character Levels", "every 2 character levels (maximum 25)"), and all 8 of MedianDB's rules match them. The level counting starts from isn't in the game files (skills2.bin holds only the hard-point cap), so that part stays an open question. |

After the fixes: 119 tests pass, the build succeeds, and the browser checks were re-run. No console errors; no page overflow at any width; all 21 corrupted-storage cases load; only a known false positive remains in the contrast scan.

Audit date: 26 September 2026. Scope: the whole application in its current working-tree state (not the deployed site). No application code was changed during the audit.

**Total issues: 18**
**Critical: 1**
**High: 2**
**Medium: 9**
**Low: 6**

| ID | Title | Severity | Status |
|---|---|---|---|
| QA-001 | Life per level is wrong for Amazon, Necromancer, Paladin and Assassin | Critical | Confirmed |
| QA-002 | Generic Shield, Helm and Body Armor runewords can't be used in class armour | High | Confirmed |
| QA-003 | Paladin mana per Energy is 1.5, the game file says 2 | High | Confirmed (game file) |
| QA-004 | Saved planner data with a non-list `skillBar` or `buffs` makes the planner unusable | Medium | Confirmed |
| QA-005 | Attack rating uses classic D2 class constants, not Median XL's | Medium | Confirmed (game file) |
| QA-006 | Five sacred uniques can never be shown; the level filter stops at 120 | Medium | Confirmed |
| QA-007 | Demhe, Anak and Gharaniq appear twice in the Runeword Finder | Medium | Confirmed |
| QA-008 | Help confirm values page is wider than the screen below about 470px | Medium | Confirmed |
| QA-009 | Planner header actions and Quests table overflow at 320px | Medium | Confirmed |
| QA-010 | Every build re-downloads live data and rewrites tracked files | Medium | Confirmed |
| QA-011 | Monster portraits are third-party artwork and are cached without a version | Medium | Confirmed |
| QA-012 | Mastery skills' required levels disagree between sources | Medium | Suspected |
| QA-013 | Two runeword names have their subtitle glued on | Low | Confirmed |
| QA-014 | Light theme: lightning-coloured text is just below the contrast minimum | Low | Confirmed |
| QA-015 | The main bundle loads all catalogue data on every page (1.3 MB) | Low | Confirmed |
| QA-016 | 261 distinct item lines are shown but not counted in stats | Low | Confirmed |
| QA-017 | "Maximum Life +%" is assumed not to apply to flat +Life | Low | Suspected |
| QA-018 | Skill caps that grow with character level come only from MedianDB | Low | Suspected |

---

## How the audit was done

- **Project map:**
  - Vue 3 and Vite 6 app with hash routes: Runeword Finder, Tiered Uniques, Sacred Uniques, Sets, Gems & Runes, Base Items, Character Planner, and the hidden "Help confirm values" page.
  - Catalogue data lives in `src/data/*.json`. Runewords and tiered uniques are bundled files; the rest are re-imported from docs.median-xl.com at build time.
  - Planner data is `public/planner/data.json`. It combines MedianDB (community) with an extract of the installed game's files (`data/game/2.14.4/`), merged only when the patches match.
  - Calculations are in `src/planner/` (`character.js`, `engine.js`, `gamecalc.js`, `damage.js`, `target.js`, `recommend.js`).
  - Browser state is two localStorage stores: `mxlrw2:*` for the catalogue pages and `mxlrw2:planner` for the planner.
- **Build and tests:** `npm install` was already complete, and `npm run build` succeeds. The only build warning is chunk size; see QA-015. All 115 tests pass (`npm test`).
- **Runtime:** production build served with `vite preview` and driven with headless Microsoft Edge over the DevTools protocol:
  - every route, recording console errors and warnings, uncaught exceptions and failed or 4xx requests;
  - eight widths (320–1920px);
  - three themes;
  - corrupted localStorage;
  - keyboard tabbing;
  - back and forward navigation, and invalid routes.
- **Data validation against authoritative sources:**
  - the current official docs (`docs.median-xl.com`, fetched during the audit) and the official changelog (`median-xl.com/changelog`);
  - the installed Median XL 2.14.4 game files (MPQ tables, read with record layouts from D2MOO, the open-source reconstruction of D2 1.13c);
  - the user's own single-player save files, read without modifying them.
- **Calculations:** representative values worked out by hand and compared with the planner's `computeCharacter` output, plus a sweep of every skill tooltip, item variant, socket filler and mystic orb for invalid numbers (`scripts/dev/audit-values.mjs`).

### What passed

- **Runtime:** no console errors, Vue warnings, uncaught exceptions or failed requests on any of the eight pages.
- **Robustness:**
  - The catalogue pages survive every corrupted-storage case tried: invalid JSON, wrong types, nulls, unknown names, huge and negative numbers.
  - The planner survives 19 of 21 corrupted-field cases; the other two are QA-004.
  - Crafted share links with bad fields are cleaned safely.
  - Unknown routes fall back to the Runeword Finder, and back/forward navigation works.
- **Accessibility:**
  - Every page has a single h1, no skipped heading levels, no unnamed buttons, no unlabelled inputs, no images without alt text, and `lang="en"`.
  - All 30 keyboard tab stops tested on the planner show a visible focus ring.
  - Reset asks for confirmation before clearing.
- **Runeword Finder:**
  - Search is case-insensitive, trims spaces, matches all words and matches rune names ("cham ohm lo" finds Gehenna).
  - It handles special characters, HTML and 500-character input safely, and shows a clear empty state.
  - Combined filters work, show as removable pills, "Clear all" restores all 234, and filters persist over a reload.
- **Planner interaction:**
  - Points respect prerequisites: 100 rapid clicks on a locked skill stay at 0.
  - Caps hold: 100 rapid clicks on Wild and Free stop at 25/25.
  - Right-click removes a point, and auto-level raises the character level.
  - Builds are kept per class when switching and switching back.
  - Everything (points, class, theme) restores after a reload.
- **Skill trees:** 0 differences from the game's own layout for all 7 classes (`scripts/dev/tree-vs-game.mjs`).
- **In-game fixtures:** all 22 screenshot fixtures (12 skills) reproduce exactly.
- **Value sweep:** 2,077 skill tooltips, 3,501 item states, 331 orb placements and every socket filler contain no NaN, undefined or infinite numbers.
- **Theme contrast:** passes on all pages in all three themes, apart from QA-014.

### Median XL data validation summary

| Dataset | Result | Evidence |
|---|---|---|
| Runewords (234) | **CONFIRMED** | All 234 match the live docs exactly: rune order, level, bases, exceptions and every stat line. Base rules for class armour are wrong in the app's logic, not the data (QA-002). Names: QA-013. |
| Tiered uniques (255) | **CONFIRMED** | 218 tiered weapon and armour uniques match the docs tier by tier. The 37 jewellery, jewel and quiver uniques match exactly. |
| Sacred uniques, sets, socketables, base items | **LIKELY CORRECT** | Re-imported from the live docs on every build (423 sacred uniques, 51 sets with 188 items, 111 socketables, 218 bases). The parser is the source of truth; not re-diffed independently. |
| Skill trees (tabs, skills, positions) | **CONFIRMED** | Matches `skilldesc.bin` page, row and column for all 7 classes. |
| Skill caps and required levels | Mixed | 13 caps and 12 required levels differ between MedianDB and the game files. The planner uses the game cap and the higher required level. Game values are **CONFIRMED** where fixtures exist (e.g. Incineration Trap pierce 4%, not MedianDB's 20%). Mastery required levels: **UNVERIFIED** (QA-012). Caps that grow with level: **UNVERIFIED** (QA-018). |
| Skill values | Mixed | 12 skills fully **CONFIRMED** by in-game screenshots. 353 of 411 skills still have at least one **UNVERIFIED** part (tracked on the Help confirm values page). |
| Class starting attributes and starting life | **CONFIRMED** | Match `charstats.bin` (life = Vitality + 50) and the saves. |
| Class life per level | **INCORRECT** for 4 classes | QA-001. |
| Class mana per level | **CONFIRMED** | Matches `charstats.bin`, and the saves' mana exactly (e.g. Assassin level 93: 705). |
| Class mana per Energy | **INCORRECT** for Paladin | QA-003. |
| Attack rating class constant | **INCORRECT** | QA-005. |
| Resistance penalties | Magic **CONFIRMED**; elemental **LIKELY CORRECT** | Changelog: "Magic resistance penalty is now −30% on Nightmare, −60% on Hell". The −70% Hell elemental penalty cites patch 1.5.0 but isn't in the current docs or changelog. The docs' Difficulty Levels page returns 404. |
| Monster resistances (2,262 monsters) | **CONFIRMED** (source layout) | Read from `monstats.bin` using D2MOO's offsets, checked against known values (e.g. Baal's levels 60/100/120). |

### Calculation audit summary (hand-worked vs actual)

| Case | Expected | Actual | Result |
|---|---|---|---|
| Hell fire resist with +50% | 50 − 70 = −20 | −20 | Pass |
| Max fire resist with +5% | 75 + 5 = 80 | 80 | Pass |
| Two items of +100% all resists, Hell | min(200 − 70, 75) = 75 | 75 | Pass |
| Physical resist 80% | capped at 50 | 50 | Pass |
| Nightmare elemental / magic penalty | −30 / −30 | −30 / −30 | Pass |
| Strength: +5 spent, +10 flat, +10% | floor((25 + 5 + 10) × 1.1) = 44 | 44 | Pass |
| Dexterity: +3 spent, +4 all, +7% all | floor((25 + 3 + 4) × 1.07) = 34 | 34 | Pass |
| Weapon ED on uniques and sets (already in the damage line) | not applied twice | not applied twice | Pass |
| Amazon level 3 life (save file) | 127.5 | 120 | **Fail (QA-001)** |
| Paladin level 3 life (save file) | 140 | 145 | **Fail (QA-001)** |
| Amazon level 50, +20 Vitality, +10% life | floor((70 + 49 × 28.75 + 45) × 1.1) = 1,676 | 1,524 | **Fail (QA-001)** |
| Paladin level 30, +20 Energy, mana | 15 + 29 × 5 + 20 × 2 = 200 | 190 | **Fail (QA-003)** |
| Level 1 attack rating, Sorceress (Dexterity 25) | 25 × 5 − 35 + 10 = 100 | 75 | **Fail (QA-005)** |

---

## QA-001 — Life per level is wrong for Amazon, Necromancer, Paladin and Assassin

Severity: Critical
Area: Build Planner / Calculations / Data
Status: Confirmed

### Problem
The planner's life per level for four classes differs from the game's `charstats.bin`. The user's save files show the game file is right. Every life total for those classes is wrong, growing with level, and so is everything built on life: the life orb, the Stats panel, survivability in gear suggestions and attribute suggestions.

| Class | Game (`charstats.bin`) | Planner | Error at level 100 |
|---|---|---|---|
| Amazon | 28.75 | 25 | −371 |
| Necromancer | 28.75 | 25 | −371 |
| Paladin | 32.5 | 35 | +247 |
| Assassin | 30.5 | 30 | −49 |
| Sorceress, Barbarian, Druid | match | match | 0 |

### Reproduction
1. Open the Character Planner as an Amazon, level 3, with no attribute points spent.
2. Read the life orb: **120**.
3. Load the same character in game (the user's save `eee.d2s`): max life **127.5**.
4. Repeat as a Paladin at level 3 (`pala.d2s`): the planner shows **145**, the game **140**.

### Expected
Life = starting life + (level − 1) × the game's life per level + Vitality above base × life per Vitality. For example, the level 3 Amazon is 70 + 2 × 28.75 = 127.5.

### Actual
120 (Amazon) and 145 (Paladin), from MedianDB's per-level values of 25 and 35.

### Evidence
- `charstats.bin` (D2 1.13c layout, `LifePerLevel` byte 0x43 in quarter points): Amazon 115 (28.75), Necromancer 115 (28.75), Paladin 130 (32.5), Assassin 122 (30.5), Sorceress 140 (35), Barbarian 120 (30), Druid 100 (25). The three classes whose values match MedianDB confirm the quarter-point reading.
- Save files, read-only (stat 7 max life, in 1/256 units):
  - `eee.d2s` (Amazon level 3): 127.5.
  - `pala.d2s` (Paladin level 3): 140.
  - `Ashashin.d2s` (Assassin level 93): 2,921. The game formula gives 2,871, and the remaining 50 is probably a quest reward; the planner gives 2,925.
- Source of the planner values: `scripts/import-skills.mjs:142-158`, which maps `lifePerLevel: c.life_per_level` from MedianDB's `game_meta.json`.
- Formula: `src/planner/character.js:176` and `:250`.

### Suggested Fix
Read class base stats (life and mana per level, per Vitality and per Energy, and the to-hit factor) from the game extract (`charstats.bin`), as skills already are, and keep MedianDB only as a fallback. Add a test using the two level-3 saves as fixtures (127.5 and 140).

---

## QA-002 — Generic Shield, Helm and Body Armor runewords can't be used in class armour

Severity: High
Area: Runewords / Build Planner / Data
Status: Confirmed

### Problem
In the game, a runeword's allowed item types follow item-type inheritance. Every class shield type inherits from the generic shield type `shld`, and Barbarian and Druid helms inherit from the generic helm type `helm`. So runewords for "Shields" and "Helms" can be made in class shields and helms. The app only lets generic *weapon* runewords into class items (`Weapons` minus exceptions). As a result:
- the Runeword Finder hides valid runewords when you filter by a class armour base;
- the planner won't let you build them in class armour.

### Reproduction
1. Runeword Finder: set Item type to "Paladin Shields".
2. Only 4 results show (Sangreal, Tranquility, Zohar, Vortex).
3. Wall of Fire, Geas, Avatar, Khalim's Protector, Starlight and Svalinn are missing, although the game allows them.
4. Planner: choose Wall of Fire for the off-hand slot. The only bases offered are generic shields, never Paladin shields.

### Expected
Paladin Shields shows the 4 Paladin-only runewords plus the generic Shield runewords. The planner offers Paladin, Necromancer, Amazon, Assassin and Barbarian shields as bases for Shield runewords, and Barbarian and Druid helms for Helm runewords.

### Actual
Only exact category matches are accepted for armour.

### Evidence
- `runes.bin` (item types at 0x86, excluded types at 0x92, as D2 1.13c):
  - Wall of Fire, Avatar, Geas and Svalinn: allowed `shld`, no exclusions.
  - Shark: allowed `weap`, excluded `nknf` and `h2h`, which matches the docs' "(except Necromancer Daggers) (except Assassin Claws)" exactly. That validates the reading.
- `itemtypes.bin` inheritance (parents at 0x04 and 0x06):
  - `ashd` (Paladin shield) → `pash, shie, shld, …`
  - `head` (Necromancer shield) → `nesh, shie, shld, …`
  - `phlm` (Barbarian helm) → `helm, …`
  - `pelt` (Druid helm) → `helm, …`
- Affected types across all runewords:
  - `shld` (7 runewords): qualifying class types `head, ashd, azsd, ishd, basd, …`
  - `helm` (6 runewords): qualifying class types `phlm, pelt, …`
  - `tors` (9 runewords): qualifying class type `cloa`
  - Generic gloves, belts and boots: no class types qualify.
- Code:
  - `src/planner/items.js:168` `runewordBaseOk`: only `Weapons` has inheritance.
  - `src/composables/useRunetool.js` `results` filter: the same rule for the finder.

### Suggested Fix
Model the item-type inheritance for armour, like the existing `Weapons` rule: map each class armour category to its generic parent category (Shields, Helms, Body Armors), derived from `itemtypes.bin` or a small checked table. Apply the same helper in both `runewordBaseOk` and the finder's `results` filter so they stay consistent.

---

## QA-003 — Paladin mana per Energy is 1.5, the game file says 2

Severity: High
Area: Build Planner / Calculations / Data
Status: Confirmed (game file; not yet confirmed in game)

### Problem
The planner uses 1.5 mana per point of Energy for the Paladin. `charstats.bin` says 2. The other six classes match.

### Reproduction
1. Planner: Paladin, level 30, 20 points in Energy.
2. Read mana: **190**.

### Expected
15 + 29 × 5 + 20 × 2 = **200** (per `charstats.bin`).

### Actual
190 (15 + 145 + 20 × 1.5).

### Evidence
- `charstats.bin` `ManaPerMagic` (0x48, quarter points): Paladin 8, so 2.
- MedianDB's `game_meta.json`, via `scripts/import-skills.mjs:157`: 1.5.
- The saves can't settle this: `pala.d2s` has no Energy spent. Its level-3 mana (25) matches either value.

### Suggested Fix
The same as QA-001: take class stats from the game extract. Confirm with an in-game screenshot of a Paladin's mana after adding Energy.

---

## QA-004 — Saved planner data with a non-list `skillBar` or `buffs` makes the planner unusable

Severity: Medium
Area: State persistence / Build Planner
Status: Confirmed

### Problem
Loading a saved build calls `(raw.skillBar || []).filter(...)` and `(raw.buffs || []).filter(...)`. If either value is a truthy non-list (a string, number or object), this throws. The planner shows **"The planner data didn't load. (e.skillBar || []).filter is not a function"** with a "Try again" button, which can't help. The only recovery is clearing site data by hand. All other saved fields tested (19 of 21) are cleaned safely, and share links with the same bad fields are handled.

### Reproduction
1. In DevTools, run `localStorage.setItem("mxlrw2:planner", JSON.stringify({ cls: "Amazon", builds: { Amazon: { cls: "Amazon", level: 50, skillBar: "x" } } }))`.
2. Reload `#planner`.

### Expected
The bad field is dropped (as it is for `points`, `gear`, `attrs` and others) and the build loads.

### Actual
The planner never renders, and the error message wrongly blames data loading.

### Evidence
`src/planner/usePlanner.js:93` (`b.buffs = (raw.buffs || []).filter(...)`) and `:98` (`b.skillBar = ... (raw.skillBar || []).filter(...)`), inside `cleanBuild`.

### Suggested Fix
Use `Array.isArray(raw.x) ? raw.x : []` for both. Consider catching errors per class build in `cleanBuild`, so one broken build resets to empty instead of blocking the planner.

---

## QA-005 — Attack rating uses classic D2 class constants, not Median XL's

Severity: Medium
Area: Build Planner / Calculations
Status: Confirmed (game file)

### Problem
Attack rating is `5 × Dexterity − 35 + CLASS_BASE_AR[class]`, with the classic D2 1.13 constants (Amazon 5, Assassin 15, Barbarian 20, Druid 5, Necromancer −10, Paladin 20, Sorceress −15). Median XL's `charstats.bin` has a `ToHitFactor` of 10 for **every** class. Displayed attack rating is off by −25 to +10 depending on class. It isn't used in damage (chance to hit isn't modelled), but it's shown, and it feeds gear-suggestion weights.

### Reproduction
1. Planner, a new level 1 Sorceress: attack rating shows **75**.

### Expected
25 × 5 − 35 + 10 = **100**, if Median XL keeps D2's formula with its own constant.

### Actual
75.

### Evidence
- `src/planner/rules.js:33` `CLASS_BASE_AR`.
- `src/planner/character.js:306`.
- `charstats.bin` `ToHitFactor` (0x3C) = 10 for all 7 classes.

### Suggested Fix
Read the to-hit factor from `charstats.bin`. The rest of the formula (×5 − 35) is still classic D2 and should stay labelled an estimate.

---

## QA-006 — Five sacred uniques can never be shown; the level filter stops at 120

Severity: Medium
Area: Data / UI
Status: Confirmed

### Problem
The "Max lvl" filter is hard-coded to a maximum of 120, and saved state is clamped to 120. Five sacred uniques require level 125 or 130, so they're always hidden. The notice beside the filter says "Items above your maximum level are hidden. Raise it to 120 to see everything", but at 120 the page still shows "418 sacred uniques / 423".

### Reproduction
1. Open Sacred Uniques; the level is already 120.
2. The count reads 418 / 423.
3. Search "Tyrael's Might": no result.

### Expected
All 423 are reachable, and the notice is accurate.

### Actual
Storm Blade (125), Daydreamer, The Awakening, Tyrael's Might and Unveiling Eye (130) never appear. No other catalogue has items above 120.

### Evidence
- `max="120"` in `BaseItems.vue:54`, `FiltersToolbar.vue:57`, `SacredUniques.vue:40`, `SetsBrowser.vue:36`, `SocketablesList.vue:45` and `TieredUniques.vue:49`.
- The clamp is in `src/composables/useRunetool.js:418` (`Math.min(120, …)`), and the notice text in `SacredUniques.vue:17`.
- The planner allows character level 150.

### Suggested Fix
Use one shared constant for the maximum filter level (150, matching the planner, or the highest required level in the data) in the inputs, the clamp and the notice.

---

## QA-007 — Demhe, Anak and Gharaniq appear twice in the Runeword Finder

Severity: Medium
Area: Runewords
Status: Confirmed

### Problem
The docs list three runewords under two base headings each, and the bundled data keeps both rows. The finder shows duplicate cards, and starring (saved by name) stars both.

### Reproduction
1. Runeword Finder: search "demhe" → **2 identical results**. The same happens for "anak" and "gharaniq".

### Expected
One card per runeword, listing all its bases.

### Actual
Two cards each.

### Evidence
- `src/data/runewords.json`: two rows each for Demhe (Zod Lew), Anak (Hel Eld Ber) and Gharaniq (Jah Sil Elq).
- Cards are keyed by row id (`RunewordFinder.vue:25`), so Vue doesn't warn.
- Stars are keyed by name (`useRunetool.js`, `stars`).

### Suggested Fix
Merge rows with the same name and runes at import or in `src/data/index.js`, combining their base lists. Verify that the planner's runeword list doesn't duplicate them either.

---

## QA-008 — Help confirm values page is wider than the screen below about 470px

Severity: Medium
Area: Responsive
Status: Confirmed

### Problem
The "Everything still unconfirmed" table's minimum width stretches the page's grid column. At 375px the page is 470px wide, and the intro text and cards run off the right edge. The page scrolls sideways and text is clipped.

### Reproduction
1. Open `#confirm` at 375px wide.
2. The intro text is cut off at the right edge.

### Expected
Content fits the viewport; the wide table scrolls inside its own box.

### Actual
The page scroll width is 470px at a 375px viewport, and 416–469px at 320–430px.

### Evidence
Browser measurement: `div.confirm-intro [71→469]`, table `right=416`. Screenshot taken during the audit (`m-confirm-375.png`).

### Suggested Fix
Give `.confirm-page` `min-width: 0` on its grid items, and wrap the tables in a container with `overflow-x: auto`, or let the text column wrap.

---

## QA-009 — Planner header actions and Quests table overflow at 320px

Severity: Medium
Area: Responsive
Status: Confirmed

### Problem
At 320px, the Stats / Share build / Reset button row reaches 322px, and the Quests table reaches 372px, beyond the viewport.

### Reproduction
1. Open `#planner` at 320px wide.
2. Scroll sideways; the Quests table and the Reset button are partly off-screen.

### Expected
No horizontal page overflow at 320px.

### Actual
Page scroll width 322px; the Quests table runs 90→372px.

### Evidence
Browser measurement: `div.planner-action [71→322]`, `table [90→372]` (Quest / Normal / Nightmare / Hell).

### Suggested Fix
Let the action row wrap (`flex-wrap: wrap`), and put the Quests table in an `overflow-x: auto` wrapper or stack its columns on narrow screens.

---

## QA-010 — Every build re-downloads live data and rewrites tracked files

Severity: Medium
Area: Build / Data integrity
Status: Confirmed

### Problem
`npm run build` runs `prebuild`, which re-imports four catalogues from docs.median-xl.com and the skill data from MedianDB's latest GitHub commit, then rewrites `src/data/*.json`, `public/planner/data.json` and more. So:
- two builds of the same commit can produce different data;
- a deploy can ship unreviewed data changes;
- with `--fallback`, a network failure silently ships the old bundled data;
- Vercel builds depend on third-party sites being up.

### Reproduction
1. Commit, then run `npm run build`.
2. `git status` shows modified `public/planner/data.json` and `src/data/catalog-meta.json` (observed during this audit), plus new untracked files.

### Expected
Builds from the same commit produce the same data. Data refreshes are a deliberate, reviewed step.

### Actual
Every build fetches and rewrites data.

### Evidence
`package.json` `prebuild`: `import-docs.mjs --fallback && import-skills.mjs --fallback && build-item-atlas.mjs`.

### Suggested Fix
Make the imports a separate command (`npm run import-data`), commit the results, and have `prebuild` only verify or build from the committed files (the atlas step is deterministic). The runtime `/api/catalog` already keeps the four docs catalogues fresh.

---

## QA-011 — Monster portraits are third-party artwork and are cached without a version

Severity: Medium
Area: Legal / Performance
Status: Confirmed

### Problem
96 monster portraits were copied from diablo2.io into `public/planner/monsters/`. They're in a public repository and deployed. `src/data/monster-art.json` itself says: "Classic Diablo II artwork hosted by diablo2.io … Artwork remains owned by its respective rights holders." That's a rights and attribution risk. Separately:
- the images use fixed names with no version tag (`MonsterPortrait.vue` builds `${BASE_URL}${entry.file}`);
- `vercel.json` caches everything under `/planner/` as immutable for a year;
- the build version hash (`vite.config.js`) doesn't include the `monsters/` folder.

So a changed portrait would never reach returning visitors.

### Reproduction
1. `ls public/planner/monsters` shows 96 PNGs; `src/data/monster-art.json` gives their source as `https://diablo2.io/monsters/`.

### Expected
Only artwork the project may redistribute, with attribution, and cache-safe URLs.

### Actual
As above.

### Evidence
`src/data/monster-art.json` (`source`, `note`), `src/components/planner/MonsterPortrait.vue`, `vercel.json`, `vite.config.js` `plannerFilesHash`.

### Suggested Fix
Decide whether to keep third-party portraits: get permission, or use art extracted from the user's installed game (as item art is), or drop them. If kept, add them to the version hash or give them hashed names.

---

## QA-012 — Mastery skills' required levels disagree between sources

Severity: Medium
Area: Skills / Data
Status: Suspected

### Problem
MedianDB's tree data requires character level 100–125 for five Mastery skills; the game's `skills.bin` says level 1. The planner uses the higher value, so these skills can't be planned before 100–125. Neither source has been confirmed in game. Their numbers are from the import report: Tenacity 100 vs 1, Continuity 115, Endurance 115, Specialization 125, Chemistry 125. If the game's 1 is right, the planner wrongly blocks these skills.

### Reproduction
1. Planner, any class, level 90: open the Mastery tab.
2. Tenacity, Continuity, Endurance, Specialization and Chemistry are locked (they need 100–125).

### Expected
Unknown until confirmed in game.

### Actual
The planner blocks them until 100–125.

### Evidence
`public/planner/data.json` → `game.report.reqLevelDiffers`; `engine.requiredCharLevel` takes the maximum of the two.

### Suggested Fix
Add these skills to the Help confirm values page as a specific question: "at what level can you put a point in Tenacity?". Resolve with an in-game check.

---

## QA-013 — Two runeword names have their subtitle glued on

Severity: Low
Area: Runewords / Data
Status: Confirmed

### Problem
In the docs (and in the game's string table), two runewords have a second name line. The bundled data joins it with no separator:
- `Victory(Median XL - 6 years)`
- `EternalMedian 2005-2026Thanks everyone!`

### Reproduction
1. Runeword Finder: search "vic" and see the Victory card title.

### Expected
"Victory" with "(Median XL – 6 years)" as a subtitle, or at least a space or line break between them.

### Actual
The text is glued together, and searching "Victory(Median" matches.

### Evidence
`src/data/runewords.json`. The docs HTML has `Victory<br>(Median XL - 6 years)<br>`.

### Suggested Fix
Split the name on the original line breaks into `name` and `subtitle` when importing.

---

## QA-014 — Light theme: lightning-coloured text is just below the contrast minimum

Severity: Low
Area: Accessibility / Theme
Status: Confirmed

### Problem
In the light theme, `span.el-lightning` (e.g. "Lightning 35%" in the planner's damage-target resistances) is rgb(138, 116, 0) on the panel background, a 4.39:1 contrast ratio. The minimum for normal-size text is 4.5:1.

### Reproduction
1. Switch to Light theme and open the planner.
2. Read the target resistances line under "Damage against".

### Expected
At least 4.5:1.

### Actual
4.39:1.

### Evidence
Automated contrast scan of all pages in all three themes. This was the only real failure; a flag on the life orb text was a false positive caused by its gradient background.

### Suggested Fix
Darken the light-theme lightning colour slightly, e.g. to about #7a6600.

---

## QA-015 — The main bundle loads all catalogue data on every page (1.3 MB)

Severity: Low
Area: Performance
Status: Confirmed

### Problem
`index-*.js` is 1,315 kB (307 kB gzipped), because every catalogue JSON (runewords, uniques, sacred uniques, sets, bases and more) is imported into the main bundle. Every first visit downloads and parses all of it, even for a single page. Vite warns about the chunk size on every build.

### Reproduction
1. `npm run build`: note the chunk-size warning and the `index-*.js` size.

### Expected
Each page loads the data it needs, or the data loads as cacheable JSON.

### Actual
One 1.3 MB script.

### Evidence
Build output: `dist/assets/index-*.js 1,315.62 kB │ gzip: 306.77 kB`.

### Suggested Fix
Load catalogue data per page with dynamic `import()`, as the planner already does, or fetch it as versioned JSON.

---

## QA-016 — 261 distinct item lines are shown but not counted in stats

Severity: Low
Area: Build Planner / Calculations
Status: Confirmed

### Problem
Across all items, 261 distinct stat lines are parsed as "unknown". They're displayed but contribute nothing to character stats or damage. Examples:
- "Adds X% of current mana as lightning damage"
- "+X% Lightning Spell Damage per Y% Gold Find"
- "N% of Maximum Life added as Physical Damage while holding a shield"
- Arkenstone's "2% of Maximum Life Regenerated per second"

Builds relying on these items are under-counted. This is honest (nothing is invented) but easy to miss.

### Reproduction
1. Run `node scripts/dev/audit-values.mjs items`.
2. It lists 261 distinct uncounted lines.

### Expected
Either modelled, or clearly marked as uncounted wherever the item appears.

### Actual
Marked "(not counted)" in the custom item builder; check whether item hover sheets and the Stats panel make it equally visible.

### Evidence
`scripts/dev/audit-values.mjs` output ("261 distinct item lines parsed but not counted").

### Suggested Fix
Make sure every item display marks uncounted lines. Prioritise modelling the most common build-defining ones.

---

## QA-017 — "Maximum Life +%" is assumed not to apply to flat +Life

Severity: Low
Area: Calculations
Status: Suspected

### Problem
The planner applies "Maximum Life +X%" to base life (level and Vitality) only, not to flat "+N to Life" from items. For example, a level 10 Barbarian with +150 life and +30% gets 605, where (base + flat) × 1.3 would be 650. That's the classic D2 rule, but Median XL doesn't document it.

### Reproduction
1. Level 10 Barbarian with two rings: "+100 to Life / Maximum Life +20%" and "+50 to Life / Maximum Life +10%".
2. Life shows 605.

### Expected
Unverified for Median XL.

### Actual
floor(350 × 1.3) + 150 = 605.

### Evidence
`src/planner/character.js:250-254`.

### Suggested Fix
Label it as an assumption in the Stats panel note, and confirm with an in-game screenshot.

---

## QA-018 — Skill caps that grow with character level come only from MedianDB

Severity: Low
Area: Skills / Data
Status: Suspected

### Problem
Five skills (Warmth, Barkskin, Spiritual Alignment, Aptitude, Void Gazer) have a game cap of 1 or 2. The planner raises their cap with character level using a MedianDB rule, e.g. Warmth 1 at level 1, 12 at 50, 37 at 150. The game data doesn't show the progression, so it's unverified.

### Reproduction
1. Planner Sorceress level 150: Warmth shows a cap of 37 ("Maximum level increases with character level").

### Expected
Unknown until checked in game.

### Actual
MedianDB's progression is used.

### Evidence
`engine.levels(...).capSource` = `{ from: "MedianDB 2.14", dynamic: true }`, while `skills.bin` has cap 1.

### Suggested Fix
Add these skills to Help confirm values ("what's Warmth's max level at your character level?").

---

## Notes and limitations

- **Deployed site:** it wasn't audited. The working tree has about 74 uncommitted changes, so the live site differs from what was tested.
- **Docs pages:** the Difficulty Levels and Monsters pages (`/doc/concepts/difficultylevels`, `/doc/concepts/monsters`) return 404 at the time of the audit. That limits verification of difficulty penalties and monster mechanics.
- **Visible inferred rules:** these are labelled in the app and aren't counted as bugs here:
  - the classic D2 pierce rule;
  - deadly strike;
  - no attack or cast speed and no chance to hit in the damage-against-target figures.
- **Temporary scripts:** everything used for the audit was temporary and has been removed from the project. Nothing in `src/` or the data was changed.
