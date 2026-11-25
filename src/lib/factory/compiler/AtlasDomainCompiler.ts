/**
 * ATLAS DOMAIN COMPILER V1
 * 
 * Dynamic runtime compiler that transforms an AtlasDomainSpecification
 * into a live AtlasDomainPack instance for AtlasIndustrialSearchFabric.
 * 
 * Guaranteed Invariants (Correction 1 & 6):
 * - MANUAL_DOMAIN_CODE_REQUIRED = 0 (No hand-written .ts files per domain!)
 * - Strictly checks DOMAIN_STATIC_VALIDATION before compilation.
 * - Produces fully typed, executable DomainPack with dynamic validation and completeness scoring.
 */

import fs from 'fs';
import path from 'path';
import type { AtlasDomainSpecification } from '../contracts/AtlasDomainSpecification';
import type { AtlasDomainPack } from '../../fabric/contracts/AtlasDomainPack';
import { AtlasDomainStaticValidator, type StaticValidationResult } from './AtlasDomainStaticValidator';

export interface CompilationReport {
  domain_id: string;
  compiled_at: string;
  compiler_version: string;
  static_validation: StaticValidationResult;
  compiled_schema_fields_count: number;
  compiled_facets_count: number;
  status: 'SUCCESS' | 'FAILED_VALIDATION';
}

export class AtlasDomainCompiler {
  private reportPath: string;

  constructor(reportPath?: string) {
    if (typeof window !== 'undefined') {
      this.reportPath = reportPath || 'reports/atlas/factory/domain_compiler_report.json';
    } else {
      this.reportPath = reportPath || path.resolve('reports/atlas/factory/domain_compiler_report.json');
      try {
        fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
      } catch {}
    }
  }

  /**
   * Compiles an AtlasDomainSpecification into a live executable AtlasDomainPack
   */
  public compile(spec: AtlasDomainSpecification): {
    domainPack: AtlasDomainPack;
    report: CompilationReport;
  } {
    // 1. Run static validation gate
    const validation = AtlasDomainStaticValidator.validateSpecification(spec);
    if (!validation.valid) {
      const failedReport: CompilationReport = {
        domain_id: spec.domain_id,
        compiled_at: new Date().toISOString(),
        compiler_version: 'ATLAS_DOMAIN_COMPILER_V1',
        static_validation: validation,
        compiled_schema_fields_count: 0,
        compiled_facets_count: 0,
        status: 'FAILED_VALIDATION'
      };
      if (typeof window === 'undefined') {
        try {
          fs.writeFileSync(this.reportPath, JSON.stringify(failedReport, null, 2), 'utf8');
        } catch {}
      }
      throw new Error(`[AtlasDomainCompiler] Static validation failed for '${spec.domain_id}': ${validation.errors.join('; ')}`);
    }

    // 2. Build entity_schema record from fields
    const entitySchema: Record<string, { type: string; required: boolean; description?: string }> = {};
    for (const field of spec.fields) {
      entitySchema[field.name] = {
        type: field.type,
        required: field.required,
        description: field.description
      };
    }

    // 3. Build dynamic DomainPack instance
    const domainPack: AtlasDomainPack = {
      domain_id: spec.domain_id,
      entity_type: spec.entity_type,
      display_name: spec.display_name,
      version: spec.spec_version,

      entity_schema: entitySchema,
      searchable_fields: spec.searchable_fields,
      facets: spec.facets,

      identity_policy: {
        primary_id_field: spec.identity_policy.primary_id_field,
        strong_identifier_fields: spec.identity_policy.strong_identifier_fields,
        soft_corroboration_fields: spec.identity_policy.secondary_identifier_fields,
        allow_soft_canonical_merge: false,
        dedup_strategy: spec.identity_policy.dedup_strategy,
        collision_action: spec.identity_policy.collision_action
      },

      evidence_policy: spec.evidence_policy,

      source_policy: {
        allowed_source_types: ['OPEN_GOVERNMENT', 'OFFICIAL_REGISTRY', 'BULLETIN_GAZETTE'],
        commercial_reuse_gate_required: spec.governance_policy.commercial_reuse_gate.required,
        privacy_gate_required: spec.governance_policy.privacy_gate.required
      },

      privacy_policy: {
        allow_private_contact_harvesting: false,
        allow_home_address_harvesting: false,
        sensitive_field_masking: []
      },

      ranking_policy: {
        factors: spec.ranking_factors,
        default_sort: spec.default_sort
      },

      freshness_policy: spec.freshness_policy,

      discovery_policy: {
        discovery_patterns: spec.discovery_plan.explorer_targets,
        source_families: spec.source_candidates.map(s => s.source_family),
        target_entity_types: [spec.entity_type],
        replication_dimensions: spec.discovery_plan.replicator_dimensions
      },

      coverage_dimensions: spec.coverage_dimensions,
      ui_config: spec.ui_config,

      // Dynamic validation function
      validateEntity: (entity: any): { valid: boolean; errors?: string[] } => {
        const errors: string[] = [];
        const requiredFields = spec.fields.filter(f => f.required);
        for (const req of requiredFields) {
          const val = entity[req.name] ?? entity.attributes?.[req.name];
          if (val === undefined || val === null || val === '') {
            errors.push(`Missing required field '${req.name}'`);
          }
        }
        return {
          valid: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined
        };
      },

      // Dynamic completeness calculation function
      calculateCompletenessScore: (entity: any): number => {
        const attrs = entity.attributes || entity;
        let points = 0;
        const totalDimensions = spec.coverage_dimensions.length || 5;
        const pointsPerDimension = 100 / totalDimensions;

        for (const dim of spec.coverage_dimensions) {
          const lDim = dim.toLowerCase();
          // Check if any field matching this dimension is populated
          const matches = spec.fields.filter(f => f.name.toLowerCase().includes(lDim) || f.classification.toLowerCase().includes(lDim));
          let hasVal = false;
          if (matches.length > 0) {
            hasVal = matches.some(m => attrs[m.name] !== undefined && attrs[m.name] !== null && attrs[m.name] !== '');
          } else {
            hasVal = attrs[lDim] !== undefined && attrs[lDim] !== null;
          }
          if (hasVal) {
            points += pointsPerDimension;
          }
        }

        return Math.min(100, Math.round(points));
      }
    };

    const report: CompilationReport = {
      domain_id: spec.domain_id,
      compiled_at: new Date().toISOString(),
      compiler_version: 'ATLAS_DOMAIN_COMPILER_V1',
      static_validation: validation,
      compiled_schema_fields_count: spec.fields.length,
      compiled_facets_count: spec.facets.length,
      status: 'SUCCESS'
    };

    if (typeof window === 'undefined') {
      try {
        fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2), 'utf8');
      } catch {}
    }

    return { domainPack, report };
  }
}
