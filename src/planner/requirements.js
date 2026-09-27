// Suggestions must not create or worsen attribute shortages in retained equipment.
// Existing invalid builds can still be repaired one slot at a time.
export function attributeDeficits(character) {
  return Object.fromEntries(Object.entries(character.equipped).map(([slot, r]) => [slot, {
    strength: Math.max(0, r.head.reqStr - character.attributes.strength.total),
    dexterity: Math.max(0, r.head.reqDex - character.attributes.dexterity.total),
  }]));
}
export function attributesSafe(before, after, strictSlots = []) {
  const old = attributeDeficits(before), next = attributeDeficits(after);
  return Object.entries(next).every(([slot, gap]) => ['strength', 'dexterity'].every(a =>
    gap[a] <= (strictSlots.includes(slot) ? 0 : old[slot]?.[a] || 0)));
}
