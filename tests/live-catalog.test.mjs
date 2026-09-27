import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { effectScope } from "vue";
import handler from "../api/catalog.js";
import { validate, loadCatalog } from "../lib/docs-catalog.mjs";

function stubBrowser() {
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.window = {
    location: { hash: "#sets" },
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.document = { documentElement: { dataset: {} } };
}

test("app swaps in a live catalogue and falls back to the bundled one", async () => {
  stubBrowser();
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const scope = effectScope();
  const realFetch = globalThis.fetch;
  try {
    const { createRunetool } = await vite.ssrLoadModule("/src/composables/useRunetool.js");
    const data = await vite.ssrLoadModule("/src/data/index.js");
    const state = scope.run(() => createRunetool());
    assert.equal(state.dataStatus.source, "bundled");
    assert.equal(state.SETD.value.length, data.SETD.length);

    // Live response with one extra set and a new gem that has no bundled image.
    const live = structuredClone(data.BUNDLED);
    live.fetchedAt = "2026-10-01T12:00:00.000Z";
    live.sets.push(["Zzyzx Set", "Test", null, "Set Bonus with complete set:|+1 to Life", [
      ["Piece A", "Ring", "Required Level: 90|+1 to Life"],
      ["Piece B", "Amulet", "Required Level: 90|+1 to Life"],
    ]]);
    live.socketables.push(["New Gem", "Gems", 5, "+1 to Life", "+1 to Life", "+1 to Life", "gem:New Gem", "https://docs.median-xl.com/images/runes/new.jpg"]);
    globalThis.fetch = async () => new Response(JSON.stringify(live), { status: 200 });
    await state.loadLiveCatalog();
    assert.equal(state.dataStatus.source, "live");
    assert.equal(state.dataStatus.fetchedAt, live.fetchedAt);
    assert.equal(state.SETD.value.length, data.SETD.length + 1);
    state.browse.sets.q = "zzyzx set";
    assert.equal(state.sets.value.length, 1);
    const gem = state.SOCKD.value.at(-1);
    assert.equal(gem.url, "https://docs.median-xl.com/images/runes/new.jpg");

    // Endpoint failure keeps whatever data is showing and records the error.
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "docs down" }), { status: 502 });
    await state.loadLiveCatalog();
    assert.equal(state.dataStatus.source, "bundled");
    assert.equal(state.dataStatus.error, "docs down");

    // A 200 with missing catalogues is rejected.
    globalThis.fetch = async () => new Response(JSON.stringify({ sets: [] }), { status: 200 });
    await state.loadLiveCatalog();
    assert.match(state.dataStatus.error, /Incomplete/);
  } finally {
    globalThis.fetch = realFetch;
    scope.stop();
    await vite.close();
  }
});

test("docs parse is rejected when counts fall below the minimums", async () => {
  assert.throws(
    () => validate({ baseItems: [], sacredUniques: [], sets: [], socketables: [] }),
    /incomplete/,
  );
  // Pages that parse to nothing (e.g. a layout change) never produce a catalogue.
  await assert.rejects(loadCatalog(async () => "<html></html>"), /socketable tables|incomplete/);
});

test("/api/catalog returns 502 without caching when the docs are unreachable", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("down", { status: 503 });
  try {
    const headers = {};
    let body;
    const res = {
      statusCode: 0,
      setHeader: (k, v) => (headers[k.toLowerCase()] = v),
      end: (b) => (body = b),
    };
    await handler({ method: "GET" }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(headers["cache-control"], "no-store");
    assert.match(JSON.parse(body).error, /HTTP 503/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
