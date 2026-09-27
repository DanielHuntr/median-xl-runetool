// Rounded damage can stay flat across several levels. Start with the usual
// reduction, then look further only while damage is equal. An increase is a
// failure, and a skill flat all the way to one point still fails validation.
export function probePointScaling(points, base, damageAt) {
  let fewer = Math.max(1, points - Math.max(3, Math.ceil(points * 0.2)));
  let damage = damageAt(fewer);
  while (damage === base && fewer > 1) damage = damageAt(--fewer);
  return { fewer, damage, scales: damage < base };
}
