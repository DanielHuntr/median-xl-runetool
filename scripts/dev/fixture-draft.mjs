// Turns a "Confirm a skill's values" report (.github/ISSUE_TEMPLATE/confirm_values.yml) into a
// fixture draft for data/game/<patch>/fixtures.json, filled with what the planner shows now.
// Correct every line that differs from the screenshot, then add it to fixtures.json: the test
// "every in-game fixture reproduces" (tests/skill-accuracy.test.mjs) then holds the planner
// to the game's values from then on.
//
//   gh issue view 12 --json body -q .body | node scripts/dev/fixture-draft.mjs - 12
//   node scripts/dev/fixture-draft.mjs issue-body.md [issue number]
//   node scripts/dev/fixture-draft.mjs --skill "Mind Flay" --class Paladin --level 3 --points 2 [--bonus 0]
import { readFileSync } from "node:fs";
import { createEngine } from "../../src/planner/engine.js";

const data = JSON.parse(readFileSync(new URL("../../public/planner/data.json", import.meta.url), "utf8"));
const engine = createEngine(data);
const args = process.argv.slice(2);

// The issue form's answers, under "### <label>" headings.
function fromIssue(text) {
  const field = (label) => {
    const m = new RegExp(`###\\s*${label}[^\\n]*\\n+([^#]*)`, "i").exec(text);
    const v = m?.[1].trim();
    return v && v !== "_No response_" ? v : null;
  };
  return { skill: field("Skill"), cls: field("Class"), level: field("Character level"), points: field("Hard points"), bonus: field("\\+ skill levels") };
}
function fromFlags() {
  const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
  return { skill: flag("skill"), cls: flag("class"), level: flag("level"), points: flag("points"), bonus: flag("bonus") };
}
const report = args[0]?.startsWith("--") ? fromFlags() : fromIssue(readFileSync(args[0] === "-" || !args[0] ? 0 : args[0], "utf8"));
const issue = args[0]?.startsWith("--") ? null : args[1] || null;

const num = (v, what) => {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  if (!Number.isInteger(n)) throw new Error(`The report has no ${what} (got ${JSON.stringify(v)})`);
  return n;
};
const want = String(report.skill || "").trim().toLowerCase();
const matches = engine.skillIds().filter((id) => engine.skill(id).name.toLowerCase() === want && (!report.cls || /any/i.test(report.cls) || engine.skill(id).class.toLowerCase() === report.cls.trim().toLowerCase()));
if (matches.length !== 1) throw new Error(`"${report.skill}" (${report.cls}) matches ${matches.length} skills: ${matches.join(", ") || "none"}`);
const id = matches[0], s = engine.skill(id);
const ulvl = num(report.level, "character level"), blvl = num(report.points, "hard points"), bonus = report.bonus ? num(report.bonus, "bonus") : 0;
const lvl = blvl + bonus;

// Attributes as a character with none spent (the class's start, charstats.bin): what the
// synergies read. If the player had spent points, set them from the screenshot's lines.
const start = data.classes.find((c) => c.name === s.class) || {};
const charStats = Object.fromEntries(["strength", "dexterity", "vitality", "energy"].map((k) => [k, start[k]]));
const build = (b, l) => ({ cls: s.class, level: ulvl, points: { [id]: b }, soft: { [id]: l - b }, quests: {}, charStats });
const lines = (b, l) => engine.describe(build(b, l), id, b).effect.map((x) => x.text);
const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const draft = {
  id: `${slug}-level-${lvl}-char-${ulvl}`,
  skill: id,
  source: `In-game ${s.name} tooltip screenshot${issue ? ` in GitHub issue #${issue}` : ""}, ${new Date().toISOString().slice(0, 10)} (Median XL ${data.game?.patch || "?"})`,
  inputs: {
    lvl: { value: lvl, how: "shown: Current Skill Level — CHECK the screenshot" },
    blvl: { value: blvl, how: `stated: ${blvl} hard point${blvl === 1 ? "" : "s"}` },
    ulvl: { value: ulvl, how: `stated: character level ${ulvl}` },
    charStats: { value: charStats, how: `assumed: no attributes spent, so the ${s.class}'s starting attributes — CHECK against any attribute synergy line` },
    conditions: { value: {}, how: bonus ? `stated: +${bonus} levels from gear or skills` : "stated: no gear or other skills adding levels" },
  },
  nextLevel: { blvl: 0, lvl: 1, how: "level + 1 with Base Level unchanged — CHECK against the Next Level block" },
  observed: { current: {} },
  otherLines: lines(blvl, lvl),
  nextLines: lines(blvl, lvl + 1),
  synergyText: engine.synergies(build(blvl, lvl), id, blvl).lines.map((l) => l.text),
  independentChecks: [],
};
console.log(JSON.stringify(draft, null, 1));
console.error(`\nDraft for ${s.name} (${s.class}), level ${lvl}, character level ${ulvl}: the lines are the planner's.
Compare each with the screenshot and correct any that differ; a difference the planner
can't match yet goes under "knownDifferences" with the game's and the planner's text.`);
