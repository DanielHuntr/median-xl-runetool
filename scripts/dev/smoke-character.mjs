// Dev check: node scripts/dev/smoke-character.mjs
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const find = (kind, name) => catalog.all().find((d) => d.kind === kind && d.name === name);
  const claw = catalog.forSlot("weapon", "Assassin").find((d) => d.kind === "unique" && d.cat === "Assassin Claws");
  const rw = catalog.forSlot("body", "Assassin").find((d) => d.kind === "runeword");
  const rwBase = catalog.runewordBases(rw).find((b) => b.cat === "Body Armors");
  const ruby = find("socketable", "Perfect Ruby");
  const setItem = catalog.forSlot("helm", "Assassin").find((d) => d.kind === "set");
  const b = {
    cls: "Assassin", level: 81, points: {}, quests: {}, difficulty: "Nightmare", signets: 2,
    attrs: { strength: 46, dexterity: 366, vitality: 0, energy: 0 },
    gear: {
      weapon: { ref: claw.key, variant: 3 },
      body: { ref: rw.key, base: `base:${rwBase.id}` },
      helm: { ref: setItem.key },
      boots: { ref: catalog.forSlot("boots", "Assassin").find((d) => d.kind === "base").key, variant: 4, socketCount: 0 },
      amulet: { ref: catalog.forSlot("amulet", "Assassin")[0].key, sockets: [ruby.key] },
    },
    inventory: [{ ref: catalog.all().find((d) => d.kind === "charm").key }],
  };
  console.log("weapon:", claw.name, "| body:", rw.name, "on", rwBase.name, "| helm:", setItem.name);
  const c = computeCharacter(b, { engine, catalog, planner });
  const pick = ({ attributes, statPoints, life, mana, resist, defense, block, ar, damage, spellFocus, warnings, sets, allSkills, classSkills }) =>
    ({ attributes, statPoints, life, mana, resist, defense: { ...defense, parts: defense.parts.length }, block, ar, damage, spellFocus, warnings, sets: sets.map((x) => [x.set.name, x.count, x.active.length]), allSkills, classSkills });
  console.dir(pick(c), { depth: 4 });
  console.log("stats:", Object.keys(c.stats).length, "| unknown lines:", c.unknown.length, "| procs:", c.procs.length, "| oskills:", c.oskills.length);
  console.log("socketed amulet:", c.equipped.amulet.def.name, c.equipped.amulet.sockets.map((x) => x && x.def.name + " → " + x.lines.join("; ")));
} finally {
  await vite.close();
}
