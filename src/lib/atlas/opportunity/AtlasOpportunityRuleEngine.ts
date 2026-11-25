/**
 * ATLAS OPPORTUNITY ENGINE V1
 * Module: AtlasOpportunityRuleEngine.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunityRuleEngine.ts
 * 
 * Rules Engine for synthesizing Commercial Opportunities from Verified Signals.
 * 
 * Strict Invariants:
 * - NO INVENTED CAUSALITY:
 *   Rules strictly require factual signal combinations.
 *   E.g. A new email yields CONTACTABILITY_SIGNAL, NEVER an EXPANSION_SIGNAL.
 *   ADDRESS_CHANGED + JOB_POSTING_APPEARED + NEW_ROLE yields EXPANSION_SIGNAL.
 * - EXPLAINABILITY:
 *   Produces structured WHY_THIS_OPPORTUNITY explanation separating observed facts from inferred hypothesis.
 * - PRODUCT FIT:
 *   Deterministic, transparent rules mapping opportunities to product categories without LLM hallucinations.
 */

import type { OpportunitySignal, OpportunitySignalType } from './AtlasOpportunitySignal.ts';
import {
  AtlasOpportunityHypothesisHelper,
  type OpportunityHypothesis,
  type OpportunityType,
  type WhyOpportunityExplanation
} from './AtlasOpportunityHypothesis.ts';
import { AtlasOpportunityScorer } from './AtlasOpportunityScorer.ts';

export interface EntityCommercialContext {
  company_size?: string | null;
  employees?: number | string | null;
  branches?: number | string | null;
  hiring?: boolean;
  activity?: string | null;
  organization_type?: string | null;
  geo?: string | null;
  commercial_scale?: string | null;
}

export interface ProductProfile {
  product_id: string;
  name: string;
  target_opportunity_types: OpportunityType[];
  required_signal_types?: OpportunitySignalType[];
  min_score?: number;
  min_confidence?: number;
}

export interface ProductFitResult {
  product_id: string;
  opportunity_id: string;
  fit_score: number;
  is_fit: boolean;
  product_fit_confidence: 'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE';
  match_reasons: string[];
  dimensions_evaluated: {
    company_size?: string | null;
    employees?: number | string | null;
    branches?: number | string | null;
    hiring?: boolean;
    activity?: string | null;
    organization_type?: string | null;
    geo?: string | null;
    commercial_scale?: string | null;
    evidence_count: number;
  };
  nature: 'INFERRED';
}

