/**
 * ATLAS LOCAL — VIRAL COMMUNITY LOOP V1 CERTIFICATION
 * CABALLITO CANARY TEST SUITE
 * 
 * Invariants:
 * 1. WHATSAPP = Distribution Channel ONLY.
 * 2. ATLAS LOCAL = Community Host.
 * 3. NO WhatsApp groups, zero spam outreach, zero paid ads.
 * 4. Share Attribution: anonymous tokens only (?ref={share_id}), NO private user data.
 * 5. First-party events ONLY: SHARE_CREATED, SHARE_CLICKED, CONTENT_VIEWED, BARRIO_FOLLOWED, RESHARED.
 * 6. Public Landing: content accessible without login. Login required strictly when attempting to follow.
 * 7. Reshare: recursive parent_share_id enables viral chain depth tracking without identifying recipients.
 * 8. Real community state counters: zero fabricated numbers.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AtlasViralShareEngine } from '../lib/atlasLocal/viralShare';

describe('Atlas Local — Viral Community Loop V1 (Caballito Canary)', () => {
  const BASE_URL = 'http://localhost:5174';
  const testUserId = '00000000-0000-0000-0000-000000000001';
  let sampleBusinessId = '';
  let sampleOfferId = '';

  beforeAll(async () => {
    // 1. Fetch a real verified Caballito business
    const bRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses`);
    expect(bRes.status).toBe(200);
    const bData = await bRes.json();
    expect(bData.businesses.length).toBeGreaterThan(0);
    sampleBusinessId = bData.businesses[0].organization_id;

    // 2. Fetch or create a real active Caballito offer
    const oRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`);
    expect(oRes.status).toBe(200);
    const oData = await oRes.json();
    if (oData.offers.length > 0) {
      sampleOfferId = oData.offers[0].offer_id;
    } else {
      const createRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'auth_merchant_caballito'
        },
        body: JSON.stringify({
          organization_id: sampleBusinessId,
          title: 'Canary Test Offer',
          description: 'Descuento especial vecinal',
          price_text: '$5.000'
        })
      });
      const cData = await createRes.json();
      sampleOfferId = cData.offer.offer_id;
    }
  });

  it('1. WHATSAPP SHARE E2E & CLEAN DEEPLINK (NO PRIVATE DATA)', () => {
    const payload = {
      share_id: 'sh_canary_001',
      content_type: 'OFFER' as const,
      content_id: sampleOfferId,
      barrio_id: 'caballito',
      organization_id: sampleBusinessId,
      title: 'Descuento Vecinos Caballito',
      summary: 'Promoción exclusiva en comercio barrial'
    };

    const result = AtlasViralShareEngine.createWhatsAppShareLink(payload);

    // Verify WhatsApp external distribution URL
    expect(result.whatsappUrl).toContain('https://wa.me/?text=');
    expect(result.whatsappUrl).toContain(encodeURIComponent(result.deepLink));

    // Verify Deep link format: /local/{barrio}/{tipo}/{id}?ref={share_id}
    expect(result.deepLink).toContain(`/local/caballito/oferta/${sampleOfferId}?ref=sh_canary_001`);

    // Invariant: ZERO private personal data in URL (no email, no phone numbers, no user IDs)
    expect(result.deepLink).not.toMatch(/@/); // No emails
    expect(result.deepLink).not.toMatch(/[?&](?:phone|tel|celular|user_id|email|token)=/i); // No sensitive query params
    expect(result.deepLink).not.toMatch(/(?:\+54|549\d{9,10})/); // No Argentine phone strings
    expect(result.deepLink).not.toContain('name=');
  });

  it('2. PUBLIC CONTENT ACCESSIBLE WITHOUT LOGIN (GUEST/VISITOR)', async () => {
    // Visitor arrives directly from WhatsApp deep link: NO auth headers provided
    const offerRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/oferta/${sampleOfferId}`);
    expect(offerRes.status).toBe(200);
    const offerData = await offerRes.json();
    expect(offerData.offer.offer_id).toBe(sampleOfferId);
    expect(offerData.offer.title).toBeDefined();

    const busRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/comercio/${sampleBusinessId}`);
    expect(busRes.status).toBe(200);
    const busData = await busRes.json();
    expect(busData.business.organization_id).toBe(sampleBusinessId);
    expect(busData.business.is_verified_in_polygon).toBe(true);
  });

  it('3. FIRST-PARTY SHARE ATTRIBUTION & CLICK TRACKING', async () => {
    const shareId = `sh_test_${Date.now()}`;

    // 1. Merchant or User creates a share
    const shareRes = await fetch(`${BASE_URL}/api/atlas/local/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_id: shareId,
        content_type: 'OFFER',
        content_id: sampleOfferId,
        barrio_id: 'caballito',
        organization_id: sampleBusinessId
      })
    });
    expect(shareRes.status).toBe(201);
    const shareData = await shareRes.json();
    expect(shareData.success).toBe(true);
    expect(shareData.deep_link).toContain(`?ref=${shareId}`);

    // 2. Recipient clicks the link (records SHARE_CLICKED first-party event)
    const clickRes = await fetch(`${BASE_URL}/api/atlas/local/share/${shareId}`);
    expect(clickRes.status).toBe(200);
    const clickData = await clickRes.json();
    expect(clickData.share.share_id).toBe(shareId);
    expect(clickData.share.content_id).toBe(sampleOfferId);

    // 3. Visitor views content (records CONTENT_VIEWED first-party event)
    const viewRes = await fetch(`${BASE_URL}/api/atlas/local/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'CONTENT_VIEWED',
        share_id: shareId,
        barrio_id: 'caballito',
        content_type: 'OFFER',
        content_id: sampleOfferId
      })
    });
    expect(viewRes.status).toBe(201);
  });

  it('4. FOLLOW BARRIO: LOGIN REQUIRED ONLY FOR FOLLOW MUTATION', async () => {
    // 1. Unauthenticated request must return 401
    const unauthRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    expect(unauthRes.status).toBe(401);
    const unauthData = await unauthRes.json();
    expect(unauthData.error).toBe('LOGIN_REQUIRED_FOR_FOLLOW');

    // 2. Authenticated user can follow
    const authRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/follow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': testUserId
      },
      body: JSON.stringify({})
    });
    expect(authRes.status).toBe(200);
    const authData = await authRes.json();
    expect(authData.success).toBe(true);
    expect(typeof authData.is_following).toBe('boolean');

    // Follow status check
    const statusRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/follow-status`, {
      headers: {
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': testUserId
      }
    });
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.is_following).toBe(authData.is_following);
  });

  it('5. COMMUNITY STATE: REAL METRICS AND COUNTERS (ZERO FAKE SEEDS)', async () => {
    const stateRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/community-state`);
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();

    expect(state.neighborhood_id).toBe('caballito');
    expect(typeof state.followers_count).toBe('number');
    expect(state.followers_count).toBeGreaterThanOrEqual(0);
    expect(state.businesses_count).toBe(100); // 100 verified businesses in Caballito polygon
    expect(state.active_offers_count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(state.recent_activity)).toBe(true);
  });

  it('6. MI BARRIO: MINIMAL CITIZEN VIEW (NO SOCIAL FEED, NO COMMENTS, NO CHAT)', async () => {
    const miBarrioRes = await fetch(`${BASE_URL}/api/atlas/local/mi-barrio`, {
      headers: {
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': testUserId
      }
    });
    expect(miBarrioRes.status).toBe(200);
    const miBarrioData = await miBarrioRes.json();

    expect(miBarrioData.followed_barrios).toContain('caballito');
    expect(Array.isArray(miBarrioData.recent_offers)).toBe(true);
    expect(Array.isArray(miBarrioData.featured_businesses)).toBe(true);

    // Verify route definition exists in router
    const routesContent = fs.readFileSync(path.resolve(process.cwd(), 'apps/atlas/routes.tsx'), 'utf-8');
    expect(routesContent).toContain('path="/local/mi-barrio"');
    expect(routesContent).toContain('AtlasLocalMiBarrio');
  });

  it('7. RESHARE & VIRAL CHAIN DEPTH RECURSION', async () => {
    const gen1ShareId = `sh_gen1_${Date.now()}`;
    const gen2ShareId = `sh_gen2_${Date.now()}`;
    const gen3ShareId = `sh_gen3_${Date.now()}`;

    // Gen 1: Original share
    await fetch(`${BASE_URL}/api/atlas/local/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_id: gen1ShareId,
        content_type: 'OFFER',
        content_id: sampleOfferId,
        barrio_id: 'caballito',
        parent_share_id: null
      })
    });

    // Gen 2: Visitor reshares (parent_share_id = gen1ShareId)
    await fetch(`${BASE_URL}/api/atlas/local/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_id: gen2ShareId,
        content_type: 'OFFER',
        content_id: sampleOfferId,
        barrio_id: 'caballito',
        parent_share_id: gen1ShareId
      })
    });

    // Gen 3: Second visitor reshares (parent_share_id = gen2ShareId)
    await fetch(`${BASE_URL}/api/atlas/local/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_id: gen3ShareId,
        content_type: 'OFFER',
        content_id: sampleOfferId,
        barrio_id: 'caballito',
        parent_share_id: gen2ShareId
      })
    });

    // Check viral metrics and recursive chain depth
    const metricsRes = await fetch(`${BASE_URL}/api/atlas/local/viral-metrics`);
    expect(metricsRes.status).toBe(200);
    const metrics = await metricsRes.json();

    expect(metrics.WHATSAPP_SHARES).toBeGreaterThanOrEqual(3);
    expect(metrics.RESHARES).toBeGreaterThanOrEqual(2);
    expect(metrics.VIRAL_CHAIN_DEPTH).toBeGreaterThanOrEqual(3);
    expect(typeof metrics.CLICK_PER_SHARE).toBe('number');
    expect(typeof metrics.FOLLOW_PER_VISITOR).toBe('number');
    expect(typeof metrics.RESHARE_RATE).toBe('number');
  });

  it('8. B2B VIRAL MECHANISM (OPPORTUNITY -> INDUSTRIAL -> CONTACT)', async () => {
    const b2bShareId = `sh_b2b_${Date.now()}`;
    const shareRes = await fetch(`${BASE_URL}/api/atlas/local/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_id: b2bShareId,
        content_type: 'B2B_OPPORTUNITY',
        content_id: 'caballito-industrial-suppliers',
        barrio_id: 'caballito',
        organization_id: sampleBusinessId
      })
    });
    expect(shareRes.status).toBe(201);
    const shareData = await shareRes.json();
    expect(shareData.deep_link).toContain('/local/caballito/oportunidad/caballito-industrial-suppliers');
  });
});
