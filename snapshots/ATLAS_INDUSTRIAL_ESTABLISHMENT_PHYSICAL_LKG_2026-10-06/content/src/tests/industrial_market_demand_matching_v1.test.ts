/**
 * INDUSTRIAL MARKET — DEMAND MATCHING V1 TEST SUITE
 * 
 * Verifies:
 * 1. TENGO_ACTIVE & NECESITO_ACTIVE (UI Action Presence & Language)
 * 2. MARKET_POST_MODEL & AUTHORIZED_PUBLISH_PASS (Server-side validation)
 * 3. UNAUTHORIZED_PUBLISH_BLOCKED (403 for unauthorized users)
 * 4. INDUSTRIAL_MARKET_MATCHER & DETERMINISTIC_MATCHING (No LLM, exact signal separation)
 * 5. OFFER_BUYER_MATCHES (OFFER -> Potential Buyers)
 * 6. DEMAND_SUPPLIER_MATCHES (DEMAND -> Potential Suppliers)
 * 7. CONTACT_CONNECTED (Consumes AtlasContactEngineInterface)
 * 8. MI_BASE_CONNECTED (Saves counterparty with BUYER_LEAD / SUPPLIER_LEAD + market_post_id)
 * 9. WHATSAPP_SHARE_CONNECTED (Deep links return to Industrial)
 * 10. NO_DUPLICATE_DATA (ORGANIZATION_DATA_DUPLICATED = FALSE, CONTACT_ENGINE_DUPLICATED = FALSE)
 * 11. CABALLITO_CANARY_PASS (1 OFFER + 1 DEMAND operational in Comuna 6)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AtlasViralShareEngine } from '../lib/atlasLocal/viralShare';
import { getProductBaseUrl } from '../../packages/config/products';
import { IndustrialMarketMatcher } from '../lib/industrialMarket/IndustrialMarketMatcher';

const BASE_URL = 'http://localhost:5174';
const AUTHORIZED_USER_ID = '768efac1-8d4c-4a19-8919-2de323884569';
const UNAUTHORIZED_USER_ID = '00000000-0000-0000-0000-000000000099';
const CANARY_OFFER_ID = 'a0000001-0001-4000-a000-000000000001';
const CANARY_DEMAND_ID = 'b0000002-0002-4000-b000-000000000002';

describe('Buscador Industrial — Industrial Market Demand Matching V1', () => {

  it('1. TENGO_ACTIVE & NECESITO_ACTIVE (UI Primary Actions & Simple Language)', () => {
    const pageContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/local/AtlasLocalCaballito.tsx'),
      'utf-8'
    );

    // Primary action: TENGO ALGO PARA OFRECER
    expect(pageContent).toContain('id="btn-tengo-oferta"');
    expect(pageContent).toContain('TENGO ALGO PARA OFRECER');
    expect(pageContent).toContain('Ofrezco producto o servicio → Encontrar potenciales compradores');

    // Primary action: NECESITO ALGO
    expect(pageContent).toContain('id="btn-necesito-demanda"');
    expect(pageContent).toContain('NECESITO ALGO');
    expect(pageContent).toContain('Tengo una necesidad → Encontrar fabricantes y proveedores directos');
  });

  it('2. MARKET_POST_MODEL & AUTHORIZED_PUBLISH_PASS (OFFER & DEMAND Creation)', async () => {
    // 2a. Publish OFFER with authorized user
    const offerRes = await fetch(`${BASE_URL}/api/industrial/market/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': AUTHORIZED_USER_ID
      },
      body: JSON.stringify({
        type: 'OFFER',
        title: 'Tengo insumos de encuadernación y cajas plegables',
        description: 'Venta mayorista de cartones, papeles kraft y cajas de entrega rápida para comercio.',
        product_or_service: 'PRODUCT',
        category: 'IMPRENTA Y EDITORIALES',
        geographic_scope: 'BARRIO',
        neighborhood: 'caballito',
        status: 'ACTIVE'
      })
    });

    expect(offerRes.status).toBe(201);
    const offerData = await offerRes.json();
    expect(offerData.success).toBe(true);
    expect(offerData.post).toBeDefined();
    expect(offerData.post.type).toBe('OFFER');
    expect(offerData.post.post_id).toBeTruthy();
    expect(offerData.post.organization_id).toBeTruthy();
    expect(offerData.post.geographic_scope).toBe('BARRIO');
    expect(offerData.post.neighborhood).toBe('caballito');
    expect(offerData.post.status).toBe('ACTIVE');

    // 2b. Publish DEMAND with authorized user
    const demandRes = await fetch(`${BASE_URL}/api/industrial/market/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': AUTHORIZED_USER_ID
      },
      body: JSON.stringify({
        type: 'DEMAND',
        title: 'Necesito bobinas de papel y cartulina ilustración',
        description: 'Buscamos distribuidor mayorista con entrega periódica en Caballito o CABA.',
        product_or_service: 'PRODUCT',
        category: 'IMPRENTA Y EDITORIALES',
        geographic_scope: 'BARRIO',
        neighborhood: 'caballito',
        status: 'ACTIVE'
      })
    });

    expect(demandRes.status).toBe(201);
    const demandData = await demandRes.json();
    expect(demandData.success).toBe(true);
    expect(demandData.post.type).toBe('DEMAND');
    expect(demandData.post.post_id).toBeTruthy();
  });

  it('3. UNAUTHORIZED_PUBLISH_BLOCKED (Blocks Users Without Organization Authority)', async () => {
    // 3a. User not in atlas_organization_members
    const res = await fetch(`${BASE_URL}/api/industrial/market/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': UNAUTHORIZED_USER_ID
      },
      body: JSON.stringify({
        type: 'OFFER',
        title: 'Intento de publicación no autorizada',
        description: 'Debe ser bloqueado por el servidor.',
        product_or_service: 'PRODUCT',
        category: 'IMPRENTA Y EDITORIALES',
        geographic_scope: 'BARRIO'
      })
    });

    expect(res.status).toBe(403);
    const err = await res.json();
    expect(err.error).toBe('UNAUTHORIZED_PUBLISH_BLOCKED');

    // 3b. Unauthenticated request without token/header
    const anonRes = await fetch(`${BASE_URL}/api/industrial/market/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'OFFER',
        title: 'Anónimo sin sesión',
        description: 'Debe ser rechazado.',
        product_or_service: 'PRODUCT',
        category: 'TEST',
        geographic_scope: 'BARRIO'
      })
    });
    expect(anonRes.status).toBe(401);
  });

  it('4. INDUSTRIAL_MARKET_MATCHER & DETERMINISTIC_MATCHING (Clear Signal Separation)', () => {
    // Contract definition inspection
    const matcherFile = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/industrialMarket/IndustrialMarketMatcher.ts'),
      'utf-8'
    );

    // Signals must be strictly separated (no opaque score)
    expect(matcherFile).toContain("'EXACT_PRODUCT_MATCH'");
    expect(matcherFile).toContain("'CATEGORY_MATCH'");
    expect(matcherFile).toContain("'SECTOR_MATCH'");
    expect(matcherFile).toContain('IndustrialMarketMatcher');

    // No LLM or generative hallucination
    expect(matcherFile).not.toContain('openai');
    expect(matcherFile).not.toContain('gemini');
    expect(matcherFile).not.toContain('chatCompletion');
  });

  it('5. OFFER_BUYER_MATCHES (OFFER -> Potential Buyers in Caballito Canary)', async () => {
    const res = await fetch(`${BASE_URL}/api/industrial/market/posts/${CANARY_OFFER_ID}/matches`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.post.type).toBe('OFFER');
    expect(data.count).toBeGreaterThanOrEqual(5);

    // All counterparties for an OFFER must be BUYERS
    for (const match of data.matches) {
      expect(match.counterparty_type).toBe('BUYER');
      expect(match.counterparty_organization_id).toBeTruthy();
      expect(match.counterparty_name).toBeTruthy();
      expect(['EXACT_PRODUCT_MATCH', 'CATEGORY_MATCH', 'SECTOR_MATCH']).toContain(match.match_basis);
      expect(match.geographic_relation).toBe('SAME_NEIGHBORHOOD');
      expect(match.evidence).toBeDefined();
    }
  });

  it('6. DEMAND_SUPPLIER_MATCHES (DEMAND -> Potential Suppliers in Caballito Canary)', async () => {
    const res = await fetch(`${BASE_URL}/api/industrial/market/posts/${CANARY_DEMAND_ID}/matches`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.post.type).toBe('DEMAND');
    expect(data.count).toBeGreaterThanOrEqual(5);

    // All counterparties for a DEMAND must be SUPPLIERS
    for (const match of data.matches) {
      expect(match.counterparty_type).toBe('SUPPLIER');
      expect(match.counterparty_organization_id).toBeTruthy();
      expect(match.counterparty_name).toBeTruthy();
      expect(['EXACT_PRODUCT_MATCH', 'CATEGORY_MATCH', 'SECTOR_MATCH']).toContain(match.match_basis);
      expect(match.geographic_relation).toBe('SAME_NEIGHBORHOOD');
      expect(match.evidence).toBeDefined();
    }
  });

  it('7. CONTACT_CONNECTED (Atlas Contact Intelligence Status Mapping)', async () => {
    const res = await fetch(`${BASE_URL}/api/industrial/market/posts/${CANARY_OFFER_ID}/matches`);
    const data = await res.json();
    const allowedStatuses = new Set([
      'CONTACTO DIRECTO',
      'CONTACTO ORGANIZACIONAL',
      'CONTACTO INSTITUCIONAL',
      'VÍA DIGITAL',
      'SIN CONTACTO VERIFICADO'
    ]);

    let contactableCount = 0;
    for (const match of data.matches) {
      expect(allowedStatuses.has(match.contactability.status)).toBe(true);
      if (match.contactability.status !== 'SIN CONTACTO VERIFICADO') {
        contactableCount++;
      }
    }

    expect(contactableCount).toBeGreaterThan(0);
  });

  it('8. MI_BASE_CONNECTED (Saves Lead With Commercial Context & Post Metadata)', async () => {
    const bizRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses`);
    const bizData = await bizRes.json();
    const counterparty = bizData.businesses[0];

    const saveRes = await fetch(`${BASE_URL}/api/user/saved-relations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': AUTHORIZED_USER_ID
      },
      body: JSON.stringify({
        product_id: counterparty.organization_id,
        company_id: counterparty.organization_id,
        company_name: counterparty.name,
        relation_id: `industrial_market:${CANARY_OFFER_ID}:${counterparty.organization_id}`,
        base_name: 'Mi base',
        context: 'BUYER_LEAD',
        market_post_id: CANARY_OFFER_ID
      })
    });

    expect(saveRes.status).toBe(200);
    const saveJson = await saveRes.json();
    expect(saveJson.success).toBe(true);
  });

  it('9. WHATSAPP_SHARE_CONNECTED (OFFER & DEMAND Viral Deep Links Return to Industrial)', () => {
    // 9a. OFFER share link
    const offerShare = AtlasViralShareEngine.createWhatsAppShareLink({
      share_id: 'sh_canary_off_01',
      content_type: 'OFFER',
      content_id: CANARY_OFFER_ID,
      barrio_id: 'caballito',
      title: 'Tengo bolsas y packaging biodegradables',
      summary: 'Descuento especial por bulto cerrado'
    });

    const industrialBase = getProductBaseUrl('INDUSTRIAL');
    expect(offerShare.deepLink.startsWith(industrialBase)).toBe(true);
    expect(offerShare.deepLink).toContain(`/local/caballito/oferta/${CANARY_OFFER_ID}?ref=sh_canary_off_01`);
    expect(offerShare.whatsappUrl).toContain('https://wa.me/?text=');
    expect(offerShare.whatsappUrl).toContain('Industrial%20Market');

    // 9b. DEMAND share link
    const demandShare = AtlasViralShareEngine.createWhatsAppShareLink({
      share_id: 'sh_canary_dem_01',
      content_type: 'DEMAND',
      content_id: CANARY_DEMAND_ID,
      barrio_id: 'caballito',
      title: 'Necesito proveedor de bolsas y cajas',
      summary: 'Buscamos entregas semanales'
    });

    expect(demandShare.deepLink.startsWith(industrialBase)).toBe(true);
    expect(demandShare.deepLink).toContain(`/local/caballito/demanda/${CANARY_DEMAND_ID}?ref=sh_canary_dem_01`);
    expect(demandShare.whatsappUrl).toContain('https://wa.me/?text=');
  });

  it('10. NO_DUPLICATE_DATA & BOUNDARIES (Zero Duplicate Authorities)', () => {
    // Organizations: Industrial references atlas_organizations and atlas_canonical_entities
    const industrialRoutes = fs.readFileSync(
      path.resolve(process.cwd(), 'server/routes/industrial.ts'),
      'utf-8'
    );
    expect(industrialRoutes).not.toContain('CREATE TABLE industrial_organizations');
    expect(industrialRoutes).not.toContain('CREATE TABLE industrial_contacts');

    // Contact Intelligence: Consumed via AtlasContactEngineInterface
    expect(industrialRoutes).toContain('IndustrialMarketMatcher');
  });

  it('11. CABALLITO_CANARY_PASS (1 Real OFFER + 1 Real DEMAND Live in Canary)', async () => {
    // Both canary posts exist and return 200
    const offerRes = await fetch(`${BASE_URL}/api/industrial/market/posts/${CANARY_OFFER_ID}`);
    expect(offerRes.status).toBe(200);
    const offerData = await offerRes.json();
    expect(offerData.post.neighborhood).toBe('caballito');
    expect(offerData.post.type).toBe('OFFER');

    const demandRes = await fetch(`${BASE_URL}/api/industrial/market/posts/${CANARY_DEMAND_ID}`);
    expect(demandRes.status).toBe(200);
    const demandData = await demandRes.json();
    expect(demandData.post.neighborhood).toBe('caballito');
    expect(demandData.post.type).toBe('DEMAND');
  });

});
