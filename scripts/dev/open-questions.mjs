// Dev check: node scripts/dev/open-questions.mjs — the questions on the Help confirm values page.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { openQuestions } = await vite.ssrLoadModule("/src/planner/confirmGaps.js");
  const data = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  for (const q of openQuestions(createEngine(data), data)) console.log(`${q.id}\n  ${q.question}\n  ${q.detail}`);
} finally { await vite.close(); }
