// Dev check: node scripts/dev/upgrade-scaling.mjs — every Upgrade skill ("[[skill]]" heading)
// against the skill it names: that skill's damage with the upgrade at 0 and at its maximum,
// on a preset build of the class (for gear). Lists upgrades whose damage stats change nothing.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const DAMAGE_KEYS = /weapon_damage|physical_damage|deadly_strike|critical_strike|pierce|_damage$|damage_percent|bonus_maximum_damage|added_as|multiplier|power_per/;
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const { skillDamage } = await vite.ssrLoadModule("/src/planner/damage.js");
  const { againstTarget, typicalTarget } = await vite.ssrLoadModule("/src/planner/target.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const presets = JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets;
  const target = typicalTarget(planner.monsters, "Hell");
  const dmg = (b, id) => {
    const c = computeCharacter(b, { engine, catalog, planner });
    const d = skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
    const vs = d && againstTarget(d, c, target, "Hell");
    return [d?.all?.[1] ?? d?.total?.[1] ?? 0, vs?.all?.[1] ?? vs?.total?.[1] ?? 0, d];
  };
  for (const [up, s] of Object.entries(planner.skills)) {
    if (!s.tags.includes("Upgrade")) continue;
    const heads = (s.effect || []).map((e) => /^\[\[([\w-]+)\]\]$/.exec(e)?.[1]).filter(Boolean);
    const keys = (s.effect || []).flatMap((e) => [...e.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
    const dkeys = keys.filter((k) => DAMAGE_KEYS.test(k));
    if (!heads.length || !dkeys.length) continue;
    for (const x of heads) {
      const preset = presets.find((p) => p.cls === s.class) || presets[0];
      const base = { ...preset.build, points: { [x]: Math.min(20, engine.maxLevel(preset.build, x)) }, leftSkill: x, rightSkill: null, skillBar: [], buffs: [] };
      if (!engine.node(base, x) || !engine.node(base, up)) { console.log(`?? ${up} → ${x}: not in ${s.class} trees`); continue; }
      const on = { ...base, points: { ...base.points, [up]: Math.min(20, engine.maxLevel(base, up)) } };
      const [r0, v0, d0] = dmg(base, x), [r1, v1] = dmg(on, x);
      const mark = r1 > r0 || v1 > v0 ? "ok " : r0 === 0 ? "-- " : "NO ";
      console.log(`${mark}${s.class} ${s.name} → ${engine.skillName(x)} [${d0?.kind}] ${dkeys.join(",")}: ${r0}/${v0} → ${r1}/${v1}`);
    }
  }
} finally { await vite.close(); }
