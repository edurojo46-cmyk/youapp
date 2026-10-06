import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== AGE DISTRIBUTION SAMPLING VIA TABLESAMPLE SYSTEM ===');

// 1. Outbox age sampling (0.1% of 4.1M rows = ~4,100 rows sampled across all disk pages)
const outboxSample = await client.query(`
  SELECT 
    CASE 
      WHEN created_at >= now() - interval '24 hours' THEN '<24H'
      WHEN created_at >= now() - interval '48 hours' THEN '24-48H'
      WHEN created_at >= now() - interval '7 days' THEN '48H-7D'
      ELSE '>7D'
    END AS age_bucket,
    COUNT(*) AS sample_count,
    ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 2) AS sample_pct
  FROM atlas_search_outbox TABLESAMPLE SYSTEM (0.5)
  GROUP BY 1
  ORDER BY 1;
`);
console.log('Outbox Age Distribution (Representative System Sample):');
console.table(outboxSample.rows);

// 2. Candidates age sampling (1% of 1.8M rows = ~18,000 rows sampled across all disk pages)
const candSample = await client.query(`
  SELECT 
    CASE 
      WHEN created_at >= now() - interval '24 hours' THEN '<24H'
      WHEN created_at >= now() - interval '48 hours' THEN '24-48H'
      WHEN created_at >= now() - interval '7 days' THEN '48H-7D'
      WHEN created_at >= now() - interval '30 days' THEN '7D-30D'
      ELSE '>30D'
    END AS age_bucket,
    COUNT(*) AS sample_count,
    ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 2) AS sample_pct
  FROM atlas_people_discovery_candidates TABLESAMPLE SYSTEM (1.0)
  GROUP BY 1
  ORDER BY 1;
`);
console.log('Candidates Age Distribution (Representative System Sample):');
console.table(candSample.rows);

// 3. Candidates disposition / status distribution
const candDisposition = await client.query(`
  SELECT 
    CASE 
      WHEN atlas_person_id IS NOT NULL THEN 'COMMITTED_IDENTITY'
      ELSE 'UNRESOLVED'
    END AS disposition,
    current_activity_state,
    COUNT(*) AS sample_count,
    ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 2) AS sample_pct
  FROM atlas_people_discovery_candidates TABLESAMPLE SYSTEM (1.0)
  GROUP BY 1, 2
  ORDER BY 1, 2;
`);
console.log('Candidates Disposition / State Distribution:');
console.table(candDisposition.rows);

await client.end();
