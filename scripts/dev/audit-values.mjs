// Dev check: node scripts/dev/audit-values.mjs [skills|items]
// Sweeps every skill and every item for values the planner would show wrong or not use:
// NaN/undefined/Infinity in text or numbers, negative costs, damage or durations, values it
// can't work out, and item lines it parses but never counts.
import { createServer } from "vite";
import { readFile } from "node:fs/promises";
const only = process.argv[2];
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const problems = [];
const flag = (area, who, what) => problems.push(`${area} | ${who} | ${what}`);
const BAD_TEXT = /NaN|undefined|Infinity|\bnull\b|\[object/;
// Every finite-number check on a computed object; paths say where the bad value is.
function scanNumbers(obj, path, out, seen = new Set()) {
  if (obj == null || typeof obj !== "object" || seen.has(obj)) return;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && !Number.isFinite(v)) out.push(`${path}.${k}=${v}`);
    else if (typeof v === "object") scanNumbers(v, `${path}.${k}`, out, seen);
  }
}
try {
  const data = await vite.ssrLoadModule("/src/data/index.js");
  const { createEngine } = await vite.ssrLoadModule("/src/planner/engine.js");
  const { createCatalog, SLOTS } = await vite.ssrLoadModule("/src/planner/items.js");
  const { computeCharacter } = await vite.ssrLoadModule("/src/planner/character.js");
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const engine = createEngine(planner);
  const catalog = createCatalog(data, planner);
  const blank = (cls, level) => ({
    cls, level, points: {}, quests: {}, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    signets: 0, difficulty: "Hell", gear: {}, swap: false, inventory: [], buffs: [], skillBar: [],
  });

  if (only !== "items") {
    let n = 0;
    for (const cls of engine.classNames)
      for (const tab of engine.tabs(cls))
        for (const node of engine.treeNodes(cls, tab)) {
          const b0 = blank(cls, 150);
          const max = engine.maxLevel(b0, node.id, 150);
          for (const blvl of [...new Set([0, 1, 2, 10, 20, max].filter((x) => x <= max))]) {
            const b = { ...b0, points: blvl ? { [node.id]: blvl } : {} };
            const d = engine.describe(b, node.id, blvl);
            n++;
            for (const block of ["description", "restriction", "effect"])
              for (const l of d[block]) {
                const t = l.text || "";
                if (BAD_TEXT.test(t)) flag("skill", `${cls}/${node.name} @${blvl}`, `bad text: ${t}`);
                if (l.parts?.some((p) => p.source?.status === "missing")) flag("skill", `${cls}/${node.name} @${blvl}`, `can't work out: ${t}`);
                // Enemy debuffs and weapon-damage penalties (Anathema, Conflux) are negative in the game too.
                if (/^(?!Enemy|Weapon Physical)(Mana Cost|Life Cost|Damage|Duration|Radius|Range|Cooldown|[A-Za-z ]+Damage):\s*-\d/.test(t) || /Mana Cost:?\s*-/.test(t))
                  flag("skill", `${cls}/${node.name} @${blvl}`, `negative: ${t}`);
                const nums = [...t.matchAll(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/g)];
                for (const m of nums) if (Number(m[1]) > Number(m[2]) && !/-\d/.test(m[2])) flag("skill", `${cls}/${node.name} @${blvl}`, `min > max: ${t}`);
              }
            const syn = engine.synergies(b, node.id, blvl);
            for (const l of [...(syn?.lines || []), ...(syn?.bonus || [])])
              if (BAD_TEXT.test(l.text || "")) flag("skill", `${cls}/${node.name} @${blvl}`, `bad synergy text: ${l.text}`);
            const eff = [];
            scanNumbers(engine.skillStatEffects(b, node.id), "effects", eff);
            for (const e of eff) flag("skill", `${cls}/${node.name} @${blvl}`, e);
          }
        }
    console.log(`skills: ${n} tooltips checked`);
  }

  if (only !== "skills") {
    let n = 0;
    const unknown = new Map();
    const slotFor = (d) => SLOTS.find((s) => s.accepts.includes(d.slotType))?.id;
    // Socket fillers: each one in a weapon, a body armor and a shield (their stats differ by item type).
    const hosts = ["weapon", "body", "offhand"].map((slot) =>
      catalog.forSlot(slot, "Paladin").find((d) => d.kind === "base" && d.variants.some((v) => v.lines.some((l) => /Socketed \([1-9]\)/.test(l)))));
    for (const f of [...catalog.socketables(), ...catalog.jewels()])
      for (const host of hosts) {
        const v = host.variants.findIndex((x) => x.lines.some((l) => /Socketed \([1-9]\)/.test(l)));
        const r = catalog.resolve({ ref: host.key, variant: v, socketCount: 1, sockets: [f.key] }, 150);
        n++;
        const s = r?.sockets?.[0];
        if (!s) { flag("socket", f.name, `not accepted in ${host.cat}`); continue; }
        for (const l of s.lines) if (BAD_TEXT.test(l)) flag("socket", `${f.name} in ${host.cat}`, `bad text: ${l}`);
        (s.parsed || []).forEach((p, i) => {
          if (p?.kind === "unknown") flag("socket", `${f.name} in ${host.cat}`, `not counted: ${s.lines[i]}`);
        });
      }
    // Mystic orbs: each on an item it fits; its lines must count and its level cost must apply.
    const { ORBS, orbFits } = await vite.ssrLoadModule("/src/planner/orbs.js");
    const orbHosts = ["weapon", "helm", "body", "offhand", "ring1", "amulet", "gloves", "belt", "boots"]
      .map((slot) => catalog.forSlot(slot, "Paladin").find((d) => d.kind === "base" || d.kind === "unique"))
      .filter(Boolean);
    let orbChecks = 0;
    for (const o of ORBS) {
      const hosts = orbHosts.filter((h) => orbFits(o, h, h.variants.at(-1).lines, {}));
      if (!hosts.length) flag("orb", o.name, `fits none of: ${orbHosts.map((h) => h.slotType).join(", ")}`);
      for (const h of hosts) {
        const st = { ref: h.key, variant: h.variants.length - 1 };
        const before = catalog.resolve(st, 150), after = catalog.resolve({ ...st, orbs: [o.id] }, 150);
        orbChecks++;
        const applied = after?.orbs?.[0];
        if (!applied) { flag("orb", `${o.name} on ${h.slotType}`, "not applied"); continue; }
        if (after.head.reqLevel - before.head.reqLevel !== (o.reqLevel || 0))
          flag("orb", `${o.name} on ${h.slotType}`, `required level +${after.head.reqLevel - before.head.reqLevel}, orb says +${o.reqLevel}`);
        applied.parsed.forEach((p, i) => {
          if (p.kind === "unknown") flag("orb", o.name, `not counted: ${o.lines[i]}`);
          if (p.kind === "stats") for (const [k, v] of p.effects) if (!Number.isFinite(v)) flag("orb", o.name, `${k}=${v}`);
        });
      }
    }
    console.log(`orbs: ${ORBS.length} orbs, ${orbChecks} placements checked`);
    for (const d of catalog.all()) {
      if (d.kind === "socketable") continue;
      const states = [];
      if (d.kind === "runeword") {
        const base = catalog.runewordBases(d)[0];
        if (!base) { flag("item", d.name, "runeword has no base"); continue; }
        states.push({ ref: d.key, base: base.key });
      } else for (let v = 0; v < (d.variants?.length || 1); v++) states.push({ ref: d.key, variant: v });
      for (const st of states) {
        const r = catalog.resolve(st, 150);
        n++;
        if (!r) { flag("item", d.name, `doesn't resolve: ${JSON.stringify(st)}`); continue; }
        const who = `${d.kindLabel}/${d.name}${r.label ? " [" + r.label + "]" : ""}`;
        for (const l of r.lines) if (BAD_TEXT.test(l)) flag("item", who, `bad text: ${l}`);
        const bad = [];
        scanNumbers(r.head, "head", bad);
        for (const e of bad) flag("item", who, e);
        r.parsed.forEach((p, i) => {
          if (p?.kind !== "unknown") return;
          const key = r.lines[i].replace(/-?\d+(\.\d+)?/g, "#");
          if (!unknown.has(key)) unknown.set(key, { n: 0, eg: who });
          unknown.get(key).n++;
        });
        // Wear it on a class that can use it and check the character sheet stays finite.
        const slot = slotFor(d);
        if (!slot || d.slotType === "socketable" || d.slotType === "jewel") continue;
        const cls = engine.classNames.find((c) => catalog.forSlot(slot, c).some((x) => x.key === d.key));
        if (!cls) continue;
        const b = blank(cls, 150);
        b.gear[slot] = st;
        const c = computeCharacter(b, { engine, catalog, planner });
        const out = [];
        for (const k of ["attributes", "life", "mana", "resist", "defense", "block", "ar", "damage", "spellFocus", "avoid"]) scanNumbers({ [k]: c[k] }, "char", out);
        for (const e of out) flag("item", who, e);
      }
    }
    console.log(`items: ${n} item states checked`);
    const top = [...unknown].sort((a, b) => b[1].n - a[1].n);
    console.log(`${top.length} distinct item lines parsed but not counted:`);
    for (const [k, v] of top.slice(0, Number(process.env.TOP || 60))) console.log(`  ${v.n}× ${k}   (e.g. ${v.eg})`);
  }
  console.log(problems.join("\n"));
  console.log(problems.length, "problems");
} finally {
  await vite.close();
}
