/**
 * ATLAS — EXPERIENCE MEMORY V1
 * Structured Operational Experience Recording & Similarity Retrieval
 * 
 * Captures:
 * SITUATION, CONTEXT, HYPOTHESIS, ACTION, EXPECTED_OUTCOME, PHYSICAL_OUTCOME,
 * TRUE_NET_NEW_YIELD, OVERLAP, LATENCY, ERRORS, SUCCESS/FAILURE, LESSON.
 * 
 * Preloads the 4 foundational real empirical experiences observed during the mission.
 */

import type { OperationalExperience, DomainCategory } from './types.ts';

export class ExperienceMemory {
  private static instance: ExperienceMemory;
  private experiences: Map<string, OperationalExperience> = new Map();
  private initialized: boolean = false;

  private constructor() {
    this.seedFoundationalExperiences();
  }

  public static getInstance(): ExperienceMemory {
    if (!this.instance) {
      this.instance = new ExperienceMemory();
    }
    return this.instance;
  }

  /**
   * Seeds the 4 foundational physical experiences observed during the mission
   */
  private seedFoundationalExperiences(): void {
    if (this.initialized) return;

    // Experience A: Surface Institutional Sources Yield Collapse
    this.recordExperience({
      experienceId: 'EXP_001_SURFACE_COLLISION',
      timestamp: '2026-09-28T09:15:00Z',
      situation: 'Harvesting surface contact and authorities endpoints (/contacto, /autoridades, homepages) of national institutions',
      context: {
        sector: 'HIGHER_EDUCATION_AND_GOVERNMENT',
        domainType: 'ACADEMIC_INSTITUTION',
        depthAvailable: false,
        surfaceCollisionRisk: 0.95,
        entityScaleEstimate: 12000
      },
      hypothesis: 'Standard institutional contact pages contain primary authoritative contacts that will yield net new emails',
      action: 'HARVEST_SURFACE_CONTACT_PAGES',
      expectedOutcome: {
        expectedYield: 0.50,
        expectedOverlap: 0.15
      },
      physicalOutcome: {
        pagesProbed: 108,
        contactsExtracted: 995,
        uniqueContacts: 223,
        globalOverlap: 218,
        trueNetNewYield: 5,
        overlapRate: 0.978,
        latencyMs: 340,
        errorsCount: 4
      },
      success: false,
      lesson: 'Surface institutional pages (/contacto, /autoridades, homepages) suffer extreme 97.8% collision against preexisting baseline authority, collapsing net-new yield to near zero.',
      tags: ['SURFACE_SOURCE', 'COLLISION_FAILURE', 'HOMEPAGES', 'ACADEMIC_SURFACE']
    });

    // Experience B: High-Capacity Entity Universes Breakout
    this.recordExperience({
      experienceId: 'EXP_002_HIGH_CAPACITY_UNIVERSES',
      timestamp: '2026-09-28T10:15:00Z',
      situation: 'Pivoting from surface pages to deep internal faculty rosters, sitemaps, and official registries',
      context: {
        sector: 'PUBLIC_REGISTRIES_AND_DEEP_ROSTERS',
        domainType: 'PUBLIC_REGISTRY',
        depthAvailable: true,
        surfaceCollisionRisk: 0.20,
        entityScaleEstimate: 588000
      },
      hypothesis: 'Targeting structured public entity universes (registries, sitemaps, licensing boards) will bypass surface saturation and yield net-new contacts',
      action: 'HARVEST_HIGH_CAPACITY_ENTITY_UNIVERSES',
      expectedOutcome: {
        expectedYield: 0.40,
        expectedOverlap: 0.25
      },
      physicalOutcome: {
        pagesProbed: 56,
        contactsExtracted: 109,
        uniqueContacts: 64,
        globalOverlap: 48,
        trueNetNewYield: 16,
        overlapRate: 0.750,
        latencyMs: 220,
        errorsCount: 0
      },
      success: true,
      lesson: 'Deep structural entity universes (sitemaps, deep faculty rosters, registries) produce substantially lower baseline overlap and deliver genuine net-new records (285.7 net-new / 1k entities).',
      tags: ['HIGH_CAPACITY_UNIVERSE', 'SITEMAP', 'DEEP_ROSTER', 'NET_NEW_SUCCESS']
    });

    // Experience C: Supply Accounting Model Conflation Failure
    this.recordExperience({
      experienceId: 'EXP_003_SUPPLY_ACCOUNTING_CONFLATION',
      timestamp: '2026-09-28T10:35:00Z',
      situation: 'Calculating physically supported supply by adding hereditary unverified estimates (313,400) to sampled yield',
      context: {
        sector: 'SUPPLY_MODELING_AND_GOVERNANCE',
        domainType: 'GENERAL_PUBLIC',
        depthAvailable: false,
        surfaceCollisionRisk: 0.0,
        entityScaleEstimate: 500000
      },
      hypothesis: 'Legacy conservative supported supply from prior rounds can be added to newly observed high-capacity supply to claim supply gap closure',
      action: 'SUM_HEREDITARY_ESTIMATE_WITH_PHYSICAL_YIELD',
      expectedOutcome: {
        expectedYield: 1.0,
        expectedOverlap: 0.0
      },
      physicalOutcome: {
        pagesProbed: 0,
        contactsExtracted: 0,
        uniqueContacts: 0,
        globalOverlap: 0,
        trueNetNewYield: 0,
        overlapRate: 0.0,
        latencyMs: 0,
        errorsCount: 1
      },
      success: false,
      lesson: 'Hereditary modeled supply lacked physical sampling and global deduplication in PostgreSQL. Conflating theoretical models with physical yield creates phantom closure. Supported supply must strictly derive from physically observed yield.',
      tags: ['ACCOUNTING_FAILURE', 'HEREDITARY_SUPPLY', 'GOVERNANCE', 'SUPPLY_GAP']
    });

    // Experience D: Yield Calculation Intermediate Multiplier Inflation Failure
    this.recordExperience({
      experienceId: 'EXP_004_YIELD_MULTIPLIER_INFLATION',
      timestamp: '2026-09-28T10:45:00Z',
      situation: 'Computing net new per 1,000 entities by cross-multiplying raw contacts/entity by unique net-new ratio',
      context: {
        sector: 'YIELD_METRICS_AND_STATISTICS',
        domainType: 'GENERAL_PUBLIC',
        depthAvailable: false,
        surfaceCollisionRisk: 0.0,
        entityScaleEstimate: 588000
      },
      hypothesis: 'Cross-multiplying raw contacts/entity (1.946) with unique net-new ratio (0.25) approximates yield',
      action: 'CALCULATE_YIELD_WITH_INTERMEDIATE_MULTIPLIERS',
      expectedOutcome: {
        expectedYield: 0.487,
        expectedOverlap: 0.75
      },
      physicalOutcome: {
        pagesProbed: 56,
        contactsExtracted: 109,
        uniqueContacts: 64,
        globalOverlap: 48,
        trueNetNewYield: 16,
        overlapRate: 0.750,
        latencyMs: 0,
        errorsCount: 1
      },
      success: false,
      lesson: 'Multiplying raw contacts by unique net-new ratio multiplied intra-entity email duplicates (109/64 = 1.703x), artificially inflating rate from 285.7 to 487. Yield must be computed directly as trueNetNew / physicallySampledEntities with zero intermediate multipliers.',
      tags: ['YIELD_CALCULATION_FAILURE', 'DUPLICATION_DISTORTION', 'STATISTICAL_RIGOR']
    });

    this.initialized = true;
  }

  public recordExperience(exp: OperationalExperience): void {
    this.experiences.set(exp.experienceId, exp);
  }

  public getExperience(id: string): OperationalExperience | undefined {
    return this.experiences.get(id);
  }

  public getAllExperiences(): OperationalExperience[] {
    return Array.from(this.experiences.values());
  }

  public getExperiencesCount(): number {
    return this.experiences.size;
  }

  /**
   * Retrieves past experiences relevant to the current operational situation
   */
  public findSimilarExperiences(context: {
    sector?: string;
    domainType?: DomainCategory;
    surfaceCollisionRisk?: number;
    depthAvailable?: boolean;
  }): OperationalExperience[] {
    const list = this.getAllExperiences();

    return list.filter(exp => {
      let score = 0;
      if (context.domainType && exp.context.domainType === context.domainType) score += 2;
      if (context.depthAvailable !== undefined && exp.context.depthAvailable === context.depthAvailable) score += 2;
      if (context.surfaceCollisionRisk !== undefined && Math.abs(exp.context.surfaceCollisionRisk - context.surfaceCollisionRisk) < 0.3) score += 2;
      return score >= 2;
    });
  }
}
