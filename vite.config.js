import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import catalog from "./api/catalog.js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Serves /api/catalog locally with the same handler Vercel deploys.
const catalogApi = {
  name: "catalog-api",
  configureServer(server) {
    server.middlewares.use("/api/catalog", catalog);
  },
  configurePreviewServer(server) {
    server.middlewares.use("/api/catalog", catalog);
  },
};

// __BUILD_ID__ versions the planner files that keep fixed names (data.json, item-art.json,
// the class and MedianDB WebP art, the class portraits) so they can be cached for a year: it is a hash of their
// contents, so it only changes when they do. Sprite sheets and bundles carry their own hash.
function plannerFilesHash() {
  const dir = new URL("./public/planner/", import.meta.url);
  const hash = createHash("sha1");
  const add = (sub) => {
    if (!existsSync(new URL(sub, dir))) return;
    for (const f of readdirSync(new URL(sub, dir)).sort())
      if (/\.(json|webp|gif|png)$/.test(f)) hash.update(f).update(readFileSync(new URL(sub + f, dir)));
  };
  add("");
  add("items/");
  add("portraits/");
  return hash.digest("hex").slice(0, 10);
}

// __APP_VERSION__ goes into bug reports.
export default defineConfig({
  plugins: [vue(), catalogApi],
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(plannerFilesHash()) },
});
