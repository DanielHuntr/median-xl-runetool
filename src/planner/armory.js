// Import a character from its median-xl.com page (NotArmory). The page's source carries two
// blocks of JSON: "notarmory-export" (class, level, skill points by name, quests done) and
// "notarmory-items" (every item: quality, name, base and tier, where it's worn, sockets, mystic
// orbs, the item's text), plus the attribute totals, signets eaten and the mercenary's type and
// level in its HTML. Everything is read in the player's browser; nothing is sent anywhere, and
// the page's account name and session token are never kept.
//
// Uniques, set items and runewords become the catalogue's item at the tier their base shows;
// normal and superior bases the base; rare, magic, crafted and honorific items a custom item on
// their base with the stat lines the game shows (their rolled values, mystic orbs included).
// The page's attributes are the character's own (without gear): the points spent are those
// less the class's starting values.
import { encodeBuild } from "./buildCode.js";
import { computeCharacter } from "./character.js";
import { bonusFits, BONUS_GROUPS } from "./items.js";
import { ORBS, orbFits } from "./orbs.js";
import { superiorVariants } from "./superior.js";

const SLOTS = {
  Head: "helm", Torso: "body", Hands: "gloves", Waist: "belt", Feet: "boots", Neck: "amulet",
  LeftFinger: "ring1", RightFinger: "ring2", RightHandMain: "weapon", LeftHandMain: "offhand",
  RightHandAlternate: "weapon2", LeftHandAlternate: "offhand2",
};
const QUESTS = { "lam_essen's_tome": "lam_esens_tome" };
// Lines of an item's text that aren't its stats: its name and base, defence, damage, requirements,
// sockets, affix counts, notes.
const NOT_STATS = /^(Defense:|One-Hand Damage|Two-Hand Damage|Throw Damage|Required |Durability|Item Level|Prefixes:|Suffixes:|Socketed \(|Can be Inserted|Ethereal|Quantity|Chance to Block|\(.*\)$)/;

const jsonBlock = (html, id) => {
  const open = `id="${id}">`, i = html.indexOf(open);
  if (i < 0) return null;
  try { return JSON.parse(html.slice(i + open.length, html.indexOf("</script>", i))); } catch { return null; }
};
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" })[e]);
const textLines = (it) => (it.description_lines || []).map((l) => l.map(([t]) => t).join("").trim());
const statText = (it) => textLines(it).slice(1).filter((l) => l && l !== it.type && !NOT_STATS.test(l));

/** The parts of a character page, or of NotArmory's "Export build" JSON (no items): null if it's neither. */
export function parseArmoryPage(html) {
  const text = String(html || "");
  // "Export build" (made for MedianDB's planner): class, level, skills, quests and the
  // character's attributes in its "stats" text, but no items, signets or mercenary.
  if (/^\s*\{/.test(text)) {
    let exp;
    try { exp = JSON.parse(text); } catch { return null; }
    if (!exp || typeof exp !== "object" || !exp.class || !exp.skillPoints) return null;
    const stat = (k) => { const m = new RegExp(`\\{\\{${k}\\}\\}=(\\d+)`).exec(String(exp.stats || "")); return m ? Number(m[1]) : null; };
    return { exp, items: [], exportOnly: true, attrs: { strength: stat("strength"), dexterity: stat("dexterity"), vitality: stat("vitality"), energy: stat("energy") }, signets: null, merc: { spec: "", level: null } };
  }
  const exp = jsonBlock(text, "notarmory-export"), items = jsonBlock(text, "notarmory-items");
  if (!exp || !Array.isArray(items)) return null;
  const stat = (k) => { const m = new RegExp(`na-stat-${k}"><dt>[^<]*</dt><dd>([^<]*)</dd>`).exec(text); return m ? decode(m[1]).replace(/[^\d]/g, "") : null; };
  const doll = /data-na-doll[^>]*>/.exec(text)?.[0] || "";
  const attr = (k) => { const v = stat(k); return v == null || v === "" ? null : Number(v); };
  return {
    exp, items,
    attrs: { strength: attr("strength"), dexterity: attr("dexterity"), vitality: attr("vitality"), energy: attr("energy") },
    signets: attr("signets") ?? 0,
    merc: { spec: /data-merc-type="([^"]*)"/.exec(doll)?.[1] || "", level: Number(/data-merc-level="(\d+)"/.exec(doll)?.[1]) || null },
  };
}

/**
 * The page as a planner build, and what couldn't be matched.
 * @returns {{ build, name, missing: string[], notes: string[] } | null}
 */
export function armoryBuild(page, { engine, catalog, planner }) {
  const { exp, items } = page;
  const cls = engine.classNames.find((c) => c === exp.class);
  if (!cls) return null;
  const missing = [], notes = [];
  const level = Math.max(1, Math.min(150, Number(exp.level) || 1));
  const b = { v: 2, cls, level, points: {}, quests: {}, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 }, signets: Math.min(450, page.signets || 0), gear: {}, inventory: [], buffs: [], swap: false };

  // Skills, by name in the class's trees.
  const ids = new Map(engine.skillIds().filter((id) => engine.skill(id).class === cls).map((id) => [engine.skillName(id).replace(/ \(Innate\)$/, ""), id]));
  for (const [name, n] of Object.entries(exp.skillPoints || {})) {
    const id = ids.get(name);
    if (id && engine.node({ cls }, id)) b.points[id] = Number(n) || 0;
    else missing.push(`skill ${name}`);
  }
  // Quests done, per difficulty.
  for (const [k, by] of Object.entries(exp.questsCompleted || {}))
    // Not done is said too: the planner counts a quest as done unless it's marked otherwise.
    for (const [d, done] of Object.entries(by || {})) b.quests[`${QUESTS[k] || k}.${d}`] = !!done;
  const any = (d) => Object.entries(b.quests).some(([k, v]) => v && k.endsWith(`.${d}`));
  b.difficulty = any("hell") || any("nightmare") ? "Hell" : any("normal") ? "Nightmare" : "Normal";

  const all = catalog.all();
  const byName = (name, kinds) => all.filter((d) => d.name === name && kinds.includes(d.kind));
  // "Superior Light Gauntlets (1)" → the base "Light Gauntlets" at "Tier 1", superior.
  const baseOf = (type) => {
    const m = /^(Superior |Ethereal |Low Quality |Cracked |Damaged |Crude )*(.+?)(?: \((\d|Sacred|Angelic|MC|TU|SU|SSU)\))?$/.exec(type || "");
    if (!m) return null;
    const superior = /Superior /.test(m[1] || "");
    const def = byName(m[2], ["base"])[0];
    if (!def) return { name: m[2], superior };
    const label = m[3] ? (/^\d$/.test(m[3]) ? `Tier ${m[3]}` : m[3]) : null;
    const variant = Math.max(0, label ? def.variants.findIndex((v) => v.label === label) : 0);
    return { def, variant, superior, name: m[2] };
  };
  // A superior variant whose lines the item's text shows (else the kind's first).
  const superiorId = (slotType, lines) => {
    const vs = superiorVariants(slotType);
    const hit = vs.find((v) => v.lines.every((l) => { const re = new RegExp(`^${l.replace(/[.*+?^${}|[\]\\]/g, "\\$&").replace(/\\\(\d+ to \d+\\\)/g, "\\d+")}$`); return lines.some((x) => re.test(x)); }));
    return (hit || vs[0])?.id;
  };
  const tierOf = (type) => { const m = /\((\d)\)$/.exec(type || ""); return m ? Number(m[1]) - 1 : null; };
  const socketOf = (s) => {
    const name = s.name.replace(/ Rune \(\d+\)$/, "").replace(/ \(\d+\)$/, "");
    const d = byName(name, ["socketable"])[0] || byName(s.name, ["socketable", "unique", "sacred"])[0];
    if (d) return d.key;
    // A magic or rare jewel: its own lines and required level, kept in the socket.
    if (s.type === "Jewel" || /Jewel$/.test(s.name)) {
      const lines = textLines(s);
      const req = Number(/^Required Level: (\d+)/.exec(lines.find((l) => /^Required Level:/.test(l)) || "")?.[1]) || 0;
      return { jewel: { name: s.quality ? `${s.quality} Jewel` : s.name, text: statText(s).join("\n"), ...(req ? { req } : {}) } };
    }
    missing.push(`${s.name} (in a socket)`);
    return null;
  };
  // An item's rolls, from the values its text shows: each ranged line ("+(16 to 20) to Arrow
  // Swarm") matched to the page's rolled one ("+18 to Arrow Swarm"). A value above the range (an
  // orb or socket adding to the same stat) stays at the top; a line not found, at the top too.
  const rollsOf = (st, it) => {
    const r = catalog.resolve(st, level);
    if (!r?.ranges?.length) return null;
    const pool = textLines(it), rolls = r.ranges.map(() => 1);
    for (let i = 0; i < r.ranges.length;) {
      const line = r.ranges[i].line;
      let n = 0;
      while (r.ranges[i + n]?.line === line) n++;
      const re = new RegExp(`^${line.replace(/\((-?[\d.]+) to (-?[\d.]+)\)/g, "\u0000").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\u0000/g, "(-?[\\d.]+)")}$`);
      const at = pool.findIndex((l) => re.test(l));
      if (at >= 0) {
        const m = re.exec(pool[at]);
        pool.splice(at, 1);
        for (let j = 0; j < n; j++) {
          const { min, max } = r.ranges[i + j], v = Number(m[j + 1]);
          rolls[i + j] = max === min ? 1 : Math.max(0, Math.min(1, (v - min) / (max - min)));
        }
      }
      i += n;
    }
    return rolls.some((x) => x !== 1) ? rolls.map((x) => Math.round(x * 1000) / 1000) : null;
  };
  const orbsOf = (it, def) => {
    const out = [];
    for (const [n, label] of it.mystic_orbs || []) {
      const name = String(label).replace(/^MO - /, "");
      const orb = ORBS.find((o) => o.name.toLowerCase() === name.toLowerCase() && orbFits(o, def));
      if (!orb) { missing.push(`${label} (mystic orb)`); continue; }
      for (let i = 0; i < Math.min(Number(n) || 0, 99); i++) out.push(orb.id);
    }
    return out;
  };
  const corruptionOf = (it, r) => {
    if (!it.corrupted || !r) return [];
    const lines = new Set(textLines(it));
    const c = BONUS_GROUPS.find((g) => g.group === "corruption").list.map((x) => ({ ...x, group: "corruption" }))
      .find((x) => bonusFits(x, r.def, { twoHanded: r.twoHanded, types: r.types }) && x.lines.every((l) => lines.has(l)));
    if (!c) notes.push(`${it.display_name || it.item}: corrupted, but its corruption wasn't recognised`);
    return c ? [c.id] : [];
  };

  // One item as the planner's item state, or null.
  function itemState(it, slot) {
    const label = `${it.display_name || it.item} (${it.type})`;
    let st = null;
    if (it.quality === "Unique" || it.quality === "Set") {
      const d = byName(it.item, it.quality === "Set" ? ["set"] : ["unique", "sacred"])[0];
      if (!d) { missing.push(label); return null; }
      const t = tierOf(it.type);
      st = { ref: d.key, variant: t != null && d.variants?.[t] ? t : Math.max(0, (d.variants?.length || 1) - 1) };
    } else if (it.quality === "RW") {
      const d = byName(it.item, ["runeword"])[0], base = baseOf(it.type);
      if (!d || !base?.def) { missing.push(label); return null; }
      st = { ref: d.key, base: base.def.key, baseVariant: base.variant };
      if (base.superior) st.superior = superiorId(base.def.slotType, textLines(it));
    } else if (["Normal", "High", "Low", ""].includes(it.quality) && slot) {
      const base = baseOf(it.type);
      if (!base?.def) { missing.push(label); return null; }
      st = { ref: base.def.key, variant: base.variant, socketCount: it.socketables?.length || 0 };
      if (base.superior || it.quality === "High") st.superior = superiorId(base.def.slotType, textLines(it));
    } else if (["Magic", "Rare", "Crafted", "Honorific"].includes(it.quality)) {
      // A custom item: its base, and the stat lines the game shows.
      const base = baseOf(it.type);
      const jewellery = { Ring: "ring", Amulet: "amulet", Jewel: "jewel" }[it.type] || (/Quiver/.test(it.type) ? "quiver" : null);
      // The page shows the base's own lines too (a sacred elemental bow's added damage, its innate
      // damage worked out): those come from the base in the planner, so they're left out here.
      const baseLines = base?.def ? [...base.def.variants[base.variant].lines] : [];
      const own = statText(it).filter((l) => {
        const i = baseLines.indexOf(l);
        if (i >= 0) { baseLines.splice(i, 1); return false; }
        const innate = /^(Innate [\w-]+ Damage):/.exec(l)?.[1];
        return !(innate && baseLines.some((x) => x.startsWith(`${innate}:`)));
      });
      st = { ref: "custom", custom: { name: it.display_name || it.item, slotType: base?.def?.slotType || jewellery || "weapon", text: own.join("\n") } };
      if (base?.def) { st.base = base.def.key; st.baseVariant = base.variant; st.socketCount = it.socketables?.length || 0; }
      if (it.mystic_orbs?.length) notes.push(`${it.display_name || it.item}: its mystic orbs are counted in its stat lines`);
    } else return null;
    if (st.ref !== "custom") {
      const rolls = rollsOf(st, it);
      if (rolls) st.rolls = rolls;
      // A runeword's sockets hold its runes (part of the runeword); jewels put in before them count.
      const sockets = (it.socketables || []).filter((x) => st.ref.startsWith("rw:") ? !/ Rune( \(\d+\))?$/.test(x.name) : true).map(socketOf);
      if (sockets.some(Boolean)) st.sockets = sockets.map((s) => s || null);
      // Orbs by the item's slot (a runeword's is its base's).
      const r0 = catalog.resolve(st, level);
      const orbs = orbsOf(it, { ...r0?.def, slotType: r0?.def.slotType || r0?.baseDef?.slotType });
      if (orbs.length) st.orbs = orbs;
      const r = catalog.resolve(st, level);
      const corr = corruptionOf(it, r);
      if (corr.length) st.addons = corr;
    }
    return st;
  }

  // Gear the character carries or stashes: kept as spare items to try on (not counted). Runes
  // are counted for My Runes.
  const spare = [], runes = {};
  const GEAR = new Set(["weapon", "shield", "helm", "body", "gloves", "belt", "boots", "ring", "amulet", "quiver"]);
  const QUALITIES = new Set(["Unique", "Set", "RW", "Magic", "Rare", "Crafted", "Honorific", "Normal", "High"]);
  for (const it of items) {
    if (it.area === "character" && it.location !== "Gear" && it.location !== "Belt" && !it.is_charm) {
      const rune = /^(.+) Rune(?: \(\d+\))?$/.exec(it.item || "");
      if (rune && /Rune/.test(it.type || "")) { runes[rune[1]] = (runes[rune[1]] || 0) + (Number(it.quantity) || 1); continue; }
      if (!QUALITIES.has(it.quality) || /Jewel|Charm|Relic/.test(it.type || "")) continue;
      const before = missing.length;
      const st = itemState(it, "spare");
      missing.length = before;
      const r = st && catalog.resolve(st, level);
      if (r && GEAR.has(r.def.slotType || r.baseDef?.slotType)) spare.push(st);
      continue;
    }
    if (it.area === "character" && it.location === "Gear" && SLOTS[it.slot]) {
      const st = itemState(it, SLOTS[it.slot]);
      if (st) b.gear[SLOTS[it.slot]] = st;
    } else if (it.area === "character" && (it.is_charm || /Relic/i.test(it.type))) {
      // Charms and relics carried: the planner's own by the game's item code.
      const d = catalog.get(`inv:${it.code}`) || all.find((x) => (x.kind === "charm" || x.kind === "relic") && x.name === it.item);
      if (d) b.inventory.push({ ref: d.key });
      else missing.push(`${it.item} (charm)`);
    }
  }
  // The mercenary: its type, level and gear.
  const mercGear = {};
  for (const it of items.filter((x) => x.area === "mercenary" && SLOTS[x.slot])) {
    const id = SLOTS[it.slot];
    const st = itemState(it, id);
    if (st) mercGear[id] = st;
  }
  if (page.merc.spec) b.merc = { spec: page.merc.spec, level: page.merc.level, difficulty: b.difficulty, gear: mercGear, off: [] };

  // Attributes: the page shows the character's own (no gear), so the points spent are those less
  // the class's starting values (the planner's, with nothing spent and nothing worn).
  const start = computeCharacter({ ...b, points: {}, buffs: [], gear: {}, inventory: [], merc: null, attrs: { strength: 0, dexterity: 0, vitality: 0, energy: 0 } }, { engine, catalog, planner }).charStats || {};
  for (const a of Object.keys(b.attrs)) if (page.attrs[a] != null) b.attrs[a] = Math.max(0, page.attrs[a] - (start[a] ?? 0));
  // Signets eaten, where the page doesn't say (the "Export build" JSON): the points spent beyond
  // what the levels and quests give.
  if (page.signets == null) {
    const sp = computeCharacter({ ...b, signets: 0 }, { engine, catalog, planner }).statPoints;
    if (sp) b.signets = Math.max(0, Math.min(sp.signetCap, sp.spent - sp.fromLevels - sp.fromQuests));
  }
  if (spare.length) b.spare = spare.slice(0, 120);
  if (page.exportOnly) notes.push("The \"Export build\" text has no items: save the character's page itself to bring in its gear, charms and mercenary too.");
  return { build: b, name: exp.name || cls, missing: [...new Set(missing)], notes: [...new Set(notes)], runes };
}

/** The planner link that opens the imported build (importFromHash does the rest). */
export const armoryHash = (r) => `#planner?b=${encodeBuild(r.build)}&name=${encodeURIComponent(r.name)}`;
