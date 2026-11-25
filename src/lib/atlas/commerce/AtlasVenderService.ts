/**
 * ATLAS VENDER / COMMERCE V1
 * Module: AtlasVenderService.ts
 * Path: src/lib/atlas/commerce/AtlasVenderService.ts
 * 
 * Orchestrator service for Vender / Commerce discovery.
 * Input: "¿QUÉ VENDÉS?" + COMPRADOR: PERSONAS / EMPRESAS / AMBOS.
 * Output: Ranked buyer candidates with four independent dimensions.
 * 
 * CORRECT FLOW:
 * USER QUERY
 *   ↓
 * NEW PRODUCT PROFILE
 *   ↓
 * PRODUCT COMPATIBILITY SPEC
 *   ↓
 * BUYER HYPOTHESIS
 *   ↓
 * DYNAMIC CANDIDATE GENERATION
 *   ↓
 * CANDIDATE POOL (RETRIEVE AMPLIO)
 *   ↓
 * BUYER FIT
 *   ↓
 * RANKING
 *   ↓
 * TOP RESULTS
 */

import { dbPool } from '../../../../server/db.ts';
import { AtlasProductProfile, type ProductBuyerType } from './AtlasProductProfile.ts';
import { AtlasProduct } from './AtlasProduct.ts';
import { AtlasBuyerFitEngine, type BuyerCandidateContext } from './AtlasBuyerFitEngine.ts';
import { AtlasBuyerRanker, type RankedBuyerItem } from './AtlasBuyerRanker.ts';
import { SimulatedCommerceConnector } from './SimulatedCommerceConnector.ts';
import { ProductBuyerMatchEngine } from './ProductBuyerMatchEngine.ts';
import { AtlasCommerceGate } from './AtlasCommerceGate.ts';
import { ProductCompatibilityCompiler } from './ProductCompatibilityCompiler.ts';
import { AtlasBuyerHypothesisCompiler, type BuyerHypothesis } from './AtlasBuyerHypothesisCompiler.ts';
import { AtlasDynamicCandidateGenerator } from './AtlasDynamicCandidateGenerator.ts';

export interface VenderSearchQueryParams {
  query: string;
  buyer_type?: ProductBuyerType;
  limit?: number;
  page?: number;
  geo?: string;
  only_contactable?: boolean;
  pool_size?: number;
}

export interface VenderSearchResultSummary {
  total_candidates: number;
  candidate_pool_size: number;
  person_candidates_count: number;
  company_candidates_count: number;
  high_fit_count: number;
  medium_fit_count: number;
  low_fit_count: number;
  insufficient_evidence_count: number;
  with_opportunity_count: number;
  without_opportunity_count: number;
  with_verified_contact_count: number;
  without_verified_contact_count: number;
  avg_proxy_ratio: number;
  avg_independent_evidence_coverage: number;
  avg_fit_confidence: number;
  buyer_fit_depends_on_opportunity: false;
  contactability_creates_buyer_fit: false;
  opportunity_creates_buyer_fit: false;
  generated_contacts: number;
  sensitive_person_targeting: number;
  automatic_external_actions: number;
  autopilot_to_truth_writes: number;
  telemetry?: any;
}

export interface VenderSearchResponse {
  success: boolean;
  search_id: string;
  query: string;
  product_profile: AtlasProductProfile;
  buyer_hypothesis: BuyerHypothesis;
  recommended_product: AtlasProduct;
  buyers: RankedBuyerItem[];
  results: any[];
  summary: VenderSearchResultSummary;
  candidate_pool?: any[];
  page: number;
  limit: number;
  environment: 'SIMULATION';
}

export class AtlasVenderService {
  private static instance: AtlasVenderService;

  private constructor() {}

  public static getInstance(): AtlasVenderService {
    if (!AtlasVenderService.instance) {
      AtlasVenderService.instance = new AtlasVenderService();
    }
    return AtlasVenderService.instance;
  }

