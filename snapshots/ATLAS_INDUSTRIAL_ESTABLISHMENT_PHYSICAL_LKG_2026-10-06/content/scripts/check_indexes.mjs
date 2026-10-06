import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'atlas_search_outbox'");
for (const r of res.rows) {
  console.log(r.indexname + ':\n  ' + r.indexdef);
}

await client.end();
