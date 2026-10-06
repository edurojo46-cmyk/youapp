import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dummyBatch = [{
      cuit: '20123456789',
      raw_name: 'TEST ROW',
      normalized_name: 'TEST ROW',
      cuit_masked: '20***89',
      identifier_value: 'dummy_hmac_test_123',
      candidate_atlas_person_id: 'atlas_arg_per_dummy123',
      source_id: 'ARCA_CONDICION_TRIBUTARIA',
      source_person_id: '20123456789'
    }];
    await client.query('SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb)', [JSON.stringify(dummyBatch)]);
    const res = await client.query('SELECT cuit, is_conflict, resolution_type, resolved_atlas_person_id FROM temp_resolved_candidates');
    console.log('Row-by-row ground truth from temp_resolved_candidates:');
    console.table(res.rows);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
