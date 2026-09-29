// One catalogue of everything the equipment builder can use, built from the app's
// own item data plus the planner data (charms, relics, icons). Also resolves an
// equipped item (tier, rolls, sockets, runeword base) into rolled stat lines.
import { applyRolls, parseLine, parseSpan } from "./statparse.js";
import { superiorOf } from "./superior.js";
import { cleanOrbs, orbById, orbFits, orbMultiplier } from './orbs.js';

// Equipment slots, laid out like the in-game inventory screen.
export const SLOTS = [
  { id: "weapon", label: "Weapon", accepts: ["weapon"] },
  { id: "offhand", label: "Off-hand", accepts: ["shield", "quiver", "weapon"] },
  { id: "weapon2", label: "Weapon II", accepts: ["weapon"], swap: true },
  { id: "offhand2", label: "Off-hand II", accepts: ["shield", "quiver", "weapon"], swap: true },
  { id: "helm", label: "Helm", accepts: ["helm"] },
  { id: "amulet", label: "Amulet", accepts: ["amulet"] },
  { id: "body", label: "Body armor", accepts: ["body"] },
  { id: "gloves", label: "Gloves", accepts: ["gloves"] },
  { id: "ring1", label: "Ring", accepts: ["ring"] },
  { id: "ring2", label: "Ring", accepts: ["ring"] },
  { id: "belt", label: "Belt", accepts: ["belt"] },
  { id: "boots", label: "Boots", accepts: ["boots"] },
];

const SLOT_BY_CAT = {
  Helms: "helm", Circlets: "helm", "Special Helms": "helm", "Amazon Helms": "helm",
  "Barbarian Helms": "helm", "Druid Helms": "helm", "Paladin Helms": "helm",
  "Body Armors": "body", "Sorceress Body Armors": "body",
  Shields: "shield", "Special Shields": "shield", "Amazon Shields": "shield",
  "Assassin Shields": "shield", "Barbarian Shields": "shield", "Necromancer Shields": "shield",
  "Paladin Shields": "shield",
  Gloves: "gloves", Belts: "belt", Boots: "boots",
  Amulets: "amulet", Rings: "ring", Jewels: "jewel",
  "Arrow Quivers": "quiver", "Crossbow Quivers": "quiver",
};
export const slotTypeOf = (cat) => SLOT_BY_CAT[cat] || "weapon";
// Which socketable stat line applies: weapon, armor (helm/body) or shield.
const socketKind = (slotType) =>
  slotType === "shield" ? 2 : slotType === "helm" || slotType === "body" ? 1 : 0;