export class AtlasOpportunityRuleEngine {
  /**
   * Synthesizes opportunities from a collection of signals for an entity.
   */
  public static synthesizeOpportunities(
    subjectType: 'PERSON' | 'COMPANY' | 'ORGANIZATION',
    subjectId: string,
    signals: OpportunitySignal[],
    environment: 'TEST' | 'PRODUCTION' = 'PRODUCTION'
  ): OpportunityHypothesis[] {
    if (signals.length === 0) return [];

    const hypotheses: OpportunityHypothesis[] = [];
    const signalTypes = new Set<OpportunitySignalType>(signals.map(s => s.signal_type));
    const now = new Date().toISOString();

    const hasContact = signalTypes.has('CONTACT_APPEARED');
    const hasCompanyOpened = signalTypes.has('COMPANY_OPENED') || signalTypes.has('NEW_REGISTRATION');
    const hasAddressChange = signalTypes.has('ADDRESS_CHANGED') || signalTypes.has('ADDRESS_APPEARED') || signalTypes.has('NEW_BRANCH');
    const hasHiring = signalTypes.has('JOB_POSTING_APPEARED') || signalTypes.has('NEW_ROLE');
    const hasProcurement = signalTypes.has('PUBLIC_TENDER_APPEARED') || signalTypes.has('PUBLIC_CONTRACT_APPEARED');

    // Temporal semantics and source distinctness analysis
    const hasRealTransition = signals.some(s => s.temporal_semantics === 'REAL_TRANSITION');
    const hasExplicitHistoricalEvent = signals.some(s => s.temporal_semantics === 'EXPLICIT_HISTORICAL_EVENT');
    const distinctSources = new Set(signals.map(s => s.source_id).filter(Boolean));
    const isStrongMultiSourceCombination = (hasAddressChange && hasHiring && distinctSources.size >= 2) ||
                                            (signalTypes.has('NEW_BRANCH') && distinctSources.size >= 2);

    // RULE 1: EXPANSION_SIGNAL
    // STRICT INVARIANT:
    // NO crear EXPANSION_SIGNAL solamente por ADDRESS_APPEARED + ACTIVITY_APPEARED si ambos son FIRST_OBSERVED.
    // Exigir al menos: 1 REAL_TRANSITION o 1 EXPLICIT_HISTORICAL_EVENT reciente o combinación fuerte multi-fuente.
    // FIRST_OBSERVED puede aportar contexto, pero no demostrar expansión.
    const isOnlyAddressAndActivityFirstObserved = signals.every(s =>
      ['ADDRESS_APPEARED', 'ACTIVITY_APPEARED'].includes(s.signal_type) &&
      s.temporal_semantics === 'FIRST_OBSERVED'
    );

    const hasValidExpansionJustification = hasRealTransition || hasExplicitHistoricalEvent || isStrongMultiSourceCombination;

    const isExpansionEligible = !isOnlyAddressAndActivityFirstObserved &&
      hasAddressChange &&
      hasValidExpansionJustification &&
      (hasHiring || signalTypes.has('ORGANIZATION_CHANGED') || signalTypes.has('NEW_BRANCH') || (signalTypes.has('ACTIVITY_APPEARED') && (hasRealTransition || isStrongMultiSourceCombination)));

    if (isExpansionEligible) {
      const supporting = signals.filter(s =>
        ['ADDRESS_CHANGED', 'ADDRESS_APPEARED', 'NEW_BRANCH', 'JOB_POSTING_APPEARED', 'NEW_ROLE', 'ORGANIZATION_CHANGED', 'ACTIVITY_APPEARED'].includes(s.signal_type)
      );
      const evalRes = AtlasOpportunityScorer.evaluateScore({
        signals: supporting,
        hasVerifiedContact: hasContact
      });

      const explanation = AtlasOpportunityRuleEngine.buildExplanation(
        'EXPANSION_SIGNAL',
        'Presenta señales públicas compatibles con expansión geográfica y crecimiento organizativo verificado.',
        supporting
      );

      hypotheses.push({
        opportunity_id: AtlasOpportunityHypothesisHelper.generateOpportunityId(subjectId, 'EXPANSION_SIGNAL'),
        subject_type: subjectType,
        subject_id: subjectId,
        opportunity_type: 'EXPANSION_SIGNAL',
        supporting_signals: supporting.map(s => s.signal_id),
        supporting_assertions: Array.from(new Set(supporting.map(s => s.assertion_id))),
        supporting_events: Array.from(new Set(supporting.map(s => s.temporal_event_id).filter(Boolean) as string[])),
        score: evalRes.score,
        confidence: evalRes.confidence,
        reasoning_version: 'v1.0',
        first_detected: supporting[0]?.detected_at || now,
        last_supported: supporting[supporting.length - 1]?.detected_at || now,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        nature: 'INFERRED',
        why_explanation: explanation,
        environment,
        created_at: now,
        updated_at: now
      });
    }

    // RULE 2: NEW_BUSINESS_SIGNAL
    // Triggered by company opening, new registration, or incorporation
    if (hasCompanyOpened) {
      const supporting = signals.filter(s =>
        ['COMPANY_OPENED', 'NEW_REGISTRATION', 'NEW_LICENSE', 'CONTACT_APPEARED'].includes(s.signal_type)
      );
      const evalRes = AtlasOpportunityScorer.evaluateScore({
        signals: supporting,
        hasVerifiedContact: hasContact
      });

      const explanation = AtlasOpportunityRuleEngine.buildExplanation(
        'NEW_BUSINESS_SIGNAL',
        'Presenta constitución comercial reciente o inicio de actividades registrado oficialmente.',
        supporting
      );

      hypotheses.push({
        opportunity_id: AtlasOpportunityHypothesisHelper.generateOpportunityId(subjectId, 'NEW_BUSINESS_SIGNAL'),
        subject_type: subjectType,
        subject_id: subjectId,
        opportunity_type: 'NEW_BUSINESS_SIGNAL',
        supporting_signals: supporting.map(s => s.signal_id),
        supporting_assertions: Array.from(new Set(supporting.map(s => s.assertion_id))),
        supporting_events: Array.from(new Set(supporting.map(s => s.temporal_event_id).filter(Boolean) as string[])),
        score: evalRes.score,
        confidence: evalRes.confidence,
        reasoning_version: 'v1.0',
        first_detected: supporting[0]?.detected_at || now,
        last_supported: supporting[supporting.length - 1]?.detected_at || now,
        expires_at: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        nature: 'INFERRED',
        why_explanation: explanation,
        environment,
        created_at: now,
        updated_at: now
      });
    }

    // RULE 3: CONTACTABILITY_SIGNAL
    // Triggered whenever direct contact channels (email, phone, linkedin) are discovered or refreshed
    if (hasContact) {
      const supporting = signals.filter(s => s.signal_type === 'CONTACT_APPEARED');
      const hasCommercial = AtlasOpportunityScorer.hasCommercialSignals(signals);

      // Requirements 1, 2 & 9:
      // CONTACTABILITY_SIGNAL significa únicamente: "Atlas encontró canales verificables para contactar esta entidad."
      // NO significa: "Existe una oportunidad comercial."
      // Si sólo existen contactos: OPPORTUNITY_SCORE = NULL, OPPORTUNITY_STATUS = NOT_DETERMINED.
      // CONTACT_APPEARED por sí solo NO crea Opportunity Score alto.
      let oppScore: number | null = null;
      let commercialStatus: 'ACTIVE' | 'NOT_DETERMINED' = 'NOT_DETERMINED';

      if (hasCommercial) {
        const commercialSignals = signals.filter(s => s.signal_type !== 'CONTACT_APPEARED');
        const commEval = AtlasOpportunityScorer.evaluateScore({
          signals: commercialSignals,
          hasVerifiedContact: true
        });
        oppScore = commEval.score;
        commercialStatus = 'ACTIVE';
      }

      // Requirements 3, 6 & 7: Independent Contactability Score and Confidence
      const contactabilityScore = AtlasOpportunityScorer.calculateContactabilityScore(supporting);
      const contactabilityConfidence = AtlasOpportunityScorer.calculateContactabilityConfidence(supporting);
      const breakdown = AtlasOpportunityScorer.extractContactChannelsBreakdown(supporting);

      const hypothesisText = commercialStatus === 'ACTIVE'
        ? 'Canales de contacto directos verificados con señales comerciales activas detectadas.'
        : 'Atlas encontró canales verificables para contactar esta entidad. Oportunidad comercial no determinada.';

      const explanation = AtlasOpportunityRuleEngine.buildExplanation(
        'CONTACTABILITY_SIGNAL',
        hypothesisText,
        supporting,
        {
          contactability_metrics: {
            contactability_score: contactabilityScore,
            verified_emails: breakdown.emailCount,
            verified_phones: breakdown.phoneCount,
            verified_linkedin: breakdown.linkedinCount,
            distinct_sources_count: breakdown.distinctSourceCount,
            is_multisource: breakdown.isMultisource
          },
          commercial_status: commercialStatus
        }
      );

      hypotheses.push({
        opportunity_id: AtlasOpportunityHypothesisHelper.generateOpportunityId(subjectId, 'CONTACTABILITY_SIGNAL'),
        subject_type: subjectType,
        subject_id: subjectId,
        opportunity_type: 'CONTACTABILITY_SIGNAL',
        supporting_signals: supporting.map(s => s.signal_id),
        supporting_assertions: Array.from(new Set(supporting.map(s => s.assertion_id))),
        supporting_events: Array.from(new Set(supporting.map(s => s.temporal_event_id).filter(Boolean) as string[])),
        score: oppScore, // NULL if only contactability!
        opportunity_score: oppScore,
        contactability_score: contactabilityScore,
        confidence: contactabilityConfidence,
        reasoning_version: 'v1.0',
        first_detected: supporting[0]?.detected_at || now,
        last_supported: supporting[supporting.length - 1]?.detected_at || now,
        expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        nature: 'INFERRED',
        why_explanation: explanation,
        environment,
        created_at: now,
        updated_at: now
      });
    }

    // RULE 4: HIRING_SIGNAL
    if (hasHiring && !isExpansionEligible) {
      const supporting = signals.filter(s => ['JOB_POSTING_APPEARED', 'NEW_ROLE'].includes(s.signal_type));
      const evalRes = AtlasOpportunityScorer.evaluateScore({
        signals: supporting,
        hasVerifiedContact: hasContact
      });

      const explanation = AtlasOpportunityRuleEngine.buildExplanation(
        'HIRING_SIGNAL',
        'Incorporación activa de personal o creación de nuevos roles observados públicamente.',
        supporting
      );

      hypotheses.push({
        opportunity_id: AtlasOpportunityHypothesisHelper.generateOpportunityId(subjectId, 'HIRING_SIGNAL'),
        subject_type: subjectType,
        subject_id: subjectId,
        opportunity_type: 'HIRING_SIGNAL',
        supporting_signals: supporting.map(s => s.signal_id),
        supporting_assertions: Array.from(new Set(supporting.map(s => s.assertion_id))),
        supporting_events: Array.from(new Set(supporting.map(s => s.temporal_event_id).filter(Boolean) as string[])),
        score: evalRes.score,
        confidence: evalRes.confidence,
        reasoning_version: 'v1.0',
        first_detected: supporting[0]?.detected_at || now,
        last_supported: supporting[supporting.length - 1]?.detected_at || now,
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        nature: 'INFERRED',
        why_explanation: explanation,
        environment,
        created_at: now,
        updated_at: now
      });
    }

    // RULE 5: PROCUREMENT_SIGNAL
    if (hasProcurement) {
      const supporting = signals.filter(s => ['PUBLIC_TENDER_APPEARED', 'PUBLIC_CONTRACT_APPEARED'].includes(s.signal_type));
      const evalRes = AtlasOpportunityScorer.evaluateScore({
        signals: supporting,
        hasVerifiedContact: hasContact
      });

      const explanation = AtlasOpportunityRuleEngine.buildExplanation(
        'PROCUREMENT_SIGNAL',
        'Licitaciones o contrataciones públicas adjudicadas/publicadas oficialmente.',
        supporting
      );

      hypotheses.push({
        opportunity_id: AtlasOpportunityHypothesisHelper.generateOpportunityId(subjectId, 'PROCUREMENT_SIGNAL'),
        subject_type: subjectType,
        subject_id: subjectId,
        opportunity_type: 'PROCUREMENT_SIGNAL',
        supporting_signals: supporting.map(s => s.signal_id),
        supporting_assertions: Array.from(new Set(supporting.map(s => s.assertion_id))),
        supporting_events: Array.from(new Set(supporting.map(s => s.temporal_event_id).filter(Boolean) as string[])),
        score: evalRes.score,
        confidence: evalRes.confidence,
        reasoning_version: 'v1.0',
        first_detected: supporting[0]?.detected_at || now,
        last_supported: supporting[supporting.length - 1]?.detected_at || now,
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'ACTIVE',
        nature: 'INFERRED',
        why_explanation: explanation,
        environment,
        created_at: now,
        updated_at: now
      });
    }

    return hypotheses;
  }

