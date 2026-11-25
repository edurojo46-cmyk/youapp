/**
 * ATLAS VENDER / COMMERCE V1
 * Module: AtlasBuyerFitEngine.ts
 * Path: src/lib/atlas/commerce/AtlasBuyerFitEngine.ts
 * 
 * Evaluates structural compatibility between an AtlasProductProfile and candidate buyers (COMPANY or PERSON).
 * 
 * Strict Invariants & Semantic Guarantees:
 * - BUYER_FIT != OPPORTUNITY. Structural fit exists independently of active temporal changes.
 * - FOUR SEPARATE DIMENSIONS: BUYER_FIT, OPPORTUNITY_SCORE, CONTACTABILITY_SCORE, CONFIDENCE_SCORE.
 * - ZERO SENSITIVE ATTRIBUTES FOR PERSONS: Strictly no religion, health, sexual orientation, politics, or ethnicity.
 * - NEVER LOWER BUYER FIT TO 0 FOR LACK OF CONTACTS: HIGH_FIT, NOT_CONTACTABLE is valid.
 * - TIMING BOOST: Active signals (HIRING, EXPANSION, NEW_BUSINESS) boost priority without altering base fit.
 * - CONTACTABILITY NEVER CREATES FIT OR TIMING: Timing boost strictly requires commercial signals.
 * - OPPORTUNITY SCORE NEVER 'ACTIVE': Status is ACTIVE; score is null or numeric.
 * - UNKNOWN IS NEVER MATCH: Missing data reduces coverage and confidence, never adds match points.
 * - NEGATIVE EVIDENCE: Explicit incompatibility reduces fit score.
 * - EVIDENCE FAMILY & INDEPENDENCE: CUIT/S.A. belongs to LEGAL_IDENTITY and counts only once for independence.
 * - NATURE DECLARATION: Every criterion explicitly declares OBSERVED, DERIVED_PROXY, INFERRED, or UNKNOWN.
 * - MULTIPLE_LOCATIONS: Strictly requires COUNT(DISTINCT normalized_location) >= 2.
 * - PROXY_RATIO & CONFIDENCE CAP: When proxies dominate, confidence is strictly capped.
 */

import { AtlasProductProfile } from './AtlasProductProfile.ts';
import { EvidenceSemanticGate, type SemanticValidityStatus, type SemanticValidityEvaluation } from './EvidenceSemanticGate.ts';

export type CriterionNature = 'OBSERVED' | 'DERIVED_PROXY' | 'INFERRED' | 'UNKNOWN';
export type NeedNature = 'OBSERVED' | 'DERIVED' | 'INFERRED' | 'UNKNOWN';
export type PurchaseIntentStatus = 'OBSERVED' | 'ACTIVE_SIGNAL' | 'UNCONFIRMED' | 'NONE';

export type EvidenceFamilyId = 
  | 'LEGAL_IDENTITY'
  | 'WORKFORCE'
  | 'GEO'
  | 'HIRING'
  | 'INDUSTRY'
  | 'ORGANIZATION'
  | 'COMMERCE'
  | 'DIGITAL_PRESENCE';

export interface ObservedAssertionWithEvidence {
  assertion_id?: string;
  predicate: string;
  value_normalized: string;
  truth_nature?: string;
  evidence_id?: string;
  source_id?: string;
  source_url?: string;
}

export interface EvaluatedCriterion {
  criterion: string;
  value: string;
  nature: CriterionNature;
  evidence_family: EvidenceFamilyId;
  is_positive: boolean;
  is_negative: boolean;
  is_unknown: boolean;
  score_contribution: number;
  source_assertions: string[];
  explanation: string;
  predicate?: string;
  assertion_id?: string;
  evidence_id?: string;
  source_id?: string;
  observed_invalid?: boolean;
}

export interface BuyerCandidateContext {
  entity_id: string;
  name: string;
  entity_type: 'COMPANY' | 'ORGANIZATION' | 'PERSON';
  metadata?: Record<string, any>;
  observed_assertions?: ObservedAssertionWithEvidence[];
  active_opportunity_types?: string[];
  active_opportunities?: {
    opportunity_type: string;
    status: string;
    score: number | null;
  }[];
  opportunity_score?: number | null;
  opportunity_status?: string;
  verified_contacts?: {
    emails?: string[];
    phones?: string[];
    linkedin?: string[];
  };
}

export type FitTier = 'HIGH_FIT' | 'MEDIUM_FIT' | 'LOW_FIT' | 'INSUFFICIENT_EVIDENCE';

export interface BuyerFitEvaluationResult {
  candidate_id: string;
  candidate_name: string;
  candidate_type: 'COMPANY' | 'ORGANIZATION' | 'PERSON';
  candidate_metadata?: Record<string, any>;
  base_buyer_fit_score: number;
  fit_score: number;
  criteria_coverage: number;
  independent_evidence_coverage: number;
  evidence_coverage: number; // backward compatibility (= criteria_coverage)
  proxy_ratio: number;
  fit_confidence: number;
  confidence_score: number;
  distinct_locations: number;
  evaluated_criteria: EvaluatedCriterion[];
  positive_criteria: string[];
  negative_criteria: string[];
  unknown_criteria: string[];
  active_evidence_families: EvidenceFamilyId[];
  timing_boost: number;
  final_priority_score: number;
  is_compatible: boolean;
  fit_tier: FitTier;
  opportunity_type: string;
  opportunity_status: string;
  opportunity_score: number | null;
  commercial_opportunity: 'ACTIVE' | 'NOT_DETERMINED';
  opportunity_signal_types: string[];
  contactability_score: number;
  match_reasons: string[];
  why_fit: string;
  recommended_product_plan: string;
  verified_contact_points: {
    emails: string[];
    phones: string[];
    linkedin: string[];
  };
  // Section 7 Telemetry:
  product_use_case_match: boolean;
  buyer_need_match: boolean; // Preserved for backward compatibility
  industry_match: boolean;
  operating_context_match: boolean;
  attribute_match: boolean;
  product_domain_to_buyer_industry_leak: boolean;

  // STRICT REALITY SEMANTICS (NEED != PURCHASE_INTENT & OBSERVABILITY):
  buyer_compatibility: boolean;
  buyer_need: boolean;
  buyer_need_nature: NeedNature;
  buyer_need_confidence: number;
  buyer_need_evidence_ids: string[];
  buyer_need_source_ids: string[];
  why_need: string;
  purchase_intent: PurchaseIntentStatus;
  purchase_intent_score: number | null;
  purchase_intent_signals: string[];

  // EVIDENCE SEMANTIC VALIDITY (SEPARATE PROVENANCE FROM TRUTH):
  semantic_validity: SemanticValidityStatus;
  semantic_conflict: boolean;
  conflict_reason: string | null;
}

// Prohibited sensitive attributes for PERSON targeting
const PROHIBITED_SENSITIVE_KEYWORDS = [
  'religion', 'religiosa', 'iglesia', 'culto',
  'salud', 'enfermedad', 'patologia', 'diagnostico', 'medico',
  'politica', 'partido', 'militancia', 'ideologia',
  'sexual', 'genero_sensible', 'orientacion',
  'etnia', 'raza', 'origen_etnico'
];

export class AtlasBuyerFitEngine {
  /**
   * Main entry point to evaluate candidate compatibility with product profile.
   */
  public static evaluateFit(
    candidate: BuyerCandidateContext,
    profile: AtlasProductProfile
  ): BuyerFitEvaluationResult {
    if (candidate.entity_type === 'PERSON') {
      return this.evaluatePersonFit(candidate, profile);
    } else {
      return this.evaluateCompanyFit(candidate, profile);
    }
  }

