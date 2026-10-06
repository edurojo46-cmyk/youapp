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

async function applySecurity() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('Applying RLS and authorization policies for Atlas Users & Organizations...');

  await client.query(`
    -- 1. Enable RLS
    ALTER TABLE public.atlas_user_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.atlas_organizations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.atlas_organization_members ENABLE ROW LEVEL SECURITY;

    -- 2. Drop existing policies if any
    DROP POLICY IF EXISTS "Users can view their own profile" ON public.atlas_user_profiles;
    DROP POLICY IF EXISTS "Users can manage their own profile" ON public.atlas_user_profiles;
    DROP POLICY IF EXISTS "Users can view their memberships" ON public.atlas_organization_members;
    DROP POLICY IF EXISTS "Members can view their organization" ON public.atlas_organizations;
    DROP POLICY IF EXISTS "Owners/Admins can update organization" ON public.atlas_organizations;

    -- 3. Profiles: Only owner can SELECT and UPDATE
    CREATE POLICY "Users can view their own profile"
      ON public.atlas_user_profiles FOR SELECT
      USING (auth.uid() = user_id);

    CREATE POLICY "Users can manage their own profile"
      ON public.atlas_user_profiles FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    -- 4. Organization Members: Users can only see memberships they belong to
    CREATE POLICY "Users can view their memberships"
      ON public.atlas_organization_members FOR SELECT
      USING (auth.uid() = user_id);

    -- 5. Organizations: Only active members can view
    CREATE POLICY "Members can view their organization"
      ON public.atlas_organizations FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.atlas_organization_members m 
        WHERE m.organization_id = atlas_organizations.organization_id 
        AND m.user_id = auth.uid() 
        AND m.status = 'ACTIVE'
      ));

    CREATE POLICY "Owners/Admins can update organization"
      ON public.atlas_organizations FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.atlas_organization_members m 
        WHERE m.organization_id = atlas_organizations.organization_id 
        AND m.user_id = auth.uid() 
        AND m.role IN ('OWNER', 'ADMIN') 
        AND m.status = 'ACTIVE'
      ));

    -- Grant necessary permissions to authenticated & service_role
    GRANT ALL ON public.atlas_user_profiles TO authenticated, service_role;
    GRANT ALL ON public.atlas_organizations TO authenticated, service_role;
    GRANT ALL ON public.atlas_organization_members TO authenticated, service_role;
  `);

  console.log('✓ RLS policies and grants applied successfully.');
  await client.end();
}

applySecurity().catch(console.error);