  /**
   * Evaluates product fit deterministically without hallucination.
   */
  public static evaluateProductFit(
    opportunity: OpportunityHypothesis,
    product: ProductProfile,
    entityContext?: EntityCommercialContext
  ): ProductFitResult {
    const isTypeMatch = product.target_opportunity_types.includes(opportunity.opportunity_type);
    const minScore = product.min_score || 0.40;
    const minConfidence = product.min_confidence || 0.40;

    // Requirement 10: CONTACTABILITY por sí sola NO alcanza para FIT POSITIVO.
    // Si la oportunidad es CONTACTABILITY_SIGNAL y no posee señales comerciales activas:
    // Retornar siempre LOW_CONFIDENCE, is_fit = false, fit_score = 0.0.
    if (opportunity.opportunity_type === 'CONTACTABILITY_SIGNAL') {
      const hasActiveCommercial = opportunity.why_explanation?.commercial_status === 'ACTIVE' ||
        (opportunity.score !== null && opportunity.score > 0);
      if (!hasActiveCommercial) {
        return {
          product_id: product.product_id,
          opportunity_id: opportunity.opportunity_id,
          fit_score: 0.0,
          is_fit: false,
          product_fit_confidence: 'LOW_CONFIDENCE',
          match_reasons: [
            'CONTACTABILIDAD por sí sola NO alcanza para FIT POSITIVO.',
            'No se detectaron señales comerciales activas (crecimiento, búsqueda laboral, infraestructura o nueva constitución).'
          ],
          dimensions_evaluated: {
            company_size: entityContext?.company_size || null,
            employees: entityContext?.employees ?? null,
            branches: entityContext?.branches ?? null,
            hiring: false,
            activity: entityContext?.activity || null,
            organization_type: entityContext?.organization_type || null,
            geo: entityContext?.geo || null,
            commercial_scale: entityContext?.commercial_scale || null,
            evidence_count: 0
          },
          nature: 'INFERRED'
        };
      }
    }

    const currentScore = opportunity.score ?? 0.0;
    const meetsThreshold = opportunity.score !== null && currentScore >= minScore && opportunity.confidence >= minConfidence;
    const matchReasons: string[] = [];

    if (isTypeMatch) {
      matchReasons.push(`Tipo de oportunidad '${opportunity.opportunity_type}' coincide con perfil del producto '${product.name}'`);
    } else {
      matchReasons.push(`Tipo de oportunidad '${opportunity.opportunity_type}' no está en el target de '${product.name}'`);
    }

    if (meetsThreshold) {
      matchReasons.push(`Umbrales superados: Score ${currentScore} >= ${minScore}, Confianza ${opportunity.confidence} >= ${minConfidence}`);
    } else {
      matchReasons.push(`Umbrales insuficientes: Score ${currentScore} o Confianza ${opportunity.confidence} por debajo del mínimo requerido`);
    }

    // Requirement 5: No considerar suficiente tipo coincide + score >= 0.4 + confidence >= 0.4.
    // Agregar evidencia disponible de: company_size, employees, branches, hiring, activity, organization_type, geo, commercial scale.
    // Si no existen datos suficientes: PRODUCT_FIT = LOW_CONFIDENCE. No presentar "Apto" únicamente por superar umbrales.
    const ctx = entityContext || {};
    let evidenceCount = 0;
    const commercialDimensions: string[] = [];

    const signalsBreakdown = opportunity.why_explanation?.signals_breakdown || [];
    const hasHiringSignal = Boolean(ctx.hiring || signalsBreakdown.some(s => s.signal_type === 'JOB_POSTING_APPEARED' || s.signal_type === 'NEW_ROLE'));
    const hasBranchSignal = Boolean(signalsBreakdown.some(s => s.signal_type === 'NEW_BRANCH'));
    const hasGeoFromSignal = Boolean(ctx.geo || signalsBreakdown.some(s => s.signal_type === 'ADDRESS_CHANGED' || s.signal_type === 'ADDRESS_APPEARED'));
    const hasActivityFromSignal = Boolean(ctx.activity || signalsBreakdown.some(s => s.signal_type === 'ACTIVITY_APPEARED'));

    if (hasActivityFromSignal) { evidenceCount++; commercialDimensions.push(`actividad: ${ctx.activity || 'declarada'}`); }
    if (hasGeoFromSignal) { evidenceCount++; commercialDimensions.push(`geo: ${ctx.geo || 'documentada'}`); }
    if (ctx.company_size) { evidenceCount++; commercialDimensions.push(`tamaño: ${ctx.company_size}`); }
    if (ctx.employees !== undefined && ctx.employees !== null && ctx.employees !== '') { evidenceCount++; commercialDimensions.push(`dotación: ${ctx.employees}`); }
    if ((ctx.branches !== undefined && ctx.branches !== null && ctx.branches !== '') || hasBranchSignal) { evidenceCount++; commercialDimensions.push(`sucursales: ${ctx.branches || 'múltiples sedes'}`); }
    if (hasHiringSignal) { evidenceCount++; commercialDimensions.push('búsqueda laboral / rol activo'); }
    if (opportunity.subject_type === 'COMPANY') { evidenceCount++; commercialDimensions.push('estructura: EMPRESA'); }
    else if (ctx.organization_type && !['UNKNOWN', 'ORGANIZATION'].includes(ctx.organization_type.toUpperCase())) { evidenceCount++; commercialDimensions.push(`tipo org: ${ctx.organization_type}`); }
    if (ctx.commercial_scale) { evidenceCount++; commercialDimensions.push(`escala: ${ctx.commercial_scale}`); }

    const hasScaleOrStructure = Boolean(
      ctx.company_size ||
      (ctx.employees !== undefined && ctx.employees !== null && ctx.employees !== '') ||
      (ctx.branches !== undefined && ctx.branches !== null && ctx.branches !== '') ||
      hasBranchSignal ||
      hasHiringSignal ||
      (ctx.organization_type && ['S.A.', 'S.R.L.', 'S.A.S.', 'COOPERATIVA', 'CORPORATION'].some(t => ctx.organization_type!.toUpperCase().includes(t))) ||
      ctx.commercial_scale
    );

    let productFitConfidence: 'HIGH' | 'MEDIUM' | 'LOW_CONFIDENCE' = 'LOW_CONFIDENCE';
    let isFit = false;

    if (isTypeMatch && meetsThreshold) {
      if (!hasScaleOrStructure || evidenceCount < 3) {
        productFitConfidence = 'LOW_CONFIDENCE';
        isFit = false;
        matchReasons.push('PRODUCT_FIT = LOW_CONFIDENCE: Datos comerciales insuficientes (escala, dotación, estructura o tamaño no documentados en fuentes físicas). No se presenta como Apto únicamente por superar umbrales de señal.');
      } else {
        productFitConfidence = evidenceCount >= 4 ? 'HIGH' : 'MEDIUM';
        isFit = true;
        matchReasons.push(`Evidencia comercial suficiente (${evidenceCount} dimensiones documentadas: ${commercialDimensions.join(', ')})`);
      }
    } else {
      productFitConfidence = 'LOW_CONFIDENCE';
      isFit = false;
    }

    const fitScore = isFit && productFitConfidence !== 'LOW_CONFIDENCE'
      ? Math.round(currentScore * opportunity.confidence * 100) / 100
      : 0.0;

    return {
      product_id: product.product_id,
      opportunity_id: opportunity.opportunity_id,
      fit_score: fitScore,
      is_fit: isFit,
      product_fit_confidence: productFitConfidence,
      match_reasons: matchReasons,
      dimensions_evaluated: {
        company_size: ctx.company_size || null,
        employees: ctx.employees ?? null,
        branches: ctx.branches ?? null,
        hiring: hasHiringSignal,
        activity: ctx.activity || null,
        organization_type: ctx.organization_type || (opportunity.subject_type === 'COMPANY' ? 'COMPANY' : null),
        geo: ctx.geo || null,
        commercial_scale: ctx.commercial_scale || null,
        evidence_count: evidenceCount
      },
      nature: 'INFERRED'
    };
  }

