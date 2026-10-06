-- ═══════════════════════════════════════════════════════════════════════════
-- APLICAR EN SUPABASE DASHBOARD > SQL EDITOR
-- ÍNDICE PARCIAL PARA DRENAJE RÁPIDO DEL OUTBOX
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_search_outbox_ready_queue
ON public.atlas_search_outbox (next_retry_at ASC, outbox_id ASC)
WHERE status IN ('PENDING', 'RETRY');

ANALYZE public.atlas_search_outbox;
