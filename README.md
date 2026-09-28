# Median XL Runetool — Vue 3 + Vite

A standalone export of the Runeword Finder and Tiered Uniques application, extended with Sacred Uniques, Sets, Gems & Runes and Base Items catalogues. The original dark fantasy design, vertical navigation, responsive layouts, themes, local preferences, filtering, rune inventory, favourites and tier comparisons are preserved.

## Run locally

Use Node.js 22 LTS (or Node 20.19+) and npm.

1. Extract this ZIP.
2. Open a terminal in `median-xl-runetool` (the folder containing `package.json`).
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the local URL printed by Vite, normally `http://localhost:5173`.

`npm run build` writes production files to `dist/`.
`npm run preview` serves the production build locally.
`npm test` checks the actual Vue rendering, data integrity, filters, rune counts, tiers and localStorage persistence.

No API keys, login, environment variables, ChatGPT tools, or Sites services are needed. The only backend is the optional `/api/catalog` function described below. The optional browser-agent integration from the hosted edition has been removed. All gameplay data and rune images are bundled locally. Google Fonts is the only external presentation request; readable system/serif fallbacks are provided if it is unavailable.

## Deploy to Vercel

1. Put the project contents in a Git repository and import it into Vercel.
2. Set the root directory to the folder containing `package.json`.
3. Use the **Vite** framework preset, **npm run build** as the build command and **dist** as the output directory. `vercel.json` also declares these settings.
4. Deploy. No environment variables are necessary.

Navigation uses `#runewords`, `#uniques`, `#sacred-uniques`, `#sets`, `#socketables`, `#base-items` and `#planner`, so direct links and refreshes do not need server-side routing or rewrite rules. The `dist` directory can also be hosted on any static web host.

## Project structure

- `src/App.vue` — application shell and shared state provider.
- `src/components/AppSidebar.vue`, `AppHeader.vue`, `AppFooter.vue` — shared layout.
- `src/components/RunewordFinder.vue`, `FiltersToolbar.vue`, `RunewordCard.vue` — search, filters and cards.
- `src/components/TieredUniques.vue`, `UniqueCard.vue` — unique catalogue and tier comparisons.
- `src/components/SacredUniques.vue`, `SetsBrowser.vue`, `SocketablesList.vue`, `BaseItems.vue` — the four docs-backed catalogues.
- `src/components/RuneDrawer.vue` — accessible native-dialog inventory drawer.
- `src/components/AppIcon.vue` — local interface icons.
- `src/composables/useRunetool.js` — Vue Composition API state, computed filtering, inventory, tier selection, theme and persistence.
- `src/data/runewords.json` — 234 official runewords.
- `src/data/uniques.json` — 255 unique entries, including 909 individual tier/item records.
- `src/data/rune-images.json` — embedded rune artwork, including runes used by the expanded catalogue.
- `src/data/sacred-uniques.json` — 423 sacred uniques: `[name, base, category, "stat|stat"]`.
- `src/data/sets.json` — 51 sets with 188 items: `[name, subtitle, class|null, "bonus|lines", [[item, base, "stat|stat"], ...]]`.
- `src/data/socketables.json` — 111 gems and runes: `[name, group, level, weapon, armor, shield, imageKey]`.
- `src/data/socketable-images.json` — embedded gem artwork (runes reuse `rune-images.json`).
- `src/data/base-items.json` — 218 base items: `[name, category, [["Tier 1"…"Sacred", "stat|stat"], ...]]`.
- `src/data/index.js` — data normalization, stat tags, class/item groupings and sort definitions.
- `src/data/sources.json` — data provenance and snapshot date.
- `src/assets/style.css` — shared design tokens, all four themes and responsive styling.
- `tests/runetool.test.mjs` — rendering and behavior checks.
- `lib/docs-catalog.mjs` — fetches and parses the four docs pages; shared by the importer and the live endpoint.
- `api/catalog.js` — `GET /api/catalog` Vercel function returning the live catalogue (also mounted by `vite.config.js` for dev/preview).
- `scripts/import-docs.mjs` — regenerates the bundled sacred unique, set, socketable and base item JSON (`npm run import-docs`).
- `src/data/catalog-meta.json` — when the bundled catalogue was fetched, and its counts.
- `src/components/planner/` — the Character Planner: `CharacterPlanner.vue` (page), `AttributesPanel.vue`, `SkillsPanel.vue`, `SkillTreeGrid.vue`, `SkillDetail.vue`, `EquipmentView.vue`, `ItemPicker.vue`, `ItemEditor.vue`, `StatsView.vue`.
- `src/planner/engine.js` — skill rules: point budget, quests, prerequisites, tag limits, devotions, dynamic max levels, tooltips.
- `src/planner/formula.js` — safe parser for skill scaling formulas (no `eval`).
- `src/planner/statparse.js` — turns item stat text into numbers (rolls, stat keys, procs, oskills).
- `src/planner/items.js` — one catalogue of all gear, sockets, runeword bases and charms/relics.
- `src/planner/character.js` — the character sheet calculations and their sources.
- `src/planner/recommend.js` — item suggestions from the build's skills (profile, stat weights, scoring with reasons).
- `src/planner/rules.js` — game constants, each with the patch note or docs page it comes from.
- `src/planner/usePlanner.js` — planner state, saving and share links.
- `public/planner/` — skill data (`data.json`), skill atlases and item icons, loaded only when the planner opens.
- `scripts/import-skills.mjs` — rebuilds `public/planner/` from azadix/medianxl-db (`npm run import-skills`), then merges the game-file extract for the same patch.
- `scripts/extract-item-art.mjs` — renders item inventory art from an installed Median XL (see "Item art").
- `scripts/extract-game-data.mjs` — reads skill tables from an installed Median XL into `data/game/<patch>/skills.json` (see "Skill data and the game files").
- `data/game/<patch>/` — the game-file extract and `fixtures.json` (in-game tooltip observations used by the tests).
- `src/planner/d2calc.js`, `src/planner/gamecalc.js` — the game's compiled skill formulas: decoder, interpreter and skill variables.
- `src/planner/provenance.js` — labels for where each calculated value comes from.
- `scripts/dev/` — developer checks: parser coverage and character smoke tests. `node scripts/dev/audit-values.mjs` sweeps every skill tooltip (at several levels), every item variant worn on a matching class, every socket filler in each socket type, and every mystic orb on items it fits. It flags NaN or undefined values, negative costs, values that can't be worked out, and item lines that are parsed but never counted.
- `tests/planner.test.mjs` — planner rules, parser, items, calculations, sharing and rendering.
- `tests/skill-accuracy.test.mjs` — skill values against the game files and in-game tooltips.
- `scripts/` — also contains optional browser-state migration utilities.

