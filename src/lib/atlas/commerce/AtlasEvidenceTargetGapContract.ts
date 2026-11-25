/**
 * ATLAS COMMERCE — EVIDENCE TARGET GAP CONTRACT
 * Module: AtlasEvidenceTargetGapContract.ts
 * Path: src/lib/atlas/commerce/AtlasEvidenceTargetGapContract.ts
 * 
 * Converts DECISION_EVIDENCE_GAP candidates into structured acquisition requirements
 * for Penta / Source Planner WITHOUT executing acquisition or mutating the Truth Graph.
 * 
 * Strict Invariants:
 * - Generic: zero hardcoding of products, rubros, companies, or geographies.
 * - ACQUISITION_EXECUTED = 0
 * - TRUTH_MUTATIONS = 0
 */

import type { EvidenceFamilyId, EvaluatedCriterion, BuyerFitEvaluationResult } from './AtlasBuyerFitEngine.ts';

export interface MissingEvidenceRequirement {
  criterion: string;
  requirement_type: string;
  evidence_family: EvidenceFamilyId;
  description: string;
}

export interface EvidenceTargetGap {
  gap_id: string;
  candidate_id: string;
  candidate_name: string;
  entity_type: string;
  unresolved_criteria: string[];
  missing_requirements: MissingEvidenceRequirement[];
  target_evidence_families: EvidenceFamilyId[];
  proxy_ratio: number;
  priority: 'CRITICAL' | 'HIGH' | 'STANDARD';
  status: 'PENDING_PLANNING';
  geography?: string;
  known_identity?: {
    canonical_id: string;
    name: string;
    cuit?: string;
    osm_id?: string;
    aliases?: string[];
    [key: string]: any;
  };
  semantic_context?: string;
}

export interface PentaSourcePlan {
  plan_id: string;
  target_entity_id: string;
  target_entity_name: string;
  target_gap_id: string;
  required_families: EvidenceFamilyId[];
  recommended_penta_stages: string[];
  action: 'PLAN_ONLY';
  execution_blocked: true;
}

export class AtlasEvidenceTargetGapContract {
  /**
   * Generic dictionary mapping unresolved criterion keywords/families to concrete evidence requirements.
   */
  public static mapCriterionToRequirement(criterion: EvaluatedCriterion): MissingEvidenceRequirement {
    const critName = criterion.criterion.toUpperCase();
    const family = criterion.evidence_family;

    switch (family) {
      case 'WORKFORCE':
        return {
          criterion: criterion.criterion,
          requirement_type: 'VERIFIED_WORKFORCE_HEADCOUNT',
          evidence_family: 'WORKFORCE',
          description: 'Aserción física verificada de dotación de personal o escala laboral'
        };

      case 'ORGANIZATION':
        return {
          criterion: criterion.criterion,
          requirement_type: 'VERIFIED_ORGANIZATIONAL_GOVERNANCE',
          evidence_family: 'ORGANIZATION',
          description: 'Aserción física de estructura directiva, órganos de gobierno o filiales'
        };

      case 'COMMERCE':
        return {
          criterion: criterion.criterion,
          requirement_type: 'VERIFIED_COMMERCIAL_TRANSACTION_CAPACITY',
          evidence_family: 'COMMERCE',
          description: 'Registro verificado de demanda recurrente, compras o capacidad comercial de distribución'
        };

      case 'LEGAL_IDENTITY':
        return {
          criterion: criterion.criterion,
          requirement_type: 'VERIFIED_JURIDICAL_REGISTRATION',
          evidence_family: 'LEGAL_IDENTITY',
          description: 'Constatación física de personería jurídica, tipo societario formal y CUIT verificado'
        };

      case 'DIGITAL_PRESENCE':
        return {
          criterion: criterion.criterion,
          requirement_type: 'VERIFIED_CORPORATE_WEB_OR_LINKEDIN',
          evidence_family: 'DIGITAL_PRESENCE',
          description: 'Identificador oficial verificado de presencia digital o perfil corporativo'
        };

      case 'GEO':
        return {
          criterion: criterion.criterion,
          requirement_type: 'VERIFIED_OPERATIONAL_FACILITY_PREMISES',
          evidence_family: 'GEO',
          description: 'Sede operativa, sucursal o domicilio de producción física verificado'
        };

      case 'INDUSTRY':
      default:
        return {
          criterion: criterion.criterion,
          requirement_type: 'VERIFIED_OPERATIONAL_ACTIVITY',
          evidence_family: 'INDUSTRY',
          description: 'Aserción física de actividad primaria o rubro operativo comprobado'
        };
    }
  }

