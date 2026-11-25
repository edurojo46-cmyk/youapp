/**
 * ATLAS COMMERCE — GENERIC PRODUCT-BUYER MATCH ENGINE V2
 * Module: ProductBuyerMatchEngine.ts
 * Path: src/lib/atlas/commerce/ProductBuyerMatchEngine.ts
 * 
 * 100% GENERIC, SPEC-DRIVEN MATCH ENGINE:
 * Compares ProductCompatibilitySpec ↔ BuyerMatchCandidateContext.
 * 
 * ZERO HARDCODED PRODUCTS, SKUS, PROFESSIONS, COMPANIES, OR RULES:
 * - HARDCODED_PRODUCT_IDS = 0
 * - HARDCODED_PRODUCT_NAMES = 0
 * - HARDCODED_BUYER_NAMES = 0
 * - HARDCODED_COMPANY_NAMES = 0
 * - HARDCODED_PRODUCT_RULES = 0
 * 
 * Evaluates strictly Phase A (PRODUCT_BUYER_MATCH):
 * - BUYER_TYPE_MATCH
 * - NEGATIVE_CONSTRAINT_MATCH
 * - DOMAIN_MATCH
 * - INDUSTRY_MATCH
 * - PROFESSION_MATCH
 * - USE_CASE_MATCH
 * - ATTRIBUTE_MATCH
 * - EVIDENCE_COVERAGE
 * - PRODUCT_MATCH_CONFIDENCE
 */

import { ProductCompatibilitySpec } from './ProductCompatibilitySpec.ts';
import { ProductCompatibilityCompiler } from './ProductCompatibilityCompiler.ts';

export interface BuyerMatchCandidateContext {
  entity_id: string;
  entity_name: string;
  entity_type: 'COMPANY' | 'ORGANIZATION' | 'PERSON';
  activity?: string;
  industry?: string;
  profession?: string;
  scale?: number;
  metadata?: Record<string, any>;
  observed_assertions?: any[];
  base_buyer_fit_score?: number;
  opportunity_score?: number | null;
  contactability_score?: number;
}

export interface GenericMatchBreakdown {
  buyer_type_match: number;
  domain_match: number;
  industry_match: number;
  profession_match: number;
  use_case_match: number;
  attribute_match: number;
  negative_constraint_passed: boolean;
  evidence_coverage: number;
  confidence: number;
  matched_evidence_items: string[];
  explanation: string;
}

export interface ProductBuyerMatchResult {
  product_id: string;
  product_identity_id: string;
  product_title: string;
  category: string;
  buyer_id: string;
  buyer_name: string;
  product_buyer_match_score: number;
  product_match_score: number;
  product_match_confidence: number;
  product_match_evidence_coverage: number;
  is_negative_incompatible: boolean;
  breakdown: GenericMatchBreakdown;
  why_match: string;
  independent_dimensions: {
    buyer_fit_score: number;
    opportunity_score: number | null;
    contactability_score: number;
    product_buyer_match_score: number;
  };
}

