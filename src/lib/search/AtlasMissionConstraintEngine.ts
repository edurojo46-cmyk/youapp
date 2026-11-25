/**
 * AtlasMissionConstraintEngine.ts
 * Constitutional Immutable Mission Constraints & Admission Gate
 * 
 * Strict Invariants:
 * 1. An immutable mission contract cannot be degraded, replaced, or silently broadened.
 * 2. ENTITY_TYPE, REQUIRED_GEO_LEVEL, and REQUIRED_SIGNALS are HARD CONSTRAINTS.
 * 3. General matcher without hardcoded query/location branching.
 * 4. Admission by capability: sources lacking capability to prove constraints must NEVER execute.
 * 5. Target gap integrity: if physical sources have only N valid matches, return N. Never target-fill with invalid rows.
 */

export type EntityType = 'PERSON' | 'EMPRESA';
export type GeoLevel = 'COUNTRY' | 'PROVINCE' | 'CITY' | 'LOCALITY' | 'NEIGHBORHOOD';

export interface MissionConstraints {
  entity_type: EntityType;
  geo_country: string;              // e.g. 'AR'
  geo_province: string;             // e.g. 'CABA', 'Córdoba', 'Mendoza', 'Río Negro', etc.
  geo_city: string;                 // e.g. 'CABA', 'Córdoba', 'Mendoza', etc.
  geo_locality?: string | null;     // e.g. 'Caballito', 'Palermo', etc.
  geo_neighborhood?: string | null; // e.g. 'CABALLITO', 'PALERMO', etc.
  required_geo_level: GeoLevel;
  required_signals: string[];       // e.g. ['EMAIL'], ['PHONE'], ['LINKEDIN']
  profession?: string | null;
  sector?: string | null;
  organization?: string | null;
  target: number;
}

export interface CandidateRecord {
  id?: string;
  name?: string;
  entity_type?: string;
  role?: string;
  rubro?: string;
  localidad?: string;
  provincia?: string;
  ciudad?: string;
  barrio?: string;
  comuna?: string;
  direccion?: string;
  geo_evidence?: string;
  location?: string;
  evidence?: string;
  provenance?: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  tipo_personeria?: string;
  tipo_proveedor?: string;
  cuit?: string;
  active?: boolean;
  person_verified?: boolean;
  person_verification_status?: string;
  email_verified?: boolean;
  email_observed_in_physical_source?: boolean;
  linkedin_observed_url?: boolean;
  linkedin_verified?: boolean;
  linkedin_signal_status?: string;
  [key: string]: any;
}

export interface ConstraintEvaluationResult {
  admitted: boolean;
  entity_match: boolean;
  geo_match: boolean;
  geo_child_match: boolean;
  geo_parent_match: boolean;
  signal_match: boolean;
  evidence_match: boolean;
  canonical_person_match: boolean;
  candidate_canonical_province?: string | null;
  mission_canonical_province?: string | null;
  rejection_reasons: string[];
}

export interface CandidateGeoInput {
  pais?: string | null;
  provincia?: string | null;
  partido?: string | null;
  departamento?: string | null;
  ciudad?: string | null;
  localidad?: string | null;
  barrio?: string | null;
  comuna?: string | null;
  direccion?: string | null;
  geo_evidence?: string | null;
  rawText?: string | null;
  postal_code?: string | null;
}

export interface MissionGeoInput {
  country?: string | null;
  province?: string | null;
  department?: string | null;
  city?: string | null;
  locality?: string | null;
  neighborhood?: string | null;
  required_geo_level?: GeoLevel;
}

export interface GeoHierarchyMatchResult {
  match: boolean;
  child_match: boolean;
  parent_match: boolean;
  geo_child_match: boolean;
  geo_parent_match: boolean;
  candidate_canonical_province: string | null;
  mission_canonical_province: string | null;
  rejection_reasons: string[];
}

export interface SourceCapability {
  source_id: string;
  source_name: string;
  supported_entity_types: EntityType[];
  supported_geo_levels: GeoLevel[];
  supported_signals: string[];
  supported_provinces?: string[]; // e.g. ['CABA'], ['CORDOBA'], or ['ALL']
  supported_neighborhoods?: string[]; // e.g. ['PALERMO'], or ['ALL']
  has_neighborhood_evidence: boolean;
  has_email_evidence: boolean;
  has_phone_evidence: boolean;
}

