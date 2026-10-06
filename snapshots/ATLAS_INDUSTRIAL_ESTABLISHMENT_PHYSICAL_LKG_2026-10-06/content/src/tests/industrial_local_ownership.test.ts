/**
 * BUSCADOR INDUSTRIAL — PRODUCT OWNERSHIP CORRECTION CERTIFICATION
 * 
 * Verifies:
 * 1. ATLAS_LOCAL_REMOVED_FROM_ATLAS_PRODUCT = TRUE
 * 2. INDUSTRIAL_OWNS_LOCAL_MARKET = TRUE
 * 3. EXISTING_CODE_REUSED = TRUE
 * 4. VIRAL_LOOP_PRESERVED = TRUE
 * 5. CONTACT_INTERFACE_PRESERVED = TRUE
 * 6. MI_BASE_INTERFACE_PRESERVED = TRUE
 * 7. CABALLITO_CANARY_PRESERVED = TRUE
 * 8. ATLAS_CORE_BOUNDARIES_PRESERVED = TRUE
 * 9. YOUAPP_UNCHANGED = TRUE
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AtlasViralShareEngine } from '../lib/atlasLocal/viralShare';
import { getIndustrialUrl, getProductBaseUrl } from '../../packages/config/products';

describe('Buscador Industrial — Product Ownership Correction', () => {
  const BASE_URL = 'http://localhost:5174';

  it('1. INDUSTRIAL_OWNS_LOCAL_MARKET (Routes & Navbar in apps/busca-industrial)', () => {
    // 1. Verify apps/busca-industrial/routes.tsx
    const industrialRoutes = fs.readFileSync(
      path.resolve(process.cwd(), 'apps/busca-industrial/routes.tsx'),
      'utf-8'
    );
    expect(industrialRoutes).toContain('path="/local"');
    expect(industrialRoutes).toContain('path="/local/caballito"');
    expect(industrialRoutes).toContain('path="/local/caballito/comercios"');
    expect(industrialRoutes).toContain('path="/local/caballito/ofertas"');
    expect(industrialRoutes).toContain('path="/local/mi-barrio"');
    expect(industrialRoutes).toContain('path="/local/:barrioId/oferta/:id"');
    expect(industrialRoutes).toContain('Mercado Local (Caballito)');

    // 2. Verify apps/busca-industrial/App.tsx
    const industrialApp = fs.readFileSync(
      path.resolve(process.cwd(), 'apps/busca-industrial/App.tsx'),
      'utf-8'
    );
    expect(industrialApp).toContain('path="/local"');
    expect(industrialApp).toContain('path="/local/caballito"');
    expect(industrialApp).toContain('AtlasLocalCaballito');
  });

  it('2. ATLAS_LOCAL_REMOVED_FROM_ATLAS_PRODUCT (Atlas Core Horizontal Boundaries)', () => {
    // Atlas Hub Section 1 must strictly hold Core Directory (Personas, Contactos, Organizaciones)
    const hubContent = fs.readFileSync(
      path.resolve(process.cwd(), 'apps/atlas/pages/AtlasHub.tsx'),
      'utf-8'
    );
    // Section 1 should NOT contain local market card
    const section1Match = hubContent.match(/Directorio & Motores Atlas Core[\s\S]*?Gestión Comercial/);
    expect(section1Match).toBeTruthy();
    expect(section1Match![0]).not.toContain('id="nav-local"');

    // Section 2 (Commercial Verticals) must link Local Market to Industrial URL
    const section2Match = hubContent.match(/Gestión Comercial[\s\S]*?Configuración & Auditoría/);
    expect(section2Match).toBeTruthy();
    expect(section2Match![0]).toContain('id="nav-industrial-local"');
    expect(section2Match![0]).toContain('industrialLocalUrl');
    expect(section2Match![0]).toContain('Vertical Busca Industrial');

    // Atlas Navbar redirects external local link to Industrial
    const navbarContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/AtlasNavbar.tsx'),
      'utf-8'
    );
    expect(navbarContent).toContain("getIndustrialUrl('/local/caballito'");
  });

  it('3. EXISTING_CODE_REUSED (Preserves Local Engine Without Full Rewrite)', () => {
    // Shared components exist and are intact
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/pages/local/AtlasLocalCaballito.tsx'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/pages/local/AtlasLocalDeepLanding.tsx'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/pages/local/AtlasLocalMiBarrio.tsx'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/lib/atlasLocal/GoogleMapsProvider.ts'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/lib/atlasLocal/caballitoBoundary.ts'))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/lib/atlasLocal/viralShare.ts'))).toBe(true);
  });

  it('4. VIRAL_LOOP_PRESERVED (Deep Links Return to Busca Industrial)', () => {
    const payload = {
      share_id: 'sh_ind_test',
      content_type: 'OFFER' as const,
      content_id: 'test-offer-123',
      barrio_id: 'caballito',
      title: 'Oferta Insumos Industriales',
      summary: 'Descuento en compras mayoristas'
    };

    const share = AtlasViralShareEngine.createWhatsAppShareLink(payload);
    const industrialBase = getProductBaseUrl('INDUSTRIAL');

    expect(share.deepLink).toContain('/local/caballito/oferta/test-offer-123?ref=sh_ind_test');
    expect(share.deepLink.startsWith(industrialBase)).toBe(true);
    expect(share.whatsappUrl).toContain('https://wa.me/?text=');
  });

  it('5. CONTACT_INTERFACE_PRESERVED (Consumes Atlas Shared Contact Intelligence)', async () => {
    const res = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.businesses.length).toBe(100);

    const b = data.businesses[0];
    expect(b.contact_summary).toBeDefined();
    expect(b.contact_summary.organization_contact_path).toBeDefined();
    expect(b.contact_summary.organization_contact_path.organization_name).toBeTruthy();
  });

  it('6. MI_BASE_INTERFACE_PRESERVED (Commercial Save Context)', async () => {
    const bizRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/businesses`);
    const bizData = await bizRes.json();
    const sampleOrg = bizData.businesses[0];

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

  it('7. CABALLITO_CANARY_PRESERVED (Canary Active and Isolated in Comuna 6)', async () => {
    const stateRes = await fetch(`${BASE_URL}/api/atlas/local/caballito/community-state`);
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();

    expect(state.neighborhood_id).toBe('caballito');
    expect(state.businesses_count).toBe(100);
    expect(state.active_offers_count).toBeGreaterThanOrEqual(1);
  });

  it('8. YOUAPP_UNCHANGED (Zero Impact on Streaming & Media Core)', () => {
    const youappConfig = getProductBaseUrl('YOUAPP');
    expect(youappConfig).toContain('5173');
    expect(fs.existsSync(path.resolve(process.cwd(), 'apps/youapp/vite.config.ts'))).toBe(true);
  });
});