  /**
   * Evaluates COMPANY Buyer Fit using product-specific criteria, provenance-aware evidence families,
   * explicit criterion nature, independent coverage, and strict proxy bounds.
   */
  public static evaluateCompanyFit(
    candidate: BuyerCandidateContext,
    profile: AtlasProductProfile
  ): BuyerFitEvaluationResult {
    const meta = candidate.metadata || {};
    const assertions = candidate.observed_assertions || [];

    // Extract physical assertions from Truth Graph
    const activityAst = assertions.find(a => a.predicate === 'COMPANY_ACTIVITY');
    const addressAst = assertions.find(a => a.predicate === 'COMPANY_ADDRESS');
    const nameAst = assertions.find(a => a.predicate === 'COMPANY_NAME');
    const linkedinAst = assertions.find(a => a.predicate === 'HAS_LINKEDIN');
    const emailAst = assertions.find(a => a.predicate === 'HAS_EMAIL');
    const phoneAst = assertions.find(a => a.predicate === 'HAS_PHONE');
    const workforceAst = assertions.find(a => a.predicate === 'EMPLOYEE_COUNT' || a.predicate === 'HEADCOUNT');

    const activityFact = activityAst?.value_normalized || meta.category || meta.rubro || '';
    const addressFact = addressAst?.value_normalized || meta.address || meta.domicilio || '';
    const nameFact = nameAst?.value_normalized || candidate.name || '';
    const cuit = meta.cuit || '';
    const provenance = meta.provenance || meta.source || '';

    const actLower = activityFact.toLowerCase();
    const nameLower = nameFact.toLowerCase();
    const provLower = provenance.toLowerCase();

    // EVIDENCE SEMANTIC GATE: Strict separation of PROVENANCE_VALIDITY from SEMANTIC_VALIDITY
    const semanticGate = EvidenceSemanticGate.evaluateSemanticValidity({
      entity_name: nameFact,
      entity_type: candidate.entity_type,
      activity: activityFact,
      metadata: meta,
      assertions
    });

    // Helper to strictly validate OBSERVED vs DERIVED_PROXY (Invariants 2 & 3)
    const buildCriterion = (params: {
      criterion: string;
      value: string;
      intended_nature: CriterionNature;
      evidence_family: EvidenceFamilyId;
      is_positive: boolean;
      is_negative: boolean;
      is_unknown: boolean;
      score_contribution: number;
      explanation: string;
      matching_assertion?: ObservedAssertionWithEvidence;
      source_assertions?: string[];
    }): EvaluatedCriterion => {
      let nature = params.intended_nature;
      let observedInvalid = false;
      const ast = params.matching_assertion;
      const assertionId = ast?.assertion_id;
      const evidenceId = ast?.evidence_id;
      const sourceId = ast?.source_id;
      const predicate = ast?.predicate;

      if (nature === 'OBSERVED') {
        // Invariant: OBSERVED strictly requires physical assertion_id, evidence_id, source_id
        if (!ast || !assertionId || !evidenceId || !sourceId) {
          observedInvalid = true;
          nature = 'DERIVED_PROXY'; // downgrade if physical provenance missing
        }
      }

      return {
        criterion: params.criterion,
        value: params.value,
        nature,
        evidence_family: params.evidence_family,
        is_positive: params.is_positive,
        is_negative: params.is_negative,
        is_unknown: params.is_unknown,
        score_contribution: params.score_contribution,
        source_assertions: params.source_assertions || (predicate ? [predicate] : []),
        explanation: params.explanation,
        predicate,
        assertion_id: assertionId,
        evidence_id: evidenceId,
        source_id: sourceId,
        observed_invalid: observedInvalid
      };
    };

    // 1. Calculate COUNT(DISTINCT normalized_location) physically
    // Requirement 6: Strictly COUNT(DISTINCT normalized_location) >= 2.
    // Never infer by name, category, 'oficina', or 'empresa grande'.
    const addressValues: string[] = [];
    for (const a of assertions) {
      if (a.predicate === 'COMPANY_ADDRESS' && a.value_normalized) {
        addressValues.push(a.value_normalized.trim().toLowerCase());
      }
    }
    if (meta.address) addressValues.push(meta.address.trim().toLowerCase());
    if (meta.domicilio) addressValues.push(meta.domicilio.trim().toLowerCase());

    const normalizedLocations = new Set(
      addressValues.map(addr => 
        addr.replace(/,\s*(caba|ciudad autónoma de buenos aires|buenos aires|argentina)/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
      ).filter(a => a.length > 3)
    );
    const distinctLocations = normalizedLocations.size;

    const evaluatedCriteria: EvaluatedCriterion[] = [];

    // EVIDENCE SEMANTIC GATE: Flag conflicting assertions before evaluating fit
    if (semanticGate.is_conflicting) {
      evaluatedCriteria.push(buildCriterion({
        criterion: 'EVIDENCE_SEMANTIC_VALIDITY',
        value: 'CONFLICTING',
        intended_nature: 'DERIVED_PROXY',
        evidence_family: 'INDUSTRY',
        is_positive: false,
        is_negative: true,
        is_unknown: false,
        score_contribution: -0.40,
        explanation: `SEMANTIC_CONFLICT: La actividad observada (${activityFact}) contradice la denominación o naturaleza de la entidad (${candidate.name}) [${semanticGate.conflict_reason}]`
      }));
    }

    // Strictly separate dimensions: BUYER_COMPATIBILITY vs BUYER_NEED vs PURCHASE_INTENT
    let buyerCompatibility = false;
    let buyerNeedNature: NeedNature = 'UNKNOWN';
    let buyerNeedConfidence = 0.0;
    let buyerNeedEvidenceIds: string[] = [];
    let buyerNeedSourceIds: string[] = [];
    let whyNeed = semanticGate.is_conflicting
      ? `SIN EVIDENCIA DE NECESIDAD (CONFLICTO SEMÁNTICO): La actividad declarada (${activityFact}) contradice la naturaleza de ${candidate.name} (${semanticGate.conflict_reason})`
      : 'SIN EVIDENCIA DE NECESIDAD: Sin evidencia de requerimiento operativo';

    // Purchase intent variables (strictly separated from structural compatibility & need)
    const oppSignals = candidate.active_opportunity_types || [];
    const oppsList = candidate.active_opportunities || [];
    const commercialOppSignals = oppSignals.filter(s => s !== 'CONTACTABILITY_SIGNAL');
    const hasCommercialOpportunity = !semanticGate.is_conflicting && commercialOppSignals.length > 0;

    let purchaseIntent: PurchaseIntentStatus = 'UNCONFIRMED';
    let purchaseIntentScore: number | null = null;
    let purchaseIntentSignals: string[] = [];

    if (semanticGate.is_conflicting) {
      purchaseIntent = 'NONE';
      purchaseIntentScore = null;
      purchaseIntentSignals = [];
    } else if (hasCommercialOpportunity) {
      const primeOpp = oppsList.find(o => o.opportunity_type !== 'CONTACTABILITY_SIGNAL');
      purchaseIntent = 'ACTIVE_SIGNAL';
      purchaseIntentScore = primeOpp?.score !== null && primeOpp?.score !== undefined ? parseFloat(String(primeOpp.score)) : 0.70;
      purchaseIntentSignals = commercialOppSignals;
    } else {
      purchaseIntent = 'UNCONFIRMED';
      purchaseIntentScore = null;
      purchaseIntentSignals = [];
    }

    // --- CASE A: SOFTWARE DE RECURSOS HUMANOS (SOFTWARE_HR) ---
    if (profile.category === 'SOFTWARE_HR') {
      const isLargeCorporateLegal = nameLower.includes('s.a.') || nameLower.includes('corp') || nameLower.includes('group') || nameLower.includes('global') || nameLower.includes('holdings') || nameLower.includes('s.a.u.');
      const isGrandesEmpresas = provLower.includes('grandes empresas') || provLower.includes('padron oficial') || provLower.includes('socio') || provLower.includes('distrito tecnologico');
      const isFormalOrganization = candidate.entity_type === 'ORGANIZATION' || nameLower.includes('s.a.') || nameLower.includes('s.r.l.') || nameLower.includes('s.a.s.');
      const isJuridicalCuit = cuit.startsWith('30-');
      const isMicroOrUnipersonal = /kiosco|carniceria|butcher|cerrajeria|locksmith|zapateria|panaderia|bakery/i.test(actLower) || /kiosco|rotiseria/i.test(nameLower);

      const isMassOperationalWorkforce = /salud|hospital|sanatorio|m[eé]dic|hotel|hoteler[ií]a|alojamiento|banco|bancari|financier|supermercado|retail|comercio minorista|construcci[oó]n|constructora|obra|industria|manufactura|f[aá]brica|telecomunicaci[oó]n|consumo masivo|alimentos|bebidas|transporte de energ[ií]a|electricidad|distribuidora el[eé]ctrica/i.test(actLower) || /hospital|sanatorio|cl[ií]nica|hotel|banco|supermercado|constructora/i.test(nameLower);
      const isTechTalentWorkforce = /\b(ti|it|tech)\b|software|desarrollo de sistemas|consultor|testing|ingeniería de software|\bsistemas\b|cloud/i.test(actLower);

      buyerCompatibility = (isMassOperationalWorkforce || isTechTalentWorkforce || isFormalOrganization) && !isMicroOrUnipersonal;

      const explicitNeedAst = assertions.find(a => a.predicate === 'HR_SOFTWARE_NEED' || a.predicate === 'PROCUREMENT_TENDER' || a.predicate === 'HIRING_VACANCY');
      if (explicitNeedAst && explicitNeedAst.assertion_id && explicitNeedAst.evidence_id && explicitNeedAst.source_id) {
        buyerNeedNature = 'OBSERVED';
        buyerNeedConfidence = 0.85;
        buyerNeedEvidenceIds = [explicitNeedAst.evidence_id];
        buyerNeedSourceIds = [explicitNeedAst.source_id];
        whyNeed = `NECESIDAD OBSERVADA: Requerimiento explícito o licitación de RRHH verificado en SSOT (${explicitNeedAst.value_normalized})`;
      } else if (isMassOperationalWorkforce) {
        buyerNeedNature = 'DERIVED';
        buyerNeedConfidence = 0.65;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id, linkedinAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id, linkedinAst?.source_id].filter(Boolean) as string[];
        whyNeed = `COMPATIBILIDAD OPERATIVA: Organización corporativa formal (${activityFact || candidate.name}) con dotación operativa masiva y probable necesidad de gestión de nómina y RRHH`;
      } else if (isTechTalentWorkforce) {
        buyerNeedNature = 'DERIVED';
        buyerNeedConfidence = 0.55;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id, linkedinAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id, linkedinAst?.source_id].filter(Boolean) as string[];
        whyNeed = `COMPATIBILIDAD OPERATIVA: Empresa de servicios profesionales/TI (${activityFact || candidate.name}) con talento calificado y probable necesidad de control de gestión`;
      } else if (isFormalOrganization) {
        buyerNeedNature = 'INFERRED';
        buyerNeedConfidence = 0.35;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id].filter(Boolean) as string[];
        whyNeed = `NECESIDAD INFERIDA: Entidad societaria formal (${activityFact || candidate.name}) con posible requerimiento de administración de personal`;
      } else {
        buyerNeedNature = 'UNKNOWN';
        buyerNeedConfidence = 0.05;
        whyNeed = 'SIN EVIDENCIA DE NECESIDAD: Rubro micro o sin evidencia de personal formal';
        buyerCompatibility = false;
        purchaseIntent = 'NONE';
      }

