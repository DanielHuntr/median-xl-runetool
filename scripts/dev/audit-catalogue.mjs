// Dev check: the catalogue (copied from docs.median-xl.com) against the game's own tables
// (scripts/lib/catalogue-audit.mjs).
//   node scripts/dev/audit-catalogue.mjs [out.json]
import { writeFileSync } from "node:fs";
import { auditCatalogue } from "../lib/catalogue-audit.mjs";

const a = auditCatalogue();
console.log(Object.entries(a.tally).map(([k, t]) => `${k}: ${t.items} checked, ${t.same} the same, ${t.differ} differ, ${t.missing} not found in the game`).join("\n"));
const out = process.argv[2];
if (out) { writeFileSync(out, JSON.stringify(a, null, 1)); console.log(`details: ${out}`); }
