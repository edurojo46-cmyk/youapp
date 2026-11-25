/**
 * ATLAS LOCAL — NEUTRAL GEO MAP PROVIDER INTERFACE
 * 
 * Abstraction layer decoupling Atlas Local from vendor-specific map SDKs (Google Maps, Leaflet, Vector Canvas).
 * Atlas Local components interact EXCLUSIVELY with this interface.
 */

export const ATLAS_GEO_MAP_PROVIDER_VERSION = '1.0.0';

export interface MapCoordinates {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapMarkerOptions {
  position: MapCoordinates;
  title: string;
  category?: string;
  data?: any;
  icon?: string;
  badge?: string;
  label?: string;
  onClick?: (data: any) => void;
}

export interface MapMarkerInstance {
  getPosition(): MapCoordinates;
  setPosition(coords: MapCoordinates): void;
  setVisible(visible: boolean): void;
  remove(): void;
  data?: any;
}

export interface MapInstance {
  setCenter(coords: MapCoordinates): void;
  setZoom(zoom: number): void;
  fitBounds(bounds: MapBounds | MapCoordinates[]): void;
  addMarker(options: MapMarkerOptions): MapMarkerInstance;
  clearMarkers(): void;
  destroy(): void;
}

export interface AtlasGeoMapProvider {
  /**
   * Initializes and renders an interactive map inside the target DOM element.
   */
  renderMap(
    container: HTMLElement,
    options: {
      center: MapCoordinates;
      zoom: number;
      polygon?: [number, number][];
      onClick?: (coords: MapCoordinates) => void;
    }
  ): Promise<MapInstance>;

  /**
   * Resolves a physical address to lat/lng coordinates.
   */
  geocodeAddress(address: string): Promise<MapCoordinates | null>;

  /**
   * Fits map viewport to contain all specified boundaries or coordinates.
   */
  fitBounds(map: MapInstance, bounds: MapBounds | MapCoordinates[]): void;

  /**
   * Places an interactive marker pin on the map.
   */
  placeMarker(map: MapInstance, markerOptions: MapMarkerOptions): MapMarkerInstance;
}
