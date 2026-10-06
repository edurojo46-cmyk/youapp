import fs from 'node:fs';
import crypto from 'node:crypto';

// Fast 32-bit FNV-1a hash functions for double hashing
function fnv1a_32(str, seed = 0x811c9dc5) {
  let hval = seed;
  for (let i = 0; i < str.length; i++) {
    hval ^= str.charCodeAt(i);
    hval = (hval * 0x01000193) >>> 0;
  }
  return hval;
}

function djb2_32(str, seed = 5381) {
  let hval = seed;
  for (let i = 0; i < str.length; i++) {
    hval = (((hval << 5) + hval) + str.charCodeAt(i)) >>> 0;
  }
  return hval;
}

export class BloomFilter {
  constructor(sizeInBits, kHashes = 8) {
    this.sizeInBits = sizeInBits;
    this.kHashes = kHashes;
    this.buffer = new Uint8Array(Math.ceil(sizeInBits / 8));
    this.count = 0;
  }

  add(key) {
    const h1 = fnv1a_32(key);
    const h2 = djb2_32(key) || 1; // ensure non-zero
    for (let i = 0; i < this.kHashes; i++) {
      const bitPos = (h1 + i * h2) % this.sizeInBits;
      this.buffer[bitPos >> 3] |= (1 << (bitPos & 7));
    }
    this.count++;
  }

  has(key) {
    const h1 = fnv1a_32(key);
    const h2 = djb2_32(key) || 1;
    for (let i = 0; i < this.kHashes; i++) {
      const bitPos = (h1 + i * h2) % this.sizeInBits;
      if ((this.buffer[bitPos >> 3] & (1 << (bitPos & 7))) === 0) {
        return false; // DEFINITELY ABSENT (Zero false negatives)
      }
    }
    return true; // POSSIBLY PRESENT
  }

  byteLength() {
    return this.buffer.byteLength;
  }
}

export class IdentityInductionField {
  constructor(options = {}) {
    // 32 million bits ≈ 4 MB per field for ~2.7M keys
    const bits = options.bitsPerField || 32000000;
    const k = options.kHashes || 8;

    this.fieldSource = new BloomFilter(bits, k);
    this.fieldStable = new BloomFilter(bits, k);

    // Exact Delta Overlays for updates after watermark
    this.deltaSourceOverlay = new Set();
    this.deltaStableOverlay = new Set();

    // In-Flight Reservations (closes concurrent worker race window)
    this.inFlightSourceReservations = new Map(); // key -> Set(workerId)
    this.inFlightStableReservations = new Map(); // key -> Set(workerId)

    this.baseWatermark = null;
    this.effectiveWatermark = null;
    this.isBuilt = false;
  }

  // --- In-Flight Reservation Layer ---
  reserveInFlight(workerId, candidate) {
    if (!candidate.source_id || !candidate.source_person_id || !candidate.identifier_value) return false;
    const srcKey = `src:${candidate.source_id}:${candidate.source_person_id}`;
    const idKey = `hmac:${candidate.identifier_value}`;

    if (!this.inFlightSourceReservations.has(srcKey)) this.inFlightSourceReservations.set(srcKey, new Set());
    this.inFlightSourceReservations.get(srcKey).add(workerId);

    if (!this.inFlightStableReservations.has(idKey)) this.inFlightStableReservations.set(idKey, new Set());
    this.inFlightStableReservations.get(idKey).add(workerId);

    return true;
  }

  promoteReservationToCommitted(workerId, candidate, timestamp) {
    if (!candidate.source_id || !candidate.source_person_id || !candidate.identifier_value) return false;
    const srcKey = `src:${candidate.source_id}:${candidate.source_person_id}`;
    const idKey = `hmac:${candidate.identifier_value}`;

    // Remove in-flight reservation for worker
    if (this.inFlightSourceReservations.has(srcKey)) {
      const s = this.inFlightSourceReservations.get(srcKey);
      s.delete(workerId);
      if (s.size === 0) this.inFlightSourceReservations.delete(srcKey);
    }
    if (this.inFlightStableReservations.has(idKey)) {
      const s = this.inFlightStableReservations.get(idKey);
      s.delete(workerId);
      if (s.size === 0) this.inFlightStableReservations.delete(idKey);
    }

    // Add to committed delta overlay
    this.deltaSourceOverlay.add(srcKey);
    this.deltaStableOverlay.add(idKey);
    if (timestamp) this.effectiveWatermark = timestamp;
    return true;
  }

