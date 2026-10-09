// "What's new" (WhatsNew.vue): what changed on the site, newest first, in players' words.
// Add an entry for each release; its date marks it as new until a visitor has opened the list.
export const CHANGELOG = [
  {
    date: "2026-10-09",
    items: [
      "Importing a character fills every stage with its setup, inventory and stash included, to change from there. It opens on the stage the character is at.",
      "A cleaner item editor: the item's stats stay in view on the left and update as you change it on the right, with orbs grouped, sockets and bonuses easier to set, and the live required level, damage and defense.",
      "Long lists have a filter: mystic orbs (grouped by kind, saying why one can't be added), corruptions, shrines, cycles and affixes.",
      "Messages appear as small notifications, and removing an item or emptying its sockets can be undone from them. Resetting a character or deleting a loot filter asks in place instead of a pop-up.",
      "The planner's top bar keeps Save and Share up front, with Import character and Reset under More. Every delete now asks in place the same way.",
      "On phones, the item editor slides up as a sheet from the bottom.",
      "Imported magic and rare rings and amulets show a picture instead of an empty slot.",
      "Delete and Reset are easier to read in every theme.",
      "Ctrl-click (⌘ on a Mac) an attribute's + to put every stat point you have left into it, or its − to take all of its points back.",
      "Picking an item in the planner starts it on a tier your character can wear, and the list says which tier and level that is. A low-level runeword no longer lands on a Sacred base it can't use.",
      "Where to level no longer suggests the Moo Moo Farm before Hell: Wirt's Leg only opens it on Hell.",
      "When the items in the cube make a recipe your character can't use, the cube says what it needs (a difficulty, level or class) instead of just \"Nothing happens\".",
      "On phones the page header takes less room, so the page starts higher.",
      "Keyboard: closing a panel takes you back where you were, and the More and stage menus work with the arrow keys.",
      "Smaller fixes: number boxes show the value in use after an out-of-range entry, counts say \"1 rule\" rather than \"1 rules\", no empty set bonus heading, Suggest gear points you to your skills when you have none, and its list no longer jumps while it loads.",
    ],
  },
  {
    date: "2026-10-08",
    items: [
      "Import your character from its median-xl.com page: skills, quests, attributes, worn gear with its actual rolls (rares with their exact stats, jewels in sockets), charms and your mercenary. Your inventory and stash come in as spare items to try on, and your runes can go straight into My Runes. Read in your browser only.",
      "Import any character by name: type it in and the planner fetches its public median-xl.com page. No saving or pasting needed. It goes into the stage the character is at (Normal, Nightmare, Hell or Endgame), from its title.",
      "Equipment slots show the rune, gem or jewel in each socket.",
      "Skill order in the planner's skill summary: the order you spend skill points, the character level each comes at, and warnings if a point comes before its prerequisite. Move rows to plan your levelling.",
      "Item Upgrades page: every affix, mystic orb, oil, corruption, shrine, scroll of enchantment, trophy and cycle, searchable, with what each goes on and the game's pictures.",
      "More accurate damage: elemental weapons (sacred bows and similar) count their innate damage once, spell damage raises weapon elemental damage as on your character screen, and skills use the game's exact share of weapon damage (Barrage 90.6%, Backstab 195%).",
      "Fixes: Dragonlore, Thundermaiden, Howl of the Spirits and Alchemical Preparation no longer count their pierce twice; Veneration of Justice no longer doubles its Vitality and Energy; skills from items (+25 to Nova Charge) work as in game; \"+% to Spell Damage\" counts toward Physical/Magic too.",
      "Oils and corruptions in the item editor, from the game's own cube recipes: the oil each item can take, and every corruption a sacred item can reveal with an Oil of Craft.",
    ],
  },
  {
    date: "2026-10-07",
    items: [
      "Quivers follow your weapon: arrows with a bow, bolts with a crossbow, and a bow and its quiver can be worn together.",
      "Your first sign-in takes you to choose a display name, then back to where you were.",
      "Loot filter exports match the game's own format exactly.",
      "Skill tooltips laid out as the game shows them (Death Pact's tree bonuses).",
      "Link previews when you share the site, and the level box no longer cuts off on phones.",
      "Security improvements.",
    ],
  },
  {
    date: "2026-10-06",
    items: [
      "Median XL 2.14.6 data, with every item's text checked against the game files.",
      "Starter runewords: the ones made only of common runes, for a new character.",
      "Runes on a runeword card link to the cube recipe that makes them.",
      "\"+ to skill\" lines say which class the skill belongs to.",
      "Search and filters are kept when you refresh.",
      "Planner stages can be duplicated.",
      "Oskills & Procs page, an affix picker for rare, crafted and magic items, and Mastercrafted items.",
      "Ten new themes from Blizzard's other games.",
    ],
  },
  {
    date: "2026-10-01",
    items: [
      "Accounts: sign in with Google to keep your builds and loot filters on any device, publish builds and like other players'.",
    ],
  },
];
