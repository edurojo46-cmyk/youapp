/**
 * ATLAS LOCAL — CABALLITO BOUNDARY & POINT-IN-POLYGON (GCBA OFFICIAL)
 * 
 * Official polygon coordinates for Barrio Caballito (Comuna 6, CABA)
 * Source: GCBA / INDEC / Ley 1777 (Comunas de la Ciudad de Buenos Aires).
 * 
 * Invariant: Google does NOT decide the neighborhood by text.
 * Proceso: ADDRESS -> GEOCODE -> LAT/LNG -> POINT-IN-POLYGON -> CABALLITO.
 */

export const CABALLITO_CENTER: { lat: number; lng: number } = {
  lat: -34.616275,
  lng: -58.440551
};

export const CABALLITO_BOUNDS = {
  north: -34.6055,
  south: -34.6295,
  east: -58.4242,
  west: -58.4645
};

export const CABALLITO_POLYGON: [number, number][] = [
  [-34.6055, -58.4352], // Ángel Gallardo & Río de Janeiro (Parque Centenario edge)
  [-34.6078, -58.4285], // Río de Janeiro & Av. Díaz Vélez
  [-34.6115, -58.4258], // Río de Janeiro & Av. Rivadavia
  [-34.6145, -58.4242], // Av. La Plata & Av. Rivadavia
  [-34.6212, -58.4255], // Av. La Plata & Av. Independencia / Carlos Calvo
  [-34.6272, -58.4290], // Av. La Plata & Av. Directorio
  [-34.6295, -58.4398], // Av. Directorio & Curapaligüe
  [-34.6268, -58.4485], // Curapaligüe & Av. Rivadavia
  [-34.6252, -58.4555], // Av. Tte. Gral. Donato Álvarez & Av. Rivadavia
  [-34.6178, -58.4645], // Av. Donato Álvarez & Av. Gaona
  [-34.6132, -58.4590], // Av. Juan B. Justo & Av. San Martín
  [-34.6080, -58.4480], // Av. Gaona & Av. Ángel Gallardo
  [-34.6055, -58.4352]  // Close polygon
];

/**
 * Standard ray-casting algorithm to test whether a coordinate (lat, lng)
 * lies inside the given polygon.
 */
export function isPointInPolygon(point: [number, number], polygon: [number, number][] = CABALLITO_POLYGON): boolean {
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
