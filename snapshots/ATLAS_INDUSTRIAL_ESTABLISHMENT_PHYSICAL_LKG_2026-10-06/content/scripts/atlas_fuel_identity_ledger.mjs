/**
 * scripts/atlas_fuel_identity_ledger.mjs
 * 
 * PERSISTENT GLOBAL FUEL IDENTITY LEDGER
 * 
 * Invariant: ONE HUMAN = ONE FUEL CREDIT.
 * 
 * Checks every candidate human against:
 * 1. KNOWN AUTHORITY (GLOBAL_AUTHORITY_V4_PLUS_DELTA)
 * 2. ALL UNCONSUMED FUEL (CURRENT_UNCONSUMED_FUEL_AUTHORITY)
 * 3. ALL NEW DISCOVERIES IN CURRENT RUN (CURRENT_RUN_MEMCACHE)
 * before crediting.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { GlobalIdentityAuthorityV4, normalizeName, hash64 } from './build_global_identity_authority_v4.mjs';
import { UnconsumedFuelAuthority } from '../scratch/unconsumed_fuel_authority.mjs';

dotenv.config();

export class AtlasFuelIdentityLedger {
  constructor() {
    this.memoryLedger = new Map(); // hashBigInt -> Record
    this.authorityV4 = null;
    this.unconsumedFuelAuth = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('[LEDGER] Initializing Atlas Global Fuel Identity Ledger...');

    // 1. Load Known Authority V4 + Delta
    const v4Path = path.resolve('scratch/global_identity_authority_v4_plus_delta.bin');
    if (fs.existsSync(v4Path)) {
      this.authorityV4 = GlobalIdentityAuthorityV4.loadFromFile(v4Path);
      console.log(`  ✓ Authority V4+Delta loaded: ${this.authorityV4.count.toLocaleString()} keys.`);
    } else {
      console.warn('  ! Authority V4+Delta file not found, creating dummy');
      this.authorityV4 = new GlobalIdentityAuthorityV4(100);
      this.authorityV4.build();
    }

    // 2. Load Current Unconsumed Fuel Authority
    const fuelPath = path.resolve('scratch/current_unconsumed_fuel_authority.bin');
    if (fs.existsSync(fuelPath)) {
      this.unconsumedFuelAuth = UnconsumedFuelAuthority.loadFromFile(fuelPath);
      console.log(`  ✓ Unconsumed Fuel Authority loaded: ${this.unconsumedFuelAuth.count.toLocaleString()} keys.`);
    } else {
      console.warn('  ! Unconsumed Fuel Authority file not found, creating empty');
      this.unconsumedFuelAuth = new UnconsumedFuelAuthority(100);
      this.unconsumedFuelAuth.build();
    }

    // 3. Load existing ledger from disk if present
    const jsonlPath = path.resolve('scratch/atlas_fuel_identity_ledger.jsonl');
    if (fs.existsSync(jsonlPath)) {
      const content = fs.readFileSync(jsonlPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          const hashVal = BigInt(rec.hashVal);
          this.memoryLedger.set(hashVal, rec);
        } catch (_) {}
      }
    }

    const ledgerBinPath = path.resolve('scratch/atlas_fuel_identity_ledger.bin');
    if (fs.existsSync(ledgerBinPath)) {
      const buf = fs.readFileSync(ledgerBinPath);
      const count = buf.byteLength / 8;
      const arr = new BigUint64Array(buf.buffer, buf.byteOffset, count);
      for (let i = 0; i < count; i++) {
        if (!this.memoryLedger.has(arr[i])) {
          this.memoryLedger.set(arr[i], { loadedFromDisk: true });
        }
      }
      console.log(`  ✓ Loaded ${this.memoryLedger.size.toLocaleString()} existing ledger entries from disk.`);
    }

    this.isInitialized = true;
  }

  /**
   * Deterministically verify whether a human is globally unique
   * and credit them if not already seen.
   */
  evaluateAndCredit(candidate) {
    if (!this.isInitialized) {
      throw new Error('AtlasFuelIdentityLedger must be initialized before crediting.');
    }

    const { cuit, dni, name, jurisdiction, sourceId, populationClass } = candidate;
    const norm = normalizeName(name);

    // 1. Check Known Authority V4 + Delta
    if (cuit && this.authorityV4.has(cuit)) {
      return { credited: false, reason: 'AUTHORITY_V4_COLLISION', key: `CUIT:${cuit}` };
    }
    if (dni && this.authorityV4.has(dni)) {
      return { credited: false, reason: 'AUTHORITY_V4_COLLISION', key: `DNI:${dni}` };
    }
    if (norm && norm.length > 5 && this.authorityV4.has(norm)) {
      return { credited: false, reason: 'AUTHORITY_V4_COLLISION', key: `NAME:${norm}` };
    }

    // 2. Check Pre-Existing Unconsumed Fuel Authority
    if (cuit && this.unconsumedFuelAuth.has(`CUIT:${cuit}`)) {
      return { credited: false, reason: 'PREEXISTING_FUEL_COLLISION', key: `CUIT:${cuit}` };
    }
    if (dni && this.unconsumedFuelAuth.has(`DNI:${dni}`)) {
      return { credited: false, reason: 'PREEXISTING_FUEL_COLLISION', key: `DNI:${dni}` };
    }
    if (norm && norm.length > 5 && jurisdiction && this.unconsumedFuelAuth.has(`NAME_JUR:${norm}:${jurisdiction}`)) {
      return { credited: false, reason: 'PREEXISTING_FUEL_COLLISION', key: `NAME_JUR:${norm}:${jurisdiction}` };
    }

    // 3. Check Current Ledger / Current Run
    let canonicalKey = '';
    if (cuit) {
      canonicalKey = `AR:FUEL:CUIT:${cuit}`;
    } else if (dni) {
      canonicalKey = `AR:FUEL:DNI:${dni}`;
    } else if (norm) {
      canonicalKey = `AR:FUEL:NAME_JUR:${norm}:${jurisdiction || 'ARG'}`;
    } else {
      return { credited: false, reason: 'MISSING_IDENTIFIER' };
    }

    const hashVal = hash64(canonicalKey);
    if (this.memoryLedger.has(hashVal)) {
      return { credited: false, reason: 'INTRA_RUN_DUPLICATE', key: canonicalKey };
    }

    // Credit uniquely
    const entry = {
      hashVal,
      canonicalKey,
      displayName: name,
      normalizedName: norm,
      cuit: cuit || null,
      dni: dni || null,
      sourceId,
      populationClass,
      jurisdiction: jurisdiction || 'ARG',
      creditedAt: new Date().toISOString(),
      isNewInRun: true
    };

    this.memoryLedger.set(hashVal, entry);
    return { credited: true, canonicalKey, hashVal };
  }

  get totalCreditedCount() {
    return this.memoryLedger.size;
  }

  saveLedger() {
    console.log(`[LEDGER] Persisting ${this.memoryLedger.size.toLocaleString()} ledger entries to disk...`);
    const binPath = path.resolve('scratch/atlas_fuel_identity_ledger.bin');
    const jsonlPath = path.resolve('scratch/atlas_fuel_identity_ledger.jsonl');

    const arr = new BigUint64Array(this.memoryLedger.size);
    let idx = 0;
    const jsonlLines = [];

    for (const [hashVal, record] of this.memoryLedger.entries()) {
      arr[idx++] = hashVal;
      const serializableRecord = {
        ...record,
        hashVal: hashVal.toString()
      };
      delete serializableRecord.isNewInRun;
      jsonlLines.push(JSON.stringify(serializableRecord));
    }

    arr.sort();
    fs.writeFileSync(binPath, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    fs.writeFileSync(jsonlPath, jsonlLines.join('\n') + '\n');
    console.log(`  ✓ Persisted ${binPath} (${(arr.byteLength / (1024 * 1024)).toFixed(2)} MB) and ${jsonlPath}`);
  }

  async persistToDatabase() {
    const dbConfig = parseDbUrl();
    const pool = new pg.Pool({
      user: dbConfig.user,
      password: dbConfig.password,
      host: dbConfig.host,
      port: 5432,
      database: 'atlas_shadow_cold_gate',
      ssl: { rejectUnauthorized: false }
    });

    try {
      const client = await pool.connect();
      try {
        await client.query('CREATE SCHEMA IF NOT EXISTS atlas_authority;');
        await client.query(`
          CREATE TABLE IF NOT EXISTS atlas_authority.atlas_fuel_identity_ledger (
            canonical_identity_key text PRIMARY KEY,
            identity_hash_int8 bigint NOT NULL,
            display_name text NOT NULL,
            normalized_name text NOT NULL,
            cuit_redacted text,
            dni_redacted text,
            source_id text NOT NULL,
            population_class text NOT NULL,
            jurisdiction text NOT NULL,
            created_at timestamptz DEFAULT clock_timestamp()
          );
        `);

        console.log(`[LEDGER] Syncing new ledger entries to PostgreSQL database...`);
        let batch = [];
        let syncedCount = 0;
        for (const [_, r] of this.memoryLedger.entries()) {
          if (!r.canonicalKey || !r.isNewInRun) continue;
          const cuitRedacted = r.cuit ? `${r.cuit.slice(0, 2)}-******${r.cuit.slice(8)}` : null;
          const dniRedacted = r.dni ? `${r.dni.slice(0, 2)}****${r.dni.slice(-2)}` : null;
          const hashSigned = BigInt.asIntN(64, r.hashVal).toString();

          batch.push([
            r.canonicalKey,
            hashSigned,
            r.displayName || '',
            r.normalizedName || '',
            cuitRedacted,
            dniRedacted,
            r.sourceId || '',
            r.populationClass || '',
            r.jurisdiction || ''
          ]);
          syncedCount++;

          if (batch.length >= 1000) {
            await this.insertBatch(client, batch);
            batch = [];
          }
        }
        if (batch.length > 0) {
          await this.insertBatch(client, batch);
        }
        console.log(`  ✓ PostgreSQL ledger synchronization complete (${syncedCount.toLocaleString()} new entries inserted).`);
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('  ! DB sync skipped or encountered warning:', err.message);
    } finally {
      await pool.end();
    }
  }

  async insertBatch(client, rows) {
    const text = `
      INSERT INTO atlas_authority.atlas_fuel_identity_ledger
        (canonical_identity_key, identity_hash_int8, display_name, normalized_name, cuit_redacted, dni_redacted, source_id, population_class, jurisdiction)
      VALUES ${rows.map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`).join(', ')}
      ON CONFLICT (canonical_identity_key) DO NOTHING;
    `;
    const flat = rows.flat();
    await client.query(text, flat);
  }
}
