// Ordinary orb values from the installed game's mysticorbs.bin; unique orbs from docs.
// node scripts/import-orbs.mjs [game directory]
import { writeFile } from 'node:fs/promises';
import { openMpq } from './lib/mpq.mjs';
import { readBin } from './lib/d2tables.mjs';
import { parseUniqueOrbs, UMO_URL } from '../lib/mystic-orbs.mjs';
const dir = process.argv[2] || 'C:/games/median-xl';
const version = openMpq(`${dir}/medianxl-version.mpq`).read('version.mxl')?.toString('latin1').trim();
// The row-to-stat mapping below is checked per patch: 2.14.6's table gives the same 85 orbs as 2.14.4's.
const VERIFIED = ['2.14.4', '2.14.6'];
if (!VERIFIED.includes(version)) throw new Error(`Orb table mapping is verified for ${VERIFIED.join(', ')}, found ${version}`);
const mpq = openMpq(`${dir}/medianxl-YmludGJsdHh0.mpq`);
const table = readBin(mpq.read('data/global/excel/mysticorbs.bin'.replaceAll('/', String.fromCharCode(92))));
if (table.size !== 143) throw new Error('Unrecognized mystic orb table');
const formats = [
  '+N to Strength', '+N to Dexterity', '+N to Energy', '+N to Vitality',
  '+N% to Fire Spell Damage', '+N% to Cold Spell Damage', '+N% to Lightning Spell Damage', '+N% to Poison Spell Damage', '+N% to Physical/Magic Spell Damage',
  'Physical Damage Taken Reduced by N', 'Regenerate Mana +N%', '+N% to Summon Damage', '+N% to Summon Life', '+N% to Summon Elemental Resistances', 'N% Magic Find',
  '+N to Life', '+N Defense', 'Poison Length Reduction N%', 'Fire Resist +N%', 'Cold Resist +N%', 'Lightning Resist +N%', 'Poison Resist +N%',
  'Curse Length Reduction N%', '+N% Enhanced Defense', 'N% Bonus to Defense', '+N Spell Focus', '+N% to Experience Gained', 'N% Life stolen per Hit',
  'N% Mana Cost of Skills', 'N% Bonus to Attack Rating', '+N% Enhanced Damage', '+N to Maximum Damage', 'N% Deadly Strike', 'N% Chance of Crushing Blow',
  '+N Life after each Kill', 'Elemental Resists +N%', 'Requirements N%', '+N to Maximum Damage', 'N% Block Speed', 'N% Gold Find', 'N% Hit Recovery',
  '+N Life Regenerated per Second', '+N Life on Melee Attack', '+N Mana on Melee Attack', 'N% Innate Elemental Damage', 'Weapon Physical Damage +N%', 'N% Cast Speed', 'N% Attack Speed',
];
const ordinary = formats.map((format, i) => {
  const r = table.record(i);
  const name = r.toString('latin1', 0, 32).replace(/\0.*$/, '').replace(/^MO - /, '');
  const group = ({45:'Weapon',50:'Armor',255:'Item',256:'Ring/Amulet/Quiver'})[r.readUInt32LE(35)];
  if (!group || r[32] !== 4 || r.readUInt16LE(43) !== 5) throw new Error(`Unexpected ordinary orb ${i}`);
  const value = r.readInt32LE(53) / (i === 41 ? 10 : 1);
  // minLevel 0: ordinary orbs can be applied from Normal (confirmed in game by the project
  // owner, 28 Sept 2026); unique orbs are only suggested when the player allows them.
  return { id: `mo-${i}`, name, group, lines: [format.replace('N', value)], reqLevel: 4, minLevel: 0, limit: 5, unique: false };
});
const response = await fetch(UMO_URL);
if (!response.ok) throw new Error(`Docs returned ${response.status}`);
const unique = parseUniqueOrbs(await response.text()).map(o => ({ ...o, id: `umo-${o.id}`, unique: true, minLevel: 0 }));
if (unique.length < 25) throw new Error('Incomplete unique orb catalogue');
await writeFile(new URL('../src/data/mystic-orbs.json', import.meta.url), JSON.stringify({ source: [`Median XL ${version} mysticorbs.bin`, UMO_URL], orbs: [...ordinary, ...unique] }, null, 2) + '\n');
console.log(`Imported ${ordinary.length} ordinary and ${unique.length} unique orbs`);
