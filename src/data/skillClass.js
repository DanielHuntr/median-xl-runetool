// Which class a "+N to <Skill>" item line's skill belongs to, for the item cards' tooltips.
// Classes come from the game files (skills.bin, scripts/extract-affixes.mjs). A plain
// "+N to <Skill>" (no "(Class Only)") is the game's oskill stat: any class can use the skill
// from the item, and for the skill's own class those levels add at most +3 over every item.
import SKILLS from "./skill-names.json" with { type: "json" };

const NAMES = new Set(SKILLS.names);
const LINE = /^[+-](?:\d+|\(\d+ to \d+\)) to (.+)$/;

/** The class tag and tooltip for a skill line, or null when the line isn't one. */
export function skillClass(line) {
  const name = LINE.exec(line)?.[1];
  if (!name || !NAMES.has(name)) return null;
  const cls = SKILLS.classes[name];
  if (cls === "All")
    return { tag: "All classes", tip: `${name}: a skill every class has` };
  if (cls)
    return {
      tag: cls,
      tip: `${name}: ${cls} skill. Any class can use it from this item; a ${cls}'s own skill levels from items add up to +3 at most`,
    };
  return { tag: "Item skill", tip: `${name}: no class has this skill; any class can use it from this item` };
}