  /**
   * Discovers and ranks compatible buyers for a product offering.
   */
  public async searchBuyers(params: VenderSearchQueryParams): Promise<VenderSearchResponse> {
    const rawQuery = (params.query || '').trim();
    if (!rawQuery) {
      throw new Error('Query "¿QUÉ VENDÉS?" cannot be empty.');
    }

    const searchId = `vender_search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const buyerType = params.buyer_type || 'COMPANY';
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const page = Math.max(1, params.page || 1);
    const offset = (page - 1) * limit;

    // STEP 1: Build NEW product profile from natural query (PRODUCT_PROFILE_BEFORE_CANDIDATE_QUERY = TRUE)
    const productProfile = AtlasProductProfile.fromNaturalQuery(rawQuery, buyerType);

    // STEP 2: Compile ProductCompatibilitySpec
    const compatibilitySpec = ProductCompatibilityCompiler.compileFromNaturalLanguage(rawQuery);

    // STEP 3: Compile BuyerHypothesis
    const buyerHypothesis = AtlasBuyerHypothesisCompiler.compile(compatibilitySpec, {
      buyer_type_override: buyerType,
      geo: params.geo
    });

    // STEP 4: Dynamic Candidate Generation (RETRIEVE AMPLIO → RANK DESPUÉS)
    const targetPoolSize = Math.max(limit * 3, Math.min(params.pool_size || 150, 500));
    const candidateGen = AtlasDynamicCandidateGenerator.getInstance();
    const candidateGenResult = await candidateGen.generateCandidatePool(buyerHypothesis, {
      buyer_type: buyerType,
      pool_size: targetPoolSize,
      offset
    });

    const candidateRows = candidateGenResult.candidates;
    const candidateIds = candidateRows.map(r => r.canonical_entity_id);

    // STEP 5: Query observed assertions and physical evidence (Truth Graph) for candidates
    const assertionsRes = candidateIds.length > 0 ? await dbPool.query(`
      SELECT 
        a.assertion_id,
        a.subject_id,
        a.predicate,
        a.value_normalized,
        a.truth_nature,
        e.evidence_id,
        e.source_id,
        e.source_url
      FROM public.atlas_truth_assertions a
      LEFT JOIN public.atlas_truth_evidence e ON a.assertion_id = e.assertion_id
      WHERE a.subject_id = ANY($1::text[])
        AND a.status = 'ACTIVE';
    `, [candidateIds]) : { rows: [] };

    const assertionsBySubject = new Map<string, any[]>();
    for (const a of assertionsRes.rows) {
      const list = assertionsBySubject.get(a.subject_id) || [];
      list.push(a);
      assertionsBySubject.set(a.subject_id, list);
    }

    // STEP 6: Query active opportunities (Temporal & Opportunity Graph) for timing boost
    const oppsRes = candidateIds.length > 0 ? await dbPool.query(`
      SELECT subject_id, opportunity_type, score, status
      FROM public.atlas_opportunities
      WHERE subject_id = ANY($1::text[])
        AND environment = 'PRODUCTION';
    `, [candidateIds]) : { rows: [] };

    const oppsBySubject = new Map<string, any[]>();
    for (const o of oppsRes.rows) {
      const list = oppsBySubject.get(o.subject_id) || [];
      list.push(o);
      oppsBySubject.set(o.subject_id, list);
    }

    // STEP 7: Query verified contacts for contactability dimension
    const contactsRes = candidateIds.length > 0 ? await dbPool.query(`
      SELECT entity_id::text as entity_id, email, company
      FROM public.atlas_contacts
      WHERE entity_id::text = ANY($1::text[]);
    `, [candidateIds]) : { rows: [] };

    const contactsBySubject = new Map<string, any[]>();
    for (const c of contactsRes.rows) {
      const list = contactsBySubject.get(c.entity_id) || [];
      list.push(c);
      contactsBySubject.set(c.entity_id, list);
    }

    // STEP 8: Build contexts and evaluate Buyer Fit for ALL candidates in the pool
    const evaluations = [];
    for (const row of candidateRows) {
      const id = String(row.canonical_entity_id);
      const meta = row.metadata || {};
      const subjectAsts = assertionsBySubject.get(id) || [];
      const subjectOpps = oppsBySubject.get(id) || [];
      const subjectContacts = contactsBySubject.get(id) || [];

      // Collect verified contacts from SSOT assertions + verified contacts table
      const emails: string[] = [];
      const phones: string[] = [];
      const linkedin: string[] = [];

      // Assertions
      for (const ast of subjectAsts) {
        if (ast.predicate === 'HAS_EMAIL') emails.push(ast.value_normalized);
        if (ast.predicate === 'HAS_PHONE') phones.push(ast.value_normalized);
        if (ast.predicate === 'HAS_LINKEDIN') linkedin.push(ast.value_normalized);
      }

      // Metadata fallback (if verified source provided)
      if (meta.linkedin && !linkedin.includes(meta.linkedin)) {
        linkedin.push(meta.linkedin);
      }
      if (meta.public_email && !emails.includes(meta.public_email)) {
        emails.push(meta.public_email);
      }
      if (meta.public_phone && !phones.includes(meta.public_phone)) {
        phones.push(meta.public_phone);
      }

      // Contact table
      for (const ct of subjectContacts) {
        if (ct.email) {
          if (ct.email.startsWith('tel:')) {
            const p = ct.email.replace('tel:', '').trim();
            if (!phones.includes(p)) phones.push(p);
          } else {
            const e = ct.email.trim();
            if (!emails.includes(e)) emails.push(e);
          }
        }
      }

      const oppTypes = subjectOpps.map(o => o.opportunity_type);

      const candidateContext: BuyerCandidateContext = {
        entity_id: id,
        name: row.canonical_name,
        entity_type: row.entity_type as any,
        metadata: meta,
        observed_assertions: subjectAsts,
        active_opportunity_types: oppTypes,
        active_opportunities: subjectOpps.map(o => ({
          opportunity_type: o.opportunity_type,
          status: o.status,
          score: o.score !== null && o.score !== undefined ? parseFloat(String(o.score)) : null
        })),
        verified_contacts: {
          emails: Array.from(new Set(emails)),
          phones: Array.from(new Set(phones)),
          linkedin: Array.from(new Set(linkedin))
        }
      };

      const evalResult = AtlasBuyerFitEngine.evaluateFit(candidateContext, productProfile);
      evaluations.push(evalResult);
    }

    // STEP 9: Rank candidates across all dimensions
    const rankedBuyers = AtlasBuyerRanker.rankCandidates(evaluations);

    // Apply pagination slice (e.g. top 20)
    const slicedBuyers = rankedBuyers.slice(0, limit);

    // STEP 10: Compute metrics summary with SINGLE AUTHORITY for verified contact
    let highFit = 0;
    let mediumFit = 0;
    let lowFit = 0;
    let insufficientEvidence = 0;
    let withCommercialOpp = 0;
    let withoutCommercialOpp = 0;
    let withContact = 0;
    let withoutContact = 0;

    let sumProxyRatio = 0;
    let sumIndependentCoverage = 0;
    let sumFitConfidence = 0;

    for (const b of slicedBuyers) {
      if (b.fit_tier === 'HIGH_FIT') highFit++;
      else if (b.fit_tier === 'MEDIUM_FIT') mediumFit++;
      else if (b.fit_tier === 'LOW_FIT') lowFit++;
      else insufficientEvidence++;

      if (b.commercial_opportunity === 'ACTIVE') withCommercialOpp++;
      else withoutCommercialOpp++;

      // Strict Invariant 13: HAS_VERIFIED_CONTACT single authority
      if (b.has_verified_contact) withContact++;
      else withoutContact++;

      sumProxyRatio += b.proxy_ratio || 0;
      sumIndependentCoverage += b.independent_evidence_coverage || 0;
      sumFitConfidence += b.confidence_score || b.fit_confidence || 0;
    }

    const n = Math.max(1, slicedBuyers.length);
    const avgProxyRatio = parseFloat((sumProxyRatio / n).toFixed(2));
    const avgIndependentCoverage = parseFloat((sumIndependentCoverage / n).toFixed(2));
    const avgFitConfidence = parseFloat((sumFitConfidence / n).toFixed(2));

    const summary: VenderSearchResultSummary = {
      total_candidates: slicedBuyers.length,
      candidate_pool_size: candidateGenResult.candidate_pool_size,
      person_candidates_count: candidateGenResult.person_candidates,
      company_candidates_count: candidateGenResult.company_candidates,
      high_fit_count: highFit,
      medium_fit_count: mediumFit,
      low_fit_count: lowFit,
      insufficient_evidence_count: insufficientEvidence,
      with_opportunity_count: withCommercialOpp,
      without_opportunity_count: withoutCommercialOpp,
      with_verified_contact_count: withContact,
      without_verified_contact_count: withoutContact,
      avg_proxy_ratio: avgProxyRatio,
      avg_independent_evidence_coverage: avgIndependentCoverage,
      avg_fit_confidence: avgFitConfidence,
      buyer_fit_depends_on_opportunity: false,
      contactability_creates_buyer_fit: false,
      opportunity_creates_buyer_fit: false,
      generated_contacts: 0,
      sensitive_person_targeting: 0,
      automatic_external_actions: 0,
      autopilot_to_truth_writes: 0,
      telemetry: candidateGenResult.telemetry
    };

    AtlasCommerceGate.getInstance().assertFailClosedIntegrity();

    // STEP 11: Resolve recommended simulated product or direct offer without inventing defaults
    const simulatedConnector = SimulatedCommerceConnector.getInstance();
    const simulatedProds = await simulatedConnector.getProducts({ query: rawQuery, buyer_type: buyerType });
    const topSimulatedProdDef = simulatedConnector.getAllRawProducts().find(p => 
      p.title.toLowerCase().includes(rawQuery.toLowerCase()) ||
      p.target_keywords.some(k => k.toLowerCase().includes(rawQuery.toLowerCase()) || rawQuery.toLowerCase().includes(k.toLowerCase()))
    );

    const recommendedProduct = new AtlasProduct({
      atlas_product_id: topSimulatedProdDef ? topSimulatedProdDef.atlas_product_id : productProfile.product_id,
      title: topSimulatedProdDef ? topSimulatedProdDef.title : productProfile.product_name,
      description: topSimulatedProdDef ? topSimulatedProdDef.description : productProfile.description,
      category: topSimulatedProdDef ? topSimulatedProdDef.category : productProfile.category,
      brand: topSimulatedProdDef ? topSimulatedProdDef.brand : 'Oferta Directa',
      price: topSimulatedProdDef ? topSimulatedProdDef.price : productProfile.price,
      currency: topSimulatedProdDef ? topSimulatedProdDef.currency : productProfile.currency,
      purchase_mode: topSimulatedProdDef ? 'ONLINE' : productProfile.purchase_mode,
      purchase_url: topSimulatedProdDef ? topSimulatedProdDef.purchase_url : productProfile.purchase_url,
      seller_id: topSimulatedProdDef ? topSimulatedProdDef.seller_id : 'SELLER_DIRECT_COMMERCE',
      geo: productProfile.geo_available,
      delivery_options: ['SIMULATED_DELIVERY']
    });

    const matchEvaluationTarget = topSimulatedProdDef || {
      product_identity_id: productProfile.product_id,
      title: productProfile.product_name,
      canonical_title: productProfile.product_name,
      category: productProfile.category,
      compatibility_spec: compatibilitySpec
    };

    // STEP 12: Compute independent PRODUCT_BUYER_MATCH_SCORE for each candidate
    const enhancedBuyers = slicedBuyers.map(b => {
      const matchEval = ProductBuyerMatchEngine.evaluateMatch({
        entity_id: b.candidate_id,
        entity_name: b.candidate_name,
        entity_type: b.candidate_type,
        metadata: {},
        base_buyer_fit_score: b.final_priority_score,
        opportunity_score: b.opportunity_score,
        contactability_score: b.contactability_score
      }, matchEvaluationTarget);

      const recommendedTier = topSimulatedProdDef 
        ? (b.base_buyer_fit_score >= 0.70 ? 'Plan Corporativo' : 'Plan Base')
        : (productProfile.price !== null ? `${productProfile.product_name} — Standard` : 'NO ESPECIFICADO');

      return {
        ...b,
        product_buyer_match_score: matchEval.product_buyer_match_score,
        product_match_breakdown: matchEval.breakdown,
        recommended_product_tier: recommendedTier,
        recommended_product_id: recommendedProduct.atlas_product_id,
        recommended_product_title: recommendedProduct.title
      };
    });

    const normalizedResults = enhancedBuyers.map(b => ({
      ...b,
      entity_id: b.candidate_id,
      entity_name: b.candidate_name,
      entity_type: b.candidate_type,
      buyer_fit_score: b.final_priority_score,
      product_buyer_match_score: b.product_buyer_match_score,
      verified_contacts: b.verified_contacts,
      has_verified_contact: b.has_verified_contact
    }));

    return {
      success: true,
      search_id: searchId,
      query: rawQuery,
      product_profile: productProfile,
      buyer_hypothesis: buyerHypothesis,
      recommended_product: recommendedProduct,
      buyers: enhancedBuyers,
      results: normalizedResults,
      summary,
      candidate_pool: candidateRows,
      page,
      limit,
      environment: 'SIMULATION'
    };
  }
}