export const CABA_NEIGHBORHOODS: string[] = [
  'AGRONOMIA', 'ALMAGRO', 'BALVANERA', 'BARRACAS', 'BELGRANO', 'BOEDO',
  'CABALLITO', 'CHACARITA', 'COGHLAN', 'COLEGIALES', 'CONSTITUCION',
  'FLORES', 'FLORESTA', 'LA BOCA', 'LA PATERNAL', 'LINIERS', 'MATADEROS',
  'MONTE CASTRO', 'MONSERRAT', 'NUEVA POMPEYA', 'NUNEZ', 'PALERMO',
  'PARQUE AVELLANEDA', 'PARQUE CHACABUCO', 'PARQUE CHAS', 'PARQUE PATRICIOS',
  'PUERTO MADERO', 'RECOLETA', 'RETIRO', 'SAAVEDRA', 'SAN CRISTOBAL',
  'SAN NICOLAS', 'SAN TELMO', 'VELEZ SARSFIELD', 'VERSALLES', 'VILLA CRESPO',
  'VILLA DEL PARQUE', 'VILLA DEVOTO', 'VILLA GENERAL MITRE', 'VILLA LUGANO',
  'VILLA LURO', 'VILLA ORTUZAR', 'VILLA PUEYRREDON', 'VILLA REAL',
  'VILLA RIACHUELO', 'VILLA SANTA RITA', 'VILLA SOLDATI', 'VILLA URQUIZA'
];

export interface CanonicalProvinceDefinition {
  iso: string;
  name: string;
  aliases: string[];
}

export const CANONICAL_ARGENTINE_PROVINCES: Record<string, CanonicalProvinceDefinition> = {
  'AR-C': {
    iso: 'AR-C',
    name: 'CABA',
    aliases: ['CABA', 'CAPITAL FEDERAL', 'CIUDAD AUTONOMA DE BUENOS AIRES', 'CIUDAD DE BUENOS AIRES', 'BUENOS AIRES CAPITAL', 'BS AS CAPITAL', 'GCBA', 'COMUNA 1', 'COMUNA 2', 'COMUNA 3', 'COMUNA 4', 'COMUNA 5', 'COMUNA 6', 'COMUNA 7', 'COMUNA 8', 'COMUNA 9', 'COMUNA 10', 'COMUNA 11', 'COMUNA 12', 'COMUNA 13', 'COMUNA 14', 'COMUNA 15']
  },
  'AR-B': {
    iso: 'AR-B',
    name: 'Buenos Aires',
    aliases: ['PROVINCIA DE BUENOS AIRES', 'PCIA DE BUENOS AIRES', 'PCIA BS AS', 'BUENOS AIRES PROVINCIA', 'PBA', 'LA PLATA', 'MAR DEL PLATA', 'BAHIA BLANCA', 'QUILMES', 'LANUS', 'VICENTE LOPEZ', 'SAN ISIDRO', 'TIGRE', 'MORON', 'RAMOS MEJIA']
  },
  'AR-E': {
    iso: 'AR-E',
    name: 'Entre Ríos',
    aliases: ['ENTRE RIOS', 'PROVINCIA DE ENTRE RIOS', 'PCIA DE ENTRE RIOS', 'PARANA', 'CONCORDIA', 'GUALEGUAYCHU', 'VILLA URQUIZA ENTRE RIOS']
  },
  'AR-X': {
    iso: 'AR-X',
    name: 'Córdoba',
    aliases: ['CORDOBA', 'PROVINCIA DE CORDOBA', 'PCIA DE CORDOBA', 'CORDOBA CAPITAL', 'IDECOR', 'RIO CUARTO', 'VILLA MARIA', 'CARLOS PAZ', 'SAN FRANCISCO', 'BELL VILLE', 'ALTA GRACIA', 'COLONIA CAROYA', 'CBA']
  },
  'AR-M': {
    iso: 'AR-M',
    name: 'Mendoza',
    aliases: ['MENDOZA', 'PROVINCIA DE MENDOZA', 'PCIA DE MENDOZA', 'MENDOZA CAPITAL', 'MZA', 'GODOY CRUZ', 'GUAYMALLEN', 'LUJAN DE CUYO', 'MALARGUE', 'TUPUNGATO', 'TUNUYAN']
  },
  'AR-S': {
    iso: 'AR-S',
    name: 'Santa Fe',
    aliases: ['SANTA FE', 'PROVINCIA DE SANTA FE', 'PCIA DE SANTA FE', 'SANTA FE CAPITAL', 'ROSARIO', 'RAFAELA', 'VENADO TUERTO', 'RECONQUISTA', 'SANTO TOME']
  },
  'AR-T': {
    iso: 'AR-T',
    name: 'Tucumán',
    aliases: ['TUCUMAN', 'PROVINCIA DE TUCUMAN', 'SAN MIGUEL DE TUCUMAN', 'TAFI VIEJO', 'CONCEPCION', 'YERBA BUENA']
  },
  'AR-W': {
    iso: 'AR-W',
    name: 'San Juan',
    aliases: ['SAN JUAN', 'PROVINCIA DE SAN JUAN', 'SAN JUAN CAPITAL', 'CHIMBAS']
  },
  'AR-J': {
    iso: 'AR-J',
    name: 'Jujuy',
    aliases: ['JUJUY', 'PROVINCIA DE JUJUY', 'SAN SALVADOR DE JUJUY']
  },
  'AR-H': {
    iso: 'AR-H',
    name: 'Chaco',
    aliases: ['CHACO', 'PROVINCIA DEL CHACO', 'RESISTENCIA']
  },
  'AR-Q': {
    iso: 'AR-Q',
    name: 'Neuquén',
    aliases: ['NEUQUEN', 'PROVINCIA DEL NEUQUEN', 'NEUQUEN CAPITAL', 'SAN MARTIN DE LOS ANDES', 'VILLA LA ANGOSTURA', 'ZAPALA', 'CUTRAL CO']
  },
  'AR-R': {
    iso: 'AR-R',
    name: 'Río Negro',
    aliases: ['RIO NEGRO', 'PROVINCIA DE RIO NEGRO', 'VIEDMA', 'BARILOCHE', 'SAN CARLOS DE BARILOCHE', 'GENERAL ROCA', 'CIPOLLETTI', 'ALLEN', 'CINCO SALTOS', 'CATRIEL', 'EL BOLSON', 'CHOELE CHOEL']
  },
  'AR-N': {
    iso: 'AR-N',
    name: 'Misiones',
    aliases: ['MISIONES', 'PROVINCIA DE MISIONES', 'POSADAS', 'OBERA', 'ELDORADO', 'PUERTO IGUAZU']
  },
  'AR-A': {
    iso: 'AR-A',
    name: 'Salta',
    aliases: ['SALTA', 'PROVINCIA DE SALTA', 'SALTA CAPITAL', 'SAN RAMON DE LA NUEVA ORAN', 'TARTAGAL', 'CAFAYATE']
  },
  'AR-F': {
    iso: 'AR-F',
    name: 'La Rioja',
    aliases: ['LA RIOJA', 'PROVINCIA DE LA RIOJA', 'LA RIOJA CAPITAL']
  },
  'AR-K': {
    iso: 'AR-K',
    name: 'Catamarca',
    aliases: ['CATAMARCA', 'PROVINCIA DE CATAMARCA', 'SAN FERNANDO DEL VALLE DE CATAMARCA']
  },
  'AR-L': {
    iso: 'AR-L',
    name: 'La Pampa',
    aliases: ['LA PAMPA', 'PROVINCIA DE LA PAMPA', 'SANTA ROSA', 'GENERAL PICO']
  },
  'AR-P': {
    iso: 'AR-P',
    name: 'Formosa',
    aliases: ['FORMOSA', 'PROVINCIA DE FORMOSA', 'FORMOSA CAPITAL']
  },
  'AR-G': {
    iso: 'AR-G',
    name: 'Santiago del Estero',
    aliases: ['SANTIAGO DEL ESTERO', 'PROVINCIA DE SANTIAGO DEL ESTERO', 'LA BANDA', 'TERMAS DE RIO HONDO']
  },
  'AR-D': {
    iso: 'AR-D',
    name: 'San Luis',
    aliases: ['SAN LUIS', 'PROVINCIA DE SAN LUIS', 'SAN LUIS CAPITAL', 'VILLA MERCEDES']
  },
  'AR-U': {
    iso: 'AR-U',
    name: 'Chubut',
    aliases: ['CHUBUT', 'PROVINCIA DEL CHUBUT', 'RAWSON', 'COMODORO RIVADAVIA', 'TRELEW', 'PUERTO MADRYN']
  },
  'AR-Z': {
    iso: 'AR-Z',
    name: 'Santa Cruz',
    aliases: ['SANTA CRUZ', 'PROVINCIA DE SANTA CRUZ', 'RIO GALLEGOS', 'CALETA OLIVIA', 'EL CALAFATE']
  },
  'AR-V': {
    iso: 'AR-V',
    name: 'Tierra del Fuego',
    aliases: ['TIERRA DEL FUEGO', 'PROVINCIA DE TIERRA DEL FUEGO', 'USHUAIA', 'RIO GRANDE', 'TOLHUIN']
  },
  'AR-Y': {
    iso: 'AR-Y',
    name: 'Corrientes',
    aliases: ['CORRIENTES', 'PROVINCIA DE CORRIENTES', 'CORRIENTES CAPITAL', 'GOYA', 'PASO DE LOS LIBRES']
  }
};

