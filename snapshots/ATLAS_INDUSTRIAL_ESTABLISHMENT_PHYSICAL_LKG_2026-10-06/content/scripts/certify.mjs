import fs from 'node:fs';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const pgClient = await dbPool.connect();

  const BASELINE_CANONICAL_UNIQUE = 1782044;
  
  const pendingRes = await pgClient.query("SELECT count(*) as cnt FROM public.atlas_search_outbox WHERE status IN ('PENDING', 'PROCESSING') AND source_id = 'ARCA_CONDICION_TRIBUTARIA'");
  const finalOutboxPending = parseInt(pendingRes.rows[0].cnt, 10);
  
  const finalDbRes = await pgClient.query(`
    SELECT count(DISTINCT atlas_person_id) as canonical_count
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL;
  `);
  const FINAL_CANONICAL_UNIQUE = parseInt(finalDbRes.rows[0].canonical_count, 10);
  const CANONICAL_UNIQUE_DELTA = FINAL_CANONICAL_UNIQUE - BASELINE_CANONICAL_UNIQUE;

  const verdictPath = 'reports/atlas/discovery/atlas_final_1m_verdict_v1.json';
  const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));

  verdict.PUBLISHER.FINAL_OUTBOX_PENDING = finalOutboxPending;
  verdict.FINAL_CANONICAL_UNIQUE = FINAL_CANONICAL_UNIQUE;
  verdict.CANONICAL_UNIQUE_DELTA = CANONICAL_UNIQUE_DELTA;
  verdict.FINAL_1M_CERTIFIED = (CANONICAL_UNIQUE_DELTA === 1000000 && finalOutboxPending === 0 && FINAL_CANONICAL_UNIQUE === 2782044);
  verdict.timestamp = new Date().toISOString();

  fs.writeFileSync(verdictPath, JSON.stringify(verdict, null, 2));

  console.log('Verdict written.');
  console.log('FINAL_1M_CERTIFIED:', verdict.FINAL_1M_CERTIFIED);

  pgClient.release();
  await dbPool.end();
}

main().catch(console.error);
