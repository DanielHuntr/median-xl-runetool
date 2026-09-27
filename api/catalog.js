// GET /api/catalog — the four docs-backed catalogues parsed live from
// docs.median-xl.com. Deployed as a Vercel function; vite.config.js mounts the
// same handler for `npm run dev` and `npm run preview`.
//
// Vercel's CDN caches a good response for an hour and serves the stale copy for
// up to a day while it refreshes, so the docs site sees at most about one request
// per hour. Browsers keep it for an hour too, so a returning visitor doesn't ask again. A failed or incomplete parse returns 502 and is never cached, and
// the app keeps its bundled data.
import { loadCatalog } from "../lib/docs-catalog.mjs";

const MEMORY_TTL = 10 * 60 * 1000;
let memo = null;

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  try {
    if (!memo || Date.now() - memo.at > MEMORY_TTL)
      memo = { at: Date.now(), body: JSON.stringify(await loadCatalog()) };
    res.statusCode = 200;
    res.setHeader(
      "cache-control",
      "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    );
    res.end(req.method === "HEAD" ? undefined : memo.body);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}