export const ARGENTINE_PROVINCES: Record<string, string[]> = Object.fromEntries(
  Object.values(CANONICAL_ARGENTINE_PROVINCES).map(p => [p.name.toUpperCase(), p.aliases])
);

export function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  const clean = text
    .replace(/Ã¡/gi, 'a').replace(/Ã©/gi, 'e').replace(/Ã­/gi, 'i').replace(/Ã³/gi, 'o').replace(/Ãº/gi, 'u')
    .replace(/Ã±/gi, 'n');
  return clean
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes free-form text or field into a canonical Argentine province (ISO 3166-2:AR)
 */
export function detectCanonicalProvince(text: string | null | undefined): { iso: string; name: string } | null {
  if (!text) return null;
  const norm = normalizeSearchText(text);
  if (!norm) return null;

  // 1. CABA Check FIRST (prioritized over Buenos Aires Province)
  const isCaba = /\b(CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA DE BUENOS AIRES|CIUDAD DE BUENOS AIRES|BUENOS AIRES CAPITAL|BS AS CAPITAL|GCBA|COMUNA\s*(1[0-5]|[1-9]))\b/i.test(norm);
  if (isCaba) {
    return { iso: 'AR-C', name: 'CABA' };
  }

  // 2. Check all other provinces
  for (const [iso, def] of Object.entries(CANONICAL_ARGENTINE_PROVINCES)) {
    if (iso === 'AR-C') continue;
    for (const alias of def.aliases) {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      if (regex.test(norm)) {
        return { iso: def.iso, name: def.name };
      }
    }
  }

  // 3. Fallback for standalone "BUENOS AIRES" (Province) when CABA was already ruled out
  if (/\bBUENOS AIRES\b/i.test(norm) && !isCaba) {
    return { iso: 'AR-B', name: 'Buenos Aires' };
  }

  return null;
}

