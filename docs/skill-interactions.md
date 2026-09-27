# Skill interaction audit

Dataset: installed game 2.14.4; 411 class-tree entries across all seven classes (shared skills appear in each applicable class).

Every entry below was evaluated at base level 1 and its level-120 base cap. This checks finite calculations and dependency convergence, not independent in-game verification of every value. Named regression tests in `tests/skill-effects.test.mjs` check cross-skill behavior and activation separately.

Skill effects are evaluated from the equipment baseline until stable. Buffs, stances, morphs and summon auras require the Skill active toggle; passives apply automatically. One stance and one morph may be active at a time. Innate buffs need no spent points.

## Limits that remain

- Target-specific effects, proc uptime, charges, current-life thresholds, traps placed in another skill’s area, and minion AI are not a combat simulation. A finite formula is not proof that these mechanics are fully represented.
- Examples needing more combat state include Witch Blood’s current-life thresholds, Vengeful Power after being hit, Cognition thresholds, Black Wind’s weapon-derived damage, Concentrated Effect’s area/damage tradeoff, and Catalyst Trap placement.
- Some helper-skill effects are shown in the game tooltip but lack a character-sheet mapping. Formula references below record declared dependencies; they do not claim every helper effect is implemented.
- Unknown game formulas remain marked unknown in the tooltip. Character damage and gear ranking remain estimates.

## Regression cases

- Assassin: Pinnacle +5 all skills at 25 hard points and its defense penalty; Anathema physical damage penalty; skill-level bonuses reach Way of the Spider and Crucify.
- Amazon: Dragonlore weapon damage, Ecstatic Frenzy defense loss and added magic damage; summoned attack rating stays on the summon.
- Barbarian: stance exclusivity and weapon damage feeding Heart of Stone.
- Druid: morph-dependent bonuses and Growth feeding Primal Bond.
- Necromancer: Death Pact tree bonuses and Famine using final attributes independent of allocation order.
- Paladin: Stormlord attribute bonuses and Spark of Hope speed buffs.
- Sorceress: Nova Charge base Dexterity feeds Energy and Blight; prohibited elemental damage is removed.

## Amazon (73)

| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |
| --- | --- | --- | --- |
| Balance | — | defense | Finite; converged |
| Defensive Harmony | — | slows_attacker, life_when_struck_by_an_enemy | Finite; converged |
| Ecstatic Frenzy | Continuity, Fortitude, Runemaster, Specialization | attack_speed, minimum_magic_damage, maximum_magic_damage, zero_defense | Finite; converged |
| Fortitude | — | None in this isolated sample | Finite; converged |
| Wild and Free | — | movement_speed, hit_recovery | Finite; converged |
| Barrage | Elemental Command, Specialization | None in this isolated sample | Finite; converged |
| Decoy | Specialization | None in this isolated sample | Finite; converged |
| Dragonlore | Barrage, Decoy, Phalanx, Trinity Arrow, Wyrmshot | None in this isolated sample | Finite; converged |
| Elemental Command | — | innate_elemental_damage | Finite; converged |
| Fire at Will | Decoy | None in this isolated sample | Finite; converged |
| Keen Sight | Wyrmshot | None in this isolated sample | Finite; converged |
| Rapid Wyrmshot | Keen Sight, Wyrmshot | None in this isolated sample | Finite; converged |
| Phalanx | Specialization | None in this isolated sample | Finite; converged |
| Trinity Arrow | Elemental Command, Specialization | None in this isolated sample | Finite; converged |
| Wyrmshot | Keen Sight, Specialization | None in this isolated sample | Finite; converged |
| Bulwark | Elemental Aegis | physical_resistance | Finite; converged |
| Deadly Dance | — | deadly_strike | Finite; converged |
| Elemental Aegis | Second Wind | None in this isolated sample | Finite; converged |
| Eviscerate | Specialization | None in this isolated sample | Finite; converged |
| Gemling | Paragon | None in this isolated sample | Finite; converged |
| Impale | Continuity, Specialization | None in this isolated sample | Finite; converged |
| Indomitable | — | max_block_chance | Finite; converged |
| Noxious Mastery | — | movement_speed, physical_resistance, enhanced_defense | Finite; converged |
| Scorpion Sting | — | enhanced_weapon_damage, enemy_poison_resistance | Finite; converged |
| Second Wind | Shieldmaiden | None in this isolated sample | Finite; converged |
| Shieldmaiden | Continuity | None in this isolated sample | Finite; converged |
| Fend | Continuity | None in this isolated sample | Finite; converged |
| Great Hunt | Specialization | None in this isolated sample | Finite; converged |
| Hunter's Prowess | — | None in this isolated sample | Finite; converged |
| Hyena Strike | Specialization | None in this isolated sample | Finite; converged |
| Lioness | Curare, Fend, Great Hunt, Hunter's Prowess, Hyena Strike, Pounce, Takedown | life, attack_speed, percent_attack_rating, enhanced_defense | Finite; converged |
| Pounce | Specialization | None in this isolated sample | Finite; converged |
| Takedown | Continuity, Hunter's Prowess | None in this isolated sample | Finite; converged |
| Askari Lightning | Specialization, Stormcall | None in this isolated sample | Finite; converged |
| Conductivity | — | None in this isolated sample | Finite; converged |
| Discharge | Askari Lightning, Continuity, Specialization | None in this isolated sample | Finite; converged |
| Hammer of Zerae | Reckoning of Zerae, Specialization, Stormcall | None in this isolated sample | Finite; converged |
| Lightning Shield | Bloodlust (Innate), Continuity, Specialization | elemental_magic_damage_taken_reduced, attacker_takes_lightning_damage | Finite; converged |
| Power Shift | Hammer of Zerae | None in this isolated sample | Finite; converged |
| Reckoning of Zerae | — | None in this isolated sample | Finite; converged |
| Resistance | Hammer of Zerae, Stormcall | base_block_chance, total_defense_multiplier, grit, max_block_chance, block_speed | Finite; converged |
| Stormcall | Conductivity, Hammer of Zerae, Specialization | None in this isolated sample | Finite; converged |
| Thundermaiden | Hammer of Zerae, Stormcall | enhanced_defense, enemy_lightning_resistance | Finite; converged |
| Blast Radius | — | None in this isolated sample | Finite; converged |
| Blood Magic | — | life_regenerated_per_second | Finite; converged |
| Concentrated Effect | — | None in this isolated sample | Finite; converged |
| Crimson Rite | — | None in this isolated sample | Finite; converged |
| Eldritch Storm | Crimson Rite, Entropy, Forbidden Knowledge, Specialization | None in this isolated sample | Finite; converged |
| Entropy | — | None in this isolated sample | Finite; converged |
| Fire Elementals | Specialization, Unstable Essence | None in this isolated sample | Finite; converged |
| Forbidden Knowledge | Eldritch Storm, Lava Pit, Magic Missiles | None in this isolated sample | Finite; converged |
| Hungering Flames | — | None in this isolated sample | Finite; converged |
| Lava Pit | Forbidden Knowledge, Hungering Flames, Magic Missiles, Specialization | None in this isolated sample | Finite; converged |
| Magic Missiles | Blast Radius, Concentrated Effect, Crimson Rite, Forbidden Knowledge, Specialization | None in this isolated sample | Finite; converged |
| Spiritual Invocation | — | None in this isolated sample | Finite; converged |
| Unstable Essence | — | None in this isolated sample | Finite; converged |
| Chemistry | — | life_stolen_per_hit, increased_healing_from_potions | Finite; converged |
| Continuity | — | skill_duration | Finite; converged |
| Endurance | — | maximum_life | Finite; converged |
| Freedom | — | hit_recovery, block_speed | Finite; converged |
| Meditation | — | regenerate_mana, maximum_mana | Finite; converged |
| Melee Devotion | — | None in this isolated sample | Finite; converged |
| Purity | — | curse_length_reduction, poison_length_reduction | Finite; converged |
| Specialization | — | None in this isolated sample | Finite; converged |
| Tenacity | — | physical_resistance | Finite; converged |
| Curare | Noxious Mastery, Paragon, Reckoning of Zerae, Spirit of Vengeance | poison_length_reduction, maximum_poison_resist | Finite; converged |
| Paragon | Curare, Spirit of Vengeance | None in this isolated sample | Finite; converged |
| Paragon of Fate | — | None in this isolated sample | Finite; converged |
| Paragon of Sanctity | — | None in this isolated sample | Finite; converged |
| Spellbind | Continuity | None in this isolated sample | Finite; converged |
| Spirit of Vengeance | Curare, Paragon | None in this isolated sample | Finite; converged |
| War Spirit | Blood Magic, Continuity, Eviscerate, Great Hunt, Lioness, Specialization, Thundermaiden, Trinity Arrow | None in this isolated sample | Finite; converged |
| Bloodlust (Innate) | Continuity | fire_spell_damage, cold_spell_damage, lightning_spell_damage, poison_spell_damage, physical_magic_spell_damage, enhanced_weapon_damage | Finite; converged |

## Assassin (54)

| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |
| --- | --- | --- | --- |
| Blink | Domain | None in this isolated sample | Finite; converged |
| Domain | Blink | None in this isolated sample | Finite; converged |
| Perfect Being | Artifice Mastery | avoid_chance | Finite; converged |
| Queen of Blades | Continuity | attack_speed, chance_of_crushing_blow | Finite; converged |
| Shadow Refuge | Continuity, Shadowrush | physical_resistance | Finite; converged |
| Shadowrush | Shadow Refuge | None in this isolated sample | Finite; converged |
| APF-20 'Maelstrom' MkV | — | None in this isolated sample | Finite; converged |
| Broadside | Backstab, Execution | None in this isolated sample | Finite; converged |
| Lethal Incision | Continuity, Scorpion Blade | None in this isolated sample | Finite; converged |
| Scorpion Blade | Lethal Incision, Way of the Spider | None in this isolated sample | Finite; converged |
| Storm Crows | — | None in this isolated sample | Finite; converged |
| Pneumatic Burst | Storm Crows | None in this isolated sample | Finite; converged |
| Void Gazer | Black Wind | None in this isolated sample | Finite; converged |
| Way of the Spider | — | enemy_poison_resistance, poison_spell_damage | Finite; converged |
| Black Wind | Continuity, Void Gazer | None in this isolated sample | Finite; converged |
| Ring of Steel | APF-20 'Maelstrom' MkV | None in this isolated sample | Finite; converged |
| Anathema | Continuity | enhanced_weapon_damage, innate_elemental_damage, maximum_cold_resistance, maximum_fire_resistance, maximum_lightning_resistance | Finite; converged |
| Batstrike | — | None in this isolated sample | Finite; converged |
| Fanged Assault | — | None in this isolated sample | Finite; converged |
| Noctule | — | None in this isolated sample | Finite; converged |
| Shadow Dancer | — | critical_strike | Finite; converged |
| Summon Familiars | Batstrike, Fanged Assault, Shadow Dancer, Subterfuge, Winged Calamity | None in this isolated sample | Finite; converged |
| Vampiric Strike | Batstrike | None in this isolated sample | Finite; converged |
| Way of the Gryphon | — | enemy_lightning_resistance, lightning_spell_damage, maximum_lightning_damage, minimum_lightning_damage | Finite; converged |
| Winged Calamity | — | None in this isolated sample | Finite; converged |
| Backstab | Continuity, Execution | None in this isolated sample | Finite; converged |
| Barrier Strike | — | None in this isolated sample | Finite; converged |
| Crucify | — | None in this isolated sample | Finite; converged |
| Execution | Backstab, Broadside | None in this isolated sample | Finite; converged |
| Hades Gate | Domain, Momentum, Way of the Phoenix | None in this isolated sample | Finite; converged |
| Laserblade | — | None in this isolated sample | Finite; converged |
| Momentum | — | None in this isolated sample | Finite; converged |
| Way of the Phoenix | — | enemy_fire_resistance, fire_spell_damage, minimum_fire_damage, maximum_fire_damage | Finite; converged |
| Artifice Mastery | Beacon, Catalyst Trap, Incineration Trap, Noctule, Perfect Being, Shockwave Trap, Subterfuge | None in this isolated sample | Finite; converged |
| Catalyst Trap | Beacon | None in this isolated sample | Finite; converged |
| Deadly Constructs | — | None in this isolated sample | Finite; converged |
| Forger's Hegemony | Prismatic Cloak | maximum_cold_resistance, maximum_fire_resistance, block_speed, percent_vitality | Finite; converged |
| Incineration Trap | Deadly Constructs, Shockwave Trap, Subterfuge | None in this isolated sample | Finite; converged |
| Shockwave Trap | Deadly Constructs, Incineration Trap, Subterfuge | None in this isolated sample | Finite; converged |
| Beacon | Catalyst Trap | None in this isolated sample | Finite; converged |
| Subterfuge | Catalyst Trap, Incineration Trap, Shockwave Trap | None in this isolated sample | Finite; converged |
| Cognition | Bloodbath (Innate), Doom, Energize, Mind Ripple, Perfect Being, Pinnacle, Prismatic Cloak, Psionic Scream, Psionic Storm, Shuriken Flurry | enemy_magic_resistance | Finite; converged |
| Energize | — | None in this isolated sample | Finite; converged |
| Mind Ripple | Cognition | None in this isolated sample | Finite; converged |
| Pinnacle | Cognition, Continuity | spell_focus, all_skills, total_defense_multiplier | Finite; converged |
| Psionic Scream | — | None in this isolated sample | Finite; converged |
| Psionic Storm | Cognition, Energize | None in this isolated sample | Finite; converged |
| Shuriken Flurry | Cognition | None in this isolated sample | Finite; converged |
| Doom | Continuity, Shadow Flow, Way of the Raven | None in this isolated sample | Finite; converged |
| Prismatic Cloak | Forger's Hegemony | elemental_magic_damage_taken_reduced, block_speed, maximum_life | Finite; converged |
| Vampiric Icon | Vampiric Strike | None in this isolated sample | Finite; converged |
| Way of the Raven | Doom, Shadow Flow | enemy_cold_resistance, cold_spell_damage, minimum_cold_damage, maximum_cold_damage | Finite; converged; 2 unknown tooltip lines |
| Shadow Flow | Doom, Way of the Raven | movement_speed, block_speed, hit_recovery, maximum_avoid_chance | Finite; converged |
| Bloodbath (Innate) | Cognition, Continuity, Shadow Dancer | None in this isolated sample | Finite; converged |

## Barbarian (59)

| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |
| --- | --- | --- | --- |
| Ancient Blood | — | attack_rating, maximum_life | Finite; converged |
| Bear Stance | — | enhanced_defense, physical_resistance, summon_physical_resistance | Finite; converged |
| Eagle Stance | Aptitude | innate_elemental_damage, regenerate_mana, life_regenerated_per_second | Finite; converged |
| Hunter's Mark | Primordial Hunt, Wolf Companion | None in this isolated sample | Finite; converged |
| Lion Stance | — | physical_resistance, enhanced_weapon_damage | Finite; converged |
| Mountain King | — | percent_strength, percent_dexterity, percent_vitality, percent_energy | Finite; converged |
| Primordial Hunt | — | None in this isolated sample | Finite; converged |
| Snake Stance | Gladiator's Dominance | slows_target_by | Finite; converged; 2 unknown tooltip lines |
| Wolf Companion | Hunter's Mark, Wolven Guide | None in this isolated sample | Finite; converged |
| Wolf Stance | Aptitude | chance_of_crushing_blow, movement_speed, attack_speed, hit_recovery, enhanced_weapon_damage | Finite; converged |
| Wolven Guide | — | None in this isolated sample | Finite; converged |
| Aftermath | Heart of Stone | None in this isolated sample | Finite; converged |
| Earthquake | Tectonics | None in this isolated sample | Finite; converged |
| Heart of Stone | Whirlwind | enemy_fire_resistance, enemy_lightning_resistance, enemy_cold_resistance, disable_elemental_damage | Finite; converged |
| Leap | — | None in this isolated sample | Finite; converged |
| Shower of Rocks | Aftermath | None in this isolated sample | Finite; converged |
| Tectonics | — | None in this isolated sample | Finite; converged |
| Thunder Slam | Upheaval | None in this isolated sample | Finite; converged |
| Upheaval | — | None in this isolated sample | Finite; converged |
| Executioner | — | None in this isolated sample | Finite; converged |
| Gale Force | Executioner | None in this isolated sample | Finite; converged |
| Lifestealer | — | None in this isolated sample | Finite; converged |
| Precision | — | None in this isolated sample | Finite; converged |
| Savagery | — | None in this isolated sample | Finite; converged |
| Stoneskin | — | None in this isolated sample | Finite; converged |
| Whirlwind | Heart of Stone, Lifestealer, Savagery, Stoneskin | None in this isolated sample | Finite; converged |
| Conflux | Continuity | None in this isolated sample | Finite; converged |
| Deep Freeze | — | None in this isolated sample | Finite; converged |
| Elemental Overload | Deep Freeze | None in this isolated sample | Finite; converged |
| Galvanism | Iron Spiral | None in this isolated sample | Finite; converged |
| Iron Spiral | Galvanism | None in this isolated sample | Finite; converged |
| Primordial Strike | Conflux | None in this isolated sample | Finite; converged |
| Purifying Flame | — | None in this isolated sample | Finite; converged |
| Thunderstorm | Galvanism | None in this isolated sample | Finite; converged |
| Aptitude | — | None in this isolated sample | Finite; converged |
| Bloodthirst | Overkill, Snake Bite, Stampede | None in this isolated sample | Finite; converged |
| Citadel | Fortress | None in this isolated sample | Finite; converged |
| Fortress | Citadel, Gladiator's Dominance | None in this isolated sample | Finite; converged |
| Mighty Vigor | — | None in this isolated sample | Finite; converged |
| Overkill | Gladiator's Dominance, Titan's Fortitude (Innate) | None in this isolated sample | Finite; converged |
| Pillage | — | None in this isolated sample | Finite; converged |
| Snake Bite | Gladiator's Dominance, Snake Stance | None in this isolated sample | Finite; converged |
| Stampede | Aptitude | None in this isolated sample | Finite; converged |
| Unyielding | — | physical_resistance | Finite; converged |
| Warder | Continuity | None in this isolated sample | Finite; converged |
| Ancestral Endurance | Continuity, Defender Spirit, Guardian Spirit, Protector Spirit, Shamanic Trance, Spirit Bond, Spirit Reave, Spirit Walk | None in this isolated sample | Finite; converged |
| Defender Spirit | Shamanic Trance | None in this isolated sample | Finite; converged |
| Guardian Spirit | Shamanic Trance | None in this isolated sample | Finite; converged |
| Protector Spirit | Shamanic Trance | bonus_damage_to_bloodlust, bonus_elemental_damage_to_bloodlust | Finite; converged |
| Shamanic Trance | — | None in this isolated sample | Finite; converged |
| Spirit Bond | — | None in this isolated sample | Finite; converged |
| Spirit Reave | Defender Spirit, Guardian Spirit, Protector Spirit, Spirit Bond | None in this isolated sample | Finite; converged |
| Spirit Walk | Ancestral Endurance, Defender Spirit, Guardian Spirit, Protector Spirit, Shamanic Trance, Spirit Bond, Spirit Reave | None in this isolated sample | Finite; converged |
| Gladiator's Dominance | Nephalem Spirit, Runemaster | movement_speed, block_speed, max_block_chance, critical_strike, base_block_chance, bonus_to_poison_skill_duration | Finite; converged |
| Immortal | — | avoid_chance, hit_recovery | Finite; converged |
| Nephalem Spirit | Gladiator's Dominance, Runemaster | physical_resistance, minimum_fire_damage, maximum_fire_damage, minimum_lightning_damage, maximum_lightning_damage | Finite; converged |
| Runemaster | Gladiator's Dominance, Nephalem Spirit | maximum_cold_resistance, maximum_fire_resistance, maximum_lightning_resistance | Finite; converged |
| Thundergod | Continuity | None in this isolated sample | Finite; converged |
| Titan's Fortitude (Innate) | Continuity | maximum_life, enhanced_defense | Finite; converged |

## Druid (56)

| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |
| --- | --- | --- | --- |
| Barkskin | — | enhanced_defense, life, grit | Finite; converged |
| Bloom | — | None in this isolated sample | Finite; converged |
| Devouring Cloud | — | None in this isolated sample | Finite; converged |
| Growth | Vine Companion | summoned_minion_resistances | Finite; converged |
| Harvest | Bloom | None in this isolated sample | Finite; converged |
| Harvesters | Harvest, Infected Roots | None in this isolated sample | Finite; converged |
| Infected Roots | — | None in this isolated sample | Finite; converged |
| Ceaseless Fury | Harbinger | None in this isolated sample | Finite; converged |
| Feed the Pack | Werewolf Form | life_after_each_kill | Finite; converged |
| Feral Escalation | Werewolf Form | None in this isolated sample | Finite; converged |
| Harbinger | Ceaseless Fury, Feed the Pack, Howl of the Spirits | None in this isolated sample | Finite; converged |
| Howl of the Spirits | Continuity | chance_of_crushing_blow, enemy_cold_resistance, regenerate_mana | Finite; converged |
| Lunar Assault | — | None in this isolated sample | Finite; converged |
| Mana Pulse | Continuity, Howl of the Spirits | None in this isolated sample | Finite; converged |
| Twisted Claw | Feed the Pack, Howl of the Spirits | None in this isolated sample | Finite; converged |
| Werewolf Form | Howl of the Spirits | None in this isolated sample | Finite; converged |
| Charged Talons | Egg Trap | None in this isolated sample | Finite; converged |
| Earth Talons | Charged Talons | None in this isolated sample | Finite; converged |
| Egg Trap | Progeny's Blessing | None in this isolated sample | Finite; converged |
| Ferocity | Wereowl Form | None in this isolated sample | Finite; converged |
| Progeny's Blessing | Egg Trap | None in this isolated sample | Finite; converged |
| Raid | Egg Trap, Progeny's Blessing | None in this isolated sample | Finite; converged |
| Steel Wings | Wereowl Form | None in this isolated sample | Finite; converged |
| Wereowl Form | — | None in this isolated sample | Finite; converged |
| Ancestral Force | Idol of Scosglen | None in this isolated sample | Finite; converged |
| Ancestral Protection | Idol of Scosglen | None in this isolated sample | Finite; converged |
| Bestial Potency | Werebear Morph | None in this isolated sample | Finite; converged |
| Hunger | Werebear Morph | None in this isolated sample | Finite; converged |
| Idol of Scosglen | Ancestral Force, Ancestral Protection, Continuity, Wildfire | None in this isolated sample | Finite; converged |
| Primal Dominance | Werebear Morph | None in this isolated sample | Finite; converged |
| Ravage | — | None in this isolated sample | Finite; converged |
| Rend | — | None in this isolated sample | Finite; converged |
| Werebear Morph | — | None in this isolated sample | Finite; converged |
| Wildfire | — | None in this isolated sample | Finite; converged |
| Bear Companion | Heart of the Pack | None in this isolated sample | Finite; converged |
| Cascade | Erupting Strike | None in this isolated sample | Finite; converged |
| Erupting Strike | — | None in this isolated sample | Finite; converged |
| Heart of the Pack | Bear Companion, Continuity | None in this isolated sample | Finite; converged |
| Heartseeker | Erupting Strike | None in this isolated sample | Finite; converged |
| Pathfinder | — | None in this isolated sample | Finite; converged |
| Primal Bond | Bear Companion | None in this isolated sample | Finite; converged |
| Steady Shot | Erupting Strike, Werewolf Form | None in this isolated sample | Finite; converged |
| Tracking | — | None in this isolated sample | Finite; converged |
| Armageddon | Continuity, Spiritual Alignment | None in this isolated sample | Finite; converged |
| Ember Spirit | — | None in this isolated sample | Finite; converged |
| Frigid Domain | Continuity, Spiritual Alignment | None in this isolated sample | Finite; converged |
| Hunting Banshee | Ember Spirit | None in this isolated sample | Finite; converged |
| Pagan Rites | — | None in this isolated sample | Finite; converged |
| Rain of Fire | — | None in this isolated sample | Finite; converged |
| Spiritual Alignment | — | cold_spell_damage, fire_spell_damage | Finite; converged |
| Faerie Fire | Continuity, Mark of the Wild (Innate), Survival Instinct, Vine Companion | None in this isolated sample | Finite; converged |
| Mythal | Continuity | None in this isolated sample | Finite; converged |
| Survival Instinct | Faerie Fire, Vine Companion | physical_resistance, spell_focus, minimum_cold_damage, maximum_cold_damage | Finite; converged |
| Symbiosis | Continuity, Harvesters | avoid_chance, life_regenerated_per_second | Finite; converged |
| Vine Companion | Faerie Fire, Survival Instinct | None in this isolated sample | Finite; converged |
| Mark of the Wild (Innate) | Continuity | attack_speed, fire_spell_damage, cold_spell_damage, lightning_spell_damage, poison_spell_damage, enhanced_weapon_damage | Finite; converged |

## Necromancer (56)

| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |
| --- | --- | --- | --- |
| Bane | Continuity | None in this isolated sample | Finite; converged |
| Death Pact | Debilitating Concoction, Occult Path | None in this isolated sample | Finite; converged |
| Death Ward | — | enhanced_defense, avoid_chance | Finite; converged |
| Embalming | — | maximum_life, summoned_minion_life, regenerate_mana | Finite; converged |
| Famine | — | life, life_stolen_per_hit, enhanced_weapon_damage | Finite; converged |
| Sacrifices | — | None in this isolated sample | Finite; converged |
| Abyss Knight | From the Abyss | None in this isolated sample | Finite; converged |
| Blood Skeleton | Bend the Shadows (Innate), Flameburst Shot | None in this isolated sample | Finite; converged |
| From the Abyss | — | None in this isolated sample | Finite; converged |
| Grim Vision | — | None in this isolated sample | Finite; converged |
| Iron Golem | Metal Solace | None in this isolated sample | Finite; converged |
| Metal Solace | Apprenticeship, Iron Golem, Veil King | None in this isolated sample | Finite; converged |
| Night Hawks | Abyss Knight, Grim Vision, Violent Immolation | None in this isolated sample | Finite; converged |
| Resurgence | — | summoned_minion_attack_rating, summoned_minion_damage | Finite; converged |
| Violent Immolation | — | None in this isolated sample | Finite; converged |
| Angel of Death | Blight Descent | None in this isolated sample | Finite; converged |
| Blight Descent | Angel of Death, Continuity | None in this isolated sample | Finite; converged; 1 unknown tooltip lines |
| Carnage | Onslaught | None in this isolated sample | Finite; converged |
| Deathlord | Continuity, Demonic Commune | defense | Finite; converged |
| Demonic Commune | — | None in this isolated sample | Finite; converged |
| Ominous Vigor | — | base_block_chance, dexterity, strength | Finite; converged |
| Onslaught | Carnage | None in this isolated sample | Finite; converged |
| Parasite | — | None in this isolated sample | Finite; converged |
| Reaper | Parasite | None in this isolated sample | Finite; converged |
| Alchemical Preparation | — | enemy_fire_resistance, innate_elemental_damage | Finite; converged |
| Brutal Effigy | — | None in this isolated sample | Finite; converged |
| Catapult Shot | Alchemical Preparation, Widowmaker | None in this isolated sample | Finite; converged |
| Deathly Effigy | — | None in this isolated sample | Finite; converged |
| Debilitating Concoction | — | None in this isolated sample | Finite; converged |
| Flameburst Shot | Alchemical Preparation | None in this isolated sample | Finite; converged |
| Life From Death | Debilitating Concoction, Voodoo Practice | physical_resistance, life_after_each_kill | Finite; converged |
| Voodoo Practice | — | enhanced_weapon_damage | Finite; converged |
| Widowmaker | Catapult Shot | None in this isolated sample | Finite; converged |
| Death Ripple | Nightwalker, Occult Path, Torment | None in this isolated sample | Finite; converged |
| Dream Eater | Nightwalker, Terror | None in this isolated sample | Finite; converged |
| Gift of Blood | — | None in this isolated sample | Finite; converged |
| Nightwalker | Death Pact, Death Ripple, Dream Eater, Jinn, Occult Path, Pestilence, Rathma's Chosen, Relentless, Terror, Torment, Veil King | poison_length_reduction | Finite; converged |
| Occult Path | Death Ripple | cast_speed | Finite; converged |
| Pestilence | Continuity, Nightwalker | movement_speed | Finite; converged |
| Relentless | — | None in this isolated sample | Finite; converged |
| Terror | — | None in this isolated sample | Finite; converged |
| Torment | Death Ripple, Nightwalker, Relentless | None in this isolated sample | Finite; converged |
| Apprenticeship | Frostclaw Totem | None in this isolated sample | Finite; converged |
| Dark Gathering | Soulchain | None in this isolated sample | Finite; converged |
| Dirge | Soulbond, Soulchain | None in this isolated sample | Finite; converged |
| Fireheart Totem | Apprenticeship, Bend the Shadows (Innate), Dark Gathering, Dirge, Metal Solace, Soulchain | None in this isolated sample | Finite; converged |
| Frostclaw Totem | Apprenticeship, Bend the Shadows (Innate), Dark Gathering, Dirge, Metal Solace, Soulchain | None in this isolated sample | Finite; converged |
| Soulbond | Soulchain | life_after_each_kill | Finite; converged |
| Soulchain | Fireheart Totem, Frostclaw Totem, Soulbond, Stormeye Totem | None in this isolated sample | Finite; converged |
| Stormeye Totem | Apprenticeship, Bend the Shadows (Innate), Dark Gathering, Dirge, Metal Solace, Soulchain | None in this isolated sample | Finite; converged |
| Jinn | Rathma's Chosen, Veil King | None in this isolated sample | Finite; converged |
| Land of the Dead | Continuity, Death Ripple, Torment | life_regenerated_per_second | Finite; converged |
| Rathma's Chosen | Jinn, Veil King | None in this isolated sample | Finite; converged |
| Talon's Hold | — | slows_target_by, reanimate_as_monster_name | Finite; converged |
| Veil King | Blood Skeleton, From the Abyss, Jinn, Metal Solace, Rathma's Chosen | None in this isolated sample | Finite; converged |
| Bend the Shadows (Innate) | Jinn, Rathma's Chosen, Veil King | None in this isolated sample | Finite; converged |

## Paladin (54)

| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |
| --- | --- | --- | --- |
| Conclave | — | None in this isolated sample | Finite; converged |
| Habeas Corpus | — | None in this isolated sample | Finite; converged |
| Resurrect | Servants of Valor | None in this isolated sample | Finite; converged |
| Elemental Wisdom | Continuity | enemy_fire_resistance, enemy_cold_resistance, enemy_lightning_resistance, enemy_poison_resistance | Finite; converged |
| Fervor | Servants of Valor | None in this isolated sample | Finite; converged |
| Servants of Valor | Conclave, Elemental Wisdom, Fervor, Grim Presence, Transcendence | None in this isolated sample | Finite; converged |
| Spark of Hope | Continuity | attack_speed, cast_speed, hit_recovery, movement_speed | Finite; converged |
| Valiance | — | None in this isolated sample | Finite; converged |
| Veneration of Justice | Continuity, Reverence | vitality, energy, min_damage, max_damage | Finite; converged |
| Ward of Fate | Continuity, Reverence, Valiance | movement_speed, magic_resistance, life_regenerated_per_second | Finite; converged |
| Colosseum | — | None in this isolated sample | Finite; converged |
| Consecration | Divine Judgement, Sanctity | enemy_fire_resistance, disable_fire_damage | Finite; converged |
| Divine Judgement | Continuity | None in this isolated sample | Finite; converged |
| Holy Fire | — | poison_length_reduction, enemy_poison_resistance, minimum_fire_damage, maximum_fire_damage, disable_poison_damage | Finite; converged |
| Lionheart | Continuity | enhanced_defense, enhanced_weapon_damage, attack_rating | Finite; converged |
| Retaliate | — | None in this isolated sample | Finite; converged |
| Sanctity | Consecration, Divine Judgement | None in this isolated sample | Finite; converged |
| Annihilation | Combustion | None in this isolated sample | Finite; converged |
| Apex Predator | — | None in this isolated sample | Finite; converged |
| Combustion | — | None in this isolated sample | Finite; converged |
| Dragon Jaws | Apex Predator | None in this isolated sample | Finite; converged |
| Dragonbone Armor | — | avoid_chance, mana_cost_of_skills | Finite; converged |
| Dragon's Breath | Continuity | None in this isolated sample | Finite; converged |
| Scion | Annihilation, Dragon Jaws | None in this isolated sample | Finite; converged |
| Solar Flare | Continuity | all_skills | Finite; converged |
| Vessel of Judgement | Continuity, Life and Death | None in this isolated sample | Finite; converged |
| Vessel of Retribution | Continuity, Solstice and Equinox | None in this isolated sample | Finite; converged |
| Absolution | Vessel of Judgement, Vessel of Retribution | None in this isolated sample | Finite; converged |
| Life and Death | Grim Presence, Mind Flay, Reverence, Veneration of Justice | None in this isolated sample | Finite; converged |
| Reverence | Valiance, Veneration of Justice, Ward of Fate | energy, vitality, movement_speed | Finite; converged |
| Solstice and Equinox | Dragon Jaws, Retaliate | None in this isolated sample | Finite; converged |
| Sentence | Vessel of Judgement, Vessel of Retribution | None in this isolated sample | Finite; converged |
| Blood Thorns | Rite of Thorns | None in this isolated sample | Finite; converged |
| Frostbite | — | None in this isolated sample | Finite; converged |
| Grim Presence | Continuity, Tainted Blood | None in this isolated sample | Finite; converged |
| Lemures | Rite of the Restless | None in this isolated sample | Finite; converged |
| Possession | — | percent_attack_rating, hit_recovery, enhanced_defense | Finite; converged |
| Rite of the Restless | Lemures, Rite of Thorns | None in this isolated sample | Finite; converged |
| Rite of Thorns | Blood Thorns, Rite of the Restless | None in this isolated sample | Finite; converged |
| Sanguine Covenant | Continuity | life_on_melee_attack | Finite; converged |
| Transcendence | — | None in this isolated sample | Finite; converged |
| Acumen | — | None in this isolated sample | Finite; converged |
| Confluence | — | None in this isolated sample | Finite; converged |
| Mind Flay | Acumen, Confluence, Continuity, Symphony of Destruction | None in this isolated sample | Finite; converged |
| Slayer | — | None in this isolated sample | Finite; converged |
| Stormlord | Acumen | strength, dexterity, vitality, energy | Finite; converged |
| Symphony of Destruction | — | None in this isolated sample | Finite; converged |
| Tainted Blood | Continuity, Grim Presence | spell_focus, enhanced_defense, poison_resistance, life_regenerated_per_second | Finite; converged |
| Blessed Life | — | physical_resistance, physical_damage_taken_reduced | Finite; converged |
| Divine Apparition | Continuity, Grim Presence | None in this isolated sample | Finite; converged |
| Dragon's Blessing | — | enhanced_weapon_damage, percent_strength, percent_dexterity, percent_vitality, percent_energy | Finite; converged |
| Arbiter | — | total_defense_multiplier | Finite; converged |
| Superbeast | Blood Thorns, Grim Presence, Lemures, Mind Flay, Sanguine Covenant, Slayer, Tainted Blood | None in this isolated sample | Finite; converged |
| Vindicate (Innate) | — | enhanced_weapon_damage, life_regenerated_per_second | Finite; converged |

## Sorceress (59)

