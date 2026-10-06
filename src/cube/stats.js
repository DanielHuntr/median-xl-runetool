// Item lines for the properties cube recipes add, written the way the game writes them
// (ItemStatCost description functions; data from scripts/extract-cube.mjs).

export const CLASSES = ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"];

// A range stored high to low (Fangspear's life: 100 to 0) is written low to high, as the game does.
const num = (min, max) => (min === max ? `${Math.abs(min)}` : Math.abs(min) <= Math.abs(max) || (min < 0) !== (max < 0) ? `(${Math.abs(min)}-${Math.abs(max)})` : `(${Math.abs(max)}-${Math.abs(min)})`);
// "+5", "-(3-5)", "(6-28)"; a range that crosses zero is written as it is.
function signed(min, max, plus = true) {
  // Both negative: the smaller amount first ("-(25-30)%", stored as -30 to -25).
  if (min < 0 && max < 0) return `-${Math.abs(min) <= Math.abs(max) ? num(min, max) : num(max, min)}`;
  if (min < 0) return `(${min} to ${max})`;
  return `${plus ? "+" : ""}${num(min, max)}`;
}
// A value shown negated (description functions 20 and 21): -10 is "10", -5 to 5 is "(-5 to 5)".
const negated = (min, max) => {
  const lo = Math.min(-max, -min), hi = Math.max(-max, -min);
  if (lo === hi) return `${lo}`;
  if (lo < 0 && hi > 0) return `(${lo} to ${hi})`;
  return lo < 0 ? `-(${Math.abs(hi)}-${Math.abs(lo)})` : `(${lo}-${hi})`;
};
// Blizzard's sprintf strings ("+%d to Javelin and Spear Skills", "%d%% Chance to cast…").
const sprintf = (s, args) => {
  let i = 0;
  return s.replace(/%%|%\+?d|%s|%\.\d[fg]/g, (m) => (m === "%%" ? "%" : String(args[i++] ?? ""))).replace(/\(\s*\)/g, "").trim();
};

