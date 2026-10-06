import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();
const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

function normalizeText(str) {
  if (!str) return '';
  return str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function waitForMeiliTask(taskUid, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'succeeded') return data;
      if (data.status === 'failed') throw new Error(`Meili task failed: ${JSON.stringify(data.error)}`);
    }
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error(`Timeout waiting for Meili task ${taskUid}`);
}

async function runBatchBenchmark(batchSize) {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    // 1. Claim
    const t0 = Date.now();
    const claimRes = await client.query(
      'SELECT * FROM public.claim_search_outbox_batch($1, $2, 120);',
      [batchSize, `bench_probe_${batchSize}`]
    );
    const leaseTimeMs = Date.now() - t0;
    const count = claimRes.rows.length;
    if (count === 0) {
      console.log(`No pending rows for batch size ${batchSize}`);
      return null;
    }

    // 2. Prepare docs
    const docs = claimRes.rows.map(r => ({
      atlas_person_id: r.atlas_person_id,
      display_name: r.payload?.display_name || 'PERSON',
      display_name_normalized: normalizeText(r.payload?.display_name || 'PERSON'),
      search_text_normalized: r.payload?.search_text_normalized || 'SEARCH TEXT',
      source_id: r.source_id,
      source_record_id: r.source_record_id,
      created_at: r.created_at
    }));

    // 3. Post to Meilisearch
    const tSearch0 = Date.now();
    const meiliRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const taskJson = await meiliRes.json();
    await waitForMeiliTask(taskJson.taskUid);
    const searchAckMs = Date.now() - tSearch0;

    // 4. DB Ack
    const tDb0 = Date.now();
    const ackPayload = claimRes.rows.map(r => ({
      outbox_id: r.outbox_id,
      payload_version: r.payload_version || 1,
      status: 'PUBLISHED',
      error: null,
      attempt_count: r.attempt_count || 0
    }));
    await client.query(
      'SELECT public.mark_search_outbox_batch_status($1::jsonb);',
      [JSON.stringify(ackPayload)]
    );
    const dbAckMs = Date.now() - tDb0;

    const totalMs = Date.now() - t0;
    const opsSec = count / (totalMs / 1000);

    return {
      batch_size: count,
      lease_ms: leaseTimeMs,
      search_ack_ms: searchAckMs,
      db_ack_ms: dbAckMs,
      total_ms: totalMs,
      ops_sec: parseFloat(opsSec.toFixed(1))
    };
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('Testing single-worker throughput at batch sizes 250, 500, 1000...');
  for (const bs of [250, 500, 1000]) {
    const res = await runBatchBenchmark(bs);
    console.log(`Result for batch size ${bs}:`, res);
  }
}

main().catch(console.error);
