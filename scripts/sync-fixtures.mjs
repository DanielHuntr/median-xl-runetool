// Copies the in-game tooltip fixtures (data/game/<patch>/fixtures.json) into the planner's
// data (public/planner/data.json), as import-skills does, without re-importing everything.
// Run after adding fixtures: the planner marks lines as verified and Help confirm values
// counts what's confirmed from this copy. tests/data-patch.test.mjs checks the two match.
import { readFile, writeFile } from "node:fs/promises";

const file = "public/planner/data.json";
const data = JSON.parse(await readFile(file, "utf8"));
const patch = data.game?.patch;
if (!patch) throw new Error("public/planner/data.json has no game files merged");
const { fixtures } = JSON.parse(await readFile(`data/game/${patch}/fixtures.json`, "utf8"));
const before = (data.fixtures || []).length;
data.fixtures = fixtures;
await writeFile(file, JSON.stringify(data));
console.log(`sync-fixtures: ${fixtures.length} fixtures in ${file} (was ${before})`);
