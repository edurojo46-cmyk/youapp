import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function tracePbaPipeline() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    console.log('=== TRACING PBA PIPELINE (Database SSOT, Live Metrics, Outbox, Discovery) ===');

    // 1. Live Metrics SSOT Table
    const lmRes = await client.query(`SELECT * FROM public.atlas_people_live_metrics LIMIT 1`);
    console.log('1. Live Metrics SSOT Table Row:');
    console.log(lmRes.rows[0]);

    // 2. Identity Map Counts
    const idMapRes = await client.query(`
      SELECT 
        count(*) as total_identities,
        max(created_at) as last_identity_created
      FROM public.atlas_person_identity_map
    `);
    console.log('\n2. Person Identity Map:');
    console.log('   Total Identities:', idMapRes.rows[0]?.total_identities);
    console.log('   Last Identity Created:', idMapRes.rows[0]?.last_identity_created);



    // 3. Search Outbox V2 PBA
    const outboxRes = await client.query(`
      SELECT 
        count(*) as outbox_total,
        max(created_at) as last_outbox_created,
        max(published_at) as last_outbox_published
      FROM public.atlas_search_outbox_v2
    `);
    console.log('\n3. Search Outbox V2:');
    console.log('   Outbox Rows:', outboxRes.rows[0]?.outbox_total);
    console.log('   Last Created:', outboxRes.rows[0]?.last_outbox_created);
    console.log('   Last Published:', outboxRes.rows[0]?.last_outbox_published);

    // 4. Discovery Candidates PBA
    const candRes = await client.query(`
      SELECT 
        count(*) as cand_total,
        max(created_at) as last_cand
      FROM public.atlas_people_discovery_candidates
      WHERE source_id ILIKE '%pba%' OR source_id ILIKE '%sedici%' OR source_id ILIKE '%unlp%' OR source_id ILIKE '%unlam%' OR source_id ILIKE '%unq%'
    `);
    console.log('\n4. Discovery Candidates (PBA sources):');
    console.log('   PBA Candidates:', candRes.rows[0]?.cand_total);
    console.log('   Last PBA Candidate Created:', candRes.rows[0]?.last_cand);

    // 5. Check Discovery Realtime Report
    if (fs.existsSync('reports/atlas/realtime/caba_pba_discovery.json')) {
      const disc = JSON.parse(fs.readFileSync('reports/atlas/realtime/caba_pba_discovery.json', 'utf8'));
      console.log('\n5. Discovery Report (caba_pba_discovery.json):');
      console.log('   CABA Baseline in Report:', disc.caba_baseline);
      console.log('   PBA Baseline in Report:', disc.pba_baseline);
      console.log('   CABA+PBA Total in Report:', disc.caba_pba_total);
      console.log('   Cycle Timestamp:', disc.cycle_timestamp);
    }

    // 6. Check Worker Heartbeat
    if (fs.existsSync('reports/atlas/realtime/worker_heartbeat.json')) {
      const hb = JSON.parse(fs.readFileSync('reports/atlas/realtime/worker_heartbeat.json', 'utf8'));
      console.log('\n6. Worker Heartbeat (worker_heartbeat.json):');
      console.log('   Timestamp:', hb.timestamp);
      console.log('   CABA+PBA Total:', hb.caba_pba_total);
      console.log('   CABA Count:', hb.caba_people_count);
      console.log('   PBA Count:', hb.pba_people_count);
      console.log('   PBA Speed Sec:', hb.pba_net_new_sec);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

tracePbaPipeline().catch(console.error);
