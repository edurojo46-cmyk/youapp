-- 20260916000005_inspect_index_def.sql
CREATE OR REPLACE FUNCTION public.debug_get_index_defs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res jsonb;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'indexname', indexname,
        'indexdef', indexdef
    )) INTO v_res
    FROM pg_indexes
    WHERE tablename = 'atlas_people_discovery_candidates';
    
    RETURN v_res;
END;
$$;
