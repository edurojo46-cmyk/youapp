-- ==============================================================================
-- MIGRATION: 20260901070000_create_radar_distributed_leases.sql
-- Description: Distributed Single-Flight Atomic Leases & Radar Knowledge ROI Tracking
-- ==============================================================================

-- 1. Tabla de Leases Atómicos para Single-Flight Distribuido
CREATE TABLE IF NOT EXISTS public.radar_acquisition_leases (
  cluster_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight', 'completed', 'failed')),
  owner_request_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  results_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS para radar_acquisition_leases
ALTER TABLE public.radar_acquisition_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read and write on radar leases"
  ON public.radar_acquisition_leases
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 2. Función Atómica para Adquirir Lease (Single-Flight Lock)
CREATE OR REPLACE FUNCTION public.acquire_radar_lease(
  p_cluster_key TEXT,
  p_request_id TEXT,
  p_ttl_seconds INTEGER DEFAULT 45
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing public.radar_acquisition_leases%ROWTYPE;
  v_expires TIMESTAMPTZ;
BEGIN
  v_expires := now() + (p_ttl_seconds || ' seconds')::interval;

  -- Buscar si existe un lease activo no expirado
  SELECT * INTO v_existing
  FROM public.radar_acquisition_leases
  WHERE cluster_key = p_cluster_key;

  IF FOUND THEN
    -- Si está en vuelo y no ha expirado, otro proceso tiene el lock
    IF v_existing.status = 'in_flight' AND v_existing.expires_at > now() THEN
      RETURN jsonb_build_object(
        'acquired', false,
        'coalesced', true,
        'owner_request_id', v_existing.owner_request_id,
        'started_at', v_existing.started_at,
        'expires_at', v_existing.expires_at
      );
    END IF;

    -- Si ya expiró o completó hace tiempo, tomamos el control atómicamente
    UPDATE public.radar_acquisition_leases
    SET status = 'in_flight',
        owner_request_id = p_request_id,
        started_at = now(),
        expires_at = v_expires,
        results_count = 0,
        updated_at = now()
    WHERE cluster_key = p_cluster_key;

    RETURN jsonb_build_object(
      'acquired', true,
      'coalesced', false,
      'owner_request_id', p_request_id,
      'expires_at', v_expires
    );
  ELSE
    -- Insertar nuevo lease
    INSERT INTO public.radar_acquisition_leases (
      cluster_key,
      status,
      owner_request_id,
      started_at,
      expires_at,
      results_count
    ) VALUES (
      p_cluster_key,
      'in_flight',
      p_request_id,
      now(),
      v_expires,
      0
    )
    ON CONFLICT (cluster_key) DO UPDATE
    SET status = 'in_flight',
        owner_request_id = p_request_id,
        started_at = now(),
        expires_at = v_expires,
        results_count = 0,
        updated_at = now()
    WHERE public.radar_acquisition_leases.expires_at <= now()
       OR public.radar_acquisition_leases.status != 'in_flight';

    IF FOUND THEN
      RETURN jsonb_build_object(
        'acquired', true,
        'coalesced', false,
        'owner_request_id', p_request_id,
        'expires_at', v_expires
      );
    ELSE
      -- Si hubo carrera y otro insertó justo antes
      RETURN jsonb_build_object(
        'acquired', false,
        'coalesced', true,
        'cluster_key', p_cluster_key
      );
    END IF;
  END IF;
END;
$$;

-- 3. Función Atómica para Liberar / Completar Lease
CREATE OR REPLACE FUNCTION public.release_radar_lease(
  p_cluster_key TEXT,
  p_request_id TEXT,
  p_status TEXT DEFAULT 'completed',
  p_results_count INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.radar_acquisition_leases
  SET status = p_status,
      results_count = p_results_count,
      updated_at = now()
  WHERE cluster_key = p_cluster_key
    AND (owner_request_id = p_request_id OR expires_at <= now());
END;
$$;

-- 4. Tabla de ROI de Conocimiento Adquirido
CREATE TABLE IF NOT EXISTS public.radar_knowledge_acquisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  raw_returned INTEGER NOT NULL DEFAULT 0,
  unique_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  new_to_atlas INTEGER NOT NULL DEFAULT 0,
  future_searches_served INTEGER NOT NULL DEFAULT 0,
  radar_calls_avoided INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_radar_knowledge_cluster ON public.radar_knowledge_acquisitions(cluster_key);
CREATE INDEX IF NOT EXISTS idx_radar_knowledge_created ON public.radar_knowledge_acquisitions(created_at DESC);

-- RLS
ALTER TABLE public.radar_knowledge_acquisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read and write on radar ROI"
  ON public.radar_knowledge_acquisitions
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 5. Función para Registrar y Actualizar Retorno de ROI
CREATE OR REPLACE FUNCTION public.record_radar_knowledge_acquisition(
  p_cluster_key TEXT,
  p_request_id TEXT,
  p_raw_returned INTEGER,
  p_unique_count INTEGER,
  p_qualified_count INTEGER,
  p_new_to_atlas INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.radar_knowledge_acquisitions (
    cluster_key,
    request_id,
    raw_returned,
    unique_count,
    qualified_count,
    new_to_atlas
  ) VALUES (
    p_cluster_key,
    p_request_id,
    p_raw_returned,
    p_unique_count,
    p_qualified_count,
    p_new_to_atlas
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Función para atribuir búsquedas servidas por Atlas a una adquisición histórica
CREATE OR REPLACE FUNCTION public.increment_radar_knowledge_served(
  p_cluster_key TEXT,
  p_searches_count INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.radar_knowledge_acquisitions
  SET future_searches_served = future_searches_served + p_searches_count,
      radar_calls_avoided = radar_calls_avoided + p_searches_count
  WHERE cluster_key = p_cluster_key;
END;
$$;