const CLASS_ONLY = /^\((\w+) Only\)$/;
const lineClass = (lines) => lines.map((l) => CLASS_ONLY.exec(l)?.[1]).find(Boolean) || null;
const socketsOf = (lines) => {
  const s = lines.find((l) => /^Socketed \(/.test(l));
  return s ? parseInt(s.replace(/\D/g, ""), 10) || 0 : 0;
};
const isTwoHanded = (lines) =>
  lines.some((l) => /^Two-Hand Damage:/.test(l)) && !lines.some((l) => /^One-Hand Damage:/.test(l));

/**
 * @param {object} app  { TUD, SUD, SETD, RW, BASED, SOCKD, RIMG }
 * @param {object} planner  planner data.json
 */
export function createCatalog(app, planner) {
  const items = new Map();
  // Inventory art rendered from the game files (scripts/extract-item-art.mjs):
  // "game/<image>" → a graphic in the sprite sheets (ItemSprite.vue). Uniques and sets are matched
  // by name, using the base to pick between same-named items.
  const art = planner.itemArt;
  const plainBase = (n) => n?.replace(/\s*\((?:Sacred|\d+)\)$/i, "");
  // A base's art for a tier label ("Tier 2", "Sacred"); the highest tier by default.
  function baseArt(name, label) {
    const tiers = art?.bases[name];
    if (!tiers) return null;
    const a = (label != null && tiers[label]) || Object.values(tiers).at(-1);
    return a ? `game/${a}` : null;
  }
  function gameArt(def) {
    if (!art) return null;
    if (def.kind === "base") return baseArt(def.name, def.variants?.at(-1)?.label);
    const pick = (rows) => rows && (rows.find(([b]) => plainBase(b) === def.base) || rows[0])[1];
    const a =
      def.kind === "unique" || def.kind === "sacred" ? pick(art.uniques[def.name])
      : def.kind === "set" ? pick(art.sets[def.name])
      : null;
    return a ? `game/${a}` : null;
  }
  // The source data splits a few lines in two: "+10 to" | "Ranged Egg Trap",
  // "Innate Tri-Elemental Damage:" | "(25% of Dexterity)". Rejoin them so they parse.
  const joinBroken = (lines) => lines.reduce((out, l) => {
    const prev = out.at(-1);
    if (prev && (/ to$/.test(prev) || /Damage:$/.test(prev) && /^\(/.test(l))) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
    return out;
  }, []);
  const add = (def) => {
    for (const v of def.variants || []) v.lines = joinBroken(v.lines);
    def.slotType = def.slotType || slotTypeOf(def.cat);
    def.icon = gameArt(def) ?? def.icon ?? planner.baseIcons[def.base] ?? planner.baseIcons[def.name] ?? "";
    def.search = [def.name, def.base, def.cat, def.kindLabel, ...(def.variants?.flatMap((v) => v.lines) || [])]
      .join(" ")
      .toLowerCase();
    items.set(def.key, def);
  };
  // Jewellery and quivers aren't base items, so their categories are mapped directly.
  const baseCat = new Map([
    ...app.BASED.map((b) => [b.name, b.cat]),
    ["Amulet", "Amulets"], ["Ring", "Rings"], ["Jewel", "Jewels"],
    ["Arrow Quiver", "Arrow Quivers"], ["Bolt Quiver", "Crossbow Quivers"],
  ]);

  for (const b of app.BASED)
    add({
      key: `base:${b.id}`, kind: "base", kindLabel: "Base item", name: b.name, base: b.name, cat: b.cat,
      variants: b.t.map((t) => ({ label: t.label, lines: t.raw })),
    });
  for (const u of app.TUD)
    add({
      key: `tu:${u.id}`, kind: "unique", kindLabel: "Tiered unique", name: u.name, base: u.base, cat: u.cat,
      variants: u.t.map((t, i) => ({ label: u.t.length > 1 ? `Tier ${i + 1}` : "", lines: [...t.head, ...t.mods] })),
    });
  for (const u of app.SUD)
    add({
      key: `su:${u.id}`, kind: "sacred", kindLabel: "Sacred unique", name: u.name, base: u.base, cat: u.cat,
      variants: [{ label: "", lines: u.raw }],
    });
  for (const s of app.SETD)
    s.items.forEach((it, i) =>
      add({
        key: `set:${s.id}:${i}`, kind: "set", kindLabel: `Set · ${s.name}`, name: it.name, base: it.base,
        cat: baseCat.get(it.base) || "Other", setId: s.id,
        variants: [{ label: "", lines: it.raw }],
      }),
    );
  for (const r of app.RW)
    items.set(`rw:${r.id}`, {
      key: `rw:${r.id}`, kind: "runeword", kindLabel: "Runeword", name: r.name, runes: r.runes,
      bases: r.bases, allowed: r.allowed, except: r.except, lvl: r.lvl, lines: joinBroken(r.stats), cls: r.cls, slotType: r.slot === "armor" ? null : "weapon",
      search: [r.name, ...r.runes, ...r.bases, ...r.stats].join(" ").toLowerCase(),
    });
  for (const s of app.SOCKD)
    items.set(`sock:${s.id}`, {
      key: `sock:${s.id}`, kind: "socketable", kindLabel: s.group, name: s.name, lvl: s.lvl, img: s.img,
      slotLines: s.slots, search: [s.name, s.group, ...s.slots.flat()].join(" ").toLowerCase(),
    });
  for (const c of planner.inventory)
    items.set(`inv:${c.id}`, {
      key: `inv:${c.id}`, kind: c.kind, kindLabel: c.kind === "relic" ? "Relic" : "Charm", name: c.name,
      icon: c.icon, slotType: c.kind, variants: [{ label: "", lines: [`Required Level: ${c.reqLevel}`, ...c.lines] }],
      search: [c.name, ...c.lines].join(" ").toLowerCase(),
    });

  const skillByName = new Map(
    Object.entries(planner.skillNames)
      .map(([id, n]) => [n.toLowerCase(), id])
      .sort((a, b) => b[0].length - a[0].length),
  );
  const get = (key) => items.get(key);
  const all = () => [...items.values()];

  // Skill bonuses for another class: "+2 to Sorceress Skill Levels", "+2 to Fire Spells
  // (Sorceress Only)", "+25 to Arcane Torrent" (a Sorceress skill). A character can wear such an
  // item, but that part of it does nothing for them; Suggest gear and the starter builds leave
  // these items to their own class. Skills no class owns (a relic's Summon Frostwalker) are fine.
  const CLASS_NAMES = ["Amazon", "Assassin", "Barbarian", "Druid", "Necromancer", "Paladin", "Sorceress"];
  const skillClassOf = (name) => planner.skills?.[skillByName.get(name.toLowerCase())]?.class || null;
  function otherClassSkills(def, cls) {
    const lines = def.lines || def.variants?.at(-1)?.lines || [];
    const out = [];
    for (const l of lines) {
      let m;
      if ((m = /to (Amazon|Assassin|Barbarian|Druid|Necromancer|Paladin|Sorceress) Skill/i.exec(l))) { if (m[1] !== cls) out.push(l); continue; }
      if ((m = /\((\w+) Only\)/.exec(l)) && CLASS_NAMES.includes(m[1])) { if (m[1] !== cls) out.push(l); continue; }
      if ((m = /^\+(?:\d+|\(\d+ to \d+\)) to (.+?)$/.exec(l))) {
        const c = skillClassOf(m[1].trim());
        if (c && CLASS_NAMES.includes(c) && c !== cls) out.push(l);
      }
    }
    return out;
  }
  // An item with skill bonuses for several classes (Voidstream: +4 to Amazon and +4 to Paladin
  // Skill Levels) is each of those classes' item: it's left out only when none are for this one.
  const ownClassSkills = (def, cls) => {
    const lines = def.lines || def.variants?.at(-1)?.lines || [];
    return lines.some((l) => new RegExp(`to ${cls} Skill|\\(${cls} Only\\)`, "i").test(l)
      || (/^\+(?:\d+|\(\d+ to \d+\)) to (.+?)$/.exec(l) && skillClassOf(/^\+(?:\d+|\(\d+ to \d+\)) to (.+?)$/.exec(l)[1].trim()) === cls));
  };
  const forClass = (def, cls) => !cls || !def || otherClassSkills(def, cls).length === 0 || ownClassSkills(def, cls);

  // Items that fit a slot for a class (class-restricted items for other classes are left out).
  // Whether a gear item (or runeword base) can go in a slot for a class.
  function fitsSlot(d, slot, cls) {
    const def = SLOTS.find((s) => s.id === slot);
    if (!def?.accepts.includes(d.slotType)) return false;
    // Off-hand weapons: Barbarians dual-wield one-handed weapons, Assassins dual-wield claws.
    if (d.slotType === "weapon" && slot.startsWith("offhand")) {
      if (isTwoHanded(d.variants[0].lines)) return false;
      if (!(cls === "Barbarian" || (cls === "Assassin" && d.cat === "Assassin Claws"))) return false;
    }
    const c = lineClass(d.variants[0].lines);
    return !c || c === cls;
  }
  function forSlot(slot, cls) {
    return all().filter((d) => {
      if (d.kind === "runeword") return (!d.cls || d.cls === cls) && runewordBases(d).some((b) => fitsSlot(b, slot, cls));
      return ["base", "unique", "sacred", "set"].includes(d.kind) && fitsSlot(d, slot, cls);
    });
  }
  // The game's own allowed categories when extracted (runeword-bases.json); otherwise the
  // docs' base list, where only "Weapons" covers class items.
  function runewordBaseOk(rw, cat) {
    if (rw.allowed) return rw.allowed.includes(cat);
    if (rw.bases.includes(cat)) return true;
    return rw.bases.includes("Weapons") && slotTypeOf(cat) === "weapon" && !String(rw.except || "").split(", ").includes(cat);
  }
  function runewordBases(rw) {
    return app.BASED.filter((b) => runewordBaseOk(rw, b.cat) && b.t.some((t) => socketsOf(t.raw) >= rw.runes.length)).map(
      (b) => items.get(`base:${b.id}`),
    );
  }
  const socketables = () => all().filter((d) => d.kind === "socketable");
  // Jewels (unique jewels) can also go in sockets.
  const jewels = () => all().filter((d) => d.slotType === "jewel");

  /**
   * Resolves an equipped item into lines and numbers.
   * state: { ref, variant, rolls, sockets: [ref|null], socketCount, base, baseVariant, custom }
   */
  // Resolving an item parses every line of its text, and the planner resolves the same
  // equipped items for every candidate it scores, so results are cached by content.
  // Callers must treat a result as read-only: it is shared. Anything that edits catalogue
  // data in place (only tests do) calls clearResolved() afterwards.
  const resolved = new Map();
  function resolve(state, level) {
    if (!state) return null;
    const key = `${level}|${JSON.stringify(state)}`;
    let r = resolved.get(key);
    if (r === undefined) {
      if (resolved.size > 5000) resolved.clear();
      r = resolveFresh(state, level);
      if (globalThis.__FREEZE_RESOLVED__ && r) deepFreeze(r);
      resolved.set(key, r);
    }
    return r;
  }
  // Parsed lines, shared the same way: the same text recurs across items, sockets and orbs.
  const parsedLines = new Map();
  function parseCached(text, level) {
    const key = `${level}|${text}`;
    let p = parsedLines.get(key);
    if (p === undefined) {
      if (parsedLines.size > 20000) parsedLines.clear();
      parsedLines.set(key, (p = parseLine(text, { level, skillByName })));
    }
    return p;
  }
  // An orb's lines as applied to an item (doubled or quadrupled by some items).
  const orbParsedCache = new Map();
  function orbParsed(o, multiplier, level) {
    const key = `${o.id}|${multiplier}|${level}`;
    let parsed = orbParsedCache.get(key);
    if (!parsed)
      orbParsedCache.set(key, (parsed = o.lines.map(l => parseCached(l, level)).map(p => p.kind === 'stats'
        ? { ...p, effects: p.effects.map(([k, v]) => [k, v * multiplier]) }
        : p.kind === 'skill' ? { ...p, value: p.value * multiplier } : p)));
    return parsed;
  }
  // What a gem, rune or jewel adds in a socket of this item type.
  const socketFillCache = new Map();
  function socketFill(sd, slotType, level) {
    const key = `${sd.key}|${slotType}|${level}`;
    let fill = socketFillCache.get(key);
    if (!fill) {
      const lines = sd.kind === "socketable" ? sd.slotLines[socketKind(slotType)] : sd.variants[sd.variants.length - 1].lines.filter((l) => !/^(Required|Item Level)/.test(l));
      socketFillCache.set(key, (fill = { lines, parsed: lines.map((l) => parseCached(applyRolls(l).text, level)) }));
    }
    return fill;
  }
  const clearResolved = () => resolved.clear();
  function deepFreeze(o, seen = new Set()) {
    if (!o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) if (k !== "state" && k !== "def" && k !== "baseDef") deepFreeze(v, seen);
    Object.freeze(o);
  }
  function resolveFresh(state, level) {
    if (!state) return null;
    let def, lines, label = "", baseDef = null;
    if (state.ref === "custom") {
      const c = state.custom || {};
      def = { key: "custom", kind: "custom", kindLabel: "Custom item", name: c.name || "Custom item", slotType: c.slotType || "weapon", icon: "" };
      lines = String(c.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
      if (state.base) {
        baseDef = get(state.base);
        if (!baseDef || baseDef.kind !== 'base') return null;
        const v = baseDef.variants[Math.max(0, Math.min(state.baseVariant ?? 0, baseDef.variants.length - 1))];
        label = v.label;
        lines = [...v.lines, ...lines];
        def = { ...def, slotType: baseDef.slotType, cat: baseDef.cat, base: baseDef.name, icon: baseArt(baseDef.name, v.label) ?? baseDef.icon };
      }
    } else if (state.ref?.startsWith("rw:")) {
      def = get(state.ref);
      baseDef = get(state.base);
      if (!def || !baseDef) return null;
      const v = baseDef.variants[Math.min(state.baseVariant ?? baseDef.variants.length - 1, baseDef.variants.length - 1)];
      label = v.label;
      lines = [...v.lines.filter((l) => !/^Socketed/.test(l)), `Socketed (${def.runes.length})`, ...def.lines];
      def = { ...def, slotType: baseDef.slotType, cat: baseDef.cat, base: baseDef.name, icon: baseArt(baseDef.name, v.label) ?? baseDef.icon };
    } else {
      def = get(state.ref);
      // Socket fillers have no variants; they are only resolved inside an item.
      if (!def?.variants) return null;
      const v = def.variants[Math.min(state.variant ?? def.variants.length - 1, def.variants.length - 1)];
      label = v.label;
      if (def.kind === "base") def = { ...def, icon: baseArt(def.name, v.label) ?? def.icon };
      lines = v.lines;
    }

    // Superior quality (superior.js) for bases and runewords, and custom items on a base. Its
    // lines follow the item's own, so earlier rolls keep their sliders.
    const canBeSuperior = def.kind === "base" || def.kind === "runeword" || (def.kind === "custom" && !!baseDef);
    const superior = canBeSuperior ? superiorOf(state, def.slotType) : null;
    if (superior) lines = [...lines, ...superior.lines];

    // Rolls: one slider per "(a to b)" range, in line order.
    const rolled = [];
    const ranges = [];
    for (const l of lines) {
      const r = applyRolls(l, state.rolls || [], ranges.length);
      r.ranges.forEach((x) => ranges.push({ ...x, line: l }));
      rolled.push(r.text);
    }
    // Head values that depend on the item's own ED roll ("(29 - 31) to (33 - 35)").
    const edIndex = ranges.findIndex((r) => /Enhanced (Damage|Defense)$/.test(r.line) && !superior?.lines.includes(r.line));
    const edRoll = edIndex >= 0 ? state.rolls?.[edIndex] ?? 1 : 1;
    const head = { damage: null, defense: null, block: null, blockClass: false, reqLevel: 0, reqStr: 0, reqDex: 0, reqPct: 0, strPer: 0, dexPer: 0, innate: [], speedMod: null };
    // "+10 Required Level" lines (on the item or a socket filler) add after the fillers' own levels, like orbs.
    let reqAdd = 0;
    const addReq = (l) => { const m = /^\+(\d+) Required Level$/.exec(l); if (m) reqAdd += +m[1]; };
    for (const l of rolled) {
      let m;
      addReq(l);
      if ((m = /^(One-Hand|Two-Hand|Throw) Damage: (.+)$/.exec(l))) {
        const [min, max] = parseSpan(m[2], edRoll);
        if (!head.damage || m[1] === "One-Hand" || (m[1] === "Two-Hand" && head.damage.type === "Throw"))
          head.damage = { type: m[1], min, max };
      } else if ((m = /^Defense: (.+)$/.exec(l))) head.defense = parseSpan(m[1], edRoll)[1];
      else if ((m = /^Chance to Block: (.+)$/.exec(l))) {
        head.block = parseFloat(m[1]) || 0;
        head.blockClass = /Class/.test(m[1]);
      } else if ((m = /^Required Level: (.+)$/.exec(l))) head.reqLevel = Math.max(head.reqLevel, maxNum(m[1]));
      else if ((m = /^Required Strength: (.+)$/.exec(l))) head.reqStr = maxNum(m[1]);
      else if ((m = /^Required Dexterity: (.+)$/.exec(l))) head.reqDex = maxNum(m[1]);
      else if ((m = /^Requirements ([+-]?\d+)%$/.exec(l))) head.reqPct += +m[1];
      else if ((m = /^Strength Damage Bonus: \(([\d.]+) per Strength\)%$/.exec(l))) head.strPer = +m[1];
      else if ((m = /^Dexterity Damage Bonus: \(([\d.]+) per Dexterity\)%$/.exec(l))) head.dexPer = +m[1];
      else if ((m = /^Innate (.+) Damage: \(([\d.]+)% of (Strength|Dexterity|Energy|Vitality)\)$/.exec(l)))
        head.innate.push({ element: m[1], pct: +m[2], stat: m[3].toLowerCase() });
      else if ((m = /^Attack Speed Modifier: (-?\d+)$/.exec(l))) head.speedMod = +m[1];
    }
    if (def.kind === "runeword") head.reqLevel = Math.max(head.reqLevel, def.lvl || 0);

    // Honorific (a magic base item + a Mark of Infusion, from Shenk): mystic orbs count double
    // (the New Player Guide: "Honorific items receive DOUBLE bonus from mystic orbs").
    const honorific = !!state.honorific && def.kind === "base";
    const multiplier = orbMultiplier(rolled) * (honorific ? 2 : 1);
    const orbs = cleanOrbs(state.orbs).map(orbById).filter(o => orbFits(o, def, rolled, state)).map(o => {
      const parsed = orbParsed(o, multiplier, level);
      for (const l of o.lines) {
        const m = /^Requirements ([+-]?\d+)%$/.exec(l);
        if (m) head.reqPct += Number(m[1]) * multiplier;
      }
      return { def: o, parsed };
    });
    if (head.reqPct) {
      head.reqStr = Math.max(0, Math.round(head.reqStr * (1 + head.reqPct / 100)));
      head.reqDex = Math.max(0, Math.round(head.reqDex * (1 + head.reqPct / 100)));
    }

    const maxSockets = socketsOf(rolled);
    // Uniques, sets and runewords always have max sockets; base items roll 0 to max.
    const socketCount = def.kind === "base" || def.kind === "custom" ? Math.min(state.socketCount ?? 0, maxSockets) : maxSockets;
    const parsed = rolled.map((l) => parseCached(l, level));

    // Socket contents (runewords already include their runes' stats).
    const sockets = [];
    if (def.kind !== "runeword")
      for (let i = 0; i < socketCount; i++) {
        const ref = state.sockets?.[i];
        const sd = ref ? get(ref) : null;
        if (!sd) {
          sockets.push(null);
          continue;
        }
        sockets.push({ def: sd, ...socketFill(sd, def.slotType, level) });
      }

    for (const s of sockets.filter(Boolean)) {
      const d = s.def;
      const required = d.kind === 'socketable' ? d.lvl || 0 : maxNum(d.variants.at(-1).lines.find(l => /^Required Level:/.test(l)) || '0');
      head.reqLevel = Math.max(head.reqLevel, required);
      s.lines.forEach(addReq);
    }
    head.reqLevel += reqAdd;
    head.reqLevel += orbs.reduce((n, o) => n + o.def.reqLevel, 0);
    return { state, def, baseDef, label, lines: rolled, ranges, head, parsed, sockets, orbs, maxSockets, socketCount, twoHanded: isTwoHanded(lines), cls: lineClass(lines), superior, canBeSuperior, honorific };
  }

  const setById = (id) => app.SETD.find((s) => s.id === id);
  const parseLines = (lines, level) => lines.map((l) => parseLine(applyRolls(l).text, { level, skillByName }));
  // Runewords have no art of their own in game (they look like their base): the list
  // shows the first base they can be made in; an equipped runeword shows its chosen base.
  for (const def of items.values())
    if (def.kind === "runeword") {
      def.icon = runewordBases(def)[0]?.icon ?? "";
    }

  return { get, all, otherClassSkills, forClass, forSlot, fitsSlot, runewordBases, socketables, jewels, resolve, clearResolved, orbParsed, socketFill, skillByName, setById, parseLines, images: app.RIMG };
}

const maxNum = (s) => Math.max(...String(s).match(/-?\d+(\.\d+)?/g)?.map(Number) || [0]);
