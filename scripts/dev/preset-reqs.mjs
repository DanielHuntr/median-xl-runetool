// Dev check: node scripts/dev/preset-reqs.mjs [preset id…] — each preset's gear requirements
// against its Strength and Dexterity (base points and totals).
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
  const ids = process.argv.slice(2);
  for (const p of JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets.filter((x) => !ids.length || ids.includes(x.id))) {
    const c = computeCharacter(p.build, { engine, catalog, planner });
    const eq = Object.entries(c.equipped).map(([s, r]) => `${s}:${r.def.name}(${r.head.reqStr}/${r.head.reqDex})`);
    console.log(`${p.name}: str ${p.build.attrs.strength}→${c.attributes.strength.total}, dex ${p.build.attrs.dexterity}→${c.attributes.dexterity.total} | ${eq.join(" ")}`);
  }
} finally { await vite.close(); }