  /**
   * Recommends candidate Penta source stages based on missing families generically.
   */
  public static mapFamiliesToPentaStages(families: EvidenceFamilyId[]): string[] {
    const stages = new Set<string>();

    for (const fam of families) {
      switch (fam) {
        case 'WORKFORCE':
          stages.add('penta_stage_1_modernizacion');
          stages.add('penta_stage_3_sipro');
          break;
        case 'LEGAL_IDENTITY':
          stages.add('penta_stage_3_sipro');
          stages.add('penta_stage_5_ssn');
          break;
        case 'ORGANIZATION':
          stages.add('penta_stage_3_sipro');
          stages.add('penta_stage_8_chas_industrial');
          break;
        case 'COMMERCE':
          stages.add('penta_stage_7_compras_adjudicaciones');
          stages.add('penta_stage_8_chas_industrial');
          break;
        case 'DIGITAL_PRESENCE':
          stages.add('penta_stage_11_radar');
          break;
        case 'GEO':
          stages.add('penta_stage_6_shards_regionales');
          break;
        case 'INDUSTRY':
        default:
          stages.add('penta_stage_3_sipro');
          stages.add('penta_stage_6_shards_regionales');
          break;
      }
    }

    return Array.from(stages);
  }

  /**
   * Generates an EvidenceTargetGap for a blocked candidate.
   */
  public static generateTargetGap(evaluation: BuyerFitEvaluationResult): EvidenceTargetGap | null {
    const evaluated = evaluation.evaluated_criteria || [];
    const unknownCriteriaObjects = evaluated.filter(c => c.is_unknown);
    const proxyCriteriaObjects = evaluated.filter(c => c.nature === 'DERIVED_PROXY' && !c.is_unknown);
    const isBlocked = evaluation.proxy_ratio >= 0.50 || (evaluation.fit_tier !== 'HIGH_FIT' && unknownCriteriaObjects.length >= 2) || evaluation.fit_tier === 'INSUFFICIENT_EVIDENCE';

    if (!isBlocked) {
      return null;
    }

    // Identify unresolved criteria: unknown criteria + high-impact proxy criteria lacking physical evidence
    const unresolved: EvaluatedCriterion[] = [
      ...unknownCriteriaObjects,
      ...proxyCriteriaObjects.filter(p => !unknownCriteriaObjects.some(u => u.criterion === p.criterion))
    ];

    const requirements: MissingEvidenceRequirement[] = unresolved.map(c => this.mapCriterionToRequirement(c));
    const targetFamilies = Array.from(new Set(requirements.map(r => r.evidence_family)));

    const priority = evaluation.fit_score >= 0.50 ? 'CRITICAL' : (evaluation.fit_score >= 0.30 ? 'HIGH' : 'STANDARD');

    const meta = evaluation.candidate_metadata || {};
    const geography = meta.city || meta.locality || meta.province || meta.geography || (meta.address ? meta.address.split(',').pop()?.trim() : null) || 'ARG_NACIONAL';
    const known_identity = {
      canonical_id: evaluation.candidate_id,
      name: evaluation.candidate_name,
      cuit: meta.cuit,
      osm_id: meta.osm_id,
      aliases: meta.aliases || (meta.canonical_name && meta.canonical_name !== evaluation.candidate_name ? [meta.canonical_name] : []),
      metadata: meta
    };
    const semantic_context = meta.category || meta.rubro || evaluation.opportunity_type || requirements.map(r => r.criterion).join(', ');

    return {
      gap_id: `GAP_${evaluation.candidate_id.replace(/-/g, '').slice(0, 12)}`,
      candidate_id: evaluation.candidate_id,
      candidate_name: evaluation.candidate_name,
      entity_type: evaluation.candidate_type,
      unresolved_criteria: unresolved.map(c => c.criterion),
      missing_requirements: requirements,
      target_evidence_families: targetFamilies,
      proxy_ratio: evaluation.proxy_ratio,
      priority,
      status: 'PENDING_PLANNING',
      geography,
      known_identity,
      semantic_context
    };
  }

  /**
   * Generates a PentaSourcePlan from an EvidenceTargetGap without executing any acquisition.
   */
  public static generatePentaSourcePlan(gap: EvidenceTargetGap): PentaSourcePlan {
    return {
      plan_id: `PLAN_PENTA_${gap.gap_id}`,
      target_entity_id: gap.candidate_id,
      target_entity_name: gap.candidate_name,
      target_gap_id: gap.gap_id,
      required_families: gap.target_evidence_families,
      recommended_penta_stages: this.mapFamiliesToPentaStages(gap.target_evidence_families),
      action: 'PLAN_ONLY',
      execution_blocked: true
    };
  }
}
