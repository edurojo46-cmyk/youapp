import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const s = createClient(url, key, { auth: { persistSession: false } });

console.log('Testing range queries on atlas_person_identity_map...');
const t0 = performance.now();
const t1 = performance.now();
const { count, error } = await s.from('atlas_person_identity_map')
  .select('atlas_person_id', { count: 'exact', head: true })
  .gte('atlas_person_id', 'atlas_arg_per_0')
  .lt('atlas_person_id', 'atlas_arg_per_1');
console.log('Hex 0 bucket count:', count, 'Time ms:', (performance.now() - t1).toFixed(1), 'Error:', error);
