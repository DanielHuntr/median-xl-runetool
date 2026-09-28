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
