/**
 * src/lib/atlas/discovery/benchmark/AtlasRelationshipFamilyCatalog.mjs
 * 
 * ATLAS RELATIONSHIP FAMILY CATALOG (GRAPH ARCHETYPE SPECIFICATION)
 * 
 * Catalog of semantic relationship types exposed by external benchmark information systems.
 * Invariants:
 * - Records BENCHMARK_EXPECTED_RELATIONSHIP_VALUE (HIGH, MEDIUM, LOW, UNKNOWN).
 * - Zero fabricated numeric density.
 * - Categorizes entity pair types and supporting source families.
 */

export const ENTITY_PAIR_TYPES = Object.freeze({
  PERSON_TO_ORGANIZATION: 'PERSON_TO_ORGANIZATION',
  PERSON_TO_PERSON: 'PERSON_TO_PERSON',
  ORGANIZATION_TO_ORGANIZATION: 'ORGANIZATION_TO_ORGANIZATION',
  ENTITY_TO_EVENT: 'ENTITY_TO_EVENT',
  ENTITY_TO_DOCUMENT: 'ENTITY_TO_DOCUMENT',
  PERSON_TO_ASSET: 'PERSON_TO_ASSET'
});

export const EXPECTED_RELATIONSHIP_VALUES = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  UNKNOWN: 'UNKNOWN'
});

export class AtlasRelationshipFamily {
  constructor(data) {
    this.relationship_family_id = data.relationship_family_id;
    this.name = data.name;
    this.entity_pair_type = data.entity_pair_type;
    this.source_entity_type = data.source_entity_type; // PERSON, COMPANY, INSTITUTION
    this.target_entity_type = data.target_entity_type; // COMPANY, PERSON, CONTRACT, EVENT, ASSET
    this.predicate_name = data.predicate_name;
    this.description = data.description;
    this.supporting_source_families = data.supporting_source_families || [];
    this.expected_relationship_value = data.expected_relationship_value || EXPECTED_RELATIONSHIP_VALUES.MEDIUM;
    this.temporal_attributes = data.temporal_attributes || ['valid_from', 'valid_to', 'designation_date'];
    this.benchmarks_referencing = data.benchmarks_referencing || [];
    Object.freeze(this);
  }
}

export class AtlasRelationshipFamilyCatalog {
  constructor() {
    this.relationships = new Map();
  }

  registerRelationship(data) {
    const rel = new AtlasRelationshipFamily(data);
    this.relationships.set(rel.relationship_family_id, rel);
    return rel;
  }

  get(relId) {
    return this.relationships.get(relId);
  }

  getAll() {
    return Array.from(this.relationships.values());
  }

  getCatalogMetrics() {
    const all = this.getAll();
    const highValue = all.filter(r => r.expected_relationship_value === EXPECTED_RELATIONSHIP_VALUES.HIGH).length;
    return {
      total_relationship_families: all.length,
      high_value_relationships: highValue,
      entity_pair_distribution: {
        PERSON_TO_ORGANIZATION: all.filter(r => r.entity_pair_type === ENTITY_PAIR_TYPES.PERSON_TO_ORGANIZATION).length,
        ORGANIZATION_TO_ORGANIZATION: all.filter(r => r.entity_pair_type === ENTITY_PAIR_TYPES.ORGANIZATION_TO_ORGANIZATION).length,
        PERSON_TO_PERSON: all.filter(r => r.entity_pair_type === ENTITY_PAIR_TYPES.PERSON_TO_PERSON).length,
        ENTITY_TO_EVENT: all.filter(r => r.entity_pair_type === ENTITY_PAIR_TYPES.ENTITY_TO_EVENT).length,
        PERSON_TO_ASSET: all.filter(r => r.entity_pair_type === ENTITY_PAIR_TYPES.PERSON_TO_ASSET).length
      }
    };
  }
}
