/**
 * ATLAS CENTRAL SSO ROUTER
 * @server/routes/auth/ssoRoutes.ts
 * 
 * Express endpoints providing secure PKCE-based SSO coordination between:
 * - Atlas Platform (:5175)
 * - Busca Industrial (:5176)
 * - YouApp (:5173)
 */

import { Router } from 'express';
import express from 'express';
import { AtlasSSOCoordinator } from '../../services/auth-sso/AtlasSSOCoordinator.ts';

export interface SSORouterDeps {
  ssoCoordinator: AtlasSSOCoordinator;
  resolveUserId: (req: express.Request, sbAdmin: any) => Promise<string | null>;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();

  public check(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (bucket.count >= maxRequests) {
      return false; // Exceeded
    }

    bucket.count++;
    return true;
  }
}

export function createSSORouter(deps: SSORouterDeps): Router {
  const router = Router();
  const { ssoCoordinator } = deps;

  const authorizeLimiter = new InMemoryRateLimiter(); // 60 req / min
  const issueLimiter = new InMemoryRateLimiter();     // 30 req / min
  const exchangeLimiter = new InMemoryRateLimiter();  // 30 req / min

  // POST /api/auth/sso/authorize-request
  router.post('/authorize-request', (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      if (!authorizeLimiter.check(clientIp, 60, 60000)) {
        res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED: Too many authorize requests' });
        return;
      }

      const { client_id, redirect_uri, code_challenge, code_challenge_method, state, nonce } = req.body;
      const result = ssoCoordinator.initiateAuthRequest({
        client_id,
        redirect_uri,
        code_challenge,
        code_challenge_method,
        state,
        nonce
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/auth/sso/request-details/:reqId
  router.get('/request-details/:reqId', (req, res) => {
    const details = ssoCoordinator.getAuthRequest(req.params.reqId);
    if (!details) {
      res.status(404).json({ error: 'AUTH_REQUEST_NOT_FOUND_OR_EXPIRED' });
      return;
    }
    res.json({
      auth_req_id: details.auth_req_id,
      client_id: details.client_id,
      redirect_uri: details.redirect_uri,
      state: details.state
    });
  });

  // POST /api/auth/sso/issue-code
  router.post('/issue-code', async (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      if (!issueLimiter.check(clientIp, 30, 60000)) {
        res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED: Too many issue-code requests' });
        return;
      }

      // 1. EXTRACT & VERIFY SUPABASE SESSION TOKEN (Identity SSOT authority)
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'UNAUTHENTICATED_SSO_MINT_BLOCKED: A valid Supabase authorization session is required' });
        return;
      }

      const token = authHeader.slice(7).trim();
      const verifiedUser = await ssoCoordinator.verifySessionToken(token);

      if (!verifiedUser || !verifiedUser.id || !verifiedUser.email) {
        res.status(401).json({ error: 'UNAUTHENTICATED_SSO_MINT_BLOCKED: Session token is invalid or expired' });
        return;
      }

      const { auth_req_id, user_id, user_email } = req.body;
      if (!auth_req_id) {
        res.status(400).json({ error: 'MISSING_REQUIRED_FIELDS' });
        return;
      }

      // 2. DETECT & BLOCK CLIENT IMPERSONATION / TAMPERING
      if (user_id && user_id !== verifiedUser.id) {
        res.status(403).json({ error: 'USER_A_CANNOT_MINT_SESSION_FOR_B: Client user_id does not match verified session' });
        return;
      }

      if (user_email && user_email.toLowerCase() !== verifiedUser.email.toLowerCase()) {
        res.status(403).json({ error: 'USER_A_CANNOT_MINT_SESSION_FOR_B: Client email does not match verified session' });
        return;
      }

      // 3. ISSUE CODE BOUND EXCLUSIVELY TO VERIFIED IDENTITY
      const codeResult = await ssoCoordinator.issueAuthorizationCode({
        auth_req_id,
        verified_user_id: verifiedUser.id,
        verified_user_email: verifiedUser.email
      });

      res.json(codeResult);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/auth/sso/exchange
  router.post('/exchange', async (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      if (!exchangeLimiter.check(clientIp, 30, 60000)) {
        res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED: Too many exchange requests' });
        return;
      }

      const { code, code_verifier, client_id, redirect_uri, state } = req.body;
      const session = await ssoCoordinator.exchangeCode({
        code,
        code_verifier,
        client_id,
        redirect_uri,
        state
      });
      res.json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/auth/sso/logout
  router.post('/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const { user_id, jwt, token } = req.body;
      const effectiveJwt = jwt || token || bearerToken;

      const success = await ssoCoordinator.globalLogout({
        user_id,
        jwt: effectiveJwt
      });
      res.json({ success, user_id, message: 'Global session revoked server-side' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/auth/sso/health
  router.get('/health', (req, res) => {
    res.json({
      status: 'HEALTHY',
      gateway: 'active',
      identity_ssot: 'SUPABASE_AUTH',
      service: 'ATLAS_AUTH_GATEWAY_SSO',
      pkce_method: 'S256',
      code_ttl_seconds: 60,
      rate_limiting: {
        authorize: '60_req_min',
        issue_code: '30_req_min',
        exchange: '30_req_min'
      },
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

export default createSSORouter;
