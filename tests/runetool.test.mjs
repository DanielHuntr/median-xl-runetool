import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { createSSRApp, nextTick, effectScope } from "vue";
import { renderToString } from "@vue/server-renderer";

// Verify the real SFCs and shared state with Vite's module loader.
// This is a rendering/logic check, not a visual browser test.
test("catalogue, Vue components, filters, inventory, tiers and persistence", async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
  };
  globalThis.window = {
    location: { hash: "#runewords" },
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
  };
  globalThis.document = { documentElement: { dataset: {} } };
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  const scope = effectScope();
  try {
    const { createRunetool } = await vite.ssrLoadModule(
      "/src/composables/useRunetool.js",
    );
    const { default: App } = await vite.ssrLoadModule("/src/App.vue");
    const data = await vite.ssrLoadModule("/src/data/index.js");
    const state = scope.run(() => createRunetool());
    // 234 docs rows, of which Demhe, Anak and Gharaniq are listed twice: 231 runewords, each once.
    assert.equal(data.RW.length, 231);
    assert.equal(new Set(data.RW.map((r) => r.name + "|" + r.runes.join(" "))).size, data.RW.length, "no duplicate runewords");
    assert.equal(data.TUD.length, 255);
    assert(data.TUD.some((u) => u.cat === "Boots"));
    assert(data.TUD.some((u) => u.cat === "Amulets"));
    assert(data.TUD.some((u) => u.cat === "Body Armors"));
    for (const r of data.RW)
      for (const rune of r.runes)
        assert(data.RIMG[rune], `Missing artwork: ${rune}`);
    for (const u of data.TUD) {
      assert(u.t.length >= 1 && u.t.length <= 4, u.name);
      assert(
        u.t.every((t) => t.req === null || Number.isFinite(t.req)),
        `Invalid tier requirements: ${u.name}`,
      );
    }
    // At the default (highest) level every sacred unique shows, including those needing 125 or 130.
    assert.equal(state.sacredUniques.value.length, data.SUD.length, "all sacred uniques reachable");
    assert.ok(data.SUD.some((u) => u.req > 120), "the data has items above level 120");
    const html = await renderToString(createSSRApp(App));
    assert.equal((html.match(/class="rune-card"/g) || []).length, data.RW.length, "one card per runeword");
    assert(html.includes("Runeword Finder"));
    state.st.q = "Smoldering Edge";
    assert.equal(state.results.value.length, 1);
    const item = state.results.value[0];
    assert.equal(state.missing(item), 1);
    state.cycle("Tir");
    assert.equal(state.missing(item), 0);
    state.cycle("Tir");
    assert.equal(state.owned.value.Tir, 2);
    state.cycle("Tir");
    assert.equal(state.missing(item), 1);
    state.star(item.name);
    state.st.starOnly = true;
    assert.equal(state.results.value.length, 1);
    state.star(item.name);
    assert.equal(state.results.value.length, 0);
    state.reset();
    state.st.lvl = 20;
    assert(state.results.value.every((r) => r.lvl <= 20));
    state.st.q = "not-a-real-item";
    assert.equal(state.results.value.length, 0);
    state.reset();
    state.st.tags = ["All Skills"];
    assert(state.results.value.every((r) => r.tags.includes("All Skills")));
    state.reset();
    state.st.base = "@armor";
    assert(state.results.value.every((r) => r.slot === "armor"));
    state.reset();
    state.tuQuery.value = "Grim Fang";
    assert.equal(state.uniques.value.length, 1);
    const unique = state.uniques.value[0];
    state.st.lvl = 30;
    assert(state.tier(unique).req <= 30);
    state.tiers[unique.id] = 3;
    assert.equal(state.nextTier(unique), undefined);
    state.theme.value = "hc";
    state.cycle("Tir");
    state.star(item.name);
    await nextTick();
    assert.equal(JSON.parse(memory.get("mxlrw2:theme")), "hc");
    assert.equal(JSON.parse(memory.get("mxlrw2:owned")).Tir, 1);
    assert(JSON.parse(memory.get("mxlrw2:stars")).includes(item.name));
    assert.equal(document.documentElement.dataset.theme, "hc");
    state.theme.value = "hell";
    await nextTick();
    assert.equal(document.documentElement.dataset.theme, "hell");
    const { THEMES } = await vite.ssrLoadModule("/src/composables/useRunetool.js");
    const themeCss = await readFile(new URL("../src/assets/style.css", import.meta.url), "utf8");
    for (const [v] of THEMES.filter(([v]) => v !== "auto" && v !== "dark"))
      assert(themeCss.includes(`:root[data-theme="${v}"]`), `styles for the ${v} theme`);
    // A stored theme that no longer exists falls back to dark.
    memory.set("mxlrw2:theme", JSON.stringify("tristram"));
    assert.equal(scope.run(() => createRunetool()).theme.value, "dark");
    state.theme.value = "hc";
    await nextTick();
    window.location.hash = "#uniques";
    const uniqueHtml = await renderToString(createSSRApp(App));
    assert.equal((uniqueHtml.match(/class="unique-card"/g) || []).length, 255);
    assert(uniqueHtml.includes("No tier upgrades"));
    // Sacred uniques, sets, socketables and base items
    assert(data.SUD.length >= 400, "sacred uniques");
    assert(data.SETD.length >= 50, "sets");
    assert(data.SOCKD.length >= 100, "socketables");
    assert(data.BASED.length >= 200, "base items");
    for (const s of data.SETD) {
      assert(s.items.length >= 2 && s.bonuses.length >= 1, s.name);
      assert(s.items.every((i) => i.base && i.lines.length), s.name);
    }
    for (const s of data.SOCKD) {
      assert(data.RIMG[s.img], `Missing artwork: ${s.name}`);
      assert(s.slots.every((l) => l.length), s.name);
    }
    for (const b of data.BASED)
      assert.deepEqual(
        b.t.map((t) => t.label),
        ["Tier 1", "Tier 2", "Tier 3", "Tier 4", "Sacred"],
        b.name,
      );
    assert(data.SUD.every((u) => u.lines.length && u.cat), "sacred unique stats");
    state.st.lvl = 120;
    state.browse.sacred.q = "Xiphos";
    assert.equal(state.sacredUniques.value.length, 1);
    state.browse.sets.cls = "Amazon";
    assert(state.sets.value.length >= 5);
    assert(state.sets.value.every((s) => s.cls === "Amazon"));
    state.browse.sock.group = "Gems";
    assert(state.socketables.value.every((s) => s.group === "Gems"));
    state.browse.bases.q = "Short Sword";
    const sword = state.bases.value[0];
    assert.equal(sword.name, "Short Sword");
    state.st.lvl = 20;
    assert.equal(state.tier(sword).label, "Tier 3");
    state.browse.bases.tier = "Sacred";
    assert.equal(state.tier(sword).label, "Sacred");
    state.st.lvl = 120;
    await nextTick();
    for (const [hash, cls, min] of [
      ["#sacred-uniques", "unique-card", 1],
      ["#sets", "set-card", 1],
      ["#socketables", "sock-card", 1],
      ["#base-items", "unique-card", 1],
    ]) {
      window.location.hash = hash;
      const pageHtml = await renderToString(createSSRApp(App));
      assert(
        (pageHtml.match(new RegExp(`class="[^"]*\\b${cls}\\b`, "g")) || [])
          .length >= min,
        hash,
      );
    }
    const css = await readFile(
      new URL("../src/assets/style.css", import.meta.url),
      "utf8",
    );
    assert(css.includes("select option"));
  } finally {
    scope.stop();
    await vite.close();
  }
});
