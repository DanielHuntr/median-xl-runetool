// Use the item parser's vocabulary so selected modifiers reach the calculations.
export const CUSTOM_STATS = [
  ['All skills', '+{0} to All Skills'],
  ...['Strength', 'Dexterity', 'Vitality', 'Energy', 'Life', 'Mana'].map(a => [a, `+{0} to ${a}`]),
  ['All attributes', '+{0} to all Attributes'],
  ['Maximum life', 'Maximum Life +{0}%'],
  ['Enhanced damage', '+{0}% Enhanced Damage'],
  ['Weapon physical damage', 'Weapon Physical Damage +{0}%'],
  ['Enhanced defense', '+{0}% Enhanced Defense'],
  ['Defense', '+{0} Defense'],
  ...['Attack', 'Cast', 'Movement', 'Hit Recovery', 'Block'].map(a => [a === 'Hit Recovery' ? a : `${a} speed`, `{0}% ${a}${a === 'Hit Recovery' ? '' : ' Speed'}`]),
  ['Elemental resistances', 'Elemental Resists +{0}%'],
  ...['Fire', 'Cold', 'Lightning', 'Poison', 'Magic'].map(a => [`${a} resistance`, `${a} Resist +{0}%`]),
  ...['Fire', 'Cold', 'Lightning', 'Poison'].map(a => [`${a} spell damage`, '+{0}% to ' + a + ' Spell Damage']),
  ...['Fire', 'Cold', 'Lightning'].map(a => [`Added ${a.toLowerCase()} damage`, 'Adds {0}-{1} ' + a + ' Damage']),
  ['Life on striking', '+{0} Life on Striking'],
  ['Life on melee attack', '+{0} Life on Melee Attack'],
  ['Life stolen per hit', '{0}% Life stolen per Hit'],
  ['Mana stolen per hit', '{0}% Mana stolen per Hit'],
  ['Life after kill', '+{0} Life after each Kill'],
  ['Summon damage', '+{0}% to Summon Damage'],
  ['Summon life', '+{0}% to Summon Life'],
  ['Required level', 'Required Level: {0}'],
  ['Cannot be frozen', 'Cannot Be Frozen'],
  ...['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress'].map(a => [`${a} skills`, `+{0} to ${a} Skill Levels`]),
  ...['Strength', 'Dexterity', 'Vitality', 'Energy'].map(a => [`${a} bonus (%)`, `{0}% to ${a}`]),
  ['All attributes (%)', '{0}% to All Attributes'],
  ['Maximum mana', 'Maximum Mana +{0}%'],
  ['Maximum life and mana', 'Maximum Life and Mana +{0}%'],
  ['Life regeneration', '+{0} Life Regenerated per Second'],
  ['Mana regeneration', 'Regenerate Mana +{0}%'],
  ['Maximum stamina', '+{0} Maximum Stamina'],
  ['Physical resistance', 'Physical Resist +{0}%'],
  ...['Fire', 'Cold', 'Lightning', 'Poison'].map(a => [`Maximum ${a.toLowerCase()} resistance`, `Maximum ${a} Resist +{0}%`]),
  ['Maximum elemental resistances', 'Maximum Elemental Resists +{0}%'],
  ...['Fire', 'Cold', 'Lightning', 'Magic'].flatMap(a => [[`${a} absorb (%)`, `${a} Absorb {0}%`], [`${a} absorb (flat)`, `${a} Absorb +{0}`]]),
  ['Physical damage reduction', 'Physical Damage Taken Reduced by {0}'],
  ['Elemental/magic damage reduction', 'Elemental/Magic Damage Taken Reduced by {0}'],
  ['Poison length reduction', 'Poison Length Reduction {0}%'],
  ['Curse length reduction', 'Curse Length Reduction {0}%'],
  ['Half freeze duration', 'Half Freeze Duration'],
  ['Defense bonus (%)', '+{0}% Bonus to Defense'],
  ['Defense vs melee', '+{0} Defense vs. Melee'],
  ['Defense vs missiles', '+{0} Defense vs. Missile'],
  ['Base block chance', '{0}% Base Block Chance'],
  ['Maximum block chance', 'Maximum Block Chance +{0}%'],
  ['Combat speeds', '+{0}% Combat Speeds'],
  ['Minimum weapon damage', '+{0} to Minimum Damage'],
  ['Maximum weapon damage', '+{0} to Maximum Damage'],
  ['Added physical damage', 'Adds {0}-{1} Damage'],
  ['Added magic damage', 'Adds {0}-{1} Magic Damage'],
  ['Added poison damage', 'Adds {0}-{1} Poison Damage over {2} seconds'],
  ['Innate elemental damage', '{0}% Innate Elemental Damage'],
  ['Strength damage bonus', 'Additional Strength Damage Bonus: {0}%'],
  ['Attack rating', '+{0} to Attack Rating'],
  ['Attack rating bonus (%)', '{0}% Bonus to Attack Rating'],
  ['Crushing blow', '{0}% Chance of Crushing Blow'],
  ['Deadly strike', '{0}% Deadly Strike'],
  ['Damage to demons', '+{0}% Damage to Demons'],
  ['Damage to undead', '+{0}% Damage to Undead'],
  ['Physical/magic spell damage', '+{0}% to Physical/Magic Spell Damage'],
  ['Spell damage', '+{0}% to Spell Damage'],
  ['Elemental spell damage', '+{0}% to Elemental Spell Damage'],
  ...['Fire', 'Cold', 'Lightning', 'Poison', 'Magic'].map(a => [`${a} pierce (enemy resistance)`, `-{0}% to Enemy ${a} Resistance`]),
  ['Elemental pierce', '-{0}% to Enemy Elemental Resistances'],
  ['Spell focus', '+{0} Spell Focus'],
  ['Spell focus bonus (%)', '+{0}% Bonus to Spell Focus'],
  ['Poison skill duration', '+{0}% Bonus to Poison Skill Duration'],
  ['Reduced mana cost', '-{0}% Mana Cost of Skills'],
  ['Activation frequency', 'Activation Frequency {0}%'],
  ['Mana after kill', '+{0} Mana after each Kill'],
  ['Life after demon kill', '+{0} Life after each Demon Kill'],
  ['Mana on melee attack', '+{0} Mana on Melee Attack'],
  ['Mana on striking', '+{0} Mana on Striking'],
  ...['Life', 'Mana'].map(a => [`${a} when struck`, `+{0} ${a} when Struck by an Enemy`]),
  ['Summon attack rating', '+{0}% to Summon Attack Rating'],
  ['Summon elemental resistances', '+{0}% to Summon Elemental Resistances'],
  ['Summon physical resistance', '+{0}% to Summon Physical Resist'],
  ['Magic find', '{0}% Magic Find'],
  ['Gold find', '{0}% Gold Find'],
  ['Experience gained', '+{0}% to Experience Gained'],
  ['Light radius', '+{0} to Light Radius'],
  ['Slow target', 'Slow Target {0}%'],
  ['Slows attacker', 'Slows Attacker by {0}%'],
  ['Target takes additional damage', 'Target Takes Additional Damage of {0}'],
  ['Reduced vendor prices', '-{0}% to All Vendor Prices'],
  ['Hit causes monster to flee', 'Hit Causes Monster to Flee +{0}%'],
  ['Attacker flees', 'Attacker Flees after Striking {0}%'],
  ['Damage taken restores mana', '{0}% Weapon Damage Taken Restores Mana'],
  ['Reduced requirements', 'Requirements -{0}%'],
  ...['Life', 'Mana', 'Attack Rating'].map(a => [`${a} per character level`, `+{0} to ${a} (Based on Character Level)`]),
  ['Defense per character level', '+{0} Defense (Based on Character Level)'],
  ['Weapon damage per character level', 'Weapon Physical Damage +{0}% (Based on Character Level)'],
].map(([label, format], id) => ({ id, label, format, group: groupOf(label), count: Math.max(-1, ...[...format.matchAll(/\{(\d)\}/g)].map(m => Number(m[1]))) + 1 }));
// Categories for filtering the modifier pills; the first matching rule wins.
export const STAT_GROUPS = ['Skills', 'Attributes', 'Life & mana', 'Attack', 'Spells', 'Defense', 'Summons', 'Utility'];
function groupOf(label) {
  const l = label.toLowerCase();
  if (/summon/.test(l)) return 'Summons';
  if (/skills$/.test(l)) return 'Skills';
  if (/^(strength|dexterity|vitality|energy|all attributes)/.test(l)) return 'Attributes';
  if (/spell|pierce|cast speed|mana cost|poison skill|activation/.test(l)) return 'Spells';
  if (/resist|absorb|defense|block|reduction|hit recovery|frozen|freeze|curse length|poison length|attacker/.test(l)) return 'Defense';
  if (/life|mana|stamina|regeneration/.test(l)) return 'Life & mana';
  if (/damage|attack|crushing|deadly|combat speeds/.test(l)) return 'Attack';
  return 'Utility';
}
export function customStatText(rows) {
  return rows.map(row => {
    const stat = CUSTOM_STATS.find(s => s.id === row.id);
    return stat?.format.replace(/\{(\d)\}/g, (_, i) => String(Number(row.values[i]) || 0));
  }).filter(Boolean).join('\n');
}
