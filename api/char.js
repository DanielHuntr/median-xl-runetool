// GET /api/char?name=N — a character's public NotArmory page on median-xl.com, cut down to the
// parts the planner's importer reads (lib/char-page.mjs): no account name, nothing else. The
// browser can't fetch median-xl.com itself (the site's Content-Security-Policy allows only our
// own server). Deployed as a Vercel function; vite.config.js mounts the same handler for
// `npm run dev` and `npm run preview`.
//
// Cached for five minutes: median-xl.com shows logged-out visitors its cached copy of a
// character anyway, so a fresher one isn't to be had.
import { CHAR_SITE, CHAR_NAME, trimCharPage } from "../lib/char-page.mjs";

const MEMORY_TTL = 5 * 60 * 1000;
const memo = new Map();

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  const name = new URL(req.url, "http://localhost").searchParams.get("name") || "";
  if (!CHAR_NAME.test(name)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "That isn't a character name." }));
  }
  const key = name.toLowerCase();
  try {
    let hit = memo.get(key);
    if (!hit || Date.now() - hit.at > MEMORY_TTL) {
      const r = await fetch(`${CHAR_SITE}${encodeURIComponent(name)}`, { headers: { "user-agent": "median-xl-runetool (+https://github.com/DanielHuntr/median-xl-runetool)" } });
      if (r.status === 404) hit = { at: Date.now(), status: 404, body: JSON.stringify({ error: `No character called ${name} on median-xl.com. Check the spelling: single-player characters aren't there.` }) };
      else if (!r.ok) throw new Error(`median-xl.com answered ${r.status}`);
      else {
        const page = trimCharPage(await r.text());
        hit = page
          ? { at: Date.now(), status: 200, body: JSON.stringify({ name, page }) }
          : { at: Date.now(), status: 404, body: JSON.stringify({ error: `median-xl.com's page for ${name} has no character on it.` }) };
      }
      if (memo.size > 200) memo.clear();
      memo.set(key, hit);
    }
    res.statusCode = hit.status;
    res.setHeader("cache-control", hit.status === 200 ? "public, max-age=300, s-maxage=300" : "public, max-age=60, s-maxage=60");
    res.end(req.method === "HEAD" ? undefined : hit.body);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}
