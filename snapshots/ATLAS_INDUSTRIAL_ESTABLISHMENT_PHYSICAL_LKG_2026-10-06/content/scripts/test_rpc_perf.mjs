import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const envContent = fs.readFileSync('.env', 'utf8');
  let url = '', key = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/["']/g, '');
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim().replace(/["']/g, '');
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('\n--- Testing 4 concurrent Supabase RPC calls ---');
  const t4_0 = performance.now();
  const promises4 = Array.from({ length: 4 }).map(async (_, idx) => {
    const start = performance.now();
    const res = await supabase.rpc('commit_canonical_with_search_outbox', {
      p_identity_rows: [],
      p_outbox_rows: []
    });
    const dur = performance.now() - start;
    return { idx, dur, ok: res.data?.ok };
  });
  const results4 = await Promise.all(promises4);
  const total4 = performance.now() - t4_0;
  console.log(`4 concurrent RPCs completed in ${total4.toFixed(1)} ms:`, results4);

  console.log('\n--- Testing 8 concurrent Supabase RPC calls ---');
  const t8_0 = performance.now();
  const promises8 = Array.from({ length: 8 }).map(async (_, idx) => {
    const start = performance.now();
    const res = await supabase.rpc('commit_canonical_with_search_outbox', {
      p_identity_rows: [],
      p_outbox_rows: []
    });
    const dur = performance.now() - start;
    return { idx, dur, ok: res.data?.ok };
  });
  const results8 = await Promise.all(promises8);
  const total8 = performance.now() - t8_0;
  console.log(`8 concurrent RPCs completed in ${total8.toFixed(1)} ms:`, results8);

  await client.end();
}

main().catch(console.error);
