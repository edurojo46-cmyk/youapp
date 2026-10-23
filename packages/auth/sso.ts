/**
 * SHARED PKCE SSO CLIENT UTILITIES
 * @packages/auth/sso.ts
 * 
 * Provides standards-compliant OAuth2/OIDC PKCE flow for cross-origin SSO:
 * - S256 code challenge & verifier generation
 * - CSRF state & nonce binding
 * - Session storage isolation (never puts tokens in URL)
 */

import { supabase } from './index.ts';

export type ProductClientId = 'ATLAS' | 'INDUSTRIAL' | 'YOUAPP';

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generateRandomString(length: number = 48): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

export async function generatePKCE(): Promise<{ code_verifier: string; code_challenge: string }> {
  const verifier = generateRandomString(32);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(hash);
  return { code_verifier: verifier, code_challenge: challenge };
}

export async function startSSOFlow(clientId: ProductClientId, returnPath: string = '/'): Promise<void> {
  const { code_verifier, code_challenge } = await generatePKCE();
  const state = generateRandomString(24);
  const nonce = generateRandomString(24);
  const redirect_uri = `${window.location.origin}/auth/callback`;

  // Store in sessionStorage (isolated per origin)
  sessionStorage.setItem('atlas_sso_verifier', code_verifier);
  sessionStorage.setItem('atlas_sso_state', state);
  sessionStorage.setItem('atlas_sso_nonce', nonce);
  sessionStorage.setItem('atlas_sso_client_id', clientId);
  sessionStorage.setItem('atlas_sso_return_path', returnPath);

  // Request authorization session on backend
  const response = await fetch('/api/auth/sso/authorize-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      redirect_uri,
      code_challenge,
      code_challenge_method: 'S256',
      state,
      nonce
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to initiate SSO request');
  }

  const { authorize_url } = await response.json();
  window.location.href = authorize_url;
}

export async function handleSSOCallback(): Promise<{ user: any; returnPath: string }> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code) {
    throw new Error('MISSING_AUTHORIZATION_CODE');
  }

  const savedState = sessionStorage.getItem('atlas_sso_state');
  const code_verifier = sessionStorage.getItem('atlas_sso_verifier');
  const clientId = sessionStorage.getItem('atlas_sso_client_id') as ProductClientId;
  const returnPath = sessionStorage.getItem('atlas_sso_return_path') || '/';
  const redirect_uri = `${window.location.origin}/auth/callback`;

  if (!savedState || savedState !== state) {
    throw new Error('WRONG_STATE_BLOCKED: State verification mismatch');
  }

  if (!code_verifier || !clientId) {
    throw new Error('MISSING_PKCE_CREDENTIALS');
  }

  // Server-side exchange (no tokens in query string!)
  const response = await fetch('/api/auth/sso/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier,
      client_id: clientId,
      redirect_uri,
      state
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'SSO Exchange Failed');
  }

  const sessionData = await response.json();

  // Establish local Supabase session in this origin
  const { data: setSessData, error: setSessErr } = await supabase.auth.setSession({
    access_token: sessionData.access_token,
    refresh_token: sessionData.refresh_token
  });

  if (setSessErr) {
    throw new Error(`Failed to activate local session: ${setSessErr.message}`);
  }

  // Cleanup sessionStorage
  sessionStorage.removeItem('atlas_sso_verifier');
  sessionStorage.removeItem('atlas_sso_state');
  sessionStorage.removeItem('atlas_sso_nonce');
  sessionStorage.removeItem('atlas_sso_client_id');
  sessionStorage.removeItem('atlas_sso_return_path');

  return {
    user: setSessData.user || sessionData.user,
    returnPath
  };
}

export async function executeGlobalLogout(userId?: string): Promise<void> {
  try {
    if (userId) {
      await fetch('/api/auth/sso/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
    }
  } catch (err) {
    console.error('SSO global logout notification failed:', err);
  } finally {
    await supabase.auth.signOut();
  }
}
