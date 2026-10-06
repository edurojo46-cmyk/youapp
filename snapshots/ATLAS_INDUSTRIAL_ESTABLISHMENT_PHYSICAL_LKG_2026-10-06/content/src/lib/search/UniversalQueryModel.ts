// Universal Query Intent Model with Multidimensional Work Taxonomy & Geographic People Discovery
import { WorkConceptResolver, type WorkConcept } from './WorkConceptResolver';

export type LocationRelationType = 
  | 'RESIDES_IN'
  | 'WORKS_IN'
  | 'PROFESSIONAL_PRACTICE_IN'
  | 'BUSINESS_LOCATED_IN'
  | 'ORGANIZATION_LOCATED_IN'
  | 'TEACHES_IN'
  | 'STUDIES_IN'
  | 'SERVES_AREA'
  | 'PUBLIC_ACTIVITY_IN'
  | 'SOCIAL_LOCATION_DECLARED'
  | 'FISCAL_DOMICILE'
  | 'LEGAL_DOMICILE'
  | 'UNKNOWN_RELATION';

export interface CanonicalGeography {
  country: string;
  city: string;
  commune?: string;
  neighborhood?: string;
  canonical_name: string;
  aliases: string[];
}

export const CANONICAL_CABALLITO: CanonicalGeography = {
  country: 'Argentina',
  city: 'Ciudad Autónoma de Buenos Aires',
  commune: 'Comuna 6',
  neighborhood: 'Caballito',
  canonical_name: 'Caballito',
  aliases: ['caballito', 'comuna 6', 'caba comuna 6', 'comuna 6 caba', 'barrio de caballito']
};

export interface QueryIntent {
  raw_query?: string;
  person_name?: string;
  person_type?: 'PERSON' | 'BUSINESS' | 'SERVICE' | 'ORGANIZATION' | 'UNKNOWN';
  profession?: string;
  occupation?: string;
  activity?: string;
  trade?: string;
  service?: string;
  role_class?: string;
  role?: string;
  organization?: string;
  
  // Geographic fields
  geography?: string;
  country?: string;
  city?: string;
  commune?: string;
  neighborhood?: string;
  canonical_geography?: CanonicalGeography;
  
  // Location relation
  geography_relation?: LocationRelationType;
  location_relation?: LocationRelationType;
  preferred_relations?: LocationRelationType[];
  
  // Contact & presence filters
  has_email?: boolean;
  has_phone?: boolean;
  has_website?: boolean;
  has_social?: boolean;
  current_activity?: boolean;
  
  source?: string;
  free_text?: string;
  intent_confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  query_specificity: 'HIGH' | 'MEDIUM' | 'BROAD';
  work_concept?: WorkConcept;
}

const GEOGRAPHY_ALIASES: Record<string, { label: string; canonical?: CanonicalGeography; isCaba?: boolean }> = {
  'caballito': { label: 'CABALLITO', canonical: CANONICAL_CABALLITO, isCaba: true },
  'comuna 6': { label: 'CABALLITO', canonical: CANONICAL_CABALLITO, isCaba: true },
  'caba comuna 6': { label: 'CABALLITO', canonical: CANONICAL_CABALLITO, isCaba: true },
  'comuna 6 caba': { label: 'CABALLITO', canonical: CANONICAL_CABALLITO, isCaba: true },
  'barrio de caballito': { label: 'CABALLITO', canonical: CANONICAL_CABALLITO, isCaba: true },
  'caba': { label: 'CABA', isCaba: true },
  'capital federal': { label: 'CABA', isCaba: true },
  'ciudad autonoma de buenos aires': { label: 'CABA', isCaba: true },
  'ciudad autónoma de buenos aires': { label: 'CABA', isCaba: true },
  'ciudad de buenos aires': { label: 'CABA', isCaba: true },
  'buenos aires': { label: 'BUENOS AIRES' },
  'córdoba': { label: 'CORDOBA' },
  'cordoba': { label: 'CORDOBA' },
  'rosario': { label: 'ROSARIO' },
  'mendoza': { label: 'MENDOZA' },
  'argentina': { label: 'ARGENTINA' }
};

const KNOWN_ROLES = ['director', 'directora', 'presidente', 'presidenta', 'secretario', 'secretaria', 'ceo', 'rector', 'rectora', 'gerente', 'jefe', 'jefa', 'coordinador', 'coordinadora'];

