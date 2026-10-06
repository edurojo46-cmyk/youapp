import fetch from 'node-fetch';
import { GeorefLocalCache } from './GeorefLocalCache';

export type GeoRelationType = 
  | 'WORKS_AT' 
  | 'PRACTICES_AT' 
  | 'COMMERCIAL_ACTIVITY_AT' 
  | 'ROLE_AT' 
  | 'ORGANIZATION_LOCATED_AT';

export type GeoPrecision = 'EXACT_DOOR' | 'BLOCK' | 'STREET' | 'NEIGHBORHOOD' | 'COMUNA' | 'CITY' | 'CAMPUS';

export interface AtlasGeoResolvedLocation {
  raw_input: string;
  normalized_address: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string | null;
  comuna: string | null;
  comuna_id: string | null;
  city: string;
  province: string;
  precision: GeoPrecision;
  geo_source: 'GEOREF_ARGENTINA' | 'LOCAL_CABA_INDEX';
  confidence: number;
  relation_type: GeoRelationType;
  observed_at: string;
}

// Authoritative mapping of CABA Comunas to Barrios (GCBA / INDEC official)
export const CABA_COMUNA_BARRIOS: Record<string, string[]> = {
  'Comuna 1': ['Retiro', 'San Nicolás', 'Puerto Madero', 'San Telmo', 'Montserrat', 'Constitución'],
  'Comuna 2': ['Recoleta'],
  'Comuna 3': ['Balvanera', 'San Cristóbal'],
  'Comuna 4': ['La Boca', 'Barracas', 'Parque Patricios', 'Nueva Pompeya'],
  'Comuna 5': ['Almagro', 'Boedo'],
  'Comuna 6': ['Caballito'],
  'Comuna 7': ['Flores', 'Parque Chacabuco'],
  'Comuna 8': ['Villa Soldati', 'Villa Riachuelo', 'Villa Lugano'],
  'Comuna 9': ['Liniers', 'Mataderos', 'Parque Avellaneda'],
  'Comuna 10': ['Villa Real', 'Monte Castro', 'Versalles', 'Floresta', 'Vélez Sarsfield', 'Villa Luro'],
  'Comuna 11': ['Villa General Mitre', 'Villa Devoto', 'Villa del Parque', 'Villa Santa Rita'],
  'Comuna 12': ['Coghlan', 'Saavedra', 'Villa Urquiza', 'Villa Pueyrredón'],
  'Comuna 13': ['Núñez', 'Belgrano', 'Colegiales'],
  'Comuna 14': ['Palermo'],
  'Comuna 15': ['Chacarita', 'Villa Crespo', 'La Paternal', 'Villa Ortúzar', 'Agronomía', 'Parque Chas']
};

export class AtlasGeoResolver {
  private static GEOREF_BASE_URL = 'https://apis.datos.gob.ar/georef/api';

  /**
   * Resolves and normalizes an address using official Georef Argentina API and local cache.
   * NEVER infers RESIDES_AT from workplace, commercial, or professional relationships.
   */
  public static async resolveAddress(
    rawAddress: string,
    relationType: GeoRelationType = 'WORKS_AT',
    options?: { defaultProvince?: string }
  ): Promise<AtlasGeoResolvedLocation | null> {
    if (!rawAddress || rawAddress.trim().length < 4) return null;

    const cleanInput = rawAddress.trim();

    // 1. Fast Local Georef Cache lookup (Zero network cost)
    const cached = GeorefLocalCache.get(cleanInput);
    if (cached) {
      return {
        raw_input: cleanInput,
        normalized_address: cached.normalized_address,
        latitude: cached.latitude,
        longitude: cached.longitude,
        neighborhood: cached.neighborhood,
        comuna: cached.comuna,
        comuna_id: cached.comuna_id,
        city: 'Ciudad Autónoma de Buenos Aires',
        province: 'Ciudad Autónoma de Buenos Aires',
        precision: cached.precision,
        geo_source: 'LOCAL_CABA_INDEX',
        confidence: cached.precision === 'EXACT_DOOR' || cached.precision === 'CAMPUS' ? 0.98 : 0.90,
        relation_type: relationType,
        observed_at: new Date().toISOString()
      };
    }

    const prov = options?.defaultProvince || '02'; // '02' is CABA in INDEC / Georef standard

    try {
      const url = `${this.GEOREF_BASE_URL}/direcciones?direccion=${encodeURIComponent(cleanInput)}&provincia=${prov}&max=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AtlasHarvester/1.0 (contact@youapp.com)' },
        timeout: 8000
      } as any);

      if (!res.ok) return null;
      const json: any = await res.json();
      const first = json.direcciones?.[0];

      if (!first) {
        return null;
      }

      const comunaName = first.departamento?.nombre || null;
      const comunaId = first.departamento?.id || null;
      const lat = first.ubicacion?.lat || null;
      const lon = first.ubicacion?.lon || null;

      // Determine neighborhood from Comuna or raw input keywords
      let neighborhood: string | null = null;
      if (comunaName && CABA_COMUNA_BARRIOS[comunaName]) {
        const barrios = CABA_COMUNA_BARRIOS[comunaName];
        if (barrios.length === 1) {
          neighborhood = barrios[0];
        } else {
          // Check if rawInput explicitly names one of the barrios in this comuna
          const lowerInput = cleanInput.toLowerCase();
          const matchBarrio = barrios.find(b => lowerInput.includes(b.toLowerCase()));
          neighborhood = matchBarrio || barrios[0]; // defaults to first barrio of the comuna
        }
      }

      const precision: GeoPrecision = first.altura?.valor ? 'EXACT_DOOR' : (first.calle?.nombre ? 'STREET' : 'COMUNA');

      // Cache locally for future operations
      GeorefLocalCache.set(cleanInput, {
        normalized_address: first.nomenclatura || cleanInput,
        neighborhood,
        comuna: comunaName,
        comuna_id: comunaId,
        latitude: lat,
        longitude: lon,
        precision
      });

      return {
        raw_input: cleanInput,
        normalized_address: first.nomenclatura || cleanInput,
        latitude: lat,
        longitude: lon,
        neighborhood,
        comuna: comunaName,
        comuna_id: comunaId,
        city: first.localidad_censal?.nombre || 'Ciudad Autónoma de Buenos Aires',
        province: first.provincia?.nombre || 'Ciudad Autónoma de Buenos Aires',
        precision,
        geo_source: 'GEOREF_ARGENTINA',
        confidence: precision === 'EXACT_DOOR' ? 0.95 : (precision === 'STREET' ? 0.85 : 0.70),
        relation_type: relationType,
        observed_at: new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  /**
   * Reverse geocodes coordinates to Comuna and City using Georef Argentina.
   */
  public static async reverseGeocode(lat: number, lon: number): Promise<{ comuna: string | null; city: string; province: string } | null> {
    try {
      const url = `${this.GEOREF_BASE_URL}/ubicacion?lat=${lat}&lon=${lon}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AtlasHarvester/1.0 (contact@youapp.com)' },
        timeout: 8000
      } as any);

      if (!res.ok) return null;
      const json: any = await res.json();
      const loc = json.ubicacion;

      return {
        comuna: loc?.departamento?.nombre || null,
        city: loc?.municipio?.nombre || 'Ciudad Autónoma de Buenos Aires',
        province: loc?.provincia?.nombre || 'Ciudad Autónoma de Buenos Aires'
      };
    } catch {
      return null;
    }
  }
}
