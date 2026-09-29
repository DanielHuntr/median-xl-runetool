// Copies the in-game tooltip fixtures (data/game/<patch>/fixtures.json) and the monsters into the planner's
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
// And the monsters (extract-monsters.mjs), as import-skills merges them.
const monsters = JSON.parse(await readFile(`data/game/${patch}/monsters.json`, "utf8"));
if (monsters.patch === patch) data.monsters = monsters.monsters;
await writeFile(file, JSON.stringify(data));
console.log(`sync-fixtures: ${fixtures.length} fixtures in ${file} (was ${before})`);
