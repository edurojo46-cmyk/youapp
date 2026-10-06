import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

async function runStorageForensicAudit() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('ATLAS STORAGE FORENSIC AUDIT (READ-ONLY)');
  console.log('════════════════════════════════════════════════════════════════');

  // 1. Cluster Databases
  const defaultPool = new pg.Pool({ ...dbConfig, max: 1 });
  const defaultClient = await defaultPool.connect();

  let dbSizes = [];
  try {
    const qDb = await defaultClient.query(`
      SELECT datname, 
             pg_database_size(datname) AS size_bytes,
             pg_size_pretty(pg_database_size(datname)) AS size_pretty
      FROM pg_database
      ORDER BY size_bytes DESC;
    `);
    dbSizes = qDb.rows;
  } finally {
    defaultClient.release();
    await defaultPool.end();
  }

  console.log('\n[1] ALL DATABASES:');
  console.table(dbSizes);

  const totalClusterBytes = dbSizes.reduce((sum, d) => sum + BigInt(d.size_bytes), 0n);
  const totalClusterGB = Number(totalClusterBytes) / (1024 ** 3);

  // 2. Audit Postgres (Production) Database
  const prodPool = new pg.Pool({ ...dbConfig, database: 'postgres', max: 1 });
  const prodClient = await prodPool.connect();

  let prodSchemas = [];
  let prodTopTables = [];
  let prodTopIndexes = [];
  let prodBgwriter = null;
  let prodStatDb = null;

  try {
    const qSchemas = await prodClient.query(`
      SELECT 
        schemaname,
        count(*) AS rel_count,
        sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_bytes,
        pg_size_pretty(sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) AS total_pretty
      FROM pg_tables
      GROUP BY schemaname
      ORDER BY total_bytes DESC;
    `);
    prodSchemas = qSchemas.rows;

    const qTables = await prodClient.query(`
      SELECT 
        schemaname || '.' || tablename AS table_name,
        pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) AS table_bytes,
        pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) AS index_bytes,
        pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) AS total_bytes,
        pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS table_pretty,
        pg_size_pretty(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS index_pretty,
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_pretty
      FROM pg_tables
      ORDER BY total_bytes DESC
      LIMIT 25;
    `);
    prodTopTables = qTables.rows;

    const qIndexes = await prodClient.query(`
      SELECT 
        schemaname || '.' || indexname AS index_name,
        tablename,
        pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname)) AS index_bytes,
        pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname))) AS index_pretty
      FROM pg_indexes
      ORDER BY index_bytes DESC
      LIMIT 25;
    `);
    prodTopIndexes = qIndexes.rows;

    const qBg = await prodClient.query(`SELECT * FROM pg_stat_bgwriter;`);
    prodBgwriter = qBg.rows[0];

    const qStatDb = await prodClient.query(`
      SELECT datname, temp_files, temp_bytes, pg_size_pretty(temp_bytes) AS temp_pretty,
             deadlocks, blks_read, blks_hit,
             round(blks_hit::numeric / nullif(blks_hit + blks_read, 0) * 100, 2) AS cache_hit_ratio
      FROM pg_stat_database
      WHERE datname = 'postgres';
    `);
    prodStatDb = qStatDb.rows[0];
  } finally {
    prodClient.release();
    await prodPool.end();
  }

  // 3. Audit atlas_shadow_cold_gate Database
  const shadowPool = new pg.Pool({ ...dbConfig, database: 'atlas_shadow_cold_gate', max: 1 });
  const shadowClient = await shadowPool.connect();

  let shadowSchemas = [];
  let shadowTopTables = [];
  let shadowTopIndexes = [];
  let shadowSpecificTables = [];
  let shadowStatDb = null;

  try {
    const qSchemas = await shadowClient.query(`
      SELECT 
        schemaname,
        count(*) AS rel_count,
        sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_bytes,
        pg_size_pretty(sum(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)))) AS total_pretty
      FROM pg_tables
      GROUP BY schemaname
      ORDER BY total_bytes DESC;
    `);
    shadowSchemas = qSchemas.rows;

    const qTables = await shadowClient.query(`
      SELECT 
        schemaname || '.' || tablename AS table_name,
        pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) AS table_bytes,
        pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) AS index_bytes,
        pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) AS total_bytes,
        pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS table_pretty,
        pg_size_pretty(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS index_pretty,
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_pretty
      FROM pg_tables
      ORDER BY total_bytes DESC
      LIMIT 25;
    `);
    shadowTopTables = qTables.rows;

    const qIndexes = await shadowClient.query(`
      SELECT 
        schemaname || '.' || indexname AS index_name,
        tablename,
        pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname)) AS index_bytes,
        pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname))) AS index_pretty
      FROM pg_indexes
      ORDER BY index_bytes DESC
      LIMIT 25;
    `);
    shadowTopIndexes = qIndexes.rows;

    // Specific inspection of target tables
    const targetTables = [
      'atlas_canonical_persons_v2',
      'atlas_argentina_people_search_v1',
      'staging_incoming_records',
      't0_immutable_identity_exclusion'
    ];

    for (const tName of targetTables) {
      // Find which schema has this table
      const qFind = await shadowClient.query(`
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE tablename = $1;
      `, [tName]);

      if (qFind.rows.length === 0) {
        // Also check if it exists in postgres database
        shadowSpecificTables.push({
          table_name: `atlas_shadow.${tName}`,
          exists: false,
          live_tuples: 0,
          dead_tuples: 0,
          table_size: '0 MB',
          table_bytes: 0,
          index_size: '0 MB',
          index_bytes: 0,
          total_size: '0 MB',
          total_bytes: 0
        });
        continue;
      }

      for (const row of qFind.rows) {
        const fullRel = `${row.schemaname}.${row.tablename}`;
        const qStat = await shadowClient.query(`
          SELECT 
            n_live_tup, 
            n_dead_tup,
            last_vacuum, 
            last_autovacuum
          FROM pg_stat_user_tables
          WHERE schemaname = $1 AND relname = $2;
        `, [row.schemaname, row.tablename]);

        const stat = qStat.rows[0] || {};
        const qSizes = await shadowClient.query(`
          SELECT 
            pg_relation_size($1::regclass) AS table_bytes,
            pg_indexes_size($1::regclass) AS index_bytes,
            pg_total_relation_size($1::regclass) AS total_bytes;
        `, [fullRel]);

        const s = qSizes.rows[0];
        shadowSpecificTables.push({
          table_name: fullRel,
          exists: true,
          live_tuples: Number(stat.n_live_tup || 0),
          dead_tuples: Number(stat.n_dead_tup || 0),
          table_size: (Number(s.table_bytes) / (1024 ** 2)).toFixed(2) + ' MB',
          table_bytes: Number(s.table_bytes),
          index_size: (Number(s.index_bytes) / (1024 ** 2)).toFixed(2) + ' MB',
          index_bytes: Number(s.index_bytes),
          total_size: (Number(s.total_bytes) / (1024 ** 2)).toFixed(2) + ' MB',
          total_bytes: Number(s.total_bytes)
        });
      }
    }

    const qStatDbShadow = await shadowClient.query(`
      SELECT datname, temp_files, temp_bytes, pg_size_pretty(temp_bytes) AS temp_pretty,
             deadlocks, blks_read, blks_hit,
             round(blks_hit::numeric / nullif(blks_hit + blks_read, 0) * 100, 2) AS cache_hit_ratio
      FROM pg_stat_database
      WHERE datname = 'atlas_shadow_cold_gate';
    `);
    shadowStatDb = qStatDbShadow.rows[0];
  } finally {
    shadowClient.release();
    await shadowPool.end();
  }

  // Also check if any shadow tables exist in `postgres` db!
  const checkProdShadowPool = new pg.Pool({ ...dbConfig, database: 'postgres', max: 1 });
  const checkProdShadowClient = await checkProdShadowPool.connect();
  let prodShadowTables = [];
  try {
    const qProdShadow = await checkProdShadowClient.query(`
      SELECT schemaname, tablename, 
             pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_pretty,
             pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) AS total_bytes
      FROM pg_tables
      WHERE schemaname LIKE '%shadow%' OR tablename LIKE '%shadow%' OR tablename LIKE '%benchmark%'
      ORDER BY total_bytes DESC;
    `);
    prodShadowTables = qProdShadow.rows;
  } finally {
    checkProdShadowClient.release();
    await checkProdShadowPool.end();
  }

  return {
    totalClusterBytes: totalClusterBytes.toString(),
    totalClusterGB: totalClusterGB.toFixed(2),
    dbSizes,
    prodSchemas,
    prodTopTables,
    prodTopIndexes,
    prodBgwriter,
    prodStatDb,
    shadowSchemas,
    shadowTopTables,
    shadowTopIndexes,
    shadowSpecificTables,
    shadowStatDb,
    prodShadowTables
  };
}

runStorageForensicAudit().then(report => {
  console.log('\n--- AUDIT COMPLETE ---');
  fs.writeFileSync('reports/atlas/realtime/storage_forensics_audit.json', JSON.stringify(report, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('Saved to reports/atlas/realtime/storage_forensics_audit.json');
}).catch(console.error);

