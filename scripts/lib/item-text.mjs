// Item text as the game writes it, for any property: every properties.bin and itemstatcost.bin
// row (not only those the cube's recipes use, as in src/data/cube-main.json), with skills,
// monsters and strings named on demand, through the cube's own formatter (src/cube/stats.js).
// Offsets as in scripts/extract-cube.mjs (D2 1.13c layouts).
//   const g = gameText(dir); g.propertyText([prop, param, min, max]) → ["+10 to Strength"]
import { join } from "node:path";
import { openMpq } from "./mpq.mjs";
import { readBin, readTbl, stringIndex } from "./d2tables.mjs";
import { propertyLines, statLine } from "../../src/cube/stats.js";

export function gameText(dir = process.env.MXL_DIR || "C:/games/median-xl") {
  const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
  if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
  const mpq = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq"));
  const X = (n, size) => {
    const t = readBin(mpq.read(`data/global/excel/${n}`));
    if (size && t.size !== size) throw new Error(`${n} records are ${t.size} bytes, expected ${size} (D2 1.13c)`);
    return t;
  };
  const tbls = ["string.tbl", "patchstring.tbl", "expansionstring.tbl"].map((n) => readTbl(mpq.read(`data/local/lng/eng/${n}`)));
  const str = stringIndex({ base: tbls[0], patch: tbls[1], expansion: tbls[2] });
  const byKey = (k) => { for (const t of [...tbls].reverse()) if (t.byKey.has(k)) return t.byKey.get(k); return null; };
  const NO_STRING = 5382; // "FLYING POLAR BUFFALO ERROR"
  // Colour codes out; D2 writes multi-line text bottom line first.
  const lines = (s) => (s ?? "").replace(/(?:ÿ|Ã¿)c./g, "").split("\n").map((l) => l.trim()).filter(Boolean).reverse();
  const text = (s) => lines(s).join(" ");
  const strText = (i) => (i && i !== NO_STRING ? text(str(i)) : "");
  const cstr = (r, o) => r.toString("latin1", o, r.indexOf(0, o));

  const props = X("properties.bin", 46), isc = X("itemstatcost.bin", 324);
  const skills = X("skills.bin"), skilldesc = X("skilldesc.bin"), monstats = X("monstats.bin", 424);
  const propOut = {};
  for (let p = 0; p < props.count; p++) {
    const r = props.record(p), parts = [];
    for (let k = 0; k < 7; k++) {
      const func = r[0x18 + k];
      if (func) parts.push([func, r.readInt16LE(0x20 + k * 2), r.readInt16LE(0x0a + k * 2)]);
    }
    propOut[p] = parts;
  }
  const statOut = {};
  for (let s = 0; s < isc.count; s++) {
    const r = isc.record(s);
    // Description function, position, texts, then op and op param (0x56, 0x57) for per-level stats.
    statOut[s] = [r[0x36], r[0x37], strText(r.readUInt16LE(0x38)), strText(r.readUInt16LE(0x3a)), strText(r.readUInt16LE(0x3c)), r[0x56], r[0x57]];
  }
  // Description groups (itemstatcost.bin 0x3E, with their own function 0x40, position 0x41 and
  // texts 0x42/0x44/0x46): all of a group's stats at one value are written as one line.
  const groups = new Map();
  for (let s = 0; s < isc.count; s++) {
    const r = isc.record(s), gid = r.readUInt16LE(0x3e);
    if (!gid) continue;
    const grp = groups.get(gid) ?? groups.set(gid, { stats: [], desc: [r[0x40], r[0x41], strText(r.readUInt16LE(0x42)), strText(r.readUInt16LE(0x44)), strText(r.readUInt16LE(0x46))] }).get(gid);
    grp.stats.push(s);
  }
  const skillName = (id) => {
    if (!(id >= 0 && id < skills.count)) return undefined;
    const d = skills.record(id).readInt16LE(0x194);
    return d >= 0 ? text(str(skilldesc.record(d).readUInt16LE(0x08))) || undefined : undefined;
  };
  const lookup = (fn) => new Proxy({}, { get: (_, k) => (typeof k === "string" && /^\d+$/.test(k) ? fn(Number(k)) : undefined) });
  const data = {
    props: propOut, stats: statOut,
    skills: lookup(skillName),
    monsters: lookup((id) => (id >= 0 && id < monstats.count ? text(str(monstats.record(id).readUInt16LE(6))) || undefined : undefined)),
    strings: lookup((id) => lines(str(id))),
  };
  const perLevel = (stat) => { const d = statOut[stat]; return !!d && ((d[0] >= 6 && d[0] <= 9) || (d[0] === 32 && d[5] === 12)); };
  const tidy = (l) => l.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, "($1 to $2)");
  return {
    patch, mpq, X, str, byKey, lines, text, cstr, skillName, data,
    /** One property's lines, with "(a to b)" ranges as the item text writes them. */
    propertyText: (mod) => propertyLines(data, mod).map(tidy),
    /**
     * The properties of a row (n of them, 16 bytes each from `at`: property, parameter, min,
     * max) as the item shows them: a minimum and maximum damage pair as "Adds X-Y Damage" and a
     * description group whose stats all share one value as its one line, as the game does.
     */
    rowText(r, at, n) { return this.rowsText([[r, at, n]]); },
    /**
     * Several rows' properties as one item (a runeword and its runes' socket bonuses): stats
     * with the same parameter add up before they're written, as the docs show them.
     */
    rowsText(list) {
      const entries = [], other = [];
      for (const [r, at, n] of list) for (let k = 0; k < n; k++) {
        const o = at + 16 * k, prop = r.readInt32LE(o);
        if (prop < 0) continue;
        const param = r.readInt32LE(o + 4), min = r.readInt32LE(o + 8), max = r.readInt32LE(o + 12);
        const funcs = (data.props[prop] || []).map(([f]) => f);
        // A property setting both a minimum and a maximum (dmg-norm, dmg-fire: functions 5 and 6,
        // or 15 and 16) gives the minimum its low value and the maximum its high one.
        const pairMin = (funcs.includes(5) && funcs.includes(6)) || funcs.includes(15);
        for (const [func, stat, value] of data.props[prop] || []) {
          const v = func === 15 || (pairMin && func === 5) ? { min, max: min } : func === 16 || (pairMin && func === 6) ? { min: max, max }
            // Function 17 sets the stat from the parameter (a poison's length in frames), except
            // Median XL's per-level stats, which keep it in the minimum when there is one
            // (Tailwind's parameter 32 isn't its value; its minimum 20 is: +0.625 per level).
            : func === 17 && (!perLevel(stat) || !min) ? { min: param, max: param } : { min, max };
          // Damage properties without a stat of their own set the minimum or maximum damage.
          if (stat < 0 && (func === 5 || func === 6)) entries.push({ stat: func === 5 ? 21 : 22, param: 0, ...v });
          // Enhanced damage (function 7) has no stat of its own either.
          else if (stat < 0 && func === 7) entries.push({ stat: "ed", param: 0, ...v });
          else if (stat >= 0) entries.push({ stat, param: param || value || 0, ...v });
        }
        // Lines with no stat to group (sockets, ethereal) as written alone.
        if ((data.props[prop] || []).some(([func, stat]) => stat < 0 && ![5, 6, 7].includes(func))) other.push(...this.propertyText([prop, param, min, max]).filter((l) => !/to M(in|ax)imum Damage$|Enhanced Damage$/.test(l)));
      }
      // The same stat twice (an item's and its runes'): one, added up.
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i], first = entries.findIndex((x) => x.stat === e.stat && x.param === e.param);
        if (first < i) { entries[first] = { ...entries[first], min: entries[first].min + e.min, max: entries[first].max + e.max }; entries.splice(i, 1); }
      }
      const used = new Set();
      const range = (e) => (e.min === e.max ? `${e.min}` : `(${e.min} to ${e.max})`);
      const out = [];
      for (const [lo, hi, what] of [[21, 22, "Damage"], [48, 49, "Fire Damage"], [50, 51, "Lightning Damage"], [52, 53, "Magic Damage"], [54, 55, "Cold Damage"]]) {
        const a = entries.find((e) => e.stat === lo && !used.has(e)), b = entries.find((e) => e.stat === hi && !used.has(e));
        if (!a || !b) continue;
        used.add(a); used.add(b);
        // The same amount at both ends: "+20 Fire Damage".
        out.push(range(a) === range(b) ? `+${range(a)} ${what}` : `Adds ${range(a)}-${range(b)} ${what}`);
      }
      // Poison: minimum and maximum per frame in 256ths, over its length in frames (25 a second).
      {
        const lo = entries.find((e) => e.stat === 57 && !used.has(e)), hi = entries.find((e) => e.stat === 58 && !used.has(e)), len = entries.find((e) => e.stat === 59 && !used.has(e));
        if (lo && hi && len) {
          [lo, hi, len].forEach((e) => used.add(e));
          const f = len.max, dmg = (x) => Math.round((x * f) / 256), sec = Math.round((f / 25) * 100) / 100;
          const a = { min: dmg(lo.min), max: dmg(lo.max) }, b = { min: dmg(hi.min), max: dmg(hi.max) };
          out.push(range(a) === range(b) ? `+${range(a)} Poison Damage over ${sec} seconds` : `Adds ${range(a)}-${range(b)} Poison Damage over ${sec} seconds`);
        }
      }
      for (const { stats, desc } of groups.values()) {
        const members = stats.map((st) => entries.find((e) => e.stat === st && !used.has(e)));
        if (members.some((m) => !m) || members.some((m) => m.min !== members[0].min || m.max !== members[0].max)) continue;
        members.forEach((m) => used.add(m));
        const line = statLine({ ...data, stats: { group: desc } }, "group", 0, members[0].min, members[0].max);
        if (line) out.push(tidy(line));
      }
      const ed = entries.find((e) => e.stat === "ed");
      if (ed) { used.add(ed); out.push(`+${range(ed)}% Enhanced Damage`); }
      for (const e of entries) if (!used.has(e) && !(e.min === 0 && e.max === 0)) { const l = statLine(data, e.stat, e.param, e.min, e.max); if (l) out.push(...l.split("\n").map(tidy)); }
      // A skill with no name (a hidden helper skill) shows nothing in game.
      return [...new Set([...out, ...other])].filter((l) => !/\ba skill\b/.test(l));
    },
  };
}