  releaseReservation(workerId, candidate) {
    if (!candidate.source_id || !candidate.source_person_id || !candidate.identifier_value) return false;
    const srcKey = `src:${candidate.source_id}:${candidate.source_person_id}`;
    const idKey = `hmac:${candidate.identifier_value}`;

    if (this.inFlightSourceReservations.has(srcKey)) {
      const s = this.inFlightSourceReservations.get(srcKey);
      s.delete(workerId);
      if (s.size === 0) this.inFlightSourceReservations.delete(srcKey);
    }
    if (this.inFlightStableReservations.has(idKey)) {
      const s = this.inFlightStableReservations.get(idKey);
      s.delete(workerId);
      if (s.size === 0) this.inFlightStableReservations.delete(idKey);
    }
    return true;
  }

  addBaseIdentity(sourceId, sourcePersonId, identifierType, identifierValue) {
    if (sourceId && sourcePersonId) {
      const srcKey = `src:${sourceId}:${sourcePersonId}`;
      this.fieldSource.add(srcKey);
    }
    if (identifierType === 'NATIONAL_IDENTITY_HMAC' && identifierValue) {
      const idKey = `hmac:${identifierValue}`;
      this.fieldStable.add(idKey);
    }
  }

  addDeltaIdentity(sourceId, sourcePersonId, identifierType, identifierValue, timestamp) {
    if (sourceId && sourcePersonId) {
      this.deltaSourceOverlay.add(`src:${sourceId}:${sourcePersonId}`);
    }
    if (identifierType === 'NATIONAL_IDENTITY_HMAC' && identifierValue) {
      this.deltaStableOverlay.add(`hmac:${identifierValue}`);
    }
    if (timestamp) {
      this.effectiveWatermark = timestamp;
    }
  }

  classifyCandidate(candidate, currentWorkerId = null) {
    // Check key sufficiency
    if (!candidate.source_id || !candidate.source_person_id || !candidate.identifier_value) {
      return {
        classification: 'INSUFFICIENT_STABLE_KEYS',
        reason: 'Missing source_id, source_person_id, or identifier_value',
        bypassDbRead: false
      };
    }

    const srcKey = `src:${candidate.source_id}:${candidate.source_person_id}`;
    const idKey = `hmac:${candidate.identifier_value}`;

    // 1. Check exact committed delta overlay first
    if (this.deltaSourceOverlay.has(srcKey) || this.deltaStableOverlay.has(idKey)) {
      return {
        classification: 'POSSIBLY_PRESENT',
        sourceMatch: this.deltaSourceOverlay.has(srcKey),
        identMatch: this.deltaStableOverlay.has(idKey),
        isDeltaMatch: true,
        isReservationMatch: false,
        bypassDbRead: false
      };
    }

    // 2. Check in-flight reservations (other workers currently processing this key)
    let inFlightSrc = false;
    if (this.inFlightSourceReservations.has(srcKey)) {
      const holders = this.inFlightSourceReservations.get(srcKey);
      inFlightSrc = currentWorkerId ? [...holders].some(w => w !== currentWorkerId) : (holders.size > 0);
    }
    let inFlightId = false;
    if (this.inFlightStableReservations.has(idKey)) {
      const holders = this.inFlightStableReservations.get(idKey);
      inFlightId = currentWorkerId ? [...holders].some(w => w !== currentWorkerId) : (holders.size > 0);
    }
    if (inFlightSrc || inFlightId) {
      return {
        classification: 'POSSIBLY_PRESENT',
        sourceMatch: inFlightSrc,
        identMatch: inFlightId,
        isDeltaMatch: false,
        isReservationMatch: true,
        bypassDbRead: false
      };
    }

    // 3. Query Base Bloom Filters
    const sourcePresent = this.fieldSource.has(srcKey);
    const identPresent = this.fieldStable.has(idKey);

    if (!sourcePresent && !identPresent) {
      // Both keys return FALSE from Bloom Filter -> DEFINITELY ABSENT!
      // Mathematically zero false negatives relative to the snapshot
      return {
        classification: 'DEFINITELY_ABSENT',
        sourceMatch: false,
        identMatch: false,
        bypassDbRead: true
      };
    }

    return {
      classification: 'POSSIBLY_PRESENT',
      sourceMatch: sourcePresent,
      identMatch: identPresent,
      isDeltaMatch: false,
      isReservationMatch: false,
      bypassDbRead: false
    };
  }

