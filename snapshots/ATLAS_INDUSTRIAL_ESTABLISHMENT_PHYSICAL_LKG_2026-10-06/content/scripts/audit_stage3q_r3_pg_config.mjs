import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3Q-R3: POSTGRESQL CONFIGURATION & PERSISTENCE AUDIT');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // 1. PostgreSQL settings inspection
    const settingsToQuery = [
      'server_version',
      'shared_buffers',
      'effective_cache_size',
      'work_mem',
      'maintenance_work_mem',
      'checkpoint_timeout',
      'max_wal_size',
      'min_wal_size',
      'synchronous_commit',
      'wal_compression',
      'checkpoint_completion_target',
      'wal_buffers',
      'shared_preload_libraries'
    ];

    const config = {};
    for (const setting of settingsToQuery) {
      try {
        const res = await client.query(`SHOW ${setting}`);
        config[setting] = res.rows[0][setting];
        console.log(`  ${setting.padEnd(30)}: ${config[setting]}`);
      } catch (err) {
        config[setting] = 'UNAVAILABLE';
      }
    }

    // Check pg_buffercache availability
    let hasBuffercache = false;
    try {
      const bcRes = await client.query(`
        SELECT count(*) FROM pg_extension WHERE extname = 'pg_buffercache';
      `);
      hasBuffercache = parseInt(bcRes.rows[0].count, 10) > 0;
    } catch {}
    console.log(`  pg_buffercache available      : ${hasBuffercache}`);
    config['pg_buffercache_installed'] = hasBuffercache;

    // Check pg_stat_checkpointer vs pg_stat_bgwriter
    let checkpointerView = 'pg_stat_bgwriter';
    try {
      await client.query(`SELECT 1 FROM pg_stat_checkpointer LIMIT 1`);
      checkpointerView = 'pg_stat_checkpointer';
    } catch {}
    console.log(`  checkpointer telemetry view   : ${checkpointerView}`);
    config['checkpointer_view'] = checkpointerView;

    // 2. Relation persistence verification
    console.log('\n2. Verifying relation persistence (pg_class.relpersistence)...');
    const persistRes = await client.query(`
      SELECT 
        relname,
        relpersistence,
        CASE relpersistence 
          WHEN 'p' THEN 'PERMANENT (LOGGED)'
          WHEN 'u' THEN 'UNLOGGED'
          WHEN 't' THEN 'TEMPORARY'
        END as persistence_desc
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' 
        AND relname IN ('atlas_person_identity_map', 'atlas_search_outbox');
    `);

    const persistenceInfo = {};
    for (const r of persistRes.rows) {
      persistenceInfo[r.relname] = {
        relpersistence: r.relpersistence,
        desc: r.persistence_desc
      };
      console.log(`  ${r.relname.padEnd(30)}: ${r.persistence_desc} ('${r.relpersistence}')`);
    }

    const isProdLogged = persistenceInfo['atlas_person_identity_map']?.relpersistence === 'p';
    const r2Fidelity = isProdLogged ? 'PARTIAL' : 'EQUIVALENT';

    console.log(`\n  R2_PHYSICAL_WRITE_FIDELITY: ${r2Fidelity}`);
    console.log(`  (Production is LOGGED with WAL generation, whereas R2 shadow tables were UNLOGGED)\n`);

    const configReport = {
      timestamp: new Date().toISOString(),
      stage: 'STAGE3Q-R3',
      title: 'ATLAS STAGE 3Q-R3: POSTGRESQL ENGINE CONFIGURATION SNAPSHOT',
      POSTGRES_VERSION: config['server_version'],
      SHARED_BUFFERS: config['shared_buffers'],
      EFFECTIVE_CACHE_SIZE: config['effective_cache_size'],
      WORK_MEM: config['work_mem'],
      MAINTENANCE_WORK_MEM: config['maintenance_work_mem'],
      CHECKPOINT_TIMEOUT: config['checkpoint_timeout'],
      MAX_WAL_SIZE: config['max_wal_size'],
      SYNCHRONOUS_COMMIT: config['synchronous_commit'],
      WAL_COMPRESSION: config['wal_compression'],
      CHECKPOINT_COMPLETION_TARGET: config['checkpoint_completion_target'],
      ALL_CONFIG: config,
      PERSISTENCE_AUDIT: {
        production_tables: persistenceInfo,
        shadow_tables_r2: 'UNLOGGED (u)',
        R2_PHYSICAL_WRITE_FIDELITY: r2Fidelity,
        RATIONALE: 'Production atlas_person_identity_map and atlas_search_outbox are permanent logged tables (p). UNLOGGED shadow tables bypass WAL generation for heap writes, representing partial physical fidelity for write-intensive comparisons.'
      }
    };

    const outPath = path.join(process.cwd(), 'reports', 'atlas', 'discovery', 'atlas_stage3q_r3_pg_config_snapshot_v1.json');
    fs.writeFileSync(outPath, JSON.stringify(configReport, null, 2));
    console.log(`Saved pg config snapshot: ${outPath}\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