export class QueryIntentParser {
  /**
   * Deterministic semantic parser for natural language queries with geographic and contact understanding
   */
  static parse(query: string): QueryIntent {
    const rawLower = query.toLowerCase().trim();
    const rawTokens = rawLower.split(/\s+/).filter(Boolean);
    
    let workConcept: WorkConcept | null = null;
    let geography: string | undefined;
    let canonical_geography: CanonicalGeography | undefined;
    let neighborhood: string | undefined;
    let commune: string | undefined;
    let city: string | undefined;
    let country: string | undefined;
    let location_relation: LocationRelationType | undefined;
    let preferred_relations: LocationRelationType[] = [];
    let has_email = false;
    let has_phone = false;
    let has_website = false;
    let has_social = false;
    let current_activity = true;
    let role: string | undefined;
    let person_name_tokens: string[] = [];

    // Check contact flags
    if (rawLower.includes('con email') || rawLower.includes('con correo') || rawLower.includes('con mail') || rawLower.includes('emails') || rawLower.includes('email')) {
      has_email = true;
    }
    if (rawLower.includes('con telefono') || rawLower.includes('con teléfono') || rawLower.includes('con whatsapp') || rawLower.includes('telefono')) {
      has_phone = true;
    }
    if (rawLower.includes('con web') || rawLower.includes('con website') || rawLower.includes('con sitio')) {
      has_website = true;
    }
    if (rawLower.includes('con redes') || rawLower.includes('con redes sociales') || rawLower.includes('con linkedin') || rawLower.includes('con instagram')) {
      has_social = true;
    }

    // Check relation verbs
    if (rawLower.includes('que viven') || rawLower.includes('que vive') || rawLower.includes('viven en') || rawLower.includes('residen en') || rawLower.includes('vecinos de')) {
      location_relation = 'RESIDES_IN';
      preferred_relations = ['RESIDES_IN'];
    } else if (rawLower.includes('que trabajan') || rawLower.includes('que trabaja') || rawLower.includes('trabajan en') || rawLower.includes('empleados en')) {
      location_relation = 'WORKS_IN';
      preferred_relations = ['WORKS_IN', 'PROFESSIONAL_PRACTICE_IN'];
    } else if (rawLower.includes('ejercen en') || rawLower.includes('consultorio en') || rawLower.includes('estudio en')) {
      location_relation = 'PROFESSIONAL_PRACTICE_IN';
      preferred_relations = ['PROFESSIONAL_PRACTICE_IN', 'WORKS_IN'];
    } else if (rawLower.includes('comerciantes') || rawLower.includes('negocio en') || rawLower.includes('local en')) {
      preferred_relations = ['BUSINESS_LOCATED_IN', 'WORKS_IN'];
    } else if (rawLower.includes('docentes') || rawLower.includes('profesores') || rawLower.includes('enseñan')) {
      preferred_relations = ['TEACHES_IN', 'WORKS_IN'];
    }

    // 1. Detect Multi-Word Geographies First
    let consumedIndices = new Set<number>();

    for (let i = 0; i < rawTokens.length; i++) {
      if (consumedIndices.has(i)) continue;

      for (let len = 5; len >= 1; len--) {
        if (i + len <= rawTokens.length) {
          const phrase = rawTokens.slice(i, i + len).join(' ');
          if (GEOGRAPHY_ALIASES[phrase]) {
            const geoInfo = GEOGRAPHY_ALIASES[phrase];
            geography = geoInfo.label;
            if (geoInfo.canonical) {
              canonical_geography = geoInfo.canonical;
              neighborhood = geoInfo.canonical.neighborhood;
              commune = geoInfo.canonical.commune;
              city = geoInfo.canonical.city;
              country = geoInfo.canonical.country;
            } else if (geoInfo.isCaba) {
              city = 'Ciudad Autónoma de Buenos Aires';
              country = 'Argentina';
            }
            for (let k = 0; k < len; k++) consumedIndices.add(i + k);
            break;
          }
        }
      }
    }

    // 2. Identify Work Concept
    const nonGeoTokens = rawTokens.filter((_, idx) => !consumedIndices.has(idx));
    const nonGeoPhrase = nonGeoTokens.join(' ');
    
    workConcept = WorkConceptResolver.resolve(nonGeoPhrase);

    if (!workConcept) {
      for (const token of nonGeoTokens) {
        if (['en', 'de', 'el', 'la', 'los', 'las', 'un', 'una', 'y', 'que', 'con'].includes(token)) continue;
        const candidateConcept = WorkConceptResolver.resolve(token);
        if (candidateConcept) {
          workConcept = candidateConcept;
          break;
        }
      }
    }

    // Default preferred relations based on work concept if not explicitly set
    if (preferred_relations.length === 0 && workConcept) {
      if (workConcept.canonical_id === 'MEDICO' || workConcept.canonical_id === 'ABOGADO' || workConcept.canonical_id === 'ARQUITECTO' || workConcept.canonical_id === 'CONTADOR' || workConcept.canonical_id === 'PSICOLOGO') {
        preferred_relations = ['PROFESSIONAL_PRACTICE_IN', 'WORKS_IN'];
      } else if (workConcept.canonical_id === 'DOCENTE') {
        preferred_relations = ['TEACHES_IN', 'WORKS_IN'];
      } else if (workConcept.canonical_id === 'COMERCIANTE' || workConcept.canonical_id === 'EMPRESARIO') {
        preferred_relations = ['BUSINESS_LOCATED_IN', 'WORKS_IN'];
      } else if (workConcept.canonical_id === 'PROGRAMADOR') {
        preferred_relations = ['WORKS_IN', 'SOCIAL_LOCATION_DECLARED'];
      } else {
        preferred_relations = ['WORKS_IN', 'SERVES_AREA'];
      }
    }

    // 3. Extract remaining tokens for Name or Roles
    for (let i = 0; i < rawTokens.length; i++) {
      if (consumedIndices.has(i)) continue;
      const token = rawTokens[i];

      if (['en', 'de', 'el', 'la', 'los', 'las', 'del', 'al', 'con', 'que', 'viven', 'vive', 'trabajan', 'trabaja', 'personas', 'persona', 'gente', 'email', 'correo', 'mail', 'telefono', 'teléfono', 'redes'].includes(token)) {
        continue;
      }

      if (workConcept && (workConcept.aliases.includes(token) || workConcept.canonical_id.toLowerCase() === token)) {
        continue;
      }

      if (KNOWN_ROLES.includes(token)) {
        role = token.toUpperCase();
        continue;
      }

      person_name_tokens.push(token);
    }

    let person_name: string | undefined;
    if (person_name_tokens.length > 0) {
      const candidateName = person_name_tokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
      if (!['En', 'De', 'Persona', 'Personas', 'Comercio', 'Empresa', 'Gente'].includes(candidateName)) {
        person_name = candidateName;
      }
    }

    let query_specificity: 'HIGH' | 'MEDIUM' | 'BROAD' = 'MEDIUM';
    if (person_name && (workConcept || geography)) {
      query_specificity = 'HIGH';
    } else if (!workConcept && !person_name && geography) {
      query_specificity = 'MEDIUM';
    } else if (!workConcept && !person_name) {
      query_specificity = 'BROAD';
    }

    const intent: QueryIntent = {
      raw_query: query,
      person_name,
      person_type: 'PERSON',
      geography,
      country: country || (geography ? 'Argentina' : undefined),
      city: city || (geography === 'CABALLITO' || geography === 'CABA' ? 'Ciudad Autónoma de Buenos Aires' : undefined),
      commune: commune || (geography === 'CABALLITO' ? 'Comuna 6' : undefined),
      neighborhood: neighborhood || (geography === 'CABALLITO' ? 'Caballito' : undefined),
      canonical_geography,
      geography_relation: location_relation,
      location_relation,
      preferred_relations,
      has_email,
      has_phone,
      has_website,
      has_social,
      current_activity,
      role,
      free_text: query,
      intent_confidence: (workConcept || geography || person_name) ? 'HIGH' : 'LOW',
      query_specificity,
      work_concept: workConcept || undefined
    };

    if (workConcept) {
      switch (workConcept.dimension) {
        case 'PROFESSION':
          intent.profession = workConcept.canonical_id;
          intent.activity = workConcept.related_activities[0];
          break;
        case 'OCCUPATION':
          intent.occupation = workConcept.canonical_id;
          intent.activity = workConcept.related_activities[0];
          intent.profession = workConcept.canonical_id;
          break;
        case 'TRADE':
          intent.trade = workConcept.canonical_id;
          intent.service = workConcept.related_activities[0];
          intent.profession = workConcept.canonical_id;
          break;
        case 'ROLE_CLASS':
          intent.role_class = workConcept.canonical_id;
          intent.profession = workConcept.canonical_id;
          break;
        case 'SERVICE':
          intent.service = workConcept.canonical_id;
          break;
        case 'ACTIVITY':
          intent.activity = workConcept.canonical_id;
          break;
      }
    }

    return intent;
  }
}
