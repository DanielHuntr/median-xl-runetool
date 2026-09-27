// Dev check: node scripts/dev/preset-report.mjs — each preset's survivability and basics:
// resistances against their caps (Hell), physical resist, life, attack rating, masteries.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner), catalog = createCatalog(data, planner);
  for (const p of JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets) {
    const b = p.build, c = computeCharacter(b, { engine, catalog, planner });
    const res = ["fire", "cold", "lightning", "poison"].map((e) => `${e[0].toUpperCase()}${c.resist[e].value ?? c.resist[e].total}/${c.resist[e].max ?? c.resist[e].cap}`).join(" ");
    const mastery = Object.entries(b.points).filter(([id]) => engine.skill(id)?.tabName === "Mastery").map(([id, n]) => `${engine.skillName(id)} ${n}`);
    console.log(`${p.name.padEnd(18)} life ${String(c.life.total).padStart(6)} | ${res} | phys ${c.resist.physical?.value ?? c.resist.physical?.total ?? "?"} | AR ${c.ar.total} | attrs ${JSON.stringify(b.attrs)} | mastery: ${mastery.join(", ") || "none"}`);
  }
} finally { await vite.close(); }
