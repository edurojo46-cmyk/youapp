import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl } from './supabase.ts';

let _adminClient: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient => {
  if (_adminClient) return _adminClient;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Missing required configuration: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
  }
  _adminClient = createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return _adminClient;
};

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