  private static buildExplanation(
    opportunityType: OpportunityType,
    hypothesisSummary: string,
    signals: OpportunitySignal[],
    extraContext?: {
      contactability_metrics?: {
        contactability_score: number;
        verified_emails: number;
        verified_phones: number;
        verified_linkedin: number;
        distinct_sources_count: number;
        is_multisource: boolean;
      };
      commercial_status?: 'ACTIVE' | 'NOT_DETERMINED';
    }
  ): WhyOpportunityExplanation {
    const observedFacts: string[] = [];
    const breakdown: Array<{
      signal_type: string;
      source_id: string;
      observed_at: string;
      event_date: string | null;
      date: string;
      description: string;
    }> = [];

    const now = new Date().toISOString();

    // 1. Separate contact signals from other signals to prevent duplicate bullets
    const contactSignals = signals.filter(s => s.signal_type === 'CONTACT_APPEARED');
    const nonContactSignals = signals.filter(s => s.signal_type !== 'CONTACT_APPEARED');

    // 2. Format non-contact signals (deduplicating identical statements)
    const seenNonContact = new Set<string>();
    for (const sig of nonContactSignals) {
      const desc = sig.payload.description || `${sig.signal_type}: ${JSON.stringify(sig.payload)}`;
      const observedAt = sig.detected_at || sig.time_anchor || now;
      const eventDate = sig.payload?.event_date || sig.payload?.fecha_evento || sig.payload?.valid_from || null;
      
      const obsFormatted = new Date(observedAt).toLocaleDateString('es-AR');
      const factLine = eventDate
        ? `${desc} • Fecha de evento: ${new Date(eventDate).toLocaleDateString('es-AR')} • Observado por Atlas: ${obsFormatted}`
        : `${desc} • Observado por Atlas: ${obsFormatted}`;

      if (!seenNonContact.has(factLine)) {
        seenNonContact.add(factLine);
        observedFacts.push(factLine);
      }

      breakdown.push({
        signal_type: sig.signal_type,
        source_id: sig.source_id,
        observed_at: observedAt,
        event_date: eventDate,
        date: observedAt,
        description: desc
      });
    }

    // 3. Format and group contact signals by channel type
    // Requirements 4 & 5: No duplicar bullets ("Nuevo canal de contacto verificado" repetido 4 veces).
    // Agrupar por tipo (ej. "3 emails observados y verificados", "1 teléfono observado y verificado").
    // Si son primeras observaciones: NO mostrar "nuevo". Mostrar "observado y verificado".
    // Sólo usar "nuevo" cuando exista REAL_TRANSITION o EXPLICIT_HISTORICAL_EVENT.
    if (contactSignals.length > 0) {
      let emailCount = 0;
      let phoneCount = 0;
      let linkedinCount = 0;
      let otherCount = 0;

      let hasRealTransitionEmail = false;
      let hasRealTransitionPhone = false;
      let hasRealTransitionLinkedin = false;

      let latestObservedAt = now;

      const emailValues: string[] = [];
      const phoneValues: string[] = [];
      const linkedinValues: string[] = [];

      for (const sig of contactSignals) {
        const rawVal = sig.payload?.value || '';
        const val = (rawVal || sig.assertion_id || '').toLowerCase();
        const channel = (sig.payload?.channel || '').toLowerCase();
        const isRealTransition = sig.temporal_semantics === 'REAL_TRANSITION' || sig.temporal_semantics === 'EXPLICIT_HISTORICAL_EVENT';

        const obsAt = sig.detected_at || sig.time_anchor || now;
        if (obsAt > latestObservedAt || latestObservedAt === now) {
          latestObservedAt = obsAt;
        }

        if (channel.includes('email') || val.includes('@') || sig.assertion_id?.includes('HAS_EMAIL')) {
          emailCount++;
          if (rawVal && !emailValues.includes(rawVal)) emailValues.push(rawVal);
          if (isRealTransition) hasRealTransitionEmail = true;
        } else if (channel.includes('phone') || val.includes('tel') || val.match(/\+?\d{8,}/) || sig.assertion_id?.includes('HAS_PHONE')) {
          phoneCount++;
          if (rawVal && !phoneValues.includes(rawVal)) phoneValues.push(rawVal);
          if (isRealTransition) hasRealTransitionPhone = true;
        } else if (channel.includes('linkedin') || val.includes('linkedin') || sig.assertion_id?.includes('LINKEDIN')) {
          linkedinCount++;
          if (rawVal && !linkedinValues.includes(rawVal)) linkedinValues.push(rawVal);
          if (isRealTransition) hasRealTransitionLinkedin = true;
        } else {
          otherCount++;
        }

        breakdown.push({
          signal_type: sig.signal_type,
          source_id: sig.source_id,
          observed_at: obsAt,
          event_date: sig.payload?.event_date || null,
          date: obsAt,
          description: sig.payload?.description || 'Canal de contacto directo verificado'
        });
      }

      // Check if extraContext provided verified_contacts values
      if (extraContext?.verified_contacts) {
        for (const e of extraContext.verified_contacts.emails || []) {
          if (e.value && !emailValues.includes(e.value)) emailValues.push(e.value);
        }
        for (const p of extraContext.verified_contacts.phones || []) {
          if (p.value && !phoneValues.includes(p.value)) phoneValues.push(p.value);
        }
        for (const l of extraContext.verified_contacts.linkedin || []) {
          if (l.value && !linkedinValues.includes(l.value)) linkedinValues.push(l.value);
        }
      }

      const obsFormatted = new Date(latestObservedAt).toLocaleDateString('es-AR');

      // Requirement: Cambiar "Email observado y verificado" por:
      // "Email verificado: contacto@empresa.com"
      // Si hay varios: "EMAILS VERIFICADOS (3)\n• email1\n• email2"
      if (emailValues.length === 1) {
        observedFacts.push(`Email verificado: ${emailValues[0]}`);
      } else if (emailValues.length > 1) {
        observedFacts.push(`EMAILS VERIFICADOS (${emailValues.length})`);
        for (const ev of emailValues) {
          observedFacts.push(`• ${ev}`);
        }
      } else if (emailCount > 0) {
        const label = hasRealTransitionEmail
          ? (emailCount > 1 ? `${emailCount} nuevos emails verificados` : 'Nuevo email verificado')
          : (emailCount > 1 ? `${emailCount} emails observados y verificados` : 'Email observado y verificado');
        observedFacts.push(`${label} • Observado por Atlas: ${obsFormatted}`);
      }

      if (phoneValues.length === 1) {
        observedFacts.push(`Teléfono verificado: ${phoneValues[0]}`);
      } else if (phoneValues.length > 1) {
        observedFacts.push(`TELÉFONOS VERIFICADOS (${phoneValues.length})`);
        for (const pv of phoneValues) {
          observedFacts.push(`• ${pv}`);
        }
      } else if (phoneCount > 0) {
        const label = hasRealTransitionPhone
          ? (phoneCount > 1 ? `${phoneCount} nuevos teléfonos verificados` : 'Nuevo teléfono verificado')
          : (phoneCount > 1 ? `${phoneCount} teléfonos observados y verificados` : 'Teléfono observado y verificado');
        observedFacts.push(`${label} • Observado por Atlas: ${obsFormatted}`);
      }

      if (linkedinValues.length === 1) {
        observedFacts.push(`LinkedIn verificado: ${linkedinValues[0]}`);
      } else if (linkedinValues.length > 1) {
        observedFacts.push(`LINKEDIN VERIFICADO (${linkedinValues.length})`);
        for (const lv of linkedinValues) {
          observedFacts.push(`• ${lv}`);
        }
      } else if (linkedinCount > 0) {
        const label = hasRealTransitionLinkedin
          ? (linkedinCount > 1 ? `${linkedinCount} nuevos perfiles LinkedIn verificados` : 'Nuevo perfil LinkedIn verificado')
          : (linkedinCount > 1 ? `${linkedinCount} perfiles LinkedIn observados y verificados` : 'Perfil LinkedIn observado y verificado');
        observedFacts.push(`${label} • Observado por Atlas: ${obsFormatted}`);
      }

      if (otherCount > 0) {
        observedFacts.push(`${otherCount} canales adicionales observados y verificados • Observado por Atlas: ${obsFormatted}`);
      }
    }

    return {
      observed_facts: observedFacts,
      inferred_hypothesis: hypothesisSummary,
      signals_breakdown: breakdown,
      contactability_metrics: extraContext?.contactability_metrics,
      commercial_status: extraContext?.commercial_status
    };
  }
}
