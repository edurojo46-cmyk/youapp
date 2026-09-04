-- 20260903233000_alter_semantic_annotations.sql

-- 1. Actualizar el esquema de asset_semantic_annotations según especificación V1.4 Phase 2

-- Asegurarnos que la tabla existe primero (por las dudas)
CREATE TABLE IF NOT EXISTS asset_semantic_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES youapp_index(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Renombrar columna status a annotation_status si existe
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_semantic_annotations' AND column_name = 'status') THEN
    ALTER TABLE asset_semantic_annotations RENAME COLUMN status TO annotation_status;
  END IF;
END $$;

-- Agregar columnas faltantes o actualizar tipos
ALTER TABLE asset_semantic_annotations
  ADD COLUMN IF NOT EXISTS content_type_confidence NUMERIC(3,2),
  ALTER COLUMN content_role SET NOT NULL,
  ALTER COLUMN content_role SET DEFAULT 'PRIMARY',
  ALTER COLUMN evidence TYPE JSONB USING (COALESCE(evidence, '{}'::jsonb)),
  ALTER COLUMN evidence SET NOT NULL,
  ALTER COLUMN evidence SET DEFAULT '{}'::jsonb,
  ALTER COLUMN semantic_version TYPE INTEGER USING (CASE WHEN semantic_version = 'v1.4' THEN 1 ELSE 1 END),
  ALTER COLUMN semantic_version SET NOT NULL,
  ALTER COLUMN semantic_version SET DEFAULT 1,
  ALTER COLUMN annotation_status SET NOT NULL,
  ALTER COLUMN annotation_status SET DEFAULT 'ACTIVE';
