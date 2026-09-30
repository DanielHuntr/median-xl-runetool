// Formats the game's own tooltip lines (skilldesc.bin; see scripts/extract-game-data.mjs).
// The game client decides how each line type is shown: D2Client.dll's line-type switch
// (0x6FAE177A: it reads the type byte at 0x42 of the skilldesc record, 1-75, and jumps
// through the table at 0x6FAE2ABC to a drawing helper per type). Every type records how its
// format is known:
//   confirmed — read from that code (helper address given), matches an in-game tooltip,
//               or the game's text is itself the format string;
//   inferred  — read from the text's shape and classic D2 conventions.
// The helpers print numbers with "+%d" when signed and not negative, "%d" otherwise, and
// most return without drawing when the value is 0.
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
  // "over " + frames / 25 + " seconds", "Duration: " + 250 → "10 seconds". Tenths, rounded
  // down, as the game's integer maths draws them: Snake Bite's 53 frames is "2.1 seconds".
  12: {
    confirmed: "Way of the Spider, Incineration Trap, Snake Bite (2.1); hidden at 0: Discharge",
    // One second is singular: Pagan Rites' "Cooldown: 1 second" (GitHub issue #25).
    format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, a == null ? "?" : tenths(a), a != null && tenths(a) === "1" ? " second" : " seconds")),
  },
  // printf-style text from the game: "+%d%% Total Damage per Base Level"
  66: {
    confirmed: "the game's text is the format string",
    format: (l, a) => (l.textA || "").replace(/%d/, n(a)).replace(/%%/g, "%"),
  },
  // "Physical Damage: " + "+25" + "%": signed, as in game.
  // Hidden at 0: Shadow Flow's "Maximum Chance to Avoid increased by" below 3 Base Levels.
  2: { confirmed: "Resurrect (GitHub issue #23), Protector Spirit's Bloodlust lines; hidden at 0: Shadow Flow", format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, plus(a), l.textB)) },
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
  // textA + "+%d" + "%" + textB; nothing at 0 (D2Client 0x6FADD8E0, string 0x10B3 "%").
  20: { confirmed: "D2Client.dll 0x6FADD8E0", format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, plus(a), "%", l.textB).trim()) },
  // "%d" + textA; nothing at 0 (D2Client 0x6FADDBF0, flag 0; 6 signs it).
  7: { confirmed: "Magic Missiles (6 bolts); D2Client.dll 0x6FADDBF0", format: (l, a) => (a === 0 ? { hidden: true } : join(n(a), l.textA)) },
  // "Energy" / "Increased Damage": "Energy: +X% Increased Damage" (D2Client 0x6FADCE10; nothing at 0)
  63: { confirmed: "Stormcall (+10%), Magic Missiles (+8%); D2Client.dll 0x6FADCE10", format: (l, a) => (a === 0 ? { hidden: true } : join(String(l.textA ?? "").trim() ? `${l.textA}: ` : "", plus(a), "% ", l.textB)) },
  // textA + ": " + textB, no value; nothing unless both texts exist (D2Client 0x6FADCB60).
  65: { confirmed: "D2Client.dll 0x6FADCB60", format: (l) => (!String(l.textA ?? "").trim() || !String(l.textB ?? "").trim() ? { hidden: true } : join(l.textA, ": ", l.textB)) },
  // textA + "+%d" (4) or "%d" (5); nothing at 0 (D2Client 0x6FADDCA0, flag 1 / 0).
  4: { confirmed: "D2Client.dll 0x6FADDCA0", format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, plus(a))) },
  5: { confirmed: "D2Client.dll 0x6FADDCA0; Javelins: 1 (Eviscerate)", format: (l, a) => (a === 0 ? { hidden: true } : join(l.textA, n(a))) },
  // "Duration: " + a-b frames as seconds ("%d-%d", or "%d.%d-%d.%d" when either has tenths)
  // + " seconds"; nothing when both are 0 (D2Client 0x6FADDF50, string 0x10B0).
  16: {
    confirmed: "D2Client.dll 0x6FADDF50",
    format: (l, a, b) => {
      if (!a && !b) return { hidden: true };
      if (a == null || b == null) return "Duration: ?-? seconds";
      const whole = (x) => Math.trunc(x / 25), tenth = (x) => Math.trunc(((x % 25) * 10) / 25);
      const range = tenth(a) || tenth(b) ? `${whole(a)}.${tenth(a)}-${whole(b)}.${tenth(b)}` : `${whole(a)}-${whole(b)}`;
      return `Duration: ${range} seconds`;
    },
  },
  // textA + ": " + "+A.B" (the second value is the digits after the point) + " " + textB;
  // nothing without textA or when both values are 0 (D2Client 0x6FADCD20, 0x6FADC790).
  42: {
    confirmed: "D2Client.dll 0x6FADCD20",
    format: (l, a, b) => (!String(l.textA ?? "").trim() || (!a && !b) ? { hidden: true } : join(l.textA, ": ", a != null && a >= 0 ? "+" : "", n(a), ".", n(b), " ", l.textB)),
  },
  // A value in 256ths: value ÷ 256, with one more digit (remainder × calcB ÷ 256, calcB 10 if
  // unset) when there is one: textA + "%d" or "%d.%d" + textB (D2Client 0x6FADF870; 60 signs it).
  61: {
    confirmed: "D2Client.dll 0x6FADF870",
    format: (l, a, b) => {
      if (!a) return { hidden: true };
      const whole = Math.trunc(a / 256), digit = Math.trunc(((a % 256) * (b || 10)) / 256);
      return join(l.textA, digit ? `${whole}.${Math.abs(digit)}` : String(whole), l.textB);
    },
  },
  // (textA + ": " when there is one) + "+%d" + "%" (63) or nothing (67) + " " + textB;
  // nothing at 0 (D2Client 0x6FADCE10).
  67: { confirmed: "D2Client.dll 0x6FADCE10", format: (l, a) => (a === 0 ? { hidden: true } : join(String(l.textA ?? "").trim() ? `${l.textA}: ` : "", plus(a), " ", l.textB)) },
  // "a/b " + textA; nothing unless a is set and b positive (D2Client 0x6FAE2917).
  73: { confirmed: "D2Client.dll 0x6FAE2917", format: (l, a, b) => (!a || !(b > 0) ? { hidden: true } : `${n(a)}/${n(b)} ${l.textA ?? ""}`) },
  // "(Total Fire Damage: " + a-b + ")"; one number when both are equal (Psionic Storm's
  // "Magic Feedback Damage: 8% of Total Energy").
  38: { confirmed: "Psionic Storm (equal values)", format: (l, a, b) => join(l.textA, a === b ? n(a) : `${n(a)}-${n(b)}`, l.textB) },
  // textA + "+a-b" + textB; one unsigned number when both are equal, nothing then at 0
  // (D2Client 0x6FADF6E0, flag 1; 17 and 38 are the same without the sign).
  52: { confirmed: "D2Client.dll 0x6FADF6E0", format: (l, a, b) => (a === b ? (a === 0 ? { hidden: true } : join(l.textA, n(a), l.textB)) : join(l.textA, `+${n(a)}-${n(b)}`, l.textB)) },
  // Blank spacer line.
  77: { confirmed: "Way of the Spider", format: () => ({ hidden: true }) },
};

const fmt = (v) => String(Math.round(v * 100) / 100);
const tenths = (frames) => { const t = Math.trunc((frames * 10) / 25); return t % 10 ? `${Math.trunc(t / 10)}.${t % 10}` : String(t / 10); };

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