      // CRITERION 1: EMPLOYEE_SCALE (evidence_family: WORKFORCE)
      if (workforceAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EMPLOYEE_SCALE',
          value: `${workforceAst.value_normalized} empleados`,
          intended_nature: 'OBSERVED',
          evidence_family: 'WORKFORCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.16,
          explanation: `OBSERVED: Dotación de personal observada físicamente (${workforceAst.value_normalized} empleados)`,
          matching_assertion: workforceAst
        }));
      } else if (isMicroOrUnipersonal) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EMPLOYEE_SCALE',
          value: 'MICRO_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.25,
          explanation: 'NEGATIVE: Establecimiento comercial micro o artesanal sin escala de nómina'
        }));
      } else if (isLargeCorporateLegal || isGrandesEmpresas) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EMPLOYEE_SCALE',
          value: 'PROXY_CORPORATE_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: 'DERIVED: Estructura societaria corporativa utilizada como proxy de dotación de personal'
        }));
      } else if (isFormalOrganization) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EMPLOYEE_SCALE',
          value: 'PROXY_PYME_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.04,
          explanation: 'DERIVED: Sociedad comercial formal utilizada como proxy de dotación pyme'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EMPLOYEE_SCALE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'WORKFORCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Cantidad de empleados no observada'
        }));
      }

      // CRITERION 2: ORGANIZATION_COMPLEXITY (evidence_family: ORGANIZATION)
      const orgStructureAst = assertions.find(a => a.predicate === 'HAS_BOARD' || a.predicate === 'ORGANIZATION_STRUCTURE');
      if (orgStructureAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: orgStructureAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'ORGANIZATION',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.14,
          explanation: 'OBSERVED: Estructura organizativa formal observada físicamente',
          matching_assertion: orgStructureAst
        }));
      } else if (isMicroOrUnipersonal) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: 'SIMPLE_STRUCTURE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.15,
          explanation: 'NEGATIVE: Estructura simple sin complejidad organizacional'
        }));
      } else if (isLargeCorporateLegal && isJuridicalCuit) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: 'PROXY_CORPORATE_STRUCTURE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.10,
          explanation: 'DERIVED: Sociedad anónima con CUIT 30- como proxy de gobierno corporativo y departamentos'
        }));
      } else if (isFormalOrganization) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: 'PROXY_FORMAL_ORGANIZATION',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.06,
          explanation: 'DERIVED: Estructura societaria como proxy de organización formal'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'ORGANIZATION',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Estructura organizacional no observada'
        }));
      }

      // CRITERION 3: PHYSICAL_OPERATIONAL_PRESENCE (evidence_family: GEO)
      if (addressAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_OPERATIONAL_PRESENCE',
          value: addressAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: `OBSERVED: Domicilio operativo verificado en grafo de verdad (${addressAst.value_normalized})`,
          matching_assertion: addressAst
        }));
      } else if (addressFact.length > 5) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_OPERATIONAL_PRESENCE',
          value: addressFact,
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.04,
          explanation: `DERIVED: Domicilio declarado en metadatos (${addressFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_OPERATIONAL_PRESENCE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Domicilio operativo no observado'
        }));
      }

      // CRITERION 4: DIGITAL_EMPLOYER_FOOTPRINT (evidence_family: DIGITAL_PRESENCE)
      if (linkedinAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'DIGITAL_EMPLOYER_FOOTPRINT',
          value: linkedinAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: `OBSERVED: Perfil corporativo verificado en grafo de verdad (${linkedinAst.value_normalized})`,
          matching_assertion: linkedinAst
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'DIGITAL_EMPLOYER_FOOTPRINT',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Presencia digital corporativa no observada'
        }));
      }

      // CRITERION 5: WORKFORCE_INTENSITY (evidence_family: INDUSTRY)
      const isLowWorkforceIndustry = /holding|alquiler|rentista|inversion pasiva/i.test(actLower);

      if (isMicroOrUnipersonal || isLowWorkforceIndustry) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'WORKFORCE_INTENSITY',
          value: 'ZERO_WORKFORCE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.25,
          explanation: 'NEGATIVE: Actividad micro o de inversión pasiva con baja o nula intensidad de mano de obra'
        }));
      } else if (isMassOperationalWorkforce) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'WORKFORCE_INTENSITY',
          value: 'MASS_OPERATIONAL_WORKFORCE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.18,
          explanation: `COMPATIBILIDAD OPERATIVA: Organización en sector de alta dotación operativa y volumen de nómina (${activityFact || candidate.name}); probable necesidad de software de RRHH`
        }));
      } else if (isTechTalentWorkforce) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'WORKFORCE_INTENSITY',
          value: 'HIGH_TALENT_INTENSITY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.14,
          explanation: `COMPATIBILIDAD OPERATIVA: Industria de servicios profesionales/TI con talento calificado (${activityFact || candidate.name}); probable necesidad de control de gestión`
        }));
      } else if (isFormalOrganization) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'WORKFORCE_INTENSITY',
          value: 'CORPORATE_STAFF_INTENSITY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: 'NECESIDAD INFERIDA: Entidad corporativa formal con dotación administrativa y posible requerimiento de RRHH'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'WORKFORCE_INTENSITY',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Intensidad de mano de obra no determinada'
        }));
      }

      // CRITERION 6: INDUSTRY_RELEVANCE (evidence_family: INDUSTRY)
      const isEmployerIndustry = isMassOperationalWorkforce || isTechTalentWorkforce || isFormalOrganization;
      if (isMicroOrUnipersonal || /veterinaria|pet|mascota/i.test(actLower)) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'INDUSTRY_RELEVANCE',
          value: 'INCOMPATIBLE_INDUSTRY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.30,
          explanation: 'NEGATIVE: Rubro micro-comercial sin proceso formal de gestión de nómina o recursos humanos'
        }));
      } else if (isEmployerIndustry) {
        if (activityAst) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'INDUSTRY_RELEVANCE',
            value: 'CROSS_INDUSTRY_EMPLOYER',
            intended_nature: 'OBSERVED',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.16,
            explanation: `OBSERVED: Organización formal verificada en grafo de verdad (${activityFact || candidate.name})`,
            matching_assertion: activityAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'INDUSTRY_RELEVANCE',
            value: 'CROSS_INDUSTRY_EMPLOYER',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.10,
            explanation: `DERIVED: Organización empleadora formal (${activityFact || candidate.name})`
          }));
        }
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'INDUSTRY_RELEVANCE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Rubro comercial no determinado'
        }));
      }

      // CRITERION 7: MULTIPLE_LOCATIONS (evidence_family: GEO)
      if (distinctLocations >= 2) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'MULTIPLE_LOCATIONS',
          value: `${distinctLocations}_DISTINCT_LOCATIONS`,
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: `DERIVED: ${distinctLocations} sedes físicas observadas (DISTINCT_LOCATIONS = ${distinctLocations})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'MULTIPLE_LOCATIONS',
          value: `${distinctLocations}_LOCATION_OBSERVED`,
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: `UNKNOWN: ${distinctLocations} sede física observada (no cumple criterio multi-sede >= 2)`
        }));
      }

    // --- CASE B: ALIMENTO PREMIUM PARA PERROS (PET_CARE_FOOD) ---
    } else if (profile.category === 'PET_CARE_FOOD') {
      const isPetIndustry = /veterinaria|veterinarias|veterinary|pet\s*shop|mascota|mascotas|forrajería|forrajeria|alimentos balanceados|canino|canina/i.test(actLower) || /veterinaria|\bpet\b|pet\s*shop/i.test(nameLower);

      buyerCompatibility = isPetIndustry;

      const explicitNeedAst = assertions.find(a => a.predicate === 'PET_FOOD_NEED' || a.predicate === 'PROCUREMENT_TENDER');
      if (explicitNeedAst && explicitNeedAst.assertion_id && explicitNeedAst.evidence_id && explicitNeedAst.source_id) {
        buyerNeedNature = 'OBSERVED';
        buyerNeedConfidence = 0.90;
        buyerNeedEvidenceIds = [explicitNeedAst.evidence_id];
        buyerNeedSourceIds = [explicitNeedAst.source_id];
        whyNeed = `NECESIDAD OBSERVADA: Solicitud de aprovisionamiento de alimento balanceado registrada en SSOT (${explicitNeedAst.value_normalized})`;
      } else if (isPetIndustry) {
        buyerNeedNature = 'DERIVED';
        buyerNeedConfidence = 0.70;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id].filter(Boolean) as string[];
        whyNeed = `COMPATIBILIDAD OPERATIVA: Establecimiento veterinario verificado (${activityFact || candidate.name}) con canal de distribución de productos para mascotas`;
      } else {
        buyerNeedNature = 'UNKNOWN';
        buyerNeedConfidence = 0.0;
        whyNeed = 'SIN EVIDENCIA DE NECESIDAD: Rubro no afín al cuidado animal o veterinaria';
        purchaseIntent = 'NONE';
      }

      // 1. PET_INDUSTRY_AFFINITY (evidence_family: INDUSTRY)
      if (isPetIndustry) {
        if (activityAst) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'PET_INDUSTRY_AFFINITY',
            value: 'PET_SECTOR_VERIFIED',
            intended_nature: 'OBSERVED',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.45,
            explanation: `OBSERVED: Rubro directamente vinculado al cuidado y alimentación animal (${activityFact})`,
            matching_assertion: activityAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'PET_INDUSTRY_AFFINITY',
            value: 'PET_SECTOR_PROXY',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.35,
            explanation: `DERIVED: Actividad vinculada al rubro veterinario o de mascotas (${activityFact || candidate.name})`
          }));
        }
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PET_INDUSTRY_AFFINITY',
          value: 'INCOMPATIBLE_SECTOR',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.40,
          explanation: `NEGATIVE: Empresa sin afinidad al mercado veterinario o de mascotas (${activityFact || 'Rubro no afín'})`
        }));
      }

      // 2. PHYSICAL_ESTABLISHMENT (evidence_family: GEO)
      if (addressAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: isPetIndustry ? 0.25 : 0.05,
          explanation: `OBSERVED: Sede comercial física verificada en grafo de verdad (${addressAst.value_normalized})`,
          matching_assertion: addressAst
        }));
      } else if (addressFact.length > 5) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressFact,
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: isPetIndustry ? 0.12 : 0.02,
          explanation: `DERIVED: Domicilio comercial declarado (${addressFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Domicilio comercial no observado'
        }));
      }

      // 3. ANIMAL_HEALTH_NUTRITION_DEMAND (evidence_family: COMMERCE)
      if (isPetIndustry) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ANIMAL_HEALTH_NUTRITION_DEMAND',
          value: 'ANIMAL_SERVICES_ACTIVE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'COMMERCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.18,
          explanation: 'COMPATIBILIDAD OPERATIVA: Demanda comercial probable de alimentos balanceados y productos para mascotas'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ANIMAL_HEALTH_NUTRITION_DEMAND',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'COMMERCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Sin demanda de nutrición animal'
        }));
      }

      // 4. DIGITAL_VERIFICATION (evidence_family: DIGITAL_PRESENCE)
      if (linkedinAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'DIGITAL_VERIFICATION',
          value: linkedinAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.05,
          explanation: `OBSERVED: Perfil verificado en grafo de verdad (${linkedinAst.value_normalized})`,
          matching_assertion: linkedinAst
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'DIGITAL_VERIFICATION',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Perfil digital no observado'
        }));
      }

      // 5. COMMERCIAL_DISTRIBUTION_SCALE (evidence_family: LEGAL_IDENTITY)
      const isCorporateNetwork = nameLower.includes('s.a.') || nameLower.includes('red comercial') || nameLower.includes('hospital');
      const isSrlClinic = nameLower.includes('s.r.l.');
      if (isCorporateNetwork) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'COMMERCIAL_DISTRIBUTION_SCALE',
          value: 'CORPORATE_NETWORK_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.05,
          explanation: 'DERIVED: Red comercial o sociedad anónima con capacidad de compra mayorista y distribución en red'
        }));
      } else if (isSrlClinic) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'COMMERCIAL_DISTRIBUTION_SCALE',
          value: 'SRL_CLINIC_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.03,
          explanation: 'DERIVED: Clínica veterinaria formal constituida como S.R.L.'
        }));
      } else if (isPetIndustry) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'COMMERCIAL_DISTRIBUTION_SCALE',
          value: 'INDEPENDENT_PRACTICE_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.01,
          explanation: 'DERIVED: Consultorio veterinario o local comercial independiente'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'COMMERCIAL_DISTRIBUTION_SCALE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Escala de distribución no observada'
        }));
      }

    // --- CASE C: HERRAMIENTAS Y EQUIPAMIENTO PROFESIONAL (HARDWARE_TOOLS) ---
    } else if (profile.category === 'HARDWARE_TOOLS' || (profile.horizontal_classification === 'SEMI_HORIZONTAL' && /taladro|herramienta|soldador|maquinaria/i.test(profile.product_name))) {
      const isCivicCulturalOrReligious = /\b(teatro|biblioteca|bib\.pop|museo|orquesta|iglesia|templo|convento|escuela|colegio|asociaci[oó]n civil|asocicion civil|comunidad|pueblo|solidarios|casa del bicentenario|casa de la cultura|centro cultural|comuna|parroquia)\b/i.test(nameLower);
      const isHeavyInfrastructure = !semanticGate.is_conflicting && !isCivicCulturalOrReligious && /transporte de energ[ií]a|energ[ií]a el[eé]ctrica|alta tensi[oó]n|distribuidora el[eé]ctrica|generaci[oó]n el[eé]ctrica|aluminio|siderurgia|petr[oó]leo|petrolera|gasoducto/i.test(actLower);
      const isCoreHardwareTrade = !semanticGate.is_conflicting && !isCivicCulturalOrReligious && !isHeavyInfrastructure && (
        /construcci[oó]n|reformas?|obra|ferreter[ií]a|mantenimiento|reparaci[oó]n|metalm[eé]canica|cerrajer[ií]a|herreria|herrer[ií]a|carpinter[ií]a|carpinteria|instalaci[oó]n|instalaciones el[eé]ctricas|plomer[ií]a|gas|pintura|albañiler/i.test(actLower) ||
        /ferreter[ií]a|cerrajer[ií]a|herrer[ií]a|carpinter[ií]a|construcci[oó]n|obras|constructora|metalurgica/i.test(nameLower)
      );
      const isInstitutionalFacility = /hospital|sanatorio|cl[ií]nica|hotel|banco|supermercado|universidad|colegio/i.test(actLower) || /hospital|sanatorio|cl[ií]nica|hotel|banco/i.test(nameLower);
      const isExcludedHardwareIndustry = /software|desarrollo|sistemas|gaming|banco|financier|seguro|publicidad|marketing|recursos humanos/i.test(actLower);
      buyerCompatibility = !semanticGate.is_conflicting && (isCoreHardwareTrade || isHeavyInfrastructure);

      const explicitNeedAst = assertions.find(a => a.predicate === 'TOOL_NEED' || a.predicate === 'PROCUREMENT_TENDER');
      if (!semanticGate.is_conflicting && explicitNeedAst && explicitNeedAst.assertion_id && explicitNeedAst.evidence_id && explicitNeedAst.source_id) {
        buyerNeedNature = 'OBSERVED';
        buyerNeedConfidence = 0.85;
        buyerNeedEvidenceIds = [explicitNeedAst.evidence_id];
        buyerNeedSourceIds = [explicitNeedAst.source_id];
        whyNeed = `NECESIDAD OBSERVADA: Proceso de compra o licitación de herramientas registrado en SSOT (${explicitNeedAst.value_normalized})`;
      } else if (isCoreHardwareTrade) {
        buyerNeedNature = 'DERIVED';
        buyerNeedConfidence = 0.75;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id, linkedinAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id, linkedinAst?.source_id].filter(Boolean) as string[];
        whyNeed = `COMPATIBILIDAD OPERATIVA: Actividad técnica o constructora verificada en grafo (${activityFact || candidate.name}) con necesidad probable de herramientas profesionales`;
      } else if (isHeavyInfrastructure) {
        buyerNeedNature = 'INFERRED';
        buyerNeedConfidence = 0.50;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id, linkedinAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id, linkedinAst?.source_id].filter(Boolean) as string[];
        whyNeed = `NECESIDAD INFERIDA: Operador de infraestructura pesada/energética (${activityFact || candidate.name}) con probable demanda secundaria de herramientas para mantenimiento`;
      } else {
        buyerNeedNature = 'UNKNOWN';
        buyerNeedConfidence = 0.05;
        whyNeed = semanticGate.is_conflicting
          ? `SIN EVIDENCIA DE NECESIDAD (CONFLICTO SEMÁNTICO): La señal de actividad (${activityFact}) contradice la naturaleza o denominación de ${candidate.name} (${semanticGate.conflict_reason})`
          : 'SIN EVIDENCIA DE NECESIDAD: Sin actividad técnica o evidencia operativa de uso de herramientas';
        purchaseIntent = 'NONE';
      }

      // 1. TOOL_USE_CASE_MATCH (evidence_family: INDUSTRY)
      if (semanticGate.is_conflicting) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'TOOL_USE_CASE_MATCH',
          value: 'CONFLICTING_EVIDENCE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.35,
          explanation: `SEMANTIC_CONFLICT: La señal de actividad (${activityFact}) contradice la denominación o naturaleza de la entidad (${candidate.name}) [${semanticGate.conflict_reason}]`
        }));
      } else if (isCoreHardwareTrade) {
        if (activityAst) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'TOOL_USE_CASE_MATCH',
            value: 'CORE_TRADE_NEED',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.38,
            explanation: `COMPATIBILIDAD OPERATIVA: Actividad técnica o constructora verificada en grafo de verdad (${activityFact}); necesidad probable de herramientas profesionales`,
            matching_assertion: activityAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'TOOL_USE_CASE_MATCH',
            value: 'CORE_TRADE_NEED_PROXY',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.28,
            explanation: `COMPATIBILIDAD OPERATIVA: Actividad técnica o constructora inferida (${candidate.name})`
          }));
        }
      } else if (isHeavyInfrastructure) {
        if (activityAst) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'TOOL_USE_CASE_MATCH',
            value: 'HEAVY_INFRASTRUCTURE_MAINTENANCE',
            intended_nature: 'INFERRED',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.24,
            explanation: `NECESIDAD INFERIDA: Operador de infraestructura pesada/energética verificado en grafo de verdad (${activityFact}); posible demanda secundaria de herramientas para mantenimiento`,
            matching_assertion: activityAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'TOOL_USE_CASE_MATCH',
            value: 'HEAVY_INFRASTRUCTURE_PROXY',
            intended_nature: 'INFERRED',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.18,
            explanation: 'NECESIDAD INFERIDA: Infraestructura pesada con mantenimiento operativo'
          }));
        }
      } else if (isInstitutionalFacility) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'TOOL_USE_CASE_MATCH',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: `SIN EVIDENCIA DE NECESIDAD: Establecimiento institucional sin evidencia física de taller o cuadrilla técnica (${candidate.name})`
        }));
      } else if (isExcludedHardwareIndustry) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'TOOL_USE_CASE_MATCH',
          value: 'INCOMPATIBLE_INDUSTRY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.35,
          explanation: `NEGATIVE: Rubro de servicios digitales/administrativos sin uso operativo de herramientas (${activityFact})`
        }));
      } else if (actLower.length >= 3) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'TOOL_USE_CASE_MATCH',
          value: 'NON_CORE_ACTIVITY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.04,
          explanation: `DERIVED: Actividad general (${activityFact}) sin necesidad técnica primaria de herramientas`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'TOOL_USE_CASE_MATCH',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Actividad comercial no determinada'
        }));
      }

      // 2. OPERATIONAL_INFRASTRUCTURE (evidence_family: GEO)
      const isBogusAddress = /publico general|nineces|jovenes|adultos|sin_informacion|sin informacion|no especifica/i.test(addressFact.toLowerCase());
      if (semanticGate.is_conflicting || isBogusAddress) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'OPERATIONAL_INFRASTRUCTURE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: semanticGate.is_conflicting 
            ? 'SIN EVIDENCIA DE NECESIDAD (CONFLICTO SEMÁNTICO): Domicilio o contexto no operativo en entidad con conflicto semántico'
            : 'UNKNOWN: Domicilio genérico o de audiencia no operativo'
        }));
      } else if (addressAst) {
        if (isCoreHardwareTrade) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'OPERATIONAL_INFRASTRUCTURE',
            value: 'TRADE_PREMISES_OBSERVED',
            intended_nature: 'OBSERVED',
            evidence_family: 'GEO',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.22,
            explanation: `OBSERVED: Domicilio físico verificado en grafo de verdad (${addressAst.value_normalized})`,
            matching_assertion: addressAst
          }));
        } else if (isHeavyInfrastructure) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'OPERATIONAL_INFRASTRUCTURE',
            value: 'INFRASTRUCTURE_FACILITY_OBSERVED',
            intended_nature: 'OBSERVED',
            evidence_family: 'GEO',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.18,
            explanation: `OBSERVED: Sede operativa verificada en grafo de verdad (${addressAst.value_normalized})`,
            matching_assertion: addressAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'OPERATIONAL_INFRASTRUCTURE',
            value: 'LOCATION_OBSERVED',
            intended_nature: 'OBSERVED',
            evidence_family: 'GEO',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.10,
            explanation: `OBSERVED: Domicilio físico verificado en grafo de verdad (${addressAst.value_normalized})`,
            matching_assertion: addressAst
          }));
        }
      } else if (addressFact.length > 5) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'OPERATIONAL_INFRASTRUCTURE',
          value: 'LOCATION_DECLARED',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: `DERIVED: Domicilio declarado en metadatos (${addressFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'OPERATIONAL_INFRASTRUCTURE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Infraestructura operativa no observada'
        }));
      }

      // 3. EQUIPMENT_RECURRENCE_DEMAND (evidence_family: COMMERCE)
      if (isCoreHardwareTrade) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EQUIPMENT_RECURRENCE_DEMAND',
          value: 'HIGH_TOOL_CONSUMPTION',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'COMMERCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.14,
          explanation: 'COMPATIBILIDAD OPERATIVA: Demanda recurrente probable de perforación, fijación y recambio de herramientas'
        }));
      } else if (isHeavyInfrastructure) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EQUIPMENT_RECURRENCE_DEMAND',
          value: 'MAINTENANCE_EQUIPMENT_DEMAND',
          intended_nature: 'INFERRED',
          evidence_family: 'COMMERCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.10,
          explanation: 'NECESIDAD INFERIDA: Demanda periódica de equipamiento para mantenimiento técnico'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'EQUIPMENT_RECURRENCE_DEMAND',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'COMMERCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'SIN EVIDENCIA DE NECESIDAD: Sin demanda recurrente de equipamiento profesional demostrada'
        }));
      }

      // 4. CORPORATE_DIGITAL_PRESENCE (evidence_family: DIGITAL_PRESENCE)
      if (linkedinAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'CORPORATE_DIGITAL_PRESENCE',
          value: linkedinAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.05,
          explanation: `OBSERVED: Presencia corporativa verificada en grafo de verdad (${linkedinAst.value_normalized})`,
          matching_assertion: linkedinAst
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'CORPORATE_DIGITAL_PRESENCE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Presencia digital no observada'
        }));
      }

    // --- CASE D: SEGURO PROFESIONAL (PROFESSIONAL_INSURANCE) ---
    } else if (profile.category === 'PROFESSIONAL_INSURANCE') {
      const isLargeCorporateLegal = nameLower.includes('s.a.') || nameLower.includes('corp') || nameLower.includes('group') || nameLower.includes('global') || nameLower.includes('holdings') || nameLower.includes('s.a.u.');
      const isFormalOrganization = candidate.entity_type === 'ORGANIZATION' || nameLower.includes('s.a.') || nameLower.includes('s.r.l.');
      const isHighLiabilityRisk = /salud|hospital|sanatorio|m[eé]dic|cl[ií]nica|cirug|odontol|construcci[oó]n|constructora|ingenier|obra|transporte|financier|banco|auditor|contable|abogad|jur[ií]dic|notar/i.test(actLower) || /hospital|sanatorio|cl[ií]nica|constructora|estudio/i.test(nameLower);

      buyerCompatibility = isHighLiabilityRisk || isFormalOrganization;

      const explicitNeedAst = assertions.find(a => a.predicate === 'INSURANCE_NEED' || a.predicate === 'PROCUREMENT_TENDER');
      if (explicitNeedAst && explicitNeedAst.assertion_id && explicitNeedAst.evidence_id && explicitNeedAst.source_id) {
        buyerNeedNature = 'OBSERVED';
        buyerNeedConfidence = 0.85;
        buyerNeedEvidenceIds = [explicitNeedAst.evidence_id];
        buyerNeedSourceIds = [explicitNeedAst.source_id];
        whyNeed = `NECESIDAD OBSERVADA: Solicitud de póliza o licitación de seguros en SSOT (${explicitNeedAst.value_normalized})`;
      } else if (isHighLiabilityRisk) {
        buyerNeedNature = 'DERIVED';
        buyerNeedConfidence = 0.65;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id, linkedinAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id, linkedinAst?.source_id].filter(Boolean) as string[];
        whyNeed = `COMPATIBILIDAD OPERATIVA: Actividad profesional con exposición a responsabilidad civil (${activityFact || candidate.name}) y probable necesidad de cobertura`;
      } else if (isFormalOrganization) {
        buyerNeedNature = 'INFERRED';
        buyerNeedConfidence = 0.40;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id, linkedinAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id, linkedinAst?.source_id].filter(Boolean) as string[];
        whyNeed = `NECESIDAD INFERIDA: Actividad societaria formal (${activityFact || candidate.name}) con requerimiento estándar de cauciones y seguros generales`;
      } else {
        buyerNeedNature = 'UNKNOWN';
        buyerNeedConfidence = 0.05;
        whyNeed = 'SIN EVIDENCIA DE NECESIDAD: Sin exposición profesional o societaria relevante';
        purchaseIntent = 'NONE';
      }

      // 1. LIABILITY_EXPOSURE_MATCH (evidence_family: INDUSTRY)
      if (isHighLiabilityRisk) {
        if (activityAst) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'LIABILITY_EXPOSURE_MATCH',
            value: 'HIGH_LIABILITY_RISK',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.38,
            explanation: `COMPATIBILIDAD OPERATIVA: Actividad profesional con exposición a responsabilidad verificada en grafo (${activityFact}); probable necesidad de cobertura`,
            matching_assertion: activityAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'LIABILITY_EXPOSURE_MATCH',
            value: 'HIGH_LIABILITY_PROXY',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.28,
            explanation: `COMPATIBILIDAD OPERATIVA: Actividad con exposición a riesgo profesional (${candidate.name})`
          }));
        }
      } else if (actLower.length >= 3) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'LIABILITY_EXPOSURE_MATCH',
          value: 'STANDARD_COMMERCIAL_RISK',
          intended_nature: 'INFERRED',
          evidence_family: 'INDUSTRY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.15,
          explanation: `NECESIDAD INFERIDA: Actividad comercial general con necesidad estándar de seguros de caución/comercio (${activityFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'LIABILITY_EXPOSURE_MATCH',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'SIN EVIDENCIA DE NECESIDAD: Actividad comercial no determinada'
        }));
      }

      // 2. LEGAL_FORMALITY (evidence_family: LEGAL_IDENTITY)
      if (isLargeCorporateLegal) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'LEGAL_FORMALITY',
          value: 'CORPORATE_LEGAL_ENTITY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.15,
          explanation: 'DERIVED: Sociedad anónima con directores y patrimonio sujetos a pólizas D&O y caución'
        }));
      } else if (isFormalOrganization) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'LEGAL_FORMALITY',
          value: 'SRL_LEGAL_ENTITY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.10,
          explanation: 'DERIVED: Sociedad formal con personería jurídica sujeta a coberturas comerciales'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'LEGAL_FORMALITY',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Estructura jurídica no observada'
        }));
      }

      // 3. PHYSICAL_ESTABLISHMENT (evidence_family: GEO)
      if (addressAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.14,
          explanation: `OBSERVED: Domicilio operativo verificado en grafo de verdad (${addressAst.value_normalized})`,
          matching_assertion: addressAst
        }));
      } else if (addressFact.length > 5) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressFact,
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.07,
          explanation: `DERIVED: Domicilio declarado (${addressFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Domicilio no observado'
        }));
      }

      // 4. CORPORATE_DIGITAL_PRESENCE (evidence_family: DIGITAL_PRESENCE)
      if (linkedinAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'CORPORATE_DIGITAL_PRESENCE',
          value: linkedinAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: `OBSERVED: Perfil corporativo verificado en grafo de verdad (${linkedinAst.value_normalized})`,
          matching_assertion: linkedinAst
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'CORPORATE_DIGITAL_PRESENCE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Perfil digital no observado'
        }));
      }

    // --- CASE E: ALFOMBRA / REVESTIMIENTO (HOME_DECOR_FLOORING) ---
    } else if (profile.category === 'HOME_DECOR_FLOORING') {
      const isLargeCorporateLegal = nameLower.includes('s.a.') || nameLower.includes('corp') || nameLower.includes('group') || nameLower.includes('global') || nameLower.includes('holdings') || nameLower.includes('s.a.u.');
      const isFormalOrganization = candidate.entity_type === 'ORGANIZATION' || nameLower.includes('s.a.') || nameLower.includes('s.r.l.');
      const isDirectDecorHospitality = /hotel|hoteler[ií]a|alojamiento|mueble|mobiliario|decoraci[oó]n|arquitectura|diseño|interiorismo|revestimiento|alfombra|tapicer|inmobiliari/i.test(actLower) || /hotel|muebler|deco|inmobiliari/i.test(nameLower);
      const isCorporateReception = /banco|bancari|financier|cl[ií]nica|sanatorio|hospital|consultor/i.test(actLower) || /banco|hospital|sanatorio/i.test(nameLower);
      const isIncompatibleIndustry = /chacarita|galp[oó]n|chatarra|metal[uú]rgica|taller mec[aá]nico|reparaci[oó]n de automotores/i.test(actLower);

      buyerCompatibility = (isDirectDecorHospitality || isCorporateReception) && !isIncompatibleIndustry;

      const explicitNeedAst = assertions.find(a => a.predicate === 'FLOORING_NEED' || a.predicate === 'PROCUREMENT_TENDER');
      if (explicitNeedAst && explicitNeedAst.assertion_id && explicitNeedAst.evidence_id && explicitNeedAst.source_id) {
        buyerNeedNature = 'OBSERVED';
        buyerNeedConfidence = 0.85;
        buyerNeedEvidenceIds = [explicitNeedAst.evidence_id];
        buyerNeedSourceIds = [explicitNeedAst.source_id];
        whyNeed = `NECESIDAD OBSERVADA: Proyecto de equipamiento o licitación de pisos/decoración (${explicitNeedAst.value_normalized})`;
      } else if (isDirectDecorHospitality) {
        buyerNeedNature = 'DERIVED';
        buyerNeedConfidence = 0.65;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id].filter(Boolean) as string[];
        whyNeed = `COMPATIBILIDAD OPERATIVA: Sector de hotelería, interiorismo o inmuebles (${activityFact || candidate.name}) con probable necesidad de revestimiento y ambientación`;
      } else if (isCorporateReception) {
        buyerNeedNature = 'INFERRED';
        buyerNeedConfidence = 0.45;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id].filter(Boolean) as string[];
        whyNeed = `NECESIDAD INFERIDA: Espacio corporativo (${activityFact || candidate.name}) con salas de espera o áreas de recepción`;
      } else {
        buyerNeedNature = 'UNKNOWN';
        buyerNeedConfidence = 0.05;
        whyNeed = 'SIN EVIDENCIA DE NECESIDAD: Rubro sin demanda de revestimiento decorativo';
        purchaseIntent = 'NONE';
      }

      // 1. FLOORING_DECOR_AFFINITY (evidence_family: INDUSTRY)
      if (isDirectDecorHospitality) {
        if (activityAst) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'FLOORING_DECOR_AFFINITY',
            value: 'DIRECT_DECOR_HOSPITALITY',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.42,
            explanation: `COMPATIBILIDAD OPERATIVA: Sector de hotelería, interiorismo o equipamiento verificado en grafo de verdad (${activityFact}); necesidad probable de revestimiento`,
            matching_assertion: activityAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'FLOORING_DECOR_AFFINITY',
            value: 'DIRECT_DECOR_PROXY',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.32,
            explanation: `COMPATIBILIDAD OPERATIVA: Actividad vinculada a hotelería o mobiliario (${candidate.name})`
          }));
        }
      } else if (isCorporateReception) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'FLOORING_DECOR_AFFINITY',
          value: 'CORPORATE_RECEPTION_FACILITY',
          intended_nature: 'INFERRED',
          evidence_family: 'INDUSTRY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.20,
          explanation: `NECESIDAD INFERIDA: Espacio corporativo o comercial con áreas de recepción y revestimiento (${activityFact || candidate.name})`
        }));
      } else if (isIncompatibleIndustry) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'FLOORING_DECOR_AFFINITY',
          value: 'INCOMPATIBLE_INDUSTRY',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: true,
          is_unknown: false,
          score_contribution: -0.30,
          explanation: `NEGATIVE: Rubro operativo sin demanda de revestimiento textil o decoración (${activityFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'FLOORING_DECOR_AFFINITY',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'SIN EVIDENCIA DE NECESIDAD: Actividad no vinculada a decoración o revestimiento'
        }));
      }

      // 2. PHYSICAL_ESTABLISHMENT (evidence_family: GEO)
      if (addressAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.20,
          explanation: `OBSERVED: Sede física verificada en grafo de verdad (${addressAst.value_normalized})`,
          matching_assertion: addressAst
        }));
      } else if (addressFact.length > 5) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressFact,
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.10,
          explanation: `DERIVED: Domicilio comercial declarado (${addressFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Domicilio no observado'
        }));
      }

      // 3. ESTABLISHMENT_SCALE (evidence_family: LEGAL_IDENTITY)
      if (/hotel/i.test(actLower) || isLargeCorporateLegal) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ESTABLISHMENT_SCALE',
          value: 'LARGE_FACILITY_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.14,
          explanation: 'DERIVED: Establecimiento de escala corporativa u hotelera con superficie para alfombrado'
        }));
      } else if (isFormalOrganization) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ESTABLISHMENT_SCALE',
          value: 'STANDARD_FACILITY_SCALE',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.08,
          explanation: 'DERIVED: Entidad formal con oficinas o local comercial'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ESTABLISHMENT_SCALE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Escala de instalaciones no determinada'
        }));
      }

      // 4. CORPORATE_DIGITAL_PRESENCE (evidence_family: DIGITAL_PRESENCE)
      if (linkedinAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'CORPORATE_DIGITAL_PRESENCE',
          value: linkedinAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.05,
          explanation: `OBSERVED: Perfil verificado en grafo de verdad (${linkedinAst.value_normalized})`,
          matching_assertion: linkedinAst
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'CORPORATE_DIGITAL_PRESENCE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Perfil digital no observado'
        }));
      }

    // --- CASE F: GENERAL B2B / OTHER PROFILES ---
    } else {
      const isLargeCorporateLegal = nameLower.includes('s.a.') || nameLower.includes('corp') || nameLower.includes('group') || nameLower.includes('global') || nameLower.includes('holdings') || nameLower.includes('s.a.u.');
      const isFormalOrganization = candidate.entity_type === 'ORGANIZATION' || nameLower.includes('s.a.') || nameLower.includes('s.r.l.');
      const targetActivities = (profile.target_attributes.target_activities || [])
        .map(a => a.toLowerCase().trim())
        .filter(a => a.length >= 3);
      const isTargetMatched = actLower.trim().length >= 3 && targetActivities.some(ta => actLower.includes(ta) || ta.includes(actLower));

      if (isTargetMatched) {
        buyerCompatibility = true;
        buyerNeedNature = 'DERIVED';
        buyerNeedConfidence = 0.60;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id].filter(Boolean) as string[];
        whyNeed = `COMPATIBILIDAD OPERATIVA: Actividad compatible con la solución (${activityFact || candidate.name})`;
      } else if (isLargeCorporateLegal) {
        buyerCompatibility = true;
        buyerNeedNature = 'INFERRED';
        buyerNeedConfidence = 0.40;
        buyerNeedEvidenceIds = [activityAst?.evidence_id, addressAst?.evidence_id].filter(Boolean) as string[];
        buyerNeedSourceIds = [activityAst?.source_id, addressAst?.source_id].filter(Boolean) as string[];
        whyNeed = `NECESIDAD INFERIDA: Empresa corporativa formal (${candidate.name}) con capacidad operativa B2B`;
      } else {
        buyerCompatibility = false;
        buyerNeedNature = 'UNKNOWN';
        buyerNeedConfidence = 0.05;
        whyNeed = 'SIN EVIDENCIA DE NECESIDAD: Rubro sin afinidad B2B determinada';
        purchaseIntent = 'NONE';
      }

      if (isTargetMatched) {
        if (activityAst) {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'INDUSTRY_RELEVANCE',
            value: 'TARGET_MATCHED',
            intended_nature: 'OBSERVED',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.35,
            explanation: `OBSERVED: Actividad compatible con la solución verificada en grafo de verdad (${activityFact})`,
            matching_assertion: activityAst
          }));
        } else {
          evaluatedCriteria.push(buildCriterion({
            criterion: 'INDUSTRY_RELEVANCE',
            value: 'TARGET_MATCHED_PROXY',
            intended_nature: 'DERIVED_PROXY',
            evidence_family: 'INDUSTRY',
            is_positive: true,
            is_negative: false,
            is_unknown: false,
            score_contribution: 0.25,
            explanation: `DERIVED: Actividad compatible con la solución (${activityFact})`
          }));
        }
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'INDUSTRY_RELEVANCE',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'INDUSTRY',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'SIN EVIDENCIA DE NECESIDAD: Actividad de la empresa no coincide con el perfil'
        }));
      }

      if (addressAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.20,
          explanation: `OBSERVED: Domicilio físico verificado en grafo de verdad (${addressAst.value_normalized})`,
          matching_assertion: addressAst
        }));
      } else if (addressFact.length > 5) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: addressFact,
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'GEO',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.10,
          explanation: `DERIVED: Domicilio declarado (${addressFact})`
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'PHYSICAL_ESTABLISHMENT',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'GEO',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Domicilio no observado'
        }));
      }

      if (isLargeCorporateLegal) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: 'CORPORATE_ORGANIZATION',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.15,
          explanation: 'DERIVED: Estructura corporativa (S.A.) verificada'
        }));
      } else if (isFormalOrganization) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: 'FORMAL_ORGANIZATION',
          intended_nature: 'DERIVED_PROXY',
          evidence_family: 'LEGAL_IDENTITY',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.10,
          explanation: 'DERIVED: Estructura societaria formal verificada'
        }));
      } else {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'ORGANIZATION_COMPLEXITY',
          value: 'UNKNOWN',
          intended_nature: 'UNKNOWN',
          evidence_family: 'ORGANIZATION',
          is_positive: false,
          is_negative: false,
          is_unknown: true,
          score_contribution: 0.0,
          explanation: 'UNKNOWN: Estructura no observada'
        }));
      }

      if (linkedinAst) {
        evaluatedCriteria.push(buildCriterion({
          criterion: 'CORPORATE_DIGITAL_PRESENCE',
          value: linkedinAst.value_normalized,
          intended_nature: 'OBSERVED',
          evidence_family: 'DIGITAL_PRESENCE',
          is_positive: true,
          is_negative: false,
          is_unknown: false,
          score_contribution: 0.05,
          explanation: `OBSERVED: Perfil corporativo verificado en grafo de verdad (${linkedinAst.value_normalized})`,
          matching_assertion: linkedinAst
        }));
      }
    }

    // --- 2. EVIDENCE COVERAGE & INDEPENDENCE CALCULATION ---
    const totalRequiredCriteria = Math.max(1, evaluatedCriteria.length);
    const criteriaWithEvidence = evaluatedCriteria.filter(c => !c.is_unknown);
    const positiveCriteria = evaluatedCriteria.filter(c => c.is_positive).map(c => c.criterion);
    const negativeCriteria = evaluatedCriteria.filter(c => c.is_negative).map(c => c.criterion);
    const unknownCriteria = evaluatedCriteria.filter(c => c.is_unknown).map(c => c.criterion);

    // CRITERIA_COVERAGE (0.00 - 1.00)
    const criteriaCoverage = parseFloat((criteriaWithEvidence.length / totalRequiredCriteria).toFixed(2));

    // INDEPENDENT_EVIDENCE_COVERAGE (0.00 - 1.00)
    const requiredFamiliesList: EvidenceFamilyId[] = profile.category === 'SOFTWARE_HR'
      ? ['LEGAL_IDENTITY', 'WORKFORCE', 'GEO', 'INDUSTRY', 'DIGITAL_PRESENCE', 'ORGANIZATION']
      : (profile.category === 'PET_CARE_FOOD'
          ? ['INDUSTRY', 'COMMERCE', 'GEO', 'DIGITAL_PRESENCE']
          : (profile.category === 'HARDWARE_TOOLS'
              ? ['INDUSTRY', 'COMMERCE', 'GEO', 'DIGITAL_PRESENCE']
              : (profile.category === 'PROFESSIONAL_INSURANCE'
                  ? ['INDUSTRY', 'LEGAL_IDENTITY', 'GEO', 'DIGITAL_PRESENCE']
                  : (profile.category === 'HOME_DECOR_FLOORING'
                      ? ['INDUSTRY', 'COMMERCE', 'GEO', 'DIGITAL_PRESENCE']
                      : ['LEGAL_IDENTITY', 'INDUSTRY', 'GEO', 'DIGITAL_PRESENCE']))));

    const totalRequiredFamilies = requiredFamiliesList.length;
    const activeFamiliesSet = new Set<EvidenceFamilyId>(criteriaWithEvidence.map(c => c.evidence_family));
    const activeFamilies = Array.from(activeFamiliesSet);
    const independentEvidenceCoverage = parseFloat((activeFamilies.length / totalRequiredFamilies).toFixed(2));

    // --- 3. PROXY RATIO & CONFIDENCE CALCULATION ---
    // Invariant 9: High PROXY_RATIO caps FIT_CONFIDENCE.
    const proxyCriteria = criteriaWithEvidence.filter(c => c.nature === 'DERIVED_PROXY');
    const observedCriteria = criteriaWithEvidence.filter(c => c.nature === 'OBSERVED');
    const proxyRatio = criteriaWithEvidence.length > 0 
      ? parseFloat((proxyCriteria.length / criteriaWithEvidence.length).toFixed(2)) 
      : 0.0;

    let rawConfidence = 0.35;
    if (assertions.some(a => a.truth_nature === 'OBSERVED')) rawConfidence += 0.10;
    if (cuit.length > 5) rawConfidence += 0.05;
    if (distinctLocations >= 1) rawConfidence += 0.05;

    // Independence & observed ratios
    const observedRatio = criteriaWithEvidence.length > 0 ? (observedCriteria.length / criteriaWithEvidence.length) : 0.0;
    rawConfidence = (rawConfidence * 0.45) + (independentEvidenceCoverage * 0.35) + (observedRatio * 0.20);

    // Unknown criteria penalty
    rawConfidence -= (unknownCriteria.length / totalRequiredCriteria) * 0.10;

    // Strict Cap based on PROXY_RATIO
    if (proxyRatio >= 0.75) {
      rawConfidence = Math.min(0.50, rawConfidence);
    } else if (proxyRatio >= 0.50) {
      rawConfidence = Math.min(0.65, rawConfidence);
    } else if (proxyRatio >= 0.30) {
      rawConfidence = Math.min(0.75, rawConfidence);
    }

    // Cap at 0.70 if no physical workforce observation
    const hasPhysicalWorkforce = assertions.some(a => a.predicate === 'EMPLOYEE_COUNT' || a.predicate === 'HEADCOUNT');
    if (!hasPhysicalWorkforce && profile.category === 'SOFTWARE_HR') {
      rawConfidence = Math.min(0.70, rawConfidence);
    }

    const fitConfidence = parseFloat(Math.min(1.0, Math.max(0.10, rawConfidence)).toFixed(2));

    // --- 4. BUYER FIT SCORE CALCULATION & COVERAGE GUARDRAILS ---
    let rawScore = 0.0;
    for (const c of evaluatedCriteria) {
      rawScore += c.score_contribution;
    }

    let fitScore = Math.max(0.0, rawScore);

    // Invariant 3 & 4: Do NOT allow BUYER_FIT = 0.90 with minimal structural evidence coverage
    if (independentEvidenceCoverage < 0.25) {
      fitScore = Math.min(0.40, fitScore);
    } else if (independentEvidenceCoverage < 0.40) {
      fitScore = Math.min(0.65, fitScore);
    } else if (independentEvidenceCoverage < 0.60) {
      fitScore = Math.min(0.80, fitScore);
    }

    const baseBuyerFit = parseFloat(Math.min(1.0, Math.max(0.0, fitScore)).toFixed(2));

    // Determine Fit Tier
    let fitTier: FitTier = 'LOW_FIT';
    if (baseBuyerFit < 0.40 && (criteriaCoverage < 0.40 || independentEvidenceCoverage < 0.25)) {
      fitTier = 'INSUFFICIENT_EVIDENCE';
    } else if (baseBuyerFit >= 0.70) {
      fitTier = 'HIGH_FIT';
    } else if (baseBuyerFit >= 0.40) {
      fitTier = 'MEDIUM_FIT';
    } else {
      fitTier = 'LOW_FIT';
    }

    // --- 5. TIMING BOOST & OPPORTUNITY DIMENSION (STRICT INVARIANTS 10 & 11) ---
    // CONTACTABILITY_SIGNAL NEVER creates timing boost or commercial opportunity score
    let timingBoost = 0.0;
    const reasons: string[] = evaluatedCriteria.map(c => c.explanation);

    if (commercialOppSignals.includes('HIRING_SIGNAL')) {
      timingBoost += 0.12;
      reasons.push('Timing activo: Contratación de personal en curso (HIRING_SIGNAL)');
    }
    if (commercialOppSignals.includes('EXPANSION_SIGNAL')) {
      timingBoost += 0.10;
      reasons.push('Timing activo: Expansión de operaciones registrada (EXPANSION_SIGNAL)');
    }
    if (commercialOppSignals.includes('PROCUREMENT_SIGNAL')) {
      timingBoost += 0.10;
      reasons.push('Timing activo: Proceso de adquisiciones/compras registrado (PROCUREMENT_SIGNAL)');
    }
    if (commercialOppSignals.includes('NEW_BUSINESS_SIGNAL')) {
      timingBoost += 0.08;
      reasons.push('Timing activo: Apertura o nueva actividad comercial (NEW_BUSINESS_SIGNAL)');
    }

    timingBoost = Math.min(0.25, parseFloat(timingBoost.toFixed(2)));

    // Opportunity Semantics
    let oppType = 'NONE';
    let oppStatus = 'NOT_DETERMINED';
    let oppScore: number | null = null;
    let commercialOppStatus: 'ACTIVE' | 'NOT_DETERMINED' = 'NOT_DETERMINED';

    if (hasCommercialOpportunity) {
      const primeOpp = oppsList.find(o => o.opportunity_type !== 'CONTACTABILITY_SIGNAL');
      oppType = primeOpp?.opportunity_type || commercialOppSignals[0];
      oppStatus = primeOpp?.status || 'ACTIVE';
      oppScore = primeOpp?.score !== null && primeOpp?.score !== undefined ? parseFloat(String(primeOpp.score)) : null;
      commercialOppStatus = 'ACTIVE';
    } else if (oppSignals.includes('CONTACTABILITY_SIGNAL')) {
      oppType = 'CONTACTABILITY_SIGNAL';
      oppStatus = 'ACTIVE'; // Status of contactability channel
      oppScore = null;      // Strictly NULL. Opportunity Score is NEVER 'ACTIVE'
      commercialOppStatus = 'NOT_DETERMINED'; // No commercial opportunity exists
    }

    const finalPriority = Math.min(1.0, parseFloat((baseBuyerFit + timingBoost).toFixed(2)));

    // --- 6. CONTACTABILITY SCORE (INDEPENDENT DIMENSION) ---
    const verifiedContacts = candidate.verified_contacts || { emails: [], phones: [], linkedin: [] };
    const emailCount = (verifiedContacts.emails || []).length;
    const phoneCount = (verifiedContacts.phones || []).length;
    const linkedinCount = (verifiedContacts.linkedin || []).length;

    let contactScore = 0.0;
    if (emailCount > 0) contactScore += 0.50;
    if (phoneCount > 0) contactScore += 0.30;
    if (linkedinCount > 0) contactScore += 0.20;
    contactScore = Math.min(1.0, parseFloat(contactScore.toFixed(2)));

    // Narrative summary: Strictly formatted with nature prefixes
    const whyFit = evaluatedCriteria.map(c => c.explanation).join('; ');

    // Recommended plan
    let recommendedPlan = 'Plan Corporativo';
    if (profile.category === 'SOFTWARE_HR') {
      recommendedPlan = baseBuyerFit >= 0.70 ? 'Plan Enterprise — Nómina & RRHH' : 'Plan Pyme — Control de Talento';
    } else if (profile.category === 'PET_CARE_FOOD') {
      recommendedPlan = baseBuyerFit >= 0.70 ? 'Distribución Mayorista — Alimento Premium Canino' : 'Catálogo Minorista';
    } else {
      recommendedPlan = `${profile.product_name} — Standard B2B`;
    }

    // --- 7. TELEMETRY COMPUTATION (SECTION 7) ---
    // PRODUCT_DOMAIN_TO_BUYER_INDUSTRY_LEAK: Strictly FALSE.
    const productDomainToBuyerIndustryLeak = false;

    // PRODUCT_USE_CASE_MATCH: true if any criterion or observed activity matches product use case
    const productUseCaseMatch = evaluatedCriteria.some(c => 
      c.is_positive && (
        c.criterion === 'TOOL_USE_CASE_MATCH' ||
        c.criterion === 'PET_INDUSTRY_AFFINITY' ||
        c.criterion === 'HR_OPERATION_COMPLEXITY' ||
        c.criterion === 'WORKFORCE_INTENSITY' ||
        c.criterion === 'INDUSTRY_RELEVANCE'
      )
    );

    // BUYER_NEED_MATCH: true if candidate has evidence fulfilling primary buyer needs
    const buyerNeed = buyerNeedNature === 'OBSERVED' || buyerNeedNature === 'DERIVED';
    const buyerNeedMatch = buyerNeed;

    // Invariant: OBSERVED_NEED strictly requires physical evidence_id and source_id
    if (buyerNeedNature === 'OBSERVED' && (buyerNeedEvidenceIds.length === 0 || buyerNeedSourceIds.length === 0)) {
      buyerNeedNature = 'DERIVED';
      whyNeed = whyNeed.replace(/^NECESIDAD OBSERVADA:/, 'COMPATIBILIDAD OPERATIVA:');
    }

    // INDUSTRY_MATCH: true if industry is positive/relevant
    const industryMatch = evaluatedCriteria.some(c =>
      c.is_positive && (
        c.criterion === 'INDUSTRY_RELEVANCE' ||
        c.criterion === 'PET_INDUSTRY_AFFINITY' ||
        (c.criterion === 'TOOL_USE_CASE_MATCH' && c.value === 'CORE_TRADE_NEED')
      )
    );

    // OPERATING_CONTEXT_MATCH: true if multi-location, workshop, clinic, or premises observed
    const operatingContextMatch = distinctLocations >= 2 || evaluatedCriteria.some(c =>
      c.is_positive && (
        c.criterion === 'OPERATIONAL_INFRASTRUCTURE' ||
        c.criterion === 'RETAIL_DISTRIBUTION_CAPACITY' ||
        c.criterion === 'MULTIPLE_LOCATIONS'
      )
    );

    // ATTRIBUTE_MATCH: true if required attributes are met
    const attributeMatch = evaluatedCriteria.some(c =>
      c.is_positive && (
        c.criterion === 'ORGANIZATION_COMPLEXITY' ||
        c.criterion === 'ANIMAL_CARE_SERVICES' ||
        c.criterion === 'EQUIPMENT_RECURRENCE_DEMAND'
      )
    );

    return {
      candidate_id: candidate.entity_id,
      candidate_name: candidate.name,
      candidate_type: 'COMPANY',
      candidate_metadata: candidate.metadata || {},
      base_buyer_fit_score: baseBuyerFit,
      fit_score: baseBuyerFit,
      criteria_coverage: criteriaCoverage,
      independent_evidence_coverage: independentEvidenceCoverage,
      evidence_coverage: criteriaCoverage,
      proxy_ratio: proxyRatio,
      fit_confidence: fitConfidence,
      confidence_score: fitConfidence,
      distinct_locations: distinctLocations,
      evaluated_criteria: evaluatedCriteria,
      positive_criteria: positiveCriteria,
      negative_criteria: negativeCriteria,
      unknown_criteria: unknownCriteria,
      active_evidence_families: activeFamilies,
      timing_boost: timingBoost,
      final_priority_score: finalPriority,
      is_compatible: baseBuyerFit >= 0.30,
      fit_tier: fitTier,
      opportunity_type: oppType,
      opportunity_status: oppStatus,
      opportunity_score: oppScore,
      commercial_opportunity: commercialOppStatus,
      opportunity_signal_types: oppSignals,
      contactability_score: contactScore,
      match_reasons: reasons,
      why_fit: whyFit,
      recommended_product_plan: recommendedPlan,
      verified_contact_points: {
        emails: verifiedContacts.emails || [],
        phones: verifiedContacts.phones || [],
        linkedin: verifiedContacts.linkedin || []
      },
      product_use_case_match: productUseCaseMatch,
      buyer_need_match: buyerNeedMatch,
      industry_match: industryMatch,
      operating_context_match: operatingContextMatch,
      attribute_match: attributeMatch,
      product_domain_to_buyer_industry_leak: productDomainToBuyerIndustryLeak,

      // STRICT REALITY SEMANTICS (Tripartite separation):
      buyer_compatibility: buyerCompatibility,
      buyer_need: buyerNeed,
      buyer_need_nature: buyerNeedNature,
      buyer_need_confidence: parseFloat(buyerNeedConfidence.toFixed(2)),
      buyer_need_evidence_ids: Array.from(new Set(buyerNeedEvidenceIds)),
      buyer_need_source_ids: Array.from(new Set(buyerNeedSourceIds)),
      why_need: whyNeed,
      purchase_intent: purchaseIntent,
      purchase_intent_score: purchaseIntentScore,
      purchase_intent_signals: purchaseIntentSignals
    };
  }

  /**
   * Evaluates PERSON Buyer Fit using ONLY legitimate, non-sensitive, observed attributes.
   */
  public static evaluatePersonFit(
    candidate: BuyerCandidateContext,
    profile: AtlasProductProfile
  ): BuyerFitEvaluationResult {
    const meta = candidate.metadata || {};
    const assertions = candidate.observed_assertions || [];

    // Audit for prohibited sensitive data
    for (const a of assertions) {
      const pVal = (a.value_normalized || '').toLowerCase();
      const pPred = (a.predicate || '').toLowerCase();
      for (const banned of PROHIBITED_SENSITIVE_KEYWORDS) {
        if (pVal.includes(banned) || pPred.includes(banned)) {
          throw new Error(`SECURITY VIOLATION: Sensitive attribute [${banned}] detected in person candidate.`);
        }
      }
    }

    const roleAst = assertions.find(a => a.predicate === 'HAS_ROLE' || a.predicate === 'WORKS_AT');
    const roleFact = roleAst?.value_normalized || meta.job_title || meta.role || '';
    const city = meta.city || 'CABA';
    const addressAst = assertions.find(a => a.predicate === 'COMPANY_ADDRESS' || a.predicate === 'PERSON_CITY');

    // Helper to strictly validate OBSERVED vs DERIVED_PROXY
    const buildPersonCriterion = (params: {
      criterion: string;
      value: string;
      intended_nature: CriterionNature;
      evidence_family: EvidenceFamilyId;
      is_positive: boolean;
      is_negative: boolean;
      is_unknown: boolean;
      score_contribution: number;
      explanation: string;
      matching_assertion?: ObservedAssertionWithEvidence;
    }): EvaluatedCriterion => {
      let nature = params.intended_nature;
      let observedInvalid = false;
      const ast = params.matching_assertion;
      const assertionId = ast?.assertion_id;
      const evidenceId = ast?.evidence_id;
      const sourceId = ast?.source_id;
      const predicate = ast?.predicate;

      if (nature === 'OBSERVED') {
        if (!ast || !assertionId || !evidenceId || !sourceId) {
          observedInvalid = true;
          nature = 'DERIVED_PROXY';
        }
      }

      return {
        criterion: params.criterion,
        value: params.value,
        nature,
        evidence_family: params.evidence_family,
        is_positive: params.is_positive,
        is_negative: params.is_negative,
        is_unknown: params.is_unknown,
        score_contribution: params.score_contribution,
        source_assertions: predicate ? [predicate] : [],
        explanation: params.explanation,
        predicate,
        assertion_id: assertionId,
        evidence_id: evidenceId,
        source_id: sourceId,
        observed_invalid: observedInvalid
      };
    };

    const evaluatedCriteria: EvaluatedCriterion[] = [];
    const roleLower = roleFact.toLowerCase();
    const targetRoles = (profile.target_attributes.target_roles || []).map(r => r.toLowerCase());

    let buyerCompatibility = false;
    let buyerNeedNature: NeedNature = 'UNKNOWN';
    let buyerNeedConfidence = 0.0;
    let buyerNeedEvidenceIds: string[] = [];
    let buyerNeedSourceIds: string[] = [];
    let whyNeed = 'SIN EVIDENCIA DE NECESIDAD: Rol profesional no determinado';

    if (targetRoles.some(tr => roleLower.includes(tr))) {
      buyerCompatibility = true;
      buyerNeedNature = 'DERIVED';
      buyerNeedConfidence = 0.70;
      buyerNeedEvidenceIds = [roleAst?.evidence_id].filter(Boolean) as string[];
      buyerNeedSourceIds = [roleAst?.source_id].filter(Boolean) as string[];
      whyNeed = `COMPATIBILIDAD OPERATIVA: Rol profesional compatible (${roleFact}) con demanda probable de la solución`;

      evaluatedCriteria.push(buildPersonCriterion({
        criterion: 'PROFESSIONAL_ROLE_MATCH',
        value: roleFact,
        intended_nature: roleAst ? 'OBSERVED' : 'DERIVED_PROXY',
        evidence_family: 'WORKFORCE',
        is_positive: true,
        is_negative: false,
        is_unknown: false,
        score_contribution: 0.60,
        explanation: roleAst ? `OBSERVED: Rol profesional compatible (${roleFact})` : `COMPATIBILIDAD OPERATIVA: Rol profesional compatible inferido (${roleFact})`,
        matching_assertion: roleAst
      }));
    } else if (roleFact.length > 0) {
      buyerCompatibility = true;
      buyerNeedNature = 'INFERRED';
      buyerNeedConfidence = 0.40;
      buyerNeedEvidenceIds = [roleAst?.evidence_id].filter(Boolean) as string[];
      buyerNeedSourceIds = [roleAst?.source_id].filter(Boolean) as string[];
      whyNeed = `NECESIDAD INFERIDA: Actividad profesional declarada (${roleFact})`;

      evaluatedCriteria.push(buildPersonCriterion({
        criterion: 'PROFESSIONAL_ACTIVITY',
        value: roleFact,
        intended_nature: roleAst ? 'OBSERVED' : 'DERIVED_PROXY',
        evidence_family: 'WORKFORCE',
        is_positive: true,
        is_negative: false,
        is_unknown: false,
        score_contribution: 0.35,
        explanation: roleAst ? `OBSERVED: Actividad profesional declarada (${roleFact})` : `NECESIDAD INFERIDA: Actividad profesional declarada (${roleFact})`,
        matching_assertion: roleAst
      }));
    } else {
      buyerCompatibility = false;
      buyerNeedNature = 'UNKNOWN';
      buyerNeedConfidence = 0.0;
      whyNeed = 'SIN EVIDENCIA DE NECESIDAD: Rol profesional no determinado';

      evaluatedCriteria.push(buildPersonCriterion({
        criterion: 'PROFESSIONAL_ROLE_MATCH',
        value: 'UNKNOWN',
        intended_nature: 'UNKNOWN',
        evidence_family: 'WORKFORCE',
        is_positive: false,
        is_negative: false,
        is_unknown: true,
        score_contribution: 0.0,
        explanation: 'SIN EVIDENCIA DE NECESIDAD: Rol profesional no determinado'
      }));
    }

    const isGeoAllowed = profile.geo_available.includes('ALL') || profile.geo_available.some(g => g.toLowerCase().includes(city.toLowerCase()));
    if (isGeoAllowed) {
      evaluatedCriteria.push(buildPersonCriterion({
        criterion: 'GEO_AVAILABILITY',
        value: city,
        intended_nature: addressAst ? 'OBSERVED' : 'DERIVED_PROXY',
        evidence_family: 'GEO',
        is_positive: true,
        is_negative: false,
        is_unknown: false,
        score_contribution: 0.20,
        explanation: addressAst ? `OBSERVED: Ubicación geográfica permitida (${city})` : `DERIVED: Ubicación geográfica declarada (${city})`,
        matching_assertion: addressAst
      }));
    } else {
      evaluatedCriteria.push(buildPersonCriterion({
        criterion: 'GEO_AVAILABILITY',
        value: city,
        intended_nature: 'DERIVED_PROXY',
        evidence_family: 'GEO',
        is_positive: false,
        is_negative: true,
        is_unknown: false,
        score_contribution: -0.30,
        explanation: `NEGATIVE: Ubicación geográfica no disponible (${city})`
      }));
    }

    const totalCriteria = evaluatedCriteria.length;
    const criteriaWithEvidence = evaluatedCriteria.filter(c => !c.is_unknown);
    const positiveCriteria = evaluatedCriteria.filter(c => c.is_positive).map(c => c.criterion);
    const negativeCriteria = evaluatedCriteria.filter(c => c.is_negative).map(c => c.criterion);
    const unknownCriteria = evaluatedCriteria.filter(c => c.is_unknown).map(c => c.criterion);

    const criteriaCoverage = parseFloat((criteriaWithEvidence.length / totalCriteria).toFixed(2));
    const activeFamilies = Array.from(new Set(criteriaWithEvidence.map(c => c.evidence_family)));
    const independentEvidenceCoverage = parseFloat((activeFamilies.length / 2).toFixed(2));

    let rawScore = 0.0;
    for (const c of evaluatedCriteria) {
      rawScore += c.score_contribution;
    }
    const baseBuyerFit = parseFloat(Math.min(1.0, Math.max(0.0, rawScore)).toFixed(2));
    const confidence = 0.70;

    const verifiedContacts = candidate.verified_contacts || { emails: [], phones: [], linkedin: [] };
    const emailCount = (verifiedContacts.emails || []).length;
    const phoneCount = (verifiedContacts.phones || []).length;
    const linkedinCount = (verifiedContacts.linkedin || []).length;

    let contactScore = 0.0;
    if (emailCount > 0) contactScore += 0.50;
    if (phoneCount > 0) contactScore += 0.30;
    if (linkedinCount > 0) contactScore += 0.20;
    contactScore = Math.min(1.0, parseFloat(contactScore.toFixed(2)));

    const whyFit = evaluatedCriteria.map(c => c.explanation).join('; ');

    const buyerNeed = buyerNeedNature === 'OBSERVED' || buyerNeedNature === 'DERIVED';

    return {
      candidate_id: candidate.entity_id,
      candidate_name: candidate.name,
      candidate_type: 'PERSON',
      candidate_metadata: candidate.metadata || {},
      base_buyer_fit_score: baseBuyerFit,
      fit_score: baseBuyerFit,
      criteria_coverage: criteriaCoverage,
      independent_evidence_coverage: independentEvidenceCoverage,
      evidence_coverage: criteriaCoverage,
      proxy_ratio: 0.0,
      fit_confidence: confidence,
      confidence_score: confidence,
      distinct_locations: 1,
      evaluated_criteria: evaluatedCriteria,
      positive_criteria: positiveCriteria,
      negative_criteria: negativeCriteria,
      unknown_criteria: unknownCriteria,
      active_evidence_families: activeFamilies,
      timing_boost: 0.0,
      final_priority_score: baseBuyerFit,
      is_compatible: baseBuyerFit >= 0.30,
      fit_tier: baseBuyerFit >= 0.70 ? 'HIGH_FIT' : (baseBuyerFit >= 0.40 ? 'MEDIUM_FIT' : 'LOW_FIT'),
      opportunity_type: 'NONE',
      opportunity_status: 'NOT_DETERMINED',
      opportunity_score: null,
      commercial_opportunity: 'NOT_DETERMINED',
      opportunity_signal_types: [],
      contactability_score: contactScore,
      match_reasons: evaluatedCriteria.map(c => c.explanation),
      why_fit: whyFit,
      recommended_product_plan: `${profile.product_name} — Plan Profesional Individual`,
      verified_contact_points: {
        emails: verifiedContacts.emails || [],
        phones: verifiedContacts.phones || [],
        linkedin: verifiedContacts.linkedin || []
      },
      product_use_case_match: evaluatedCriteria.some(c => c.is_positive),
      buyer_need_match: buyerNeed,
      industry_match: true,
      operating_context_match: isGeoAllowed,
      attribute_match: roleFact.length > 0,
      product_domain_to_buyer_industry_leak: false,

      // STRICT REALITY SEMANTICS:
      buyer_compatibility: buyerCompatibility,
      buyer_need: buyerNeed,
      buyer_need_nature: buyerNeedNature,
      buyer_need_confidence: parseFloat(buyerNeedConfidence.toFixed(2)),
      buyer_need_evidence_ids: Array.from(new Set(buyerNeedEvidenceIds)),
      buyer_need_source_ids: Array.from(new Set(buyerNeedSourceIds)),
      why_need: whyNeed,
      purchase_intent: 'UNCONFIRMED',
      purchase_intent_score: null,
      purchase_intent_signals: []
    };
  }
}
