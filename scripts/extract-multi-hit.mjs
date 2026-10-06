// Skills whose missile hits the same monster more than once as it passes through it, for skill
// damage and gear suggestions (src/planner/damage.js MULTI_HIT): src/data/multi-hit.json.
//   node scripts/extract-multi-hit.mjs [game dir]   (default: $MXL_DIR or C:/games/median-xl)
//
// missiles.bin (D2 1.13c, 420-byte records): life in frames u16 0x96, velocity u8 0x9A, "can hit
// the same unit again" u8 0x188 and after how many frames u8 0x189, size u8 0x18A, its skill
// u16 0x194 (scripts/dev/decode-missiles.mjs prints them). A moving missile overlaps a monster
// for about (its size + 2 subtiles, a typical monster) ÷ (velocity ÷ 8 subtiles per frame)
// frames, hitting on entry and again every interval while it overlaps: assumed units, a
// realistic estimate rather than the best case, and at most 3 hits (as for Hammer of Zerae,
// where every burst landing would be 85 and the Sin War ladder doesn't bear that out).
// Missiles that stand still are left out: how long a monster stays in them isn't known.
// Only damage skills (planner tags) count; a skill takes its missile with the most hits.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openMpq } from "./lib/mpq.mjs";

const dir = process.argv[2] || process.env.MXL_DIR || "C:/games/median-xl";
const patch = openMpq(join(dir, "medianxl-version.mpq")).read("version.mxl")?.toString("latin1").trim();
if (!/^\d+\.\d+\.\d+$/.test(patch || "")) throw new Error("Couldn't read the game version");
const buf = openMpq(join(dir, "medianxl-YmludGJsdHh0.mpq")).read("data/global/excel/missiles.bin");
const n = buf.readUInt32LE(0), size = (buf.length - 4) / n;
if (size !== 420) throw new Error(`missiles.bin records are ${size} bytes, expected 420 (D2 1.13c)`);
const planner = JSON.parse(readFileSync(new URL("../public/planner/data.json", import.meta.url), "utf8"));

const CAP = 3, MONSTER = 2, SUBTILE = 8;
const DAMAGE = ["Spell", "Projectile", "Attack", "Weapon Damage", "Melee Spell", "Warp Strike", "AoE"];
const byGame = new Map(Object.entries(planner.skills).filter(([, s]) => s.class && s.game?.gameId != null).map(([id, s]) => [s.game.gameId, [id, s]]));
const skills = {};
for (let i = 0; i < n; i++) {
  const r = buf.subarray(4 + i * size, 4 + (i + 1) * size);
  const hit = byGame.get(r.readUInt16LE(0x194));
  if (!hit || !hit[1].tags.some((t) => DAMAGE.includes(t))) continue;
  const life = r.readUInt16LE(0x96), vel = r.readUInt8(0x9a), again = r.readUInt8(0x188), every = r.readUInt8(0x189), mSize = r.readUInt8(0x18a);
  if (!again || !vel || life <= every) continue;
  const frames = (mSize + MONSTER) / (vel / SUBTILE);
  const hits = Math.min(CAP, Math.floor(life / every), Math.floor(frames / every) + 1);
  if (hits >= 2 && hits > (skills[hit[0]]?.hits || 0)) skills[hit[0]] = { hits, missile: i, velocity: vel, size: mSize, every, life };
}
writeFileSync(new URL("../src/data/multi-hit.json", import.meta.url), JSON.stringify({ patch, source: "missiles.bin (life 0x96, velocity 0x9A, hit again 0x188/0x189, size 0x18A, skill 0x194)", skills }, null, 1) + "\n");
console.log(`extract-multi-hit: ${Object.entries(skills).map(([id, s]) => `${id} ${s.hits}`).join(", ")}`);
