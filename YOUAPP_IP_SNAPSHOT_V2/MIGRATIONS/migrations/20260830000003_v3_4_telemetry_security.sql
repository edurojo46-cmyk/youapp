-- Create RPC to securely log search attribution array
CREATE OR REPLACE FUNCTION log_search_attributions(p_attributions JSONB) RETURNS void AS $$
BEGIN
  INSERT INTO search_result_attribution (
    id,
    request_id,
    content_id,
    provider,
    retrieval_source,
    position,
    shown_at
  )
  SELECT 
    (elem->>'id')::UUID,
    (elem->>'request_id')::UUID,
    elem->>'content_id',
    elem->>'provider',
    elem->>'retrieval_source',
    (elem->>'position')::INTEGER,
    (elem->>'shown_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_attributions) AS elem
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke direct anon insert to prevent arbitrary writes
DROP POLICY IF EXISTS "Allow anon insert search_result_attribution" ON search_result_attribution;
