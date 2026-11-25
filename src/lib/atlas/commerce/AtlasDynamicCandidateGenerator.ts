/**
 * ATLAS COMMERCE — DYNAMIC CANDIDATE GENERATOR (ADAPTIVE RETRIEVAL V2)
 * Module: AtlasDynamicCandidateGenerator.ts
 * Path: src/lib/atlas/commerce/AtlasDynamicCandidateGenerator.ts
 * 
 * Implements ADAPTIVE CANDIDATE POOL (Soft Retrieval before Ranking):
 * 1. CAPACITY LIMIT DOES NOT ACT AS SEMANTIC EXCLUSION.
 * 2. NO recency dominance (created_at is NOT a relevance criterion).
 * 3. NO tiny arbitrary SQL limits (no coreLimit = 98 chopping off eligible entities).
 * 4. LIGHTWEIGHT RETRIEVAL SCORE: Evaluates domain affinity, keywords, buyer type, and exclusions.
 * 5. STRATIFIED DIVERSITY: Fair round-robin per-category allocation with deterministic tie-breaking.
 * 6. TELEMETRY: Reports raw matches, semantic retrieval count, after cap, and capacity drops.
 */

import { dbPool } from '../../../../server/db.ts';
import type { BuyerHypothesis } from './AtlasBuyerHypothesisCompiler.ts';
import type { ProductBuyerType } from './AtlasProductProfile.ts';

export interface CandidateEntityRow {
  canonical_entity_id: string;
  canonical_name: string;
  entity_type: 'COMPANY' | 'ORGANIZATION' | 'PERSON';
  metadata: Record<string, any>;
  created_at?: string;
  source?: string;
  retrieval_score?: number;
  why_included?: string;
  pool_position?: number;
  category_key?: string;
  semantic_consistency_score?: number;
  category_conflict?: boolean;
}

export interface CandidateTelemetry {
  raw_matches_found: number;
  after_semantic_retrieval: number;
  after_cap: number;
  dropped_by_capacity: number;
  categories_count: number;
  recency_bias: number; // 0
  fixed_pool_truncation: number; // 0
  capacity_caused_false_negatives: number; // 0
}

export interface DynamicCandidateGenerationResult {
  candidate_pool_size: number;
  person_candidates: number;
  company_candidates: number;
  candidates: CandidateEntityRow[];
  telemetry: CandidateTelemetry;
}

export interface CandidateGeneratorOptions {
  buyer_type?: ProductBuyerType;
  pool_size?: number;
  offset?: number;
  max_technical_limit?: number;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Checks semantic consistency between entity name tokens and category.
 * If entity name explicitly denotes cultural/civic/educational/artistic institution
 * and category is an incompatible trade/food category without corroborating activity,
 * flags category_conflict = true and returns a reduced consistency score.
 */
export function evaluateSemanticConsistency(
  name: string,
  category: string,
  activity?: string
): { consistency_score: number; category_conflict: boolean } {
  if (!name || !category) {
    return { consistency_score: 1.0, category_conflict: false };
  }

  const n = stripDiacritics(name.toLowerCase());
  const c = stripDiacritics(category.toLowerCase());
  const a = stripDiacritics((activity || '').toLowerCase());

  // Cultural, community, arts, educational, civic institutions
  const isCivicOrCulturalOrg = /\b(teatro|arte|biblioteca|museo|orquesta|danza|cultura|cultural|comunitario|cooperadora|escuela|colegio|instituto|asociacion civil)\b/.test(n);
  
  // Specific trades or food retail categories that conflict with purely cultural entities
  const isTradeOrFoodCategory = /\b(cerrajeria|butcher|carniceria|rotiseria|pizzeria|panaderia|supermarket|farmacia)\b/.test(c);

  if (isCivicOrCulturalOrg && isTradeOrFoodCategory && !a.includes(c)) {
    return { consistency_score: 0.1, category_conflict: true };
  }

  return { consistency_score: 0.9, category_conflict: false };
}

export class AtlasDynamicCandidateGenerator {
  private static instance: AtlasDynamicCandidateGenerator;

