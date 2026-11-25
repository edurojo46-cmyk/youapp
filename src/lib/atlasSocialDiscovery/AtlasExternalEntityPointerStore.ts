/**
 * ATLAS EXTERNAL ENTITY POINTER STORE (V1)
 * @src/lib/atlasSocialDiscovery/AtlasExternalEntityPointerStore.ts
 * 
 * Manages external non-social authority pointers:
 * - Public Registry IDs
 * - IMDb entity IDs (films, actors, creators)
 * - VIAF / LCNAF / ISNI / ORCID authority IDs
 * - Official Website Domains
 * - Institutional and Catalog Public References
 * 
 * Stored in partitioned, compressed columnar binary shards.
 * Strictly decoupled from AtlasSocialPointerStore.
 */

import fs from 'fs';
import path from 'path';
import type pg from 'pg';
import { dbPool } from '../../../server/db.ts';

export interface ExternalEntityPointer {
  pointer_id: string;
  source_type: 'WIKIDATA_AUTHORITY' | 'IMDB_CATALOG' | 'OFFICIAL_DOMAIN' | 'PUBLIC_REGISTRY';
  category: string;
  geography: string;
  external_id: string;
  domain_hash: number;
}

export interface ExternalShardManifest {
  shard_id: string;
  store_version: string;
  source_type: string;
  geography: string;
  category: string;
  file_location: string;
  record_count: number;
  file_size: number;
  checksum: string;
  is_active: boolean;
}

export class AtlasExternalEntityPointerStore {
  private static instance: AtlasExternalEntityPointerStore;
  private pool: pg.Pool;

  constructor(pool: pg.Pool = dbPool) {
    this.pool = pool;
  }

  public static getInstance(): AtlasExternalEntityPointerStore {
    if (!this.instance) {
      this.instance = new AtlasExternalEntityPointerStore();
    }
    return this.instance;
  }

  /**
   * Ensures the PostgreSQL schema for external entity shards exists
   */
  public async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_external_entity_pointer_shards (
        shard_id VARCHAR(255) PRIMARY KEY,
        store_version VARCHAR(50) NOT NULL,
        source_type VARCHAR(100) NOT NULL,
        geography VARCHAR(100) NOT NULL,
        category VARCHAR(100) NOT NULL,
        file_location TEXT NOT NULL,
        record_count INTEGER NOT NULL,
        file_size BIGINT NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ext_store_version ON public.atlas_external_entity_pointer_shards(store_version);
      CREATE INDEX IF NOT EXISTS idx_ext_source_type ON public.atlas_external_entity_pointer_shards(source_type);
      CREATE INDEX IF NOT EXISTS idx_ext_is_active ON public.atlas_external_entity_pointer_shards(is_active);
    `);
  }

  /**
   * Registers a shard into the external pointer store
   */
  public async registerShard(manifest: ExternalShardManifest): Promise<void> {
    await this.pool.query(`
      INSERT INTO public.atlas_external_entity_pointer_shards (
        shard_id, store_version, source_type, geography, category,
        file_location, record_count, file_size, checksum, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (shard_id) DO UPDATE SET
        record_count = EXCLUDED.record_count,
        file_size = EXCLUDED.file_size,
        checksum = EXCLUDED.checksum,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [
      manifest.shard_id,
      manifest.store_version,
      manifest.source_type,
      manifest.geography,
      manifest.category,
      manifest.file_location,
      manifest.record_count,
      manifest.file_size,
      manifest.checksum,
      manifest.is_active
    ]);
  }
}
