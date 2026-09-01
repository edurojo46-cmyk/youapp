-- FASE 1: Scout Fix
-- Añadir columna de método de resolución a seed_sources

ALTER TABLE public.seed_sources 
ADD COLUMN IF NOT EXISTS resolution_method VARCHAR(50);
