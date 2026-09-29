// Build audit: does each stat on each starter build's items actually do something for it?
//
//   node scripts/audit-builds.mjs [--stages] [--only=id,id] [--out=file.json]
//
// For every starter build (and its found-gear version; with --stages, its levelling stages),
// each line of each item is left out in turn (character.js b.ablate), and each carried charm
// or relic as a whole, and the build is measured again (rating.js: bossing and clearing
// damage, survivability, hit recovery and movement) against the typical monster of the
// build's own difficulty. A line that changes nothing is dead for this build, and why:
//   - wrong damage type: an element (or physical/magic) none of its damage skills deal
//     (lightning spell damage or lightning pierce on a physical/magic build);
//   - spell stat on a build with no damage spells, attack stat on one with no attacks;
//   - summon stat on a build without summons;
//   - not measured: stats the planner doesn't turn into numbers (magic find, procs, light
//     radius, …): listed, not counted against the build.
// Resistance reduction counts for an element the build deals even against 0% resistance: it
// goes below zero (to -100%), as in the game.
import { createServer } from "vite";
import { readFile, writeFile } from "node:fs/promises";
import { ratingEnv } from "./lib/rate-presets.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const only = args.only ? String(args.only).split(",") : null;
const EPS = 0.02;

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
  const env0 = await ratingEnv(load, planner, await load("/src/data/index.js"));
  const { typicalTarget } = await load("/src/planner/target.js");
  const { buildProfile } = await load("/src/planner/recommend.js");
  const { combatScore } = await load("/src/planner/combatScore.js");
  const envFor = (difficulty) => ({ ...env0, difficulty, target: typicalTarget(planner.monsters, difficulty) });
  const { presets } = JSON.parse(await readFile("src/data/preset-builds.json", "utf8"));
  const { stages } = JSON.parse(await readFile("src/data/preset-stages.json", "utf8"));
  const { engine, catalog } = env0;

  const { buildUse, keyReason, mostlyWasted } = await load("/src/planner/relevance.js");
  const profileOf = (b, env) => buildUse(b, env);
  function whyDead(p, prof, c) {
    const keys = p.kind === "stats" ? p.effects.map(([k]) => k) : [];
    const reasons = keys.map((k) => keyReason(k, prof));
    if (reasons.some((r) => r === null)) {
      // Of use to this build, but not now: speed short of the next breakpoint, a resistance
      // already at its cap.
      if (keys.some((k) => /speed/.test(k))) return "short of the next speed breakpoint";
      const res = keys.map((k) => /^(fire|cold|lightning|poison)_resistance$/.exec(k)?.[1]).find(Boolean);
      if (res && c.resist[res]?.stacked + c.resist[res]?.penalty >= c.resist[res]?.max) return "resistance already capped";
      if (keys.includes("spell_focus") && c.spellFocus.value >= c.spellFocus.cap) return "spell focus already capped";
      return unmeasured(p, keys);
    }
    const wrong = reasons.filter((r) => typeof r === "string");
    if (wrong.length && wrong.length === reasons.filter((r) => r !== undefined).length) return wrong[0];
    // Attributes beyond what the build needs or scales with.
    if (keys.length && keys.every((k) => /^(percent_)?(strength|dexterity)$/.test(k))) return "attribute the build doesn't need";
    return unmeasured(p, keys);
  }
  // What the rating doesn't count (yet): named, so a gap in the planner isn't mistaken for waste.
  function unmeasured(p, keys) {
    const t = p.text || "";
    if (keys.some((k) => /defense/.test(k)) || /Defense/.test(t)) return "defense (not in the rating yet)";
    if (/Damage Taken Reduced|Damage Reduced/i.test(t)) return "damage reduction (not in the rating yet)";
    if (/Magic Find|Gold Find|Light Radius/i.test(t)) return "find and utility (not rated)";
    if (/Chance to cast|Reanimate|Flees|on Striking|on Death Blow/i.test(t)) return "procs (not rated)";
    return "not measured";
  }
  const NOT_WASTE = new Set(["short of the next speed breakpoint", "resistance already capped", "not measured",
    "defense (not in the rating yet)", "damage reduction (not in the rating yet)", "find and utility (not rated)", "procs (not rated)"]);
  const USEFUL_LATER = NOT_WASTE;

  const report = [];
  const add = async (p, label, b, difficulty) => {
    const env = envFor(difficulty);
    // The generator's own measure: the rating plus life recovery (combatScore's sustain).
    const profile = buildProfile(b, engine);
    const value = (bb) => env.rating.buildValue(env.rating.buildMetrics(bb, env)) + combatScore(bb, env.computeCharacter(bb, env), engine, profile).sustainScore;
    const base = value(b), prof = profileOf(b, env), cBase = env.computeCharacter(b, env);
    const items = [];
    for (const [slot, st] of Object.entries(b.gear)) {
      const r = catalog.resolve(st, b.level);
      if (!r) continue;
      const lines = r.parsed.map((pl, i) => {
        if (pl.kind === "info" || !pl.text || /^(Required|Item Level|Socketed|Two-Hand|One-Hand|Defense|Chance to Block|Throw Damage|Durability)/.test(pl.text)) return null;
        const d = base - value({ ...b, ablate: { slot, line: i } });
        return { text: pl.text, value: Math.round(d * 100) / 100, ...(Math.abs(d) < EPS ? { dead: whyDead(pl, prof, cBase) } : {}) };
      }).filter(Boolean);
      items.push({ slot, name: r.def.name, kind: r.def.kind, lines });
    }
    (b.inventory || []).forEach((it, i) => {
      const r = catalog.resolve(it, b.level);
      if (!r) return;
      const d = base - value({ ...b, ablate: { slot: `inv:${i}`, line: "all" } });
      items.push({ slot: `inventory`, name: r.def.name, kind: r.def.kind, value: Math.round(d * 100) / 100, ...(Math.abs(d) < EPS ? { dead: "adds nothing measured" } : {}) });
    });
    const gear = items.filter((x) => x.lines);
    const wrong = gear.flatMap((x) => x.lines.filter((l) => l.dead && !USEFUL_LATER.has(l.dead)).map((l) => ({ item: x.name, slot: x.slot, text: l.text, why: l.dead })));
    // An item mostly bought for nothing (relevance.js mostlyWasted).
    const flagged = Object.entries(b.gear).filter(([, st]) => mostlyWasted(catalog.resolve(st, b.level), prof)).map(([slot, st]) => `${catalog.get(st.ref)?.name} (${slot})`);
    report.push({ id: p.id, name: p.name, cls: p.cls, version: label, difficulty, level: b.level, elements: [...prof.elements], spell: prof.spell, attack: prof.attack, wrong, flagged,
      emptyCharms: items.filter((x) => !x.lines && x.dead).map((x) => x.name), items });
  };
  for (const p of presets) {
    if (only && !only.includes(p.id)) continue;
    await add(p, "best", p.build, "Hell");
    if (p.found?.build) await add(p, "found", p.found.build, "Hell");
    if (args.stages) for (const s of stages[p.id] || []) if (s.build) await add(p, `level ${s.level}`, s.build, s.difficulty);
  }
  const out = args.out || "build-audit.json";
  await writeFile(out, JSON.stringify(report, null, 1));
  // Summary: the builds with stats that don't fit them, worst first.
  const bad = report.filter((r) => r.wrong.length || r.flagged.length).sort((a, b) => b.wrong.length - a.wrong.length);
  console.log(`${report.length} builds audited, ${bad.length} with stats that do nothing for them (${report.reduce((n, r) => n + r.wrong.length, 0)} lines, ${report.reduce((n, r) => n + r.flagged.length, 0)} items mostly wasted)`);
  for (const r of bad.slice(0, 40))
    console.log(`- ${r.name} (${r.cls}, ${r.version}, ${r.difficulty}; deals ${r.elements.join("/") || "—"}): ${r.flagged.length ? `mostly wasted: ${r.flagged.join(", ")}; ` : ""}${r.wrong.slice(0, 4).map((w) => `${w.item}: "${w.text}" (${w.why})`).join("; ")}${r.wrong.length > 4 ? ` … +${r.wrong.length - 4}` : ""}`);
  console.log(`full report: ${out}`);
} finally {
  await vite.close();
}
