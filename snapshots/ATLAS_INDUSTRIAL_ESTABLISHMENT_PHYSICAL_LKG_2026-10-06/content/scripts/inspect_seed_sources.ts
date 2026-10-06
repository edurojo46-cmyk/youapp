import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: sources } = await supabase.from('seed_sources').select('id, name, handle, country, language, is_official, tier, status');
  console.log(`Total seed sources: ${sources?.length}`);
  for (const s of sources || []) {
    console.log(`- [${s.id}] "${s.name}" (${s.handle}) | country: ${s.country} | official: ${s.is_official} | status: ${s.status}`);
  }
}

main().catch(console.error);
