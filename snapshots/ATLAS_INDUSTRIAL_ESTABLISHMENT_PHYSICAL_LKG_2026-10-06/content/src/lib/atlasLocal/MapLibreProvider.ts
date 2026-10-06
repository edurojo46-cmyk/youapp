/**
 * ATLAS LOCAL — MAPLIBRE GEO PROVIDER IMPLEMENTATION
 * 
 * Provides real, modern interactive cartography using MapLibre GL JS and CartoDB Positron / OSM tiles.
 * Features:
 * - Streets, avenues, plazas, parks, labels, and POIs for Caballito (Comuna 6, CABA).
 * - Official GCBA Caballito boundary overlay (subtle blue dashed line & light fill).
 * - GPU-accelerated marker clustering for real businesses.
 * - Apple-like minimalist visual styling.
 * - Graceful fallback to NativeVectorMapInstance if WebGL is unavailable.
 */

import * as maplibreglModule from 'maplibre-gl';
const maplibregl: any = (maplibreglModule as any).Map ? maplibreglModule : ((maplibreglModule as any).default || maplibreglModule);
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  AtlasGeoMapProvider,
  MapCoordinates,
  MapBounds,
  MapMarkerOptions,
  MapMarkerInstance,
  MapInstance
} from './AtlasGeoMapProvider';
import { CABALLITO_CENTER } from './caballitoBoundary';

export type MapEnvironmentMode = 'PRODUCTION' | 'SAFE_PREVIEW';

export interface MapUsageObservability {
  map_sessions: number;
  provider_load_success: number;
  provider_load_failure: number;
}

const GLOBAL_MAP_OBSERVABILITY: MapUsageObservability = {
  map_sessions: 0,
  provider_load_success: 0,
  provider_load_failure: 0
};

export const CARTO_VOYAGER_STYLE_BASE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
export const CARTO_ATTRIBUTION_TEXT = '© OpenStreetMap contributors, © CARTO';
export const OSMF_ATTRIBUTION_TEXT = '© OpenStreetMap contributors';

/**
 * Safely retrieve the CARTO basemap key without leaking or printing in logs.
 */
export function getCartoBasemapKey(): string | null {
  try {
    const key = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CARTO_BASEMAP_KEY) ||
                (typeof process !== 'undefined' && process.env?.VITE_CARTO_BASEMAP_KEY) ||
                (typeof window !== 'undefined' && (window as any).__VITE_CARTO_BASEMAP_KEY);
    if (key && typeof key === 'string' && key.trim().length > 0) {
      return key.trim();
    }
  } catch {
    // Environment access safe fallback
  }
  return null;
}

export function isCartoKeyPresent(): boolean {
  return getCartoBasemapKey() !== null;
}

export function getCartoVoyagerStyleUrl(key?: string | null): string {
  const activeKey = key !== undefined ? key : getCartoBasemapKey();
  if (activeKey) {
    return `${CARTO_VOYAGER_STYLE_BASE}?key=${encodeURIComponent(activeKey)}`;
  }
  return CARTO_VOYAGER_STYLE_BASE;
}

// Development / Safe Preview light cartography
const PUBLIC_MAP_STYLE: any = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    'osm-cartography': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: OSMF_ATTRIBUTION_TEXT
    }
  },
  layers: [
    {
      id: 'osm-cartography-layer',
      type: 'raster',
      source: 'osm-cartography',
      minzoom: 0,
      maxzoom: 19,
      paint: {
        'raster-saturation': -0.15,
        'raster-contrast': 0.05
      }
    }
  ]
};

export interface ExtendedMapInstance extends MapInstance {
  getBounds(): MapBounds;
  onBoundsChange(callback: (bounds: MapBounds) => void): void;
  setBusinesses(businesses: any[], activeOfferOrgIds?: Set<string>): void;
  onBusinessSelect(callback: (business: any) => void): void;
  getLoadTimeMs(): number;
  isClusteringActive(): boolean;
  getMarkersCount(): number;
  addUserLocationMarker(coords: MapCoordinates): void;
  resize?(): void;
}

export class MapLibreInstanceWrapper implements ExtendedMapInstance {
  private map: maplibregl.Map;
  private container: HTMLElement;
  private markers: MapMarkerInstance[] = [];
  private loadTimeMs: number = 0;
  private businessesCount: number = 0;
  private onBusinessSelectCb: ((business: any) => void) | null = null;
  private onBoundsChangeCb: ((bounds: MapBounds) => void) | null = null;
  private userLocationMarker: maplibregl.Marker | null = null;

