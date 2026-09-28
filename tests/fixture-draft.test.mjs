import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/dev/fixture-draft.mjs", import.meta.url));
const { fixtures } = JSON.parse(readFileSync(new URL("../data/game/2.14.4/fixtures.json", import.meta.url), "utf8"));

test("a confirmation report becomes a fixture draft that matches a confirmed one", () => {
  // Issue #2's Mind Flay report, as the issue form writes it.
  const body = "### Skill\n\nMind Flay\n\n### Class\n\nPaladin\n\n### Character level\n\n3\n\n### Hard points in this skill\n\n2\n\n### + skill levels from gear, charms or other skills\n\n0\n\n### Anything else\n\n_No response_\n";
  const run = spawnSync(process.execPath, [script, "-", "2"], { input: body, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const draft = JSON.parse(run.stdout);
  const confirmed = fixtures.find((f) => f.id === "mind-flay-level-2");
  assert.equal(draft.skill, "mind_flay");
  assert.deepEqual([draft.inputs.lvl.value, draft.inputs.blvl.value, draft.inputs.ulvl.value], [2, 2, 3]);
  assert.match(draft.source, /issue #2/);
  for (const line of confirmed.otherLines) assert.ok(draft.otherLines.includes(line), line);
  for (const line of confirmed.nextLines) assert.ok(draft.nextLines.includes(line), line);
});

test("a report naming no known skill is refused", () => {
  const run = spawnSync(process.execPath, [script, "--skill", "Not A Skill", "--class", "Paladin", "--level", "3", "--points", "1"], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /matches 0 skills/);
});