## Saved state and moving domains

The original storage keys are preserved:

- `mxlrw2:state`: search, class, item type, max level, sort, stat/damage/rune filters, generic-class option, inventory filter, starred-only filter and full-stats setting.
- `mxlrw2:owned`: rune counts.
- `mxlrw2:stars`: favourites by runeword name.
- `mxlrw2:theme`: Auto, Light, Dark or High Contrast.
- `mxlrw2:planner`: Character Planner builds (one per class), selected view and tree tabs.
- `mxlrw2:saved-builds`: Up to 100 named build snapshots, stored only in this browser. Save from the planner and open, rename or delete them on the Builds page. Saving an existing name replaces that snapshot; opening one replaces the current planner build for its class.

The Builds page also offers generated level-150 starter builds with 450 Signets of Learning (including the Justicar cap increase), fully allocated skill and attribute points, and equipment suggested for the finished skill allocation. Remaining skills are compared for damage, survivability and recovery; equal-scoring choices favour the main tree and passives. Regenerate them with `npm run presets` after changing planner rules or data: it runs `scripts/build-presets.mjs` in several processes at once (half the logical cores, at most 8; `npm run presets -- 6` to choose), each building every Nth preset into its own progress file (`SHARD=k/N`), then merges them and publishes with the usual checks. A full run takes about 20 minutes on 6 processes; `STAGES_ONLY=1 npm run presets` remakes only the levelling stages (about 10), keeping the endgame builds. A stopped run resumes where it left off (`RESUME=1`; each finished preset is saved to `.preset-progress.json`). The generator checks planner issues and damage responses before publishing; failed validation keeps the previous catalogue. These are planner-generated starting points, not in-game-verified builds.

There is one starter build per skill tree (`scripts/lib/preset-plan.mjs`). Fourteen are hand-picked; every other tree's main skill is chosen from the data: its active skills with damage the planner can work out are tried on a probe build and the strongest wins, the runner-up taking the right-hand slot. Trees without a damage skill are built around their strongest summon. Trees with neither (Amazon Divine, Necromancer Deathspeaker, Paladin Nephalem, Sorceress Poison) are listed as skipped in `preset-builds.json` until the planner can work out their skills. Each build also fills its skill bar with its other usable skills (buffs, stances and morphs switched on, then damage skills with more than one point, movement and summons). Skill-bar damage skills must respond to points, synergies or gear; the left and right skills must pass every check. Starter cards show the skills as icons with the skill's tooltip on hover or focus. `ONLY=id1,id2 node scripts/build-presets.mjs` builds some presets without publishing, to check them (their stages are merged into the stages file).

Every stage, and the endgame build, also hires a mercenary: none, or whichever party-buff mercenary (Ranger, Shapeshifter, Bloodmage) makes the build score highest, geared for +All Skills and then survival; the character's gear is suggested last, with its buff counted. A loadout that can't be put on one item at a time is rebuilt with wearable items, and the stage notes what changed. The test "every starter build stage follows the planner rules" checks every stage with the planner: no rule problems (deed-locked skills below their difficulty, caps, levels), wearable gear, no warnings, a real mercenary.

