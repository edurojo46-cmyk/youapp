/**
 * ATLAS CONCEPT INTEGRITY GATE V1
 * @server/services/industrial/AtlasConceptIntegrityGate.ts
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - NO category-specific hardcoding in business logic.
 * - Declarative, cross-dimensional taxonomy validation rules.
 * - Runs on concept ingestion and periodic system audits.
 * - Detects:
 *   1. CANONICAL_TAG_CONTRADICTION
 *   2. CROSS_CONCEPT_PAYLOAD_DUPLICATION
 *   3. CLAIMED_TAXONOMY_MISMATCH
 *   4. INVALID_OSM_MAPPING
 *   5. INVALID_CLAE_MAPPING
 *   6. SUSPICIOUS_SEMANTIC_COPY
 */

import type pg from 'pg';
import type { AtlasConceptDefinition } from './AtlasConceptRegistry.ts';

export type IntegrityViolationCode =
  | 'CANONICAL_TAG_CONTRADICTION'
  | 'CROSS_CONCEPT_PAYLOAD_DUPLICATION'
  | 'CLAIMED_TAXONOMY_MISMATCH'
  | 'INVALID_OSM_MAPPING'
  | 'INVALID_CLAE_MAPPING'
  | 'SUSPICIOUS_SEMANTIC_COPY';

export interface IntegrityIssue {
  code: IntegrityViolationCode;
  concept_id: string;
  canonical_name: string;
  message: string;
  field: string;
  invalid_value: any;
  suggested_fix?: any;
}

export interface ConceptValidationResult {
  valid: boolean;
  concept_id: string;
  issues: IntegrityIssue[];
}

export interface RegistryAuditReport {
  timestamp: string;
  total_concepts_audited: number;
  valid_concepts_count: number;
  invalid_concepts_count: number;
  issues_by_code: Record<IntegrityViolationCode, number>;
  issues: IntegrityIssue[];
  duplicate_payload_groups: number;
  cross_category_contaminations: number;
  passed: boolean;
}

// Declarative Domain Incompatibility Rules (Driven by standardized OSM/UN-ISIC taxonomies)
interface DomainRule {
  domain: string;
  nameMatches: RegExp[];
  forbiddenOsmPatterns: RegExp[];
  forbiddenSynonymPatterns: RegExp[];
  mandatoryOsmKeys?: string[];
}

const DOMAIN_INCOMPATIBILITY_RULES: DomainRule[] = [
  {
    domain: 'MORTUARY_FUNERAL',
    nameMatches: [/pompas f[uú]nebres/i, /servicios funerarios/i, /velatorio/i, /cementerio/i, /crematorio/i],
    forbiddenOsmPatterns: [/hairdresser/i, /beauty/i, /laundry/i, /dry_cleaning/i, /car_wash/i],
    forbiddenSynonymPatterns: [/peluquer[ií]a/i, /corte de pelo/i, /est[eé]tica/i, /tintorer[ií]a/i, /lavado/i]
  },
  {
    domain: 'LAUNDRY_TEXTILE_CLEANING',
    nameMatches: [/lavado y limpieza.*textil/i, /lavander[ií]a/i, /tintorer[ií]a/i],
    forbiddenOsmPatterns: [/hairdresser/i, /beauty/i, /funeral/i, /car_wash/i, /restaurant/i],
    forbiddenSynonymPatterns: [/peluquer[ií]a/i, /barber[ií]a/i, /est[eé]tica/i, /corte de pelo/i, /velatorio/i]
  },
  {
    domain: 'PERSONAL_HAIR_BEAUTY',
    nameMatches: [/peluquer[ií]a/i, /tratamientos de belleza/i, /barber[ií]a/i],
    forbiddenOsmPatterns: [/funeral/i, /crematorium/i, /dry_cleaning/i, /laundry/i, /car_repair/i],
    forbiddenSynonymPatterns: [/pompas f[uú]nebres/i, /velatorio/i, /ata[uú]d/i, /lavander[ií]a/i, /tintorer[ií]a/i]
  },
  {
    domain: 'HEALTHCARE_PHARMACY',
    nameMatches: [/^farmacia/i, /medicamentos/i],
    forbiddenOsmPatterns: [/tourism=hotel/i, /shop=hairdresser/i, /amenity=restaurant/i, /shop=hardware/i],
    forbiddenSynonymPatterns: [/hotel/i, /alojamiento/i, /peluquer[ií]a/i, /ferreter[ií]a/i]
  },
  {
    domain: 'HOSPITALITY_HOTEL',
    nameMatches: [/alojamiento.*tur[ií]stico/i, /^hotel/i, /^hospedaje/i],
    forbiddenOsmPatterns: [/amenity=pharmacy/i, /shop=hairdresser/i, /shop=hardware/i, /craft=metal/i],
    forbiddenSynonymPatterns: [/farmacia/i, /remedio/i, /ferreter[ií]a/i, /mecanizado/i]
  },
  {
    domain: 'HARDWARE_RETAIL',
    nameMatches: [/^ferreter[ií]a/i, /art[ií]culos de ferreter[ií]a/i],
    forbiddenOsmPatterns: [/amenity=pharmacy/i, /shop=hairdresser/i, /tourism=hotel/i, /amenity=restaurant/i],
    forbiddenSynonymPatterns: [/farmacia/i, /peluquer[ií]a/i, /restaurante/i, /hospedaje/i]
  },
  {
    domain: 'METALLURGY_INDUSTRIAL',
    nameMatches: [/torner[ií]a/i, /mecanizado/i, /industria metal[uú]rgica/i, /fundici[oó]n/i],
    forbiddenOsmPatterns: [/shop=hairdresser/i, /shop=beauty/i, /amenity=restaurant/i, /shop=bakery/i, /tourism=hotel/i],
    forbiddenSynonymPatterns: [/peluquer[ií]a/i, /panader[ií]a/i, /gastronom[ií]a/i, /hotel/i]
  }
];

