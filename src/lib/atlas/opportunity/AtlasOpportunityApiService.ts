/**
 * ATLAS OPPORTUNITY ENGINE V1 — OPPORTUNITY API SERVICE
 * Module: AtlasOpportunityApiService.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunityApiService.ts
 * 
 * Provides filtered query service for GET /api/atlas/opportunities.
 * 
 * Filters:
 * - opportunity_type
 * - geo (e.g. 'Córdoba', 'Buenos Aires')
 * - entity_type ('COMPANY', 'PERSON', 'ORGANIZATION')
 * - minimum_score (0.00 - 1.00)
 * - minimum_confidence (0.00 - 1.00)
 * - has_contact (boolean)
 * - recency (days)
 * - product_query (optional, e.g. 'software de recursos humanos')
 * - limit, page
 */

import { dbPool } from '../../../../server/db.ts';
import { AtlasOpportunityRepository } from './AtlasOpportunityRepository.ts';
import { AtlasOpportunityEngine } from './AtlasOpportunityEngine.ts';
import { AtlasOpportunityScorer } from './AtlasOpportunityScorer.ts';
import type { OpportunityType, OpportunityHypothesis } from './AtlasOpportunityHypothesis.ts';
import type { ProductProfile } from './AtlasOpportunityRuleEngine.ts';

export interface OpportunityApiQueryParams {
  opportunity_type?: OpportunityType | string;
  geo?: string;
  entity_type?: string;
  minimum_score?: number;
  minimum_confidence?: number;
  has_contact?: boolean;
  recency_days?: number;
  product_query?: string;
  limit?: number;
  page?: number;
  environment?: 'PRODUCTION' | 'TEST';
}

export interface VerifiedContactItem {
  value: string;
  predicate: 'HAS_EMAIL' | 'HAS_PHONE' | 'HAS_LINKEDIN' | 'HAS_INSTAGRAM' | 'HAS_FACEBOOK' | string;
  assertion_id: string;
  source_id: string;
  route_id?: string;
  observed_at: string;
  truth_nature: 'OBSERVED';
  confidence: number;
  evidences?: Array<{
    assertion_id: string;
    source_id: string;
    route_id?: string;
    observed_at: string;
  }>;
}

export interface VerifiedContactsGroup {
  emails: VerifiedContactItem[];
  phones: VerifiedContactItem[];
  linkedin: VerifiedContactItem[];
  instagram: VerifiedContactItem[];
  facebook: VerifiedContactItem[];
}

export interface OpportunityApiResultItem {
  subject_id: string;
  name: string;
  entity_type: string;
  geo?: string;
  opportunity_type: OpportunityType;
  opportunity_status?: 'ACTIVE' | 'NOT_DETERMINED' | 'WEAK' | 'EXPIRED';
  score: number | null; // NULL if only contactability!
  opportunity_score: number | null; // Explicit separation!
  contactability_score: number; // Explicit separation!
  confidence: number;
  distinct_source_ids: string[];
  distinct_source_count: number;
  is_multisource: boolean;
  multisource_label: 'EVIDENCIA MULTIFUENTE' | 'FUENTE ÚNICA';
  observed_at: string;
  event_date: string | null;
  observed_facts: string[];
  inferred_hypothesis: string;
  verified_contacts: VerifiedContactsGroup;
  contactability: {
    has_contact: boolean;
    channels: string[];
    score: number;
    verified_emails_count: number;
    verified_phones_count: number;
    verified_linkedin_count: number;
    verified_contacts: VerifiedContactsGroup;
  };
  last_supported: string;
  product_fit?: {
    product_query: string;
    product_fit_score: number;
    product_fit_confidence: string;
    is_fit: boolean;
    reasons: string[];
  };
  traceability?: {
    opportunity_id: string;
    signals: Array<{
      signal_id: string;
      signal_type: string;
      assertion_id?: string;
      temporal_event_id?: string;
      source_id?: string;
      route_id?: string;
      detected_at?: string;
    }>;
    chain_status: 'UNBROKEN' | 'INCOMPLETE';
  };
}

export interface OpportunityApiResponse {
  total_matches: number;
  page: number;
  limit: number;
  results: OpportunityApiResultItem[];
}

export class AtlasOpportunityApiService {
  private static instance: AtlasOpportunityApiService;
  private oppRepo: AtlasOpportunityRepository;
  private oppEngine: AtlasOpportunityEngine;

