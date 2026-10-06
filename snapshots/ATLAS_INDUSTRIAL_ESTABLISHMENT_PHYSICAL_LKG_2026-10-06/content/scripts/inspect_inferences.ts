import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: infs } = await supabase.from('atlas_semantic_inferences').select('*');
  console.log('=== INFERENCES IN DATABASE ===');
  console.log(JSON.stringify(infs, null, 2));
}

main().catch(console.error);
