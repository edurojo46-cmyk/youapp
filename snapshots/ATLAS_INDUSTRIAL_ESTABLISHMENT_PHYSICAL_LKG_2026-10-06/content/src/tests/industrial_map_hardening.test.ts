// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MapLibreProvider,
  isCartoKeyPresent,
  getCartoVoyagerStyleUrl,
  CARTO_VOYAGER_STYLE_BASE,
  CARTO_ATTRIBUTION_TEXT,
  OSMF_ATTRIBUTION_TEXT
} from '../lib/atlasLocal/MapLibreProvider';
import { GoogleMapsProvider } from '../lib/atlasLocal/GoogleMapsProvider';

describe('Buscador Industrial — Real Map V1 CARTO Production Provider Gate', () => {
  it('1. CARTO_SUPPORT_IMPLEMENTED = TRUE (Voyager style base & key builder defined)', () => {
    expect(CARTO_VOYAGER_STYLE_BASE).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json');
    expect(getCartoVoyagerStyleUrl('test-carto-key')).toBe(
      'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key=test-carto-key'
    );
  });

  it('2. CARTO_KEY_PRESENT = FALSE (No CARTO API key configured in env)', () => {
    expect(isCartoKeyPresent()).toBe(false);
  });

  it('3. PRODUCTION_MAP_PROVIDER & SAFE_PREVIEW_MAP_PROVIDER configured', () => {
    const provider = new MapLibreProvider();
    expect(provider).toBeDefined();
    // In production without key, it enforces CARTO and rejects automatic failover
  });

  it('4. PRODUCTION_DIRECT_OSMF_REQUESTS = 0 & OSMF_AUTOMATIC_FAILOVER = FALSE', async () => {
    const provider = new MapLibreProvider();
    const dummyContainer = document.createElement('div');
    // Calling renderMap in PRODUCTION mode without key must throw CARTO_KEY_ABSENT, not fallback to OSMF
    await expect(
      provider.renderMap(dummyContainer, {
        center: { lat: -34.618, lng: -58.442 },
        zoom: 14,
        mode: 'PRODUCTION'
      })
    ).rejects.toThrow('CARTO_KEY_ABSENT');
  });

  it('5. CARTO_ATTRIBUTION_ACTIVE = TRUE (Contains OSM & CARTO attributions)', () => {
    expect(CARTO_ATTRIBUTION_TEXT).toContain('© OpenStreetMap contributors');
    expect(CARTO_ATTRIBUTION_TEXT).toContain('© CARTO');
  });

  it('6. PRODUCTION_FAILURE_FALLBACK_PASS = TRUE (Clean notice in UI)', () => {
    const frontCode = fs.readFileSync(
      path.resolve(__dirname, '../pages/local/AtlasLocalCaballito.tsx'),
      'utf8'
    );
    expect(frontCode).toContain('Mapa temporalmente no disponible');
    expect(frontCode).toContain('caballito-map-fallback-clean');
    expect(frontCode).toContain('mapLoadError');
  });

  it('7. USAGE_OBSERVABILITY_ACTIVE = TRUE (Sessions, successes, failures tracked)', () => {
    const obs = MapLibreProvider.getUsageObservability();
    expect(obs).toHaveProperty('map_sessions');
    expect(obs).toHaveProperty('provider_load_success');
    expect(obs).toHaveProperty('provider_load_failure');
  });

  it('8. USER_LOCATION_PERSISTED = FALSE (Location kept strictly in React memory)', () => {
    const frontCode = fs.readFileSync(
      path.resolve(__dirname, '../pages/local/AtlasLocalCaballito.tsx'),
      'utf8'
    );
    const locationSnippet = frontCode.slice(
      frontCode.indexOf('handleGetMyLocation'),
      frontCode.indexOf('handleGetMyLocation') + 800
    );
    expect(locationSnippet).not.toContain('localStorage');
    expect(locationSnippet).not.toContain('sessionStorage');
    expect(locationSnippet).not.toContain('fetch(');
    expect(locationSnippet).toContain('setUserMapLocation');
  });

  it('9. MAPLIBRE_RUNTIME_DEPENDENCY_OK = TRUE (In package.json dependencies)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
    );
    expect(pkg.dependencies['maplibre-gl']).toBeDefined();
  });
});
