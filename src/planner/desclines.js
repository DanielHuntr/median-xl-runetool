// Formats the game's own tooltip lines (skilldesc.bin; see scripts/extract-game-data.mjs).
// The game client decides how each line type is shown, and that code isn't in the data
// files, so every type records how its format is known:
//   confirmed — matches an in-game tooltip (Way of the Spider, 2.14.4), or the game's
//               text is itself the format string;
//   inferred  — read from the text's shape and classic D2 conventions.
// Values arrive already calculated; null means the formula couldn't be evaluated.

const n = (v) => (v == null ? "?" : String(v));
const plus = (v) => (v == null ? "?" : v >= 0 ? `+${v}` : String(v));
const join = (...parts) => parts.filter((p) => p != null).join("");

export const LINE_TYPES = {
  // "Synergies" block header; calcA is its colour.
  40: { confirmed: "Way of the Spider", format: (l) => ({ header: l.textA }) },
  // Static text.
  18: { confirmed: "Way of the Spider", format: (l) => (String(l.textA ?? "").trim() ? l.textA : { hidden: true }) },
  // "+20" + "% Poison Damage to Weapon per Base Level"
  // Lines worth 0 aren't shown (Death Pact's, Blood Skeleton's and Discharge's First Level).
  6: { confirmed: "Way of the Spider; hidden at 0: Death Pact, Blood Skeleton", format: (l, a) => (a === 0 ? { hidden: true } : join(plus(a), l.textA)) },
  // Shown only while calcA is positive ("… per Character Level under 100" at level 93).
  // Hiding it at 0 or below, and when calcB is set (quest-unlock text), is inferred.
  76: {
    confirmed: "Way of the Spider (shown case)",
    format: (l, a, b) => (a != null && a > 0 && !(b > 0) ? l.textA : { hidden: true }),
  },
  // "Poison Damage to Weapon" + ": a-b"
  35: { confirmed: "Way of the Spider", format: (l, a, b) => join(l.textA, `: ${n(a)}-${n(b)}`) },
  // "over " + frames / 25 + " seconds", "Duration: " + 250 → "10 seconds"
  12: {
    confirmed: "Way of the Spider, Incineration Trap; hidden at 0: Discharge",
    format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, a == null ? "?" : fmt(a / 25), " seconds")),
  },
  // printf-style text from the game: "+%d%% Total Damage per Base Level"
  66: {
    confirmed: "the game's text is the format string",
    format: (l, a) => (l.textA || "").replace(/%d/, n(a)).replace(/%%/g, "%"),
  },
  // "Poison Pierce: " + 30 + "%"
  2: { format: (l, a) => join(l.textA, n(a), l.textB) },
  // "Damage Pierces " + 4 + "% Enemy Fire Resistance", "Activation Delay: " + 13 + " frames"
  // Hidden at 0: Warmth's First Level shows its mana regeneration line but not "Cold
  // Resistance: 0%" (GitHub issue #12).
  3: { confirmed: "Incineration Trap; hidden at 0: Warmth", format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, n(a), l.textB)) },
  // "Activation Frequency Multiplier: " + 100 + "%" (textB is a spacer)
  21: { confirmed: "Incineration Trap; hidden at 0: Discharge", format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, n(a), "%")) },
  // "Fire Damage: " + 81 + "-" + 88 + " per second" (textB is a spacer)
  17: { confirmed: "Incineration Trap", format: (l, a, b) => join(l.textA, `${n(a)}-${n(b)} per second`) },
  // "Range: " + internal units × 2/3 + " yards" (12 → "8 yards")
  19: { confirmed: "Incineration Trap", format: (l, a) => join(l.textA, a == null ? "?" : fmt((a * 2) / 3), " yards") },
  // " " + 4 + "% Lightning Resistance Pierce per Base Level"
  20: { format: (l, a) => join(l.textA, n(a), "%", l.textB).trim() },
  // "20" + "% to All Speeds per Base Level"
  7: { confirmed: "Magic Missiles (6 bolts)", format: (l, a) => join(n(a), l.textA) },
  // "Energy" / "Increased Damage": "Energy: +X% Increased Damage"
  63: { confirmed: "Stormcall (+10%), Magic Missiles (+8%)", format: (l, a) => join(l.textA, ": ", plus(a), "% ", l.textB) },
  // "Any other spear skill" / "+1 Max Skill Level per 3 Base Levels"
  65: { format: (l) => join(l.textA, ": ", l.textB) },
  // "Mana Cost: ", "Magic Damage: " + value
  4: { format: (l, a) => join(l.textA, n(a)) },
  5: { format: (l, a) => join(l.textA, n(a)) },
  // "(Total Fire Damage: " + a-b + ")"
  38: { format: (l, a, b) => join(l.textA, `${n(a)}-${n(b)}`, l.textB) },
  // a-b + " bonus cold damage to attack" (label in the second text)
  52: { format: (l, a, b) => join(`${n(a)}-${n(b)}`, l.textB) },
  // Blank spacer line.
  77: { confirmed: "Way of the Spider", format: () => ({ hidden: true }) },
};

const fmt = (v) => String(Math.round(v * 100) / 100);

/**
 * @returns {{ header?: string, hidden?: boolean, text?: string, format: "confirmed"|"inferred", confirmedBy?: string }}
 */
export function formatLine(line, a, b) {
  const t = LINE_TYPES[line.type];
  const out = t ? t.format(line, a, b) : join(line.textA, line.calcA ? n(a) : null, line.textB);
  const meta = t?.confirmed ? { format: "confirmed", confirmedBy: t.confirmed } : { format: "inferred" };
  if (typeof out !== "string") return { ...out, ...meta };
  // The game draws multi-line text bottom-up: "Gain 67% …\n+1 Skeleton per 4 Base Levels"
  // shows "+1 Skeleton …" first (Blood Skeleton). Lines are returned in shown order.
  const lines = out.split("\n").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).reverse();
  return { text: lines.join("\n"), lines, ...meta };
}
