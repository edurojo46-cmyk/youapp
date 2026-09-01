import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IWSDC0aWUR8cvOPrwYSaqg_JU8aASm8';

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
  return import.meta.env.VITE_SUPABASE_URL !== undefined;
};