export function detectCandidateCanonicalProvince(candGeo: CandidateGeoInput): { iso: string; name: string } | null {
  // 1. Check candidate.provincia first (most authoritative)
  if (candGeo.provincia) {
    const fromProv = detectCanonicalProvince(candGeo.provincia);
    if (fromProv) return fromProv;
  }

  // 2. Check candidate.geo_evidence
  if (candGeo.geo_evidence) {
    const fromEv = detectCanonicalProvince(candGeo.geo_evidence);
    if (fromEv) return fromEv;
  }

  // 3. Check candidate.ciudad / localidad
  if (candGeo.ciudad || candGeo.localidad) {
    const fromCity = detectCanonicalProvince(`${candGeo.ciudad || ''} ${candGeo.localidad || ''}`);
    if (fromCity) return fromCity;
  }

  // 4. Check rawText / direccion
  if (candGeo.rawText) {
    const fromRaw = detectCanonicalProvince(candGeo.rawText);
    if (fromRaw) return fromRaw;
  }

  return null;
}

/**
 * Core Hierarchical Geo Verifier: matchesGeoHierarchy(candidateGeo, missionGeo)
 * Strictly verifies ancestor consistency across all levels (Country, Province, City, Neighborhood).
 * A child level can NEVER validate if it contradicts an ancestor.
 * UNKNOWN on a required parent is NOT a match.
 */
