/**
 * SHARED AUTH PACKAGE
 * @packages/auth
 * 
 * Single source of authentication for Atlas Core, Busca Industrial, and YouApp.
 * Backed by Supabase Auth with unified session persistence across all 3 products.
 */

import { supabase } from '../../src/lib/supabase.ts';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { SharedUser } from '../types/index.ts';

export { supabase };

/**
 * Returns the current authenticated JWT token or null
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch (err) {
    console.error('[SharedAuth] Error reading auth token:', err);
    return null;
  }
}

/**
 * Returns standard Authorization header object
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Returns the currently authenticated user
 */
export async function getCurrentUser(): Promise<SharedUser | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata
    };
  } catch (err) {
    console.error('[SharedAuth] Error fetching current user:', err);
    return null;
  }
}

/**
 * Listen for auth state changes across all products
 */
export function onSharedAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Unified sign out across all products
 */
export async function sharedSignOut(): Promise<void> {
  await supabase.auth.signOut();
}
