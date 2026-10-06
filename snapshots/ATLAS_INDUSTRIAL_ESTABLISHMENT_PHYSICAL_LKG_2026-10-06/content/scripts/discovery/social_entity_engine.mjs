/**
 * scripts/discovery/social_entity_engine.mjs
 * 
 * ATLAS — UNIVERSAL SOCIAL ENTITY DISCOVERY ENGINE V16D
 * 
 * Mandates:
 * 1. Platform-agnostic entity model: ANY public social entity can be a discovery node.
 * 2. Supported Entity Types:
 *    PERSON, PAGE, GROUP, COMMUNITY, CHANNEL, ORGANIZATION, BUSINESS,
 *    PROFESSIONAL_BODY, MEDIA_ACCOUNT, CREATOR_ACCOUNT, INSTITUTION, EVENT,
 *    PUBLIC_DIRECTORY, WEBSITE.
 * 3. Strategy A: Direct Individual Person Pipeline (multi-factor disambiguation).
 * 4. Strategy B: Entity -> Large Public Population Source Discovery (Scale).
 * 5. SocialEntityGraph with deterministic relation edges.
 * 6. Analogy Learning Engine: cross-pollinates discovered niches across provinces and professions.
 * 7. Strictly public / permitted surfaces. Never bypass private boundaries.
 */

import { normalizeName } from '../build_global_identity_authority_v4.mjs';

const CORPORATE_TOKENS = [
  ' S.A.', ' SA', ' S.R.L.', ' SRL', ' S.A.S.', ' SAS', ' S.H.', ' SH',
  ' SOCIEDAD', ' COOPERATIVA', ' ASOCIACION', ' FUNDACION', ' COMERCIAL',
  ' EMPRESA', ' DISTRIBUIDORA', ' GRUPO', ' INSTITUTO', ' CAMARA', ' COLEGIO',
  ' FEDERACION', ' MUNICIPALIDAD', ' GOBIERNO', ' SECRETARIA', ' MINISTERIO'
];

export class SocialEntity {
  constructor({
    platform,
    entity_type, // 'PERSON', 'PAGE', 'GROUP', 'CHANNEL', 'COMMUNITY', 'ORGANIZATION', 'BUSINESS'
    public_id,
    public_name,
    description = '',
    public_url = '',
    linked_websites = [],
    profession_signals = [],
    organization_signals = [],
    geography_signals = [],
    associated_persons = [],
    related_public_entities = []
  }) {
    this.platform = platform;
    this.entity_type = entity_type;
    this.public_id = public_id;
    this.public_name = public_name;
    this.description = description;
    this.public_url = public_url;
    this.linked_websites = linked_websites;
    this.profession_signals = profession_signals;
    this.organization_signals = organization_signals;
    this.geography_signals = geography_signals;
    this.associated_persons = associated_persons;
    this.related_public_entities = related_public_entities;
  }
}

export class SocialEntityGraph {
  constructor() {
    this.nodes = new Map(); // id -> { type, label, data }
    this.edges = [];        // { from, to, relation, weight }
    this.identityEvidence = new Map(); // canonicalKey -> Set of evidence node IDs
  }

  addNode(id, type, label, data = {}) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, type, label, data });
    }
    return this.nodes.get(id);
  }

  addEdge(fromId, toId, relation, weight = 1.0) {
    this.edges.push({ from: fromId, to: toId, relation, weight });
  }

  linkEvidence(canonicalKey, nodeId) {
    if (!this.identityEvidence.has(canonicalKey)) {
      this.identityEvidence.set(canonicalKey, new Set());
    }
    this.identityEvidence.get(canonicalKey).add(nodeId);
  }

  get stats() {
    const counts = {};
    for (const n of this.nodes.values()) {
      counts[n.type] = (counts[n.type] || 0) + 1;
    }
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.length,
      nodesByType: counts,
      resolvedEntitiesWithEvidence: this.identityEvidence.size
    };
  }
}

export class AnalogyLearningEngine {
  constructor() {
    this.knownTargetProvinces = [
      'Córdoba', 'Santa Fe', 'Mendoza', 'Tucumán', 'Salta',
      'Entre Ríos', 'Chaco', 'Corrientes', 'San Juan', 'Santiago del Estero',
      'Neuquén', 'Río Negro', 'Misiones', 'Jujuy'
    ];
  }

  generateAnalogiesFromEntity(entity) {
    const analogies = [];
    const prof = entity.profession_signals[0] || 'profesionales';
    const baseProv = entity.geography_signals[0] || 'Nacional';

    for (const prov of this.knownTargetProvinces) {
      if (prov.toLowerCase() === baseProv.toLowerCase()) continue;
      analogies.push({
        targetProvince: prov,
        targetProfession: prof,
        derivedQuery: `"${prof}" "${prov}" registro OR padron OR matricula OR colegio OR asociacion`,
        analogousGroupConcept: `${prof} Matriculados / Habilitados ${prov}`
      });
    }

    return analogies.slice(0, 5); // Return top 5 analogous discovery targets
  }
}

export class DirectPersonPipeline {
  constructor(ledger) {
    this.ledger = ledger;
  }

  /**
   * Evaluate a direct public person candidate.
   * Enforces multi-factor evidence: Name + Role/Profession + Organization/Business + City/Province.
   * Rejects corporate titles and unresolvable single names.
   */
  evaluateCandidate(candidate) {
    const { name, profession, organization, location, public_url, platform } = candidate;

    // 1. Natural Person Validation
    if (!name || name.trim().length < 5 || name.trim().length > 50) {
      return { pass: false, reason: 'INVALID_NAME_LENGTH' };
    }

    const upper = name.toUpperCase();
    for (const tok of CORPORATE_TOKENS) {
      if (upper.includes(tok)) {
        return { pass: false, reason: 'CORPORATE_TOKEN_DETECTED' };
      }
    }

    const words = name.trim().split(/\s+/);
    if (words.length < 2 || words.length > 5) {
      return { pass: false, reason: 'NOT_A_FULL_NAME' };
    }

    // 2. Multi-factor Identity Confidence
    // Name alone is strictly insufficient
    const hasContext = (profession && profession.length > 3) || 
                       (organization && organization.length > 3) || 
                       (location && location.length > 3);

    if (!hasContext) {
      return { pass: false, reason: 'INSUFFICIENT_IDENTITY_CONFIDENCE_NO_CONTEXT' };
    }

    // 3. Evaluate through Global Fuel Ledger Double-Gate
    const creditRes = this.ledger.evaluateAndCredit({
      name: name.trim(),
      jurisdiction: location || 'ARG',
      sourceId: `SOCIAL_DIRECT_${platform.toUpperCase()}`,
      populationClass: profession || 'Public Professional'
    });

    return {
      pass: creditRes.credited,
      reason: creditRes.reason || 'CREDITED',
      canonicalKey: creditRes.canonicalKey,
      hashVal: creditRes.hashVal,
      candidate
    };
  }
}
