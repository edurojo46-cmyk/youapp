import 'dotenv/config';
import pg from 'pg';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

const client = new pg.Client({ ...parseDbUrl() });
await client.connect();

console.log('--- Applying Atlas Mercado Pago Commerce MVP V1 Migration ---');

await client.query(`
  -- 1. Sellers table
  CREATE TABLE IF NOT EXISTS public.atlas_marketplace_sellers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_user_id UUID NOT NULL,
    mp_user_id TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'CONNECTED',
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT uq_atlas_seller_user UNIQUE(atlas_user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ams_user ON public.atlas_marketplace_sellers(atlas_user_id);

  -- 2. Proposals table
  CREATE TABLE IF NOT EXISTS public.atlas_commercial_proposals (
    proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    saved_relation_id UUID,
    buyer_company_id UUID,
    buyer_name TEXT,
    buyer_contact_email TEXT,
    title TEXT NOT NULL,
    description TEXT,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'ARS',
    valid_until TIMESTAMPTZ NOT NULL,
    terms_conditions TEXT,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'SENT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_proposal_status CHECK (
      status IN ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'PAYMENT_PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')
    )
  );
  CREATE INDEX IF NOT EXISTS idx_acp_user ON public.atlas_commercial_proposals(user_id);
  CREATE INDEX IF NOT EXISTS idx_acp_token ON public.atlas_commercial_proposals(token);
  CREATE INDEX IF NOT EXISTS idx_acp_status ON public.atlas_commercial_proposals(status);

  -- 3. Commercial Orders table (ATLAS_ORDER_ID SSOT)
  CREATE TABLE IF NOT EXISTS public.atlas_commercial_orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES public.atlas_commercial_proposals(proposal_id) ON DELETE RESTRICT,
    seller_user_id UUID NOT NULL,
    buyer_company_id UUID,
    currency TEXT NOT NULL DEFAULT 'ARS',
    gross_amount NUMERIC NOT NULL,
    atlas_fee_amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    mp_preference_id TEXT,
    mp_order_id TEXT,
    mp_payment_id TEXT UNIQUE,
    idempotency_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    CONSTRAINT chk_order_status CHECK (
      status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')
    )
  );
  CREATE INDEX IF NOT EXISTS idx_aco_seller ON public.atlas_commercial_orders(seller_user_id);
  CREATE INDEX IF NOT EXISTS idx_aco_proposal ON public.atlas_commercial_orders(proposal_id);
  CREATE INDEX IF NOT EXISTS idx_aco_status ON public.atlas_commercial_orders(status);
  CREATE INDEX IF NOT EXISTS idx_aco_idempotency ON public.atlas_commercial_orders(idempotency_key);

  -- 4. Payment events ledger (Audit log & Webhook idempotent storage)
  CREATE TABLE IF NOT EXISTS public.atlas_payment_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    external_resource_id TEXT NOT NULL,
    atlas_order_id UUID REFERENCES public.atlas_commercial_orders(order_id),
    payload_hash TEXT NOT NULL,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processing_status TEXT NOT NULL DEFAULT 'PROCESSED',
    CONSTRAINT uq_event_resource_hash UNIQUE(external_resource_id, payload_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_ape_order ON public.atlas_payment_events(atlas_order_id);
  CREATE INDEX IF NOT EXISTS idx_ape_resource ON public.atlas_payment_events(external_resource_id);
`);

console.log('Tables created successfully:');
console.log(' - atlas_marketplace_sellers');
console.log(' - atlas_commercial_proposals');
console.log(' - atlas_commercial_orders');
console.log(' - atlas_payment_events');

await client.end();
