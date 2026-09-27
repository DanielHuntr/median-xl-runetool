// GET /api/filters — the community loot filters on median-xl.com (the Filter Exchange list);
// GET /api/filters?id=N — one filter's rules. Deployed as a Vercel function; vite.config.js
// mounts the same handler for `npm run dev` and `npm run preview`.
//
// Cached like /api/catalog: an hour at the CDN and in the browser, served stale for up to a
// day while it refreshes, so the site sees at most about one request per page per hour.
import { FILTERS_SITE, parseFilterList, parseFilterPage } from "../lib/filters-site.mjs";

const MEMORY_TTL = 10 * 60 * 1000;
const memo = new Map();
async function fetchPage(query) {
  const res = await fetch(`${FILTERS_SITE}${query}`, { headers: { "user-agent": "median-xl-runetool (+https://github.com/DanielHuntr/median-xl-runetool)" } });
  if (!res.ok) throw new Error(`median-xl.com answered ${res.status}`);
  return res.text();
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  const idParam = new URL(req.url, "http://localhost").searchParams.get("id");
  if (idParam != null && !/^\d{1,7}$/.test(idParam)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "id must be a number" }));
  }
  const key = idParam ?? "list";
  try {
    let hit = memo.get(key);
    if (!hit || Date.now() - hit.at > MEMORY_TTL) {
      const body = idParam != null
        ? { id: Number(idParam), filter: parseFilterPage(await fetchPage(`?mode=view&id=${idParam}`)) }
        : { source: FILTERS_SITE, fetchedAt: new Date().toISOString(), filters: parseFilterList(await fetchPage("")) };
      hit = { at: Date.now(), body: JSON.stringify(body) };
      if (memo.size > 200) memo.clear();
      memo.set(key, hit);
    }
    res.statusCode = 200;
    res.setHeader("cache-control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
    res.end(req.method === "HEAD" ? undefined : hit.body);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}