export function matchesGeoHierarchy(
  candGeo: CandidateGeoInput,
  missionGeo: MissionGeoInput
): GeoHierarchyMatchResult {
  const rejection_reasons: string[] = [];

  // 1. Resolve Mission Canonical Parent Province
  let missionProv = detectCanonicalProvince(missionGeo.province || missionGeo.city);
  if (!missionProv && missionGeo.neighborhood && CABA_NEIGHBORHOODS.includes(normalizeSearchText(missionGeo.neighborhood))) {
    missionProv = { iso: 'AR-C', name: 'CABA' };
  }
  const missionCanonicalProv = missionProv?.iso || null;

  // 2. Resolve Candidate Canonical Province
  const candProv = detectCandidateCanonicalProvince(candGeo);
  const candidateCanonicalProv = candProv?.iso || null;

  // 3. Parent Consistency Check (geo_parent_match)
  let parent_match = true;

  if (missionCanonicalProv) {
    if (candidateCanonicalProv) {
      if (candidateCanonicalProv !== missionCanonicalProv) {
        parent_match = false;
        rejection_reasons.push(
          `GEO_PARENT_CONTRADICTION: Candidate belongs to ${candidateCanonicalProv} (${candProv?.name}), mission requires ${missionCanonicalProv} (${missionProv?.name})`
        );
      }
    } else {
      // Candidate has NO explicit province detected.
      // Must check if there is positive evidence proving the required parent.
      if (missionCanonicalProv === 'AR-C') {
        const rawUpper = normalizeSearchText(candGeo.rawText || `${candGeo.direccion} ${candGeo.localidad} ${candGeo.barrio} ${candGeo.geo_evidence}`);
        const hasCabaAnchor = /\b(CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA|GCBA|COMUNA\s*(1[0-5]|[1-9]))\b/i.test(rawUpper);
        if (!hasCabaAnchor) {
          parent_match = false;
          rejection_reasons.push(
            `GEO_PARENT_UNKNOWN_UNVERIFIED: Required parent province AR-C (CABA) has no positive evidence in candidate record`
          );
        }
      } else {
        const rawUpper = normalizeSearchText(candGeo.rawText || `${candGeo.direccion} ${candGeo.localidad} ${candGeo.ciudad} ${candGeo.geo_evidence}`);
        const missionNameNorm = normalizeSearchText(missionProv?.name);
        if (!rawUpper.includes(missionNameNorm)) {
          parent_match = false;
          rejection_reasons.push(
            `GEO_PARENT_UNKNOWN_UNVERIFIED: Required parent province ${missionCanonicalProv} (${missionProv?.name}) has no positive evidence in record`
          );
        }
      }
    }
  }

  // 4. Child Level Check (geo_child_match)
  let child_match = true;
  const rawTextUpper = normalizeSearchText(
    candGeo.rawText || `${candGeo.barrio || ''} ${candGeo.localidad || ''} ${candGeo.ciudad || ''} ${candGeo.direccion || ''} ${candGeo.geo_evidence || ''}`
  );

  if (missionGeo.required_geo_level === 'NEIGHBORHOOD') {
    const targetNeighborhood = normalizeSearchText(missionGeo.neighborhood);
    if (!targetNeighborhood) {
      child_match = false;
      rejection_reasons.push('SPEC_MISSING_TARGET_NEIGHBORHOOD');
    } else {
      // Must contain evidence of target neighborhood
      const hasNeighborhoodEvidence = rawTextUpper.includes(targetNeighborhood);
      if (!hasNeighborhoodEvidence) {
        child_match = false;
        rejection_reasons.push(`MISSING_REQUIRED_NEIGHBORHOOD_${targetNeighborhood}`);
      } else {
        // Conflict check: Does evidence explicitly specify a DIFFERENT CABA neighborhood?
        for (const otherBarrio of CABA_NEIGHBORHOODS) {
          if (otherBarrio !== targetNeighborhood) {
            const regex = new RegExp(`\\b${otherBarrio}\\b`, 'i');
            if (regex.test(rawTextUpper)) {
              if (candGeo.barrio && normalizeSearchText(candGeo.barrio) === otherBarrio && normalizeSearchText(candGeo.barrio) !== targetNeighborhood) {
                child_match = false;
                rejection_reasons.push(`NEIGHBORHOOD_MISMATCH_EXPLICIT_${otherBarrio}`);
                break;
              }
            }
          }
        }
      }
    }
  } else if (missionGeo.required_geo_level === 'CITY' || missionGeo.required_geo_level === 'LOCALITY') {
    const targetCity = normalizeSearchText(missionGeo.city || missionGeo.locality);
    if (targetCity) {
      const hasCityEvidence = rawTextUpper.includes(targetCity);
      if (!hasCityEvidence) {
        if (missionCanonicalProv === 'AR-C') {
          const isCabaEv = /\b(CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA|GCBA|COMUNA)\b/i.test(rawTextUpper) ||
                           CABA_NEIGHBORHOODS.some(n => rawTextUpper.includes(n));
          if (!isCabaEv) {
            child_match = false;
            rejection_reasons.push(`MISSING_REQUIRED_CITY_${targetCity}`);
          }
        } else {
          child_match = false;
          rejection_reasons.push(`MISSING_REQUIRED_CITY_${targetCity}`);
        }
      }
    }
  } else if (missionGeo.required_geo_level === 'PROVINCE') {
    child_match = parent_match;
  }

  const match = parent_match && child_match;

  return {
    match,
    child_match,
    parent_match,
    geo_child_match: child_match,
    geo_parent_match: parent_match,
    candidate_canonical_province: candidateCanonicalProv,
    mission_canonical_province: missionCanonicalProv,
    rejection_reasons
  };
}

/**
 * 1. Semantic Compiler: Creates the INMUTABLE MissionConstraints from query and parameters.
 * Once compiled, these constraints must NEVER be degraded or broadened.
 */
