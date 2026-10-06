import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const DDL = `
CREATE TABLE IF NOT EXISTS public.atlas_source_knowledge_map (
  source_id text PRIMARY KEY,
  canonical_url text NOT NULL,
  source_name text NOT NULL,
  source_family text NOT NULL,
  source_universe text NOT NULL,
  owner_organization text,
  geography_scope text NOT NULL DEFAULT 'ARGENTINA',
  protocol text NOT NULL,
  access_method text NOT NULL DEFAULT 'DIRECT_PULL',
  public_status text NOT NULL DEFAULT 'PUBLIC',
  permitted_status text NOT NULL DEFAULT 'PERMITTED',
  schema_signature jsonb DEFAULT '{}'::jsonb,
  supported_motor_template text NOT NULL,
  estimated_records bigint DEFAULT 0,
  estimated_unique_entities bigint DEFAULT 0,
  last_seen_at timestamptz DEFAULT now(),
  last_profiled_at timestamptz,
  update_frequency text DEFAULT 'DAILY',
  reliability_score numeric(4,2) DEFAULT 1.00,
  quality_score numeric(4,2) DEFAULT 1.00,
  storage_amplification numeric(5,2) DEFAULT 1.00,
  rate_limit_profile jsonb DEFAULT '{"max_requests_per_sec": 5, "min_interval_ms": 200}'::jsonb,
  current_status text NOT NULL DEFAULT 'ACTIVE',
  entity_capabilities jsonb NOT NULL DEFAULT '{"PERSON": "HIGH"}'::jsonb,
  source_graph_relations jsonb NOT NULL DEFAULT '[]'::jsonb,
  overlap_memory jsonb NOT NULL DEFAULT '{
    "overlap_with_ssot_history": [],
    "overlap_with_other_universes": {},
    "true_net_new_history": [],
    "saturation_curve": [],
    "records_scanned": 0,
    "true_net_new_found": 0,
    "estimated_unseen_population": 0,
    "net_new_yield_curve": []
  }'::jsonb,
  field_telemetry jsonb NOT NULL DEFAULT '{
    "useful_torque_sec": 0,
    "field_slip_percent": 0,
    "field_strength_score": 1.0,
    "active_rotors": 1,
    "max_rotors": 4,
    "shardable": false,
    "shards": []
  }'::jsonb,
  tesla_motor_capabilities text[] NOT NULL DEFAULT ARRAY['CAPABILITY_BULK_FETCH']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_km_universe ON public.atlas_source_knowledge_map (source_universe);
CREATE INDEX IF NOT EXISTS idx_source_km_geo ON public.atlas_source_knowledge_map (geography_scope);
CREATE INDEX IF NOT EXISTS idx_source_km_status ON public.atlas_source_knowledge_map (current_status);
CREATE INDEX IF NOT EXISTS idx_source_km_protocol ON public.atlas_source_knowledge_map (protocol);
CREATE INDEX IF NOT EXISTS idx_source_km_gin_capabilities ON public.atlas_source_knowledge_map USING gin (entity_capabilities);
CREATE INDEX IF NOT EXISTS idx_source_km_gin_relations ON public.atlas_source_knowledge_map USING gin (source_graph_relations);

ALTER TABLE public.atlas_source_knowledge_map ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'atlas_source_knowledge_map' AND policyname = 'Public read for authenticated and anon'
  ) THEN
    CREATE POLICY "Public read for authenticated and anon"
      ON public.atlas_source_knowledge_map FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'atlas_source_knowledge_map' AND policyname = 'Service role write access'
  ) THEN
    CREATE POLICY "Service role write access"
      ON public.atlas_source_knowledge_map FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
`;

async function applyMigration() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    console.log('Applying atlas_source_knowledge_map DDL...');
    await client.query(DDL);
    console.log('✓ atlas_source_knowledge_map created and hardened with RLS successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
