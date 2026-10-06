/**
 * src/lib/atlas/discovery/benchmark/AtlasBenchmarkHardeningV1_1.mjs
 * 
 * ATLAS EXTERNAL SOURCE INTELLIGENCE BENCHMARK: GATE #28A HARDENING SPECIFICATION
 * 
 * Content, Semantic & Discovery-Mode Hardening Engine:
 * 1. Benchmark Identity Corrections (SIISA vs SISA, Indicadores.ar re-audit)
 * 2. Discovery Mode Taxonomy (Bulk, API, Feed, Paginated, Lookup, Corpus, Human)
 * 3. Reservoir Eligibility (Autonomous net-new population vs lookup-by-ID)
 * 4. Four Value Axes: DISCOVERY, ENRICHMENT, RELATIONSHIP, VALIDATION
 * 5. Net-New People Portfolio Scoring (Strong penalty on LOOKUP_BY_ID and HUMAN_ONLY)
 * 6. Audit of Oficina Anticorrupción DDJJ vs GCBA DDJJ
 * 7. COMPR.AR People extraction semantics (Transaction != Person)
 * 8. Recomputed 4 Portfolios: General Map, People Discovery, Relationships, Evidence Enrichment
 * 
 * Invariants:
 * - Gate #28 artifact preserved bit-for-bit (SHA: 41033fd83dbe75b5abb8d8458d4501a51589ce2acfb9f8da421dd6a755d33c7d)
 * - Complete candidate universe preserved (54 candidates)
 * - SSOT mutation = FALSE
 * - General Map unchanged = TRUE
 * - Certified 30m supply = 573,424
 */

export const DISCOVERY_MODES = Object.freeze({
  BULK_ENUMERABLE: 'BULK_ENUMERABLE',         // Complete downloadable dataset (CSV/Parquet/JSON dumps)
  API_ENUMERABLE: 'API_ENUMERABLE',           // REST/GraphQL with open pagination/cursor without requiring known IDs
  STREAM_ENUMERABLE: 'STREAM_ENUMERABLE',     // Streaming event bus / SSE / Webhook feed
  FEED_ENUMERABLE: 'FEED_ENUMERABLE',         // RSS / Atom syndication feeds polled periodically
  PAGINATED_DIRECTORY: 'PAGINATED_DIRECTORY', // Public HTML directory with navigable page numbers
  SEARCH_QUERY: 'SEARCH_QUERY',               // Query interface requiring search terms/names
  LOOKUP_BY_ID: 'LOOKUP_BY_ID',               // Exact lookup requiring known ID (CUIT/DNI/file number)
  DOCUMENT_CORPUS: 'DOCUMENT_CORPUS',         // Full-text document repository requiring entity extraction
  HUMAN_ONLY: 'HUMAN_ONLY',                   // Blocked by CAPTCHA, manual login, or anti-automation terms
  UNKNOWN: 'UNKNOWN'
});

export const RESERVOIR_ELIGIBILITY = Object.freeze({
  TRUE: true,
  FALSE: false,
  UNKNOWN: 'UNKNOWN'
});

export const GENERAL_MAP_FAMILY_STATUSES = Object.freeze({
  PRESENT_WITH_SURFACE: 'PRESENT_WITH_SURFACE', // Mapped with >=1 physical surface in General Map
  PRESENT_NO_SURFACE: 'PRESENT_NO_SURFACE',     // Entity/archetype exists in General Map, 0 physical surfaces
  ABSENT_FROM_GENERAL_MAP: 'ABSENT_FROM_GENERAL_MAP' // Not yet represented in General Map
});

export const DISCOVERY_THROUGHPUT_POTENTIALS = Object.freeze({
  VERY_HIGH: 'VERY_HIGH', // Bulk files (>10,000 items/min)
  HIGH: 'HIGH',           // Paginated machine APIs (>1,000 items/min)
  MEDIUM: 'MEDIUM',       // HTML directories (100-1,000 items/min)
  LOW: 'LOW',             // Lookup-by-ID requiring candidate probes (<100 items/min)
  ZERO: 'ZERO',           // Human-only / CAPTCHA blocked
  UNKNOWN: 'UNKNOWN'
});

export const VALUE_LEVELS = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  NONE: 'NONE'
});

