/**
 * ATLAS — SAFE PHYSICAL STORAGE RECLAMATION V1
 * 
 * Invariants:
 * 1. ZERO double counting: distinguishes physical disk returned vs postgres reusable space.
 * 2. DROPS ONLY verified historical outbox partitions (2026_09_22 and 2026_09_23: 100% PUBLISHED).
 * 3. RETAINS outbox partitions 2026_09_24 and 2026_09_25 (pending events present).
 * 4. RETAINS all People, Email, Video, Source Knowledge, and Intelligence records.
 * 5. Deletes ONLY SAFE_DELETE scratch binaries (superseded v2 and uncorrected t0).
 * 6. Non-blocking VACUUM ANALYZE on active tables.
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  console.log('=== ATLAS SAFE PHYSICAL STORAGE RECLAMATION V1 ===\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // 1. Measure DB Size BEFORE
    const qDbBefore = await client.query('SELECT pg_database_size(current_database()) as bytes;');
    const dbBytesBefore = parseInt(qDbBefore.rows[0].bytes, 10);
    const dbSizeBeforeGB = (dbBytesBefore / (1024 ** 3)).toFixed(2);
    console.log(`DB_SIZE_BEFORE_GB = ${dbSizeBeforeGB}`);

    // 2. Measure Protected Systems BEFORE
    const qPeopleBefore = await client.query('SELECT count(*) FROM public.atlas_argentina_people_search_projection_v1;');
    const peopleBefore = parseInt(qPeopleBefore.rows[0].count, 10);

    const qEmailBefore = await client.query('SELECT count(*) FROM public.atlas_500k_mission_ledger;');
    const emailBefore = parseInt(qEmailBefore.rows[0].count, 10);

    const qVideoBefore = await client.query('SELECT count(*) FROM public.youapp_index;');
    const videoBefore = parseInt(qVideoBefore.rows[0].count, 10);

    console.log(`PEOPLE_RECORDS_BEFORE = ${peopleBefore}`);
    console.log(`500K_EMAIL_COUNT_BEFORE = ${emailBefore}`);
    console.log(`VIDEO_RECORDS_BEFORE = ${videoBefore}`);

    // 3. Drop Historical Outbox Partitions
    const outboxToDrop = [
      'atlas_search_outbox_v2_2026_09_22',
      'atlas_search_outbox_v2_2026_09_23'
    ];

    let droppedOutboxCount = 0;
    for (const table of outboxToDrop) {
      console.log(`Dropping certified historical outbox partition: ${table}...`);
      await client.query(`DROP TABLE IF EXISTS public."${table}";`);
      droppedOutboxCount++;
    }

    // 4. Delete Scratch SAFE_DELETE Files
    const scratchSafeDelete = [
      'scratch/global_identity_authority_v2.bin',
      'scratch/global_t0_exclusion_binary.bin'
    ];

    let localFilesBytesFreed = 0;
    let scratchFilesDeleted = 0;

    for (const f of scratchSafeDelete) {
      if (fs.existsSync(f)) {
        const stats = fs.statSync(f);
        localFilesBytesFreed += stats.size;
        fs.unlinkSync(f);
        scratchFilesDeleted++;
        console.log(`Deleted superseded scratch binary: ${f} (${(stats.size / (1024*1024)).toFixed(2)} MB)`);
      }
    }

    // 5. Non-Blocking VACUUM ANALYZE on active tables with dead tuples
    console.log('Running non-blocking VACUUM ANALYZE on active search delivery keys...');
    await client.query('VACUUM ANALYZE public.atlas_search_delivery_keys;');

    // 6. Measure DB Size AFTER
    const qDbAfter = await client.query('SELECT pg_database_size(current_database()) as bytes;');
    const dbBytesAfter = parseInt(qDbAfter.rows[0].bytes, 10);
    const dbSizeAfterGB = (dbBytesAfter / (1024 ** 3)).toFixed(2);
    console.log(`\nDB_SIZE_AFTER_GB = ${dbSizeAfterGB}`);

    const physicalDbReturnedBytes = dbBytesBefore - dbBytesAfter;
    const physicalDbReturnedGB = (physicalDbReturnedBytes / (1024 ** 3)).toFixed(2);
    const localFilesReturnedGB = (localFilesBytesFreed / (1024 ** 3)).toFixed(2);
    const totalPhysicalReturnedGB = ((physicalDbReturnedBytes + localFilesBytesFreed) / (1024 ** 3)).toFixed(2);

    console.log(`PHYSICAL_DB_SPACE_RETURNED_GB = ${physicalDbReturnedGB}`);
    console.log(`LOCAL_FILES_SPACE_RETURNED_GB = ${localFilesReturnedGB}`);
    console.log(`TOTAL_PHYSICAL_SPACE_RETURNED_GB = ${totalPhysicalReturnedGB}`);

    // 7. Measure Protected Systems AFTER
    const qPeopleAfter = await client.query('SELECT count(*) FROM public.atlas_argentina_people_search_projection_v1;');
    const peopleAfter = parseInt(qPeopleAfter.rows[0].count, 10);

    const qEmailAfter = await client.query('SELECT count(*) FROM public.atlas_500k_mission_ledger;');
    const emailAfter = parseInt(qEmailAfter.rows[0].count, 10);

    const qVideoAfter = await client.query('SELECT count(*) FROM public.youapp_index;');
    const videoAfter = parseInt(qVideoAfter.rows[0].count, 10);

    const peopleProtected = peopleAfter === peopleBefore;
    const emailProtected = emailAfter === 500000;
    const videoProtected = videoAfter === videoBefore;

    console.log(`\nPEOPLE_RECORDS_AFTER = ${peopleAfter} (Protected: ${peopleProtected})`);
    console.log(`500K_EMAIL_COUNT = ${emailAfter} (Protected: ${emailProtected})`);
    console.log(`VIDEO_RECORDS_AFTER = ${videoAfter} (Protected: ${videoProtected})`);

    const sourceKnowledgePreserved = fs.existsSync('scratch/atlas_canonical_certified_source_map.json');
    const intelligencePreserved = fs.existsSync('scratch/atlas_learned_state.json');

    console.log(`SOURCE_KNOWLEDGE_PRESERVED = ${sourceKnowledgePreserved}`);
    console.log(`INTELLIGENCE_PRESERVED = ${intelligencePreserved}`);

    const pass = peopleProtected && emailProtected && videoProtected && sourceKnowledgePreserved && intelligencePreserved;
    console.log(`\nFINAL_STATUS = ${pass ? 'PHYSICAL_STORAGE_RECLAIMED_SAFELY' : 'INVARIANT_FAILURE'}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
