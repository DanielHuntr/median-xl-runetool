// Item lines for the properties cube recipes add, written the way the game writes them
// (ItemStatCost description functions; data from scripts/extract-cube.mjs).

export const CLASSES = ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"];

const num = (min, max) => (min === max ? `${Math.abs(min)}` : `(${Math.abs(min)}-${Math.abs(max)})`);
// "+5", "-(3-5)", "(6-28)"; a range that crosses zero is written as it is.
function signed(min, max, plus = true) {
  if (min < 0 && max < 0) return `-${num(min, max)}`;
  if (min < 0) return `(${min} to ${max})`;
  return `${plus ? "+" : ""}${num(min, max)}`;
}
// Blizzard's sprintf strings ("+%d to Javelin and Spear Skills", "%d%% Chance to cast…").
const sprintf = (s, args) => {
  let i = 0;
  return s.replace(/%%|%\+?d|%s|%\.\d[fg]/g, (m) => (m === "%%" ? "%" : String(args[i++] ?? ""))).replace(/\(\s*\)/g, "").trim();
};

// One stat at a value (min to max) with a parameter → its item line, or null when the game
// doesn't show it.
function statLine(data, stat, param, min, max) {
  const d = data.stats[stat];
  if (!d) return null;
  const [func, pos, strPos, strNeg, str2] = d;
  const s = (min < 0 && strNeg ? strNeg : strPos) || "";
  const v = signed(min, max, false), pv = signed(min, max);
  const place = (value) => (pos === 0 ? s : pos === 2 ? `${s} ${value}` : `${value} ${s}`);
  if (/%\+?d|%s|%\.\d[fg]/.test(s) && ![15, 24].includes(func)) return sprintf(s, [min === max ? min : num(min, max), data.skills[param] ?? ""]);
  switch (func) {
    case 0: return null;
    case 1: case 12: case 32: case 33: case 35: case 36: case 38: return place(pv);
    case 2: return place(`${v}%`);
    case 3: return place(v);
    case 4: return place(`${pv}%`);
    case 5: return place(`${Math.round((min * 100) / 128)}%`);
    case 6: return `${place(pv)} ${str2}`;
    case 7: return `${place(`${v}%`)} ${str2}`;
    case 8: return `${place(`${pv}%`)} ${str2}`;
    case 9: return `${place(v)} ${str2}`;
    case 13: return `${pv} to ${CLASSES[param] ?? "Class"} Skill Levels`;
    case 15: return `${min}% Chance to cast level ${max} ${data.skills[param] ?? "a skill"}${s ? ` ${s.replace(/^.*%s\s*/, "")}` : ""}`.trim();
    case 16: return `Level ${v} ${data.skills[param] ?? "Aura"} Aura When Equipped`;
    case 20: return place(`${min < 0 ? "+" : "-"}${num(min, max)}%`);
    case 21: return place(`${min < 0 ? "+" : "-"}${num(min, max)}`);
    // Median XL also writes a range of monsters (min to max) with the chance as the parameter.
    case 22: case 23: return min > 100 ? `${param}% ${s} a random monster` : `${v}% ${s} ${data.monsters[param] ?? "a monster"}`;
    case 24: return `Level ${max} ${data.skills[param] ?? "Skill"} (${min} Charges)`;
    case 27: return `${pv} to ${data.skills[param] ?? "a skill"}`;
    case 28: return `${pv} to ${data.skills[param] ?? "a skill"}`;
    case 31: return (data.strings[param] || []).join("\n") || null; // Median XL: a whole string
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
