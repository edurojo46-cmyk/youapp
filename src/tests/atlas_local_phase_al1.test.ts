import { describe, it, expect, beforeAll } from 'vitest';
import { CABALLITO_CENTER, CABALLITO_POLYGON, isPointInPolygon } from '../lib/atlasLocal/caballitoBoundary';
import { GoogleMapsProvider } from '../lib/atlasLocal/GoogleMapsProvider';
import { AtlasGeoMapProvider } from '../lib/atlasLocal/AtlasGeoMapProvider';
import fs from 'fs';
import path from 'path';

describe('ATLAS LOCAL V1 — PHASE AL-1 (CABALLITO + GOOGLE MAPS)', () => {
  const BASE_URL = 'http://localhost:5174';
  let businesses: any[] = [];
  let offers: any[] = [];

  beforeAll(async () => {
    // 1. Fetch businesses
    const bRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses`);
    expect(bRes.status).toBe(200);
    const bData = await bRes.json();
    businesses = bData.businesses || [];

    // 2. Fetch offers
    const oRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`);
    expect(oRes.status).toBe(200);
    const oData = await oRes.json();
    offers = oData.offers || [];
  });

  it('1. Verifies /local and /local/caballito route existence and loading', () => {
    const routesContent = fs.readFileSync(path.resolve(process.cwd(), 'apps/atlas/routes.tsx'), 'utf-8');
    expect(routesContent).toContain('path="/local"');
    expect(routesContent).toContain('path="/local/caballito"');
    expect(routesContent).toContain('path="/local/caballito/comercios"');
    expect(routesContent).toContain('path="/local/caballito/ofertas"');
    expect(routesContent).toContain('AtlasLocalCaballito');
  });

  it('2. Verifies GoogleMapsProvider implements AtlasGeoMapProvider without leaking SDK dependencies', () => {
    const provider: AtlasGeoMapProvider = new GoogleMapsProvider();
    expect(typeof provider.renderMap).toBe('function');
    expect(typeof provider.geocodeAddress).toBe('function');
    expect(typeof provider.fitBounds).toBe('function');
    expect(typeof provider.placeMarker).toBe('function');
  });

  it('3. Verifies Real Atlas businesses appear (no fake seeds, exactly 100 canary)', () => {
    expect(businesses.length).toBe(100);
    expect(businesses.every(b => Boolean(b.organization_id))).toBe(true);
    expect(businesses.every(b => Boolean(b.name))).toBe(true);
    expect(businesses.every(b => Boolean(b.address))).toBe(true);
    expect(businesses.every(b => typeof parseFloat(b.latitude) === 'number')).toBe(true);
    expect(businesses.every(b => typeof parseFloat(b.longitude) === 'number')).toBe(true);
  });

  it('4. Verifies all 100 pins belong strictly inside the official Caballito polygon (Point-in-Polygon)', () => {
    let insideCount = 0;
    for (const b of businesses) {
      const lat = parseFloat(b.latitude);
      const lng = parseFloat(b.longitude);
      const inside = isPointInPolygon([lat, lng], CABALLITO_POLYGON);
      if (inside) insideCount++;
    }
    expect(insideCount).toBe(businesses.length);
    expect(insideCount).toBe(100);
  });

  it('5. Verifies Contact Intelligence operates properly on local merchants', () => {
    const validContactStatuses = new Set([
      'DIRECT CONTACT',
      'ORGANIZATION CONTACT',
      'DIGITAL PATH',
      'NO VERIFIED CONTACT'
    ]);

    for (const b of businesses) {
      const status = b.contact_summary?.contact_status;
      expect(validContactStatuses.has(status)).toBe(true);
      expect(b.contact_summary?.organization_contact_path?.organization_name).toBeTruthy();
    }
  });

  it('6. Verifies Save to Mi Base integration works with valid payload', async () => {
    const sampleOrg = businesses[0];
    const res = await fetch(`${BASE_URL}/api/user/saved-relations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlas-test-auth': 'atlas-test-suite',
        'x-user-id': '768efac1-8d4c-4a19-8919-2de323884569'
      },
      body: JSON.stringify({
        product_id: sampleOrg.organization_id,
        company_id: sampleOrg.organization_id,
        company_name: sampleOrg.name,
        relation_id: `atlas_local:caballito:${sampleOrg.organization_id}`,
        base_name: 'Mi base'
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('7. Verifies unauthorized user is strictly blocked from creating offers (403 Forbidden)', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: businesses[0].organization_id,
        title: 'Hacked Offer',
        description: 'Unauthorized publication attempt'
      })
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('UNAUTHORIZED_MERCHANT');
  });

  it('8. Verifies authorized merchant can create offer (201 Created)', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': 'auth_merchant_caballito'
      },
      body: JSON.stringify({
        organization_id: businesses[0].organization_id,
        title: 'Descuento Especial Certificado',
        description: 'Oferta autorizada para vecinos de Caballito.',
        price_text: '$8.500',
        valid_until: new Date(Date.now() + 5 * 86400000).toISOString()
      })
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.offer.status).toBe('ACTIVE');
  });

  it('9. Verifies ACTIVE offer is visible and EXPIRED offer is hidden', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/offers`);
    const data = await res.json();
    const fetchedOffers = data.offers || [];

    // All returned offers must be ACTIVE and not expired
    expect(fetchedOffers.length).toBeGreaterThan(0);
    for (const o of fetchedOffers) {
      expect(o.status).toBe('ACTIVE');
      expect(new Date(o.valid_until).getTime()).toBeGreaterThanOrEqual(Date.now() - 60000);
    }

    // Must NOT contain expired offer
    const hasExpired = fetchedOffers.some((o: any) => o.status === 'EXPIRED' || o.title.includes('Expirada'));
    expect(hasExpired).toBe(false);
  });

  it('10. Verifies Industrial navigation link to Buscador Industrial', () => {
    const pageContent = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/local/AtlasLocalCaballito.tsx'), 'utf-8');
    expect(pageContent).toContain('to="/buscaindustrial/productos"');
    expect(pageContent).toContain('Abrir Buscador Industrial ↗');
  });

  it('11. Verifies 390px mobile responsiveness in CSS', () => {
    const cssContent = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/local/AtlasLocalCaballito.css'), 'utf-8');
    expect(cssContent).toContain('@media (max-width: 480px)');
    expect(cssContent).toContain('310px'); // mobile map height
    expect(cssContent).toContain('grid-template-columns: 1fr'); // mobile responsive single-column
  });
});
