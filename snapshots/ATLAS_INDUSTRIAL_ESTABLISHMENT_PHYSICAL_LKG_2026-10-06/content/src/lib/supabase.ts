import { createClient } from '@supabase/supabase-js';

const getEnvVar = (name: string) => {
  let val = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env[name] : undefined;
  if (!val && typeof process !== 'undefined' && process.env) {
    val = process.env[name];
  }
  if (!val) {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return val;
};

export const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
export const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

// Creamos el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20
    }
  }
});


// Función auxiliar para saber si estamos usando el mock (sin claves reales)
export const isSupabaseConfigured = () => {
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL !== undefined;
};