export function compileMissionConstraints(
  rawQuery: string,
  params?: {
    signals?: string[];
    filters?: {
      entity_type?: string;
      rubro?: string;
      provincia?: string;
      ciudad?: string;
      email?: boolean;
      phone?: boolean;
      website?: boolean;
      facebook?: boolean;
      instagram?: boolean;
      linkedin?: boolean;
      target?: number;
    };
    target?: number;
  }
): MissionConstraints {
  const cleanQuery = (rawQuery || '').replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '').trim();
  const qNorm = normalizeSearchText(cleanQuery);
  const qLower = cleanQuery.toLowerCase();

  // 1. Target count
  let target = 100;
  const countMatch = cleanQuery.match(/(\d+[\d\.]*)\s*(personas|empresas|inmobiliarias|restaurantes|comercios|organizaciones|emails?|correos?|contactos?|cuentas?)?/i);
  if (countMatch) {
    const parsedNum = parseInt(countMatch[1].replace(/\./g, ''), 10);
    if (!isNaN(parsedNum) && parsedNum > 0) target = parsedNum;
  } else if (params?.target) {
    target = Number(params.target) || 100;
  } else if (params?.filters?.target) {
    target = Number(params.filters.target) || 100;
  }

  // 2. Entity Type: PERSON vs EMPRESA
  let entity_type: EntityType = 'EMPRESA';
  if (/personas?|profesionales?|abogados?|m[eé]dicos?|magistrados?|mediador(es)?|titulares?/i.test(qLower)) {
    entity_type = 'PERSON';
  } else if (/empresas?|compañ[ií]as?|firmas?|comercios?|locales?|f[aá]bricas?|industrias?|sociedades?/i.test(qLower)) {
    entity_type = 'EMPRESA';
  } else if (params?.filters?.entity_type) {
    entity_type = (params.filters.entity_type === 'PERSONA' || params.filters.entity_type === 'PERSON') ? 'PERSON' : 'EMPRESA';
  }

  // 3. Required Signals
  const required_signals_set = new Set<string>();
  if (/emails?|mails?|correos?/i.test(qLower)) required_signals_set.add('EMAIL');
  if (/tel[eé]fonos?|celular(es)?|whatsapps?|tels?/i.test(qLower)) required_signals_set.add('PHONE');
  if (/linkedins?|\bli\b/i.test(qLower)) required_signals_set.add('LINKEDIN');
  if (/websites?|webs?|sitios?\s*webs?/i.test(qLower)) required_signals_set.add('WEBSITE');
  if (/instagrams?|\big\b/i.test(qLower)) required_signals_set.add('INSTAGRAM');
  if (/facebooks?|\bfb\b/i.test(qLower)) required_signals_set.add('FACEBOOK');

  if (params?.signals && Array.isArray(params.signals)) {
    params.signals.forEach(s => required_signals_set.add(s.toUpperCase()));
  }
  if (params?.filters) {
    if (params.filters.email) required_signals_set.add('EMAIL');
    if (params.filters.phone) required_signals_set.add('PHONE');
    if (params.filters.website) required_signals_set.add('WEBSITE');
    if (params.filters.instagram) required_signals_set.add('INSTAGRAM');
    if (params.filters.linkedin) required_signals_set.add('LINKEDIN');
    if (params.filters.facebook) required_signals_set.add('FACEBOOK');
  }

  // 4. Hierarchical Geography Compiler
  let geo_country = 'AR';
  let geo_province = 'CABA';
  let geo_city = 'CABA';
  let geo_locality: string | null = null;
  let geo_neighborhood: string | null = null;
  let required_geo_level: GeoLevel = 'CITY';

  const combinedTextForGeo = `${qNorm} ${normalizeSearchText(params?.filters?.ciudad)} ${normalizeSearchText(params?.filters?.provincia)}`;

  // Detect explicit province first
  const explicitProv = detectCanonicalProvince(combinedTextForGeo);

  if (explicitProv && explicitProv.iso !== 'AR-C') {
    // Mission explicitly targets another Argentine province (e.g. Entre Ríos, Mendoza, Córdoba)
    geo_province = explicitProv.name;
    geo_city = explicitProv.name;
    geo_locality = explicitProv.name;
    required_geo_level = 'PROVINCE';
    geo_neighborhood = null;

    // Check if a city or department is specified alongside the province
    if (combinedTextForGeo.includes('SAN MARTIN') && explicitProv.iso === 'AR-M') {
      geo_city = 'San Martín';
      geo_locality = 'San Martín';
      required_geo_level = 'CITY';
    } else if (combinedTextForGeo.includes('CORDOBA CAPITAL') && explicitProv.iso === 'AR-X') {
      geo_city = 'Córdoba Capital';
      geo_locality = 'Córdoba Capital';
      required_geo_level = 'CITY';
    }
  } else {
    // Check CABA Neighborhoods (most specific level for CABA)
    let matchedNeighborhood: string | null = null;
    for (const n of CABA_NEIGHBORHOODS) {
      const regex = new RegExp(`\\b${n}\\b`, 'i');
      if (regex.test(combinedTextForGeo)) {
        matchedNeighborhood = n;
        break;
      }
    }

    if (matchedNeighborhood) {
      required_geo_level = 'NEIGHBORHOOD';
      geo_neighborhood = matchedNeighborhood;
      geo_locality = matchedNeighborhood.charAt(0) + matchedNeighborhood.slice(1).toLowerCase();
      geo_city = 'CABA';
      geo_province = 'CABA';
    } else if (explicitProv && explicitProv.iso === 'AR-C') {
      required_geo_level = 'CITY';
      geo_province = 'CABA';
      geo_city = 'CABA';
      geo_locality = 'CABA';
      geo_neighborhood = null;
    } else {
      const fallbackGeo = params?.filters?.ciudad || params?.filters?.provincia || 'CABA';
      geo_province = fallbackGeo;
      geo_city = fallbackGeo;
      geo_locality = fallbackGeo;
      required_geo_level = 'CITY';
      geo_neighborhood = null;
    }
  }

  // 5. Profession & Sector
  let profession: string | null = null;
  if (/abogados?/i.test(qLower)) profession = 'Abogado';
  else if (/m[eé]dicos?/i.test(qLower)) profession = 'Médico';
  else if (/mediador(es)?/i.test(qLower)) profession = 'Mediador';

  let sector = params?.filters?.rubro || null;
  if (/inmobiliari(a|as)|propiedad(es)?/i.test(qLower)) sector = 'Inmobiliaria';
  else if (/restaurante?s?|gastronom[ií]a|bares?|caf[eé]s?/i.test(qLower)) sector = 'Gastronomía';
  else if (/farmacia?s?|salud|cl[ií]nicas?/i.test(qLower)) sector = 'Salud y Farmacia';
  else if (/turismo|hoteles?|cabañas?/i.test(qLower)) sector = 'Turismo y Hotelería';
  else if (/software|tecnolog[ií]a|it/i.test(qLower)) sector = 'Tecnología y Software';

  return {
    entity_type,
    geo_country,
    geo_province,
    geo_city,
    geo_locality,
    geo_neighborhood,
    required_geo_level,
    required_signals: Array.from(required_signals_set),
    profession,
    sector,
    organization: null,
    target
  };
}

