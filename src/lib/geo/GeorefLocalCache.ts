/**
 * GEOREF ARGENTINA — LOCAL CACHE & BULK LOOKUP
 * 
 * Provides local lookups for CABA Comunas, Barrios, and major scientific/academic corridors
 * derived from official Georef Argentina (apis.datos.gob.ar / INDEC) datasets.
 * 
 * Invariants:
 * - Georef Argentina remains the authoritative reference schema.
 * - Repeated and bulk queries hit local cache first -> EXTERNAL_GEO_REQUESTS tends to 0.
 * - Never infers RESIDES_AT from workplace or institutional affiliation.
 */

import fs from 'fs';
import path from 'path';

export interface LocalGeoEntry {
  raw_query: string;
  normalized_address: string;
  neighborhood: string | null;
  comuna: string | null;
  comuna_id: string | null;
  latitude: number | null;
  longitude: number | null;
  precision: 'EXACT_DOOR' | 'BLOCK' | 'STREET' | 'NEIGHBORHOOD' | 'COMUNA' | 'CAMPUS';
  source: 'LOCAL_GEOREF_CACHE' | 'OFFICIAL_GEOREF_API';
}

// Pre-compiled authoritative dictionary of CABA research institutes, campuses, and key institutional locations
const PRECOMPILED_CABA_INSTITUTIONAL_GEO: Record<string, Omit<LocalGeoEntry, 'raw_query' | 'source'>> = {
  'ciudad universitaria': {
    normalized_address: 'Av. Intendente Güiraldes 2160, Pabellón II, Ciudad Universitaria, CABA',
    neighborhood: 'Núñez',
    comuna: 'Comuna 13',
    comuna_id: '02091',
    latitude: -34.5424,
    longitude: -58.4419,
    precision: 'CAMPUS'
  },
  'pabellon 1': {
    normalized_address: 'Av. Intendente Güiraldes 2160, Pabellón I, Ciudad Universitaria, CABA',
    neighborhood: 'Núñez',
    comuna: 'Comuna 13',
    comuna_id: '02091',
    latitude: -34.5415,
    longitude: -58.4435,
    precision: 'CAMPUS'
  },
  'pabellon 2': {
    normalized_address: 'Av. Intendente Güiraldes 2160, Pabellón II, Ciudad Universitaria, CABA',
    neighborhood: 'Núñez',
    comuna: 'Comuna 13',
    comuna_id: '02091',
    latitude: -34.5424,
    longitude: -58.4419,
    precision: 'CAMPUS'
  },
  'instituto leloir': {
    normalized_address: 'Av. Patricias Argentinas 435, CABA',
    neighborhood: 'Caballito',
    comuna: 'Comuna 6',
    comuna_id: '02042',
    latitude: -34.6067,
    longitude: -58.4328,
    precision: 'EXACT_DOOR'
  },
  'iibba': {
    normalized_address: 'Av. Patricias Argentinas 435, CABA',
    neighborhood: 'Caballito',
    comuna: 'Comuna 6',
    comuna_id: '02042',
    latitude: -34.6067,
    longitude: -58.4328,
    precision: 'EXACT_DOOR'
  },
  'hospital de clinicas': {
    normalized_address: 'Av. Córdoba 2351, CABA',
    neighborhood: 'Recoleta',
    comuna: 'Comuna 2',
    comuna_id: '02014',
    latitude: -34.5997,
    longitude: -58.3976,
    precision: 'EXACT_DOOR'
  },
  'hospital garrahan': {
    normalized_address: 'Pichincha 1890, CABA',
    neighborhood: 'Parque Patricios',
    comuna: 'Comuna 4',
    comuna_id: '02028',
    latitude: -34.6325,
    longitude: -58.3922,
    precision: 'EXACT_DOOR'
  },
  'hospital roffo': {
    normalized_address: 'Av. San Martín 5481, CABA',
    neighborhood: 'Agronomía',
    comuna: 'Comuna 15',
    comuna_id: '02105',
    latitude: -34.5939,
    longitude: -58.4906,
    precision: 'EXACT_DOOR'
  },
  'facultad de medicina uba': {
    normalized_address: 'Paraguay 2155, CABA',
    neighborhood: 'Recoleta',
    comuna: 'Comuna 2',
    comuna_id: '02014',
    latitude: -34.5991,
    longitude: -58.3962,
    precision: 'EXACT_DOOR'
  },
  'facultad de farmacia y bioquimica': {
    normalized_address: 'Junín 956, CABA',
    neighborhood: 'Recoleta',
    comuna: 'Comuna 2',
    comuna_id: '02014',
    latitude: -34.5985,
    longitude: -58.3980,
    precision: 'EXACT_DOOR'
  },
  'fiuba': {
    normalized_address: 'Av. Paseo Colón 850, CABA',
    neighborhood: 'San Telmo',
    comuna: 'Comuna 1',
    comuna_id: '02007',
    latitude: -34.6178,
    longitude: -58.3683,
    precision: 'EXACT_DOOR'
  },
  'paseo colon 850': {
    normalized_address: 'Av. Paseo Colón 850, CABA',
    neighborhood: 'San Telmo',
    comuna: 'Comuna 1',
    comuna_id: '02007',
    latitude: -34.6178,
    longitude: -58.3683,
    precision: 'EXACT_DOOR'
  },
  'saavedra 15': {
    normalized_address: 'Saavedra 15, CABA',
    neighborhood: 'Balvanera',
    comuna: 'Comuna 3',
    comuna_id: '02021',
    latitude: -34.6111,
    longitude: -58.3975,
    precision: 'EXACT_DOOR'
  },
  'ciipme': {
    normalized_address: 'Tte. Gral. Juan D. Perón 2158, CABA',
    neighborhood: 'Balvanera',
    comuna: 'Comuna 3',
    comuna_id: '02021',
    latitude: -34.6063,
    longitude: -58.3983,
    precision: 'EXACT_DOOR'
  },
  'godoy cruz 2290': {
    normalized_address: 'Godoy Cruz 2290, Polo Científico Tecnológico, CABA',
    neighborhood: 'Palermo',
    comuna: 'Comuna 14',
    comuna_id: '02098',
    latitude: -34.5828,
    longitude: -58.4312,
    precision: 'EXACT_DOOR'
  },
  'polo cientifico tecnologico': {
    normalized_address: 'Godoy Cruz 2290, Polo Científico Tecnológico, CABA',
    neighborhood: 'Palermo',
    comuna: 'Comuna 14',
    comuna_id: '02098',
    latitude: -34.5828,
    longitude: -58.4312,
    precision: 'CAMPUS'
  }
};