export class AtlasBenchmarkHardeningEngine {
  constructor() {
    this.originalGate28Sha256 = '41033fd83dbe75b5abb8d8458d4501a51589ce2acfb9f8da421dd6a755d33c7d';
    this.candidates = [];
  }

  /**
   * Evaluates DDJJ relationship between Oficina Anticorrupción and historical GCBA DDJJ
   */
  static auditDdjjRelationship() {
    return {
      historical_source_id: 'SRC_DDJJ_PUBLICAS_CSV',
      historical_source_scope: 'MUNICIPAL_CABA',
      historical_public_entity: 'Gobierno de la Ciudad de Buenos Aires',
      candidate_source_id: 'CAND_OFICINA_ANTICORRUPCION_DDJJ_OPEN',
      candidate_source_scope: 'NATIONAL_FEDERAL',
      candidate_public_entity: 'Oficina Anticorrupción (Poder Ejecutivo Nacional)',
      relationship_classification: 'DISTINCT_SUBFAMILY_ADJACENT_DATASET',
      semantic_evaluation: 'Although both capture public asset disclosures (Declaraciones Juradas Patrimoniales), they represent completely distinct jurisdictions and public entities. GCBA covers CABA municipal officials, while OA covers National Executive Branch officials. They are NOT duplicate sources; they are adjacent datasets that share lineage archetype.',
      subfamily_distinction: {
        ddjj_actividades: 'Registry of outside activities, private sector history, and potential conflicts of interest.',
        ddjj_patrimoniales: 'Financial balance sheet: declared assets, real estate, bank deposits, and liabilities.'
      }
    };
  }