export class ProductBuyerMatchEngine {
  /**
   * Evaluates generic compatibility between a Buyer profile and a Product profile.
   * Driven strictly by ProductCompatibilitySpec without any hardcoded product rules.
   */
  public static evaluateMatch(
    buyer: BuyerMatchCandidateContext,
    product: any
  ): ProductBuyerMatchResult {
    const productId = product.product_identity_id || product.product_id || product.id || 'PRODUCT_UNKNOWN';
    const productTitle = product.canonical_title || product.title || 'Product';
    const category = product.category || product.product_domain || 'COMMERCE';

    // 1. Resolve ProductCompatibilitySpec
    const spec: ProductCompatibilitySpec = product.compatibility_spec
      ? product.compatibility_spec
      : ProductCompatibilityCompiler.compile(product);

    // 2. Normalize Buyer textual tokens and attributes
    const buyerEntity = buyer.entity_name || '';
    const buyerIndustry = buyer.industry || '';
    const buyerActivity = buyer.activity || '';
    const buyerProfession = buyer.profession || buyer.metadata?.profession || buyer.metadata?.title || buyer.metadata?.occupation || buyer.metadata?.role || '';
    const buyerAssertions = buyer.observed_assertions?.map(a => a.value_normalized || '') || [];

    const fullBuyerTokens = [
      buyerEntity,
      buyerIndustry,
      buyerActivity,
      buyerProfession,
      ...(buyer.metadata ? Object.values(buyer.metadata).filter(v => typeof v === 'string') : []),
      ...buyerAssertions
    ].join(' ').toLowerCase();

    const matchedEvidence: string[] = [];

    // =========================================================================
    // DIMENSION 1: BUYER_TYPE_MATCH
    // =========================================================================
    const buyerTypeAllowed = spec.buyer_types && spec.buyer_types.length > 0
      ? spec.buyer_types.includes(buyer.entity_type)
      : true;

    if (!buyerTypeAllowed) {
      const breakdown: GenericMatchBreakdown = {
        buyer_type_match: 0.0,
        domain_match: 0.0,
        industry_match: 0.0,
        profession_match: 0.0,
        use_case_match: 0.0,
        attribute_match: 0.0,
        negative_constraint_passed: false,
        evidence_coverage: 0.0,
        confidence: 0.95,
        matched_evidence_items: [],
        explanation: `Incompatibilidad por tipo de entidad: El comprador es de tipo '${buyer.entity_type}', mientras que la especificación del producto admite: [${spec.buyer_types.join(', ')}].`
      };

      return {
        product_id: productId,
        product_identity_id: productId,
        product_title: productTitle,
        category,
        buyer_id: buyer.entity_id,
        buyer_name: buyer.entity_name,
        product_buyer_match_score: 0.00,
        product_match_score: 0.00,
        product_match_confidence: 0.95,
        product_match_evidence_coverage: 0.00,
        is_negative_incompatible: true,
        breakdown,
        why_match: breakdown.explanation,
        independent_dimensions: {
          buyer_fit_score: buyer.base_buyer_fit_score ?? 0.0,
          opportunity_score: buyer.opportunity_score ?? null,
          contactability_score: buyer.contactability_score ?? 0.0,
          product_buyer_match_score: 0.00
        }
      };
    }

    // =========================================================================
    // DIMENSION 2: NEGATIVE_CONSTRAINT_MATCH (SPEC-DRIVEN)
    // =========================================================================
    if (spec.excluded_industries && spec.excluded_industries.length > 0) {
      for (const excluded of spec.excluded_industries) {
        if (this.fuzzyIncludes(fullBuyerTokens, excluded)) {
          const breakdown: GenericMatchBreakdown = {
            buyer_type_match: 1.0,
            domain_match: 0.0,
            industry_match: 0.0,
            profession_match: 0.0,
            use_case_match: 0.0,
            attribute_match: 0.0,
            negative_constraint_passed: false,
            evidence_coverage: 0.0,
            confidence: 0.90,
            matched_evidence_items: [],
            explanation: `Incompatible por exclusión sectorial: La actividad coincide con la restricción de exclusión '${excluded}' definida en la especificación del producto.`
          };

          return {
            product_id: productId,
            product_identity_id: productId,
            product_title: productTitle,
            category,
            buyer_id: buyer.entity_id,
            buyer_name: buyer.entity_name,
            product_buyer_match_score: 0.00,
            product_match_score: 0.00,
            product_match_confidence: 0.90,
            product_match_evidence_coverage: 0.00,
            is_negative_incompatible: true,
            breakdown,
            why_match: breakdown.explanation,
            independent_dimensions: {
              buyer_fit_score: buyer.base_buyer_fit_score ?? 0.0,
              opportunity_score: buyer.opportunity_score ?? null,
              contactability_score: buyer.contactability_score ?? 0.0,
              product_buyer_match_score: 0.00
            }
          };
        }
      }
    }

    if (spec.excluded_professions && spec.excluded_professions.length > 0) {
      for (const excluded of spec.excluded_professions) {
        if (this.fuzzyIncludes(buyerProfession, excluded)) {
          const breakdown: GenericMatchBreakdown = {
            buyer_type_match: 1.0,
            domain_match: 0.0,
            industry_match: 0.0,
            profession_match: 0.0,
            use_case_match: 0.0,
            attribute_match: 0.0,
            negative_constraint_passed: false,
            evidence_coverage: 0.0,
            confidence: 0.90,
            matched_evidence_items: [],
            explanation: `Incompatible por exclusión profesional: La ocupación observada coincide con la exclusión '${excluded}' definida en la especificación.`
          };

          return {
            product_id: productId,
            product_identity_id: productId,
            product_title: productTitle,
            category,
            buyer_id: buyer.entity_id,
            buyer_name: buyer.entity_name,
            product_buyer_match_score: 0.00,
            product_match_score: 0.00,
            product_match_confidence: 0.90,
            product_match_evidence_coverage: 0.00,
            is_negative_incompatible: true,
            breakdown,
            why_match: breakdown.explanation,
            independent_dimensions: {
              buyer_fit_score: buyer.base_buyer_fit_score ?? 0.0,
              opportunity_score: buyer.opportunity_score ?? null,
              contactability_score: buyer.contactability_score ?? 0.0,
              product_buyer_match_score: 0.00
            }
          };
        }
      }
    }

    if (spec.incompatible_buyer_attributes && spec.incompatible_buyer_attributes.length > 0) {
      for (const attr of spec.incompatible_buyer_attributes) {
        if (this.buyerHasAttribute(buyer, attr)) {
          const breakdown: GenericMatchBreakdown = {
            buyer_type_match: 1.0,
            domain_match: 0.0,
            industry_match: 0.0,
            profession_match: 0.0,
            use_case_match: 0.0,
            attribute_match: 0.0,
            negative_constraint_passed: false,
            evidence_coverage: 0.0,
            confidence: 0.90,
            matched_evidence_items: [],
            explanation: `Incompatible por atributo: Posee el atributo '${attr}' explícitamente incompatible en la especificación del producto.`
          };

          return {
            product_id: productId,
            product_identity_id: productId,
            product_title: productTitle,
            category,
            buyer_id: buyer.entity_id,
            buyer_name: buyer.entity_name,
            product_buyer_match_score: 0.00,
            product_match_score: 0.00,
            product_match_confidence: 0.90,
            product_match_evidence_coverage: 0.00,
            is_negative_incompatible: true,
            breakdown,
            why_match: breakdown.explanation,
            independent_dimensions: {
              buyer_fit_score: buyer.base_buyer_fit_score ?? 0.0,
              opportunity_score: buyer.opportunity_score ?? null,
              contactability_score: buyer.contactability_score ?? 0.0,
              product_buyer_match_score: 0.00
            }
          };
        }
      }
    }

    // =========================================================================
    // DIMENSION 3: INDUSTRY_MATCH
    // =========================================================================
    let industryScore = 0.0;
    if (spec.target_industries && spec.target_industries.length > 0) {
      let matchedCount = 0;
      for (const targetInd of spec.target_industries) {
        if (this.fuzzyIncludes(buyerIndustry, targetInd) || this.fuzzyIncludes(buyerActivity, targetInd)) {
          matchedCount++;
          matchedEvidence.push(`Industria compatible: '${targetInd}'`);
        }
      }
      industryScore = matchedCount > 0 ? Math.min(1.0, matchedCount / Math.min(2, spec.target_industries.length)) : 0.0;
    } else {
      industryScore = 0.50; // Neutral if unspecified
    }

    // =========================================================================
    // DIMENSION 4: PROFESSION_MATCH
    // =========================================================================
    let professionScore = 0.0;
    if (spec.target_professions && spec.target_professions.length > 0) {
      let matchedCount = 0;
      const targetCheck = `${buyerProfession} ${buyerActivity} ${buyerEntity}`.toLowerCase();
      for (const prof of spec.target_professions) {
        if (this.fuzzyIncludes(targetCheck, prof)) {
          matchedCount++;
          matchedEvidence.push(`Profesión o rol afín: '${prof}'`);
        }
      }
      professionScore = matchedCount > 0 ? Math.min(1.0, matchedCount / Math.min(2, spec.target_professions.length)) : 0.0;
    } else {
      professionScore = 0.50; // Neutral if unspecified
    }

    // =========================================================================
    // DIMENSION 5: USE_CASE_MATCH & DOMAIN_MATCH
    // =========================================================================
    let useCaseScore = 0.0;
    if (spec.use_cases && spec.use_cases.length > 0) {
      let matchedCount = 0;
      for (const uc of spec.use_cases) {
        if (this.fuzzyIncludes(fullBuyerTokens, uc)) {
          matchedCount++;
          matchedEvidence.push(`Caso de uso coincidente: '${uc}'`);
        }
      }
      useCaseScore = matchedCount > 0 ? Math.min(1.0, matchedCount / Math.min(2, spec.use_cases.length)) : 0.0;
    }

    let domainScore = 0.0;
    if (spec.product_domain) {
      if (this.fuzzyIncludes(fullBuyerTokens, spec.product_domain.replace(/_/g, ' '))) {
        domainScore = 1.0;
      } else {
        domainScore = (industryScore + professionScore) > 0 ? 0.70 : 0.0;
      }
    }

    // =========================================================================
    // DIMENSION 6: ATTRIBUTE_MATCH
    // =========================================================================
    let attributeScore = 1.0;
    if (spec.required_buyer_attributes && spec.required_buyer_attributes.length > 0) {
      let presentReq = 0;
      for (const req of spec.required_buyer_attributes) {
        if (this.buyerHasAttribute(buyer, req)) {
          presentReq++;
        }
      }
      attributeScore = presentReq / spec.required_buyer_attributes.length;
    }

    if (spec.preferred_buyer_attributes && spec.preferred_buyer_attributes.length > 0) {
      for (const pref of spec.preferred_buyer_attributes) {
        if (this.buyerHasAttribute(buyer, pref)) {
          attributeScore = Math.min(1.0, attributeScore + 0.15);
          matchedEvidence.push(`Atributo preferido verificado: '${pref}'`);
        }
      }
    }

    // =========================================================================
    // DIMENSION 7: EVIDENCE_COVERAGE & CONFIDENCE
    // =========================================================================
    const isOrg = buyer.entity_type === 'COMPANY' || buyer.entity_type === 'ORGANIZATION';

    const totalTargetCriteria = isOrg
      ? (spec.target_industries?.length ? 1 : 0) + (spec.use_cases?.length ? 1 : 0)
      : (spec.target_professions?.length ? 1 : 0) + (spec.target_industries?.length ? 1 : 0) + (spec.use_cases?.length ? 1 : 0);

    const satisfiedCriteria = isOrg
      ? (industryScore > 0 ? 1 : 0) + (useCaseScore > 0 ? 1 : 0)
      : (professionScore > 0 ? 1 : 0) + (industryScore > 0 ? 1 : 0) + (useCaseScore > 0 ? 1 : 0);

    const evidenceCoverage = totalTargetCriteria > 0
      ? Number(Math.min(1.0, satisfiedCriteria / totalTargetCriteria).toFixed(2))
      : 0.50;

    // Confidence derived from evidence density and verified observations
    let confidence = 0.50;
    if (satisfiedCriteria >= totalTargetCriteria && totalTargetCriteria > 0) {
      confidence = 0.90;
    } else if (satisfiedCriteria >= 1) {
      confidence = 0.75;
    } else {
      confidence = 0.20;
    }

    // =========================================================================
    // COMBINED GENERIC SCORE CALCULATION
    // =========================================================================
    let rawScore = 0.0;
    if (industryScore === 0 && professionScore === 0 && useCaseScore === 0) {
      rawScore = 0.00;
    } else if (isOrg) {
      // For organizations, industry and use-case/activity are the primary drivers
      rawScore = (
        (industryScore * 0.50) +
        (useCaseScore * 0.35) +
        (attributeScore * 0.15)
      );
    } else {
      // For individuals, profession and industry are the primary drivers
      rawScore = (
        (professionScore * 0.45) +
        (industryScore * 0.30) +
        (useCaseScore * 0.15) +
        (attributeScore * 0.10)
      );
    }

    // Scale final score by evidence coverage and confidence (avoid 0.98 without solid evidence)
    const confidenceModifier = 0.60 + (0.40 * confidence);
    const coverageModifier = 0.60 + (0.40 * Math.min(1.0, evidenceCoverage));
    let finalScore = Number(Math.min(0.95, Math.max(0.0, rawScore * confidenceModifier * coverageModifier)).toFixed(2));

    // Commodity capping: general horizontal commodities (e.g. standard desk, basic office paper)
    // are capped to prevent displacing primary vertical solutions unless specifically required.
    if (spec.is_horizontal_commodity) {
      finalScore = Math.min(0.40, finalScore);
    }

    // Build reasoning using strictly observed and evaluated criteria
    let whyMatch = '';
    if (finalScore === 0) {
      whyMatch = `Sin afinidad observada: la actividad de ${buyer.entity_name} no presenta coincidencias con el dominio o especificación del producto.`;
    } else if (spec.is_horizontal_commodity) {
      whyMatch = `Afinidad horizontal complementaria (${finalScore.toFixed(2)}): producto compatible con el entorno administrativo general, subordinado a soluciones verticales principales.`;
    } else {
      const mainEvidence = matchedEvidence.slice(0, 2).join('; ');
      whyMatch = `Alta afinidad con perfil del comprador (${finalScore.toFixed(2)}): ${mainEvidence || 'concordancia de perfil y contexto'}. Producto orientado a uso [${spec.usage_context.join(', ')}].`;
    }

    const breakdown: GenericMatchBreakdown = {
      buyer_type_match: 1.0,
      domain_match: domainScore,
      industry_match: industryScore,
      profession_match: professionScore,
      use_case_match: useCaseScore,
      attribute_match: attributeScore,
      negative_constraint_passed: true,
      evidence_coverage: evidenceCoverage,
      confidence,
      matched_evidence_items: matchedEvidence,
      explanation: whyMatch
    };

    return {
      product_id: productId,
      product_identity_id: productId,
      product_title: productTitle,
      category,
      buyer_id: buyer.entity_id,
      buyer_name: buyer.entity_name,
      product_buyer_match_score: finalScore,
      product_match_score: finalScore,
      product_match_confidence: confidence,
      product_match_evidence_coverage: evidenceCoverage,
      is_negative_incompatible: false,
      breakdown,
      why_match: whyMatch,
      independent_dimensions: {
        buyer_fit_score: buyer.base_buyer_fit_score ?? 0.0,
        opportunity_score: buyer.opportunity_score ?? null,
        contactability_score: buyer.contactability_score ?? 0.0,
        product_buyer_match_score: finalScore
      }
    };
  }

