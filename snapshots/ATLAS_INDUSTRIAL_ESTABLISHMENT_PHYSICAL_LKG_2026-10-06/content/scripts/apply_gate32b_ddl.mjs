import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

export async function applyGate32bDdl(client) {
  console.log('Applying Gate 32B DDL schemas...');

  // 1. Snapshot Registry Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_source_snapshots (
      snapshot_id text PRIMARY KEY,
      source_surface_id text NOT NULL,
      source_content_sha256 text NOT NULL,
      etag text,
      last_modified text,
      content_length bigint,
      schema_version text,
      record_count bigint,
      snapshot_timestamp timestamptz NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_processed_at timestamptz,
      status text NOT NULL DEFAULT 'DISCOVERED',
      claim_worker_id text,
      claim_leased_at timestamptz,
      claim_lease_expires_at timestamptz,
      metadata jsonb DEFAULT '{}'::jsonb,
      CONSTRAINT uq_atlas_source_snapshots UNIQUE (source_surface_id, source_content_sha256)
    );
  `);

  // 2. Snapshot Lineage Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_snapshot_lineage (
      lineage_id text PRIMARY KEY,
      source_surface_id text NOT NULL,
      previous_snapshot_id text,
      current_snapshot_id text NOT NULL,
      delta_hash text NOT NULL,
      added_count bigint NOT NULL DEFAULT 0,
      changed_count bigint NOT NULL DEFAULT 0,
      removed_count bigint NOT NULL DEFAULT 0,
      unchanged_count bigint NOT NULL DEFAULT 0,
      computed_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb DEFAULT '{}'::jsonb
    );
  `);

  // 3. Checkpoints Table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_checkpoints (
      checkpoint_id text PRIMARY KEY,
      job_type text NOT NULL,
      owner_worker_id text,
      lease_expires_at timestamptz,
      state jsonb NOT NULL DEFAULT '{}'::jsonb,
      saved_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1
    );
  `);

  // 4. Stale Lease Reclaim Function
  await client.query(`
    CREATE OR REPLACE FUNCTION public.reclaim_stale_search_outbox_leases(p_lease_seconds integer DEFAULT 120)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    DECLARE
      v_reclaimed_count integer := 0;
      v_cutoff timestamptz := now() - (p_lease_seconds || ' seconds')::interval;
    BEGIN
      WITH stale AS (
        SELECT outbox_id
        FROM public.atlas_search_outbox
        WHERE status = 'PROCESSING'
          AND (processing_started_at IS NULL OR processing_started_at < v_cutoff)
        FOR UPDATE SKIP LOCKED
      ),
      reclaimed AS (
        UPDATE public.atlas_search_outbox o
        SET status = 'PENDING',
            processing_started_at = NULL,
            processing_worker_id = NULL,
            last_error = COALESCE(o.last_error || ' | ', '') || 'LEASE_EXPIRED_RECLAIMED'
        FROM stale s
        WHERE o.outbox_id = s.outbox_id
        RETURNING o.outbox_id
      )
      SELECT count(*) INTO v_reclaimed_count FROM reclaimed;

      RETURN jsonb_build_object(
        'ok', true,
        'reclaimed_count', v_reclaimed_count,
        'cutoff', v_cutoff
      );
    END;
    $$;
  `);

  // 5. Atomic Snapshot Claim Function
  await client.query(`
    CREATE OR REPLACE FUNCTION public.register_or_claim_snapshot(
      p_snapshot_id text,
      p_source_surface_id text,
      p_source_content_sha256 text,
      p_etag text,
      p_last_modified text,
      p_content_length bigint,
      p_schema_version text,
      p_record_count bigint,
      p_snapshot_timestamp timestamptz,
      p_worker_id text,
      p_lease_seconds integer DEFAULT 60,
      p_metadata jsonb DEFAULT '{}'::jsonb
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    DECLARE
      v_rec public.atlas_source_snapshots%ROWTYPE;
      v_now timestamptz := now();
    BEGIN
      -- Insert if not exists
      INSERT INTO public.atlas_source_snapshots (
        snapshot_id, source_surface_id, source_content_sha256,
        etag, last_modified, content_length, schema_version,
        record_count, snapshot_timestamp, first_seen_at,
        status, metadata
      ) VALUES (
        p_snapshot_id, p_source_surface_id, p_source_content_sha256,
        p_etag, p_last_modified, p_content_length, p_schema_version,
        p_record_count, p_snapshot_timestamp, v_now,
        'DISCOVERED', p_metadata
      )
      ON CONFLICT (source_surface_id, source_content_sha256) DO NOTHING;

      -- Lock row for evaluation/claim
      SELECT * INTO v_rec
      FROM public.atlas_source_snapshots
      WHERE source_surface_id = p_source_surface_id
        AND source_content_sha256 = p_source_content_sha256
      FOR UPDATE;

      IF v_rec.status = 'PROCESSED' THEN
        RETURN jsonb_build_object(
          'ok', true,
          'status', 'ALREADY_PROCESSED',
          'snapshot_id', v_rec.snapshot_id,
          'claimed', false,
          'worker_id', v_rec.claim_worker_id
        );
      END IF;

      -- If DISCOVERED, FAILED, or lease expired -> CLAIM it
      IF v_rec.status IN ('DISCOVERED', 'FAILED') OR
         (v_rec.status IN ('CLAIMED', 'PROCESSING') AND (v_rec.claim_lease_expires_at IS NULL OR v_rec.claim_lease_expires_at <= v_now)) THEN
        
        UPDATE public.atlas_source_snapshots
        SET status = 'PROCESSING',
            claim_worker_id = p_worker_id,
            claim_leased_at = v_now,
            claim_lease_expires_at = v_now + (p_lease_seconds || ' seconds')::interval
        WHERE snapshot_id = v_rec.snapshot_id;

        RETURN jsonb_build_object(
          'ok', true,
          'status', 'CLAIMED',
          'snapshot_id', v_rec.snapshot_id,
          'claimed', true,
          'worker_id', p_worker_id,
          'lease_expires_at', v_now + (p_lease_seconds || ' seconds')::interval
        );
      ELSE
        -- Currently claimed by another active worker
        RETURN jsonb_build_object(
          'ok', true,
          'status', 'LOCKED_BY_OTHER_WORKER',
          'snapshot_id', v_rec.snapshot_id,
          'claimed', false,
          'active_worker_id', v_rec.claim_worker_id,
          'lease_expires_at', v_rec.claim_lease_expires_at
        );
      END IF;
    END;
    $$;
  `);

  // 6. DB-backed Checkpoint Save/Load Functions
  await client.query(`
    CREATE OR REPLACE FUNCTION public.save_checkpoint_durable(
      p_checkpoint_id text,
      p_job_type text,
      p_worker_id text,
      p_state jsonb,
      p_lease_seconds integer DEFAULT 300
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    DECLARE
      v_now timestamptz := now();
      v_expires timestamptz := v_now + (p_lease_seconds || ' seconds')::interval;
    BEGIN
      INSERT INTO public.atlas_checkpoints (
        checkpoint_id, job_type, owner_worker_id, lease_expires_at, state, saved_at, version
      ) VALUES (
        p_checkpoint_id, p_job_type, p_worker_id, v_expires, p_state, v_now, 1
      )
      ON CONFLICT (checkpoint_id) DO UPDATE SET
        owner_worker_id = EXCLUDED.owner_worker_id,
        lease_expires_at = EXCLUDED.lease_expires_at,
        state = EXCLUDED.state,
        saved_at = EXCLUDED.saved_at,
        version = public.atlas_checkpoints.version + 1;

      RETURN jsonb_build_object(
        'ok', true,
        'checkpoint_id', p_checkpoint_id,
        'saved_at', v_now,
        'lease_expires_at', v_expires
      );
    END;
    $$;
  `);

  console.log('✔ All Gate 32B DDL schemas applied successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('apply_gate32b_ddl.mjs')) {
  const client = new Client(dbConfig);
  client.connect().then(async () => {
    try {
      await applyGate32bDdl(client);
    } finally {
      await client.end();
    }
  }).catch(console.error);
}