  /**
   * Returns corrected benchmark systems metadata
   */
  static getCorrectedBenchmarkSystems() {
    return [
      {
        benchmark_id: 'BENCHMARK_NOSIS',
        name: 'Nosis Laboratorio de Investigación y Desarrollo S.A. (Nosis SACIF)',
        commercial_role: 'CREDIT_AND_COMMERCIAL_BUREAU',
        corrected_families: ['TAX_FISCAL', 'BANKING_FINANCIAL', 'SOCIAL_SECURITY_LABOR', 'HEALTH_REGULATORY', 'CORPORATE_GOVERNANCE', 'LEGAL_JUDICIAL', 'INTERNATIONAL_TRADE'],
        notes: 'Commercial credit and compliance bureau. Broadest multi-domain coverage in Argentina.'
      },
      {
        benchmark_id: 'BENCHMARK_DATEAS',
        name: 'Dateas Information Services',
        commercial_role: 'PUBLIC_RECORDS_AND_CIVIL_AGGREGATOR',
        corrected_families: ['CIVIL_VITAL_RECORDS', 'ASSET_REGISTRIES', 'LEGAL_JUDICIAL', 'CORPORATE_GOVERNANCE', 'TAX_FISCAL', 'PROFESSIONAL_COLLEGIATE', 'INTELLECTUAL_PROPERTY'],
        notes: 'Civil, vital, real estate, and professional collegiate aggregation.'
      },
      {
        benchmark_id: 'BENCHMARK_INDICADORES_AR',
        name: 'Indicadores Abiertos Argentina',
        commercial_role: 'PUBLIC_INTELLIGENCE_AND_PROCUREMENT_PLATFORM',
        corrected_families: [
          'CORPORATE_GOVERNANCE',          // Companies, authorities, corporate linkages
          'PUBLIC_PROCUREMENT',            // COMPR.AR, CONTRAT.AR, state suppliers
          'OFFICIAL_GAZETTES',             // BORA and provincial gazette tracking
          'BANKING_FINANCIAL',             // BCRA debt and financial risk signals
          'TAX_FISCAL',                    // Tax status, CUIT verification
          'LEGAL_JUDICIAL',                // Judicial and bankruptcy notices
          'ENERGY_EXTRACTIVE_INDUSTRIES'   // Concessions and public contracts in energy
        ],
        notes: 'RE-AUDITED: Broad multi-domain coverage including corporate governance, state procurement, and fiscal registries.'
      },
      {
        benchmark_id: 'BENCHMARK_EQUIFAX_VERAZ',
        name: 'Equifax Veraz Argentina',
        commercial_role: 'CREDIT_BUREAU',
        corrected_families: ['BANKING_FINANCIAL', 'TAX_FISCAL', 'LEGAL_JUDICIAL', 'COMMERCIAL_CREDIT_RISK'],
        notes: 'Traditional financial and credit risk bureau.'
      },
      {
        benchmark_id: 'BENCHMARK_SIISA',
        name: 'Servicio Interactivo de Informes S.A. (SIISA)',
        commercial_role: 'COMMERCIAL_CREDIT_AND_TELECOM_RISK_BUREAU',
        corrected_families: [
          'BANKING_FINANCIAL',
          'TAX_FISCAL',
          'TELECOM_DIGITAL_INFRASTRUCTURE',
          'COMMERCIAL_CREDIT_RISK'
        ],
        notes: 'CORRECTED: Commercial credit, risk scoring, and telecom billing bureau. NOT to be confused with SISA (Ministry of Health). Healthcare provider registries removed.'
      },
      {
        benchmark_id: 'BENCHMARK_FIDELITAS',
        name: 'Fidelitas S.A. Commercial Information Services',
        commercial_role: 'CREDIT_AND_COMMERCIAL_BUREAU',
        corrected_families: ['CORPORATE_GOVERNANCE', 'BANKING_FINANCIAL', 'LEGAL_JUDICIAL', 'SOCIAL_SECURITY_LABOR'],
        notes: 'Corporate officers, bounced checks, labor litigation, and credit defaults.'
      },
      {
        benchmark_id: 'BENCHMARK_OPENCORPORATES',
        name: 'OpenCorporates The Open Database of the Corporate World',
        commercial_role: 'CORPORATE_REGISTRY_AGGREGATOR',
        corrected_families: ['CORPORATE_GOVERNANCE', 'LEGAL_JUDICIAL'],
        notes: 'Global corporate entity and officer registry.'
      },
      {
        benchmark_id: 'BENCHMARK_MOODYS_ORBIS',
        name: "Moody's Analytics Orbis Global Database",
        commercial_role: 'GLOBAL_COMPANY_AND_OWNERSHIP_INTELLIGENCE',
        corrected_families: ['CORPORATE_GOVERNANCE', 'BANKING_FINANCIAL', 'COMPLIANCE_WATCHLISTS'],
        notes: 'Beneficial ownership and global corporate hierarchies.'
      },
      {
        benchmark_id: 'BENCHMARK_SAYARI',
        name: 'Sayari Commercial Risk Intelligence',
        commercial_role: 'GLOBAL_SUPPLY_CHAIN_AND_CROSS_BORDER_GRAPH',
        corrected_families: ['CORPORATE_GOVERNANCE', 'INTERNATIONAL_TRADE', 'COMPLIANCE_WATCHLISTS', 'PUBLIC_PROCUREMENT'],
        notes: 'State-owned enterprises, cross-border graph, and trade manifests.'
      },
      {
        benchmark_id: 'BENCHMARK_DUN_BRADSTREET',
        name: 'Dun & Bradstreet (D&B)',
        commercial_role: 'GLOBAL_COMMERCIAL_DATA_CLOUD',
        corrected_families: ['CORPORATE_GOVERNANCE', 'BANKING_FINANCIAL', 'INTERNATIONAL_TRADE', 'INTELLECTUAL_PROPERTY'],
        notes: 'Global business master data and parent-subsidiary linkage.'
      }
    ];
  }

  /**
   * Clarifies SISA distinction
   */
  static getSisaCorrectionNotice() {
    return {
      status: 'DISAMBIGUATED_AND_SEGREGATED',
      commercial_benchmark: {
        id: 'BENCHMARK_SIISA',
        name: 'Servicio Interactivo de Informes S.A.',
        type: 'COMMERCIAL_CREDIT_BUREAU',
        coverage: 'Credit risk, financial records, telecom billing history, CUIT validation.'
      },
      public_entity: {
        id: 'ENTITY_SISA_MINSALUD',
        name: 'Sistema Integrado de Información Sanitaria Argentino',
        owner: 'Ministerio de Salud de la Nación (República Argentina)',
        type: 'SOVEREIGN_PUBLIC_HEALTH_INFORMATION_SYSTEM',
        coverage: 'REFEPS (Registro Federal de Profesionales de la Salud), REFES (Establecimientos de Salud), registries of authorized medical specialties and licenses.',
        atlas_role: 'ORIGINAL_PUBLIC_SOURCE_ENTITY (Discovery lead candidate, NOT benchmark)'
      }
    };
  }

