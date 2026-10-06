import { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { AllowedFactSet, DraftStatus, PolicyRules, ChannelType, StructuredClaim } from './types';
import { DeterministicMessageConstructor } from './DeterministicMessageConstructor';
import { ClaimValidator } from './ClaimValidator';
import { AIDraftingInterface } from './AIDraftingInterface';
import { ClaimReconciler } from './ClaimReconciler';

export class MessageDraftService {
  static async generateDraft(
    supabase: SupabaseClient,
    tenantId: string,
    nbaDecisionId: string,
    policyId: string,
    factSet: AllowedFactSet,
    generationRequestId: string
  ) {
    // 1. Fetch current NBA decision
    const { data: nba, error: nbaErr } = await supabase
      .from('atlas_contact_decisions')
      .select('*')
      .eq('id', nbaDecisionId)
      .eq('tenant_id', tenantId)
      .single();

    if (nbaErr || !nba) {
      throw new Error('NBA Decision not found or inaccessible');
    }

    // Must be actionable
    const noActionStates = ['NO_ACTION', 'WAIT', 'OBSERVE', 'REVIEW_REQUIRED', 'HUMAN_REVIEW', 'DO_NOT_CONTACT'];
    if (noActionStates.includes(nba.decision)) {
      return { success: false, reason: 'NBA decision is not actionable' };
    }

    // 2. Fetch Policy
    const { data: policy, error: polErr } = await supabase
      .from('atlas_message_policies')
      .select('*')
      .eq('id', policyId)
      .eq('tenant_id', tenantId)
      .single();

    if (polErr || !policy) {
      throw new Error('Message Policy not found or inaccessible');
    }

    // 3. Generation Engine Flow (AI or Deterministic)
    const policyRules: PolicyRules = {
      allowed_claim_types: policy.allowed_claim_types || [],
      forbidden_claim_types: policy.forbidden_claim_types || [],
      required_disclosures: policy.required_disclosures || [],
      required_cta_rules: policy.required_cta_rules || [],
      ai_generation_allowed: policy.ai_generation_allowed,
      deterministic_fallback_allowed: policy.deterministic_fallback_allowed ?? policy.public_constraints?.deterministic_fallback_allowed ?? true,
      max_length: policy.max_length,
      subject_allowed: policy.subject_allowed || false,
      cta_allowed: policy.cta_allowed || false,
      cta_required: policy.cta_required || false,
      allowed_cta_types: policy.allowed_cta_types || [],
      body_format: policy.body_format || 'PLAIN_TEXT'
    };

    let finalSubject: string | null = null;
    let finalBody: string = '';
    let finalClaims: StructuredClaim[] = [];
    let finalCtaId: string | undefined = undefined;
    let generationMode = 'DETERMINISTIC';
    let generationReason: string | null = null;

    if (policyRules.ai_generation_allowed) {
      const aiResult = await AIDraftingInterface.generateDraft(
        factSet, 
        policy.channel as ChannelType, 
        policyRules, 
        policy.language, 
        policy.tone
      );

      if (aiResult.errorType === 'SEMANTIC') {
         return { success: true, draftId: crypto.randomUUID(), status: 'REJECTED', reason: `AI Semantic Failure: ${aiResult.reason}` };
      }
      
      if (aiResult.errorType === 'OPERATIONAL') {
         if (!policyRules.deterministic_fallback_allowed) {
            return { success: true, draftId: crypto.randomUUID(), status: 'REVIEW_REQUIRED', reason: `AI Operational Failure, and deterministic fallback not allowed: ${aiResult.reason}` };
         }
      } else if (aiResult.draft) {
        generationMode = 'AI';
        const reconciliation = ClaimReconciler.reconcile(aiResult.draft, factSet);
        if (!reconciliation.isValid) {
          return { success: true, draftId: crypto.randomUUID(), status: 'REJECTED', reason: reconciliation.reason };
        }
        finalSubject = aiResult.draft.subject_line;
        finalBody = aiResult.draft.text;
        finalClaims = reconciliation.claims;
      }
    } else {
       if (!policyRules.deterministic_fallback_allowed) {
          return { success: true, draftId: crypto.randomUUID(), status: 'REVIEW_REQUIRED', reason: `AI Generation disabled, and deterministic fallback not allowed.` };
       }
    }

    if (generationMode === 'DETERMINISTIC') {
      const generated = DeterministicMessageConstructor.construct(
        policy.channel,
        policy.action_type,
        factSet,
        policy.tone,
        policy.language,
        policyRules
      );
      finalSubject = generated.subject;
      finalBody = generated.body;
      finalClaims = generated.claims;
      finalCtaId = generated.used_cta_id;
    }

    // 4. Validate Claims
    const validation = ClaimValidator.validate(finalClaims, policyRules);
    const draftStatus: DraftStatus = validation.isValid ? 'COPY_VALIDATED' : 'REJECTED';
    if (!validation.isValid) {
      generationReason = validation.reason;
    }

    const { data: contact } = await supabase.from('atlas_contacts').select('recipient_type').eq('contact_id', nba.candidate_id).single();
    const subjectType = contact?.recipient_type === 'PERSON' ? 'PERSON' : 'COMPANY';

    // 5. Persist Draft
    const draftId = crypto.randomUUID();
    const { error: draftErr } = await supabase
      .from('atlas_message_drafts')
      .insert({
        id: draftId,
        tenant_id: tenantId,
        subject_type: subjectType,
        subject_id: nba.candidate_id,
        nba_state_id: nba.id,
        nba_decision_hash: nba.decision_hash,
        channel: policy.channel,
        action_type: policy.action_type,
        policy_id: policy.id,
        policy_version: policy.policy_version,
        policy_hash: policy.policy_hash,
        language: policy.language,
        tone: policy.tone,
        generation_mode: generationMode,
        generation_request_id: generationRequestId,
        message_subject: finalSubject,
        message_body: finalBody,
        status: draftStatus,
        evidence_snapshot_hash: factSet.snapshot_hash,
        claim_snapshot_hash: 'c_hash1',
        reason_codes: generationReason ? [generationReason] : []
      });

    if (draftErr) {
      // Idempotency violation throws here
      if (draftErr.code === '23505') {
         return { success: true, draftId: 'EXISTING' }; // idempotency
      }
      throw new Error(`Failed to persist draft: ${draftErr.message}`);
    }

    // 6. Persist Claims
    if (finalClaims.length > 0) {
      const claimsToInsert = finalClaims.map(c => ({
        id: c.id,
        tenant_id: tenantId,
        draft_id: draftId,
        claim_type: c.type,
        claim_text: c.text,
        claim_value: c.value,
        support_status: c.support_status
      }));

      const { error: claimsErr } = await supabase
        .from('atlas_message_claims')
        .insert(claimsToInsert);

      if (claimsErr) {
        throw new Error(`Failed to persist claims: ${claimsErr.message}`);
      }

      // 7. Link Evidence
      const links = [];
      for (const c of finalClaims) {
        for (const eId of c.evidence_links) {
          links.push({
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            claim_id: c.id,
            evidence_id: eId
          });
        }
      }

      if (links.length > 0) {
        const { error: linksErr } = await supabase
          .from('atlas_message_evidence_links')
          .insert(links);

        if (linksErr) {
          throw new Error(`Failed to persist links: ${linksErr.message}`);
        }
      }
    }

    return {
      success: true,
      draftId,
      status: draftStatus,
      reason: generationReason
    };
  }
}