**Levelling stages.** Every build in the planner has four stages, Normal, Nightmare, Hell and Endgame (the switch under the planner toolbar), each its own version of the character, so players make their own levelling guide by filling them in. An empty stage starts at level 50 (Normal), 100 (Nightmare) or 125 (Hell), or as a copy of another stage. Save codes and share links carry every stage. Each stage also lists where to level (the areas whose monster level is nearest the character's, from `levels.bin` via `scripts/extract-areas.mjs`) and the runewords new since the stage before for the item types the build wears (`src/levelling.js`).

Starter builds open with their stages filled in: the same build made again with the same pipeline at levels 25 and 50 (Normal), 75 and 100 (Nightmare) and 125 (Hell), then the endgame build at 150. Median XL's areas set those brackets: `levels.bin` gives monster levels of 1–50 in Normal, 51–100 in Nightmare and 100–125 in Hell (fields 0x16, 0x18, 0x1A). At each stage, skills are capped by character level; when the build's main skill can't be learned yet, the stage levels with the strongest damage skill that can (from the same tree first) and says when the main skill unlocks. Gear is Suggest gear at that level (nothing above it), damage is against the typical monster of that difficulty, and levels 50, 100 and 125 become the Normal, Nightmare and Hell stages. The stages are written to `src/data/preset-stages.json`, loaded only when a starter build is opened; `ONLY=id` runs merge that build's guide into the file, and `NO_STAGES=1` skips the guides.

Browser storage belongs to the domain and browser profile. It does **not** transfer automatically from the ChatGPT-hosted URL to localhost or a new Vercel domain. No private browser state is embedded in this ZIP.

To transfer your existing preferences:

1. Open the old Runetool site in your usual browser.
2. Open Developer Tools → Console and run the complete contents of `scripts/export-browser-state.js`. It downloads `median-xl-runetool-state.json`.
3. Open the new local/Vercel app in that same browser.
4. In its console, run the complete contents of `scripts/import-browser-state.js` and select your downloaded JSON file. The app reloads with the imported state.

These scripts read/write only the six Runetool keys; they do not contact a server or access other apps' storage. Importing replaces Runetool preferences and builds included in the backup on the destination domain. Older backups without named snapshots leave existing snapshots untouched.

## Catalogue and gameplay behavior

This export includes the high-contrast native-select fix and the expanded official item data collected on 25 September 2026 for Median XL 2.14. Tiered uniques include weapons, armor, class-specific items, jewelry and quivers. Jewelry/quivers without tier upgrades are presented as single-version items. The original partial catalogue has been expanded, not replaced with demonstration data.

Runeword and tiered-unique data is a bundled snapshot, not a live API. The other four catalogues refresh automatically (see "Keeping item data current"). Preserve the documented raw-array schemas when updating JSON. Changes in game patches require refreshed data.

Rune ownership uses the original app's exact-count logic. A rune owned once cannot fill two identical sockets. Cubing advice is informational: the app does not automatically spend or upgrade your rune inventory.

## Character Planner

The Character Planner (`#planner`) combines three views of one character, laid out like the in-game screens:

- **Character**: attributes with stat points and Signets of Learning, life and mana, resistances, defense, block, damage and attack rating. The class's skill trees sit beside them, with tabs down the right edge.
- **Equipment**: a paper doll with weapon sets I and II. Any slot takes tiered uniques (with tier), sacred uniques, set items, runewords (on any valid base and tier), plain base items or a custom item. Each item has roll sliders and sockets, which take gems, runes or jewels. Charms and up to three relics can be added too.
- **Stats**: the full stat sheet. Select any value to see every source that contributes to it.

Everything is connected:
- +skills on gear raise skill levels in the tree.
- Passive skills (and buffs you choose to count) add their stats.
- Set bonuses switch on as pieces are equipped.
- Requirements, class restrictions and two-handed conflicts are flagged.

Builds are saved per class in the browser and can be shared as a link.

### How numbers are worked out

- **Item text** is parsed into numbers by `statparse.js`. About 98.5% of catalogue lines are recognised. Lines it can't read are listed as "not counted", never silently dropped. Procs, oskills and skill-specific effects are listed separately.
- **Runeword stats** are treated as already including their runes' stats, as the docs appear to merge them.
- **Game rules** come from the docs and patch notes, cited in `rules.js`:
  - resistance penalties (−30/−70 elemental, −30/−60 magic);
  - the 50% physical-resist and 60% avoid caps;
  - the block formula and 50–80% cap;
  - the spell focus formula;
  - stat points (5 per level, Lam Esen's Tome, 400 signets + 50).
- **Estimates** (labelled "est." in the app) use our own calculations of classic Diablo II formulas, which the docs say Median XL mostly keeps: weapon damage, attack rating and defense. The "Combat Speeds" affix is applied to attack, cast, block and hit-recovery speed. The base 75% maximum resistance is the D2 default.
- **Speed breakpoints** (Stats → Speed → Attack frames / Cast frames) use the formulas of the official [Median XL speed calculator](https://dev.median-xl.com/speedcalc/), with animation frames from the game's `animdata.d2` and each weapon's class and speed modifier from `weapons.bin` (`scripts/extract-speed.mjs`). Wereforms, throwing and dual wielding aren't covered.
- **Chance to hit** on attack skills (est.) uses the classic D2 formula against the chosen monster's defense, which comes from the game (`monstats.bin` percentage of `monlvl.bin`). Median XL doesn't document the formula.
- **Mercenaries** (the planner's Mercenary tab): type, level, hiring difficulty, the level it was hired at, and gear on a paper doll like the game's (no rings), with its stats and skill levels; Suggest gear picks its items (+All Skills first, then survival) and its items open in the item editor. Base stats, growth and skills come from the game's `hireling.bin` (`scripts/extract-mercs.mjs`): stats follow the table row at or below its level, skills grow from the level it was hired at (in-game Town Guard, Ranger and Bloodmage screenshots, GitHub issues #9-#11). The class items each act can wear and the fixed bonuses come from the [docs](https://docs.median-xl.com/doc/class/hirelings); the off-hand taking shields is assumed. The party buffs (Dark Power, Bloodlust, Firedance) come from the skills' own game formulas and are added to your stats, each with a switch; their tooltips match the game at the levels checked. Dark Power's tooltip attack speed (220 × …) is 1% above the stat it applies (200 × …); which the game uses isn't confirmed.
- **Not calculated**: most spell base damage (the game formulas use variables not yet decoded), and values that depend on unmodelled character stats inside skill formulas.
- **Skill data** comes from azadix/medianxl-db, checked and completed from the game files. See below.

## Skill data and the game files

Two datasets, never mixed across patches:

| Dataset | Patch | Where |
| --- | --- | --- |
| MedianDB (community) | 2.14, commit in `public/planner/data.json` | `scripts/import-skills.mjs` |
| Installed game files | 2.14.4 | `data/game/2.14.4/skills.json` |

`scripts/lib/merge-game.mjs` merges the game extract only when its major.minor patch equals MedianDB's dataset version, and throws otherwise. Both versions are shown under the planner and on every skill sheet.

**Skill trees follow the game.** MedianDB lists the shared Mastery tab and the Paragon of Fate and Sanctity rewards only under the Amazon. In game every class has its own copy of each, with the same caps and formulas. `alignTreesWithGame` (in `merge-game.mjs`, run by `import-skills`) uses the game's tree positions to:
- add any skill the game places in a class's tree but MedianDB lacks, reusing MedianDB's entry of the same name;
- set rows and columns to the game's;
- put tabs in the game's page order (for example, Druid: Werebear before Werewolf; Sorceress: Mastery before Coven).

Skills in the game data that no tree places (Shred, Elvensong, Soul Sever and others) are left out. `node scripts/dev/tree-vs-game.mjs` compares the planner's trees with the installed game's, and a test checks them against the extract.

**Help confirm values** (`#confirm`, linked under "Report a bug or issue"): each tooltip value records which parts of it haven't been seen in game (`source.gaps`: a line format, a formula variable or operator, or a display rule). `src/planner/confirmGaps.js` counts how many skills share each gap and picks, greedily, the skill screenshots that would confirm the most. The page lists them with what each would check, and links to a GitHub form (`.github/ISSUE_TEMPLATE/confirm_values.yml`). A screenshot someone sends becomes a fixture in `data/game/<patch>/fixtures.json`. `node scripts/dev/fixture-draft.mjs` turns the issue into a draft fixture with the planner's current lines (`gh issue view <n> --json body -q .body | node scripts/dev/fixture-draft.mjs - <n>`): correct each line that differs from the screenshot and add it to `fixtures.json`. From then on the test "every in-game fixture reproduces" holds the planner to the game's values.

**Class stats come from the game.** `extract-game-data` also reads `charstats.bin`: starting attributes, life and mana, life and mana per level, per Vitality and per Energy, and the to-hit factor. `mergeClassStats` (run by `import-skills`) uses these over MedianDB's, and logs each difference. MedianDB's life per level was wrong for four classes (Amazon and Necromancer 25 instead of 28.75, Paladin 35 instead of 32.5, Assassin 30 instead of 30.5), and its Paladin mana per Energy was 1.5 instead of 2. The user's saves confirm the game file (`tests/fixtures/save-base-stats.json`: Amazon level 3 has 127.5 life, Paladin level 3 has 140). Attack rating uses the game's to-hit factor, which is 10 for every class.

**Runeword bases come from the game.** `node scripts/extract-runeword-bases.mjs [game dir]` reads the game's runeword and item tables (`runes.bin`, `itemtypes.bin`, `weapons.bin`, `armor.bin`). It writes the base categories each runeword can be made in to `src/data/runeword-bases.json`. The game allows a runeword in any item whose type, or a type it inherits, is one of the runeword's, and none of its excluded types. So "Shields" runewords also go in every class shield, and "Helms" runewords in Barbarian and Druid helms and circlets, which the docs' base lists don't say. Both the Runeword Finder and the planner use this table, and runeword cards list the extra categories as "Also fits". The docs' own exceptions (e.g. Shark: not Necromancer Daggers or Assassin Claws) match the table.

**Loot filters.** The Loot Filters page lists the community filters on the [median-xl.com Filter Exchange](https://www.median-xl.com/filters/index.php) through `/api/filters` (`api/filters.js`, parsing in `lib/filters-site.mjs`; cached like `/api/catalog`), shows a filter's rules in words, and lets you edit a copy. Your own filters are kept in this browser and export as the same JSON the Filter Exchange's "Copy to Clipboard" gives (the format the community editor [azadix/mxl-filter-editor](https://github.com/azadix/mxl-filter-editor) documents). Item classes and item codes come from the game: `node scripts/extract-filter-data.mjs [game dir]` reads `itemclasses.bin` (the 109 filter classes, e.g. 19 "Tier Sacred") and the item codes and names from `weapons.bin`, `armor.bin` and `misc.bin` into `src/data/filter-data.json`. A rule stores an item code as its four characters read as a little-endian number ("r24 " → 540291698, Ist Rune).

**Horadric Cube.** The Cube Recipes page runs the game's own recipe table: `node scripts/extract-cube.mjs [game dir]` reads `cubemain.bin` (7,214 enabled recipes in 2.14.4) with the item, item-type, unique, set, property and stat tables into `src/data/cube-main.json` (loaded only on that page). `src/cube/engine.js` transmutes as the game does: a recipe needs exactly its ingredients and nothing else, the first recipe in the table that fits wins, and class, difficulty, character level and the item conditions (Shrine Blessed, a container's Quantity, prefix and suffix counts) are checked. A few conditions (quests, events) can't be, and are flagged. `src/cube/stats.js` writes recipe outputs as item lines from ItemStatCost's description functions. The page's guide section is still the docs' summary (`src/data/cube-recipes.js`). The extractor also writes `src/data/cube-made.json`, a small index of which uniques and items the cube makes (a recipe that creates them, or a tiered base rerolled as a unique); the Tiered Uniques, Sacred Uniques and Gems & Runes cards use it for a "Made in the Horadric Cube" link that opens the Cube page with that recipe loaded (`#cube?make=unique:Brainhack`, `#cube?make=item:Eth`).

**Superior quality comes from the game.** `node scripts/extract-superior.mjs [game dir]` reads `qualityitems.bin` and `properties.bin` and writes what a Superior item adds to `src/data/superior-items.json`. In 2.14.4 a superior weapon has +35–60% Enhanced Damage, or +35–50% with +50–100% Attack Rating; superior armour has +35–60% Enhanced Defense, or +35–50% with +1% Physical Resist. Base Items cards list these, and in the planner a base or runeword can be set to Superior (Quality, in the item editor), with a roll slider for each range. The bonus counts for that item only. An item with its own Enhanced Defense starts from its maximum defense + 1, as in D2: a Superior Greaves (4) at +47% shows 1,206 in game, (820 + 1) × 1.47.

**Extraction** (`node scripts/extract-game-data.mjs [game dir]`, default `$MXL_DIR` or `C:/games/median-xl`):
- `medianxl-version.mpq` → `version.mxl` gives the exact patch.
- `medianxl-YmludGJsdHh0.mpq` holds the compiled D2 1.13c tables: `skills.bin` (572-byte rows: required level, parameters, calc formulas, passive stats, elemental tables), `skills2.bin` (byte 47: hard-point cap), `skilldesc.bin` (names, tooltip lines, and each skill's tree tab, row and column at bytes 0x02–0x04), `skillscode.bin` (formula bytecode), `skilldesccode.bin` (tooltip-line formulas) and `skillcalc.bin` (formula variable names).
- The MPQ reader (`scripts/lib/mpq.mjs`) handles encrypted tables and zlib/implode compression.
- The output records each source file's SHA-256 and the extraction date.

**Formulas.** `d2calc.js` decodes the postfix bytecode. Each opcode records whether it is confirmed in game or inferred (see "Decoded formula instructions" below). Anything else is kept undecoded and never guessed at: 1,962 of 1,963 skill formulas and all 3,376 tooltip-line formulas decode.

**Level concepts.** The engine keeps these apart:
- **Base Level** (`blvl`): hard points;
- **Effective Level** (`lvl`): hard points + gear bonus levels;
- **Character Level** (`ulvl`);
- **hard-point cap**: from `skills2.bin`, unless MedianDB's 0 marks a cap built by level or skill rules;
- **required character level**: the higher of MedianDB and `skills.bin`.

Each formula uses whichever of these the game formula names. For example, Way of the Spider's pierce uses Base Level, its Poison Spell Damage uses Effective Level and Character Level, and its poison synergy uses Base Level and Character Level.

**Provenance.** Every tooltip value records one of these (shown in words under "How this is calculated", not as tags on the lines):

| Label | Meaning |
| --- | --- |
| Verified | Game formula that reproduces an in-game tooltip exactly (`fixtures.json`) |
| Game files | Game formula whose variables are all confirmed |
| Checked | MedianDB formula with the same results as the game's over Base Levels 1–cap and Character Levels 20–120 |
| Inferred | Game formula using an unconfirmed variable, an inferred function, or a D2 display rule not yet seen in game |
| Community | MedianDB formula with no game formula to compare against |
| Missing | Neither source can produce it |

In the skill panel, "How this is calculated" lists the source, the formula, the inputs, anything assumed and the in-game check. In the stats panel, totals show how much comes from unconfirmed skill values.

**Synergies** come from the game's own tooltip lines. `skilldesc.bin` stores 17 lines per skill, each with a type, two strings and two formulas; lines 10–16 are the synergy block.
- Each skill shows that block with its formulas worked out for the build, plus a "from synergies now" line: what the damage or duration synergy formula adds at the current levels.
- These can differ. Way of the Spider says "+20% Poison Damage to Weapon per Base Level", but the formula also scales with Character Level: about +13.5% per Base Level at level 93.
- How each line type is displayed lives in the game client, not the data. `src/planner/desclines.js` records, for each type, whether its format is confirmed in game or inferred.
- A formula that needs a value the planner can't work out (for example another skill's `exma`) shows as missing, never as 0.

**Tooltip lines from the game.** Where MedianDB and the game have a tooltip line with the same name, the game's line is used, with its own formula and wording (e.g. "Activation Delay: 13 frames" rather than MedianDB's outdated "0.5 seconds"). Elemental damage uses the skill's own damage line, e.g. Incineration Trap's "Fire Damage: 81-88 per second".

**Formula variables and what's assumed:**
- `ast1`–`ast6` are a skill's aura-stat formulas (`skills.bin` 0x68–0x7C); an empty slot is 0. Blood Skeleton's "+67% Global Damage Reduction" (`min(ast4, 1) × 67`), shown in game at Base Level 20 and not at 1–2, fixes the position.
- Stat 470 is a minion damage bonus: Blood Skeleton's and the Spirits' `ast1` add it to the damage multiplier. Like other hidden stats, it comes from learned passives.
- `pst1`–`pst5` are its passive-stat formulas.
- Formulas also read unnamed helper skills (26 of them, e.g. the one holding the trap activation delay and multiplier). These are extracted too.
- `syn1`–`syn6` and `aura` are Median XL-specific and their meaning is unknown. They're assumed 0 and listed under "How this is calculated". Incineration Trap's in-game pierce, range and activation delay match only with those values at 0.
- Other skill fields, each located by matching MedianDB's numbers:

  | Variable | Meaning | Where |
  |---|---|---|
  | `len` | duration | `skills.bin` 0x60 |
  | `rng` | range | 0x64 |
  | `pets` | number of minions (PetMax) | 0xc0 |
  | `skcd` | cooldown | 0x190 |
  | `mana` | mana cost | `skills2.bin` 0x36/0x3a formulas in `skills2code.bin`, with ManaShift at `skills.bin` 0x188 |
  | `wdm` | weapon damage %: SrcDam in 128ths | 0x1a5 |
  | `pdmn`/`pdmx` | physical damage table | 0x1a8–0x1d8 |

  `blz1`–`blz7` are read as `bl12`–`bl78` counted from Base Level 0 (inferred; used once).
- Runtime conditions are assumed off and listed: the area you're in, active states, stats from particular sources. Random rolls use their average.
- Innate and shared skills (Vindicate (Innate), Paragon of Fate) are paired with the game's class-less copy nearest that class's skills. Only their formulas are used, not a cap or required level.

**Decoded formula instructions.** Beyond the confirmed ones, these are inferred:
- a 4-byte constant;
- the comparisons < > <= >= == !=;
- negation and `?:`;
- the functions rand, state, statsrc and unitstat.

With them, every formula parses to exactly one value (7,449 of 7,449). The meanings come from the formulas' own shapes, e.g. `lvl < 41 ? 5 × lvl : 120 + 2 × lvl` meets at 40. They are cross-checked against 84 MedianDB values: 66 agree, and every difference is a game formula that depends on another skill being learned. Results using them are labelled inferred.

**Rules confirmed by in-game tooltips** (First Level of Askari Lightning, Discharge, Lava Pit, Blood Skeleton, Death Pact):
- An unlearned skill's "First Level" is Base Level 0 at level 1 (Askari's 300%).
- Lines worth 0 aren't shown (Death Pact's tree bonuses, Discharge's Thunder Frequency, Blood Skeleton's damage reduction).
- Multi-line text is shown bottom-up.
- Mana cost comes from the game's own formula.
- `pets` is the PetMax formula (`skills.bin` 0xc0).
- Function 10 is hard points in the class's nth skill tree.
- An unknown value multiplied by 0, or in the branch of a condition that isn't taken, doesn't block a result.

**Hidden stats** (other than attributes, spell damage and pierce) are the sum of the passive-stat formulas of the skills the character has learned, as in D2. Stat 470 comes from Resurgence or Fervor, for example. Items and buffs aren't counted, and the source says so.

**`enma`/`exma`** are a skill's elemental damage as its tooltip shows it. Three in-game checks agree:
- Stormcall's 4–5 gives Askari Lightning's 15;
- Askari's "Deals 303%", and 304% at the next level;
- Lava Pit's `enma × 5`, `exma × 5` = 40–45.

Whether elemental mastery is included isn't known yet.

**Minion life and attack rating** (`mnhp`/`mnar`) are built from each summon skill's own parameters. Both were inferred from in-game tooltips of Blood Skeleton (levels 1–3) and Guardian Spirit (levels 1–3), both at character level 3, and every one of those values is reproduced:
- attack rating: `par5 × (level − 1)`;
- life: `(par3 + (level − 1) × par4) × (100 + par2)/100 × (100 + life bonus)/100`, rounded once. The life bonus comes from:
  - the summon's own minion-life formula (`clc1`: Guardian Spirit `1 + stat 444 + 9 × Base Level`, Blood Skeleton 0), or else its "+N% Life per Base Level" line;
  - plus an extra `(character level − 1) ÷ 2` %, learned or not. It's 0 at levels 1–2, 1 at level 3, and 49 at level 99 (Blood Skeleton level 20: 3576; Abyss Knight level 25: 5422 and 5623). It fits 16 of 17 in-game values exactly, but its source in the game files isn't known, so it's listed as an assumption. The 17th, Blood Skeleton's next-level 3755, comes out 3754: the game's exact rounding differs slightly, and it's recorded as a known difference;
- summon damage bonuses are part of the game's own damage formulas (Guardian Spirit's `ast1` is `stat 470 + 14 × Base Level`, which is why it shows 7, not 6, at level 2).