  registerHardenedCandidate(c) {
    this.candidates.push(Object.freeze({ ...c }));
  }

  /**
   * Computes Portfolios with Hardened Scoring Logic
   */
  generateHardenedPortfolios() {
    // 1. General Map Expansion Portfolio (V1.1)
    const generalMap = [...this.candidates]
      .sort((a, b) => {
        // Multi-domain reuse, machine access, and orthogonal value
        const scoreA = (a.general_map_priority_score || 50) + (a.domain_reuse_count * 3);
        const scoreB = (b.general_map_priority_score || 50) + (b.domain_reuse_count * 3);
        return scoreB - scoreA;
      })
      .slice(0, 25);

    // 2. People Discovery Expansion Portfolio (V1.1) - STRICT NET-NEW TARGETING
    const peopleDiscovery = [...this.candidates]
      .filter(c => {
        // Must serve PEOPLE domain
        if (!c.domains_served.includes('PEOPLE')) return false;
        // Must have embedded person entities
        if (!c.person_entities_embedded && c.row_grain !== 'PERSON') return false;
        // MUST BE RESERVOIR ELIGIBLE for net-new discovery
        if (c.reservoir_eligible !== true) return false;
        // Exclude human-only or exact lookup by ID
        if (c.discovery_mode === DISCOVERY_MODES.HUMAN_ONLY) return false;
        if (c.discovery_mode === DISCOVERY_MODES.LOOKUP_BY_ID) return false;
        return true;
      })
      .sort((a, b) => {
        // Priority to direct person rows, high throughput, and bulk/api enumerable
        let scoreA = a.people_priority_score || 50;
        let scoreB = b.people_priority_score || 50;

        if (a.row_grain === 'PERSON') scoreA += 10;
        if (b.row_grain === 'PERSON') scoreB += 10;

        if (a.discovery_mode === DISCOVERY_MODES.BULK_ENUMERABLE) scoreA += 15;
        if (b.discovery_mode === DISCOVERY_MODES.BULK_ENUMERABLE) scoreB += 15;

        if (a.discovery_throughput_potential === 'VERY_HIGH') scoreA += 10;
        if (b.discovery_throughput_potential === 'VERY_HIGH') scoreB += 10;

        return scoreB - scoreA;
      })
      .slice(0, 25);

    // 3. Relationship Intelligence Expansion Portfolio (V1.1)
    const relationships = [...this.candidates]
      .filter(c => c.relationship_types_present && c.relationship_types_present.length > 0)
      .sort((a, b) => {
        const scoreA = (a.relationship_priority_score || 50) + (a.relationship_types_present.length * 4);
        const scoreB = (b.relationship_priority_score || 50) + (b.relationship_types_present.length * 4);
        return scoreB - scoreA;
      })
      .slice(0, 25);

    // 4. Evidence Enrichment Portfolio (V1.1) - NEW 4TH PORTFOLIO
    const evidenceEnrichment = [...this.candidates]
      .filter(c => c.enrichment_value === VALUE_LEVELS.HIGH || c.validation_value === VALUE_LEVELS.HIGH)
      .sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        if (a.enrichment_value === VALUE_LEVELS.HIGH) scoreA += 40;
        if (b.enrichment_value === VALUE_LEVELS.HIGH) scoreB += 40;
        if (a.validation_value === VALUE_LEVELS.HIGH) scoreA += 30;
        if (b.validation_value === VALUE_LEVELS.HIGH) scoreB += 30;
        if (a.relationship_value === VALUE_LEVELS.HIGH) scoreA += 20;
        if (b.relationship_value === VALUE_LEVELS.HIGH) scoreB += 20;
        return scoreB - scoreA;
      })
      .slice(0, 25);

    return {
      top25GeneralMap: generalMap,
      top25PeopleDiscovery: peopleDiscovery,
      top25Relationships: relationships,
      top25EvidenceEnrichment: evidenceEnrichment
    };
  }
}
