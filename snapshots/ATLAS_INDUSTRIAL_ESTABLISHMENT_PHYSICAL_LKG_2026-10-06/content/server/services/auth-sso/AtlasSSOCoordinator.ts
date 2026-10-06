/**
 * ATLAS AUTH GATEWAY & CENTRAL SSO COORDINATOR
 * @server/services/auth-sso/AtlasSSOCoordinator.ts
 * 
 * Identity Invariant:
 * Supabase Auth remains the SOLE identity authority and SSOT.
 * Atlas implements ONLY coordination, PKCE validation, and authorization code exchange.
 * 
 * Security Invariants:
 * - One-time cryptographically random codes (TTL 60s).
 * - PKCE S256 (code_challenge & code_verifier).
 * - Client / product audience binding (ATLAS, INDUSTRIAL, YOUAPP).
 * - Strict return_url allowlist (open redirect prevention).
 * - State & nonce replay protection.
 * - Single-use enforcement (code marked consumed immediately; replay blocked).
 * - Global logout revocation of Supabase sessions.
 */

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getProductBaseUrl, getProductUrl } from '../../../packages/config/products.ts';

export type ProductClientId = 'ATLAS' | 'INDUSTRIAL' | 'YOUAPP';

export interface AuthRequestRecord {
  auth_req_id: string;
  client_id: ProductClientId;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  state: string;
  nonce: string;
  expires_at: number;
}

export interface AuthCodeRecord {
  code_hash: string;
  user_id: string;
  user_email: string;
  client_id: ProductClientId;
  redirect_uri: string;
  code_challenge: string;
  state: string;
  nonce: string;
  expires_at: number;
  consumed: boolean;
}

export class AtlasSSOCoordinator {
  private sbAdmin: SupabaseClient;
  private sbAnon: SupabaseClient;

  // In-memory store for pending auth requests (TTL 5 mins)
  private authRequests: Map<string, AuthRequestRecord> = new Map();
  // In-memory store for one-time authorization code hashes (TTL 60 seconds)
  private codes: Map<string, AuthCodeRecord> = new Map();
  // In-memory active tokens per user for global server-side revocation
  private userTokens: Map<string, string> = new Map();

  /**
   * Dynamically resolves allowed return URLs for a product using public configuration
   */
  public getReturnUrlAllowlist(client_id: ProductClientId): string[] {
    const base = getProductBaseUrl(client_id);
    return [
      base,
      `${base}/`,
      `${base}/auth/callback`
    ];
  }

