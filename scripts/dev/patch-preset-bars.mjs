// One-off: put the other active skills a preset has points in on its skill bar, as
// scripts/build-presets.mjs now does (issue #8: the Storm Amazon's Discharge), without
// regenerating every preset. Updates src/data/preset-builds.json in place.
//   node scripts/dev/patch-preset-bars.mjs
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { location: { hash: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const load = (p) => vite.ssrLoadModule(p);
const data = await load("/src/data/index.js");
const { createEngine } = await load("/src/planner/engine.js");
const { createCatalog } = await load("/src/planner/items.js");
const { computeCharacter } = await load("/src/planner/character.js");
const { skillDamage } = await load("/src/planner/damage.js");
const { againstTarget, typicalTarget } = await load("/src/planner/target.js");
const { isToggleSkill } = await load("/src/planner/skillEffects.js");
const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
const engine = createEngine(planner), catalog = createCatalog(data, planner);
const target = typicalTarget(planner.monsters, "Hell");
const file = new URL("../../src/data/preset-builds.json", import.meta.url);
const json = JSON.parse(await readFile(file, "utf8"));
let changed = 0;
for (const preset of json.presets) {
  const b = preset.build;
  const slotted = new Set([b.leftSkill, b.rightSkill, ...b.skillBar].filter(Boolean));
  const others = Object.keys(b.points)
    .filter((id) => b.points[id] > 1 && !slotted.has(id) && engine.node(b, id) && engine.skill(id).tags.length
      && !engine.skill(id).tags.some((t) => ["Passive", "Upgrade"].includes(t)) && !isToggleSkill(engine.skill(id)))
    .sort((x, y) => b.points[y] - b.points[x]);
  const add = others.slice(0, Math.max(0, 8 - b.skillBar.length));
  if (!add.length) continue;
  b.skillBar = [...b.skillBar, ...add];
  const c = computeCharacter(b, { engine, catalog, planner });
  const sb = { ...b, soft: c.soft, charStats: c.charStats };
  for (const id of add) {
    const sk = engine.skill(id);
    const d = skillDamage(id, { engine, build: b, skillBuild: sb, character: c });
    const vs = d && againstTarget(d, c, target, "Hell");
    const v = vs?.all?.[1] ?? vs?.total?.[1] ?? 0;
    const lines = engine.describe(sb, id, b.points[id] || 0).effect.filter((l) => l.status !== "unknown" && l.text && !l.heading).map((l) => l.text).slice(0, 6);
    preset.summary.icons.push({ id, slot: "Skill bar", name: sk.name, image: sk.image, points: b.points[id] || 0, soft: c.soft[id] || 0,
      description: sk.description?.[0] || "", lines, ...(v > 0 ? { vs: Math.round(v), per: d.count ? "each" : d.kind === "attack" ? "per hit" : "per cast" } : {}) });
  }
  preset.summary.bar = b.skillBar.map((id) => engine.skillName(id));
  preset.skills = [b.leftSkill, b.rightSkill, ...b.skillBar].filter(Boolean).map((id) => engine.skillName(id));
  changed++;
  console.log(`${preset.id}: + ${add.map((id) => engine.skillName(id)).join(", ")}`);
}
await writeFile(file, JSON.stringify(json));
console.log(`${changed} presets updated`);
await vite.close();