  /**
   * Helper checking if needle is contained in haystack (token-aware).
   */
  private static fuzzyIncludes(haystack: string, needle: string): boolean {
    if (!haystack || !needle) return false;
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    if (h.includes(n)) return true;

    const stopWords = new Set(['afines', 'general', 'otros', 'otras', 'para', 'como', 'entre', 'hacia']);
    const tokens = n.split(/[\s,;./\-]+/).filter(t => t.length >= 4 && !stopWords.has(t));
    if (tokens.length === 0) return false;
    const matchedTokens = tokens.filter(t => h.includes(t));
    return matchedTokens.length >= 1;
  }

  /**
   * Helper checking if buyer has a given attribute.
   */
  private static buyerHasAttribute(buyer: BuyerMatchCandidateContext, attrName: string): boolean {
    if (!buyer.metadata) return false;
    const norm = attrName.toLowerCase();
    if (buyer.metadata[attrName] !== undefined || buyer.metadata[norm] !== undefined) return true;
    for (const [k, v] of Object.entries(buyer.metadata)) {
      if (k.toLowerCase().includes(norm) || String(v).toLowerCase().includes(norm)) return true;
    }
    return false;
  }

  /**
   * Evaluates a buyer across all catalog product identities and returns them sorted by match score descending.
   */
  public static rankProductsForBuyer(
    buyer: BuyerMatchCandidateContext,
    productIdentities: any[]
  ): ProductBuyerMatchResult[] {
    const results = productIdentities.map(p => this.evaluateMatch(buyer, p));
    return results.sort((a, b) => b.product_match_score - a.product_match_score);
  }
}
