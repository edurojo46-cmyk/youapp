import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function checkBaselineTimestamp() {
  const pool = new pg.Pool(parseDbUrl());
  
  // Find outbox row at offset 702061 (ordered by created_at ASC)
  const baseOutbox = await pool.query(`
    SELECT outbox_id, created_at, published_at, atlas_person_id 
    FROM public.atlas_search_outbox 
    ORDER BY created_at ASC, outbox_id ASC 
    OFFSET 702060 LIMIT 2
  `);
  console.log('Outbox row 702061 (end of Stage 3D):', baseOutbox.rows[0]);
  console.log('Outbox row 702062 (first of Stage 3E):', baseOutbox.rows[1]);

  // Find identity map row at offset 2392776
  const baseMap = await pool.query(`
    SELECT id, created_at, source_person_id, atlas_person_id 
    FROM public.atlas_person_identity_map 
    ORDER BY id ASC 
    OFFSET 2392775 LIMIT 2
  `);
  console.log('Map row 2392776 (end of Stage 3D):', baseMap.rows[0]);
  console.log('Map row 2392777 (first of Stage 3E):', baseMap.rows[1]);

  await pool.end();
}

checkBaselineTimestamp().catch(console.error);
