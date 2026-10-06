import pg from 'pg';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const INDEX_NAME = 'atlas_people_discovery_gate32_delta';

async function testSingleConfig(requestSize = 1000, inflight = 2, totalDocs = 4000) {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 4 });
  const client = await pool.connect();

  console.log(`\nTesting Config: Batch Size = ${requestSize}, Inflight = ${inflight}, Total Docs = ${totalDocs}`);

  // Fetch candidate rows
  const leaseRes = await client.query(`
    UPDATE public.atlas_search_outbox
    SET status = 'PROCESSING',
        processing_started_at = NOW(),
        processing_worker_id = 'test_cell'
    WHERE outbox_id IN (
      SELECT outbox_id FROM public.atlas_search_outbox
      WHERE status = 'PENDING'
      ORDER BY next_retry_at ASC, outbox_id ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING outbox_id, payload;
  `, [totalDocs]);

  const rows = leaseRes.rows;
  console.log(`Leased ${rows.length} rows.`);
  if (rows.length < totalDocs) {
    console.warn(`Only found ${rows.length} pending rows.`);
  }

  const tasks = [];
  const inFlight = new Map();
  let offset = 0;
  let tFirstLease = performance.now();
  let tLastPublished = 0;
  let totalHttpSubmitMs = 0;

  async function checkTask(uid) {
    const res = await fetch(`${MEILI_URL}/tasks/${uid}`);
    return await res.json();
  }

  while (offset < rows.length || inFlight.size > 0) {
    // Submit tasks up to inflight limit
    while (offset < rows.length && inFlight.size < inflight) {
      const chunk = rows.slice(offset, offset + requestSize);
      offset += chunk.length;

      const docs = chunk.map(r => r.payload);
      const rowIds = chunk.map(r => r.outbox_id);

      const t0 = performance.now();
      const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });
      const data = await res.json();
      totalHttpSubmitMs += (performance.now() - t0);

      inFlight.set(data.taskUid, {
        taskUid: data.taskUid,
        rowIds,
        docsCount: docs.length,
        clientSubmitMs: performance.now()
      });
      console.log(`Submitted Task ${data.taskUid} (${docs.length} docs). In-flight: ${inFlight.size}`);
    }

    // Poll in-flight tasks
    for (const [taskUid, meta] of Array.from(inFlight.entries())) {
      const task = await checkTask(taskUid);
      if (task.status === 'succeeded') {
        const clientLatency = performance.now() - meta.clientSubmitMs;
        const enq = new Date(task.enqueuedAt).getTime();
        const start = new Date(task.startedAt).getTime();
        const fin = new Date(task.finishedAt).getTime();

        const queueWaitMs = Math.max(0, start - enq);
        const actualProcMs = Math.max(0, fin - start);

        tasks.push({
          taskUid,
          docsCount: meta.docsCount,
          batchUid: task.batchUid,
          clientLatencyMs: clientLatency,
          queueWaitMs,
          actualProcMs
        });

        // Mark published
        await client.query(`
          UPDATE public.atlas_search_outbox
          SET status = 'PUBLISHED', published_at = NOW(), processing_worker_id = NULL
          WHERE outbox_id = ANY($1::uuid[])
        `, [meta.rowIds]);

        inFlight.delete(taskUid);
        tLastPublished = performance.now();
        console.log(`Task ${taskUid} SUCCEEDED | BatchUid: ${task.batchUid} | Queue: ${queueWaitMs}ms | Proc: ${actualProcMs}ms | ClientWall: ${clientLatency.toFixed(0)}ms`);
      } else if (task.status === 'failed' || task.status === 'canceled') {
        console.error(`Task ${taskUid} FAILED:`, task.error);
        inFlight.delete(taskUid);
      }
    }

    if (inFlight.size >= inflight || (offset >= rows.length && inFlight.size > 0)) {
      await new Promise(r => setTimeout(r, 20));
    }
  }

  const wallSec = (tLastPublished - tFirstLease) / 1000;
  const docsSec = wallSec > 0 ? (rows.length / wallSec) : 0;
  const avgQueueWait = tasks.length > 0 ? (tasks.reduce((a, b) => a + b.queueWaitMs, 0) / tasks.length) : 0;
  const avgProcMs = tasks.length > 0 ? (tasks.reduce((a, b) => a + b.actualProcMs, 0) / tasks.length) : 0;

  console.log(`\n=== RESULT FOR BATCH=${requestSize}, INFLIGHT=${inflight} ===`);
  console.log(`SUSTAINED RATE      : ${docsSec.toFixed(2)} docs/sec`);
  console.log(`TOTAL WALL SEC      : ${wallSec.toFixed(2)} s`);
  console.log(`AVG QUEUE WAIT MS   : ${avgQueueWait.toFixed(1)} ms`);
  console.log(`AVG PROC MS         : ${avgProcMs.toFixed(1)} ms`);
  console.log(`AVG HTTP SUBMIT MS  : ${(totalHttpSubmitMs / tasks.length).toFixed(1)} ms`);

  client.release();
  await pool.end();
}

testSingleConfig(1000, 2, 4000).catch(console.error);
