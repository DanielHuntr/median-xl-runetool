// Re-extracts everything the app takes from the installed game, in dependency order, then
// checks that every data file is from the same patch (scripts/check-patch.mjs).
//
//   npm run extract [-- game dir]     (default: $MXL_DIR or C:/games/median-xl)
//
// Steps that fetch from the internet (MedianDB for the skill planner, the docs for unique
// mystic orbs) fail loudly rather than keep stale files, so a run is all one patch or
// stops. Starter builds (node scripts/build-presets.mjs) are not rebuilt here: they take hours, and
// the check flags them if they're from an older patch.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const STEPS = [
  // The game extract in data/game/<patch>/ that the planner data is built from.
  ["extract-game-data.mjs", dir],
  ["extract-monsters.mjs", dir],
  ["extract-item-art.mjs", dir],
  ["build-item-atlas.mjs"],
  ["import-skills.mjs"],
  // Straight into src/data/.
  ["import-orbs.mjs", dir],
  ["extract-filter-data.mjs", dir],
  ["extract-runeword-bases.mjs", dir],
  ["extract-superior.mjs", dir],
  ["extract-cube.mjs", dir],
  ["check-patch.mjs"],
];

for (const [script, ...args] of STEPS) {
  console.log(`\n▸ ${script}`);
  const run = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { stdio: "inherit" });
  if (run.status !== 0) {
    console.error(`\n${script} failed (exit ${run.status}); later steps were not run.`);
    process.exit(1);
  }
}
