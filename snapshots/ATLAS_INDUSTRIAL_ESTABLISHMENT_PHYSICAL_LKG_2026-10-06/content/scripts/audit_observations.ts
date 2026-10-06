import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, serviceKey);

async function main() {
  console.log('--- Person Observations ---');
  const { count: obsCount, error: err1 } = await client.from('atlas_person_observations').select('*', { count: 'exact', head: true });
  if (err1) console.error('Error 1:', err1);
  console.log('TOTAL_OBSERVATIONS =', obsCount);

  const { data: sources, error: err2 } = await client.from('atlas_person_observations').select('source_system');
  if (err2) console.error('Error 2:', err2);
  const sourceDist: Record<string, number> = {};
  sources?.forEach(s => {
    sourceDist[s.source_system || 'UNKNOWN'] = (sourceDist[s.source_system || 'UNKNOWN'] || 0) + 1;
  });
  console.log('OBSERVATION_SOURCES =', sourceDist);
}
main().catch(console.error);
