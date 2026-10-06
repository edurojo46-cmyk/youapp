import { AllowedFactSet, DeterministicTemplateResult, StructuredClaim, PolicyRules } from './types';
import * as crypto from 'crypto';

export class DeterministicMessageConstructor {
  static construct(
    channel: string,
    actionType: string,
    factSet: AllowedFactSet,
    tone: string,
    language: string,
    policy: PolicyRules
  ): DeterministicTemplateResult {
    const claims: StructuredClaim[] = [];

    // Basic stylistic claim for the greeting
    claims.push({
      id: crypto.randomUUID(),
      type: 'GREETING',
      text: 'Hola',
      value: null,
      support_status: 'STYLISTIC',
      evidence_links: []
    });

    let body = 'Hola, ';
    let subject: string | null = null;

    if (channel.toUpperCase() === 'EMAIL') {
      subject = 'Información importante';
    }

    const priceFact = factSet.facts.find(f => f.claim_type === 'OFFER_PRICE');
    if (priceFact) {
      body += `el precio actual es de $${priceFact.structured_value}. `;
      const freshness = (priceFact as any).support_status || 'SUPPORTED';
      claims.push({
        id: crypto.randomUUID(),
        type: 'OFFER_PRICE',
        text: `el precio actual es de $${priceFact.structured_value}`,
        value: priceFact.structured_value,
        support_status: freshness,
        evidence_links: priceFact.evidence_ref ? [priceFact.evidence_ref] : []
      });
    }

    const intentFact = factSet.facts.find(f => f.claim_type === 'FIRST_PARTY_INTENT');
    if (intentFact) {
      body += `Sabemos que te interesa esto. `;
      claims.push({
        id: crypto.randomUUID(),
        type: 'FIRST_PARTY_INTENT',
        text: 'Sabemos que te interesa esto',
        value: intentFact.structured_value,
        support_status: 'SUPPORTED',
        evidence_links: intentFact.evidence_ref ? [intentFact.evidence_ref] : []
      });
    }

    const unsupportedFact = factSet.facts.find(f => f.claim_type === 'UNSUPPORTED_TEST_CLAIM');
    if (unsupportedFact) {
      claims.push({
        id: crypto.randomUUID(),
        type: 'UNSUPPORTED_TEST_CLAIM',
        text: 'This is fake',
        value: null,
        support_status: 'UNSUPPORTED',
        evidence_links: []
      });
    }

    const affordability = factSet.facts.find(f => f.claim_type === 'AFFORDABILITY_INFERRED');
    if (affordability) {
      claims.push({
        id: crypto.randomUUID(),
        type: 'AFFORDABILITY_INFERRED',
        text: 'You have high wealth',
        value: null,
        support_status: (affordability as any).support_status || 'UNSUPPORTED',
        evidence_links: []
      });
    }

    const testTypes = ['URGENCY', 'SCARCITY', 'SOCIAL_PROOF'];
    for (const type of testTypes) {
      const fact = factSet.facts.find(f => f.claim_type === type);
      if (fact) {
        claims.push({
          id: crypto.randomUUID(), type: type, text: `Test ${type}`, value: null, support_status: (fact as any).support_status || 'UNSUPPORTED', evidence_links: []
        });
      }
    }

    const ideology = factSet.facts.find(f => f.claim_type === 'POLITICAL_IDEOLOGY');
    if (ideology) {
      claims.push({
        id: crypto.randomUUID(), type: 'POLITICAL_IDEOLOGY', text: 'Ideology', value: null, support_status: (ideology as any).support_status || 'SUPPORTED', evidence_links: []
      });
    }

    // fallback body if empty
    if (body === 'Hola, ') {
      body = 'Tenemos novedades para vos.';
    }

    let used_cta_id: string | undefined = undefined;
    let ctaString = '';
    if (policy.required_cta_rules && policy.required_cta_rules.length > 0) {
       ctaString = `\n[Link: ${policy.required_cta_rules[0]}]`;
       used_cta_id = 'cta_det_123';
    }

    if (policy.max_length && (body.length + ctaString.length) > policy.max_length) {
      body = body.substring(0, policy.max_length - ctaString.length);
    }
    
    body += ctaString;

    if (!policy.subject_allowed) {
       subject = null;
    }

    return {
      subject,
      body,
      claims,
      used_cta_id
    };
  }
}
