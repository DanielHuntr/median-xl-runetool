# Repeated damage audit

Scans all imported skills, sampling first and maximum base level at character level 150. Repeat totals describe potential if all listed hits land, not guaranteed single-target damage or DPS. Ranges preserve minimum/maximum hit counts. Poison is not stacked per hit. Unknown frequency, conditional bonuses, proc chances, summons, and vague “multiple hits” are not invented as fixed multipliers. Independent in-game hit testing is still needed to establish overlap and timing. Gear scoring continues to use per-hit/cast damage.

70 candidate skills; 0 aggregation failures.

| Class | Skill | Source wording | Result |
|---|---|---|---|
| Amazon | Wild and Free | {{hit_recovery}}; Increases Movement and Hit Recovery speed; Hit Recovery:  | 1 points: no direct damage model<br>25 points: no direct damage model |
| Amazon | Rapid Wyrmshot | {{hits_per_second}}; 13 Hits per Second | 1 points: per hit/cast only; no numeric repeat total<br>1 points: per hit/cast only; no numeric repeat total |
| Amazon | Trinity Arrow | {{projectiles}}; 18 Projectiles | 1 points: no direct damage model<br>5 points: no direct damage model |
| Amazon | Eviscerate | Each Javelin splits into 5 projectiles on impact; Each javelin splits into 5 projectiles on impact | 1 points: per hit/cast only; no numeric repeat total<br>25 points: per hit/cast only; no numeric repeat total |
| Amazon | Conductivity | Stormcall has a chance to cast Askari Lightning on hit; % chance to cast Askari Lightning on Stormcall hit | 1 points: no direct damage model<br>7 points: no direct damage model |
| Amazon | Lightning Shield | Shocks monsters that attempt to melee attack you or hit you with ranged attacks | 1 points: no direct damage model<br>15 points: no direct damage model |
| Amazon | Power Shift | More Damage on direct hits; More Damage on Direct Hits | 1 points: no direct damage model<br>1 points: no direct damage model |
| Amazon | Eldritch Storm | Hits multiple times; Hits Multiple Times | 1 points: per hit/cast only; no numeric repeat total<br>25 points: per hit/cast only; no numeric repeat total |
| Amazon | Fire Elementals | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>25 points: summon; no player-hit multiplier |
| Amazon | Magic Missiles | {{bolts}}; +1 Projectile per 5 Skill Levels (Max 15) | 1 points: 6–6 (6 bolts)<br>25 points: 11–11 (11 bolts) |
| Amazon | Freedom | {{hit_recovery}}; Hit Recovery: ; +5% Hit Recovery per Base Level | 1 points: no direct damage model<br>5 points: no direct damage model |
| Assassin | APF-20 'Maelstrom' MkV | 16 projectiles per nova; 16 Projectiles per Nova | 1 points: 16–16 (16 projectiles per nova)<br>25 points: 16–16 (16 projectiles per nova) |
| Assassin | Scorpion Blade | Detonates again 1 second after hit; Detonates Again 1 second After Hit | 1 points: no direct damage model<br>25 points: no direct damage model |
| Assassin | Void Gazer | {{hit_recovery}}; Movement/Hit Recovery Speeds:  | 1 points: no direct damage model<br>1 points: no direct damage model |
| Assassin | Summon Familiars | {{minions}}; {{minions_inherit_proc_chance}} | 1 points: summon; no player-hit multiplier<br>1 points: summon; no player-hit multiplier |
| Assassin | Vampiric Strike | (+3 projectiles while Vampiric Icon is present or for 3 seconds after Blinking); {{projectiles}};  Projectiles; (+3 projectiles while Vampiric Icon is present or for 3 seconds after blinking); +1 Projectile per Base Level | 1 points: 3–3 (3 Projectiles)<br>5 points: 7–7 (7 Projectiles) |
| Assassin | Backstab | 7-8 hits per Attack; 7-8 Hits per Attack | 1 points: 7–8 (7-8 hits per Attack)<br>20 points: 7–8 (7-8 hits per Attack) |
| Assassin | Forger's Hegemony | (When hit by monster Weapon Damage); % Maximum Life Regenerated over 5 seconds when hit by weapon damage | 1 points: no direct damage model<br>5 points: no direct damage model |
| Assassin | Shadow Flow | {{hit_recovery}}; Hit Recovery:  | 1 points: no direct damage model<br>15 points: no direct damage model |
| Barbarian | Hunter's Mark |  per hit | 1 points: no direct damage model<br>25 points: no direct damage model |
| Barbarian | Wolf Companion | {{minions}} | 1 points: summon; no player-hit multiplier<br>10 points: summon; no player-hit multiplier |
| Barbarian | Wolf Stance | {{hit_recovery}}; Increases Attack, Hit Recovery and Movement Speed; Hit Recovery:  | 1 points: no direct damage model<br>25 points: no direct damage model |
| Barbarian | Stampede | +1 Projectile per 9 Base Levels (Max 3) | 1 points: per hit/cast only; no numeric repeat total<br>20 points: per hit/cast only; no numeric repeat total |
| Barbarian | Unyielding | Gain Physical Resistance after being hit | 1 points: no direct damage model<br>5 points: no direct damage model |
| Barbarian | Defender Spirit | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>20 points: summon; no player-hit multiplier |
| Barbarian | Guardian Spirit | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>20 points: summon; no player-hit multiplier |
| Barbarian | Protector Spirit | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>20 points: summon; no player-hit multiplier |
| Barbarian | Immortal | {{hit_recovery}}; Hit Recovery Rate:  | 1 points: no direct damage model<br>15 points: no direct damage model |
| Druid | Harvesters | {{minions}} | 1 points: summon; no player-hit multiplier<br>25 points: summon; no player-hit multiplier |
| Druid | Infected Roots | Hits multiple times at the centre; Hits Multiple Times at the centre | 1 points: no direct damage model<br>25 points: no direct damage model |
| Druid | Lunar Assault | 7 hits per target | 1 points: no direct damage model<br>1 points: no direct damage model |
| Druid | Twisted Claw | Melee hit which unleashes a spiral of damaging twisters | 1 points: per hit/cast only; no numeric repeat total<br>25 points: per hit/cast only; no numeric repeat total |
| Druid | Earth Talons | Hits multiple times; Hits Multiple Times | 1 points: per hit/cast only; no numeric repeat total<br>25 points: per hit/cast only; no numeric repeat total |
| Druid | Primal Dominance | {{hit_recovery}}; Hit Recovery Rate: ; +%d%% Hit Recovery Speed per Base Level | 1 points: no direct damage model<br>3 points: no direct damage model |
| Druid | Bear Companion | {{minions}} | 1 points: summon; no player-hit multiplier<br>25 points: summon; no player-hit multiplier |
| Druid | Ember Spirit | {{minions}} | 1 points: summon; no player-hit multiplier<br>25 points: summon; no player-hit multiplier |
| Druid | Hunting Banshee | Hits up to 8 times per Wraith; Hits up to 8 times per wraith | 1 points: 1–8 (Hits up to 8 times per Wraith)<br>25 points: 1–8 (Hits up to 8 times per Wraith) |
| Druid | Faerie Fire | Spark Trail hits 13 times per second; Spark Trail Hits 13 times per second | 1 points: per hit/cast only; no numeric repeat total<br>15 points: per hit/cast only; no numeric repeat total |
| Necromancer | Famine | Increases damage and returns life when you hit | 1 points: no direct damage model<br>15 points: no direct damage model |
| Necromancer | Abyss Knight | {{minions_inherit_proc_chance}}; {{minions}}; Always hits; Always Hits | 1 points: summon; no player-hit multiplier<br>25 points: summon; no player-hit multiplier |
| Necromancer | Blood Skeleton | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>20 points: summon; no player-hit multiplier |
| Necromancer | Night Hawks | Hits multiple times; {{minions}}; Hits Multiple Times | 1 points: summon; no player-hit multiplier<br>20 points: summon; no player-hit multiplier |
| Necromancer | Alchemical Preparation | {{bonus_projectiles_to_flameburst_and_catapult_shot}};  Bonus Projectiles to Flameburst and Catapult Shot; +1 Projectile to Flameburst and Catapult Shot per Base Level | 1 points: no direct damage model<br>20 points: no direct damage model |
| Necromancer | Catapult Shot | {{missiles}} | 1 points: 10–10 (10 missiles)<br>20 points: 10–10 (10 missiles) |
| Necromancer | Deathly Effigy | {{shoots_times}} | 1 points: no direct damage model<br>10 points: no direct damage model |
| Necromancer | Flameburst Shot | {{missiles}} | 1 points: 10–10 (10 missiles)<br>20 points: 10–10 (10 missiles) |
| Necromancer | Widowmaker | {{total_bolts}} | 1 points: 12–12 (Total Bolts: 12)<br>25 points: 36–36 (Total Bolts: 36) |
| Paladin | Resurrect | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>15 points: summon; no player-hit multiplier |
| Paladin | Servants of Valor | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>25 points: summon; no player-hit multiplier |
| Paladin | Spark of Hope | {{hit_recovery}}; Hit Recovery:  | 1 points: no direct damage model<br>25 points: no direct damage model |
| Paladin | Combustion | +1 Extra Projectile per ; Improved Projectile and Radius Scaling per Base Level | 1 points: no direct damage model<br>5 points: no direct damage model |
| Paladin | Absolution | Deals 100% of your vessel skill damage per hit; Deals 100% of your vessel skill damage per hit | 1 points: per hit/cast only; no numeric repeat total<br>1 points: per hit/cast only; no numeric repeat total |
| Paladin | Sentence | Deals 150% of your vessel skill damage per hit; Rapidly hits random enemies around the player; Deals 150% of your vessel skill damage per hit | 1 points: per hit/cast only; no numeric repeat total<br>1 points: per hit/cast only; no numeric repeat total |
| Paladin | Blood Thorns | {{shoots_times}} | 1 points: 3–3 (Shoots 3 times)<br>25 points: 3–3 (Shoots 3 times) |
| Paladin | Possession | {{hit_recovery}}; {{chance_to_dodge_projectiles}}; % Hit Recovery; Chance to dodge projectiles: ; +1% Chance to Dodge Projectiles per Base Level (Max 35%); +25% Hit Recovery per Base Level | 1 points: no direct damage model<br>10 points: no direct damage model |
| Paladin | Rite of the Restless | Increased number of hits per attack; Increased number of hits per attack | 1 points: no direct damage model<br>1 points: no direct damage model |
| Paladin | Rite of Thorns | Increased number of hits per attack; Increased number of hits per attack | 1 points: no direct damage model<br>1 points: no direct damage model |
| Paladin | Confluence | +1 Beam when above 70% of Maximum Life; +1 Beam when above 70% of Maximum Life | 1 points: no direct damage model<br>1 points: no direct damage model |
| Paladin | Mind Flay | {{minions}}; Chaotic beam of lightning that shocks your primary target; Beams: ; +1 Beam per  | 1 points: per hit/cast only; no numeric repeat total<br>25 points: 2–2 (Beams: 2) |
| Paladin | Slayer | Casts 25 times; Casts 25 times | 1 points: 25–25 (Casts 25 times)<br>25 points: 25–25 (Casts 25 times) |
| Paladin | Symphony of Destruction | +1 Beam in Slayer's area of effect | 1 points: no direct damage model<br>1 points: no direct damage model |
| Sorceress | Arcane Fury | 73% less Mana drained when hit; +1 Projectile; +1 Projectile; 73% less mana drained when hit | 1 points: no direct damage model<br>1 points: no direct damage model |
| Sorceress | Mana Sweep | Leeches Mana based on number of hits; Leeches mana based on number of hits | 1 points: no direct damage model<br>25 points: no direct damage model |
| Sorceress | Flamestrike | Up to 13 hits per cast; Up to 13 hits per cast | 1 points: 1–13 (Up to 13 hits per cast)<br>25 points: 1–13 (Up to 13 hits per cast) |
| Sorceress | Forked Lightning | {{bolts}} | 1 points: 5–5 (5 bolts)<br>25 points: 9–9 (9 bolts) |
| Sorceress | Tempest |  | 1 points: 5–5 (Releases 5 bolts)<br>25 points: 7–7 (Releases 7 bolts) |
| Sorceress | Thunderstone |  | 1 points: 20–20 (20 Charged Bolts)<br>25 points: 20–20 (20 Charged Bolts) |
| Sorceress | Lorenado | {{minions}} | 1 points: summon; no player-hit multiplier<br>25 points: summon; no player-hit multiplier |
| Sorceress | Arcane Sustenance | 50% less Mana drained when hit; Mana Shield: 50% less Mana drained when hit | 1 points: no direct damage model<br>1 points: no direct damage model |
| Sorceress | Ice Elementals | {{minions_inherit_proc_chance}}; {{minions}} | 1 points: summon; no player-hit multiplier<br>20 points: summon; no player-hit multiplier |