Other summons use the same rule and are labelled inferred until checked in game.

**Nothing is missing:** every tooltip value of every tree skill is worked out, at every level combination tested. A test fails if one isn't.

MedianDB lines that the game's own tooltip doesn't have, and that neither source has a value for (Shockwave Trap's "Physical Damage"), are listed under the tooltip instead of shown as unavailable.

**Reference tooltips** (`data/game/2.14.4/fixtures.json`):
- **Way of the Spider:** Base Level 25, level 41, Character Level 93.
- **Incineration Trap:** not learned, Character Level 99. That level is inferred as the only one giving both 81 and 88.
- **Magic Missiles** (GitHub issue #1): not learned and 1 point, Character Level 3, Energy 15, no + skills; nothing inferred. It confirms the "6 bolts" line format (type 7) and, with Stormcall, the synergy line format "Energy: +X% Increased Damage" (type 63). Together with the other fixtures' Mana Cost and range lines, it confirms the `mana` and `rng` formula variables.
- **Mind Flay** (GitHub issue #2): not learned, 1 point and 2 points, Energy 15, no + skills. The Character Level wasn't stated. Levels 2 and 3 are inferred as the only ones fitting each screenshot's six damage values and two mana costs (the character levelled for each point). It confirms:
  - physical damage from the skill's table (`pdmn`, `pdmx`), shown as "+2" when min and max are equal;
  - the raw elemental damage display;
  - the Shock stats (`ast1`, `ast2`) and duration (`len`).

  A line the game shows only in a section below (Duration, under Shock) is kept out of the main block.

Every value, line and synergy text in them is reproduced by the tests.

**Weapon poison** (items' "Adds X-Y Poison Damage over N seconds", Way of the Spider) is its own pool:
- per-second damage adds up;
- item durations are averaged;
- skill durations are added;
- the attack's weapon damage % scales it, and Poison Spell Damage doesn't.

This follows the 2021 forum poison guide and is labelled inferred for 2.14.

## Item art

Uniques, sacred uniques, set items and base items show their in-game inventory art, rendered from the installed game by `node scripts/extract-item-art.mjs [game dir]`.

- **How the game draws it:** almost every unique and set item uses its base item's graphic, recoloured by the item's own colour transform. Only charms, relics and a few quest items have art of their own.
- **What the script does:** it reproduces that: the DC6 graphic, the game palette (`pal.dat`) and D2's item colour maps. It writes PNGs to `data/game/<patch>/item-art/` (about 1,500 images) and a manifest with source file hashes to `data/game/<patch>/item-art.json`.
- **Sprite sheets:** `node scripts/build-item-atlas.mjs` (run by `prebuild` and `import-data`) packs the graphics the site shows into three palette PNG sheets in `public/planner/items/` (about 1.1 MB): two for unique and set art, one for base items. The index is `src/data/item-atlas.json`. D2 art fits one 256-colour palette, so the sheets are pixel-identical to the individual PNGs. A page makes one request per sheet rather than one per item, and art nothing refers to (dyes and the like) is left out. Names are matched case-insensitively, because the game data writes `DimensionalKey.png` as `dimensionalkey`.
- **Merge:** `import-skills` merges the manifest only when its patch matches the MedianDB dataset.
- **Runewords** have no art of their own in game. They show their chosen base, or in the item list, the first base they can be made in.

## Hosting and caching

The site is static apart from `/api/catalog`. To keep requests and downloads low:

- **Fingerprinted files:** the app bundles (`/assets/`) and the sprite sheets have content hashes in their names. `vercel.json` lets browsers cache everything under `/assets/` and `/planner/` for a year.
- **Fixed-name files:** `data.json`, `item-art.json` and the WebP art are requested with `?v=<hash of their contents>` (`__BUILD_ID__` in `vite.config.js`). A deploy that changes them gives them new URLs, so the year-long cache is safe.
- **Live catalogue:** browsers keep `/api/catalog` for an hour, as the CDN does.

## Keeping item data current

Sacred Uniques, Sets, Gems & Runes and Base Items stay in sync with docs.median-xl.com in two ways:

1. **Refreshing the bundle is a deliberate step.** `npm run import-data` downloads and parses the four docs pages (and the MedianDB skill data), rewrites the JSON in `src/data/` and `public/planner/`, and rebuilds the sprite sheets; review and commit the result. Builds use only the committed data, so the same commit always builds the same site and a deploy never depends on third-party sites being up. If the docs are unreachable or a page parses below the minimum counts in `lib/docs-catalog.mjs` (for example after a layout change), the import fails loudly and nothing is overwritten.
2. **The app fetches live data when it loads.** On load, the app requests `/api/catalog`. That Vercel function parses the docs on demand. Vercel's CDN caches the result for 1 hour and serves the cached copy for up to 24 hours while it refreshes, so the docs site gets roughly one request per hour. A complete response replaces the bundled data in place. If the request fails, the app keeps the bundled data. Each of these pages shows its data source: "Live from docs.median-xl.com · fetched …" or "Bundled snapshot from …", with a Retry button.

`npm run dev` and `npm run preview` serve the same endpoint locally. A static host without serverless functions still works: the request fails and the app uses the bundled data from the last build.

Runewords and Tiered Uniques are **not** part of this. They remain the static snapshot described above.

### Damage against a monster

Skill cards and the skill bar show damage against a chosen target. The default is a typical monster for the build's difficulty: the median resistances of its ordinary (non-boss) monsters. Any monster from the game files can be picked instead.

- **Monsters:** `node scripts/extract-monsters.mjs [game dir]` reads `monstats.bin` (D2 1.13c layout; field offsets from D2MOO) into `data/game/<patch>/monsters.json`. It keeps enabled, killable, named enemies and neutrals, and drops allies such as the player's summons and the unused-string placeholders. `import-skills` adds them to the planner data when the patch matches.
- **Resistances:** each monster's own, per difficulty, from the game files.
- **Inferred rules (classic D2, not documented for Median XL):**
  - 100% resistance or more is immunity, which −enemy resistance doesn't break;
  - otherwise −enemy resistance lowers it in full, down to −100%;
  - deadly strike doubles physical damage on attacks, weighted by its chance.
- **Not included:** attack and cast speed, chance to hit, crushing blow and curses. The per-second figure is left out on purpose. Median XL doesn't document how speed becomes frames, and its docs say minion speeds are unknown. Its per-level monster defense values also look unusual (e.g. level 1 Hell 1200), so they aren't used for chance to hit. Skills that hit several times show the total if every one lands.

### Skill interactions

Passives apply automatically. Enable **Skill active: include bonuses and penalties** in a buff's details to include its effects; innate buffs need no spent points. Only one stance and one morph can be active. Weapon- and shield-specific effects require matching equipment (custom weapons have no declared family).

Skill-granted levels are combined with equipment bonuses before dependent skills are evaluated. Attribute-dependent effects are recalculated from the equipment baseline until stable, so allocating points in a different order does not change the result. Pinnacle grants +5 all skills at 25 hard points while active and halves total defense; Anathema subtracts 300% weapon physical damage while active, without allowing negative physical damage. Game-only effects and known passive stat mappings feed the same character sheet used by damage and gear recommendations.

Run `node scripts/dev/audit-skill-interactions.mjs` to regenerate the [class-wide audit](docs/skill-interactions.md). It covers 411 class-tree entries at two skill levels, with semantic regression tests in `tests/skill-effects.test.mjs`. The report distinguishes these checks from combat-state mechanics that are not fully simulated, including proc uptime, current-life thresholds and some helper effects.

### Gear suggestions

Gear ranking compares complete candidate character sheets for damage potential, survivability and sustain. Known skill damage includes weapon damage, skill levels and poison rates; weapon poison is not stacked once per hit. Life on hit benefits from attack speed, while leech depends on physical damage. Life, capped resistances, block, avoidance and defense contribute to survival. All wearable tiers and runeword bases are compared; a second pass revisits early picks with the full outfit present. Unmodeled effects retain a small stat-based fallback score.

These are relative estimates, not measured DPS or effective-health guarantees: speed uses diminishing returns rather than animation breakpoints, enemy defense uses a reference target, pierce assumes a neutral non-immune enemy, and sustain assumes hits connect and leech is allowed. Crucify's two-handed bonus is valued as coverage rather than multiplying single-target damage by the spike count. Unknown procs, enemy-specific mechanics and summon damage without a known formula are not simulated.

With suggested enhancements enabled, the top 12 weapon candidates (plus the current weapon) are compared again with their suggested sockets and orbs applied. This checks every wearable unique tier in that shortlist and the strongest unenhanced base for each runeword. The selected enhancement state is returned with the recommendation, and bulk refresh repeats the weapon comparison after enhancing the rest of the outfit. This remains a bounded search, not an exhaustive optimization of every possible loadout or enhancement combination.

Speed: each slot's ranking is cached for the current build and options, and shared by the suggestions dialog and the item picker. Both dialogs open at once and fill in slot by slot in the background (`recommendLater`), weapons last. Resolved items and parsed lines are cached by content (`catalog.resolve`, so results are read-only). The socket and orb planners score each filler from its own lines, and fully check only the candidates that could win. `node scripts/dev/time-recommend.mjs` times every slot (`ENH=1` includes sockets and orbs). Run `node scripts/dev/compare-crucify-weapons.mjs` to reproduce the Elverfolk/Blackleach comparisons for the saved level-93 and level-97 builds; displayed damage includes the full poison duration and is not DPS.

**Suggest gear** refreshes the active loadout from the current skills, level, attributes and enhancement options, then opens the suggestions dialog. **Refresh equipment with the top picks** reruns it after changing options. Previously equipped items and their enhancements in the active loadout are replaced; slots with no suitable pick stay empty. The inactive weapon set and charms/relics are retained. **Clear all** removes equipment from both weapon sets and shared armor/jewelry slots, keeping skills, attributes and charms/relics.

The **Suggest orbs and empty sockets** toggle controls automatic enhancements when equipping suggested gear (including individual suggestions in the item picker). It starts enabled and remembers your choice. The unique-orb option is available when enhancements are enabled. Toggling either option does not modify existing equipment; the item editor still offers manual enhancement controls.

Gear suggestions require the character's current Strength and Dexterity, without spending or reallocating attribute points. They try lower item tiers and suitable runeword bases when necessary. Replacing an item accounts for losing its attributes, set bonuses and any displaced weapon/off-hand; the new item cannot supply its own equipping requirements. Retained equipment must not gain or worsen an attribute shortage, and automatic orb/socket additions follow the same rule. An already-invalid build can be repaired one slot at a time; suggestions do not silently change existing gear or fix unrelated shortages.

Spell damage estimates in the skill slots/bar include matching spell-damage bonuses from items, sockets, orbs and skills, before enemy resistance. The underlying skill tooltip remains the raw game-formula value. Energy/focus already used by those formulas and spell-damage stats explicitly read by them are not multiplied a second time. Spells without a known damage formula still show bonuses only. Ethereal equipment (including The Awakening) cannot receive mystic orbs; the item editor explains this restriction.

Suggested equipment now includes ordinary mystic orbs and socket fillers planned together. The planner compares an orb-first and a socket-first greedy plan, accounting for orb bonuses before scoring remaining socket choices. This is a heuristic, not an exhaustive optimiser. Bulk suggestions equip the full set before planning enhancements.

Every addition must fit the current character level: `max(item requirement, socket filler requirements) + total orb penalties`. Orb minimum levels (when defined), item restrictions and per-item limits are checked before scoring. Existing orbs and socket contents are preserved. Unique orbs are opt-in; automatic suggestions only use bonuses the planner can quantify. Soulforged orbs are not included.

The item editor lets you add/remove orbs and shows the combined required level. Orb choices persist in saved builds and share links, and their bonuses are included in character stats. Lowering your level or manually changing equipment can still produce a requirement warning.

The bundled orb catalogue uses ordinary orb values from the installed Median XL 2.14.4 `mysticorbs.bin` and unique orb descriptions from the official docs. Regenerate with `node scripts/import-orbs.mjs [game directory]`; normal builds use the bundled data without requiring a game installation.

The planner reads a **build profile** from your skill points: damage types, whether the skills are spells, weapon attacks or summons, and any required weapon ("Requires a bow or crossbow"). Upgrade skills inherit this from the skill they modify. Skills without element tags fall back to their own stats.

The profile also reads **what the skills' damage formulas depend on** (`engine.skillScaling`), from the game's damage synergy and damage lines:
- **Character stats they read:** Energy, Spell Focus, spell damage, pierce…
- **Other skills they read:** a level synergy, or another skill's damage. Askari Lightning reads Stormcall's damage, whose synergy reads Energy and Spell Focus, so an Askari build values Energy and Spell Focus and treats +Stormcall as a synergy.

Those stats get a strong weight, and "scales with" and "synergy" are shown with the suggestions.

Items are ranked by the resulting character's combat estimates in `combatScore.js`. `recommend.js` retains role-specific weights for enhancement selection and a small fallback for effects not covered by the combat model. Skill bonuses earn their main value through the damage or defenses they actually change, rather than automatically outranking weapon damage.

Other rules:
- Items must fit the slot, class, level and current attributes. Unmet Strength or Dexterity excludes the candidate.
- Two-handed weapons leave the off-hand empty, including quivers and bolts.
- Set bonuses enter the candidate character calculation; the raw set-completion nudge is only part of the small fallback score.

**Sockets** are filled when equipping suggested gear if "Suggest orbs and empty sockets" is enabled. "Suggest" in an item's Sockets section fills just that item's empty sockets; the orb section can suggest both orbs and sockets for that item.
- Each empty socket gets the gem, rune or jewel worth most, one socket at a time, with the character recomputed after each pick.
- Resistances count only up to the cap, and weigh more the further below it you are, so they're capped first. Damage comes next: the build's elements and what its formulas scale with.
- Unique jewels are used at most once. Gems and runes can repeat.
- Runeword sockets are left alone.

The results appear in two places:
- **Best for build**, the default sort in the item picker once you have skills;
- **Suggest gear** in the Equipment panel: refreshes the active loadout and opens the top 3 alternatives per slot, with an option to refresh again after changing enhancement settings.

Every suggestion lists its top reasons, including estimated damage, survivability and recovery changes. These are comparisons under the assumptions above, not a complete combat simulation.

### Refreshing planner data

`npm run import-data` also runs `scripts/import-skills.mjs`. It fetches the latest azadix/medianxl-db commit, pins that commit for the whole import, validates it, and rewrites `public/planner/`. If GitHub is unreachable or the data looks incomplete, it stops without changing the existing files. The commit and fetch date are shown under the planner.

## Attribution

Game data and rune artwork originate from Median XL and the supplied reference tool. Official data sources are listed in `src/data/sources.json`; game assets remain subject to their owners' rights. The expanded tiered-data importer used MedianDB's MIT-licensed parsing logic. Its notice is retained in `THIRD_PARTY_LICENSES.txt`.
