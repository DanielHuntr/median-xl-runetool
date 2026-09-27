// Regenerates the sets, sacred uniques, socketables and base items catalogues
// in src/data/ from the official Median XL documentation.
//
//   node scripts/import-docs.mjs               fetch the live pages; fail on error
//   node scripts/import-docs.mjs --fallback    on error keep the existing files (used by prebuild)
//   node scripts/import-docs.mjs <dir>         read <page>.html files saved in <dir>
//
// Nothing is written unless all four pages parse and pass validate().
import { readFile, writeFile } from "node:fs/promises";
import { loadCatalog, fetchPage } from "../lib/docs-catalog.mjs";

const OUT = new URL("../src/data/", import.meta.url);
const args = process.argv.slice(2);
const fallback = args.includes("--fallback");
const cacheDir = args.find((a) => !a.startsWith("--"));
const readJson = async (file, d) => {
  try {
    return JSON.parse(await readFile(new URL(file, OUT), "utf8"));
  } catch {
    return d;
  }
};
const write = (file, data) =>
  writeFile(new URL(file, OUT), JSON.stringify(data, null, 2) + "\n");

try {
  const catalog = await loadCatalog(
    cacheDir ? (p) => readFile(`${cacheDir}/${p}.html`, "utf8") : fetchPage,
  );

  // Embed gem artwork so the app works offline. Runes reuse rune-images.json,
  // and gems already embedded are kept rather than downloaded again.
  const runeImages = await readJson("rune-images.json", {});
  const oldImages = await readJson("socketable-images.json", {});
  const images = {};
  for (const s of catalog.socketables) {
    const [key, url] = s.slice(6);
    if (runeImages[key]) continue;
    if (oldImages[key]) images[key] = oldImages[key];
    else if (url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const type = res.headers.get("content-type") || "image/jpeg";
      images[key] = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    }
  }

  await write("base-items.json", catalog.baseItems);
  await write("sacred-uniques.json", catalog.sacredUniques);
  await write("sets.json", catalog.sets);
  await write("socketables.json", catalog.socketables);
  await write("socketable-images.json", images);
  await write("catalog-meta.json", {
    fetchedAt: catalog.fetchedAt,
    source: catalog.source,
    counts: catalog.counts,
  });
  const c = catalog.counts;
  console.log(
    `import-docs: base items ${c.baseItems}, sacred uniques ${c.sacredUniques}, sets ${c.sets} (${c.setItems} items), socketables ${c.socketables}`,
  );
} catch (err) {
  if (!fallback) throw err;
  const meta = await readJson("catalog-meta.json", {});
  console.warn(
    `import-docs: refresh failed (${err.message}). Keeping the bundled catalogue from ${meta.fetchedAt || "the last import"}.`,
  );
}
