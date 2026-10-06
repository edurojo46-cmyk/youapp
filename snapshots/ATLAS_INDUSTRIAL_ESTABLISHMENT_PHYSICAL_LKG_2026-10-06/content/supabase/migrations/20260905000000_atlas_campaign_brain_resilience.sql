-- ==========================================
-- ATLAS OUTREACH - CAMPAIGN BRAIN RESILIENCE
-- ==========================================

-- Añadir columnas para manejo de reintentos
ALTER TABLE public.atlas_message_queue 
ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN retry_count INT NOT NULL DEFAULT 0,
ADD COLUMN max_retries INT NOT NULL DEFAULT 5,
ADD COLUMN last_error_code TEXT,
ADD COLUMN last_error_at TIMESTAMPTZ;

-- Índice parcial para optimizar fetch de jobs pendientes o en reintento programado
CREATE INDEX idx_atlas_message_queue_available_retry 
ON public.atlas_message_queue (available_at, created_at) 
WHERE status IN ('PENDING', 'RETRY');