  getMemoryProfile() {
    const srcBytes = this.fieldSource.byteLength();
    const stBytes = this.fieldStable.byteLength();
    const deltaBytes = (this.deltaSourceOverlay.size + this.deltaStableOverlay.size) * 64; // approx 64 bytes per string in Set
    const totalBytes = srcBytes + stBytes + deltaBytes;
    const totalKeys = this.fieldSource.count + this.fieldStable.count;
    const bitsPerKey = totalKeys > 0 ? (totalBytes * 8) / totalKeys : 0;

    return {
      SOURCE_FIELD_KEYS: this.fieldSource.count,
      STABLE_FIELD_KEYS: this.fieldStable.count,
      TOTAL_FIELD_KEYS: totalKeys,
      RAW_KEY_BYTES_IF_EXACT: totalKeys * 64, // estimated raw string size
      FILTER_BYTES: srcBytes + stBytes,
      DELTA_OVERLAY_BYTES: deltaBytes,
      TOTAL_FIELD_MEMORY_MB: Number((totalBytes / (1024 * 1024)).toFixed(2)),
      BITS_PER_KEY: Number(bitsPerKey.toFixed(2)),
      BASE_WATERMARK: this.baseWatermark,
      EFFECTIVE_WATERMARK: this.effectiveWatermark,
      DELTA_COUNT: this.deltaSourceOverlay.size + this.deltaStableOverlay.size
    };
  }

  exportToFile(filePath) {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(this.fieldSource.sizeInBits, 0);
    header.writeUInt32LE(this.fieldSource.kHashes, 4);
    header.writeUInt32LE(this.fieldSource.count, 8);
    header.writeUInt32LE(this.fieldStable.sizeInBits, 12);
    header.writeUInt32LE(this.fieldStable.kHashes, 16);
    header.writeUInt32LE(this.fieldStable.count, 20);

    const wmBuf = Buffer.from(this.baseWatermark ? String(this.baseWatermark) : '', 'utf8');
    const wmLenBuf = Buffer.alloc(4);
    wmLenBuf.writeUInt32LE(wmBuf.length, 0);

    const fd = fs.openSync(filePath, 'w');
    fs.writeSync(fd, header);
    fs.writeSync(fd, wmLenBuf);
    if (wmBuf.length > 0) fs.writeSync(fd, wmBuf);
    fs.writeSync(fd, Buffer.from(this.fieldSource.buffer));
    fs.writeSync(fd, Buffer.from(this.fieldStable.buffer));
    fs.closeSync(fd);
  }

  static loadFromFile(filePath) {
    const buf = fs.readFileSync(filePath);
    let offset = 0;

    const srcBits = buf.readUInt32LE(0);
    const srcK = buf.readUInt32LE(4);
    const srcCount = buf.readUInt32LE(8);
    const stBits = buf.readUInt32LE(12);
    const stK = buf.readUInt32LE(16);
    const stCount = buf.readUInt32LE(20);
    offset = 32;

    const wmLen = buf.readUInt32LE(offset);
    offset += 4;
    const watermark = wmLen > 0 ? buf.subarray(offset, offset + wmLen).toString('utf8') : null;
    offset += wmLen;

    const srcByteLen = Math.ceil(srcBits / 8);
    const stByteLen = Math.ceil(stBits / 8);

    const field = new IdentityInductionField({ bitsPerField: srcBits, kHashes: srcK });
    field.baseWatermark = watermark;
    field.effectiveWatermark = watermark;

    field.fieldSource.count = srcCount;
    field.fieldSource.buffer.set(buf.subarray(offset, offset + srcByteLen));
    offset += srcByteLen;

    field.fieldStable.count = stCount;
    field.fieldStable.buffer.set(buf.subarray(offset, offset + stByteLen));

    field.isBuilt = true;
    return field;
  }
}
