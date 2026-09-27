// Diablo II DC6 sprites (inventory graphics) → RGBA, with D2's palette and item
// colour maps. Format: 24-byte header, frame pointer table, then per frame a 32-byte
// header and run-length data drawn bottom-up: 0x80 ends a row, a byte with the high
// bit set skips (b & 0x7F) transparent pixels, any other byte b is followed by b
// palette indices.
import { deflateSync, crc32 } from "node:zlib";

export function readDc6(buf) {
  const directions = buf.readInt32LE(16), framesPerDir = buf.readInt32LE(20);
  if (buf.readInt32LE(0) !== 6 || directions < 1 || framesPerDir < 1) throw new Error("not a DC6 file");
  const at = buf.readUInt32LE(24); // first frame of the first direction
  const flip = buf.readInt32LE(at), width = buf.readInt32LE(at + 4), height = buf.readInt32LE(at + 8);
  const length = buf.readInt32LE(at + 28);
  const data = buf.subarray(at + 32, at + 32 + length);
  const pixels = new Int16Array(width * height).fill(-1); // -1 = transparent
  let x = 0, y = flip ? 0 : height - 1;
  for (let i = 0; i < data.length && y >= 0 && y < height; ) {
    const b = data[i++];
    if (b === 0x80) {
      x = 0;
      y += flip ? 1 : -1;
    } else if (b & 0x80) x += b & 0x7f;
    else for (let k = 0; k < b && i < data.length; k++, x++) if (x < width) pixels[y * width + x] = data[i++];
      else i++;
  }
  return { width, height, pixels };
}

/**
 * @param {{width, height, pixels}} sprite
 * @param {Buffer} palette  pal.dat: 256 × BGR
 * @param {Buffer|null} map  one 256-byte colour map (palette index → palette index), or null
 */
export function toRgba({ width, height, pixels }, palette, map = null) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] < 0) continue;
    const p = map ? map[pixels[i]] : pixels[i];
    out[i * 4] = palette[p * 3 + 2];
    out[i * 4 + 1] = palette[p * 3 + 1];
    out[i * 4 + 2] = palette[p * 3];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function png(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
