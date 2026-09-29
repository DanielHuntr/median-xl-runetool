// Rates the published starter builds (src/data/preset-builds.json) and their levelling stages
// (preset-stages.json) without rebuilding them:
// npm run rate-presets. build-presets.mjs does the same when it publishes.
import { createServer } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { ratePresets, rateStages, ratingEnv } from "./lib/rate-presets.mjs";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const env = await ratingEnv(load, planner, await load("/src/data/index.js"));
  const file = "src/data/preset-builds.json";
  const doc = JSON.parse(await readFile(file, "utf8"));
  ratePresets(doc.presets, env);
  await writeFile(file, JSON.stringify(doc));
  // The levelling stages too: each among the others at the same stage, with its card.
  const stagesFile = "src/data/preset-stages.json";
  const guides = JSON.parse(await readFile(stagesFile, "utf8"));
  rateStages(doc.presets, guides.stages, env);
  await writeFile(stagesFile, JSON.stringify(guides));  const rows = doc.presets.map((p) => p.summary.rating).filter((r) => r.tier).sort((a, b) => a.rank - b.rank);
  for (const t of ["S", "A", "B", "C", "D", "F"]) {
    const names = doc.presets.filter((p) => p.summary.rating.tier === t).sort((a, b) => a.summary.rating.rank - b.summary.rating.rank);
    console.log(`${t}: ${names.map((p) => `${p.name} (${p.cls}) ${p.summary.rating.dps.toLocaleString()}/s ${p.summary.rating.ehp.toLocaleString()} ehp`).join("; ")}`);
  }
  const un = doc.presets.filter((p) => p.summary.rating.unrated);
  console.log(`${rows.length} rated, ${un.length} unrated: ${un.map((p) => p.name).join(", ")}`);
} finally {
  await vite.close();
}