export class GeorefLocalCache {
  private static cache: Map<string, LocalGeoEntry> = new Map();
  private static hits = 0;
  private static misses = 0;
  private static initialized = false;

  public static initialize() {
    if (this.initialized) return;

    // Preload institutional dictionary
    for (const [key, val] of Object.entries(PRECOMPILED_CABA_INSTITUTIONAL_GEO)) {
      this.cache.set(key.toLowerCase(), {
        raw_query: key,
        ...val,
        source: 'LOCAL_GEOREF_CACHE'
      });
    }

    this.initialized = true;
  }

  public static get(query: string): LocalGeoEntry | null {
    this.initialize();
    const cleanKey = query.toLowerCase().trim();

    // 1. Direct match
    if (this.cache.has(cleanKey)) {
      this.hits++;
      return this.cache.get(cleanKey)!;
    }

    // 2. Substring match for known institutional anchors
    for (const [key, val] of this.cache.entries()) {
      if (cleanKey.includes(key)) {
        this.hits++;
        return val;
      }
    }

    this.misses++;
    return null;
  }

  public static set(query: string, entry: Omit<LocalGeoEntry, 'raw_query' | 'source'>) {
    this.initialize();
    const cleanKey = query.toLowerCase().trim();
    this.cache.set(cleanKey, {
      raw_query: query,
      ...entry,
      source: 'LOCAL_GEOREF_CACHE'
    });
  }

  public static getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? parseFloat(((this.hits / total) * 100).toFixed(1)) : 0;
    return {
      cacheSize: this.cache.size,
      localCacheHits: this.hits,
      externalGeoRequests: this.misses,
      hitRatePercent: hitRate
    };
  }
}
