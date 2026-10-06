/**
 * ATLAS PUBLIC TAXONOMY VALIDATOR V1
 * @server/services/industrial/AtlasPublicTaxonomyValidator.ts
 * 
 * Verifies public taxonomy proposals (OSM, Wikidata, CLAE/INDEC) proposed by LLM / autonomous discovery.
 * Prevents hallucinations, cross-category contamination, and invalid syntax from entering Atlas SSOT.
 * Gemini proposes — Atlas proves.
 * 
 * Architecture Invariant:
 * Generic placeholders (shop=yes, amenity=yes, etc.) must NOT count as specific executable taxonomy.
 * Classify: GENERIC_FAMILY_TAXONOMY vs MISSION_SPECIFIC_TAXONOMY.
 * Only specific executable taxonomy allows PUBLIC_TAXONOMY_VALIDATED = TRUE.
 */

export type TaxonomyClassification = 'MISSION_SPECIFIC_TAXONOMY' | 'GENERIC_FAMILY_TAXONOMY';

export const GENERIC_FAMILY_TAXONOMY_TAGS = new Set([
  'shop=yes',
  'amenity=yes',
  'office=yes',
  'craft=yes',
  'leisure=yes',
  'tourism=yes',
  'industrial=yes',
  'commercial=yes',
  'healthcare=yes',
  'club=yes',
  'emergency=yes',
  'man_made=yes',
  'landuse=yes'
]);

export function isGenericFamilyTaxonomy(tag: string): boolean {
  if (!tag || typeof tag !== 'string') return true;
  const trimmed = tag.trim().toLowerCase();
  const parts = trimmed.split('=');
  if (parts.length !== 2) return true;
  const [, value] = parts;
  if (!value || value === 'yes' || value === 'no' || value === 'true' || value === 'false' || value === 'unknown' || value === 'any') {
    return true;
  }
  return GENERIC_FAMILY_TAXONOMY_TAGS.has(trimmed);
}

export function hasSpecificTaxonomy(osmTags?: string[] | null): boolean {
  if (!osmTags || !Array.isArray(osmTags) || osmTags.length === 0) return false;
  return osmTags.some(t => !isGenericFamilyTaxonomy(t));
}

export interface OsmTagValidationResult {
  valid: boolean;
  reason?: string;
  cleaned?: string;
  taxonomy_classification: TaxonomyClassification;
  is_specific: boolean;
}

export interface TaxonomyValidationResult {
  valid: boolean;
  public_taxonomy_validated: boolean;
  issues: string[];
  sanitized_osm_tags: string[];
  specific_osm_tags: string[];
  generic_osm_tags: string[];
  sanitized_wikidata_ids: string[];
  sanitized_clae_codes: string[];
  canonical_candidate: string;
}

export class AtlasPublicTaxonomyValidator {
  private static instance: AtlasPublicTaxonomyValidator;

  // Recognized OSM primary keys for establishments, companies, and facilities
  private static readonly VALID_OSM_PRIMARY_KEYS = new Set([
    'amenity',
    'shop',
    'craft',
    'office',
    'leisure',
    'tourism',
    'industrial',
    'healthcare',
    'commercial',
    'landuse',
    'man_made',
    'club',
    'emergency'
  ]);

  public static getInstance(): AtlasPublicTaxonomyValidator {
    if (!this.instance) {
      this.instance = new AtlasPublicTaxonomyValidator();
    }
    return this.instance;
  }

