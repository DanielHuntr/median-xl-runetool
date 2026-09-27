// Readers for Diablo II 1.13c compiled data (as used by Median XL / D2Sigma).
//  - .tbl string tables: key → string, and global string index → string.
//  - .bin excel tables: a uint32 record count followed by fixed-size records.

// String .tbl format: header, uint16 index table, 17-byte hash nodes, then text.
export function readTbl(buf) {
  const numElements = buf.readUInt16LE(2);
  const hashSize = buf.readUInt32LE(4);
  const indexOff = 21;
  const nodeOff = indexOff + numElements * 2;
  const byIndex = [];
  const byKey = new Map();
  for (let i = 0; i < numElements; i++) {
    const node = nodeOff + buf.readUInt16LE(indexOff + i * 2) * 17;
    if (!buf[node]) {
      byIndex.push(null);
      continue;
    }
    const keyOff = buf.readUInt32LE(node + 7);
    const strOff = buf.readUInt32LE(node + 11);
    const strLen = buf.readUInt16LE(node + 15);
    const key = buf.toString("latin1", keyOff, buf.indexOf(0, keyOff));
    const str = buf.toString("latin1", strOff, strOff + strLen).replace(/\0+$/, "");
    byIndex.push(str);
    byKey.set(key, str);
  }
  return { byIndex, byKey, count: numElements, hashSize };
}

// D2 resolves a global string index across three tables:
// string.tbl from 0, patchstring.tbl from 10000, expansionstring.tbl from 20000.
export function stringIndex(tbls) {
  return (i) => {
    if (i >= 20000) return tbls.expansion.byIndex[i - 20000] ?? null;
    if (i >= 10000) return tbls.patch.byIndex[i - 10000] ?? null;
    return tbls.base.byIndex[i] ?? null;
  };
}

export function readBin(buf) {
  const count = buf.readUInt32LE(0);
  const size = (buf.length - 4) / count;
  if (!Number.isInteger(size)) throw new Error(`Record size isn't whole (${buf.length - 4} bytes / ${count} records)`);
  return { count, size, record: (i) => buf.subarray(4 + i * size, 4 + (i + 1) * size) };
}
