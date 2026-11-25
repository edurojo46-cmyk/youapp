// @vitest-environment jsdom
/**
 * ATLAS LOCAL — MAP & LOCAL DISCOVERY V1 CERTIFICATION
 * CABALLITO CANARY TEST SUITE
 * 
 * Verifies:
 * 1. REAL_BUSINESSES_TESTED = 100
 * 2. BUSINESSES_ON_MAP = 100
 * 3. ALL_INSIDE_CABALLITO = TRUE (Point-in-Polygon Comuna 6)
 * 4. MAP_RENDER_PASS = TRUE (AtlasGeoMapProvider -> GoogleMapsProvider)
 * 5. LOCAL_SEARCH_PASS = TRUE (In-place filter on Organization/Products)
 * 6. CONTACT_PASS = TRUE (Contact Intelligence integration)
 * 7. MI_BASE_PASS = TRUE (Save to Mi Base)
 * 8. WHATSAPP_SHARE_FROM_MAP_PASS = TRUE (Anonymous tracked deep link)
 * 9. MOBILE_390_PASS = TRUE (Mobile responsive viewport)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CABALLITO_CENTER, CABALLITO_POLYGON, isPointInPolygon } from '../lib/atlasLocal/caballitoBoundary';
import { GoogleMapsProvider } from '../lib/atlasLocal/GoogleMapsProvider';
import { AtlasViralShareEngine } from '../lib/atlasLocal/viralShare';
import fs from 'fs';
import path from 'path';

describe('Atlas Local — Map & Local Discovery V1 (Caballito Only)', () => {
  const BASE_URL = 'http://localhost:5174';
  let businesses: any[] = [];

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses`);
    expect(res.status).toBe(200);
    const data = await res.json();
    businesses = data.businesses || [];
  });

  it('1. REAL_BUSINESSES_TESTED & NO DUPLICATES (100 Real Atlas Organizations)', () => {
    expect(businesses.length).toBe(100);

    const orgIds = new Set(businesses.map(b => b.organization_id));
    expect(orgIds.size).toBe(100); // Zero duplicate organizations

    for (const b of businesses) {
      expect(b.name).toBeTruthy();
      expect(b.address).toBeTruthy();
      expect(b.category).toBeTruthy();
      expect(b.industry).toBeTruthy();
      expect(b.is_verified_in_polygon).toBe(true);
    }
  });

  it('2. BUSINESSES_ON_MAP (100 Pins Ready for Map Placement)', () => {
    let pinCount = 0;
    for (const b of businesses) {
      const lat = parseFloat(b.latitude);
      const lng = parseFloat(b.longitude);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
      pinCount++;
    }
    expect(pinCount).toBe(100);
  });

  it('3. ALL_INSIDE_CABALLITO (100% Inside Official Comuna 6 Polygon)', () => {
    let insideCount = 0;
    for (const b of businesses) {
      const lat = parseFloat(b.latitude);
      const lng = parseFloat(b.longitude);
      const inside = isPointInPolygon([lat, lng], CABALLITO_POLYGON);
      if (inside) insideCount++;
    }
    expect(insideCount).toBe(100);
    expect(insideCount).toBe(businesses.length);
  });

  it('4. MAP_RENDER_PASS (Decoupled Provider Renders Without Leaking SDK)', async () => {
    const provider = new GoogleMapsProvider();
    expect(typeof provider.renderMap).toBe('function');
    expect(typeof provider.geocodeAddress).toBe('function');
    expect(typeof provider.fitBounds).toBe('function');
    expect(typeof provider.placeMarker).toBe('function');

    // Test map instantiation
    const container = document.createElement('div');
    const map = await provider.renderMap(container, {
      center: CABALLITO_CENTER,
      zoom: 14,
      polygon: CABALLITO_POLYGON
    });

    expect(map).toBeDefined();
    expect(typeof map.addMarker).toBe('function');
    expect(typeof map.setCenter).toBe('function');
    expect(typeof map.fitBounds).toBe('function');
    expect(typeof map.clearMarkers).toBe('function');

    // Add marker test
    const marker = provider.placeMarker(map, {
      position: { lat: parseFloat(businesses[0].latitude), lng: parseFloat(businesses[0].longitude) },
      title: businesses[0].name
    });
    expect(marker).toBeDefined();
    expect(typeof marker.getPosition).toBe('function');
    map.destroy();
  });

  it('5. LOCAL_SEARCH_PASS (In-place Search Over Existing Organization & Products)', async () => {
    // 1. Search for imprenta
    const imprentaRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses?q=imprenta`);
    expect(imprentaRes.status).toBe(200);
    const imprentaData = await imprentaRes.json();
    expect(imprentaData.businesses.length).toBeGreaterThan(0);
    for (const b of imprentaData.businesses) {
      const text = `${b.name} ${b.category} ${b.industry} ${JSON.stringify(b.products)}`.toLowerCase();
      expect(text).toContain('imprenta');
    }

    // 2. Search for alimentos
    const alimentosRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses?q=alimentos`);
    expect(alimentosRes.status).toBe(200);
    const alimentosData = await alimentosRes.json();
    expect(alimentosData.businesses.length).toBeGreaterThan(0);
  });

  it('6. CONTACT_PASS (Contact Intelligence Fields Verified)', () => {
    const validContactStatuses = new Set([
      'DIRECT CONTACT',
      'ORGANIZATION CONTACT',
      'DIGITAL PATH',
      'NO VERIFIED CONTACT'
    ]);

    for (const b of businesses) {
      expect(validContactStatuses.has(b.contact_summary?.contact_status)).toBe(true);
      expect(b.contact_summary?.organization_contact_path?.organization_name).toBeTruthy();
    }
  });

  it('7. MI_BASE_PASS (Save Business to Mi Base CRM)', async () => {
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
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('8. WHATSAPP_SHARE_FROM_MAP_PASS (Clean Attributed Deep Link)', () => {
    const sampleOrg = businesses[0];
    const { whatsappUrl, deepLink } = AtlasViralShareEngine.createWhatsAppShareLink({
      share_id: 'sh_map_pin_001',
      content_type: 'BUSINESS',
      content_id: sampleOrg.organization_id,
      barrio_id: 'caballito',
      organization_id: sampleOrg.organization_id,
      title: sampleOrg.name,
      summary: `${sampleOrg.category} • ${sampleOrg.address}`
    });

    expect(whatsappUrl).toContain('https://wa.me/?text=');
    expect(deepLink).toContain(`/local/caballito/comercio/${sampleOrg.organization_id}?ref=sh_map_pin_001`);
    expect(deepLink).not.toMatch(/@/);
    expect(deepLink).not.toMatch(/[?&](?:phone|tel|email)=/i);
  });

  it('9. MOBILE_390_PASS (Responsive Styles at 390px Viewport)', () => {
    const cssContent = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/local/AtlasLocalCaballito.css'), 'utf-8');
    expect(cssContent).toContain('@media (max-width: 480px)');
    expect(cssContent).toContain('310px'); // Mobile map canvas height
    expect(cssContent).toContain('grid-template-columns: 1fr'); // Mobile 1-col layout
  });
});