  /**
   * Validates OSM tag format: key=value
   * Ensures key is a recognized physical feature namespace, value is recognized,
   * and classifies into MISSION_SPECIFIC_TAXONOMY vs GENERIC_FAMILY_TAXONOMY.
   */
  public validateOsmTag(tag: string): OsmTagValidationResult {
    if (!tag || typeof tag !== 'string') {
      return { valid: false, reason: 'Empty tag', taxonomy_classification: 'GENERIC_FAMILY_TAXONOMY', is_specific: false };
    }

    const trimmed = tag.trim().replace(/^['"]|['"]$/g, '');
    const parts = trimmed.split('=');
    if (parts.length !== 2) {
      return { valid: false, reason: `Tag does not conform to key=value syntax: "${trimmed}"`, taxonomy_classification: 'GENERIC_FAMILY_TAXONOMY', is_specific: false };
    }

    const [key, value] = parts.map(p => p.trim().toLowerCase());
    if (!key || !value) {
      return { valid: false, reason: `Invalid key or value in "${trimmed}"`, taxonomy_classification: 'GENERIC_FAMILY_TAXONOMY', is_specific: false };
    }

    if (!AtlasPublicTaxonomyValidator.VALID_OSM_PRIMARY_KEYS.has(key)) {
      return { valid: false, reason: `OSM key "${key}" is not a recognized commercial/facility key`, taxonomy_classification: 'GENERIC_FAMILY_TAXONOMY', is_specific: false };
    }

    // Value check: alphanumeric, underscore, hyphen
    if (!/^[a-z0-9_-]+$/.test(value)) {
      return { valid: false, reason: `OSM value "${value}" contains disallowed characters (quotes/spaces/punctuation)`, taxonomy_classification: 'GENERIC_FAMILY_TAXONOMY', is_specific: false };
    }

    const isGeneric = isGenericFamilyTaxonomy(`${key}=${value}`);

    return {
      valid: true,
      cleaned: `${key}=${value}`,
      taxonomy_classification: isGeneric ? 'GENERIC_FAMILY_TAXONOMY' : 'MISSION_SPECIFIC_TAXONOMY',
      is_specific: !isGeneric
    };
  }

  /**
   * Validates Wikidata ID format: Q followed by digits
   */
  public validateWikidataId(id: string): { valid: boolean; reason?: string; cleaned?: string } {
    if (!id || typeof id !== 'string') {
      return { valid: false, reason: 'Empty Wikidata ID' };
    }
    const trimmed = id.trim().toUpperCase();
    if (!/^Q\d+$/.test(trimmed)) {
      return { valid: false, reason: `Invalid Wikidata ID format: "${trimmed}"` };
    }
    return { valid: true, cleaned: trimmed };
  }

  /**
   * Validates CLAE / INDEC activity code: 4 to 6 digits
   */
  public validateClaeCode(code: string): { valid: boolean; reason?: string; cleaned?: string } {
    if (!code || typeof code !== 'string') {
      return { valid: false, reason: 'Empty CLAE code' };
    }
    const digitsOnly = code.trim().replace(/\D/g, '');
    if (digitsOnly.length < 3 || digitsOnly.length > 6) {
      return { valid: false, reason: `Invalid CLAE code: "${code}" (must be 3-6 digits)` };
    }
    // Normalize to standard 4-digit CLAE prefix to comply with AtlasConceptIntegrityGate
    const normalized = digitsOnly.length >= 4 ? digitsOnly.slice(0, 4) : digitsOnly;
    return { valid: true, cleaned: normalized };
  }

  /**
   * Cross-dimensional taxonomy validation
   * AI only proposes. Atlas validates.
   */
  public validateHypotheses(params: {
    canonical_candidate: string;
    osm_tags?: string[];
    wikidata_ids?: string[];
    clae_codes?: string[];
  }): TaxonomyValidationResult {
    const issues: string[] = [];
    const sanitized_osm: string[] = [];
    const specific_osm: string[] = [];
    const generic_osm: string[] = [];
    const sanitized_wiki: string[] = [];
    const sanitized_clae: string[] = [];

    const canonical = (params.canonical_candidate || '').trim();
    if (!canonical || canonical.length < 3) {
      issues.push('Canonical candidate name is missing or too short');
    }

    for (const tag of params.osm_tags || []) {
      const res = this.validateOsmTag(tag);
      if (res.valid && res.cleaned) {
        sanitized_osm.push(res.cleaned);
        if (res.is_specific) {
          specific_osm.push(res.cleaned);
        } else {
          generic_osm.push(res.cleaned);
        }
      } else if (res.reason) {
        issues.push(`OSM tag rejected: ${res.reason}`);
      }
    }

    for (const id of params.wikidata_ids || []) {
      const res = this.validateWikidataId(id);
      if (res.valid && res.cleaned) {
        sanitized_wiki.push(res.cleaned);
      } else if (res.reason) {
        issues.push(`Wikidata ID rejected: ${res.reason}`);
      }
    }

    for (const code of params.clae_codes || []) {
      const res = this.validateClaeCode(code);
      if (res.valid && res.cleaned) {
        sanitized_clae.push(res.cleaned);
      } else if (res.reason) {
        issues.push(`CLAE code rejected: ${res.reason}`);
      }
    }

    // Must have at least one valid public taxonomy mapping to be bridgeable
    if (sanitized_osm.length === 0 && sanitized_clae.length === 0 && sanitized_wiki.length === 0) {
      issues.push('No valid public taxonomy anchors (OSM, CLAE, or Wikidata) were verified');
    }

    // PUBLIC_TAXONOMY_VALIDATED requires sufficient granularity (not merely generic placeholder like shop=yes)
    const hasSpecificPublicTaxonomy = specific_osm.length > 0 || sanitized_clae.length > 0 || sanitized_wiki.length > 0;
    if (!hasSpecificPublicTaxonomy && generic_osm.length > 0) {
      issues.push('Only generic family placeholders provided (e.g. shop=yes); mission-specific taxonomy is required');
    }

    return {
      valid: issues.length === 0,
      public_taxonomy_validated: issues.length === 0 && hasSpecificPublicTaxonomy,
      issues,
      sanitized_osm_tags: Array.from(new Set(sanitized_osm)),
      specific_osm_tags: Array.from(new Set(specific_osm)),
      generic_osm_tags: Array.from(new Set(generic_osm)),
      sanitized_wikidata_ids: Array.from(new Set(sanitized_wiki)),
      sanitized_clae_codes: Array.from(new Set(sanitized_clae)),
      canonical_candidate: canonical
    };
  }
}
