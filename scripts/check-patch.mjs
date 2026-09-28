// Checks that every data file taken from the game files comes from the same patch, so a
// partial re-extract can't leave, say, 2.14.4 cube recipes next to 2.14.5 skills.
//
//   node scripts/check-patch.mjs        exit 1 and list the files if patches differ
//
// The patch the app claims is src/data/sources.json gameFiles.patch (shown in the sidebar).
// Every JSON file in src/data/ and public/planner/ that records a patch, at the top level
// or in a section (game.patch, itemArt.patch, gameFiles.patch), must match it, as must
// the game extract in data/game/<patch>/ that the planner data is built from.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const SECTIONS = ["game", "itemArt", "gameFiles"];

function patchesIn(json) {
  const found = [];
  if (typeof json.patch === "string") found.push(["patch", json.patch]);
  for (const key of SECTIONS) if (typeof json[key]?.patch === "string") found.push([`${key}.patch`, json[key].patch]);
  return found;
}

export function patchReport() {
  const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const expected = read("src/data/sources.json").gameFiles?.patch;
  const files = [];
  for (const dir of ["src/data/", "public/planner/"]) {
    for (const name of readdirSync(new URL(dir, root)).filter((n) => n.endsWith(".json")).sort()) {
      for (const [field, patch] of patchesIn(read(dir + name))) files.push({ file: dir + name, field, patch });
    }
  }
  const extract = `data/game/${expected}/`;
  const extractFound = !!expected && existsSync(new URL(extract, root));
  if (extractFound) {
    for (const name of readdirSync(new URL(extract, root)).filter((n) => n.endsWith(".json")).sort()) {
      for (const [field, patch] of patchesIn(read(extract + name))) files.push({ file: extract + name, field, patch });
    }
  }
  const mismatched = files.filter((f) => f.patch !== expected);
  return { expected, files, extractFound, mismatched, ok: !!expected && extractFound && !mismatched.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = patchReport();
  if (!r.expected) console.error("src/data/sources.json has no gameFiles.patch");
  else if (!r.extractFound) console.error(`No game extract for ${r.expected} in data/game/`);
  for (const f of r.mismatched) console.error(`${f.file} (${f.field}) is from ${f.patch}, expected ${r.expected}`);
  if (!r.ok) process.exit(1);
  console.log(`All ${r.files.length} patch-stamped data files are from ${r.expected}.`);
}
