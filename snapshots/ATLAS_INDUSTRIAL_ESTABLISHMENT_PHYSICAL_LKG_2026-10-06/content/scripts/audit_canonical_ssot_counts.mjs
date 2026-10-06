import 'dotenv/config';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Client } = pg;

async function auditCanonicalSSOT() {
  const config = parseDbUrl();
  const client = new Client(config);
  await client.connect();

  const auditTimestamp = new Date().toISOString();
  console.log(`[${auditTimestamp}] Running SSOT canonical reconciliation audit...`);

  // 1. Exact count distinct atlas_person_id WHERE atlas_person_id IS NOT NULL
  const t0 = Date.now();
  const resDistinct = await client.query(`
    SELECT COUNT(DISTINCT atlas_person_id) AS distinct_people
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL;
  `);
  const dtDistinct = Date.now() - t0;
  const distinctPeople = parseInt(resDistinct.rows[0].distinct_people, 10);

  // 2. Total rows in atlas_person_identity_map
  const t1 = Date.now();
  const resTotal = await client.query(`
    SELECT COUNT(*) AS total_rows
    FROM public.atlas_person_identity_map;
  `);
  const dtTotal = Date.now() - t1;
  const totalRows = parseInt(resTotal.rows[0].total_rows, 10);

  // 3. Null check
  const resNull = await client.query(`
    SELECT COUNT(*) AS null_rows
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NULL;
  `);
  const nullRows = parseInt(resNull.rows[0].null_rows, 10);

  // 4. Source breakdown
  const resSources = await client.query(`
    SELECT source_id, COUNT(*) AS row_count, COUNT(DISTINCT atlas_person_id) AS distinct_people
    FROM public.atlas_person_identity_map
    GROUP BY source_id
    ORDER BY row_count DESC
    LIMIT 30;
  `);

  // 5. Related canonical tables
  const resTables = await client.query(`
    SELECT 
      (SELECT COUNT(*) FROM public.atlas_people) AS atlas_people_count,
      (SELECT COUNT(*) FROM public.atlas_canonical_entities) AS atlas_canonical_entities_count,
      (SELECT COUNT(*) FROM public.atlas_person_observations) AS atlas_person_observations_count,
      (SELECT COUNT(*) FROM public.atlas_people_discovery_candidates) AS atlas_people_discovery_candidates_count
  `);

  await client.end();

  const auditReport = {
    AUDIT_SECTION: "1. RECONCILIAR CANONICAL SSOT TRUTH",
    audit_timestamp: auditTimestamp,
    CURRENT_CANONICAL_DISTINCT_PEOPLE_DB: distinctPeople,
    CURRENT_IDENTITY_MAP_ROWS_DB: totalRows,
    NULL_ATLAS_PERSON_ID_ROWS: nullRows,
    DISTINCT_QUERY_LATENCY_MS: dtDistinct,
    TOTAL_ROWS_QUERY_LATENCY_MS: dtTotal,
    CORROBORATING_CANONICAL_TABLES: {
      atlas_people: parseInt(resTables.rows[0].atlas_people_count, 10),
      atlas_canonical_entities: parseInt(resTables.rows[0].atlas_canonical_entities_count, 10),
      atlas_person_observations: parseInt(resTables.rows[0].atlas_person_observations_count, 10),
      atlas_people_discovery_candidates: parseInt(resTables.rows[0].atlas_people_discovery_candidates_count, 10)
    },
    TOP_SOURCES_IN_IDENTITY_MAP: resSources.rows.map(r => ({
      source_id: r.source_id,
      row_count: parseInt(r.row_count, 10),
      distinct_people: parseInt(r.distinct_people, 10)
    }))
  };

  console.log(JSON.stringify(auditReport, null, 2));
  return auditReport;
}

auditCanonicalSSOT().catch(console.error);
