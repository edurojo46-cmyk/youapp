/**
 * ATLAS SEARCH FACTORY V1 (MASTER FACADE)
 * 
 * High-level autonomous factory for creating verified vertical search engines
 * from natural language input without writing manual domain code.
 * 
 * Coordinates:
 * - Intent Parser
 * - Schema, Identity, Governance, Ranking & UI Generators
 * - Static Validator
 * - Dynamic Domain Compiler
 * - Spec Storage & Lifecycle State Machine
 * - Physical Source Governance Gates
 */

import type { AtlasDomainSpecification } from './contracts/AtlasDomainSpecification';
import type { DomainLifecycleRecord } from './contracts/AtlasDomainLifecycle';
import { AtlasDomainIntentParser } from './parser/AtlasDomainIntentParser';
import { AtlasDomainSchemaGenerator } from './generators/AtlasDomainSchemaGenerator';
import { AtlasIdentityPolicyProposal } from './generators/AtlasIdentityPolicyProposal';
import { AtlasSourceStrategyGenerator } from './generators/AtlasSourceStrategyGenerator';
import { AtlasDiscoveryPlanGenerator } from './generators/AtlasDiscoveryPlanGenerator';
import { AtlasRankingAndFacetGenerator } from './generators/AtlasRankingAndFacetGenerator';
import { AtlasUIConfigGenerator } from './generators/AtlasUIConfigGenerator';
import { AtlasDomainCompiler } from './compiler/AtlasDomainCompiler';
import { AtlasDomainStaticValidator } from './compiler/AtlasDomainStaticValidator';
import type { StaticValidationResult } from './compiler/AtlasDomainStaticValidator';
import { AtlasDomainSpecRepository } from './storage/AtlasDomainSpecRepository';
import type { PersistedDomainRecord } from './storage/AtlasDomainSpecRepository';
import { AtlasDomainLifecycleManager } from './lifecycle/AtlasDomainLifecycleManager';
import { AtlasSourceGovernanceGateEngine } from './governance/AtlasSourceGovernanceGateEngine';
import type { AtlasDomainPack } from '../fabric/contracts/AtlasDomainPack';

export interface FactoryGenerationResult {
  specification: AtlasDomainSpecification;
  static_validation: StaticValidationResult;
  lifecycle: DomainLifecycleRecord;
  compiled_domain_pack: AtlasDomainPack;
  persisted_record: PersistedDomainRecord;
}

export class AtlasSearchFactory {
  private repository: AtlasDomainSpecRepository;
  private lifecycleManager: AtlasDomainLifecycleManager;
  private compiler: AtlasDomainCompiler;
  private governanceEngine: AtlasSourceGovernanceGateEngine;

  constructor() {
    this.repository = new AtlasDomainSpecRepository();
    this.lifecycleManager = new AtlasDomainLifecycleManager(this.repository);
    this.compiler = new AtlasDomainCompiler();
    this.governanceEngine = new AtlasSourceGovernanceGateEngine();
  }

  /**
   * Main entry point: Natural Language -> Verified Domain Specification
   */
  public generateDomainFromNaturalLanguage(
    prompt: string,
    overrides?: Partial<AtlasDomainSpecification>
  ): FactoryGenerationResult {
    const now = new Date().toISOString();

    // 1. Parse user intent
    const parsedIntent = AtlasDomainIntentParser.parseUserIntent(prompt);

    // 2. Generate classified schema fields
    const fields = AtlasDomainSchemaGenerator.generateSchema(parsedIntent);

    // 3. Propose strong identity and anti-merge policy
    const identityPolicy = AtlasIdentityPolicyProposal.generateIdentityPolicy(parsedIntent);

    // 4. Propose candidate sources and governance policy
    const governancePolicy = AtlasSourceStrategyGenerator.generateGovernancePolicy();
    const sourceCandidates = AtlasSourceStrategyGenerator.generateCandidateSources(parsedIntent);

    // 5. Generate Penta Radar discovery instructions
    const discoveryPlan = AtlasDiscoveryPlanGenerator.generateDiscoveryPlan(parsedIntent);

    // 6. Generate ranking factors, facets, coverage dimensions
    const rankingAndFacets = AtlasRankingAndFacetGenerator.generateRankingAndFacets(parsedIntent);

    // 7. Generate clean commercial UI config for Search App Shell
    const uiConfig = AtlasUIConfigGenerator.generateUIConfig(parsedIntent);

    // 8. Assemble complete AtlasDomainSpecification
    const specification: AtlasDomainSpecification = {
      domain_id: overrides?.domain_id || parsedIntent.domain_id,
      spec_version: '1.0.0',
      generator_version: 'SEARCH_FACTORY_V1',
      natural_language_goal: prompt,
      created_at: now,
      updated_at: now,

      entity_type: overrides?.entity_type || parsedIntent.entity_type,
      display_name: overrides?.display_name || parsedIntent.display_name,
      sector_scope: overrides?.sector_scope || parsedIntent.sector_scope,
      geographic_scope: overrides?.geographic_scope || parsedIntent.geographic_scope,
      target_audience: overrides?.target_audience || parsedIntent.target_audience,

      fields: overrides?.fields || fields,
      identity_policy: overrides?.identity_policy || identityPolicy,

      evidence_policy: {
        require_source_url: true,
        require_confidence: true,
        min_confidence_to_persist: 0.85,
        require_observed_at: true
      },

      governance_policy: governancePolicy,
      source_candidates: sourceCandidates,
      discovery_plan: discoveryPlan,

      searchable_fields: rankingAndFacets.searchable_fields,
      facets: rankingAndFacets.facets,
      ranking_factors: rankingAndFacets.ranking_factors,
      default_sort: rankingAndFacets.default_sort,
      coverage_dimensions: rankingAndFacets.coverage_dimensions,

      freshness_policy: {
        stale_threshold_days: parsedIntent.freshness_requirement_days || 30,
        auto_refresh_queue_priority: 75
      },

      ui_config: overrides?.ui_config || uiConfig
    };

    // 9. Static Validation Gate
    const staticValidation = AtlasDomainStaticValidator.validateSpecification(specification);
    if (!staticValidation.valid) {
      throw new Error(`[AtlasSearchFactory] Specification failed static validation: ${staticValidation.errors.join(', ')}`);
    }

    // 10. Dynamic Compilation (Zero Codegen!)
    const { domainPack } = this.compiler.compile(specification);

    // 11. Initialize Lifecycle in DRAFT
    const lifecycle = this.lifecycleManager.initializeLifecycle(specification);

    // 12. Persist to storage for restart survival
    const persisted = this.repository.saveDomain(specification, lifecycle);

    return {
      specification,
      static_validation: staticValidation,
      lifecycle,
      compiled_domain_pack: domainPack,
      persisted_record: persisted
    };
  }

