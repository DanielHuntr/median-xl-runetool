// Hard consistency audit for published preset builds and levelling stages.
//
//   node scripts/audit-preset-consistency.mjs
//   node scripts/audit-preset-consistency.mjs --only=barbarian-warmonger
//
// This catches legality problems the score optimizer must never override: equipped gear
// must be wearable, active/slotted skills must satisfy their weapon restrictions, and an
// attack build's profiled weapon need must match the equipped weapon.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const only = args.only ? new Set(String(args.only).split(",").filter(Boolean)) : null;

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const data = await load("/src/data/index.js");
  const { createEngine } = await load("/src/planner/engine.js");
  const { createCatalog } = await load("/src/planner/items.js");
  const { computeCharacter } = await load("/src/planner/character.js");
  const { buildProfile, weaponNeed } = await load("/src/planner/recommend.js");
  const { wearableBothSets } = await load("/src/planner/attributeAllocation.js");

  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const presets = JSON.parse(await readFile("src/data/preset-builds.json", "utf8")).presets
    .filter((p) => !only || only.has(p.id));
  const stages = JSON.parse(await readFile("src/data/preset-stages.json", "utf8").catch(() => '{"stages":{}}')).stages || {};
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const env = { engine, catalog, planner };

  const rows = [];
  for (const preset of presets) {
    rows.push({ preset, label: "endgame", build: preset.build });
    for (const stage of stages[preset.id] || [])
      if (stage.build) rows.push({ preset, label: `level ${stage.level}`, build: stage.build });
  }

  const equippedWeapon = (build) => catalog.resolve(build.gear?.[build.swap ? "weapon2" : "weapon"], build.level);
  const weaponProblem = (build, id) => {
    const need = weaponNeed(engine.skill(id)?.restriction || []);
    const weapon = equippedWeapon(build);
    return need && weapon && !need.fits(weapon.def.cat || "")
      ? `${engine.skillName(id)} requires ${need.label}, weapon is ${weapon.def.name} (${weapon.def.cat})`
      : null;
  };

  const issues = [];
  const add = (row, message) => issues.push({ id: row.preset.id, name: row.preset.name, label: row.label, message });
  for (const row of rows) {
    const build = row.build;
    if (!wearableBothSets(build, env)) add(row, "gear cannot be worn with allocated attributes");
    const character = computeCharacter(build, env);
    for (const issue of character.issues || []) add(row, issue.text || issue.message || JSON.stringify(issue));
    for (const id of [build.leftSkill, build.rightSkill, ...(build.skillBar || []), ...(build.buffs || [])].filter(Boolean)) {
      const message = weaponProblem(build, id);
      if (message) add(row, message);
    }
    const profile = buildProfile(build, engine);
    const need = profile.weapons?.[0];
    const weapon = equippedWeapon(build);
    if ((profile.roles.attack || 0) > 0.3 && need && weapon && !need.fits(weapon.def.cat || ""))
      add(row, `profile needs ${need.label}, weapon is ${weapon.def.name} (${weapon.def.cat})`);
  }

  issues.sort((a, b) => a.id.localeCompare(b.id) || a.label.localeCompare(b.label) || a.message.localeCompare(b.message));
  console.log(`${rows.length} builds/stages checked; ${issues.length} hard issue${issues.length === 1 ? "" : "s"}`);
  for (const issue of issues)
    console.log(`- ${issue.name} (${issue.id}, ${issue.label}): ${issue.message}`);
  if (issues.length) process.exitCode = 1;
} finally {
  await vite.close();
}
