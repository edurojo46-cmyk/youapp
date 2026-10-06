import { supabase } from '../supabase';

export interface CertificationResult {
  status: 'CURRENT' | 'STALE' | 'REJECTED' | 'REVIEW_REQUIRED';
  certification_id?: string;
  reason?: string;
}

export class MessageCertificationService {
  static async certifyMessage(
    draftId: string, 
    nbaId?: string, 
    eligibilityId?: string, 
    productId?: string, 
    offerId?: string, 
    evidenceIds: string[] = []
  ): Promise<CertificationResult> {
    const { data, error } = await supabase.rpc('certify_message_current_state', {
      p_draft_id: draftId,
      p_nba_id: nbaId || null,
      p_eligibility_id: eligibilityId || null,
      p_product_id: productId || null,
      p_offer_id: offerId || null,
      p_evidence_ids: evidenceIds
    });

    if (error) {
      if (error.message.includes('not found') || error.message.includes('status is not COPY_VALIDATED')) {
        return { status: 'REJECTED', reason: error.message };
      }
      throw new Error(`Failed to certify message: ${error.message}`);
    }

    return data as CertificationResult;
  }
}
