/**
 * src/lib/atlas/oracle/LocalNoveltyOracle.mjs
 * 
 * ATLAS LOCAL CANONICAL NOVELTY ORACLE (V1)
 * 
 * Architectural Guarantees (V1.7 Section 5 & 6):
 * 1. Read-only advisory oracle: Answers KNOWN_CANONICAL or POSSIBLY_NEW.
 * 2. NEVER creates, merges, deletes, or permanently suppresses canonical people.
 * 3. PostgreSQL remains Single Source of Truth (SSOT).
 * 4. Exact 128-bit / 256-bit SHA-256 identity hash namespace (zero synthetic 64-bit collision artifacts).
 * 5. Dual update mechanism: Bootstraps from database snapshot, then receives immediate
 *    commit confirmation feedback + periodic incremental sync.
 */

import crypto from 'crypto';

export class LocalNoveltyOracle {
  constructor(options = {}) {
    this.hashBits = options.hashBits || 128; // 128-bit or 256-bit
    this.hmacSecret = options.hmacSecret || process.env.ATLAS_HMAC_SECRET || 'atlas_deterministic_identity_salt_2026';
    
    // Exact identity hash storage (128-bit hex prefix = 32 hex chars)
    this.knownHashes = new Set();
    
    this.stats = {
      bootstrapAt: null,
      bootstrapKeyCount: 0,
      incrementalKeysAdded: 0,
      queriesTotal: 0,
      knownHits: 0,
      possiblyNewCount: 0,
      lastSyncAt: null
    };
  }

  /**
   * Normalizes an identity key to exact 128-bit or 256-bit SHA hash
   */
  hashKey(canonicalKeyString) {
    const fullHash = crypto.createHash('sha256').update(canonicalKeyString).digest('hex');
    return this.hashBits === 128 ? fullHash.slice(0, 32) : fullHash;
  }

  /**
   * Extract strong identity keys from a candidate row
   */
  extractIdentityKeys(row) {
    const keys = [];

    // 1. NATIONAL_IDENTITY_HMAC
    if (row.identifier_value && (row.identifier_type === 'NATIONAL_IDENTITY_HMAC' || row.identifier_type === 'DNI_HMAC')) {
      keys.push(`ID:NATIONAL_IDENTITY_HMAC:${row.identifier_value}`);
    } else if (row.identifier_value && row.identifier_value.length >= 6) {
      const cleanDoc = row.identifier_value.replace(/\D/g, '');
      if (cleanDoc.length >= 6 && cleanDoc.length <= 9) {
        const docHmac = crypto.createHmac('sha256', this.hmacSecret).update(`ARG:DNI:${cleanDoc}`).digest('hex');
        keys.push(`ID:NATIONAL_IDENTITY_HMAC:${docHmac}`);
      }
    }

    // 2. atlas_person_id
    if (row.atlas_person_id && row.atlas_person_id.startsWith('atlas_arg_per_')) {
      keys.push(`PERSON:${row.atlas_person_id}`);
    }

    // 3. Other strong global identifiers
    if (row.identifier_type && row.identifier_value && ['ARCA_CUIT', 'WIKIDATA_QID', 'ORCID'].includes(row.identifier_type)) {
      keys.push(`ID:${row.identifier_type}:${row.identifier_value}`);
    }

    return keys;
  }

  /**
   * Advisory Novelty Classification: KNOWN_CANONICAL or POSSIBLY_NEW
   */
  evaluateRow(row) {
    this.stats.queriesTotal++;
    const keys = this.extractIdentityKeys(row);

    if (keys.length === 0) {
      this.stats.possiblyNewCount++;
      return {
        status: 'POSSIBLY_NEW',
        reason: 'NO_STRONG_GLOBAL_IDENTIFIER',
        matchedKey: null
      };
    }

    for (const k of keys) {
      const h = this.hashKey(k);
      if (this.knownHashes.has(h)) {
        this.stats.knownHits++;
        return {
          status: 'KNOWN_CANONICAL',
          reason: 'ORACLE_EXACT_MATCH',
          matchedKey: k
        };
      }
    }

    this.stats.possiblyNewCount++;
    return {
      status: 'POSSIBLY_NEW',
      reason: 'ORACLE_NOVEL_KEY',
      matchedKey: null
    };
  }

  /**
   * Bulk bootstrap from database snapshot or stream
   */
  bootstrap(rawKeysOrHashes) {
    const t0 = performance.now();
    for (const item of rawKeysOrHashes) {
      if (!item) continue;
      const h = item.length === (this.hashBits / 4) ? item : this.hashKey(item);
      this.knownHashes.add(h);
    }
    this.stats.bootstrapAt = new Date().toISOString();
    this.stats.bootstrapKeyCount = this.knownHashes.size;
    this.stats.lastSyncAt = this.stats.bootstrapAt;
    const durMs = performance.now() - t0;
    return {
      loadedKeys: this.knownHashes.size,
      durationMs: Number(durMs.toFixed(2)),
      memoryBytes: this.getMemoryUsageBytes()
    };
  }

  /**
   * Register confirmed committed identities from successful PostgreSQL batch
   */
  registerCommittedRow(row) {
    const keys = this.extractIdentityKeys(row);
    let added = 0;
    for (const k of keys) {
      const h = this.hashKey(k);
      if (!this.knownHashes.has(h)) {
        this.knownHashes.add(h);
        added++;
        this.stats.incrementalKeysAdded++;
      }
    }
    return added;
  }

  /**
   * Memory Footprint Estimation (V1.7 Section 6)
   */
  getMemoryUsageBytes() {
    const keyCount = this.knownHashes.size;
    const rawBytesPerKey = this.hashBits / 8; // 16 bytes for 128-bit
    const rawKeyBytes = keyCount * rawBytesPerKey;
    // In V8, a Set entry of string holds ~64 bytes of object overhead + string characters
    const v8EstimatedBytes = Math.round(keyCount * (rawBytesPerKey * 2 + 56));
    return {
      keyCount,
      rawKeyBytes,
      totalMemoryBytes: v8EstimatedBytes
    };
  }

  getStats() {
    return {
      ...this.stats,
      hashBits: this.hashBits,
      activeKeys: this.knownHashes.size,
      memory: this.getMemoryUsageBytes()
    };
  }
}
