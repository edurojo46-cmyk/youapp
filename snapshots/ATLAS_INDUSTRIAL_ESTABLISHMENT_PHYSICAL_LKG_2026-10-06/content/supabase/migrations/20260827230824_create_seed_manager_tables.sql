-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. Tabla de Jobs (Un job por canal/importación)
CREATE TABLE public.catalog_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  seed_source_id UUID REFERENCES public.seed_sources(id) ON DELETE SET NULL,
  source_url TEXT,
  category VARCHAR(100),
  requested_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  approved_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_catalog_import_jobs_updated_at
  BEFORE UPDATE ON public.catalog_import_jobs
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- 2. Tabla de Items Únicos (Catálogo de candidatos a importar)
CREATE TABLE public.catalog_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) DEFAULT 'youtube' NOT NULL,
  provider_content_id VARCHAR(100) NOT NULL,
  seed_source_id UUID REFERENCES public.seed_sources(id) ON DELETE SET NULL,
  
  -- Metadata
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  -- Estadísticas (pueden ser nulas)
  view_count BIGINT,
  like_count BIGINT,
  comment_count BIGINT,
  
  -- Detalles técnicos
  category_id VARCHAR(50),
  embeddable BOOLEAN,
  privacy_status VARCHAR(50),
  canonical_url TEXT,
  
  -- Raw Data
  raw_metadata JSONB,
  
  -- Calidad y AI
  quality_score FLOAT,
  quality_version INTEGER DEFAULT 1,
  quality_confidence FLOAT,
  ai_prescore FLOAT,
  ai_prescore_version INTEGER,
  
  -- Estado y Aprobación
  status VARCHAR(50) DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'error')),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID, -- Referencia a perfiles si hay usuarios admins reales
  rejected_reason TEXT,
  review_method VARCHAR(50), -- manual, ai, hybrid
  
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Deduplicación Global
  UNIQUE(provider, provider_content_id)
);

CREATE TRIGGER update_catalog_import_items_updated_at
  BEFORE UPDATE ON public.catalog_import_items
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- 3. Tabla puente: Historial de relaciones (Job <-> Item)
CREATE TABLE public.catalog_import_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.catalog_import_jobs(id) ON DELETE CASCADE,
  import_item_id UUID NOT NULL REFERENCES public.catalog_import_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, import_item_id)
);

-- 4. Índices para rendimiento
CREATE INDEX idx_import_items_status ON public.catalog_import_items(status);
CREATE INDEX idx_import_items_source ON public.catalog_import_items(seed_source_id);
CREATE INDEX idx_import_items_provider_content ON public.catalog_import_items(provider, provider_content_id);
CREATE INDEX idx_import_job_items_job ON public.catalog_import_job_items(job_id);


-- 5. Seguridad (RLS)
ALTER TABLE public.catalog_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_job_items ENABLE ROW LEVEL SECURITY;

-- Solo permitimos acceso al backend / CLI a través de service_role. 
-- El usuario final anon/authenticated NO tiene acceso a la herramienta de importación.
CREATE POLICY "Enable all access for service role" ON public.catalog_import_jobs USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for service role" ON public.catalog_import_items USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for service role" ON public.catalog_import_job_items USING (true) WITH CHECK (true);
