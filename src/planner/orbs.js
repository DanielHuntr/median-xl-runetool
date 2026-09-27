import data from '../data/mystic-orbs.json' with { type: 'json' };
export const ORBS = data.orbs;
export const orbById = (id) => ORBS.find(o => o.id === id);
export const orbGroup = (o) => o.name === 'Imperfect Sphere' ? 'imperfect-sphere' : o.id;
export function orbFits(o, def, lines = [], state = {}) {
  if (!o || state.ethereal || lines.some(l => /\bethereal\b/i.test(l))) return false;
  const slot = def.slotType;
  if (!['weapon','shield','helm','body','gloves','belt','boots','ring','amulet','quiver'].includes(slot)) return false;
  if (o.name === 'Solitude') return slot === 'helm';
  if (o.name === 'Weight of Talent') return slot === 'body';
  if (o.name === 'Eye of Malic' || o.name === 'Imperfect Sphere') return ['ring','amulet'].includes(slot);
  return o.group === 'Item' || o.group === 'Weapon' && slot === 'weapon'
    || o.group === 'Armor' && ['shield','helm','body','gloves','belt','boots'].includes(slot)
    || o.group === 'Ring/Amulet/Quiver' && ['ring','amulet','quiver'].includes(slot);
}
export function cleanOrbs(raw) {
  const result = [], counts = new Map();
  for (const id of Array.isArray(raw) ? raw.slice(0, 200) : []) {
    const o = orbById(id);
    if (!o) continue;
    const key = orbGroup(o), n = counts.get(key) || 0;
    if (n >= o.limit) continue;
    counts.set(key, n + 1); result.push(id);
  }
  return result;
}
export function orbMultiplier(lines) {
  return lines.some(l => /Orb Effects.*Quadrupled/i.test(l)) ? 4 : lines.some(l => /Orb Effects.*Doubled/i.test(l)) ? 2 : 1;
}
