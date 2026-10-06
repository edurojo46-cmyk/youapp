import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function run() {
  console.log('=== INSPECTING COMMIT RPC AND QUERY PLANS ===');

  // 1. Inspect legacy function source
  const legacyRes = await pool.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'commit_canonical_with_search_outbox';
  `);
  console.log('Legacy RPC found:', legacyRes.rows.length);
  if (legacyRes.rows.length > 0) {
    console.log('--- LEGACY PROSRC SAMPLE ---');
    console.log(legacyRes.rows[0].prosrc.substring(0, 2000));
  }

  // 2. EXPLAIN plans for V4 statements
  // Statement A: The NOT EXISTS lookup in V4
  // new_candidates AS (
  //   SELECT DISTINCT i.atlas_person_id
  //   FROM incoming_identity i
  //   WHERE NOT EXISTS (
  //     SELECT 1 FROM public.atlas_person_identity_map existing
  //     WHERE existing.atlas_person_id = i.atlas_person_id
  //   )
  // )

  // Let's sample 100 actual atlas_person_ids from recent activity
  const sampleIdsRes = await pool.query(`
    SELECT atlas_person_id FROM atlas_person_identity_map ORDER BY id DESC LIMIT 100;
  `);
  const sampleIds = sampleIdsRes.rows.map(r => r.atlas_person_id);

  console.log(`\n--- EXPLAIN (BUFFERS, COSTS) FOR V4 NOT EXISTS LOOKUP (100 IDs) ---`);
  const explainA = await pool.query(`
    EXPLAIN (BUFFERS, COSTS)
    WITH incoming_ids AS (
      SELECT unnest($1::text[]) AS atlas_person_id
    )
    SELECT DISTINCT i.atlas_person_id
    FROM incoming_ids i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atlas_person_identity_map existing
      WHERE existing.atlas_person_id = i.atlas_person_id
    );
  `, [sampleIds]);
  console.log(explainA.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Also EXPLAIN ANALYZE safe bounded on the 100 sample IDs:
  console.log(`\n--- EXPLAIN (ANALYZE, BUFFERS) FOR V4 NOT EXISTS LOOKUP (100 IDs) ---`);
  const explainAnalyzeA = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    WITH incoming_ids AS (
      SELECT unnest($1::text[]) AS atlas_person_id
    )
    SELECT DISTINCT i.atlas_person_id
    FROM incoming_ids i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atlas_person_identity_map existing
      WHERE existing.atlas_person_id = i.atlas_person_id
    );
  `, [sampleIds]);
  console.log(explainAnalyzeA.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Statement B: The ON CONFLICT upsert in V4
  console.log(`\n--- EXPLAIN (BUFFERS, COSTS) FOR V4 IDENTITY MAP UPSERT (100 Rows) ---`);
  // Prepare 100 dummy rows matching sample
  const sampleRows = sampleIdsRes.rows.map((r, i) => ({
    atlas_person_id: r.atlas_person_id,
    source_id: 'test_source',
    source_person_id: `test_id_${i}`,
    identifier_type: 'NATIONAL_ID',
    identifier_value: `val_${i}`,
    evidence_id: 'ev_1',
    confidence: 1.0,
    resolution_method: 'EXACT',
    observed_at: new Date().toISOString()
  }));

  const explainB = await pool.query(`
    EXPLAIN (BUFFERS, COSTS)
    WITH incoming_identity AS (
      SELECT DISTINCT ON (source_id, source_person_id)
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method,
        COALESCE(observed_at, now()) AS observed_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        atlas_person_id text, source_id text, source_person_id text, identifier_type text,
        identifier_value text, evidence_id text, confidence float, resolution_method text,
        observed_at timestamptz
      )
      ORDER BY source_id, source_person_id, observed_at DESC
    )
    INSERT INTO public.atlas_person_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT 
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    FROM incoming_identity
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET
      identifier_value  = EXCLUDED.identifier_value,
      confidence        = EXCLUDED.confidence,
      resolution_method = EXCLUDED.resolution_method,
      observed_at       = EXCLUDED.observed_at
    RETURNING (xmax = 0) AS is_inserted;
  `, [JSON.stringify(sampleRows)]);
  console.log(explainB.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Statement C: What queries touch atlas_people_discovery_candidates?
  // Let's check process_search_outbox_batch upsert query plan!
  console.log(`\n--- EXPLAIN (BUFFERS, COSTS) FOR DISCOVERY CANDIDATES UPSERT ---`);
  const explainC = await pool.query(`
    EXPLAIN (BUFFERS, COSTS)
    INSERT INTO public.atlas_people_discovery_candidates (
      discovery_id, display_name, profession, role, organization,
      search_text_normalized, location_relation_type, neighborhood,
      geography_id, current_activity_state, last_seen_at, source_last_checked_at,
      source_id, source_record_id, person_source_url, location_source_url,
      location_evidence, evidence_strength, first_seen_at, social_profiles, atlas_person_id,
      target_region, geo_association_type, geo_confidence, geo_source, geo_evidence
    )
    VALUES (
      'disc_1', 'Juan Perez', 'Abogado', 'Director', 'Empresa',
      'juan perez abogado director empresa', 'PRIMARY_OFFICE', 'Caballito',
      'caba', 'ACTIVE', now(), now(),
      'test_src', 'rec_1', 'url', 'url',
      'ev', 'STRONG', now(), '[]'::jsonb, 'person_1',
      'CABA', 'PUBLIC_ROLE', 1.0, 'src', 'ev'
    )
    ON CONFLICT (source_id, source_record_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      search_text_normalized = EXCLUDED.search_text_normalized,
      current_activity_state = EXCLUDED.current_activity_state,
      last_seen_at = EXCLUDED.last_seen_at
    WHERE public.atlas_people_discovery_candidates.source_last_checked_at <= EXCLUDED.source_last_checked_at;
  `);
  console.log(explainC.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Also check canonical denominator query plan:
  console.log(`\n--- EXPLAIN (BUFFERS, COSTS) FOR CANONICAL DENOMINATOR QUERY ---`);
  const explainD = await pool.query(`
    EXPLAIN (BUFFERS, COSTS)
    SELECT 
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region IN ('CABA', 'PBA')) AS canonical_total,
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region = 'CABA') AS canonical_caba,
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region = 'PBA') AS canonical_pba
    FROM atlas_people_discovery_candidates c 
    JOIN atlas_person_identity_map m ON c.atlas_person_id = m.atlas_person_id 
    WHERE c.target_region IN ('CABA', 'PBA') 
      AND c.current_activity_state = 'ACTIVE' 
      AND c.geo_confidence >= 0.80;
  `);
  console.log(explainD.rows.map(r => r['QUERY PLAN']).join('\n'));

  await pool.end();
}

run().catch(console.error);
