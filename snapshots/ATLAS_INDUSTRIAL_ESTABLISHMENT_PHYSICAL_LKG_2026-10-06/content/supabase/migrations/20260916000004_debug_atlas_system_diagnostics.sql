-- 20260916000004_debug_atlas_system_diagnostics.sql
-- Diagnostics function to inspect table locks, invalid indexes, triggers, and blocking queries.
-- Read-only, SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.debug_atlas_system_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_indexes jsonb;
    v_triggers jsonb;
    v_locks jsonb;
    v_active_queries jsonb;
BEGIN
    -- 1. Indexes and validity
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'index_name', i.relname,
        'is_valid', idx.indisvalid,
        'is_ready', idx.indisready
    )), '[]'::jsonb) INTO v_indexes
    FROM pg_index idx
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_class c ON c.oid = idx.indrelid
    WHERE c.relname = 'atlas_people_discovery_candidates';

    -- 2. User Triggers (excluding internal system constraints)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'trigger_name', tgname,
        'enabled', tgenabled,
        'function_name', proname
    )), '[]'::jsonb) INTO v_triggers
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'atlas_people_discovery_candidates'
      AND NOT t.tgisinternal;

    -- 3. Locks on the table
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'locktype', locktype,
        'relation', relation::regclass::text,
        'mode', mode,
        'granted', granted,
        'pid', pid
    )), '[]'::jsonb) INTO v_locks
    FROM pg_locks
    WHERE relation = 'public.atlas_people_discovery_candidates'::regclass;

    -- 4. Active non-idle backend queries
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'pid', pid,
        'state', state,
        'duration', now() - query_start,
        'wait_event', wait_event,
        'wait_event_type', wait_event_type,
        'query', left(query, 200)
    )), '[]'::jsonb) INTO v_active_queries
    FROM pg_stat_activity
    WHERE pid != pg_backend_pid()
      AND state != 'idle';

    RETURN jsonb_build_object(
        'indexes', v_indexes,
        'triggers', v_triggers,
        'locks', v_locks,
        'active_queries', v_active_queries
    );
END;
$$;
