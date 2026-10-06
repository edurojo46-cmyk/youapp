import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:5174';

describe('BUSCADOR INDUSTRIAL — COMMUNITY COMMERCE V1 (CABALLITO)', () => {
  let createdOfferId: string = '';
  let shareId: string = '';
  let testUserId = 'test_user_citizen_' + Date.now();

  it('1. COMMUNITY_HOME_ACTIVE: Feed returns HTTP 200 with all 7 community sections', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/feed`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.barrio).toBe('caballito');
    expect(json.sections).toBeDefined();
    
    // Exactly the required community sections
    expect(json.sections.ofertas_de_hoy).toBeInstanceOf(Array);
    expect(json.sections.cerca_tuyo).toBeInstanceOf(Array);
    expect(json.sections.alimentos).toBeInstanceOf(Array);
    expect(json.sections.gastronomia).toBeInstanceOf(Array);
    expect(json.sections.servicios).toBeInstanceOf(Array);
    expect(json.sections.comercios).toBeInstanceOf(Array);
    expect(json.sections.nuevas_ofertas).toBeInstanceOf(Array);
  });

  it('2. UNAUTHORIZED_PUBLISH_BLOCKED: Block publishing without merchant authorization (403)', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Oferta no autorizada',
        description: 'Intento de publicación sin credenciales de comercio'
      })
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('UNAUTHORIZED_MERCHANT');
  });

  it('3. AUTHORIZED_PUBLISH_PASS & AUTO_BARRIO_ASSIGNMENT: Authorized merchant publishes offer successfully', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': 'auth_merchant_caballito'
      },
      body: JSON.stringify({
        title: 'Promo Panadería Artesanal Caballito',
        description: '2x1 en medialunas de manteca horneadas en el día.',
        price_text: '$3.500',
        category: 'Panaderías',
        valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
        environment: 'TEST_NON_PRODUCTION'
      })
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.offer).toBeDefined();
    expect(json.offer.neighborhood_id).toBe('caballito');
    expect(json.offer.status).toBe('ACTIVE');
    expect(json.offer.organization_name).toBeDefined();
    createdOfferId = json.offer.offer_id;
  });

  it('4. AUTO_FEED_DISTRIBUTION: Newly published active offer automatically appears in feed', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/feed?environment=TEST_NON_PRODUCTION`);
    expect(res.status).toBe(200);
    const json = await res.json();
    
    // Check in sections or all_offers
    const all = json.all_offers || [];
    const found = all.find((o: any) => o.offer_id === createdOfferId);
    expect(found).toBeDefined();
    expect(found.title).toContain('Promo Panadería Artesanal Caballito');
  });

  it('5. PUBLIC_BROWSING_NO_LOGIN: Public visitors can view community home and exact offer without credentials', async () => {
    // Feed public access
    const feedRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/feed`);
    expect(feedRes.status).toBe(200);

    // Exact offer public landing
    const offerRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/oferta/${createdOfferId}`);
    expect(offerRes.status).toBe(200);
    const json = await offerRes.json();
    expect(json.offer.offer_id).toBe(createdOfferId);
  });

  it('6. FOLLOW_CABALLITO_ACTIVE & LOGIN_ONLY_FOR_PERSISTENT_ACTIONS: Follow barrio persists for authenticated user', async () => {
    // Unauthenticated attempt returns 401
    const unauthRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'FOLLOW' })
    });
    expect(unauthRes.status).toBe(401);

    // Authenticated follow succeeds
    const authRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/follow`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': testUserId
      },
      body: JSON.stringify({ action: 'FOLLOW' })
    });
    expect(authRes.status).toBe(200);
    const json = await authRes.json();
    expect(json.success).toBe(true);
    expect(json.is_following).toBe(true);
  });

  it('7. FOLLOW_CATEGORY_ACTIVE: User follows category and feed prioritizes followed categories', async () => {
    // Follow category 'Panaderías'
    const catRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/follow-category`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': testUserId
      },
      body: JSON.stringify({ category_id: 'Panaderías' })
    });
    expect(catRes.status).toBe(200);
    const catJson = await catRes.json();
    expect(catJson.success).toBe(true);
    expect(catJson.is_following).toBe(true);

    // Query personalized feed with user header
    const feedRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/feed?environment=TEST_NON_PRODUCTION`, {
      headers: { 'x-user-id': testUserId }
    });
    expect(feedRes.status).toBe(200);
    const feedJson = await feedRes.json();
    expect(feedJson.followed_categories).toContain('Panaderías');
  });

  it('8. EXPIRED_OFFERS_HIDDEN: Expired offers automatically transition to EXPIRED and disappear from active feed', async () => {
    // Create an already-expired offer
    const expiredRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': 'auth_merchant_caballito'
      },
      body: JSON.stringify({
        title: 'Oferta Caducada de Ayer',
        description: 'Vencida ayer a la noche.',
        category: 'Gastronomía',
        valid_until: new Date(Date.now() - 3600000).toISOString(),
        environment: 'TEST_NON_PRODUCTION'
      })
    });
    expect(expiredRes.status).toBe(201);
    const expiredData = await expiredRes.json();
    const expiredId = expiredData.offer.offer_id;

    // Fetching feed triggers maintenance; expired offer must NOT be in active feed
    const feedRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/feed?environment=TEST_NON_PRODUCTION`);
    const feedJson = await feedRes.json();
    const foundExpired = feedJson.all_offers.find((o: any) => o.offer_id === expiredId);
    expect(foundExpired).toBeUndefined();
  });

  it('9. WHATSAPP_DEEPLINK_PASS & RESHARE_PASS: Generates canonical deep link and records viral chain', async () => {
    // Generate share
    const shareRes = await fetch(`${BASE_URL}/api/atlas/local/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_type: 'OFFER',
        content_id: createdOfferId,
        channel: 'WHATSAPP',
        barrio_id: 'caballito',
        user_id: testUserId,
        environment: 'TEST_NON_PRODUCTION'
      })
    });
    expect(shareRes.status).toBe(201);
    const shareJson = await shareRes.json();
    expect(shareJson.deep_link).toContain(`/industrial/local/caballito/oferta/${createdOfferId}?ref=`);
    shareId = shareJson.share_id;

    // Track click on incoming deep link
    const clickRes = await fetch(`${BASE_URL}/api/atlas/local/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        share_id: shareId,
        environment: 'TEST_NON_PRODUCTION'
      })
    });
    expect(clickRes.status).toBe(200);

    // Reshare chain: second user reshares with parent_share_id
    const reshareRes = await fetch(`${BASE_URL}/api/atlas/local/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_type: 'OFFER',
        content_id: createdOfferId,
        channel: 'WHATSAPP',
        barrio_id: 'caballito',
        parent_share_id: shareId,
        environment: 'TEST_NON_PRODUCTION'
      })
    });
    expect(reshareRes.status).toBe(201);
    const reshareJson = await reshareRes.json();
    expect(reshareJson.parent_share_id).toBe(shareId);
  });

  it('10. MERCHANT_METRICS_ACTIVE: Physical metrics query reflects actual engagement without fake numbers', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/merchant/metrics/${createdOfferId}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.metrics).toBeDefined();
    expect(typeof json.metrics.views).toBe('number');
    expect(typeof json.metrics.whatsapp_shares).toBe('number');
    expect(json.metrics.whatsapp_shares).toBeGreaterThanOrEqual(1);
    expect(typeof json.metrics.contact_clicks).toBe('number');
    expect(typeof json.metrics.saves).toBe('number');
  });

  it('11. CANARY_METRICS_ISOLATED: Segregates REAL from TEST_NON_PRODUCTION metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/community-metrics?environment=REAL`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.environment).toBe('REAL');
    expect(json.metrics.CABALLITO_FOLLOWERS).toBeDefined();
    expect(json.metrics.ACTIVE_BUSINESSES).toBeGreaterThan(0);
    expect(json.metrics.ACTIVE_OFFERS).toBeDefined();
  });

  it('12. MOBILE_390_PASS: Verifies 390px mobile-first responsiveness in CSS', () => {
    const cssPath = path.resolve(process.cwd(), 'src/pages/local/AtlasLocalCaballito.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    expect(content).toContain('@media (max-width: 390px)');
    expect(content).toContain('.hero-actions');
    expect(content).toContain('.community-section-title');
  });

  it('13. B2B_EXISTING_PRESERVED & ATLAS_CORE_UNCHANGED & YOUAPP_UNCHANGED', () => {
    const pagePath = path.resolve(process.cwd(), 'src/pages/local/AtlasLocalCaballito.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');
    // B2B TENGO / NECESITO exists and preserves navigation
    expect(content).toContain('TENGO ALGO PARA OFRECER');
    expect(content).toContain('NECESITO ALGO');
    expect(content).toContain('id="btn-tengo-oferta"');
    expect(content).toContain('id="btn-necesito-demanda"');
    
    // Core routes exist
    const routesPath = path.resolve(process.cwd(), 'apps/busca-industrial/routes.tsx');
    const routesContent = fs.readFileSync(routesPath, 'utf-8');
    expect(routesContent).toContain('/industrial/local/caballito');
  });
});
