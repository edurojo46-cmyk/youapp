import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const dbConfig = parseDbUrl();

async function explain() {
  const p = new pg.Pool({ ...dbConfig, max: 1 });
  const c = await p.connect();
  const q = await c.query(`
    EXPLAIN ANALYZE
    SELECT
      c.atlas_person_id,
      s.document_id
    FROM (
      SELECT atlas_person_id
      FROM atlas_shadow.atlas_canonical_persons_v2
      LIMIT 100
    ) c
    LEFT JOIN atlas_shadow.atlas_argentina_people_search_v1 s
      ON s.document_id = 'doc_' || c.atlas_person_id;
  `);
  for (const r of q.rows) {
    console.log(r['QUERY PLAN']);
  }
  c.release();
  await p.end();
}
explain().catch(console.error);