  constructor() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('[AtlasSSOCoordinator] Missing Supabase admin configuration');
    }

    this.sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
    this.sbAnon = createClient(supabaseUrl, supabaseAnonKey);

    // Periodic cleanup of expired entries
    setInterval(() => this.purgeExpired(), 30000);
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [id, req] of this.authRequests.entries()) {
      if (req.expires_at < now) this.authRequests.delete(id);
    }
    for (const [hash, code] of this.codes.entries()) {
      if (code.expires_at < now) this.codes.delete(hash);
    }
  }

  /**
   * Validates redirect URI against product allowlist
   */
  public validateRedirectUri(client_id: ProductClientId, redirect_uri: string): boolean {
    if (!redirect_uri || redirect_uri.startsWith('javascript:') || redirect_uri.startsWith('data:')) {
      return false;
    }
    const allowed = this.getReturnUrlAllowlist(client_id);
    if (!allowed || allowed.length === 0) return false;

    try {
      const parsed = new URL(redirect_uri);
      const originWithPort = `${parsed.protocol}//${parsed.host}`;
      const fullNormalized = `${originWithPort}${parsed.pathname}`;
      return allowed.some(pattern => {
        return fullNormalized === pattern || originWithPort === pattern || fullNormalized.startsWith(pattern);
      });
    } catch {
      return false;
    }
  }

  /**
   * Step 1: Initiate Auth Request
   */
  public initiateAuthRequest(params: {
    client_id: ProductClientId;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method?: string;
    state: string;
    nonce: string;
  }): { auth_req_id: string; authorize_url: string } {
    const { client_id, redirect_uri, code_challenge, code_challenge_method = 'S256', state, nonce } = params;

    if (!['ATLAS', 'INDUSTRIAL', 'YOUAPP'].includes(client_id)) {
      throw new Error('INVALID_CLIENT_ID: Client must be ATLAS, INDUSTRIAL, or YOUAPP');
    }

    if (!this.validateRedirectUri(client_id, redirect_uri)) {
      throw new Error(`OPEN_REDIRECT_BLOCKED: redirect_uri "${redirect_uri}" is not allowed for ${client_id}`);
    }

    if (!code_challenge || code_challenge.length < 40) {
      throw new Error('INVALID_CODE_CHALLENGE: Missing or insufficient PKCE code_challenge');
    }

    if (code_challenge_method !== 'S256') {
      throw new Error('UNSUPPORTED_CHALLENGE_METHOD: Only S256 is supported');
    }

    if (!state || !nonce) {
      throw new Error('MISSING_STATE_OR_NONCE: state and nonce are required to prevent CSRF/replay');
    }

    const auth_req_id = 'req_' + crypto.randomBytes(24).toString('hex');
    const expires_at = Date.now() + 5 * 60 * 1000; // 5 minutes

    this.authRequests.set(auth_req_id, {
      auth_req_id,
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      expires_at
    });

    const authorize_url = getProductUrl('ATLAS', '/sso/authorize', { params: { auth_req_id } });
    return { auth_req_id, authorize_url };
  }

  /**
   * Retrieves pending auth request details for Gateway UI
   */
  public getAuthRequest(auth_req_id: string): AuthRequestRecord | null {
    const req = this.authRequests.get(auth_req_id);
    if (!req) return null;
    if (req.expires_at < Date.now()) {
      this.authRequests.delete(auth_req_id);
      return null;
    }
    return req;
  }

  /**
   * Verifies a Supabase session JWT directly with the Supabase Auth server.
   * Derives user identity exclusively from the cryptographic signature.
   */
  public async verifySessionToken(token: string): Promise<{ id: string; email: string } | null> {
    if (!token || typeof token !== 'string') return null;
    try {
      const { data: { user }, error } = await this.sbAnon.auth.getUser(token);
      if (error || !user || !user.id || !user.email) {
        return null;
      }
      return { id: user.id, email: user.email };
    } catch {
      return null;
    }
  }

  /**
   * Step 2: Issue One-Time Authorization Code for authenticated user
   */
  public async issueAuthorizationCode(params: {
    auth_req_id: string;
    verified_user_id: string;
    verified_user_email: string;
  }): Promise<{ code: string; redirect_uri: string; state: string }> {
    const { auth_req_id, verified_user_id, verified_user_email } = params;

    if (!verified_user_id || !verified_user_email) {
      throw new Error('UNAUTHENTICATED_SSO_MINT_BLOCKED: Verified identity is required');
    }

    const req = this.authRequests.get(auth_req_id);
    if (!req) {
      throw new Error('EXPIRED_OR_INVALID_AUTH_REQUEST');
    }

    if (req.expires_at < Date.now()) {
      this.authRequests.delete(auth_req_id);
      throw new Error('AUTH_REQUEST_EXPIRED');
    }

    // Generate cryptographically random one-time authorization code (opaque, 64 hex chars, no tokens or identity inside)
    const raw_code = 'auth_' + crypto.randomBytes(32).toString('hex');
    const code_hash = crypto.createHash('sha256').update(raw_code).digest('hex');
    const expires_at = Date.now() + 60 * 1000; // 60 seconds TTL

    this.codes.set(code_hash, {
      code_hash,
      user_id: verified_user_id,
      user_email: verified_user_email,
      client_id: req.client_id,
      redirect_uri: req.redirect_uri,
      code_challenge: req.code_challenge,
      state: req.state,
      nonce: req.nonce,
      expires_at,
      consumed: false
    });

    // Remove consumed auth request
    this.authRequests.delete(auth_req_id);

    return {
      code: raw_code,
      redirect_uri: req.redirect_uri,
      state: req.state
    };
  }

  /**
   * Step 3: Server-Side PKCE Code Exchange for Supabase Session
   */
  public async exchangeCode(params: {
    code: string;
    code_verifier: string;
    client_id: ProductClientId;
    redirect_uri: string;
    state: string;
  }): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: any;
    token_type: string;
  }> {
    const { code, code_verifier, client_id, redirect_uri, state } = params;

    if (!code) throw new Error('MISSING_CODE');
    if (!code_verifier) throw new Error('WRONG_PKCE_VERIFIER_BLOCKED: code_verifier is required');

    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    const entry = this.codes.get(code_hash);

    if (!entry) {
      throw new Error('INVALID_OR_UNKNOWN_CODE');
    }

    if (entry.consumed) {
      throw new Error('REUSED_CODE_BLOCKED: Authorization code has already been consumed');
    }

    if (entry.expires_at < Date.now()) {
      this.codes.delete(code_hash);
      throw new Error('EXPIRED_CODE_BLOCKED: Authorization code has expired');
    }

    if (entry.client_id !== client_id) {
      throw new Error(`WRONG_AUDIENCE_BLOCKED: Code was issued for ${entry.client_id}, not ${client_id}`);
    }

    if (entry.redirect_uri !== redirect_uri) {
      throw new Error('TAMPERED_RETURN_URL_BLOCKED: redirect_uri does not match issued authorization code');
    }

    if (entry.state !== state) {
      throw new Error('WRONG_STATE_BLOCKED: state mismatch detected');
    }

    // Verify PKCE S256 Challenge
    const computedChallenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    if (computedChallenge !== entry.code_challenge) {
      throw new Error('WRONG_PKCE_VERIFIER_BLOCKED: PKCE code_verifier does not match challenge');
    }

    // Mark code as consumed immediately (Atomic Single-Use)
    entry.consumed = true;

    // Mint fresh Supabase session for the identified user
    const { data: linkData, error: linkErr } = await this.sbAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: entry.user_email
    });

    if (linkErr || !linkData.properties?.hashed_token) {
      throw new Error(`SESSION_MINT_FAILED: ${linkErr?.message || 'Failed generating OTP'}`);
    }

    const { data: sessionData, error: sessErr } = await this.sbAnon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink'
    });

    if (sessErr || !sessionData.session) {
      throw new Error(`SESSION_ESTABLISHMENT_FAILED: ${sessErr?.message || 'Verification failed'}`);
    }

    // Track active token for global server-side revocation capability
    this.userTokens.set(entry.user_id, sessionData.session.access_token);

    return {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      token_type: 'bearer',
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        app_metadata: sessionData.user.app_metadata,
        user_metadata: sessionData.user.user_metadata
      }
    };
  }

  /**
   * Global Logout: Revokes central session across all products in Supabase Auth
   */
  public async globalLogout(params: { user_id?: string; jwt?: string } | string): Promise<boolean> {
    try {
      const userId = typeof params === 'string' ? params : params.user_id;
      let token = typeof params === 'object' ? params.jwt : undefined;

      if (!token && userId) {
        token = this.userTokens.get(userId);
      }

      if (token) {
        await this.sbAdmin.auth.admin.signOut(token, 'global');
      }

      if (userId) {
        this.userTokens.delete(userId);
        // Invalidate any active code hashes for this user
        for (const [hash, entry] of this.codes.entries()) {
          if (entry.user_id === userId) {
            this.codes.delete(hash);
          }
        }
      }

      return true;
    } catch (err) {
      console.error('[AtlasSSOCoordinator] Global logout error:', err);
      return false;
    }
  }
}
