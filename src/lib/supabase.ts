import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-key';

// Creamos el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Función auxiliar para saber si estamos usando el mock (sin claves reales)
export const isSupabaseConfigured = () => {
  return import.meta.env.VITE_SUPABASE_URL !== undefined;
};
