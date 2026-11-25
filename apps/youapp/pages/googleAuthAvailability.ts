import { supabaseUrl, supabaseAnonKey } from '../../../src/lib/supabase.ts';
export async function googleAuthAvailability(): Promise<boolean | null> {
  try {
    const response = await fetch(new URL('/auth/v1/settings', supabaseUrl), {
      headers: { apikey: supabaseAnonKey }, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const settings = await response.json();
    return settings.external?.google === true;
  } catch { return null; }
}
