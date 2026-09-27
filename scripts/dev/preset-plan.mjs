// Dev check: node scripts/dev/preset-plan.mjs — the per-tree preset plan without generating.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const data = await load("/src/data/index.js");
  const { createEngine } = await load("/src/planner/engine.js");
  const { createCatalog } = await load("/src/planner/items.js");
  const { computeCharacter } = await load("/src/planner/character.js");
  const { skillDamage } = await load("/src/planner/damage.js");
  const { againstTarget, typicalTarget } = await load("/src/planner/target.js");
  const R = await load("/src/planner/recommend.js");
  const { planTrees } = await import("../lib/preset-plan.mjs");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const gameIds = new Map(Object.entries(planner.skills).filter(([, s]) => s.game).map(([id, s]) => [s.game.gameId, id]));
  const refsOf = (id) => { const out = new Set(); const s = engine.skill(id);
    for (const row of s.constants || []) for (const raw of row.values) for (const m of raw.matchAll(/\[\[([\w-]+)\]\]/g)) out.add(m[1]);
    for (const m of JSON.stringify(s.game || {}).matchAll(/skill\((\d+)\)/g)) if (gameIds.has(+m[1])) out.add(gameIds.get(+m[1]));
    out.delete(id); return [...out]; };
  const target = typicalTarget(planner.monsters, "Hell");
  const damage = (b, id) => { const c = computeCharacter(b, { engine, catalog, planner });
    const d = skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c });
    const vs = d && againstTarget(d, c, target, "Hell"); return { d, raw: d?.all?.[1] ?? d?.total?.[1] ?? 0, vs: vs?.all?.[1] ?? vs?.total?.[1] ?? 0 }; };
  const recommend = (b, slot) => { const c = computeCharacter(b, { engine, catalog, planner }); const profile = R.buildProfile(b, engine);
    return R.recommendForSlot(slot, { build: b, engine, catalog, planner, character: c, profile, want: R.wantedStats(profile, c), allocateAttributes: false }, 1)[0]; };
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("scripts/build-presets.mjs", "utf8");
  const handPicked = [...src.matchAll(/\{ id: "([^"]+)", cls: "(\w+)", name: "[^"]+", main: "(\w+)"/g)].map(([, id, cls, main]) => ({ id, cls, main }));
  const t0 = Date.now();
  const { plan, skipped } = planTrees({ engine, catalog, planner, computeCharacter, damage, refsOf, recommend, handPicked });
  for (const d of plan) console.log(`${d.cls.padEnd(12)} ${d.tree.padEnd(13)} ${d.auto ? "auto" : "hand"} main ${d.main}${d.right ? ", right " + d.right : ""}${d.summoner ? " (summoner)" : ""}${d.ranked ? "  [" + d.ranked.join(" | ") + "]" : ""}`);
  console.log(`\n${plan.length} trees planned in ${((Date.now() - t0) / 1000).toFixed(0)}s; skipped ${skipped.length}:`);
  for (const s of skipped) console.log("  " + s);
} finally { await vite.close(); }
