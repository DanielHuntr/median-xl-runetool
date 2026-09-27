// Dev check: node scripts/dev/smoke-items.mjs
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createCatalog } = await vite.ssrLoadModule("/src/planner/items.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const catalog = createCatalog(data, planner);
  const nut = catalog.all().find((d) => d.name === "The Nutcracker");
  console.log(nut.variants.map((v) => v.label + ": " + v.lines.slice(0, 3).join(" | ")));
  for (const v of [0, 3]) console.log("variant", v, catalog.resolve({ ref: nut.key, variant: v }, 81).head.damage);
  const helm = catalog.forSlot("helm", "Paladin").find((d) => d.kind === "sacred" && d.variants[0].lines.some((l) => /Socketed \([2-9]\)/.test(l)));
  const ruby = catalog.all().find((d) => d.name === "Perfect Ruby");
  const r = catalog.resolve({ ref: helm.key, sockets: [ruby.key] }, 100);
  console.log(helm.name, "sockets", r.socketCount, r.sockets.map((x) => x && x.def.name + ": " + x.lines.join("; ")), "def", r.head.defense);
  const whiteShield = catalog.forSlot("offhand", "Paladin").find((d) => d.kind === "base" && d.cat === "Paladin Shields");
  const w = catalog.resolve({ ref: whiteShield.key, variant: 4, socketCount: 3, sockets: [ruby.key, ruby.key] }, 100);
  console.log(whiteShield.name, w.label, "block", w.head.block, w.head.blockClass, "sockets", w.socketCount, w.sockets.map((x) => x && x.lines.join(";")));
  const rw = catalog.all().find((d) => d.kind === "runeword" && d.name === "Gehenna");
  console.log("Gehenna bases:", catalog.runewordBases(rw).slice(0, 5).map((b) => b.name + "/" + b.cat), "…", catalog.runewordBases(rw).length);
  const custom = catalog.resolve({ ref: "custom", custom: { name: "My ring", slotType: "ring", text: "+2 to All Skills\nFire Resist +30%\n10% Faster Widgets" } }, 90);
  console.log("custom:", custom.parsed.map((p) => p.kind + ":" + (p.effects ? JSON.stringify(p.effects) : p.text)));
  console.log("forSlot counts (Barbarian):", ["weapon", "offhand", "helm", "body", "gloves", "belt", "boots", "amulet", "ring1"].map((s) => s + "=" + catalog.forSlot(s, "Barbarian").length).join(" "));
} finally {
  await vite.close();
}
