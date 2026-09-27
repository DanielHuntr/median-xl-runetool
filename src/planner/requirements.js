// Suggestions must not create or worsen attribute shortages in retained equipment.
// Existing invalid builds can still be repaired one slot at a time.
export function attributeDeficits(character) {
  return Object.fromEntries(Object.entries(character.equipped).map(([slot, r]) => [slot, {
    strength: Math.max(0, r.head.reqStr - character.attributes.strength.total),
    dexterity: Math.max(0, r.head.reqDex - character.attributes.dexterity.total),
  }]));
}
// Nor take an attribute below zero (Rebel's -75 Vitality and Energy with no points in them),
// or lower one that already is.
const ATTRIBUTES = ['strength', 'dexterity', 'vitality', 'energy'];
export function attributesSafe(before, after, strictSlots = []) {
  const old = attributeDeficits(before), next = attributeDeficits(after);
  const requirementsMet = Object.entries(next).every(([slot, gap]) => ['strength', 'dexterity'].every(a =>
    gap[a] <= (strictSlots.includes(slot) ? 0 : old[slot]?.[a] || 0)));
  const noneNegative = ATTRIBUTES.every((a) => {
    const now = after.attributes[a].total, was = before.attributes[a].total;
    return now >= 0 || now >= was;
  });
  return requirementsMet && noneNegative;
}