/**
 * 2. General Hard Constraint Engine: matchesMissionConstraints(candidate, spec)
 * Strictly evaluates EVERY candidate against the immutable mission contract.
 * NO silent broadening. NO target filling with invalid rows.
 */
export function matchesMissionConstraints(
  candidate: CandidateRecord,
  spec: MissionConstraints
): ConstraintEvaluationResult {
  const rejection_reasons: string[] = [];

  // ============================================
  // 1. ENTITY TYPE CHECK (HARD CONSTRAINT)
  // ============================================
  let entity_match = true;
  const candType = (candidate.entity_type || '').toUpperCase().trim();
  const candName = (candidate.name || '').trim();
  const candPersoneria = (candidate.tipo_personeria || candidate.tipo_proveedor || '').toUpperCase().trim();

  // Corporate indicator check on name
  const isCorporateName = /\b(s\.a\.|s\.r\.l\.|s\.a\.s\.|sociedad an[oó]nima|sociedad de responsabilidad|srl|sa|s\.c\.s\.|s\.a\.u\.|restaurant|restaurante|bar|hotel|hostel|comercio|negocio|consultora|estudio jur[ií]dico|estudio contable|cl[ií]nica|sanatorio)\b/i.test(candName);

  if (spec.entity_type === 'PERSON') {
    if (candType === 'EMPRESA' || candType === 'COMPANY') {
      entity_match = false;
      rejection_reasons.push('ENTITY_MISMATCH_RECORD_IS_EMPRESA');
    }
    if (isCorporateName) {
      entity_match = false;
      rejection_reasons.push('ENTITY_MISMATCH_NAME_INDICATES_COMPANY');
    }
    if (candPersoneria && !candPersoneria.includes('FISICA') && !candPersoneria.includes('PERSONA')) {
      entity_match = false;
      rejection_reasons.push('ENTITY_MISMATCH_PERSONERIA_NOT_FISICA');
    }
    if (candidate.person_verified === false) {
      entity_match = false;
      rejection_reasons.push('CANONICAL_PERSON_UNVERIFIED');
    }
  } else if (spec.entity_type === 'EMPRESA') {
    if (candType === 'PERSON' || candType === 'PERSONA') {
      entity_match = false;
      rejection_reasons.push('ENTITY_MISMATCH_RECORD_IS_PERSON');
    }
    if (candPersoneria && candPersoneria.includes('FISICA')) {
      entity_match = false;
      rejection_reasons.push('ENTITY_MISMATCH_PERSONERIA_IS_FISICA');
    }
  }

  // Canonical person match
  const canonical_person_match = spec.entity_type === 'PERSON'
    ? entity_match && candidate.person_verified !== false
    : true;

  // ============================================
  // 2. GEOGRAPHIC CHECK (HARD HIERARCHICAL CONSTRAINT)
  // ============================================
  const candGeo: CandidateGeoInput = {
    pais: candidate.pais || 'AR',
    provincia: candidate.provincia,
    partido: candidate.partido,
    departamento: candidate.departamento,
    ciudad: candidate.ciudad,
    localidad: candidate.localidad,
    barrio: candidate.barrio,
    comuna: candidate.comuna,
    direccion: candidate.direccion,
    geo_evidence: candidate.geo_evidence,
    rawText: [
      candidate.barrio,
      candidate.localidad,
      candidate.ciudad,
      candidate.provincia,
      candidate.comuna,
      candidate.direccion,
      candidate.geo_evidence,
      candidate.location,
      candidate.evidence,
      candidate.provenance
    ].filter(Boolean).join(' ')
  };

  const missionGeo: MissionGeoInput = {
    country: spec.geo_country,
    province: spec.geo_province,
    city: spec.geo_city,
    locality: spec.geo_locality,
    neighborhood: spec.geo_neighborhood,
    required_geo_level: spec.required_geo_level
  };

  const geoHierarchyRes = matchesGeoHierarchy(candGeo, missionGeo);
  const geo_match = geoHierarchyRes.match;
  const geo_child_match = geoHierarchyRes.child_match;
  const geo_parent_match = geoHierarchyRes.parent_match;

  if (!geo_match) {
    rejection_reasons.push(...geoHierarchyRes.rejection_reasons);
  }

  // ============================================
  // 3. REQUIRED SIGNALS CHECK (HARD CONSTRAINT)
  // ============================================
  let signal_match = true;
  for (const signal of spec.required_signals) {
    const s = signal.toUpperCase().trim();
    if (s === 'EMAIL') {
      const email = (candidate.email || '').trim();
      const hasValidEmail = Boolean(email && email.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      if (!hasValidEmail) {
        signal_match = false;
        rejection_reasons.push('MISSING_REQUIRED_SIGNAL_EMAIL');
      } else if (candidate.email_observed_in_physical_source === false || candidate.email_verified === false) {
        signal_match = false;
        rejection_reasons.push('EMAIL_NOT_VERIFIED_IN_PHYSICAL_SOURCE');
      }
    } else if (s === 'PHONE') {
      const phone = (candidate.phone || '').replace(/[^0-9]/g, '');
      const hasValidPhone = Boolean(phone && phone.length >= 6);
      if (!hasValidPhone) {
        signal_match = false;
        rejection_reasons.push('MISSING_REQUIRED_SIGNAL_PHONE');
      }
    } else if (s === 'LINKEDIN') {
      const li = (candidate.linkedin || '').trim();
      const hasValidLinkedin = Boolean(li && li.startsWith('http') && !li.includes('undefined'));
      const isGuessed = candidate.linkedin_signal_status === 'INVALID_GUESSED_SIGNAL' || candidate.linkedin_observed_url === false;
      if (!hasValidLinkedin || isGuessed) {
        signal_match = false;
        rejection_reasons.push('MISSING_REQUIRED_SIGNAL_LINKEDIN');
      }
    } else if (s === 'WEBSITE') {
      const web = (candidate.website || '').trim();
      if (!web || !web.startsWith('http')) {
        signal_match = false;
        rejection_reasons.push('MISSING_REQUIRED_SIGNAL_WEBSITE');
      }
    } else if (s === 'INSTAGRAM') {
      const ig = (candidate.instagram || '').trim();
      if (!ig) {
        signal_match = false;
        rejection_reasons.push('MISSING_REQUIRED_SIGNAL_INSTAGRAM');
      }
    } else if (s === 'FACEBOOK') {
      const fb = (candidate.facebook || '').trim();
      if (!fb) {
        signal_match = false;
        rejection_reasons.push('MISSING_REQUIRED_SIGNAL_FACEBOOK');
      }
    }
  }

  // ============================================
  // 4. PHYSICAL EVIDENCE & PROVENANCE CHECK
  // ============================================
  let evidence_match = true;
  if (!candidate.provenance && !candidate.geo_evidence) {
    evidence_match = false;
    rejection_reasons.push('MISSING_PHYSICAL_EVIDENCE_OR_PROVENANCE');
  }

  const admitted = entity_match && geo_match && signal_match && evidence_match && canonical_person_match;

  return {
    admitted,
    entity_match,
    geo_match,
    geo_child_match,
    geo_parent_match,
    signal_match,
    evidence_match,
    canonical_person_match,
    candidate_canonical_province: geoHierarchyRes.candidate_canonical_province,
    mission_canonical_province: geoHierarchyRes.mission_canonical_province,
    rejection_reasons
  };
}

/**
 * 3. Source Capability Verification:
 * Validates whether a source is capable of certifying results for the given mission.
 * If not, the source must NOT be executed.
 */
export function isSourceAdmissibleForMission(
  capability: SourceCapability,
  spec: MissionConstraints
): {
  admissible: boolean;
  rejection_reason?: string;
} {
  // 1. Entity Type support
  if (!capability.supported_entity_types.includes(spec.entity_type)) {
    return {
      admissible: false,
      rejection_reason: `SOURCE_DOES_NOT_SUPPORT_ENTITY_TYPE_${spec.entity_type}`
    };
  }

  // 2. Geo Level support
  if (spec.required_geo_level === 'NEIGHBORHOOD' && !capability.has_neighborhood_evidence) {
    return {
      admissible: false,
      rejection_reason: 'SOURCE_LACKS_NEIGHBORHOOD_LEVEL_EVIDENCE'
    };
  }

  // 3. Signal support
  for (const sig of spec.required_signals) {
    if (!capability.supported_signals.includes(sig)) {
      return {
        admissible: false,
        rejection_reason: `SOURCE_LACKS_SIGNAL_CAPABILITY_${sig}`
      };
    }
  }

  // 4. Province restrictions if applicable
  if (capability.supported_provinces && !capability.supported_provinces.includes('ALL')) {
    const normProv = normalizeSearchText(spec.geo_province);
    const matches = capability.supported_provinces.some(p => normProv.includes(p) || p.includes(normProv));
    if (!matches) {
      return {
        admissible: false,
        rejection_reason: `SOURCE_RESTRICTED_TO_OTHER_PROVINCES`
      };
    }
  }

  // 5. Neighborhood restrictions if applicable
  if (spec.required_geo_level === 'NEIGHBORHOOD' && capability.supported_neighborhoods && !capability.supported_neighborhoods.includes('ALL')) {
    const targetNeighborhood = spec.geo_neighborhood;
    if (targetNeighborhood && !capability.supported_neighborhoods.includes(targetNeighborhood)) {
      return {
        admissible: false,
        rejection_reason: `SOURCE_DOES_NOT_SUPPORT_NEIGHBORHOOD_${targetNeighborhood}`
      };
    }
  }

  return { admissible: true };
}
