import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const client = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testExec() {
  const { data, error } = await client.rpc('exec_sql', { sql: 'SELECT 1 as num;' });
  console.log('exec_sql result:', data, 'error:', error?.message);
}

testExec();
