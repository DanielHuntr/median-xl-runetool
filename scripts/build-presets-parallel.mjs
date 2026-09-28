// Builds the starter builds on several cores at once: N copies of build-presets.mjs, each
// building every Nth preset (SHARD=k/N) into its own progress file; their progress is then
// merged and build-presets.mjs publishes as usual (RESUME=1 finds every preset done, so the
// publish step and its checks run on the complete set).
//
//   npm run presets [-- N]               (default: half the logical cores, at most 8)
//   STAGES_ONLY=1 npm run presets        levelling stages only, keeping the endgame builds
//
// Each shard's output goes to .preset-shard-k.log; a shard that stops can be run again (the
// progress files keep what it finished).
import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("build-presets.mjs", import.meta.url));
const n = Math.max(1, parseInt(process.argv[2], 10) || Math.min(8, Math.floor(cpus().length / 2)));
const stagesOnly = !!process.env.STAGES_ONLY;
const merged = stagesOnly ? ".preset-stages-progress.json" : ".preset-progress.json";
const shardFile = (k) => `.preset-shard-${k}${stagesOnly ? "-stages" : ""}.json`;
const t0 = Date.now();

console.log(`Building starter builds in ${n} processes${stagesOnly ? " (levelling stages only)" : ""}…`);
const codes = await Promise.all(
  Array.from({ length: n }, (_, k) => new Promise((resolve) => {
    const log = openSync(`.preset-shard-${k}.log`, "w");
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, SHARD: `${k}/${n}`, PROGRESS_FILE: shardFile(k), RESUME: "1" },
      stdio: ["ignore", log, log],
    });
    child.on("exit", (code) => {
      closeSync(log);
      console.log(`  shard ${k + 1}/${n} finished (exit ${code}) after ${((Date.now() - t0) / 60000).toFixed(1)} min`);
      resolve(code);
    });
  })),
);

// Merge what every shard finished, then publish from the complete set.
let patch = null;
const done = {};
for (let k = 0; k < n; k++) {
  const p = JSON.parse(await readFile(shardFile(k), "utf8").catch(() => "{}"));
  if (patch && p.patch && p.patch !== patch) throw new Error(`shard ${k} is from patch ${p.patch}, others ${patch}`);
  patch ??= p.patch;
  Object.assign(done, p.done || {});
}
await writeFile(merged, JSON.stringify({ patch, done }));
console.log(`${Object.keys(done).length} presets built${codes.some((c) => c) ? " (some shards reported problems; see .preset-shard-*.log)" : ""}; publishing…`);
const publish = spawn(process.execPath, [script], { env: { ...process.env, RESUME: "1" }, stdio: "inherit" });
const code = await new Promise((resolve) => publish.on("exit", resolve));
if (code === 0) for (let k = 0; k < n; k++) await rm(shardFile(k), { force: true });
console.log(`Done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
process.exitCode = code;
