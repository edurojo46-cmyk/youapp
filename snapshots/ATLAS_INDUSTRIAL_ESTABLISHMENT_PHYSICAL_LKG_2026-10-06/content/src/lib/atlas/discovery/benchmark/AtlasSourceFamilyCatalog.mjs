/**
 * src/lib/atlas/discovery/benchmark/AtlasSourceFamilyCatalog.mjs
 * 
 * ATLAS SOURCE FAMILY CATALOG (HIERARCHICAL CONTROL PLANE SPECIFICATION)
 * 
 * Hierarchy:
 * SOURCE_FAMILY -> SOURCE_SUBFAMILY -> SOURCE_ENTITY -> SOURCE_SURFACE -> LOGICAL MOTOR -> WORKLOAD
 * 
 * Invariants:
 * - 14 Seed families + discovered families dynamically expandable.
 * - Separates ROW_GRAIN from ENTITY_TYPES_PRESENT.
 * - Tracks SOURCE_ORIGIN_CLASS (PUBLIC_ORIGINAL_AVAILABLE, PRIVATE_PROPRIETARY, etc.).
 * - Explicit APPLICABLE_GEOGRAPHIC_LEVEL (NATIONAL, PROVINCIAL, MUNICIPAL, MULTI_LEVEL).
 */

export const APPLICABLE_GEOGRAPHIC_LEVELS = Object.freeze({
  NATIONAL: 'NATIONAL',
  PROVINCIAL: 'PROVINCIAL',
  MUNICIPAL: 'MUNICIPAL',
  MULTI_LEVEL: 'MULTI_LEVEL',
  INTERNATIONAL: 'INTERNATIONAL'
});

export const SOURCE_ORIGIN_CLASSES = Object.freeze({
  PUBLIC_ORIGINAL_AVAILABLE: 'PUBLIC_ORIGINAL_AVAILABLE',
  PUBLIC_ORIGINAL_UNKNOWN: 'PUBLIC_ORIGINAL_UNKNOWN',
  PRIVATE_PROPRIETARY: 'PRIVATE_PROPRIETARY',
  MIXED: 'MIXED',
  UNKNOWN: 'UNKNOWN'
});

export const FAMILY_COVERAGE_STATUSES = Object.freeze({
  FULL: 'FULL',
  PARTIAL: 'PARTIAL',
  MINIMAL: 'MINIMAL',
  KNOWN_NO_SURFACE: 'KNOWN_NO_SURFACE',
  MISSING: 'MISSING',
  UNKNOWN: 'UNKNOWN'
});

export const ROW_GRAINS = Object.freeze({
  PERSON: 'PERSON',
  ORGANIZATION: 'ORGANIZATION',
  TRANSACTION: 'TRANSACTION',
  EVENT: 'EVENT',
  DOCUMENT: 'DOCUMENT',
  AGGREGATE: 'AGGREGATE',
  MIXED: 'MIXED'
});

export class AtlasSourceFamily {
  constructor(data) {
    this.family_id = data.family_id;
    this.family_name = data.family_name;
    this.is_seed_family = data.is_seed_family ?? false;
    this.description = data.description;
    this.applicable_geographic_level = data.applicable_geographic_level || APPLICABLE_GEOGRAPHIC_LEVELS.NATIONAL;
    this.source_origin_class = data.source_origin_class || SOURCE_ORIGIN_CLASSES.PUBLIC_ORIGINAL_AVAILABLE;
    
    // Subfamilies
    this.subfamilies = (data.subfamilies || []).map(sf => Object.freeze({ ...sf }));
    
    // Multi-Domain Potential
    this.domains_served = data.domains_served || ['PEOPLE'];
    this.people_value = data.people_value || 'MEDIUM';     // HIGH, MEDIUM, LOW, UNKNOWN
    this.business_value = data.business_value || 'MEDIUM'; // HIGH, MEDIUM, LOW, UNKNOWN
    this.news_value = data.news_value || 'LOW';
    this.events_value = data.events_value || 'LOW';
    this.domain_reuse_count = this.domains_served.length;
    
    // Benchmark Consensus
    this.benchmarks_referencing = data.benchmarks_referencing || [];
    this.benchmark_count = this.benchmarks_referencing.length;
    this.importance_confidence = this.benchmark_count >= 3 ? 'HIGH' : (this.benchmark_count >= 2 ? 'MEDIUM' : 'EMERGING');
    
    // Atlas General Map Coverage Assessment
    this.atlas_coverage = data.atlas_coverage || FAMILY_COVERAGE_STATUSES.MISSING;
    this.coverage_basis = data.coverage_basis || 'Unmapped in General Source Map';
    
    // Candidate Entities & Surfaces
    this.typical_public_entities = data.typical_public_entities || [];
    this.candidate_surfaces_count = data.candidate_surfaces_count || 0;

    Object.freeze(this);
  }
}

export class AtlasSourceFamilyCatalog {
  constructor() {
    this.families = new Map(); // family_id -> AtlasSourceFamily
  }

  registerFamily(data) {
    const family = new AtlasSourceFamily(data);
    this.families.set(family.family_id, family);
    return family;
  }

  get(familyId) {
    return this.families.get(familyId);
  }

  getAll() {
    return Array.from(this.families.values());
  }

  getCatalogMetrics() {
    const all = this.getAll();
    const seedCount = all.filter(f => f.is_seed_family).length;
    const newDiscoveredCount = all.filter(f => !f.is_seed_family).length;
    const multiBenchmarkCount = all.filter(f => f.benchmark_count > 1).length;
    const singleBenchmarkCount = all.filter(f => f.benchmark_count === 1).length;
    
    let totalSubfamilies = 0;
    for (const f of all) {
      totalSubfamilies += f.subfamilies.length;
    }

    const coverageCounts = {
      FULL: all.filter(f => f.atlas_coverage === FAMILY_COVERAGE_STATUSES.FULL).length,
      PARTIAL: all.filter(f => f.atlas_coverage === FAMILY_COVERAGE_STATUSES.PARTIAL).length,
      MINIMAL: all.filter(f => f.atlas_coverage === FAMILY_COVERAGE_STATUSES.MINIMAL).length,
      KNOWN_NO_SURFACE: all.filter(f => f.atlas_coverage === FAMILY_COVERAGE_STATUSES.KNOWN_NO_SURFACE).length,
      MISSING: all.filter(f => f.atlas_coverage === FAMILY_COVERAGE_STATUSES.MISSING).length
    };

    return {
      total_source_families: all.length,
      seed_source_families: seedCount,
      new_source_families_discovered: newDiscoveredCount,
      total_source_subfamilies: totalSubfamilies,
      multi_benchmark_families: multiBenchmarkCount,
      single_benchmark_unique_families: singleBenchmarkCount,
      atlas_coverage_breakdown: coverageCounts
    };
  }
}
