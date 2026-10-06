-- =========================================================================================
-- V5 FASE B - GIN REDUCTION (Safe)
-- =========================================================================================
-- Elimina el índice GIN de 'display_name' que la auditoría de código demostró ser redundante
-- (la API usa search_text_normalized para búsquedas por nombre).
-- =========================================================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_discovery_candidates_display_name_trgm;

-- Opcional: También eliminamos el índice parcial redundante del outbox que retrasa los ACKs
DROP INDEX CONCURRENTLY IF EXISTS public.idx_search_outbox_status_retry;
