import { readFile, writeFile } from "node:fs/promises";

const THREAD = "https://forum.median-xl.com/viewtopic.php?t=75830";
const OUT = new URL("../src/data/oskill-index-sources.json", import.meta.url);

function decode(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function textOf(html) {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n"))
    .replace(/\s+/g, " ")
    .toLowerCase();
}
function names() {
  const out = new Set();
  const load = async (file) => JSON.parse(await readFile(new URL(`../src/data/${file}`, import.meta.url), "utf8"));
  return Promise.all([load("runewords.json"), load("uniques.json"), load("sacred-uniques.json"), load("sets.json")]).then(([rw, tu, su, sets]) => {
    for (const [name] of rw) out.add(name);
    for (const [name] of tu) out.add(name);
    for (const [name] of su) out.add(name);
    for (const [name, , , , items] of sets) {
      out.add(name);
      for (const [item] of items) out.add(item);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
  });
}
function mentioned(text, name) {
  const needle = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`, "i").test(text);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function get(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { "user-agent": "median-xl-runetool data importer" } });
    if (res.ok) return res.text();
    if (res.status !== 429 || i === 3) throw new Error(`${res.status} ${url}`);
    await sleep(1500 * (i + 1));
  }
}

const pages = [];
for (let start = 0; start <= 100; start += 10) {
  const url = start ? `${THREAD}&start=${start}` : THREAD;
  pages.push(await get(url));
  await sleep(350);
}
const threadText = textOf(pages.join("\n"));
const sources = (await names()).filter((name) => mentioned(threadText, name));
if (/\bSoulbinder Gloves\b/i.test(threadText) && !sources.includes("Soulbinder Gloves"))
  sources.push("Soulbinder Gloves");
sources.sort((a, b) => a.localeCompare(b));
await writeFile(OUT, JSON.stringify({ source: THREAD, fetchedAt: new Date().toISOString(), sources }, null, 2) + "\n");
console.log(`${sources.length} catalogue source names found in Oskill Index`);