| Skill | Direct skill references | Character effect keys at sampled levels | Evaluation |
| --- | --- | --- | --- |
| Antimass | — | None in this isolated sample | Finite; converged |
| Arcane Fury | Antimass, Arcane Torrent, Continuity, Immersion, Mana Sweep, Raven Familiar | percent_energy, maximum_mana | Finite; converged |
| Arcane Torrent | — | None in this isolated sample | Finite; converged |
| Immersion | Arcane Fury | None in this isolated sample | Finite; converged |
| Mana Sweep | Blight, Entanglement, Frostborn, Havoc | None in this isolated sample | Finite; converged |
| Raven Familiar | — | all_skills, cast_speed, percent_energy | Finite; converged |
| Superposition | Entanglement | None in this isolated sample | Finite; converged |
| Warmth | — | cold_resistance, regenerate_mana | Finite; converged |
| Molten Core | Entanglement | physical_resistance | Finite; converged |
| Emberstep | Molten Core | None in this isolated sample | Finite; converged |
| Flamefront | Incineration, Overheat | None in this isolated sample | Finite; converged |
| Overheat | Flamefront, Flamestrike, Havoc | None in this isolated sample | Finite; converged |
| Flamestrike | Overheat, Pyre | None in this isolated sample | Finite; converged |
| Incineration | — | None in this isolated sample | Finite; converged |
| Pyre | — | None in this isolated sample | Finite; converged |
| Havoc | Emberstep, Flamefront, Flamestrike, Incineration, Mana Sweep, Molten Core, Overheat, Pyre, Warmth | None in this isolated sample | Finite; converged |
| Entanglement | Eye of the Storm, Forked Lightning, Mana Sweep, Mind Spark, Molten Core, Tempest, Thunderstone | None in this isolated sample | Finite; converged |
| Eye of the Storm | — | None in this isolated sample | Finite; converged |
| Forked Lightning | Living Flame, Snow Queen, Vengeful Power | None in this isolated sample | Finite; converged |
| Mind Spark | — | None in this isolated sample | Finite; converged; 2 unknown tooltip lines |
| Tempest | Living Flame, Mind Spark, Snow Queen, Vengeful Power | None in this isolated sample | Finite; converged |
| Thunderstone | Eye of the Storm, Living Flame, Snow Queen, Vengeful Power | None in this isolated sample | Finite; converged |
| Crystalline Barrier | Witch Blood | None in this isolated sample | Finite; converged |
| Frigid Nova | Witch Blood | None in this isolated sample | Finite; converged |
| Frostborn | Crystalline Barrier, Frigid Nova, Glacial Torrent, Hoar Frost, Mana Sweep, Rime, Wintertide | grit, maximum_life | Finite; converged |
| Glacial Torrent | Witch Blood | None in this isolated sample | Finite; converged |
| Hoar Frost | — | None in this isolated sample | Finite; converged |
| Rime | — | None in this isolated sample | Finite; converged |
| Wintertide | Frostborn, Hoar Frost, Rime, Vengeful Power, Witch Blood | None in this isolated sample | Finite; converged; 1 unknown tooltip lines |
| Arachnomancy | — | None in this isolated sample | Finite; converged |
| Blight | Arachnomancy, Decay, Elucidation, Inoculation, Lorenado, Mana Sweep, Miasma | poison_spell_damage, enemy_fire_resistance, enemy_lightning_resistance, enemy_cold_resistance, movement_speed, disable_elemental_damage | Finite; converged |
| Inoculation | — | None in this isolated sample | Finite; converged |
| Decay | Inoculation | None in this isolated sample | Finite; converged |
| Elucidation | — | None in this isolated sample | Finite; converged |
| Lorenado | Elucidation | None in this isolated sample | Finite; converged |
| Miasma | Decay, Inoculation | None in this isolated sample | Finite; converged |
| Arcane Sustenance | Fusillade | None in this isolated sample | Finite; converged |
| Bladestorm | Cold Blooded | None in this isolated sample | Finite; converged |
| Cold Blooded | — | None in this isolated sample | Finite; converged |
| Determination | — | None in this isolated sample | Finite; converged |
| Fatal Focus | — | deadly_strike, max_block_chance | Finite; converged |
| Fusillade | Arcane Sustenance, Premonition | None in this isolated sample | Finite; converged |
| Mooncall | Continuity, Crystalline Barrier, Primordial Might | None in this isolated sample | Finite; converged |
| Premonition | — | None in this isolated sample | Finite; converged |
| Primordial Might | Mooncall | None in this isolated sample | Finite; converged |
| Firedance | — | fire_spell_damage, cold_spell_damage, lightning_spell_damage, poison_spell_damage, enhanced_weapon_damage | Finite; converged |
| Hive | Continuity | None in this isolated sample | Finite; converged |
| Ice Elementals | ice elemental | maximum_cold_resistance, total_defense_multiplier | Finite; converged |
| Living Flame | — | life, life_regenerated_per_second | Finite; converged |
| Nova Charge | Continuity | energy | Finite; converged |
| Snow Queen | — | max_block_chance, base_block_chance, block_speed | Finite; converged |
| Vengeful Power | — | physical_resistance, chance_to_crush_attacker, maximum_life | Finite; converged |
| Warp Armor | — | avoid_chance, enhanced_defense | Finite; converged |
| Baneblade | Chronofield, Continuity, Witch Blood | block_speed, enhanced_weapon_damage, maximum_life, innate_elemental_damage, enhanced_defense | Finite; converged |
| Chronofield | Baneblade, Witch Blood | None in this isolated sample | Finite; converged |
| Force Blast | Continuity | None in this isolated sample | Finite; converged |
| Symbol of Esu | — | fire_absorb, cold_absorb, lightning_absorb, spell_focus | Finite; converged |
| Witch Blood | Baneblade, Chronofield, Frostborn, Snow Queen, Vengeful Power | life_after_each_kill | Finite; converged |
| Mana Shield (Innate) | Arcane Fury, Arcane Sustenance, Continuity | None in this isolated sample | Finite; converged |