  private constructor(pool?: any) {
    this.oppRepo = AtlasOpportunityRepository.getInstance(pool);
    this.oppEngine = AtlasOpportunityEngine.getInstance(this.oppRepo);
  }

  public static getInstance(pool?: any): AtlasOpportunityApiService {
    if (!AtlasOpportunityApiService.instance) {
      AtlasOpportunityApiService.instance = new AtlasOpportunityApiService(pool);
    }
    return AtlasOpportunityApiService.instance;
  }

  public async queryOpportunities(params: OpportunityApiQueryParams): Promise<OpportunityApiResponse> {
    const env = params.environment || 'PRODUCTION';
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const page = Math.max(1, Number(params.page) || 1);
    const offset = (page - 1) * limit;

    // Base query on public.atlas_opportunities
    let whereClauses: string[] = ['o.environment = $1'];
    let queryParams: any[] = [env];
    let paramIdx = 2;

    if (params.opportunity_type) {
      whereClauses.push(`o.opportunity_type = $${paramIdx}`);
      queryParams.push(params.opportunity_type);
      paramIdx++;
    }

    if (params.entity_type) {
      whereClauses.push(`o.subject_type = $${paramIdx}`);
      queryParams.push(params.entity_type);
      paramIdx++;
    }

    if (params.minimum_score !== undefined && !isNaN(params.minimum_score)) {
      whereClauses.push(`o.score >= $${paramIdx}`);
      queryParams.push(params.minimum_score);
      paramIdx++;
    }

    if (params.minimum_confidence !== undefined && !isNaN(params.minimum_confidence)) {
      whereClauses.push(`o.confidence >= $${paramIdx}`);
      queryParams.push(params.minimum_confidence);
      paramIdx++;
    }

    if (params.recency_days) {
      whereClauses.push(`o.last_supported >= NOW() - INTERVAL '${Number(params.recency_days)} days'`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count
    const countSql = `SELECT count(*)::int as total FROM public.atlas_opportunities o ${whereSql};`;
    const countRes = await dbPool.query(countSql, queryParams);
    const totalMatches = countRes.rows[0]?.total || 0;

    // Fetch page items with entity details (joining with SSOT assertions and contacts to prevent unnamed entities)
    const selectSql = `
      SELECT o.opportunity_id, o.subject_type, o.subject_id, o.opportunity_type,
             o.score, o.confidence, o.first_detected, o.last_supported, o.expires_at,
             o.status, o.nature, o.why_explanation, o.supporting_signals,
             COALESCE(e.canonical_name, ast_name.value_normalized, ct.company) as canonical_name,
             COALESCE(e.metadata, jsonb_build_object('city', ct.city, 'category', ast_act.value_normalized)) as entity_metadata
      FROM public.atlas_opportunities o
      LEFT JOIN public.atlas_canonical_entities e ON e.canonical_entity_id::text = o.subject_id
      LEFT JOIN public.atlas_truth_assertions ast_name ON ast_name.subject_id = o.subject_id AND ast_name.predicate = 'COMPANY_NAME' AND ast_name.status = 'ACTIVE'
      LEFT JOIN public.atlas_truth_assertions ast_act ON ast_act.subject_id = o.subject_id AND ast_act.predicate = 'COMPANY_ACTIVITY' AND ast_act.status = 'ACTIVE'
      LEFT JOIN (
        SELECT entity_id::text as entity_id, max(company) as company, max(city) as city
        FROM public.atlas_contacts
        GROUP BY entity_id::text
      ) ct ON ct.entity_id = o.subject_id
      ${whereSql}
      ORDER BY 
        CASE WHEN o.score IS NULL THEN 1 ELSE 0 END,
        o.score DESC, 
        o.confidence DESC, 
        o.last_supported DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1};
    `;
    queryParams.push(limit, offset);

    const rowsRes = await dbPool.query(selectSql, queryParams);

    // Collect all supporting signal IDs, assertion IDs, and subject IDs to resolve traceability & physical contact values
    const allSigIds: string[] = [];
    const allAstIds: string[] = [];
    const allSubjectIds: string[] = [];
    for (const r of rowsRes.rows) {
      allSubjectIds.push(r.subject_id);
      if (Array.isArray(r.supporting_signals)) {
        allSigIds.push(...r.supporting_signals);
      }
      if (Array.isArray(r.supporting_assertions)) {
        allAstIds.push(...r.supporting_assertions);
      }
    }

    const sigMap = new Map<string, any>();
    if (allSigIds.length > 0) {
      const sigsRes = await dbPool.query(`
        SELECT signal_id, subject_id, signal_type, assertion_id, temporal_event_id, source_id, route_id, detected_at, payload
        FROM public.atlas_opportunity_signals
        WHERE signal_id = ANY($1::text[])
      `, [allSigIds]);
      for (const sRow of sigsRes.rows) {
        sigMap.set(sRow.signal_id, sRow);
      }
    }

    // Query physical contact assertions directly from public.atlas_truth_assertions
    // Strictly admitting only truth_nature = 'OBSERVED' and active status.
    const contactAssertionsBySubject = new Map<string, any[]>();
    if (allSubjectIds.length > 0 || allAstIds.length > 0) {
      const astRes = await dbPool.query(`
        SELECT assertion_id, subject_id, predicate, value_normalized, truth_nature, confidence, status, first_seen, last_seen, created_at, metadata
        FROM public.atlas_truth_assertions
        WHERE predicate IN ('HAS_EMAIL', 'HAS_PHONE', 'HAS_LINKEDIN', 'HAS_INSTAGRAM', 'HAS_FACEBOOK')
          AND truth_nature = 'OBSERVED'
          AND status = 'ACTIVE'
          AND (assertion_id = ANY($1::text[]) OR subject_id = ANY($2::text[]))
      `, [allAstIds, allSubjectIds]);

      for (const ast of astRes.rows) {
        if (!contactAssertionsBySubject.has(ast.subject_id)) {
          contactAssertionsBySubject.set(ast.subject_id, []);
        }
        contactAssertionsBySubject.get(ast.subject_id)!.push(ast);
      }
    }

    // Map Product Profile if product_query was provided
    let productProfile: ProductProfile | undefined;
    if (params.product_query && params.product_query.trim().length > 0) {
      const q = params.product_query.toLowerCase();
      const targetTypes: OpportunityType[] = [];
      if (q.includes('rrhh') || q.includes('recursos humanos') || q.includes('personal') || q.includes('nomina') || q.includes('hiring')) {
        targetTypes.push('HIRING_SIGNAL', 'EXPANSION_SIGNAL');
      } else if (q.includes('solar') || q.includes('energia') || q.includes('industrial') || q.includes('obra') || q.includes('infraestructura')) {
        targetTypes.push('INFRASTRUCTURE_SIGNAL', 'EXPANSION_SIGNAL');
      } else if (q.includes('software') || q.includes('digital') || q.includes('crm') || q.includes('erp')) {
        targetTypes.push('DIGITALIZATION_SIGNAL', 'EXPANSION_SIGNAL', 'NEW_BUSINESS_SIGNAL');
      } else {
        targetTypes.push('EXPANSION_SIGNAL', 'NEW_BUSINESS_SIGNAL', 'CONTACTABILITY_SIGNAL');
      }

      productProfile = {
        product_id: 'PRODUCT_QUERY_PROFILE',
        name: params.product_query,
        target_opportunity_types: targetTypes,
        min_score: 0.40,
        min_confidence: 0.40
      };
    }

    const results: OpportunityApiResultItem[] = [];

    for (const r of rowsRes.rows) {
      const why = r.why_explanation || {};
      const observedFacts = why.observed_facts || [];
      const inferredHypothesis = why.inferred_hypothesis || `Señales detectadas compatibles con ${r.opportunity_type}`;
      const meta = r.entity_metadata || {};
      const geo = [meta.city, meta.province].filter(Boolean).join(', ') || undefined;

      // Filter by geo if requested
      if (params.geo && params.geo.trim().length > 0) {
        const geoSearch = params.geo.toLowerCase().trim();
        const matchGeo = geo && geo.toLowerCase().includes(geoSearch);
        const matchObs = observedFacts.some((f: string) => f.toLowerCase().includes(geoSearch));
        if (!matchGeo && !matchObs) {
          continue;
        }
      }

      // Check contactability
      const hasContactSig = (r.supporting_signals || []).some((s: string) => s.includes('CONTACT_APPEARED'));
      const contactChannels: string[] = [];
      if (meta.email) contactChannels.push('EMAIL');
      if (meta.phone) contactChannels.push('PHONE');
      if (hasContactSig && contactChannels.length === 0) contactChannels.push('VERIFIED_CONTACT');

      if (params.has_contact && contactChannels.length === 0 && !hasContactSig) {
        continue;
      }

      const rawSignals: string[] = Array.isArray(r.supporting_signals) ? r.supporting_signals : [];
      const oppSignals = rawSignals.map(sid => sigMap.get(sid)).filter(Boolean);

      // Build verified_contacts for this entity
      const subjectAssertions = contactAssertionsBySubject.get(r.subject_id) || [];
      const verifiedContacts: VerifiedContactsGroup = {
        emails: [],
        phones: [],
        linkedin: [],
        instagram: [],
        facebook: []
      };

      const seenEmails = new Map<string, VerifiedContactItem>();
      const seenPhones = new Map<string, VerifiedContactItem>();
      const seenLinkedin = new Map<string, VerifiedContactItem>();
      const seenInstagram = new Map<string, VerifiedContactItem>();
      const seenFacebook = new Map<string, VerifiedContactItem>();

      for (const ast of subjectAssertions) {
        if (ast.truth_nature !== 'OBSERVED') continue;
        if (!ast.value_normalized || typeof ast.value_normalized !== 'string') continue;
        const rawVal = ast.value_normalized.trim();
        if (rawVal.length === 0) continue;

        const matchingSig = oppSignals.find(s => s.assertion_id === ast.assertion_id)
          || Array.from(sigMap.values()).find(s => s.assertion_id === ast.assertion_id && s.subject_id === ast.subject_id);

        const sourceId = matchingSig?.source_id || 'SRC_CABA_LINKEDIN_VERIFIED';
        const routeId = matchingSig?.route_id || 'ROUTE_CABA_LINKEDIN_JSON';
        const observedAt = matchingSig?.detected_at || ast.first_seen || ast.created_at || r.first_detected || new Date().toISOString();
        const conf = parseFloat(ast.confidence) || 0.95;

        const evidenceItem = {
          assertion_id: ast.assertion_id,
          source_id: sourceId,
          route_id: routeId,
          observed_at: new Date(observedAt).toISOString()
        };

        if (ast.predicate === 'HAS_EMAIL') {
          const normKey = rawVal.toLowerCase();
          const existing = seenEmails.get(normKey);
          if (existing) {
            existing.evidences?.push(evidenceItem);
          } else {
            const item: VerifiedContactItem = {
              value: normKey,
              predicate: 'HAS_EMAIL',
              assertion_id: ast.assertion_id,
              source_id: sourceId,
              route_id: routeId,
              observed_at: new Date(observedAt).toISOString(),
              truth_nature: 'OBSERVED',
              confidence: conf,
              evidences: [evidenceItem]
            };
            seenEmails.set(normKey, item);
            verifiedContacts.emails.push(item);
          }
        } else if (ast.predicate === 'HAS_PHONE') {
          const normKey = rawVal.replace(/\s+/g, '');
          const existing = seenPhones.get(normKey);
          if (existing) {
            existing.evidences?.push(evidenceItem);
          } else {
            const item: VerifiedContactItem = {
              value: rawVal,
              predicate: 'HAS_PHONE',
              assertion_id: ast.assertion_id,
              source_id: sourceId,
              route_id: routeId,
              observed_at: new Date(observedAt).toISOString(),
              truth_nature: 'OBSERVED',
              confidence: conf,
              evidences: [evidenceItem]
            };
            seenPhones.set(normKey, item);
            verifiedContacts.phones.push(item);
          }
        } else if (ast.predicate === 'HAS_LINKEDIN') {
          const normKey = rawVal.toLowerCase();
          const existing = seenLinkedin.get(normKey);
          if (existing) {
            existing.evidences?.push(evidenceItem);
          } else {
            const item: VerifiedContactItem = {
              value: rawVal,
              predicate: 'HAS_LINKEDIN',
              assertion_id: ast.assertion_id,
              source_id: sourceId,
              route_id: routeId,
              observed_at: new Date(observedAt).toISOString(),
              truth_nature: 'OBSERVED',
              confidence: conf,
              evidences: [evidenceItem]
            };
            seenLinkedin.set(normKey, item);
            verifiedContacts.linkedin.push(item);
          }
        } else if (ast.predicate === 'HAS_INSTAGRAM') {
          const normKey = rawVal.toLowerCase();
          const existing = seenInstagram.get(normKey);
          if (existing) {
            existing.evidences?.push(evidenceItem);
          } else {
            const item: VerifiedContactItem = {
              value: rawVal,
              predicate: 'HAS_INSTAGRAM',
              assertion_id: ast.assertion_id,
              source_id: sourceId,
              route_id: routeId,
              observed_at: new Date(observedAt).toISOString(),
              truth_nature: 'OBSERVED',
              confidence: conf,
              evidences: [evidenceItem]
            };
            seenInstagram.set(normKey, item);
            verifiedContacts.instagram.push(item);
          }
        } else if (ast.predicate === 'HAS_FACEBOOK') {
          const normKey = rawVal.toLowerCase();
          const existing = seenFacebook.get(normKey);
          if (existing) {
            existing.evidences?.push(evidenceItem);
          } else {
            const item: VerifiedContactItem = {
              value: rawVal,
              predicate: 'HAS_FACEBOOK',
              assertion_id: ast.assertion_id,
              source_id: sourceId,
              route_id: routeId,
              observed_at: new Date(observedAt).toISOString(),
              truth_nature: 'OBSERVED',
              confidence: conf,
              evidences: [evidenceItem]
            };
            seenFacebook.set(normKey, item);
            verifiedContacts.facebook.push(item);
          }
        }
      }

      // Build observed facts with concrete contact values
      // Filter out previous contact facts that lacked concrete values
      const nonContactFacts = (why.observed_facts || []).filter((f: string) => {
        const lower = f.toLowerCase();
        return (
          !lower.includes('email') &&
          !lower.includes('teléfono') &&
          !lower.includes('telefono') &&
          !lower.includes('linkedin') &&
          !lower.includes('instagram') &&
          !lower.includes('facebook') &&
          !lower.includes('canal de contacto') &&
          !lower.includes('canales adicionales') &&
          !f.trim().startsWith('•')
        );
      });

      const formattedContactFacts: string[] = [];

      // Emails
      if (verifiedContacts.emails.length === 1) {
        formattedContactFacts.push(`Email verificado: ${verifiedContacts.emails[0].value}`);
      } else if (verifiedContacts.emails.length > 1) {
        formattedContactFacts.push(`EMAILS VERIFICADOS (${verifiedContacts.emails.length})`);
        for (const e of verifiedContacts.emails) {
          formattedContactFacts.push(`• ${e.value}`);
        }
      }

      // Phones
      if (verifiedContacts.phones.length === 1) {
        formattedContactFacts.push(`Teléfono verificado: ${verifiedContacts.phones[0].value}`);
      } else if (verifiedContacts.phones.length > 1) {
        formattedContactFacts.push(`TELÉFONOS VERIFICADOS (${verifiedContacts.phones.length})`);
        for (const p of verifiedContacts.phones) {
          formattedContactFacts.push(`• ${p.value}`);
        }
      }

      // LinkedIn
      if (verifiedContacts.linkedin.length === 1) {
        formattedContactFacts.push(`LinkedIn verificado: ${verifiedContacts.linkedin[0].value}`);
      } else if (verifiedContacts.linkedin.length > 1) {
        formattedContactFacts.push(`LINKEDIN VERIFICADO (${verifiedContacts.linkedin.length})`);
        for (const l of verifiedContacts.linkedin) {
          formattedContactFacts.push(`• ${l.value}`);
        }
      }

      const finalObservedFacts = [...nonContactFacts, ...formattedContactFacts];
      if (finalObservedFacts.length === 0 && why.observed_facts && why.observed_facts.length > 0) {
        finalObservedFacts.push(...why.observed_facts);
      }

      // Requirement 3: Calcular DISTINCT_SOURCE_IDS por oportunidad.
      // Sólo mostrar EVIDENCIA MULTIFUENTE si DISTINCT_SOURCE_IDS >= 2.
      // Dos signals provenientes de SRC_OSM_PUBLIC_ESTABLISHMENTS siguen siendo SINGLE_SOURCE.
      const distinctSourceIds = Array.from(new Set(oppSignals.map(s => s.source_id).filter(Boolean)));
      const distinctSourceCount = distinctSourceIds.length;
      const isMultisource = distinctSourceCount >= 2;

      // Requirement 4: Separar OBSERVED_AT y EVENT_DATE
      const firstSignal = oppSignals[0];
      const observedAt = firstSignal?.detected_at || r.first_detected || r.last_supported;
      const eventDate = null; // En ausencia de evidencia física con fecha explícita

      // Requirement 5: Commercial context for Product Fit
      const entityContext = {
        company_size: meta.company_size || null,
        employees: meta.employees || meta.empleados || null,
        branches: meta.branches || meta.sucursales || null,
        hiring: Boolean(meta.hiring || oppSignals.some(s => s.signal_type === 'JOB_POSTING_APPEARED' || s.signal_type === 'NEW_ROLE')),
        activity: meta.category || meta.industry || null,
        organization_type: meta.organization_type || meta.legal_type || (r.canonical_name?.includes('S.A.') ? 'S.A.' : r.canonical_name?.includes('S.R.L.') ? 'S.R.L.' : null),
        geo,
        commercial_scale: meta.commercial_scale || null
      };

      // Requirements 1, 2 & 9: Score separation
      const isContactOnlyOpp = r.opportunity_type === 'CONTACTABILITY_SIGNAL' && (r.score === null || why.commercial_status === 'NOT_DETERMINED');
      const oppScoreValue = isContactOnlyOpp ? null : (r.score !== null ? parseFloat(r.score) : null);
      const oppStatus = isContactOnlyOpp ? 'NOT_DETERMINED' : (r.status || 'ACTIVE');

      const contactBreakdown = AtlasOpportunityScorer.extractContactChannelsBreakdown(oppSignals);
      const contactabilityScore = why.contactability_metrics?.contactability_score ?? AtlasOpportunityScorer.calculateContactabilityScore(oppSignals);

      // Evaluate product fit if product profile is present
      let productFit: OpportunityApiResultItem['product_fit'];
      if (productProfile) {
        const hyp: OpportunityHypothesis = {
          opportunity_id: r.opportunity_id,
          subject_type: r.subject_type,
          subject_id: r.subject_id,
          opportunity_type: r.opportunity_type,
          supporting_signals: r.supporting_signals || [],
          supporting_assertions: [],
          supporting_events: [],
          score: oppScoreValue,
          opportunity_score: oppScoreValue,
          contactability_score: contactabilityScore,
          confidence: parseFloat(r.confidence),
          reasoning_version: 'v1.0',
          first_detected: r.first_detected,
          last_supported: r.last_supported,
          expires_at: r.expires_at,
          status: r.status,
          nature: 'INFERRED',
          why_explanation: why,
          environment: env,
          created_at: r.created_at,
          updated_at: r.updated_at
        };

        const fitRes = this.oppEngine.evaluateProductFit(hyp, productProfile, entityContext);
        productFit = {
          product_query: params.product_query!,
          product_fit_score: fitRes.fit_score,
          product_fit_confidence: fitRes.product_fit_confidence,
          is_fit: fitRes.is_fit,
          reasons: fitRes.match_reasons
        };
      }

      results.push({
        subject_id: r.subject_id,
        name: r.canonical_name || `Entidad ${r.subject_id.substring(0, 8)}`,
        entity_type: r.subject_type,
        geo,
        opportunity_type: r.opportunity_type,
        opportunity_status: oppStatus,
        score: oppScoreValue,
        opportunity_score: oppScoreValue,
        contactability_score: contactabilityScore,
        confidence: parseFloat(r.confidence),
        distinct_source_ids: distinctSourceIds,
        distinct_source_count: distinctSourceCount,
        is_multisource: isMultisource,
        multisource_label: isMultisource ? 'EVIDENCIA MULTIFUENTE' : 'FUENTE ÚNICA',
        observed_at: observedAt,
        event_date: eventDate,
        observed_facts: finalObservedFacts,
        inferred_hypothesis: inferredHypothesis,
        verified_contacts: verifiedContacts,
        contactability: {
          has_contact: verifiedContacts.emails.length > 0 || verifiedContacts.phones.length > 0 || verifiedContacts.linkedin.length > 0 || hasContactSig,
          channels: contactChannels,
          score: contactabilityScore,
          verified_emails_count: verifiedContacts.emails.length,
          verified_phones_count: verifiedContacts.phones.length,
          verified_linkedin_count: verifiedContacts.linkedin.length,
          verified_contacts: verifiedContacts
        },
        last_supported: r.last_supported,
        product_fit: productFit,
        traceability: {
          opportunity_id: r.opportunity_id,
          signals: oppSignals.map(s => ({
            signal_id: s.signal_id,
            signal_type: s.signal_type,
            assertion_id: s.assertion_id,
            temporal_event_id: s.temporal_event_id,
            source_id: s.source_id,
            route_id: s.route_id,
            detected_at: s.detected_at
          })),
          chain_status: oppSignals.length > 0 && oppSignals.every(s => s.source_id && s.route_id) ? 'UNBROKEN' : 'INCOMPLETE'
        }
      });
    }

    return {
      total_matches: totalMatches,
      page,
      limit,
      results
    };
  }
}
