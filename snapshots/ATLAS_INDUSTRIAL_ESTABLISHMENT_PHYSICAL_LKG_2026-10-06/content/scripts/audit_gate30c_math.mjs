import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Client } = pg;

async function auditGate30CMath() {
  const dbConfig = parseDbUrl();
  const client = new Client(dbConfig);
  await client.connect();

  console.log('--- 1. AUDITING UNIVERSE A SOURCES IN DB ---');
  const resSources = await client.query(`
    SELECT source_id, COUNT(*) as row_count, COUNT(DISTINCT atlas_person_id) as distinct_people
    FROM public.atlas_person_identity_map
    GROUP BY source_id
    ORDER BY row_count DESC;
  `);
  console.table(resSources.rows);

  const totalDistinctRes = await client.query(`
    SELECT COUNT(DISTINCT atlas_person_id) as total_distinct
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL;
  `);
  const totalCanonicalDistinct = parseInt(totalDistinctRes.rows[0].total_distinct, 10);
  console.log(`Total Canonical Distinct People (SSOT): ${totalCanonicalDistinct}`);

  await client.end();
}

auditGate30CMath().catch(console.error);
