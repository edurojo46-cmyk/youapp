import 'dotenv/config';
import fs from 'fs';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = url.replace('https://', '').split('.')[0];

console.log(`Applying Search V3 to project: ${projectRef}...`);

const migrationSql = fs.readFileSync('supabase/migrations/20260917000013_atlas_search_people_engine_v3.sql', 'utf8') + `
GRANT EXECUTE ON FUNCTION public.atlas_search_people_engine_v3(text,text,text,text,text,text,text,integer,integer) TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.atlas_search_people_batch_v3(jsonb) TO anon, authenticated, service_role, postgres;
NOTIFY pgrst, 'reload schema';
`;

// Method 1: Supabase Management API
const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
try {
  const resp = await fetch(mgmtUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: migrationSql })
  });
  console.log('Management API status:', resp.status);
  const text = await resp.text();
  console.log('Management API response:', text.slice(0, 200));
} catch (e) {
  console.log('Management API fetch failed:', e.message);
}

// Method 2: Check via pg_net / direct postgrest / diagnostics
