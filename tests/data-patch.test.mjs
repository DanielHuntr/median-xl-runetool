import { test } from "node:test";
import assert from "node:assert/strict";
import { patchReport } from "../scripts/check-patch.mjs";

test("every data file from the game files is from the same patch", () => {
  const r = patchReport();
  assert.ok(r.expected, "sources.json names a patch");
  assert.ok(r.extractFound, `data/game/${r.expected}/ exists`);
  assert.ok(r.files.length >= 8, "the check finds the patch-stamped files");
  assert.deepEqual(r.mismatched.map((f) => `${f.file} ${f.field}=${f.patch}`), []);
});

test("the planner's data has every in-game fixture (npm run sync-fixtures after adding one)", async () => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(new URL("../public/planner/data.json", import.meta.url), "utf8"));
  const { fixtures } = JSON.parse(await readFile(new URL(`../data/game/${data.game.patch}/fixtures.json`, import.meta.url), "utf8"));
  assert.deepEqual((data.fixtures || []).map((f) => f.id), fixtures.map((f) => f.id));
  assert.deepEqual(data.fixtures, fixtures);
});