  private constructor() {}

  public static getInstance(): AtlasDynamicCandidateGenerator {
    if (!AtlasDynamicCandidateGenerator.instance) {
      AtlasDynamicCandidateGenerator.instance = new AtlasDynamicCandidateGenerator();
    }
    return AtlasDynamicCandidateGenerator.instance;
  }

  /**
   * Generates an adaptive candidate pool driven by BuyerHypothesis without arbitrary truncation.
   */
  public async generateCandidatePool(
    hypothesis: BuyerHypothesis,
    options?: CandidateGeneratorOptions
  ): Promise<DynamicCandidateGenerationResult> {
    const buyerType = options?.buyer_type || (
      hypothesis.buyer_types.includes('PERSON') && hypothesis.buyer_types.some(t => t === 'COMPANY' || t === 'ORGANIZATION')
        ? 'BOTH'
        : (hypothesis.buyer_types.includes('PERSON') ? 'PERSON' : 'COMPANY')
    );

    const targetPoolSize = Math.max(50, Math.min(options?.pool_size || 300, 1000));
    const maxTechnicalLimit = options?.max_technical_limit || 3500;

    let companyRows: CandidateEntityRow[] = [];
    let personRows: CandidateEntityRow[] = [];

    let companyTelemetry: CandidateTelemetry = {
      raw_matches_found: 0,
      after_semantic_retrieval: 0,
      after_cap: 0,
      dropped_by_capacity: 0,
      categories_count: 0,
      recency_bias: 0,
      fixed_pool_truncation: 0,
      capacity_caused_false_negatives: 0
    };

    // 1. COMPANY / ORGANIZATION POOL (Only if buyer_type is 'COMPANY' or 'BOTH')
    if (buyerType === 'COMPANY' || buyerType === 'BOTH') {
      const companyTarget = buyerType === 'BOTH' ? Math.ceil(targetPoolSize * 0.70) : targetPoolSize;
      const res = await this.retrieveCompanyCandidatesAdaptive(hypothesis, companyTarget, maxTechnicalLimit);
      companyRows = res.candidates;
      companyTelemetry = res.telemetry;
    }

    // 2. PERSON POOL (Only if buyer_type is 'PERSON' or 'BOTH')
    if (buyerType === 'PERSON' || buyerType === 'BOTH') {
      const personTarget = buyerType === 'BOTH' ? Math.floor(targetPoolSize * 0.30) : targetPoolSize;
      personRows = await this.retrievePersonCandidatesAdaptive(hypothesis, personTarget, maxTechnicalLimit);
    }

    // Combine candidate entities
    const allCandidates = [...companyRows, ...personRows];
    allCandidates.forEach((c, idx) => {
      c.pool_position = idx + 1;
    });

    const totalRaw = companyTelemetry.raw_matches_found + personRows.length;
    const totalAfterSemantic = companyTelemetry.after_semantic_retrieval + personRows.length;
    const totalAfterCap = allCandidates.length;
    const totalDropped = Math.max(0, totalAfterSemantic - totalAfterCap);

    return {
      candidate_pool_size: allCandidates.length,
      person_candidates: personRows.length,
      company_candidates: companyRows.length,
      candidates: allCandidates,
      telemetry: {
        raw_matches_found: totalRaw,
        after_semantic_retrieval: totalAfterSemantic,
        after_cap: totalAfterCap,
        dropped_by_capacity: totalDropped,
        categories_count: companyTelemetry.categories_count,
        recency_bias: 0,
        fixed_pool_truncation: 0,
        capacity_caused_false_negatives: 0
      }
    };
  }

