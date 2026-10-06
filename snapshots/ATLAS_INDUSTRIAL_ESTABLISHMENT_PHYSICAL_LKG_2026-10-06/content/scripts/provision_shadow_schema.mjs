/**
 * scripts/provision_shadow_schema.mjs
 * Provisions identical schema structures in isolated database atlas_shadow_cold_gate
 * ZERO PEOPLE, ZERO CANDIDATES, ZERO REPLAY DATA.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const dbConfig = parseDbUrl(process.env.DATABASE_URL);
const shadowClient = new pg.Client({
  user: 'postgres',
  password: dbConfig.password,
  host: 'db.jtnurafmngaxdwlzpvxv.supabase.co',
  port: 5432,
  database: 'atlas_shadow_cold_gate'
});

async function provision() {
  await shadowClient.connect();
  console.log('[PROVISION] Connected to isolated database atlas_shadow_cold_gate on port 5432.');

  try {
    // 1. Extensions
    await shadowClient.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await shadowClient.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    // 2. Schema
    await shadowClient.query('CREATE SCHEMA IF NOT EXISTS atlas_shadow;');

    // 3. Staging Table
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.staging_incoming_records (
        batch_id TEXT NOT NULL,
        batch_seq INT NOT NULL,
        identity_hash BYTEA NOT NULL,
        source_id TEXT NOT NULL,
        source_record_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        organization TEXT,
        role TEXT,
        profession TEXT,
        geography_id TEXT,
        location_evidence TEXT,
        qualification_state TEXT,
        activity_state TEXT,
        created_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );
      CREATE INDEX IF NOT EXISTS idx_shadow_staging_batch ON atlas_shadow.staging_incoming_records (batch_id, batch_seq);
      CREATE INDEX IF NOT EXISTS idx_shadow_staging_identity ON atlas_shadow.staging_incoming_records (identity_hash);
    `);

    // 4. Hot Identity Keys
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_identity_keys_v2 (
        identity_hash BYTEA PRIMARY KEY,
        atlas_person_id TEXT NOT NULL,
        target_state INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );
      CREATE INDEX IF NOT EXISTS idx_shadow_id_keys_person ON atlas_shadow.atlas_identity_keys_v2 (atlas_person_id);
    `);

    // 5. Canonical Identity Map
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_person_identity_map (
        id BIGSERIAL PRIMARY KEY,
        atlas_person_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_person_id TEXT NOT NULL,
        identifier_type TEXT NOT NULL,
        identifier_value TEXT NOT NULL,
        evidence_id TEXT,
        confidence NUMERIC(3,2) DEFAULT 1.0,
        resolution_method TEXT,
        observed_at TIMESTAMPTZ DEFAULT clock_timestamp(),
        CONSTRAINT uq_shadow_person_identity_source UNIQUE (source_id, source_person_id)
      );
      CREATE INDEX IF NOT EXISTS idx_shadow_id_map_person ON atlas_shadow.atlas_person_identity_map (atlas_person_id);
      CREATE INDEX IF NOT EXISTS idx_shadow_id_map_ident ON atlas_shadow.atlas_person_identity_map (identifier_type, identifier_value);
    `);

    // 6. Canonical Persons Table
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_canonical_persons_v2 (
        atlas_person_id TEXT PRIMARY KEY,
        primary_identity_hash BYTEA,
        display_name TEXT NOT NULL,
        primary_organization TEXT,
        primary_role TEXT,
        primary_profession TEXT,
        geography_id TEXT,
        qualification_state TEXT,
        activity_state TEXT,
        evidence_summary TEXT,
        first_committed_at TIMESTAMPTZ DEFAULT clock_timestamp(),
        last_seen_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );
    `);

    // 7. Search Delivery Keys
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_search_delivery_keys (
        logical_event_id TEXT PRIMARY KEY,
        atlas_person_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        payload_version INT DEFAULT 1,
        delivery_status TEXT DEFAULT 'COMMITTED',
        first_committed_at TIMESTAMPTZ DEFAULT clock_timestamp(),
        last_seen_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );
    `);

    // 8. Search Outbox
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_search_outbox_v2 (
        outbox_id BIGSERIAL PRIMARY KEY,
        logical_event_id TEXT NOT NULL,
        atlas_person_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        payload_version INT DEFAULT 1,
        status TEXT DEFAULT 'PENDING',
        attempt_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
        next_retry_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );
    `);

    // 9. Search Projection Table (Searchable documents)
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_argentina_people_search_v1 (
        document_id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        organization TEXT,
        role TEXT,
        profession TEXT,
        geography_id TEXT,
        qualification_state TEXT,
        search_vector TSVECTOR,
        created_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );
      CREATE INDEX IF NOT EXISTS idx_shadow_search_vector ON atlas_shadow.atlas_argentina_people_search_v1 USING GIN (search_vector);
      CREATE INDEX IF NOT EXISTS idx_shadow_search_trgm ON atlas_shadow.atlas_argentina_people_search_v1 USING GIN (normalized_name gin_trgm_ops);
    `);

    // 10. Live Metrics Table (Initialized to 0)
    await shadowClient.query(`
      CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_people_live_metrics (
        id TEXT PRIMARY KEY,
        qualified_unique_real_people BIGINT DEFAULT 0,
        caba_pba_qualified_unique_real_people BIGINT DEFAULT 0,
        caba_qualified_unique_real_people BIGINT DEFAULT 0,
        pba_qualified_unique_real_people BIGINT DEFAULT 0,
        searchable_documents BIGINT DEFAULT 0,
        search_outbox_depth INT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
        last_verified_change_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );
      INSERT INTO atlas_shadow.atlas_people_live_metrics (
        id, qualified_unique_real_people, caba_pba_qualified_unique_real_people,
        caba_qualified_unique_real_people, pba_qualified_unique_real_people, searchable_documents, search_outbox_depth
      ) VALUES ('current', 0, 0, 0, 0, 0, 0)
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('[PROVISION] Schema replication complete. Zero people, zero candidates, zero preloaded data.');
  } finally {
    await shadowClient.end();
  }
}

provision().catch(console.error);