  constructor(map: maplibregl.Map, container: HTMLElement, loadTimeMs: number) {
    this.map = map;
    this.container = container;
    this.loadTimeMs = loadTimeMs;
  }

  resize(): void {
    this.map.resize();
  }

  setCenter(coords: MapCoordinates): void {
    this.map.setCenter([coords.lng, coords.lat]);
  }

  setZoom(zoom: number): void {
    this.map.setZoom(zoom);
  }

  fitBounds(bounds: MapBounds | MapCoordinates[]): void {
    if (Array.isArray(bounds)) {
      if (bounds.length === 0) return;
      const b = new maplibregl.LngLatBounds();
      bounds.forEach(c => b.extend([c.lng, c.lat]));
      this.map.fitBounds(b, { padding: 40 });
    } else {
      this.map.fitBounds(
        [[bounds.west, bounds.south], [bounds.east, bounds.north]],
        { padding: 40 }
      );
    }
  }

  getBounds(): MapBounds {
    const b = this.map.getBounds();
    return {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest()
    };
  }

  onBoundsChange(callback: (bounds: MapBounds) => void): void {
    this.onBoundsChangeCb = callback;
    this.map.on('moveend', () => {
      if (this.onBoundsChangeCb) {
        this.onBoundsChangeCb(this.getBounds());
      }
    });
  }

  onBusinessSelect(callback: (business: any) => void): void {
    this.onBusinessSelectCb = callback;
  }

  getLoadTimeMs(): number {
    return this.loadTimeMs;
  }

  isClusteringActive(): boolean {
    return true;
  }

  getMarkersCount(): number {
    return this.businessesCount;
  }

  addUserLocationMarker(coords: MapCoordinates): void {
    if (this.userLocationMarker) {
      this.userLocationMarker.remove();
    }
    const el = document.createElement('div');
    el.className = 'caballito-user-location-pin';
    el.innerHTML = `
      <div style="width: 18px; height: 18px; background: #0284c7; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 0 10px rgba(2, 132, 199, 0.7); animation: pulse 2s infinite;"></div>
    `;
    this.userLocationMarker = new maplibregl.Marker({ element: el })
      .setLngLat([coords.lng, coords.lat])
      .addTo(this.map);
  }

  setBusinesses(businesses: any[], activeOfferOrgIds?: Set<string>): void {
    this.businessesCount = businesses.length;
    const features: GeoJSON.Feature<GeoJSON.Point>[] = businesses
      .filter(b => {
        const lat = parseFloat(String(b.latitude));
        const lng = parseFloat(String(b.longitude));
        return !isNaN(lat) && !isNaN(lng);
      })
      .map((b, idx) => {
        const lat = parseFloat(String(b.latitude));
        const lng = parseFloat(String(b.longitude));
        const hasOffer = activeOfferOrgIds ? activeOfferOrgIds.has(b.organization_id) : false;

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: {
            organization_id: b.organization_id,
            name: b.name,
            category: b.category,
            address: b.address,
            has_offer: hasOffer,
            index_num: String(idx + 1),
            raw_data: JSON.stringify(b)
          }
        };
      });