  /**
   * Advance domain to SHADOW state
   */
  public advanceToShadow(spec: AtlasDomainSpecification, lifecycle: DomainLifecycleRecord): DomainLifecycleRecord {
    const updated = this.lifecycleManager.advanceState(
      lifecycle,
      'SHADOW',
      'SYSTEM_FACTORY',
      'Approved for SHADOW discovery evaluation'
    );
    this.repository.saveDomain(spec, updated);
    return updated;
  }

  /**
   * Evaluate Governance Gates on Candidate Sources
   */
  public auditSourceGovernance(spec: AtlasDomainSpecification): ReturnType<AtlasSourceGovernanceGateEngine['evaluateCandidateSources']> {
    return this.governanceEngine.evaluateCandidateSources(spec.source_candidates, spec.governance_policy);
  }

  /**
   * Advance domain to CANARY state
   */
  public advanceToCanary(spec: AtlasDomainSpecification, lifecycle: DomainLifecycleRecord, canaryDetails: string): DomainLifecycleRecord {
    const updated = this.lifecycleManager.advanceState(
      lifecycle,
      'CANARY',
      'SYSTEM_FACTORY',
      `Physical candidate sources audited; starting canary: ${canaryDetails}`
    );
    this.repository.saveDomain(spec, updated);
    return updated;
  }

  /**
   * Promote to CERTIFIED upon physical canary pass
   */
  public promoteToCertified(
    spec: AtlasDomainSpecification,
    lifecycle: DomainLifecycleRecord,
    canaryGateResult: { passed: boolean; details: string; verified_count: number }
  ): DomainLifecycleRecord {
    const updated = this.lifecycleManager.advanceState(
      lifecycle,
      'CERTIFIED',
      'SYSTEM_FACTORY',
      `Physical canary passed with ${canaryGateResult.verified_count} verified entities. Domain certified.`,
      {
        gate_name: 'PHYSICAL_CANARY_INTEGRITY_GATE',
        passed: canaryGateResult.passed,
        timestamp: new Date().toISOString(),
        score: 100,
        details: canaryGateResult.details
      }
    );
    this.repository.saveDomain(spec, updated);
    return updated;
  }

  /**
   * Explicit Human Activation: CERTIFIED -> ACTIVE (Correction 4)
   */
  public approveActivation(domainId: string, operatorEmail: string, notes: string): DomainLifecycleRecord {
    const loaded = this.repository.loadDomain(domainId);
    if (!loaded) {
      throw new Error(`Domain '${domainId}' not found in repository.`);
    }

    const lifecycle: DomainLifecycleRecord = {
      domain_id: loaded.domain_id,
      spec_version: loaded.spec_version,
      generator_version: loaded.generator_version,
      compiled_spec_hash: loaded.compiled_spec_hash,
      current_state: loaded.lifecycle_state,
      created_at: loaded.created_at,
      updated_at: loaded.updated_at,
      last_certified_at: loaded.last_certified_at,
      promotion_history: loaded.promotion_history,
      gate_history: loaded.gate_results,
      manual_overrides: loaded.manual_overrides
    };

    return this.lifecycleManager.approveActivation(loaded.generated_specification, lifecycle, operatorEmail, notes);
  }

  public getRepository(): AtlasDomainSpecRepository {
    return this.repository;
  }

  public getCompiler(): AtlasDomainCompiler {
    return this.compiler;
  }
}
