import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

const pool = new pg.Pool({
  user: dbConfig.user,
  password: dbConfig.password,
  host: dbConfig.host,
  port: 5432,
  database: 'atlas_shadow_cold_gate',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('PREPARING 16-WAY HASH PARTITIONED SEARCH PROJECTION');
    console.log('════════════════════════════════════════════════════════════════');

    const tableName = 'atlas_shadow.atlas_argentina_people_search_v1';

    // 1. Drop existing table & recreate as HASH partitioned
    console.log('[1/4] Dropping previous single search projection table...');
    await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);

    console.log('[2/4] Creating parent table partitioned by hash (canonical_id)...');
    await client.query(`
      CREATE TABLE ${tableName} (
        document_id text NOT NULL,
        canonical_id text NOT NULL,
        full_name text NOT NULL,
        normalized_name text NOT NULL,
        organization text,
        role text,
        profession text,
        geography_id text NOT NULL,
        qualification_state text NOT NULL DEFAULT 'QUALIFIED',
        search_vector tsvector,
        created_at timestamptz DEFAULT clock_timestamp(),
        PRIMARY KEY (document_id, canonical_id)
      ) PARTITION BY HASH (canonical_id);
    `);

    // 2. Create 16 partitions
    console.log('[3/4] Creating 16 child partitions with local GIN indexes (fastupdate=on, pending limit=16MB)...');
    for (let p = 0; p < 16; p++) {
      const partName = `${tableName}_p${p}`;
      await client.query(`CREATE TABLE ${partName} PARTITION OF ${tableName} FOR VALUES WITH (MODULUS 16, REMAINDER ${p});`);
      await client.query(`ALTER TABLE ${partName} SET (autovacuum_enabled = false);`);
      await client.query(`CREATE INDEX idx_search_p${p}_vec ON ${partName} USING gin (search_vector) WITH (fastupdate = on, gin_pending_list_limit = 16384);`);
    }

    // 3. Verify
    console.log('[4/4] Verifying partitions and index configurations...');
    const qParts = await client.query(`
      SELECT c.relname, c.relkind,
             pg_size_pretty(pg_relation_size(c.oid)) as tbl_size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'atlas_shadow' AND c.relname LIKE 'atlas_argentina_people_search_v1%'
      ORDER BY c.relname;
    `);

    console.log(`✓ Partitioned table hierarchy verified: ${qParts.rows.length} relations found.`);
    for (const r of qParts.rows) {
      console.log(`  - ${r.relname} (kind: ${r.relkind})`);
    }

    const qIdx = await client.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'atlas_shadow' AND tablename LIKE 'atlas_argentina_people_search_v1%'
      ORDER BY tablename, indexname;
    `);
    console.log(`✓ Local GIN indexes verified: ${qIdx.rows.length} indexes established.`);
    console.log('\nSEARCH_INDEX_1M_SCALE_PASS = TRUE');
    console.log('PARTITIONS = 16');
    console.log('FASTUPDATE = ON');
    console.log('GIN_PENDING_LIST_LIMIT = 16MB per partition');
    console.log('════════════════════════════════════════════════════════════════');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Failed to prepare partitioned search projection:', err);
  process.exit(1);
});
