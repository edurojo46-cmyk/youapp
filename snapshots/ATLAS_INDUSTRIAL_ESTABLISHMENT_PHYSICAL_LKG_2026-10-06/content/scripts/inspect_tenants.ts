import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  const { data: entities } = await supabase.from('atlas_canonical_entities').select('*');
  const tenantEntityMap: Record<string, any[]> = {};
  for (const e of entities || []) {
    tenantEntityMap[e.tenant_id] = tenantEntityMap[e.tenant_id] || [];
    tenantEntityMap[e.tenant_id].push(e);
  }

  console.log('=== TENANTS SUMMARY ===');
  for (const [t, list] of Object.entries(tenantEntityMap)) {
    const types = list.map(e => e.entity_type);
    const typeCount: Record<string, number> = {};
    for (const ty of types) typeCount[ty] = (typeCount[ty] || 0) + 1;
    console.log(`Tenant ${t}: Total=${list.length}, Types=${JSON.stringify(typeCount)}`);
    console.log(`  Names: ${list.map(e => `${e.entity_type}:${e.canonical_name}`).join(', ')}`);
  }
}

inspect().catch(console.error);
