// The Horadric Cube, run on the game's own recipe table (src/data/cube-main.json, from
// scripts/extract-cube.mjs). Transmuting works as it does in game: a recipe needs exactly its
// ingredients (nothing more in the cube), the first recipe in the table that fits wins, and
// the ingredients are replaced by what the recipe makes.
import { CLASSES, propertyLines, propertyStats } from "./stats.js";

export const QUALITIES = { 1: "Low quality", 2: "Normal", 3: "Superior", 4: "Magic", 5: "Set", 6: "Rare", 7: "Unique", 8: "Crafted", 9: "Honorific" };
export const DIFFICULTIES = ["Normal", "Nightmare", "Hell"];
export { CLASSES };

const IN = { ITEM: 1, TYPE: 2, NO_SOCKETS: 4, SOCKETED: 8, ETHEREAL: 0x10, NOT_ETHEREAL: 0x20, SPECIFIC: 0x40 };
const OUT = { KEEP: 1, SPECIFIC: 8 };
// The input flags that say what the item is (not what state it must be in).
const KIND = IN.ITEM | IN.TYPE | IN.SPECIFIC;
const T = { ITEM: 0xfc, TYPE: 0xfd, CHANGE_FIRST: 0xfe, REROLL_FIRST: 0xff, PORTAL: 1 };
// Conditions on the first ingredient's stats (checked against data: a rune container gives
// its last rune back at quantity 1 (op 18) and one of several at 2 or more (op 15); shrine
// blessing needs "Shrine Blessed" at 0 (op 16); enhancing a rare needs fewer than 3 suffixes
// (op 17)); ops 3 and 4 compare the character's level.
const ITEM_OPS = { 15: (a, b) => a >= b, 16: (a, b) => a <= b, 17: (a, b) => a < b, 18: (a, b) => a === b };
const LEVEL_OPS = { 3: (a, b) => a >= b, 4: (a, b) => a <= b };
const STAT = { LEVEL: 12 };

let nextId = 1;

