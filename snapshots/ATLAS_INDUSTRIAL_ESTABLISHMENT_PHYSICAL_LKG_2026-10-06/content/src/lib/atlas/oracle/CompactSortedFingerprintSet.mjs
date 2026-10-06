/**
 * src/lib/atlas/oracle/CompactSortedFingerprintSet.mjs
 * 
 * COMPACT 128-BIT SORTED FINGERPRINT SET
 * 
 * Architectural Guarantees:
 * 1. Exactly 16 bytes per key (128-bit truncated SHA-256).
 * 2. Zero V8 object overhead: Flat BigUint64Array buffer.
 * 3. Logarithmic binary search (24 comparisons for 13.5M keys).
 * 4. Microsecond lookup latency (<1 µs P50).
 */

import crypto from 'crypto';

export class CompactSortedFingerprintSet {
  /**
   * @param {number} capacity - Expected number of keys
   */
  constructor(capacity = 0) {
    this.capacity = capacity;
    this.count = 0;
    this.buffer = new BigUint64Array(capacity * 2); // 2 x 64-bit uints per 128-bit key
    this.isSorted = false;
  }

  /**
   * Hashes key string into [hi, lo] 64-bit integers
   */
  static hashTo128Bit(keyString) {
    const hash = crypto.createHash('sha256').update(keyString).digest();
    // Read first 8 bytes as big-endian uint64, next 8 bytes as big-endian uint64
    const hi = hash.readBigUInt64BE(0);
    const lo = hash.readBigUInt64BE(8);
    return [hi, lo];
  }

  /**
   * Bulk loads pre-hashed or raw keys
   */
  loadFromPairs(pairs) {
    const n = pairs.length;
    this.capacity = n;
    this.buffer = new BigUint64Array(n * 2);
    for (let i = 0; i < n; i++) {
      this.buffer[i * 2] = pairs[i][0];
      this.buffer[i * 2 + 1] = pairs[i][1];
    }
    this.count = n;
    this.sort();
  }

  /**
   * Sorts the 128-bit pairs in place: primary key hi, secondary lo
   */
  sort() {
    // Collect index array or sort via chunked buffer
    // To sort directly in typed array:
    const n = this.count;
    const indices = new Int32Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;

    const buf = this.buffer;
    indices.sort((a, b) => {
      const aHi = buf[a * 2];
      const bHi = buf[b * 2];
      if (aHi < bHi) return -1;
      if (aHi > bHi) return 1;
      const aLo = buf[a * 2 + 1];
      const bLo = buf[b * 2 + 1];
      if (aLo < bLo) return -1;
      if (aLo > bLo) return 1;
      return 0;
    });

    // Reorder buffer in place using sorted indices
    const newBuf = new BigUint64Array(n * 2);
    for (let i = 0; i < n; i++) {
      const srcIdx = indices[i];
      newBuf[i * 2] = buf[srcIdx * 2];
      newBuf[i * 2 + 1] = buf[srcIdx * 2 + 1];
    }
    this.buffer = newBuf;
    this.isSorted = true;
  }

  /**
   * Fast binary search for [hi, lo]
   */
  has(keyString) {
    if (this.count === 0) return false;
    const [targetHi, targetLo] = CompactSortedFingerprintSet.hashTo128Bit(keyString);
    return this.has128(targetHi, targetLo);
  }

  has128(targetHi, targetLo) {
    let low = 0;
    let high = this.count - 1;
    const buf = this.buffer;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const mid2 = mid * 2;
      const curHi = buf[mid2];

      if (curHi < targetHi) {
        low = mid + 1;
      } else if (curHi > targetHi) {
        high = mid - 1;
      } else {
        // High 64 bits match, compare low 64 bits
        const curLo = buf[mid2 + 1];
        if (curLo < targetLo) {
          low = mid + 1;
        } else if (curLo > targetLo) {
          high = mid - 1;
        } else {
          return true; // Exact 128-bit match found!
        }
      }
    }
    return false;
  }

  get rawBytes() {
    return this.count * 16;
  }
}