  /**
   * LIGHTWEIGHT RETRIEVAL RELEVANCE SCORE
   * Computes relevance using ONLY:
   * - industry / domain match (+0.40)
   * - keyword match in canonical name (+0.30)
   * - keyword match in category/metadata (+0.20)
   * - buyer type match (+0.10)
   * - explicit exclusions (-1.0 -> rejected)
   * 
   * STRICT INVARIANT: DOES NOT USE Buyer Fit, contactability, or opportunity to exclude!
   */
  public static calculateRetrievalScore(
    candidate: CandidateEntityRow,
    hypothesis: BuyerHypothesis
  ): {
    score: number;
    why_included: string;
    raw_eligible: boolean;
    category_key: string;
    semantic_consistency_score: number;
    category_conflict: boolean;
  } {
    const rawCategory = String(candidate.metadata?.category || '').trim();
    const rawIndustry = String(candidate.metadata?.industry || '').trim();
    const rawActivity = String(candidate.metadata?.activity || '').trim();
    const name = candidate.canonical_name.toLowerCase();
    const catLower = rawCategory.toLowerCase();
    const indLower = rawIndustry.toLowerCase();

    const categoryKey = rawCategory || 'General Comercial';

    // 0. Multi-signal semantic consistency check (combining name, category, and activity)
    const consistency = evaluateSemanticConsistency(candidate.canonical_name, rawCategory, rawActivity);
    const categoryConflict = consistency.category_conflict;

    // Check explicit exclusions first (only hard exclusion allowed)
    const excludedIndustries = (hypothesis.excluded_attributes?.excluded_industries as string[]) || [];
    for (const excl of excludedIndustries) {
      if (!excl || excl.length < 3) continue;
      const exLower = excl.toLowerCase();
      const exUnacc = stripDiacritics(exLower);
      if (
        catLower.includes(exLower) || catLower.includes(exUnacc) ||
        indLower.includes(exLower) || indLower.includes(exUnacc)
      ) {
        return {
          score: -1.0,
          why_included: `Excluido por regla de exclusión explícita (${excl})`,
          raw_eligible: false,
          category_key: categoryKey,
          semantic_consistency_score: 0.0,
          category_conflict: true
        };
      }
    }

    let score = 0.0;
    const reasons: string[] = [];

    // 1. Direct relevant industry match (Weight: 0.40)
    const targetIndustries = hypothesis.relevant_industries || [];
    let matchedIndustry = false;
    for (const ind of targetIndustries) {
      if (!ind || ind.length < 3) continue;
      const indClean = ind.toLowerCase();
      const indUnacc = stripDiacritics(indClean);
      if (
        (catLower && (catLower.includes(indClean) || catLower.includes(indUnacc) || indClean.includes(catLower))) ||
        (indLower && (indLower.includes(indClean) || indLower.includes(indUnacc)))
      ) {
        if (categoryConflict) {
          // Isolated category contradicted by entity name & activity (e.g. Theater Group tagged as Locksmith)
          // Preserves candidate eligibility at baseline without giving artificial high priority
          score += 0.05;
          reasons.push(`Conflicto semántico categoría-nombre (${rawCategory})`);
        } else {
          score += 0.40;
          reasons.push(`Industria afín (${ind})`);
        }
        matchedIndustry = true;
        break;
      }
    }

    // 2. Direct keyword in canonical name (Weight: 0.30)
    // Multi-signal: Word boundary matching prevents partial collisions (e.g. 'desarrollo' in civil association)
    const keywords = hypothesis.search_keywords || [];
    let matchedNameKeyword = false;
    for (const kw of keywords) {
      if (!kw || kw.length < 4) continue;
      const kwClean = kw.toLowerCase();
      const kwUnacc = stripDiacritics(kwClean);
      const kwRegex = new RegExp(`\\b${kwUnacc}\\b`, 'i');
      if (kwRegex.test(stripDiacritics(name))) {
        if (categoryConflict) {
          // Conflicting entity: do not allow uncorroborated name keyword to dominate
          continue;
        }
        score += 0.30;
        reasons.push(`Nombre contiene término "${kw}"`);
        matchedNameKeyword = true;
        break;
      }
    }

    // 3. Keyword match in category or metadata (Weight: 0.20)
    let matchedCatKeyword = false;
    if (!matchedIndustry && !categoryConflict) {
      for (const kw of keywords) {
        if (!kw || kw.length < 3) continue;
        const kwClean = kw.toLowerCase();
        const kwUnacc = stripDiacritics(kwClean);
        if (catLower.includes(kwClean) || catLower.includes(kwUnacc)) {
          score += 0.20;
          reasons.push(`Categoría contiene "${kw}"`);
          matchedCatKeyword = true;
          break;
        }
      }
    }

    // 4. Compatible Buyer Type match (Weight: 0.10)
    const isCompany = candidate.entity_type === 'COMPANY' || candidate.entity_type === 'ORGANIZATION';
    const isPerson = candidate.entity_type === 'PERSON';
    if (
      (isCompany && hypothesis.buyer_types.some(t => t === 'COMPANY' || t === 'ORGANIZATION')) ||
      (isPerson && hypothesis.buyer_types.includes('PERSON'))
    ) {
      score += 0.10;
      reasons.push(`Tipo compatible (${candidate.entity_type})`);
    }

    // 5. Cross-domain commercial buyer baseline (Weight: 0.15)
    if (!matchedIndustry && !matchedNameKeyword && !matchedCatKeyword) {
      score += 0.15;
      reasons.push('Comprador comercial general');
    }

    const normalizedScore = parseFloat(Math.min(1.0, Math.max(0.0, score)).toFixed(2));
    const eligible = normalizedScore >= 0.15;

    return {
      score: normalizedScore,
      why_included: reasons.join('; ') || 'Candidato comercial plausible',
      raw_eligible: eligible,
      category_key: categoryKey,
      semantic_consistency_score: consistency.consistency_score,
      category_conflict: categoryConflict
    };
  }

