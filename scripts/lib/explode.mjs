// PKWARE Data Compression Library "explode", ported from Mark Adler's blast.c
// (zlib contrib, public domain). Used by MPQ archives (compression type 0x08).

const MAXBITS = 13;
// Compact code-length tables from blast.c: each byte is (count-1)<<4 | length.
const LITLEN = [
  11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9,
  11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12, 8, 12, 5, 38, 5, 38, 5, 11, 7,
  5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45, 44, 173,
];
const LENLEN = [2, 35, 36, 53, 38, 23];
const DISTLEN = [2, 20, 53, 230, 247, 151, 248];
const BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
const EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];

function construct(rep) {
  const lengths = [];
  for (const b of rep) for (let n = (b >> 4) + 1; n > 0; n--) lengths.push(b & 15);
  const count = new Array(MAXBITS + 1).fill(0);
  for (const l of lengths) count[l]++;
  const offs = [0, 0];
  for (let len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
  const symbol = [];
  lengths.forEach((l, s) => {
    if (l) symbol[offs[l]++] = s;
  });
  return { count, symbol };
}
const LIT = construct(LITLEN), LEN = construct(LENLEN), DIST = construct(DISTLEN);

export function explode(input, expected) {
  let pos = 0, bitbuf = 0, bitcnt = 0;
  const bits = (need) => {
    let val = bitbuf;
    while (bitcnt < need) {
      if (pos >= input.length) throw new Error("explode: input ended early");
      val |= input[pos++] << bitcnt;
      bitcnt += 8;
    }
    bitbuf = val >>> need;
    bitcnt -= need;
    return val & ((1 << need) - 1);
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= MAXBITS; len++) {
      code |= bits(1) ^ 1; // codes are stored bit-inverted
      const c = h.count[len];
      if (code < first + c) return h.symbol[index + (code - first)];
      index += c;
      first = (first + c) << 1;
      code <<= 1;
    }
    throw new Error("explode: bad code");
  };
  const lit = bits(8);
  const dict = bits(8);
  if (lit > 1 || dict < 4 || dict > 6) throw new Error("explode: bad header");
  const out = Buffer.alloc(expected);
  let n = 0;
  while (n < expected) {
    if (bits(1)) {
      const sym = decode(LEN);
      const len = BASE[sym] + bits(EXTRA[sym]);
      if (len === 519) break;
      const shift = len === 2 ? 2 : dict;
      const dist = ((decode(DIST) << shift) + bits(shift)) + 1;
      if (dist > n) throw new Error("explode: distance too far back");
      for (let i = 0; i < len && n < expected; i++, n++) out[n] = out[n - dist];
    } else out[n++] = lit ? decode(LIT) : bits(8);
  }
  return n === expected ? out : out.subarray(0, n);
}