// One stat at a value (min to max) with a parameter → its item line, or null when the game
// doesn't show it.
export function statLine(data, stat, param, min, max) {
  const d = data.stats[stat];
  if (!d) return null;
  const [func, pos, strPos, strNeg, str2, op, opParam] = d;
  // "(Based on Character Level)" stats (functions 6-9) store the value per level in steps:
  // Median XL's operator 12 in 32nds (Shark's 4 is "+0.125 to Maximum Damage"), Diablo II's
  // per-level operators in 2^param ("op param", itemstatcost.bin 0x57).
  // Median XL's per-level stats written with function 32 (life regenerated per level) too.
  if (((func >= 6 && func <= 9) || (func === 32 && op === 12)) && op != null) {
    const step = op === 12 ? 32 : 2 ** (opParam || 0);
    if (step > 1) { min /= step; max /= step; }
  }
  const s = (min < 0 && strNeg ? strNeg : strPos) || "";
  const v = signed(min, max, false), pv = signed(min, max);
  const place = (value) => (pos === 0 ? s : pos === 2 ? `${s} ${value}` : `${value} ${s}`);
  // Median XL's function 33: a skill's cooldown cut, in frames (25 a second), the skill first and
  // the seconds to one significant digit ("Glacial Nova Cooldown Reduced by 4 seconds": 112).
  if (func === 33) {
    const secs = (x) => { const t = Math.abs(x) / 25; return t < 10 ? String(Number(t.toPrecision(1))) : String(Math.round(t)); };
    const amount = min === max ? secs(min) : `(${secs(min)}-${secs(max)})`;
    const words = s.replace(/%s\s*/, "").replace(/\s*%\.\d[fg]/, "").trim();
    return `${data.skills[param] ?? "A skill"} ${words} ${amount} seconds`;
  }
  if (/%\+?d|%s|%\.\d[fg]/.test(s) && ![15, 24].includes(func)) return sprintf(s, [min === max ? min : num(min, max), data.skills[param] ?? ""]);
  switch (func) {
    case 0: return null;
    case 1: case 12: case 35: return place(pv);
    // Median XL's function 38: a percentage without a sign ("Activation Frequency 15%").
    case 38: return place(`${v}%`);
    // Median XL's function 32 shows tenths (Life Regenerated per Second: 400 is "+40").
    case 32: return place(signed(min / 10, max / 10));
    case 2: return place(`${v}%`);
    case 3: return place(v);
    case 4: return place(`${pv}%`);
    // In 128ths, rounded down, with a sign ("Hit Causes Monster to Flee +1%": 2).
    case 5: { const f = (x) => Math.floor((x * 100) / 128); return place(`+${f(min) === f(max) ? f(min) : `(${f(min)}-${f(max)})`}%`); }
    case 6: return `${place(pv)} ${str2}`;
    case 7: return `${place(`${v}%`)} ${str2}`;
    case 8: return `${place(`${pv}%`)} ${str2}`;
    case 9: return `${place(v)} ${str2}`;
    case 13: return `${pv} to ${CLASSES[param] ?? "Class"} Skill Levels`;
    case 15: return `${min}% Chance to cast level ${max} ${data.skills[param] ?? "a skill"}${s ? ` ${s.replace(/^.*%s\s*/, "")}` : ""}`.trim();
    case 16: return `Level ${v} ${data.skills[param] ?? "Aura"} Aura When Equipped`;
    // The value negated, without a plus ("10% to All Vendor Prices": -10); a range crossing zero as it is.
    case 20: return place(`${negated(min, max)}%`);
    case 21: return place(negated(min, max));
    // Median XL also writes a range of monsters (min to max) with the chance as the parameter.
    case 22: case 23: return min > 100 ? `${param}% ${s} Random Monster` : `${v}% ${s} ${data.monsters[param] ?? "a monster"}`;
    case 24: return `Level ${max} ${data.skills[param] ?? "Skill"} (${min}/${min} Charges)`;
    case 27: return `${pv} to ${data.skills[param] ?? "a skill"}`;
    case 28: return `${pv} to ${data.skills[param] ?? "a skill"}`;
    case 31: case 34: return (data.strings[param] || []).join("\n") || null; // Median XL: a whole string
    // Median XL's function 36: the orb multiplier ("Orb Effects Applied to this Item are Doubled";
    // Quadrupled at 4).
    case 36: return min >= 4 ? s.replace(/Doubled/, "Quadrupled") : s;
    default: return s ? place(pv) : null;
  }
}

// A recipe output property [property, parameter, min, max] → its item lines.
export function propertyLines(data, [prop, param, min, max]) {
  const out = [];
  for (const [func, stat, value] of data.props[prop] || []) {
    // Sockets (function 14) set the hidden socket count; the game writes "Socketed (n)".
    if (func === 14) { out.push(`Socketed (${num(min, max)})`); continue; }
    if (stat < 0) {
      // Properties without a stat of their own (damage, sockets, ethereal).
      if (func === 5) out.push(`${signed(min, max)} to Minimum Damage`);
      else if (func === 6) out.push(`${signed(min, max)} to Maximum Damage`);
      else if (func === 7) out.push(`${signed(min, max)}% Enhanced Damage`);
      else if (func === 14) out.push(`Socketed (${num(min, max)})`);
      else if (func === 20) out.push("Indestructible");
      else if (func === 23) out.push("Ethereal");
      continue;
    }
    // A class-skills property names its class in the property, not the recipe.
    const line = statLine(data, stat, param || value || 0, min, max);
    if (line) out.push(...line.split("\n"));
  }
  return [...new Set(out)];
}

// The stats a property sets, for the recipe conditions that read them later (Shrine Blessed,
// a container's quantity, a catalyst's charges). Only fixed values count: a rolled range
// can't be checked.
export function propertyStats(data, [prop, param, min, max]) {
  if (min !== max) return [];
  return (data.props[prop] || []).filter(([, stat]) => stat >= 0).map(([, stat]) => [stat, min, param]);
}
