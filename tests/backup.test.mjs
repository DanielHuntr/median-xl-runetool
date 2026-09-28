import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBackup, restoreBackup, summarise } from "../src/backup.js";

function memory(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: () => Object.fromEntries(m),
  };
}
const build = (id, name) => ({ id, name, code: "AAAAAAAAAA", cls: "Amazon" });

test("a backup holds only this app's keys", () => {
  const s = memory({ "mxlrw2:theme": '"hell"', "mxlrw2:saved-builds": JSON.stringify([build("a", "One")]), "other:x": "1", "mxlrw2:broken": "{" });
  const b = makeBackup(s, new Date("2026-09-28T00:00:00Z"));
  assert.equal(b.version, 2);
  assert.deepEqual(Object.keys(b.data).sort(), ["saved-builds", "theme"]);
  assert.deepEqual(summarise(b.data), { builds: 1, filters: 0, settings: 1 });
});

test("restoring merges builds and filters, and replaces settings", () => {
  const s = memory({ "mxlrw2:theme": '"classic"', "mxlrw2:saved-builds": JSON.stringify([build("a", "One")]) });
  const file = JSON.stringify({ format: "median-xl-runetool", version: 2, data: {
    theme: "hell",
    "saved-builds": [build("a", "Changed"), build("b", "one"), build("c", "Two")],
    "loot-filters": [{ id: "f1", filter: {} }],
  } });
  const r = restoreBackup(file, s);
  assert.equal(r.ok, true);
  assert.deepEqual(r.added, { builds: 1, filters: 1 });
  assert.deepEqual(r.skipped, { builds: 2, filters: 0 }); // same id; same name in another case
  const saved = JSON.parse(s.getItem("mxlrw2:saved-builds"));
  assert.deepEqual(saved.map((b) => b.name), ["One", "Two"]);
  assert.equal(s.getItem("mxlrw2:theme"), '"hell"');
});

test("restoring the same backup twice adds nothing the second time", () => {
  const s = memory();
  const file = JSON.stringify(makeBackup(memory({ "mxlrw2:saved-builds": JSON.stringify([build("a", "One")]) })));
  assert.equal(restoreBackup(file, s).added.builds, 1);
  assert.equal(restoreBackup(file, s).added.builds, 0);
});

test("version 1 backups from the console script still restore", () => {
  const s = memory();
  const r = restoreBackup(JSON.stringify({ format: "median-xl-runetool", version: 1, data: { stars: ["Enigma"], planner: null } }), s);
  assert.equal(r.ok, true);
  assert.equal(r.settings, 1);
  assert.equal(s.getItem("mxlrw2:planner"), null);
});

test("files that aren't backups are refused without touching storage", () => {
  const s = memory({ "mxlrw2:theme": '"classic"' });
  for (const text of ["nope", "{}", JSON.stringify({ format: "median-xl-runetool", version: 9, data: {} }),
    JSON.stringify({ format: "median-xl-runetool", version: 2, data: { "saved-builds": "x" } })]) {
    assert.equal(restoreBackup(text, s).ok, false, text);
  }
  assert.deepEqual(s.dump(), { "mxlrw2:theme": '"classic"' });
});

test("keys outside the app's naming are ignored", () => {
  const s = memory();
  restoreBackup(JSON.stringify({ format: "median-xl-runetool", version: 2, data: { "../x": 1, "Bad Key": 2, ok: 3 } }), s);
  assert.deepEqual(Object.keys(s.dump()), ["mxlrw2:ok"]);
});