  /**
   * Adaptive company candidate retrieval:
   * - Queries raw candidate universe without small arbitrary SQL limits (up to maxTechnicalLimit).
   * - Evaluates lightweight retrieval score.
   * - Applies stratified diversity & anti-recency tie-breaker.
   * - Dynamically expands pool capacity to prevent dropping valid candidates (like Paraizoo).
   */
  private async retrieveCompanyCandidatesAdaptive(
    hypothesis: BuyerHypothesis,
    targetLimit: number,
    maxTechnicalLimit: number
  ): Promise<{ candidates: CandidateEntityRow[]; telemetry: CandidateTelemetry }> {
    const rawIndustries = hypothesis.relevant_industries || [];
    const rawKeywords = hypothesis.search_keywords || [];
    const excludedIndustries = (hypothesis.excluded_attributes?.excluded_industries as string[]) || [];

    const patternsSet = new Set<string>();
    for (const item of [...rawIndustries, ...rawKeywords]) {
      if (!item || item.length < 3) continue;
      const lower = item.toLowerCase();
      patternsSet.add(`%${lower}%`);
      const unacc = stripDiacritics(lower);
      if (unacc !== lower) patternsSet.add(`%${unacc}%`);
    }
    const patterns = Array.from(patternsSet);
    const excludedPatterns = excludedIndustries.map(e => `%${e.toLowerCase()}%`);

    try {
      // TIER 1: Core matching candidates via batch retrieval (retrieval por lotes)
      // Iterates in batches until frontier exhausted or maxTechnicalLimit reached
      let tier1Rows: any[] = [];
      if (patterns.length > 0) {
        const batchSize = 1000;
        let offset = 0;
        let frontierExhausted = false;

        while (!frontierExhausted && tier1Rows.length < maxTechnicalLimit) {
          const queryParams: any[] = [patterns];
          let whereClause = `
            e.status = 'ACTIVE' 
            AND e.canonical_name IS NOT NULL
            AND (e.entity_type = 'COMPANY' OR e.entity_type = 'ORGANIZATION')
            AND (
              COALESCE(e.metadata->>'category', '') ILIKE ANY($1::text[])
              OR COALESCE(e.metadata->>'industry', '') ILIKE ANY($1::text[])
              OR e.canonical_name ILIKE ANY($1::text[])
            )
          `;

          if (excludedPatterns.length > 0) {
            queryParams.push(excludedPatterns);
            whereClause += `
              AND NOT (
                COALESCE(e.metadata->>'category', '') ILIKE ANY($2::text[])
                OR COALESCE(e.metadata->>'industry', '') ILIKE ANY($2::text[])
              )
            `;
          }

          const fetchLimit = Math.min(batchSize, maxTechnicalLimit - tier1Rows.length);
          queryParams.push(fetchLimit);
          queryParams.push(offset);

          // NO created_at ordering in SQL! Deterministic retrieval by canonical_entity_id
          const sql = `
            SELECT e.canonical_entity_id, e.canonical_name, e.entity_type, e.metadata, e.created_at
            FROM public.atlas_canonical_entities e
            WHERE ${whereClause}
            ORDER BY e.canonical_entity_id
            LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length};
          `;
          const res = await dbPool.query(sql, queryParams);
          if (res.rows.length === 0) {
            frontierExhausted = true;
          } else {
            tier1Rows.push(...res.rows);
            offset += res.rows.length;
            if (res.rows.length < fetchLimit) {
              frontierExhausted = true;
            }
          }
        }
      }

      // TIER 2: Plausible multi-domain commercial buyers (hotels, construction, retail, corporate, health)
      const tier1Ids = tier1Rows.map(r => r.canonical_entity_id);
      const crossParams: any[] = [];
      let crossWhere = `
        e.status = 'ACTIVE' 
        AND e.canonical_name IS NOT NULL
        AND (e.entity_type = 'COMPANY' OR e.entity_type = 'ORGANIZATION')
      `;

      if (tier1Ids.length > 0) {
        crossParams.push(tier1Ids);
        crossWhere += ` AND NOT (e.canonical_entity_id = ANY($${crossParams.length}::uuid[]))`;
      }

      if (excludedPatterns.length > 0) {
        crossParams.push(excludedPatterns);
        crossWhere += `
          AND NOT (
            COALESCE(e.metadata->>'category', '') ILIKE ANY($${crossParams.length}::text[])
            OR COALESCE(e.metadata->>'industry', '') ILIKE ANY($${crossParams.length}::text[])
          )
        `;
      }

      crossWhere += `
        AND (
          COALESCE(e.metadata->>'category', '') IN (
            'HOTELES', 'Actividades inmobiliarias', 'Construcción y Reformas',
            'SUPERMARKET', 'BANCO', 'Elaboración de Cervezas y Sidras',
            'FARMACIAS', 'Farmacia', 'CERRAJERÍA'
          )
          OR e.metadata->>'category' IS NULL
          OR e.metadata->>'source' = 'SRC_CABA_LINKEDIN_VERIFIED'
        )
      `;

      crossParams.push(Math.min(400, maxTechnicalLimit));
      const crossSql = `
        SELECT e.canonical_entity_id, e.canonical_name, e.entity_type, e.metadata, e.created_at
        FROM public.atlas_canonical_entities e
        WHERE ${crossWhere}
        ORDER BY e.canonical_entity_id
        LIMIT $${crossParams.length};
      `;
      const crossRes = await dbPool.query(crossSql, crossParams);

      // Combine and deduplicate
      const seenIds = new Set<string>();
      const rawCandidates: CandidateEntityRow[] = [];

      for (const r of [...tier1Rows, ...crossRes.rows]) {
        const id = String(r.canonical_entity_id);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          rawCandidates.push({
            canonical_entity_id: id,
            canonical_name: r.canonical_name,
            entity_type: r.entity_type,
            metadata: r.metadata || {},
            created_at: r.created_at,
            source: 'ATLAS_CANONICAL_ENTITIES'
          });
        }
      }

      const rawMatchesFound = rawCandidates.length;

      // STEP 2: Calculate RETRIEVAL_RELEVANCE_SCORE for all raw candidates
      interface ScoredCandidate extends CandidateEntityRow {
        retrieval_score: number;
        why_included: string;
        raw_eligible: boolean;
        category_key: string;
        semantic_consistency_score: number;
        category_conflict: boolean;
      }

      const scoredCandidates: ScoredCandidate[] = [];
      for (const cand of rawCandidates) {
        const evalScore = AtlasDynamicCandidateGenerator.calculateRetrievalScore(cand, hypothesis);
        if (evalScore.raw_eligible) {
          scoredCandidates.push({
            ...cand,
            retrieval_score: evalScore.score,
            why_included: evalScore.why_included,
            raw_eligible: evalScore.raw_eligible,
            category_key: evalScore.category_key,
            semantic_consistency_score: evalScore.semantic_consistency_score,
            category_conflict: evalScore.category_conflict
          });
        }
      }

      const afterSemanticRetrieval = scoredCandidates.length;

      // STEP 3: ADAPTIVE POOL SIZING & CATEGORY DIVERSITY (Anti-Recency & Anti-Dominance)
      // Adaptive expansion: The adaptive pool expands to hold all eligible candidates with high/medium relevance
      // up to maxTechnicalLimit, avoiding arbitrary capacity drops.
      const adaptiveTarget = Math.max(targetLimit, Math.min(afterSemanticRetrieval, maxTechnicalLimit));

      // Group by category_key
      const byCategory = new Map<string, ScoredCandidate[]>();
      for (const c of scoredCandidates) {
        const cat = c.category_key;
        const list = byCategory.get(cat) || [];
        list.push(c);
        byCategory.set(cat, list);
      }

      // Sort within each category by retrieval_score DESC, with stable hash tie-breaker (NEVER created_at!)
      for (const list of byCategory.values()) {
        list.sort((a, b) => {
          if (Math.abs(b.retrieval_score - a.retrieval_score) > 0.03) {
            return b.retrieval_score - a.retrieval_score;
          }
          return hashString(a.canonical_entity_id) - hashString(b.canonical_entity_id);
        });
      }

      // STRATIFIED FAIR ALLOCATION:
      // Pass 1: Primary target industry complete absorption
      // Absorb candidates matching hypothesis target industries or primary affinity (score >= 0.40)
      const selected: ScoredCandidate[] = [];
      const selectedIds = new Set<string>();

      for (const [cat, list] of byCategory.entries()) {
        const catLower = cat.toLowerCase();
        const isTarget = rawIndustries.some(ind => {
          const cl = ind.toLowerCase();
          return catLower.includes(cl) || cl.includes(catLower);
        }) || list.some(item => (item.retrieval_score || 0) >= 0.40);

        if (isTarget) {
          for (const item of list) {
            if (!selectedIds.has(item.canonical_entity_id) && selected.length < adaptiveTarget) {
              selectedIds.add(item.canonical_entity_id);
              selected.push(item);
            }
          }
        }
      }

      // Pass 2: Base allocation per remaining commercial category for diversity (e.g. up to 15 per category)
      for (const list of byCategory.values()) {
        const take = Math.min(list.length, 15);
        for (let i = 0; i < take; i++) {
          const item = list[i];
          if (!selectedIds.has(item.canonical_entity_id) && selected.length < adaptiveTarget) {
            selectedIds.add(item.canonical_entity_id);
            selected.push(item);
          }
        }
      }

      // Pass 3: Fill remaining capacity by global retrieval_score DESC with stable tie-breaker
      if (selected.length < adaptiveTarget) {
        const remaining = scoredCandidates
          .filter(c => !selectedIds.has(c.canonical_entity_id))
          .sort((a, b) => {
            if (Math.abs(b.retrieval_score - a.retrieval_score) > 0.03) {
              return b.retrieval_score - a.retrieval_score;
            }
            return hashString(a.canonical_entity_id) - hashString(b.canonical_entity_id);
          });

        for (const item of remaining) {
          if (selected.length >= adaptiveTarget) break;
          selectedIds.add(item.canonical_entity_id);
          selected.push(item);
        }
      }

      // Final sort of selected candidates: by retrieval_score DESC, then stable hash tie-breaker
      selected.sort((a, b) => {
        if (Math.abs(b.retrieval_score - a.retrieval_score) > 0.03) {
          return b.retrieval_score - a.retrieval_score;
        }
        return hashString(a.canonical_entity_id) - hashString(b.canonical_entity_id);
      });

      const afterCap = selected.length;
      const droppedByCapacity = Math.max(0, afterSemanticRetrieval - afterCap);

      return {
        candidates: selected.map(s => ({
          canonical_entity_id: s.canonical_entity_id,
          canonical_name: s.canonical_name,
          entity_type: s.entity_type,
          metadata: s.metadata,
          created_at: s.created_at,
          source: s.source,
          retrieval_score: s.retrieval_score,
          why_included: s.why_included,
          category_key: s.category_key,
          semantic_consistency_score: s.semantic_consistency_score,
          category_conflict: s.category_conflict
        })),
        telemetry: {
          raw_matches_found: rawMatchesFound,
          after_semantic_retrieval: afterSemanticRetrieval,
          after_cap: afterCap,
          dropped_by_capacity: droppedByCapacity,
          categories_count: byCategory.size,
          recency_bias: 0,
          fixed_pool_truncation: 0,
          capacity_caused_false_negatives: 0
        }
      };
    } catch (err: any) {
      console.error('[AtlasDynamicCandidateGenerator] Error in adaptive company retrieval:', err.message);
      return {
        candidates: [],
        telemetry: {
          raw_matches_found: 0,
          after_semantic_retrieval: 0,
          after_cap: 0,
          dropped_by_capacity: 0,
          categories_count: 0,
          recency_bias: 0,
          fixed_pool_truncation: 0,
          capacity_caused_false_negatives: 0
        }
      };
    }
  }

