import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    const testBatch = [
      {
        cuit: '20123456789',
        raw_name: 'PERSON ABSENT',
        normalized_name: 'PERSON ABSENT',
        cuit_masked: '20***89',
        identifier_value: 'absent_hmac_123',
        candidate_atlas_person_id: 'atlas_arg_per_absent123',
        source_id: 'ARCA_CONDICION_TRIBUTARIA',
        source_person_id: '20123456789',
        is_definitely_absent: true
      }
    ];

    const testSql = `
      CREATE OR REPLACE FUNCTION public.test_field_assisted_probe(p_batch jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_res jsonb;
      BEGIN
        WITH incoming_batch AS MATERIALIZED (
          SELECT 
            (elem->>'cuit')::text                     AS cuit,
            (elem->>'raw_name')::text                 AS raw_name,
            (elem->>'normalized_name')::text          AS normalized_name,
            (elem->>'cuit_masked')::text              AS cuit_masked,
            (elem->>'identifier_value')::text         AS identifier_value,
            (elem->>'candidate_atlas_person_id')::text AS candidate_atlas_person_id,
            COALESCE((elem->>'source_id')::text, 'ARCA_CONDICION_TRIBUTARIA') AS source_id,
            COALESCE((elem->>'source_person_id')::text, (elem->>'cuit')::text) AS source_person_id,
            COALESCE((elem->>'is_definitely_absent')::boolean, false) AS is_definitely_absent
          FROM jsonb_array_elements(p_batch) AS elem
        ),
        candidates_needing_lookup AS (
          SELECT * FROM incoming_batch WHERE is_definitely_absent = FALSE
        ),
        distinct_sources AS (
          SELECT DISTINCT source_id, source_person_id FROM candidates_needing_lookup
        ),
        distinct_hmacs AS (
          SELECT DISTINCT identifier_value FROM candidates_needing_lookup
        ),
        matched_sources AS (
          SELECT m.source_id, m.source_person_id, m.atlas_person_id
          FROM distinct_sources ds
          JOIN public.atlas_person_identity_map m
            ON m.source_id = ds.source_id AND m.source_person_id = ds.source_person_id
        ),
        matched_hmacs AS (
          SELECT DISTINCT ON (m.identifier_value)
            m.identifier_value, m.atlas_person_id, m.observed_at
          FROM distinct_hmacs dh
          JOIN public.atlas_person_identity_map m
            ON m.identifier_type = 'NATIONAL_IDENTITY_HMAC' AND m.identifier_value = dh.identifier_value
          ORDER BY m.identifier_value, m.observed_at ASC
        ),
        resolved_candidates AS MATERIALIZED (
          SELECT 
            b.*,
            CASE 
              WHEN b.is_definitely_absent THEN FALSE
              WHEN ms.atlas_person_id IS NOT NULL AND ms.atlas_person_id != b.candidate_atlas_person_id THEN TRUE 
              ELSE FALSE 
            END AS is_conflict,
            CASE
              WHEN b.is_definitely_absent THEN b.candidate_atlas_person_id
              ELSE COALESCE(ms.atlas_person_id, mh.atlas_person_id, b.candidate_atlas_person_id)
            END AS resolved_atlas_person_id,
            CASE 
              WHEN b.is_definitely_absent THEN 'NEW'
              WHEN ms.atlas_person_id IS NULL AND mh.atlas_person_id IS NULL THEN 'NEW' 
              ELSE 'MERGE' 
            END AS resolution_type
          FROM incoming_batch b
          LEFT JOIN matched_sources ms ON ms.source_id = b.source_id AND ms.source_person_id = b.source_person_id
          LEFT JOIN matched_hmacs mh ON mh.identifier_value = b.identifier_value
        )
        SELECT jsonb_build_object(
          'ok', true,
          'total', (SELECT count(*) FROM incoming_batch),
          'new', (SELECT count(*) FROM resolved_candidates WHERE resolution_type = 'NEW'),
          'merge', (SELECT count(*) FROM resolved_candidates WHERE resolution_type = 'MERGE'),
          'bypassed_lookups', (SELECT count(*) FROM incoming_batch WHERE is_definitely_absent = TRUE)
        ) INTO v_res;

        RETURN v_res;
      END;
      $$;
    `;

    await client.query(testSql);
    const res = await client.query('SELECT public.test_field_assisted_probe($1::jsonb) as r', [JSON.stringify(testBatch)]);
    console.log('Test probe result:', res.rows[0].r);

    await client.query('DROP FUNCTION public.test_field_assisted_probe(jsonb);');
    console.log('✔ Dropped test probe function cleanly.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
