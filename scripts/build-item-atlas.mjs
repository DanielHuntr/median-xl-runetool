// Packs the game item art (one PNG per graphic, from scripts/extract-item-art.mjs) into a
// few sprite sheets, so a page makes a handful of image requests instead of one per item.
//
// Input:  data/game/<patch>/item-art/*.png
// Output: public/planner/items/atlas-<n>.png and src/data/item-atlas.json
//         ({ sheets: [[w, h], …], art: { name: [sheet, x, y, w, h] } }).
//
// D2 art uses one 256-colour palette, so the sheets are written as palette PNGs, which
// are much smaller than RGBA. If the art ever has more than 256 colours they fall back to
// RGBA. Sheet file names carry a content hash so browsers can cache them for good.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// The patch the rest of the planner's art belongs to (never mix patches).
const PATCH = JSON.parse(readFileSync(new URL("../public/planner/item-art.json", import.meta.url), "utf8")).patch;
const srcDir = fileURLToPath(new URL(`../data/game/${PATCH}/item-art/`, import.meta.url));
const outDir = fileURLToPath(new URL("../public/planner/items/", import.meta.url));
const indexFile = fileURLToPath(new URL("../src/data/item-atlas.json", import.meta.url));
const SHEET_W = 1024, SHEET_H = 2048, PAD = 1;

// ---------- PNG decode (8-bit RGBA or RGB, non-interlaced: what our extractor writes)
function decode(buf) {
  let pos = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9];
      if (data[8] !== 8 || ![2, 6].includes(type) || data[12]) throw new Error(`unsupported PNG (depth ${data[8]}, type ${type})`);
    } else if (kind === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + x] = (row[x] + pred) & 255;
    }
  }
  if (bpp === 4) return { w, h, rgba: px };
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { px.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = 255; }
  return { w, h, rgba };
}

// ---------- PNG encode (palette or RGBA), choosing each row's filter by the usual heuristic
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}
function encode(w, h, pixels, bpp, extra = []) {
  const stride = w * bpp, raw = Buffer.alloc((stride + 1) * h);
  const cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < (bpp === 1 ? 1 : 5); f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const v = pixels[y * stride + x];
        const a = x >= bpp ? pixels[y * stride + x - bpp] : 0, b = y ? pixels[(y - 1) * stride + x] : 0;
        const c = x >= bpp && y ? pixels[(y - 1) * stride + x - bpp] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
        const r = (v - pred) & 255;
        cand[f][x] = r; sum += r < 128 ? r : 256 - r;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = bpp === 1 ? 3 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), ...extra,
    chunk("IDAT", deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Load, pack and write
if (!existsSync(srcDir)) throw new Error(`No item art in ${srcDir}; run scripts/extract-item-art.mjs first`);
// Which pages show each graphic (public/planner/item-art.json): unique and set art goes on
// its own sheets, base-item art on others, so a page only loads the sheets it shows. Art
// nothing refers to (dyes and the like) is left out.
const artIndex = JSON.parse(readFileSync(new URL("../public/planner/item-art.json", import.meta.url), "utf8"));
const group = new Map();
for (const v of Object.values(artIndex.bases)) for (const a of Object.values(v)) group.set(a.toLowerCase(), 1);
for (const rows of [...Object.values(artIndex.uniques), ...Object.values(artIndex.sets)])
  for (const [, a] of rows) group.set(a.toLowerCase(), 0);
const files = readdirSync(srcDir).filter((f) => f.endsWith(".png")).sort();
const images = files.filter((f) => group.has(f.slice(0, -4).toLowerCase()))
  .map((f) => ({ name: f.slice(0, -4), group: group.get(f.slice(0, -4).toLowerCase()), ...decode(readFileSync(srcDir + f)) }));

// Shelf packing by group, tallest first; each group starts a new sheet.
const order = [...images].sort((a, b) => a.group - b.group || b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
const sheets = [];
let sheet = null;
for (const im of order) {
  if (sheet && im.group !== sheet.group) sheet = null;
  if (!sheet || sheet.x + im.w > SHEET_W) {
    if (sheet) { sheet.y += sheet.rowH + PAD; sheet.x = 0; sheet.rowH = 0; }
    if (!sheet || sheet.y + im.h > SHEET_H) sheets.push((sheet = { x: 0, y: 0, rowH: 0, items: [], group: im.group }));
  }
  im.sheet = sheets.length - 1; im.x = sheet.x; im.y = sheet.y;
  sheet.items.push(im);
  sheet.x += im.w + PAD; sheet.rowH = Math.max(sheet.rowH, im.h);
}

// One palette across all sheets (index 0 is fully transparent).
const colours = new Map([[0, 0]]);
const key = (p, i) => (p[i + 3] === 0 ? 0 : ((p[i] << 24) | (p[i + 1] << 16) | (p[i + 2] << 8) | p[i + 3]) >>> 0 || 1);
for (const im of images) for (let i = 0; i < im.rgba.length; i += 4) { const k = key(im.rgba, i); if (!colours.has(k)) colours.set(k, colours.size); }
const indexed = colours.size <= 256;

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/^atlas-.*\.png$/.test(f)) rmSync(outDir + f);
const index = { sheets: [], art: {} };
let total = 0;
sheets.forEach((s, n) => {
  const w = SHEET_W, h = Math.max(...s.items.map((im) => im.y + im.h));
  const bpp = indexed ? 1 : 4, px = Buffer.alloc(w * h * bpp);
  for (const im of s.items)
    for (let y = 0; y < im.h; y++)
      for (let x = 0; x < im.w; x++) {
        const si = (y * im.w + x) * 4, di = ((im.y + y) * w + im.x + x) * bpp;
        if (indexed) px[di] = colours.get(key(im.rgba, si));
        else im.rgba.copy(px, di, si, si + 4);
      }
  let extra = [];
  if (indexed) {
    const plte = Buffer.alloc(colours.size * 3), trns = Buffer.alloc(colours.size);
    for (const [k, i] of colours) {
      if (!k) continue;
      plte[i * 3] = k >>> 24; plte[i * 3 + 1] = (k >>> 16) & 255; plte[i * 3 + 2] = (k >>> 8) & 255; trns[i] = k & 255;
    }
    extra = [chunk("PLTE", plte), chunk("tRNS", trns)];
  }
  const png = encode(w, h, px, bpp, extra);
  const file = `atlas-${n}-${createHash("sha1").update(png).digest("hex").slice(0, 8)}.png`;
  writeFileSync(outDir + file, png);
  total += png.length;
  index.sheets.push([file, w, h]);
  // Keyed in lower case: the game data refers to "DimensionalKey.png" as "dimensionalkey".
  for (const im of s.items) index.art[im.name.toLowerCase()] = [n, im.x, im.y, im.w, im.h];
});
writeFileSync(indexFile, JSON.stringify(index));
console.log(`${images.length} images → ${sheets.length} ${indexed ? "palette" : "RGBA"} sheets (${colours.size} colours), ${(total / 1024).toFixed(0)} KB`);
