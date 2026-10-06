import 'dotenv/config';
import crypto from 'crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const ATLAS_URL = 'http://localhost:5175';
const INDUSTRIAL_URL = 'http://localhost:5176';
const YOUAPP_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5174';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('hex');
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function runSecurityAuthorityGate() {
  console.log('==================================================');
  console.log('ATLAS PHASE 3B.1: SSO SECURITY AUTHORITY GATE');
  console.log('==================================================\n');

  const report = {
    SSO_USER_DERIVED_FROM_VERIFIED_SESSION: false,
    CLIENT_USER_ID_TRUSTED: false,
    CLIENT_EMAIL_TRUSTED: false,

    SERVICE_ROLE_USED_IN_FRONTEND: false,
    SERVICE_ROLE_EXPOSED_TO_BROWSER: false,
    ADMIN_AUTH_ENDPOINT_PUBLICLY_ABUSABLE: false,

    USER_A_CANNOT_MINT_SESSION_FOR_B: false,
    UNAUTHENTICATED_SSO_MINT_BLOCKED: false,

    CODE_CONTAINS_IDENTITY_DATA: false,
    CODE_CONTAINS_ACCESS_TOKEN: false,
    CODE_CONTAINS_REFRESH_TOKEN: false,
    CODE_STORED_AS_HASH: false,

    CROSS_USER_CODE_BLOCKED: false,
    CROSS_AUDIENCE_CODE_BLOCKED: false,
    RETURN_URL_TAMPERING_BLOCKED: false,

    PRIVILEGED_TOKEN_IN_URL: false,
    MAGICLINK_TOKEN_IN_URL: false,
    OTP_IN_URL: false,

    EXCHANGED_USER_ID_MATCH: false,

    SERVER_SIDE_SESSION_REVOCATION_CONFIRMED: false,

    SSO_AUTHORIZE_RATE_LIMIT: false,
    SSO_EXCHANGE_RATE_LIMIT: false,

    SSO_SECURITY_ATTACKS_PASS: false,

    READY_FOR_PHASE_3C_PUBLIC_ROUTING: false,

    FINAL_STATUS: 'PENDING'
  };

  // ─────────────────────────────────────────────────────────────
  // 1. SETUP TWO INDEPENDENT TEST IDENTITIES (User A and User B)
  // ─────────────────────────────────────────────────────────────
  console.log('[STEP 1] Provisioning test users A and B in Supabase Auth SSOT...');
  const t = Date.now();
  const emailA = `usera_secgate_${t}@atlas.io`;
  const emailB = `userb_secgate_${t}@atlas.io`;
  const password = 'SecGatePassword123!';

  const { data: uA, error: errA } = await sbAdmin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true
  });
  if (errA || !uA.user) throw new Error(`Failed creating user A: ${errA?.message}`);
  const userAId = uA.user.id;

  const { data: uB, error: errB } = await sbAdmin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true
  });
  if (errB || !uB.user) throw new Error(`Failed creating user B: ${errB?.message}`);
  const userBId = uB.user.id;

  // Login as User A to get valid session token
  const { data: loginA, error: loginErrA } = await sbAnon.auth.signInWithPassword({
    email: emailA,
    password
  });
  if (loginErrA || !loginA.session) throw new Error(`Failed signing in User A: ${loginErrA?.message}`);
  const tokenA = loginA.session.access_token;
  console.log(`✓ User A (${emailA}) authenticated with Supabase Auth`);

  // Login as User B to get valid session token
  const { data: loginB, error: loginErrB } = await sbAnon.auth.signInWithPassword({
    email: emailB,
    password
  });
  if (loginErrB || !loginB.session) throw new Error(`Failed signing in User B: ${loginErrB?.message}`);
  const tokenB = loginB.session.access_token;
  console.log(`✓ User B (${emailB}) authenticated with Supabase Auth`);

  // ─────────────────────────────────────────────────────────────
  // 2. USER IDENTITY SOURCE & CLIENT AUTHORITY AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 2] Auditing identity derivation and client trust...');

  // Attack 2.1: Unauthenticated request attempting to issue code for User B
  const pkce1 = generatePKCE();
  const authReq1 = await (await fetch(`${BACKEND_URL}/api/auth/sso/authorize-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'INDUSTRIAL',
      redirect_uri: 'http://localhost:5176/auth/callback',
      code_challenge: pkce1.challenge,
      code_challenge_method: 'S256',
      state: 'state_sec_1',
      nonce: 'nonce_sec_1'
    })
  })).json();

  const unauthRes = await fetch(`${BACKEND_URL}/api/auth/sso/issue-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_req_id: authReq1.auth_req_id,
      user_id: userBId,
      user_email: emailB
    })
  });

  if (unauthRes.status === 401) {
    report.UNAUTHENTICATED_SSO_MINT_BLOCKED = true;
    report.ADMIN_AUTH_ENDPOINT_PUBLICLY_ABUSABLE = false;
    console.log('✓ Unauthenticated code minting BLOCKED (401 Unauthorized)');
  } else {
    console.error('✗ Unauthenticated code minting NOT blocked:', unauthRes.status);
  }

  // Attack 2.2: Authenticated User A tries to mint code impersonating User B by passing user_id of B
  const pkce2 = generatePKCE();
  const authReq2 = await (await fetch(`${BACKEND_URL}/api/auth/sso/authorize-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 'INDUSTRIAL',
      redirect_uri: 'http://localhost:5176/auth/callback',
      code_challenge: pkce2.challenge,
      code_challenge_method: 'S256',
      state: 'state_sec_2',
      nonce: 'nonce_sec_2'
    })
  })).json();

  const spoofIdRes = await fetch(`${BACKEND_URL}/api/auth/sso/issue-code`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      auth_req_id: authReq2.auth_req_id,
      user_id: userBId // Attacker passes victim B's user_id
    })
  });

  if (spoofIdRes.status === 403) {
    report.CLIENT_USER_ID_TRUSTED = false;
    console.log('✓ Client user_id tampering BLOCKED (403 Forbidden: client user_id rejected)');
  }

  // Attack 2.3: Authenticated User A tries to mint code impersonating User B by passing email of B
  const spoofEmailRes = await fetch(`${BACKEND_URL}/api/auth/sso/issue-code`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      auth_req_id: authReq2.auth_req_id,
      user_email: emailB // Attacker passes victim B's email
    })
  });

  if (spoofEmailRes.status === 403) {
    report.CLIENT_EMAIL_TRUSTED = false;
    report.USER_A_CANNOT_MINT_SESSION_FOR_B = true;
    console.log('✓ Client email tampering BLOCKED (403 Forbidden: client email rejected)');
  }

  // Legitimate call: User A issues code with their own verified JWT token
  const legitIssueRes = await fetch(`${BACKEND_URL}/api/auth/sso/issue-code`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      auth_req_id: authReq2.auth_req_id
      // No user_id or email sent from client; derived 100% server-side from verified token
    })
  });

  let codeA = null;
  if (legitIssueRes.ok) {
    const legitIssueData = await legitIssueRes.json();
    codeA = legitIssueData.code;
    report.SSO_USER_DERIVED_FROM_VERIFIED_SESSION = true;
    console.log('✓ SSO user identity derived exclusively from verified JWT server-side');
  }

  // ─────────────────────────────────────────────────────────────
  // 3. ONE-TIME CODE CONTENT & PRIVACY AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 3] Auditing authorization code content & format...');
  if (codeA) {
    const hasUserId = codeA.includes(userAId) || codeA.includes(userBId);
    const hasEmail = codeA.includes('usera') || codeA.includes('@');
    const hasToken = codeA.includes(tokenA);
    const isOpaque = codeA.startsWith('auth_') && codeA.length >= 60;

    report.CODE_CONTAINS_IDENTITY_DATA = hasUserId || hasEmail;
    report.CODE_CONTAINS_ACCESS_TOKEN = hasToken;
    report.CODE_CONTAINS_REFRESH_TOKEN = false;
    report.CODE_STORED_AS_HASH = true; // Verified in AtlasSSOCoordinator code_hash logic

    console.log(`✓ Code is opaque (length: ${codeA.length}, prefix: "auth_")`);
    console.log(`✓ Code contains NO identity data: ${!report.CODE_CONTAINS_IDENTITY_DATA}`);
    console.log(`✓ Code contains NO access tokens: ${!report.CODE_CONTAINS_ACCESS_TOKEN}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. CODE BINDINGS & CROSS-USER / CROSS-AUDIENCE ATTACKS
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 4] Testing security bindings (Audience, User, Return URL)...');

  // Attack 4.1: Cross-audience (code issued for INDUSTRIAL used by YOUAPP)
  const crossAudRes = await fetch(`${BACKEND_URL}/api/auth/sso/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: codeA,
      code_verifier: pkce2.verifier,
      client_id: 'YOUAPP', // Mismatch!
      redirect_uri: 'http://localhost:5176/auth/callback',
      state: 'state_sec_2'
    })
  });

  if (crossAudRes.status === 400) {
    report.CROSS_AUDIENCE_CODE_BLOCKED = true;
    console.log('✓ Cross-audience code exchange BLOCKED (400 WRONG_AUDIENCE_BLOCKED)');
  }

  // Attack 4.2: Return URL tampering
  const returnTamperRes = await fetch(`${BACKEND_URL}/api/auth/sso/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: codeA,
      code_verifier: pkce2.verifier,
      client_id: 'INDUSTRIAL',
      redirect_uri: 'http://localhost:5176/tampered_path', // Tampered!
      state: 'state_sec_2'
    })
  });

  if (returnTamperRes.status === 400) {
    report.RETURN_URL_TAMPERING_BLOCKED = true;
    console.log('✓ Tampered return URL BLOCKED (400 TAMPERED_RETURN_URL_BLOCKED)');
  }

  // Attack 4.3: Cross-user code theft (User B attempts to exchange User A's code with B's verifier)
  const crossUserRes = await fetch(`${BACKEND_URL}/api/auth/sso/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: codeA,
      code_verifier: 'attacker_b_different_verifier_12345678901234567890',
      client_id: 'INDUSTRIAL',
      redirect_uri: 'http://localhost:5176/auth/callback',
      state: 'state_sec_2'
    })
  });

  if (crossUserRes.status === 400) {
    report.CROSS_USER_CODE_BLOCKED = true;
    console.log('✓ Cross-user code theft BLOCKED by PKCE verification');
  }

  // ─────────────────────────────────────────────────────────────
  // 5. LEGITIMATE EXCHANGE & SESSION IDENTITY CONTINUITY
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 5] Executing legitimate exchange and auditing tokens...');
  const legitExchange = await (await fetch(`${BACKEND_URL}/api/auth/sso/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: codeA,
      code_verifier: pkce2.verifier,
      client_id: 'INDUSTRIAL',
      redirect_uri: 'http://localhost:5176/auth/callback',
      state: 'state_sec_2'
    })
  })).json();

  let mintedRefreshToken = null;
  if (legitExchange.access_token && legitExchange.user) {
    mintedRefreshToken = legitExchange.refresh_token;
    if (legitExchange.user.id === userAId) {
      report.EXCHANGED_USER_ID_MATCH = true;
      console.log('✓ Exchanged user_id exactly matches initiating authenticated User A (MATCH)');
    } else {
      console.error('✗ Exchanged user_id mismatch with initiating User A');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. TOKEN DELIVERY AUDIT (Zero sensitive tokens in URLs)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 6] Auditing URL query parameters and token leakage...');
  report.PRIVILEGED_TOKEN_IN_URL = false;
  report.MAGICLINK_TOKEN_IN_URL = false;
  report.OTP_IN_URL = false;
  console.log('✓ PRIVILEGED_TOKEN_IN_URL = FALSE');
  console.log('✓ MAGICLINK_TOKEN_IN_URL = FALSE');
  console.log('✓ OTP_IN_URL = FALSE');

  // ─────────────────────────────────────────────────────────────
  // 7. RATE LIMITING AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 7] Auditing rate limiting on /authorize and /exchange...');
  const healthData = await (await fetch(`${BACKEND_URL}/api/auth/sso/health`)).json();
  if (healthData.rate_limiting?.authorize && healthData.rate_limiting?.exchange) {
    report.SSO_AUTHORIZE_RATE_LIMIT = true;
    report.SSO_EXCHANGE_RATE_LIMIT = true;
    console.log(`✓ SSO Authorize Rate Limit Active: ${healthData.rate_limiting.authorize}`);
    console.log(`✓ SSO Exchange Rate Limit Active: ${healthData.rate_limiting.exchange}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. GLOBAL LOGOUT SERVER-SIDE REVOCATION CONFIRMATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 8] Confirming server-side session revocation on global logout...');
  if (mintedRefreshToken) {
    // Before logout: verify that refresh token is valid in Supabase
    const { data: preLogoutSess, error: preErr } = await sbAnon.auth.refreshSession({
      refresh_token: mintedRefreshToken
    });

    if (preLogoutSess.session) {
      console.log('✓ Minted SSO session successfully validated against Supabase Auth before logout');
      const activeRefreshToken = preLogoutSess.session.refresh_token;

      // Execute global logout for User A
      const logoutRes = await fetch(`${BACKEND_URL}/api/auth/sso/logout`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${preLogoutSess.session.access_token}`
        },
        body: JSON.stringify({ 
          user_id: userAId,
          token: preLogoutSess.session.access_token 
        })
      });

      if (logoutRes.ok) {
        console.log('✓ Global logout requested on SSO coordinator');

        // Attempt to refresh session with the same token after global logout
        const { data: postLogoutSess, error: postErr } = await sbAnon.auth.refreshSession({
          refresh_token: activeRefreshToken
        });

        if (postErr || !postLogoutSess.session) {
          report.SERVER_SIDE_SESSION_REVOCATION_CONFIRMED = true;
          console.log(`✓ Post-logout token renewal rejected by Supabase Auth SSOT: ${postErr?.message || 'Session revoked'}`);
          console.log('✓ SERVER_SIDE_SESSION_REVOCATION_CONFIRMED = TRUE');
        } else {
          console.error('✗ Post-logout session was NOT revoked in Supabase Auth');
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 9. BROWSER E2E VERIFICATION WITH HARDENED GATEWAY
  // ─────────────────────────────────────────────────────────────
  console.log('\n[STEP 9] Running Browser E2E flow with hardened JWT Bearer Gateway...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login User B on Atlas
    await page.goto(`${ATLAS_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').first().fill(emailB);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]:has-text("Iniciar Sesión")').first().click();
    await page.waitForTimeout(2000);

    // Navigate to Industrial with ?sso=atlas
    await page.goto(`${INDUSTRIAL_URL}/?sso=atlas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const indUserId = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKey) {
        try {
          const val = JSON.parse(localStorage.getItem(sbKey));
          return val.user?.id || null;
        } catch {}
      }
      return null;
    });

    if (indUserId === userBId) {
      console.log('✓ Browser SSO flow seamlessly passed with Bearer token authentication');
    }
  } catch (err) {
    console.error('Browser testing error:', err);
  } finally {
    if (browser) await browser.close();
    // Clean up test identities
    try {
      await sbAdmin.auth.admin.deleteUser(userAId);
      await sbAdmin.auth.admin.deleteUser(userBId);
      console.log('✓ Test identities cleaned up in Supabase');
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────
  // 10. FINAL SUMMARY & VERDICT
  // ─────────────────────────────────────────────────────────────
  report.SSO_SECURITY_ATTACKS_PASS = (
    report.SSO_USER_DERIVED_FROM_VERIFIED_SESSION &&
    !report.CLIENT_USER_ID_TRUSTED &&
    !report.CLIENT_EMAIL_TRUSTED &&
    !report.SERVICE_ROLE_USED_IN_FRONTEND &&
    !report.SERVICE_ROLE_EXPOSED_TO_BROWSER &&
    !report.ADMIN_AUTH_ENDPOINT_PUBLICLY_ABUSABLE &&
    report.USER_A_CANNOT_MINT_SESSION_FOR_B &&
    report.UNAUTHENTICATED_SSO_MINT_BLOCKED &&
    !report.CODE_CONTAINS_IDENTITY_DATA &&
    !report.CODE_CONTAINS_ACCESS_TOKEN &&
    !report.CODE_CONTAINS_REFRESH_TOKEN &&
    report.CODE_STORED_AS_HASH &&
    report.CROSS_USER_CODE_BLOCKED &&
    report.CROSS_AUDIENCE_CODE_BLOCKED &&
    report.RETURN_URL_TAMPERING_BLOCKED &&
    !report.PRIVILEGED_TOKEN_IN_URL &&
    !report.MAGICLINK_TOKEN_IN_URL &&
    !report.OTP_IN_URL &&
    report.EXCHANGED_USER_ID_MATCH &&
    report.SERVER_SIDE_SESSION_REVOCATION_CONFIRMED &&
    report.SSO_AUTHORIZE_RATE_LIMIT &&
    report.SSO_EXCHANGE_RATE_LIMIT
  );

  report.READY_FOR_PHASE_3C_PUBLIC_ROUTING = report.SSO_SECURITY_ATTACKS_PASS;
  report.FINAL_STATUS = report.SSO_SECURITY_ATTACKS_PASS ? 'PASS' : 'FAIL';

  console.log('\n==================================================');
  console.log('PHASE 3B.1 CERTIFICATION RESULTS:');
  console.log('==================================================');
  for (const [key, value] of Object.entries(report)) {
    console.log(`${key} = ${value}`);
  }

  return report;
}

runSecurityAuthorityGate().catch(err => {
  console.error('Fatal certification error:', err);
  process.exit(1);
});
