/**
 * scripts/enforce_ssot_monotonicity.mjs
 * 
 * Enforces:
 * 1. Database-level trigger on atlas_people_live_metrics:
 *    Strict Monotonicity: qualified_unique_real_people can NEVER decrease without
 *    explicit session flag: AUDITED_RETRACTION = TRUE.
 * 2. Atomic transactional increment of qualified_unique_real_people inside
 *    commit_canonical_with_search_outbox RPC.
 * 3. Removes any default values that could restore legacy baselines.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

export async function applySsotMonotonicity() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  console.log('=== APPLYING DATABASE SSOT MONOTONICITY & TRANSACTIONAL INCREMENTS ===');

  try {
    await client.query('BEGIN;');

    // 1. Trigger function to prevent any retraction without AUDITED_RETRACTION = TRUE
    console.log('[1/4] Installing enforce_monotonic_qualified_people trigger function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.enforce_monotonic_qualified_people()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Strict Monotonicity: qualified_unique_real_people can NEVER decrease during normal operation
        IF NEW.qualified_unique_real_people < OLD.qualified_unique_real_people THEN
          IF current_setting('atlas.audited_retraction', true) = 'TRUE' THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'VIOLATION OF CONTRACT: qualified_unique_real_people cannot decrease (% -> %) without AUDITED_RETRACTION = TRUE', 
            OLD.qualified_unique_real_people, NEW.qualified_unique_real_people;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_enforce_monotonic_qualified_people ON public.atlas_people_live_metrics;
      CREATE TRIGGER trg_enforce_monotonic_qualified_people
      BEFORE UPDATE ON public.atlas_people_live_metrics
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_monotonic_qualified_people();
    `);
    console.log('  ✅ Trigger trg_enforce_monotonic_qualified_people created.');

    // 2. Drop legacy defaults on atlas_people_live_metrics
    console.log('[2/4] Dropping legacy column defaults...');
    await client.query(`
      ALTER TABLE public.atlas_people_live_metrics 
        ALTER COLUMN qualified_unique_real_people DROP DEFAULT;
    `);
    console.log('  ✅ Legacy column defaults dropped.');

    // 3. Upgrading commit_canonical_with_search_outbox RPC with atomic transactional increment
    console.log('[3/4] Upgrading commit_canonical_with_search_outbox RPC with atomic SSOT increment...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox(
        p_identity_rows jsonb,
        p_outbox_rows   jsonb
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $$
      DECLARE
        v_identity_total    integer := 0;
        v_identity_inserted integer := 0;
        v_identity_updated  integer := 0;
        v_outbox_total      integer := 0;
        v_outbox_inserted   integer := 0;
        v_outbox_updated    integer := 0;
        v_new_unique_people integer := 0;
      BEGIN
        -- 1. SET-BASED UPSERT FOR IDENTITY MAP
        WITH incoming_identity AS (
          SELECT DISTINCT ON (source_id, source_person_id)
            atlas_person_id, source_id, source_person_id, identifier_type,
            identifier_value, evidence_id, confidence, resolution_method,
            COALESCE(observed_at, now()) AS observed_at
          FROM jsonb_to_recordset(p_identity_rows) AS x(
            atlas_person_id text, source_id text, source_person_id text, identifier_type text,
            identifier_value text, evidence_id text, confidence float, resolution_method text,
            observed_at timestamptz
          )
          ORDER BY source_id, source_person_id, observed_at DESC
        ),
        new_people AS (
          SELECT DISTINCT i.atlas_person_id
          FROM incoming_identity i
          WHERE NOT EXISTS (
            SELECT 1 FROM public.atlas_person_identity_map existing
            WHERE existing.atlas_person_id = i.atlas_person_id
          )
        ),
        upsert_identity AS (
          INSERT INTO public.atlas_person_identity_map (
            atlas_person_id, source_id, source_person_id, identifier_type,
            identifier_value, evidence_id, confidence, resolution_method, observed_at
          )
          SELECT * FROM incoming_identity
          ON CONFLICT (source_id, source_person_id) DO UPDATE SET
            identifier_value  = EXCLUDED.identifier_value,
            confidence        = EXCLUDED.confidence,
            resolution_method = EXCLUDED.resolution_method,
            observed_at       = EXCLUDED.observed_at
          RETURNING (xmax = 0) AS is_inserted
        )
        SELECT 
          count(*),
          count(*) FILTER (WHERE is_inserted),
          count(*) FILTER (WHERE NOT is_inserted),
          (SELECT count(*) FROM new_people)
        INTO v_identity_total, v_identity_inserted, v_identity_updated, v_new_unique_people
        FROM upsert_identity;

        -- 2. SET-BASED UPSERT FOR OUTBOX
        WITH incoming_outbox AS (
          SELECT DISTINCT ON (source_id, source_record_id)
            atlas_person_id, source_id, source_record_id, payload,
            COALESCE(payload_version, 1) AS payload_version,
            'PENDING' AS status, 0 AS attempt_count, now() AS next_retry_at
          FROM jsonb_to_recordset(p_outbox_rows) AS x(
            atlas_person_id text, source_id text, source_record_id text,
            payload jsonb, payload_version integer
          )
          ORDER BY source_id, source_record_id, payload_version DESC
        ),
        upsert_outbox AS (
          INSERT INTO public.atlas_search_outbox (
            atlas_person_id, source_id, source_record_id, payload, payload_version,
            status, attempt_count, next_retry_at
          )
          SELECT * FROM incoming_outbox
          ON CONFLICT (source_id, source_record_id) DO UPDATE SET
            payload         = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN EXCLUDED.payload ELSE public.atlas_search_outbox.payload END,
            payload_version = GREATEST(EXCLUDED.payload_version, public.atlas_search_outbox.payload_version),
            
            -- RESET EVERYTHING ON NEW VERSION
            status          = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN 'PENDING' ELSE public.atlas_search_outbox.status END,
            attempt_count   = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN 0 ELSE public.atlas_search_outbox.attempt_count END,
            next_retry_at   = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN now() ELSE public.atlas_search_outbox.next_retry_at END,
            last_error      = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN NULL ELSE public.atlas_search_outbox.last_error END,
            processing_worker_id = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN NULL ELSE public.atlas_search_outbox.processing_worker_id END,
            processing_started_at = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN NULL ELSE public.atlas_search_outbox.processing_started_at END,
            published_at    = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN NULL ELSE public.atlas_search_outbox.published_at END,
            quarantined_at  = CASE
                                WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                                THEN NULL ELSE public.atlas_search_outbox.quarantined_at END
          RETURNING (xmax = 0) AS is_inserted
        )
        SELECT 
          count(*),
          count(*) FILTER (WHERE is_inserted),
          count(*) FILTER (WHERE NOT is_inserted)
        INTO v_outbox_total, v_outbox_inserted, v_outbox_updated
        FROM upsert_outbox;

        -- 2.5 ATOMICALLY UPDATE LIVE METRICS SSOT DIRECTLY FROM TRANSACTION
        IF v_new_unique_people > 0 THEN
          UPDATE public.atlas_people_live_metrics
          SET qualified_unique_real_people = qualified_unique_real_people + v_new_unique_people,
              unique_people = unique_people + v_new_unique_people,
              verified_entities = verified_entities + v_new_unique_people,
              people_added_today = people_added_today + v_new_unique_people,
              last_verified_change_at = now(),
              updated_at = now()
          WHERE id = 'current';
        END IF;

        -- 3. RETURN METRICS
        RETURN jsonb_build_object(
          'ok', true,
          'identity_rows_processed', v_identity_total,
          'identity_rows_inserted', v_identity_inserted,
          'identity_rows_updated', v_identity_updated,
          'outbox_rows_created', v_outbox_inserted,
          'outbox_rows_requeued', v_outbox_updated,
          'NEW_UNIQUE_PEOPLE_INSERTED', v_new_unique_people
        );
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
      END;
      $$;
    `);

    await client.query(`
      GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) TO service_role;
      GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) TO postgres;
    `);
    console.log('  ✅ commit_canonical_with_search_outbox upgraded with atomic live_metrics update.');

    await client.query('COMMIT;');
    console.log('[4/4] Transaction committed successfully.');

  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Error applying monotonicity migration:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.includes('enforce_ssot_monotonicity')) {
  applySsotMonotonicity()
    .then(() => console.log('✅ SSOT Monotonicity Migration Complete.'))
    .catch(err => { console.error(err); process.exit(1); });
}
