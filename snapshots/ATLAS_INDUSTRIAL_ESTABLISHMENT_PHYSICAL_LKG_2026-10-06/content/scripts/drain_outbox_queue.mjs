import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_INDEX = 'atlas_people_discovery_gate32_delta';

async function drain() {
  const dbConfig = parseDbUrl();
  const pool = new pg.Pool(dbConfig);

  console.log('--- RECLAIMING STALE PROCESSING ROWS ---');
  const reclaimRes = await pool.query(`
    UPDATE public.atlas_search_outbox
    SET status = 'PENDING', processing_worker_id = null, processing_started_at = null
    WHERE status = 'PROCESSING'
  `);
  console.log(`Reclaimed ${reclaimRes.rowCount} processing rows -> PENDING`);

  console.log('--- DRAINING OUTBOX INTO MEILISEARCH ---');
  let drained = 0;
  const BATCH_SIZE = 2000;

  while (true) {
    // 1. Claim batch
    const client = await pool.connect();
    let rows;
    try {
      const claimRes = await client.query(`
        UPDATE public.atlas_search_outbox
        SET status = 'PROCESSING', processing_started_at = clock_timestamp(), processing_worker_id = 'drain_worker'
        WHERE outbox_id IN (
          SELECT outbox_id
          FROM public.atlas_search_outbox
          WHERE status = 'PENDING'
          ORDER BY outbox_id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING outbox_id, atlas_person_id, payload
      `, [BATCH_SIZE]);
      rows = claimRes.rows;
    } finally {
      client.release();
    }

    if (!rows || rows.length === 0) {
      const checkRes = await pool.query("SELECT count(*) as count FROM public.atlas_search_outbox WHERE status IN ('PENDING', 'PROCESSING')");
      if (parseInt(checkRes.rows[0].count, 10) === 0) break;
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    // 2. Prepare documents for Meilisearch
    const docs = rows.map(r => {
      const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
      return {
        atlas_person_id: p.atlas_person_id || r.atlas_person_id,
        display_name: p.display_name || '',
        display_name_normalized: p.display_name_normalized || p.display_name || '',
        search_text_normalized: p.search_text_normalized || p.display_name || '',
        cuit_masked: p.cuit_masked || null,
        entity_type: p.entity_type || 'NATURAL_PERSON',
        source_id: p.source_id || 'ARCA_CONDICION_TRIBUTARIA',
        source_record_id: p.source_record_id || `rec_${p.cuit_masked}`,
        source_surface_id: p.source_surface_id || 'SURF_ARCA_RG1817',
        source_ids: p.source_ids || [p.source_id || 'ARCA_CONDICION_TRIBUTARIA'],
        evidence_state: p.evidence_state || 'HIGH_CONFIDENCE_OFFICIAL_REGISTRY',
        geography: p.geography || 'Argentina',
        province: p.province || 'Nacional',
        created_at: p.created_at || new Date().toISOString()
      };
    });

    // 3. Push to Meilisearch
    const pushRes = await fetch(`${MEILI_URL}/indexes/${MEILI_INDEX}/documents?primaryKey=atlas_person_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const pushJson = await pushRes.json();
    const taskUid = pushJson.taskUid;

    // 4. Wait for task completion
    while (true) {
      const taskRes = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
      const t = await taskRes.json();
      if (t.status === 'succeeded') break;
      if (t.status === 'failed') throw new Error(`Meili task ${taskUid} failed: ${JSON.stringify(t.error)}`);
      await new Promise(r => setTimeout(r, 20));
    }

    // 5. Bulk ACK
    const outboxIds = rows.map(r => r.outbox_id);
    await pool.query(`
      UPDATE public.atlas_search_outbox
      SET status = 'PUBLISHED', published_at = clock_timestamp(), last_error = null
      WHERE outbox_id = ANY($1::uuid[])
    `, [outboxIds]);

    drained += rows.length;
    console.log(`Drained ${drained} events into Meilisearch...`);
  }

  // Wait for indexing idle
  while (true) {
    const sRes = await fetch(`${MEILI_URL}/indexes/${MEILI_INDEX}/stats`);
    const s = await sRes.json();
    if (!s.isIndexing) break;
    await new Promise(r => setTimeout(r, 20));
  }

  const finalCheck = await pool.query(`
    SELECT count(*) as total,
           count(*) FILTER (WHERE status = 'PENDING') as pending,
           count(*) FILTER (WHERE status = 'PROCESSING') as processing,
           count(*) FILTER (WHERE status = 'PUBLISHED') as published
    FROM public.atlas_search_outbox
  `);
  console.log('Final outbox counts:', finalCheck.rows[0]);

  const finalMeili = await fetch(`${MEILI_URL}/indexes/${MEILI_INDEX}/stats`);
  console.log('Final Meili stats:', await finalMeili.json());

  await pool.end();
}

drain().catch(console.error);
