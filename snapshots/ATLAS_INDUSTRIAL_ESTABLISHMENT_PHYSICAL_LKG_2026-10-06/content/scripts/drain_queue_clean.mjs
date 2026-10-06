import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const rem = await client.query("SELECT count(*) FILTER (WHERE status = 'PENDING') AS pending, count(*) FILTER (WHERE status = 'PROCESSING') AS processing FROM public.atlas_search_outbox");
console.log('Current Outbox Queue:', rem.rows[0]);

if (parseInt(rem.rows[0].pending, 10) > 0 || parseInt(rem.rows[0].processing, 10) > 0) {
  console.log('Draining remaining events to Meilisearch...');
  while (true) {
    const leaseRes = await client.query(`
      UPDATE public.atlas_search_outbox
      SET status = 'PROCESSING', processing_started_at = now()
      WHERE outbox_id IN (
        SELECT outbox_id FROM public.atlas_search_outbox WHERE status = 'PENDING' OR status = 'PROCESSING' LIMIT 1000 FOR UPDATE SKIP LOCKED
      ) RETURNING outbox_id, payload;
    `);
    if (leaseRes.rows.length === 0) break;
    const docs = leaseRes.rows.map(r => r.payload);
    const pushRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const pushData = await pushRes.json();
    while (true) {
      const tRes = await fetch('http://127.0.0.1:7700/tasks/' + pushData.taskUid);
      const t = await tRes.json();
      if (t.status === 'succeeded') break;
      await new Promise(r => setTimeout(r, 40));
    }
    const ids = leaseRes.rows.map(r => r.outbox_id);
    await client.query("UPDATE public.atlas_search_outbox SET status = 'PUBLISHED', published_at = now() WHERE outbox_id = ANY($1::uuid[])", [ids]);
    console.log(`Published ${docs.length} remaining events...`);
  }
}

const finalCheck = await client.query("SELECT count(*) FILTER (WHERE status = 'PENDING') AS pending, count(*) FILTER (WHERE status = 'PROCESSING') AS processing, count(*) AS total FROM public.atlas_search_outbox");
console.log('Final Drained Outbox Queue:', finalCheck.rows[0]);

await client.end();
