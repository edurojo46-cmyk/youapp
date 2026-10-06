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
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`Timeout waiting for Meili task ${taskUid}`);
}

async function getMeiliQueueDepth() {
  try {
    const res = await fetch(`${MEILI_URL}/tasks?statuses=enqueued,processing`);
    if (res.ok) {
      const json = await res.json();
      return json.results ? json.results.length : 0;
    }
  } catch {}
  return 0;
}

const workerId = process.argv[2] || `pub_worker_${process.pid}`;
const batchSize = parseInt(process.argv[3] || '500', 10);
const maxLoops = parseInt(process.argv[4] || '1', 10);

async function main() {
  const client = new Client(dbConfig);
  await client.connect();

  const metrics = {
    worker_id: workerId,
    pid: process.pid,
    claimed_count: 0,
    published_count: 0,
    failed_tasks: 0,
    retries: 0,
    duplicate_leases: 0,
    duplicate_docs: 0,
    lease_time_ms: 0,
    search_ack_time_ms: 0,
    db_ack_time_ms: 0,
    total_time_ms: 0,
    batch_latencies: [],
    cpu_usage: process.cpuUsage(),
    rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    meili_queue_depth: 0,
    errors: []
  };

  const tStart = Date.now();

  try {
    metrics.meili_queue_depth = await getMeiliQueueDepth();

    for (let loop = 0; loop < maxLoops; loop++) {
      const tBatchStart = Date.now();

      // 1. Claim batch with FOR UPDATE SKIP LOCKED
      const tLeaseStart = Date.now();
      const claimRes = await client.query(
        'SELECT * FROM public.claim_search_outbox_batch($1, $2, 120);',
        [batchSize, workerId]
      );
      const batchLeaseMs = Date.now() - tLeaseStart;
      metrics.lease_time_ms += batchLeaseMs;

      if (claimRes.rows.length === 0) {
        break; // Outbox empty
      }
      metrics.claimed_count += claimRes.rows.length;

      // 2. Prepare docs
      const docs = claimRes.rows.map(r => {
        const p = r.payload || {};
        const displayName = p.display_name || p.raw_name || p.entity_name || 'UNKNOWN';
        return {
          atlas_person_id: r.atlas_person_id,
          display_name: displayName,
          display_name_normalized: normalizeText(displayName),
          search_text_normalized: p.search_text_normalized || normalizeText(displayName),
          role: p.role || 'CITIZEN',
          profession: p.profession || 'PROFESSIONAL',
          organization: p.organization || 'NACIONAL',
          source_id: r.source_id,
          source_record_id: r.source_record_id,
          source_surface_id: p.source_surface_id || r.source_id,
          source_ids: [r.source_id],
          evidence_state: p.evidence_state || 'HIGH_CONFIDENCE_OFFICIAL_REGISTRY',
          geography: p.geography || 'Argentina',
          province: p.province || 'Nacional',
          created_at: r.created_at
        };
      });

      // 3. Post to Meilisearch
      const tSearchStart = Date.now();
      const meiliRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });

      if (!meiliRes.ok) {
        metrics.failed_tasks++;
        throw new Error(`Meili HTTP error: ${meiliRes.status} ${await meiliRes.text()}`);
      }
      const taskJson = await meiliRes.json();
      await waitForMeiliTask(taskJson.taskUid);
      const batchSearchMs = Date.now() - tSearchStart;
      metrics.search_ack_time_ms += batchSearchMs;

      // 4. Mark status in DB
      const tDbAckStart = Date.now();
      const ackPayload = claimRes.rows.map(r => ({
        outbox_id: r.outbox_id,
        payload_version: r.payload_version || 1,
        status: 'PUBLISHED',
        error: null,
        attempt_count: r.attempt_count || 0
      }));

      const ackRes = await client.query(
        'SELECT public.mark_search_outbox_batch_status($1::jsonb) as result;',
        [JSON.stringify(ackPayload)]
      );
      const batchDbMs = Date.now() - tDbAckStart;
      metrics.db_ack_time_ms += batchDbMs;
      metrics.published_count += ackRes.rows[0].result.total_updated;

      const batchDurationMs = Date.now() - tBatchStart;
      metrics.batch_latencies.push(batchDurationMs);
    }

    metrics.total_time_ms = Date.now() - tStart;
    metrics.cpu_usage = process.cpuUsage(metrics.cpu_usage);
    metrics.rss_mb = Math.round(process.memoryUsage().rss / (1024 * 1024));

    console.log(JSON.stringify(metrics));
  } catch (err) {
    metrics.errors.push(err.message);
    metrics.total_time_ms = Date.now() - tStart;
    console.log(JSON.stringify(metrics));
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(JSON.stringify({ worker_id: workerId, fatal_error: err.message }));
  process.exit(1);
});