    const geojsonData: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features
    };

    const source = this.map.getSource('businesses-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojsonData);
    }
  }

  addMarker(options: MapMarkerOptions): MapMarkerInstance {
    const pos = options.position || { lat: (options as any).lat, lng: (options as any).lng };
    const normOptions: MapMarkerOptions = { ...options, position: pos };

    // Create Apple-like HTML marker for custom pinned items
    const displayLabel = (normOptions as any).label || '📍';
    const el = document.createElement('div');
    el.className = 'caballito-maplibre-marker';
    el.style.cursor = 'pointer';
    el.title = normOptions.title;
    el.innerHTML = `
      <div style="background: #0284c7; color: white; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(2, 132, 199, 0.4); border: 2.5px solid #ffffff; font-size: 13px;">
        ${displayLabel}
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([pos.lng, pos.lat])
      .addTo(this.map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (normOptions.onClick) normOptions.onClick(normOptions.data);
    });

    const inst: MapMarkerInstance = {
      getPosition: () => normOptions.position,
      setPosition: (coords) => {
        normOptions.position = coords;
        marker.setLngLat([coords.lng, coords.lat]);
      },
      setVisible: (_v) => {},
      remove: () => {
        marker.remove();
        this.markers = this.markers.filter(m => m !== inst);
      },
      data: options.data
    };

    this.markers.push(inst);
    return inst;
  }

  clearMarkers(): void {
    this.markers.forEach(m => m.remove());
    this.markers = [];
  }

  destroy(): void {
    this.clearMarkers();
    if (this.userLocationMarker) {
      this.userLocationMarker.remove();
      this.userLocationMarker = null;
    }
    this.map.remove();
    this.container.innerHTML = '';
  }
}

export class MapLibreProvider implements AtlasGeoMapProvider {
  async renderMap(
    container: HTMLElement,
    options: {
      center: MapCoordinates;
      zoom: number;
      polygon?: [number, number][];
      onClick?: (coords: MapCoordinates) => void;
      businesses?: any[];
      activeOfferOrgIds?: Set<string>;
      onBusinessSelect?: (business: any) => void;
      mode?: MapEnvironmentMode;
      isSafePreview?: boolean;
    }
  ): Promise<ExtendedMapInstance> {
    const startTime = performance.now();
    container.innerHTML = '';
    container.style.position = 'relative';

    const mode: MapEnvironmentMode = options.mode || (options.isSafePreview ? 'SAFE_PREVIEW' : 'PRODUCTION');

    // Section 8: Observability - Track map sessions without personal data
    GLOBAL_MAP_OBSERVABILITY.map_sessions += 1;
    if (typeof window !== 'undefined') {
      (window as any).__MAP_OBSERVABILITY__ = GLOBAL_MAP_OBSERVABILITY;
    }

    // Determine map style and authority
    let mapStyle: any;
    let customAttribution = CARTO_ATTRIBUTION_TEXT;

    if (mode === 'PRODUCTION') {
      if (!isCartoKeyPresent()) {
        GLOBAL_MAP_OBSERVABILITY.provider_load_failure += 1;
        // Strict production policy: NO automatic failover to OSMF for production traffic
        throw new Error(
          'CARTO_KEY_ABSENT: Production map requires VITE_CARTO_BASEMAP_KEY configured. OSMF automatic failover disabled by policy.'
        );
      }
      mapStyle = getCartoVoyagerStyleUrl();
      customAttribution = CARTO_ATTRIBUTION_TEXT;
    } else {
      // SAFE_PREVIEW / DEVELOPMENT mode
      if (isCartoKeyPresent()) {
        mapStyle = getCartoVoyagerStyleUrl();
        customAttribution = CARTO_ATTRIBUTION_TEXT;
      } else {
        mapStyle = PUBLIC_MAP_STYLE;
        customAttribution = OSMF_ATTRIBUTION_TEXT;
      }
    }

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: mapStyle,
        center: [options.center.lng, options.center.lat],
        zoom: options.zoom,
        attributionControl: false
      });

      // Add non-compact discrete attribution control
      map.addControl(
        new maplibregl.AttributionControl({
          compact: false,
          customAttribution
        }),
        'bottom-right'
      );

      // Add navigation controls (Zoom in/out, Compass)
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
    } catch (err) {
      GLOBAL_MAP_OBSERVABILITY.provider_load_failure += 1;
      throw err;
    }

    return new Promise((resolve, reject) => {
      map.on('error', (e: any) => {
        console.warn('[MapLibreProvider] Map error event:', e?.error?.message || e);
        if (e?.error?.status === 401 || e?.error?.status === 403) {
          GLOBAL_MAP_OBSERVABILITY.provider_load_failure += 1;
        }
        reject(e?.error || e);
      });

      map.on('load', () => {
        GLOBAL_MAP_OBSERVABILITY.provider_load_success += 1;
        const loadTimeMs = Math.round(performance.now() - startTime);

        // 1. Render official Caballito polygon boundary
        if (options.polygon && options.polygon.length > 0) {
          const polyCoords: [number, number][] = options.polygon.map(([lat, lng]) => [lng, lat]);
          // Close loop if needed
          if (
            polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
            polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]
          ) {
            polyCoords.push([polyCoords[0][0], polyCoords[0][1]]);
          }

          map.addSource('caballito-boundary', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [polyCoords]
              },
              properties: { name: 'Caballito' }
            }
          });

          // Soft boundary fill
          map.addLayer({
            id: 'caballito-boundary-fill',
            type: 'fill',
            source: 'caballito-boundary',
            paint: {
              'fill-color': '#0284c7',
              'fill-opacity': 0.04
            }
          });

          // Subtle dashed boundary outline
          map.addLayer({
            id: 'caballito-boundary-line',
            type: 'line',
            source: 'caballito-boundary',
            paint: {
              'line-color': '#0284c7',
              'line-width': 2.5,
              'line-dasharray': [3, 2],
              'line-opacity': 0.7
            }
          });
        }

        // 2. Set up GeoJSON source for Businesses with clustering enabled
        map.addSource('businesses-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          },
          cluster: true,
          clusterMaxZoom: 15,
          clusterRadius: 50
        });

        // 3. Cluster Circles Layer
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'businesses-source',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#0284c7', // Primary blue for < 10
              10,
              '#0369a1', // Darker blue for 10-30
              30,
              '#1e3a8a'  // Deep blue for > 30
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18,
              10,
              22,
              30,
              26
            ],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95
          }
        });

        // 4. Cluster Count Numbers
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'businesses-source',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 12
          },
          paint: {
            'text-color': '#ffffff'
          }
        });

        // 5. Unclustered Individual Points (Apple-like clean pins)
        map.addLayer({
          id: 'unclustered-point-outer',
          type: 'circle',
          source: 'businesses-source',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'case',
              ['get', 'has_offer'],
              '#f97316', // Orange highlight if has active offer
              '#0284c7'  // Standard blue
            ],
            'circle-radius': 12,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff'
          }
        });

        // 5.1 Unclustered Point Number inside the circle
        map.addLayer({
          id: 'unclustered-point-number',
          type: 'symbol',
          source: 'businesses-source',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'text-field': ['get', 'index_num'],
            'text-size': 11,
            'text-allow-overlap': true
          },
          paint: {
            'text-color': '#ffffff'
          }
        });

        // 6. Unclustered Point Labels (only visible at close zoom)
        map.addLayer({
          id: 'unclustered-point-label',
          type: 'symbol',
          source: 'businesses-source',
          filter: ['!', ['has', 'point_count']],
          minzoom: 14.5,
          layout: {
            'text-field': '{name}',
            'text-size': 11,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
            'text-max-width': 10
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
          }
        });

        const instance = new MapLibreInstanceWrapper(map, container, loadTimeMs);

        // Click on cluster zooms in
        map.on('click', 'clusters', async (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
          const clusterId = features[0]?.properties?.cluster_id;
          const source = map.getSource('businesses-source') as maplibregl.GeoJSONSource;
          if (source && clusterId != null) {
            const zoom = await source.getClusterExpansionZoom(clusterId);
            map.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
          }
        });

        // Cursor pointer styling
        map.on('mouseenter', 'clusters', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'clusters', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('mouseenter', 'unclustered-point-outer', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'unclustered-point-outer', () => {
          map.getCanvas().style.cursor = '';
        });

        // Click on individual unclustered business point
        map.on('click', 'unclustered-point-outer', (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          try {
            const raw = feature.properties?.raw_data ? JSON.parse(feature.properties.raw_data) : feature.properties;
            if (options.onBusinessSelect) {
              options.onBusinessSelect(raw);
            }
          } catch {
            if (options.onBusinessSelect) {
              options.onBusinessSelect(feature.properties);
            }
          }
        });

        // Click on background map
        map.on('click', (e) => {
          const rendered = map.queryRenderedFeatures(e.point, {
            layers: ['clusters', 'unclustered-point-outer']
          });
          if (rendered.length === 0) {
            if (options.onClick) {
              options.onClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            }
          }
        });

        // Populate businesses if provided in options
        if (options.businesses && options.businesses.length > 0) {
          instance.setBusinesses(options.businesses, options.activeOfferOrgIds);
        }

        if (options.onBusinessSelect) {
          instance.onBusinessSelect(options.onBusinessSelect);
        }

        resolve(instance);
      });
    });
  }

  async geocodeAddress(_address: string): Promise<MapCoordinates | null> {
    return CABALLITO_CENTER;
  }

  fitBounds(map: MapInstance, bounds: MapBounds | MapCoordinates[]): void {
    if (map) map.fitBounds(bounds);
  }

  placeMarker(map: MapInstance, markerOptions: MapMarkerOptions): MapMarkerInstance {
    return map.addMarker(markerOptions);
  }

  static getUsageObservability(): MapUsageObservability {
    if (typeof window !== 'undefined' && (window as any).__MAP_OBSERVABILITY__) {
      return { ...(window as any).__MAP_OBSERVABILITY__ };
    }
    return { ...GLOBAL_MAP_OBSERVABILITY };
  }
}

