// Dev check: node scripts/dev/attr-probe.mjs <preset id> — what 100 more points in each
// attribute do to the slotted skills' damage and to the combat score attribute spending uses.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const { skillDamage } = await vite.ssrLoadModule("/src/planner/damage.js");
  const { combatScore } = await vite.ssrLoadModule("/src/planner/combatScore.js");
  const { buildProfile } = await vite.ssrLoadModule("/src/planner/recommend.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  const p = JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets.find((x) => x.id === process.argv[2]);
  const profile = buildProfile(p.build, engine);
  const look = (b) => {
    const c = computeCharacter(b, { engine, catalog, planner });
    const dmg = [b.leftSkill, b.rightSkill].filter(Boolean).map((id) => skillDamage(id, { engine, build: b, skillBuild: { ...b, soft: c.soft, charStats: c.charStats }, character: c })?.total?.[1] || 0);
    const cs = combatScore(b, c, engine, profile);
    return `damage ${dmg.join(" / ")} | score ${cs.score.toFixed(1)} (${Object.entries(cs).filter(([k, v]) => typeof v === "number" && k !== "score").map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}) | life ${c.life.total}`;
  };
  console.log("preset          ", look(p.build));
  for (const a of ["strength", "dexterity", "vitality", "energy"])
    console.log(`+100 ${a.padEnd(10)} `, look({ ...p.build, attrs: { ...p.build.attrs, [a]: p.build.attrs[a] + 100 } }));
} finally { await vite.close(); }
