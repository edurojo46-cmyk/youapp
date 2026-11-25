/**
 * ATLAS GEOGRAPHY DEPTH RESOLVER V1
 * 
 * Deepens geographic specificity from Province down to City/Locality
 * for the ~520,122 individuals with province known but city unknown.
 * 
 * Invariants:
 * - ORGANIZATION_LOCATION_TO_PERSON_RESIDENCE = 0 (Never assume company HQ is where the person lives).
 * - Strictly separates: WORKS_IN, RESIDES_IN, SERVES_IN, ASSOCIATED_WITH.
 * - Extracts granular location only when explicitly bound to the person's functional unit or judicial/academic district.
 */

export interface GeographyResolutionInput {
  person_id: string;
  source_id: string;
  organization?: string | null;
  job_title?: string | null;
  workplace_name?: string | null;
  raw_jurisdiction?: string | null;
  current_province: string;
}

export type GeoRelationType = 'WORKS_IN' | 'RESIDES_IN' | 'SERVES_IN' | 'ASSOCIATED_WITH';

export interface GeographyResolutionResult {
  person_id: string;
  province: string;
  city: string | null;
  locality: string | null;
  relation_type: GeoRelationType;
  confidence: number;
  source_evidence: string;
  is_resolved: boolean;
}

export class AtlasGeographyDepthResolver {
  // Known person-specific jurisdictional mappings in Argentine public & institutional registers
  private static readonly CITY_PATTERNS: { regex: RegExp; city: string; locality?: string; relation: GeoRelationType; confidence: number }[] = [
    // Municipalities
    { regex: /municipalidad de rosario/i, city: 'Rosario', locality: 'Rosario Centro', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de cordoba/i, city: 'Córdoba', locality: 'Córdoba Capital', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de la plata/i, city: 'La Plata', locality: 'La Plata', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de mar del plata|general pueyrredon/i, city: 'Mar del Plata', locality: 'Mar del Plata', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de san miguel de tucuman/i, city: 'San Miguel de Tucumán', locality: 'San Miguel de Tucumán', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de salta/i, city: 'Salta', locality: 'Salta Capital', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de mendoza/i, city: 'Mendoza', locality: 'Mendoza Capital', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de santa fe/i, city: 'Santa Fe', locality: 'Santa Fe Capital', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de quilmes/i, city: 'Quilmes', locality: 'Quilmes', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /municipalidad de la matanza/i, city: 'San Justo', locality: 'La Matanza', relation: 'WORKS_IN', confidence: 0.99 },
    
    // Federal Judicial Districts (Juzgados y Fiscalías con sede física unívoca)
    { regex: /juzgado federal.*quilmes|fiscalia.*quilmes/i, city: 'Quilmes', locality: 'Quilmes', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*san martin|tribunal oral.*san martin/i, city: 'San Martín', locality: 'General San Martín', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*lomas de zamora/i, city: 'Lomas de Zamora', locality: 'Lomas de Zamora', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*moron/i, city: 'Morón', locality: 'Morón', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*campana/i, city: 'Campana', locality: 'Campana', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*san nicolas/i, city: 'San Nicolás', locality: 'San Nicolás de los Arroyos', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*bahia blanca/i, city: 'Bahía Blanca', locality: 'Bahía Blanca', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*mar del plata/i, city: 'Mar del Plata', locality: 'Mar del Plata', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*dolores/i, city: 'Dolores', locality: 'Dolores', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*azul/i, city: 'Azul', locality: 'Azul', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*rosario/i, city: 'Rosario', locality: 'Rosario', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*cordoba/i, city: 'Córdoba', locality: 'Córdoba Capital', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*rio cuarto/i, city: 'Río Cuarto', locality: 'Río Cuarto', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*villa maria/i, city: 'Villa María', locality: 'Villa María', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*bell ville/i, city: 'Bell Ville', locality: 'Bell Ville', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*resistencia/i, city: 'Resistencia', locality: 'Resistencia', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*posadas/i, city: 'Posadas', locality: 'Posadas', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*corrientes/i, city: 'Corrientes', locality: 'Corrientes Capital', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*goya/i, city: 'Goya', locality: 'Goya', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*parana/i, city: 'Paraná', locality: 'Paraná', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*concepcion del uruguay/i, city: 'Concepción del Uruguay', locality: 'Concepción del Uruguay', relation: 'SERVES_IN', confidence: 0.98 },
    { regex: /juzgado federal.*concordia/i, city: 'Concordia', locality: 'Concordia', relation: 'SERVES_IN', confidence: 0.98 },

    // Hospitals & Specialized Health Centers with physical location
    { regex: /hospital.*el cruce/i, city: 'Florencio Varela', locality: 'Florencio Varela', relation: 'WORKS_IN', confidence: 0.98 },
    { regex: /hospital.*posadas/i, city: 'El Palomar', locality: 'Morón', relation: 'WORKS_IN', confidence: 0.98 },
    { regex: /hospital.*garrahan/i, city: 'CABA', locality: 'Parque Patricios', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /hospital.*durand/i, city: 'CABA', locality: 'Caballito', relation: 'WORKS_IN', confidence: 0.99 },
    { regex: /hospital.*italiano/i, city: 'CABA', locality: 'Almagro', relation: 'WORKS_IN', confidence: 0.99 }
  ];

  public resolveGranularLocation(input: GeographyResolutionInput): GeographyResolutionResult {
    const combinedContext = `${input.organization || ''} ${input.job_title || ''} ${input.workplace_name || ''} ${input.raw_jurisdiction || ''}`;

    for (const pattern of AtlasGeographyDepthResolver.CITY_PATTERNS) {
      if (pattern.regex.test(combinedContext)) {
        return {
          person_id: input.person_id,
          province: input.current_province,
          city: pattern.city,
          locality: pattern.locality || pattern.city,
          relation_type: pattern.relation,
          confidence: pattern.confidence,
          source_evidence: `Resolved from functional workplace assignment in: "${combinedContext.trim()}"`,
          is_resolved: true
        };
      }
    }

    // Explicit municipal source heuristic
    if (input.source_id === 'MASS_MUNI_ROSARIO_OPEN_DATA') {
      return {
        person_id: input.person_id,
        province: 'Santa Fe',
        city: 'Rosario',
        locality: 'Rosario Centro',
        relation_type: 'WORKS_IN',
        confidence: 0.99,
        source_evidence: 'Direct Municipal Staff Directory of Rosario',
        is_resolved: true
      };
    }

    if (input.source_id === 'MASS_MUNI_CORDOBA_OPEN_DATA') {
      return {
        person_id: input.person_id,
        province: 'Córdoba',
        city: 'Córdoba',
        locality: 'Córdoba Capital',
        relation_type: 'WORKS_IN',
        confidence: 0.99,
        source_evidence: 'Direct Municipal Staff Directory of Córdoba',
        is_resolved: true
      };
    }

    // Default: Province is known, but granular city cannot be assumed without explicit person-specific evidence
    return {
      person_id: input.person_id,
      province: input.current_province,
      city: null,
      locality: null,
      relation_type: 'WORKS_IN',
      confidence: 0.0,
      source_evidence: 'Granular city unverified (avoided organization HQ inference)',
      is_resolved: false
    };
  }
}