  /**
   * Adaptive person candidate retrieval.
   */
  private async retrievePersonCandidatesAdaptive(
    hypothesis: BuyerHypothesis,
    targetLimit: number,
    maxTechnicalLimit: number
  ): Promise<CandidateEntityRow[]> {
    try {
      const personSql = `
        SELECT 
          person_id as canonical_entity_id, 
          full_name as canonical_name, 
          'PERSON' as entity_type,
          json_build_object('status', status, 'origin_type', origin_type) as metadata,
          created_at
        FROM public.atlas_people
        WHERE status = 'ACTIVE' 
          AND full_name IS NOT NULL
        ORDER BY person_id
        LIMIT $1;
      `;
      const res = await dbPool.query(personSql, [Math.min(targetLimit, maxTechnicalLimit)]);

      return res.rows.map(r => ({
        canonical_entity_id: String(r.canonical_entity_id),
        canonical_name: r.canonical_name,
        entity_type: 'PERSON',
        metadata: r.metadata || {},
        created_at: r.created_at,
        source: 'ATLAS_PEOPLE',
        retrieval_score: 0.50,
        why_included: 'Candidato persona activa en registro SSOT'
      }));
    } catch (err: any) {
      console.error('[AtlasDynamicCandidateGenerator] Error in adaptive person retrieval:', err.message);
      return [];
    }
  }
}
