-- ─────────────────────────────────────────────────────────────────────────────
-- 20260902140000_create_exact_work_coverage_memory.sql
-- ExactWorkCoverageMemory — Memoria Persistente de Cobertura y Demanda de Obras
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exact_work_coverage_memory (
  work_id                     text PRIMARY KEY,
  canonical_title             text NOT NULL,
  artist                      text NOT NULL,
  atlas_physical_count        int DEFAULT 0,
  federated_exact_count       int DEFAULT 0,
  exact_qualified_count       int DEFAULT 0,
  original_artist_count       int DEFAULT 0,
  cover_count                 int DEFAULT 0,
  coverage_at_5               int DEFAULT 0,
  coverage_at_10              int DEFAULT 0,
  query_demand_7d             int DEFAULT 1,
  query_demand_30d            int DEFAULT 1,
  priority_score              numeric DEFAULT 0,
  last_queried_at             timestamptz DEFAULT now(),
  last_discovery_mission_at   timestamptz,
  last_coverage_improvement   timestamptz,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exact_work_coverage_priority ON public.exact_work_coverage_memory(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_exact_work_coverage_demand ON public.exact_work_coverage_memory(query_demand_7d DESC);
CREATE INDEX IF NOT EXISTS idx_exact_work_coverage_at_10 ON public.exact_work_coverage_memory(coverage_at_10 ASC);

ALTER TABLE public.exact_work_coverage_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to exact_work_coverage_memory"
  ON public.exact_work_coverage_memory FOR SELECT
  TO public USING (true);

CREATE POLICY "Allow public insert/update access to exact_work_coverage_memory"
  ON public.exact_work_coverage_memory FOR ALL
  TO public USING (true) WITH CHECK (true);
