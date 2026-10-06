import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: prods } = await supabase.from('atlas_products').select('*');
  console.log(`Total products: ${prods?.length}`);
  for (const p of prods || []) {
    console.log(`Product: "${p.name}" | Tenant: ${p.tenant_id} | Category: ${p.category} | Created: ${p.created_at}`);
  }
}

main().catch(console.error);
