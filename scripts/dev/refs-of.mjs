// Dev check: node scripts/dev/refs-of.mjs <skill id> — where a skill's formulas read other skills.
import { readFile } from "node:fs/promises";
const planner = JSON.parse(await readFile("public/planner/data.json", "utf8"));
const byGame = new Map(Object.entries(planner.skills).filter(([, s]) => s.game).map(([id, s]) => [s.game.gameId, id]));
const id = process.argv[2], s = planner.skills[id];
console.log(s.name, "tags", s.tags, "effect", s.effect);
for (const c of s.constants || []) if (/\[\[/.test(c.values.join(" "))) console.log(" medianDB", c.key, c.values.filter(Boolean).join(" | "));
const walk = (o, path) => {
  if (!o || typeof o !== "object") return;
  if (typeof o.text === "string" && /skill\(/.test(o.text)) console.log(" game", path, ":", o.text.replace(/skill\((\d+)\)/g, (m, n) => `skill(${byGame.get(+n) || n})`));
  for (const [k, v] of Object.entries(o)) if (k !== "text") walk(v, path + "." + k);
};
walk(s.game, "game");
for (const l of s.game?.lines || []) if (l.block === "synergy") console.log(" synergy line:", l.textA, l.textB || "", l.calcA?.text || "");