export function createCube(data) {
  const items = new Map(data.items.map(([code, name, types, group, sub = ""]) => [code, { code, name, sub, types: new Set(types), group }]));
  const typeName = (code) => data.types[code] || code;
  const specialName = (quality, id) => (quality === 5 ? data.sets : data.uniques)[id]?.[0] || null;
  // [row, minDifficulty, class, op, numInputs, inputs, outputs] → an object, once.
  const recipes = data.recipes.map(([row, difficulty, cls, op, count, inputs, outputs]) => ({
    row, difficulty, cls: cls === 255 ? null : cls, op: op || null, count,
    inputs: inputs.map(([flags, key, id, quality, qty]) => ({ flags, key, id, quality, qty })),
    outputs: outputs.map(([type, flags, key, id, quality, qty, lvl, ilvl, mods]) => ({ type, flags, key, id, quality, qty, lvl, ilvl, mods })),
  }));

  // Hidden stats recipes read (scripts/extract-cube.mjs): rolls stored on an item when it's
  // made, picks the game rolls as it transmutes, and counters of an item's upgrade steps.
  const hidden = data.hidden || { rolls: {}, picks: {}, counters: [] };
  const rollMax = (stat) => hidden.rolls[stat] || hidden.picks[stat] || 0;
  const counters = new Set(hidden.counters);
  // The chance of each random outcome: recipes with the same ingredients testing the same
  // roll, in table order. "At most t" (op 16) outcomes take the rolls above the one before;
  // "exactly v" picks (op 18) are one of the family's values.
  const families = new Map();
  let familyId = 0;
  for (const r of recipes) {
    if (!r.op || !rollMax(r.op[1])) continue;
    const key = JSON.stringify([r.inputs, r.op[1], r.cls, r.difficulty]);
    (families.get(key) ?? families.set(key, []).get(key)).push(r);
  }
  for (const fam of families.values()) {
    const [, stat] = fam[0].op;
    familyId++;
    for (const r of fam) r.family = familyId;
    if (hidden.picks[stat]) { for (const r of fam) r.chance = 1 / fam.length; continue; }
    let prev = 0;
    for (const r of fam) {
      const [op, , value] = r.op;
      if (op === 16) { r.chance = Math.max(0, value - prev) / hidden.rolls[stat]; prev = Math.max(prev, value); }
      else if (op === 18 && value === 0) r.unrolled = true;
    }
  }

  // Which recipes an item could be an ingredient of (by its code or any of its types).
  const byKey = new Map();
  recipes.forEach((r, i) => r.inputs.forEach((inp) => (byKey.get(inp.key) ?? byKey.set(inp.key, new Set()).get(inp.key)).add(i)));
  const recipesFor = (code) => {
    const out = new Set(byKey.get(code));
    for (const t of items.get(code)?.types || []) for (const i of byKey.get(t) || []) out.add(i);
    return out;
  };

  // Items the game always makes with a roll on them (a Treasure of Fiacla Gear gets 1-10000
  // from the recipe that makes it): they get one when put in the cube. Other items have none,
  // so recipes that read a roll (revealing a hidden bonus) don't work on them.
  const madeWithRoll = new Map();
  for (const r of recipes)
    for (const o of r.outputs) {
      if (o.type !== T.ITEM) continue;
      for (const [prop, , min, max] of o.mods)
        for (const [, stat] of data.props[prop] || []) if (hidden.rolls[stat] && min < max) madeWithRoll.set(o.key, [stat, min, max]);
    }

  // A cube item: an item code plus what recipes look at.
  function makeItem(code, extra = {}) {
    const base = items.get(code);
    const stats = { ...(extra.stats || {}) };
    // A container or charged item holds at least one (editable on the item).
    for (const c of checks(code).stats) if (/^(Quantity|Charges)$/.test(c.label) && stats[c.stat] === undefined) stats[c.stat] = 1;
    const roll = madeWithRoll.get(code);
    if (roll && stats[roll[0]] === undefined) stats[roll[0]] = roll[1] + Math.floor(Math.random() * (roll[2] - roll[1] + 1));
    return { id: nextId++, code, quality: 2, special: 0, ethereal: false, sockets: 0, lines: [], ...extra, stats, name: extra.name || base?.name || code };
  }

  // Items that are one base in several versions: tiers ("Angel Star (1)" to "(4)" and
  // "(Sacred)"), a shrine's charges ("Creepy Shrine (10)"), shard sizes.
  const VERSION = /^(.*?) \((\d+|Sacred|Angelic|Mastercrafted)\)$/;
  const order = (label) => (/^\d+$/.test(label) ? +label : { Sacred: 100, Angelic: 101, Mastercrafted: 102 }[label]);
  const versions = new Map();
  for (const it of items.values()) {
    const m = VERSION.exec(it.name);
    if (!m) continue;
    const key = `${it.group}|${m[1]}`;
    (versions.get(key) ?? versions.set(key, { base: m[1], list: [] }).get(key)).list.push({ code: it.code, label: m[2] });
  }
  const versionOf = new Map();
  for (const v of versions.values()) {
    if (v.list.length < 2) continue;
    v.list.sort((a, b) => order(a.label) - order(b.label));
    const gear = ["weapon", "armor"].includes(items.get(v.list[0].code)?.group);
    v.kind = /Shrine$/.test(v.base) ? "Charges" : gear ? "Tier" : "Version";
    // A shrine usually goes in full; a tiered base at its first tier.
    v.default = v.kind === "Charges" ? v.list[v.list.length - 1].code : v.list[0].code;
    for (const x of v.list) versionOf.set(x.code, v);
  }
  const variantsOf = (code) => versionOf.get(code) || null;
  // "Quantity: 3", "Charges: 1", "Suffixes: 2": stats the game shows as a running count.
  const isCounter = (stat) => data.stats[stat]?.[0] === 3 && data.stats[stat]?.[1] === 2 && /:$/.test(data.stats[stat][2]);
  const itemLines = (it) => [
    ...Object.entries(it.stats).filter(([st, v]) => isCounter(st) && v).map(([st, v]) => `${data.stats[st][2]} ${v}`),
    ...it.lines,
  ];
  // Yes/no stats ("Shrine Blessed", "Already Upgraded", "Cannot be Unsocketed"): off unless set.
  const isFlag = (stat) => (data.stats[stat]?.[0] === 3 && data.stats[stat]?.[1] === 0) || /^(Cannot|Already)/.test(data.stats[stat]?.[2] || "");
  // Item art (graphic names in the sprite sheets): a named unique or set item's own, else its base's.
  const art = data.art || {};
  const artOf = (it) => (it.special && art[`${it.quality}:${it.special}`]) || art[it.code] || null;
  const maxSocketsOf = (code) => data.maxSockets?.[code] ?? 6;
  // The uniques a recipe making "a unique" of this base can roll, as the game picks them: the
  // base's uniques whose level is at most the new item's level, weighted by rarity (a Hand
  // Axe (1) can only become Brainhack). Empty: none can roll, and the game makes a rare instead.
  function uniqueChoices(code, ilvl = 100) {
    const pool = (data.uniquesByBase?.[code] || []).filter(([, rarity, lvl]) => rarity > 0 && lvl <= ilvl);
    const total = pool.reduce((n, [, rarity]) => n + rarity, 0);
    return pool.map(([id, rarity]) => ({ id, name: data.uniques[id]?.[0] || "a unique", chance: rarity / total, art: art[`7:${id}`] || art[code] || null }));
  }
  function rollUnique(it, ilvl, random, notes) {
    const choices = uniqueChoices(it.code, ilvl);
    if (!choices.length) {
      it.quality = 6;
      notes.push(`No unique can roll on ${items.get(it.code)?.name || "this base"}, so it became a rare item (as Diablo II does).`);
      return;
    }
    let r = random();
    const pick = choices.find((c) => (r -= c.chance) < 0) || choices[choices.length - 1];
    it.special = pick.id;
    if (choices.length > 1) notes.push(`It could have been ${choices.map((c) => `${c.name} (${Math.round(c.chance * 100)}%)`).join(", ")}.`);
  }
  const itemName = (it) => (it.special ? specialName(it.quality, it.special) || it.name : it.name);

  function fits(it, inp) {
    if (inp.flags & IN.TYPE) { if (!items.get(it.code)?.types.has(inp.key)) return false; }
    else if (it.code !== inp.key) return false;
    if (inp.quality && it.quality !== inp.quality) return false;
    if (inp.flags & IN.SPECIFIC && it.special !== inp.id) return false;
    if (inp.flags & IN.NO_SOCKETS && it.sockets > 0) return false;
    if (inp.flags & IN.SOCKETED && !(it.sockets > 0)) return false;
    if (inp.flags & IN.ETHEREAL && !it.ethereal) return false;
    if (inp.flags & IN.NOT_ETHEREAL && it.ethereal) return false;
    return true;
  }

  // Assign every cube item to an ingredient slot (each ingredient takes qty items). Returns the
  // item that fills the first ingredient, or null. With `partial`, ingredients may be left
  // short (for "what could this make"); the result then also lists what's missing.
  function assign(recipe, contents, partial = false) {
    const need = recipe.inputs.map((i) => i.qty);
    const slotOf = new Array(contents.length);
    const order = contents.map((_, i) => i).sort((a, b) => candidates(a).length - candidates(b).length);
    function candidates(i) { return recipe.inputs.map((inp, k) => k).filter((k) => fits(contents[i], recipe.inputs[k])); }
    const cand = contents.map((_, i) => candidates(i));
    const walk = (n) => {
      if (n === order.length) return true;
      const i = order[n];
      for (const k of cand[i]) {
        if (!need[k]) continue;
        need[k]--; slotOf[i] = k;
        if (walk(n + 1)) return true;
        need[k]++;
      }
      return false;
    };
    if (!walk(0)) return null;
    if (!partial && need.some((n) => n > 0)) return null;
    const first = contents.find((_, i) => slotOf[i] === 0) || null;
    return { first, missing: recipe.inputs.map((inp, k) => ({ ...inp, qty: need[k] })).filter((m) => m.qty > 0) };
  }

  // Conditions: true, false, "random" (it depends on a roll that isn't made yet), or
  // "unknown" for the ones this simulator can't check (quests, events, and a few Median XL
  // checks); those count as met, with a note. With a roll function, missing rolls are made:
  // stored on the item (rolls), or once for this transmute (picks, kept in `picked`).
  function condition(recipe, first, ctx, roll = null, picked = {}) {
    if (!recipe.op) return true;
    const [op, stat, value] = recipe.op;
    if (ITEM_OPS[op]) {
      let v = first?.stats[stat];
      if (hidden.picks[stat]) {
        if (!roll) return "random";
        v = picked[stat] ??= 1 + Math.floor(roll() * hidden.picks[stat]);
      } else if (hidden.rolls[stat]) {
        // No roll on the item: only the "not rolled" recipe applies. With one, which outcome
        // it gives stays hidden in lists (the game doesn't show it either).
        if (!v) return !!recipe.unrolled;
        if (!roll) return recipe.unrolled ? false : "random";
      } else if (v === undefined && !isFlag(stat) && !counters.has(stat)) {
        // A real stat of the item the simulator doesn't know (its required level, magic find).
        return "unknown";
      }
      return ITEM_OPS[op](v ?? 0, value);
    }
    if (LEVEL_OPS[op] && stat === STAT.LEVEL) return LEVEL_OPS[op](ctx.level ?? 1, value);
    return "unknown";
  }
  const allowed = (recipe, ctx) => (recipe.cls === null || recipe.cls === ctx.cls) && (ctx.difficulty ?? 2) >= recipe.difficulty;

  // What a transmute does with these cube contents, for this character. Random outcomes
  // are rolled with `random` (Math.random unless a test passes its own).
  function transmute(contents, ctx = {}, random = Math.random) {
    if (!contents.length) return { matched: false, contents, reason: "empty" };
    // Copies, so rolls made now stay on the items this transmute returns.
    const items = contents.map((it) => ({ ...it, stats: { ...it.stats } }));
    const total = items.length, picked = {};
    for (const recipe of recipes) {
      if (recipe.inputs.reduce((n, i) => n + i.qty, 0) !== total) continue;
      const a = assign(recipe, items);
      if (!a || !allowed(recipe, ctx)) continue;
      const met = condition(recipe, a.first, ctx, random, picked);
      if (met === false) continue;
      return { matched: true, recipe, ...produce(recipe, a.first, random), unchecked: met === "unknown", random: recipe.chance !== undefined };
    }
    return { matched: false, contents, reason: "none" };
  }

  // The recipe's outputs, made from its first ingredient where the recipe says so.
  function produce(recipe, first, random = Math.random) {
    const out = [], effects = [], notes = [];
    const addMods = (it, mods) => {
      for (const m of mods) {
        // Socket punching sets the item's sockets (shown as "Socketed (n)" on the item), up to
        // what its base can have: a Tier 1 base takes 1 or 2 whatever goes in with it.
        if ((data.props[m[0]] || []).some(([f]) => f === 14)) {
          const most = maxSocketsOf(it.code);
          it.sockets = Math.min(m[2], most);
          if (m[2] > most) notes.push(`${itemName(it)} can have at most ${most} socket${most === 1 ? "" : "s"}, so it got ${most}; the extra Jewels are used up anyway.`);
          continue;
        }
        const stats = propertyStats(data, m);
        for (const [stat, v] of stats) it.stats[stat] = (it.stats[stat] ?? 0) + v;
        // A roll stored on the new item (a Treasure of Fiacla's 1-10000).
        const [prop, , min, max] = m;
        if (min < max) for (const [, stat] of data.props[prop] || []) if (hidden.rolls[stat]) it.stats[stat] = min + Math.floor(random() * (max - min + 1));
        // Counters (Quantity, Charges) are shown at their current value, not as a change.
        if (!(stats.length && stats.every(([stat]) => isCounter(stat)))) it.lines = [...new Set([...it.lines, ...propertyLines(data, m)])];
      }
    };
    for (const o of recipe.outputs) {
      if (o.type === T.PORTAL) { effects.push(`Opens a portal to ${data.levels[o.quality] || "another area"}`); continue; }
      if (o.type === T.CHANGE_FIRST) {
        if (!first) continue;
        const it = { ...first, id: nextId++, stats: { ...first.stats }, lines: [...first.lines] };
        if (o.quality) it.quality = o.quality;
        addMods(it, o.mods);
        out.push(it);
        continue;
      }
      if (o.type === T.REROLL_FIRST) {
        if (!first) continue;
        const it = makeItem(first.code, { quality: o.quality || first.quality, ethereal: first.ethereal, rerolled: true });
        if (it.quality === 7) rollUnique(it, o.lvl || o.ilvl || 100, random, notes);
        addMods(it, o.mods);
        out.push(it);
        continue;
      }
      if (o.type === T.ITEM) {
        const keep = o.flags & OUT.KEEP && first;
        const it = makeItem(o.key, keep ? { quality: first.quality, special: first.special, ethereal: first.ethereal, sockets: first.sockets, stats: { ...first.stats }, lines: [...first.lines] } : {});
        if (o.flags & OUT.SPECIFIC) { it.quality = o.quality; it.special = o.id; }
        else if (o.quality) {
          it.quality = o.quality;
          if (o.quality === 7 && !keep) rollUnique(it, o.lvl || o.ilvl || 100, random, notes);
        }
        addMods(it, o.mods);
        out.push(it);
        continue;
      }
      if (o.type === T.TYPE) { out.push(makeItem(null, { name: `A random ${typeName(o.key).toLowerCase()}`, random: true })); continue; }
      effects.push("A special effect of the game (not simulated)");
    }
    return { contents: out, effects, notes };
  }

  // Readable ingredient and output text.
  function inputText(inp) {
    const qual = inp.quality ? `${QUALITIES[inp.quality]} ` : "";
    let what = inp.flags & IN.TYPE ? typeName(inp.key) : items.get(inp.key)?.name || inp.key;
    const hint = !(inp.flags & IN.TYPE) && !(inp.flags & IN.SPECIFIC) ? hintOf(inp.key) : "";
    if (hint) what = `${what} (${hint})`;
    if (inp.flags & IN.SPECIFIC) what = specialName(inp.quality, inp.id) || what;
    const bits = [];
    if (inp.flags & IN.NO_SOCKETS) bits.push("no sockets");
    if (inp.flags & IN.SOCKETED) bits.push("socketed");
    if (inp.flags & IN.ETHEREAL) bits.push("ethereal");
    if (inp.flags & IN.NOT_ETHEREAL) bits.push("not ethereal");
    // "Any unique item", "Rare Sacred armor".
    const name = inp.flags & IN.SPECIFIC ? what : /^Any /.test(what) && qual ? `Any ${qual.toLowerCase()}${what.slice(4)}` : `${qual}${what}`;
    return `${inp.qty > 1 ? `${inp.qty} × ` : ""}${name}${bits.length ? ` (${bits.join(", ")})` : ""}`;
  }
  function outputText(o, recipe) {
    const first = recipe.inputs[0] ? inputText({ ...recipe.inputs[0], qty: 1 }) : "the item";
    // The result keeps the ingredient's name without what it had to be ("no sockets").
    const plainFirst = recipe.inputs[0] ? inputText({ ...recipe.inputs[0], qty: 1, flags: recipe.inputs[0].flags & KIND }) : "the item";
    // Changing the first ingredient's Quantity or Charges reads as a change ("Quantity −1").
    const lines = o.mods.flatMap((m) => {
      const st = propertyStats(data, m);
      if (o.type === T.CHANGE_FIRST && st.length && st.every(([x]) => isCounter(x))) return st.map(([x, v]) => `${data.stats[x][2].replace(/:$/, "")} ${v < 0 ? "−" : "+"}${Math.abs(v)}`);
      // Sockets are capped at what the base can have (a tier 1 base takes 1 or 2).
      if ((data.props[m[0]] || []).some(([f]) => f === 14) && m[2] > 1) return [`Socketed (${m[2]}, or the base's most if fewer)`];
      return propertyLines(data, m);
    });
    if (o.type === T.PORTAL) return { name: `Portal to ${data.levels[o.quality] || "another area"}`, lines };
    if (o.type === T.CHANGE_FIRST) return { name: `${plainFirst}${o.quality ? `, now ${QUALITIES[o.quality]}` : ""}`, lines, changed: true };
    if (o.type === T.REROLL_FIRST) {
      const base = recipe.inputs[0] ? inputText({ ...recipe.inputs[0], quality: 0, qty: 1, flags: recipe.inputs[0].flags & KIND }) : "item";
      return { name: `New ${o.quality ? `${QUALITIES[o.quality]} ` : ""}${base}`, lines, rerolled: true };
    }
    if (o.type === T.TYPE) return { name: `A random ${typeName(o.key).toLowerCase()}`, lines };
    if (o.type === T.ITEM) {
      const name = o.flags & OUT.SPECIFIC ? specialName(o.quality, o.id) || items.get(o.key)?.name : `${o.quality ? `${QUALITIES[o.quality]} ` : ""}${items.get(o.key)?.name || o.key}`;
      return { name: `${o.qty > 1 ? `${o.qty} × ` : ""}${name}`, lines, keeps: !!(o.flags & OUT.KEEP) };
    }
    return { name: "A special effect", lines };
  }
  const pct = (x) => (x >= 0.1 ? `${Math.round(x * 100)}%` : x >= 0.001 ? `${+(x * 100).toFixed(2)}%` : `${+(x * 100).toFixed(3)}%`);
  function conditionText(recipe) {
    const out = [];
    if (recipe.cls !== null) out.push(`${CLASSES[recipe.cls]} only`);
    if (recipe.difficulty) out.push(`${DIFFICULTIES[recipe.difficulty]}${recipe.difficulty < 2 ? " or higher" : ""}`);
    if (!recipe.op) return out;
    const [op, stat, value] = recipe.op;
    const name = data.stats[stat]?.[2]?.replace(/:$/, "");
    const words = { 15: "at least", 16: "at most", 17: "less than", 18: "exactly" };
    if (recipe.chance !== undefined) out.push(hidden.picks[stat] ? `Random: 1 in ${Math.round(1 / recipe.chance)}` : `Random: ${pct(recipe.chance)} chance`);
    else if (recipe.unrolled) out.push("Before the item's hidden roll is made (nothing happens)");
    else if (ITEM_OPS[op] && counters.has(stat)) {
      // A hidden count of this item's upgrade steps (the game doesn't show it).
      const steps = (n) => `${n} upgrade step${n === 1 ? "" : "s"}`;
      const none = (op === 18 && value === 0) || (op === 16 && value === 0) || (op === 17 && value === 1);
      out.push(none ? "Only if this upgrade isn't done yet" : op === 18 ? `After ${steps(value)} on this item`
        : op === 17 ? `Fewer than ${steps(value)} done on this item` : op === 16 ? `At most ${steps(value)} done on this item` : `At least ${steps(value)} done on this item`);
    } else if (ITEM_OPS[op] && name) {
      // "Not Shrine Blessed", "Has Cannot Be Frozen", "At least 6 to Enemy Fire Resistance".
      const zero = (op === 18 && value === 0) || (op === 16 && value === 0) || (op === 17 && value === 1);
      const some = (op === 15 && value === 1) || (op === 18 && value === 1);
      const words2 = { 15: "At least", 16: "At most", 17: "Less than", 18: "Exactly" };
      const flag = (data.stats[stat][0] === 3 && data.stats[stat][1] === 0) || /^(Cannot|Already)/.test(name);
      if (flag && zero) out.push(`Not "${name}"`);
      else if (flag && some) out.push(`Has "${name}"`);
      else if (zero && !isCounter(stat)) out.push(`No ${name.replace(/^to /, "")} on it`);
      else out.push(/^to /.test(name) || /^[a-z]/.test(name) ? `${words2[op]} ${value} ${name}` : `${name} ${words[op]} ${value}`);
    } else if (LEVEL_OPS[op] && stat === STAT.LEVEL) out.push(`Character level ${op === 3 ? "at least" : "at most"} ${value}`);
    else out.push("A game condition this simulator can't check (such as a quest or an event)");
    return out;
  }
  // Recipes that hand every ingredient back unchanged: how the game blocks a combination
  // (a quest item that isn't ready, a unique that can't be upgraded).
  const blocks = (recipe) => recipe.outputs.length === recipe.inputs.length && recipe.outputs.every((o, k) => {
    const inp = recipe.inputs[k];
    return (o.type === T.CHANGE_FIRST && k === 0 && !o.mods.length && !o.quality) || (o.type === T.ITEM && !(inp.flags & IN.TYPE) && o.key === inp.key && !o.mods.length && inp.qty === 1);
  });
  // Pictures for a recipe: each ingredient (a type shows one of its items, marked "any"), and
  // each result (a changed first ingredient shows that ingredient's picture).
  function inputIcon(inp) {
    const ex = exampleFor(inp);
    return { art: ex ? artOf(ex) : null, qty: inp.qty, any: !!(inp.flags & IN.TYPE), text: inputText({ ...inp, qty: 1 }) };
  }
  function outputIcon(o, recipe) {
    const t = outputText(o, recipe);
    if (o.type === T.PORTAL) return { art: null, portal: true, text: t.name };
    if (o.type === T.CHANGE_FIRST || o.type === T.REROLL_FIRST) return { ...inputIcon(recipe.inputs[0]), qty: 1, text: t.name };
    if (o.type === T.TYPE) { const ex = exampleFor({ flags: IN.TYPE, key: o.key }); return { art: ex ? artOf(ex) : null, any: true, text: t.name }; }
    if (o.type === T.ITEM) return { art: (o.flags & OUT.SPECIFIC && art[`${o.quality}:${o.id}`]) || art[o.key] || null, qty: o.qty > 1 ? o.qty : 1, text: t.name };
    return { art: null, text: t.name };
  }
  const describe = (recipe) => ({
    inputs: recipe.inputs.map(inputText),
    outputs: recipe.outputs.map((o) => ({ ...outputText(o, recipe), icon: outputIcon(o, recipe) })),
    inputIcons: recipe.inputs.map(inputIcon),
    conditions: conditionText(recipe),
    blocked: blocks(recipe),
  });
  // Items that share a name ("Amulet": the usual one and the bases of a few uniques; nine
  // "Scroll of Enchantment: Helmet", each adding a different bonus). Each gets a short hint
  // saying what's different: the unique or set items made on it when there are only a few,
  // otherwise the first result of its recipes that the others don't have. Items that behave
  // the same in every recipe are listed once, and a base only a named unique uses is left out
  // (that unique is in the list).
  const hints = new Map(), hiddenItems = new Set();
  let hinting = false;
  const typeSize = new Map();
  for (const it of items.values()) for (const t of it.types) typeSize.set(t, (typeSize.get(t) || 0) + 1);
  function buildHints() {
    hinting = true;
    const groups = new Map();
    for (const it of items.values()) if (!versionOf.has(it.code) && recipesFor(it.code).size) (groups.get(it.name) ?? groups.set(it.name, []).get(it.name)).push(it);
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const info = group.map((it) => {
        // Recipes that take this item as itself or by a type the others don't share (and not
        // as a named unique, nor by a catch-all type such as "any item").
        const takes = (inp) => !(inp.flags & IN.SPECIFIC) && (inp.key === it.code || (it.types.has(inp.key) && (typeSize.get(inp.key) || 0) < 300 && !group.every((m) => m.types.has(inp.key))));
        const own = [...recipesFor(it.code)].map((i) => recipes[i]).filter((r) => r.inputs.some(takes));
        const plain = [...recipesFor(it.code)].some((i) => recipes[i].inputs.some((inp) => !(inp.flags & IN.SPECIFIC) && (inp.key === it.code || (it.types.has(inp.key) && (typeSize.get(inp.key) || 0) < 300))));
        // What it gives: the result lines first (a scroll's bonus), then result names (the set
        // item an Explorer's Cache opens into).
        const lines = [], names = [];
        for (const r of own) for (const o of r.outputs) { const t = outputText(o, r); names.push(t.name); lines.push(...t.lines); }
        const results = [...lines, ...names];
        return { it, plain, results, sig: JSON.stringify(own.map((r) => [r.inputs.map((x) => (x.key === it.code ? "self" : x.key)), r.outputs.map((o) => [o.type, o.key === it.code ? "self" : o.key, o.mods])])), made: data.madeOn?.[it.code] || [] };
      });
      const seen = new Set();
      for (const x of info) {
        if (!x.plain) { hiddenItems.add(x.it.code); continue; }
        if (seen.has(x.sig)) { hiddenItems.add(x.it.code); continue; }
        seen.add(x.sig);
      }
      const shown = info.filter((x) => !hiddenItems.has(x.it.code));
      if (shown.length < 2) continue;
      for (const x of shown) {
        if (x.made.length > 4) { hints.set(x.it.code, "the usual one"); continue; }
        if (x.made.length) { hints.set(x.it.code, `base of ${x.made.join(", ")}`); continue; }
        // A Custom Signet of Learning's code is how many signets it holds ("11^" is made of 11).
        const signets = /^(\d+)\^$/.exec(x.it.code);
        if (signets) { hints.set(x.it.code, `holds ${+signets[1]} signets`); continue; }
        const others = shown.filter((y) => y !== x);
        const unique = x.results.find((t) => t && !others.some((y) => y.results.includes(t)) && !/^Already|^Charges|Required Level$/.test(t));
        if (unique) hints.set(x.it.code, unique);
      }
      // The one without a hint, when all the others have one, is the usual item.
      const bare = shown.filter((x) => !hints.has(x.it.code));
      if (bare.length === 1) hints.set(bare[0].it.code, "the usual one");
      else bare.forEach((x, k) => hints.set(x.it.code, `version ${k + 1}`));
    }
    // Unique and set items that share a name (four "Relic" uniques, each turning an Elemental
    // Band a different element): keep the ones some recipe names, and say what's different:
    // their base when the bases differ, else what their recipe makes.
    const specials = new Map();
    for (const [list, quality] of [[data.uniques, 7], [data.sets, 5]])
      for (const [id, [name, code]] of Object.entries(list)) (specials.get(name) ?? specials.set(name, []).get(name)).push({ key: `${quality}:${id}`, id: +id, quality, code });
    for (const group of specials.values()) {
      if (group.length < 2) continue;
      for (const x of group) {
        x.recipes = recipes.filter((r) => r.inputs.some((inp) => inp.flags & IN.SPECIFIC && inp.id === x.id && (inp.quality === 5) === (x.quality === 5)));
      }
      if (group.some((x) => x.recipes.length)) for (const x of group) if (!x.recipes.length) hiddenItems.add(x.key);
      const shown = group.filter((x) => !hiddenItems.has(x.key));
      if (shown.length < 2) continue;
      const bases = new Set(shown.map((x) => items.get(x.code)?.name));
      for (const x of shown) {
        if (bases.size === shown.length) { hints.set(x.key, items.get(x.code)?.name || ""); continue; }
        if (!x.recipes.length) { hints.set(x.key, items.get(x.code)?.name || ""); continue; }
        const results = x.recipes.flatMap((r) => r.outputs.map((o) => outputText(o, r))).flatMap((t) => [...t.lines, t.name]);
        const others = shown.filter((y) => y !== x).map((y) => y.recipes.flatMap((r) => r.outputs.map((o) => outputText(o, r))).flatMap((t) => [...t.lines, t.name]));
        const unique = results.find((t) => t && !others.some((o) => o.includes(t)));
        hints.set(x.key, unique ? `makes ${unique}` : `version ${shown.indexOf(x) + 1}`);
      }
    }
    hinting = false;
  }
  let built = false;
  const ensureHints = () => { if (!built && !hinting) { built = true; buildHints(); } };
  function hintOf(code) { if (hinting) return ""; ensureHints(); return hints.get(code) || ""; }
  // Items by code, and unique or set items by "quality:id" (those can always be disenchanted
  // or turned into signets, so only duplicates are left out).
  const listed = (key) => { ensureHints(); return !hiddenItems.has(key) && (key.includes(":") || usable(key)); };
  // Some recipe names this item, by itself or by a type that isn't a catch-all ("any weapon"
  // also covers throwing potions, which no recipe is meant for). Unused dummy rows don't count.
  const usableCache = new Map();
  function usable(code) {
    if (usableCache.has(code)) return usableCache.get(code);
    const it = items.get(code);
    const ok = !!it && !/POLAR BUFFALO|^unused$|^dummy/i.test(it.name) && [...recipesFor(code)].some((i) =>
      recipes[i].inputs.some((inp) => inp.key === code || (it.types.has(inp.key) && (typeSize.get(inp.key) || 0) < 300)));
    usableCache.set(code, ok);
    return ok;
  }

  // Recipes that differ only in which tiered base or shrine they take ("Hand Axe (1)" → "(2)")
  // are one family in lists: the same key with those names generalised.
  const tierName = (x) => x.replace(/\b[\w' -]+ \((?:\d+|Sacred|Angelic)\)/g, "a tiered item").replace(/\b[\w' -]+ Shrine \(\d+\)/g, "a shrine");
  const familyKey = (d) => JSON.stringify([d.inputs.map(tierName), d.outputs.map((o) => tierName(o.name)), d.conditions]);

  // Recipes the cube contents are part of: every item fits an ingredient, and at most `max`
  // ingredients are still missing. Recipes that read the same are listed once.
  function suggest(contents, ctx = {}, { max = 3, limit = 40 } = {}) {
    if (!contents.length) return [];
    const out = [], seen = new Map();
    for (const i of reachable(contents, ctx).sort((a, b) => a - b)) {
      const recipe = recipes[i];
      const a = assign(recipe, contents, true);
      if (!a) continue;
      const missing = a.missing.reduce((n, m) => n + m.qty, 0);
      if (missing > max) continue;
      const d = describe(recipe);
      if (d.blocked || recipe.unrolled) continue;
      const met = a.first ? condition(recipe, a.first, ctx) : true;
      // The first ingredient is already in the cube and fails the recipe's condition (a
      // hidden bonus to reveal it doesn't have, "Already Upgraded"): it can't work.
      if (met === false) continue;
      const key = recipe.family ? `family ${recipe.family}` : familyKey(d);
      if (seen.has(key)) { addOutcome(seen.get(key), recipe, d); continue; }
      const entry = { recipe, missing: a.missing, missingText: a.missing.map(inputText), missingCount: missing, text: d, similar: 0, ready: missing === 0 && met !== false, outcomes: [], becomes: becomes(recipe, a.first) };
      addOutcome(entry, recipe, d);
      seen.set(key, entry);
      out.push(entry);
    }
    return out.sort((a, b) => a.missingCount - b.missingCount || a.recipe.row - b.recipe.row).slice(0, limit);
  }

  // The recipes the cube contents could still be part of (every item fits an ingredient).
  function reachable(contents, ctx = {}) {
    let pool = null;
    for (const it of contents) {
      const rs = recipesFor(it.code);
      pool = pool ? new Set([...pool].filter((i) => rs.has(i))) : rs;
    }
    return [...(pool || [])].filter((i) => allowed(recipes[i], ctx));
  }
  // The ingredients still open in those recipes, once each: what the item picker offers.
  // Null when the cube is empty (anything can start a recipe).
  function openSlots(contents, ctx = {}) {
    if (!contents.length) return null;
    const slots = new Map();
    for (const i of reachable(contents, ctx)) {
      const a = assign(recipes[i], contents, true);
      if (!a) continue;
      for (const m of a.missing) slots.set(JSON.stringify([m.flags, m.key, m.id, m.quality]), m);
    }
    return [...slots.values()];
  }
  const fitsAny = (item, slots) => !slots || slots.some((inp) => fits(item, inp));

  // How much adding an item would help, for ranking the item list: each open ingredient with
  // the fewest ingredients its recipe would still need once it's filled, and whether it's
  // "more of the same" (the cube already holds an item for it: a second unique for bulk
  // disenchanting). Null when the cube is empty.
  function steps(contents, ctx = {}) {
    if (!contents.length) return null;
    const out = new Map();
    for (const i of reachable(contents, ctx)) {
      const r = recipes[i];
      if (blocks(r) || r.unrolled) continue;
      const a = assign(r, contents, true);
      if (!a || (a.first && condition(r, a.first, ctx) === false)) continue;
      const left = a.missing.reduce((n, m) => n + m.qty, 0) - 1;
      for (const m of a.missing) {
        const key = JSON.stringify([m.flags, m.key, m.id, m.quality]);
        const same = contents.some((it) => fits(it, m));
        const prev = out.get(key);
        if (!prev || left < prev.left) out.set(key, { inp: m, left, same });
      }
    }
    return [...out.values()];
  }
  // For one item: { fits, left } (ingredients still needed after it, 0 = it finishes a recipe)
  // and bulk when it only fits as more of the same.
  function rank(item, stepList) {
    if (!stepList) return { fits: true, left: 0, bulk: false };
    let best = null, bulk = true;
    for (const st of stepList) {
      if (!fits(item, st.inp)) continue;
      if (!st.same) bulk = false;
      if (!st.same && (best === null || st.left < best)) best = st.left;
    }
    if (best === null) {
      const any = stepList.filter((st) => fits(item, st.inp));
      if (!any.length) return { fits: false, left: Infinity, bulk: false };
      return { fits: true, left: Math.min(...any.map((st) => st.left)), bulk: true };
    }
    return { fits: true, left: best, bulk };
  }

  // What recipes look at on this item: its quality, sockets, ethereal, a particular unique
  // or set item, and stats their conditions read (Quantity, Shrine Blessed). Per item code.
  const checksCache = new Map();
  function checks(code) {
    if (checksCache.has(code)) return checksCache.get(code);
    const out = { quality: false, sockets: false, ethereal: false, stats: new Map() };
    const probe = { code, types: items.get(code)?.types || new Set() };
    for (const i of recipesFor(code)) {
      const r = recipes[i];
      r.inputs.forEach((inp, k) => {
        if (inp.flags & IN.TYPE ? !probe.types.has(inp.key) : inp.key !== code) return;
        if (inp.quality) out.quality = true;
        if (inp.flags & (IN.NO_SOCKETS | IN.SOCKETED)) out.sockets = true;
        if (inp.flags & (IN.ETHEREAL | IN.NOT_ETHEREAL)) out.ethereal = true;
        if (k !== 0 || !r.op || !ITEM_OPS[r.op[0]]) return;
        // Which values the recipes test, and what else goes in with it (to say what checks it).
        const [op, stat, value] = r.op;
        const st = out.stats.get(stat) ?? out.stats.set(stat, { values: new Set(), with: new Set() }).get(stat);
        st.values.add(value);
        for (const other of r.inputs.slice(1)) st.with.add(inputText({ ...other, qty: 1, flags: other.flags & KIND }));
      });
    }
    // What the item editor offers: yes/no for flags (and anything only ever tested against 0
    // or 1), else a count up to the largest value a recipe tests.
    out.stats = [...out.stats].filter(([st]) => data.stats[st]?.[2] && !hidden.rolls[st] && !hidden.picks[st]).map(([st, x]) => ({
      stat: st,
      label: data.stats[st][2].replace(/:$/, ""),
      flag: isFlag(st) || [...x.values].every((v) => v === 0 || v === 1),
      // Prefixes and suffixes go up to the 3 a rare can have; other counts aren't capped.
      max: /fixes$/.test(data.stats[st][2].replace(/:$/, "")) ? 3 : 999,
      checkedBy: [...x.with].slice(0, 3),
    }));
    checksCache.set(code, out);
    return out;
  }
  // The unique and set items (that recipes name) made on this base.
  const specialsFor = (code) => [
    ...Object.entries(data.uniques).filter(([, [, c]]) => c === code).map(([id, [name]]) => ({ quality: 7, id: +id, name })),
    ...Object.entries(data.sets).filter(([, [, c]]) => c === code).map(([id, [name]]) => ({ quality: 5, id: +id, name })),
  ];

  // An item that fits an ingredient, to load a recipe into the cube.
  function exampleFor(inp) {
    let code = inp.key;
    if (inp.flags & IN.TYPE) {
      const members = [...items.values()].filter((it) => it.types.has(inp.key) && listed(it.code));
      // A typical member to show: an ordinary tiered base, not a throwing potion or quest item.
      const score = (it) => (art[it.code] ? 1 : 0) + (versionOf.get(it.code)?.kind === "Tier" ? 3 : 0) - (["tpot", "ques", "thro"].some((t) => it.types.has(t)) ? 10 : 0);
      code = members.reduce((best, it) => (!best || score(it) > score(best) ? it : best), null)?.code;
    }
    if (inp.flags & IN.SPECIFIC) code = (inp.quality === 5 ? data.sets : data.uniques)[inp.id]?.[1] || code;
    if (!code || !items.has(code)) return null;
    return makeItem(code, { quality: inp.quality || 2, special: inp.flags & IN.SPECIFIC ? inp.id : 0, sockets: inp.flags & IN.SOCKETED ? 1 : 0 });
  }
  // A recipe that checks a count on its first ingredient ("After 6 upgrade steps on this
  // item", a vessel's quantity) loads it with that count, so it transmutes as shown. One that
  // reads a hidden roll (a corrupted item's outcome, revealed with Oil of Craft) loads the item
  // with a roll that gives this outcome.
  function load(recipe) {
    const out = recipe.inputs.flatMap((inp) => Array.from({ length: inp.qty }, () => exampleFor(inp))).filter(Boolean);
    const [op, stat, value] = recipe.op || [];
    const first = out[0];
    if (first && ITEM_OPS[op] && !hidden.picks[stat] && !recipe.unrolled) {
      const v = first.stats[stat] ?? 0;
      if (!ITEM_OPS[op](v, value) || (hidden.rolls[stat] && !v)) first.stats = { ...first.stats, [stat]: op === 17 ? value - 1 : value };
    }
    return out;
  }

  // For a recipe that rerolls the first ingredient as a unique: which uniques that item can
  // become (null when the recipe doesn't, or the item isn't in the cube yet).
  function becomes(recipe, first) {
    if (!first) return null;
    const o = recipe.outputs.find((x) => x.type === T.REROLL_FIRST && x.quality === 7);
    return o ? uniqueChoices(first.code, o.lvl || o.ilvl || 100) : null;
  }
  // Random outcomes of one recipe collect in its entry ("one of 10 results"); other
  // look-alikes (the same recipe for another base) just count.
  function addOutcome(entry, recipe, d) {
    if (!recipe.family) { if (entry.recipe !== recipe) entry.similar++; return; }
    entry.outcomes.push({ outputs: d.outputs, chance: recipe.chance });
  }

  // The recipe that makes a unique or an item, loaded into the cube (links from the other
  // pages: "Made in the Horadric Cube"). A unique: a recipe that creates it, else its tiered
  // base rerolled as a unique. An item: the first recipe in the table that makes it from
  // other things (two Nef Runes make an Eth Rune). Null when nothing does.
  function recipeToMake({ unique, item, tier = 0 }) {
    if (unique) {
      const ids = Object.entries(data.uniques).filter(([, [n]]) => n === unique).map(([id]) => +id);
      for (const r of recipes) {
        if (blocks(r)) continue;
        const o = r.outputs.find((x) => x.type === T.ITEM && x.flags & OUT.SPECIFIC && x.quality === 7 && ids.includes(x.id));
        // Not a recipe that takes the same unique (rerolls it, or turns three into one).
        if (o && !r.inputs.some((i) => i.flags & IN.SPECIFIC && i.quality === 7 && ids.includes(i.id))) return { recipe: r, contents: load(r) };
      }
      const reroll = recipes.find((r) => r.inputs[0]?.key === "tier" && r.outputs.some((o) => o.type === T.REROLL_FIRST && o.quality === 7));
      // The tier asked for first (a card showing Tier 4 loads a tier 4 base), then any.
      const atTier = (id) => (items.get(data.uniques[id]?.[1])?.name || "").endsWith(`(${tier})`);
      for (const id of tier ? [...ids.filter(atTier), ...ids.filter((x) => !atTier(x))] : ids) {
        const code = data.uniques[id]?.[1];
        if (!reroll || !items.get(code)?.types.has("tier")) continue;
        const contents = load(reroll);
        contents[0] = makeItem(code);
        return { recipe: reroll, contents, base: items.get(code).name };
      }
      // By chance: a recipe making a random unique of its base (Amulet or Ring + 2 Arcane
      // Crystals + Oil of Enhancement); which unique comes out is by rarity.
      for (const id of ids) {
        const code = data.uniques[id]?.[1];
        const r = recipes.find((x) => !blocks(x) && !x.inputs.some((i) => i.flags & IN.SPECIFIC && i.quality === 7)
          && x.outputs.some((o) => o.type === T.ITEM && !(o.flags & OUT.SPECIFIC) && o.quality === 7 && o.key === code));
        // One unique on the base (a tier upgrade): that unique for certain.
        const several = (data.uniquesByBase?.[code] || []).filter(([, rarity]) => rarity > 0).length > 1;
        if (r) return { recipe: r, contents: load(r), ...(several ? { chance: items.get(code)?.name || "item" } : {}) };
      }
      return null;
    }
    if (item) {
      const codes = new Set([...items.values()].filter((i) => i.name === item || i.name === `${item} Rune`).map((i) => i.code));
      const r = recipes.find((x) => !blocks(x) && !x.inputs.some((i) => codes.has(i.key)) && x.outputs.some((o) => o.type === T.ITEM && codes.has(o.key) && !(o.flags & OUT.SPECIFIC)));
      return r ? { recipe: r, contents: load(r) } : null;
    }
    return null;
  }

  // Recipes whose ingredients or results mention the words (for the recipe book); with
  // `contents`, only recipes those items fit.
  function search(query, { limit = 60, contents = null, ctx = {} } = {}) {
    const within = contents?.length ? new Set(reachable(contents, ctx).filter((i) => assign(recipes[i], contents, true)).map((i) => recipes[i])) : null;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [], seen = new Map();
    for (const recipe of recipes) {
      const d = describe(recipe);
      const hay = [...d.inputs, ...d.outputs.flatMap((o) => [o.name, ...o.lines]), ...d.conditions].join(" ").toLowerCase();
      if (d.blocked || recipe.unrolled || !words.every((w) => hay.includes(w))) continue;
      if (within && !within.has(recipe)) continue;
      const key = recipe.family ? `family ${recipe.family}` : familyKey(d);
      if (seen.has(key)) { addOutcome(seen.get(key), recipe, d); continue; }
      const entry = { recipe, text: d, similar: 0, outcomes: [] };
      addOutcome(entry, recipe, d);
      seen.set(key, entry);
      if (out.length < limit) out.push(entry);
    }
    return out;
  }

  return { data, items, recipes, typeName, maxSocketsOf, uniqueChoices, recipeToMake, itemName, itemLines, isCounter, makeItem, variantsOf, hintOf, listed, artOf, steps, rank, grid: data.grid || [10, 8], fits, transmute, describe, suggest, openSlots, fitsAny, checks, specialsFor, load, exampleFor, search, recipesFor };
}
