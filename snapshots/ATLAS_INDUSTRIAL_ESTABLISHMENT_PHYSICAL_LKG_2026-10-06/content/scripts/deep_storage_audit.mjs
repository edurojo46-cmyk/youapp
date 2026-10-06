/**
 * ATLAS — STORAGE FOOTPRINT DEEP AUDIT V1
 * 
 * Comprehensive Read-Only Audit of PostgreSQL & Filesystem.
 * Invariant: ZERO DELETIONS EXECUTED.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

function getSystemClassification(tableName) {
  const t = tableName.toLowerCase();
  if (t.includes('person') || t.includes('people')) return 'PEOPLE';
  if (t.includes('national_identity') || t.includes('source_key_map')) return 'PEOPLE';
  if (t.includes('email') || t.includes('mail')) return 'EMAIL';
  if (t.includes('search') || t.includes('outbox') || t.includes('youapp_index')) return 'SEARCH';
  if (t.includes('source') || t.includes('catalog') || t.includes('dataset')) return 'SOURCE_KNOWLEDGE';
  if (t.includes('intelligence') || t.includes('memory') || t.includes('rule') || t.includes('hypothesis') || t.includes('experiment')) return 'INTELLIGENCE';
  if (t.includes('ledger') || t.includes('checkpoints')) return 'LEDGER';
  if (t.includes('staging') || t.includes('temporary') || t.includes('temp')) return 'STAGING';
  if (t.includes('cache')) return 'CACHE';
  return 'OTHER';
}

function getTablePurpose(tableName) {
  const t = tableName.toLowerCase();
  if (t === 'atlas_person_identity_map') return 'Global person dedupe and canonical cluster identity resolution';
  if (t === 'atlas_people_discovery_candidates') return 'Discovery candidates pipeline for people search';
  if (t === 'atlas_hot_source_key_map') return 'Hot lookup index for source key provenance mapping';
  if (t === 'atlas_hot_national_identity_map') return 'National identity authority mapping table';
  if (t.startsWith('atlas_search_outbox_v2')) return 'Outbox event queue partition for search engine synchronization';
  if (t === 'atlas_search_delivery_keys') return 'Delivery tracking keys for search outbox commits';
  if (t === 'atlas_public_email_contacts_1m') return '1M public email contacts repository';
  if (t === 'atlas_global_email_authority') return 'Canonical certified email authority ledger (500K certified)';
  if (t === 'atlas_500k_mission_ledger') return 'Immutable canonical mission ledger for 500K benchmark';
  if (t === 'atlas_argentina_people_search_projection_v1') return 'Materialized search projection for Argentine people search';
  if (t === 'youapp_index') return 'Search indexing table for video and audio content';
  if (t === 'atlas_search_delivery_dead_letter') return 'Dead letter queue for failed search deliveries';
  return 'Operational Atlas table';
}

// Recursive directory size calculator
function getDirStats(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;
  let dirCount = 0;

  function traverse(currentPath) {
    if (!fs.existsSync(currentPath)) return;
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const full = path.join(currentPath, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          dirCount++;
          traverse(full);
        } else {
          fileCount++;
          totalBytes += stat.size;
        }
      } catch {}
    }
  }

  traverse(dirPath);
  return { totalBytes, totalMB: (totalBytes / (1024 * 1024)).toFixed(2), totalGB: (totalBytes / (1024 ** 3)).toFixed(3), fileCount, dirCount };
}

async function main() {
  console.log('=== ATLAS STORAGE FOOTPRINT DEEP AUDIT INITIALIZED ===\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // 1. Total Database Size
    const qDbSize = await client.query(`
      SELECT 
        pg_database_size(current_database()) as bytes,
        pg_size_pretty(pg_database_size(current_database())) as pretty;
    `);
    const totalDbBytes = parseInt(qDbSize.rows[0].bytes, 10);
    const totalDbGB = (totalDbBytes / (1024 ** 3)).toFixed(2);
    console.log(`TOTAL_DB_SIZE_GB = ${totalDbGB} (${totalDbBytes} bytes)\n`);

    // 2. Query Table & Index Breakdown
    const qTables = await client.query(`
      SELECT 
        c.relname as table_name,
        c.reltuples::bigint as estimated_rows,
        pg_relation_size(c.oid) as table_bytes,
        pg_indexes_size(c.oid) as index_bytes,
        COALESCE(pg_total_relation_size(c.reltoastrelid), 0) as toast_bytes,
        pg_total_relation_size(c.oid) as total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC;
    `);

    const allTables = qTables.rows.map(r => {
      const totalBytes = parseInt(r.total_bytes, 10);
      const tableBytes = parseInt(r.table_bytes, 10);
      const indexBytes = parseInt(r.index_bytes, 10);
      const toastBytes = parseInt(r.toast_bytes, 10);
      const estRows = parseInt(r.estimated_rows, 10);
      const system = getSystemClassification(r.table_name);
      const purpose = getTablePurpose(r.table_name);

      return {
        tableName: r.table_name,
        tableDataGB: (tableBytes / (1024 ** 3)).toFixed(3),
        indexSizeGB: (indexBytes / (1024 ** 3)).toFixed(3),
        toastSizeGB: (toastBytes / (1024 ** 3)).toFixed(3),
        totalSizeGB: (totalBytes / (1024 ** 3)).toFixed(3),
        totalBytes,
        tableBytes,
        indexBytes,
        toastBytes,
        rows: estRows,
        system,
        purpose
      };
    });

    // Top 30 Tables
    console.log('=== TOP 30 STORAGE CONSUMERS ===');
    console.log('TABLE_NAME | TABLE_DATA_GB | INDEX_SIZE_GB | TOAST_SIZE_GB | TOTAL_SIZE_GB | ROWS | SYSTEM | PURPOSE');
    allTables.slice(0, 30).forEach((t, i) => {
      console.log(`${(i+1).toString().padStart(2)}. ${t.tableName.padEnd(42)} | Data: ${t.tableDataGB} GB | Idx: ${t.indexSizeGB} GB | Toast: ${t.toastSizeGB} GB | Total: ${t.totalSizeGB} GB | Rows: ${String(t.rows).padStart(9)} | ${t.system.padEnd(16)} | ${t.purpose}`);
    });

    // System Totals
    const systemTotals = {
      PEOPLE: 0,
      EMAIL: 0,
      SEARCH: 0,
      SOURCE_KNOWLEDGE: 0,
      INTELLIGENCE: 0,
      LEDGER: 0,
      STAGING: 0,
      CACHE: 0,
      OTHER: 0
    };

    allTables.forEach(t => {
      if (systemTotals[t.system] !== undefined) {
        systemTotals[t.system] += t.totalBytes;
      } else {
        systemTotals.OTHER += t.totalBytes;
      }
    });

    console.log('\n=== STORAGE FOOTPRINT BY SYSTEM ===');
    for (const [sys, bytes] of Object.entries(systemTotals)) {
      console.log(`${sys.padEnd(20)}: ${(bytes / (1024 ** 3)).toFixed(2)} GB (${((bytes / totalDbBytes) * 100).toFixed(1)}%)`);
    }

    // 3. Index Deep Audit (Unused, Redundant, Oversized)
    const qIndexStats = await client.query(`
      SELECT 
        schemaname,
        relname as table_name,
        indexrelname as index_name,
        pg_relation_size(indexrelid) as index_bytes,
        pg_size_pretty(pg_relation_size(indexrelid)) as pretty_size,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      ORDER BY pg_relation_size(indexrelid) DESC;
    `);

    console.log('\n=== INDEX AUDIT (TOP 25 LARGEST INDEXES) ===');
    let totalUnusedIndexBytes = 0;
    const oversizedOrUnused = [];

    qIndexStats.rows.slice(0, 25).forEach(idx => {
      const idxBytes = parseInt(idx.index_bytes, 10);
      const isUnused = parseInt(idx.idx_scan, 10) === 0;
      if (isUnused) totalUnusedIndexBytes += idxBytes;

      const isSafeCandidate = idx.table_name.startsWith('atlas_search_outbox_v2_2026_09_2');
      console.log(`${idx.index_name.padEnd(45)} | Table: ${idx.table_name.padEnd(35)} | Size: ${idx.pretty_size.padStart(9)} | Scans: ${String(idx.idx_scan).padStart(7)} | Unused: ${isUnused ? 'YES' : 'NO'} | SafeCandidate: ${isSafeCandidate ? 'YES' : 'NO'}`);
      
      oversizedOrUnused.push({
        index_name: idx.index_name,
        table: idx.table_name,
        size_gb: (idxBytes / (1024 ** 3)).toFixed(3),
        scans: idx.idx_scan,
        isUnused,
        isSafeCandidate
      });
    });

    // 4. Table Bloat & Dead Tuples
    const qBloat = await client.query(`
      SELECT 
        relname as table_name,
        n_live_tup,
        n_dead_tup,
        CASE WHEN (n_live_tup + n_dead_tup) > 0 
             THEN ROUND((n_dead_tup::numeric / (n_live_tup + n_dead_tup)::numeric) * 100, 2)
             ELSE 0 
        END as dead_tuple_pct,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE (n_dead_tup > 1000 OR n_live_tup > 50000)
      ORDER BY n_dead_tup DESC;
    `);

    console.log('\n=== TABLE BLOAT & DEAD TUPLES AUDIT ===');
    let totalDeadTuples = 0;
    qBloat.rows.forEach(b => {
      const dead = parseInt(b.n_dead_tup, 10);
      const live = parseInt(b.n_live_tup, 10);
      totalDeadTuples += dead;
      console.log(`${b.table_name.padEnd(42)} | Live: ${String(live).padStart(9)} | Dead: ${String(dead).padStart(8)} (${b.dead_tuple_pct}%) | Autovacuum: ${b.last_autovacuum || 'NEVER'}`);
    });

    // 5. Duplicated Productive Payload Audit
    console.log('\n=== DUPLICATED PRODUCTIVE PAYLOAD AUDIT ===');
    // Check outbox partitions age and size
    const outboxTables = allTables.filter(t => t.tableName.startsWith('atlas_search_outbox_v2_'));
    const totalOutboxBytes = outboxTables.reduce((acc, t) => acc + t.totalBytes, 0);
    const totalOutboxGB = (totalOutboxBytes / (1024 ** 3)).toFixed(2);
    console.log(`Total Outbox Historical Partitions Size: ${totalOutboxGB} GB across ${outboxTables.length} partitions`);
    outboxTables.forEach(ot => {
      console.log(`  - ${ot.tableName}: ${ot.totalSizeGB} GB (${ot.rows.toLocaleString()} events)`);
    });

    // Check email redundancy: authority (557k) vs public email contacts (557k)
    const emailAuthority = allTables.find(t => t.tableName === 'atlas_global_email_authority');
    const emailContacts = allTables.find(t => t.tableName === 'atlas_public_email_contacts_1m');
    console.log(`Email Authority table size: ${emailAuthority ? emailAuthority.totalSizeGB : 0} GB`);
    console.log(`Public Email Contacts table size: ${emailContacts ? emailContacts.totalSizeGB : 0} GB`);

    // 6. Scratch / Local Storage Recursive Audit
    console.log('\n=== RECURSIVE LOCAL STORAGE AUDIT ===');
    const localDirs = [
      { name: 'scratch', path: 'scratch' },
      { name: 'scratch/physical_sources', path: 'scratch/physical_sources' },
      { name: 'scripts', path: 'scripts' },
      { name: 'src', path: 'src' },
      { name: '.gemini', path: 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide' }
    ];

    for (const d of localDirs) {
      if (fs.existsSync(d.path)) {
        const stats = getDirStats(d.path);
        console.log(`${d.name.padEnd(30)}: ${stats.totalMB.padStart(8)} MB (${stats.totalGB} GB) across ${stats.fileCount} files`);
      }
    }

    // Scratch subcomponents
    const scratchItems = fs.readdirSync('scratch').map(item => {
      const full = path.join('scratch', item);
      try {
        const stat = fs.statSync(full);
        return { name: item, isDir: stat.isDirectory(), size: stat.size };
      } catch {
        return { name: item, isDir: false, size: 0 };
      }
    });

    const scratchBinFiles = scratchItems.filter(i => !i.isDir && i.name.endsWith('.bin'));
    const scratchJsonlFiles = scratchItems.filter(i => !i.isDir && i.name.endsWith('.jsonl'));
    const binTotalMB = (scratchBinFiles.reduce((acc, f) => acc + f.size, 0) / (1024*1024)).toFixed(2);
    const jsonlTotalMB = (scratchJsonlFiles.reduce((acc, f) => acc + f.size, 0) / (1024*1024)).toFixed(2);
    console.log(`\nScratch .bin files total: ${binTotalMB} MB (${scratchBinFiles.length} files)`);
    console.log(`Scratch .jsonl files total: ${jsonlTotalMB} MB (${scratchJsonlFiles.length} files)`);

    // 7. Summary Estimates
    const peopleTotalGB = (systemTotals.PEOPLE / (1024 ** 3)).toFixed(2);
    const emailTotalGB = (systemTotals.EMAIL / (1024 ** 3)).toFixed(2);
    const searchTotalGB = (systemTotals.SEARCH / (1024 ** 3)).toFixed(2);
    const sourceKnowledgeTotalGB = (systemTotals.SOURCE_KNOWLEDGE / (1024 ** 3)).toFixed(2);
    const intelligenceTotalGB = (systemTotals.INTELLIGENCE / (1024 ** 3)).toFixed(2);
    const ledgerTotalGB = (systemTotals.LEDGER / (1024 ** 3)).toFixed(2);
    const otherTotalGB = (systemTotals.OTHER / (1024 ** 3)).toFixed(2);

    // Potential safe recoveries:
    // 1. Old delivered outbox partitions (search sync queues from Sep 22, 23, 24, 25) which are 3.78 GB!
    // 2. Dead tuple space reclaimable via vacuum
    // 3. Scratch unreferenced candidate binaries / temporary jsons
    console.log('\n=== AUDIT SUMMARY METRICS ===');
    console.log(`PEOPLE_TOTAL_GB = ${peopleTotalGB}`);
    console.log(`EMAIL_TOTAL_GB = ${emailTotalGB}`);
    console.log(`SEARCH_INDEX_TOTAL_GB = ${searchTotalGB}`);
    console.log(`SOURCE_KNOWLEDGE_TOTAL_GB = ${sourceKnowledgeTotalGB}`);
    console.log(`INTELLIGENCE_TOTAL_GB = ${intelligenceTotalGB}`);
    console.log(`LEDGER_TOTAL_GB = ${ledgerTotalGB}`);
    console.log(`OTHER_TOTAL_GB = ${otherTotalGB}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
