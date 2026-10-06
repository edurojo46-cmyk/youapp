import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';

async function run() {
  const { data, error } = await db.from('atlas_person_observations').select('value_jsonb').limit(2);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();