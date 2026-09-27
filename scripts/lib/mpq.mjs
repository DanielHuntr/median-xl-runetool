// Minimal read-only MPQ (v1) reader for extracting Median XL game tables.
// Implements the documented format (see StormLib): encrypted hash/block tables,
// sector-based files, zlib (0x02) and PKWARE DCL "implode" (0x08) compression.
// Files are found by the standard hash of their in-archive path, so no listfile is needed.
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { explode } from "./explode.mjs";

const cryptTable = (() => {
  const t = new Uint32Array(0x500);
  let seed = 0x00100001;
  for (let i = 0; i < 0x100; i++)
    for (let j = 0, idx = i; j < 5; j++, idx += 0x100) {
      seed = (seed * 125 + 3) % 0x2aaaab;
      const hi = (seed & 0xffff) << 16;
      seed = (seed * 125 + 3) % 0x2aaaab;
      t[idx] = (hi | (seed & 0xffff)) >>> 0;
    }
  return t;
})();

export function hashString(str, type) {
  let s1 = 0x7fed7fed, s2 = 0xeeeeeeee;
  for (const ch of str.toUpperCase().replace(/\//g, "\\")) {
    const c = ch.charCodeAt(0);
    s1 = (cryptTable[type * 0x100 + c] ^ ((s1 + s2) >>> 0)) >>> 0;
    s2 = (c + s1 + s2 + (s2 << 5) + 3) >>> 0;
  }
  return s1 >>> 0;
}

function decrypt(u32, key) {
  let seed = 0xeeeeeeee;
  for (let i = 0; i < u32.length; i++) {
    seed = (seed + cryptTable[0x400 + (key & 0xff)]) >>> 0;
    const ch = (u32[i] ^ ((key + seed) >>> 0)) >>> 0;
    key = ((((~key << 21) >>> 0) + 0x11111111) >>> 0 | (key >>> 11)) >>> 0;
    seed = (ch + seed + (seed << 5) + 3) >>> 0;
    u32[i] = ch;
  }
  return u32;
}
const u32s = (buf, off, count) => {
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) out[i] = buf.readUInt32LE(off + i * 4);
  return out;
};

export function openMpq(path) {
  const buf = readFileSync(path);
  const at = buf.indexOf("MPQ\x1a");
  if (at < 0) throw new Error(`${path}: not an MPQ archive`);
  const h = {
    sectorSize: 512 << buf.readUInt16LE(at + 0x0e),
    hashPos: buf.readUInt32LE(at + 0x10),
    blockPos: buf.readUInt32LE(at + 0x14),
    hashCount: buf.readUInt32LE(at + 0x18),
    blockCount: buf.readUInt32LE(at + 0x1c),
  };
  const hashes = decrypt(u32s(buf, at + h.hashPos, h.hashCount * 4), hashString("(hash table)", 3));
  const blocks = decrypt(u32s(buf, at + h.blockPos, h.blockCount * 4), hashString("(block table)", 3));

  function find(name) {
    const a = hashString(name, 1), b = hashString(name, 2);
    for (let n = 0, i = hashString(name, 0) % h.hashCount; n < h.hashCount; n++, i = (i + 1) % h.hashCount) {
      const bi = hashes[i * 4 + 3];
      if (bi === 0xffffffff) return null;
      if (hashes[i * 4] === a && hashes[i * 4 + 1] === b && bi !== 0xfffffffe) return bi;
    }
    return null;
  }
  function decompress(data, size) {
    if (data.length >= size) return data;
    const mask = data[0];
    const body = data.subarray(1);
    if (mask === 0x02) return inflateSync(body);
    if (mask === 0x08) return explode(body, size);
    throw new Error(`Unsupported MPQ compression 0x${mask.toString(16)}`);
  }
  // Decrypts a byte range in 32-bit words; trailing bytes are left as stored.
  function decryptBytes(raw, key) {
    const copy = Buffer.from(raw);
    const words = decrypt(u32s(copy, 0, copy.length >> 2), key);
    words.forEach((w, i) => copy.writeUInt32LE(w, i * 4));
    return copy;
  }
  function read(name) {
    const bi = find(name);
    if (bi == null) return null;
    const [pos, csize, fsize, flags] = blocks.subarray(bi * 4, bi * 4 + 4);
    if (!(flags & 0x80000000)) return null;
    const start = at + pos;
    const compressed = flags & 0x200, imploded = flags & 0x100;
    // Encrypted files: key from the bare file name, adjusted by position with FIX_KEY.
    let key = null;
    if (flags & 0x10000) {
      key = hashString(name.split(/[\\/]/).pop(), 3);
      if (flags & 0x20000) key = (((key + pos) >>> 0) ^ fsize) >>> 0;
    }
    const unpack = (raw, want) => (raw.length === want ? raw : compressed ? decompress(raw, want) : explode(raw, want));
    if (flags & 0x01000000) {
      let raw = buf.subarray(start, start + csize);
      if (key != null) raw = decryptBytes(raw, key);
      return compressed || imploded ? unpack(raw, fsize) : Buffer.from(raw);
    }
    if (!compressed && !imploded) {
      const out = [];
      for (let s = 0, o = 0; o < fsize; s++, o += h.sectorSize) {
        let raw = buf.subarray(start + o, start + Math.min(fsize, o + h.sectorSize));
        if (key != null) raw = decryptBytes(raw, (key + s) >>> 0);
        out.push(raw);
      }
      return Buffer.concat(out);
    }
    const sectors = Math.ceil(fsize / h.sectorSize);
    let offs = u32s(buf, start, sectors + 1);
    if (key != null) offs = decrypt(offs, (key - 1) >>> 0);
    const out = [];
    for (let s = 0; s < sectors; s++) {
      const want = Math.min(h.sectorSize, fsize - s * h.sectorSize);
      let raw = buf.subarray(start + offs[s], start + offs[s + 1]);
      if (key != null) raw = decryptBytes(raw, (key + s) >>> 0);
      out.push(unpack(raw, want));
    }
    return Buffer.concat(out);
  }
  return { header: h, read, has: (n) => find(n) != null, blockCount: h.blockCount };
}
