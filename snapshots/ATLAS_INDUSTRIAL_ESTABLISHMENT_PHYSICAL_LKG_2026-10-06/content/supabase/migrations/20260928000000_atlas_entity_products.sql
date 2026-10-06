CREATE TABLE IF NOT EXISTS public.atlas_entity_products (
  product_id uuid NOT NULL,
  company_id uuid NOT NULL,
  product_name text,
  company_name text,
  relationship_type text,
  category text,
  province text,
  city text,
  source text,
  evidence jsonb,
  last_verified_at timestamptz DEFAULT now(),
  PRIMARY KEY (product_id, company_id)
);