const VALID_OSM_KEY_PREFIXES = [
  'shop', 'amenity', 'craft', 'industrial', 'office', 'healthcare',
  'tourism', 'leisure', 'building', 'emergency', 'club', 'man_made',
  'landuse', 'power', 'railway', 'aeroway'
];

export class AtlasConceptIntegrityGate {
  private static instance: AtlasConceptIntegrityGate;

  public static getInstance(): AtlasConceptIntegrityGate {
    if (!this.instance) {
      this.instance = new AtlasConceptIntegrityGate();
    }
    return this.instance;
  }

  /**
   * Validates a single concept definition against declarative integrity invariants
   */
  public validateConcept(concept: AtlasConceptDefinition | any): ConceptValidationResult {
    const issues: IntegrityIssue[] = [];
    const conceptId = concept.concept_id || 'UNKNOWN';
    const name = concept.canonical_name || '';
    const osmTags: string[] = Array.isArray(concept.osm_tags) ? concept.osm_tags : [];
    const synonyms: string[] = Array.isArray(concept.synonyms) ? concept.synonyms : [];
    const claeCodes: string[] = Array.isArray(concept.clae_codes) ? concept.clae_codes : [];

    // 1. INVALID_OSM_MAPPING: Check tag syntax (key=value)
    for (const tag of osmTags) {
      if (!tag || typeof tag !== 'string' || !tag.includes('=')) {
        issues.push({
          code: 'INVALID_OSM_MAPPING',
          concept_id: conceptId,
          canonical_name: name,
          message: `Malformed OSM tag '${tag}'. Must follow 'key=value' format.`,
          field: 'osm_tags',
          invalid_value: tag
        });
        continue;
      }
      const [k, v] = tag.split('=');
      if (!VALID_OSM_KEY_PREFIXES.includes(k.trim().toLowerCase())) {
        issues.push({
          code: 'INVALID_OSM_MAPPING',
          concept_id: conceptId,
          canonical_name: name,
          message: `Unrecognized or non-standard OSM key prefix '${k}' in tag '${tag}'.`,
          field: 'osm_tags',
          invalid_value: tag
        });
      }
      if (!v || v.trim().length === 0) {
        issues.push({
          code: 'INVALID_OSM_MAPPING',
          concept_id: conceptId,
          canonical_name: name,
          message: `Empty OSM value in tag '${tag}'.`,
          field: 'osm_tags',
          invalid_value: tag
        });
      }
    }

    // 2. INVALID_CLAE_MAPPING: Check CLAE syntax if present
    for (const code of claeCodes) {
      if (!code || typeof code !== 'string') {
        issues.push({
          code: 'INVALID_CLAE_MAPPING',
          concept_id: conceptId,
          canonical_name: name,
          message: `Invalid CLAE code entry '${code}'.`,
          field: 'clae_codes',
          invalid_value: code
        });
      } else {
        const clean = code.trim();
        const isValid = /^\d{4}$/.test(clean) || /^(GRP_)?\d{3}$/.test(clean) || /^(DIV_)?\d{2}$/.test(clean) || /^(SEC_)?[A-U]$/.test(clean);
        if (!isValid) {
          issues.push({
            code: 'INVALID_CLAE_MAPPING',
            concept_id: conceptId,
            canonical_name: name,
            message: `CLAE code '${code}' does not match standard 4-digit or GRP/DIV/SEC specification.`,
            field: 'clae_codes',
            invalid_value: code
          });
        }
      }
    }

    // 3. CANONICAL_TAG_CONTRADICTION & SUSPICIOUS_SEMANTIC_COPY
    for (const rule of DOMAIN_INCOMPATIBILITY_RULES) {
      const matchesDomain = rule.nameMatches.some(re => re.test(name));
      if (!matchesDomain) continue;

      // Check OSM tags
      for (const tag of osmTags) {
        for (const badTagRe of rule.forbiddenOsmPatterns) {
          if (badTagRe.test(tag)) {
            issues.push({
              code: 'CANONICAL_TAG_CONTRADICTION',
              concept_id: conceptId,
              canonical_name: name,
              message: `Concept '${name}' (${rule.domain}) contains contradictory OSM tag '${tag}'.`,
              field: 'osm_tags',
              invalid_value: tag
            });
          }
        }
      }

      // Check Synonyms for cross-contamination
      for (const syn of synonyms) {
        for (const badSynRe of rule.forbiddenSynonymPatterns) {
          if (badSynRe.test(syn)) {
            issues.push({
              code: 'SUSPICIOUS_SEMANTIC_COPY',
              concept_id: conceptId,
              canonical_name: name,
              message: `Concept '${name}' (${rule.domain}) contains contaminated synonym '${syn}'.`,
              field: 'synonyms',
              invalid_value: syn
            });
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      concept_id: conceptId,
      issues
    };
  }

  /**
   * Performs an exhaustive global integrity audit of all concepts in the registry
   */
  public async auditRegistry(dbPool: pg.Pool): Promise<RegistryAuditReport> {
    const res = await dbPool.query(`
      SELECT concept_id, canonical_name, synonyms, aliases, osm_tags, clae_codes,
             wikidata_ids, categories, activities, required_evidence, semantic_features
      FROM public.atlas_concept_registry
      ORDER BY concept_id ASC;
    `);

    const allConcepts = res.rows;
    const issues: IntegrityIssue[] = [];
    const issuesByCode: Record<IntegrityViolationCode, number> = {
      CANONICAL_TAG_CONTRADICTION: 0,
      CROSS_CONCEPT_PAYLOAD_DUPLICATION: 0,
      CLAIMED_TAXONOMY_MISMATCH: 0,
      INVALID_OSM_MAPPING: 0,
      INVALID_CLAE_MAPPING: 0,
      SUSPICIOUS_SEMANTIC_COPY: 0
    };

    let validCount = 0;
    let invalidCount = 0;

    // 1. Single concept validations
    for (const c of allConcepts) {
      const v = this.validateConcept(c);
      if (v.valid) {
        validCount++;
      } else {
        invalidCount++;
        for (const iss of v.issues) {
          issues.push(iss);
          issuesByCode[iss.code] = (issuesByCode[iss.code] || 0) + 1;
        }
      }
    }

    // 2. Cross-concept validation: Detect non-hierarchical payload duplications
    const payloadMap = new Map<string, any[]>();
    for (const c of allConcepts) {
      const syns = Array.isArray(c.synonyms) ? c.synonyms.map((s: string) => s.trim().toLowerCase()).sort().join('|') : '';
      const osm = Array.isArray(c.osm_tags) ? c.osm_tags.map((s: string) => s.trim().toLowerCase()).sort().join('|') : '';
      if (!syns && !osm) continue;

      const sig = `${syns}:::${osm}`;
      if (!payloadMap.has(sig)) payloadMap.set(sig, []);
      payloadMap.get(sig)!.push(c);
    }

    let dupGroups = 0;
    for (const [sig, group] of payloadMap.entries()) {
      if (group.length > 1) {
        // Exclude legitimate hierarchical rollups (e.g., CLAE_7500 and CLAE_GRP_750 and CLAE_DIV_75, or Section D and Division 35)
        const isLegitRollup = group.every(item => {
          return group.every(other => {
            if (item.concept_id === other.concept_id) return true;
            if (item.concept_id.startsWith('CLAE_') && other.concept_id.startsWith('CLAE_')) {
              // Same canonical name across different hierarchical levels
              if (item.canonical_name.trim().toLowerCase() === other.canonical_name.trim().toLowerCase()) return true;
              const codeA = item.concept_id.replace(/^CLAE_(GRP_|DIV_|SEC_)?/, '');
              const codeB = other.concept_id.replace(/^CLAE_(GRP_|DIV_|SEC_)?/, '');
              if (codeA.slice(0, 2) === codeB.slice(0, 2)) return true;
            }
            return false;
          });
        });

        if (!isLegitRollup) {
          dupGroups++;
          issuesByCode.CROSS_CONCEPT_PAYLOAD_DUPLICATION++;
          for (const item of group) {
            issues.push({
              code: 'CROSS_CONCEPT_PAYLOAD_DUPLICATION',
              concept_id: item.concept_id,
              canonical_name: item.canonical_name,
              message: `Shares identical semantic payload with unrelated concepts in group: ${group.map(g => g.concept_id).join(', ')}`,
              field: 'payload',
              invalid_value: sig
            });
          }
        }
      }
    }

    // 3. Consecutive CLAE Neighbor Leak Detection
    const claeOnly = allConcepts.filter(c => c.concept_id.startsWith('CLAE_'));
    claeOnly.sort((a, b) => {
      const na = parseInt(a.concept_id.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.concept_id.replace(/\D/g, ''), 10) || 0;
      return na - nb;
    });

    for (let i = 0; i < claeOnly.length - 1; i++) {
      const a = claeOnly[i];
      const b = claeOnly[i + 1];
      const na = parseInt(a.concept_id.replace(/\D/g, ''), 10) || 0;
      const nb = parseInt(b.concept_id.replace(/\D/g, ''), 10) || 0;

      if (nb - na === 1 && !a.concept_id.includes('_') && !b.concept_id.includes('_')) {
        const aOsm = (a.osm_tags || []).join(',');
        const bOsm = (b.osm_tags || []).join(',');
        if (aOsm && aOsm === bOsm && !a.canonical_name.toLowerCase().includes(b.canonical_name.toLowerCase().slice(0, 5))) {
          // If neither canonical name resembles the other, flag as leak
          const issue: IntegrityIssue = {
            code: 'CLAIMED_TAXONOMY_MISMATCH',
            concept_id: b.concept_id,
            canonical_name: b.canonical_name,
            message: `Consecutive CLAE neighbor leak: shares exact OSM tags with ${a.concept_id} ("${a.canonical_name}") but has different economic trade.`,
            field: 'osm_tags',
            invalid_value: b.osm_tags
          };
          issues.push(issue);
          issuesByCode.CLAIMED_TAXONOMY_MISMATCH++;
        }
      }
    }

    const report: RegistryAuditReport = {
      timestamp: new Date().toISOString(),
      total_concepts_audited: allConcepts.length,
      valid_concepts_count: validCount,
      invalid_concepts_count: invalidCount,
      issues_by_code: issuesByCode,
      issues,
      duplicate_payload_groups: dupGroups,
      cross_category_contaminations: issuesByCode.CANONICAL_TAG_CONTRADICTION + issuesByCode.SUSPICIOUS_SEMANTIC_COPY,
      passed: issues.length === 0
    };

    return report;
  }
}
