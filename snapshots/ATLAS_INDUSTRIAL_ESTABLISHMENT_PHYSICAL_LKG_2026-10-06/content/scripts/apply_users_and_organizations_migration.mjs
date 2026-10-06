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

async function migrate() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('Migrating Atlas Users, Profiles, and Organizations V1 schema...');

  await client.query(`
    -- 1. User Profiles
    CREATE TABLE IF NOT EXISTS public.atlas_user_profiles (
      user_id UUID PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      display_name TEXT,
      phone TEXT,
      country TEXT NOT NULL DEFAULT 'AR',
      province TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 2. Organizations
    CREATE TABLE IF NOT EXISTS public.atlas_organizations (
      organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      legal_name TEXT,
      tax_id TEXT,
      website TEXT,
      industry TEXT,
      country TEXT NOT NULL DEFAULT 'AR',
      province TEXT,
      city TEXT,
      address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 3. Organization Memberships
    CREATE TABLE IF NOT EXISTS public.atlas_organization_members (
      member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES public.atlas_organizations(organization_id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      role TEXT NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(organization_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_aom_user ON public.atlas_organization_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_aom_org ON public.atlas_organization_members(organization_id);

    -- 4. Non-destructive extension to Mi Base & Proposals
    ALTER TABLE public.atlas_user_saved_relations
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.atlas_organizations(organization_id) ON DELETE SET NULL;

    ALTER TABLE public.atlas_commercial_proposals
    ADD COLUMN IF NOT EXISTS seller_organization_id UUID REFERENCES public.atlas_organizations(organization_id) ON DELETE SET NULL;

    ALTER TABLE public.atlas_commercial_orders
    ADD COLUMN IF NOT EXISTS seller_organization_id UUID REFERENCES public.atlas_organizations(organization_id) ON DELETE SET NULL;
  `);

  console.log('✓ Tables and columns created successfully.');
  await client.end();
}

migrate().catch(console.error);
